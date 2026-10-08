import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuration, LicenseService } from '../server/licensing.mjs';
if (process.env.NODE_ENV !== 'development' || process.env.SCOPELEDGER_MODE !== 'local-test')
  throw new Error(
    'Explicit NODE_ENV=development and SCOPELEDGER_MODE=local-test are required. Never use generated keys in production.',
  );
const directory = resolve('.local-private');
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const file of ['test-keys.json', 'local-test.env']) {
  try {
    await access(resolve(directory, file));
    throw new Error(
      'Private testing files already exist. Reuse them; do not rotate the session secret or overwrite keys.',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const secret = process.env.SCOPELEDGER_SESSION_SECRET ?? randomBytes(32).toString('hex');
const dbPath = process.env.SCOPELEDGER_DB_PATH ?? resolve(directory, 'licenses.sqlite');
const origin = process.env.SCOPELEDGER_ORIGIN ?? 'http://127.0.0.1:5173';
const config = configuration({
  ...process.env,
  SCOPELEDGER_SESSION_SECRET: secret,
  SCOPELEDGER_DB_PATH: dbPath,
  SCOPELEDGER_ORIGIN: origin,
});
if (!config.configured || config.mode !== 'local-test') throw new Error(config.message);
const service = new LicenseService(config);
const keys = {};
try {
  for (const plan of ['individual', 'agency']) {
    keys[plan] = `SL-LOCAL-${randomBytes(24).toString('hex')}`;
    service.seedLocalKey(keys[plan], plan);
  }
} finally {
  service.close();
}
await writeFile(
  resolve(directory, 'test-keys.json'),
  JSON.stringify(
    { warning: 'LOCAL DEVELOPMENT ONLY — no purchase or production entitlement', ...keys },
    null,
    2,
  ),
  { mode: 0o600, flag: 'wx' },
);
await writeFile(
  resolve(directory, 'local-test.env'),
  `NODE_ENV=development\nSCOPELEDGER_MODE=local-test\nSCOPELEDGER_ORIGIN=${origin}\nSCOPELEDGER_DB_PATH=${dbPath}\nSCOPELEDGER_SESSION_SECRET=${secret}\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Generated local-test keys and environment at .local-private/test-keys.json and .local-private/local-test.env. Secret values are never printed.',
);
