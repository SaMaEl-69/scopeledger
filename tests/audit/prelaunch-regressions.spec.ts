import { test, expect } from '@playwright/test';
const spacing =
  'main *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}main p{margin-bottom:2em!important}';

test('Home ROI suffix remains readable with user text spacing', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/home/');
    await page.addStyleTag({ content: spacing });
    await page.locator('.roi-big').scrollIntoViewIfNeeded();
    const bounds = await page.locator('.roi-big small').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
  }
});

test('workspace footer and calendar controls accommodate enlarged text and spacing', async ({
  page,
}) => {
  await page.goto('/workspace/');
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'Show all steps', exact: true }).click();
  await page.addStyleTag({ content: spacing });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
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
      await page.setViewportSize({ width: 1440, height: 988 });
      await page
        .locator('.sidebar')
        .getByRole('button', { name: new RegExp('^' + name) })
        .click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.locator('.view-loading')).toHaveCount(0);
      for (const width of [320, 387, 768, 1440]) {
        await page.setViewportSize({ width, height: 740 });
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scroll, `${name} at ${width}px`).toBeLessThanOrEqual(width);
        const footer = await page
          .locator('.page-footer')
          .evaluate((e) => [...e.children].map((c) => c.getBoundingClientRect().right));
        for (const right of footer) expect(right).toBeLessThanOrEqual(width);
        if (name === 'Calendar') {
          const clipped = await page.locator('.calendar-day-number').evaluateAll((buttons) =>
            buttons
              .filter((b) => {
                const box = b.getBoundingClientRect();
                const range = document.createRange();
                range.selectNodeContents(b);
                return [...range.getClientRects()].some(
                  (r) =>
                    r.left < box.left - 1 ||
                    r.right > box.right + 1 ||
                    r.top < box.top - 1 ||
                    r.bottom > box.bottom + 1,
                );
              })
              .map((b) => b.textContent),
          );
          expect(clipped).toEqual([]);
        }
      }
    }
  }
});

test('both license prices stay within their cards on phone tablet and desktop', async ({
  page,
}) => {
  await page.goto('/home/');
  for (const width of [320, 387, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.locator('.license-summary > div').evaluateAll((cards) =>
      cards.map((card) => {
        const c = card.getBoundingClientRect(),
          v = card.querySelector('.amt')!.getBoundingClientRect();
        return { left: v.left, right: v.right, cardLeft: c.left, cardRight: c.right };
      }),
    );
    for (const b of bounds) {
      expect(b.left).toBeGreaterThanOrEqual(b.cardLeft - 1);
      expect(b.right).toBeLessThanOrEqual(b.cardRight + 1);
    }
  }
});
