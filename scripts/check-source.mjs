import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const names = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const failures = [];
for (const name of names) {
  if (
    /(^|\/)(?:node_modules|dist|output|tmp|\.local-private|releases)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:db|sqlite3?|pem|key|p12|pfx|bak)(?:-wal|-shm|-journal)?$/i.test(
      name,
    )
  )
    failures.push(`${name}: private/generated path`);
  if (/\.(?:png|jpe?g|webp|pdf|woff2?|ico)$/i.test(name)) continue;
  const source = await readFile(name, 'utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[A-Z0-9]{16}\b|\bsk_live_[A-Za-z0-9]{20,}|SCOPELEDGER_SESSION_SECRET\s*=\s*["']?[a-f0-9]{64}\b/i.test(
      source,
    )
  )
    failures.push(`${name}: possible embedded credential`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `${names.length} tracked paths checked; no matched private paths or credential patterns.`,
  );
