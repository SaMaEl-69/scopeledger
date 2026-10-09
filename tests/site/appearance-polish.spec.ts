import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { documentHtml } from '../../shared/client-document.mjs';
import { fixture } from '../server/fixtures.mjs';

const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit/appearance-brand');
async function homeChoice(page: Page, mode: string) {
  await page.locator('#themeBtn').click();
  await page.locator(`#appearancePicker [data-set="${mode}"]`).click();
}
async function workspaceChoice(page: Page, mode: string) {
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await trigger.isVisible()) await trigger.click();
  await page.locator('.theme-options').getByRole('button', { name: mode, exact: true }).click();
  if (await trigger.isVisible()) await page.keyboard.press('Escape');
}
async function ready(page: Page) {
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
}
async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

test('system appearance follows device changes, manual overrides persist, and Home/workspace tabs synchronize', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/home/');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const workspace = await context.newPage();
  await workspace.emulateMedia({ colorScheme: 'light' });
  await workspace.goto('/workspace/');
  await ready(workspace);
  await expect(workspace.getByRole('button', { name: 'System', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await homeChoice(page, 'dark');
  await expect(workspace.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
  await expect(workspace.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await workspaceChoice(workspace, 'System');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await workspace.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(workspace.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('sl-theme'))).toBe('system');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await homeChoice(page, 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(workspace.locator('html')).toHaveAttribute('data-theme-preference', 'light');
  await workspace.close();
});

test('appearance controls remain usable with denied storage and retain keyboard dismissal', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window === window.top)
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Blocked', 'SecurityError');
        },
      });
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/home/');
  await homeChoice(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#appearanceStatus')).toHaveText('Choose System to match your device.');
  await expect(page.locator('#themeBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#appearancePicker')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#appearancePicker')).not.toHaveAttribute('open');
  await expect(page.locator('#themeBtn')).toBeFocused();
  await homeChoice(page, 'system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/workspace/');
  await ready(page);
  await workspaceChoice(page, 'Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.appearance-hint')).toHaveText('Choose System to match your device.');
  await workspaceChoice(page, 'System');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('new identity, actual PDF sample, evidence and aligned document controls reflow in both themes', async ({
  page,
  request,
}, info) => {
  test.setTimeout(180000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const records: unknown[] = [];
  for (const mode of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: mode as 'light' | 'dark' });
    await page.goto('/home/');
    await expect(page.locator('#nav .logo img:visible')).toHaveAttribute(
      'src',
      `/brand/scopeledger-logo-${mode}.svg?v=6`,
    );
    await expect(page.locator('#proof .evidence-card')).toHaveCount(6);
    await expect(page.locator('body')).not.toContainText('Verified reviews');
    await expect(page.locator('body')).not.toContainText('Rated 4.9');
    await expect(page.locator('body')).not.toContainText('1,200+ studios');
    await expect(page.locator('#paper img')).toHaveAttribute(
      'src',
      '/samples/change-brief.png?v=5',
    );
    for (const width of [
      320, 360, 390, 469, 471, 520, 600, 699, 701, 759, 761, 768, 899, 901, 1024, 1280, 1434, 1920,
      2560,
    ]) {
      await page.setViewportSize({ width, height: 988 });
      await settled(page);
      for (const selector of ['#nav', '#change-orders', '#proof', '#founder']) {
        const item = page.locator(selector);
        await item.scrollIntoViewIfNeeded();
        await settled(page);
        const bounds = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(bounds.scroll, `${mode}/${width}/${selector}`).toBeLessThanOrEqual(bounds.width);
      }
      await page.locator('#themeBtn').click();
      const popover = await page.locator('.appearance-popover').boundingBox();
      expect(popover!.x).toBeGreaterThanOrEqual(0);
      expect(popover!.x + popover!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      if ([320, 768, 1434, 2560].includes(width)) {
        await page.locator('#change-orders').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: resolve(output, `${info.project.name}-${mode}-${width}-sample.png`),
        });
        await page.locator('#proof').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: resolve(output, `${info.project.name}-${mode}-${width}-evidence.png`),
        });
      }
      records.push({ mode, width, homeOverflow: false, appearancePopoverInViewport: true });
    }
    await page.setViewportSize({ width: 1434, height: 988 });
    await page.locator('#themeBtn').click();
    const homeAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(homeAxe.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.goto('/workspace/');
    await ready(page);
    await page.locator('.sidebar').getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar .brand img:visible')).toHaveAttribute(
      'src',
      `/brand/scopeledger-logo-${mode}.svg?v=6`,
    );
    for (const width of [320, 390, 470, 471, 600, 768, 900, 1024, 1434, 2560]) {
      await page.setViewportSize({ width, height: 988 });
      await settled(page);
      const fields = page.locator('.document-history-filters select');
      const boxes = await fields.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, height: rect.height, width: rect.width, left: rect.left };
        }),
      );
      expect(boxes).toHaveLength(3);
      expect(
        Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height)),
      ).toBeLessThanOrEqual(1);
      if (width > 470) {
        expect(
          Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top)),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width)),
        ).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if ([320, 768, 1434, 2560].includes(width)) {
        await page.locator('.document-history').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: resolve(output, `${info.project.name}-${mode}-${width}-filters.png`),
        });
      }
    }
    await page.setViewportSize({ width: 1434, height: 988 });
    const workspaceAxe = await new AxeBuilder({ page })
      .setLegacyMode()
      .options({ iframes: false })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(workspaceAxe.violations).toEqual([]);
  }
  expect((await request.get('/brand/scopeledger-mark.svg?v=5')).status()).toBe(200);
  expect((await request.get('/samples/change-brief.png')).status()).toBe(200);
  expect(errors).toEqual([]);
  await writeFile(
    resolve(output, `${info.project.name}-polish.json`),
    JSON.stringify({ records, errors }, null, 2),
  );
});

test('demo watermark covers the full preview at narrow and wide widths while active documents stay clean', async ({
  page,
}, info) => {
  await mkdir(output, { recursive: true });
  for (const demo of [true, false]) {
    for (const width of [320, 768, 1434]) {
      await page.setViewportSize({ width, height: 1700 });
      const html = documentHtml(
        fixture({
          kind: 'brief',
          status: 'Quoted',
          demo,
          taxRate: '0',
          tax: '0',
          total: '800.00',
          approvalRecorded: '',
          approvalDate: '',
        }),
      );
      await page.setContent(
        `<html lang="en"><head><title>Watermark verification</title><style>body{margin:0}iframe{display:block;width:100%;height:1700px;border:0}</style></head><body><iframe title="Client document preview" sandbox=""></iframe></body></html>`,
      );
      await page.locator('iframe').evaluate((node: HTMLIFrameElement, content) => {
        node.srcdoc = content;
      }, html);
      const frame = page.frameLocator('iframe');
      await expect(frame.getByRole('heading', { name: 'Change brief', exact: true })).toBeVisible();
      if (demo) {
        await expect(frame.locator('.watermark')).toContainText('DEMO PREVIEW');
        const bounds = await frame.locator('.demo-watermark').evaluate((node) => {
          const overlay = node.getBoundingClientRect(),
            article = node.closest('article')!.getBoundingClientRect();
          return {
            height: overlay.height,
            articleHeight: article.height,
            width: overlay.width,
            articleWidth: article.width,
            image: getComputedStyle(node).backgroundImage,
            pointerEvents: getComputedStyle(node).pointerEvents,
          };
        });
        expect(Math.abs(bounds.height - bounds.articleHeight)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.width - bounds.articleWidth)).toBeLessThanOrEqual(1);
        expect(bounds.image).toContain('data:image/svg+xml');
        expect(bounds.pointerEvents).toBe('none');
        await settled(page);
        await page.screenshot({
          path: resolve(output, `${info.project.name}-demo-watermark-${width}.png`),
        });
      } else {
        await expect(frame.locator('.watermark, .demo-watermark')).toHaveCount(0);
      }
    }
  }
});

test('appearance labels and branding stay inside their controls with doubled workspace text', async ({
  page,
}, info) => {
  await mkdir(output, { recursive: true });
  const records = [];
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    for (const width of [320, 768, 1434, 2560]) {
      await page.setViewportSize({ width, height: 988 });
      await page.goto('/workspace/');
      await ready(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '32px';
      });
      const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
      if (await opener.isVisible()) await opener.click();
      await page.locator('.theme-options').scrollIntoViewIfNeeded();
      const result = await page.locator('.theme-options').evaluate((element) => ({
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        buttons: [...element.querySelectorAll('button')].map((button) => ({
          label: button.textContent?.trim(),
          width: button.clientWidth,
          scroll: button.scrollWidth,
        })),
        brandOverflow:
          document.querySelector('.sidebar .brand')!.scrollWidth >
          document.querySelector('.sidebar .brand')!.clientWidth,
      }));
      expect(result.pageOverflow).toBe(false);
      expect(result.brandOverflow).toBe(false);
      const stepLabels = await page
        .locator('.project-sequence .sequence-label')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            label: node.textContent,
            width: node.clientWidth,
            scroll: node.scrollWidth,
          })),
        );
      expect(stepLabels).toHaveLength(7);
      for (const step of stepLabels)
        expect(step.scroll, `${theme}/${width}/step ${step.label}`).toBeLessThanOrEqual(
          step.width + 1,
        );
      for (const button of result.buttons)
        expect(button.scroll, `${theme}/${width}/${button.label}`).toBeLessThanOrEqual(
          button.width + 1,
        );
      await page.screenshot({
        path: resolve(output, `${info.project.name}-enlarged-${theme}-${width}.png`),
      });
      records.push({ theme, width, ...result });
    }
  }
  await writeFile(
    resolve(output, `${info.project.name}-enlarged-text.json`),
    JSON.stringify(records, null, 2),
  );
});
