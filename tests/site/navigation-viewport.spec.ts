import { test, expect } from '@playwright/test';

test('Escape after mobile appearance selection and desktop expansion release the workspace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/workspace/');
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('.main-shell')).toHaveAttribute('inert', '');
  await page.locator('.sidebar').getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await expect(page.locator('.main-shell')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/open/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toHaveCount(0);
  await expect(page.locator('.main-shell')).not.toHaveAttribute('inert');
  await page.locator('.page-heading h1').focus();
  await page.keyboard.press('Alt+Shift+d');
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
});
