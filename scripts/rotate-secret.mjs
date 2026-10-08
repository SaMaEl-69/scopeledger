import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, readFile, chmod, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { LicenseService } from '../server/licensing.mjs';
import { backupServer, privateTarget, privateWrite } from './server-backup.mjs';
export async function rotateSecret(
  database,
  environment,
  newDatabase,
  newEnvironment,
  operator,
  reason,
) {
  if (
    typeof operator !== 'string' ||
    !operator.trim() ||
    operator.length > 200 ||
    typeof reason !== 'string' ||
    reason.trim().length < 20 ||
    reason.length > 2000
  )
    throw new Error('Provide operator and incident reason.');
  const targetDb = await privateTarget(newDatabase),
    targetEnv = await privateTarget(newEnvironment);
  if (targetDb === targetEnv) throw new Error('New destinations must differ.');
  const temporary = await mkdtemp(
    join(dirname(await privateTarget(database)), '.recovery-staging-'),
  );
  let db,
    copied = false,
    wrote = false;
  try {
    const bundle = join(temporary, 'bundle');
    await backupServer(database, environment, bundle);
    const values = parseEnv(await readFile(join(bundle, 'server.env'), 'utf8'));
    const oldSecret = values.SCOPELEDGER_SESSION_SECRET,
      freshSecret = randomBytes(32).toString('hex');
    const oldCrypto = { config: { secret: oldSecret } },
      newCrypto = { config: { secret: freshSecret } };
    const path = join(bundle, 'licenses.sqlite');
    db = new DatabaseSync(path);
    db.exec('BEGIN IMMEDIATE');
    for (const row of db.prepare('SELECT * FROM licenses').all()) {
      const key = LicenseService.prototype.decrypt.call(oldCrypto, row.key_cipher);
      const identity = 'license:' + row.seller_id + ':' + row.product_id + ':' + key;
      if (LicenseService.prototype.hash.call(oldCrypto, identity) !== row.id)
        throw new Error('Stored license identity is inconsistent.');
      const newId = LicenseService.prototype.hash.call(newCrypto, identity);
      db.prepare('UPDATE licenses SET id=?,key_cipher=?,checked_at=0 WHERE id=?').run(
        newId,
        LicenseService.prototype.encrypt.call(newCrypto, key),
        row.id,
      );
      db.prepare('UPDATE devices SET license_id=? WHERE license_id=?').run(newId, row.id);
      db.prepare('UPDATE recovery_audit SET license_id=? WHERE license_id=?').run(newId, row.id);
      for (const quota of db
        .prepare(
          'SELECT subject,operation,window FROM quotas WHERE subject=? OR substr(subject,1,?)=?',
        )
        .all(row.id, row.id.length + 1, row.id + ':')) {
        db.prepare('UPDATE quotas SET subject=? WHERE subject=? AND operation=? AND window=?').run(
          newId + quota.subject.slice(row.id.length),
          quota.subject,
          quota.operation,
          quota.window,
        );
      }
    }
    db.exec('DELETE FROM sessions; UPDATE devices SET active=0;');
    db.prepare('INSERT INTO recovery_audit VALUES(?,?,?,?,?,?)').run(
      randomBytes(16).toString('hex'),
      '*',
      '*',
      Date.now(),
      operator,
      'Secret rotation: ' + reason,
    );
    db.exec('COMMIT');
    db.close();
    db = null;
    values.SCOPELEDGER_SESSION_SECRET = freshSecret;
    values.SCOPELEDGER_DB_PATH = targetDb;
    values.SCOPELEDGER_PURCHASES_ENABLED = 'false';
    values.SCOPELEDGER_LAUNCH_APPROVED = 'false';
    if (Object.values(values).some((value) => /[\r\n"\\]/.test(value)))
      throw new Error('Environment needs manual formatting.');
    await copyFile(path, targetDb, constants.COPYFILE_EXCL);
    copied = true;
    await chmod(targetDb, 0o600);
    await privateWrite(
      targetEnv,
      Object.entries(values)
        .map(([name, value]) => name + '="' + value + '"')
        .join('\n') + '\n',
    );
    wrote = true;
    await backupServer(targetDb, targetEnv, join(temporary, 'verification'));
    return {
      status: 'secret_rotated',
      sessionsInvalidated: true,
      purchasesEnabled: false,
      originalPairPreserved: true,
    };
  } catch (error) {
    try {
      db?.exec('ROLLBACK');
    } catch {}
    db?.close();
    db = null;
    if (copied) await rm(targetDb, { force: true });
    if (wrote) await rm(targetEnv, { force: true });
    throw error;
  } finally {
    db?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6) throw new Error('Invalid arguments.');
    console.log(JSON.stringify(await rotateSecret(...args)));
  } catch {
    console.error(
      'Secret rotation failed. Check trusted private inputs, new unused destinations and an operator reason. No secret material is logged.',
    );
    process.exitCode = 1;
  }
}
