import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease, verifyRelease, activateRelease } from '../scripts/release.mjs';
let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
async function release() {
  root = await mkdtemp(join(tmpdir(), 'scopeledger-release-security-'));
  const source = join(root, 'source');
  for (const folder of ['dist/home', 'dist/workspace', 'server', 'shared', 'scripts'])
    await mkdir(join(source, folder), { recursive: true });
  for (const name of [
    'dist/home/index.html',
    'dist/workspace/index.html',
    'server/backend.mjs',
    'scripts/serve.mjs',
    'package.json',
    'package-lock.json',
  ])
    await writeFile(join(source, name), '{}');
  return prepareRelease(source, join(root, 'deploy'), 'security-test');
}
describe('release tree integrity', () => {
  it.each(['recovery.slarchive', 'workspace.slbackup', 'scopeledger-backup-test.json'])(
    'refuses private backup %s during packaging',
    async (name) => {
      await release();
      await writeFile(join(root, 'source/scripts', name), 'synthetic private backup');
      await expect(
        prepareRelease(join(root, 'source'), join(root, 'deploy'), 'second-test'),
      ).rejects.toThrow('Private file');
    },
  );
  it('refuses switching to a release whose manifest identity differs from its directory', async () => {
    const built = await release();
    const path = join(built.directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.id = 'different-release';
    await writeFile(path, JSON.stringify(manifest));
    await expect(activateRelease(join(root, 'deploy'), built.id)).rejects.toThrow('identity');
  });
  it('refuses unmanifested runtime files while permitting installed dependency files', async () => {
    const built = await release();
    await mkdir(join(built.directory, 'node_modules/test-package'), { recursive: true });
    await writeFile(
      join(built.directory, 'node_modules/test-package/index.js'),
      'export default true;',
    );
    expect((await verifyRelease(built.directory)).id).toBe('security-test');
    await writeFile(join(built.directory, 'dist/forgotten-backup.json'), '{"secret":"test"}');
    await expect(verifyRelease(built.directory)).rejects.toThrow('unmanifested');
  });
  it('refuses parent-directory and release-root symlinks even when bytes still match', async () => {
    const built = await release();
    await symlink(built.directory, join(root, 'release-alias'));
    await expect(verifyRelease(join(root, 'release-alias'))).rejects.toThrow('paths');
    await rename(join(built.directory, 'server'), join(root, 'server-alias-target'));
    await symlink(join(root, 'server-alias-target'), join(built.directory, 'server'));
    await expect(verifyRelease(built.directory)).rejects.toThrow('symbolic');
  });
  it.each(['malformed hash', 'private path', 'absolute path', 'array manifest'])(
    'refuses %s manifests',
    async (variant) => {
      const built = await release();
      const path = join(built.directory, 'manifest.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      if (variant === 'malformed hash') manifest.files['server/backend.mjs'] = true;
      if (variant === 'private path') {
        await rename(
          join(built.directory, 'server/backend.mjs'),
          join(built.directory, 'server/secret.env'),
        );
        manifest.files['server/secret.env'] = manifest.files['server/backend.mjs'];
        delete manifest.files['server/backend.mjs'];
      }
      if (variant === 'absolute path') {
        manifest.files['/server/backend.mjs'] = manifest.files['server/backend.mjs'];
        delete manifest.files['server/backend.mjs'];
      }
      if (variant === 'array manifest') manifest.files = [];
      await writeFile(path, JSON.stringify(manifest));
      await expect(verifyRelease(built.directory)).rejects.toThrow();
    },
  );
});

describe('release identity paths', () => {
  it.each(['.', '..', '../outside'])('refuses unsafe release identity %s', async (id) => {
    root = await mkdtemp(join(tmpdir(), 'scopeledger-release-id-'));
    await expect(
      prepareRelease(join(root, 'source'), join(root, 'deployment'), id),
    ).rejects.toThrow('identity');
  });
});
