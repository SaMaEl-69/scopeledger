import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportPdf } from '../src/documents/export';
import { createWorkspace } from '../src/domain/operations';
import { buildBrief } from '../src/domain/commercial';

const document = () => {
  const w = createWorkspace();
  return buildBrief(w, w.changes[0].id, { demo: false });
};
const pdf = () =>
  new Response(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });
beforeEach(() => {
  vi.stubGlobal('window', {
    document: { createElement: () => ({ href: '', download: '', click: vi.fn() }) },
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:test-document'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('one shared protected PDF export job guard', () => {
  it.each(['top-level', 'agency', 'client'])(
    'rejects unexpected %s private fields before any network transfer and permits a valid retry',
    async (location) => {
      const fetch = vi.fn().mockResolvedValueOnce(pdf());
      vi.stubGlobal('fetch', fetch);
      const snapshot = document(),
        original = structuredClone(snapshot),
        contaminated =
          location === 'top-level'
            ? { ...snapshot, privateNotes: 'PRIVATE EXPORT SENTINEL' }
            : {
                ...snapshot,
                [location]: {
                  ...snapshot[location as 'agency' | 'client'],
                  privateNotes: 'PRIVATE EXPORT SENTINEL',
                },
              };
      await expect(exportPdf(contaminated)).rejects.toThrow(/unapproved fields/);
      expect(fetch).not.toHaveBeenCalled();
      expect(snapshot).toEqual(original);
      await expect(exportPdf(snapshot)).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledOnce();
      const body = (fetch.mock.calls[0][1] as RequestInit).body as string;
      expect(JSON.parse(body)).toEqual(snapshot);
      expect(body).not.toContain('PRIVATE EXPORT SENTINEL');
    },
  );
  it('rejects a rapid duplicate job while sending only the deliberate client schema', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const snapshot = document(),
      first = exportPdf(snapshot);
    await expect(exportPdf(snapshot)).rejects.toThrow(/already in progress/);
    expect(fetch).toHaveBeenCalledOnce();
    const options = fetch.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('same-origin');
    expect(JSON.parse(options.body as string)).toEqual(snapshot);
    expect(Object.keys(JSON.parse(options.body as string))).not.toContain('hours');
    finish(pdf());
    await first;
    fetch.mockResolvedValueOnce(pdf());
    await expect(exportPdf(snapshot)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('clears the guard after a protected API failure and supports a useful retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'licensing_not_configured',
            message: 'Verified activation is unavailable.',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(pdf());
    vi.stubGlobal('fetch', fetch);
    await expect(exportPdf(document())).rejects.toThrow('Verified activation is unavailable.');
    await expect(exportPdf(document())).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('releases a PDF blob after a failed download click and permits a preserved-document retry', async () => {
    vi.useFakeTimers();
    const click = vi.fn().mockImplementationOnce(() => {
      throw new Error('The browser could not start the download.');
    });
    vi.stubGlobal('window', {
      document: { createElement: () => ({ href: '', download: '', click }) },
    });
    const fetch = vi.fn().mockImplementation(async () => pdf());
    vi.stubGlobal('fetch', fetch);
    const snapshot = document(),
      original = structuredClone(snapshot);
    await expect(exportPdf(snapshot)).rejects.toThrow(/could not start the download/);
    expect(snapshot).toEqual(original);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await expect(exportPdf(snapshot)).resolves.toBeUndefined();
    expect(click).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:test-document');
    expect(URL.revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:test-document');
  });
  it('times out and releases the shared guard without changing the preserved snapshot', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const snapshot = document(),
      original = structuredClone(snapshot),
      pending = exportPdf(snapshot);
    const rejected = expect(pending).rejects.toThrow(/timed out.*preserved/);
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(snapshot).toEqual(original);
    fetch.mockResolvedValueOnce(pdf());
    await exportPdf(snapshot);
    vi.clearAllTimers();
  });
});
