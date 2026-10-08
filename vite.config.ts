import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createBackend } from './server/backend.mjs';
import { configuration } from './server/licensing.mjs';
import { privateFileBoundary } from './server/private-files.mjs';
import { siteDocumentPath } from './server/site-routes.mjs';
import { resolve } from 'node:path';
const defaultBackend = createBackend();
function siteDocuments(
  boundary: ReturnType<typeof privateFileBoundary>,
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  const url = request.url ?? '/',
    queryAt = url.indexOf('?'),
    query = queryAt === -1 ? '' : url.slice(queryAt);
  try {
    const documentPath = siteDocumentPath(
      decodeURIComponent(queryAt === -1 ? url : url.slice(0, queryAt)),
    );
    if ((request.method === 'GET' || request.method === 'HEAD') && documentPath) {
      request.url = documentPath + query;
      boundary(request, response, next);
      return;
    }
  } catch {
    // The backend rejects malformed URL encoding before this middleware.
  }
  next();
}
export function accessBoundary(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  defaultBackend.middleware(request, response, next);
}
export function failClosedAccess(backend = defaultBackend): Plugin {
  return {
    name: 'scopeledger-server-authorization',
    configureServer(server) {
      const boundary = privateFileBoundary({
        dbPath: backend.config.dbPath,
        roots: [server.config.root, server.config.publicDir],
      });
      server.middlewares.use(boundary);
      server.middlewares.use(backend.middleware);
      server.middlewares.use((request, response, next) =>
        siteDocuments(boundary, request, response, next),
      );
      server.httpServer?.once('close', backend.close);
    },
    configurePreviewServer(server) {
      const boundary = privateFileBoundary({
        dbPath: backend.config.dbPath,
        roots: [
          server.config.root,
          server.config.publicDir,
          resolve(server.config.root, server.config.build.outDir),
        ],
      });
      server.middlewares.use(boundary);
      server.middlewares.use(backend.middleware);
      server.middlewares.use((request, response, next) =>
        siteDocuments(boundary, request, response, next),
      );
      server.httpServer?.once('close', backend.close);
    },
  };
}
export default defineConfig(({ mode }) => ({
  appType: 'mpa',
  plugins: [
    react(),
    failClosedAccess(
      createBackend({
        config: configuration({ ...loadEnv(mode, process.cwd(), 'SCOPELEDGER_'), ...process.env }),
      }),
    ),
  ],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    // Keep earlier hashed chunks available to existing tabs during local rebuilds.
    // Production releases still use the documented atomic switch/retention policy.
    emptyOutDir: false,
    rollupOptions: {
      output: {
        // Stable libraries cache independently of workspace/UI changes.
        manualChunks(id) {
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(id)) return 'runtime';
          if (id.includes('/@js-temporal/polyfill/') || id.includes('/node_modules/jsbi/'))
            return 'dates';
          if (id.includes('/node_modules/decimal.js/')) return 'decimal';
        },
      },
      input: {
        home: resolve(process.cwd(), 'home/index.html'),
        workspace: resolve(process.cwd(), 'workspace/index.html'),
        compatibility: resolve(process.cwd(), 'index.html'),
      },
    },
  },
}));
