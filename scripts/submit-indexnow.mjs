import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { publicDocuments } from '../shared/public-assets.mjs';
const origin = 'https://scopeledger.site';
const key = (await readFile('public/indexnow-key.txt', 'utf8')).trim();
assert.match(key, /^[a-f0-9]{32}$/);
const keyLocation = origin + '/indexnow-key.txt';
const proof = await fetch(keyLocation);
assert.equal(proof.status, 200, 'Publish the IndexNow key before submitting');
assert.equal((await proof.text()).trim(), key, 'Live IndexNow key differs from source');
const urlList = publicDocuments.map((path) => origin + '/' + path.replace(/index\.html$/, ''));
// Explicit manual invocation only: notify participating engines about published public URLs.
// This is not Google indexing, and acceptance does not guarantee indexing or rankings.
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'scopeledger.site', key, keyLocation, urlList }),
});
const result = {
  submittedAt: new Date().toISOString(),
  status: response.status,
  response: await response.text(),
  urlList,
};
await mkdir('output/seo', { recursive: true });
await writeFile('output/seo/indexnow-submission.json', JSON.stringify(result, null, 2));
assert([200, 202].includes(response.status), `IndexNow returned ${response.status}`);
console.log(
  `IndexNow received ${urlList.length} public URLs (HTTP ${response.status}); this is a crawl notification, not an indexing guarantee.`,
);
