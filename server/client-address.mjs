import { isIP } from 'node:net';
import { ServiceError } from './licensing.mjs';

function canonicalIp(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  // Ports, brackets, chains, zone identifiers and legacy IPv4 spellings are not
  // a single transport IP. isIP rejects all but standard address syntax.
  if (!address || address.includes('%')) return null;
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16),
    low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** Only an explicitly trusted local reverse proxy can supply client identity. */
export function activationAddress(request, config) {
  const peer = canonicalIp(request.socket?.remoteAddress);
  if (!peer)
    throw new ServiceError(
      'client_address_unavailable',
      'The server could not identify this connection. Retry or contact support.',
      503,
    );
  const localPeer = peer === '::1' || peer.startsWith('127.');
  if (config.mode !== 'live' || config.trustLoopbackProxy !== true || !localPeer) return peer;
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded === undefined || (typeof forwarded === 'string' && !forwarded.trim()))
    throw new ServiceError(
      'proxy_client_ip_required',
      'Trusted proxy client identity is missing. The operator must overwrite X-Forwarded-For with exactly one client IP address.',
      503,
    );
  const client = canonicalIp(forwarded);
  if (!client)
    throw new ServiceError(
      'proxy_client_ip_invalid',
      'Trusted proxy client identity must be exactly one valid IP address, without a chain, port or zone identifier.',
      400,
    );
  return client;
}
