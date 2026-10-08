import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateRecoveryEvidence } from '../server/recovery.mjs';
import { configuration, LicenseService } from '../server/licensing.mjs';

const valid = () => ({
  licenseId: '1'.repeat(64),
  deviceId: '2'.repeat(64),
  operator: 'Verified seller operator',
  purchaseOwnershipVerified: true,
  independentReceiptReference: 'Receipt independently matched in seller dashboard',
  verificationChannel: 'Authenticated purchaser email',
  evidence: 'The purchaser independently identified the lost browser.',
});
const sentinel = 'PRIVATE RECEIPT CONTENT MUST NEVER APPEAR IN ERRORS';
let directory: string | undefined;
let service: LicenseService | undefined;
afterEach(async () => {
  service?.close();
  service = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
function run(path: string, dbPath: string) {
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../scripts/recover-device.mjs', import.meta.url)), path],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        SCOPELEDGER_MODE: 'local-test',
        SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
        SCOPELEDGER_DB_PATH: dbPath,
        SCOPELEDGER_SESSION_SECRET: '55'.repeat(32),
        SCOPELEDGER_ADMIN_RECOVERY: 'enabled',
      },
    },
  );
}
describe('trusted owner recovery evidence and actual CLI', () => {
  it('rejects malformed shapes, coerced fields, oversized text and shared-key-only evidence', () => {
    const badInputs = [
      null,
      [],
      'receipt',
      { ...valid(), operator: { private: sentinel } },
      { ...valid(), independentReceiptReference: { private: sentinel } },
      { ...valid(), verificationChannel: [sentinel] },
      { ...valid(), licenseId: [valid().licenseId] },
      { ...valid(), deviceId: 'not a device' },
      { ...valid(), purchaseOwnershipVerified: 'true' },
      { ...valid(), independentReceiptReference: ' ' },
      { ...valid(), verificationChannel: ' Shared_Key ' },
      { ...valid(), operator: 'x'.repeat(201) },
      { ...valid(), independentReceiptReference: 'x'.repeat(1001) },
      { ...valid(), evidence: 'x'.repeat(10000) },
      { ...valid(), evidence: null },
      { ...valid(), privateNotes: sentinel },
    ];
    for (const input of badInputs) {
      let message = '';
      try {
        validateRecoveryEvidence(input);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('independently verified purchase ownership');
      expect(message).not.toContain(sentinel);
      expect(message).not.toContain('[object Object]');
    }
  });
  it('rejects valid null/non-string JSON before opening storage with a sanitized useful CLI error', async () => {
    directory = await mkdtemp(join(tmpdir(), 'scopeledger-recovery-input-'));
    const dbPath = join(directory, 'never-opened.sqlite');
    const path = join(directory, 'evidence.json');
    for (const input of [
      null,
      { ...valid(), independentReceiptReference: { private: sentinel } },
    ]) {
      await writeFile(path, JSON.stringify(input), { mode: 0o600 });
      const result = run(path, dbPath);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('independently verified purchase ownership');
      expect(result.stderr).not.toContain(sentinel);
      expect(result.stderr).not.toContain('TypeError');
      expect(result.stdout).not.toContain('Selected activation released');
      await expect(access(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
  it('releases only the verified device and records independent evidence through the real local CLI', async () => {
    directory = await mkdtemp(join(tmpdir(), 'scopeledger-recovery-success-'));
    const dbPath = join(directory, 'licenses.sqlite');
    const config = configuration({
      NODE_ENV: 'development',
      SCOPELEDGER_MODE: 'local-test',
      SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
      SCOPELEDGER_DB_PATH: dbPath,
      SCOPELEDGER_SESSION_SECRET: '55'.repeat(32),
    });
    service = new LicenseService(config);
    const key = 'LOCAL-RECOVERY-AGENCY-FIXTURE-KEY';
    service.seedLocalKey(key, 'agency');
    const lost = service.deviceToken(),
      other = service.deviceToken();
    const allocation = await service.activate(key, 'agency', 'Lost fixture browser', lost);
    const retained = await service.activate(key, 'agency', 'Retained fixture browser', other);
    const evidence = { ...valid(), licenseId: allocation.licenseId, deviceId: lost.id };
    const path = join(directory, 'evidence.json');
    await writeFile(path, JSON.stringify(evidence), { mode: 0o600 });
    const result = run(path, dbPath);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Selected activation released. Recovery audit recorded');
    expect(result.stdout + result.stderr).not.toContain(key);
    await expect(service.authorized(allocation.token, lost.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
    expect(await service.authorized(retained.token, other.token)).toMatchObject({
      deviceLabel: 'Retained fixture browser',
    });
    const audit = service.db.prepare('SELECT * FROM recovery_audit').all();
    expect(audit).toHaveLength(1);
    expect(audit[0].device_id).toBe(lost.id);
    expect(audit[0].evidence).toContain(evidence.independentReceiptReference);
    expect(audit[0].evidence).toContain(evidence.verificationChannel);
  });
});
