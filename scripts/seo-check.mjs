import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { publicDocuments, publicAssetPath } from '../shared/public-assets.mjs';
import { siteDocumentPath, siteRedirect } from '../server/site-routes.mjs';

const origin = 'https://scopeledger.site';
const canonicalPaths = publicDocuments.map((name) => '/' + name.replace(/index\.html$/, ''));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${canonicalPaths.map((path) => `  <url><loc>${origin}${path}</loc><lastmod>2026-10-11</lastmod></url>`).join('\n')}\n</urlset>\n`;
// lastmod records this content revision, never the time of an unrelated build.
if (process.argv.includes('--write-sitemap')) await writeFile('public/sitemap.xml', sitemap);
else
  assert.equal(
    await readFile('public/sitemap.xml', 'utf8'),
    sitemap,
    'Sitemap does not match publication manifest',
  );

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
const metadata = (html, key) =>
  [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((tag) => attr(tag, 'name') === key || attr(tag, 'property') === key);
const extract = (html) => {
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => attr(tag, 'rel') === 'canonical');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  const description = attr(metadata(html, 'description') ?? '', 'content');
  const schema = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => JSON.parse(m[1]));
  return { canonical, title, description, schema };
};
const titles = new Set(),
  descriptions = new Set();
const pages = [];
for (const [index, file] of publicDocuments.entries()) {
  const path = canonicalPaths[index];
  const html = await readFile(file === 'home/index.html' ? file : 'public/' + file, 'utf8');
  const data = extract(html);
  assert.equal(data.canonical.length, 1, `${path}: canonical count`);
  assert.equal(attr(data.canonical[0], 'href'), origin + path, `${path}: canonical`);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, `${path}: H1 count`);
  assert(data.title && data.description && data.schema.length, `${path}: missing metadata`);
  assert(
    !titles.has(data.title) && !descriptions.has(data.description),
    `${path}: duplicate title/description`,
  );
  titles.add(data.title);
  descriptions.add(data.description);
  assert(
    !/noindex/i.test(attr(metadata(html, 'robots') ?? '', 'content') ?? ''),
    `${path}: noindex`,
  );
  assert.equal(attr(metadata(html, 'og:url') ?? '', 'content'), origin + path, `${path}: og:url`);
  assert.equal(
    attr(metadata(html, 'og:image') ?? '', 'content'),
    origin + '/brand/scopeledger-social-v1.png',
    `${path}: social image`,
  );
  assert(
    !/aggregateRating|"offers"\s*:|"review"\s*:|"@type"\s*:\s*"FAQPage"/.test(
      JSON.stringify(data.schema),
    ),
    `${path}: unsupported claims`,
  );
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `${path}: duplicate IDs`);
  for (const tag of html.matchAll(/<(?:a|img|link|script)\b[^>]*>/gi)) {
    const href = attr(tag[0], 'href') ?? attr(tag[0], 'src');
    if (!href || href.startsWith('mailto:') || href.startsWith('data:')) continue;
    const target = new URL(href, origin + path);
    if (target.origin !== origin) continue;
    if (target.pathname === path && target.hash && !tag[0].startsWith('<script'))
      assert(ids.includes(target.hash.slice(1)), `${path}: broken anchor ${href}`);
    let targetPath = target.pathname;
    if (siteRedirect(targetPath)) targetPath = siteRedirect(targetPath);
    const document = siteDocumentPath(targetPath);
    assert(
      document ||
        publicAssetPath(targetPath.slice(1)) ||
        targetPath.startsWith('/src/') ||
        targetPath.startsWith('/home/'),
      `${path}: nonpublic link ${href}`,
    );
  }
  pages.push({ path, title: data.title, description: data.description });
}

if (process.argv.includes('--live')) {
  const agents = {
    browser: 'Mozilla/5.0 (compatible; ScopeLedgerSEOCheck/1.0)',
    googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  };
  for (const page of pages) {
    page.live = [];
    for (const [agent, userAgent] of Object.entries(agents)) {
      const response = await fetch(origin + page.path, {
        headers: { 'User-Agent': userAgent },
        redirect: 'manual',
      });
      assert.equal(response.status, 200, `${page.path}: ${agent} status`);
      assert(
        !/noindex/i.test(response.headers.get('X-Robots-Tag') ?? ''),
        `${page.path}: ${agent} header`,
      );
      const html = await response.text();
      const data = extract(html);
      assert.equal(data.title, page.title, `${page.path}: stale title`);
      assert.equal(
        attr(data.canonical[0], 'href'),
        origin + page.path,
        `${page.path}: live canonical`,
      );
      page.live.push({ agent, status: response.status, bytes: Buffer.byteLength(html) });
    }
  }
  const remoteSitemap = await fetch(origin + '/sitemap.xml');
  assert.equal(remoteSitemap.status, 200);
  assert.equal(await remoteSitemap.text(), sitemap);
  for (const path of ['/', '/home', '/guides', '/about/index.html']) {
    const r = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(r.status, 308, `${path}: permanent redirect`);
  }
  for (const path of [
    '/workspace/',
    '/api/license/status',
    '/samples/change-brief.pdf',
    '/llms.txt',
    '/not-a-public-page',
  ]) {
    const r = await fetch(origin + path);
    assert.match(r.headers.get('X-Robots-Tag') ?? '', /noindex/, `${path}: noindex header`);
  }
}
await mkdir('output/seo', { recursive: true });
await writeFile(
  'output/seo/' + (process.argv.includes('--live') ? 'live-check' : 'source-check') + '.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), origin, pages }, null, 2),
);
console.log(
  `SEO checks passed for ${pages.length} canonical public pages${process.argv.includes('--live') ? ' under browser, Googlebot and Bingbot user agents' : ''}.`,
);
