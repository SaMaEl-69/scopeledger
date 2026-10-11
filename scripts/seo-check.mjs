import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { publicDocuments, publicAssetPath } from '../shared/public-assets.mjs';
import { siteDocumentPath, siteRedirect } from '../server/site-routes.mjs';
import {
  publicOrigin,
  routes,
  sourceFile,
  parseHtml,
  links,
  imageHeader,
  sitemapData,
  directives,
  robotsRules,
  robotMatches,
} from './seo-audit-lib.mjs';

const args = process.argv.slice(2);
for (const arg of args)
  if (!['--live', '--built'].includes(arg))
    throw new Error(`Unsupported option ${arg}; this checker never writes sitemap.xml.`);
const servedOrigin =
  process.env.SCOPELEDGER_SEO_ORIGIN ?? (args.includes('--live') ? publicOrigin : null);
const built = args.includes('--built') || Boolean(servedOrigin && servedOrigin !== publicOrigin);
const directory = built ? 'dist' : 'public';
const errors = [],
  warnings = [],
  pages = [],
  publicAssets = new Set();
const check = (condition, path, message) => {
  if (!condition) errors.push({ path, message });
};
const absolute = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const meta = (tags, key) =>
  tags.filter(
    (t) =>
      t.name === 'meta' &&
      (t.attrs.name?.toLowerCase() === key || t.attrs.property?.toLowerCase() === key),
  );
const unique = (tags, key, path) => {
  const found = meta(tags, key);
  check(found.length === 1, path, `${key}: expected exactly one meta, found ${found.length}`);
  return found[0]?.attrs.content ?? '';
};
const titles = new Set(),
  descriptions = new Set(),
  fetchedImages = new Map();
const httpScriptReferences = (content) =>
  [...content.matchAll(/http:\/\/[^\s"'`<>\\)]+/g)]
    .map((m) => m[0])
    .filter((url) => !['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'].includes(url));
const sitemap = await sitemapData(directory);
check(
  sitemap.namespace === 'http://www.sitemaps.org/schemas/sitemap/0.9',
  '/sitemap.xml',
  `namespace: ${sitemap.namespace}`,
);
check(
  sitemap.entries.length === 9 && publicDocuments.length === 9,
  '/sitemap.xml',
  'expected nine sitemap and manifest entries',
);
check(
  JSON.stringify(sitemap.entries.map((e) => e.url).sort()) ===
    JSON.stringify(routes.map((p) => publicOrigin + p).sort()),
  '/sitemap.xml',
  'URLs must equal the publication manifest exactly',
);
for (const entry of sitemap.entries)
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod ?? '') && Number.isFinite(Date.parse(entry.lastmod)),
    entry.url,
    'lastmod must be an existing ISO date',
  );

const schemaSources = {
  software: 'https://developers.google.com/search/docs/appearance/structured-data/software-app',
  breadcrumb: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb',
  article: 'https://developers.google.com/search/docs/appearance/structured-data/article',
  organization: 'https://developers.google.com/search/docs/appearance/structured-data/organization',
  siteName: 'https://developers.google.com/search/docs/appearance/site-names',
};
function validateSchema(blocks, path) {
  const nodes = blocks.flatMap((b) => (Array.isArray(b) ? b : (b['@graph'] ?? [b])));
  const ids = new Map(nodes.filter((n) => n['@id']).map((n) => [n['@id'], n]));
  const deref = (n) => (n?.['@id'] && ids.has(n['@id']) ? ids.get(n['@id']) : n);
  const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
  const allowed = new Set([
    'Organization',
    'WebSite',
    'WebApplication',
    'CollectionPage',
    'ItemList',
    'ListItem',
    'Article',
    'WebPage',
    'AboutPage',
    'BreadcrumbList',
  ]);
  const inspect = (node, label = '') => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => inspect(n, label));
      return;
    }
    const types = Array.isArray(node['@type'])
      ? node['@type']
      : node['@type']
        ? [node['@type']]
        : [];
    for (const type of types) {
      check(allowed.has(type), path, `schema type outside current publication contract: ${type}`);
      if (type === 'WebSite') {
        check(
          nonempty(node.name) && absolute(node.url),
          path,
          'WebSite: Google requires name and absolute url for site names',
        );
      } else if (type === 'BreadcrumbList') {
        const items = node.itemListElement;
        check(
          Array.isArray(items) && items.length >= 2,
          path,
          'BreadcrumbList: at least two ListItems required',
        );
        for (const [i, item] of (Array.isArray(items) ? items : []).entries()) {
          check(
            item['@type'] === 'ListItem' &&
              nonempty(item.name) &&
              Number.isInteger(item.position) &&
              item.position === i + 1,
            path,
            `BreadcrumbList item ${i + 1}: name and ordered integer position required`,
          );
          if (i < items.length - 1 || item.item !== undefined)
            check(
              absolute(typeof item.item === 'string' ? item.item : item.item?.['@id']),
              path,
              `BreadcrumbList item ${i + 1}: absolute item required (last item can omit item)`,
            );
        }
      } else if (type === 'WebApplication') {
        check(nonempty(node.name), path, 'WebApplication: Google requires name');
        check(
          node.offers?.price !== undefined &&
            Number.isFinite(Number(node.offers.price)) &&
            Number(node.offers.price) >= 0,
          path,
          'WebApplication rich-result requirement missing: offers.price',
        );
        check(
          Boolean(node.aggregateRating || node.review),
          path,
          'WebApplication rich-result requirement missing: aggregateRating or review (do not fabricate either)',
        );
      } else if (type === 'Article') {
        // Google lists recommended, not required, Article properties. Validate the real properties already provided.
        for (const key of ['headline', 'description'])
          if (key in node)
            check(nonempty(node[key]), path, `Article ${key}: empty provided property`);
        for (const key of ['datePublished', 'dateModified'])
          if (key in node)
            check(
              /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(node[key]) &&
                Number.isFinite(Date.parse(node[key])),
              path,
              `Article ${key}: invalid provided ISO date`,
            );
        if (node.datePublished && node.dateModified)
          check(
            Date.parse(node.dateModified) >= Date.parse(node.datePublished),
            path,
            'Article dateModified precedes datePublished',
          );
        if (node.author)
          check(
            nonempty(deref(node.author)?.name),
            path,
            'Article provided author must resolve to its real named node',
          );
        if (node.publisher)
          check(
            nonempty(deref(node.publisher)?.name),
            path,
            'Article provided publisher must resolve to its real named node',
          );
        if (node.image)
          check(absolute(node.image), path, 'Article provided image must be absolute');
      } else if (type === 'Organization') {
        // Google has no universally required Organization properties; validate provided name/url/logo.
        if ('name' in node) check(nonempty(node.name), path, 'Organization provided name empty');
        for (const key of ['url', 'logo'])
          if (key in node)
            check(absolute(node[key]), path, `Organization provided ${key} must be absolute`);
      }
    }
    for (const [key, value] of Object.entries(node)) if (!key.startsWith('@')) inspect(value, key);
  };
  blocks.forEach((b) =>
    check(
      b['@context'] === 'https://schema.org',
      path,
      'JSON-LD @context must match current contract',
    ),
  );
  nodes.forEach((node) => inspect(node));
  return nodes.map((n) => ({ type: n['@type'], dateModified: n.dateModified }));
}

async function inspectImage(url, path) {
  if (!absolute(url)) return;
  if (!fetchedImages.has(url))
    fetchedImages.set(
      url,
      (async () => {
        const target = new URL(url);
        if (servedOrigin && target.origin === publicOrigin) {
          const response = await fetch(new URL(target.pathname + target.search, servedOrigin), {
            redirect: 'manual',
          });
          const bytes = Buffer.from(await response.arrayBuffer());
          return { status: response.status, bytes: bytes.length, ...imageHeader(bytes) };
        }
        const bytes = await readFile(resolve('public', target.pathname.slice(1)));
        return { status: null, bytes: bytes.length, ...imageHeader(bytes) };
      })(),
    );
  try {
    const result = await fetchedImages.get(url);
    if (servedOrigin) check(result.status === 200, path, `og:image HTTP status ${result.status}`);
    check(
      result.width === 1200 && result.height === 630,
      path,
      `og:image must be exactly 1200x630, found ${result.width}x${result.height}`,
    );
    return result;
  } catch (e) {
    check(false, path, `og:image: ${e.message}`);
  }
}

async function inspectPage(html, path, seenTitles, seenDescriptions, layer) {
  const tags = parseHtml(html),
    headings = tags.filter((t) => /^h[1-6]$/.test(t.name));
  const titleTags = tags.filter((t) => t.name === 'title');
  check(titleTags.length === 1, path, `${layer}: title count ${titleTags.length}`);
  const title = titleTags[0]?.text ?? '',
    description = unique(tags, 'description', path);
  check(Boolean(title && description), path, `${layer}: missing title/description`);
  check(
    !seenTitles.has(title) && !seenDescriptions.has(description),
    path,
    `${layer}: duplicate title/description`,
  );
  seenTitles.add(title);
  seenDescriptions.add(description);
  if (layer === 'file') {
    for (const [field, value, min, max] of [
      ['title', title, 50, 60],
      ['description', description, 120, 160],
    ])
      if (value.length < min || value.length > max)
        warnings.push({
          path,
          message: `${field} length ${value.length}, guidance ${min}–${max} (not a gate)`,
        });
  }
  check(
    headings.filter((h) => h.name === 'h1').length === 1,
    path,
    `${layer}: exactly one h1 required`,
  );
  let previous = 0;
  for (const heading of headings) {
    const level = Number(heading.name.slice(1));
    check(
      level <= previous + 1,
      path,
      `${layer}: skipped heading level h${previous} → h${level}: ${heading.text}`,
    );
    previous = level;
  }
  const canonical = tags.filter(
    (t) => t.name === 'link' && t.attrs.rel?.toLowerCase() === 'canonical',
  );
  check(canonical.length === 1, path, `${layer}: canonical count ${canonical.length}`);
  const canonicalUrl = canonical[0]?.attrs.href;
  check(
    absolute(canonicalUrl) &&
      canonicalUrl === publicOrigin + path &&
      sitemap.entries.some((e) => e.url === canonicalUrl),
    path,
    `${layer}: canonical must be absolute, self-referencing and equal to sitemap URL`,
  );
  check(
    !tags.some(
      (t) =>
        t.name === 'meta' &&
        /^(robots|googlebot|bingbot)$/i.test(t.attrs.name ?? '') &&
        /\b(?:noindex|none)\b/i.test(t.attrs.content ?? ''),
    ),
    path,
    `${layer}: public page has noindex meta`,
  );
  check(
    unique(tags, 'og:url', path) === publicOrigin + path,
    path,
    `${layer}: og:url must be absolute and self-referencing`,
  );
  const ogImage = unique(tags, 'og:image', path);
  check(absolute(ogImage), path, `${layer}: og:image must be absolute HTTPS`);
  // Preserve the prior exact brand-image contract.
  check(
    ogImage === publicOrigin + '/brand/scopeledger-social-v1.png',
    path,
    `${layer}: social image contract`,
  );
  const viewport = unique(tags, 'viewport', path);
  check(
    viewport.replace(/\s/g, '') === 'width=device-width,initial-scale=1',
    path,
    `${layer}: viewport must declare width=device-width, initial-scale=1`,
  );
  const ids = tags.filter((t) => t.attrs.id).map((t) => t.attrs.id);
  check(new Set(ids).size === ids.length, path, `${layer}: duplicate IDs`);
  const blocks = [];
  for (const tag of tags.filter(
    (t) => t.name === 'script' && t.attrs.type === 'application/ld+json',
  )) {
    try {
      blocks.push(JSON.parse(tag.content));
    } catch (e) {
      check(false, path, `${layer}: JSON-LD parse error: ${e.message}`);
    }
  }
  check(blocks.length > 0, path, `${layer}: missing JSON-LD`);
  check(
    !/aggregateRating|"offers"\s*:|"review"\s*:|"@type"\s*:\s*"FAQPage"/.test(
      JSON.stringify(blocks),
    ),
    path,
    `${layer}: prior unsupported-claims contract violated`,
  );
  const schema = validateSchema(blocks, path);
  for (const link of links(tags)) {
    const href = link.value;
    if (!href || /^(mailto:|tel:|data:|javascript:|blob:)/i.test(href)) continue;
    let target;
    try {
      target = new URL(href, publicOrigin + path);
    } catch {
      check(false, path, `${layer}: malformed ${link.attr} ${href}`);
      continue;
    }
    if (target.origin !== publicOrigin) continue;
    if (target.pathname === path && target.hash)
      check(
        ids.includes(decodeURIComponent(target.hash.slice(1))),
        path,
        `${layer}: broken local anchor ${href}`,
      );
    const targetPath = siteRedirect(target.pathname) ?? target.pathname;
    check(
      Boolean(
        siteDocumentPath(targetPath) ||
        publicAssetPath(targetPath.slice(1)) ||
        (!built && (targetPath.startsWith('/src/') || targetPath.startsWith('/home/'))),
      ),
      path,
      `${layer}: nonpublic link ${href}`,
    );
    if (!siteDocumentPath(targetPath)) publicAssets.add(target.pathname);
  }
  for (const tag of tags) {
    for (const attr of [
      'href',
      'xlink:href',
      'src',
      'srcset',
      'poster',
      'action',
      'formaction',
      'data',
      'style',
    ])
      check(
        !/http:\/\//i.test(tag.attrs[attr] ?? ''),
        path,
        `${layer}: hard-coded HTTP ${tag.name}[${attr}]: ${tag.attrs[attr]}`,
      );
    if (tag.name === 'style')
      check(
        !/url\(\s*['"]?http:\/\//i.test(tag.content),
        path,
        `${layer}: hard-coded HTTP CSS resource`,
      );
    if (tag.name === 'script')
      check(
        httpScriptReferences(tag.content).length === 0,
        path,
        `${layer}: hard-coded HTTP script/schema URL ${httpScriptReferences(tag.content).join(', ')}`,
      );
  }
  return {
    path,
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    headings: headings.map((h) => ({ level: h.name, text: h.text })),
    schema,
    ogImage,
    socialImage: await inspectImage(ogImage, path),
  };
}

for (const [i, file] of publicDocuments.entries()) {
  const path = routes[i];
  check(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/$/.test(path), path, 'invalid public path format');
  const html = await readFile(built ? resolve('dist', file) : sourceFile(file), 'utf8');
  pages.push(await inspectPage(html, path, titles, descriptions, 'file'));
}
// All built documents, including noindex app shells, must not contain HTTP links/resources.
if (built) {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (extname(file) === '.html') {
        for (const tag of parseHtml(await readFile(file, 'utf8'))) {
          for (const key of [
            'href',
            'xlink:href',
            'src',
            'srcset',
            'action',
            'formaction',
            'poster',
            'data',
            'style',
          ])
            check(
              !/http:\/\//i.test(tag.attrs[key] ?? ''),
              file,
              `built HTML HTTP ${tag.name}[${key}]`,
            );
          if (tag.name === 'style')
            check(
              !/url\(\s*['"]?http:\/\//i.test(tag.content),
              file,
              'built HTML HTTP CSS resource',
            );
          if (tag.name === 'script')
            check(
              httpScriptReferences(tag.content).length === 0,
              file,
              `built HTML HTTP script/schema URL ${httpScriptReferences(tag.content).join(', ')}`,
            );
        }
      }
    }
  }
  await walk(resolve('dist'));
}
const robots = robotsRules(await readFile(resolve(directory, 'robots.txt'), 'utf8'));
check(
  robots.sitemaps.length === 1 && robots.sitemaps[0] === publicOrigin + '/sitemap.xml',
  '/robots.txt',
  'exactly one matching Sitemap directive required',
);
// Include CSS-linked fonts/images, not just HTML references.
for (const asset of [...publicAssets].filter((a) => a.endsWith('.css'))) {
  const filename = built
    ? resolve('dist', asset.slice(1))
    : resolve(
        asset.startsWith('/home/') || asset === '/shared/brand.css' ? '.' : 'public',
        asset.slice(1),
      );
  try {
    const css = await readFile(filename, 'utf8');
    for (const m of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) {
      const target = new URL(m[1], publicOrigin + asset);
      if (target.origin === publicOrigin) publicAssets.add(target.pathname);
    }
  } catch (e) {
    check(false, asset, `CSS resource inventory failed: ${e.message}`);
  }
}
for (const path of [...routes, ...publicAssets])
  for (const rule of robots.rules.filter((r) => r.field === 'disallow'))
    check(
      !robotMatches(rule.value, path),
      path,
      `robots Disallow matches public path: ${rule.value} (${rule.agents.join(',')})`,
    );

if (servedOrigin) {
  const agents = {
    browser: 'Mozilla/5.0 (compatible; ScopeLedgerSEOCheck/1.0)',
    googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  };
  for (const [agent, userAgent] of Object.entries(agents)) {
    const remoteTitles = new Set(),
      remoteDescriptions = new Set();
    for (const page of pages) {
      try {
        const response = await fetch(servedOrigin + page.path, {
          headers: { 'User-Agent': userAgent },
          redirect: 'manual',
        });
        check(
          response.status === 200,
          page.path,
          `${agent}: status ${response.status}, expected 200`,
        );
        check(
          !/\b(?:noindex|none)\b/i.test(response.headers.get('X-Robots-Tag') ?? ''),
          page.path,
          `${agent}: public noindex header`,
        );
        const html = await response.text();
        const inspected = await inspectPage(
          html,
          page.path,
          remoteTitles,
          remoteDescriptions,
          agent,
        );
        check(
          inspected.title === page.title && inspected.description === page.description,
          page.path,
          `${agent}: stale title or description`,
        );
        (page.responses ??= []).push({
          agent,
          status: response.status,
          bytes: Buffer.byteLength(html),
          xRobotsTag: response.headers.get('X-Robots-Tag'),
        });
      } catch (e) {
        check(false, page.path, `${agent}: ${e.message}`);
      }
    }
  }
  for (const [path, expected] of [
    ['/sitemap.xml', sitemap.xml],
    ['/robots.txt', await readFile(resolve(directory, 'robots.txt'), 'utf8')],
  ]) {
    const r = await fetch(servedOrigin + path, { redirect: 'manual' });
    check(
      r.status === 200 && (await r.text()) === expected,
      path,
      'served content/status differs from checked file',
    );
  }
  for (const path of ['/', '/home', '/guides', '/about/index.html']) {
    const r = await fetch(servedOrigin + path, { redirect: 'manual' });
    check(r.status === 308, path, `permanent redirect status ${r.status}, expected 308`);
  }
  for (const path of [
    '/workspace/',
    '/workspace/projects',
    '/app',
    '/api/license/status',
    '/api/license/activate',
    '/api/pdf',
    '/api/ready',
    '/api/health',
    '/api/unknown-seo-path',
    '/samples/change-brief.pdf',
    '/samples/invoice.pdf',
    '/llms.txt',
    '/product-guide.txt',
    '/release.json',
    '/indexnow-key.txt',
    '/not-a-public-page',
  ]) {
    const r = await fetch(servedOrigin + path, { redirect: 'manual' });
    const header = r.headers.get('X-Robots-Tag') ?? '',
      found = directives(header);
    for (const token of ['noindex', 'nofollow', 'noarchive'])
      check(
        found.has(token),
        path,
        `required X-Robots-Tag ${token} missing; actual ${JSON.stringify(header)} (${r.status})`,
      );
    if (path.startsWith('/workspace')) {
      const tags = parseHtml(await r.text());
      const combined = directives(
        meta(tags, 'robots')
          .map((t) => t.attrs.content)
          .join(','),
      );
      for (const token of ['noindex', 'nofollow', 'noarchive'])
        check(combined.has(token), path, `required workspace meta robots ${token} missing`);
    } else await r.arrayBuffer();
  }
}
const report = {
  checkedAt: new Date().toISOString(),
  publicOrigin,
  servedOrigin,
  built,
  schemaSources,
  sitemapEntries: sitemap.entries,
  pages,
  assetsCheckedAgainstRobots: [...publicAssets].sort(),
  warnings,
  errors,
};
await mkdir('output/seo', { recursive: true });
const reportName =
  servedOrigin && servedOrigin !== publicOrigin
    ? 'served-check'
    : args.includes('--live')
      ? 'live-check'
      : 'source-check';
await writeFile(`output/seo/${reportName}.json`, JSON.stringify(report, null, 2));
for (const warning of warnings) console.warn(`WARNING ${warning.path}: ${warning.message}`);
for (const error of errors) console.error(`FAIL ${error.path}: ${error.message}`);
console.log(
  `SEO audit: ${pages.length} pages; ${errors.length} strict failures; ${warnings.length} length warnings; ${servedOrigin ? 'HTTP checks at ' + servedOrigin : 'source only (served HTTP requires SCOPELEDGER_SEO_ORIGIN or --live)'}.`,
);
process.exitCode = errors.length ? 1 : 0;
