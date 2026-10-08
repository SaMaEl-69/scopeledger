import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { configuration } from '../server/licensing.mjs';
try {
  loadEnvFile(resolve('.local-private/local-test.env'));
} catch {
  throw new Error(
    'Generate private development keys first; see docs/SERVER-CONFIGURATION.md. Environment values are never printed.',
  );
}
if (process.env.NODE_ENV === 'production')
  throw new Error(
    'Local testing cannot run in production. Start this owner-only runner from a development environment.',
  );
const port = Number(process.argv[2] ?? 5180);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose an unprivileged local testing port.');
process.env.NODE_ENV = 'development';
process.env.SCOPELEDGER_MODE = 'local-test';
process.env.SCOPELEDGER_ORIGIN = `http://127.0.0.1:${port}`;
const config = configuration();
if (!config.configured || config.mode !== 'local-test') throw new Error(config.message);
console.log(
  `LOCAL TEST MODE — no purchases. Open http://127.0.0.1:${port}/app. Demo origin 5173 stays separate.`,
);
const child = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
process.on('exit', () => {
  if (child.exitCode === null) child.kill();
});
child.on('exit', (code) => process.exit(code ?? 1));
