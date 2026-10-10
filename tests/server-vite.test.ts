import { afterEach, describe, expect, it } from 'vitest';
import { createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { failClosedAccess } from '../vite.config';
import { createBackend } from '../server/backend.mjs';
import { configuration } from '../server/licensing.mjs';

let directory: string | undefined;
let running: ViteDevServer | PreviewServer | undefined;
afterEach(async () => {
  await running?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
  running = undefined;
});

describe('actual Vite development and preview private-file boundary', () => {
  it.each(['development', 'preview'])(
    'blocks private configuration, @fs/raw imports and file aliases in %s',
    async (mode) => {
      directory = await mkdtemp(join(tmpdir(), 'scopeledger-vite-private-'));
      await mkdir(join(directory, '.local-private'));
      await mkdir(join(directory, 'store'));
      await mkdir(join(directory, 'public'));
      await mkdir(join(directory, 'dist/assets'), { recursive: true });
      for (const root of [directory, join(directory, 'dist')]) {
        await mkdir(join(root, 'home'));
        await mkdir(join(root, 'workspace'));
        await writeFile(join(root, 'home/index.html'), '<title>ScopeLedger public home</title>');
        await writeFile(join(root, 'workspace/index.html'), '<title>ScopeLedger workspace</title>');
      }
      const ownerKeyPath = join(directory, '.local-private/test-keys.json');
      const dbPath = join(directory, 'store/licenses.sqlite');
      await writeFile(ownerKeyPath, '{"synthetic":"private key fixture"}');
      await writeFile(join(directory, '.local-private/local-test.env'), 'SYNTHETIC_SECRET=private');
      await writeFile(join(directory, 'scopeledger.env'), 'SYNTHETIC_SECRET=private');
      for (const name of [
        'recovery.slarchive',
        'workspace.slbackup',
        'scopeledger-backup-test.json',
      ])
        for (const folder of [directory, join(directory, 'public'), join(directory, 'dist')])
          await writeFile(join(folder, name), 'synthetic private backup');
      await writeFile(dbPath, 'synthetic private licensing storage');
      await writeFile(dbPath + '-wal', 'synthetic private journal');
      await writeFile(join(directory, 'index.html'), '<title>ScopeLedger test app</title>');
      await writeFile(join(directory, 'main.js'), 'export const safe = true;');
      await writeFile(
        join(directory, 'dist/index.html'),
        '<title>ScopeLedger built test app</title>',
      );
      await writeFile(join(directory, 'dist/assets/app.js'), 'export const safe = true;');
      for (const root of [directory, join(directory, 'public'), join(directory, 'dist')]) {
        await symlink(ownerKeyPath, join(root, 'key-alias.json'));
        await link(ownerKeyPath, join(root, 'key-copy.json'));
        await link(dbPath, join(root, 'db-copy.bin'));
        await link(dbPath + '-wal', join(root, 'wal-copy.bin'));
      }
      const backend = createBackend({ config: { ...configuration({}), dbPath }, service: null });
      const config = {
        configFile: false as const,
        root: directory,
        appType: 'mpa' as const,
        plugins: [failClosedAccess(backend)],
        logLevel: 'silent' as const,
        server: { host: '127.0.0.1', port: 0 },
        preview: { host: '127.0.0.1', port: 0 },
      };
      if (mode === 'development') {
        running = await createServer(config);
        await running.listen();
      } else running = await preview(config);
      const address = running.httpServer!.address();
      if (!address || typeof address === 'string') throw new Error('Expected local Vite server');
      const origin = `http://127.0.0.1:${address.port}`;
      for (const path of [
        '/.local-private/test-keys.json',
        '/%2elocal-private/test-keys.json?raw',
        '/.local-private/local-test.env',
        '/scopeledger.env?raw',
        '/recovery.slarchive',
        '/workspace.slbackup?raw',
        '/scopeledger-backup-test.json',
        '/@fs/' + join(directory, 'recovery.slarchive') + '?raw',
        '/store/licenses.sqlite',
        '/store/licenses.sqlite-wal?raw',
        '/key-alias.json',
        '/key-copy.json?raw',
        '/db-copy.bin',
        '/wal-copy.bin',
        '/@fs/' + ownerKeyPath,
        '/@fs/' + dbPath + '?raw',
        '/@fs/' + join(directory, 'key-copy.json') + '?raw',
      ]) {
        const response = await fetch(origin + path);
        expect(response.status, path).toBe(404);
        // Private responses are checked by status; their contents are never read.
        await response.body?.cancel();
      }
      const page = await fetch(origin + '/app');
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('ScopeLedger');
      const module = await fetch(origin + (mode === 'development' ? '/main.js' : '/assets/app.js'));
      expect(module.status).toBe(200);
      expect(await module.text()).toContain('export const safe = true');
      if (mode === 'development') {
        const client = await fetch(origin + '/@vite/client');
        expect(client.status).toBe(200);
        await client.body?.cancel();
      }
      const status = await fetch(origin + '/api/license/status');
      expect(await status.json()).toMatchObject({ configured: false, active: false });
      for (const method of ['GET', 'HEAD']) {
        for (const [path, location] of [
          ['/?source=a%26b', '/home/?source=a%26b'],
          ['/home?source=menu', '/home/?source=menu'],
          ['/home/index.html?source=menu', '/home/?source=menu'],
          ['/workspace?plan=agency', '/workspace/?plan=agency'],
          ['/workspace/index.html?view=documents', '/workspace/?view=documents'],
          ['/app?return=%2Fhome%2F', '/workspace/?return=%2Fhome%2F'],
          ['/app/documents?ref=INV-001', '/workspace/documents?ref=INV-001'],
        ]) {
          const response = await fetch(origin + path, { method, redirect: 'manual' });
          expect(response.status, `${mode} ${method} ${path}`).toBe(308);
          expect(response.headers.get('location')).toBe(location);
        }
        for (const path of ['/home/', '/workspace/', '/workspace/documents']) {
          const response = await fetch(origin + path, { method });
          expect(response.status, `${mode} ${method} ${path}`).toBe(200);
          const body = await response.text();
          if (method === 'GET')
            expect(body).toContain(path === '/home/' ? 'public home' : 'workspace');
          else expect(body).toBe('');
        }
      }
      for (const path of ['/home/missing', '/workspace/missing.js', '/missing'])
        expect((await fetch(origin + path)).status, `${mode} ${path}`).toBe(404);
      const entryRoot = mode === 'development' ? directory : join(directory, 'dist');
      for (const entry of ['home', 'workspace']) {
        await rm(join(entryRoot, entry, 'index.html'));
        await link(dbPath, join(entryRoot, entry, 'index.html'));
        const response = await fetch(origin + `/${entry}/`);
        expect(response.status, `${mode} ${entry} private entry alias`).toBe(404);
        await response.body?.cancel();
      }
    },
  );
});
