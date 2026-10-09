import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Workspace } from '../../src/domain/types';

const titles = [
  'Choose a project',
  'Complete its baseline',
  'Load or describe a change',
  'Review costs',
  'Choose a fee',
  'Review the brief',
  'Export',
];
async function open(page: Page) {
  await page.goto('/workspace/');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  const heading = page.getByRole('heading', { name: 'Change requests', exact: true });
  if (!(await heading.isVisible())) {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Change requests', exact: true })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
}
async function step(page: Page, number: number) {
  await page
    .getByRole('navigation', { name: 'Project workflow' })
    .getByRole('button', { name: `${number}. ${titles[number - 1]}`, exact: true })
    .click();
  await current(page, number);
  if (number <= 5)
    await expect(
      page.locator(
        [
          '',
          '#current-project',
          '#project-baseline',
          '#request-section',
          '#cost-section',
          '#price-section',
        ][number],
      ),
    ).toBeFocused();
}
async function current(page: Page, number: number) {
  await expect(
    page
      .getByRole('navigation', { name: 'Project workflow' })
      .getByRole('button', { name: `${number}. ${titles[number - 1]}`, exact: true }),
  ).toHaveAttribute('aria-current', 'step');
}
async function next(page: Page) {
  await page.locator('.flow-action-dock .button.primary').click();
}
async function stored(page: Page): Promise<Workspace> {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            r = db.transaction('workspace').objectStore('workspace').get('current');
          r.onsuccess = () => {
            db.close();
            resolve(JSON.parse(r.result.raw));
          };
          r.onerror = () => reject(r.error);
        };
      }),
  );
}

test('the prescribed seven-step workflow prepares and explicitly exports the public brief without approving or reconciling work', async ({
  page,
}) => {
  let exports = 0;
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/license/status', (route) =>
    route.fulfill({
      json: {
        configured: true,
        mode: 'live',
        active: true,
        plan: 'individual',
        slotsUsed: 1,
        slotsLimit: 1,
      },
    }),
  );
  await page.route('**/api/pdf', async (route) => {
    exports++;
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.7\n% Synthetic browser transport fixture\n%%EOF'),
    });
  });
  await open(page);
  const before = await stored(page);
  await expect(
    page.getByRole('navigation', { name: 'Project workflow' }).getByRole('button'),
  ).toHaveCount(7);
  await current(page, 1);
  await expect(page.getByLabel('Current project', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Request title', { exact: true })).not.toBeVisible();
  await next(page);
  await current(page, 2);
  await expect(page.locator('.baseline-scope-summary')).toHaveText(
    before.projects[0].baseline.approvedScope,
  );
  await next(page);
  await current(page, 3);
  await expect(page.getByLabel('Request title', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Hours needed', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Use an example request', exact: true }).click();
  const scenario = page.getByRole('dialog', { name: 'Common agency scenarios' });
  await scenario.getByRole('button', { name: /Add a CMS collection during the build/ }).click();
  await scenario
    .getByRole('checkbox', { name: /Replace this change’s existing scope text/ })
    .check();
  await scenario.getByRole('button', { name: 'Load scenario', exact: true }).click();
  await next(page);
  await current(page, 4);
  await expect(page.getByLabel('Request title', { exact: true })).not.toBeVisible();
  await page.getByLabel('Hours needed', { exact: true }).fill('8');
  await page.getByLabel('Hourly cost', { exact: true }).fill('65');
  await next(page);
  await current(page, 5);
  await page.getByLabel('Proposed additional fee', { exact: true }).fill('800');
  await page
    .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
    .check();
  await next(page);
  await current(page, 6);
  await expect(
    page.getByRole('button', { name: 'Prepare invoice', exact: true }),
  ).not.toBeVisible();
  await expect(
    page
      .frameLocator('.client-document-frame')
      .getByRole('heading', { name: 'Change brief', exact: true }),
  ).toBeVisible();
  expect(exports).toBe(0);
  await page.getByRole('button', { name: 'Continue to export', exact: true }).click();
  await current(page, 7);
  expect(exports).toBe(0);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await file.failure()).toBeNull();
  expect(exports).toBe(1);
  expect(payload).toMatchObject({
    kind: 'brief',
    currency: 'USD',
    subtotal: '800.00',
    total: '800.00',
    demo: false,
  });
  for (const privateKey of [
    'baseline',
    'hours',
    'rate',
    'grossCost',
    'netCost',
    'target',
    'agreedMargin',
  ])
    expect(payload).not.toHaveProperty(privateKey);
  const after = await stored(page);
  expect(after.projects).toEqual(before.projects);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.reconciliations).toEqual(before.reconciliations);
  expect(after.documents).toEqual(before.documents);
  expect(after.changes[0].status).toBe('Draft');
  await page.locator('.sidebar').getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare invoice', exact: true })).toBeVisible();
});

test('incomplete baselines, costs and agreements direct the user back to the required step without exporting', async ({
  page,
}) => {
  let exports = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/pdf')) exports++;
  });
  await open(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create a project' });
  await create.getByLabel('Project name', { exact: true }).fill('Sequence / Project');
  await create.getByLabel('Client name', { exact: true }).fill('Sequence Client');
  await create.getByRole('button', { name: 'Create project', exact: true }).click();
  await current(page, 2);
  await page.getByRole('button', { name: '6. Review the brief', exact: true }).click();
  await current(page, 2);
  await expect(page.getByRole('alert')).toContainText('baseline');
  await next(page);
  const baseline = page.getByRole('dialog', { name: 'Approved project baseline' });
  await baseline.getByLabel('Approved fee, excluding tax').fill('8000');
  await baseline.getByLabel('Actual cost already incurred').fill('2000');
  await baseline.getByLabel('Forecast remaining cost').fill('3200');
  await baseline.getByLabel('Approved scope').fill('Approved five-page website.');
  await baseline.getByRole('button', { name: 'Save baseline', exact: true }).click();
  await current(page, 3);
  await next(page);
  await current(page, 3);
  await expect(page.getByRole('alert')).toContainText('deliverables');
  await page.getByLabel('Request title', { exact: true }).fill('New journal');
  await page
    .getByLabel('Describe the change', { exact: true })
    .fill('Add a journal CMS collection.');
  await page
    .getByLabel('Deliverables', { exact: true })
    .fill('Journal collection and reusable template.');
  await next(page);
  await current(page, 4);
  await page.getByLabel('Hours needed', { exact: true }).fill('.');
  await next(page);
  await current(page, 4);
  await expect(page.getByRole('alert').last()).toContainText('delivery estimate');
  await page.getByLabel('Hours needed', { exact: true }).fill('8');
  await page.getByLabel('Hourly cost', { exact: true }).fill('65');
  await next(page);
  await current(page, 5);
  await page.getByLabel('Proposed additional fee', { exact: true }).fill('800');
  await next(page);
  await current(page, 5);
  await expect(page.getByRole('alert')).toContainText('agreement');
  await page
    .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
    .check();
  await page.getByRole('button', { name: '7. Export', exact: true }).click();
  await current(page, 6);
  await expect(
    page.getByRole('button', { name: 'Continue to export', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^Studio defaults reviewed/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm these defaults', exact: true }).click();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await open(page);
  await page.getByRole('button', { name: '6. Review the brief', exact: true }).click();
  await current(page, 6);
  await page.getByRole('button', { name: 'Continue to export', exact: true }).click();
  await current(page, 7);
  await page.getByRole('button', { name: 'Activate for PDF', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Activate ScopeLedger' })).toBeVisible();
  expect(exports).toBe(0);
});

test('every guided step fits phone tablet and desktop in both themes and passes accessibility checks', async ({
  page,
}, info) => {
  const output = resolve(process.env.SCOPELEDGER_SEQUENCE_OUTPUT ?? 'output/audit/sequence');
  await mkdir(resolve(output, 'screens'), { recursive: true });
  for (const theme of ['dark', 'light'])
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await page.evaluate((value) => localStorage.setItem('sl-theme', value), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await step(page, 5);
      await page
        .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
        .check();
      for (let number = 1; number <= 7; number++) {
        await step(page, number);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${theme} ${width} step ${number}`,
        ).toBe(true);
        if (number <= 5) {
          const dock = page.locator('.flow-action-dock');
          await expect(dock).toBeInViewport();
          const box = await dock.boundingBox();
          expect(box!.y + box!.height).toBeLessThanOrEqual(900);
        }
        if (width === 320) {
          const scan = await new AxeBuilder({ page })
            .setLegacyMode()
            .options({ iframes: false })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          expect(scan.violations, JSON.stringify(scan.violations)).toEqual([]);
        }
        if ((width === 320 || width === 1440) && [3, 5, 6, 7].includes(number))
          await page.screenshot({
            path: resolve(
              output,
              'screens',
              `${info.project.name}-${theme}-${width}-step-${number}.png`,
            ),
          });
      }
    }
});

test('a deferred request can reach its no-commitment brief without inventing cost or fee inputs', async ({
  page,
}) => {
  await open(page);
  const fixture = await stored(page);
  Object.assign(fixture.changes[0], {
    route: 'Defer',
    hours: '',
    rate: '',
    outside: '',
    fee: '',
    contractConfirmed: false,
  });
  fixture.sequence += 1;
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(
            { raw: JSON.stringify(data), sequence: data.sequence },
            'current',
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    fixture,
  );
  await page.reload();
  await step(page, 5);
  await next(page);
  await current(page, 6);
  await expect(
    page
      .frameLocator('.client-document-frame')
      .getByText(/Deferred request: no delivery, date or fee commitment/),
  ).toBeVisible();
  const after = await stored(page);
  expect(after.changes[0].hours).toBe('');
  expect(after.changes[0].fee).toBe('');
  expect(after.approvals).toHaveLength(0);
  expect(after.reconciliations).toHaveLength(0);
});

test('plain-language choices preserve response rules and deferral keeps unknown estimates unchanged', async ({
  page,
}) => {
  await open(page);
  const before = await stored(page);
  await step(page, 3);
  await page.getByLabel('Type of change', { exact: true }).selectOption('Included');
  await expect(page.getByText(/Already covered by the agreement/)).toBeVisible();
  await page.getByLabel('Type of change', { exact: true }).selectOption('Addition');
  await step(page, 4);
  await page.getByLabel('Hours needed', { exact: true }).fill('.');
  await page.getByRole('button', { name: 'Keep this request for later', exact: true }).click();
  await current(page, 5);
  const response = page.getByLabel('How will you handle this change?', { exact: true });
  await expect(response).toHaveValue('Defer');
  await expect(page.getByLabel('Proposed additional fee', { exact: true })).not.toBeVisible();
  await next(page);
  await current(page, 6);
  await expect(
    page
      .frameLocator('.client-document-frame')
      .getByText(/Deferred request: no delivery, date or fee commitment/),
  ).toBeVisible();
  await step(page, 5);
  await response.selectOption('Quote');
  await next(page);
  await current(page, 4);
  await expect(page.getByRole('alert')).toContainText('delivery estimate');
  await page.getByLabel('Hours needed', { exact: true }).fill('8');
  await next(page);
  await response.selectOption('Absorb');
  await expect(page.getByLabel('Proposed additional fee', { exact: true })).toHaveValue('0');
  await page
    .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
    .check();
  await next(page);
  await current(page, 6);
  await expect(
    page.frameLocator('.client-document-frame').locator('.brief-summary strong'),
  ).toHaveText('USD 0.00');
  const after = await stored(page);
  expect(after.changes[0].fee).toBe(before.changes[0].fee);
  expect(after.changes[0].route).toBe('Absorb');
  expect(after.changes[0].status).toBe('Draft');
  expect(after.approvals).toEqual(before.approvals);
  expect(after.reconciliations).toEqual(before.reconciliations);
  expect(after.documents).toEqual(before.documents);
});

test('rapid step changes remain reliable with normal and reduced motion', async ({ page }) => {
  await open(page);
  const before = await stored(page);
  const nav = page.getByRole('navigation', { name: 'Project workflow' });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    for (let repeat = 0; repeat < 3; repeat++)
      for (const [from, to] of [
        [5, 1],
        [4, 3],
        [3, 5],
        [2, 4],
      ]) {
        await nav
          .getByRole('button', { name: `${from}. ${titles[from - 1]}`, exact: true })
          .click();
        await nav.getByRole('button', { name: `${to}. ${titles[to - 1]}`, exact: true }).click();
        await current(page, to);
      }
  }
  const after = await stored(page);
  expect(after.changes).toEqual(before.changes);
  expect(after.projects).toEqual(before.projects);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.reconciliations).toEqual(before.reconciliations);
});
