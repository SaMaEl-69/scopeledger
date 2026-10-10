import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type Server } from 'node:http';
import {
  canCreateProject,
  getAccess,
  isWithinDemoAllowance,
  PLANS,
  SUPPORT_EMAIL,
} from '../src/domain/access';
import type { Project } from '../src/domain/types';
import { SCENARIOS } from '../src/content/scenarios';
import { accessBoundary, failClosedAccess } from '../vite.config';
import { createScopeLedgerServer } from '../scripts/serve.mjs';

const project = (sample: boolean, deletedAt: string | null = null) =>
  ({ id: crypto.randomUUID(), sample, deletedAt }) as Project;

describe('fixed commercial and demo access contract', () => {
  it('keeps both one-time plans complete and distinguishes devices from projects', () => {
    expect(PLANS.individual).toMatchObject({
      price: '49',
      currency: 'USD',
      activations: 1,
      completeFeatures: true,
    });
    expect(PLANS.agency).toMatchObject({
      price: '99',
      currency: 'USD',
      activations: 5,
      completeFeatures: true,
    });
    expect(Object.isFrozen(PLANS)).toBe(true);
    expect(Object.isFrozen(PLANS.agency)).toBe(true);
    expect(SUPPORT_EMAIL).toBe('support@scopeledger.site');
    expect(getAccess()).toEqual({
      mode: 'demo',
      licensingConfigured: false,
      canDownloadPdf: false,
      canPurchase: false,
    });
  });
  it('allows the sample plus one custom project and retains deleted project slots', () => {
    expect(canCreateProject({ projects: [project(true)] })).toBe(true);
    expect(canCreateProject({ projects: [project(true), project(false)] })).toBe(false);
    expect(
      canCreateProject({ projects: [project(true), project(false, new Date().toISOString())] }),
    ).toBe(false);
    expect(isWithinDemoAllowance({ projects: [project(true), project(false)] })).toBe(true);
    expect(isWithinDemoAllowance({ projects: [project(true), project(true)] })).toBe(false);
    expect(
      isWithinDemoAllowance({ projects: [project(true), project(false), project(false)] }),
    ).toBe(false);
  });
  it('provides twelve fully described, distinct scenarios without assumed numeric terms', () => {
    expect(SCENARIOS).toHaveLength(12);
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(12);
    for (const scenario of SCENARIOS) {
      for (const value of Object.values(scenario)) expect(value.trim().length).toBeGreaterThan(0);
      expect(Object.values(scenario).join(' ')).not.toMatch(
        /[$£€]|\b\d+\s*(?:hours?|days?|weeks?)\b/i,
      );
    }
    expect(SCENARIOS.find((scenario) => scenario.id === 'post-launch-defect')).toMatchObject({
      classification: 'Defect',
      route: 'Absorb',
    });
  });
});

describe('Vite access boundary', () => {
  it('protects both development and preview with the same middleware', () => {
    const plugin = failClosedAccess();
    expect(plugin.configureServer).toBeTypeOf('function');
    expect(plugin.configurePreviewServer).toBeTypeOf('function');
  });
  it('fails closed irrespective of activation claims', () => {
    let status = 0;
    let body = '';
    let calledNext = false;
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      },
      writeHead: (value: number) => {
        status = value;
      },
      end: (value: string) => {
        body = value;
      },
    };
    accessBoundary(
      {
        url: '/api/pdf?licensed=true',
        method: 'POST',
        headers: { authorization: 'Bearer fake-license' },
      } as never,
      response as never,
      () => {
        calledNext = true;
      },
    );
    expect(status).toBe(503);
    expect(JSON.parse(body).error).toBe('licensing_not_configured');
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(calledNext).toBe(false);
  });
});

describe('production static server security', () => {
  let directory: string;
  let server: Server;
  let port: number;
  const read = (
    path: string,
    method = 'GET',
    headers = {},
  ): Promise<{ status: number; body: string; headers: Record<string, unknown> }> =>
    new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method, headers }, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body, headers: response.headers }),
        );
      });
      req.on('error', reject);
      req.end();
    });
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'scopeledger-access-'));
    const root = join(directory, 'dist');
    await mkdir(join(root, 'assets'), { recursive: true });
    await mkdir(join(root, 'home'));
    await mkdir(join(root, 'workspace'));
    const [homeEntry, workspaceEntry] = await Promise.all([
      readFile(new URL('../home/index.html', import.meta.url), 'utf8'),
      readFile(new URL('../workspace/index.html', import.meta.url), 'utf8'),
    ]);
    await writeFile(join(root, 'home/index.html'), homeEntry);
    await writeFile(join(root, 'workspace/index.html'), workspaceEntry);
    await writeFile(
      join(root, 'index.html'),
      '<!doctype html><title>ScopeLedger application</title>',
    );
    await writeFile(join(root, 'assets/app.js'), 'export const app = true;');
    await writeFile(join(directory, 'outside.txt'), 'must not be served');
    await symlink(join(directory, 'outside.txt'), join(root, 'escape.txt'));
    server = createScopeLedgerServer({ directory: root });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected HTTP listener');
    port = address.port;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('canonicalizes the public root and legacy workspace routes without losing query values', async () => {
    for (const [path, location] of [
      ['/', '/home/'],
      ['/?source=public%20home&plan=agency', '/home/?source=public%20home&plan=agency'],
      ['/home?source=menu', '/home/?source=menu'],
      ['/workspace?view=documents', '/workspace/?view=documents'],
      ['/app', '/workspace/'],
      ['/app?return=%2Fhome%2F', '/workspace/?return=%2Fhome%2F'],
      ['/app/projects/example?source=a%26b', '/workspace/projects/example?source=a%26b'],
    ])
      expect(await read(path), path).toMatchObject({
        status: 308,
        headers: { location, 'cache-control': 'no-store' },
      });
    expect(await read('/workspace/projects/example')).toMatchObject({ status: 200 });
    expect(await read('/assets/app.js')).toMatchObject({
      status: 200,
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
    expect(await read('/unrelated-page')).toMatchObject({ status: 404 });
  });
  it('serves the actual home and workspace entry metadata from separate built paths', async () => {
    for (const entry of ['home', 'workspace']) {
      const response = await read(`/${entry}/`);
      expect(response).toMatchObject({
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
      });
      expect(response.body).toContain(
        `<link rel="canonical" href="https://scopeledger.site/${entry}/"`,
      );
      expect(response.body).toContain('ScopeLedger');
    }
    for (const path of ['/home/?raw=../outside.txt', '/workspace/?raw&file=../outside.txt']) {
      const response = await read(path);
      expect(response.status, path).toBe(200);
      expect(response.body).not.toContain('must not be served');
    }
  });
  it('rejects all premium endpoints and fabricated client activation', async () => {
    for (const path of [
      '/api/pdf',
      '/api/pdf?raw&licensed=true',
      '/api/license/activate',
      '/api/purchase',
      '/api',
      '/%61pi/pdf',
      '/API/pdf',
    ]) {
      const response = await read(path, 'POST', {
        authorization: 'Bearer fake',
        'x-licensed': 'true',
      });
      const unknown = ['/api/purchase', '/api', '/API/pdf'].includes(path);
      expect(response.status).toBe(unknown ? 404 : 503);
      expect(JSON.parse(response.body)).toMatchObject(
        unknown
          ? { error: 'not_found' }
          : {
              error: 'licensing_not_configured',
              licensingConfigured: false,
            },
      );
    }
  });
  it('rejects traversal, hidden files, malformed encodings and escaping symlinks', async () => {
    for (const path of [
      '/../outside.txt',
      '/%2e%2e/outside.txt',
      '/assets/../../outside.txt',
      '/app/../../outside.txt?raw',
      '/workspace/../../outside.txt?raw',
      '/.env',
      '/workspace/.env?raw',
      '/home/.env?raw',
      '/%00',
      '/%zz',
      '/escape.txt',
      '/assets%5c..%5coutside.txt',
    ]) {
      const response = await read(path);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain('must not be served');
    }
  });
  it('handles HEAD and unsupported write methods without exposing files', async () => {
    expect(await read('/app?view=documents', 'HEAD')).toMatchObject({
      status: 308,
      body: '',
      headers: { location: '/workspace/?view=documents' },
    });
    expect(await read('/workspace/', 'HEAD')).toMatchObject({ status: 200, body: '' });
    expect(await read('/home/', 'HEAD')).toMatchObject({ status: 200, body: '' });
    expect(await read('/app', 'POST')).toMatchObject({ status: 405 });
    expect(await read('/workspace/', 'POST')).toMatchObject({ status: 405 });
  });
});
