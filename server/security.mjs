import { createHash } from 'node:crypto';

/** Hash only executable inline scripts. Inline CSS is required by previews and layout values. */
export function contentPolicy(html = '') {
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attributes, body]) => !/\bsrc\s*=/i.test(attributes) && body.trim())
    .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  return [
    "default-src 'self'",
    `script-src 'self' ${[...new Set(hashes)].join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}
