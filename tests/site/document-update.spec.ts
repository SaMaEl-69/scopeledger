import { test, expect } from '@playwright/test';

// Disposable browser contexts: never use the owner's stored projects or issue documents.
test('deployed workspace exposes the document switch, automatic inclusive tax and larger image/storage limits', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workspace/?view=workspace');
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await page
    .getByRole('navigation', { name: 'Project workflow' })
    .getByRole('button', { name: '5. Choose a fee', exact: true })
    .click();
  const fee = page.getByLabel('Proposed additional fee', { exact: true });
  await page.getByLabel('Tax percentage', { exact: true }).fill('10');
  await page.getByLabel('Fee basis', { exact: true }).selectOption('including-tax');
  await fee.fill('1100');
  await page.getByLabel('Tax percentage', { exact: true }).fill('20');
  await expect(fee).toHaveValue('1200.00');
  await page
    .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
    .check();
  await page.locator('.flow-action-dock .button.primary').click();
  const switcher = page.getByRole('group', { name: 'Document type', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      localStorage.setItem('sl-theme', theme);
      window.dispatchEvent(new StorageEvent('storage', { key: 'sl-theme', newValue: theme }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 588, 768, 1440]) {
      await page.setViewportSize({ width, height: 988 });
      await switcher.getByRole('button', { name: 'Invoice', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Review the invoice', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Continue to export', exact: true }),
      ).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await switcher.getByRole('button', { name: 'Brief', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Review the brief', exact: true }),
      ).toBeVisible();
    }
  }
  const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await navigation.isVisible()) await navigation.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Settings & backup', exact: true })
    .click();
  await expect(page.getByRole('meter', { name: 'Workspace storage used' })).toHaveAttribute(
    'max',
    String(50 * 1024 * 1024),
  );
  await expect(page.getByLabel('Upload agency logo image')).toHaveAttribute(
    'accept',
    'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp',
  );
  await expect(page.locator('.logo-editor')).toContainText('2 MiB');
  expect(errors).toEqual([]);
});
