import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit/site');
const demoStatus = {
  configured: false,
  mode: 'demo',
  active: false,
  checkout: { individual: null, agency: null },
};
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

async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
}
async function homeAppearance(page: Page, mode: 'light' | 'dark' | 'system') {
  await page.locator('#themeBtn').click();
  await page.locator(`#appearancePicker [data-set="${mode}"]`).click();
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await saved(page);
}
async function noOverflow(page: Page) {
  // WebKit can publish the new viewport before the media-query paint settles.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.clock.setFixedTime(new Date('2026-10-06T04:00:00Z'));
  await mkdir(output, { recursive: true });
});

test('canonical pages, legacy links and public samples resolve on one origin', async ({
  page,
  request,
}, info) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/home\/$/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://scopeledger.site/home/',
  );
  await expect(page.locator('body')).not.toContainText('$149');
  await expect(page.locator('#vRoi')).toHaveText('181×');
  for (const name of ['change-brief', 'invoice']) {
    const response = await request.get(`/samples/${name}.pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  await page.screenshot({ path: resolve(output, `${info.project.name}-home-hero-1440.png`) });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportBtn2').click(),
  ]);
  expect(download.suggestedFilename()).toBe('ScopeLedger-sample-brief.pdf');
  expect(await download.failure()).toBeNull();
  expect((await request.get('/samples/missing.pdf')).status()).toBe(404);
  expect((await request.post('/api/pdf', { data: {} })).status()).not.toBe(200);
  await page.goto('/app?ref=legacy');
  await expect(page).toHaveURL(
    (url) => url.pathname === '/workspace/' && url.searchParams.get('ref') === 'legacy',
  );
  await saved(page);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://scopeledger.site/workspace/',
  );
});

test('lifetime choices preserve focus and hand Agency intent to activation without activating', async ({
  page,
}) => {
  let activations = 0;
  await page.route('**/api/license/status', (route) =>
    route.fulfill({ json: { ...demoStatus, configured: true, mode: 'live' } }),
  );
  page.on('request', (request) => {
    if (request.url().endsWith('/api/license/activate')) activations++;
  });
  await page.goto('/home/');
  const trigger = page.locator('[data-lifetime]').first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Choose your license.' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.access-plan').first()).toContainText('$49.79');
  await expect(dialog.locator('.access-plan').last()).toContainText('$69.79');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cmdk')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('link', { name: 'Choose Agency' }).click();
  const activation = page.getByRole('dialog', { name: 'Activate ScopeLedger' });
  await expect(activation).toBeVisible();
  await expect(activation.getByLabel('Purchased plan', { exact: true })).toHaveValue('agency');
  await expect(page).toHaveURL(
    (url) => url.pathname === '/workspace/' && !url.searchParams.has('activate'),
  );
  expect(activations).toBe(0);
});

test('live checkout accepts configured secure Gumroad links and rejects malformed destinations', async ({
  page,
}) => {
  let status = {
    ...demoStatus,
    configured: true,
    mode: 'live',
    checkout: {
      individual: 'https://scopeledger.gumroad.com/l/individual',
      agency: 'https://scopeledger.gumroad.com/l/agency',
    },
  };
  await page.route('**/api/license/status', (route) => route.fulfill({ json: status }));
  await page.goto('/home/');
  await page.locator('#buyBtn').click();
  const dialog = page.getByRole('dialog', { name: 'Choose your license.' });
  const agency = dialog.locator('[data-plan=agency]');
  await expect(agency).toHaveAttribute('href', status.checkout.agency);
  await expect(agency).toHaveAttribute('target', '_blank');
  await expect(agency).toHaveAttribute('rel', 'noopener noreferrer');
  await page.keyboard.press('Escape');
  status = {
    ...status,
    checkout: {
      individual: 'javascript:alert(1)',
      agency: 'https://gumroad.com.attacker.test/l/agency',
    },
  };
  await page.locator('#buyBtn').click();
  await expect(dialog.locator('#purchaseStatus')).toContainText('setup is incomplete');
  await expect(agency).toHaveAttribute('href', /\/workspace\/\?activate=1&plan=agency$/);
  await expect(agency).not.toHaveAttribute('target', '_blank');
});

test('theme and durable document edits survive Home navigation', async ({ page }) => {
  await page.goto('/home/');
  await homeAppearance(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.signin').click();
  await saved(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await navigate(page, 'Documents');
  await page.getByLabel('Document reference', { exact: true }).fill('HOME-GUARDED-BRIEF');
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await expect(page).toHaveURL(/\/home\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.signin').click();
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'HOME-GUARDED-BRIEF',
  );
});

test('mobile navigation, lifetime dialogs and marketing sections reflow in both themes', async ({
  page,
}, info) => {
  await page.goto('/home/');
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await homeAppearance(page, theme as 'light' | 'dark');
    for (const width of [
      320, 360, 375, 390, 430, 600, 768, 820, 1024, 1280, 1440, 1536, 1920, 2560, 844, 1366, 469,
      471, 699, 701, 759, 761, 899, 901, 1199, 1201, 760,
    ]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
      await noOverflow(page);
      await page.screenshot({
        path: resolve(output, `${info.project.name}-home-${theme}-${width}.png`),
      });
      await page.locator('#buyBtn').click();
      const dialog = page.getByRole('dialog', { name: 'Choose your license.' });
      await expect(dialog).toBeVisible();
      const bounds = await dialog.evaluate((element) => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
      await page.screenshot({
        path: resolve(output, `${info.project.name}-plans-${theme}-${width}.png`),
      });
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 950, height: 900 });
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  await menu.click();
  await page.setViewportSize({ width: 960, height: 900 });
  await expect(page.locator('#menuBtn')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cmdk')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menuBtn')).toBeFocused();
  await page.locator('#menuBtn').click();
  await page.locator('#mnav [data-lifetime]').click();
  await expect(page.getByRole('dialog', { name: 'Choose your license.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menuBtn')).toBeFocused();
  await expect(page.locator('#mnav')).toHaveAttribute('inert', '');
  await expect(page.locator('main')).not.toHaveAttribute('inert');
});

test('mobile access action stays centered and reachable on short screens and with larger text', async ({
  page,
}) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const [width, height] of [
      [320, 740],
      [393, 852],
      [768, 1024],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto('/home/');
      await page.locator('#menuBtn').click();
      await expect(page.locator('#menuBtn')).toHaveAttribute('aria-expanded', 'true');
      const action = page.locator('#mnav a.btn');
      for (const large of [false, true]) {
        if (large) await page.addStyleTag({ content: '#mnav a{font-size:31px !important}' });
        await action.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            action.evaluate((button) => {
              const box = button.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(button);
              const text = range.getBoundingClientRect();
              return Math.abs((text.left + text.right) / 2 - (box.left + box.right) / 2);
            }),
          )
          .toBeLessThanOrEqual(1);
        const bounds = await action.boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(64);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
        await noOverflow(page);
      }
      await page.keyboard.press('Escape');
      await expect(page.locator('#menuBtn')).toBeFocused();
    }
  }
});

test('failed Home modules preserve readable copy, correct ROI and both direct license options', async ({
  page,
}) => {
  await page.route('**/assets/home-*.js', (route) => route.abort());
  await page.goto('/home/');
  await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
  await expect(page.locator('.hero h1')).toBeVisible();
  await expect(page.locator('#vRoi')).toHaveText('181×');
  const fallback = page.locator('.access-fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole('link', { name: 'Agency · $69.79' })).toHaveAttribute(
    'href',
    '/workspace/?activate=1&plan=agency',
  );
});

test('Home and all workspace views retain accessible theme contrast and connected controls', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const records: { theme: string; view: string; violations: unknown[] }[] = [];
  const summarize = (violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) =>
    violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    }));
  for (const theme of ['dark', 'light']) {
    await page.goto('/home/');
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await homeAppearance(page, theme as 'light' | 'dark');
    const home = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    records.push({ theme, view: 'Home', violations: summarize(home.violations) });
    await page.goto('/workspace/');
    await saved(page);
    for (const view of views) {
      await navigate(page, view);
      await noOverflow(page);
      const accessibility = await new AxeBuilder({ page })
        .setLegacyMode()
        .options({ iframes: false })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      records.push({ theme, view, violations: summarize(accessibility.violations) });
      await page.screenshot({
        path: resolve(
          output,
          `${info.project.name}-workspace-${theme}-${view.replace(/[^a-z0-9]/gi, '-')}.png`,
        ),
      });
      if (theme === 'light') {
        for (const width of [320, 760, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await noOverflow(page);
          if (width === 320) {
            const unreadable = await page
              .locator(
                'input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea',
              )
              .evaluateAll((fields) =>
                fields
                  .filter(
                    (field) =>
                      field.getClientRects().length &&
                      getComputedStyle(field).visibility !== 'hidden' &&
                      parseFloat(getComputedStyle(field).fontSize) < 16,
                  )
                  .map((field) => field.getAttribute('aria-label') || field.tagName),
              );
            expect(unreadable).toEqual([]);
            if (info.project.name === 'chromium')
              await page.screenshot({
                path: resolve(
                  output,
                  `chromium-workspace-light-${view.replace(/[^a-z0-9]/gi, '-')}-320.png`,
                ),
              });
          }
        }
      }
    }
  }
  await writeFile(
    resolve(output, `${info.project.name}-theme-accessibility.json`),
    JSON.stringify(records, null, 2),
  );
  expect(
    records.flatMap((record) => record.violations),
    JSON.stringify(records.filter((record) => record.violations.length)),
  ).toEqual([]);
});

test('public product description matches manual workflows and both device licenses', async ({
  page,
}) => {
  await page.goto('/home/');
  await expect(page.locator('.license-summary')).toContainText('Individual');
  await expect(page.locator('.license-summary')).toContainText('49.79');
  await expect(page.locator('.license-summary')).toContainText('Agency');
  await expect(page.locator('.license-summary')).toContainText('69.79');
  await expect(page.locator('.license-summary')).toContainText('1 activated browser/device');
  await expect(page.locator('.license-summary')).toContainText('5 activated browsers/devices');
  const faq = page.locator('#faqList');
  await expect(faq).toContainText('There are no live capture integrations');
  await expect(faq).toContainText('independent local workspace');
  await expect(faq).toContainText('Backups are unencrypted');
  const body = await page.locator('body').textContent();
  expect(body).not.toMatch(
    /87% are approved|24 proven|24 scripts|Everything is encrypted in transit and at rest|unlimited teammates|no tiers|30-day money-back guarantee|Secure checkout via Stripe/,
  );
  await expect(page.locator('.hv-demo-label')).toContainText('Illustrative scenario');
});
