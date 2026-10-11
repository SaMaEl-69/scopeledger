import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createBackend } from '../server/backend.mjs';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { chromePath, rendererReady } from '../server/pdf.mjs';
import { fixture } from '../tests/server/fixtures.mjs';
import { createScopeLedgerServer } from './serve.mjs';

// Real, isolated readiness and protected PDF checks. --report-only records the
// pre-configuration state; the default invocation is a strict pass/fail gate.
// No seller transaction, customer content or persisted browser state is used.
const arguments_ = process.argv.slice(2);
if (arguments_.some((value) => value !== '--report-only' && !value.startsWith('--output=')))
  throw new Error('Usage: renderer-runtime-qa.mjs [--report-only] [--output=report.json]');
if (process.env.NODE_ENV === 'production')
  throw new Error('Renderer QA uses isolated development licensing, never production.');
const reportOnly = arguments_.includes('--report-only');
const output = resolve(
  arguments_.find((value) => value.startsWith('--output='))?.slice('--output='.length) ??
    'output/ci-pdf-readiness/renderer-runtime.json',
);
const directory = await mkdtemp(join(tmpdir(), 'margvant-renderer-runtime-'));
const sessionSecret = randomBytes(32).toString('hex');
const licenseKey = `LOCAL-RENDERER-QA-${randomBytes(24).toString('hex')}`;
const redact = (value) =>
  String(value).replaceAll(sessionSecret, '[redacted]').replaceAll(licenseKey, '[redacted]');
const report = {
  at: new Date().toISOString(),
  mode: reportOnly ? 'report-only' : 'strict',
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  executable: null,
  linux: null,
  launch: null,
  readiness: null,
  activationStatus: null,
  pdf: null,
  passed: false,
};
let service, server, failed;
try {
  const executable = await chromePath();
  const executableStat = await stat(executable);
  report.executable = {
    path: executable,
    uid: executableStat.uid,
    gid: executableStat.gid,
    mode: (executableStat.mode & 0o7777).toString(8),
  };
  if (process.platform === 'linux') {
    const readable = async (path) => {
      try {
        return (await readFile(path, 'utf8')).trim();
      } catch (error) {
        return `UNVERIFIED: ${error.code}`;
      }
    };
    report.linux = {
      appArmorRestrictUnprivilegedUserns: await readable(
        '/proc/sys/kernel/apparmor_restrict_unprivileged_userns',
      ),
      unprivilegedUsernsClone: await readable('/proc/sys/kernel/unprivileged_userns_clone'),
      maxUserNamespaces: await readable('/proc/sys/user/max_user_namespaces'),
      processAppArmorProfile: await readable('/proc/self/attr/current'),
    };
  }
  const launchBegan = performance.now();
  try {
    report.launch = {
      ready: await rendererReady(),
      durationMs: Math.round(performance.now() - launchBegan),
    };
  } catch (error) {
    // rendererReady launches only an empty browser, using its existing env
    // allowlist; its raw error cannot contain a document or license request.
    report.launch = {
      ready: false,
      durationMs: Math.round(performance.now() - launchBegan),
      error: redact(error.message),
    };
  }
  const config = configuration({
    NODE_ENV: 'development',
    SCOPELEDGER_MODE: 'local-test',
    SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5181',
    SCOPELEDGER_SESSION_SECRET: sessionSecret,
    SCOPELEDGER_DB_PATH: join(directory, 'licenses.sqlite'),
  });
  service = new LicenseService(config);
  service.seedLocalKey(licenseKey, 'individual');
  server = createScopeLedgerServer({ backend: createBackend({ config, service }) });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'Isolated QA server must listen.');
  config.origin = `http://127.0.0.1:${address.port}`;
  const readiness = await fetch(`${config.origin}/api/ready`, {
    signal: AbortSignal.timeout(15000),
  });
  report.readiness = {
    status: readiness.status,
    body: redact(await readiness.text()),
    xRobotsTag: readiness.headers.get('x-robots-tag'),
  };
  const activation = await fetch(`${config.origin}/api/license/activate`, {
    method: 'POST',
    headers: { Origin: config.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: licenseKey,
      plan: 'individual',
      deviceLabel: 'Isolated renderer runtime QA',
    }),
    signal: AbortSignal.timeout(15000),
  });
  report.activationStatus = activation.status;
  assert.equal(activation.status, 200, 'Real local-test activation must succeed.');
  await activation.body?.cancel();
  const cookie = activation.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const pdfBegan = performance.now();
  const pdfResponse = await fetch(`${config.origin}/api/pdf`, {
    method: 'POST',
    headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(fixture()),
    signal: AbortSignal.timeout(45000),
  });
  const bytes = Buffer.from(await pdfResponse.arrayBuffer());
  report.pdf = {
    status: pdfResponse.status,
    contentType: pdfResponse.headers.get('content-type'),
    contentDisposition: pdfResponse.headers.get('content-disposition'),
    durationMs: Math.round(performance.now() - pdfBegan),
    bytes: bytes.length,
    signature: bytes.subarray(0, 5).toString(),
    ...(pdfResponse.ok ? {} : { errorBody: redact(bytes.toString('utf8')) }),
  };
  if (pdfResponse.ok) {
    const pdfPath = output.replace(/\.json$/, '') + '.pdf';
    await mkdir(dirname(pdfPath), { recursive: true });
    await writeFile(pdfPath, bytes);
    report.pdf.file = pdfPath;
  }
  assert.equal(report.launch.ready, true, 'Sandboxed Chrome must launch.');
  assert.equal(report.readiness.status, 200, 'Actual readiness handler must return 200.');
  assert.deepEqual(JSON.parse(report.readiness.body).checks, {
    configured: true,
    storage: true,
    renderer: true,
  });
  assert.equal(JSON.parse(report.readiness.body).status, 'ready');
  assert.equal(JSON.parse(report.readiness.body).purchasesEnabled, false);
  assert.equal(report.pdf.status, 200, 'Protected endpoint must produce a real PDF.');
  assert.equal(report.pdf.contentType, 'application/pdf');
  assert.equal(report.pdf.contentDisposition, 'attachment; filename="Margvant-invoice.pdf"');
  assert.equal(report.pdf.signature, '%PDF-');
  assert.ok(report.pdf.bytes > 1000, 'Real PDF must contain document data.');
  report.passed = true;
} catch (error) {
  failed = error;
  report.failure = redact(error.message);
} finally {
  if (server?.listening) await new Promise((done) => server.close(done));
  else service?.close();
  await rm(directory, { recursive: true, force: true });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failed && !reportOnly) process.exitCode = 1;
