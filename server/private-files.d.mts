import type { IncomingMessage, ServerResponse } from 'node:http';
export function privateFileBoundary(options?: {
  dbPath?: string;
  roots?: string[];
}): (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
