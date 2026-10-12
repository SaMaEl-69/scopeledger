import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { createScopeLedgerServer } from './serve.mjs';
import { publicSocialImages } from '../shared/public-assets.mjs';

const socialImage = 'https://scopeledger.site/brand/margvant-facebook-1200x630.png';
const twitterImage = 'https://scopeledger.site/brand/margvant-x-1200x600.png';
const cardPaths = ['brand/scopeledger-social-v1.png', ...publicSocialImages];
const metadata = (html, key) => {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].find(
    ([value]) => value.includes(`property="${key}"`) || value.includes(`name="${key}"`),
  )?.[0];
  return tag?.match(/\bcontent="([^"]*)"/)?.[1];
};
const imageDimensions = (bytes, path) => {
  if (path.endsWith('.png')) {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  for (let offset = 2; offset + 8 < bytes.length;) {
    assert.equal(bytes[offset], 0xff);
    const marker = bytes[offset + 1];
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    )
      return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
    const length = bytes.readUInt16BE(offset + 2);
    assert(length >= 2);
    offset += 2 + length;
  }
  throw new Error(`JPEG frame dimensions missing: ${path}`);
};

const publicOrigin = process.env.SCOPELEDGER_SHARING_QA_ORIGIN;
const server = publicOrigin ? null : createScopeLedgerServer();
if (server) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = publicOrigin ?? `http://127.0.0.1:${server.address().port}`;
const externalPage = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    cardPaths.map((path) => `<img alt="Margvant preview" src="${origin}/${path}">`).join(''),
  );
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
    assert.match(html, /Margvant/);
    assert.equal(metadata(html, 'og:image'), socialImage);
    assert.equal(metadata(html, 'twitter:image'), twitterImage);
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    checks++;
  }
  const pngResponse = await fetch(`${origin}/brand/scopeledger-social-v1.png?v=2`);
  assert.equal(pngResponse.status, 200);
  assert.equal(pngResponse.headers.get('content-type'), 'image/png');
  assert.equal(pngResponse.headers.get('cross-origin-resource-policy'), 'cross-origin');
  const png = Buffer.from(await pngResponse.arrayBuffer());
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  checks++;
  for (const path of publicSocialImages) {
    const response = await fetch(`${origin}/${path}`, { redirect: 'manual' });
    assert.equal(response.status, 200, path);
    assert.equal(
      response.headers.get('content-type'),
      path.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    );
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, await readFile('public/' + path), `${path}: original asset bytes`);
    const height = path.includes('-1200x600.') ? 600 : path.includes('-1200x627.') ? 627 : 630;
    assert.deepEqual(imageDimensions(bytes, path), [1200, height]);
    checks++;
  }
  for (const path of ['/llms.txt', '/product-guide.txt', '/robots.txt']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    checks++;
  }
  for (const path of [
    '/private-notes.txt',
    '/.env',
    '/server/backend.mjs',
    '/brand/private-photo.jpg',
  ]) {
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
        socialImage,
      );
      assert.equal(
        await page.locator('meta[name="twitter:image"]').getAttribute('content'),
        twitterImage,
      );
      const graph = JSON.parse(
        await page.locator('script[type="application/ld+json"]').textContent(),
      );
      assert.equal(graph['@graph'][2].name, 'Margvant');
      await page.goto(origin + '/workspace/');
      await page.locator('.save-indicator').waitFor();
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'noindex, nofollow',
      );
      assert.deepEqual(errors, []);
      // A second HTTP origin behaves like an external social site embedding the card.
      await page.goto(`http://127.0.0.1:${externalPage.address().port}/`);
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll('img')];
        return images.length === 6 && images.every((image) => image.naturalWidth === 1200);
      });
      assert.deepEqual(
        await page
          .locator('img')
          .evaluateAll((images) => images.map((image) => image.naturalHeight)),
        [630, 630, 600, 627, 630, 630],
      );
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
