import { chromium } from 'playwright-core';
import { access } from 'node:fs/promises';
import { documentHtml, validateClientDocument } from '../shared/client-document.mjs';
import { ServiceError } from './licensing.mjs';
export async function chromePath(explicit = process.env.SCOPELEDGER_CHROME_PATH) {
  for (const path of [
    explicit,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean))
    try {
      await access(path);
      return path;
    } catch {}
  throw new ServiceError(
    'renderer_unavailable',
    'Install a supported Chrome/Chromium runtime or configure SCOPELEDGER_CHROME_PATH.',
    503,
  );
}
/** Launch with the same sandbox requirement as exports, without customer content or secrets. */
export async function rendererReady() {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: await chromePath(),
      headless: true,
      chromiumSandbox: true,
      timeout: 10000,
      env: Object.fromEntries(
        [
          'PATH',
          'HOME',
          'TMPDIR',
          'TMP',
          'TEMP',
          'LANG',
          'LC_ALL',
          'XDG_RUNTIME_DIR',
          'FONTCONFIG_PATH',
        ]
          .filter((key) => typeof process.env[key] === 'string')
          .map((key) => [key, process.env[key]]),
      ),
    });
    return true;
  } finally {
    await browser?.close().catch(() => {});
  }
}
export async function renderPdf(snapshot, { executablePath, timeoutMs = 45000 } = {}) {
  const doc = validateClientDocument(snapshot);
  let browser,
    context,
    timer,
    cancelled = false;
  const cancelledError = () =>
    new ServiceError(
      'renderer_timeout',
      'PDF export timed out. Your document is preserved; reduce content and retry.',
      504,
    );
  const work = (async () => {
    const runtime = await chromePath(executablePath);
    if (cancelled) throw cancelledError();
    browser = await chromium.launch({
      executablePath: runtime,
      headless: true,
      chromiumSandbox: true,
      // Rendering never needs licensing/encryption secrets or provider tokens.
      env: Object.fromEntries(
        [
          'PATH',
          'HOME',
          'TMPDIR',
          'TMP',
          'TEMP',
          'SystemRoot',
          'SYSTEMROOT',
          'USERPROFILE',
          'LOCALAPPDATA',
          'LANG',
          'LC_ALL',
          'DISPLAY',
          'WAYLAND_DISPLAY',
          'XDG_RUNTIME_DIR',
          'XDG_CACHE_HOME',
          'FONTCONFIG_PATH',
        ]
          .filter((key) => typeof process.env[key] === 'string')
          .map((key) => [key, process.env[key]]),
      ),
      timeout: Math.min(timeoutMs, 15000),
      args: ['--disable-background-networking', '--disable-extensions'],
    });
    if (cancelled) {
      await browser.close().catch(() => {});
      throw cancelledError();
    }
    context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    if (cancelled) {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      throw cancelledError();
    }
    await context.route('**/*', (route) =>
      route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient'),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(timeoutMs, 15000));
    await page.setContent(documentHtml(doc), { waitUntil: 'load' });
    const broken = await page.locator('img').evaluateAll((images) => {
      const broken = images.find(
        (image) =>
          !image.complete ||
          image.naturalWidth === 0 ||
          image.naturalHeight === 0 ||
          image.naturalWidth > 4096 ||
          image.naturalHeight > 4096 ||
          image.naturalWidth * image.naturalHeight > 16777216,
      );
      return broken ? (broken.dataset?.signature ? 'signature' : 'logo') : null;
    });
    if (broken)
      throw new ServiceError(
        broken === 'signature' ? 'signature_decode_failed' : 'logo_decode_failed',
        `The ${broken === 'signature' ? 'signature' : 'logo'} could not be decoded within the supported dimensions. Replace it with a valid bounded PNG or JPEG.`,
        422,
      );
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font:9px Arial;color:#656b70;width:100%;margin:0 18mm;padding-top:7px;border-top:1px solid #d9dddf;display:flex;justify-content:space-between;align-items:center;gap:16px"><span style="min-width:0;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${doc.reference.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}</span><span style="white-space:nowrap;flex:none"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    if (pdf.length > 20000000)
      throw new ServiceError(
        'pdf_too_large',
        'This PDF exceeds the supported 20 MB output size. Reduce content or logo size.',
        422,
      );
    return pdf;
  })();
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          cancelled = true;
          reject(cancelledError());
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      'renderer_failed',
      'PDF generation failed. The preserved document can be retried; check the renderer runtime and logo.',
      503,
    );
  } finally {
    cancelled = true;
    clearTimeout(timer);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    void work.catch(() => {});
  }
}
