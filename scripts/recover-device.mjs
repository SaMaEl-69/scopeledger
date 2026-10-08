import { readFile, stat } from 'node:fs/promises';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { validateRecoveryEvidence } from '../server/recovery.mjs';
if (process.env.SCOPELEDGER_ADMIN_RECOVERY !== 'enabled')
  throw new Error(
    'Explicit administrative recovery scope is required. Independently verify purchase ownership first.',
  );
if (process.argv.length !== 3)
  throw new Error('Pass a private JSON evidence-file path; never pass a key on the command line.');
const config = configuration();
if (!config.configured) throw new Error(config.message);
let evidence;
try {
  const file = await stat(process.argv[2]);
  if (!file.isFile() || file.size > 16384) throw new Error('Oversized evidence');
  const bytes = await readFile(process.argv[2]);
  if (bytes.byteLength > 16384) throw new Error('Oversized evidence');
  evidence = JSON.parse(bytes.toString('utf8'));
} catch {
  throw new Error(
    'Recovery evidence must be a readable valid JSON file no larger than 16 KiB. Its private contents are never included in errors.',
  );
}
evidence = validateRecoveryEvidence(evidence);
const service = new LicenseService(config);
try {
  service.recoverDevice(evidence);
  console.log(
    'Selected activation released. Recovery audit recorded; other devices remain active.',
  );
} finally {
  service.close();
}
