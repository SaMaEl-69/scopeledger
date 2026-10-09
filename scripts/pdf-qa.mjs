import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { createBackend } from '../server/backend.mjs';
import { createScopeLedgerServer } from './serve.mjs';
import { fixture } from '../tests/server/fixtures.mjs';
import { documentHtml } from '../shared/client-document.mjs';
import { scopeLedgerDocumentLogo } from '../shared/document-branding.mjs';
import { chromium } from 'playwright-core';
import { chromePath } from '../server/pdf.mjs';
// Owner QA only: actual protected HTTP PDF endpoint, isolated temporary test
// licenses. This does not claim a Gumroad purchase or modify browser projects.
const directory = await mkdtemp(join(tmpdir(), 'scopeledger-pdf-qa-'));
const output = resolve('output/pdf');
await mkdir(output, { recursive: true });
const measurements = [];
let peakRssKiB = 0,
  memorySamples = 0,
  sampling = false;
const execute = promisify(execFile);
async function sampleMemory() {
  if (sampling) return;
  sampling = true;
  try {
    const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,rss='], { timeout: 2000 });
    const rows = stdout
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number));
    const included = new Set([process.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [pid, parent] of rows)
        if (included.has(parent) && !included.has(pid)) {
          included.add(pid);
          changed = true;
        }
    }
    const rss = rows.filter(([pid]) => included.has(pid)).reduce((total, row) => total + row[2], 0);
    peakRssKiB = Math.max(peakRssKiB, rss);
    memorySamples++;
  } catch {
    /* A missing ps leaves memory explicitly unmeasured. */
  } finally {
    sampling = false;
  }
}
const samplingTimer = setInterval(() => void sampleMemory(), 100);
const config = configuration({
  NODE_ENV: 'development',
  SCOPELEDGER_MODE: 'local-test',
  SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5181',
  SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
  SCOPELEDGER_DB_PATH: join(directory, 'licenses.sqlite'),
});
const service = new LicenseService(config),
  key = `LOCAL-QA-${randomBytes(24).toString('hex')}`;
service.seedLocalKey(key, 'agency');
const backend = createBackend({ config, service }),
  server = createScopeLedgerServer({ directory, backend });
try {
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  config.origin = `http://127.0.0.1:${server.address().port}`;
  const activate = await fetch(`${config.origin}/api/license/activate`, {
    method: 'POST',
    headers: { Origin: config.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, plan: 'agency', deviceLabel: 'Isolated PDF QA' }),
  });
  assert.equal(activate.status, 200);
  const cookie = activate.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const logoBytes = await readFile(resolve('tests/server/qa-logo.png'));
  await writeFile(resolve(output, 'qa-logo.png'), logoBytes);
  const logoDataUrl = `data:image/png;base64,${logoBytes.toString('base64')}`;
  const base = fixture();
  base.agency.legalName = 'Aster Studio';
  base.agency.address = 'Digital design studio\nDhaka, Bangladesh';
  base.client.address = 'Sample client - billing details on file';
  // Preserve a separate studio identity for the difficult regression fixtures.
  base.agency.logoDataUrl = '';
  // The public demonstrations use the approved ScopeLedger identity. Rasterize
  // the vector on transparency through the existing bounded PNG upload path.
  const logoBrowser = await chromium.launch({ executablePath: await chromePath(), headless: true });
  let demonstrationLogo;
  try {
    const page = await logoBrowser.newPage({
      viewport: { width: 260, height: 50 },
      deviceScaleFactor: 3,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block;width:248.51px;height:40px}</style><img src="${scopeLedgerDocumentLogo}" alt="ScopeLedger">`,
      { waitUntil: 'load' },
    );
    demonstrationLogo = await page.locator('img').screenshot({ omitBackground: true });
  } finally {
    await logoBrowser.close();
  }
  await writeFile(resolve(output, 'scopeledger-demo-logo.png'), demonstrationLogo);
  const demonstrationAgency = {
    ...base.agency,
    name: 'ScopeLedger',
    legalName: 'ScopeLedger - sample issuer',
    address: 'Demonstration billing details',
    email: 'demo@example.test',
    website: 'scopeledger.site',
    logoDataUrl: `data:image/png;base64,${demonstrationLogo.toString('base64')}`,
    accentColor: '#00683d',
  };
  const signatureBytes = await readFile(resolve('tests/server/qa-signature.png'));
  base.signatures = {
    enabled: true,
    showClient: false,
    issuer: {
      name: 'Studio signatory (sample)',
      role: 'Project director',
      date: '2026-10-01',
      imageDataUrl: `data:image/png;base64,${signatureBytes.toString('base64')}`,
    },
    client: { name: '', role: '', date: '', imageDataUrl: '' },
  };
  const paragraph =
    'The journal collection uses the approved design system. Client content must arrive before the agreed build milestone. Review covers the named templates, including responsive layouts and agreed acceptance criteria. New integrations, copywriting, bulk entry and an additional visual direction require separate review. ';
  const snapshots = [
    [
      'change-brief',
      fixture({
        ...base,
        agency: demonstrationAgency,
        kind: 'brief',
        reference: 'BRF-2026-001',
        feeMode: 'including-tax',
        additionalDays: '2',
        deliveryDate: '2026-10-17',
        sections: {
          agencyLogo: true,
          contactDetails: false,
          exclusions: true,
          dependencies: true,
          assumptions: true,
          delivery: true,
          footer: true,
        },
        signatures: { ...base.signatures, showClient: true },
        changeReference: 'd1513e04-9cb2-455b-a080-2515a9d9852e',
        status: 'Quoted',
        dueDate: '',
        taxRate: '5',
        tax: '40.00',
        total: '840.00',
        approvalRecorded: '',
        approvalDate: '',
        scope:
          'Add a journal collection to the approved Harbor website. The collection will use the existing visual design and content system.',
        deliverables:
          'One journal collection\nOne reusable article template\nOne journal listing page',
        exclusions: 'Copywriting, bulk content entry and additional integrations.',
        dependencies: 'Harbor supplies approved copy and images before the build begins.',
        assumptions: 'Use the approved design system. One review round covers the new templates.',
        deliveryImplications: 'Schedule is confirmed when approved content is received.',
        approvalText:
          'Confirm this scope, fee and dependencies in writing before additional work starts. The existing agreement remains in force.',
        footer: 'Sample document for design review. No payment is requested.',
      }),
    ],
    [
      'invoice',
      fixture({
        ...base,
        agency: demonstrationAgency,
        reference: 'INV-2026-001',
        feeMode: 'including-tax',
        additionalDays: '2',
        deliveryDate: '2026-10-17',
        changeReference: 'd1513e04-9cb2-455b-a080-2515a9d9852e',
        description:
          'Journal collection, reusable article template and journal listing page, using the approved visual design. Includes one review round.',
        paymentInstructions:
          'Include INV-2026-001 as the payment reference. Use the payment method agreed with the studio.',
        footer: 'Sample document for design review. No payment is requested.',
      }),
    ],
    [
      'long-brief',
      fixture({
        ...base,
        kind: 'brief',
        reference: 'QA-BRIEF-01',
        status: 'Quoted',
        taxRate: '0',
        tax: '0.00',
        subtotal: '-100.00',
        total: '-100.00',
        description:
          'Explicit client credit: Removed archive work exceeds the additional journal collection cost.',
        approvalRecorded: '',
        approvalDate: '',
        scope: Array.from(
          { length: 12 },
          (_, i) => `Scope section ${i + 1}\n${paragraph.repeat(3)}`,
        ).join('\n\n'),
        deliverables: paragraph.repeat(5),
        assumptions: paragraph.repeat(4),
        removedScope: 'Proposed removal of one previously approved archive template.',
      }),
    ],
    [
      'invoice-logo',
      fixture({
        ...base,
        reference: 'QA-INVOICE-01',
        agency: {
          ...base.agency,
          legalName: 'Aster Studio — International Digital Design and Publishing Operations',
          logoDataUrl,
        },
        client: {
          ...base.client,
          name: 'Harbor International Research Studio — Collaborative Publishing, Digital Archives, Accessibility and Content Operations',
          address:
            'Long-name billing identity — owner QA only\nResearch and Publishing Services\n48 Example Avenue, Suite 1800\nDhaka, Bangladesh',
        },
        subtotal: '900000000000000000000000.00',
        taxRate: '5.00',
        tax: '45000000000000000000000.00',
        total: '945000000000000000000000.00',
        description: Array.from(
          { length: 5 },
          (_, i) => `Approved deliverable ${i + 1}: ${paragraph}`,
        ).join('\n\n'),
      }),
    ],
    [
      'explicit-credit',
      fixture({
        ...base,
        kind: 'credit',
        reference: 'QA-CREDIT-01',
        description:
          'Approved reduction of the journal migration scope. This credit reduces the amount owed and is not an invoice for a new payment.',
        subtotal: '100.00',
        taxRate: '5.00',
        tax: '5.00',
        total: '105.00',
        paymentInstructions:
          'Offset this agreed credit against the referenced invoice; do not send another payment.',
      }),
    ],
  ];
  const privateProbe = await fetch(`${config.origin}/api/pdf`, {
    method: 'POST',
    headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...base, hours: 'PRIVATE HOURS MUST NOT CROSS BOUNDARY' }),
  });
  assert.equal(privateProbe.status, 422);
  for (const [name, snapshot] of snapshots) {
    const began = performance.now();
    await writeFile(resolve(output, `${name}.html`), documentHtml(snapshot));
    const response = await fetch(`${config.origin}/api/pdf`, {
      method: 'POST',
      headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error(`PDF ${name}: ${response.status} ${await response.text()}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 1000);
    await writeFile(resolve(output, `${name}.pdf`), bytes);
    measurements.push({
      document: name,
      durationMs: Math.round(performance.now() - began),
      bytes: bytes.length,
    });
    console.log(`Actual authorized PDF generated: output/pdf/${name}.pdf (${bytes.length} bytes)`);
  }
} finally {
  clearInterval(samplingTimer);
  while (sampling) await new Promise((resolve) => setTimeout(resolve, 10));
  await writeFile(
    resolve(output, 'PERFORMANCE-REPORT.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        environment:
          'Owner macOS / Node 26 / local Google Chrome / sequential protected local-test exports',
        memoryMethod:
          '100 ms RSS samples of this QA Node process and its descendants, including sampling subprocess; not a production load test',
        memorySamples,
        peakRssKiB: memorySamples ? peakRssKiB : null,
        measurements,
      },
      null,
      2,
    ) + '\n',
  );
  if (server.listening) await new Promise((done) => server.close(done));
  else service.close();
  await rm(directory, { recursive: true, force: true });
}
