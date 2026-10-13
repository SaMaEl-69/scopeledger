import { expect, test, type Locator } from '@playwright/test';

async function animationFrames(track: Locator) {
  return track.evaluate(async (element) => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error('The conversation carousel is not animated');
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

test('seven illustrative conversations animate continuously without arrows or a counter', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/home/');
  const section = page.locator('#conversationScenarios');
  await section.scrollIntoViewIfNeeded();
  const viewport = section.locator('.conversation-viewport');
  const loop = section.locator('.conversation-loop');
  const toggle = section.locator('#conversationToggle');
  await expect(section).toHaveAttribute('data-in-view', 'true');
  await expect(loop).toHaveCSS('animation-name', 'conversation-marquee');
  await expect(
    section.locator('.conversation-track:not(.conversation-track-copy) .conversation-card'),
  ).toHaveCount(7);
  await expect(section.locator('.conversation-track-copy .conversation-card')).toHaveCount(7);
  await expect(section.locator('.conversation-track-copy')).toHaveAttribute('aria-hidden', 'true');
  await expect(section.locator('.conversation-navigation, .conversation-count')).toHaveCount(0);
  await expect(toggle).toHaveText('Pause carousel');
  const times = await animationFrames(loop);
  expect(times[0]).not.toBeNull();
  expect(times[1]).toBeGreaterThan(times[0] as number);

  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(loop).toHaveCSS('animation-play-state', 'paused');
  await page.mouse.move(4, 4);
  await toggle.click();
  await expect(toggle).toHaveText('Resume carousel');
  await expect(loop).toHaveCSS('animation-play-state', 'paused');
  await toggle.click();
  await expect(toggle).toHaveText('Pause carousel');
  await expect(loop).toHaveCSS('animation-play-state', 'running');

  const track = section.locator('#conversationTrack');
  await track.focus();
  await expect(loop).toHaveCSS('animation-name', 'none');
  await expect(section.locator('.conversation-track-copy')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test('conversation carousel respects reduced motion and shows all seven examples', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home/');
  const section = page.locator('#conversationScenarios');
  await section.scrollIntoViewIfNeeded();
  const track = section.locator('#conversationTrack');
  const viewport = section.locator('.conversation-viewport');
  const toggle = section.locator('#conversationToggle');
  await expect(section.locator('.conversation-loop')).toHaveCSS('animation-name', 'none');
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveText('Motion off · all examples shown');
  await expect(
    section.getByText('Illustrative scenarios — not customer reviews', { exact: true }),
  ).toBeVisible();
  await expect(track.locator('.conversation-card')).toHaveCount(7);
  await expect(section.locator('.conversation-track-copy')).toBeHidden();
  await expect(track.locator('h3')).toHaveText([
    'Quote',
    'Absorb',
    'Exchange',
    'Defer',
    'Quote',
    'Exchange',
    'Defer',
  ]);
  await expect(section).not.toContainText(
    /verified|rated|stars|4\.9|recovered|pushback|Sam Ortega|Alex Rivera|Maya Okafor|Tom Brandt|1,200/i,
  );
  await expect(section.locator('.conversation-navigation, .conversation-count')).toHaveCount(0);

  const layout = await section.evaluate((element) => {
    const viewportRect = element.querySelector('.conversation-viewport')!.getBoundingClientRect();
    const cards = [...element.querySelectorAll('#conversationTrack .conversation-card')];
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          width: card.clientWidth,
          scroll: card.scrollWidth,
          topClearance: rect.top - viewportRect.top,
          bottomClearance: viewportRect.bottom - rect.bottom,
        };
      }),
    };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
  for (const card of layout.cards) {
    expect(card.scroll).toBeLessThanOrEqual(card.width);
    expect(card.topClearance).toBeGreaterThanOrEqual(15);
    expect(card.bottomClearance).toBeGreaterThanOrEqual(15);
  }
});

test('conversation cards fit light and dark themes at mobile, tablet and desktop widths', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
        const viewport = element.querySelector('.conversation-viewport')!.getBoundingClientRect();
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          cards: [...element.querySelectorAll('#conversationTrack .conversation-card')].map(
            (card) => {
              const rect = card.getBoundingClientRect();
              return {
                width: card.clientWidth,
                scroll: card.scrollWidth,
                top: rect.top - viewport.top,
                bottom: viewport.bottom - rect.bottom,
              };
            },
          ),
        };
      });
      expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.cards).toHaveLength(7);
      for (const card of layout.cards) {
        expect(card.scroll).toBeLessThanOrEqual(card.width);
        expect(card.top).toBeGreaterThanOrEqual(15);
        expect(card.bottom).toBeGreaterThanOrEqual(15);
      }
      await expect(section.locator('.conversation-brand img')).toHaveCount(28);
      await expect(
        section.locator('.conversation-brand .brand-image-light').first(),
      ).toHaveAttribute('src', '/brand/scopeledger-mark.svg?v=7');
      await expect(
        section.locator('.conversation-brand .brand-image-dark').first(),
      ).toHaveAttribute('src', '/brand/scopeledger-mark-dark.svg?v=7');
    }
  }
});
