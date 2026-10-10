import { publicDocuments } from '../shared/public-assets.mjs';

const publicRoutes = new Map(
  publicDocuments.map((document) => [
    '/' + document.slice(0, -'index.html'.length),
    '/' + document,
  ]),
);

/** Keep the public site and legacy workspace entry points at one origin. */
export function siteRedirect(pathname, url = '/') {
  const queryAt = url.indexOf('?'),
    query = queryAt === -1 ? '' : url.slice(queryAt);
  if (pathname === '/' || pathname === '/index.html') return '/home/' + query;
  for (const [canonical, document] of publicRoutes) {
    if (pathname === canonical.slice(0, -1) || pathname === document) return canonical + query;
  }
  if (pathname === '/workspace' || pathname === '/workspace/index.html')
    return '/workspace/' + query;
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    const suffix = pathname.slice('/app'.length);
    if (
      suffix.includes('\0') ||
      suffix.includes('\\') ||
      suffix.split('/').some((segment) => segment === '.' || segment === '..')
    )
      return null;
    return (
      '/workspace' + (suffix ? suffix.split('/').map(encodeURIComponent).join('/') : '/') + query
    );
  }
  return null;
}

/** Only extensionless workspace routes receive the React document fallback. */
export function workspaceRoute(pathname) {
  if (
    pathname.includes('\0') ||
    pathname.includes('\\') ||
    pathname.split('/').some((segment) => segment === '.' || segment === '..')
  )
    return false;
  return (
    pathname === '/workspace/' ||
    (pathname.startsWith('/workspace/') && !pathname.split('/').at(-1).includes('.'))
  );
}

export function siteDocumentPath(pathname) {
  return workspaceRoute(pathname) ? '/workspace/index.html' : (publicRoutes.get(pathname) ?? null);
}

/** Crawling these URLs is safe, but their app/demo/machine content is not a search result. */
export function noindexPath(pathname) {
  return (
    /^\/(?:workspace|app|api)(?:\/|$)/i.test(pathname) ||
    ['/llms.txt', '/product-guide.txt', '/release.json', '/indexnow-key.txt'].includes(pathname) ||
    /^\/samples\/[^/]+\.pdf$/i.test(pathname)
  );
}
