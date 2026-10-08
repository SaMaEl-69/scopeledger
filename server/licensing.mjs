import { DatabaseSync } from 'node:sqlite';
import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export class ServiceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const bad = (code, message, status = 400) => {
  throw new ServiceError(code, message, status);
};
export const loopback = (host) =>
  ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(host);
export function configuration(env = process.env) {
  const mode = env.SCOPELEDGER_MODE ?? 'demo';
  const origin = env.SCOPELEDGER_ORIGIN ?? 'http://127.0.0.1:5173';
  const base = {
    mode: 'demo',
    configured: false,
    origin,
    checkout: { individual: null, agency: null },
    message:
      'Purchases and activation are unavailable until seller setup and server licensing are configured.',
    logEvents: env.SCOPELEDGER_LOG_EVENTS === 'true',
    trustLoopbackProxy: false,
  };
  if (mode === 'demo') return base;
  if (
    env.SCOPELEDGER_TRUST_LOOPBACK_PROXY !== undefined &&
    !['true', 'false'].includes(env.SCOPELEDGER_TRUST_LOOPBACK_PROXY)
  )
    return {
      ...base,
      message: 'SCOPELEDGER_TRUST_LOOPBACK_PROXY must be true or false.',
    };
  let url;
  try {
    url = new URL(origin);
  } catch {
    return { ...base, message: 'Server origin configuration is invalid.' };
  }
  const secret = env.SCOPELEDGER_SESSION_SECRET;
  if (!/^[a-f0-9]{64}$/i.test(secret ?? '') || !env.SCOPELEDGER_DB_PATH || url.origin !== origin)
    return {
      ...base,
      message:
        'Configure a persistent database, canonical origin, and 32-byte hexadecimal session secret.',
    };
  if (mode === 'local-test') {
    if (env.SCOPELEDGER_TRUST_LOOPBACK_PROXY === 'true')
      return {
        ...base,
        message:
          'Trusted proxy identity is available only in live mode. Local testing uses direct loopback connections.',
      };
    if (env.NODE_ENV !== 'development' || !loopback(url.hostname) || url.protocol !== 'http:')
      return {
        ...base,
        message:
          'Local test mode requires development and a loopback HTTP origin. It cannot run in production.',
      };
    return {
      ...base,
      configured: true,
      mode,
      secret,
      dbPath: resolve(env.SCOPELEDGER_DB_PATH),
      secure: false,
      sellerId: 'local-test-owner',
      products: { individual: 'local-individual', agency: 'local-agency' },
      ttlMs: 300000,
      message: 'LOCAL TEST MODE — generated development keys only; no verified purchase.',
    };
  }
  const sellerId = env.SCOPELEDGER_GUMROAD_SELLER_ID,
    individual = env.SCOPELEDGER_GUMROAD_INDIVIDUAL_PRODUCT_ID,
    agency = env.SCOPELEDGER_GUMROAD_AGENCY_PRODUCT_ID;
  if (
    mode !== 'live' ||
    url.protocol !== 'https:' ||
    !sellerId ||
    !individual ||
    !agency ||
    individual === agency ||
    env.SCOPELEDGER_SELLER_VERIFIED !== 'true'
  )
    return {
      ...base,
      message:
        'Live verification needs HTTPS, distinct Gumroad products, matching seller identity and verified seller onboarding.',
    };
  const checkout = { individual: null, agency: null };
  if (env.SCOPELEDGER_PURCHASES_ENABLED === 'true' && env.SCOPELEDGER_LAUNCH_APPROVED === 'true')
    for (const plan of ['individual', 'agency']) {
      try {
        const checkoutUrl = new URL(env[`SCOPELEDGER_${plan.toUpperCase()}_CHECKOUT_URL`]);
        if (
          checkoutUrl.protocol === 'https:' &&
          !checkoutUrl.username &&
          !checkoutUrl.password &&
          !checkoutUrl.port &&
          (checkoutUrl.hostname === 'gumroad.com' || checkoutUrl.hostname.endsWith('.gumroad.com'))
        )
          checkout[plan] = checkoutUrl.href;
      } catch {
        /* Checkout remains unavailable. */
      }
    }
  return {
    ...base,
    mode,
    configured: true,
    secret,
    dbPath: resolve(env.SCOPELEDGER_DB_PATH),
    secure: true,
    trustLoopbackProxy: env.SCOPELEDGER_TRUST_LOOPBACK_PROXY === 'true',
    sellerId,
    products: { individual, agency },
    checkout,
    ttlMs: 300000,
    message:
      'Gumroad license verification configured. Local project data is independent on each browser.',
  };
}

async function boundedProviderBody(response) {
  const maximum = 100000;
  const advertised = Number(response.headers?.get('content-length'));
  if (Number.isFinite(advertised) && advertised > maximum) {
    await response.body?.cancel().catch(() => {});
    bad('provider_malformed', 'Gumroad returned an oversized response.', 503);
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maximum)
      bad('provider_malformed', 'Gumroad returned an oversized response.', 503);
    return text;
  }
  const reader = response.body.getReader();
  const parts = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        await reader.cancel().catch(() => {});
        bad('provider_malformed', 'Gumroad returned an oversized response.', 503);
      }
      parts.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
  } finally {
    reader.releaseLock();
  }
}

export async function gumroadVerify(
  config,
  key,
  plan,
  { fetcher = fetch, expectedPurchaseId, timeoutMs = 8000, checkingOther = false } = {},
) {
  let response, payload;
  try {
    response = await fetcher('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: config.products[plan],
        license_key: key,
        increment_uses_count: 'false',
      }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
  } catch (error) {
    bad(
      error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'provider_timeout'
        : 'provider_outage',
      'Gumroad verification is temporarily unavailable. Your entitlement records are preserved; retry later.',
      503,
    );
  }
  if (response.status === 429 || response.status >= 500)
    bad(
      'provider_outage',
      'Gumroad is temporarily unavailable. Retry later; existing records are preserved.',
      503,
    );
  try {
    const text = await boundedProviderBody(response);
    payload = JSON.parse(text);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
      bad(
        'provider_timeout',
        'Gumroad verification timed out. Existing entitlement records are preserved; retry later.',
        503,
      );
    bad(
      'provider_malformed',
      'Gumroad returned an unexpected response. Retry or contact support.',
      503,
    );
  }
  if (!payload || typeof payload.success !== 'boolean')
    bad('provider_malformed', 'Gumroad returned an unexpected verification response.', 503);
  if (payload.success === false) {
    if (!checkingOther && !expectedPurchaseId) {
      let other;
      try {
        other = await gumroadVerify(config, key, plan === 'individual' ? 'agency' : 'individual', {
          fetcher,
          timeoutMs,
          checkingOther: true,
        });
      } catch (error) {
        if (!(error instanceof ServiceError) || error.code !== 'invalid_key') throw error;
      }
      if (other)
        bad(
          'wrong_plan',
          'This key belongs to the other plan. Select the matching plan and retry.',
          422,
        );
    }
    bad(
      'invalid_key',
      'The key was not verified for either plan. Check the key; no existing entitlement is revoked.',
      422,
    );
  }
  const p = payload.purchase;
  if (!response.ok || !p || typeof p !== 'object')
    bad('provider_malformed', 'Gumroad did not supply a verified purchase.', 503);
  if (p.product_id !== config.products[plan])
    bad('wrong_plan', 'The verified key does not match the selected plan.', 422);
  if (p.seller_id !== config.sellerId || p.license_key !== key)
    bad(
      'provider_mismatch',
      'Purchase identity does not match this seller and key. Existing records are preserved.',
      503,
    );
  const purchaseId = p.id ?? p.sale_id;
  if (
    typeof purchaseId !== 'string' ||
    !purchaseId ||
    (p.id && p.sale_id && p.id !== p.sale_id) ||
    (expectedPurchaseId && expectedPurchaseId !== purchaseId)
  )
    bad(
      'provider_mismatch',
      'Purchase identity could not be matched. Existing entitlement remains recorded.',
      503,
    );
  if (
    p.test !== false ||
    typeof p.refunded !== 'boolean' ||
    typeof p.disputed !== 'boolean' ||
    typeof p.dispute_won !== 'boolean' ||
    (p.chargebacked !== undefined && typeof p.chargebacked !== 'boolean')
  )
    bad(
      'provider_malformed',
      'Purchase status is uncertain or a provider test sale; protected actions remain unavailable.',
      503,
    );
  return {
    purchaseId,
    adverse:
      p.refunded === true ||
      p.chargebacked === true ||
      (p.disputed === true && p.dispute_won !== true),
  };
}

export class LicenseService {
  constructor(config, { verify = gumroadVerify, clock = () => Date.now() } = {}) {
    this.config = config;
    this.verify = verify;
    this.clock = clock;
    this.checks = new Map();
    this.verificationFlights = new Map();
    if (!config.configured) return;
    try {
      mkdirSync(dirname(config.dbPath), { recursive: true, mode: 0o700 });
      this.db = new DatabaseSync(config.dbPath);
      chmodSync(config.dbPath, 0o600);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS licenses(id TEXT PRIMARY KEY,plan TEXT NOT NULL,purchase_id TEXT NOT NULL,seller_id TEXT NOT NULL,product_id TEXT NOT NULL,key_cipher TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,checked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices(license_id TEXT NOT NULL,device_id TEXT NOT NULL,label TEXT NOT NULL,active INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(license_id,device_id));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,license_id TEXT NOT NULL,device_id TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS quotas(subject TEXT NOT NULL,operation TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(subject,operation,window));
    CREATE TABLE IF NOT EXISTS recovery_audit(id TEXT PRIMARY KEY,license_id TEXT NOT NULL,device_id TEXT NOT NULL,at INTEGER NOT NULL,operator TEXT NOT NULL,evidence TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS quotas_retention ON quotas(operation,window);`);
    } catch (error) {
      try {
        this.db?.close();
      } catch {}
      this.db = undefined;
      throw error;
    }
  }
  hash(value) {
    return createHmac('sha256', Buffer.from(this.config.secret, 'hex')).update(value).digest('hex');
  }
  encrypt(key) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(this.config.secret, 'hex'), iv);
    const text = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    return [iv.toString('hex'), text.toString('hex'), cipher.getAuthTag().toString('hex')].join(
      '.',
    );
  }
  decrypt(value) {
    const [iv, text, tag] = value.split('.');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.config.secret, 'hex'),
      Buffer.from(iv, 'hex'),
    );
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([cipher.update(Buffer.from(text, 'hex')), cipher.final()]).toString(
      'utf8',
    );
  }
  transaction(fn) {
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      if (error instanceof ServiceError) throw error;
      bad(
        'license_storage_failed',
        'License state could not be saved. Retry or contact support; no activation success is claimed.',
        503,
      );
    }
  }
  licenseId(key, plan) {
    return this.hash(`license:${this.config.sellerId}:${this.config.products[plan]}:${key}`);
  }
  deviceToken(existing) {
    if (
      typeof existing === 'string' &&
      existing.length === 129 &&
      /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(existing)
    ) {
      const [device, signature] = existing.split('.');
      if (
        /^[a-f0-9]{64}$/.test(device ?? '') &&
        /^[a-f0-9]{64}$/.test(signature ?? '') &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(this.hash(`device:${device}`)))
      )
        return { id: device, token: existing };
    }
    const device = randomBytes(32).toString('hex');
    return { id: device, token: `${device}.${this.hash(`device:${device}`)}` };
  }
  async verifyPurchase(key, plan, expectedPurchaseId) {
    const id = this.licenseId(key, plan);
    let flight = this.verificationFlights.get(id);
    if (!flight) {
      if (this.verificationFlights.size >= 8)
        bad('provider_busy', 'Purchase verification is busy. Retry shortly.', 503);
      flight = Promise.resolve()
        .then(() => this.verify(this.config, key, plan, { expectedPurchaseId }))
        .finally(() => this.verificationFlights.delete(id));
      this.verificationFlights.set(id, flight);
    }
    const verified = await flight;
    // A coalesced caller must still match its own stored purchase identity.
    if (expectedPurchaseId && verified.purchaseId !== expectedPurchaseId)
      bad('provider_mismatch', 'Stored purchase identity does not match verification.', 503);
    return verified;
  }
  quota(subject, operation, limit, windowMs = 86400000) {
    return this.quotaBatch([{ subject, operation, limit, windowMs }]);
  }
  quotaBatch(limits) {
    this.pruneExpired();
    const now = this.clock();
    this.transaction(() => {
      for (const { subject, operation, limit, windowMs = 86400000 } of limits) {
        const window = Math.floor(now / windowMs);
        const record = this.db
          .prepare('SELECT count FROM quotas WHERE subject=? AND operation=? AND window=?')
          .get(subject, operation, window);
        if ((record?.count ?? 0) >= limit)
          bad('rate_limited', 'The request allowance has been reached. Wait before retrying.', 429);
        this.db
          .prepare(
            'INSERT INTO quotas VALUES(?,?,?,1) ON CONFLICT(subject,operation,window) DO UPDATE SET count=count+1',
          )
          .run(subject, operation, window);
      }
    });
  }
  async activate(key, plan, label, device) {
    if (
      !['individual', 'agency'].includes(plan) ||
      typeof key !== 'string' ||
      key.length < 12 ||
      key.length > 200 ||
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 80
    )
      bad('invalid_input', 'Enter a key, the matching plan, and a browser/device label.');
    const licenseId = this.licenseId(key, plan);
    const old = this.db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
    let checked;
    if (this.config.mode === 'local-test') {
      if (!old || old.mode !== 'local-test') {
        const other = this.db
          .prepare('SELECT mode FROM licenses WHERE id=?')
          .get(this.licenseId(key, plan === 'individual' ? 'agency' : 'individual'));
        if (other?.mode === 'local-test')
          bad(
            'wrong_plan',
            'This local key belongs to the other plan. Select the matching plan.',
            422,
          );
        bad('invalid_key', 'Use a generated local development key for this plan.', 422);
      }
      checked = { purchaseId: old.purchase_id, adverse: false };
    } else checked = await this.verifyPurchase(key, plan, old?.purchase_id);
    if (checked.adverse) {
      this.transaction(() =>
        this.db
          .prepare(
            "INSERT INTO licenses VALUES(?,?,?,?,?,?,?,'revoked',?) ON CONFLICT(id) DO UPDATE SET status='revoked',checked_at=excluded.checked_at",
          )
          .run(
            licenseId,
            plan,
            checked.purchaseId,
            this.config.sellerId,
            this.config.products[plan],
            this.encrypt(key),
            this.config.mode,
            this.clock(),
          ),
      );
      bad(
        'purchase_adverse',
        'A matching refund, chargeback or unresolved dispute was confirmed. Contact lifetime support.',
        403,
      );
    }
    const token = randomBytes(32).toString('hex');
    this.transaction(() => {
      const latest = this.db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
      if (latest && (latest.purchase_id !== checked.purchaseId || latest.plan !== plan))
        bad('provider_mismatch', 'Stored purchase identity does not match verification.', 503);
      const existing = this.db
        .prepare('SELECT active FROM devices WHERE license_id=? AND device_id=?')
        .get(licenseId, device.id);
      const count = this.db
        .prepare('SELECT COUNT(*) AS count FROM devices WHERE license_id=? AND active=1')
        .get(licenseId).count;
      if (!existing?.active && count >= (plan === 'individual' ? 1 : 5))
        bad(
          'capacity_full',
          'All browser/device slots are in use. Release this browser or ask the seller for lost-device recovery with verified purchase ownership.',
          409,
        );
      this.db
        .prepare(
          "INSERT INTO licenses VALUES(?,?,?,?,?,?,?,'active',?) ON CONFLICT(id) DO UPDATE SET status='active',checked_at=excluded.checked_at",
        )
        .run(
          licenseId,
          plan,
          checked.purchaseId,
          this.config.sellerId,
          this.config.products[plan],
          this.encrypt(key),
          this.config.mode,
          this.clock(),
        );
      this.db
        .prepare(
          'INSERT INTO devices VALUES(?,?,?,1,?) ON CONFLICT(license_id,device_id) DO UPDATE SET label=excluded.label,active=1,updated_at=excluded.updated_at',
        )
        .run(licenseId, device.id, label.trim(), this.clock());
      this.db
        .prepare('DELETE FROM sessions WHERE license_id=? AND device_id=?')
        .run(licenseId, device.id);
      this.db
        .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .run(this.hash(`session:${token}`), licenseId, device.id, this.clock() + 1209600000);
    });
    return { token, licenseId, deviceId: device.id };
  }
  async authorized(token, deviceToken, { releaseOnly = false } = {}) {
    if (
      typeof token !== 'string' ||
      token.length !== 64 ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !deviceToken
    )
      bad('activation_required', 'Activate this browser/device to use paid actions.', 401);
    const device = this.deviceToken(deviceToken);
    if (device.token !== deviceToken)
      bad('activation_required', 'The browser session is invalid. Activate again.', 401);
    const row = this.db
      .prepare(
        `SELECT l.*,s.device_id,s.expires,d.label,d.active FROM sessions s JOIN licenses l ON l.id=s.license_id JOIN devices d ON d.license_id=l.id AND d.device_id=s.device_id WHERE s.token_hash=?`,
      )
      .get(this.hash(`session:${token}`));
    if (!row || row.expires <= this.clock() || row.device_id !== device.id || !row.active)
      bad(
        'activation_required',
        'This activation session is expired or released. Activate again.',
        401,
      );
    if (!releaseOnly && row.status !== 'active')
      bad(
        'purchase_adverse',
        'This purchase has a confirmed adverse status. Contact support.',
        403,
      );
    if (row.mode !== this.config.mode)
      bad('activation_required', 'This activation belongs to a different server mode.', 401);
    if (row.seller_id !== this.config.sellerId || row.product_id !== this.config.products[row.plan])
      bad(
        'activation_required',
        'This activation belongs to a different configured seller or product. Activate the matching purchase again.',
        401,
      );
    if (!releaseOnly && row.mode === 'live' && this.clock() - row.checked_at > this.config.ttlMs) {
      let check = this.checks.get(row.id);
      if (!check) {
        check = (async () => {
          const verification = await this.verifyPurchase(
            this.decrypt(row.key_cipher),
            row.plan,
            row.purchase_id,
          );
          this.transaction(() =>
            this.db
              .prepare('UPDATE licenses SET status=?,checked_at=? WHERE id=?')
              .run(verification.adverse ? 'revoked' : 'active', this.clock(), row.id),
          );
          if (verification.adverse)
            bad('purchase_adverse', 'A matching adverse purchase status was confirmed.', 403);
        })().finally(() => this.checks.delete(row.id));
        this.checks.set(row.id, check);
      }
      await check;
    }
    // Re-read the session as well as the device after asynchronous verification.
    // A same-device reactivation keeps the device active while rotating its
    // session, and an expiring request must not outlive its authorization.
    const current = this.db
      .prepare(
        `SELECT l.status,l.mode,l.seller_id,l.product_id,l.plan,s.device_id,s.expires,d.label,d.active FROM sessions s JOIN licenses l ON l.id=s.license_id JOIN devices d ON d.license_id=l.id AND d.device_id=s.device_id WHERE s.token_hash=? AND l.id=?`,
      )
      .get(this.hash(`session:${token}`), row.id);
    if (
      !current ||
      !current.active ||
      current.expires <= this.clock() ||
      current.device_id !== device.id ||
      current.mode !== this.config.mode ||
      current.seller_id !== this.config.sellerId ||
      current.product_id !== this.config.products[current.plan]
    )
      bad(
        'activation_required',
        'This activation session is expired, replaced or released. Activate again.',
        401,
      );
    if (!releaseOnly && current.status !== 'active')
      bad(
        'purchase_adverse',
        'This purchase has a confirmed adverse status. Contact support.',
        403,
      );
    return {
      licenseId: row.id,
      deviceId: current.device_id,
      plan: current.plan,
      deviceLabel: current.label,
    };
  }
  release(identity) {
    this.transaction(() => {
      this.db
        .prepare('UPDATE devices SET active=0,updated_at=? WHERE license_id=? AND device_id=?')
        .run(this.clock(), identity.licenseId, identity.deviceId);
      this.db
        .prepare('DELETE FROM sessions WHERE license_id=? AND device_id=?')
        .run(identity.licenseId, identity.deviceId);
    });
  }
  slots(identity) {
    return this.db
      .prepare('SELECT COUNT(*) AS count FROM devices WHERE license_id=? AND active=1')
      .get(identity.licenseId).count;
  }
  seedLocalKey(key, plan) {
    if (this.config.mode !== 'local-test')
      bad('test_disabled', 'Local key generation is unavailable in this mode.', 403);
    const licenseId = this.licenseId(key, plan);
    this.transaction(() =>
      this.db
        .prepare("INSERT INTO licenses VALUES(?,?,?,?,?,?,?,'active',?)")
        .run(
          licenseId,
          plan,
          randomBytes(18).toString('hex'),
          this.config.sellerId,
          this.config.products[plan],
          this.encrypt(key),
          'local-test',
          this.clock(),
        ),
    );
    return licenseId;
  }
  recoverDevice({ licenseId, deviceId, operator, evidence }) {
    if (
      typeof operator !== 'string' ||
      typeof evidence !== 'string' ||
      !operator.trim() ||
      operator.length > 200 ||
      evidence.trim().length < 30 ||
      evidence.length > 10000
    )
      bad(
        'ownership_evidence_required',
        'Provide operator identity and independent verified purchase-ownership evidence. A shared key is insufficient.',
      );
    this.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM devices WHERE license_id=? AND device_id=?')
        .get(licenseId, deviceId);
      if (!row) bad('device_not_found', 'The requested activation could not be found.');
      this.db
        .prepare('UPDATE devices SET active=0,updated_at=? WHERE license_id=? AND device_id=?')
        .run(this.clock(), licenseId, deviceId);
      this.db
        .prepare('DELETE FROM sessions WHERE license_id=? AND device_id=?')
        .run(licenseId, deviceId);
      this.db
        .prepare('INSERT INTO recovery_audit VALUES(?,?,?,?,?,?)')
        .run(
          randomBytes(16).toString('hex'),
          licenseId,
          deviceId,
          this.clock(),
          operator,
          evidence,
        );
    });
  }
  close() {
    const database = this.db;
    this.db = undefined;
    database?.close();
  }
  /** Only known expired quota windows and sessions; never remove entitlements or recovery evidence. */
  pruneExpired() {
    const now = this.clock();
    if (this.lastPruned !== undefined && now - this.lastPruned < 3600000) return;
    this.transaction(() => {
      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
      this.db
        .prepare("DELETE FROM quotas WHERE operation = 'activate' AND window < ?")
        .run(Math.floor(now / 3600000));
      this.db
        .prepare(
          "DELETE FROM quotas WHERE operation IN ('pdf-license', 'pdf-device', 'projects') AND window < ?",
        )
        .run(Math.floor(now / 86400000));
    });
    this.lastPruned = now;
  }
}
