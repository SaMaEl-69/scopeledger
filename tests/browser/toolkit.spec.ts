import { showAllSteps } from './project-view';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWorkspace, recordApproval } from '../../src/domain/operations';
import { issueDocument, recordPayment } from '../../src/domain/commercial';
import type { Workspace } from '../../src/domain/types';

async function saved(page: Page) {
  await expect(page.locator('.topbar .save-indicator')).toHaveText('Saved on this device');
  await showAllSteps(page);
}
async function open(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Change requests', exact: true })).toBeVisible();
  await showAllSteps(page);
  await saved(page);
}
async function navigate(page: Page, destination: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${destination}`) })
    .click();
  await expect(page.getByRole('heading', { name: destination, exact: true })).toBeVisible();
  await saved(page);
}
async function stored(page: Page): Promise<Workspace> {
  return page.evaluate(
    () =>
      new Promise<Workspace>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            read = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            const result = JSON.parse(read.result.raw) as Workspace;
            db.close();
            resolve(result);
          };
        };
      }),
  );
}
async function seed(page: Page, workspace: Workspace) {
  await page.evaluate(
    (input) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(
            { raw: JSON.stringify(input), sequence: input.sequence },
            'current',
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    workspace,
  );
  await page.reload();
  await saved(page);
}

test('custom scenarios and assumptions persist and apply to the actual selected change', async ({
  page,
}) => {
  await open(page);
  await navigate(page, 'Templates');
  await page.getByRole('button', { name: 'New scenario', exact: true }).click();
  const scenario = page.getByRole('dialog', { name: 'Create custom scenario', exact: true });
  const wording = {
    title: 'Agency content handoff request',
    description: 'Test fixture for editable agency wording.',
    request:
      'Review the supplied content against the agreed collection and record the additional approved population scope.',
    deliverables: 'Populate the specifically listed content records using the approved template.',
    exclusions: 'Copywriting and unlisted content records.',
    dependencies: 'Client supplies final reviewed copy and licensed media.',
    assumptions: 'Use the approved design system.',
    contractChecks: 'Confirm the original population allowance and approved additional records.',
    confirm: 'Confirm actual volume and source quality before estimating.',
  };
  for (const [key, value] of Object.entries(wording))
    await scenario.getByLabel(`Custom scenario ${key}`, { exact: true }).fill(value);
  await page.keyboard.press('Escape');
  await expect(scenario.getByRole('alert')).toContainText('Discard unfinished entries?');
  await scenario.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(scenario.getByLabel('Custom scenario request', { exact: true })).toHaveValue(
    wording.request,
  );
  await scenario.getByRole('button', { name: 'Save custom scenario', exact: true }).click();
  await expect(scenario).not.toBeVisible();
  await saved(page);
  await page.getByRole('button', { name: 'New assumption', exact: true }).click();
  const assumption = page.getByRole('dialog', { name: 'Create reusable assumption', exact: true });
  await assumption
    .getByLabel('Assumption title', { exact: true })
    .fill('One consolidated content approval');
  await assumption
    .getByLabel('Reusable assumption wording', { exact: true })
    .fill('One authorized client approver provides a consolidated review of the supplied content.');
  await assumption.getByRole('button', { name: 'Save reusable assumption', exact: true }).click();
  await expect(assumption).not.toBeVisible();
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('heading', { name: wording.title, exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'One consolidated content approval', exact: true }),
  ).toBeVisible();
  const before = await stored(page);
  await navigate(page, 'Change requests');
  await page.getByRole('button', { name: 'Use an example request', exact: true }).click();
  const loading = page.getByRole('dialog', { name: 'Common agency scenarios', exact: true });
  await loading.getByRole('button', { name: new RegExp(wording.title) }).click();
  await loading
    .getByRole('checkbox', { name: /Replace this change’s existing scope text/ })
    .check();
  await loading.getByRole('button', { name: 'Load scenario', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Append a reusable assumption' }).click();
  await page
    .getByRole('button', { name: 'One consolidated content approval', exact: true })
    .click();
  await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(wording.title);
  await expect(page.getByLabel('Delivery assumptions', { exact: true })).toHaveValue(
    `${wording.assumptions}\nOne authorized client approver provides a consolidated review of the supplied content.`,
  );
  await expect(page.getByLabel('Additional hours', { exact: true })).toHaveValue('8');
  await saved(page);
  const after = await stored(page);
  expect(after.projects[0].baseline).toEqual(before.projects[0].baseline);
  expect(after.changes[0].id).toBe(before.changes[0].id);
  expect(after.customScenarios).toHaveLength(1);
  expect(after.assumptionPresets).toHaveLength(1);
  expect(after.changes[0].contractConfirmed).toBe(false);
});

test('client composer keeps actual-response edits across purposes and confirms discard', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Compose client response', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'Compose a client response', exact: true });
  const purpose = composer.getByLabel('Message purpose', { exact: true }),
    response = composer.getByLabel('Client response', { exact: true });
  const template = await response.inputValue();
  await expect(purpose.locator('option')).toHaveCount(2);
  await expect(purpose.locator('option[value="absorb"]')).toHaveCount(0);
  await composer.getByRole('button', { name: 'Reset to current template', exact: true }).click();
  await expect(composer.getByText('Replace your edited response?', { exact: true })).toHaveCount(0);
  await expect(response).toHaveValue(template);
  const text =
    'Hello Harbor Studio, the proposed fee is USD 800, subject to written agreement. {{RATE}}';
  await response.fill(text);
  await expect(
    composer.getByRole('button', { name: 'Copy client response', exact: true }),
  ).toBeDisabled();
  await expect(composer).toContainText('Unresolved placeholders: {{RATE}}');
  await purpose.selectOption('followup');
  await purpose.selectOption('quote');
  await expect(response).toHaveValue(text);
  await composer.getByRole('button', { name: 'Reset to current template', exact: true }).click();
  await expect(composer.getByText('Replace your edited response?', { exact: true })).toBeVisible();
  await expect(response).toHaveValue(text);
  await composer.getByRole('button', { name: 'Keep response', exact: true }).click();
  await expect(response).toHaveValue(text);
  await expect(response).toBeFocused();
  await composer.getByRole('button', { name: 'Reset to current template', exact: true }).click();
  await composer
    .getByRole('button', { name: 'Replace with current template', exact: true })
    .click();
  await expect(response).toHaveValue(template);
  await expect(composer.getByText('Replace your edited response?', { exact: true })).toHaveCount(0);
  await response.fill(text.replace(' {{RATE}}', ''));
  await page.keyboard.press('Escape');
  await expect(composer.getByRole('alert')).toContainText('Discard unfinished entries?');
  await composer.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(response).toHaveValue(text.replace(' {{RATE}}', ''));
  await composer.getByRole('button', { name: 'Close', exact: true }).click();
  await composer.getByRole('button', { name: 'Discard entries', exact: true }).click();
  await expect(composer).not.toBeVisible();
  expect((await stored(page)).approvals).toHaveLength(0);
});

test('unissued document settings survive navigation and type switches with explicit replacement', async ({
  page,
}) => {
  await open(page);
  await navigate(page, 'Documents');
  await page.getByLabel('Document reference', { exact: true }).fill('WORKING-BRIEF-ONLY');
  await page.getByLabel('Document footer', { exact: true }).fill('Client-facing working footer');
  await navigate(page, 'Settings & backup');
  await navigate(page, 'Documents');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'WORKING-BRIEF-ONLY',
  );
  await page.getByLabel('Document type', { exact: true }).selectOption('invoice');
  await page.getByLabel('Manual tax percentage', { exact: true }).fill('.');
  await navigate(page, 'Settings & backup');
  await navigate(page, 'Documents');
  await expect(page.getByLabel('Document type', { exact: true })).toHaveValue('invoice');
  await expect(page.getByLabel('Manual tax percentage', { exact: true })).toHaveValue('.');
  await page.getByLabel('Document type', { exact: true }).selectOption('brief');
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'WORKING-BRIEF-ONLY',
  );
  await page.getByRole('button', { name: 'Prepare new document', exact: true }).click();
  const reset = page.getByRole('dialog', { name: 'Start a new document draft?', exact: true });
  await reset.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Document reference', { exact: true })).toHaveValue(
    'WORKING-BRIEF-ONLY',
  );
  await page.getByRole('button', { name: 'Prepare new document', exact: true }).click();
  await reset.getByRole('button', { name: 'Replace draft settings', exact: true }).click();
  await expect(page.getByLabel('Document reference', { exact: true })).not.toHaveValue(
    'WORKING-BRIEF-ONLY',
  );
  await saved(page);
  expect((await stored(page)).documents).toHaveLength(0);
  await page.reload();
  await saved(page);
  await expect(page.getByLabel('Document type', { exact: true })).toHaveValue('invoice');
  await expect(page.getByLabel('Manual tax percentage', { exact: true })).toHaveValue('.');
  await page.getByLabel('Document type', { exact: true }).selectOption('brief');
  await expect(page.getByLabel('Document footer', { exact: true })).toHaveValue('');
});

test('project duplication carries only explicit choices and keeps source approval, invoice and payment history', async ({
  page,
}) => {
  await open(page);
  let fixture = createWorkspace();
  fixture.agency = {
    ...fixture.agency,
    legalName: 'QA fixture issuer',
    address: 'QA fixture address',
    email: 'qa-issuer@example.test',
    timezone: 'Asia/Dhaka',
  };
  fixture.clients[0].address = 'QA fixture client billing address';
  fixture.changes[0].contractConfirmed = true;
  fixture = recordApproval(
    fixture,
    fixture.changes[0].id,
    'QA fixture: recorded client approval, retained only on the source.',
    '2020-01-02',
  );
  fixture = issueDocument(fixture, fixture.changes[0].id, 'invoice', {
    reference: 'QA-COPY-SOURCE-001',
    issueDate: '2026-10-01',
    dueDate: '2026-10-20',
    taxRate: '0',
    paymentInstructions: 'QA fixture payment instructions.',
    demo: true,
  });
  fixture = recordPayment(fixture, fixture.documents[0].id, {
    id: 'qa-source-payment',
    amount: '200',
    date: '2020-01-02',
    reference: 'QA manual receipt',
  });
  fixture.projects[0].deadline = '2026-10-20';
  fixture.context.view = 'projects';
  fixture.sequence = 1;
  await seed(page, fixture);
  await navigate(page, 'Documents');
  await page.getByRole('button', { name: /QA-COPY-SOURCE-001/ }).click();
  await expect(
    page
      .locator('.document-controls')
      .getByRole('heading', { name: 'QA-COPY-SOURCE-001', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Projects');
  await page.getByRole('button', { name: 'Duplicate Harbor / Website', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate project', exact: true });
  const baselineChoice = dialog.getByRole('checkbox', {
    name: 'Copy the current baseline and approved scope',
    exact: true,
  });
  const changesChoice = dialog.getByRole('checkbox', {
    name: 'Copy change wording and estimates as drafts',
    exact: true,
  });
  const historyChoice = dialog.getByRole('checkbox', {
    name: 'Copy historical revisions for reference',
    exact: true,
  });
  await expect(baselineChoice).not.toBeChecked();
  await expect(changesChoice).not.toBeChecked();
  await expect(historyChoice).toBeDisabled();
  await dialog.getByLabel('New project name', { exact: true }).fill('Harbor working copy');
  await baselineChoice.check();
  await changesChoice.check();
  await historyChoice.check();
  await dialog.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await expect(page.locator('.context-title')).toContainText('Harbor working copy');
  await expect(page.locator('.request-card .status-draft')).toHaveText('Draft');
  const result = await stored(page),
    copied = result.projects.find((project) => project.name === 'Harbor working copy')!;
  expect(copied.id).not.toBe(fixture.projects[0].id);
  expect(copied.clientId).toBe(fixture.projects[0].clientId);
  expect(copied.baseline).toEqual(fixture.projects[0].baseline);
  expect(copied.deadline).toBeNull();
  const copiedChange = result.changes.find((change) => change.projectId === copied.id)!;
  expect(copiedChange).toMatchObject({
    status: 'Draft',
    contractConfirmed: false,
    includedAt: null,
  });
  expect(copiedChange.id).not.toBe(fixture.changes[0].id);
  expect(result.projects.find((project) => project.id === fixture.projects[0].id)).toEqual(
    fixture.projects[0],
  );
  expect(result.approvals).toEqual(fixture.approvals);
  expect(result.documents).toEqual(fixture.documents);
  expect(result.payments).toEqual(fixture.payments);
  expect(result.approvals.some((approval) => approval.projectId === copied.id)).toBe(false);
  expect(result.documents.some((document) => document.projectId === copied.id)).toBe(false);
  const history = result.revisions.filter((revision) => revision.projectId === copied.id);
  expect(history.length).toBeGreaterThan(0);
  expect(
    history.every(
      (revision) =>
        revision.changeId === copiedChange.id &&
        revision.change.id === copiedChange.id &&
        revision.change.status === 'Draft',
    ),
  ).toBe(true);
  await navigate(page, 'Documents');
  await expect(page.getByLabel('Document project', { exact: true })).toHaveValue(copied.id);
  await expect(page.getByLabel('Document change', { exact: true })).toHaveValue(copiedChange.id);
  await expect(
    page
      .locator('.document-controls')
      .getByRole('heading', { name: 'Prepare a client document', exact: true }),
  ).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Client document preview"]').locator('body'),
  ).not.toContainText('QA-COPY-SOURCE-001');
  expect((await stored(page)).documents).toEqual(fixture.documents);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByLabel('Document project', { exact: true })).toHaveValue(copied.id);
  await expect(
    page.getByLabel('Document project', { exact: true }).locator('option:checked'),
  ).toHaveText('Harbor working copy');
  await expect(page.getByLabel('Document change', { exact: true })).toHaveValue(copiedChange.id);
  const reloaded = await stored(page);
  expect(reloaded.context).toMatchObject({
    view: 'documents',
    projectId: copied.id,
    changeId: copiedChange.id,
  });
  expect(reloaded.projects).toEqual(result.projects);
  expect(reloaded.changes).toEqual(result.changes);
  expect(reloaded.revisions).toEqual(result.revisions);
  expect(reloaded.approvals).toEqual(fixture.approvals);
  expect(reloaded.documents).toEqual(fixture.documents);
  expect(reloaded.payments).toEqual(fixture.payments);
});

test('logo upload, replacement, validation and backup recovery preserve concurrent agency edits', async ({
  page,
}) => {
  const logoPath = resolve('output/pdf/qa-logo.png'),
    originalFile = await readFile(logoPath);
  expect(originalFile.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(originalFile.readUInt32BE(16)).toBe(480);
  expect(originalFile.readUInt32BE(20)).toBe(140);
  await open(page);
  await navigate(page, 'Settings & backup');
  const upload = page.getByLabel('Upload agency logo image');
  await upload.setInputFiles({
    name: 'unsupported.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await expect(page.locator('.logo-editor [role=alert]')).toContainText('Choose PNG, JPEG');
  await upload.setInputFiles(logoPath);
  await expect(page.locator('.agency-logo-preview')).toBeVisible();
  await saved(page);
  const original = (await stored(page)).agency.logoDataUrl!;
  expect(original).toMatch(/^data:image\/png;base64,/);
  const generated = await page.evaluate(() => {
    const make = (width: number, height: number, color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return { tiny: make(2048, 64, '#172940'), replacement: make(256, 96, '#27695d') };
  });
  await upload.setInputFiles({
    name: 'too-wide.png',
    mimeType: 'image/png',
    buffer: Buffer.from(generated.tiny, 'base64'),
  });
  await expect(page.locator('.logo-editor [role=alert]')).toContainText('aspect ratio');
  expect((await stored(page)).agency.logoDataUrl).toBe(original);
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window);
    Object.assign(window, { __originalCreateImageBitmap: window.createImageBitmap });
    window.createImageBitmap = (async (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
      const bitmap = await original(source, options);
      await new Promise<void>((resolve) => Object.assign(window, { __releaseLogoDecode: resolve }));
      return bitmap;
    }) as typeof createImageBitmap;
  });
  await upload.setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: Buffer.from(generated.replacement, 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Preparing logo…', exact: true })).toBeVisible();
  await page
    .getByLabel('Legal issuer name', { exact: true })
    .fill('QA issuer edited during logo decoding');
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as unknown as { __releaseLogoDecode?: unknown }).__releaseLogoDecode,
      ),
    )
    .toBe('function');
  await page.evaluate(() => {
    (window as unknown as { __releaseLogoDecode: () => void }).__releaseLogoDecode();
    window.createImageBitmap = (
      window as unknown as { __originalCreateImageBitmap: typeof createImageBitmap }
    ).__originalCreateImageBitmap;
  });
  await expect(page.getByRole('button', { name: 'Replace logo', exact: true })).toBeEnabled();
  await saved(page);
  const replacement = (await stored(page)).agency.logoDataUrl!;
  expect(replacement).not.toBe(original);
  expect((await stored(page)).agency.legalName).toBe('QA issuer edited during logo decoding');
  const downloading = page.waitForEvent('download');
  await page
    .locator('.backup-card')
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  const privacy = page.getByRole('dialog', { name: 'Back up your workspace' });
  await privacy.getByRole('checkbox', { name: 'Use an unencrypted JSON file instead' }).check();
  await privacy.getByRole('checkbox', { name: /I understand anyone/ }).check();
  await privacy.getByRole('button', { name: 'Download JSON backup' }).click();
  const download = await downloading,
    file = await download.path();
  if (!file) throw new Error('Expected local workspace backup');
  const raw = await readFile(file, 'utf8');
  expect((JSON.parse(raw) as Workspace).agency.logoDataUrl).toBe(replacement);
  await saved(page);
  await page.getByRole('button', { name: 'Remove logo', exact: true }).click();
  await saved(page);
  await expect(page.locator('.agency-logo-preview')).toHaveCount(0);
  await page.getByTestId('backup-file').setInputFiles({
    name: 'logo-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  const restoring = page.getByRole('dialog', { name: 'Review workspace replacement', exact: true });
  await restoring
    .getByRole('checkbox', { name: /I understand this will replace my current workspace/ })
    .check();
  await restoring.getByRole('button', { name: 'Replace workspace', exact: true }).click();
  await expect(restoring).not.toBeVisible();
  await saved(page);
  await expect(page.locator('.agency-logo-preview')).toHaveAttribute('src', replacement);
  expect((await stored(page)).agency.legalName).toBe('QA issuer edited during logo decoding');
  await page.getByRole('button', { name: 'Remove logo', exact: true }).click();
  await saved(page);
  expect((await stored(page)).agency.logoDataUrl).toBe('');
});
