import { expect, test } from '@playwright/test';

test('four homepage decisions account for quoted, absorbed, exchanged and deferred work', async ({
  page,
}) => {
  await page.goto('/home/');
  const decisions = page.getByRole('group', { name: 'Decision', exact: true });
  const quote = decisions.getByRole('button', { name: /Quote/ });
  const absorb = decisions.getByRole('button', { name: /Absorb/ });
  const exchange = decisions.getByRole('button', { name: /Exchange/ });
  const defer = decisions.getByRole('button', { name: /Defer/ });
  await expect(decisions.getByRole('button')).toHaveCount(4);
  await expect(page.locator('#atRisk')).toHaveText('$5,700');
  await expect(page.locator('#ringPct')).toHaveText('16%');

  await quote.click();
  await expect(quote).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bigPrice')).toHaveText('$900');
  await expect(page.locator('#tBill')).toHaveText('$900');
  await expect(page.locator('#atRisk')).toHaveText('$4,800');

  await exchange.click();
  await page.locator('#stage [data-swap="Newsletter integration"]').click();
  await expect(page.locator('#stage .swap-eq')).toContainText('+1h over');
  await expect(page.locator('#atRisk')).toHaveText('$4,950');
  await quote.click();

  await page.locator('#tq [data-id="2"]').click();
  await absorb.click();
  await expect(absorb).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stage .price-tag .big')).toHaveText('$0');
  await expect(page.locator('#absorbedCost')).toHaveText('$1,500');
  await expect(page.locator('#tAbsorb')).toHaveText('$1,500');

  await page.locator('#tq [data-id="3"]').click();
  await exchange.click();
  await expect(exchange).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stage [data-swap="Team bios collection"]')).toHaveClass(/sel/);
  await expect(page.locator('#stage .swap-eq')).toContainText('0h net · scope-neutral');
  await expect(page.locator('#tSwap')).toHaveText('18h');

  await page.locator('#tq [data-id="4"]').click();
  await defer.click();
  await expect(defer).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#p2Sum')).toHaveText('$600');
  await expect(page.locator('#tDefer')).toHaveText('$600');
  await expect(page.locator('#tqCount')).toHaveText('Inbox zero ✓');
  await expect(page.locator('#atRisk')).toHaveText('$1,500');
  await expect(page.locator('#ringPct')).toHaveText('34%');
  await expect(page.locator('#ringNote')).toHaveText(
    'All decisions recorded · unbilled cost remains',
  );
  await expect(page.locator('#riskBox')).not.toHaveClass(/safe/);

  await page.locator('#tReset').click();
  await expect(page.locator('#tqCount')).toHaveText('4 pending');
  await expect(page.locator('#tBill')).toHaveText('$0');
  await expect(page.locator('#tAbsorb')).toHaveText('$0');
  await expect(page.locator('#tSwap')).toHaveText('0h');
  await expect(page.locator('#tDefer')).toHaveText('$0');
  await expect(page.locator('#atRisk')).toHaveText('$5,700');
  await expect(page.locator('#ringPct')).toHaveText('16%');
  await expect(decisions.locator('[aria-pressed="true"]')).toHaveCount(0);
});

test('homepage decision shortcuts use Q, A, E and D', async ({ page }) => {
  await page.goto('/home/');
  const decisions = page.getByRole('group', { name: 'Decision', exact: true });
  await decisions.getByRole('button', { name: /Quote/ }).click();
  for (const [key, choice, stage] of [
    ['a', 'Absorb', 'Complete without an additional charge'],
    ['e', 'Exchange', 'Replace some existing work'],
    ['d', 'Defer', 'Schedule later; finish the previous work'],
    ['q', 'Quote', 'Priced and ready for review'],
  ]) {
    await page.keyboard.press(key);
    await expect(decisions.getByRole('button', { name: new RegExp(choice) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.locator('#stage').getByRole('heading', { name: stage, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator('#tBill')).toHaveText('$900');
  await expect(page.locator('#tAbsorb')).toHaveText('$0');
  await expect(page.locator('#tDefer')).toHaveText('$0');
});

test('four decision controls and their explanations fit mobile and desktop in both themes', async ({
  page,
}) => {
  await page.goto('/home/');
  for (const theme of ['light', 'dark']) {
    await page.locator('#themeBtn').click();
    await page.locator(`#appearancePicker [data-set="${theme}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const bounds = await page.evaluate(
        () =>
          new Promise<{ width: number; scroll: number }>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                resolve({ width: innerWidth, scroll: document.documentElement.scrollWidth }),
              ),
            ),
          ),
      );
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
      const decisions = page.getByRole('group', { name: 'Decision', exact: true });
      await expect(decisions.getByRole('button')).toHaveCount(4);
      for (const control of await decisions.getByRole('button').all()) {
        await expect(control).toBeVisible();
        await expect(control.locator('.move-d')).toBeVisible();
        const size = await control.evaluate((element) => ({
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          width: element.clientWidth,
          scroll: element.scrollWidth,
          height: element.getBoundingClientRect().height,
        }));
        expect(size.left).toBeGreaterThanOrEqual(0);
        expect(size.right).toBeLessThanOrEqual(width);
        expect(size.scroll).toBeLessThanOrEqual(size.width);
        expect(size.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
