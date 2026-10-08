import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { configuration, LicenseService } from '../server/licensing.mjs';
import {
  generateRecoveryKey,
  encryptedBackup,
  encryptedRestore,
} from '../scripts/secure-backup.mjs';
import { rotateSecret } from '../scripts/rotate-secret.mjs';
import { parseEnv } from 'node:util';
import { revokeSessions } from '../scripts/revoke-sessions.mjs';
let root: string, service: any, db: string, env: string, keyPath: string, archive: string;
const purchaseKey = 'LOCAL-ENCRYPTED-RECOVERY-TEST';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'scopeledger-encrypted-recovery-'));
  db = join(root, 'licenses.sqlite');
  env = join(root, 'server.env');
  keyPath = join(root, 'recovery.key');
  archive = join(root, 'backup.slarchive');
  const secret = randomBytes(32).toString('hex');
  service = new LicenseService(
    configuration({
      NODE_ENV: 'development',
      SCOPELEDGER_MODE: 'local-test',
      SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
      SCOPELEDGER_DB_PATH: db,
      SCOPELEDGER_SESSION_SECRET: secret,
    }),
  );
  service.seedLocalKey(purchaseKey, 'agency');
  const device = service.deviceToken();
  await service.activate(purchaseKey, 'agency', 'Recovery test', device);
  await writeFile(
    env,
    `SCOPELEDGER_SESSION_SECRET=${secret}\nSCOPELEDGER_DB_PATH=${db}\nSCOPELEDGER_PURCHASES_ENABLED=true\nSCOPELEDGER_LAUNCH_APPROVED=true\n`,
    { mode: 0o600 },
  );
  await generateRecoveryKey(keyPath);
});
afterEach(async () => {
  service?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
describe('authenticated encrypted server recovery', () => {
  it('encrypts private snapshots, restores purchases with checkout closed, and invalidates old sessions', async () => {
    expect(await encryptedBackup(db, env, keyPath, archive)).toMatchObject({ encrypted: true });
    const bytes = await readFile(archive),
      text = await readFile(env, 'utf8'),
      key = await readFile(keyPath, 'utf8');
    expect(bytes.includes(Buffer.from(text))).toBe(false);
    expect(bytes.includes(Buffer.from(key.trim()))).toBe(false);
    expect(bytes.includes(Buffer.from(purchaseKey))).toBe(false);
    const recoveredDb = join(root, 'recovered.sqlite'),
      recoveredEnv = join(root, 'recovered.env');
    expect(await encryptedRestore(archive, keyPath, recoveredDb, recoveredEnv)).toMatchObject({
      sessionsInvalidated: true,
      purchasesEnabled: false,
    });
    const restored = new DatabaseSync(recoveredDb);
    try {
      expect(restored.prepare('SELECT count(*) AS n FROM licenses').get()?.n).toBe(1);
      expect(restored.prepare('SELECT count(*) AS n FROM sessions').get()?.n).toBe(0);
      expect(restored.prepare('SELECT count(*) AS n FROM devices WHERE active=1').get()?.n).toBe(0);
    } finally {
      restored.close();
    }
    expect(await readFile(recoveredEnv, 'utf8')).toContain('SCOPELEDGER_PURCHASES_ENABLED="false"');
    expect((await readdir(root)).some((name) => name.startsWith('.recovery-staging-'))).toBe(false);
  });
  it.each(['wrong key', 'ciphertext', 'header', 'truncated'])(
    'rejects %s without writing restored state',
    async (variant) => {
      await encryptedBackup(db, env, keyPath, archive);
      if (variant === 'wrong key') {
        await rm(keyPath);
        await generateRecoveryKey(keyPath);
      } else {
        let bytes = await readFile(archive);
        if (variant === 'truncated') bytes = bytes.subarray(0, 20);
        else bytes[variant === 'header' ? 0 : bytes.length - 1] ^= 1;
        await writeFile(archive, bytes);
      }
      await expect(
        encryptedRestore(archive, keyPath, join(root, 'never.sqlite'), join(root, 'never.env')),
      ).rejects.toThrow();
      expect(
        (await readdir(root)).filter(
          (name) => name.startsWith('never') || name.startsWith('.recovery-staging-'),
        ),
      ).toEqual([]);
    },
  );
  it('refuses reused destinations, insecure keys and key aliases', async () => {
    await encryptedBackup(db, env, keyPath, archive);
    await expect(encryptedBackup(db, env, keyPath, archive)).rejects.toThrow();
    await expect(encryptedRestore(archive, keyPath, db, env)).rejects.toThrow('unused');
    await chmod(keyPath, 0o644);
    await expect(encryptedBackup(db, env, keyPath, join(root, 'unsafe'))).rejects.toThrow(
      'mode 600',
    );
    await chmod(keyPath, 0o600);
    const alias = join(root, 'alias.key');
    await symlink(keyPath, alias);
    await expect(encryptedBackup(db, env, alias, join(root, 'aliased'))).rejects.toThrow();
  });
  it('revokes every stolen session atomically and records an operator audit', async () => {
    const device = service.deviceToken(),
      active = await service.activate(purchaseKey, 'agency', 'Incident test', device);
    await revokeSessions(
      db,
      'Test operator',
      'Security test invalidating old stolen session cookies',
    );
    await expect(service.authorized(active.token, device.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
    expect(service.db.prepare('SELECT count(*) AS n FROM sessions').get().n).toBe(0);
    expect(service.db.prepare('SELECT count(*) AS n FROM recovery_audit').get().n).toBe(1);
    const newSession = await service.activate(purchaseKey, 'agency', 'Reactivated', device);
    expect(await service.authorized(newSession.token, device.token)).toMatchObject({
      deviceLabel: 'Reactivated',
    });
  });
});

it('rotates the encryption/signing secret without losing entitlements or reviving old sessions', async () => {
  const oldEnvironment = await readFile(env, 'utf8');
  const device = service.deviceToken(),
    oldSession = await service.activate(purchaseKey, 'agency', 'Before rotation', device);
  const newDb = join(root, 'rotated.sqlite'),
    newEnv = join(root, 'rotated.env');
  expect(
    await rotateSecret(
      db,
      env,
      newDb,
      newEnv,
      'Test owner',
      'Security rehearsal rotating a compromised signing secret',
    ),
  ).toMatchObject({ originalPairPreserved: true, sessionsInvalidated: true });
  const values = parseEnv(await readFile(newEnv, 'utf8'));
  expect(
    values.SCOPELEDGER_SESSION_SECRET === parseEnv(oldEnvironment).SCOPELEDGER_SESSION_SECRET,
  ).toBe(false);
  expect(await readFile(env, 'utf8')).toBe(oldEnvironment);
  const rotated = new LicenseService({
    ...service.config,
    dbPath: newDb,
    secret: values.SCOPELEDGER_SESSION_SECRET,
  });
  try {
    await expect(rotated.authorized(oldSession.token, device.token)).rejects.toMatchObject({
      code: 'activation_required',
    });
    const currentDevice = rotated.deviceToken(),
      current = await rotated.activate(purchaseKey, 'agency', 'After rotation', currentDevice);
    expect(await rotated.authorized(current.token, currentDevice.token)).toMatchObject({
      deviceLabel: 'After rotation',
    });
    expect(rotated.db.prepare('SELECT count(*) AS n FROM licenses').get().n).toBe(1);
  } finally {
    rotated.close();
  }
});
