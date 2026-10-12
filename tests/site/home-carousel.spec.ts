import { expect, test, type Locator, type Page } from '@playwright/test';

async function transformFrames(track: Locator) {
  return track.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.ready));
    const nextPaint = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    await nextPaint();
    const first = getComputedStyle(element).transform;
    await nextPaint();
    return [first, getComputedStyle(element).transform];
  });
}

async function nativeKeyboardScroll(row: Locator, page: Page) {
  // Let the focused scroll container finish its native layout before observing input.
  await row.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const observation = await row.evaluateHandle((element) => ({
    scrolled: new Promise<number>((resolve) =>
      element.addEventListener('scroll', () => resolve(element.scrollLeft), { once: true }),
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

test('illustrative carousel pauses and resumes from the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/home/');
  const carousel = page.locator('#audienceCarousel');
  const track = carousel.locator('.mq-track').first();
  const toggle = page.locator('#carouselToggle');
  await carousel.scrollIntoViewIfNeeded();
  await expect(toggle).toHaveText('Pause carousel');
  await expect(carousel.locator('.mq-clone')).toHaveCount(2);
  await expect(carousel.locator('.mq-set:not(.mq-clone) > li')).toHaveCount(20);
  const movingPositions = await transformFrames(track);
  expect(movingPositions[0]).not.toBe(movingPositions[1]);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveText('Resume carousel');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(track).toHaveCSS('animation-play-state', 'paused');
  const positions = await transformFrames(track);
  expect(positions[0]).toBe(positions[1]);
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveText('Pause carousel');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(track).toHaveCSS('animation-play-state', 'running');
  const resumedPositions = await transformFrames(track);
  expect(resumedPositions[0]).not.toBe(resumedPositions[1]);
  const row = carousel.locator('.mq-row').first();
  await row.focus();
  await expect(track).toHaveCSS('animation-name', 'none');
  await expect(track).toHaveCSS('transform', 'none');
  await expect(row.locator('.mq-clone')).toBeHidden();
  expect(await nativeKeyboardScroll(row, page)).toBeGreaterThan(0);

  await expect(page.locator('#founder .founder-attribution')).toHaveText(
    'Sam Ortega (alias) · Maker of Margvant',
  );
  await expect(page.locator('#founder blockquote')).toHaveText(
    'Margvant helps you see the cost of a request before you agree to it. The goal is a clear decision and a clear page for your client.',
  );
  await expect(page.locator('#founder .alias-signature')).toContainText(
    'Typographic alias signature',
  );
  await expect(carousel).not.toContainText(/verified|review|1,200|studios using/i);
});

test('reduced motion keeps every illustrative card available without animation or page overflow', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home/');
  const carousel = page.locator('#audienceCarousel');
  const row = carousel.locator('.mq-row').first();
  const track = row.locator('.mq-track');
  await carousel.scrollIntoViewIfNeeded();
  await expect(page.locator('#carouselToggle')).toBeDisabled();
  await expect(page.locator('#carouselToggle')).toHaveText('Motion off · scroll to explore');
  await expect(track).toHaveCSS('animation-name', 'none');
  await expect(track).toHaveCSS('transform', 'none');
  await expect(carousel.locator('.mq-clone').first()).toBeHidden();
  await expect(carousel.locator('.mq-clone').last()).toBeHidden();
  const original = carousel.locator('.mq-set:not(.mq-clone) > li');
  await expect(original).toHaveCount(20);
  for (const card of await original.all()) await expect(card).toBeVisible();
  await row.focus();
  expect(await nativeKeyboardScroll(row, page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
