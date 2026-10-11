import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publicDocuments } from '../shared/public-assets.mjs';

export const publicOrigin = 'https://scopeledger.site';
export const routes = publicDocuments.map((file) => '/' + file.replace(/index\.html$/, ''));
export const sourceFile = (file) => (file.startsWith('home/') ? file : 'public/' + file);
export function decode(value = '') {
  const names = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, code) => {
    if (!code.startsWith('#')) return names[code.toLowerCase()];
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}

// Audit the actual tag stream, excluding comments and raw script/style text.
// Handles quoted > characters, unquoted attributes and either quote style.
export function parseHtml(html) {
  const tags = [];
  const token = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][a-z\d:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let match;
  while ((match = token.exec(html))) {
    const raw = match[0];
    if (raw.startsWith('<!') || raw.startsWith('</')) continue;
    const name = raw.match(/^<([\w:-]+)/)[1].toLowerCase();
    const attrs = {};
    const attributes = raw.slice(name.length + 1, -1);
    for (const m of attributes.matchAll(
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    ))
      attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
    const tag = { name, attrs, raw, offset: match.index, text: '', content: '' };
    if (['script', 'style', 'title', 'textarea'].includes(name) || /^h[1-6]$/.test(name)) {
      const close = new RegExp(`</${name}\\s*>`, 'gi');
      close.lastIndex = token.lastIndex;
      const end = close.exec(html);
      if (end) {
        tag.content = html.slice(token.lastIndex, end.index);
        tag.text = decode(
          tag.content
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        );
        if (['script', 'style', 'textarea', 'title'].includes(name))
          token.lastIndex = close.lastIndex;
      }
    }
    tags.push(tag);
  }
  return tags;
}

export function links(tags) {
  return tags.flatMap((tag) => {
    const found = [];
    for (const attr of ['href', 'src', 'poster', 'action', 'data'])
      if (tag.attrs[attr]) found.push({ tag: tag.name, attr, value: tag.attrs[attr] });
    if (tag.attrs.srcset)
      for (const item of tag.attrs.srcset.split(','))
        found.push({ tag: tag.name, attr: 'srcset', value: item.trim().split(/\s+/)[0] });
    return found;
  });
}

export function imageHeader(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    if (bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG has no IHDR');
    return { format: 'PNG', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const sof = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) throw new Error('Truncated JPEG segment');
      if (sof.has(marker)) {
        if (size < 8) throw new Error('Invalid JPEG SOF');
        return {
          format: 'JPEG',
          width: bytes.readUInt16BE(offset + 5),
          height: bytes.readUInt16BE(offset + 3),
        };
      }
      offset += size;
    }
    throw new Error('JPEG dimensions not found');
  }
  throw new Error('Expected PNG or JPEG header bytes');
}

export async function sitemapData(directory = 'public') {
  const xml = await readFile(resolve(directory, 'sitemap.xml'), 'utf8');
  const namespace = xml.match(/<urlset\b[^>]*\bxmlns=["']([^"']+)["']/)?.[1];
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    url: decode(m[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1]),
    lastmod: m[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1],
  }));
  return { xml, namespace, entries };
}

export function mappedUrl(value, base, origin) {
  const target = new URL(value, base);
  if (target.origin === publicOrigin) return new URL(target.pathname + target.search, origin);
  return target;
}

export function directives(value = '') {
  return new Set(
    value
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean),
  );
}

export function robotsRules(text) {
  const rules = [],
    sitemaps = [];
  let agents = [],
    sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s*#.*$/, '').trim();
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase(),
      value = match[2].trim();
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (sawRule) {
        agents = [];
        sawRule = false;
      }
      agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(field)) {
      sawRule = true;
      if (value) rules.push({ agents: [...agents], field, value });
    }
  }
  return { rules, sitemaps };
}
export function robotMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const value = anchored ? pattern.slice(0, -1) : pattern;
  return new RegExp(
    '^' +
      value
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      (anchored ? '$' : ''),
  ).test(path);
}
