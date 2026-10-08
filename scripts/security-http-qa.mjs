import { connect } from 'node:net';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createScopeLedgerServer } from './serve.mjs';
import { createBackend } from '../server/backend.mjs';
import { configuration, LicenseService } from '../server/licensing.mjs';
if (process.env.NODE_ENV === 'production')
  throw new Error('Run isolated security QA in development.');
const temporary = await mkdtemp(join(tmpdir(), 'scopeledger-security-http-'));
const config = configuration({
  NODE_ENV: 'development',
  SCOPELEDGER_MODE: 'local-test',
  SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
  SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
  SCOPELEDGER_DB_PATH: join(temporary, 'qa.sqlite'),
});
const service = new LicenseService(config);
const server = createScopeLedgerServer({
  directory: temporary,
  backend: createBackend({ config, service }),
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.origin = `http://127.0.0.1:${port}`;
  const probe = (name, input, expected, maximum) =>
    new Promise((resolve, reject) => {
      const began = performance.now(),
        socket = connect(port, '127.0.0.1');
      let response = '';
      const timeout = setTimeout(
        () => socket.destroy(new Error(`${name} did not close within its deadline`)),
        maximum,
      );
      socket.on('connect', () => socket.write(input));
      socket.on('data', (bytes) => {
        response += bytes.toString();
      });
      socket.on('error', reject);
      socket.on('close', () => {
        clearTimeout(timeout);
        try {
          const status = Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1]);
          assert.equal(status, expected, name);
          resolve({
            name,
            status,
            connectionClosed: true,
            durationMs: Math.round(performance.now() - began),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  const checks = await Promise.all([
    probe(
      'unfinished headers',
      `POST /api/license/activate HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`,
      408,
      13000,
    ),
    probe(
      'unfinished JSON upload',
      `POST /api/license/activate HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${config.origin}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`,
      408,
      18000,
    ),
    probe(
      'oversized request headers',
      `GET /api/license/status HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nCookie: ${'x'.repeat(20000)}\r\n\r\n`,
      431,
      3000,
    ),
  ]);
  assert.equal(service.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  const output = resolve(process.argv[2] ?? 'output/security/http-results.json');
  await mkdir(resolve(output, '..'), { recursive: true });
  const result = { passed: checks.length, checks, sessionsCreated: 0 };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
