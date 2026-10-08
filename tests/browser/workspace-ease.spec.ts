import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function open(page: Page) {
  await page.goto('/workspace/');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
}

test('the next action is ready within the first phone screen in both themes', async ({ page }) => {
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 740 });
      await open(page);
      await page.evaluate((value) => localStorage.setItem('sl-theme', value), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
      const next = page.locator('.flow-action-dock .button.primary');
      await expect(next).toBeVisible();
      const bounds = await next.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
      await expect(page.getByLabel('Current project', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Switch current change', { exact: true })).not.toBeVisible();
      await next.click();
      await expect(
        page.getByRole('button', { name: '2. Complete its baseline', exact: true }),
      ).toHaveAttribute('aria-current', 'step');
      await expect(page.locator('#project-baseline')).toBeFocused();
      const sizes = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
    }
  }
});

test('everyday actions remain visible across work views and command dialogs pass automated accessibility checks', async ({
  page,
}) => {
  await open(page);
  for (const name of ['Overview', 'Projects', 'Documents']) {
    await page
      .locator('.sidebar')
      .getByRole('button', { name: new RegExp('^' + name) })
      .click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const actions = page.getByRole('region', { name: 'Everyday actions' });
    for (const action of ['New project', 'New request', 'Create document', 'Add reminder']) {
      await expect(actions.getByRole('button', { name: action, exact: true })).toBeVisible();
    }
  }
  for (const name of ['Find anything', 'Shortcuts']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const result = await new AxeBuilder({ page })
      .setLegacyMode()
      .options({ iframes: false })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
    await page.keyboard.press('Escape');
  }
});
