import type { IncomingMessage } from 'node:http';
export function activationAddress(
  request: IncomingMessage,
  config: { mode?: string; trustLoopbackProxy?: boolean },
): string;
