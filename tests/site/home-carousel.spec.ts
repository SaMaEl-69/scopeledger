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

async function animationTimeFrames(track: Locator) {
  return track.evaluate(async (element) => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error('The carousel track has no CSS animation');
    await animation.ready;
    const nextPaint = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    await nextPaint();
    const first = animation.currentTime;
    await nextPaint();
    return [first, animation.currentTime];
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

test('illustrative carousel pauses and resumes from the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/home/');
  const carousel = page.locator('#audienceCarousel');
  const track = carousel.locator('.mq-track').first();
  const toggle = page.locator('#carouselToggle');
  await carousel.scrollIntoViewIfNeeded();
  await expect(toggle).toHaveText('Pause carousel');
  await expect(carousel.locator('.mq-clone')).toHaveCount(2);
  await expect(carousel.locator('.mq-set:not(.mq-clone) > li')).toHaveCount(54);
  const movingPositions = await transformFrames(track);
  expect(movingPositions[0]).not.toBe(movingPositions[1]);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveText('Resume carousel');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(track).toHaveCSS('animation-play-state', 'paused');
  const pausedTimes = await animationTimeFrames(track);
  expect(pausedTimes[0]).not.toBeNull();
  expect(pausedTimes[0]).toBe(pausedTimes[1]);
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
    'Samael · Maker of Margvant',
  );
  await expect(page.locator('#founder blockquote')).toHaveText(
    'Margvant helps you see the cost of a request before you agree to it. The goal is a clear decision and a clear page for your client.',
  );
  await expect(page.locator('#founder .maker-signature')).toHaveCount(0);
  await expect(page.locator('#founder')).not.toContainText('Signature');
  await expect(page.locator('#founder')).not.toContainText(/Sam Ortega|alias/i);
  await expect(carousel.locator('#audienceTitle')).toHaveText('Illustrative studio examples');
  await expect(carousel.locator('#audienceDisclosure')).toHaveText(
    'Names, locations and team sizes are illustrative, not customer endorsements.',
  );
  await expect(carousel.locator('.mq-set:not(.mq-clone)').first().locator('> li')).toHaveCount(27);
  await expect(carousel.locator('.mq-set:not(.mq-clone)').last().locator('> li')).toHaveCount(27);
  await expect(
    carousel.locator('.mq-set:not(.mq-clone)').first().locator('.ag-name').first(),
  ).toHaveText('Halcyon Studio');
  await expect(
    carousel.locator('.mq-set:not(.mq-clone)').last().locator('.ag-name').last(),
  ).toHaveText('Goodsense');
  for (const card of await carousel.locator('.mq-set:not(.mq-clone) > li').all()) {
    await expect(card).toHaveAttribute('aria-label', /illustrative studio example/);
    await expect(card.locator('.ag-logo svg')).toHaveCount(1);
    await expect(card.locator('.ag-team')).toHaveAttribute('aria-hidden', 'true');
    await expect(card.locator('.ag-team .has-av').first().locator('svg')).toHaveCount(1);
  }
  await expect(carousel).not.toContainText(/verified|review|1,200|studios using/i);
});

test('pointer hover pauses and spotlights either studio lane without a click', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/home/');
  const carousel = page.locator('#audienceCarousel');
  await carousel.scrollIntoViewIfNeeded();
  for (const index of [0, 1]) {
    const row = carousel.locator('.mq-row').nth(index);
    await row.scrollIntoViewIfNeeded();
    const track = row.locator('.mq-track');
    const cards = row.locator('.mq-set > li');
    await expect(track).toHaveCSS('animation-name', 'scenario-marquee');
    const rowBounds = await row.boundingBox();
    expect(rowBounds).not.toBeNull();
    await page.mouse.move(
      rowBounds!.x + rowBounds!.width / 2,
      rowBounds!.y + rowBounds!.height / 2,
    );
    await expect(row).toHaveAttribute('data-hovered', 'true');
    const cardIndex = await cards.evaluateAll((elements) => {
      const rowBounds = elements[0].closest('.mq-row')!.getBoundingClientRect();
      return elements.findIndex((element) => {
        const bounds = element.getBoundingClientRect();
        const center = bounds.left + bounds.width / 2;
        return center >= rowBounds.left && center <= rowBounds.right;
      });
    });
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    const card = cards.nth(cardIndex);
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await expect(row).toHaveAttribute('data-hovered', 'true');
    await expect(track).toHaveCSS('animation-play-state', 'paused');
    await expect(card).toHaveCSS('opacity', '1');
    const positions = await animationTimeFrames(track);
    expect(positions[0]).toBe(positions[1]);
    await page.mouse.move(4, 4);
    await expect(row).not.toHaveAttribute('data-hovered', 'true');
    await expect(track).toHaveCSS('animation-play-state', 'running');
    const resumed = await animationTimeFrames(track);
    expect(resumed[0]).not.toBe(resumed[1]);
  }
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
  await expect(original).toHaveCount(54);
  for (const card of await original.all()) await expect(card).toBeVisible();
  await row.focus();
  expect(await nativeKeyboardScroll(row, page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
