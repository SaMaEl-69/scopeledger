import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, firefox, webkit } from 'playwright';
import { createScopeLedgerServer } from './serve.mjs';

const publicOrigin = process.env.SCOPELEDGER_SHARING_QA_ORIGIN;
const server = publicOrigin ? null : createScopeLedgerServer();
if (server) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = publicOrigin ?? `http://127.0.0.1:${server.address().port}`;
const externalPage = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<img alt="ScopeLedger preview" src="${origin}/brand/scopeledger-social-v1.png">`);
});
await new Promise((resolve) => externalPage.listen(0, '127.0.0.1', resolve));
const bots = [
  'facebookexternalhit/1.1',
  'Twitterbot/1.0',
  'LinkedInBot/1.0',
  'Discordbot/2.0',
  'OAI-SearchBot/1.4',
  'GPTBot/1.4',
  'ChatGPT-User/1.0',
  'ClaudeBot/1.0',
  'PerplexityBot/1.0',
  'Googlebot/2.1',
];
let checks = 0;
try {
  for (const bot of bots) {
    const response = await fetch(`${origin}/`, { headers: { 'User-Agent': bot } });
    assert.equal(response.status, 200);
    assert.equal(new URL(response.url).pathname, '/home/');
    const html = await response.text();
    assert.match(html, /property="og:image"/);
    assert.match(html, /ScopeLedger/);
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    checks++;
  }
  const pngResponse = await fetch(`${origin}/brand/scopeledger-social-v1.png`);
  assert.equal(pngResponse.status, 200);
  assert.equal(pngResponse.headers.get('content-type'), 'image/png');
  assert.equal(pngResponse.headers.get('cross-origin-resource-policy'), 'cross-origin');
  const png = Buffer.from(await pngResponse.arrayBuffer());
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  checks++;
  for (const path of ['/llms.txt', '/product-guide.txt', '/robots.txt']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    checks++;
  }
  for (const path of ['/private-notes.txt', '/.env', '/server/backend.mjs']) {
    assert.equal((await fetch(origin + path)).status, 404);
    checks++;
  }
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch(
      name === 'chromium' ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {},
    );
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(origin + '/home/');
      await page.waitForFunction(() => document.documentElement.dataset.theme);
      assert.equal(
        await page.locator('meta[property="og:image"]').getAttribute('content'),
        'https://scopeledger.site/brand/scopeledger-social-v1.png',
      );
      assert.equal(
        await page.locator('meta[name="twitter:image"]').getAttribute('content'),
        'https://scopeledger.site/brand/scopeledger-social-v1.png',
      );
      const graph = JSON.parse(
        await page.locator('script[type="application/ld+json"]').textContent(),
      );
      assert.equal(graph['@graph'][2].name, 'ScopeLedger');
      await page.goto(origin + '/workspace/');
      await page.locator('.save-indicator').waitFor();
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'noindex, nofollow',
      );
      assert.deepEqual(errors, []);
      // A second HTTP origin behaves like an external social site embedding the card.
      await page.goto(`http://127.0.0.1:${externalPage.address().port}/`);
      await page.waitForFunction(() => document.querySelector('img').naturalWidth === 1200);
      checks++;
      console.log(
        `${name}: metadata, structured data, workspace privacy and external card rendering passed`,
      );
    } finally {
      await browser.close();
    }
  }
  console.log(`${checks} sharing/discovery checks passed against ${origin}`);
} finally {
  await new Promise((resolve) => externalPage.close(resolve));
  if (server) await new Promise((resolve) => server.close(resolve));
}
