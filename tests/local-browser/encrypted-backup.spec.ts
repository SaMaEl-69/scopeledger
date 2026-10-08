import { test, expect } from './fixtures';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decryptWorkspaceBackup } from '../../src/storage/encrypted-backup';
const phrase = 'A unique private recovery phrase for QA';
const saved = (page: any) =>
  expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
async function storedAgency(page: any) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onsuccess = () => {
          const db = opening.result,
            request = db.transaction('workspace').objectStore('workspace').get('current');
          request.onsuccess = () => {
            const name = JSON.parse(request.result.raw).agency.name;
            db.close();
            resolve(name);
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}
test('encrypted backup protects exported copy, rejects a wrong passphrase, and restores only after confirmation', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workspace/?view=settings');
  await saved(page);
  await page
    .getByRole('textbox', { name: 'Agency name', exact: true })
    .fill('Private encrypted recovery studio');
  await saved(page);
  await page
    .locator('.backup-card')
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Back up your workspace' });
  await dialog.getByLabel('Backup passphrase').fill(phrase);
  await dialog.getByLabel('Confirm passphrase').fill(phrase);
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download encrypted backup' }).click();
  const downloaded = await downloading,
    raw = await readFile((await downloaded.path())!, 'utf8');
  expect(downloaded.suggestedFilename()).toMatch(/\.slbackup$/);
  expect(raw).not.toContain('Private encrypted recovery studio');
  expect(raw).not.toContain(phrase);
  expect(JSON.parse(await decryptWorkspaceBackup(raw, phrase)).agency.name).toBe(
    'Private encrypted recovery studio',
  );
  const output = resolve('output/security/2026-10-09');
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, `${info.project.name}-encrypted-workspace.slbackup`), raw);
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await page
    .getByRole('textbox', { name: 'Agency name', exact: true })
    .fill('Changes after exporting');
  await saved(page);
  await page.getByTestId('backup-file').setInputFiles({
    name: 'recovery.slbackup',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  const unlock = page.getByRole('dialog', { name: 'Unlock your backup' });
  await unlock.getByLabel('Backup passphrase').fill('An incorrect recovery phrase');
  await unlock.getByRole('button', { name: 'Unlock backup' }).click();
  await expect(unlock.getByRole('alert')).toContainText('incorrect');
  expect(await storedAgency(page)).toBe('Changes after exporting');
  await unlock.getByLabel('Backup passphrase').fill(phrase);
  await unlock.getByRole('button', { name: 'Unlock backup' }).click();
  const review = page.getByRole('dialog', { name: 'Review workspace replacement' });
  await expect(review).toBeVisible();
  expect(await storedAgency(page)).toBe('Changes after exporting');
  await review.getByRole('checkbox', { name: /I understand this will replace/ }).check();
  await review.getByRole('button', { name: /Replace workspace|Restore workspace/ }).click();
  await saved(page);
  await expect(review).not.toBeVisible();
  expect(await storedAgency(page)).toBe('Private encrypted recovery studio');
  expect(errors).toEqual([]);
});
test('backup controls and explicit JSON choice stay usable at narrow widths in both themes', async ({
  page,
}) => {
  await page.goto('/workspace/?view=settings');
  await saved(page);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 740 });
      await page
        .locator('.backup-card')
        .getByRole('button', { name: 'Export backup', exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Back up your workspace' });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
      await dialog.getByRole('checkbox', { name: 'Use an unencrypted JSON file instead' }).check();
      await expect(dialog.getByRole('button', { name: 'Download JSON backup' })).toBeDisabled();
      await dialog.getByRole('checkbox', { name: /I understand anyone/ }).check();
      const downloading = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Download JSON backup' }).click();
      const downloaded = await downloading;
      expect(downloaded.suggestedFilename()).toMatch(/\.json$/);
      await expect(dialog).not.toBeVisible();
      await saved(page);
    }
  }
});
