import { test, expect } from './fixtures';
import { createWorkspace } from '../../src/domain/operations';
import { serializeWorkspace } from '../../src/storage/repository';

test('hostile owner text remains inert in workspace and document previews', async ({ page }) => {
  const requests: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('security-canary.invalid')) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/workspace/');
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  const payload =
    '<img src="https://security-canary.invalid/pixel" onerror="window.__executed=true">';
  const workspace = createWorkspace();
  workspace.agency.name = payload;
  workspace.clients[0].name = payload;
  workspace.projects[0].name = payload;
  workspace.changes[0].request = payload;
  workspace.context.view = 'documents';
  await page.evaluate(
    (raw) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('scopeledger-core', 1);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({ raw, sequence: JSON.parse(raw).sequence }, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    serializeWorkspace(workspace),
  );
  await page.goto('/workspace/?view=documents');
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  await expect(page.locator('.document-preview-panel iframe')).toBeVisible();
  const document = page.frameLocator('.document-preview-panel iframe');
  await expect(document.locator('body')).toContainText(payload);
  await expect(document.locator('img[src*="security-canary"]')).toHaveCount(0);
  await expect(document.locator('script')).toHaveCount(0);
  await expect(page.locator('img[src*="security-canary"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__executed)).toBeUndefined();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('a copied session cannot authorize another device or a modified device cookie', async ({
  context,
  browser,
  localApp,
}) => {
  const { origin, keys } = localApp;
  const activated = await context.request.post(`${origin}/api/license/activate`, {
    headers: { Origin: origin },
    data: { key: keys.individual, plan: 'individual', deviceLabel: 'Security test' },
  });
  expect(activated.status()).toBe(200);
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'scopeledger_session')!;
  const device = cookies.find((cookie) => cookie.name === 'scopeledger_device')!;
  const other = await browser.newContext({ baseURL: origin });
  try {
    await other.addCookies([session]);
    const copied = await other.request.post('/api/projects/authorize', {
      headers: { Origin: origin },
      data: {},
    });
    expect(copied.status()).toBe(401);
    await other.addCookies([session, { ...device, value: device.value + '.extra' }]);
    const modified = await other.request.post('/api/projects/authorize', {
      headers: { Origin: origin },
      data: {},
    });
    expect(modified.status()).toBe(401);
    const forged = await other.request.post('/api/pdf', {
      headers: { Origin: origin },
      data: { active: true, licensed: true, demo: false },
    });
    expect(forged.status()).toBe(401);
    expect((await context.request.get(`${origin}/api/license/status`)).status()).toBe(200);
    expect((await (await context.request.get(`${origin}/api/license/status`)).json()).active).toBe(
      true,
    );
  } finally {
    await context.request.post(`${origin}/api/license/release`, {
      headers: { Origin: origin },
      data: {},
    });
    await other.close();
  }
});
