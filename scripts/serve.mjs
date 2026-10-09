import { createServer } from 'node:http';
import { createBackend } from '../server/backend.mjs';
import { privateFileBoundary } from '../server/private-files.mjs';
import { siteDocumentPath, siteRedirect, workspaceRoute } from '../server/site-routes.mjs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative as relativePath, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { contentPolicy } from '../server/security.mjs';
import { publicAssetPath as publicPath, shareableAssetPath } from '../shared/public-assets.mjs';
import { rendererReady } from '../server/pdf.mjs';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
const brotli = promisify(brotliCompress),
  gzipBody = promisify(gzip);
const compressible = new Set(['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt']);
function preferredEncoding(header = '') {
  const choices = new Map(
    header.split(',').map((part) => {
      const [name, ...params] = part.trim().toLowerCase().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const weight = q ? Number(q.trim().slice(2)) : 1;
      return [name, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0];
    }),
  );
  const weight = (name) => choices.get(name) ?? choices.get('*') ?? 0;
  return weight('br') > 0 && weight('br') >= weight('gzip')
    ? 'br'
    : weight('gzip') > 0
      ? 'gzip'
      : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serve one built application directory; never use this as a general filesystem server. */
export function createScopeLedgerServer({
  directory = fileURLToPath(new URL('../dist/', import.meta.url)),
  backend = createBackend(),
  readinessProbe = rendererReady,
  assetDirectory,
} = {}) {
  const root = resolve(directory);
  // Bounded per-file cache; changed files invalidate their compressed representations.
  const files = new Map();
  let cachedBytes = 0;
  let readiness;
  let readinessAt = 0;
  const fileBody = async (path, metadata) => {
    const stamp = `${metadata.size}:${metadata.mtimeMs}`;
    let file = files.get(path);
    if (file?.stamp === stamp) return file;
    const body = await readFile(path);
    file = {
      stamp,
      body,
      etag: `W/"${createHash('sha256').update(body).digest('hex')}"`,
      variants: new Map(),
    };
    const previous = files.get(path);
    if (previous) {
      cachedBytes -= previous.body.length;
      files.delete(path);
    }
    // Keep at most 64 files / 16 MiB of raw bodies, plus bounded compressed variants.
    if (body.length <= 2 * 1024 * 1024) {
      while (files.size >= 64 || cachedBytes + body.length > 16 * 1024 * 1024) {
        const first = files.keys().next().value;
        cachedBytes -= files.get(first).body.length;
        files.delete(first);
      }
      files.set(path, file);
      cachedBytes += body.length;
    }
    return file;
  };
  const boundary = privateFileBoundary({ dbPath: backend.config?.dbPath, roots: [root] });
  const assetBoundary = assetDirectory
    ? privateFileBoundary({ dbPath: backend.config?.dbPath, roots: [assetDirectory] })
    : null;
  const handle = async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', contentPolicy());
    const sendJson = (status, payload) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(payload));
    };
    let pathname;
    try {
      pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    } catch {
      sendJson(400, { error: 'invalid_path' });
      return;
    }

    if (['/api/health', '/api/ready'].includes(pathname)) {
      if (!['GET', 'HEAD'].includes(request.method)) {
        sendJson(405, { error: 'method_not_allowed' });
        return;
      }
      let release = null;
      try {
        const info = JSON.parse(await readFile(resolve(root, 'release.json'), 'utf8'));
        if (/^[a-zA-Z0-9.-]{1,80}$/.test(info.id)) release = info.id;
      } catch {
        /* Unversioned local builds remain identifiable as such. */
      }
      if (pathname === '/api/health') {
        sendJson(200, { status: 'alive', release });
        return;
      }
      if (!backend.config?.configured || !backend.service?.db) {
        sendJson(503, {
          status: 'not_ready',
          release,
          mode: backend.config?.mode,
          checks: { configured: !!backend.config?.configured, storage: false, renderer: false },
          purchasesEnabled: false,
        });
        return;
      }
      if (backend.rendering?.() && (!readiness || Date.now() - readinessAt > 30000)) {
        response.setHeader('Retry-After', '5');
        sendJson(503, { status: 'checking_deferred', release });
        return;
      }
      if (!readiness || Date.now() - readinessAt > 30000) {
        readinessAt = Date.now();
        readiness = (async () => {
          let storage = false,
            renderer = false;
          try {
            storage = backend.service?.db?.prepare('SELECT 1 AS ok').get()?.ok === 1;
          } catch {}
          try {
            if (storage)
              renderer = backend.probeRenderer
                ? await backend.probeRenderer(readinessProbe)
                : !!(await readinessProbe());
          } catch {}
          return { storage, renderer };
        })();
      }
      const checks = await readiness;
      const ready = !!backend.config.configured && checks.storage && checks.renderer;
      sendJson(ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        release,
        mode: backend.config.mode,
        checks: { configured: !!backend.config.configured, ...checks },
        purchasesEnabled:
          !!backend.config.checkout?.individual && !!backend.config.checkout?.agency,
      });
      return;
    }
    if (/^\/api(?:\/|$)/i.test(pathname)) {
      backend.middleware(request, response, () => sendJson(404, { error: 'not_found' }));
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(405, { error: 'method_not_allowed' });
      return;
    }
    const location = siteRedirect(pathname, request.url);
    if (location) {
      response.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (
      !pathname.startsWith('/') ||
      pathname.includes('\0') ||
      pathname.includes('\\') ||
      pathname.split('/').some((segment) => segment === '..' || segment === '.')
    ) {
      sendJson(400, { error: 'invalid_path' });
      return;
    }
    const isApplicationRoute = workspaceRoute(pathname);
    const documentPath = siteDocumentPath(pathname),
      relative = documentPath ? documentPath.slice(1) : pathname.slice(1);
    if (!relative || relative.split('/').some((segment) => segment.startsWith('.'))) {
      sendJson(404, { error: 'not_found' });
      return;
    }
    if (!publicPath(relative)) {
      sendJson(404, { error: 'not_found' });
      return;
    }
    const lookupRoot =
      assetDirectory && /^\/assets\/[^/]+-[\w-]{8,}\.[\w.]+$/.test(pathname)
        ? resolve(assetDirectory)
        : root;
    const candidate = resolve(
      lookupRoot,
      lookupRoot === root ? relative : relative.slice('assets/'.length),
    );
    if (!candidate.startsWith(lookupRoot + sep)) {
      sendJson(404, { error: 'not_found' });
      return;
    }
    const serveFile = async () => {
      try {
        const actualRoot = await realpath(lookupRoot);
        // Resolve each request within one release even if current is switched mid-request.
        const actualFile = await realpath(
          resolve(actualRoot, lookupRoot === root ? relative : relative.slice('assets/'.length)),
        );
        const metadata = await stat(actualFile);
        const actualName = relativePath(actualRoot, actualFile).split(sep).join('/');
        if (
          !actualFile.startsWith(actualRoot + sep) ||
          !metadata.isFile() ||
          !publicPath(lookupRoot === root ? actualName : `assets/${actualName}`)
        ) {
          sendJson(404, { error: 'not_found' });
          return;
        }
        const extension = extname(actualFile).toLowerCase();
        if (shareableAssetPath(actualName))
          response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        const file = await fileBody(actualFile, metadata);
        if (extension === '.html')
          response.setHeader('Content-Security-Policy', contentPolicy(file.body.toString('utf8')));
        const encoding =
          file.body.length >= 1024 && compressible.has(extension)
            ? preferredEncoding(request.headers['accept-encoding'])
            : null;
        const headers = {
          'Content-Type': MIME[extension] ?? 'application/octet-stream',
          'Cache-Control':
            isApplicationRoute || extname(actualFile) === '.html'
              ? 'no-cache'
              : /^\/assets\/[^/]+-[\w-]{8,}\.[\w.]+$/.test(pathname)
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=3600',
          ETag: file.etag,
          'Last-Modified': metadata.mtime.toUTCString(),
          ...(compressible.has(extension) ? { Vary: 'Accept-Encoding' } : {}),
        };
        const validators = request.headers['if-none-match'];
        if (
          validators &&
          validators
            .split(',')
            .some(
              (tag) =>
                tag.trim() === '*' ||
                tag.trim().replace(/^W\//, '') === file.etag.replace(/^W\//, ''),
            )
        ) {
          response.writeHead(304, headers);
          response.end();
          return;
        }
        let body = file.body;
        if (encoding) {
          if (!file.variants.has(encoding))
            file.variants.set(
              encoding,
              encoding === 'br'
                ? brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
                : gzipBody(body),
            );
          body = await file.variants.get(encoding);
          headers['Content-Encoding'] = encoding;
        }
        headers['Content-Length'] = body.length;
        response.writeHead(200, headers);
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch {
        sendJson(404, { error: 'not_found' });
      }
    };
    if (lookupRoot !== root && assetBoundary)
      assetBoundary(
        { method: request.method, url: '/' + relative.slice('assets/'.length) },
        response,
        () => void serveFile(),
      );
    else if (documentPath)
      boundary({ method: request.method, url: documentPath }, response, () => void serveFile());
    else await serveFile();
  };
  const server = createServer(
    {
      requestTimeout: 20000,
      headersTimeout: 10000,
      connectionsCheckingInterval: 1000,
      keepAliveTimeout: 5000,
      maxHeaderSize: 16384,
    },
    (request, response) =>
      boundary(request, response, () => {
        void handle(request, response).catch(() => {
          if (response.headersSent) response.destroy();
          else {
            response.writeHead(500, { 'Cache-Control': 'no-store', Connection: 'close' });
            response.end('Server error');
          }
        });
      }),
  );
  server.maxHeadersCount = 64;
  server.maxConnections = 128;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(60000, (socket) => socket.destroy());
  server.once('close', () => backend.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.SCOPELEDGER_MODE === 'live' && process.env.NODE_ENV !== 'production')
    throw new Error('Live server startup requires NODE_ENV=production.');
  if (process.env.NODE_ENV === 'production' && process.getuid?.() === 0)
    throw new Error('Run the application as a dedicated non-root user.');
  if (process.env.NODE_ENV === 'production' && process.env.SCOPELEDGER_MODE === 'local-test')
    throw new Error('Local test licensing cannot start a production server.');
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be an integer between 0 and 65535.');
  const backend = createBackend();
  if (process.env.SCOPELEDGER_MODE === 'live' && !backend.config.configured) {
    backend.close();
    throw new Error(
      'Live startup requires valid private storage and complete seller configuration.',
    );
  }
  const server = createScopeLedgerServer({
    backend,
    directory: process.env.SCOPELEDGER_PUBLIC_DIR,
    assetDirectory: process.env.SCOPELEDGER_ASSET_DIR,
  });
  if (process.env.SCOPELEDGER_MODE === 'live') {
    const storage = await realpath(backend.config.dbPath);
    for (const directory of [
      process.env.SCOPELEDGER_PUBLIC_DIR ?? fileURLToPath(new URL('../dist/', import.meta.url)),
      process.env.SCOPELEDGER_ASSET_DIR,
    ].filter(Boolean)) {
      const publicRoot = await realpath(resolve(directory));
      if (storage === publicRoot || storage.startsWith(publicRoot + sep))
        throw new Error('Live license storage must be outside public asset directories.');
    }
    let rendererAvailable = false;
    try {
      rendererAvailable = await backend.probeRenderer(rendererReady);
    } catch {}
    if (!rendererAvailable) {
      backend.close();
      throw new Error('Live startup requires a working sandboxed renderer.');
    }
  }
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 55000).unref();
    });
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(
      `ScopeLedger home: http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/home/`,
    );
  });
}
