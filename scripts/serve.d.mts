import type { Server } from 'node:http';
export function createScopeLedgerServer(options?: {
  directory?: string;
  backend?: any;
  readinessProbe?: () => Promise<boolean>;
  assetDirectory?: string;
}): Server;
