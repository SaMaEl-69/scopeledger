import { test as base, expect, type Request } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration, LicenseService } from '../../server/licensing.mjs';
import { createBackend } from '../../server/backend.mjs';
import { createScopeLedgerServer } from '../../scripts/serve.mjs';

type LocalApp = { origin: string; keys: { individual: string; agency: string } };

// Each engine gets a real, isolated development backend. Sharing the owner's
// server would consume its persisted IP quota and make repeated runs unreliable.
export const test = base.extend<{}, { localApp: LocalApp }>({
  page: async ({ page, baseURL }, use, testInfo) => {
    const started = performance.now();
    const origin = baseURL ? new URL(baseURL).origin : undefined;
    const events: Record<string, unknown>[] = [];
    const pending = new Map<Request, Record<string, unknown>>();
    const requestIds = new WeakMap<Request, number>();
    let nextRequestId = 1;
    let droppedEvents = 0;
    const atMs = () => Math.round(performance.now() - started);
    const pathname = (value: string) => {
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '[non-http-url]';
        if (url.origin !== origin) return '[external-http-url]';
        return url.pathname.replace(/LOCAL-BROWSER-[a-f0-9]{48}/gi, '[redacted]');
      } catch {
        return '[invalid-url]';
      }
    };
    const workspaceView = (value: string) => {
      try {
        const url = new URL(value);
        if (url.origin !== origin) return null;
        const view = url.searchParams.get('view');
        return view !== null &&
          [
            'dashboard',
            'projects',
            'workspace',
            'documents',
            'calendar',
            'clients',
            'playbook',
            'settings',
            'support',
          ].includes(view)
          ? view
          : null;
      } catch {
        return null;
      }
    };
    const record = (event: Record<string, unknown>) => {
      events.push({ atMs: atMs(), ...event });
      if (events.length > 500) {
        events.shift();
        droppedEvents += 1;
      }
    };
    const requestDetails = (request: Request) => ({
      id: requestIds.get(request),
      pathname: pathname(request.url()),
      resourceType: request.resourceType(),
      method: request.method(),
      navigationRequest: request.isNavigationRequest(),
    });
    const onRequest = (request: Request) => {
      requestIds.set(request, nextRequestId++);
      const details = { ...requestDetails(request), startedAtMs: atMs() };
      pending.set(request, details);
      record({ event: 'request', ...details });
    };
    const onResponse = (response: import('@playwright/test').Response) => {
      const request = response.request();
      const details = pending.get(request);
      if (details) details.status = response.status();
      record({ event: 'response', ...requestDetails(request), status: response.status() });
    };
    const onRequestFinished = (request: Request) => {
      record({ event: 'requestfinished', ...requestDetails(request) });
      pending.delete(request);
    };
    const onRequestFailed = (request: Request) => {
      record({ event: 'requestfailed', ...requestDetails(request) });
      pending.delete(request);
    };
    const onDOMContentLoaded = () => record({ event: 'domcontentloaded' });
    const onLoad = () => record({ event: 'load' });
    const onPageError = () => record({ event: 'pageerror' });
    const onCrash = () => record({ event: 'crash' });
    const onFrameNavigated = (frame: import('@playwright/test').Frame) =>
      record({
        event: 'framenavigated',
        frame: frame === page.mainFrame() ? 'main' : 'child',
        pathname: pathname(frame.url()),
        ...(frame === page.mainFrame() ? { urlView: workspaceView(frame.url()) } : {}),
      });
    const onFrameAttached = () => record({ event: 'frameattached' });
    const onFrameDetached = () => record({ event: 'framedetached' });
    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('requestfinished', onRequestFinished);
    page.on('requestfailed', onRequestFailed);
    page.on('domcontentloaded', onDOMContentLoaded);
    page.on('load', onLoad);
    page.on('pageerror', onPageError);
    page.on('crash', onCrash);
    page.on('framenavigated', onFrameNavigated);
    page.on('frameattached', onFrameAttached);
    page.on('framedetached', onFrameDetached);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const sidebarViews = [
        'dashboard',
        'projects',
        'workspace',
        'documents',
        'calendar',
        'clients',
        'playbook',
      ];
      const views = [...sidebarViews, 'settings', 'support'];
      const native = {
        events: [] as Record<string, unknown>[],
        droppedEvents: 0,
      };
      const host = window as typeof window & {
        __margvantNativeNavigation?: typeof native;
      };
      host.__margvantNativeNavigation = native;
      const record = (event: string, navIndex: number | null = null) => {
        const buttons = [...document.querySelectorAll('.sidebar nav button.nav-item')];
        const activeIndex = buttons.findIndex(
          (button) => button.getAttribute('aria-current') === 'page',
        );
        const requestedView = new URL(window.location.href).searchParams.get('view');
        native.events.push({
          atMs: Math.round(performance.now()),
          event,
          navIndex,
          targetView: navIndex === null ? null : sidebarViews[navIndex],
          activeIndex: activeIndex < 0 || activeIndex >= sidebarViews.length ? null : activeIndex,
          activeView: sidebarViews[activeIndex] ?? null,
          urlView: requestedView !== null && views.includes(requestedView) ? requestedView : null,
          viewport: { width: innerWidth, height: innerHeight },
          readyState: document.readyState,
        });
        if (native.events.length > 200) {
          native.events.shift();
          native.droppedEvents += 1;
        }
      };
      const interaction = (event: Event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest('.sidebar nav button.nav-item')
            : null;
        if (!button) return;
        const index = [...document.querySelectorAll('.sidebar nav button.nav-item')].indexOf(
          button,
        );
        if (index >= 0 && index < sidebarViews.length) record(event.type, index);
      };
      for (const event of ['pointerdown', 'pointerup', 'click', 'focus'])
        document.addEventListener(event, interaction, { capture: true, passive: true });
      document.addEventListener('readystatechange', () => record('readystatechange'), {
        capture: true,
        passive: true,
      });
      document.addEventListener('DOMContentLoaded', () => record('DOMContentLoaded'), {
        capture: true,
        passive: true,
      });
      window.addEventListener('popstate', () => record('popstate'), {
        capture: true,
        passive: true,
      });
      window.addEventListener(
        'load',
        (event) => {
          if (event.target === document) record('load');
        },
        { capture: true, passive: true },
      );
    });
    try {
      await use(page);
    } finally {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfinished', onRequestFinished);
      page.off('requestfailed', onRequestFailed);
      page.off('domcontentloaded', onDOMContentLoaded);
      page.off('load', onLoad);
      page.off('pageerror', onPageError);
      page.off('crash', onCrash);
      page.off('framenavigated', onFrameNavigated);
      page.off('frameattached', onFrameAttached);
      page.off('framedetached', onFrameDetached);
      if (testInfo.status !== testInfo.expectedStatus) {
        const observation: Record<string, unknown> = {
          status: testInfo.status,
          expectedStatus: testInfo.expectedStatus,
          elapsedMs: atMs(),
          droppedEvents,
          events,
          pendingRequests: [...pending.values()],
          document: { status: 'UNVERIFIED', reason: 'not-captured' },
        };
        const outputPath = testInfo.outputPath('navigation-observation.json');
        try {
          // Save network evidence first, even if inspecting a failed browser is unavailable.
          await writeFile(outputPath, JSON.stringify(observation, null, 2));
          if (page.isClosed()) {
            observation.document = { status: 'UNVERIFIED', reason: 'page-closed' };
          } else {
            try {
              observation.document = await page.evaluate(() => ({
                readyState: document.readyState,
                fontsStatus: document.fonts.status,
                iframeCount: document.querySelectorAll('iframe').length,
                nativeNavigation: (
                  window as typeof window & {
                    __margvantNativeNavigation?: {
                      events: Record<string, unknown>[];
                      droppedEvents: number;
                    };
                  }
                ).__margvantNativeNavigation ?? {
                  status: 'UNVERIFIED',
                  reason: 'native-observer-unavailable',
                },
              }));
            } catch {
              observation.document = { status: 'UNVERIFIED', reason: 'inspection-unavailable' };
            }
          }
          await writeFile(outputPath, JSON.stringify(observation, null, 2));
          await testInfo.attach('navigation-observation', {
            path: outputPath,
            contentType: 'application/json',
          });
        } catch {
          console.warn('Navigation observation unavailable (UNVERIFIED).');
        }
      }
    }
  },
  localApp: [
    async ({}, use) => {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Generated-key browser tests cannot run in production.');
      const directory = await mkdtemp(join(tmpdir(), 'scopeledger-browser-qa-'));
      const config = configuration({
        NODE_ENV: 'development',
        SCOPELEDGER_MODE: 'local-test',
        SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5180',
        SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
        SCOPELEDGER_DB_PATH: join(directory, 'licenses.sqlite'),
      });
      const service = new LicenseService(config);
      const keys = {
        individual: `LOCAL-BROWSER-${randomBytes(24).toString('hex')}`,
        agency: `LOCAL-BROWSER-${randomBytes(24).toString('hex')}`,
      };
      service.seedLocalKey(keys.individual, 'individual');
      service.seedLocalKey(keys.agency, 'agency');
      const server = createScopeLedgerServer({ backend: createBackend({ config, service }) });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Local test server unavailable.');
        config.origin = `http://127.0.0.1:${address.port}`;
        await use({ origin: config.origin, keys });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(directory, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ localApp }, use) => use(localApp.origin),
});

export { expect };
