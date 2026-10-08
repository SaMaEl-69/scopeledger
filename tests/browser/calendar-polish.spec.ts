import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { createWorkspace } from '../../src/domain/operations';
import { saveManualEvent } from '../../src/operational/calendar';
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
  await page.goto('/app');
  await saved(page);
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
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await saved(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T04:00:00Z'));
});

test('workspace timezone persists without rewriting dates or reminder instants', async ({
  page,
}) => {
  let workspace = createWorkspace();
  workspace.agency.timezone = 'Asia/Dhaka';
  workspace.projects[0].deadline = '2026-10-12';
  workspace = saveManualEvent(workspace, {
    projectId: workspace.projects[0].id,
    title: 'Original timed reminder',
    startsAt: '2026-10-02T01:00:00Z',
    allDay: false,
    timezone: 'UTC',
  });
  workspace = saveManualEvent(workspace, {
    projectId: workspace.projects[0].id,
    title: 'Original all-day reminder',
    startsAt: '2026-10-04',
    allDay: true,
    timezone: 'Asia/Dhaka',
  });
  await seed(page, workspace);
  const before = await stored(page);
  await navigate(page, 'Settings & backup');
  await page.getByLabel('Workspace timezone', { exact: true }).selectOption('America/New_York');
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(page.getByLabel('Workspace timezone', { exact: true })).toHaveValue(
    'America/New_York',
  );
  const after = await stored(page);
  expect(after.agency.timezone).toBe('America/New_York');
  expect(after.projects).toEqual(before.projects);
  expect(after.calendarEvents).toEqual(before.calendarEvents);
  expect(after.approvals).toEqual(before.approvals);
  expect(after.documents).toEqual(before.documents);
  expect(after.payments).toEqual(before.payments);
  await navigate(page, 'Calendar');
  await expect(page.locator('.calendar-operational .operational-banner').first()).toContainText(
    'America/New_York',
  );
});

test('crowded calendar queues expose every record and preserve source navigation', async ({
  page,
}) => {
  let workspace = createWorkspace();
  const original = workspace.changes[0];
  workspace.changes.push(
    ...Array.from({ length: 18 }, (_, index) => ({
      ...structuredClone(original),
      id: `queue-decision-${index + 1}`,
      title: `Queued decision ${String(index + 1).padStart(2, '0')}`,
      status: 'Quoted' as const,
    })),
  );
  for (let index = 0; index < 18; index += 1) {
    workspace = saveManualEvent(workspace, {
      projectId: workspace.projects[0].id,
      title: `Overdue reminder ${String(index + 1).padStart(2, '0')}`,
      startsAt: '2026-10-01',
      allDay: true,
      timezone: 'Asia/Dhaka',
      type: 'task',
    });
  }
  await seed(page, workspace);
  await navigate(page, 'Calendar');
  const overdue = page.locator('.operational-two-columns > section').filter({
    has: page.getByRole('heading', { name: 'Overdue & unresolved', exact: true }),
  });
  const unscheduled = page.locator('.operational-two-columns > section').filter({
    has: page.getByRole('heading', { name: 'Unscheduled quotes & approved work', exact: true }),
  });
  await expect(overdue).toContainText('Showing 8 of 18 overdue records.');
  await expect(overdue.locator('.operational-row')).toHaveCount(8);
  await overdue.getByRole('button', { name: 'Show more overdue records', exact: true }).click();
  await expect(overdue.locator('.operational-row')).toHaveCount(16);
  await overdue.getByRole('button', { name: 'Show all 18 overdue records', exact: true }).click();
  await expect(overdue.locator('.operational-row')).toHaveCount(18);
  await overdue.getByRole('button', { name: /Overdue reminder 18/ }).click();
  const details = page.getByRole('dialog', { name: 'Calendar event', exact: true });
  await expect(details).toContainText('Overdue reminder 18');
  await details.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(unscheduled).toContainText('Showing 8 of 18 unscheduled decisions.');
  await unscheduled
    .getByRole('button', { name: 'Show more unscheduled decisions', exact: true })
    .click();
  await expect(unscheduled.locator('.operational-row')).toHaveCount(16);
  await unscheduled
    .getByRole('button', { name: 'Show all 18 unscheduled decisions', exact: true })
    .click();
  await expect(unscheduled.locator('.operational-row')).toHaveCount(18);
  await unscheduled.getByRole('button', { name: /Queued decision 18/ }).click();
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue('Queued decision 18');
});

test('imported basic ISO reminders render in agenda without rewriting stored timestamps', async ({
  page,
}) => {
  let workspace = createWorkspace();
  workspace.agency.timezone = 'UTC';
  workspace = saveManualEvent(workspace, {
    projectId: workspace.projects[0].id,
    title: 'Imported basic ISO reminder',
    startsAt: '2026-10-04T123045Z',
    endsAt: '2026-10-04T133045Z',
    allDay: false,
    timezone: 'UTC',
    type: 'task',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page, workspace);
  await navigate(page, 'Calendar');
  await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  const reminder = page
    .locator('.calendar-agenda')
    .getByRole('button', { name: /Imported basic ISO reminder/ });
  await expect(reminder).toContainText('12:30');
  await reminder.click();
  const details = page.getByRole('dialog', { name: 'Calendar event', exact: true });
  await expect(details).toContainText('2026-10-04 12:30:45 UTC');
  await details.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  const after = await stored(page);
  expect(after.calendarEvents).toEqual(workspace.calendarEvents);
});
