import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { showAllSteps } from '../browser/project-view';

const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit/component-alignment');
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
const widths = [
  320, 360, 387, 430, 469, 471, 519, 521, 600, 699, 701, 759, 761, 768, 820, 899, 901, 1024, 1099,
  1101, 1280, 1440, 1920, 2560,
];

test('components share aligned edges, square icons and consistent form rows in every view', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await mkdir(output, { recursive: true });
  const records: unknown[] = [];
  const failures: unknown[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/workspace/');
    await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
    await showAllSteps(page);
    for (const view of views) {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '16px';
      });
      await page.setViewportSize({ width: 1440, height: 988 });
      await page
        .locator('.sidebar')
        .getByRole('button', {
          name: new RegExp('^' + view.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        })
        .click();
      await expect(page.getByRole('heading', { name: view, exact: true })).toBeVisible();
      await expect(page.locator('.view-loading')).toHaveCount(0);
      await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
      await showAllSteps(page);
      if (view === 'Change requests')
        await page.locator('.project-planning-disclosure > summary').click();
      if (view === 'Overview') await page.locator('.operational-more-filters > summary').click();
      for (const scale of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = `${16 * value}px`;
        }, scale);
        for (const width of scale === 1 ? widths : [320, 387, 768, 1440]) {
          await page.setViewportSize({ width, height: 988 });
          await page.evaluate(
            () =>
              new Promise<void>((done) =>
                requestAnimationFrame(() => requestAnimationFrame(() => done())),
              ),
          );
          const geometry = await page.evaluate(() => {
            const visible = (element: Element) => {
              const box = element.getBoundingClientRect();
              return (
                box.width > 0 &&
                box.height > 0 &&
                getComputedStyle(element).visibility !== 'hidden' &&
                !element.closest('[hidden],[inert]')
              );
            };
            const distortedIcons = [...document.querySelectorAll('svg.lucide')]
              .filter(visible)
              .flatMap((icon) => {
                const box = icon.getBoundingClientRect();
                return Math.abs(box.width - box.height) > 1
                  ? [{ icon: icon.getAttribute('class'), width: box.width, height: box.height }]
                  : [];
              });
            const offCenterIcons = [...document.querySelectorAll('.icon-button')]
              .filter(visible)
              .flatMap((control) =>
                [...control.querySelectorAll(':scope > svg')].flatMap((icon) => {
                  const box = control.getBoundingClientRect(),
                    image = icon.getBoundingClientRect();
                  const x = Math.abs((image.left + image.right - box.left - box.right) / 2),
                    y = Math.abs((image.top + image.bottom - box.top - box.bottom) / 2);
                  return y > 2 || (!control.textContent?.trim() && x > 2)
                    ? [{ label: control.getAttribute('aria-label'), x, y }]
                    : [];
                }),
              );
            const fieldRows: unknown[] = [];
            for (const group of document.querySelectorAll(
              '.two-fields,.cost-fields,.operational-filters,.document-history-filters,.document-toolbar',
            )) {
              const entries = [...group.children].flatMap((field) => {
                const input = field.querySelector(
                  'input:not([type="checkbox"]):not([type="range"]):not([type="color"]):not([type="hidden"]),select',
                );
                if (!input || !visible(input)) return [];
                const wrapper = field.getBoundingClientRect(),
                  control = (input.closest('.number-input') || input).getBoundingClientRect();
                return [
                  {
                    label: field.textContent?.trim().slice(0, 60),
                    row: wrapper.top,
                    inputTop: control.top,
                    height: control.height,
                  },
                ];
              });
              for (let a = 0; a < entries.length; a++)
                for (let b = a + 1; b < entries.length; b++) {
                  if (
                    Math.abs(entries[a].row - entries[b].row) < 2 &&
                    (Math.abs(entries[a].inputTop - entries[b].inputTop) > 1 ||
                      Math.abs(entries[a].height - entries[b].height) > 1)
                  )
                    fieldRows.push({ group: group.className, a: entries[a], b: entries[b] });
                }
            }
            const notices = [...document.querySelectorAll('.operational-banner')]
              .filter(visible)
              .flatMap((banner) => {
                const copy = banner.querySelector(':scope > div'),
                  action = banner.querySelector(':scope > button'),
                  icon = banner.querySelector(':scope > svg');
                if (!copy || !icon) return [];
                const text = copy.getBoundingClientRect(),
                  symbol = icon.getBoundingClientRect(),
                  button = action?.getBoundingClientRect();
                return Math.abs(text.top - symbol.top) > 2 ||
                  (innerWidth <= 1100 && button && Math.abs(button.left - text.left) > 1)
                  ? [
                      {
                        label: copy.textContent?.trim().slice(0, 60),
                        iconTopOffset: symbol.top - text.top,
                        actionLeftOffset: button ? button.left - text.left : 0,
                      },
                    ]
                  : [];
              });
            const crowdedSelects = [
              ...document.querySelectorAll('select:not([multiple]):not([size])'),
            ]
              .filter(visible)
              .flatMap((select) => {
                const css = getComputedStyle(select);
                return css.appearance !== 'none' ||
                  parseFloat(css.paddingRight) < 40 ||
                  css.backgroundImage === 'none'
                  ? [
                      {
                        label: select.getAttribute('aria-label'),
                        appearance: css.appearance,
                        padding: css.paddingRight,
                      },
                    ]
                  : [];
              });
            const launchButtons = [
              ...document.querySelectorAll('.workspace-launch-actions .button'),
            ]
              .filter(visible)
              .map((button) => {
                const box = button.getBoundingClientRect();
                const icon = button.querySelector('svg')!.getBoundingClientRect();
                const range = document.createRange();
                range.selectNode(
                  [...button.childNodes].find(
                    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
                  )!,
                );
                const text = range.getClientRects()[0];
                return { left: box.left, iconLeft: icon.left, textLeft: text.left };
              });
            const actionColumns =
              innerWidth <= 760
                ? launchButtons.flatMap((a, index) =>
                    launchButtons
                      .slice(index + 1)
                      .flatMap((b) =>
                        Math.abs(a.left - b.left) < 1 &&
                        (Math.abs(a.iconLeft - b.iconLeft) > 1 ||
                          Math.abs(a.textLeft - b.textLeft) > 1)
                          ? [{ a, b }]
                          : [],
                      ),
                  )
                : [];
            const checkboxes = [...document.querySelectorAll('.check-label:not(.compact)')]
              .filter(visible)
              .flatMap((label) => {
                const input = label.querySelector('input');
                if (!input || !visible(input)) return [];
                const box = label.getBoundingClientRect(),
                  check = input.getBoundingClientRect();
                const offset = Math.abs(
                  (check.top + check.bottom) / 2 -
                    box.top -
                    parseFloat(getComputedStyle(label).lineHeight) / 2,
                );
                return offset > 1
                  ? [{ label: label.textContent?.trim().slice(0, 60), offset }]
                  : [];
              });
            const fee = document.querySelector('.fee-row .floor-button'),
              amount = document.querySelector('.fee-row .number-input');
            let feeMisalignment = 0;
            if (fee && amount && visible(fee) && visible(amount)) {
              const a = amount.getBoundingClientRect(),
                b = fee.getBoundingClientRect();
              feeMisalignment =
                innerWidth <= 470
                  ? Math.abs(a.left - b.left)
                  : Math.abs((a.top + a.bottom - b.top - b.bottom) / 2);
            }
            const decisionBar = document.querySelector('.mobile-decision-action');
            let crowdedDecisionBar = false;
            if (decisionBar && visible(decisionBar)) {
              const number = decisionBar.querySelector('strong')!;
              const range = document.createRange();
              range.selectNodeContents(number);
              const box = decisionBar.getBoundingClientRect();
              const page = decisionBar.closest('.page-content')!;
              crowdedDecisionBar =
                range.getClientRects().length > 1 ||
                decisionBar.scrollWidth > decisionBar.clientWidth + 1 ||
                parseFloat(getComputedStyle(page).paddingBottom) < box.height;
            }
            return {
              distortedIcons,
              offCenterIcons,
              fieldRows,
              notices,
              crowdedSelects,
              actionColumns,
              checkboxes,
              feeMisalignment,
              crowdedDecisionBar,
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          const entry = { theme, view, width, scale, ...geometry };
          records.push(entry);
          if (
            geometry.distortedIcons.length ||
            geometry.offCenterIcons.length ||
            geometry.fieldRows.length ||
            geometry.notices.length ||
            geometry.crowdedSelects.length ||
            geometry.actionColumns.length ||
            geometry.checkboxes.length ||
            geometry.feeMisalignment > 1 ||
            geometry.crowdedDecisionBar ||
            geometry.overflow
          )
            failures.push(entry);
          if (scale === 1 && [387, 768, 1440].includes(width))
            await page.screenshot({
              path: resolve(
                output,
                `${info.project.name}-${theme}-${view.replace(/\W+/g, '-')}-${width}.png`,
              ),
            });
        }
      }
    }
  }
  await writeFile(
    resolve(output, `${info.project.name}-components.json`),
    JSON.stringify({ records, failures, errors }, null, 2) + '\n',
  );
  expect(errors).toEqual([]);
  expect(failures, JSON.stringify(failures.slice(0, 12))).toEqual([]);
});

test('dialog fields and wrapped checkbox labels stay aligned and native controls remain editable', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await mkdir(output, { recursive: true });
  const records: unknown[] = [];
  const failures: unknown[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/workspace/');
    await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
    await showAllSteps(page);
    for (const form of [
      {
        view: 'Change requests',
        opener: 'Review baseline',
        title: 'Approved project baseline',
        timed: false,
      },
      {
        view: 'Projects',
        opener: 'Duplicate Harbor / Website',
        title: 'Duplicate project',
        timed: false,
      },
      { view: 'Calendar', opener: 'New reminder', title: 'New calendar reminder', timed: false },
      { view: 'Calendar', opener: 'New reminder', title: 'New calendar reminder', timed: true },
    ]) {
      await page.evaluate(() => (document.documentElement.style.fontSize = '16px'));
      await page.setViewportSize({ width: 1440, height: 988 });
      await page
        .locator('.sidebar')
        .getByRole('button', { name: new RegExp('^' + form.view) })
        .click();
      await expect(page.getByRole('heading', { name: form.view, exact: true })).toBeVisible();
      await expect(page.locator('.view-loading')).toHaveCount(0);
      await showAllSteps(page);
      await page.getByRole('button', { name: form.opener, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: form.title, exact: true });
      await expect(dialog).toBeVisible();
      if (form.timed) await dialog.getByLabel('All-day calendar date').uncheck();
      for (const scale of [1, 2]) {
        await page.evaluate(
          (value) => (document.documentElement.style.fontSize = `${value * 16}px`),
          scale,
        );
        for (const [width, height] of [
          [320, 740],
          [387, 844],
          [768, 1024],
          [844, 390],
          [1440, 988],
        ]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(
            () =>
              new Promise<void>((done) =>
                requestAnimationFrame(() => requestAnimationFrame(() => done())),
              ),
          );
          const geometry = await dialog.evaluate((modal) => {
            const mismatchedFields: unknown[] = [];
            for (const group of modal.querySelectorAll(
              '.two-fields,.operational-form .operational-two-columns',
            )) {
              const fields = [...group.children].flatMap((field) => {
                const input = field.querySelector('input:not([type="checkbox"]),select');
                if (!input) return [];
                const box = field.getBoundingClientRect();
                const control = (input.closest('.number-input') || input).getBoundingClientRect();
                return [
                  {
                    label: field.textContent?.trim().slice(0, 60),
                    top: box.top,
                    inputTop: control.top,
                    height: control.height,
                  },
                ];
              });
              for (let a = 0; a < fields.length; a++)
                for (let b = a + 1; b < fields.length; b++) {
                  if (
                    Math.abs(fields[a].top - fields[b].top) < 1 &&
                    (Math.abs(fields[a].inputTop - fields[b].inputTop) > 1 ||
                      Math.abs(fields[a].height - fields[b].height) > 1)
                  )
                    mismatchedFields.push({ a: fields[a], b: fields[b] });
                }
            }
            const checkboxOffsets = [
              ...modal.querySelectorAll(
                '.check-label:not(.compact),.operational-form .operational-check',
              ),
            ].flatMap((label) => {
              const input = label.querySelector('input')!;
              const box = label.getBoundingClientRect(),
                check = input.getBoundingClientRect();
              const offset = Math.abs(
                (check.top + check.bottom) / 2 -
                  box.top -
                  parseFloat(getComputedStyle(label).lineHeight) / 2,
              );
              return offset > 1 ? [{ label: label.textContent?.trim(), offset }] : [];
            });
            const controlBounds = modal.getBoundingClientRect();
            const outsideControls = [
              ...modal.querySelectorAll(
                'input:not([type="checkbox"]),select,textarea,.modal-actions .button',
              ),
            ].flatMap((input) => {
              const box = (input.closest('.number-input') || input).getBoundingClientRect();
              return box.left < controlBounds.left ||
                box.right > controlBounds.right ||
                box.height < 44
                ? [
                    {
                      label: input.getAttribute('aria-label') || input.textContent?.trim(),
                      left: box.left,
                      right: box.right,
                      height: box.height,
                    },
                  ]
                : [];
            });
            return {
              mismatchedFields,
              checkboxOffsets,
              outsideControls,
              overflow: modal.scrollWidth > modal.clientWidth + 1,
            };
          });
          const record = {
            theme,
            form: form.title,
            timed: form.timed,
            scale,
            width,
            height,
            ...geometry,
          };
          records.push(record);
          if (
            geometry.mismatchedFields.length ||
            geometry.checkboxOffsets.length ||
            geometry.outsideControls.length ||
            geometry.overflow
          )
            failures.push(record);
          if (
            theme === 'light' &&
            ((width === 387 && scale === 1) || (width === 1440 && scale === 2))
          ) {
            await dialog.screenshot({
              path: resolve(
                output,
                `${info.project.name}-${form.title.replace(/\W+/g, '-')}${form.timed ? '-timed' : ''}-${width}-scale-${scale}.png`,
              ),
            });
          }
        }
      }
      if (form.view === 'Calendar') {
        const type = dialog.getByLabel('Reminder type', { exact: true });
        const originalType = await type.inputValue();
        await type.selectOption({ label: 'Client content / assets' });
        await expect(type).not.toHaveValue(originalType);
        await type.focus();
        await page.keyboard.press('Tab');
        await expect(dialog.getByLabel('Reminder change', { exact: true })).toBeFocused();
        await type.selectOption(originalType);
        const start = dialog.getByLabel('Reminder start', { exact: true });
        const originalStart = await start.inputValue();
        const editedStart = form.timed ? '2026-10-09T11:30' : '2026-10-09';
        await start.fill(editedStart);
        await expect(start).toHaveValue(editedStart);
        await start.fill(originalStart);
        if (form.timed) await dialog.getByLabel('All-day calendar date').check();
      } else if (form.view === 'Projects') {
        const check = dialog.getByLabel('Copy the current baseline and approved scope');
        await check.focus();
        await page.keyboard.press('Space');
        await expect(check).toBeChecked();
        await page.keyboard.press('Space');
        await expect(check).not.toBeChecked();
      } else {
        const input = dialog.getByLabel('Approved fee, excluding tax', { exact: true });
        const original = await input.inputValue();
        await input.fill('9500');
        await expect(input).toHaveValue('9500');
        await input.fill(original);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  }
  await writeFile(
    resolve(output, `${info.project.name}-modal-components.json`),
    JSON.stringify({ records, failures }, null, 2) + '\n',
  );
  expect(failures, JSON.stringify(failures.slice(0, 12))).toEqual([]);
});
