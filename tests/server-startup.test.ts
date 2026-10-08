import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
function launch(env: Record<string, string>) {
  const result = spawnSync(process.execPath, ['scripts/serve.mjs'], {
    encoding: 'utf8',
    timeout: 10000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: '0', ...env },
  });
  expect(result.status).not.toBe(0);
  expect(result.error).toBeUndefined();
  expect(result.stdout).not.toContain('ScopeLedger home');
  return result.stderr;
}
describe('production entry-point fail-closed gates', () => {
  it('requires production settings for a live server', () => {
    expect(launch({ NODE_ENV: 'development', SCOPELEDGER_MODE: 'live' })).toContain(
      'NODE_ENV=production',
    );
  });
  it('never boots local test licensing in production', () => {
    const error = launch({ NODE_ENV: 'production', SCOPELEDGER_MODE: 'local-test' });
    expect(error).toMatch(/cannot start|non-root/);
  });
  it('rejects incomplete live configuration before accepting connections', () => {
    expect(launch({ NODE_ENV: 'production', SCOPELEDGER_MODE: 'live' })).toMatch(
      /complete seller configuration|non-root/,
    );
  });
  it.skipIf(process.getuid?.() === 0)(
    'rejects an unusable sandbox runtime without disclosing the signing secret',
    async () => {
      root = await mkdtemp(join(tmpdir(), 'scopeledger-startup-gate-'));
      const secret = randomBytes(32).toString('hex');
      const error = launch({
        NODE_ENV: 'production',
        SCOPELEDGER_MODE: 'live',
        SCOPELEDGER_ORIGIN: 'https://scopeledger.site',
        SCOPELEDGER_DB_PATH: join(root, 'qa.sqlite'),
        SCOPELEDGER_SESSION_SECRET: secret,
        SCOPELEDGER_GUMROAD_SELLER_ID: 'synthetic-startup-seller',
        SCOPELEDGER_GUMROAD_INDIVIDUAL_PRODUCT_ID: 'synthetic-individual',
        SCOPELEDGER_GUMROAD_AGENCY_PRODUCT_ID: 'synthetic-agency',
        SCOPELEDGER_SELLER_VERIFIED: 'true',
        SCOPELEDGER_CHROME_PATH: '/usr/bin/false',
      });
      expect(error).toContain('working sandboxed renderer');
      expect(error).not.toContain(secret);
    },
  );
});
