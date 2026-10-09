import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
let html = await readFile(new URL('design/social-card.html', root), 'utf8');
for (const [token, path, mime] of [
  ['LOGO', 'public/brand/scopeledger-logo-light.svg', 'image/svg+xml'],
  ['MARK', 'public/brand/scopeledger-mark.svg', 'image/svg+xml'],
  ...[400, 500, 700].map((weight) => [
    `FONT${weight}`,
    `node_modules/@fontsource/dm-sans/files/dm-sans-latin-${weight}-normal.woff2`,
    'font/woff2',
  ]),
]) {
  const bytes = await readFile(new URL(path, root));
  html = html.replaceAll(`{{${token}}}`, `data:${mime};base64,${bytes.toString('base64')}`);
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME_PATH });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const output = fileURLToPath(new URL('public/brand/scopeledger-social-v1.png', root));
  await page.screenshot({ path: output });
  console.log(`Sharing card saved: ${output}`);
} finally {
  await browser.close();
}
