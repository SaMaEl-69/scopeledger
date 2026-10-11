import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publicDocuments } from '../../shared/public-assets.mjs';

const routes = publicDocuments.map((file) => '/' + file.replace(/index\.html$/, ''));
const output = resolve('output/seo/mobile');

// playwright.site.config inherits npm start from the existing production-server
// configuration. No mocked requests, fixtures, retries or changed timeouts.
for (const script of ['seo-check.mjs', 'audit-links.mjs']) {
  test(`served public SEO: ${script}`, async ({ baseURL }, info) => {
    expect(baseURL).toBeTruthy();
    const command = script === 'seo-check.mjs' ? 'npm' : process.execPath;
    const args = script === 'seo-check.mjs' ? ['run', 'test:seo:live'] : ['scripts/' + script];
    const result = spawnSync(command, args, {
      env: { ...process.env, SCOPELEDGER_SEO_ORIGIN: baseURL! },
      encoding: 'utf8',
    });
    const raw = `${command} ${args.join(' ')}\nSCOPELEDGER_SEO_ORIGIN=${baseURL}\n${result.stdout ?? ''}${result.stderr ?? ''}\nexit=${result.status}\n${result.error?.message ?? ''}`;
    await info.attach(script + '-raw-output', { body: raw, contentType: 'text/plain' });
    console.log(raw);
    expect(result.error, raw).toBeUndefined();
    expect(result.status, raw).toBe(0);
  });
}

for (const path of routes) {
  for (const width of [360, 390]) {
    test(`${path} has a mobile viewport and no horizontal overflow at ${width}px`, async ({
      page,
    }, info) => {
      await mkdir(output, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
        'content',
        /^width=device-width,\s*initial-scale=1$/,
      );
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.evaluate(() => ({
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      console.log(JSON.stringify({ path, width, ...bounds }));
      await writeFile(
        resolve(output, `${path.replaceAll('/', '-')}-${width}-${info.project.name}.json`),
        JSON.stringify(bounds, null, 2),
      );
      if (width === 390) {
        const images = await page.evaluate(() =>
          [...document.querySelectorAll('img, svg')].map((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              name: element.tagName.toLowerCase(),
              attrs: Object.fromEntries([...element.attributes].map((a) => [a.name, a.value])),
              markup: element.outerHTML,
              visible:
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden',
            };
          }),
        );
        await writeFile(
          resolve(output, `${path.replaceAll('/', '-')}-images.json`),
          JSON.stringify({ path, width, images }, null, 2),
        );
      }
      await page.screenshot({
        path: resolve(output, `${path.replaceAll('/', '-')}-${width}-${info.project.name}.png`),
      });
      expect(bounds.innerWidth).toBe(width);
      expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
      expect(bounds.bodyWidth).toBeLessThanOrEqual(width);
    });
  }
}
