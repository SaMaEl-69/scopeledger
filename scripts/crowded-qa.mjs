import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const runtime = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  logLevel: 'silent',
});
let browser;
const directory = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit');
await mkdir(directory, { recursive: true });
try {
  const { createWorkspace, recordApproval } = await runtime.ssrLoadModule(
    '/src/domain/operations.ts',
  );
  const { issueDocument } = await runtime.ssrLoadModule('/src/domain/commercial.ts');
  const { serializeWorkspace } = await runtime.ssrLoadModule('/src/storage/repository.ts');
  const { todayInZone, addDays } = await runtime.ssrLoadModule('/src/operational/dates.ts');
  const currentDay = todayInZone('Asia/Dhaka');
  let source = createWorkspace();
  source.projects[0].sample = false;
  source.agency = {
    ...source.agency,
    legalName: 'Synthetic QA issuer',
    address: 'Synthetic test address',
    email: 'issuer@example.test',
    timezone: 'Asia/Dhaka',
    paymentInstructions: 'Synthetic QA: no payment requested.',
  };
  source.clients[0].address = 'Synthetic billing address';
  source = recordApproval(
    source,
    source.changes[0].id,
    'Synthetic QA approval, not client evidence.',
    '2020-01-01',
  );
  source = issueDocument(source, source.changes[0].id, 'invoice', {
    reference: 'CROWDED-BASE',
    issueDate: '2020-01-01',
    dueDate: '2026-10-01',
    taxRate: '5',
  });
  const w = structuredClone(source);
  for (const key of [
    'projects',
    'changes',
    'approvals',
    'documents',
    'payments',
    'calendarEvents',
    'activity',
    'revisions',
  ])
    w[key] = [];
  const currencies = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'];
  for (let p = 0; p < 300; p++) {
    const projectId = `crowded-project-${p}`,
      changeId = `crowded-change-${p}-0`,
      documentId = `crowded-invoice-${p}`,
      currency = currencies[p % 5];
    w.projects.push({
      ...structuredClone(source.projects[0]),
      id: projectId,
      name: `Synthetic project ${p}`,
      currency,
    });
    for (let c = 0; c < 5; c++)
      w.changes.push({
        ...structuredClone(source.changes[0]),
        id: `crowded-change-${p}-${c}`,
        projectId,
        status: c === 0 ? 'Approved' : c === 4 ? 'Draft' : 'Quoted',
        ...(c === 4 ? { title: '', hours: '.' } : {}),
      });
    w.approvals.push({
      ...structuredClone(source.approvals[0]),
      id: `crowded-approval-${p}`,
      projectId,
      changeId,
    });
    w.documents.push({
      ...structuredClone(source.documents[0]),
      id: documentId,
      projectId,
      changeId,
      snapshot: {
        ...structuredClone(source.documents[0].snapshot),
        reference: `CROWDED-${p}`,
        changeReference: changeId,
        currency,
      },
    });
    for (let n = 0; n < 2; n++) {
      w.payments.push({
        id: `crowded-payment-${p}-${n}`,
        projectId,
        documentId,
        amount: '240',
        receivedAt: '2020-01-10',
      });
      w.calendarEvents.push({
        id: `crowded-event-${p}-${n}`,
        projectId,
        changeId,
        title: `Project ${p} follow-up ${n}`,
        startsAt: n ? new Date().toISOString() : addDays(currentDay, -1),
        allDay: !n,
        timezone: 'Asia/Dhaka',
        status: 'open',
        source: 'manual',
        type: 'quote-followup',
      });
    }
  }
  w.context = {
    ...w.context,
    projectId: w.projects[0].id,
    changeId: w.changes[0].id,
    view: 'workspace',
  };
  const raw = serializeWorkspace(w);
  const report = {
    runtime: process.version,
    fixture: {
      projects: 300,
      changes: 1500,
      invoices: 300,
      payments: 600,
      manualEvents: 600,
      backupBytes: Buffer.byteLength(raw),
    },
    views: [],
  };
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROME_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    timeout: 15000,
  });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Dhaka',
  });
  const page = await context.newPage();
  await page.goto('/app');
  await page
    .locator('.topbar .save-indicator')
    .filter({ hasText: 'Saved on this device' })
    .waitFor();
  await page.evaluate(
    (raw) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('scopeledger-core', 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({ raw, sequence: JSON.parse(raw).sequence }, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }),
    raw,
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Change requests', exact: true }).waitFor();
  for (const size of [
    { width: 1440, height: 1000 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(size);
    for (const view of ['Overview', 'Projects', 'Calendar', 'Documents']) {
      const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (await menu.isVisible()) await menu.click();
      await page
        .locator('.sidebar')
        .getByRole('button', { name: new RegExp('^' + view) })
        .click();
      await page.getByRole('heading', { name: view, exact: true }).waitFor();
      await page
        .locator('.topbar .save-indicator')
        .filter({ hasText: 'Saved on this device' })
        .waitFor();
      const bounds = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      if (bounds.scroll > size.width)
        throw new Error(`${view} crowded overflow ${JSON.stringify(bounds)}`);
      if (view === 'Projects' && (await page.locator('.project-card').count()) !== 300)
        throw new Error('Crowded projects missing');
      await page.screenshot({ path: resolve(directory, `crowded-${view}-${size.width}.png`) });
      report.views.push({ view, ...size, ...bounds });
      if (view === 'Overview') {
        const groups = page.locator('.portfolio-group');
        if ((await groups.count()) !== 5) throw new Error('Crowded currency groups missing');
        const usd = groups.filter({
          has: page.locator('.portfolio-heading strong').filter({ hasText: /^USD$/ }),
        });
        await usd.locator('summary').click();
        const text = await usd.innerText();
        for (const amount of ['$528,000.00', '$48,000.00', '$28,800.00', '$21,600.00'])
          if (!text.includes(amount))
            throw new Error(`Crowded USD amount missing: ${amount}; synthetic group: ${text}`);
        const moneyReadability = await usd
          .locator('.portfolio-numbers strong')
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              const lines = new Set(
                [...range.getClientRects()]
                  .filter((rect) => rect.width > 0 && rect.height > 0)
                  .map((rect) => Math.round(rect.top)),
              );
              return { text: node.textContent, lines: lines.size };
            }),
          );
        if (moneyReadability.some((value) => value.lines !== 1))
          throw new Error(
            `Ordinary portfolio figures split across lines: ${JSON.stringify(moneyReadability)}`,
          );
        await page.locator('.dashboard-attention-grid').scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(directory, `crowded-Attention-${size.width}.png`) });
        await usd.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(directory, `crowded-Currency-${size.width}.png`) });
        report.views.push({
          view: 'USD contribution',
          ...size,
          expectedValues: ['$528,000.00', '$48,000.00', '$28,800.00', '$21,600.00'],
          moneyReadability,
        });
      }
      if (view === 'Documents') {
        await page.locator('.document-history-row').filter({ hasText: 'CROWDED-0' }).click();
        const balance = page.locator('.document-balance');
        await page
          .frameLocator('.client-document-frame')
          .getByRole('heading', { name: 'Invoice', exact: true })
          .waitFor();
        const text = await balance.innerText();
        for (const amount of ['$840.00', '$480.00', '$360.00'])
          if (!text.includes(amount)) throw new Error(`Crowded document amount missing: ${amount}`);
        await balance.scrollIntoViewIfNeeded();
        // The srcdoc iframe can be laid out before its Chromium surface is painted.
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await page.screenshot({
          path: resolve(directory, `crowded-Invoice-balance-${size.width}.png`),
        });
        report.views.push({
          view: 'Issued invoice',
          ...size,
          expectedValues: ['$840.00', '$480.00', '$360.00'],
        });
      }
      if (view === 'Calendar') {
        await page.getByRole('button', { name: 'Agenda', exact: true }).click();
        if ((await page.locator('.agenda-event').count()) < 300)
          throw new Error('Crowded agenda missing source reminders');
        const agendaBounds = await page.evaluate(() => document.documentElement.scrollWidth);
        if (agendaBounds > size.width) throw new Error('Crowded agenda overflow');
        await page.screenshot({ path: resolve(directory, `crowded-Agenda-${size.width}.png`) });
        report.views.push({
          view: 'Agenda',
          ...size,
          scroll: agendaBounds,
          eventRows: await page.locator('.agenda-event').count(),
        });
      }
    }
  }
  await writeFile(resolve(directory, 'crowded-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally {
  await browser?.close();
  await runtime.close();
}
