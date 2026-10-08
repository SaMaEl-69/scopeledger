import { chromium, firefox, webkit, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.SCOPELEDGER_SEQUENCE_OUTPUT ?? 'output/audit/sequence');
const origin = 'http://127.0.0.1:4173';
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
const steps = [
  'Choose a project',
  'Complete its baseline',
  'Load or describe a change',
  'Review costs',
  'Choose a fee',
  'Review the brief',
  'Export',
];
const report = { origin, recordedAt: new Date().toISOString(), visits: [], errors: [] };
await mkdir(output, { recursive: true });

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch(
    name === 'chromium'
      ? {
          executablePath:
            process.env.PLAYWRIGHT_CHROME_PATH ??
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        }
      : {},
  );
  try {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        baseURL: origin,
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      });
      try {
        await context.addInitScript((value) => {
          if (window === window.top) localStorage.setItem('sl-theme', value);
        }, theme);
        const page = await context.newPage();
        let location = 'initial';
        page.on('pageerror', (error) =>
          report.errors.push({
            engine: name,
            theme,
            location,
            type: 'runtime',
            message: error.message,
          }),
        );
        page.on('console', (message) => {
          if (message.type() === 'error')
            report.errors.push({
              engine: name,
              theme,
              location,
              type: 'console',
              message: message.text(),
            });
        });
        await page.goto('/workspace/');
        await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
        for (const view of views) {
          location = view;
          await page
            .locator('.sidebar')
            .getByRole('button', { name: new RegExp('^' + view) })
            .click();
          await expect(page.getByRole('heading', { name: view, exact: true })).toBeVisible();
          await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
          report.visits.push({ engine: name, theme, location, width: 1440 });
        }
        await page
          .locator('.sidebar')
          .getByRole('button', { name: 'Change requests', exact: true })
          .click();
        await page.getByRole('button', { name: '5. Choose a fee', exact: true }).click();
        await page
          .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
          .check();
        const width = theme === 'dark' ? 320 : 1440;
        await page.setViewportSize({ width, height: 740 });
        for (let index = 0; index < steps.length; index++) {
          location = steps[index];
          const button = page
            .getByRole('navigation', { name: 'Project workflow' })
            .getByRole('button', { name: `${index + 1}. ${location}`, exact: true });
          await button.click();
          await expect(button).toHaveAttribute('aria-current', 'step');
          await expect(page.locator('.flow-action-dock .button.primary')).toBeInViewport();
          await page.evaluate(
            () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
          );
          report.visits.push({ engine: name, theme, location, width });
          if (index === 0 || index === 6) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({
              path: resolve(output, `final-${name}-${theme}-step-${index + 1}.png`),
            });
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
await writeFile(resolve(output, 'runtime-final.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.visits.length} visits; ${report.errors.length} console/runtime errors.`);
if (report.errors.length) process.exitCode = 1;
