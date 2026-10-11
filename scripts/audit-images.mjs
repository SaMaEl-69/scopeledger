import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { publicOrigin, routes, parseHtml, imageHeader } from './seo-audit-lib.mjs';

const origin = process.env.SCOPELEDGER_SEO_ORIGIN ?? 'http://127.0.0.1:4173';
const images = [],
  unverified = [],
  cache = new Map();
async function imageBytes(src, page) {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    return Buffer.from(
      src.slice(0, comma).includes(';base64')
        ? src.slice(comma + 1)
        : decodeURIComponent(src.slice(comma + 1)),
      src.slice(0, comma).includes(';base64') ? 'base64' : 'utf8',
    );
  }
  const url = new URL(src, publicOrigin + page);
  const target = url.origin === publicOrigin ? new URL(url.pathname + url.search, origin) : url;
  if (!cache.has(target.href))
    cache.set(
      target.href,
      (async () => {
        const response = await fetch(target, { redirect: 'manual' });
        if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${target.href}`);
        return Buffer.from(await response.arrayBuffer());
      })(),
    );
  return cache.get(target.href);
}
function format(bytes) {
  if (bytes.toString('utf8', 0, Math.min(bytes.length, 300)).includes('<svg')) return 'SVG';
  if (bytes.subarray(0, 3).toString() === 'GIF') return 'GIF';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'WebP';
  try {
    return imageHeader(bytes).format;
  } catch {
    return 'UNVERIFIED';
  }
}
for (const page of routes) {
  let html = '',
    tags;
  if (process.argv.includes('--dom')) {
    const snapshot = JSON.parse(
      await readFile(`output/seo/mobile/${page.replaceAll('/', '-')}-images.json`, 'utf8'),
    );
    tags = snapshot.images
      .filter((t) => t.name === 'img' || t.visible)
      .map((tag, offset) => ({ ...tag, offset }));
  } else {
    const response = await fetch(origin + page, { redirect: 'manual' });
    if (response.status !== 200) {
      unverified.push({ page, error: `HTML HTTP ${response.status}` });
      continue;
    }
    html = await response.text();
    tags = parseHtml(html).filter(
      (t) =>
        t.name === 'img' ||
        (t.name === 'svg' && !(t.attrs.width === '0' && t.attrs.height === '0')),
    );
  }
  for (const tag of tags) {
    const row = {
      page,
      element: tag.name,
      source: tag.attrs.src ?? `inline@${tag.offset}`,
      alt: tag.attrs.alt ?? null,
      ariaHidden: tag.attrs['aria-hidden'] ?? null,
      width: tag.attrs.width ?? null,
      height: tag.attrs.height ?? null,
      format: null,
      bytes: null,
      issues: [],
    };
    if (tag.name === 'img') {
      if (!Object.hasOwn(tag.attrs, 'alt')) row.issues.push('missing alt');
      row.decorative = tag.attrs.alt === '';
      try {
        const bytes = await imageBytes(tag.attrs.src, page);
        row.bytes = bytes.length;
        row.format = format(bytes);
      } catch (e) {
        unverified.push({ page, source: row.source, error: e.message });
      }
    } else {
      const end = html.indexOf('</svg>', tag.offset);
      const markup = tag.markup ?? (end === -1 ? tag.raw : html.slice(tag.offset, end + 6));
      row.bytes = Buffer.byteLength(markup);
      row.format = 'inline SVG';
      row.decorative = tag.attrs['aria-hidden'] === 'true';
      row.accessibleName =
        tag.attrs['aria-label'] ??
        tag.attrs['aria-labelledby'] ??
        markup.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
        null;
      if (!row.decorative && !row.accessibleName)
        row.issues.push('no explicit accessible name/decorative designation');
    }
    if (!(Number(row.width) > 0)) row.issues.push('missing explicit positive width');
    if (!(Number(row.height) > 0)) row.issues.push('missing explicit positive height');
    images.push(row);
  }
}
await mkdir('output/seo', { recursive: true });
await writeFile(
  'output/seo/images.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin,
      mode: process.argv.includes('--dom')
        ? 'local production DOM at 390px; all img plus visible SVG'
        : 'served HTML; zero-sized SVG definition blocks excluded',
      images,
      unverified,
    },
    null,
    2,
  ),
);
const escape = (value) =>
  String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const header =
  '| Route | Element/source | Format | Bytes | Alt/name | Explicit dimensions | Findings |\n|---|---|---|---:|---|---|---|\n';
const rows = images
  .map(
    (r) =>
      `| ${r.page} | ${escape(r.element + ': ' + r.source)} | ${r.format ?? 'UNVERIFIED'} | ${r.bytes ?? 'UNVERIFIED'} | ${escape(r.decorative ? 'decorative (alt="" or aria-hidden="true")' : (r.alt ?? r.accessibleName ?? 'missing'))} | ${escape(r.width)} × ${escape(r.height)} | ${escape(r.issues.join('; ') || 'none')} |`,
  )
  .join('\n');
await writeFile('output/seo/images.md', header + rows + '\n');
console.log(
  `Image inventory: ${images.length} elements; ${images.filter((r) => r.issues.length).length} with report-only findings; ${unverified.length} unverified fetches. See output/seo/images.md (all elements, including decorative images).`,
);
for (const entry of unverified) console.warn('UNVERIFIED ' + JSON.stringify(entry));
