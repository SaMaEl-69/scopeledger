import { showAllSteps } from './project-view';
import { expect, test, type Page } from '@playwright/test';
import { createWorkspace } from '../../src/domain/operations';
import { issueDocument } from '../../src/domain/commercial';
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
  await page.goto(`/workspace/?view=${workspace.context.view}`);
  await saved(page);
}

async function openDocuments(page: Page) {
  const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await navigation.isVisible()) await navigation.click();
  await page.locator('.sidebar').getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await saved(page);
}

async function prepareFromKeyboard(page: Page, kind: 'brief' | 'invoice') {
  await page.keyboard.press('ControlOrMeta+k');
  const commands = page.getByRole('dialog', { name: 'Find anything', exact: true });
  await expect(commands).toBeVisible();
  await commands
    .getByRole('combobox', { name: 'Search workspace records and actions' })
    .fill(kind === 'brief' ? 'Prepare a client brief' : 'Prepare an invoice');
  await commands
    .getByRole('option', {
      name: kind === 'brief' ? /^Prepare a client brief/ : /^Prepare an invoice/,
    })
    .click();
  await expect(commands).not.toBeVisible();
  await expect(page.getByLabel('Document type', { exact: true })).toHaveValue(kind);
  await saved(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T04:00:00Z'));
  await page.goto('/app');
  await saved(page);
});

test('document purposes and missing prerequisites are visible with direct routes to the needed field', async ({
  page,
}) => {
  await openDocuments(page);
  for (const name of ['Prepare brief', 'Prepare invoice', 'Prepare credit note']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole('button', { name: 'View document history', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare new document', exact: true })).toHaveCount(
    0,
  );
  const before = await stored(page);

  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare invoice', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Finish these details', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review and issue invoice', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^Issue and due dates/ }).click();
  await expect(page.getByLabel('Due date', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: /^Issuer legal details/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  await expect(page.getByLabel('Legal issuer name', { exact: true })).toBeFocused();

  const after = await stored(page);
  expect(after.documents).toEqual(before.documents);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.payments).toEqual(before.payments);
});

test('explicit keyboard preparation retains current edits and restores independent brief and invoice drafts', async ({
  page,
}) => {
  await openDocuments(page);
  const before = await stored(page);
  await page.getByLabel('Document reference', { exact: true }).fill('EASY-BRIEF-DRAFT');
  await page
    .getByLabel('Delivery implications', { exact: true })
    .fill('Start after content arrives.');
  await page
    .getByLabel('Approval requirements', { exact: true })
    .fill('Confirm this scope by email.');
  await prepareFromKeyboard(page, 'brief');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'EASY-BRIEF-DRAFT',
  );
  await expect(page.getByLabel('Delivery implications', { exact: true })).toHaveValue(
    'Start after content arrives.',
  );

  await prepareFromKeyboard(page, 'invoice');
  await page.getByLabel('Document reference', { exact: true }).fill('EASY-INVOICE-DRAFT');
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-20');
  await page.getByLabel('Manual tax percentage', { exact: true }).fill('.');
  await page
    .getByLabel('Payment instructions', { exact: true })
    .fill('Use the agreed bank details.');
  await prepareFromKeyboard(page, 'invoice');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'EASY-INVOICE-DRAFT',
  );
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-20');
  await expect(page.getByLabel('Manual tax percentage', { exact: true })).toHaveValue('.');
  await expect(
    page.getByRole('button', { name: 'Review and issue invoice', exact: true }),
  ).toBeDisabled();

  await prepareFromKeyboard(page, 'brief');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'EASY-BRIEF-DRAFT',
  );
  await expect(page.getByLabel('Approval requirements', { exact: true })).toHaveValue(
    'Confirm this scope by email.',
  );
  await prepareFromKeyboard(page, 'invoice');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'EASY-INVOICE-DRAFT',
  );
  await expect(page.getByLabel('Payment instructions', { exact: true })).toHaveValue(
    'Use the agreed bank details.',
  );
  await expect(page.getByLabel('Manual tax percentage', { exact: true })).toHaveValue('.');
  const after = await stored(page);
  expect(after.changes).toEqual(before.changes);
  expect(after.documents).toEqual(before.documents);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.payments).toEqual(before.payments);
});

test('preparing from an issued record restores the editable draft and leaves the saved snapshot intact', async ({
  page,
}) => {
  let fixture = createWorkspace();
  fixture = issueDocument(fixture, fixture.changes[0].id, 'brief', {
    reference: 'EASY-PRESERVED-BRIEF',
    issueDate: '2026-10-01',
    demo: true,
  });
  fixture.context.view = 'documents';
  fixture.sequence = 1;
  await seed(page, fixture);
  const before = await stored(page);
  await page.getByLabel('Document reference', { exact: true }).fill('EASY-NEXT-BRIEF');
  await page.getByLabel('Document footer', { exact: true }).fill('Keep this new draft footer.');
  await page.getByRole('button', { name: 'View document history', exact: true }).click();
  await page.locator('.document-history-row').filter({ hasText: 'EASY-PRESERVED-BRIEF' }).click();
  await expect(page.locator('.document-controls h2')).toHaveText('EASY-PRESERVED-BRIEF');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveCount(0);

  await prepareFromKeyboard(page, 'brief');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'EASY-NEXT-BRIEF',
  );
  await expect(page.getByLabel('Document footer', { exact: true })).toHaveValue(
    'Keep this new draft footer.',
  );
  await expect(page.locator('.document-controls h2')).toHaveText('Prepare a client document');
  await expect(page.locator('.document-history-row.selected')).toHaveCount(0);
  expect((await stored(page)).documents).toEqual(before.documents);
});

test('unissued drafts survive reload with signature names and are included in the downloaded backup', async ({
  page,
}) => {
  await openDocuments(page);
  await page.getByLabel('Document reference', { exact: true }).fill('PERSISTED-BRIEF-001');
  await page.getByLabel('Document footer', { exact: true }).fill('Draft footer to recover.');
  await page.locator('.document-signature-editor > summary').click();
  await page.getByLabel('Issuer signatory name', { exact: true }).fill('Studio director');
  await stored(page);
  await page.reload();
  await saved(page);
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'PERSISTED-BRIEF-001',
  );
  await expect(page.getByLabel('Document footer', { exact: true })).toHaveValue(
    'Draft footer to recover.',
  );
  await expect(page.getByLabel('Issuer signatory name', { exact: true })).toHaveValue(
    'Studio director',
  );
  await prepareFromKeyboard(page, 'invoice');
  await page.getByLabel('Document reference', { exact: true }).fill('PERSISTED-INVOICE-001');
  await page.getByLabel('Manual tax percentage', { exact: true }).fill('.');
  await stored(page);
  await page.reload();
  await saved(page);
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'PERSISTED-INVOICE-001',
  );
  await expect(page.getByLabel('Manual tax percentage', { exact: true })).toHaveValue('.');
  const current = await stored(page);
  expect(current.documentDrafts).toHaveLength(2);
  expect(current.documents).toEqual([]);
  await page.keyboard.press('Control+k');
  await page
    .getByRole('combobox', { name: 'Search workspace records and actions' })
    .fill('Export workspace backup');
  await page.keyboard.press('Enter');
  const security = page.getByRole('dialog', { name: 'Back up your workspace' });
  await security.getByLabel('Use an unencrypted JSON file instead').check();
  await security
    .getByLabel('I understand anyone with this JSON file can read its client and project details.')
    .check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    security.getByRole('button', { name: 'Download JSON backup', exact: true }).click(),
  ]);
  const file = await download.path();
  if (!file) throw new Error('Backup not downloaded');
  const { readFile } = await import('node:fs/promises');
  const backup = JSON.parse(await readFile(file, 'utf8'));
  expect(backup.documentDrafts).toEqual(current.documentDrafts);
  await prepareFromKeyboard(page, 'brief');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'PERSISTED-BRIEF-001',
  );
});
