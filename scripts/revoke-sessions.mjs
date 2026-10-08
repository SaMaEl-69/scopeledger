import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateFile } from './server-backup.mjs';
export async function revokeSessions(path, operator, reason) {
  if (
    typeof operator !== 'string' ||
    !operator.trim() ||
    operator.length > 200 ||
    typeof reason !== 'string' ||
    reason.trim().length < 20 ||
    reason.length > 2000
  )
    throw new Error('Supply an operator and incident reason.');
  await privateFile(path, false);
  const db = new DatabaseSync(path);
  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM sessions').run();
    db.prepare('UPDATE devices SET active=0,updated_at=?').run(Date.now());
    db.prepare('INSERT INTO recovery_audit VALUES(?,?,?,?,?,?)').run(
      randomBytes(16).toString('hex'),
      '*',
      '*',
      Date.now(),
      operator,
      `Session revocation: ${reason}`,
    );
    db.exec('COMMIT');
    return { status: 'sessions_revoked', requiresReactivation: true };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [database, operator, reason] = process.argv.slice(2);
    console.log(JSON.stringify(await revokeSessions(database, operator, reason)));
  } catch {
    console.error(
      'Session revocation failed. Check private storage, operator identity and incident reason. No records or secrets are logged.',
    );
    process.exitCode = 1;
  }
}
