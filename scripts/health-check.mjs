import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export async function healthCheck(origin, { allowLocal = false, fetcher = fetch } = {}) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== 'https:' &&
      !(
        allowLocal &&
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
        url.protocol === 'http:'
      ))
  )
    throw new Error('Use the canonical HTTPS origin.');
  const response = await fetcher(`${origin}/api/ready`, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const result = await response.json();
  if (
    !response.ok ||
    result.status !== 'ready' ||
    !result.checks?.configured ||
    !result.checks?.storage ||
    !result.checks?.renderer
  )
    throw new Error('Readiness failed.');
  if (!result.release) throw new Error('The deployment has no release identity.');
  return { status: 'ready', release: result.release, purchasesEnabled: !!result.purchasesEnabled };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await healthCheck(process.argv[2])));
  } catch {
    console.error(JSON.stringify({ status: 'not_ready', at: new Date().toISOString() }));
    process.exitCode = 1;
  }
}
