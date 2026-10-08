import type { ClientDocument } from '../src/domain/types';
export function chromePath(explicit?: string): Promise<string>;
export function rendererReady(): Promise<boolean>;
export function renderPdf(
  snapshot: ClientDocument,
  options?: { executablePath?: string; timeoutMs?: number },
): Promise<Buffer>;
