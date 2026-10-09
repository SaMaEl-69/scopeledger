import { contentPolicy } from '../server/security.mjs';
import { siteDocumentPath, siteRedirect } from '../server/site-routes.mjs';
import { publicAssetPath, shareableAssetPath } from '../shared/public-assets.mjs';

// The current public release is a demo. The Node/SQLite licensing and sandboxed
// PDF service stay in server/; no client flag or cookie activates this adapter.
const unavailable = {
  error: 'licensing_not_configured',
  message:
    'Purchases and activation are not available yet. You can try the workspace and view the sample documents.',
  licensingConfigured: false,
};
const protectedActions = new Set([
  '/api/license/activate',
  '/api/license/release',
  '/api/projects/authorize',
  '/api/pdf',
]);

function secure(response, request, policy = contentPolicy()) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', policy);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set(
    'Cross-Origin-Resource-Policy',
    shareableAssetPath(new URL(request.url).pathname.slice(1)) ? 'cross-origin' : 'same-origin',
  );
  if (new URL(request.url).protocol === 'https:')
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.delete('Set-Cookie');
  headers.delete('Access-Control-Allow-Origin');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(request, status, payload, headers = {}) {
  return secure(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers,
      },
    }),
    request,
  );
}

async function asset(env, request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  // Internal asset reads do not forward cookies, auth or conditional headers.
  return env.ASSETS.fetch(new Request(url, { method: 'GET' }));
}

async function releaseId(env, request) {
  const response = await asset(env, request, '/release.json');
  if (!response.ok || Number(response.headers.get('Content-Length')) > 16384) return null;
  try {
    const release = await response.json();
    return /^[a-zA-Z0-9.-]{1,80}$/.test(release.id) ? release.id : null;
  } catch {
    return null;
  }
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (
    url.hostname === 'www.scopeledger.site' ||
    (url.hostname === 'scopeledger.site' && url.protocol === 'http:')
  ) {
    if (!['GET', 'HEAD'].includes(request.method))
      return json(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    url.hostname = 'scopeledger.site';
    url.protocol = 'https:';
    url.port = '';
    return secure(
      new Response(null, {
        status: 308,
        headers: { Location: url.href, 'Cache-Control': 'no-store' },
      }),
      request,
    );
  }
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return json(request, 400, { error: 'invalid_path' });
  }
  if (
    path.includes('\0') ||
    path.includes('\\') ||
    path.split('/').some((p) => p === '.' || p === '..')
  )
    return json(request, 400, { error: 'invalid_path' });

  if (path === '/api/health' || path === '/api/ready') {
    if (!['GET', 'HEAD'].includes(request.method))
      return json(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    const release = await releaseId(env, request);
    return path === '/api/health'
      ? json(request, 200, { status: 'alive', release })
      : json(request, 503, {
          status: 'not_ready',
          release,
          mode: 'demo',
          purchasesEnabled: false,
          checks: { configured: false, storage: false, renderer: false },
        });
  }

  if (/^\/api(?:\/|$)/i.test(path)) {
    const origin = request.headers.get('Origin');
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== url.origin))
      return json(request, 403, { error: 'origin_rejected' });
    if (path !== '/api/license/status' && !protectedActions.has(path))
      return json(request, 404, { error: 'not_found' });
    const method = path === '/api/license/status' ? 'GET' : 'POST';
    if (request.method !== method)
      return json(request, 405, { error: 'method_not_allowed' }, { Allow: method });
    if (path === '/api/license/status')
      return json(request, 200, {
        configured: false,
        mode: 'demo',
        active: false,
        plan: null,
        deviceLabel: null,
        slotsUsed: 0,
        slotsLimit: 0,
        checkout: { individual: null, agency: null },
        message: unavailable.message,
      });
    return json(request, 503, unavailable);
  }

  if (!['GET', 'HEAD'].includes(request.method))
    return json(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
  const location = siteRedirect(path, url.pathname + url.search);
  if (location)
    return secure(
      new Response(null, {
        status: 302,
        headers: { Location: location, 'Cache-Control': 'no-store' },
      }),
      request,
    );

  const documentPath = siteDocumentPath(path);
  const target = documentPath ?? path;
  if (path.split('/').some((part) => part.startsWith('.')) || !publicAssetPath(target.slice(1)))
    return json(request, 404, { error: 'not_found' });
  const response = await asset(env, request, target);
  if (!response.ok) return json(request, 404, { error: 'not_found' });
  const headers = new Headers(response.headers);
  let policy = contentPolicy(),
    body = response.body;
  if (target.endsWith('.html')) {
    // The build owns these two small documents; never buffer arbitrary assets.
    if (Number(headers.get('Content-Length')) > 2 * 1024 * 1024)
      return json(request, 500, { error: 'invalid_document' });
    const html = await response.text();
    if (html.length > 2 * 1024 * 1024) return json(request, 500, { error: 'invalid_document' });
    policy = contentPolicy(html);
    body = html;
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    headers.set('Cache-Control', 'no-cache');
  } else
    headers.set(
      'Cache-Control',
      /^\/assets\/[^/]+-[\w-]{8,}\.[\w.]+$/.test(target)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    );
  return secure(new Response(body, { status: 200, headers }), request, policy);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch {
      // Do not log request bodies, headers, queries or customer data.
      console.error(JSON.stringify({ operation: 'serve', code: 'asset_service_failed' }));
      return json(request, 503, { error: 'service_unavailable' });
    }
  },
};
