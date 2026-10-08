import { showAllSteps } from './project-view';
import { expect, test, type Page } from '@playwright/test';
import { createWorkspace, recordApproval } from '../../src/domain/operations';
import { issueDocument, recordPayment } from '../../src/domain/commercial';
import type { Workspace } from '../../src/domain/types';

async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}

async function stored(page: Page): Promise<Workspace> {
  await saved(page);
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const request = database.transaction('workspace').objectStore('workspace').get('current');
          request.onerror = () => {
            database.close();
            reject(request.error);
          };
          request.onsuccess = () => {
            database.close();
            resolve(JSON.parse(request.result.raw));
          };
        };
      }),
  );
}

async function seed(page: Page, workspace: Workspace) {
  await page.evaluate(
    (fixture) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction('workspace', 'readwrite');
          transaction
            .objectStore('workspace')
            .put({ raw: JSON.stringify(fixture), sequence: fixture.sequence }, 'current');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    workspace,
  );
  await page.reload();
  await saved(page);
}

async function navigate(page: Page, name: string) {
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await saved(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T04:00:00Z'));
  await page.goto('/app');
  await saved(page);
});

test('invoice shortcut preserves independent brief and invoice drafts and retains the approval gate', async ({
  page,
}) => {
  await navigate(page, 'Documents');
  const before = await stored(page);
  await page.getByLabel('Document reference', { exact: true }).fill('WORKING-BRIEF');
  await page.getByLabel('Delivery implications', { exact: true }).fill('Brief delivery wording');
  await page.getByLabel('Approval requirements', { exact: true }).fill('Brief approval wording');
  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  await expect(page.getByLabel('Document type', { exact: true })).toHaveValue('invoice');
  await expect(page.getByLabel('Delivery implications', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Approval requirements', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Review and issue invoice', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Document reference', { exact: true }).fill('WORKING-INVOICE');
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-20');
  await page.getByLabel('Manual tax percentage', { exact: true }).fill('5');
  await page
    .getByLabel('Payment instructions', { exact: true })
    .fill('Synthetic manual payment details');
  await page.getByLabel('Document type', { exact: true }).selectOption('brief');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue('WORKING-BRIEF');
  await expect(page.getByLabel('Delivery implications', { exact: true })).toHaveValue(
    'Brief delivery wording',
  );
  await expect(page.getByLabel('Approval requirements', { exact: true })).toHaveValue(
    'Brief approval wording',
  );
  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'WORKING-INVOICE',
  );
  await expect(page.getByLabel('Manual tax percentage', { exact: true })).toHaveValue('5');
  await expect(
    page.getByRole('button', { name: 'Review and issue invoice', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^Approval for this revision/ }).click();
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  const after = await stored(page);
  expect(after.projects).toEqual(before.projects);
  expect(after.changes).toEqual(before.changes);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.documents).toEqual(before.documents);
  expect(after.payments).toEqual(before.payments);
});

test('issued history is chronological, reachable and recoverable with frozen partial balances', async ({
  page,
}) => {
  let fixture = createWorkspace();
  fixture.agency = {
    ...fixture.agency,
    legalName: 'Synthetic legal issuer',
    address: 'Synthetic issuer address',
    email: 'issuer@example.test',
    timezone: 'Asia/Dhaka',
  };
  fixture.clients[0].address = 'Synthetic client billing address';
  fixture.changes[0].contractConfirmed = true;
  fixture = recordApproval(
    fixture,
    fixture.changes[0].id,
    'Synthetic client approval',
    '2020-01-02',
  );
  fixture = issueDocument(fixture, fixture.changes[0].id, 'invoice', {
    reference: 'ISSUED-PARTIAL-001',
    issueDate: '2026-10-01',
    dueDate: '2026-10-20',
    taxRate: '5',
    paymentInstructions: 'Synthetic manual instructions',
    demo: true,
  });
  fixture.documents[0].createdAt = '2026-10-01T123045Z';
  fixture.documents[0].issuedAt = fixture.documents[0].createdAt;
  const invoiceId = fixture.documents[0].id;
  fixture = recordPayment(fixture, invoiceId, {
    id: 'workbench-partial-receipt',
    amount: '240',
    date: '2020-01-10',
    reference: 'Synthetic receipt',
  });
  fixture = issueDocument(fixture, fixture.changes[0].id, 'brief', {
    reference: 'NEWER-BRIEF-002',
    issueDate: '2026-10-01',
    demo: true,
  });
  fixture.documents[1].createdAt = '2026-10-01T14:45:00+02:00';
  fixture.documents[1].issuedAt = fixture.documents[1].createdAt;
  fixture.context.view = 'documents';
  fixture.sequence = 1;
  await seed(page, fixture);
  const before = await stored(page);
  await page.getByRole('button', { name: 'View document history', exact: true }).click();
  await expect(page.locator('.document-history-heading h2')).toBeFocused();
  const rows = page.locator('.document-history-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('NEWER-BRIEF-002');
  const invoice = rows.filter({ hasText: 'ISSUED-PARTIAL-001' });
  await expect(invoice).toContainText('$600.00 outstanding');
  await expect(invoice).toContainText('Partially paid');
  await invoice.click();
  await expect(page.locator('.document-controls h2')).toBeFocused();
  await expect(page.locator('.document-controls h2')).toHaveText('ISSUED-PARTIAL-001');
  await expect(page.getByLabel('Document type', { exact: true })).toHaveValue('invoice');
  for (const value of ['$840.00', '$240.00', '$600.00', 'Partially paid'])
    await expect(page.locator('.document-balance')).toContainText(value);
  await expect(page.getByRole('heading', { name: 'Payment history', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View document history', exact: true }).click();
  await page.getByLabel('Filter document status', { exact: true }).selectOption('voided');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('.document-history-empty')).toContainText(
    'No documents match these filters',
  );
  await page.getByRole('button', { name: 'Clear document filters', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await navigate(page, 'Settings & backup');
  await page.getByLabel('Agency name', { exact: true }).fill('Changed current agency');
  await saved(page);
  await navigate(page, 'Documents');
  await page.getByRole('button', { name: 'View document history', exact: true }).click();
  await page.locator('.document-history-row').filter({ hasText: 'ISSUED-PARTIAL-001' }).click();
  await expect(page.locator('.document-balance')).toContainText('$600.00');
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: 'View document history', exact: true }).click();
  await page.locator('.document-history-row').filter({ hasText: 'ISSUED-PARTIAL-001' }).click();
  await expect(page.locator('.document-balance')).toContainText('$600.00');
  const after = await stored(page);
  expect(after.projects).toEqual(before.projects);
  expect(after.changes).toEqual(before.changes);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.documents).toEqual(before.documents);
  expect(after.payments).toEqual(before.payments);
});
