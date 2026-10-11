import { mkdir, writeFile } from 'node:fs/promises';
import { publicOrigin, routes, parseHtml, links } from './seo-audit-lib.mjs';

// Use the same built application server as playwright.audit/site (npm start).
// All requests are real HTTP. No static-file substitution, retries or mocked responses.
const origin = new URL(
  process.env.SCOPELEDGER_SEO_ORIGIN ?? process.argv[2] ?? 'http://127.0.0.1:4173',
).origin;
const errors = [],
  requests = [],
  edges = [],
  pages = new Map(),
  cache = new Map();
const fail = (page, message) => errors.push({ page, message });
const internal = (url) =>
  url.origin === publicOrigin || url.origin === origin || url.hostname === 'www.scopeledger.site';
const mapped = (url) => (internal(url) ? new URL(url.pathname + url.search, origin) : url);
async function retrieve(url) {
  const key = mapped(url).href;
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
        let current = new URL(key),
          redirects = [],
          visited = new Set();
        for (;;) {
          if (visited.has(current.href)) throw new Error(`redirect loop at ${current.href}`);
          visited.add(current.href);
          const response = await fetch(current, { redirect: 'manual' });
          const status = response.status,
            location = response.headers.get('location');
          requests.push({ url: current.href, status, location });
          if (status >= 300 && status < 400 && location) {
            redirects.push({ url: current.href, status, location });
            await response.arrayBuffer();
            if (redirects.length > 1)
              throw new Error(`redirect chain: ${JSON.stringify(redirects)}`);
            current = mapped(new URL(location, current));
            if (!internal(current))
              throw new Error(`internal link redirects off-site to ${current.href}`);
            continue;
          }
          const body = Buffer.from(await response.arrayBuffer());
          return {
            status,
            redirects,
            contentType: response.headers.get('content-type') ?? '',
            body,
            url: current.href,
          };
        }
      })(),
    );
  return cache.get(key);
}
for (const path of routes) {
  try {
    const result = await retrieve(new URL(path, origin));
    if (result.status !== 200) fail(path, `manifest route HTTP ${result.status}, expected 200`);
    if (result.redirects.length)
      fail(path, `canonical route redirects: ${JSON.stringify(result.redirects)}`);
    const tags = parseHtml(result.body.toString('utf8'));
    pages.set(path, {
      tags,
      ids: new Set(tags.filter((t) => t.attrs.id).map((t) => t.attrs.id)),
      result,
    });
  } catch (e) {
    fail(path, e.message);
  }
}
for (const [path, page] of pages) {
  for (const link of links(page.tags)) {
    if (!link.value || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(link.value)) continue;
    let target;
    try {
      target = new URL(link.value, publicOrigin + path);
    } catch (e) {
      fail(path, `${link.value}: ${e.message}`);
      continue;
    }
    if (!internal(target)) continue;
    if (link.tag === 'a' || link.tag === 'area') {
      if (
        target.pathname === '/' ||
        (!target.pathname.endsWith('/') && !/\.[a-z\d]+$/i.test(target.pathname))
      )
        fail(path, `internal document link lacks canonical path/trailing slash: ${link.value}`);
      if (target.hostname === 'www.scopeledger.site')
        fail(path, `internal link uses www alias: ${link.value}`);
      if (routes.includes(target.pathname))
        edges.push({ from: path, to: target.pathname, href: link.value });
    }
    try {
      const result = await retrieve(target);
      if (result.status === 404) fail(path, `404: ${link.value}`);
      else if (result.status < 200 || result.status >= 400)
        fail(path, `HTTP ${result.status}: ${link.value}`);
      if (result.redirects.length && (link.tag === 'a' || link.tag === 'area'))
        fail(path, `noncanonical internal link redirects: ${link.value} → ${result.url}`);
      if (target.hash) {
        if (!result.contentType.includes('text/html'))
          fail(path, `fragment on non-HTML resource: ${link.value}`);
        else {
          const tags = parseHtml(result.body.toString('utf8'));
          const id = decodeURIComponent(target.hash.slice(1));
          if (!tags.some((t) => t.attrs.id === id || (t.name === 'a' && t.attrs.name === id)))
            fail(path, `missing #anchor target ${link.value} (target ${result.url})`);
        }
      }
    } catch (e) {
      fail(path, `${link.value}: ${e.message}`);
    }
  }
}
for (const guide of routes.filter((p) => p.startsWith('/guides/') && p !== '/guides/'))
  if (!edges.some((e) => e.to === guide && e.from !== guide))
    fail(guide, 'orphan guide: no incoming link from another public page');
const report = {
  origin,
  checkedAt: new Date().toISOString(),
  manifestRoutes: routes,
  pagesFetched: [...pages.keys()],
  requests,
  edges,
  errors,
};
await mkdir('output/seo', { recursive: true });
await writeFile('output/seo/link-audit.json', JSON.stringify(report, null, 2));
for (const error of errors) console.error(`FAIL ${error.page}: ${error.message}`);
console.log(
  `Link audit: ${pages.size}/${routes.length} served pages; ${requests.length} real HTTP responses; ${errors.length} strict failures.`,
);
process.exitCode = errors.length ? 1 : 0;
