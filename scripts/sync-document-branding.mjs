import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../public/brand/scopeledger-logo-light.svg', import.meta.url),
  'utf8',
);
const generated = `// Generated from public/brand/scopeledger-logo-light.svg for offline document rendering.
const logoSvg = ${JSON.stringify(source)};
export const scopeLedgerDocumentLogo = \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(logoSvg)}\`;
`;
const target = new URL('../shared/document-branding.mjs', import.meta.url);
const previous = await readFile(target, 'utf8').catch(() => '');
if (previous !== generated) await writeFile(target, generated);
