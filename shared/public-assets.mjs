/** Only release assets are public, even if a private file is accidentally copied into dist. */
export const publicAssetPath = (name) =>
  [
    'index.html',
    'home/index.html',
    'workspace/index.html',
    'robots.txt',
    'sitemap.xml',
    'release.json',
    'brand/FONT-LICENSE.txt',
    'shared/brand.css',
  ].includes(name) ||
  /^assets\/[\w.-]+\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/.test(name) ||
  /^brand\/[\w.-]+\.(?:svg|png|webp|ico)$/.test(name) ||
  /^samples\/[\w.-]+\.(?:pdf|png)$/.test(name);
