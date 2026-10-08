import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createScopeLedgerServer } from '../scripts/serve.mjs';
import { createBackend } from '../server/backend.mjs';
import { configuration } from '../server/licensing.mjs';

let directory: string | undefined;
let server: Server | undefined;
const privateContent = 'PRIVATE LICENSE AND PURCHASE-OWNERSHIP RECORDS';

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  if (directory) await rm(directory, { recursive: true, force: true });
  server = undefined;
  directory = undefined;
});

describe('configured licensing storage remains private under static-path mistakes', () => {
  it.each(['inside build', 'outside build'])(
    'rejects the database, sidecars and aliases when storage is %s',
    async (placement) => {
      directory = await mkdtemp(join(tmpdir(), 'scopeledger-static-storage-'));
      const root = join(directory, 'dist');
      await mkdir(join(root, 'assets'), { recursive: true });
      await mkdir(join(root, 'workspace'));
      await mkdir(join(root, 'home'));
      await writeFile(join(root, 'index.html'), '<title>ScopeLedger application</title>');
      await writeFile(join(root, 'workspace/index.html'), '<title>ScopeLedger application</title>');
      await writeFile(join(root, 'home/index.html'), '<title>ScopeLedger home</title>');
      await writeFile(join(root, 'assets/app.js'), 'export const app = true;');
      await mkdir(join(root, '.local-private'));
      await writeFile(join(root, '.local-private/test-keys.json'), privateContent);
      await writeFile(join(root, 'scopeledger.env'), privateContent);
      await symlink(join(root, '.local-private/test-keys.json'), join(root, 'owner-key-alias.bin'));
      await link(join(root, '.local-private/test-keys.json'), join(root, 'owner-key-copy.bin'));
      const dbPath = join(placement === 'inside build' ? root : directory, 'licenses.sqlite');
      for (const suffix of ['', '-wal', '-shm', '-journal'])
        await writeFile(dbPath + suffix, privateContent);
      await symlink(dbPath, join(root, 'database-alias.bin'));
      await link(dbPath, join(root, 'database-copy.bin'));
      await link(dbPath + '-wal', join(root, 'journal-copy.bin'));
      server = createScopeLedgerServer({
        directory: root,
        backend: {
          config: { dbPath },
          middleware: (_request: unknown, _response: unknown, next: () => void) => next(),
          close: () => {},
        },
      });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected local server');
      const origin = `http://127.0.0.1:${address.port}`;
      for (const method of ['GET', 'HEAD'])
        for (const path of [
          '/licenses.sqlite',
          '/licenses%2esqlite',
          '/licenses.sqlite-wal',
          '/licenses.sqlite-shm',
          '/licenses.sqlite-journal',
          '/database-alias.bin',
          '/database-copy.bin',
          '/journal-copy.bin',
          '/.local-private/test-keys.json',
          '/scopeledger.env',
          '/owner-key-alias.bin',
          '/owner-key-copy.bin',
        ]) {
          const response = await fetch(origin + path, { method });
          expect(response.status, `${method} ${path}`).toBe(404);
          expect(await response.text()).not.toContain(privateContent);
        }
      // The defensive block keeps the application and its ordinary assets usable.
      expect((await fetch(origin + '/app')).status).toBe(200);
      expect(await (await fetch(origin + '/assets/app.js')).text()).toBe(
        'export const app = true;',
      );
      // Public document routes must also inspect their resolved HTML file.
      for (const entry of ['workspace', 'home']) {
        await rm(join(root, entry, 'index.html'));
        await link(dbPath, join(root, entry, 'index.html'));
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(origin + `/${entry}/`, { method });
          expect(response.status, `${method} ${entry} private entry alias`).toBe(404);
          await response.body?.cancel();
        }
      }
    },
  );
});

describe('connected public home and project workspace', () => {
  it('serves both built entries, preserves canonical/legacy queries and keeps assets/API distinct', async () => {
    directory = await mkdtemp(join(tmpdir(), 'scopeledger-static-pages-'));
    await mkdir(join(directory, 'home'));
    await mkdir(join(directory, 'workspace'));
    await mkdir(join(directory, 'assets'));
    await mkdir(join(directory, 'samples'));
    await writeFile(join(directory, 'home/index.html'), '<title>ScopeLedger public home</title>');
    await writeFile(
      join(directory, 'workspace/index.html'),
      '<title>ScopeLedger workspace</title>',
    );
    await writeFile(join(directory, 'index.html'), '<title>Legacy compatibility</title>');
    await writeFile(join(directory, 'assets/app.js'), 'export const workspace = true;');
    await writeFile(join(directory, 'samples/brief.pdf'), '%PDF-1.7 synthetic public sample');
    server = createScopeLedgerServer({
      directory,
      backend: createBackend({ config: configuration({}), service: null }),
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected local server');
    const origin = `http://127.0.0.1:${address.port}`;
    for (const method of ['GET', 'HEAD']) {
      for (const [path, location] of [
        ['/?source=landing%20page&mode=demo', '/home/?source=landing%20page&mode=demo'],
        ['/index.html?campaign=test', '/home/?campaign=test'],
        ['/home?source=menu', '/home/?source=menu'],
        ['/home/index.html?q=a%26b', '/home/?q=a%26b'],
        ['/workspace?plan=agency', '/workspace/?plan=agency'],
        ['/workspace/index.html?view=documents', '/workspace/?view=documents'],
        ['/app?return=%2Fhome%2F', '/workspace/?return=%2Fhome%2F'],
        ['/app/documents?ref=INV-001', '/workspace/documents?ref=INV-001'],
      ]) {
        const response = await fetch(origin + path, { method, redirect: 'manual' });
        expect(response.status, `${method} ${path}`).toBe(302);
        expect(response.headers.get('location')).toBe(location);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      for (const path of ['/home/', '/workspace/', '/workspace/documents', '/app/']) {
        const response = await fetch(origin + path, { method });
        expect(response.status, `${method} ${path}`).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(response.headers.get('cache-control')).toBe('no-cache');
        const body = await response.text();
        if (method === 'GET')
          expect(body).toContain(path === '/home/' ? 'public home' : 'workspace');
        else expect(body).toBe('');
      }
    }
    expect(await (await fetch(origin + '/api/license/status')).json()).toMatchObject({
      configured: false,
      active: false,
    });
    const sample = await fetch(origin + '/samples/brief.pdf');
    expect(sample.headers.get('content-type')).toBe('application/pdf');
    expect(await sample.text()).toContain('%PDF-1.7');
    expect(await (await fetch(origin + '/assets/app.js')).text()).toContain('workspace = true');
    for (const path of ['/home/missing', '/workspace/missing.js', '/missing'])
      expect((await fetch(origin + path)).status, path).toBe(404);
    expect((await fetch(origin + '/workspace/', { method: 'POST' })).status).toBe(405);
  });
});

describe('static transport compression and validation', () => {
  it('negotiates compression, revalidates HTML, preserves binary samples and invalidates changed files', async () => {
    directory = await mkdtemp(join(tmpdir(), 'scopeledger-compression-'));
    await mkdir(join(directory, 'home'));
    await mkdir(join(directory, 'assets'));
    await mkdir(join(directory, 'samples'));
    const html =
      '<title>Compression test</title>' + '<p>Readable application content</p>'.repeat(300);
    await writeFile(join(directory, 'home/index.html'), html);
    await writeFile(
      join(directory, 'assets/main-ABCDEFGH.js'),
      'export const value="compressed";'.repeat(100),
    );
    await writeFile(
      join(directory, 'samples/brief.pdf'),
      '%PDF-1.7 ' + 'binary sample'.repeat(200),
    );
    server = createScopeLedgerServer({
      directory,
      backend: createBackend({ config: configuration({}), service: null }),
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const br = await fetch(origin + '/home/', { headers: { 'Accept-Encoding': 'br, gzip' } });
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(await br.text()).toBe(html);
    expect(Number(br.headers.get('content-length'))).toBeLessThan(Buffer.byteLength(html) / 2);
    expect(br.headers.get('vary')).toBe('Accept-Encoding');
    expect(br.headers.get('cache-control')).toBe('no-cache');
    expect(br.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(br.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    const gzip = await fetch(origin + '/home/', {
      headers: { 'Accept-Encoding': 'br;q=0.1, gzip;q=1' },
    });
    expect(gzip.headers.get('content-encoding')).toBe('gzip');
    expect(await gzip.text()).toBe(html);
    const identity = await fetch(origin + '/home/', {
      headers: { 'Accept-Encoding': 'br;q=0, gzip;q=0' },
    });
    expect(identity.headers.get('content-encoding')).toBeNull();
    expect(await identity.text()).toBe(html);
    const head = await fetch(origin + '/home/', {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'br' },
    });
    expect(head.headers.get('content-length')).toBe(br.headers.get('content-length'));
    expect(await head.text()).toBe('');
    const unchanged = await fetch(origin + '/home/', {
      headers: { 'If-None-Match': br.headers.get('etag')! },
    });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe('');
    const asset = await fetch(origin + '/assets/main-ABCDEFGH.js');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await asset.arrayBuffer();
    const pdf = await fetch(origin + '/samples/brief.pdf');
    expect(pdf.headers.get('content-encoding')).toBeNull();
    expect((await pdf.text()).startsWith('%PDF-')).toBe(true);
    await writeFile(join(directory, 'home/index.html'), html + 'Updated');
    const changed = await fetch(origin + '/home/', {
      headers: { 'If-None-Match': br.headers.get('etag')! },
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(br.headers.get('etag'));
    expect(await changed.text()).toBe(html + 'Updated');
  });
});
