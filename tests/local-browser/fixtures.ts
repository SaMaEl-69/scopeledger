import { test as base, expect } from '@playwright/test';
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
    const atMs = () => Math.round(performance.now() - started);
    // Observe native document events without pre-navigation Node Page subscriptions.
    await page.addInitScript((allowedOrigin: string | undefined) => {
      if (window !== window.top) return;
      const pathname = (value: string) => {
        try {
          const url = new URL(value, window.location.href);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return '[non-http-url]';
          if (url.origin !== allowedOrigin) return '[external-http-url]';
          return url.pathname.replace(/LOCAL-BROWSER-[a-f0-9]{48}/gi, '[redacted]');
        } catch {
          return '[invalid-url]';
        }
      };
      const errorName = (error: unknown) => {
        const knownNames = new Set([
          'Error',
          'TypeError',
          'ReferenceError',
          'SyntaxError',
          'RangeError',
          'URIError',
          'EvalError',
          'AggregateError',
          'AbortError',
          'NotAllowedError',
          'NetworkError',
          'TimeoutError',
          'NotFoundError',
          'SecurityError',
          'InvalidStateError',
          'DataError',
          'OperationError',
          'NotSupportedError',
          'QuotaExceededError',
          'InvalidAccessError',
          'UnknownError',
        ]);
        try {
          const name =
            error !== null && typeof error === 'object' && 'name' in error ? error.name : null;
          return typeof name === 'string' && knownNames.has(name) ? name : '[unknown-error-name]';
        } catch {
          return '[unknown-error-name]';
        }
      };
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
        resourceTimingBufferFullEvents: 0,
        timeOrigin: performance.timeOrigin,
      };
      const host = window as typeof window & {
        __margvantNativeNavigation?: typeof native;
      };
      host.__margvantNativeNavigation = native;
      const record = (
        event: string,
        navIndex: number | null = null,
        details: Record<string, unknown> = {},
      ) => {
        const buttons = [...document.querySelectorAll('.sidebar nav button.nav-item')];
        const activeIndex = buttons.findIndex(
          (button) => button.getAttribute('aria-current') === 'page',
        );
        const requestedView = new URL(window.location.href).searchParams.get('view');
        const sidebar = document.querySelector<HTMLElement>('.sidebar');
        const targetRect = navIndex === null ? null : buttons[navIndex]?.getBoundingClientRect();
        native.events.push({
          atMs: Math.round(performance.now()),
          event,
          pathname: pathname(window.location.href),
          navIndex,
          targetView: navIndex === null ? null : sidebarViews[navIndex],
          activeIndex: activeIndex < 0 || activeIndex >= sidebarViews.length ? null : activeIndex,
          activeView: sidebarViews[activeIndex] ?? null,
          urlView: requestedView !== null && views.includes(requestedView) ? requestedView : null,
          viewport: { width: innerWidth, height: innerHeight },
          sidebarScrollTop: sidebar?.scrollTop ?? null,
          targetRect: targetRect
            ? {
                x: targetRect.x,
                y: targetRect.y,
                width: targetRect.width,
                height: targetRect.height,
              }
            : null,
          readyState: document.readyState,
          ...details,
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
      window.addEventListener(
        'error',
        (event: Event) => {
          if (event instanceof ErrorEvent) {
            record('error', null, {
              errorName: errorName(event.error),
              filenamePathname: event.filename ? pathname(event.filename) : null,
            });
            return;
          }
          const target = event.target;
          const url =
            target instanceof HTMLScriptElement
              ? target.src
              : target instanceof HTMLImageElement
                ? target.currentSrc || target.src
                : target instanceof HTMLLinkElement
                  ? target.href
                  : null;
          record('resourceerror', null, {
            resourceElement: target instanceof Element ? target.tagName : null,
            resourcePathname: url ? pathname(url) : null,
          });
        },
        { capture: true, passive: true },
      );
      window.addEventListener(
        'unhandledrejection',
        (event) => record('unhandledrejection', null, { errorName: errorName(event.reason) }),
        { passive: true },
      );
      performance.addEventListener(
        'resourcetimingbufferfull',
        () => {
          native.resourceTimingBufferFullEvents += 1;
          record('resourcetimingbufferfull');
        },
        { passive: true },
      );
    }, origin);
    try {
      await use(page);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        const observation: Record<string, unknown> = {
          status: testInfo.status,
          expectedStatus: testInfo.expectedStatus,
          elapsedMs: atMs(),
          observer: 'native-browser-init-script',
          pendingRequests: {
            status: 'UNVERIFIED',
            reason: 'native-timing-entries-do-not-observe-request-lifecycle-or-pending-requests',
          },
          document: { status: 'UNVERIFIED', reason: 'not-captured' },
        };
        const outputPath = testInfo.outputPath('navigation-observation.json');
        try {
          // Save the failure artifact even if the real browser cannot provide a snapshot.
          await writeFile(outputPath, JSON.stringify(observation, null, 2));
          if (page.isClosed()) {
            observation.document = { status: 'UNVERIFIED', reason: 'page-closed' };
          } else {
            try {
              observation.document = await page.evaluate((allowedOrigin) => {
                const pathname = (value: string) => {
                  try {
                    const url = new URL(value, window.location.href);
                    if (url.protocol !== 'http:' && url.protocol !== 'https:')
                      return '[non-http-url]';
                    if (url.origin !== allowedOrigin) return '[external-http-url]';
                    return url.pathname.replace(/LOCAL-BROWSER-[a-f0-9]{48}/gi, '[redacted]');
                  } catch {
                    return '[invalid-url]';
                  }
                };
                const timing = (entry: PerformanceResourceTiming) => {
                  const status = (entry as PerformanceResourceTiming & { responseStatus?: number })
                    .responseStatus;
                  return {
                    pathname: pathname(entry.name),
                    entryType: entry.entryType,
                    initiatorType: entry.initiatorType,
                    startTime: entry.startTime,
                    duration: entry.duration,
                    fetchStart: entry.fetchStart,
                    requestStart: entry.requestStart,
                    responseStart: entry.responseStart,
                    responseEnd: entry.responseEnd,
                    redirectStart: entry.redirectStart,
                    redirectEnd: entry.redirectEnd,
                    domainLookupStart: entry.domainLookupStart,
                    domainLookupEnd: entry.domainLookupEnd,
                    connectStart: entry.connectStart,
                    connectEnd: entry.connectEnd,
                    secureConnectionStart: entry.secureConnectionStart,
                    transferSize: entry.transferSize,
                    encodedBodySize: entry.encodedBodySize,
                    decodedBodySize: entry.decodedBodySize,
                    responseStatus: typeof status === 'number' && status > 0 ? status : null,
                    responseStatusObservation:
                      typeof status === 'number' && status > 0 ? 'OBSERVED' : 'UNVERIFIED',
                  };
                };
                const navigation = (
                  performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
                ).map((entry) => ({
                  ...timing(entry),
                  type: entry.type,
                  redirectCount: entry.redirectCount,
                  domInteractive: entry.domInteractive,
                  domContentLoadedEventStart: entry.domContentLoadedEventStart,
                  domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
                  domComplete: entry.domComplete,
                  loadEventStart: entry.loadEventStart,
                  loadEventEnd: entry.loadEventEnd,
                  unloadEventStart: entry.unloadEventStart,
                  unloadEventEnd: entry.unloadEventEnd,
                }));
                return {
                  readyState: document.readyState,
                  fontsStatus: document.fonts.status,
                  iframeCount: document.querySelectorAll('iframe').length,
                  performanceTiming: {
                    timeOrigin: performance.timeOrigin,
                    snapshotAtMs: performance.now(),
                    scope: 'current-top-document',
                    resourceBufferMayBePartial: true,
                    limitations:
                      'Browser-managed timing entries may omit failed, pending, evicted or earlier-document requests; zero timings do not prove completion.',
                    navigation,
                    resources: (
                      performance.getEntriesByType('resource') as PerformanceResourceTiming[]
                    ).map(timing),
                  },
                  nativeNavigation: (
                    window as typeof window & {
                      __margvantNativeNavigation?: {
                        events: Record<string, unknown>[];
                        droppedEvents: number;
                        resourceTimingBufferFullEvents: number;
                        timeOrigin: number;
                      };
                    }
                  ).__margvantNativeNavigation ?? {
                    status: 'UNVERIFIED',
                    reason: 'native-observer-unavailable',
                  },
                };
              }, origin);
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
