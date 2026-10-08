import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const privatePath = (path) =>
  path
    .split(/[\\/]/)
    .some(
      (part) =>
        part === '.local-private' ||
        part === '.env' ||
        part.startsWith('.env.') ||
        part.endsWith('.env'),
    );
const sqliteFiles = (path) =>
  ['', '-wal', '-shm', '-journal'].map((suffix) => resolve(path + suffix));

/** Run before Vite's static/transform middleware; private owner files are never browser modules. */
export function privateFileBoundary({ dbPath, roots = [] } = {}) {
  const directories = [...new Set(roots.filter(Boolean).map((path) => resolve(path)))];
  const protectedPaths = [
    ...(dbPath ? sqliteFiles(dbPath) : []),
    ...directories.flatMap((root) => [
      resolve(root, '.local-private/test-keys.json'),
      resolve(root, '.local-private/local-test.env'),
      ...sqliteFiles(resolve(root, '.local-private/licenses.sqlite')),
      ...[
        '.env',
        '.env.local',
        '.env.development',
        '.env.development.local',
        '.env.production',
        '.env.production.local',
      ].map((name) => resolve(root, name)),
    ]),
  ];
  return (request, response, next) => {
    const deny = () => {
      response.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : '{"error":"not_found"}');
    };
    let path;
    try {
      path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    } catch {
      deny();
      return;
    }
    if (privatePath(path) || path.includes('\0')) {
      deny();
      return;
    }
    const candidates = path.startsWith('/@fs/')
      ? [resolve('/' + path.slice('/@fs/'.length))]
      : directories.map((root) => resolve(root, '.' + path));
    if (candidates.some((candidate) => protectedPaths.includes(candidate))) {
      deny();
      return;
    }
    void (async () => {
      const files = (
        await Promise.all(
          candidates.map(async (candidate) => {
            try {
              const actual = await realpath(candidate);
              return { actual, file: await stat(actual) };
            } catch {
              return null;
            }
          }),
        )
      ).filter(Boolean);
      if (files.some(({ actual }) => privatePath(actual) || protectedPaths.includes(actual))) {
        deny();
        return;
      }
      if (files.length) {
        const protectedFiles = await Promise.all(
          protectedPaths.map(async (candidate) => {
            try {
              return await stat(candidate);
            } catch (error) {
              if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
              throw error;
            }
          }),
        );
        if (
          files.some(({ file }) =>
            protectedFiles.some(
              (protectedFile) =>
                protectedFile && protectedFile.dev === file.dev && protectedFile.ino === file.ino,
            ),
          )
        ) {
          deny();
          return;
        }
      }
      next();
    })().catch(deny);
  };
}
