/** Published documents are explicit; accidental HTML uploads stay private. */
export const publicDocuments = Object.freeze([
  'home/index.html',
  'guides/index.html',
  'guides/handle-scope-creep/index.html',
  'guides/change-order-template/index.html',
  'guides/price-additional-work/index.html',
  'guides/project-baseline-checklist/index.html',
  'about/index.html',
  'privacy/index.html',
  'license/index.html',
]);

/** Original platform cards supplied for manual sharing and public previews. */
export const publicSocialImages = Object.freeze([
  'brand/margvant-facebook-1200x630.png',
  'brand/margvant-x-1200x600.png',
  'brand/margvant-linkedin-1200x627.png',
  'brand/margvant-discord-1200x630.png',
  'brand/margvant-whatsapp-1200x630.jpg',
]);

/** Only release assets are public, even if a private file is accidentally copied into dist. */
export const publicAssetPath = (name) =>
  publicDocuments.includes(name) ||
  publicSocialImages.includes(name) ||
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
    'guides/guides.css',
    'guides/guides.js',
    'guides/fonts/dm-sans-LICENSE.txt',
    'guides/fonts/space-grotesk-LICENSE.txt',
    'indexnow-key.txt',
  ].includes(name) ||
  /^guides\/fonts\/[\w.-]+\.woff2$/.test(name) ||
  /^assets\/[\w.-]+\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/.test(name) ||
  /^brand\/[\w.-]+\.(?:svg|png|webp|ico)$/.test(name) ||
  /^samples\/[\w.-]+\.(?:pdf|png)$/.test(name);

/** Only explicitly published cards may be embedded by external social sites. */
export const shareableAssetPath = (name) =>
  name === 'brand/scopeledger-social-v1.png' || publicSocialImages.includes(name);
