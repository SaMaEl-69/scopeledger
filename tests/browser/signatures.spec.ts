import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit/signatures');
const image = resolve('tests/server/qa-signature.png');
async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
}
async function documents(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
}
async function editor(page: Page) {
  const panel = page.locator('.document-signature-editor');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  return panel;
}
async function stored(page: Page) {
  await saved(page);
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            request = db.transaction('workspace').objectStore('workspace').get('current');
          request.onsuccess = () => {
            db.close();
            resolve(JSON.parse(request.result.raw));
          };
          request.onerror = () => {
            db.close();
            reject(request.error);
          };
        };
      }),
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto('/workspace/');
  await saved(page);
  await documents(page);
});
test('image import, replace, removal and validation preserve approval and financial records', async ({
  page,
}) => {
  const before = await stored(page),
    panel = await editor(page);
  await panel.getByLabel('Issuer signatory name').fill('Studio director');
  await panel.getByLabel('Issuer signatory role').fill('Director');
  await panel.getByLabel('Issuer signature date').fill('2026-10-01');
  await panel.getByLabel('Import issuer signature').setInputFiles(image);
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  const preview = page.frameLocator('iframe');
  await expect(preview.getByAltText('Imported issuer signature for Studio director')).toBeVisible();
  await expect(preview.locator('.signer-name').first()).toContainText('Studio director');
  await panel.getByLabel('Import issuer signature').setInputFiles({
    name: 'disguised.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake image'),
  });
  await expect(panel.getByRole('alert')).toContainText('contents do not match');
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  await panel.getByRole('button', { name: 'Remove issuer signature' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(preview.getByAltText('Imported issuer signature for Studio director')).toHaveCount(
    0,
  );

  await panel
    .getByLabel('Import issuer signature')
    .setInputFiles(resolve('tests/server/qa-signature-photo.png'));
  await expect(panel.getByRole('status')).toContainText('Issuer signature imported');
  const fitted = await panel
    .getByAltText('Imported issuer signature')
    .evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth,
      bytes: image.src.length,
    }));
  expect(fitted.width).toBeGreaterThan(0);
  expect(fitted.width).toBeLessThan(512);
  expect(fitted.bytes).toBeLessThan(349500);
  await panel.getByLabel('Import issuer signature').setInputFiles(image);
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  await panel
    .getByLabel('Import issuer signature')
    .setInputFiles(resolve('tests/server/qa-signature.jpg'));
  await expect(panel.getByRole('status')).toContainText('Issuer signature imported');
  await expect(preview.getByAltText('Imported issuer signature for Studio director')).toBeVisible();
  await panel.getByLabel('Client signatory name').fill('Client contact');
  await panel.getByLabel('Import client signature').setInputFiles(image);
  await expect(preview.getByAltText('Imported client signature for Client contact')).toBeVisible();
  await panel.getByLabel('Include client signature', { exact: true }).uncheck();
  await expect(preview.getByAltText('Imported client signature for Client contact')).toHaveCount(0);
  await panel.getByLabel('Include signature area in PDF').uncheck();
  await expect(preview.locator('.signoff')).toHaveCount(0);
  await panel.getByLabel('Include signature area in PDF').check();
  await expect(preview.getByAltText('Imported issuer signature for Studio director')).toBeVisible();
  const after = await stored(page);
  for (const key of ['documents', 'approvals', 'reconciliations', 'payments', 'changes'])
    expect(after[key]).toEqual(before[key]);
});
test('independent drafts and frozen signature snapshots survive navigation, reload and later edits', async ({
  page,
}) => {
  let panel = await editor(page);
  await panel.getByLabel('Issuer signatory name').fill('PRESERVED STUDIO SIGNER');
  await panel.getByLabel('Import issuer signature').setInputFiles(image);
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  panel = await editor(page);
  await expect(panel.getByLabel('Issuer signatory name')).toHaveValue('');
  await panel.getByLabel('Issuer signatory name').fill('SEPARATE INVOICE SIGNER');
  await page.getByRole('button', { name: 'Prepare brief', exact: true }).click();
  panel = await editor(page);
  await expect(panel.getByLabel('Issuer signatory name')).toHaveValue('PRESERVED STUDIO SIGNER');
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  await page.getByRole('button', { name: 'Save brief snapshot', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Preserve this brief snapshot' })
    .getByRole('button', { name: 'Confirm brief snapshot' })
    .click();
  await saved(page);
  const record = (await stored(page)).documents.at(-1);
  expect(record.snapshot.signatures.issuer.name).toBe('PRESERVED STUDIO SIGNER');
  expect(record.snapshot.signatures.issuer.imageDataUrl.startsWith('data:image/png;base64,')).toBe(
    true,
  );
  await page.reload();
  await saved(page);
  await page
    .locator('.document-history-row')
    .filter({ hasText: record.snapshot.reference })
    .click();
  await expect(
    page
      .frameLocator('iframe')
      .getByAltText('Imported issuer signature for PRESERVED STUDIO SIGNER'),
  ).toBeVisible();
  await expect(page.locator('.document-signature-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare new document', exact: true }).click();
  panel = await editor(page);
  await panel.getByLabel('Issuer signatory name').fill('NEW DRAFT SIGNER');
  expect((await stored(page)).documents.at(-1).snapshot).toEqual(record.snapshot);
});
test('expanded signature controls reflow in both themes and retain keyboard access', async ({
  page,
}, info) => {
  await mkdir(output, { recursive: true });
  const panel = await editor(page);
  await panel
    .getByLabel('Issuer signatory name')
    .fill('International publishing studio — project director');
  await panel.getByLabel('Import issuer signature').setInputFiles(image);
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  const record = [];
  for (const theme of ['dark', 'light']) {
    const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await navigation.isVisible()) await navigation.click();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true })
      .click();
    if (await page.locator('.sidebar').evaluate((element) => element.classList.contains('open')))
      await page.keyboard.press('Escape');
    for (const [width, height] of [
      [320, 740],
      [360, 800],
      [390, 844],
      [430, 932],
      [600, 900],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1280, 900],
      [1440, 1000],
      [1920, 1080],
      [2560, 1440],
      [844, 390],
      [469, 800],
      [471, 800],
      [759, 900],
      [761, 900],
      [899, 900],
      [901, 900],
      [1199, 900],
      [1201, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await panel.getByLabel('Import issuer signature').focus();
      await expect(panel.getByLabel('Import issuer signature')).toBeFocused();
      if ([320, 768, 1440, 2560].includes(width)) {
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: resolve(output, info.project.name + '-signatures-' + theme + '-' + width + '.png'),
        });
      }
      record.push({
        theme,
        width,
        height,
        scroll: await page.evaluate(() => document.documentElement.scrollWidth),
      });
    }
    await page.setViewportSize({ width: 320, height: 900 });
    const axe = await new AxeBuilder({ page })
      .setLegacyMode()
      .options({ iframes: false })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
  }
  await writeFile(
    resolve(output, info.project.name + '-signatures-responsive.json'),
    JSON.stringify(record, null, 2),
  );
});

test('a delayed import preserves current edits and cannot leak into another document draft', async ({
  page,
}) => {
  let panel = await editor(page);
  await page.evaluate(() => {
    const original = window.createImageBitmap;
    (window as any).__restoreBitmap = () => {
      window.createImageBitmap = original;
    };
    const gate = new Promise<void>((resolve) => {
      (window as any).__finishImport = resolve;
    });
    window.createImageBitmap = (async (...args: any[]) => {
      const bitmap = await (original as any)(...args);
      await gate;
      return bitmap;
    }) as typeof createImageBitmap;
  });
  await panel.getByLabel('Import issuer signature').setInputFiles(image);
  await expect(panel.getByText('Importing…', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save brief snapshot', exact: true }),
  ).toBeDisabled();
  await panel.getByLabel('Issuer signatory name').fill('EDITS DURING IMPORT');
  await page.evaluate(() => (window as any).__finishImport());
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  await expect(panel.getByLabel('Issuer signatory name')).toHaveValue('EDITS DURING IMPORT');
  await page.evaluate(() => {
    (window as any).__restoreBitmap();
    const original = window.createImageBitmap;
    (window as any).__restoreBitmap = () => {
      window.createImageBitmap = original;
    };
    const gate = new Promise<void>((resolve) => {
      (window as any).__finishImport = resolve;
    });
    window.createImageBitmap = (async (...args: any[]) => {
      const bitmap = await (original as any)(...args);
      await gate;
      return bitmap;
    }) as typeof createImageBitmap;
  });
  await panel.getByLabel('Import client signature').setInputFiles(image);
  await expect(panel.getByText('Importing…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare invoice', exact: true }).click();
  panel = await editor(page);
  await panel.getByLabel('Issuer signatory name').fill('OTHER DOCUMENT');
  await page.evaluate(() => {
    (window as any).__finishImport();
    (window as any).__restoreBitmap();
  });
  await expect(panel.getByLabel('Issuer signatory name')).toHaveValue('OTHER DOCUMENT');
  await expect(panel.getByAltText('Imported issuer signature')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare brief', exact: true }).click();
  panel = await editor(page);
  await expect(panel.getByLabel('Issuer signatory name')).toHaveValue('EDITS DURING IMPORT');
  await expect(panel.getByAltText('Imported issuer signature')).toBeVisible();
  await expect(panel.getByAltText('Imported client signature')).toHaveCount(0);
});

test('guided signature fields stay above the action bar when focused or the viewport shrinks', async ({
  page,
}) => {
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Change requests', exact: true })
    .click();
  for (let step = 1; step < 5; step++)
    await page.locator('.flow-action-dock .button.primary').click();
  await page
    .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
    .check();
  await page.locator('.flow-action-dock .button.primary').click();
  const panel = await editor(page),
    control = panel.getByLabel('Client signature date');
  for (const width of [320, 1024]) {
    await page.setViewportSize({ width, height: 740 });
    await control.evaluate((element: HTMLInputElement) => element.blur());
    await control.evaluate((element) => {
      const dock = document.querySelector('.flow-action-dock')!.getBoundingClientRect();
      window.scrollTo(0, scrollY + element.getBoundingClientRect().top - dock.top - 8);
    });
    await control.focus();
    await expect(control).toBeFocused();
    await expect
      .poll(async () => {
        const field = await control.boundingBox(),
          dock = await page.locator('.flow-action-dock').boundingBox();
        return !!field && !!dock && field.y >= 0 && field.y + field.height <= dock.y - 10;
      })
      .toBe(true);
    await page.setViewportSize({ width, height: 380 });
    await expect(control).toBeFocused();
    await expect
      .poll(async () => {
        const field = await control.boundingBox(),
          dock = await page.locator('.flow-action-dock').boundingBox();
        return !!field && !!dock && field.y >= 0 && field.y + field.height <= dock.y - 10;
      })
      .toBe(true);
  }
});

test('a signature rejected at workspace capacity never claims success or replaces saved work', async ({
  page,
}) => {
  const fixture = await stored(page);
  fixture.context.view = 'documents';
  const { emptySignatures } = await import('../../src/documents/signatures');
  const { MAX_WORKSPACE_BYTES, serializeWorkspace } = await import('../../src/storage/repository');
  fixture.documentDrafts = [
    {
      projectId: fixture.projects[0].id,
      changeId: fixture.changes[0].id,
      revision: fixture.changes[0].revision,
      kind: 'brief',
      updatedAt: new Date().toISOString(),
      values: { reference: 'CAPACITY-BRIEF', signatures: emptySignatures('brief') },
    },
  ];
  for (let i = 0; i < 104; i++)
    fixture.clients.push({
      id: `capacity-${i}`,
      name: `Capacity client ${i}`,
      contact: '',
      email: '',
      notes: 'x'.repeat(100000),
    });
  fixture.clients.push({
    id: 'capacity-tail',
    name: 'Capacity tail',
    contact: '',
    email: '',
    notes: '',
  });
  fixture.clients.at(-1).notes = 'x'.repeat(
    MAX_WORKSPACE_BYTES - 128 - Buffer.byteLength(JSON.stringify(fixture)),
  );
  const raw = serializeWorkspace(fixture);
  await page.evaluate(
    (raw) =>
      new Promise<void>((resolve, reject) => {
        const q = indexedDB.open('scopeledger-core', 1);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({ raw, sequence: JSON.parse(raw).sequence }, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    raw,
  );
  await page.reload();
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  const panel = await editor(page);
  await panel.getByLabel('Import issuer signature').setInputFiles(image);
  await expect(panel.getByRole('alert')).toContainText('could not be saved');
  await expect(panel.getByAltText('Imported issuer signature', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('status')).toHaveCount(0);
  const after = await stored(page);
  expect(after.documentDrafts).toEqual(fixture.documentDrafts);
  expect(after.documents).toEqual(fixture.documents);
});
