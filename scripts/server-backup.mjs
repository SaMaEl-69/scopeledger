import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, createHmac, createDecipheriv } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  chmod,
  lstat,
  realpath,
  copyFile,
  rm,
  open,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function privateWrite(path, bytes) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } catch (error) {
    await file.close().catch(() => {});
    await rm(path, { force: true });
    throw error;
  }
  await file.close();
}
export async function privateTarget(path) {
  const parent = await realpath(dirname(resolve(path)));
  const target = resolve(parent, resolve(path).split(sep).at(-1));
  for (const folder of [
    'public',
    'dist',
    'releases',
    process.env.SCOPELEDGER_PUBLIC_DIR,
    process.env.SCOPELEDGER_ASSET_DIR,
  ].filter(Boolean)) {
    let forbidden = resolve(process.cwd(), folder);
    try {
      forbidden = await realpath(forbidden);
    } catch {}
    if (target === forbidden || target.startsWith(forbidden + sep))
      throw new Error('Recovery files must be outside public and release directories.');
  }
  return target;
}
export async function privateFile(path, read = true) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      (process.platform !== 'win32' &&
        (info.mode & 0o077 || (process.getuid() !== 0 && info.uid !== process.getuid())))
    )
      throw new Error(
        'Recovery inputs must be regular files readable only by their owner (mode 600), without aliases.',
      );
    return read ? await handle.readFile() : null;
  } finally {
    await handle.close();
  }
}
function secretFrom(text) {
  const secret = parseEnv(text).SCOPELEDGER_SESSION_SECRET;
  if (!/^[a-f0-9]{64}$/i.test(secret ?? ''))
    throw new Error('Recovery requires the matching 32-byte session secret.');
  return secret;
}
function verifyDatabase(path, secret) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok')
      throw new Error('Database integrity check failed.');
    for (const table of ['licenses', 'devices', 'sessions', 'quotas', 'recovery_audit'])
      db.prepare(`SELECT count(*) AS count FROM ${table}`).get();
    for (const { key_cipher } of db.prepare('SELECT key_cipher FROM licenses').all()) {
      const [iv, text, tag] = key_cipher.split('.');
      const cipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(secret, 'hex'),
        Buffer.from(iv, 'hex'),
      );
      cipher.setAuthTag(Buffer.from(tag, 'hex'));
      cipher.update(Buffer.from(text, 'hex'));
      cipher.final();
    }
  } finally {
    db.close();
  }
}
export async function backupServer(databasePath, environmentPath, destination) {
  const target = await privateTarget(destination);
  const env = await privateFile(environmentPath),
    secret = secretFrom(env.toString());
  await privateFile(databasePath, false);
  verifyDatabase(databasePath, secret);
  await mkdir(target, { mode: 0o700 }); // exclusive destination; never reuse a backup
  let source;
  try {
    source = new DatabaseSync(databasePath, { readOnly: true });
    await backup(source, resolve(target, 'licenses.sqlite'));
    source.close();
    source = null;
    await chmod(resolve(target, 'licenses.sqlite'), 0o600);
    verifyDatabase(resolve(target, 'licenses.sqlite'), secret);
    await writeFile(resolve(target, 'server.env'), env, { flag: 'wx', mode: 0o600 });
    const manifest = {
      schema: 1,
      createdAt: new Date().toISOString(),
      database: digest(await readFile(resolve(target, 'licenses.sqlite'))),
      environment: digest(env),
    };
    await writeFile(
      resolve(target, 'manifest.json'),
      JSON.stringify({
        ...manifest,
        signature: createHmac('sha256', Buffer.from(secret, 'hex'))
          .update(JSON.stringify(manifest))
          .digest('hex'),
      }),
      { flag: 'wx', mode: 0o600 },
    );
    return { status: 'verified', createdAt: manifest.createdAt };
  } catch (error) {
    source?.close();
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
export async function restoreServer(source, databasePath, environmentPath) {
  const targetDb = await privateTarget(databasePath),
    targetEnv = await privateTarget(environmentPath);
  if (targetDb === targetEnv) throw new Error('Database and environment destinations must differ.');
  const dbBytes = await privateFile(resolve(source, 'licenses.sqlite'));
  const env = await privateFile(resolve(source, 'server.env')),
    secret = secretFrom(env.toString());
  const { signature, ...manifest } = JSON.parse(
    (await privateFile(resolve(source, 'manifest.json'))).toString(),
  );
  if (
    manifest.schema !== 1 ||
    manifest.database !== digest(dbBytes) ||
    manifest.environment !== digest(env) ||
    signature !==
      createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(JSON.stringify(manifest))
        .digest('hex')
  )
    throw new Error('Recovery bundle verification failed. Nothing was restored.');
  verifyDatabase(resolve(source, 'licenses.sqlite'), secret);
  for (const path of [
    targetDb,
    `${targetDb}-wal`,
    `${targetDb}-shm`,
    `${targetDb}-journal`,
    targetEnv,
  ]) {
    try {
      await lstat(path);
      throw new Error(
        'Restore requires new, unused destinations. Stop the service and retain the old database.',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const values = parseEnv(env.toString());
  values.SCOPELEDGER_DB_PATH = targetDb;
  // A restore must never inadvertently open checkout on a recovered host.
  values.SCOPELEDGER_PURCHASES_ENABLED = 'false';
  values.SCOPELEDGER_LAUNCH_APPROVED = 'false';
  if (Object.values(values).some((value) => /[\r\n"\\]/.test(value)))
    throw new Error('Environment contains values that require manual restoration.');
  let copied = false,
    wroteEnv = false;
  try {
    await copyFile(resolve(source, 'licenses.sqlite'), targetDb, constants.COPYFILE_EXCL);
    copied = true;
    await chmod(targetDb, 0o600);
    await privateWrite(
      targetEnv,
      Object.entries(values)
        .map(([key, value]) => `${key}="${value}"`)
        .join('\n') + '\n',
    );
    wroteEnv = true;
    verifyDatabase(targetDb, secret);
    return { status: 'restored', purchasesEnabled: false };
  } catch (error) {
    if (copied) await rm(targetDb, { force: true });
    if (wroteEnv) await rm(targetEnv, { force: true });
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error(
    'Use scripts/secure-backup.mjs for authenticated encrypted backups and recovery. Plain staging helpers are not a transport backup interface.',
  );
  process.exitCode = 1;
}
