import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit/viewport-polish');
const widths = [
  320, 355, 390, 419, 421, 480, 519, 521, 559, 561, 600, 640, 641, 699, 701, 759, 761, 768, 819,
  821, 859, 861, 899, 901, 959, 961, 979, 981, 1024, 1179, 1181, 1280, 1434, 1920, 2560,
];

test('Home sections, brand identity and download controls stay balanced across breakpoints', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await mkdir(output, { recursive: true });
  const records = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/home/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 988 });
      for (const section of await page.locator('main > section').all()) {
        await section.scrollIntoViewIfNeeded();
        await page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${theme}/${width}`,
        ).toBeLessThanOrEqual(width);
      }
      const identity = page.locator('.letter-identity .brand-lockup');
      await expect(identity).toBeVisible();
      const logo = identity.locator('img:visible');
      const dimensions = await logo.evaluate((image: HTMLImageElement) => {
        const imageBox = image.getBoundingClientRect();
        const sideBox = image.closest('.letter-side')!.getBoundingClientRect();
        return {
          loaded: image.complete && image.naturalWidth > 0,
          renderedRatio: imageBox.width / imageBox.height,
          naturalRatio: image.naturalWidth / image.naturalHeight,
          withinSide: imageBox.left >= sideBox.left && imageBox.right <= sideBox.right,
          width: imageBox.width,
        };
      });
      expect(dimensions.loaded).toBe(true);
      expect(dimensions.withinSide).toBe(true);
      // SVG intrinsic sizes are rounded to whole pixels by some engines.
      expect(Math.abs(dimensions.renderedRatio / dimensions.naturalRatio - 1)).toBeLessThan(0.01);
      expect(dimensions.width).toBeLessThanOrEqual(190);
      await page.locator('#paper').scrollIntoViewIfNeeded();
      await expect(page.locator('#paper img')).toHaveJSProperty('complete', true);
      const geometry = await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#exportTxt')!);
        const status = range.getBoundingClientRect();
        const button = document.querySelector('#exportBtn')!.getBoundingClientRect();
        const bar = document.querySelector('#exportBar')!.getBoundingClientRect();
        const overlaps =
          status.left < button.right &&
          status.right > button.left &&
          status.top < button.bottom &&
          status.bottom > button.top;
        const clippedLabels: string[] = [];
        for (const control of document.querySelectorAll('main .btn, main .link, main button')) {
          const box = control.getBoundingClientRect();
          if (
            !box.width ||
            !box.height ||
            control.closest('[hidden]') ||
            getComputedStyle(control).visibility === 'hidden'
          )
            continue;
          for (const node of control.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
            const textRange = document.createRange();
            textRange.selectNode(node);
            for (const text of textRange.getClientRects()) {
              if (
                text.left < box.left - 2 ||
                text.right > box.right + 2 ||
                text.top < box.top - 2 ||
                text.bottom > box.bottom + 2
              )
                clippedLabels.push(node.textContent.trim());
            }
          }
        }
        return {
          overlaps,
          statusWithinBar:
            status.left >= bar.left &&
            status.right <= bar.right &&
            status.top >= bar.top &&
            status.bottom <= bar.bottom,
          barWithinViewport: bar.left >= 0 && bar.right <= innerWidth,
          buttonHeight: button.height,
          clippedLabels,
        };
      });
      expect(geometry.overlaps, `${theme}/${width}: download caption`).toBe(false);
      expect(geometry.statusWithinBar).toBe(true);
      expect(geometry.barWithinViewport).toBe(true);
      expect(geometry.clippedLabels, `${theme}/${width}: action labels`).toEqual([]);
      if (width <= 420) expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
      records.push({ theme, width, dimensions, geometry });
      if ([320, 355, 768, 1024, 1434, 2560].includes(width)) {
        for (const selector of ['#founder', '#change-orders', '#roi', '#pricing']) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          await page.screenshot({
            path: resolve(
              output,
              `${info.project.name}-${theme}-${width}-${selector.slice(1)}.png`,
            ),
          });
        }
      }
    }
  }
  expect(errors).toEqual([]);
  await writeFile(
    resolve(output, `${info.project.name}-home-geometry.json`),
    JSON.stringify({ records, errors }, null, 2) + '\n',
  );
});

test('Home search keeps its input, results and keyboard hint inside short screens', async ({
  page,
}, info) => {
  await mkdir(output, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const size of [
      { width: 320, height: 740 },
      { width: 390, height: 300 },
      { width: 844, height: 320 },
      { width: 1024, height: 600 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/home/');
      await page.keyboard.press('Control+k');
      await expect(page.locator('#cmdk')).toBeVisible();
      await expect(page.locator('#cmdk input')).toBeFocused();
      const geometry = await page.locator('.cmdk-box').evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hint = element.querySelector('.cmdk-foot')!.getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          hintBottom: hint.bottom,
          font: parseFloat(getComputedStyle(element.querySelector('input')!).fontSize),
        };
      });
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(size.height - 8);
      expect(geometry.hintBottom).toBeLessThanOrEqual(size.height - 8);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(size.width);
      expect(geometry.font).toBeGreaterThanOrEqual(16);
      await page.screenshot({
        path: resolve(
          output,
          `${info.project.name}-${theme}-search-${size.width}-${size.height}.png`,
        ),
      });
      await page.keyboard.press('Escape');
      await expect(page.locator('#cmdk')).toBeHidden();
    }
  }
});

test('workspace action labels retain padding with mobile and enlarged text', async ({
  page,
}, info) => {
  await mkdir(output, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 355, 390, 600, 760, 768, 1024, 1434]) {
      await page.setViewportSize({ width, height: 988 });
      await page.goto('/workspace/');
      await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
      const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (await navigation.isVisible()) await navigation.click();
      await page.locator('.sidebar').getByRole('button', { name: 'Overview', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
      await expect(page.locator('.view-loading')).toHaveCount(0);
      for (const scale of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = `${16 * value}px`;
        }, scale);
        const geometry = await page
          .locator('.workspace-launch-actions .button')
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const box = button.getBoundingClientRect();
              const icon = button.querySelector('svg')!.getBoundingClientRect();
              const textRects = [...button.childNodes].flatMap((node) => {
                if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return [];
                const range = document.createRange();
                range.selectNode(node);
                return [...range.getClientRects()];
              });
              return {
                label: button.textContent?.trim(),
                height: box.height,
                padding: Math.min(
                  icon.left - box.left,
                  box.right - icon.right,
                  ...textRects.flatMap((text) => [text.left - box.left, box.right - text.right]),
                ),
                textFits: textRects.every(
                  (text) => text.top >= box.top && text.bottom <= box.bottom,
                ),
              };
            }),
          );
        expect(geometry).toHaveLength(4);
        for (const item of geometry) {
          expect(item.height).toBeGreaterThanOrEqual(44);
          expect(item.padding, `${theme}/${width}/${scale}: ${item.label}`).toBeGreaterThanOrEqual(
            8,
          );
          expect(item.textFits).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        if ([320, 355, 768, 1434].includes(width))
          await page.screenshot({
            path: resolve(
              output,
              `${info.project.name}-${theme}-actions-${width}-scale-${scale}.png`,
            ),
          });
      }
    }
  }
});
