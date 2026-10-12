import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { contentPolicy } from '../server/security.mjs';
import {
  publicAssetPath,
  publicDocuments,
  publicSocialImages,
  shareableAssetPath,
} from '../shared/public-assets.mjs';

const images = {
  'og:image': 'https://scopeledger.site/brand/margvant-facebook-1200x630.png',
  'twitter:image': 'https://scopeledger.site/brand/margvant-x-1200x600.png',
};
const suppliedCards = [
  [
    'margvant-facebook-1200x630.png',
    630,
    693646,
    'ab862c72f4a83a21c12f660e693f07edc2b5bfa844d809faaed9ce1aab15afa0',
  ],
  [
    'margvant-x-1200x600.png',
    600,
    663431,
    'f4d6ff3d1ed52b53724cb0ce71856ccb9b68971c79476198e70f000aa3bafb80',
  ],
  [
    'margvant-linkedin-1200x627.png',
    627,
    689798,
    'f10c030415b9e7b5b385a9da254b78bd2630803ac582a76d662ba29eb4a9d7fe',
  ],
  [
    'margvant-discord-1200x630.png',
    630,
    693646,
    'ab862c72f4a83a21c12f660e693f07edc2b5bfa844d809faaed9ce1aab15afa0',
  ],
  [
    'margvant-whatsapp-1200x630.jpg',
    630,
    130495,
    '8048fe2166d09035066a42e4e4e6b53748246f02110850f6fa0c805effc353c3',
  ],
] as const;

function dimensions(bytes: Buffer, filename: string): [number, number] {
  if (filename.endsWith('.png')) {
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  expect(bytes.readUInt16BE(0)).toBe(0xffd8);
  for (let offset = 2; offset + 8 < bytes.length;) {
    expect(bytes[offset]).toBe(0xff);
    const marker = bytes[offset + 1];
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    )
      return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
    const length = bytes.readUInt16BE(offset + 2);
    expect(length).toBeGreaterThanOrEqual(2);
    offset += 2 + length;
  }
  throw new Error(`JPEG frame dimensions missing: ${filename}`);
}

describe('public sharing and discovery', () => {
  it.each([
    ...publicDocuments.map((file) => (file === 'home/index.html' ? file : 'public/' + file)),
    'workspace/index.html',
  ])('provides complete fetchable social metadata for %s', async (page) => {
    const html = await readFile(page, 'utf8');
    for (const [field, image] of Object.entries(images)) {
      const imagePattern = image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(html).toMatch(new RegExp(`(?:property|name)="${field}"\\s+content="${imagePattern}"`));
    }
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('property="og:image:alt"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    if (page === 'workspace/index.html') expect(html).toContain('content="noindex, nofollow"');
  });
  it('ships a correctly sized PNG and limits cross-site asset access', async () => {
    const png = await readFile('public/brand/scopeledger-social-v1.png');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(300000);
    expect(shareableAssetPath('brand/scopeledger-social-v1.png')).toBe(true);
    expect(shareableAssetPath('workspace/index.html')).toBe(false);
    expect(publicAssetPath('llms.txt')).toBe(true);
    expect(publicAssetPath('product-guide.txt')).toBe(true);
    expect(publicAssetPath('private-notes.txt')).toBe(false);
  });
  it.each(suppliedCards)(
    'preserves the original %s bytes and dimensions',
    async (name, height, size, hash) => {
      const bytes = await readFile('public/brand/' + name);
      expect(bytes.length).toBe(size);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
      expect(dimensions(bytes, name)).toEqual([1200, height]);
      expect(publicSocialImages).toContain('brand/' + name);
      expect(publicAssetPath('brand/' + name)).toBe(true);
      expect(shareableAssetPath('brand/' + name)).toBe(true);
      expect(shareableAssetPath('brand/private-preview.png')).toBe(false);
      expect(publicAssetPath('brand/private-photo.jpg')).toBe(false);
      expect(shareableAssetPath('brand/private-photo.jpg')).toBe(false);
    },
  );
  it('publishes factual structured data with a valid CSP and no invented ratings or live offers', async () => {
    const html = await readFile('home/index.html', 'utf8');
    const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    const data = JSON.parse(script);
    expect(data['@graph'].map((entry: { '@type': string }) => entry['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebApplication',
    ]);
    expect(script).not.toMatch(/aggregateRating|"review"\s*:|"offers"|InStock/);
    expect(contentPolicy(html)).toContain("'sha256-");
    expect(contentPolicy(html)).not.toContain("script-src 'self' 'unsafe-inline'");
  });
  it('keeps crawlable public facts separate from local projects and unavailable checkout', async () => {
    const robots = await readFile('public/robots.txt', 'utf8');
    expect(robots).toContain('User-agent: *');
    for (const path of ['/workspace', '/app']) {
      expect(robots).toContain(`Allow: ${path}`);
      expect(robots).not.toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain('Disallow: /api');
    const guide = await readFile('public/product-guide.txt', 'utf8');
    expect(guide).toContain('USD 49');
    expect(guide).toContain('USD 99');
    expect(guide).toContain('free demo');
    expect(guide).toContain('not configured');
    const llms = await readFile('public/llms.txt', 'utf8');
    for (const match of llms.matchAll(/https:\/\/scopeledger\.site\/([^\s)]+)/g)) {
      const path = match[1];
      if (!path.endsWith('/')) expect(publicAssetPath(path)).toBe(true);
    }
  });
});
