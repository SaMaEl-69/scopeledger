import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { createBackend } from '../server/backend.mjs';
import { createScopeLedgerServer } from './serve.mjs';
import { fixture } from '../tests/server/fixtures.mjs';
if (process.env.NODE_ENV === 'production')
  throw new Error('Isolated development QA cannot run in production.');
const directory = await mkdtemp(join(tmpdir(), 'scopeledger-renderer-load-'));
const config = configuration({
  NODE_ENV: 'development',
  SCOPELEDGER_MODE: 'local-test',
  SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5180',
  SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
  SCOPELEDGER_DB_PATH: join(directory, 'qa.sqlite'),
});
const service = new LicenseService(config);
const keys = {
  agency: `LOCAL-LOAD-${randomBytes(20).toString('hex')}`,
  individual: `LOCAL-LOAD-${randomBytes(20).toString('hex')}`,
};
for (const plan of ['agency', 'individual']) service.seedLocalKey(keys[plan], plan);
const backend = createBackend({ config, service }),
  server = createScopeLedgerServer({ backend });
let sampler,
  peakRss = 0;
const sample = () => {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid,ppid,rss'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/).map(Number));
    const children = new Set([process.pid]);
    for (let pass = 0; pass < 8; pass++)
      for (const [pid, parent] of rows) if (children.has(parent)) children.add(pid);
    peakRss = Math.max(
      peakRss,
      rows.filter(([pid]) => children.has(pid)).reduce((sum, [, , rss]) => sum + rss, 0),
    );
  } catch {
    peakRss = Math.max(peakRss, Math.ceil(process.memoryUsage().rss / 1024));
  }
};
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  config.origin = `http://127.0.0.1:${server.address().port}`;
  const cookieJar = (response) =>
    response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  const cookies = [];
  for (let index = 0; index < 6; index++) {
    const status = await fetch(`${config.origin}/api/license/status`);
    const plan = index < 5 ? 'agency' : 'individual';
    const response = await fetch(`${config.origin}/api/license/activate`, {
      method: 'POST',
      headers: {
        Origin: config.origin,
        Cookie: cookieJar(status),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: keys[plan], plan, deviceLabel: `Load QA ${index}` }),
    });
    assert.equal(response.status, 200);
    cookies.push(cookieJar(response));
  }
  const render = async (index) => {
    const began = performance.now();
    const response = await fetch(`${config.origin}/api/pdf`, {
      method: 'POST',
      headers: {
        Origin: config.origin,
        Cookie: cookies[index],
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fixture({ reference: `LOAD-QA-${index}` })),
      signal: AbortSignal.timeout(60000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status === 200) assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    else assert.equal(JSON.parse(bytes).error, 'renderer_busy');
    return {
      device: index,
      status: response.status,
      bytes: bytes.length,
      durationMs: Math.round(performance.now() - began),
    };
  };
  sampler = setInterval(sample, 100);
  sample();
  const burst = await Promise.all([
    render(0),
    render(0),
    render(1),
    render(2),
    render(3),
    render(4),
    render(5),
  ]);
  assert.equal(burst.filter((result) => result.status === 200).length, 3);
  assert.equal(burst.filter((result) => result.status === 429).length, 4);
  const retries = [];
  for (const result of burst.filter((result) => result.status === 429))
    retries.push(await render(result.device));
  assert.ok(retries.every((result) => result.status === 200));
  sample();
  const report = {
    status: 'passed',
    platform: process.platform,
    architecture: process.arch,
    burst,
    retries,
    peakProcessTreeRssMiB: Math.round(peakRss / 1024),
    note: 'Local synthetic test, two active jobs and no waiting queue. RSS sums can double-count shared pages. This does not size the production host or exercise maximum-length documents.',
  };
  if (process.argv[2]) {
    const output = resolve(process.argv[2]);
    await mkdir(join(output, '..'), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report));
} finally {
  clearInterval(sampler);
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
