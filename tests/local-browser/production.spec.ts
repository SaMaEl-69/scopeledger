import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { createWorkspace } from '../../src/domain/operations';
import { MAX_WORKSPACE_BYTES, serializeWorkspace } from '../../src/storage/repository';
const saved = (page: Page) =>
  expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
const navigate = async (page: Page, name: string) => {
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp('^' + name) })
    .click();
  await saved(page);
};

test('built pages retain working theme, menus and document previews under CSP', async ({
  page,
  request,
  localApp,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      (window as any).violations.push(event.violatedDirective + ':' + event.blockedURI),
    );
  });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const home = await page.goto('/home/');
    expect(home?.headers()['content-security-policy']).toContain("script-src 'self' 'sha256-");
    await page.locator('#themeBtn').click();
    await expect(page.locator('#appearancePicker')).toBeVisible();
    await page.locator('#appearancePicker [data-set="system"]').click();
    await page
      .getByRole('link', { name: /Get lifetime access/ })
      .first()
      .click();
    await expect(page.locator('#lifetimeDialog')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
    await page.goto('/workspace/');
    await saved(page);
    for (const name of [
      'Overview',
      'Projects',
      'Change requests',
      'Clients',
      'Calendar',
      'Documents',
      'Templates',
      'Settings & backup',
      'Help & support',
    ]) {
      await navigate(page, name);
      await expect(page.locator('.view-loading')).toHaveCount(0);
    }
    await navigate(page, 'Documents');
    await expect(page.locator('.document-preview-panel iframe')).toBeVisible();
    expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
  }
  const ready = await request.get(`${localApp.origin}/api/ready`);
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toMatchObject({
    status: 'ready',
    purchasesEnabled: false,
    checks: { configured: true, storage: true, renderer: true },
  });
  expect(errors).toEqual([]);
});

test('browser Back and Forward restore the selected local project and handle unavailable links honestly', async ({
  page,
}) => {
  await page.goto('/workspace/');
  await saved(page);
  await navigate(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a project' });
  await dialog.getByLabel('Project name', { exact: true }).fill('Navigation QA');
  await dialog.getByLabel('Client name', { exact: true }).fill('Navigation Client');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await saved(page);
  const selected = page.url();
  expect(selected).toContain('project=');
  await navigate(page, 'Settings & backup');
  expect(page.url()).toContain('view=settings');
  await page.goBack();
  await saved(page);
  await expect(page).toHaveURL(selected);
  await expect(page.locator('.page-content')).toContainText('Navigation QA');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  await page.goto('/workspace/?view=workspace&project=missing');
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.locator('.alert.error')).toContainText('unavailable in this browser');
});

test('search opens a specific request and client, while settings expose durable defaults and capacity', async ({
  page,
}) => {
  await page.goto('/workspace/');
  await saved(page);
  await page.getByRole('button', { name: 'Find anything', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Find anything' });
  await dialog.getByRole('combobox').fill('journal CMS');
  await dialog.getByRole('option', { name: /Add a journal CMS collection/ }).click();
  await expect(page).toHaveURL(/change=/);
  await saved(page);
  await page.getByRole('button', { name: 'Find anything', exact: true }).click();
  await dialog.getByRole('combobox').fill('Harbor');
  await dialog.getByRole('group', { name: 'Clients', exact: true }).getByRole('option').click();
  await expect(page).toHaveURL(/view=clients/);
  await expect(page).toHaveURL(/client=/);
  await navigate(page, 'Settings & backup');
  await expect(page.getByRole('meter', { name: 'Workspace storage used' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm these defaults', exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('button', { name: 'Defaults confirmed' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Agency name' }).fill('Owner reviewed studio');
  await expect(page.getByRole('button', { name: 'Confirm these defaults' })).toBeEnabled();
});

test('activation and release refresh another tab from the server without altering its workspace', async ({
  page,
  context,
  localApp,
}) => {
  await page.goto('/workspace/');
  await saved(page);
  await navigate(page, 'Settings & backup');
  const other = await context.newPage();
  await other.goto('/workspace/');
  await saved(other);
  // Both tabs share cookies, but no license value or key is sent through the channel.
  await other.getByRole('button', { name: 'View activation options' }).click();
  const activation = other.getByRole('dialog', { name: 'Activate ScopeLedger' });
  await activation.getByLabel('License key', { exact: true }).fill(localApp.keys.individual);
  await activation.getByRole('button', { name: 'Activate this browser', exact: true }).click();
  await expect(page.locator('.license-settings > .badge')).toHaveText('individual activated');
  await activation.getByRole('checkbox', { name: /Release this browser/ }).check();
  await activation.getByRole('button', { name: 'Release current device', exact: true }).click();
  await expect(page.locator('.license-settings > .badge')).toHaveText(
    'Local development test mode',
  );
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  await other.close();
});

test('a core settings edit at capacity preserves the prior saved value and remains recoverable', async ({
  page,
}) => {
  await page.goto('/workspace/?view=settings');
  await saved(page);
  const w = createWorkspace();
  w.context.view = 'settings';
  for (let index = 0; index < 104; index++)
    w.clients.push({
      id: `capacity-${index}`,
      name: `Client ${index}`,
      contact: '',
      email: '',
      notes: 'x'.repeat(100000),
    });
  w.clients.push({ id: 'capacity-tail', name: 'Tail', contact: '', email: '', notes: '' });
  w.clients.at(-1)!.notes = 'x'.repeat(
    MAX_WORKSPACE_BYTES - 512 - Buffer.byteLength(JSON.stringify(w)),
  );
  const raw = serializeWorkspace(w);
  await page.evaluate(
    (raw) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({ raw, sequence: JSON.parse(raw).sequence }, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    raw,
  );
  // This fresh graph has new IDs; do not navigate to the previous graph's URL.
  await page.goto('/workspace/?view=settings');
  await saved(page);
  const agency = page.getByRole('textbox', { name: 'Agency name' });
  await agency.fill('Too large '.repeat(200));
  await expect(page.locator('.alert.error')).toContainText('was not applied');
  await expect(agency).toHaveValue('Aster Studio');
  await page.reload();
  await saved(page);
  await expect(agency).toHaveValue('Aster Studio');
  await agency.fill('My studio');
  await saved(page);
  await expect(agency).toHaveValue('My studio');
  await page.getByRole('button', { name: 'Find anything', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Find anything' })
    .getByRole('option', { name: /New project/ })
    .click();
  const projectDialog = page.getByRole('dialog', { name: 'Create a project' });
  await projectDialog.getByLabel('Project name', { exact: true }).fill('Cannot fit at capacity');
  await projectDialog.getByLabel('Client name', { exact: true }).fill('Capacity client');
  await projectDialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(projectDialog).toBeVisible();
  await expect(projectDialog).toContainText('was not applied');
  await projectDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await projectDialog.getByRole('button', { name: 'Discard entries', exact: true }).click();
  await expect(projectDialog).not.toBeVisible();
  await navigate(page, 'Overview');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const scale of [16, 32]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}px`;
      }, scale);
      for (const width of [320, 387, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator('.capacity-alert')).toBeVisible();
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scroll, `capacity notice ${width}px ${theme} ${scale}px`).toBeLessThanOrEqual(width);
      }
    }
  }
});
