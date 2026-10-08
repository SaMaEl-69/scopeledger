import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { activationAddress } from '../server/client-address.mjs';
import { createBackend } from '../server/backend.mjs';
import { createScopeLedgerServer } from './serve.mjs';
if (process.env.NODE_ENV === 'production') throw new Error('Use isolated development QA.');
const temporary = await mkdtemp(join(tmpdir(), 'scopeledger-nginx-security-'));
let server, nginx;
const freePort = async () => {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
};
const child = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const worker = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '',
      error = '';
    worker.stdout.on('data', (chunk) => (out += chunk));
    worker.stderr.on('data', (chunk) => (error += chunk));
    worker.once('error', reject);
    worker.once('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error('Isolated gateway verification failed: ' + error)),
    );
  });
try {
  const tlsPort = await freePort(),
    httpPort = await freePort();
  const origin = 'https://127.0.0.1:' + tlsPort,
    httpOrigin = 'http://127.0.0.1:' + httpPort;
  const config = configuration({
    NODE_ENV: 'production',
    SCOPELEDGER_MODE: 'live',
    SCOPELEDGER_ORIGIN: origin,
    SCOPELEDGER_DB_PATH: join(temporary, 'qa.sqlite'),
    SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
    SCOPELEDGER_GUMROAD_SELLER_ID: 'synthetic-gateway-seller',
    SCOPELEDGER_GUMROAD_INDIVIDUAL_PRODUCT_ID: 'synthetic-individual',
    SCOPELEDGER_GUMROAD_AGENCY_PRODUCT_ID: 'synthetic-agency',
    SCOPELEDGER_SELLER_VERIFIED: 'true',
    SCOPELEDGER_TRUST_LOOPBACK_PROXY: 'true',
  });
  const service = new LicenseService(config, {
    verify: async () => {
      throw new Error('This QA never makes a provider transaction.');
    },
  });
  const backend = createBackend({ config, service });
  let proxyVerified = true;
  server = createScopeLedgerServer({
    backend: {
      ...backend,
      middleware(req, res, next) {
        try {
          if (activationAddress(req, config) !== '127.0.0.1') proxyVerified = false;
        } catch {
          proxyVerified = false;
        }
        backend.middleware(req, res, next);
      },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const appPort = server.address().port;
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '1',
      '-nodes',
      '-keyout',
      join(temporary, 'tls.key'),
      '-out',
      join(temporary, 'tls.crt'),
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  );
  const template = (await readFile('ops/nginx.conf', 'utf8'))
    .replaceAll('scopeledger.site', '127.0.0.1')
    .replace('listen 80;', 'listen 127.0.0.1:' + httpPort + ';')
    .replace('listen 443 ssl;', 'listen 127.0.0.1:' + tlsPort + ' ssl;')
    .replace('https://127.0.0.1$request_uri', origin + '$request_uri')
    .replaceAll('http://127.0.0.1:4173', 'http://127.0.0.1:' + appPort)
    .replace('/etc/letsencrypt/live/127.0.0.1/fullchain.pem', join(temporary, 'tls.crt'))
    .replace('/etc/letsencrypt/live/127.0.0.1/privkey.pem', join(temporary, 'tls.key'));
  const path = join(temporary, 'nginx.conf');
  await writeFile(
    path,
    'daemon off;\nworker_processes 1;\npid ' +
      temporary +
      '/nginx.pid;\nerror_log ' +
      temporary +
      '/nginx-error.log warn;\nevents { worker_connections 256; }\nhttp { client_body_temp_path ' +
      temporary +
      '/body; proxy_temp_path ' +
      temporary +
      '/proxy; ' +
      template +
      ' }',
  );
  const binary = process.env.SCOPELEDGER_NGINX_PATH ?? 'nginx';
  execFileSync(binary, ['-t', '-c', path, '-p', temporary], { stdio: 'ignore' });
  nginx = spawn(binary, ['-c', path, '-p', temporary], { stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 500);
    nginx.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    nginx.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Gateway failed to start.'));
    });
  });
  const output = await child(
    process.execPath,
    [
      'scripts/verify-deployment.mjs',
      origin,
      '--require-licensing',
      '--test-limits',
      '--http-origin=' + httpOrigin,
    ],
    { env: { ...process.env, NODE_EXTRA_CA_CERTS: join(temporary, 'tls.crt') } },
  );
  if (!proxyVerified) throw new Error('Proxy did not overwrite the client address.');
  const result = {
    proxyClientAddressVerified: true,
    ...JSON.parse(output),
    platform: process.platform,
    note: 'Isolated trusted test certificate and synthetic seller configuration. This is not a public-host or real-purchase check.',
  };
  await writeFile(
    resolve(process.argv[2] ?? 'output/security/nginx-results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      status: result.status,
      checks: result.checks.length,
      tlsVerificationEnabled: result.tlsVerificationEnabled,
      platform: result.platform,
    }),
  );
} finally {
  if (nginx && nginx.exitCode === null) {
    nginx.kill('SIGTERM');
    await new Promise((resolve) => nginx.once('exit', resolve));
  }
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
