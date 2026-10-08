import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Workspace } from '../../src/domain/types';
import type { Repository } from '../../src/storage/repository';

async function open(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}
async function stored(page: Page): Promise<Workspace | null> {
  return page.evaluate(
    () =>
      new Promise<Workspace | null>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result,
            read = database.transaction('workspace').objectStore('workspace').get('current');
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            database.close();
            resolve(read.result === undefined ? null : (JSON.parse(read.result.raw) as Workspace));
          };
        };
      }),
  );
}

test('an edit made during an active save is drained and survives reload', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const source = '/src/storage/repository.ts';
    const module: { Repository: typeof Repository } = await import(source);
    const original = module.Repository.prototype.save;
    let first = true;
    module.Repository.prototype.save = async function (
      workspace: Workspace,
      expectedSequence: number,
    ) {
      if (first) {
        first = false;
        Object.assign(window, { __saveStarted: true });
        await new Promise<void>((resolve) => Object.assign(window, { __releaseSave: resolve }));
      }
      return original.call(this, workspace, expectedSequence);
    };
  });
  await page.getByLabel('Request title').fill('Version written first');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __saveStarted?: boolean }).__saveStarted),
    )
    .toBe(true);
  await page.getByLabel('Request title').fill('Latest edit during write');
  await page.getByLabel('Additional hours', { exact: true }).fill('.');
  await page.evaluate(() => (window as unknown as { __releaseSave: () => void }).__releaseSave());
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  const workspace = await stored(page);
  expect(workspace!.changes[0]).toMatchObject({ title: 'Latest edit during write', hours: '.' });
  await page.reload();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await expect(page.getByLabel('Request title')).toHaveValue('Latest edit during write');
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('.');
});

test('a confirmed cross-tab conflict locks later autosave and retains local edits', async ({
  page,
  context,
}) => {
  await open(page);
  const second = await context.newPage();
  await open(second);
  await second.getByLabel('Request title').fill('Saved by the second tab');
  await expect(second.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await expect(page.getByRole('alert')).toContainText('Another tab saved this workspace');
  await page.getByLabel('Request title').fill('Local edits held for backup');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  await showAllSteps(page);
  await expect(page.getByLabel('Request title')).toHaveValue('Local edits held for backup');
  expect((await stored(second))!.changes[0].title).toBe('Saved by the second tab');
});

test('privacy denial of BroadcastChannel leaves local saves and reload usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      value: class {
        constructor() {
          throw new DOMException('Notifications blocked', 'SecurityError');
        }
      },
    });
  });
  await open(page);
  await page.getByLabel('Request title').fill('Saved without notifications');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await page.reload();
  await expect(page.getByLabel('Request title')).toHaveValue('Saved without notifications');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
});

test('unavailable storage at startup keeps edits in memory and exports unfinished numbers honestly', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const audit = { calls: 0 };
    Object.assign(window, { __storageDenialAudit: audit });
    // Patch every factory instance, including fresh wrappers returned by WebKit's getter.
    Object.defineProperty(IDBFactory.prototype, 'open', {
      configurable: true,
      writable: true,
      value: () => {
        audit.calls += 1;
        throw new DOMException('Local storage denied', 'SecurityError');
      },
    });
  });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __storageDenialAudit: { calls: number } }).__storageDenialAudit
            .calls,
      ),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  await showAllSteps(page);
  await expect(page.getByRole('alert')).toContainText('Your edits stay in memory');
  await page.getByLabel('Request title').fill('In-memory recovery draft');
  await page.getByLabel('Additional hours', { exact: true }).fill('.');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  await showAllSteps(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current edits', exact: true }).click();
  const download = await downloading,
    path = await download.path();
  if (!path) throw new Error('Current edits could not be exported');
  const exported = JSON.parse(await readFile(path, 'utf8')) as Workspace;
  expect(exported.changes[0]).toMatchObject({ title: 'In-memory recovery draft', hours: '.' });
  await expect(page.locator('.topbar .save-indicator')).not.toHaveText('Saved on this device');
});

test('a fresh browser automatically migrates legacy drafts while retaining the original source', async ({
  page,
}) => {
  const project = {
    id: 'sample-harbor',
    name: 'Legacy Harbor',
    client: 'Harbor',
    agency: 'Legacy Aster',
    logo: '',
    currency: 'USD',
    fee: '8000',
    actual: '',
    remaining: '3200',
    target: '35',
    title: 'Recovered legacy draft',
    scope: 'Preserved original scope',
    removedScope: '',
    assumptions: '',
    classification: 'Addition',
    route: 'Quote',
    hours: '.',
    rate: '65',
    outside: '0',
    removed: '0',
    adjustment: '800',
    status: 'Draft',
    revision: 1,
    approval: '',
    invoiceNumber: 'OLD-001',
    issueDate: '2026-09-13',
    dueDate: '2026-09-27',
    tax: '0',
    billing: '',
    payment: '',
  };
  const raw = JSON.stringify({
    version: 1,
    projects: [project],
    snapshots: [{ id: 'legacy-snapshot', at: '2026-09-13T00:00:00.000Z', project }],
  });
  await page.addInitScript((raw) => localStorage.setItem('scopeledger.v1', raw), raw);
  await open(page);
  await expect(page.getByLabel('Request title')).toHaveValue('Recovered legacy draft');
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('.');
  const workspace = (await stored(page))!;
  expect(workspace.projects[0].id).toBe('sample-harbor');
  expect(workspace.projects[0].baseline.actual).toBe('');
  expect(workspace.revisions[0].id).toBe('legacy-snapshot');
  expect(await page.evaluate(() => localStorage.getItem('scopeledger.v1'))).toBe(raw);
  await page.reload();
  await expect(page.getByLabel('Request title')).toHaveValue('Recovered legacy draft');
  expect((await stored(page))!.revisions).toHaveLength(1);
});

test('an invalid legacy workspace opens raw recovery instead of overwriting it with a sample', async ({
  page,
}) => {
  const raw = '{"version":1,"projects":';
  await page.addInitScript((raw) => localStorage.setItem('scopeledger.v1', raw), raw);
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'Recover your workspace', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download recovery data', exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('scopeledger.v1'))).toBe(raw);
});
