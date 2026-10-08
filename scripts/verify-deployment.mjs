import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function canonical(value, protocol) {
  const url = new URL(value);
  if (url.origin !== value || url.protocol !== protocol || url.username || url.password)
    throw new Error('Use a canonical origin.');
  return url;
}
export async function verifyDeployment(
  origin,
  { fetcher = fetch, httpOrigin, requireLicensing = false, testLimits = false } = {},
) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw new Error('TLS verification must remain enabled.');
  const url = canonical(origin, 'https:');
  const http = canonical(httpOrigin ?? `http://${url.hostname}`, 'http:');
  if (http.hostname !== url.hostname) throw new Error('HTTP and HTTPS hostnames must match.');
  const checks = [];
  const read = async (path, options = {}) =>
    fetcher(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
  for (const path of ['/home/', '/workspace/']) {
    const response = await read(path);
    const csp = response.headers.get('content-security-policy') ?? '';
    if (
      response.status !== 200 ||
      !csp.includes("base-uri 'none'") ||
      !csp.includes("script-src-attr 'none'") ||
      !csp.includes("object-src 'none'") ||
      !csp.includes("connect-src 'self'") ||
      /script-src[^;]*'unsafe-(?:inline|eval)'/.test(csp) ||
      response.headers.get('x-content-type-options') !== 'nosniff' ||
      response.headers.get('x-frame-options') !== 'SAMEORIGIN' ||
      response.headers.get('cross-origin-opener-policy') !== 'same-origin' ||
      response.headers.get('cross-origin-resource-policy') !== 'same-origin' ||
      response.headers.get('referrer-policy') !== 'strict-origin-when-cross-origin' ||
      !/max-age=(?:86400|\d{6,})\b/.test(response.headers.get('strict-transport-security') ?? '')
    )
      throw new Error('Public security headers or routes failed.');
    await response.body?.cancel();
    checks.push({ path, status: 200, headersVerified: true });
  }
  const redirect = await fetcher(http.origin + '/home/', {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (
    ![301, 308].includes(redirect.status) ||
    redirect.headers.get('location') !== origin + '/home/'
  )
    throw new Error('HTTPS redirect failed.');
  await redirect.body?.cancel();
  checks.push({ path: 'HTTP redirect', status: redirect.status });
  for (const path of [
    '/.env',
    '/server/backend.mjs',
    '/licenses.sqlite',
    '/backup.slarchive',
    '/assets/main.js.map',
  ]) {
    const response = await read(path);
    if (response.status !== 404) throw new Error('Private or unexpected file exposure detected.');
    await response.body?.cancel();
    checks.push({ path, status: 404 });
  }
  const statusResponse = await read('/api/license/status');
  const status = await statusResponse.json();
  if (
    statusResponse.status !== 200 ||
    status.active !== false ||
    (requireLicensing && (status.configured !== true || status.mode !== 'live'))
  )
    throw new Error('Anonymous license state failed.');
  if (status.configured) {
    const cookie = statusResponse.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-scopeledger_device='));
    if (
      !cookie ||
      !/; Path=\/(?:;|$)/.test(cookie) ||
      !cookie.includes('; Secure') ||
      !cookie.includes('; HttpOnly') ||
      !cookie.includes('; SameSite=Strict')
    )
      throw new Error('Live cookie security failed.');
  }
  checks.push({ path: '/api/license/status', status: 200, anonymous: true });
  const crossSite = await read('/api/license/status', {
    headers: { Origin: 'https://security-test.invalid', 'Sec-Fetch-Site': 'cross-site' },
  });
  if (crossSite.status !== 403 || crossSite.headers.has('set-cookie'))
    throw new Error('Cross-site boundary failed.');
  await crossSite.body?.cancel();
  checks.push({ path: 'Cross-site API', status: 403 });
  const forged = await read('/api/projects/authorize', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: '__Host-scopeledger_session=forged; __Host-scopeledger_device=forged',
      'X-Licensed': 'true',
      'X-Forwarded-For': '198.51.100.77, 10.0.0.1',
    },
    body: '{}',
  });
  if (forged.status !== (status.configured ? 401 : 503))
    throw new Error('Forged authorization boundary failed.');
  await forged.body?.cancel();
  checks.push({ path: 'Forged session', status: forged.status });
  const ready = await read('/api/ready'),
    health = await ready.json();
  if (
    status.configured
      ? ready.status !== 200 ||
        health.status !== 'ready' ||
        !health.checks?.renderer ||
        !health.checks?.storage
      : ready.status !== 503
  )
    throw new Error('Runtime readiness failed.');
  checks.push({
    path: '/api/ready',
    status: ready.status,
    protectedServiceReady: !!status.configured,
  });
  if (testLimits) {
    const responses = await Promise.all(
      Array.from({ length: 40 }, () => read('/api/license/status')),
    );
    if (
      !responses.some((response) => response.status === 429) ||
      responses.some((response) => ![200, 429, 503].includes(response.status))
    )
      throw new Error('Gateway request limits failed.');
    await Promise.all(responses.map((response) => response.body?.cancel()));
    checks.push({
      path: 'Gateway request burst',
      throttled: responses.filter((response) => response.status === 429).length,
    });
  }
  return {
    status: 'verified',
    tlsVerificationEnabled: true,
    licensingConfigured: !!status.configured,
    checks,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [origin, ...options] = process.argv.slice(2);
    const httpOrigin = options.find((option) => option.startsWith('--http-origin='))?.slice(14);
    if (
      options.some(
        (option) =>
          option !== '--require-licensing' &&
          option !== '--test-limits' &&
          !option.startsWith('--http-origin='),
      )
    )
      throw new Error('Unknown option.');
    console.log(
      JSON.stringify(
        await verifyDeployment(origin, {
          httpOrigin,
          requireLicensing: options.includes('--require-licensing'),
          testLimits: options.includes('--test-limits'),
        }),
      ),
    );
  } catch {
    console.error(
      JSON.stringify({ status: 'security_verification_failed', at: new Date().toISOString() }),
    );
    process.exitCode = 1;
  }
}
