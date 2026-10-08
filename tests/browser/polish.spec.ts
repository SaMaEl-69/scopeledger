import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createProject, createWorkspace } from '../../src/domain/operations';
import type { Workspace } from '../../src/domain/types';
import type { Repository } from '../../src/storage/repository';

async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}

async function open(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await saved(page);
}

async function stored(page: Page): Promise<Workspace> {
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const read = db.transaction('workspace').objectStore('workspace').get('current');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(JSON.parse(read.result.raw));
          };
        };
      }),
  );
}

async function seed(page: Page, workspace: Workspace) {
  await open(page);
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction('workspace', 'readwrite');
          transaction
            .objectStore('workspace')
            .put({ raw: JSON.stringify(data), sequence: data.sequence }, 'current');
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
    workspace,
  );
  await page.reload();
  await saved(page);
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await saved(page);
}

async function exported(page: Page, button: ReturnType<Page['getByRole']>): Promise<Workspace> {
  const downloading = page.waitForEvent('download');
  await button.click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('The current workspace export did not produce a downloaded file.');
  return JSON.parse(await readFile(path, 'utf8')) as Workspace;
}

async function planning(page: Page) {
  const disclosure = page.locator('details').filter({
    has: page.locator('summary').filter({ hasText: 'Project planning' }),
  });
  if (!(await disclosure.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await disclosure.locator('summary').click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T04:00:00Z'));
});

test('failed-save reload requires a current export and never changes backup metadata', async ({
  page,
}) => {
  await open(page);
  const before = await stored(page);
  await page.evaluate(async () => {
    const source = '/src/storage/repository.ts';
    const module: { Repository: typeof Repository } = await import(source);
    module.Repository.prototype.save = async () => {
      throw new DOMException(
        'Test storage is full. Current edits remain in memory.',
        'QuotaExceededError',
      );
    };
  });
  await page.getByLabel('Request title', { exact: true }).fill('First unsaved recovery version');
  await page.getByLabel('Additional hours', { exact: true }).fill('.');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  const recovery = page.locator('.save-recovery');
  const reload = recovery.getByRole('button', { name: 'Reload saved version', exact: true });
  await expect(reload).toBeDisabled();
  const first = await exported(
    page,
    recovery.getByRole('button', { name: 'Export current edits', exact: true }),
  );
  expect(first.changes[0]).toMatchObject({ title: 'First unsaved recovery version', hours: '.' });
  expect(first.context.lastBackupAt).toBe(before.context.lastBackupAt);
  await expect(reload).toBeEnabled();
  expect((await stored(page)).changes).toEqual(before.changes);
  await page.getByLabel('Request title', { exact: true }).fill('Newest unsaved recovery version');
  await expect(reload).toBeDisabled();
  await expect(recovery).toContainText('Your workspace changed after that export.');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  const second = await exported(
    page,
    recovery.getByRole('button', { name: 'Export current edits', exact: true }),
  );
  expect(second.changes[0]).toMatchObject({ title: 'Newest unsaved recovery version', hours: '.' });
  expect(second.context.lastBackupAt).toBe(before.context.lastBackupAt);
  await expect(reload).toBeEnabled();
  page.once('dialog', (dialog) => void dialog.accept());
  await Promise.all([page.waitForEvent('domcontentloaded'), reload.click()]);
  await saved(page);
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(
    before.changes[0].title,
  );
  expect((await stored(page)).context.lastBackupAt).toBe(before.context.lastBackupAt);
});

test('reviewing an alternative guards unfinished comparison edits and leaves the active draft intact', async ({
  page,
}) => {
  await open(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Compare responses', exact: true }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare responses', exact: true });
  await comparison
    .getByLabel('Comparison name', { exact: true })
    .fill('Saved twelve-hour response');
  await comparison.getByLabel('Hours', { exact: true }).fill('12');
  await comparison.getByRole('button', { name: 'Save comparison', exact: true }).click();
  await saved(page);
  await comparison
    .getByLabel('Comparison name', { exact: true })
    .fill('Unfinished seventeen-hour response');
  await comparison.getByLabel('Hours', { exact: true }).fill('17');
  const record = comparison
    .locator('.record-row')
    .filter({ hasText: 'Saved twelve-hour response' });
  await record.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(comparison).toContainText('Replace unfinished comparison?');
  await comparison.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(comparison.getByLabel('Comparison name', { exact: true })).toHaveValue(
    'Unfinished seventeen-hour response',
  );
  await expect(comparison.getByLabel('Hours', { exact: true })).toHaveValue('17');
  await record.getByRole('button', { name: 'Review', exact: true }).click();
  await comparison.getByRole('button', { name: 'Replace comparison', exact: true }).click();
  await expect(comparison.getByLabel('Comparison name', { exact: true })).toHaveValue(
    'Saved twelve-hour response',
  );
  await expect(comparison.getByLabel('Hours', { exact: true })).toHaveValue('12');
  await page.keyboard.press('Escape');
  await expect(comparison).not.toBeVisible();
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(
    before.changes[0].title,
  );
  const after = await stored(page);
  expect(after.changes).toEqual(before.changes);
  expect(after.projects).toEqual(before.projects);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.documents).toEqual(before.documents);
  expect(after.comparisons).toHaveLength(1);
  expect(after.comparisons[0]).toMatchObject({
    name: 'Saved twelve-hour response',
    terms: { hours: '12' },
  });
});

test('visible field captions focus controls and expose their hints while explicit ids survive', async ({
  page,
}) => {
  await open(page);
  await page
    .locator('label.field-caption')
    .filter({ hasText: /^Request title$/ })
    .click();
  await expect(page.getByLabel('Request title', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Request title', { exact: true })).toHaveAttribute(
    'id',
    'request-title',
  );
  await page
    .locator('label.field-caption')
    .filter({ hasText: /^Scope of the request$/ })
    .click();
  const scope = page.getByLabel('Scope of the request', { exact: true });
  await expect(scope).toBeFocused();
  expect(await scope.getAttribute('id')).toBeTruthy();
  await planning(page);
  await page
    .locator('label.field-caption')
    .filter({ hasText: /^Project deadline$/ })
    .click();
  const deadline = page.getByLabel('Project deadline', { exact: true });
  await expect(deadline).toBeFocused();
  const descriptions = await deadline.evaluate((control) =>
    (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent),
  );
  expect(descriptions.join(' ')).toContain('Calendar date in the workspace timezone.');
  await navigate(page, 'Settings & backup');
  await page
    .locator('label.field-caption')
    .filter({ hasText: /^Agency name$/ })
    .click();
  await expect(page.getByLabel('Agency name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Agency name', { exact: true })).toHaveAttribute(
    'id',
    'agency-name',
  );
  await navigate(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a project', exact: true });
  await dialog
    .locator('label.field-caption')
    .filter({ hasText: /^Client name$/ })
    .click();
  await expect(dialog.getByLabel('Client name', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Client name', { exact: true })).toHaveAttribute(
    'list',
    'existing-clients',
  );
});

test('project states and filtered empty views give accurate direction without losing records', async ({
  page,
}) => {
  await open(page);
  await navigate(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const creating = page.getByRole('dialog', { name: 'Create a project', exact: true });
  await creating.getByLabel('Project name', { exact: true }).fill('Operational state fixture');
  await creating.getByLabel('Client name', { exact: true }).fill('Operational state client');
  await creating.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(creating).not.toBeVisible();
  await saved(page);
  await planning(page);
  await page.getByLabel('Project state', { exact: true }).selectOption('completed');
  await saved(page);
  await navigate(page, 'Projects');
  const card = page
    .locator('.project-card')
    .filter({ has: page.getByRole('heading', { name: 'Operational state fixture', exact: true }) });
  await expect(card.locator('.badge')).toHaveText('Completed');
  await card.getByRole('button', { name: 'Continue request', exact: true }).click();
  await planning(page);
  await page.getByLabel('Project state', { exact: true }).selectOption('on-hold');
  await saved(page);
  await navigate(page, 'Projects');
  await expect(card.locator('.badge')).toHaveText('On hold');
  await page.getByLabel('Search projects', { exact: true }).fill('No such project exists');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search & filters', exact: true }).click();
  await expect(page.getByLabel('Search projects', { exact: true })).toHaveValue('');
  await expect(card).toBeVisible();
  const records = await stored(page);
  await navigate(page, 'Clients');
  await page.getByLabel('Search clients', { exact: true }).fill('No such client exists');
  await expect(page.locator('.client-list > button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear client search', exact: true }).click();
  await expect(page.locator('.client-list > button')).toHaveCount(2);
  await navigate(page, 'Overview');
  await page.getByLabel('Dashboard currency filter', { exact: true }).selectOption('EUR');
  await expect(
    page.getByRole('heading', { name: 'No work matches these filters', exact: true }),
  ).toBeVisible();
  await page.locator('.empty').getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByLabel('Dashboard currency filter', { exact: true })).toHaveValue('');
  await expect(
    page.getByRole('heading', { name: 'What needs attention', exact: true }),
  ).toBeVisible();
  const after = await stored(page);
  expect(after.projects).toEqual(records.projects);
  expect(after.clients).toEqual(records.clients);
  expect(after.changes).toEqual(records.changes);
});

test('recent projects use actual chronology for preserved timestamps without granting activation', async ({
  page,
}) => {
  let workspace = createWorkspace();
  workspace.projects[0].updatedAt = '2026-09-30T00:00:00Z';
  const records = [
    { name: 'Newest offset record', at: '2026-10-01T22:00:00-04:00' },
    { name: 'Next UTC record', at: '2026-10-02T01:30:00Z' },
    { name: 'Earlier east record', at: '2026-10-02T09:00:00+08:00' },
    { name: 'Basic ISO record', at: '2026-10-02T003000Z' },
    { name: 'Older UTC record', at: '2026-10-01T23:00:00Z' },
    { name: 'Oldest UTC record', at: '2026-10-01T22:00:00Z' },
  ];
  // Existing imported work can exceed demo limits. This fixture grants no browser license.
  for (const index of [5, 3, 1, 4, 0, 2]) {
    workspace = createProject(workspace, {
      name: records[index].name,
      client: 'Imported fixture client',
      activated: true,
    });
    const project = workspace.projects.at(-1)!;
    project.createdAt = '2026-09-01T00:00:00Z';
    project.updatedAt = records[index].at;
  }
  await seed(page, workspace);
  await expect(page.locator('.recent-projects > button')).toHaveText(
    records.slice(0, 5).map((record) => record.name),
  );
  await expect(page.locator('.demo-tag')).toContainText(/demo workspace/i);
  await page
    .locator('.recent-projects')
    .getByRole('button', { name: 'Newest offset record', exact: true })
    .click();
  await expect(page.locator('.context-title')).toContainText('Newest offset record');
  await saved(page);
  const after = await stored(page);
  expect(after.projects).toEqual(workspace.projects);
  expect(after.changes).toEqual(workspace.changes);
  await navigate(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Activate ScopeLedger', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Create a project', exact: true }),
  ).not.toBeVisible();
});
