/** Only release assets are public, even if a private file is accidentally copied into dist. */
export const publicAssetPath = (name) =>
  [
    'index.html',
    'home/index.html',
    'workspace/index.html',
    'robots.txt',
    'llms.txt',
    'product-guide.txt',
    'sitemap.xml',
    'release.json',
    'brand/FONT-LICENSE.txt',
    'shared/brand.css',
  ].includes(name) ||
  /^assets\/[\w.-]+\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/.test(name) ||
  /^brand\/[\w.-]+\.(?:svg|png|webp|ico)$/.test(name) ||
  /^samples\/[\w.-]+\.(?:pdf|png)$/.test(name);

/** This brand card is intended for embedding by social sites; workspace assets are not. */
export const shareableAssetPath = (name) => name === 'brand/scopeledger-social-v1.png';
