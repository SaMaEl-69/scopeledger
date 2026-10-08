import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type Server } from 'node:http';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { createBackend } from '../server/backend.mjs';
import { createScopeLedgerServer } from '../scripts/serve.mjs';

let directory: string;
let server: Server;
let port: number;
let config: any;
let service: LicenseService;
let peerOverride: string | undefined;
let events: unknown[];
const key = 'LIVE-PROXY-AGENCY-SYNTHETIC-KEY';
const liveEnv = (dbPath: string): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  SCOPELEDGER_MODE: 'live',
  SCOPELEDGER_ORIGIN: 'https://scopeledger.example',
  SCOPELEDGER_DB_PATH: dbPath,
  SCOPELEDGER_SESSION_SECRET: '66'.repeat(32),
  SCOPELEDGER_GUMROAD_SELLER_ID: 'synthetic-seller',
  SCOPELEDGER_GUMROAD_INDIVIDUAL_PRODUCT_ID: 'synthetic-individual',
  SCOPELEDGER_GUMROAD_AGENCY_PRODUCT_ID: 'synthetic-agency',
  SCOPELEDGER_SELLER_VERIFIED: 'true',
  SCOPELEDGER_TRUST_LOOPBACK_PROXY: 'true',
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scopeledger-proxy-'));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist/index.html'), '<title>ScopeLedger proxy test</title>');
  config = configuration(liveEnv(join(directory, 'licenses.sqlite')));
  service = new LicenseService(config, {
    clock: () => 1000,
    // These are isolated authorization tests, not a real provider integration.
    verify: async () => ({ purchaseId: 'synthetic-proxy-purchase', adverse: false }),
  });
  peerOverride = undefined;
  events = [];
  const backend = createBackend({
    config,
    service,
    onEvent: (event: unknown) => events.push(event),
  });
  server = createScopeLedgerServer({
    directory: join(directory, 'dist'),
    backend: {
      ...backend,
      middleware(req: any, res: any, next: () => void) {
        // Only the test controls transport identity; no request header can do so.
        if (peerOverride)
          Object.defineProperty(req.socket, 'remoteAddress', {
            value: peerOverride,
            configurable: true,
          });
        backend.middleware(req, res, next);
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback HTTP listener');
  port = address.port;
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});
function activate(forwarded: string | string[] | undefined, cookie = '') {
  return new Promise<{ status: number; cookie: string; json: any }>((resolve, reject) => {
    const body = JSON.stringify({ key, plan: 'agency', deviceLabel: 'Synthetic proxy browser' });
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/license/activate',
        method: 'POST',
        headers: {
          Connection: 'close',
          Origin: config.origin,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(forwarded === undefined ? {} : { 'X-Forwarded-For': forwarded }),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (part) => {
          text += part;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            json: JSON.parse(text),
            cookie: (res.headers['set-cookie'] ?? [])
              .map((value) => value.split(';')[0])
              .join('; '),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
const counters = () =>
  service.db.prepare("SELECT subject,count FROM quotas WHERE operation='activate'").all();

describe('explicit trusted-loopback-proxy activation throttling', () => {
  it('requires an explicit valid live-only opt-in while defaults remain direct', () => {
    const env = liveEnv(config.dbPath);
    delete env.SCOPELEDGER_TRUST_LOOPBACK_PROXY;
    expect(configuration(env)).toMatchObject({ configured: true, trustLoopbackProxy: false });
    expect(configuration({ ...env, SCOPELEDGER_TRUST_LOOPBACK_PROXY: 'true' })).toMatchObject({
      configured: true,
      trustLoopbackProxy: true,
    });
    expect(configuration({ ...env, SCOPELEDGER_TRUST_LOOPBACK_PROXY: 'yes' })).toMatchObject({
      configured: false,
      trustLoopbackProxy: false,
    });
    expect(
      configuration({
        ...env,
        NODE_ENV: 'development',
        SCOPELEDGER_MODE: 'local-test',
        SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
        SCOPELEDGER_TRUST_LOOPBACK_PROXY: 'true',
      }),
    ).toMatchObject({ configured: false, trustLoopbackProxy: false });
  });
  it('gives separate verified client addresses independent unchanged 20/hour budgets', async () => {
    for (const client of ['198.51.100.1', '198.51.100.2']) {
      let cookie = '';
      for (let count = 0; count < 20; count++) {
        const result = await activate(client, cookie);
        expect(result.status).toBe(200);
        cookie = result.cookie;
      }
      expect((await activate(client, cookie)).json.error).toBe('rate_limited');
    }
    expect(counters()).toHaveLength(2);
    expect(counters().map((row: any) => row.count)).toEqual([20, 20]);
    expect(service.slots({ licenseId: service.licenseId(key, 'agency') })).toBe(2);
    expect(JSON.stringify(events)).not.toContain('198.51.100.');
    expect(JSON.stringify(events)).not.toContain(key);
  });
  it.each(['default direct', 'non-loopback peer'])(
    'ignores spoofed forwarding and preserves one direct budget for %s',
    async (mode) => {
      if (mode === 'default direct') config.trustLoopbackProxy = false;
      else peerOverride = '203.0.113.8';
      let cookie = '';
      for (let count = 0; count < 20; count++) {
        const result = await activate(
          count % 2 ? `198.51.100.${count}` : 'a forged, invalid chain',
          cookie,
        );
        expect(result.status).toBe(200);
        cookie = result.cookie;
      }
      expect((await activate('198.51.100.250', cookie)).json.error).toBe('rate_limited');
      expect(counters()).toEqual([
        {
          subject: service.hash(`ip:${peerOverride ?? '127.0.0.1'}`),
          count: 20,
        },
      ]);
    },
  );
  it('rejects missing, malformed, chained and duplicate proxy identity before spending quota', async () => {
    for (const input of [
      undefined,
      '',
      ' ',
      '198.51.100.1, 198.51.100.2',
      ['198.51.100.1', '198.51.100.2'],
      '198.51.100.1:443',
      '[2001:db8::1]',
      'fe80::1%eth0',
      '198.051.100.1',
      'https://198.51.100.1',
      'PRIVATE MALFORMED SENTINEL',
    ]) {
      const result = await activate(input);
      expect(result.status).toBe(input === undefined || input === '' || input === ' ' ? 503 : 400);
      expect(result.json.error).toMatch(/^proxy_client_ip_(required|invalid)$/);
      expect(result.json.message).not.toContain('PRIVATE MALFORMED SENTINEL');
      expect(result.json.message).not.toContain('198.51.100.');
    }
    expect(counters()).toHaveLength(0);
    expect(service.db.prepare('SELECT COUNT(*) AS count FROM devices').get().count).toBe(0);
    expect(JSON.stringify(events)).not.toContain('PRIVATE MALFORMED SENTINEL');
    expect((await activate('198.51.100.1')).status).toBe(200);
    expect(counters().map((row: any) => row.count)).toEqual([1]);
  });
  it.each([
    {
      name: 'IPv6 compression and casing',
      addresses: ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
      canonical: '2001:db8::1',
    },
    {
      name: 'IPv4 and mapped IPv6',
      addresses: ['192.0.2.1', '::ffff:192.0.2.1', '0:0:0:0:0:FFFF:C000:0201'],
      canonical: '192.0.2.1',
    },
  ])('normalizes $name without refreshing its allowance', async ({ addresses, canonical }) => {
    let cookie = '';
    for (let count = 0; count < 20; count++) {
      const result = await activate(addresses[count % addresses.length], cookie);
      expect(result.status).toBe(200);
      cookie = result.cookie;
    }
    expect((await activate(addresses[0], cookie)).json.error).toBe('rate_limited');
    expect(counters()).toEqual([{ subject: service.hash(`ip:${canonical}`), count: 20 }]);
  });
});
