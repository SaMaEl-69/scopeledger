import { type Page, type BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
async function activate(page: Page, key: string, plan = 'individual') {
  await page.goto('/app');
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'View activation options' }).click();
  const d = page.getByRole('dialog', { name: 'Activate ScopeLedger' });
  await expect(d).toContainText('LOCAL DEVELOPMENT TEST MODE');
  await d.getByLabel('Purchased plan').selectOption(plan);
  await d.getByLabel('License key', { exact: true }).fill(key);
  await d.getByLabel('Device label').fill('Browser integration test');
  await d.getByRole('button', { name: 'Activate this browser' }).click();
  await expect(d).toContainText('activated · Browser integration test');
  return d;
}
async function release(context: BrowserContext, origin: string) {
  await context.request
    .post(`${origin}/api/license/release`, { headers: { Origin: origin }, data: {} })
    .catch(() => {});
}
test('a generated Individual key authorizes extra projects and one genuine guarded PDF job', async ({
  page,
  context,
  localApp,
}, info) => {
  const { keys: k, origin } = localApp;
  try {
    const d = await activate(page, k.individual);
    await expect(d).toContainText('1 of 1 device slots');
    await d.getByRole('button', { name: 'Return to workspace' }).click();
    for (let step = 1; step < 5; step++)
      await page.locator('.flow-action-dock .button.primary').click();
    await page
      .getByLabel('I reviewed the agreement and confirmed this response is appropriate.')
      .check();
    await page.locator('.flow-action-dock .button.primary').click();
    await page.locator('.document-signature-editor summary').click();
    await page.getByLabel('Issuer signatory name').fill('Local PDF test signatory');
    await page
      .getByLabel('Import issuer signature')
      .setInputFiles(resolve('tests/server/qa-signature.png'));
    await expect(page.getByAltText('Imported issuer signature', { exact: true })).toBeVisible();
    await page.getByLabel('Client signatory name').fill('Local client contact');
    await page
      .getByLabel('Import client signature')
      .setInputFiles(resolve('tests/server/qa-signature.png'));
    await expect(page.getByAltText('Imported client signature', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to export', exact: true }).click();
    let requests = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/pdf')) requests++;
    });
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    const download = await downloading;
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const output = resolve(process.env.SCOPELEDGER_AUDIT_OUTPUT ?? 'output/audit/signatures');
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, `${info.project.name}-actual-signed-flow.pdf`), bytes);
    expect(requests).toBe(1);
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Projects/ })
      .click();
    for (const name of ['First activated build', 'Second activated build']) {
      await page.getByRole('button', { name: 'New project', exact: true }).click();
      const project = page.getByRole('dialog', { name: 'Create a project' });
      await project.getByLabel('Project name', { exact: true }).fill(name);
      await project.getByLabel('Client name', { exact: true }).fill('Test client');
      await project.getByRole('button', { name: 'Create project', exact: true }).click();
      await expect(project).not.toBeVisible();
      await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
      await page
        .locator('.sidebar')
        .getByRole('button', { name: /^Projects/ })
        .click();
    }
    await expect(page.locator('.project-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'View activation options' }).click();
    const activation = page.getByRole('dialog', { name: 'Activate ScopeLedger' });
    await activation.getByRole('checkbox', { name: /Release this browser/ }).check();
    await activation.getByRole('button', { name: 'Release current device' }).click();
    await expect(activation.getByRole('button', { name: 'Activate this browser' })).toBeVisible();
    await activation.getByRole('button', { name: 'Continue with demo' }).click();
    await expect(page.locator('.project-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Activate ScopeLedger' })).toBeVisible();
  } finally {
    await release(context, origin);
  }
});
test('Agency allocation permits five independent browsers, rejects the sixth, and frees only the releasing device', async ({
  browser,
  localApp,
}) => {
  const { keys: k, origin } = localApp;
  const contexts: BrowserContext[] = [];
  try {
    for (let i = 0; i < 6; i++) {
      const context = await browser.newContext({ baseURL: origin });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto('/app');
      await page.request.get('/api/license/status');
      const result = await context.request.post('/api/license/activate', {
        headers: { Origin: origin },
        data: { key: k.agency, plan: 'agency', deviceLabel: `Independent browser ${i + 1}` },
      });
      expect(result.status()).toBe(i < 5 ? 200 : 409);
      if (i === 5) {
        expect((await result.json()).error).toBe('capacity_full');
      }
    }
    await release(contexts[0], origin);
    const replacement = await contexts[5].request.post('/api/license/activate', {
      headers: { Origin: origin },
      data: { key: k.agency, plan: 'agency', deviceLabel: 'Replacement local test browser' },
    });
    expect(replacement.status()).toBe(200);
    expect((await replacement.json()).slotsUsed).toBe(5);
    const blocked = await contexts[5].request.post('/api/license/recover', {
      headers: { Origin: origin },
      data: { deviceId: 'someone-else' },
    });
    expect(blocked.status()).toBe(404);
  } finally {
    for (const context of contexts) {
      await release(context, origin);
      await context.close();
    }
  }
});
