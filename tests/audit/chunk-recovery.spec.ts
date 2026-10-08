import { showAllSteps } from '../browser/project-view';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Workspace } from '../../src/domain/types';

test('readiness navigation focuses its field after a delayed settings download', async ({
  page,
}) => {
  let delayed = 0;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/assets/SettingsExtras-*.js', async (route) => {
    delayed++;
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.continue();
  });
  await page.goto('/app');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await expect(page.getByLabel('Request title', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview client brief', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await page.getByLabel('Document type', { exact: true }).selectOption('invoice');
  await page.getByRole('button', { name: /^Issuer legal details/ }).click();
  await expect(page.getByLabel('Legal issuer name', { exact: true })).toBeFocused();
  expect(delayed).toBeGreaterThan(0);
});

// This suite intentionally targets built, hashed lazy chunks on port 4173.
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', {
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function backup(page: Page, button: ReturnType<Page['getByRole']>) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('Recovery backup did not produce a local file');
  const raw = await readFile(path, 'utf8');
  return { raw, workspace: JSON.parse(raw) as Workspace };
}

test('missing built lazy chunk retains an unsaved core draft and Settings backup can recover it', async ({
  page,
}) => {
  let blocked = 0;
  const chunk = '**/assets/CalendarView-*.js';
  await page.route(chunk, async (route) => {
    blocked++;
    await route.abort('failed');
  });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  // Keep the changed values genuinely in memory, rather than relying on autosave.
  await page.evaluate(() => {
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
  const title = 'Unsaved core draft survives an unavailable calendar';
  await page.getByLabel('Request title', { exact: true }).fill(title);
  await page.getByLabel('Additional hours', { exact: true }).fill('1e-');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Not saved');
  await navigate(page, 'Calendar');
  const recovery = page.getByRole('region', { name: 'Calendar recovery', exact: true });
  await expect(recovery.getByRole('heading', { name: 'Calendar unavailable' })).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  await expect(
    recovery.getByRole('button', { name: 'Reload application', exact: true }),
  ).toBeDisabled();
  await expect(recovery).toContainText('Temporary unissued document forms');
  await recovery.getByRole('button', { name: 'Return to change requests', exact: true }).click();
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('1e-');
  // React.lazy remembers rejection. Merely allowing the URL must not produce a
  // misleading Retry control or pretend that reopening the view downloaded it.
  await page.unroute(chunk);
  const failedRequests = blocked;
  await navigate(page, 'Calendar');
  await expect(recovery).toBeVisible();
  expect(blocked).toBe(failedRequests);
  await recovery.getByRole('button', { name: 'Settings & backup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  const exported = await backup(
    page,
    page.locator('.backup-card').getByRole('button', { name: 'Export backup', exact: true }),
  );
  expect(exported.workspace.changes.find((change) => change.title === title)?.hours).toBe('1e-');
  await navigate(page, 'Calendar');
  await expect(recovery).toBeVisible();
  await backup(page, recovery.getByRole('button', { name: 'Export current edits', exact: true }));
  await expect(
    recovery.getByRole('button', { name: 'Reload application', exact: true }),
  ).toBeEnabled();
  page.once('dialog', (dialog) => void dialog.accept());
  await recovery.getByRole('button', { name: 'Reload application', exact: true }).click();
  // Reload is deliberate and loses the intentionally unsaved memory copy. The
  // actual exported file, not a fake save acknowledgement, restores those edits.
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await navigate(page, 'Settings & backup');
  await page.getByTestId('backup-file').setInputFiles({
    name: 'recovered-core-draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported.raw),
  });
  const restore = page.getByRole('dialog', { name: 'Review workspace replacement', exact: true });
  await restore
    .getByRole('checkbox', {
      name: 'I understand this will replace my current workspace and have kept any work I need.',
    })
    .check();
  await restore.getByRole('button', { name: 'Replace workspace', exact: true }).click();
  await expect(restore).not.toBeVisible();
  await navigate(page, 'Change requests');
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('1e-');
  await navigate(page, 'Calendar');
  await expect(
    page.getByRole('region', { name: 'Calendar recovery', exact: true }),
  ).not.toBeVisible();
});

test('a failed lazy comparison opens a closable recovery dialog without losing the core draft', async ({
  page,
}) => {
  let blocked = 0;
  await page.route('**/assets/ComparisonModal-*.js', async (route) => {
    blocked++;
    await route.abort('failed');
  });
  await page.goto('/app');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await expect(page.getByLabel('Request title', { exact: true })).toBeVisible();
  await page
    .getByLabel('Request title', { exact: true })
    .fill('Comparison failure keeps this draft');
  await page.getByRole('button', { name: 'Compare responses', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Unable to open response comparison',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  await expect(dialog).toContainText('unfinished composer/comparison entries are not included');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(
    'Comparison failure keeps this draft',
  );
  await expect(page.getByRole('button', { name: 'Compare responses', exact: true })).toBeFocused();
});

test('Settings core backup remains usable and newer edits invalidate an earlier recovery export', async ({
  page,
}) => {
  let blocked = 0;
  await page.route('**/assets/SettingsExtras-*.js', async (route) => {
    blocked++;
    await route.abort('failed');
  });
  await page.goto('/app');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await expect(page.getByLabel('Request title', { exact: true })).toBeVisible();
  await navigate(page, 'Settings & backup');
  const recovery = page.getByRole('region', { name: 'Agency settings recovery', exact: true });
  await expect(recovery).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  await expect(
    page.locator('.backup-card').getByRole('button', { name: 'Export backup', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  await backup(page, recovery.getByRole('button', { name: 'Export current edits', exact: true }));
  await expect(
    recovery.getByRole('button', { name: 'Reload application', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Agency name', { exact: true }).fill('Changed after the earlier export');
  await expect(
    recovery.getByRole('button', { name: 'Reload application', exact: true }),
  ).toBeDisabled();
  await expect(recovery).toContainText('workspace changed after that export');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
  const latest = await backup(
    page,
    recovery.getByRole('button', { name: 'Export current edits', exact: true }),
  );
  expect(latest.workspace.agency.name).toBe('Changed after the earlier export');
  await expect(
    recovery.getByRole('button', { name: 'Reload application', exact: true }),
  ).toBeEnabled();
});
