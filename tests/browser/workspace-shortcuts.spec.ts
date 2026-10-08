import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { createWorkspace } from '../../src/domain/operations';
import type { Workspace } from '../../src/domain/types';

const commandSearch = 'Search workspace records and actions';

async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}

async function outsideField(page: Page) {
  await page.locator('.page-heading h1').focus();
}

async function workspace(page: Page): Promise<Workspace> {
  await saved(page);
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const reading = database.transaction('workspace').objectStore('workspace').get('current');
          reading.onerror = () => {
            database.close();
            reject(reading.error);
          };
          reading.onsuccess = () => {
            database.close();
            resolve(JSON.parse(reading.result.raw));
          };
        };
      }),
  );
}

function expectCommercialRecordsUnchanged(before: Workspace, after: Workspace) {
  expect(after.approvals).toEqual(before.approvals);
  expect(after.reconciliations).toEqual(before.reconciliations);
  expect(after.documents).toEqual(before.documents);
  expect(after.payments).toEqual(before.payments);
  expect(after.revisions).toEqual(before.revisions);
}

async function seed(page: Page, data: Workspace) {
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction('workspace', 'readwrite');
          transaction
            .objectStore('workspace')
            .put({ raw: JSON.stringify(record), sequence: record.sequence }, 'current');
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    data,
  );
  await page.reload();
  await saved(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T03:30:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/workspace/');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await saved(page);
});

test('find anything recovers from empty search and opens real pages and project context', async ({
  page,
}) => {
  const before = await workspace(page);
  await page.getByRole('button', { name: 'Find anything', exact: true }).click();
  let menu = page.getByRole('dialog', { name: 'Find anything', exact: true });
  let search = menu.getByRole('combobox', { name: commandSearch });
  await expect(search).toBeFocused();
  await search.fill('zzzz unavailable action');
  await expect(menu.getByRole('status')).toContainText('No matches');
  await expect(menu.getByRole('option')).toHaveCount(0);
  await menu.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.fill('documents');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await outsideField(page);
  await page.keyboard.press('ControlOrMeta+k');
  menu = page.getByRole('dialog', { name: 'Find anything', exact: true });
  search = menu.getByRole('combobox', { name: commandSearch });
  await search.fill('harbor studio');
  await expect(
    menu.getByRole('group', { name: 'Projects', exact: true }).getByRole('option'),
  ).toHaveCount(1);
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect(page.locator('.context-title')).toContainText('Harbor / Website');
  const after = await workspace(page);
  expect(after.changes).toEqual(before.changes);
  expectCommercialRecordsUnchanged(before, after);
});

test('command arrows wrap through available actions and Enter creates one focused draft', async ({
  page,
}) => {
  const before = await workspace(page);
  await outsideField(page);
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Find anything', exact: true });
  const search = menu.getByRole('combobox', { name: commandSearch });
  const enabled = menu.locator('[role="option"]:not([disabled])');
  const firstId = await enabled.first().getAttribute('id');
  const lastId = await enabled.last().getAttribute('id');
  await expect(search).toHaveAttribute('aria-activedescendant', firstId!);
  await search.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', lastId!);
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', firstId!);
  await search.fill('new request');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(menu).not.toBeVisible();
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Request title', { exact: true })).toBeFocused();
  const after = await workspace(page);
  expect(after.changes).toHaveLength(before.changes.length + 1);
  expect(after.changes.find((change) => change.id === before.changes[0].id)).toEqual(
    before.changes[0],
  );
  const draft = after.changes.find((change) => change.id === after.context.changeId)!;
  expect(draft.status).toBe('Draft');
  expect(draft.title).toBe('');
  expectCommercialRecordsUnchanged(before, after);
});

test('unavailable new request actions stay visible and cannot be run', async ({ page }) => {
  const archived = createWorkspace();
  archived.projects[0].archivedAt = '2026-10-05T04:00:00Z';
  await seed(page, archived);
  const before = await workspace(page);
  await page.getByRole('button', { name: 'Find anything', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Find anything', exact: true });
  const search = menu.getByRole('combobox', { name: commandSearch });
  await search.fill('new request');
  await expect(menu.getByRole('option')).toBeDisabled();
  await expect(menu.getByRole('option')).toContainText('Choose an active project first.');
  await search.press('ArrowDown');
  await expect(search).not.toHaveAttribute('aria-activedescendant');
  await search.press('Enter');
  await expect(menu).toBeVisible();
  await search.press('Escape');
  expect((await workspace(page)).changes).toEqual(before.changes);
});

test('typing stays in the current field while find anything remains available', async ({
  page,
}) => {
  const before = await workspace(page);
  const title = page.getByLabel('Request title', { exact: true });
  await title.fill('Keyboard draft');
  await title.press('End');
  await title.press('?');
  await expect(title).toHaveValue('Keyboard draft?');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  for (const keys of ['Alt+2', 'Alt+Shift+d', 'Alt+Shift+r', 'ControlOrMeta+Shift+Enter']) {
    await title.press(keys);
    await expect(title).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
    await showAllSteps(page);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  await page.getByLabel('Switch current change', { exact: true }).focus();
  await page.keyboard.press('Alt+Shift+r');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await title.focus();
  const typed = await title.inputValue();
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Find anything', exact: true });
  await expect(menu.getByRole('combobox', { name: commandSearch })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(typed);
  const after = await workspace(page);
  expect(after.changes).toHaveLength(before.changes.length);
  expectCommercialRecordsUnchanged(before, after);
});

test('step shortcuts switch to the request and focus each section without saving a decision', async ({
  page,
}) => {
  const before = await workspace(page);
  await outsideField(page);
  await page.keyboard.press('Alt+Shift+d');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await outsideField(page);
  for (const [index, id] of [
    'current-project',
    'project-baseline',
    'request-section',
    'cost-section',
    'price-section',
  ].entries()) {
    await outsideField(page);
    await page.keyboard.press(`Alt+${index + 1}`);
    await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
    await showAllSteps(page);
    await expect(page.locator(`#${id}`)).toBeFocused();
  }
  await page.keyboard.press('Alt+3');
  await expect(page.locator('#request-section')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Request title', { exact: true })).toBeFocused();
  const after = await workspace(page);
  expect(after.changes).toEqual(before.changes);
  expectCommercialRecordsUnchanged(before, after);
});

test('project and request shortcuts open the next editable context', async ({ page }) => {
  const before = await workspace(page);
  await outsideField(page);
  await page.keyboard.press('Alt+Shift+p');
  const project = page.getByRole('dialog', { name: 'Create a project', exact: true });
  await expect(project).toBeVisible();
  await project.getByLabel('Project name', { exact: true }).fill('Unsubmitted keyboard project');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.press('Alt+Shift+d');
  await page.keyboard.press('Alt+Shift+r');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(project).toBeVisible();
  const enteredName = await project.getByLabel('Project name', { exact: true }).inputValue();
  expect(enteredName).toContain('Unsubmitted keyboard project');
  await page.keyboard.press('Escape');
  await expect(project.getByRole('button', { name: 'Keep editing', exact: true })).toBeVisible();
  await project.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(project.getByLabel('Project name', { exact: true })).toHaveValue(enteredName);
  await project.getByLabel('Project name', { exact: true }).fill('');
  await page.keyboard.press('Escape');
  await expect(project).not.toBeVisible();
  await outsideField(page);
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(page.getByLabel('Request title', { exact: true })).toBeFocused();
  const after = await workspace(page);
  expect(after.projects).toEqual(before.projects);
  expect(after.changes).toHaveLength(before.changes.length + 1);
  expectCommercialRecordsUnchanged(before, after);
});

test('reminder shortcut is repeatable and the reserved request chord never submits a filled dialog', async ({
  page,
}) => {
  const before = await workspace(page);
  await outsideField(page);
  await page.keyboard.press('Alt+Shift+r');
  const reminder = page.getByRole('dialog', { name: 'New calendar reminder', exact: true });
  await expect(reminder).toBeVisible();
  await expect(reminder.getByLabel('Reminder project', { exact: true })).toHaveValue(
    before.context.projectId,
  );
  await expect(reminder.getByLabel('Reminder change', { exact: true })).toHaveValue(
    before.context.changeId,
  );
  await reminder.getByLabel('Reminder title', { exact: true }).fill('Keyboard follow-up');
  await reminder.getByLabel('Reminder start', { exact: true }).fill('2026-10-07');
  await reminder.getByLabel('Reminder title', { exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.press('Alt+Shift+p');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(reminder).toBeVisible();
  const paused = await workspace(page);
  expect(paused.calendarEvents).toEqual(before.calendarEvents);
  expect(paused.changes).toEqual(before.changes);
  // Ordinary Enter still submits a valid form.
  await reminder.getByLabel('Reminder title', { exact: true }).fill('Keyboard follow-up');
  await reminder.getByLabel('Reminder title', { exact: true }).press('Enter');
  await expect(reminder).not.toBeVisible();
  const after = await workspace(page);
  expect(after.calendarEvents).toHaveLength(before.calendarEvents.length + 1);
  expect(after.calendarEvents.at(-1)?.title).toBe('Keyboard follow-up');
  expect(after.changes).toEqual(before.changes);
  expectCommercialRecordsUnchanged(before, after);
  await outsideField(page);
  await page.keyboard.press('Alt+Shift+r');
  await expect(reminder).toBeVisible();
  await expect(reminder.getByLabel('Reminder title', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(reminder).not.toBeVisible();
});

test('keyboard help pauses shortcuts and phone palettes trap focus without overflow or menu conflicts', async ({
  page,
}) => {
  const before = await workspace(page);
  await outsideField(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Find anything works while typing.');
  await expect(help).toContainText('Other action and step shortcuts work outside fields.');
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  const find = page.getByRole('button', { name: 'Find anything', exact: true });
  await find.click();
  const menu = page.getByRole('dialog', { name: 'Find anything', exact: true });
  const search = menu.getByRole('combobox', { name: commandSearch });
  await expect(search).toBeFocused();
  await expect
    .poll(() => menu.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
  await search.press('Tab');
  await expect(menu.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(find).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/open/);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.press('Alt+Shift+r');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  const after = await workspace(page);
  expect(after.changes).toEqual(before.changes);
  expectCommercialRecordsUnchanged(before, after);
});
