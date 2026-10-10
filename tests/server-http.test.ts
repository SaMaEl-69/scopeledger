import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { request, type Server } from 'node:http';
import { createBackend } from '../server/backend.mjs';
import { configuration, LicenseService, ServiceError } from '../server/licensing.mjs';
import { createScopeLedgerServer } from '../scripts/serve.mjs';
import { fixture } from './server/fixtures.mjs';
let directory: string,
  server: Server,
  port: number,
  config: any,
  service: any,
  backend: any,
  renders: number,
  renderer: any;
const key = 'LOCAL-HTTP-OWNER-TEST-KEY-123';
async function read(
  path: string,
  method = 'GET',
  body: any = undefined,
  cookie = '',
  origin: string | undefined = config.origin,
  extraHeaders: Record<string, string> = {},
) {
  return new Promise<any>((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const headers: any = {
      Connection: 'close',
      ...(data
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...extraHeaders,
    };
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (part) => chunks.push(part));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let json;
        try {
          json = JSON.parse(bytes.toString());
        } catch {}
        resolve({
          status: res.statusCode,
          json,
          bytes,
          cookie: (res.headers['set-cookie'] ?? []).map((value) => value.split(';')[0]).join('; '),
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}
async function activate() {
  return read('/api/license/activate', 'POST', {
    key,
    plan: 'individual',
    deviceLabel: 'QA browser',
  });
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scopeledger-http-'));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist/index.html'), '<title>test app</title>');
  config = configuration({
    NODE_ENV: 'development',
    SCOPELEDGER_MODE: 'local-test',
    SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
    SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
    SCOPELEDGER_DB_PATH: join(directory, 'licenses.sqlite'),
  });
  service = new LicenseService(config);
  service.seedLocalKey(key, 'individual');
  renders = 0;
  renderer = async () => {
    renders++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return Buffer.from('%PDF-1.7\nowner test fixture');
  };
  backend = createBackend({ config, service, renderer: (doc: any) => renderer(doc) });
  server = createScopeLedgerServer({ directory: join(directory, 'dist'), backend });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = (server.address() as any).port;
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
describe('independently authorized HTTP actions', () => {
  it('keeps the app available and protected actions closed when storage cannot open', () => {
    const failed = createBackend({ config: { ...config, dbPath: directory } });
    try {
      let status = 0,
        payload: any;
      const headers: Record<string, string> = {};
      const response: any = {
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
        writeHead: (value: number) => {
          status = value;
        },
        end: (text: string) => {
          payload = JSON.parse(text);
        },
      };
      failed.middleware({ url: '/api/license/status', method: 'GET' } as any, response, () => {});
      expect(status).toBe(200);
      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(payload).toMatchObject({
        configured: false,
        active: false,
        error: 'license_storage_failed',
      });
      failed.middleware({ url: '/api/pdf', method: 'POST' } as any, response, () => {});
      expect(status).toBe(503);
      expect(payload.error).toBe('license_storage_failed');
    } finally {
      failed.close();
    }
  });
  it('reports clearly labeled inactive local testing without exposing keys', async () => {
    const result = await read('/api/license/status');
    expect(result.json).toMatchObject({
      configured: true,
      mode: 'local-test',
      active: false,
      checkout: { individual: null, agency: null },
    });
    expect(result.bytes.toString()).not.toContain(key);
  });
  it('rejects forged activation flags, cookies and missing/cross origins', async () => {
    expect((await read('/api/pdf', 'POST', fixture(), 'scopeledger_session=fake')).status).toBe(
      401,
    );
    expect(
      (
        await read(
          '/api/license/activate',
          'POST',
          { key, plan: 'individual', deviceLabel: 'QA' },
          '',
          '',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await read(
          '/api/license/activate',
          'POST',
          { key, plan: 'individual', deviceLabel: 'QA' },
          '',
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
  });
  it('sets HttpOnly Strict cookies and returns active plan metadata', async () => {
    const result = await activate();
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      active: true,
      plan: 'individual',
      slotsUsed: 1,
      slotsLimit: 1,
    });
    expect(result.headers['set-cookie'].join()).toContain('HttpOnly');
    expect(result.headers['set-cookie'].join()).toContain('SameSite=Strict');
    expect((await read('/api/license/status', 'GET', undefined, result.cookie)).json.active).toBe(
      true,
    );
  });
  it('rejects cross-site status navigation before it can replace a device cookie', async () => {
    const a = await activate();
    const result = await read('/api/license/status', 'GET', undefined, '', '', {
      'Sec-Fetch-Site': 'cross-site',
    });
    expect(result.status).toBe(403);
    expect(result.cookie).toBe('');
    expect((await read('/api/license/status', 'GET', undefined, a.cookie)).json.active).toBe(true);
  });
  it('uses host-only secure cookie prefixes when live cookie security is enabled', async () => {
    config.secure = true;
    const result = await activate();
    expect(result.status).toBe(200);
    const headers = result.headers['set-cookie'].join('; ');
    expect(headers).toContain('__Host-scopeledger_session=');
    expect(headers).toContain('__Host-scopeledger_device=');
    expect(headers).toContain('Path=/;');
    expect(headers).toContain('; Secure');
    expect(headers).not.toContain('Domain=');
    expect((await read('/api/license/status', 'GET', undefined, result.cookie)).json.active).toBe(
      true,
    );
  });
  it('emits only bounded operational metadata and no secret or document contents', async () => {
    const events: any[] = [];
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // The first server owns and closes its service; reopen the retained database.
    service = new LicenseService(config);
    backend = createBackend({
      config,
      service,
      renderer,
      onEvent: (event: any) => events.push(event),
    });
    server = createScopeLedgerServer({ directory: join(directory, 'dist'), backend });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as any).port;
    const a = await activate();
    const privateDoc = fixture({ description: 'PRIVATE CLIENT DESCRIPTION SENTINEL' });
    expect((await read('/api/pdf', 'POST', privateDoc, a.cookie)).status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ operation: '/api/pdf', status: 200, code: 'ok' });
    expect(Object.keys(events[0]).sort()).toEqual(
      ['at', 'operation', 'status', 'code', 'durationMs'].sort(),
    );
    expect(JSON.stringify(events)).not.toContain(key);
    expect(JSON.stringify(events)).not.toContain('PRIVATE CLIENT');
  });
  it('requires authorization before granting project creation', async () => {
    expect((await read('/api/projects/authorize', 'POST', {})).status).toBe(401);
    const a = await activate();
    const result = await read('/api/projects/authorize', 'POST', {}, a.cookie);
    expect(result.json.grant).toMatch(/^[a-f0-9]{64}$/);
  });
  it('releases current device only and rejects attempts to name another', async () => {
    const a = await activate();
    expect(
      (await read('/api/license/release', 'POST', { deviceId: 'someone-else' }, a.cookie)).status,
    ).toBe(400);
    expect((await read('/api/license/release', 'POST', {}, a.cookie)).json.active).toBe(false);
    expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).status).toBe(401);
    expect((await activate()).status).toBe(200);
  });
  it('rejects confidential keys before rendering and accepts only active export snapshots', async () => {
    const a = await activate();
    const privateDoc = { ...fixture(), hours: 'PRIVATE SECRET' };
    expect((await read('/api/pdf', 'POST', privateDoc, a.cookie)).status).toBe(422);
    expect((await read('/api/pdf', 'POST', fixture({ demo: true }), a.cookie)).status).toBe(422);
    expect(renders).toBe(0);
    expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).headers['content-type']).toBe(
      'application/pdf',
    );
    expect(renders).toBe(1);
  });
  it('shares identical rapid exports and blocks different concurrent jobs', async () => {
    const a = await activate();
    const results = await Promise.all([
      read('/api/pdf', 'POST', fixture(), a.cookie),
      read('/api/pdf', 'POST', fixture(), a.cookie),
    ]);
    expect(results.map((x) => x.status)).toEqual([200, 200]);
    expect(renders).toBe(1);
    renderer = async () => {
      renders++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return Buffer.from('%PDF');
    };
    const result = await Promise.all([
      read('/api/pdf', 'POST', fixture(), a.cookie),
      read('/api/pdf', 'POST', fixture({ reference: 'OTHER' }), a.cookie),
    ]);
    expect(result.map((x) => x.status).sort()).toEqual([200, 409]);
  });
  it('restores a useful retry state after render failure', async () => {
    const a = await activate();
    renderer = async () => {
      throw new ServiceError('renderer_timeout', 'Retry export', 504);
    };
    expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).json.error).toBe(
      'renderer_timeout',
    );
    renderer = async () => Buffer.from('%PDF');
    expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).status).toBe(200);
  });
  it('does not spend shared license quota on rejected device-limit retries', async () => {
    const a = await activate();
    expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).status).toBe(200);
    const licenseId = service.licenseId(key, 'individual');
    const deviceId = service.db
      .prepare('SELECT device_id FROM devices WHERE license_id=? AND active=1')
      .get(licenseId).device_id;
    const subject = `${licenseId}:${deviceId}`;
    service.db
      .prepare('UPDATE quotas SET count=100 WHERE subject=? AND operation=?')
      .run(subject, 'pdf-device');
    for (let retry = 0; retry < 3; retry++)
      expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).json.error).toBe('rate_limited');
    expect(renders).toBe(1);
    expect(
      service.db
        .prepare('SELECT count FROM quotas WHERE subject=? AND operation=?')
        .get(licenseId, 'pdf-license').count,
    ).toBe(1);
    expect(
      service.db
        .prepare('SELECT count FROM quotas WHERE subject=? AND operation=?')
        .get(subject, 'pdf-device').count,
    ).toBe(100);
  });
  it('blocks huge bodies, unsupported activation keys and unknown API actions', async () => {
    const a = await activate();
    const rejected = new Promise<number>((resolve) => {
      server.once('request', (_req, response) =>
        response.once('finish', () => resolve(response.statusCode)),
      );
    });
    const huge = await read('/api/pdf', 'POST', { text: 'A'.repeat(2700000) }, a.cookie).catch(
      (error) => {
        // Closing an unfinished oversized upload may reset its still-writing
        // client. Verify the server's rejection even if that client misses 413.
        expect(['ECONNRESET', 'EPIPE']).toContain(error.code);
        return null;
      },
    );
    if (huge) expect(huge.status).toBe(413);
    expect(await rejected).toBe(413);
    expect(renders).toBe(0);
    expect(
      service.db.prepare("SELECT count(*) AS n FROM quotas WHERE operation LIKE 'pdf-%'").get().n,
    ).toBe(0);
    expect(
      (
        await read('/api/license/activate', 'POST', {
          key,
          plan: 'individual',
          deviceLabel: 'QA',
          licensed: true,
        })
      ).status,
    ).toBe(400);
    expect((await read('/api/other', 'POST', {}, a.cookie)).status).toBe(404);
    expect((await read('/api/pdf', 'POST', fixture(), a.cookie)).status).toBe(200);
  });
});

describe('hostile request boundaries', () => {
  it('rejects unknown routes and wrong methods before touching identity or verification', async () => {
    const original = service.deviceToken.bind(service);
    let touched = 0;
    service.deviceToken = (...args: any[]) => {
      touched++;
      return original(...args);
    };
    const unknown = await read('/api/not-a-service', 'POST', {});
    expect(unknown.status).toBe(404);
    const method = await read('/api/pdf', 'GET');
    expect(method.status).toBe(405);
    expect(method.headers.allow).toBe('POST');
    expect(touched).toBe(0);
    expect(unknown.cookie).toBe('');
  });
  it.each([
    [{ 'Content-Type': 'application/jsonp' }, 415],
    [{ 'Content-Type': 'text/plain' }, 415],
    [{ 'Content-Encoding': 'gzip' }, 415],
  ])('refuses ambiguous or compressed JSON requests: %j', async (headers, status) => {
    const result = await read(
      '/api/license/activate',
      'POST',
      { key, plan: 'individual', deviceLabel: 'QA' },
      '',
      config.origin,
      headers as Record<string, string>,
    );
    expect(result.status).toBe(status);
    expect(result.cookie).toBe('');
  });
  it('rejects oversized activation bodies before granting an entitlement', async () => {
    const result = await read('/api/license/activate', 'POST', {
      key,
      plan: 'individual',
      deviceLabel: 'x'.repeat(17000),
    });
    expect(result.status).toBe(413);
    expect(service.db.prepare('SELECT count(*) AS n FROM sessions').get().n).toBe(0);
  });
  it('rejects chunked oversize immediately without waiting for upload completion', async () => {
    const response = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/license/activate',
          method: 'POST',
          headers: {
            Origin: config.origin,
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked',
          },
        },
        (res) => {
          res.resume();
          res.once('end', () => {
            resolve(res.statusCode!);
            req.destroy();
          });
        },
      );
      req.once('error', reject);
      req.setTimeout(2000, () =>
        req.destroy(new Error('Oversized upload was not rejected promptly')),
      );
      req.write(Buffer.alloc(17000, 32)); // Deliberately never end the upload.
    });
    expect(response).toBe(413);
  });
  it('rejects malformed UTF-8 instead of replacing bytes inside a purchase key', async () => {
    const response = await new Promise<number>((resolve, reject) => {
      const bytes = Buffer.concat([
        Buffer.from('{"key":"'),
        Buffer.from([0xff]),
        Buffer.from('","plan":"individual","deviceLabel":"QA"}'),
      ]);
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/license/activate',
          method: 'POST',
          headers: {
            Origin: config.origin,
            'Content-Type': 'application/json',
            'Content-Length': bytes.length,
          },
        },
        (res) => {
          res.resume();
          res.once('end', () => resolve(res.statusCode!));
        },
      );
      req.once('error', reject);
      req.end(bytes);
    });
    expect(response).toBe(400);
  });
  it('bounds simultaneous API work and recovers after the work finishes', async () => {
    const activated = await activate();
    const original = service.authorized.bind(service);
    let waiting = 0,
      resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    service.authorized = async (...args: any[]) => {
      waiting++;
      await gate;
      return original(...args);
    };
    const pending = Array.from({ length: 16 }, () =>
      read('/api/license/status', 'GET', undefined, activated.cookie),
    );
    try {
      const until = Date.now() + 2000;
      while (waiting < 16 && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect(waiting).toBe(16);
      const overflow = await read('/api/license/status', 'GET', undefined, activated.cookie);
      expect(overflow.status).toBe(503);
      expect(overflow.json.error).toBe('service_busy');
      expect(overflow.headers['retry-after']).toBe('5');
    } finally {
      resume();
      await Promise.all(pending);
      service.authorized = original;
    }
    expect(
      (await read('/api/license/status', 'GET', undefined, activated.cookie)).json.active,
    ).toBe(true);
  });
  it('shares renderer capacity with health probes', async () => {
    const activated = await activate();
    let release!: () => void;
    const hold = new Promise<boolean>((resolve) => {
      release = () => resolve(true);
    });
    const first = backend.probeRenderer(() => hold);
    const second = backend.probeRenderer(() => hold);
    try {
      expect(await backend.probeRenderer(async () => true)).toBe(false);
      const result = await read('/api/pdf', 'POST', fixture(), activated.cookie);
      expect(result.status).toBe(429);
      expect(result.json.error).toBe('renderer_busy');
      expect(renders).toBe(0);
    } finally {
      release();
      await Promise.all([first, second]);
    }
    expect((await read('/api/pdf', 'POST', fixture(), activated.cookie)).status).toBe(200);
  });
});
