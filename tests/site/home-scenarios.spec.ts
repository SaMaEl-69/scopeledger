import { expect, test, type Locator, type Page } from '@playwright/test';

test('desktop carousel advances the three-card view using smooth motion without autoplay', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/home/');
  const section = page.locator('#conversationScenarios');
  await section.scrollIntoViewIfNeeded();
  const track = section.locator('.conversation-track');
  const previous = section.getByRole('button', { name: 'Previous scenario', exact: true });
  const next = section.getByRole('button', { name: 'Next scenario', exact: true });
  await expect(track).toHaveCSS('animation-name', 'none');
  await expect(track).toHaveCSS('transform', 'none');
  await expect(section.locator('.conversation-count')).toHaveText('Scenarios 1–3 of 4');
  await next.click();
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(section.locator('.conversation-count')).toHaveText('Scenarios 2–4 of 4');
  await expect(previous).toHaveAttribute('aria-disabled', 'false');
  const position = await track.evaluate((element) => ({
    left: element.scrollLeft,
    end: element.scrollWidth - element.clientWidth,
  }));
  expect(position.left).toBeGreaterThan(0);
  expect(Math.abs(position.end - position.left)).toBeLessThanOrEqual(1);
  await previous.click();
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  await expect(section.locator('.conversation-count')).toHaveText('Scenarios 1–3 of 4');
});

async function nativeKeyboardScroll(track: Locator, page: Page) {
  await track.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const observation = await track.evaluateHandle((element) => ({
    scrolled: new Promise<number>((resolve) =>
      element.addEventListener(
        'scroll',
        () => requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.scrollLeft))),
        { once: true },
      ),
    ),
  }));
  try {
    await page.keyboard.down('ArrowRight');
    return await observation.evaluate((wrapper) => wrapper.scrolled);
  } finally {
    await page.keyboard.up('ArrowRight');
    await observation.dispose();
  }
}

test('client-conversation carousel labels its examples and keeps all four decisions reachable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home/');
  const section = page.locator('#conversationScenarios');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.conversation-track')).toHaveCSS('animation-name', 'none');
  await expect(section.locator('.conversation-track')).toHaveCSS('transform', 'none');
  await expect(
    section.getByText('Illustrative scenarios — not customer reviews', { exact: true }),
  ).toBeVisible();
  await expect(section.locator('.conversation-card')).toHaveCount(4);
  await expect(section.locator('h3')).toHaveText(['Quote', 'Absorb', 'Exchange', 'Defer']);
  await expect(section).not.toContainText(
    /verified|rated|stars|recovered|pushback|Sam Ortega|Alex Rivera|Maya Okafor|Tom Brandt|1,200/i,
  );
  await expect(section.locator('.conversation-count')).toHaveText('Scenario 1 of 4');
  const previous = section.getByRole('button', { name: 'Previous scenario', exact: true });
  const next = section.getByRole('button', { name: 'Next scenario', exact: true });
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  for (const [position, choice] of [
    [2, 'Absorb'],
    [3, 'Exchange'],
    [4, 'Defer'],
  ] as const) {
    await next.click();
    await expect(section.locator('.conversation-count')).toHaveText(`Scenario ${position} of 4`);
    const bounds = await section
      .locator('.conversation-card')
      .filter({ has: page.getByRole('heading', { name: choice, exact: true }) })
      .evaluate((card) => {
        const outer = card.parentElement!.getBoundingClientRect();
        const inner = card.getBoundingClientRect();
        return {
          left: inner.left,
          right: inner.right,
          outerLeft: outer.left,
          outerRight: outer.right,
        };
      });
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.outerLeft);
    expect(bounds.right).toBeLessThanOrEqual(bounds.outerRight);
  }
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await previous.focus();
  await page.keyboard.press('Enter');
  await expect(section.locator('.conversation-count')).toHaveText('Scenario 3 of 4');
  await previous.click();
  await previous.click();
  await expect(section.locator('.conversation-count')).toHaveText('Scenario 1 of 4');
  const track = section.locator('.conversation-track');
  await track.focus();
  expect(await nativeKeyboardScroll(track, page)).toBeGreaterThan(0);
});

test('client-conversation cards fit both themes at mobile and desktop widths', async ({ page }) => {
  await page.goto('/home/');
  const section = page.locator('#conversationScenarios');
  for (const theme of ['light', 'dark']) {
    await page.locator('#themeBtn').click();
    await page.locator(`#appearancePicker [data-set="${theme}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await section.scrollIntoViewIfNeeded();
      const layout = await section.evaluate(async (element) => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return {
          pageWidth: innerWidth,
          pageScroll: document.documentElement.scrollWidth,
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
        };
      });
      expect(layout.pageScroll).toBeLessThanOrEqual(layout.pageWidth);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      for (const card of await section.locator('.conversation-card').all()) {
        const bounds = await card.evaluate((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
      }
      for (const control of await section.getByRole('button').all()) {
        await expect(control).toBeVisible();
        const size = await control.boundingBox();
        expect(size!.width).toBeGreaterThanOrEqual(44);
        expect(size!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(section.locator('.conversation-brand img')).toHaveCount(8);
      await expect(
        section.locator('.conversation-brand .brand-image-light').first(),
      ).toHaveAttribute('src', '/brand/scopeledger-mark.svg?v=7');
      await expect(
        section.locator('.conversation-brand .brand-image-dark').first(),
      ).toHaveAttribute('src', '/brand/scopeledger-mark-dark.svg?v=7');
    }
  }
});
