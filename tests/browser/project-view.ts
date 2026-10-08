import type { Page } from '@playwright/test';

/** Operational regression journeys use the full editor; guided journeys keep the default view. */
export async function showAllSteps(page: Page) {
  if (await page.locator('dialog[open]').count()) return;
  const button = page.getByRole('button', { name: 'Show all steps', exact: true });
  if (await button.isVisible()) await button.click();
}
