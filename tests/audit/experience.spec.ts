import { showAllSteps } from '../browser/project-view';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const views = [
  'Overview',
  'Projects',
  'Change requests',
  'Clients',
  'Calendar',
  'Documents',
  'Templates',
  'Settings & backup',
  'Help & support',
];
const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit');
async function open(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await expect(page.locator('.view-loading')).toHaveCount(0);
  await showAllSteps(page);
}
async function nav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await expect(page.locator('.view-loading')).toHaveCount(0);
  await showAllSteps(page);
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
}
async function bounds(page: Page) {
  return page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        'button.button, .text-button, .nav-item, .quick-find',
      ),
    ].filter((button) => {
      const box = button.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.right > 0 &&
        !button.closest('[inert], [hidden]') &&
        getComputedStyle(button).visibility !== 'hidden'
      );
    });
    const misalignedIcons = controls.flatMap((button) => {
      const box = button.getBoundingClientRect();
      return [...button.querySelectorAll(':scope > svg')].flatMap((icon) => {
        const image = icon.getBoundingClientRect();
        if (!image.width || ['absolute', 'fixed'].includes(getComputedStyle(icon).position))
          return [];
        const offset = Math.abs((image.top + image.bottom - box.top - box.bottom) / 2);
        return offset > 2 ? [{ text: button.textContent?.trim(), offset }] : [];
      });
    });
    const clippedActionText = controls.flatMap((button) => {
      const box = button.getBoundingClientRect();
      return [...button.childNodes].flatMap((node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return [];
        const range = document.createRange();
        range.selectNode(node);
        const text = range.getBoundingClientRect();
        return text.left < box.left - 2 ||
          text.right > box.right + 2 ||
          text.top < box.top - 2 ||
          text.bottom > box.bottom + 2
          ? [{ text: node.textContent.trim(), class: button.className }]
          : [];
      });
    });
    const firstAction = document.querySelector('.workspace-launch-actions .button');
    const shortcuts = document.querySelector('.workspace-launch .shortcut-help');
    const firstBox = firstAction?.getBoundingClientRect();
    const shortcutBox = shortcuts?.getBoundingClientRect();
    const actionRowOffset =
      firstBox?.width && shortcutBox?.width
        ? Math.abs((firstBox.top + firstBox.bottom - shortcutBox.top - shortcutBox.bottom) / 2)
        : 0;
    return {
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      controlsChecked: controls.length,
      misalignedIcons,
      clippedActionText,
      actionRowOffset,
      offenders: [...document.querySelectorAll('main *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.width > 0 && r.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed'
          );
        })
        .slice(0, 8)
        .map((e) => ({ tag: e.tagName, class: e.className })),
    };
  });
}
const sizes = [
  [320, 740],
  [360, 800],
  [375, 812],
  [390, 844],
  [430, 932],
  [600, 900],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 900],
  [1440, 1000],
  [1536, 960],
  [1920, 1080],
  [2560, 1440],
  [844, 390],
  [1366, 768],
  [469, 800],
  [471, 800],
  [699, 900],
  [701, 900],
  [759, 900],
  [761, 900],
  [899, 900],
  [901, 900],
  [1199, 900],
  [1201, 900],
];
test('long document selections retain native access and fit every requested width', async ({
  page,
}, info) => {
  await open(page);
  await nav(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a project', exact: true });
  const projectName =
    'International publishing and research collaboration with extensive client deliverables and multilingual documentation';
  await dialog.getByLabel('Project name', { exact: true }).fill(projectName);
  await dialog
    .getByLabel('Client name', { exact: true })
    .fill('International research collaboration');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByLabel('Request title', { exact: true })
    .fill(
      'Extended publishing deliverables with accessible multilingual templates and documented acceptance criteria',
    );
  await page.getByRole('button', { name: 'Preview client brief', exact: true }).click();
  await expect(
    page
      .getByLabel('Document project', { exact: true })
      .getByRole('option', { name: projectName, exact: true }),
  ).toHaveAttribute('value', /.+/);
  const record = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    record.push({ width, height, scroll: (await bounds(page)).scroll });
  }
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.addStyleTag({ content: 'html{font-size:200% !important}' });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(768);
  await page.getByLabel('Document project', { exact: true }).focus();
  await expect(page.getByLabel('Document project', { exact: true })).toBeFocused();
  await page.screenshot({
    path: resolve(output, `${info.project.name}-Documents-long-enlarged.png`),
  });
  await writeFile(
    resolve(output, `${info.project.name}-document-long-responsive.json`),
    JSON.stringify(record, null, 2),
  );
});
for (const [width, height] of sizes)
  test(`all views reflow at ${width} × ${height}`, async ({ page }, info) => {
    await mkdir(output, { recursive: true });
    await open(page);
    await page.setViewportSize({ width, height });
    const record = [];
    for (const theme of ['dark', 'light']) {
      const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (await menu.isVisible()) await menu.click();
      await page
        .locator('.sidebar')
        .getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true })
        .click();
      if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('open')))
        await page.keyboard.press('Escape');
      for (const view of views) {
        await nav(page, view);
        const result = await bounds(page);
        record.push({ theme, view, height, ...result });
        await writeFile(
          resolve(output, `${info.project.name}-responsive-${width}.json`),
          JSON.stringify(record, null, 2),
        );
        expect(result.scroll, JSON.stringify({ view, ...result })).toBeLessThanOrEqual(width);
        expect(result.misalignedIcons, `${view}: icons align with their controls`).toEqual([]);
        expect(
          result.actionRowOffset,
          `${view}: shortcuts align with the first action row`,
        ).toBeLessThanOrEqual(2);
        expect(
          result.clippedActionText,
          `${view}: action labels remain inside their controls`,
        ).toEqual([]);
        if (width <= 760) {
          const smallControls = await page
            .locator('main input, main select, main textarea')
            .evaluateAll((controls) =>
              controls
                .filter((control) => {
                  if (!control.getClientRects().length) return false;
                  if (
                    control instanceof HTMLInputElement &&
                    ['checkbox', 'radio', 'range', 'color', 'hidden'].includes(control.type)
                  )
                    return false;
                  return parseFloat(getComputedStyle(control).fontSize) < 16;
                })
                .map((control) => ({
                  label: control.getAttribute('aria-label'),
                  id: control.id,
                  size: getComputedStyle(control).fontSize,
                })),
            );
          expect(smallControls, `${view}: mobile text controls stay readable`).toEqual([]);
        }
        if (
          [320, 768, 1440, 2560].includes(width) &&
          ['Change requests', 'Overview', 'Calendar', 'Documents', 'Settings & backup'].includes(
            view,
          )
        )
          await page.screenshot({
            path: resolve(
              output,
              `${info.project.name}-${theme}-${view.replace(/\W+/g, '-')}-${width}.png`,
            ),
          });
      }
    }
  });
test('WCAG automated checks across views and modal forms', async ({ page }, info) => {
  await mkdir(output, { recursive: true });
  await open(page);
  const record = [];
  for (const view of views) {
    await nav(page, view);
    const result = await new AxeBuilder({ page })
      .setLegacyMode()
      .options({ iframes: false })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    record.push({
      view,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    });
  }
  await nav(page, 'Projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const result = await new AxeBuilder({ page })
    .setLegacyMode()
    .options({ iframes: false })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  record.push({
    view: 'Create project dialog',
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  });
  await writeFile(
    resolve(output, `${info.project.name}-accessibility.json`),
    JSON.stringify(record, null, 2),
  );
  expect(
    record.flatMap((x) => x.violations),
    JSON.stringify(record.filter((x) => x.violations.length)),
  ).toEqual([]);
});
test('keyboard modal editing retains focus, traps tab and restores opener on escape', async ({
  page,
}) => {
  await open(page);
  await page.setViewportSize({ width: 320, height: 740 });
  const opener = page.getByRole('button', { name: 'Review baseline', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Approved project baseline', exact: true });
  await expect(dialog).toBeVisible();
  const scope = page.getByLabel('Approved scope', { exact: true });
  await scope.click();
  await scope.pressSequentially(' Typed without losing focus.');
  await expect(scope).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await expect(page.getByText('Discard unfinished entries?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(scope).toHaveValue(/Typed without losing focus/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard entries', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeVisible();
  await page.getByLabel('Approved scope', { exact: true }).click();
  await page.getByLabel('Approved scope', { exact: true }).press('End');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
test('large text and zoom-equivalent narrow reflow keep primary controls usable', async ({
  page,
}) => {
  await open(page);
  await page.setViewportSize({ width: 640, height: 768 });
  for (const view of views) {
    await nav(page, view);
    expect((await bounds(page)).scroll).toBeLessThanOrEqual(640);
  }
  await page.setViewportSize({ width: 320, height: 768 });
  for (const view of views) {
    await nav(page, view);
    expect((await bounds(page)).scroll).toBeLessThanOrEqual(320);
  }
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.addStyleTag({ content: 'html{font-size:200% !important}' });
  for (const view of views) {
    await nav(page, view);
    expect(
      (await bounds(page)).scroll,
      JSON.stringify({ view, ...(await bounds(page)) }),
    ).toBeLessThanOrEqual(768);
  }
});

test('phone and short landscape dialogs scroll, close and retain essential controls', async ({
  page,
}) => {
  await open(page);
  for (const size of [
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await nav(page, 'Change requests');
    for (const name of [
      'Review baseline',
      'Use an example request',
      'Compare responses',
      'Compose client response',
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        `${name} at ${size.width}`,
      ).toBe(true);
      await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    await nav(page, 'Calendar');
    await page.getByRole('button', { name: 'New reminder', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await nav(page, 'Projects');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Create project', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Create project', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'View activation options', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Purchases and activation are unavailable');
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Continue with demo', exact: true }).click();
  }
});
test('touch entry remains reachable after a keyboard-sized viewport reduction', async ({
  browser,
}, info) => {
  test.skip(
    info.project.name === 'firefox',
    'Mobile context emulation is unavailable in this Firefox backend; desktop keyboard coverage runs separately.',
  );
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Dhaka',
  });
  const page = await context.newPage();
  try {
    await open(page);
    await page.getByRole('button', { name: 'Review baseline', exact: true }).tap();
    await page.getByLabel('Approved scope', { exact: true }).tap();
    await page.setViewportSize({ width: 390, height: 360 });
    const scope = page.getByLabel('Approved scope', { exact: true });
    await scope.fill('Software-keyboard viewport proxy: edited scope');
    await scope.scrollIntoViewIfNeeded();
    await expect(scope).toBeInViewport();
    await page.getByRole('button', { name: 'Save baseline', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Save baseline', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    await expect(page.getByText('Discard unfinished entries?', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discard entries', exact: true }).tap();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
    await expect(page.locator('.main-shell')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  } finally {
    await context.close();
  }
});
test('large financial amounts and unfinished inputs keep their meaning at 320 pixels', async ({
  page,
}) => {
  await open(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('button', { name: 'Review baseline', exact: true }).click();
  await page
    .getByLabel('Approved fee, excluding tax', { exact: true })
    .fill('999999999999999999999999');
  await page.getByRole('button', { name: 'Save baseline', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('agreed-margin')).not.toHaveText('—');
  expect((await bounds(page)).scroll).toBeLessThanOrEqual(320);
  await page.getByLabel('Additional hours', { exact: true }).fill('1e-');
  await expect(page.getByTestId('agreed-margin')).toHaveText('—');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.locator('.request-card .status-draft')).toHaveText('Draft');
  await expect(page.locator('.alert.error')).toBeVisible();
  expect((await bounds(page)).scroll).toBeLessThanOrEqual(320);
});
