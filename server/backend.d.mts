import type { IncomingMessage, ServerResponse } from 'node:http';
export function createBackend(options?: any): {
  middleware: (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
  service: any;
  config: any;
  rendering: () => boolean;
  probeRenderer: (probe: () => Promise<boolean>) => Promise<boolean>;
  close: () => void;
};
export const SESSION_COOKIE: string;
export const DEVICE_COOKIE: string;
