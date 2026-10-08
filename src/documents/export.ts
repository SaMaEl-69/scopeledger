import { useSyncExternalStore } from 'react';
import type { ClientDocument } from '../domain/types';
import { validateClientDocument } from '../../shared/client-document.mjs';

interface ExportState {
  busy: boolean;
  message: string;
  error: string;
}
let state: ExportState = { busy: false, message: '', error: '' };
const listeners = new Set<() => void>();
const publish = (next: ExportState) => {
  state = next;
  listeners.forEach((listener) => listener());
};
export function usePdfExport() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** One synchronous guard is shared by every desktop/mobile export control. */
export async function exportPdf(document: ClientDocument): Promise<void> {
  if (state.busy) throw new Error('An export is already in progress.');
  publish({ busy: true, message: 'Preparing the protected PDF…', error: '' });
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 60_000);
  try {
    const snapshot = validateClientDocument(document);
    const response = await fetch('/api/pdf', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      signal: abort.signal,
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      throw new Error(error.message || error.error || `PDF export failed (${response.status}).`);
    }
    if (!response.headers.get('content-type')?.includes('application/pdf'))
      throw new Error('The renderer returned an unexpected response. Please retry.');
    const blob = await response.blob();
    if (!blob.size) throw new Error('The renderer returned an empty PDF. Please retry.');
    const url = URL.createObjectURL(blob);
    try {
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${snapshot.reference.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'scopeledger-document'}.pdf`;
      link.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    publish({ busy: false, message: 'PDF downloaded.', error: '' });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'PDF export timed out. Your document is preserved; retry when the renderer is available.'
        : error instanceof Error
          ? error.message
          : 'PDF export failed. Your document is preserved.';
    publish({ busy: false, message: '', error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}
