import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { chromium } from 'playwright-core';
import { renderPdf } from '../server/pdf.mjs';
import { fixture, logo } from './server/fixtures.mjs';
vi.mock('playwright-core', () => ({ chromium: { launch: vi.fn() } }));
beforeEach(() => {
  vi.mocked(chromium.launch).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
describe('renderer cancellation and isolation', () => {
  it('closes a browser whose launch finishes after the request timeout', async () => {
    let resolveLaunch!: (value: any) => void;
    const browser = { close: vi.fn(async () => {}), newContext: vi.fn() };
    vi.mocked(chromium.launch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLaunch = resolve;
        }) as any,
    );
    await expect(
      renderPdf(fixture(), { executablePath: process.execPath, timeoutMs: 25 }),
    ).rejects.toMatchObject({ code: 'renderer_timeout' });
    resolveLaunch(browser);
    await settle();
    await settle();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(browser.newContext).not.toHaveBeenCalled();
  });
  it('closes a context whose creation finishes after cancellation', async () => {
    let resolveContext!: (value: any) => void;
    const context = { close: vi.fn(async () => {}) };
    const browser = {
      close: vi.fn(async () => {}),
      newContext: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveContext = resolve;
          }),
      ),
    };
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    await expect(
      renderPdf(fixture(), { executablePath: process.execPath, timeoutMs: 25 }),
    ).rejects.toMatchObject({ code: 'renderer_timeout' });
    resolveContext(context);
    await settle();
    await settle();
    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalled();
  });
  it('enables the browser sandbox, disables script execution and blocks remote resources', async () => {
    vi.stubEnv('SCOPELEDGER_SESSION_SECRET', 'PRIVATE ENCRYPTION SECRET');
    vi.stubEnv('GUMROAD_API_TOKEN', 'PRIVATE PROVIDER TOKEN');
    let routeHandler: any;
    const page = {
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn(async () => {}),
      locator: vi.fn(() => ({ evaluateAll: vi.fn(async () => false) })),
      pdf: vi.fn(async () => Buffer.from('%PDF-1.7')),
    };
    const context = {
      route: vi.fn(async (_pattern: any, handler: any) => {
        routeHandler = handler;
      }),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => {}),
    };
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => {}) };
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    await renderPdf(fixture(), { executablePath: process.execPath });
    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ chromiumSandbox: true }),
    );
    const launched = vi.mocked(chromium.launch).mock.calls[0][0];
    expect(JSON.stringify(launched?.env)).not.toContain('PRIVATE');
    expect(launched?.env).not.toHaveProperty('SCOPELEDGER_SESSION_SECRET');
    expect(browser.newContext).toHaveBeenCalledWith({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
    });
    const remote = {
      request: () => ({ url: () => 'https://private.example/secret' }),
      abort: vi.fn(),
      continue: vi.fn(),
    };
    routeHandler(remote);
    expect(remote.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(remote.continue).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });
  it('checks decoded logo dimensions rather than trusting only the image header', async () => {
    const page = {
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn(async () => {}),
      locator: vi.fn(() => ({
        evaluateAll: vi.fn(async (callback: any) =>
          callback([{ complete: true, naturalWidth: 5000, naturalHeight: 1 }]),
        ),
      })),
      pdf: vi.fn(),
    };
    const context = {
      route: vi.fn(async () => {}),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => {}),
    };
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => {}) };
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    const doc = fixture();
    doc.agency.logoDataUrl = logo;
    await expect(renderPdf(doc, { executablePath: process.execPath })).rejects.toMatchObject({
      code: 'logo_decode_failed',
    });
    expect(page.pdf).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });
  it('refuses an undecodable signature with a recoverable signature-specific error', async () => {
    const page = {
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn(async () => {}),
      locator: vi.fn(() => ({
        evaluateAll: vi.fn(async (callback: any) =>
          callback([
            { complete: true, naturalWidth: 0, naturalHeight: 0, dataset: { signature: 'issuer' } },
          ]),
        ),
      })),
      pdf: vi.fn(),
    };
    const context = {
      route: vi.fn(async () => {}),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => {}),
    };
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => {}) };
    vi.mocked(chromium.launch).mockResolvedValue(browser as any);
    const signatures = {
      enabled: true,
      showClient: false,
      issuer: { name: 'Studio', role: '', date: '', imageDataUrl: logo },
      client: { name: '', role: '', date: '', imageDataUrl: '' },
    };
    await expect(
      renderPdf(fixture({ signatures }), { executablePath: process.execPath }),
    ).rejects.toMatchObject({ code: 'signature_decode_failed', status: 422 });
    expect(page.pdf).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });
});
