import { randomBytes, createHash } from 'node:crypto';
import { LicenseService, configuration, ServiceError, loopback } from './licensing.mjs';
import { renderPdf } from './pdf.mjs';
import { validateClientDocument } from '../shared/client-document.mjs';
import { activationAddress } from './client-address.mjs';
import { siteRedirect } from './site-routes.mjs';
export const SESSION_COOKIE = 'scopeledger_session',
  DEVICE_COOKIE = 'scopeledger_device';
const cookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length === 2),
  );
const send = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
};
async function json(req) {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json'))
    throw new ServiceError('invalid_input', 'Send a JSON request.', 415);
  const body = await new Promise((resolve, reject) => {
    let bytes = 0,
      parts = [],
      oversized = false;
    const timer = setTimeout(() => {
      reject(
        new ServiceError(
          'request_timeout',
          'Request upload timed out. Retry with a smaller document.',
          408,
        ),
      );
      req.resume();
    }, 15000);
    req.on('data', (part) => {
      bytes += part.length;
      if (bytes > 2600000) {
        oversized = true;
        parts = [];
      } else if (!oversized) parts.push(part);
    });
    req.once('end', () => {
      clearTimeout(timer);
      if (oversized)
        reject(new ServiceError('request_too_large', 'Document request exceeds 2.6 MB.', 413));
      else resolve(Buffer.concat(parts).toString('utf8'));
    });
    req.once('error', () => {
      clearTimeout(timer);
      reject(new ServiceError('invalid_input', 'Request upload could not be read.'));
    });
    req.once('aborted', () => {
      clearTimeout(timer);
      reject(new ServiceError('invalid_input', 'Request upload was interrupted.'));
    });
  });
  try {
    return JSON.parse(body);
  } catch {
    throw new ServiceError('invalid_json', 'Request body is not valid JSON.');
  }
}
function fields(body, allowed) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !Object.hasOwn(body, key))
  )
    throw new ServiceError('invalid_input', 'The request contains missing or unsupported fields.');
}
export function createBackend({
  config = configuration(),
  service,
  renderer = renderPdf,
  onEvent,
} = {}) {
  let initializationError;
  if (service === undefined) {
    try {
      service = config.configured ? new LicenseService(config) : null;
    } catch {
      initializationError = 'license_storage_failed';
      config = {
        ...config,
        configured: false,
        checkout: { individual: null, agency: null },
        message:
          'The license database could not be opened. Projects remain available; protected actions require server storage recovery.',
      };
      service = null;
    }
  }
  const flights = new Map();
  const maintenance = setInterval(() => {
    try {
      service?.pruneExpired();
    } catch {
      if (config.logEvents)
        console.error(
          JSON.stringify({
            at: new Date().toISOString(),
            operation: 'maintenance',
            code: 'license_storage_failed',
          }),
        );
    }
  }, 3600000);
  maintenance.unref();
  let activeJobs = 0;
  const cookieName = (name) => (config.secure ? `__Host-${name}` : name);
  const cookie = (name, value, age) =>
    `${cookieName(name)}=${value}; Path=${config.secure ? '/' : '/api'}; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
  const status = (identity) => ({
    configured: config.configured,
    mode: config.mode,
    active: !!identity,
    plan: identity?.plan ?? null,
    deviceLabel: identity?.deviceLabel ?? null,
    slotsUsed: identity ? service.slots(identity) : 0,
    slotsLimit: identity ? (identity.plan === 'individual' ? 1 : 5) : 0,
    checkout: config.checkout,
    message: config.message,
    ...(initializationError ? { error: initializationError } : {}),
  });
  const middleware = (req, res, next) => {
    let path;
    try {
      path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      send(res, 400, { error: 'invalid_path' });
      return;
    }
    if (!/^\/api(?:\/|$)/i.test(path)) {
      const location = siteRedirect(path, req.url);
      if (location && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
        res.end();
      } else next();
      return;
    }
    const operation = [
      '/api/license/status',
      '/api/license/activate',
      '/api/license/release',
      '/api/projects/authorize',
      '/api/pdf',
    ].includes(path)
      ? path
      : 'unknown';
    const began = performance.now();
    let outcome = 'ok';
    const report = (event) => {
      try {
        if (onEvent) onEvent(event);
        else if (config.logEvents) console.info(JSON.stringify(event));
      } catch {
        /* Monitoring must never change authorization. */
      }
    };
    res.once?.('finish', () => {
      if (
        res.statusCode >= 400 ||
        operation === '/api/pdf' ||
        (outcome !== 'ok' && !['activation_required', 'licensing_not_configured'].includes(outcome))
      )
        report({
          at: new Date().toISOString(),
          operation,
          status: res.statusCode,
          code: outcome,
          durationMs: Math.round(performance.now() - began),
        });
    });
    // Cross-site navigations may omit Origin and omit Strict cookies. Never let
    // such a GET replace the device identity and strand its existing slot.
    if (req.headers?.['sec-fetch-site'] === 'cross-site') {
      outcome = 'origin_rejected';
      send(res, 403, {
        error: outcome,
        message: 'Open the application directly before using protected services.',
      });
      return;
    }
    if (!config.configured) {
      outcome = initializationError ?? 'licensing_not_configured';
      if (path === '/api/license/status' && req.method === 'GET') send(res, 200, status(null));
      else
        send(res, 503, {
          error: initializationError ?? 'licensing_not_configured',
          message: config.message,
          licensingConfigured: false,
        });
      return;
    }
    void (async () => {
      if (
        config.mode === 'local-test' &&
        (!loopback(req.socket?.remoteAddress ?? '') ||
          !loopback((req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')))
      )
        throw new ServiceError(
          'test_mode_loopback_only',
          'Local testing is available only on loopback.',
          403,
        );
      if (req.headers.origin && req.headers.origin !== config.origin)
        throw new ServiceError('origin_rejected', 'This request origin is not allowed.', 403);
      if (req.method !== 'GET' && req.headers.origin !== config.origin)
        throw new ServiceError(
          'origin_required',
          'Protected mutations require the configured same-origin browser.',
          403,
        );
      const jar = cookies(req),
        device = service.deviceToken(jar[cookieName(DEVICE_COOKIE)]);
      const authorize = () =>
        service.authorized(jar[cookieName(SESSION_COOKIE)], jar[cookieName(DEVICE_COOKIE)]);
      if (path === '/api/license/status' && req.method === 'GET') {
        if (!jar[cookieName(DEVICE_COOKIE)] || device.token !== jar[cookieName(DEVICE_COOKIE)])
          res.setHeader('Set-Cookie', cookie(DEVICE_COOKIE, device.token, 31536000));
        try {
          send(res, 200, status(await authorize()));
        } catch (error) {
          outcome = error.code ?? 'server_error';
          send(res, error.status === 401 ? 200 : error.status, {
            ...status(null),
            error: error.code,
            message: error.message,
          });
        }
        return;
      }
      if (req.method !== 'POST')
        throw new ServiceError('method_not_allowed', 'Use the documented request method.', 405);
      if (path === '/api/license/activate') {
        service.quota(
          service.hash(`ip:${activationAddress(req, config)}`),
          'activate',
          20,
          3600000,
        );
        const body = await json(req);
        fields(body, ['key', 'plan', 'deviceLabel']);
        const activated = await service.activate(body.key, body.plan, body.deviceLabel, device);
        res.setHeader('Set-Cookie', [
          cookie(DEVICE_COOKIE, device.token, 31536000),
          cookie(SESSION_COOKIE, activated.token, 1209600),
        ]);
        send(res, 200, status(await service.authorized(activated.token, device.token)));
        return;
      }
      if (path === '/api/license/release') {
        const body = await json(req);
        fields(body, []);
        const identity = await service.authorized(
          jar[cookieName(SESSION_COOKIE)],
          jar[cookieName(DEVICE_COOKIE)],
          {
            releaseOnly: true,
          },
        );
        service.release(identity);
        res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
        send(res, 200, {
          ...status(null),
          message:
            'This browser/device was released. Other activations and local projects are unchanged.',
        });
        return;
      }
      const identity = await authorize();
      if (path === '/api/projects/authorize') {
        const body = await json(req);
        fields(body, []);
        service.quota(`${identity.licenseId}:${identity.deviceId}`, 'projects', 1000);
        send(res, 200, {
          grant: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 30000).toISOString(),
        });
        return;
      }
      if (path === '/api/pdf') {
        let snapshot;
        try {
          snapshot = validateClientDocument(await json(req));
        } catch (error) {
          if (error instanceof ServiceError) throw error;
          throw new ServiceError('document_invalid', error.message, 422);
        }
        if (snapshot.demo)
          throw new ServiceError(
            'document_demo_state',
            'Use an activated export snapshot; demo previews remain watermarked.',
            422,
          );
        const subject = `${identity.licenseId}:${identity.deviceId}`,
          digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
        const existing = flights.get(subject);
        if (existing && existing.digest !== digest)
          throw new ServiceError(
            'export_in_progress',
            'An export is already running for this device. Wait before exporting another document.',
            409,
          );
        let job = existing?.promise;
        if (!job) {
          if (activeJobs >= 2)
            throw new ServiceError(
              'renderer_busy',
              'The PDF renderer is busy. Retry shortly.',
              429,
            );
          // A device rejection must not consume the shared Agency allowance.
          service.quotaBatch([
            { subject: identity.licenseId, operation: 'pdf-license', limit: 500 },
            { subject, operation: 'pdf-device', limit: 100 },
          ]);
          activeJobs++;
          job = Promise.resolve()
            .then(() => renderer(snapshot))
            .finally(() => {
              activeJobs--;
              flights.delete(subject);
            });
          flights.set(subject, { digest, promise: job });
        }
        const pdf = await job;
        // Authorization is checked again if the activation was released during render.
        await authorize();
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="scopeledger-${snapshot.kind}.pdf"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(pdf);
        return;
      }
      throw new ServiceError('not_found', 'This API action does not exist.', 404);
    })().catch((error) => {
      outcome = error instanceof ServiceError ? error.code : 'server_error';
      if (!res.headersSent)
        send(res, error instanceof ServiceError ? error.status : 500, {
          error: error instanceof ServiceError ? error.code : 'server_error',
          message:
            error instanceof ServiceError
              ? error.message
              : 'The server could not complete this action. Retry or contact support.',
        });
      else res.end();
    });
  };
  return {
    middleware,
    service,
    config,
    close: () => {
      clearInterval(maintenance);
      service?.close();
    },
  };
}
