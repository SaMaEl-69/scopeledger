import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createWorkspace, updateChange, recordApproval } from '../../src/domain/operations';
import { confirmDefaults } from '../../src/domain/setup';
import { issueDocument } from '../../src/domain/commercial';
import { emptySignatures } from '../../src/documents/signatures';
import { serializeWorkspace, parseBackup } from '../../src/storage/repository';
import type { Workspace } from '../../src/domain/types';
import { logo } from '../server/fixtures.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const saved = (page: Page) =>
  expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
async function seed(page: Page, approved = false, history = false) {
  let w = createWorkspace();
  w.agency = {
    ...w.agency,
    legalName: 'Test Studio Limited',
    address: 'Test issuer address',
    email: 'studio@example.test',
    paymentInstructions: 'Use the agreed transfer method.',
  };
  w.clients[0].address = 'Test client billing address';
  w = confirmDefaults(w);
  w = updateChange(w, w.changes[0].id, {
    feeMode: 'including-tax',
    fee: '1100',
    taxRate: '10',
    contractConfirmed: true,
  });
  if (approved)
    w = recordApproval(
      w,
      w.changes[0].id,
      'Written acceptance recorded for this exact revision.',
      '2020-01-02',
    );
  if (history) {
    w.agency.logoDataUrl = logo;
    const signatures = emptySignatures('brief');
    signatures.issuer.imageDataUrl = logo;
    for (let n = 0; n < 4; n++)
      w = issueDocument(w, w.changes[0].id, 'brief', { reference: `BRF-${n}`, signatures });
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
          transaction
            .objectStore('workspace')
            .put({ raw, sequence: JSON.parse(raw).sequence }, 'current');
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
    `/workspace/?view=workspace&project=${w.projects[0].id}&change=${w.changes[0].id}`,
  );
  await saved(page);
  return w;
}
async function stored(page: Page): Promise<Workspace> {
  await saved(page);
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
const step = (page: Page, number: number) =>
  page
    .getByRole('navigation', { name: 'Project workflow' })
    .getByRole('button', { name: new RegExp(`^${number}\\.`) })
    .click();
async function settings(page: Page) {
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Settings & backup', exact: true })
    .click();
  await saved(page);
}

test('tax edits update inclusive totals, retain the last valid basis while typing, and respect custom amounts', async ({
  page,
}) => {
  await seed(page);
  await step(page, 5);
  const tax = page.getByLabel('Tax percentage', { exact: true }),
    fee = page.getByLabel('Proposed additional fee', { exact: true });
  await tax.fill('20');
  await expect(fee).toHaveValue('1200.00');
  await tax.fill('');
  await expect(fee).toHaveValue('1200.00');
  await tax.fill('15');
  await expect(fee).toHaveValue('1150.00');
  await tax.fill('101');
  await expect(fee).toHaveValue('1150.00');
  await tax.fill('0');
  await expect(fee).toHaveValue('1000.00');
  await page.getByLabel('Fee basis', { exact: true }).selectOption('custom');
  await fee.fill('600');
  await tax.fill('25');
  await expect(fee).toHaveValue('600');
  await expect(page.locator('.fee-breakdown')).toContainText('$750.00');
  await page.getByLabel('Fee basis', { exact: true }).selectOption('including-tax');
  await expect(fee).toHaveValue('750.00');
  await tax.fill('50');
  await expect(fee).toHaveValue('900.00');
  await saved(page);
  const w = await stored(page);
  expect(w.changes[0]).toMatchObject({ feeMode: 'including-tax', fee: '900.00', taxRate: '50' });
  expect(w.documents).toEqual([]);
  expect(w.approvals).toEqual([]);
});

test('guided brief/invoice switching keeps independent drafts and the selected document through export and Back', async ({
  page,
}) => {
  const before = await seed(page, true);
  await step(page, 6);
  const switcher = page.getByRole('group', { name: 'Document type', exact: true });
  await expect(switcher.getByRole('button', { name: 'Brief', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click();
  await page.getByLabel('Document reference', { exact: true }).fill('BRIEF-EDIT');
  await switcher.getByRole('button', { name: 'Invoice', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review the invoice', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Document reference', { exact: true }).fill('INV-EDIT');
  await page.getByLabel('Due date', { exact: true }).fill('2030-01-01');
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Invoice', exact: true }),
  ).toBeVisible();
  await expect(page.frameLocator('iframe').locator('.amounts .total')).toContainText(
    'USD 1,100.00',
  );
  await switcher.getByRole('button', { name: 'Brief', exact: true }).click();
  await page.getByRole('button', { name: 'Edit document details', exact: true }).click();
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue('BRIEF-EDIT');
  await switcher.getByRole('button', { name: 'Invoice', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to export', exact: true }).click();
  await expect(switcher.getByRole('button', { name: 'Invoice', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '7. Export', exact: true })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(page.frameLocator('iframe').locator('body')).toContainText('INV-EDIT');
  await page
    .locator('.flow-action-dock')
    .getByRole('button', { name: 'Back', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '6. Review the invoice', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  await page
    .locator('.flow-action-dock')
    .getByRole('button', { name: 'Back', exact: true })
    .click();
  await expect(
    page
      .locator('.flow-action-dock')
      .getByRole('button', { name: 'Review the invoice', exact: true }),
  ).toBeVisible();
  await page
    .locator('.flow-action-dock')
    .getByRole('button', { name: 'Review the invoice', exact: true })
    .click();
  await expect(switcher.getByRole('button', { name: 'Invoice', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const after = await stored(page);
  expect(after.documents).toEqual(before.documents);
  expect(after.approvals).toEqual(before.approvals);
});

test('switching to invoice cannot bypass approval and fits responsive layouts in both themes', async ({
  page,
}, info) => {
  await seed(page);
  await step(page, 6);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const switcher = page.getByRole('group', { name: 'Document type', exact: true });
  await switcher.getByRole('button', { name: 'Invoice', exact: true }).click();
  await expect(page.locator('.document-readiness').first()).toContainText('approval');
  await expect(
    page.getByRole('button', { name: 'Continue to export', exact: true }),
  ).toBeDisabled();
  expect((await stored(page)).approvals).toEqual([]);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      localStorage.setItem('sl-theme', theme);
      window.dispatchEvent(new StorageEvent('storage', { key: 'sl-theme', newValue: theme }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 588, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 988 });
      for (const kind of ['Brief', 'Invoice']) {
        await switcher.getByRole('button', { name: kind, exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        for (const button of await switcher.getByRole('button').all()) {
          const box = (await button.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
          expect(box.height).toBeGreaterThanOrEqual(42);
        }
      }
      if (info.project.name === 'chromium' && [390, 1440].includes(width)) {
        await mkdir(resolve('output/product/document-storage'), { recursive: true });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: resolve(`output/product/document-storage/switch-${theme}-${width}.png`),
        });
      }
    }
    const a11y = await new AxeBuilder({ page }).include('.guided-document-switch').analyze();
    expect(a11y.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('real PNG, JPEG, WebP, GIF, AVIF and BMP uploads normalize safely, including a 2 MiB source', async ({
  page,
}) => {
  await seed(page);
  await settings(page);
  const upload = page.getByLabel('Upload agency logo image');
  const generated = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#00734e';
    context.fillRect(0, 0, 240, 120);
    return {
      jpeg: canvas.toDataURL('image/jpeg').split(',')[1],
      webp: canvas.toDataURL('image/webp').split(',')[1],
    };
  });
  const png = await readFile(resolve('tests/server/qa-logo.png')),
    boundary = Buffer.alloc(2 * 1024 * 1024);
  png.copy(boundary);
  for (const [name, mimeType, buffer] of [
    ['boundary.png', 'image/png', boundary],
    ['logo.jpg', 'image/jpeg', Buffer.from(generated.jpeg, 'base64')],
    ['logo.webp', 'image/webp', await readFile(resolve('tests/fixtures/images/logo.webp'))],
    ...(await Promise.all(
      ['gif', 'avif', 'bmp'].map(async (format) => [
        `logo.${format}`,
        `image/${format}`,
        await readFile(resolve(`tests/fixtures/images/logo.${format}`)),
      ]),
    )),
  ] as [string, string, Buffer][]) {
    await upload.setInputFiles({ name, mimeType, buffer });
    await expect(page.locator('.agency-logo-preview')).toBeVisible();
    await expect(page.locator('.logo-editor [role=alert]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Replace logo', exact: true })).toBeEnabled();
    await saved(page);
    const image = (await stored(page)).agency.logoDataUrl!;
    expect(image).toMatch(/^data:image\/png;base64,/);
    expect(image.length).toBeLessThanOrEqual(410000);
  }
  const before = (await stored(page)).agency.logoDataUrl;
  await upload.setInputFiles({
    name: 'too-large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  await expect(page.locator('.logo-editor [role=alert]')).toContainText('2 MiB');
  expect((await stored(page)).agency.logoDataUrl).toBe(before);
  await page.locator('.sidebar').getByRole('button', { name: 'Documents', exact: true }).click();
  await page.locator('.document-signature-editor > summary').click();
  await page
    .getByLabel('Import issuer signature')
    .setInputFiles(resolve('tests/fixtures/images/logo.avif'));
  await expect(page.locator('.document-signature-editor [role=alert]')).toHaveCount(0);
  await expect(page.locator('.signature-image-preview img').first()).toBeVisible();
});

test('compact encrypted backups restore exact document images, and storage retention is an explicit choice', async ({
  page,
}) => {
  const before = await seed(page, false, true);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => false,
        persist: async () => true,
        estimate: async () => ({ usage: 1024, quota: 100 * 1048576 }),
      },
    });
  });
  await page.reload();
  await saved(page);
  await settings(page);
  await expect(page.getByRole('meter', { name: 'Workspace storage used' })).toHaveAttribute(
    'max',
    String(50 * 1024 * 1024),
  );
  await expect(page.locator('.backup-card')).toContainText('/ 50 MiB');
  await page.getByRole('button', { name: 'Keep storage on this device', exact: true }).click();
  await expect(page.locator('.device-storage-status [role=status]')).toContainText(
    'Persistent storage enabled',
  );
  await page
    .locator('.backup-card')
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const privacy = page.getByRole('dialog', { name: 'Back up your workspace' });
  const phrase = 'Unique recovery phrase for browser QA';
  await privacy.getByLabel('Backup passphrase').fill(phrase);
  await privacy.getByLabel('Confirm passphrase').fill(phrase);
  const downloadPromise = page.waitForEvent('download');
  await privacy.getByRole('button', { name: 'Download encrypted backup', exact: true }).click();
  const file = await (await downloadPromise).path();
  if (!file) throw new Error('Missing backup download');
  const encrypted = await readFile(file, 'utf8');
  expect(JSON.parse(encrypted).format).toBe('scopeledger-encrypted-backup');
  expect(encrypted).not.toContain(logo);
  await page.getByRole('button', { name: 'Remove logo', exact: true }).click();
  await saved(page);
  await page.getByTestId('backup-file').setInputFiles({
    name: 'compact-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encrypted),
  });
  const unlock = page.getByRole('dialog', { name: 'Unlock your backup' });
  await unlock.getByLabel('Backup passphrase').fill(phrase);
  await unlock.getByRole('button', { name: 'Unlock backup', exact: true }).click();
  const restoring = page.getByRole('dialog', { name: 'Review workspace replacement' });
  await restoring
    .getByRole('checkbox', { name: /I understand this will replace my current workspace/ })
    .check();
  await restoring.getByRole('button', { name: 'Replace workspace', exact: true }).click();
  await expect(restoring).not.toBeVisible();
  const after = await stored(page);
  expect(after.documents).toEqual(before.documents);
  expect(after.agency.logoDataUrl).toBe(logo);
  expect(parseBackup(serializeWorkspace(after)).documents).toEqual(before.documents);
});
