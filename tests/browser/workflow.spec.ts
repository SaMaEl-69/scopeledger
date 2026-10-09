import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Workspace } from '../../src/domain/types';

const agreementLabel = 'I reviewed the agreement and confirmed this response is appropriate.';
const screenshotDirectory = resolve('test-results/screenshots');

async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}

async function settledMobileSidebar(page: Page) {
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible()) {
    await expect
      .poll(() =>
        page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
  }
}

async function settledMobileDecision(page: Page) {
  await expect
    .poll(() =>
      page
        .locator('#commercial-results')
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top - 18)),
    )
    .toBeLessThanOrEqual(2);
}

async function open(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await saved(page);
}

async function navigate(page: Page, destination: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${destination}`) })
    .click();
  await expect(page.getByRole('heading', { name: destination, exact: true })).toBeVisible();
  await saved(page);
}

async function createCustomProject(page: Page) {
  await navigate(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a project' });
  await dialog.getByLabel('Project name').fill('Northline / Site');
  await dialog.getByLabel('Client name', { exact: true }).fill('Northline Studio');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.context-title')).toContainText('Northline / Site');
  await saved(page);
}

async function quoteAndApprove(page: Page) {
  await page.getByLabel(agreementLabel).check();
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.locator('.request-card .status-quoted')).toHaveText('Quoted');
  await page.getByRole('button', { name: 'Record approval', exact: true }).click();
  const approval = page.getByRole('dialog', { name: 'Record approval', exact: true });
  await expect(
    approval.getByRole('button', { name: 'Record approval', exact: true }),
  ).toBeDisabled();
  await approval
    .getByLabel('Approval evidence')
    .fill('Client approved the journal scope and USD 800 fee by email; reference NL-APPROVAL-01.');
  await approval.getByRole('button', { name: 'Record approval', exact: true }).click();
  await expect(approval).not.toBeVisible();
  await expect(page.locator('.request-card .status-approved')).toHaveText('Approved');
  await saved(page);
}

async function exportedWorkspace(page: Page): Promise<{ raw: string; workspace: Workspace }> {
  await navigate(page, 'Settings & backup');
  const downloading = page.waitForEvent('download');
  await page
    .locator('.backup-card')
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const privacy = page.getByRole('dialog', { name: 'Back up your workspace' });
  await privacy.getByRole('checkbox', { name: 'Use an unencrypted JSON file instead' }).check();
  await privacy.getByRole('checkbox', { name: /I understand anyone/ }).check();
  await privacy.getByRole('button', { name: 'Download JSON backup' }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('Backup download did not produce a file');
  const raw = await readFile(path, 'utf8');
  await saved(page);
  return { raw, workspace: JSON.parse(raw) as Workspace };
}

async function storedWorkspace(page: Page): Promise<Workspace> {
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const reading = database
            .transaction('workspace', 'readonly')
            .objectStore('workspace')
            .get('current');
          reading.onerror = () => {
            database.close();
            reject(reading.error);
          };
          reading.onsuccess = () => {
            const result = JSON.parse(reading.result.raw) as Workspace;
            database.close();
            resolve(result);
          };
        };
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await open(page);
});

test('the reference case is clear and usable at desktop, tablet and phone sizes', async ({
  page,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 1024, height: 900 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('agreed-margin')).toHaveText('35%');
    await expect(page.getByTestId('change-floor')).toHaveText('$800.00');
    await expect(page.getByTestId('restoration-fee')).toHaveText('$800.00');
    await expect(page.locator('.margin-row.current')).toContainText('35%');
    await expect(page.locator('.margin-row.absorb')).toContainText('28.5%');
    await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('8');
    await expect(page.getByLabel('Loaded hourly cost', { exact: true })).toHaveValue('65');
    await expect(page.getByRole('button', { name: 'Save decision', exact: true })).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settledMobileSidebar(page);
    await page.screenshot({ path: resolve(screenshotDirectory, `${viewport.name}-top.png`) });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${viewport.name}-full.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Use an example request', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Common agency scenarios' })).toBeVisible();
    await expect(page.locator('.scenario-option')).toHaveCount(12);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Use an example request', exact: true }),
    ).toBeFocused();
    const review = page
      .locator('.mobile-decision-action')
      .getByRole('button', { name: 'Review decision', exact: true });
    if (await review.isVisible()) {
      await review.click();
      await settledMobileDecision(page);
      await expect(page.getByTestId('agreed-margin')).toBeInViewport();
      await page.screenshot({
        path: resolve(screenshotDirectory, `${viewport.name}-decision.png`),
      });
    }
  }
});

test('the phone action saves the decision and advances to recording approval', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await settledMobileSidebar(page);
  await page.getByLabel(agreementLabel).check();
  await page
    .locator('.mobile-decision-action')
    .getByRole('button', { name: 'Review decision', exact: true })
    .click();
  await settledMobileDecision(page);
  const next = page.getByRole('button', {
    name: 'Continue the commercial decision from mobile action',
    exact: true,
  });
  await expect(next).toBeVisible();
  await expect(next).toHaveText('Save decision');
  await next.click();
  await expect(page.locator('.request-card .status-quoted')).toHaveText('Quoted');
  await saved(page);
  await expect(next).toHaveText('Record approval');
  const workspace = await storedWorkspace(page);
  expect(workspace.changes[0].status).toBe('Quoted');
  expect(workspace.projects[0].baseline.fee).toBe('8000');
  await next.click();
  const approval = page.getByRole('dialog', { name: 'Record approval', exact: true });
  await expect(approval).toBeVisible();
  await expect(
    approval.getByRole('button', { name: 'Record approval', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(next).toBeFocused();
});

test('scenario replacement needs deliberate confirmation and preserves baseline and estimates', async ({
  page,
}) => {
  await page
    .getByLabel('Scope of the request')
    .fill('A substantial existing request that must stay until replacement is confirmed.');
  await page.getByLabel('Additional hours', { exact: true }).fill('12.5');
  await page.getByLabel('Loaded hourly cost', { exact: true }).fill('72');
  await page.getByRole('button', { name: 'Use an example request', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Common agency scenarios' });
  await dialog.getByRole('button', { name: /Add a CMS collection during the build/ }).click();
  await expect(dialog.getByRole('button', { name: 'Load scenario', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Scope of the request')).toHaveValue(
    'A substantial existing request that must stay until replacement is confirmed.',
  );
  await page.getByRole('button', { name: 'Use an example request', exact: true }).click();
  await dialog.getByRole('button', { name: /Add a CMS collection during the build/ }).click();
  await dialog.getByRole('checkbox', { name: /Replace this change’s existing scope text/ }).check();
  await dialog.getByRole('button', { name: 'Load scenario', exact: true }).click();
  await expect(page.getByLabel('Request title')).toHaveValue(
    'Add a CMS collection during the build',
  );
  await expect(page.getByLabel('Scope of the request')).toHaveValue(/new CMS collection/);
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('12.5');
  await expect(page.getByLabel('Loaded hourly cost', { exact: true })).toHaveValue('72');
  await expect(page.locator('.baseline-strip')).toContainText('$8,000.00');
  await expect(page.locator('.baseline-strip')).toContainText('$3,200.00');
  await saved(page);
  const workspace = await storedWorkspace(page);
  expect(workspace.projects[0].baseline).toMatchObject({
    fee: '8000',
    actual: '2000',
    remaining: '3200',
    target: '35',
  });
  expect(workspace.changes[0]).toMatchObject({
    hours: '12.5',
    rate: '72',
    contractConfirmed: false,
  });
});

test('one custom demo project is allowed and archive or trash cannot bypass activation', async ({
  page,
}) => {
  await createCustomProject(page);
  await navigate(page, 'Projects');
  await expect(page.locator('.project-card')).toHaveCount(2);
  const requireActivation = async () => {
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Activate ScopeLedger' });
    await expect(dialog).toContainText('Purchases and activation are unavailable');
    await expect(dialog).toContainText('$48.78');
    await expect(dialog).toContainText('$99');
    await dialog.getByRole('button', { name: 'Continue with demo', exact: true }).click();
  };
  await requireActivation();
  await page.getByRole('button', { name: 'Archive Northline / Site', exact: true }).click();
  await requireActivation();
  await page.getByRole('checkbox', { name: 'Archived', exact: true }).check();
  await page.getByRole('button', { name: 'Move Northline / Site to trash', exact: true }).click();
  await requireActivation();
  await saved(page);
  const workspace = await storedWorkspace(page);
  expect(workspace.projects.filter((project) => !project.sample)).toHaveLength(1);
  expect(workspace.projects.find((project) => !project.sample)?.deletedAt).not.toBeNull();
});

test('approval reconciliation splits actual and future cost and includes an approved change once', async ({
  page,
}) => {
  await quoteAndApprove(page);
  await page
    .getByRole('button', { name: 'Include approved change in baseline', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Include approved change in baseline',
    exact: true,
  });
  await expect(
    dialog.getByRole('button', { name: 'Confirm reconciliation', exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel('Additional cost already incurred').fill('0');
  await dialog.getByLabel('Additional cost still remaining').fill('520');
  await expect(dialog.locator('.reconcile-preview')).toContainText('$8,800.00');
  await expect(dialog.locator('.reconcile-preview')).toContainText('$3,720.00');
  await dialog.getByRole('checkbox', { name: /I confirmed incurred and remaining costs/ }).check();
  await dialog.getByRole('button', { name: 'Confirm reconciliation', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.baseline-strip')).toContainText('$8,800.00');
  await expect(page.locator('.baseline-strip')).toContainText('$3,720.00');
  await expect(page.getByLabel('Request title')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Include approved change in baseline', exact: true }),
  ).toHaveCount(0);
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(page.locator('.baseline-strip')).toContainText('$8,800.00');
  const workspace = await storedWorkspace(page);
  expect(workspace.reconciliations).toHaveLength(1);
  expect(Number(workspace.projects[0].baseline.fee)).toBe(8800);
  expect(Number(workspace.projects[0].baseline.actual)).toBe(2000);
  expect(Number(workspace.projects[0].baseline.remaining)).toBe(3720);
  expect(workspace.projects[0].originalBaseline.fee).toBe('8000');
});

test('commercial revision invalidates approval and preserves earlier quoted terms and evidence', async ({
  page,
}) => {
  await quoteAndApprove(page);
  await page.getByLabel('Proposed additional fee', { exact: true }).fill('900');
  await expect(page.locator('.request-card .status-draft')).toHaveText('Draft');
  await expect(page.locator('.context-details')).toContainText('Revision 2');
  await expect(
    page.getByRole('button', { name: 'Include approved change in baseline', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: /Decision history/ }).click();
  await expect(page.locator('.approval-record')).toContainText('Earlier approval · invalidated');
  await expect(page.locator('.approval-record')).toContainText('NL-APPROVAL-01');
  await page.locator('.history-actions summary').click();
  await page.getByRole('button', { name: /Revision 1 · Decision saved as quoted/ }).click();
  const revision = page.getByRole('dialog', { name: 'Saved revision 1', exact: true });
  await expect(revision).toContainText('Proposed fee: $800.00');
  await expect(revision).toContainText('Baseline revenue: $8,000.00');
  await page.keyboard.press('Escape');
  await saved(page);
  const workspace = await storedWorkspace(page);
  expect(workspace.approvals[0].invalidatedAt).not.toBeNull();
  expect(workspace.revisions[0].change.fee).toBe('800');
  expect(workspace.changes[0].fee).toBe('900');
});

test('unfinished numeric input saves and reopens as a correctable draft with unknown results', async ({
  page,
}) => {
  await page.getByLabel('Request title').fill('Recoverable incomplete estimate');
  await page.getByLabel('Additional hours', { exact: true }).fill('.');
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByTestId('agreed-margin')).toHaveText('—');
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(page.getByLabel('Request title')).toHaveValue('Recoverable incomplete estimate');
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('.');
  await expect(page.getByTestId('change-floor')).toHaveText('—');
  await page.getByLabel('Additional hours', { exact: true }).fill('8');
  await expect(page.getByTestId('agreed-margin')).toHaveText('35%');
});

test('backup restore accepts sample plus custom in a fresh demo and repeated replacement keeps identities', async ({
  page,
  browser,
}) => {
  await createCustomProject(page);
  const backup = await exportedWorkspace(page);
  expect(backup.workspace.projects).toHaveLength(2);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
  });
  const fresh = await context.newPage();
  try {
    await open(fresh);
    expect((await storedWorkspace(fresh)).projects).toHaveLength(1);
    for (let pass = 0; pass < 2; pass++) {
      await navigate(fresh, 'Settings & backup');
      await fresh.getByTestId('backup-file').setInputFiles({
        name: 'scopeledger-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backup.raw),
      });
      const dialog = fresh.getByRole('dialog', { name: 'Review workspace replacement' });
      await expect(dialog).toContainText('Northline / Site');
      await expect(
        dialog.getByRole('button', { name: 'Back up current workspace first', exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Replace workspace', exact: true }),
      ).toBeDisabled();
      await dialog
        .getByRole('checkbox', { name: /I understand this will replace my current workspace/ })
        .check();
      await dialog.getByRole('button', { name: 'Replace workspace', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await saved(fresh);
      const restored = await storedWorkspace(fresh);
      expect(restored.id).toBe(backup.workspace.id);
      expect(restored.projects.map((project) => project.id)).toEqual(
        backup.workspace.projects.map((project) => project.id),
      );
      expect(restored.changes.map((change) => change.id)).toEqual(
        backup.workspace.changes.map((change) => change.id),
      );
      expect(restored.projects).toHaveLength(2);
    }
  } finally {
    await context.close();
  }
});

test('a failed storage write stays unsaved and an export preserves current edits', async ({
  page,
}) => {
  const previous = await storedWorkspace(page);
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    Object.defineProperty(IDBDatabase.prototype, 'transaction', {
      configurable: true,
      value: function (this: IDBDatabase, ...args: unknown[]) {
        if (args[1] === 'readwrite')
          throw new DOMException('Simulated full storage', 'QuotaExceededError');
        return Reflect.apply(transaction, this, args);
      },
    });
  });
  await page.reload();
  await saved(page);
  await page.getByLabel('Request title').fill('Unsaved work must remain recoverable');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  await expect(page.getByRole('alert')).toContainText('Device storage is full');
  expect((await storedWorkspace(page)).changes[0].title).toBe(previous.changes[0].title);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current edits', exact: true }).click();
  const privacy = page.getByRole('dialog', { name: 'Back up your workspace' });
  await privacy.getByRole('checkbox', { name: 'Use an unencrypted JSON file instead' }).check();
  await privacy.getByRole('checkbox', { name: /I understand anyone/ }).check();
  await privacy.getByRole('button', { name: 'Download JSON backup' }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('Recovery export did not produce a file');
  const recovery = JSON.parse(await readFile(path, 'utf8')) as Workspace;
  expect(recovery.changes[0].title).toBe('Unsaved work must remain recoverable');
  await expect(page.locator('.topbar .save-indicator')).not.toHaveText('Saved on this device');
});

test('premium APIs fail closed even when a browser supplies a fake activation claim', async ({
  request,
}) => {
  for (const path of ['/api/pdf', '/api/license/activate', '/api/purchase']) {
    const response = await request.post(`${path}?licensed=true`, {
      headers: { authorization: 'Bearer fake-license', 'x-activated': 'true' },
      data: { licensed: true, plan: 'agency' },
    });
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'licensing_not_configured',
      licensingConfigured: false,
    });
  }
});

test('the client brief preview is watermarked and excludes internal delivery costs and margins', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Preview client brief', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  const brief = page.frameLocator('iframe[title="Client document preview"]');
  await expect(brief.locator('body')).toContainText('DEMO PREVIEW');
  await expect(brief.locator('body')).toContainText('Add a journal CMS collection');
  await expect(brief.locator('body')).toContainText('USD 800.00');
  await expect(brief.locator('body')).not.toContainText('$65');
  await expect(brief.locator('body')).not.toContainText('$520');
  await expect(brief.locator('body')).not.toContainText('35%');
  await page.getByRole('button', { name: 'Activate for PDF', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Activate ScopeLedger' })).toContainText(
    'Purchases and activation are unavailable',
  );
});

test('reduced motion disables animated navigation for mobile results and document readiness', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await settledMobileSidebar(page);
  await page.evaluate(() => {
    const requests: { id: string; behavior?: ScrollBehavior; block?: ScrollLogicalPosition }[] = [];
    Object.assign(window, { __scopeledgerScrollRequests: requests });
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
      if (typeof options === 'object')
        requests.push({ id: this.id, behavior: options.behavior, block: options.block });
      Reflect.apply(original, this, [options]);
    };
  });
  expect(
    await page
      .locator('.sidebar')
      .evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toBe('none');
  await page
    .locator('.mobile-decision-action')
    .getByRole('button', { name: 'Review decision', exact: true })
    .click();
  await settledMobileDecision(page);
  await page.getByRole('button', { name: 'Preview client brief', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await page.getByLabel('Document type', { exact: true }).selectOption('invoice');
  await page.getByRole('button', { name: /^Issuer legal details/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  await expect(page.getByLabel('Legal issuer name', { exact: true })).toBeFocused();
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          __scopeledgerScrollRequests: { id: string; behavior?: string; block?: string }[];
        }
      ).__scopeledgerScrollRequests,
  );
  expect(requests).toContainEqual({
    id: 'commercial-results',
    behavior: 'instant',
    block: 'start',
  });
  expect(requests).toContainEqual({ id: 'legal-name', behavior: 'instant', block: 'center' });
  expect(requests.some((request) => request.behavior === 'smooth')).toBe(false);
});
