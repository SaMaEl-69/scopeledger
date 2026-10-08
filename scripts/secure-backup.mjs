import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, lstat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backupServer,
  restoreServer,
  privateFile,
  privateTarget,
  privateWrite,
} from './server-backup.mjs';
import { DatabaseSync } from 'node:sqlite';
import { parseEnv } from 'node:util';
const MAGIC = Buffer.from('SLBACKUP1');
const MAX_DATABASE = 64 * 1024 * 1024;
const MAX_ARCHIVE = 96 * 1024 * 1024;
async function recoveryKey(path) {
  if ((await lstat(path)).size > 128) throw new Error('Invalid recovery key.');
  const bytes = await privateFile(path);
  const hex = bytes.toString('utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(hex) || hex.length !== 64) throw new Error('Invalid recovery key.');
  const key = Buffer.from(hex, 'hex');
  bytes.fill(0);
  return key;
}
export async function generateRecoveryKey(path) {
  const target = await privateTarget(path);
  await privateWrite(target, randomBytes(32).toString('hex') + '\n');
  return { status: 'key_created', keepSeparateFromArchive: true };
}
export async function encryptedBackup(database, environment, keyPath, destination) {
  const target = await privateTarget(destination);
  if ([database, environment, keyPath].some((path) => resolve(path) === target))
    throw new Error('Archive must be a new separate file.');
  const key = await recoveryKey(keyPath);
  const temporary = await mkdtemp(
    join(dirname(await privateTarget(database)), '.recovery-staging-'),
  );
  let plain;
  try {
    await backupServer(database, environment, join(temporary, 'bundle'));
    const bundle = join(temporary, 'bundle');
    if ((await lstat(join(bundle, 'licenses.sqlite'))).size > MAX_DATABASE)
      throw new Error('Database exceeds the supported recovery size.');
    const env = await readFile(join(bundle, 'server.env'));
    if (env.length > 262144) throw new Error('Environment exceeds the supported recovery size.');
    const environmentText = new TextDecoder('utf-8', { fatal: true }).decode(env);
    if (Object.values(parseEnv(environmentText)).some((value) => /[\r\n"\\]/.test(value)))
      throw new Error('Environment needs an explicit manual recovery format.');
    plain = Buffer.from(
      JSON.stringify({
        schema: 1,
        database: (await readFile(join(bundle, 'licenses.sqlite'))).toString('base64'),
        environment: environmentText,
        manifest: JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8')),
      }),
    );
    env.fill(0);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(MAGIC);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const archive = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
    if (archive.length > MAX_ARCHIVE)
      throw new Error('Archive exceeds the supported recovery size.');
    await privateWrite(target, archive);
    return { status: 'verified', encrypted: true, algorithm: 'AES-256-GCM', bytes: archive.length };
  } finally {
    key.fill(0);
    plain?.fill(0);
    await rm(temporary, { recursive: true, force: true });
  }
}
export async function encryptedRestore(archivePath, keyPath, database, environment) {
  const targetDb = await privateTarget(database),
    targetEnv = await privateTarget(environment);
  if (targetDb === targetEnv) throw new Error('Recovery destinations must differ.');
  if ((await lstat(archivePath)).size > MAX_ARCHIVE)
    throw new Error('Archive exceeds the supported recovery size.');
  const archive = await privateFile(archivePath),
    key = await recoveryKey(keyPath);
  let plain,
    temporary,
    restored = false;
  try {
    if (archive.length < MAGIC.length + 29 || !archive.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error('Invalid encrypted archive.');
    const start = MAGIC.length,
      decipher = createDecipheriv('aes-256-gcm', key, archive.subarray(start, start + 12));
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(archive.subarray(start + 12, start + 28));
    // Authentication must finish before any restoration/staging writes occur.
    plain = Buffer.concat([decipher.update(archive.subarray(start + 28)), decipher.final()]);
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
    if (
      !payload ||
      payload.schema !== 1 ||
      Object.keys(payload).sort().join(',') !== 'database,environment,manifest,schema' ||
      typeof payload.database !== 'string' ||
      typeof payload.environment !== 'string' ||
      Buffer.byteLength(payload.environment) > 262144 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.database)
    )
      throw new Error('Invalid recovery payload.');
    const dbBytes = Buffer.from(payload.database, 'base64');
    if (dbBytes.length > MAX_DATABASE || dbBytes.toString('base64') !== payload.database)
      throw new Error('Invalid recovery database.');
    temporary = await mkdtemp(join(dirname(targetDb), '.recovery-staging-'));
    for (const [name, bytes] of [
      ['licenses.sqlite', dbBytes],
      ['server.env', payload.environment],
      ['manifest.json', JSON.stringify(payload.manifest)],
    ])
      await writeFile(join(temporary, name), bytes, { mode: 0o600, flag: 'wx' });
    const result = await restoreServer(temporary, targetDb, targetEnv);
    restored = true;
    const recovered = new DatabaseSync(targetDb);
    try {
      recovered.exec('BEGIN IMMEDIATE; DELETE FROM sessions; UPDATE devices SET active=0; COMMIT;');
    } finally {
      recovered.close();
    }
    return { ...result, encryptedArchiveVerified: true, sessionsInvalidated: true };
  } catch (error) {
    if (restored) {
      for (const path of [
        targetDb,
        `${targetDb}-wal`,
        `${targetDb}-shm`,
        `${targetDb}-journal`,
        targetEnv,
      ])
        await rm(path, { force: true });
    }
    throw error;
  } finally {
    key.fill(0);
    plain?.fill(0);
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...args] = process.argv.slice(2);
  try {
    let result;
    if (operation === 'keygen' && args.length === 1) result = await generateRecoveryKey(args[0]);
    else if (operation === 'backup' && args.length === 4) result = await encryptedBackup(...args);
    else if (operation === 'restore' && args.length === 4) result = await encryptedRestore(...args);
    else throw new Error('Invalid arguments.');
    console.log(JSON.stringify(result));
  } catch {
    console.error(
      'Encrypted recovery failed. Check a separate owner-only recovery key, authentic archive, private permissions and new unused destinations. No private contents are logged.',
    );
    process.exitCode = 1;
  }
}
