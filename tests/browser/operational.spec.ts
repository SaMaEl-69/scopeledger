import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Workspace } from '../../src/domain/types';
async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await saved(page);
  if (await menu.isVisible())
    await expect
      .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
}
async function snapshot(page: Page): Promise<Workspace> {
  await saved(page);
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onsuccess = () => {
          const db = opening.result,
            r = db.transaction('workspace').objectStore('workspace').get('current');
          r.onsuccess = () => {
            db.close();
            resolve(JSON.parse(r.result.raw));
          };
          r.onerror = () => reject(r.error);
        };
        opening.onerror = () => reject(opening.error);
      }),
  );
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T04:00:00Z'));
  await page.goto('/app');
  await saved(page);
});
test('saved comparisons survive reload and client messages use actual terms without changing the draft', async ({
  page,
}) => {
  const original = await snapshot(page);
  await page.getByRole('button', { name: 'Compare responses', exact: true }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare responses', exact: true });
  await comparison.getByLabel('Comparison name').fill('Absorb 12 hours');
  await comparison.getByLabel('Alternative response').selectOption('Absorb');
  await comparison.getByLabel('Hours', { exact: true }).fill('12');
  await comparison.getByRole('button', { name: 'Save comparison', exact: true }).click();
  await expect(comparison).toContainText('Absorb 12 hours');
  await page.keyboard.press('Escape');
  const after = await snapshot(page);
  expect(after.changes).toEqual(original.changes);
  expect(after.comparisons).toHaveLength(1);
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: 'Compare responses', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Absorb 12 hours');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Compose client response', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'Compose a client response' });
  const text = await composer.getByLabel('Client response').inputValue();
  expect(text).toContain('Harbor');
  expect(text).toContain('$800.00');
  expect(text).not.toContain('{{');
  expect(text).not.toContain('$520');
  expect(text).not.toContain('35%');
  await composer.getByRole('button', { name: 'Copy client response' }).click();
  await expect(composer.getByRole('status')).toContainText('copied');
});
test('calendar reminders persist, export stable all-day dates, and completion leaves decisions intact', async ({
  page,
}) => {
  const initial = await snapshot(page);
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  const editor = page.getByRole('dialog', { name: 'New calendar reminder' });
  await editor.getByLabel('Reminder title').fill('Ask for approved content');
  await editor.getByLabel('Reminder type').selectOption('client-content');
  await editor.getByLabel('Reminder start').fill('2026-10-03');
  await editor.getByLabel('Reminder end').fill('2026-10-04');
  await editor.getByRole('button', { name: 'Save reminder', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page
    .getByRole('button', { name: /Ask for approved content/ })
    .first()
    .click();
  await page
    .getByRole('dialog', { name: 'Calendar event' })
    .getByRole('button', { name: 'Complete', exact: true })
    .click();
  const next = await snapshot(page);
  expect(next.calendarEvents[0].status).toBe('completed');
  expect(next.changes).toEqual(initial.changes);
  expect(next.approvals).toEqual(initial.approvals);
  await page.locator('.calendar-operational .operational-more-filters > summary').click();
  await page.getByLabel('Calendar status filter').selectOption('completed');
  await expect(page.getByRole('button', { name: /Ask for approved content/ })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .ics' }).click();
  const download = await downloading,
    path = await download.path();
  const ics = await readFile(path!, 'utf8');
  expect(ics).toContain('DTSTART;VALUE=DATE:20261003');
  expect(ics).toContain('DTEND;VALUE=DATE:20261005');
  expect(ics).toContain(next.calendarEvents[0].id);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  expect((await snapshot(page)).calendarEvents[0].status).toBe('completed');
});
test('invoice readiness links to real fields and preserved invoice payments agree after defaults change', async ({
  page,
}) => {
  await page
    .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
    .check();
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await page.getByRole('button', { name: 'Record approval', exact: true }).click();
  const approval = page.getByRole('dialog', { name: 'Record approval' });
  await approval
    .getByLabel('Approval evidence')
    .fill('Client approved this scope and USD 800 by email.');
  await approval.getByRole('button', { name: 'Record approval', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Preview client brief', exact: true }).click();
  await page.getByLabel('Document type', { exact: true }).selectOption('invoice');
  await expect(page.getByRole('button', { name: 'Review and issue invoice' })).toBeDisabled();
  await page.getByRole('button', { name: /Issuer legal details/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup', exact: true })).toBeVisible();
  await page.getByLabel('Legal issuer name').fill('Aster Studio Test Issuer');
  await page.getByLabel('Issuer address').fill('Owner test address, Dhaka');
  await page.getByLabel('Issuer email').fill('issuer@example.test');
  await page
    .getByLabel('Default payment instructions')
    .fill('Manual test fixture; no payment requested.');
  await navigate(page, 'Clients');
  await page.getByLabel('Billing address').fill('Harbor test billing address');
  await navigate(page, 'Documents');
  await page.getByLabel('Document type', { exact: true }).selectOption('invoice');
  await page.getByLabel('Document reference', { exact: true }).fill('TEST-INVOICE-001');
  await page.getByLabel('Issue date', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Due date', { exact: true }).fill('2020-01-15');
  await page.getByLabel('Manual tax percentage', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Review and issue invoice' }).click();
  await page
    .getByRole('dialog', { name: 'Confirm invoice issue' })
    .getByRole('button', { name: 'Issue invoice', exact: true })
    .click();
  await saved(page);
  await expect(page.locator('.document-balance')).toContainText('$840.00');
  await page.getByRole('button', { name: 'Record manual payment', exact: true }).click();
  const payment = page.getByRole('dialog', { name: 'Record a manual payment' });
  await payment.getByLabel('Recorded amount').fill('240');
  await payment.getByLabel('Payment date', { exact: true }).fill('2020-01-10');
  await payment.getByRole('button', { name: 'Save manual record' }).click();
  await saved(page);
  await expect(page.locator('.document-balance')).toContainText('$600.00');
  await expect(page.locator('.document-balance')).toContainText('Partially paid');
  const before = await snapshot(page);
  expect(before.documents).toHaveLength(1);
  await navigate(page, 'Settings & backup');
  await page.getByLabel('Agency name', { exact: true }).fill('Changed current name');
  await navigate(page, 'Documents');
  await expect(
    page
      .locator('.document-controls')
      .getByRole('heading', { name: 'TEST-INVOICE-001', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.document-history-row.selected')).toContainText('TEST-INVOICE-001');
  await expect(page.locator('.document-balance')).toContainText('$600.00');
  const frame = page.frameLocator('iframe[title="Client document preview"]');
  await expect(frame.locator('body')).toContainText('Aster Studio');
  await expect(frame.locator('body')).not.toContainText('Changed current name');
  expect((await snapshot(page)).documents).toEqual(before.documents);
});
test('operational views fit desktop tablet and phone with reachable actions', async ({ page }) => {
  await mkdir(resolve('docs/screenshots'), { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['Overview', 'Calendar', 'Documents', 'Templates', 'Settings & backup']) {
      await navigate(page, view);
      if (view === 'Overview') {
        await page.locator('.dashboard-operational .operational-more-filters > summary').click();
        await page.getByRole('checkbox', { name: 'Include sample data' }).check();
      }
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
        overflowingElements: [...document.querySelectorAll('body *')]
          .filter(
            (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2,
          )
          .slice(0, 24)
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            type: element.getAttribute('type'),
            client: element.clientWidth,
            scroll: element.scrollWidth,
            overflow: getComputedStyle(element).overflowX,
            caption: element.tagName === 'LABEL' ? element.textContent?.slice(0, 80) : undefined,
          })),
        offenders: [...document.querySelectorAll('body *')]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.right > innerWidth + 1;
          })
          .slice(0, 10)
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            text: element.textContent?.slice(0, 80),
          })),
      }));
      expect(layout.scroll, JSON.stringify({ view, width, ...layout })).toBeLessThanOrEqual(
        layout.viewport,
      );
      if (['Overview', 'Calendar', 'Documents'].includes(view))
        await page.screenshot({
          path: resolve('docs/screenshots', `part2-${view.toLowerCase()}-${width}.png`),
        });
    }
  }
});
