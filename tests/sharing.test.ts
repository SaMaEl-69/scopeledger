import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { contentPolicy } from '../server/security.mjs';
import { publicAssetPath, shareableAssetPath } from '../shared/public-assets.mjs';

const image = 'https://scopeledger.site/brand/scopeledger-social-v1.png';
describe('public sharing and discovery', () => {
  it.each(['home', 'workspace'])(
    'provides complete fetchable social metadata for %s',
    async (page) => {
      const html = await readFile(`${page}/index.html`, 'utf8');
      for (const field of ['og:image', 'twitter:image']) {
        expect(html).toMatch(new RegExp(`(?:property|name)="${field}" content="${image}"`));
      }
      expect(html).toContain('property="og:image:width" content="1200"');
      expect(html).toContain('property="og:image:height" content="630"');
      expect(html).toContain('property="og:image:alt"');
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
      if (page === 'workspace') expect(html).toContain('content="noindex, nofollow"');
    },
  );
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
