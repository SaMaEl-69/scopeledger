import { describe, expect, it } from 'vitest';
import worker from '../cloudflare/worker.mjs';

const files = new Map([
  [
    '/home/index.html',
    '<!doctype html><title>Home</title><script>window.theme = "system";</script>',
  ],
  [
    '/workspace/index.html',
    '<!doctype html><title>Workspace</title><script src="/assets/app-12345678.js"></script>',
  ],
  ['/release.json', '{"id":"20261009-test"}'],
  ['/assets/app-12345678.js', 'console.log("app")'],
  ['/samples/change-brief.pdf', '%PDF-1.7 sample'],
  ['/brand/scopeledger-social-v1.png', 'public sharing card'],
  ['/llms.txt', '# ScopeLedger'],
  ['/product-guide.txt', '# ScopeLedger product guide'],
  ['/guides/index.html', '<!doctype html><title>ScopeLedger guides</title>'],
  ['/guides/handle-scope-creep/index.html', '<!doctype html><title>Handle scope creep</title>'],
  [
    '/guides/change-order-template/index.html',
    '<!doctype html><title>Change order template</title>',
  ],
  [
    '/guides/price-additional-work/index.html',
    '<!doctype html><title>Price additional work</title>',
  ],
  [
    '/guides/project-baseline-checklist/index.html',
    '<!doctype html><title>Project baseline</title>',
  ],
  ['/about/index.html', '<!doctype html><title>About ScopeLedger</title>'],
  ['/privacy/index.html', '<!doctype html><title>Privacy</title>'],
  ['/license/index.html', '<!doctype html><title>License information</title>'],
  ['/guides/guides.css', 'body { color: #0c0d10; }'],
  ['/guides/forgotten/index.html', '<title>Accidental unpublished page</title>'],
  ['/private-notes.txt', 'private'],
  // Deliberately present: neither sensitive files nor source maps become public.
  ['/.env', 'private'],
  ['/backup.sqlite', 'private'],
  ['/assets/app-12345678.js.map', 'private'],
]);
const env = {
  ASSETS: {
    fetch: async (request: Request) => {
      const path = new URL(request.url).pathname;
      const body = files.get(path);
      return new Response(body ?? 'missing', {
        status: body ? 200 : 404,
        headers: {
          'Content-Type': path.endsWith('.html')
            ? 'text/html'
            : path.endsWith('.pdf')
              ? 'application/pdf'
              : 'text/plain',
        },
      });
    },
  },
};
const request = (path: string, init?: RequestInit) =>
  new Request('https://scopeledger.site' + path, init);
const run = (path: string, init?: RequestInit) => worker.fetch(request(path, init), env);

describe('Cloudflare public demo boundary', () => {
  it.each([
    'https://www.scopeledger.site/workspace/?view=settings&project=harbor',
    'http://www.scopeledger.site/workspace/?view=settings&project=harbor',
    'http://scopeledger.site/workspace/?view=settings&project=harbor',
  ])('uses the HTTPS apex and preserves navigation for %s', async (url) => {
    const response = await worker.fetch(new Request(url), env);
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(
      'https://scopeledger.site/workspace/?view=settings&project=harbor',
    );
    expect(await response.text()).toBe('');
    expect(response.headers.get('Set-Cookie')).toBe(null);
    const rejected = await worker.fetch(new Request(url, { method: 'POST', body: 'private' }), env);
    expect(rejected.status).toBe(405);
    expect(rejected.headers.get('Location')).toBe(null);
  });
  it.each([
    ['/?source=test', '/home/?source=test'],
    ['/home', '/home/'],
    ['/workspace/index.html?view=projects', '/workspace/?view=projects'],
    ['/app?view=settings', '/workspace/?view=settings'],
  ])('preserves canonical navigation for %s', async (path, location) => {
    const response = await run(path);
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(location);
  });
  it('uses hashed inline script CSP and security headers on both documents, including HEAD', async () => {
    for (const path of ['/home/', '/workspace/', '/workspace/project']) {
      const response = await run(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
      const policy = response.headers.get('Content-Security-Policy')!;
      expect(policy).toContain("script-src-attr 'none'");
      expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
      if (path === '/home/') expect(policy).toContain("'sha256-");
      const head = await run(path, { method: 'HEAD' });
      expect(await head.text()).toBe('');
      expect(head.headers.get('Content-Security-Policy')).toBe(policy);
    }
  });
  it('publishes only known guide and service pages with permanent aliases and indexable canonical documents', async () => {
    for (const path of [
      '/guides/',
      '/guides/handle-scope-creep/',
      '/guides/change-order-template/',
      '/guides/price-additional-work/',
      '/guides/project-baseline-checklist/',
      '/about/',
      '/privacy/',
      '/license/',
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const canonical = await run(path, { method });
        expect(canonical.status, `${method} ${path}`).toBe(200);
        expect(canonical.headers.get('Content-Type')).toBe('text/html');
        expect(canonical.headers.get('X-Robots-Tag')).toBe(null);
        for (const alias of [path.slice(0, -1), path + 'index.html']) {
          const redirected = await run(alias + '?source=a%26b', { method });
          expect(redirected.status).toBe(308);
          expect(redirected.headers.get('Location')).toBe(path + '?source=a%26b');
        }
      }
    }
    expect((await run('/guides/guides.css')).status).toBe(200);
    for (const path of ['/guides/forgotten/', '/guides/forgotten/index.html', '/guides/unknown/'])
      expect((await run(path)).status).toBe(404);
  });
  it('keeps app shells, demo documents, machine guides and errors out of search while serving public marketing content', async () => {
    for (const path of [
      '/workspace/?view=documents',
      '/workspace/projects/harbor',
      '/api/license/status',
      '/samples/change-brief.pdf?v=5',
      '/llms.txt',
      '/product-guide.txt',
      '/release.json',
      '/missing',
      '/%zz',
    ]) {
      const response = await run(path);
      expect(response.headers.get('X-Robots-Tag'), path).toBe('noindex, nofollow');
    }
    expect((await run('/workspace/', { method: 'HEAD' })).headers.get('X-Robots-Tag')).toBe(
      'noindex, nofollow',
    );
    for (const path of ['/home/', '/guides/', '/brand/scopeledger-social-v1.png'])
      expect((await run(path)).headers.get('X-Robots-Tag'), path).toBe(null);
  });
  it.each([
    '/.env',
    '/backup.sqlite',
    '/assets/app-12345678.js.map',
    '/server/backend.mjs',
    '/workspace/missing.js',
    '/missing',
    '/API/private',
    '/workspace/.git/config',
  ])('rejects private or nonexistent paths: %s', async (path) => {
    expect((await run(path)).status).toBe(404);
  });
  it.each(['/home%00', '/home%5c', '/%zz'])('rejects malformed paths: %s', async (path) => {
    expect((await run(path)).status).toBe(400);
  });
  it('serves public samples and caches fingerprinted assets', async () => {
    const sample = await run('/samples/change-brief.pdf?v=3');
    expect(sample.status).toBe(200);
    expect(await sample.text()).toContain('%PDF-1.7');
    const script = await run('/assets/app-12345678.js');
    expect(script.headers.get('Cache-Control')).toContain('immutable');
  });
  it('allows external embedding only of the public sharing card', async () => {
    const card = await run('/brand/scopeledger-social-v1.png');
    expect(card.status).toBe(200);
    expect(card.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    for (const path of ['/home/', '/workspace/', '/samples/change-brief.pdf', '/api/health']) {
      expect((await run(path)).headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    }
    for (const path of ['/llms.txt', '/product-guide.txt'])
      expect((await run(path)).status).toBe(200);
    expect((await run('/private-notes.txt')).status).toBe(404);
  });
  it('reports demo access without granting a cookie or accepting client-supplied activation', async () => {
    const response = await run('/api/license/status', {
      headers: { Cookie: 'active=true; plan=agency' },
    });
    expect(await response.json()).toMatchObject({
      configured: false,
      active: false,
      mode: 'demo',
      plan: null,
      checkout: { individual: null, agency: null },
    });
    expect(response.headers.get('Set-Cookie')).toBe(null);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    for (const path of [
      '/api/license/activate',
      '/api/license/release',
      '/api/projects/authorize',
      '/api/pdf',
    ]) {
      const result = await run(path, { method: 'POST', body: '{"active":true}' });
      expect(result.status).toBe(503);
      expect(await result.json()).toMatchObject({ error: 'licensing_not_configured' });
      expect((await run(path)).status).toBe(405);
    }
  });
  it('rejects cross-site protected requests and exposes no CORS access', async () => {
    for (const headers of [
      new Headers({ Origin: 'https://attacker.example' }),
      new Headers({ 'Sec-Fetch-Site': 'cross-site' }),
    ]) {
      const response = await run('/api/license/status', { headers });
      expect(response.status).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(null);
    }
    expect((await run('/api/license/status', { method: 'POST' })).status).toBe(405);
    expect((await run('/home/', { method: 'POST' })).status).toBe(405);
  });
  it('distinguishes site health from commercial readiness and includes the release', async () => {
    const health = await run('/api/health');
    expect(await health.json()).toEqual({ status: 'alive', release: '20261009-test' });
    const ready = await run('/api/ready');
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({
      purchasesEnabled: false,
      mode: 'demo',
      status: 'not_ready',
    });
  });
  it('fails closed if the asset service fails without exposing internals', async () => {
    const response = await worker.fetch(request('/home/'), {
      ASSETS: {
        fetch: () => {
          throw new Error('secret');
        },
      },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service_unavailable' });
  });
});
