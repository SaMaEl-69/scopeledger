import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { documentHtml } from '../../shared/client-document.mjs';
import { fixture } from '../server/fixtures.mjs';

const encodeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

test('public brief invoice and credit previews preserve content without internal horizontal overflow', async ({
  page,
}, info) => {
  const samples = [
    fixture({
      kind: 'brief',
      status: 'Quoted',
      taxRate: '0',
      tax: '0',
      total: '800.00',
      approvalRecorded: '',
      approvalDate: '',
      demo: true,
    }),
    fixture({ changeReference: 'd1513e04-9cb2-455b-a080-2515a9d9852e', demo: true }),
    fixture({
      reference: 'LARGE-INVOICE',
      subtotal: '900000000000000000000000.00',
      tax: '45000000000000000000000.00',
      total: '945000000000000000000000.00',
      demo: true,
    }),
    fixture({ kind: 'credit', demo: true }),
  ];
  await mkdir(resolve('output/audit'), { recursive: true });
  for (const sample of samples) {
    for (const width of [280, 320, 600, 760, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(
        `<html lang="en"><head><style>html,body{margin:0}iframe{display:block;width:100%;height:1600px;border:0}</style></head><body><iframe title="Client document preview" sandbox="" srcdoc="${encodeAttribute(documentHtml(sample))}"></iframe></body></html>`,
      );
      const preview = page.frameLocator('iframe');
      await expect(
        preview.getByRole('heading', {
          name:
            sample.kind === 'brief'
              ? 'Change brief'
              : sample.kind === 'credit'
                ? 'Credit note'
                : 'Invoice',
          exact: true,
        }),
      ).toBeVisible();
      await expect(preview.locator('body')).toContainText(sample.reference);
      const brand = preview.getByRole('img', { name: 'ScopeLedger', exact: true });
      await expect(brand).toBeVisible();
      expect(
        await brand.evaluate((element: HTMLImageElement) => ({
          loaded: element.complete && element.naturalWidth > 0,
          withinPage:
            element.getBoundingClientRect().left >= 0 &&
            element.getBoundingClientRect().right <= innerWidth,
        })),
      ).toEqual({ loaded: true, withinPage: true });
      await expect(preview.locator('.document-brand')).toContainText('Prepared with');
      await expect(preview.locator('body')).not.toContainText('loaded cost');
      if (sample.changeReference === 'd1513e04-9cb2-455b-a080-2515a9d9852e')
        await expect(preview.locator('body')).not.toContainText(sample.changeReference);
      const bounds = await preview.locator('body').evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(bounds.scroll, `${sample.kind}/${sample.reference} at ${width}`).toBeLessThanOrEqual(
        bounds.width,
      );
      if (sample.reference === 'LARGE-INVOICE')
        await expect(preview.locator('.total strong')).toHaveText(
          'USD 945,000,000,000,000,000,000,000.00',
        );
      if (width === 320 || (sample.reference === 'LARGE-INVOICE' && width === 760)) {
        // Keep the full paper in a painted viewport rather than resizing it
        // during a full-page capture of a sandboxed iframe in Chromium.
        await page.setViewportSize({ width, height: 1600 });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await page.screenshot({
          path: resolve(
            'output/audit',
            `${info.project.name}-public-${sample.kind}-${sample.reference}-${width}.png`,
          ),
        });
      }
    }
  }
});
