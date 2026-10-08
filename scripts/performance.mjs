import { chromium } from '@playwright/test';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('output/audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROME_PATH ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const report = {
  date: new Date().toISOString(),
  browser: browser.version(),
  origin: 'http://127.0.0.1:4173',
  machine: 'local macOS; no network/CPU throttling',
  method:
    'Fresh isolated contexts for five loads; interaction values are browser-automation wall times, including waits, rather than per-keystroke latency or production capacity.',
  navigation: [],
  interaction: {},
  largeWorkspace: {},
};
try {
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      page = await context.newPage();
    await page.goto(report.origin + '/app');
    await page.getByRole('heading', { name: 'Change requests', exact: true }).waitFor();
    const fullEditor = page.getByRole('button', { name: 'Show all steps', exact: true });
    if (await fullEditor.isVisible()) await fullEditor.click();
    await page
      .locator('.topbar .save-indicator')
      .filter({ hasText: 'Saved on this device' })
      .waitFor();
    report.navigation.push(
      await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return {
          domContentLoaded: n.domContentLoadedEventEnd,
          load: n.loadEventEnd,
          firstContentfulPaint:
            performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
          transferBytes: performance
            .getEntriesByType('resource')
            .reduce((x, r) => x + r.transferSize, 0),
        };
      }),
    );
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  await page.goto(report.origin + '/app');
  await page.getByLabel('Request title', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) =>
      window.__longTasks.push(...list.getEntries().map((x) => x.duration)),
    ).observe({ type: 'longtask', buffered: true });
  });
  const typed = ' measured typing responsiveness';
  let start = performance.now();
  await page.getByLabel('Request title', { exact: true }).pressSequentially(typed);
  report.interaction.typingCharacters = typed.length;
  report.interaction.typingWallMs = performance.now() - start;
  start = performance.now();
  const slider = page.getByRole('slider', { name: 'Adjust additional hours' });
  await slider.focus();
  for (let i = 0; i < 20; i++) await slider.press('ArrowRight');
  report.interaction.slider20KeyboardStepsWallMs = performance.now() - start;
  await page
    .locator('.topbar .save-indicator')
    .filter({ hasText: 'Saved on this device' })
    .waitFor();
  start = performance.now();
  await page
    .getByLabel('Request title', { exact: true })
    .fill('Measured autosave including debounce');
  await page
    .locator('.topbar .save-indicator')
    .filter({ hasText: 'Saved on this device' })
    .waitFor();
  report.interaction.autosaveIncludingDebounceWallMs = performance.now() - start;
  report.interaction.longTasks = await page.evaluate(() => window.__longTasks);
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('scopeledger-core', 1);
        r.onsuccess = () => {
          const db = r.result,
            read = db.transaction('workspace').objectStore('workspace').get('current');
          read.onsuccess = () => {
            const w = JSON.parse(read.result.raw),
              p = w.projects[0],
              c = w.changes[0];
            if (c.title !== 'Measured autosave including debounce') {
              db.close();
              reject(new Error('The measured autosave was not present in IndexedDB.'));
              return;
            }
            for (let i = 1; i < 500; i++) {
              const pid = `perf-project-${i}`,
                cid = `perf-change-${i}`;
              w.projects.push({
                ...p,
                id: pid,
                sample: false,
                name: `Synthetic agency project ${i}`,
              });
              w.changes.push({
                ...c,
                id: cid,
                projectId: pid,
                title: `Synthetic request ${i}`,
                status: 'Draft',
              });
            }
            const tx = db.transaction('workspace', 'readwrite');
            tx.objectStore('workspace').put(
              { raw: JSON.stringify(w), sequence: w.sequence },
              'current',
            );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        };
        r.onerror = () => reject(r.error);
      }),
  );
  start = performance.now();
  await page.reload();
  await page.getByRole('heading', { name: 'Change requests', exact: true }).waitFor();
  const fullEditor = page.getByRole('button', { name: 'Show all steps', exact: true });
  if (await fullEditor.isVisible()) await fullEditor.click();
  report.largeWorkspace.reload500ProjectsWallMs = performance.now() - start;
  start = performance.now();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Projects/ })
    .click();
  await page.locator('.project-card').last().waitFor();
  report.largeWorkspace.openProjectList500WallMs = performance.now() - start;
  start = performance.now();
  await page.getByLabel('Search projects', { exact: true }).fill('project 499');
  await page.locator('.project-card').filter({ hasText: 'Synthetic agency project 499' }).waitFor();
  report.largeWorkspace.filter500ProjectsWallMs = performance.now() - start;
  start = performance.now();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Overview/ })
    .click();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  report.largeWorkspace.openDashboard500WallMs = performance.now() - start;
  start = performance.now();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Calendar/ })
    .click();
  await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next calendar period', exact: true }).click();
  report.largeWorkspace.calendarNavigateWallMs = performance.now() - start;
  report.largeWorkspace.serializedBytes = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open('scopeledger-core', 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction('workspace').objectStore('workspace').get('current');
          q.onsuccess = () => {
            db.close();
            resolve(new Blob([q.result.raw]).size);
          };
        };
      }),
  );
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Settings & backup/ })
    .click();
  await page.getByRole('heading', { name: 'Settings & backup', exact: true }).waitFor();
  start = performance.now();
  await page
    .locator('input[type=file][accept="image/png,image/jpeg"]')
    .setInputFiles(resolve('tests/server/qa-logo.png'));
  await page.locator('.agency-logo-preview').waitFor();
  await page
    .locator('.topbar .save-indicator')
    .filter({ hasText: 'Saved on this device' })
    .waitFor();
  report.interaction.logoDecodeSaveWallMs = performance.now() - start;
  report.interaction.logoInputBytes = (await stat('tests/server/qa-logo.png')).size;
  await context.close();
} finally {
  await browser.close();
  await writeFile(resolve(output, 'performance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
