/** Keep the public site and legacy workspace entry points at one origin. */
export function siteRedirect(pathname, url = '/') {
  const queryAt = url.indexOf('?'),
    query = queryAt === -1 ? '' : url.slice(queryAt);
  if (pathname === '/' || pathname === '/index.html') return '/home/' + query;
  if (pathname === '/home' || pathname === '/home/index.html') return '/home/' + query;
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
  return workspaceRoute(pathname)
    ? '/workspace/index.html'
    : pathname === '/home/'
      ? '/home/index.html'
      : null;
}
