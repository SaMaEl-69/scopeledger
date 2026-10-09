import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { createWorkspace, updateChange, recordApproval } from '../../src/domain/operations';
import { serializeWorkspace } from '../../src/storage/repository';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('output/product/2026-10-09');
const saved = (page: Page) =>
  expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
async function seed(page: Page, approved = false) {
  let w = createWorkspace();
  w.agency = {
    ...w.agency,
    legalName: 'Test Studio Limited',
    address: 'Test issuer address',
    email: 'studio@example.test',
    paymentInstructions: 'Use the agreed transfer method.',
  };
  w.clients[0].address = 'Test client billing address';
  w.projects[0].deadline = '2028-02-27';
  w.projects[0].additionalDays = '1';
  if (approved) {
    w = updateChange(w, w.changes[0].id, {
      feeMode: 'including-tax',
      fee: '1100',
      taxRate: '10',
      additionalDays: '2',
      contractConfirmed: true,
    });
    w = recordApproval(
      w,
      w.changes[0].id,
      'Written acceptance recorded for this exact revision.',
      '2020-01-02',
    );
  }
  await page.goto('/home/');
  await page.evaluate(
    (raw) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore('workspace');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            transaction = db.transaction('workspace', 'readwrite');
          transaction.objectStore('workspace').put({ raw, sequence: 0 }, 'current');
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
    serializeWorkspace(w),
  );
  await page.goto(
    `/workspace/?view=${approved ? 'documents' : 'workspace'}&project=${w.projects[0].id}&change=${w.changes[0].id}`,
  );
  await saved(page);
}
async function showNavigation(page: Page) {
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await toggle.isVisible()) await toggle.click();
}
async function navigationSettled(page: Page) {
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await expect
      .poll(() =>
        page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(1);
}
test('workspace identity opens settings and a newly uploaded logo updates both workspace avatars', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Open workspace settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  await page
    .locator('.logo-editor input[type=file]')
    .setInputFiles(resolve('tests/server/qa-logo.png'));
  await expect(page.locator('.agency-switch img')).toBeVisible();
  await expect(page.locator('.user-avatar img')).toBeVisible();
  await saved(page);
  const logo = await page.locator('.agency-switch img').getAttribute('src');
  await page.reload();
  await saved(page);
  await expect(page.locator('.agency-switch img')).toHaveAttribute('src', logo!);
  expect(
    await page
      .locator('.nav-item.active')
      .evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe('none');
  await page.getByRole('button', { name: 'Remove logo', exact: true }).click();
  await expect(page.locator('.agency-switch img')).toHaveCount(0);
  await expect(page.locator('.agency-avatar')).toHaveText('A');
});
test('inclusive fees, additional days and document choices survive reload and a real brief PDF export', async ({
  page,
  context,
  localApp,
}, info) => {
  await seed(page);
  try {
    const activation = await context.request.post(`${localApp.origin}/api/license/activate`, {
      headers: { Origin: localApp.origin },
      data: {
        key: localApp.keys.individual,
        plan: 'individual',
        deviceLabel: 'Fee and delivery QA',
      },
    });
    expect(activation.status()).toBe(200);
    await page.reload();
    await saved(page);
    await page
      .getByRole('navigation', { name: 'Project workflow' })
      .getByRole('button', { name: '2. Complete its baseline', exact: true })
      .click();
    await page.locator('.project-planning-disclosure > summary').click();
    await page.getByLabel('Additional project days', { exact: true }).fill('3');
    await expect(page.locator('#project-additional-days-hint')).toContainText('Mar 1, 2028');
    await page.getByLabel('Additional project days', { exact: true }).fill('1');
    await page
      .getByRole('navigation', { name: 'Project workflow' })
      .getByRole('button', { name: '5. Choose a fee', exact: true })
      .click();
    await page.getByLabel('Tax percentage', { exact: true }).fill('10');
    await page.getByLabel('Fee basis', { exact: true }).selectOption('including-tax');
    await expect(page.getByLabel('Proposed additional fee', { exact: true })).toHaveValue('880.00');
    await page.getByLabel('Fee basis', { exact: true }).selectOption('custom');
    await expect(page.getByRole('button', { name: 'Use suggested fee', exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel('Proposed additional fee', { exact: true }).fill('1000');
    await page.getByLabel('Fee basis', { exact: true }).selectOption('including-tax');
    await expect(page.getByLabel('Proposed additional fee', { exact: true })).toHaveValue(
      '1100.00',
    );
    await page.getByLabel('Additional delivery days', { exact: true }).fill('2');
    await expect(page.locator('.fee-breakdown')).toContainText('$1,000.00');
    await expect(page.locator('.fee-breakdown')).toContainText('$100.00');
    await page
      .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
      .check();
    await page.locator('.flow-action-dock .button.primary').click();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('.brief-summary')).toContainText('USD 1,100.00');
    await expect(frame.locator('body')).toContainText('2 additional calendar days');
    await expect(frame.locator('body')).toContainText('2028-03-01');
    await page.locator('.document-signature-editor summary').click();
    await page.getByLabel('Exclusions', { exact: true }).uncheck();
    await page.getByLabel('Include signature area in PDF', { exact: true }).uncheck();
    await expect(frame.getByRole('heading', { name: 'Exclusions', exact: true })).toHaveCount(0);
    await expect(frame.locator('.signoff')).toHaveCount(0);
    await saved(page);
    await page.reload();
    await saved(page);
    // Resume the persisted document draft directly after browser navigation resets the guided step.
    await showNavigation(page);
    await page.locator('.sidebar').getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(frame.getByRole('heading', { name: 'Exclusions', exact: true })).toHaveCount(0);
    await expect(frame.locator('.signoff')).toHaveCount(0);
    let payload: any;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/pdf')) payload = request.postDataJSON();
    });
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const download = await downloading;
    await mkdir(output, { recursive: true });
    await download.saveAs(resolve(output, `${info.project.name}-inclusive-brief.pdf`));
    expect(payload).toMatchObject({
      subtotal: '1000.00',
      tax: '100.00',
      total: '1100.00',
      additionalDays: '2',
      deliveryDate: '2028-03-01',
      sections: { exclusions: false },
      signatures: { enabled: false },
    });
    expect(payload).not.toHaveProperty('hours');
  } finally {
    await context.request
      .post(`${localApp.origin}/api/license/release`, {
        headers: { Origin: localApp.origin },
        data: {},
      })
      .catch(() => {});
  }
});
test('an invoice keeps the approved inclusive total, shows delivery timing and exports without platform attribution', async ({
  page,
  context,
  localApp,
}, info) => {
  await seed(page, true);
  try {
    const activation = await context.request.post(`${localApp.origin}/api/license/activate`, {
      headers: { Origin: localApp.origin },
      data: {
        key: localApp.keys.individual,
        plan: 'individual',
        deviceLabel: 'Invoice delivery QA',
      },
    });
    expect(activation.status()).toBe(200);
    await page.reload();
    await saved(page);
    await page.getByLabel('Document type', { exact: true }).selectOption('invoice');
    await page.getByLabel('Due date', { exact: true }).fill('2030-01-01');
    await expect(page.getByLabel('Manual tax percentage', { exact: true })).toBeDisabled();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('.amounts .total')).toContainText('USD 1,100.00');
    await expect(frame.locator('body')).toContainText('2028-03-01');
    await expect(frame.locator('body')).not.toContainText('Prepared with');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    await mkdir(output, { recursive: true });
    await (await downloading).saveAs(resolve(output, `${info.project.name}-inclusive-invoice.pdf`));
  } finally {
    await context.request
      .post(`${localApp.origin}/api/license/release`, {
        headers: { Origin: localApp.origin },
        data: {},
      })
      .catch(() => {});
  }
});
test('fee and document controls fit mobile, tablet and desktop widths in both themes', async ({
  page,
}, info) => {
  await seed(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((theme) => {
      localStorage.setItem('sl-theme', theme);
      window.dispatchEvent(new StorageEvent('storage', { key: 'sl-theme', newValue: theme }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 640, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 988 });
      await showNavigation(page);
      await page
        .locator('.sidebar')
        .getByRole('button', { name: 'Change requests', exact: true })
        .click();
      await navigationSettled(page);
      await page
        .getByRole('navigation', { name: 'Project workflow' })
        .getByRole('button', { name: '5. Choose a fee', exact: true })
        .click();
      await expect(page.getByLabel('Fee basis', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const fields = page.locator(
        '#price-section input:not([type=checkbox]), #price-section select',
      );
      for (const field of await fields.all())
        if (await field.isVisible()) {
          const box = await field.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        }
      if (info.project.name === 'chromium' && [390, 1440].includes(width)) {
        await mkdir(output, { recursive: true });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(output, `fee-${theme}-${width}.png`) });
      }
      await showNavigation(page);
      await page
        .locator('.sidebar')
        .getByRole('button', { name: 'Documents', exact: true })
        .click();
      await navigationSettled(page);
      const options = page.locator('.document-signature-editor');
      if ((await options.getAttribute('open')) === null) await options.locator('summary').click();
      await expect(options.getByLabel('Include signature area in PDF')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name === 'chromium' && [390, 1440].includes(width)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(output, `options-${theme}-${width}.png`) });
      }
    }
  }
  expect(errors).toEqual([]);
});
