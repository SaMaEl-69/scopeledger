import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  LicenseService,
  configuration,
  gumroadVerify,
  ServiceError,
} from '../server/licensing.mjs';
let directory: string;
let config: any;
let service: LicenseService;
const individual = 'LOCAL-INDIVIDUAL-TEST-KEY-123',
  agency = 'LOCAL-AGENCY-TEST-KEY-123';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scopeledger-license-'));
  config = configuration({
    NODE_ENV: 'development',
    SCOPELEDGER_MODE: 'local-test',
    SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
    SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
    SCOPELEDGER_DB_PATH: join(directory, 'license.sqlite'),
  });
  service = new LicenseService(config);
  service.seedLocalKey(individual, 'individual');
  service.seedLocalKey(agency, 'agency');
});
afterEach(async () => {
  service?.close();
  await rm(directory, { recursive: true, force: true });
});
describe('durable licensing boundary', () => {
  it('cannot enable test mode in production or on a public origin', () => {
    expect(
      configuration({
        ...process.env,
        NODE_ENV: 'production',
        SCOPELEDGER_MODE: 'local-test',
        SCOPELEDGER_ORIGIN: config.origin,
        SCOPELEDGER_SESSION_SECRET: config.secret,
        SCOPELEDGER_DB_PATH: config.dbPath,
      }).configured,
    ).toBe(false);
    expect(
      configuration({
        NODE_ENV: 'development',
        SCOPELEDGER_MODE: 'local-test',
        SCOPELEDGER_ORIGIN: 'http://public.example',
        SCOPELEDGER_SESSION_SECRET: config.secret,
        SCOPELEDGER_DB_PATH: config.dbPath,
      }).configured,
    ).toBe(false);
  });
  it('requires complete verified seller settings before live mode', () => {
    expect(configuration({ SCOPELEDGER_MODE: 'live' }).configured).toBe(false);
  });
  it('allocates one slot, reuses same browser, and rejects a second device', async () => {
    const d = service.deviceToken();
    const a = await service.activate(individual, 'individual', 'First', d);
    const b = await service.activate(individual, 'individual', 'Renamed', d);
    expect(await service.authorized(b.token, d.token)).toMatchObject({
      deviceLabel: 'Renamed',
      plan: 'individual',
    });
    expect(service.slots({ licenseId: a.licenseId })).toBe(1);
    await expect(
      service.activate(individual, 'individual', 'Second', service.deviceToken()),
    ).rejects.toMatchObject({ code: 'capacity_full' });
    await expect(service.authorized(a.token, d.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
  });
  it('durably serializes parallel allocation across database connections', async () => {
    const second = new LicenseService(config);
    try {
      const result = await Promise.allSettled([
        service.activate(individual, 'individual', 'A', service.deviceToken()),
        second.activate(individual, 'individual', 'B', second.deviceToken()),
      ]);
      expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(result.filter((x) => x.status === 'rejected')).toHaveLength(1);
    } finally {
      second.close();
    }
  });
  it('enforces five Agency devices and preserves allocation across restart', async () => {
    for (let i = 0; i < 5; i++)
      await service.activate(agency, 'agency', `Browser ${i}`, service.deviceToken());
    service.close();
    service = new LicenseService(config);
    await expect(
      service.activate(agency, 'agency', 'Sixth', service.deviceToken()),
    ).rejects.toMatchObject({ code: 'capacity_full' });
  });
  it('rejects mismatched plans and fabricated keys', async () => {
    await expect(
      service.activate(agency, 'individual', 'Wrong', service.deviceToken()),
    ).rejects.toMatchObject({ code: 'wrong_plan' });
    await expect(
      service.activate('not-a-real-local-key', 'agency', 'Fake', service.deviceToken()),
    ).rejects.toMatchObject({ code: 'invalid_key' });
  });
  it('releases only current identity and permits another activation', async () => {
    const device = service.deviceToken(),
      a = await service.activate(individual, 'individual', 'A', device);
    const identity = await service.authorized(a.token, device.token);
    service.release(identity);
    await expect(service.authorized(a.token, device.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
    expect(
      await service.activate(individual, 'individual', 'B', service.deviceToken()),
    ).toBeTruthy();
  });
  it('encrypts raw keys and binds signed device cookies to sessions', async () => {
    const device = service.deviceToken(),
      a = await service.activate(individual, 'individual', 'A', device);
    const row = service.db.prepare('SELECT * FROM licenses WHERE id=?').get(a.licenseId);
    expect(row.key_cipher).not.toContain(individual);
    expect(service.decrypt(row.key_cipher)).toBe(individual);
    await expect(service.authorized(a.token, service.deviceToken().token)).rejects.toMatchObject({
      code: 'activation_required',
    });
    await expect(service.authorized('fabricated', device.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
  });
  it('uses stable identities for quotas across session refresh', async () => {
    const device = service.deviceToken(),
      a = await service.activate(individual, 'individual', 'A', device);
    service.quota(`${a.licenseId}:${device.id}`, 'pdf', 1);
    await service.activate(individual, 'individual', 'A', device);
    expect(() => service.quota(`${a.licenseId}:${device.id}`, 'pdf', 1)).toThrow(/allowance/);
  });
  it('cannot reuse a cached session after seller or product configuration changes', async () => {
    const device = service.deviceToken(),
      a = await service.activate(individual, 'individual', 'Configured identity', device);
    config.products.individual = 'different-product';
    await expect(service.authorized(a.token, device.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
    expect(service.slots({ licenseId: a.licenseId })).toBe(1);
  });
  it('rolls back an allocation when committing license state fails', async () => {
    const execute = service.db.exec.bind(service.db);
    const spy = vi.spyOn(service.db, 'exec').mockImplementation((sql: any) => {
      if (sql === 'COMMIT') throw new Error('Simulated disk failure');
      return execute(sql);
    });
    try {
      await expect(
        service.activate(individual, 'individual', 'Failed write', service.deviceToken()),
      ).rejects.toMatchObject({ code: 'license_storage_failed' });
    } finally {
      spy.mockRestore();
    }
    expect(service.db.prepare('SELECT COUNT(*) AS count FROM devices').get().count).toBe(0);
    expect(service.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(0);
  });
  it('requires independent evidence for admin recovery and writes audit', async () => {
    const device = service.deviceToken(),
      a = await service.activate(individual, 'individual', 'A', device);
    expect(() =>
      service.recoverDevice({
        licenseId: a.licenseId,
        deviceId: device.id,
        operator: 'Seller',
        evidence: '',
      }),
    ).toThrow(/ownership/);
    service.recoverDevice({
      licenseId: a.licenseId,
      deviceId: device.id,
      operator: 'Seller',
      evidence: 'Receipt matched independently to purchaser email via seller purchase dashboard.',
    });
    expect(service.db.prepare('SELECT COUNT(*) AS count FROM recovery_audit').get().count).toBe(1);
  });
});
const live = {
  mode: 'live',
  configured: true,
  secret: '11'.repeat(32),
  sellerId: 'seller',
  products: { individual: 'product-one', agency: 'product-five' },
  ttlMs: 10,
};
function purchase(patch: any = {}) {
  return {
    success: true,
    purchase: {
      id: 'sale-one',
      seller_id: 'seller',
      product_id: 'product-one',
      license_key: 'LIVE-KEY-123456',
      test: false,
      refunded: false,
      disputed: false,
      dispute_won: false,
      ...patch,
    },
  };
}
const fetcher =
  (payload: any, status = 200) =>
  async () =>
    new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status });
describe('mocked Gumroad response handling (not a live purchase)', () => {
  it('sends product/key with increment disabled', async () => {
    let body = '';
    await gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
      fetcher: async (_url: any, request: any) => {
        body = request.body.toString();
        return new Response(JSON.stringify(purchase()));
      },
    });
    expect(body).toContain('increment_uses_count=false');
    expect(body).toContain('product_id=product-one');
  });
  it.each([
    ['product_id', 'other', 'wrong_plan'],
    ['seller_id', 'other', 'provider_mismatch'],
    ['license_key', 'other', 'provider_mismatch'],
    ['id', 'other', 'provider_mismatch'],
    ['refunded', 'true', 'provider_malformed'],
    ['test', true, 'provider_malformed'],
  ])('rejects unmatched/uncertain %s', async (field, value, code) => {
    await expect(
      gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: fetcher(purchase({ [field]: value })),
        expectedPurchaseId: 'sale-one',
      }),
    ).rejects.toMatchObject({ code });
  });
  it.each([
    ['refund', { refunded: true }],
    ['chargeback', { chargebacked: true }],
    ['unresolved dispute', { disputed: true, dispute_won: false }],
  ])('confirms matching %s adverse state', async (_name, patch) => {
    expect(
      await gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: fetcher(purchase(patch)),
      }),
    ).toMatchObject({ adverse: true });
  });
  it('does not treat a won dispute as adverse', async () => {
    expect(
      await gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: fetcher(purchase({ disputed: true, dispute_won: true })),
      }),
    ).toMatchObject({ adverse: false });
  });
  it('distinguishes a valid other-plan key from an invalid key without allocating', async () => {
    await expect(
      gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: async (_url: any, request: any) =>
          request.body.get('product_id') === 'product-one'
            ? new Response(JSON.stringify({ success: false }), { status: 404 })
            : new Response(JSON.stringify(purchase({ product_id: 'product-five' }))),
      }),
    ).rejects.toMatchObject({ code: 'wrong_plan' });
  });
  it.each([
    ['not json', 200, 'provider_malformed'],
    [{}, 200, 'provider_malformed'],
    [{ success: false }, 404, 'invalid_key'],
    [{}, 503, 'provider_outage'],
  ])('classifies provider failure %s', async (payload, status, code) => {
    await expect(
      gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: fetcher(payload, status as number),
      }),
    ).rejects.toMatchObject({ code });
  });
  it('classifies timeouts and network outage without leaking the key', async () => {
    for (const name of ['TimeoutError', 'Error']) {
      await expect(
        gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
          fetcher: async () => {
            throw Object.assign(new Error('secret'), { name });
          },
        }),
      ).rejects.toMatchObject({
        code: name === 'TimeoutError' ? 'provider_timeout' : 'provider_outage',
      });
    }
  });
  it('classifies provider response-body timeouts as retryable uncertainty', async () => {
    await expect(
      gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: async () => ({
          status: 200,
          ok: true,
          text: async () => {
            throw Object.assign(new Error('secret'), { name: 'AbortError' });
          },
        }),
      }),
    ).rejects.toMatchObject({ code: 'provider_timeout' });
  });
  it('cancels oversized provider streams before buffering an unbounded body', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(100001));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      gumroadVerify(live, 'LIVE-KEY-123456', 'individual', {
        fetcher: async () => new Response(body),
      }),
    ).rejects.toMatchObject({ code: 'provider_malformed' });
    expect(cancelled).toBe(true);
  });
  it('does not treat a seeded development key as a live purchase', async () => {
    const cfg = { ...config, ...live, dbPath: config.dbPath };
    const verify = vi.fn(async () => {
      throw new ServiceError('invalid_key', 'No live purchase', 422);
    });
    const s = new LicenseService(cfg, { verify });
    try {
      await expect(
        s.activate(individual, 'individual', 'Production fixture', s.deviceToken()),
      ).rejects.toMatchObject({ code: 'invalid_key' });
      expect(verify).toHaveBeenCalledOnce();
      expect(s.db.prepare('SELECT COUNT(*) AS count FROM devices').get().count).toBe(0);
    } finally {
      s.close();
    }
  });
  it('permits only current-session release during provider uncertainty', async () => {
    let time = 100,
      uncertain = false;
    const cfg = { ...config, ...live, dbPath: join(directory, 'release-live.sqlite') };
    const s = new LicenseService(cfg, {
      clock: () => time,
      verify: async () => {
        if (uncertain) throw new ServiceError('provider_outage', 'Retry', 503);
        return { purchaseId: 'sale-one', adverse: false };
      },
    });
    try {
      const d = s.deviceToken(),
        a = await s.activate('LIVE-KEY-123456', 'individual', 'Release fixture', d);
      time = 1000;
      uncertain = true;
      await expect(s.authorized(a.token, d.token)).rejects.toMatchObject({
        code: 'provider_outage',
      });
      const identity = await s.authorized(a.token, d.token, { releaseOnly: true });
      s.release(identity);
      await expect(s.authorized(a.token, d.token, { releaseOnly: true })).rejects.toMatchObject({
        code: 'activation_required',
      });
      expect(s.db.prepare('SELECT status FROM licenses WHERE id=?').get(a.licenseId).status).toBe(
        'active',
      );
    } finally {
      s.close();
    }
  });
  it.each(['rotation', 'release and reactivation', 'expiry'])(
    'rejects a session changed by %s while provider revalidation is pending',
    async (transition) => {
      let time = 100,
        checks = 0,
        completeCheck!: (value: { purchaseId: string; adverse: boolean }) => void;
      const cfg = { ...config, ...live, dbPath: join(directory, 'pending-session.sqlite') };
      const s = new LicenseService(cfg, {
        clock: () => time,
        verify: async () => {
          checks++;
          if (checks === 2)
            return new Promise((resolve) => {
              completeCheck = resolve;
            });
          return { purchaseId: 'sale-one', adverse: false };
        },
      });
      try {
        const device = s.deviceToken(),
          original = await s.activate('LIVE-KEY-123456', 'individual', 'Original', device),
          releaseIdentity = await s.authorized(original.token, device.token, {
            releaseOnly: true,
          });
        time = 1000;
        const pending = s.authorized(original.token, device.token);
        const denied = expect(pending).rejects.toMatchObject({ code: 'activation_required' });
        await Promise.resolve();
        expect(checks).toBe(2);
        let replacing: ReturnType<LicenseService['activate']> | undefined;
        if (transition === 'expiry') time = 100 + 1209600000;
        else {
          if (transition === 'release and reactivation') s.release(releaseIdentity);
          replacing = s.activate('LIVE-KEY-123456', 'individual', 'Replacement', device);
        }
        completeCheck({ purchaseId: 'sale-one', adverse: false });
        const replacement = replacing ? await replacing : undefined;
        await denied;
        // Rejecting the old request must preserve the replacement activation.
        expect(s.slots({ licenseId: original.licenseId })).toBe(1);
        if (replacement)
          expect(await s.authorized(replacement.token, device.token)).toMatchObject({
            deviceLabel: 'Replacement',
          });
      } finally {
        s.close();
      }
    },
  );
  it('preserves entitlement during uncertainty, then persists matching adverse status', async () => {
    let time = 100,
      adverse = false,
      uncertain = false;
    const cfg = { ...config, ...live, dbPath: join(directory, 'live.sqlite') };
    const s = new LicenseService(cfg, {
      clock: () => time,
      verify: async () => {
        if (uncertain) throw new ServiceError('provider_outage', 'Retry', 503);
        return { purchaseId: 'sale-one', adverse };
      },
    });
    try {
      const d = s.deviceToken(),
        a = await s.activate('LIVE-KEY-123456', 'individual', 'Live fixture', d);
      time = 1000;
      uncertain = true;
      await expect(s.authorized(a.token, d.token)).rejects.toMatchObject({
        code: 'provider_outage',
      });
      expect(s.db.prepare('SELECT status FROM licenses WHERE id=?').get(a.licenseId).status).toBe(
        'active',
      );
      uncertain = false;
      adverse = true;
      await expect(s.authorized(a.token, d.token)).rejects.toMatchObject({
        code: 'purchase_adverse',
      });
      expect(s.db.prepare('SELECT status FROM licenses WHERE id=?').get(a.licenseId).status).toBe(
        'revoked',
      );
    } finally {
      s.close();
    }
  });
});

describe('verification and token abuse resistance', () => {
  it('rejects signed device cookies with suffixes and noncanonical session tokens', async () => {
    const device = service.deviceToken();
    const activation = await service.activate(individual, 'individual', 'QA', device);
    for (const token of [
      device.token + '.extra',
      device.token + '\n',
      device.token.toUpperCase(),
    ]) {
      expect(service.deviceToken(token).token).not.toBe(token);
      await expect(service.authorized(activation.token, token)).rejects.toMatchObject({
        code: 'activation_required',
      });
    }
    for (const token of [
      activation.token + '.extra',
      'f'.repeat(100000),
      activation.token.toUpperCase(),
    ])
      await expect(service.authorized(token, device.token)).rejects.toMatchObject({
        code: 'activation_required',
      });
    expect(await service.authorized(activation.token, device.token)).toMatchObject({
      plan: 'individual',
    });
  });
  it('coalesces parallel activations while enforcing a bounded shared provider pool', async () => {
    service.close();
    let release!: () => void,
      calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    service = new LicenseService(
      { ...config, mode: 'live' },
      {
        verify: async (_config: any, key: string) => {
          calls++;
          await gate;
          return { purchaseId: key, adverse: false };
        },
      },
    );
    const sharedKey = 'LIVE-SHARED-SECURITY-TEST';
    const shared = Array.from({ length: 5 }, (_, index) =>
      service.activate(sharedKey, 'agency', `Device ${index}`, service.deviceToken()),
    );
    const unique = Array.from({ length: 7 }, (_, index) =>
      service.activate(
        `LIVE-UNIQUE-SECURITY-TEST-${index}`,
        'individual',
        'QA',
        service.deviceToken(),
      ),
    );
    try {
      await expect(
        service.activate('LIVE-OVERFLOW-SECURITY-TEST', 'individual', 'QA', service.deviceToken()),
      ).rejects.toMatchObject({ code: 'provider_busy', status: 503 });
      await Promise.resolve();
      expect(calls).toBe(8);
    } finally {
      release();
      await Promise.all([...shared, ...unique]);
    }
    expect(service.verificationFlights.size).toBe(0);
    expect(service.slots({ licenseId: service.licenseId(sharedKey, 'agency') })).toBe(5);
    await service.activate(
      'LIVE-RECOVERY-SECURITY-TEST',
      'individual',
      'QA',
      service.deviceToken(),
    );
    expect(calls).toBe(9);
  });
  it('checks each coalesced caller against its stored purchase identity', async () => {
    service.close();
    service = new LicenseService(
      { ...config, mode: 'live' },
      { verify: async () => ({ purchaseId: 'purchase-a', adverse: false }) },
    );
    const sharedKey = 'LIVE-IDENTITY-SECURITY-TEST';
    const [good, bad] = await Promise.allSettled([
      service.verifyPurchase(sharedKey, 'individual', 'purchase-a'),
      service.verifyPurchase(sharedKey, 'individual', 'purchase-b'),
    ]);
    expect(good.status).toBe('fulfilled');
    expect(bad.status).toBe('rejected');
    if (bad.status === 'rejected') expect(bad.reason.code).toBe('provider_mismatch');
  });
});

describe('checkout destination security', () => {
  it.each([
    ['https://studio.gumroad.com/l/individual', true],
    ['https://user:password@studio.gumroad.com/l/individual', false],
    ['https://studio.gumroad.com:8443/l/individual', false],
    ['https://gumroad.com.attacker.invalid/l/individual', false],
  ])('accepts only ordinary HTTPS Gumroad destinations: %s', (destination, accepted) => {
    const result = configuration({
      NODE_ENV: 'production',
      SCOPELEDGER_MODE: 'live',
      SCOPELEDGER_ORIGIN: 'https://scopeledger.site',
      SCOPELEDGER_DB_PATH: config.dbPath,
      SCOPELEDGER_SESSION_SECRET: config.secret,
      SCOPELEDGER_GUMROAD_SELLER_ID: 'security-synthetic-seller',
      SCOPELEDGER_GUMROAD_INDIVIDUAL_PRODUCT_ID: 'security-synthetic-individual',
      SCOPELEDGER_GUMROAD_AGENCY_PRODUCT_ID: 'security-synthetic-agency',
      SCOPELEDGER_SELLER_VERIFIED: 'true',
      SCOPELEDGER_PURCHASES_ENABLED: 'true',
      SCOPELEDGER_LAUNCH_APPROVED: 'true',
      SCOPELEDGER_INDIVIDUAL_CHECKOUT_URL: destination,
    });
    expect(result.configured).toBe(true);
    expect(Boolean(result.checkout.individual)).toBe(accepted);
  });
});

describe('storage and clock integrity', () => {
  it('rejects linked database files before SQLite can open them', async () => {
    const { symlink } = await import('node:fs/promises');
    const alias = join(directory, 'alias.sqlite');
    await symlink(config.dbPath, alias);
    expect(() => new LicenseService({ ...config, dbPath: alias })).toThrow('without aliases');
  });
  it('requires owner-only live storage directories', async () => {
    const { chmod } = await import('node:fs/promises');
    await chmod(directory, 0o755);
    expect(() => new LicenseService({ ...config, mode: 'live' })).toThrow('owner-only');
    await chmod(directory, 0o700);
  });
  it('revalidates future provider timestamps rather than extending their authorization cache', async () => {
    service.close();
    let adverse = false,
      checks = 0;
    service = new LicenseService(
      { ...config, mode: 'live' },
      {
        clock: () => 1000,
        verify: async () => {
          checks++;
          return { purchaseId: 'clock-test', adverse };
        },
      },
    );
    const device = service.deviceToken(),
      activated = await service.activate(
        'LIVE-CLOCK-INTEGRITY-TEST',
        'individual',
        'Clock test',
        device,
      );
    service.db.prepare('UPDATE licenses SET checked_at=?').run(9999999999999);
    adverse = true;
    await expect(service.authorized(activated.token, device.token)).rejects.toMatchObject({
      code: 'purchase_adverse',
    });
    expect(checks).toBe(2);
  });
});
