import { useCallback, useEffect, useRef, useState } from 'react';
export interface LicenseStatus {
  configured: boolean;
  mode: 'demo' | 'local-test' | 'live';
  active: boolean;
  plan?: 'individual' | 'agency' | null;
  deviceLabel?: string;
  slotsUsed?: number;
  slotsLimit?: number;
  checkout?: { individual: string | null; agency: string | null };
  message?: string;
}
const empty: LicenseStatus = { configured: false, mode: 'demo', active: false };
export async function licenseRequest<T>(path: string, body?: object): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => {
      throw new Error(
        'The licensing server returned an unreadable response. Retry or contact Lifetime support.',
      );
    });
    if (!response.ok)
      throw new Error(
        data.message ||
          data.error?.message ||
          'Licensing is temporarily unavailable. Your local work is preserved.',
      );
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error(
        'License verification timed out. Your local work is preserved. Retry when the service is available.',
      );
    if (error instanceof TypeError)
      throw new Error('The licensing service could not be reached. Your local work is preserved.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function useLicense() {
  const [status, setStatus] = useState(empty),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const inFlight = useRef<Promise<LicenseStatus | null> | null>(null);
  const generation = useRef(0);
  const lastRefresh = useRef(0);
  const mounted = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const publishStatus = useCallback((next: LicenseStatus) => {
    generation.current++;
    setStatus(next);
    setError('');
    setLoading(false);
    lastRefresh.current = Date.now();
    try {
      channel.current?.postMessage({ type: 'license-changed' });
    } catch {}
  }, []);
  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    setLoading(true);
    const version = generation.current;
    const task = (async () => {
      try {
        const next = await licenseRequest<LicenseStatus>('/api/license/status');
        if (mounted.current && version === generation.current) {
          setStatus(next);
          setError('');
        }
        lastRefresh.current = Date.now();
        return next;
      } catch (error) {
        if (mounted.current && version === generation.current)
          setError(error instanceof Error ? error.message : 'License status is unavailable.');
        return null;
      } finally {
        if (mounted.current && version === generation.current) setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    return task;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const foreground = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 30000)
        void refresh();
    };
    const online = () => void refresh();
    try {
      channel.current = new BroadcastChannel('scopeledger-license-events');
      channel.current.onmessage = (event) => {
        if (event.data?.type !== 'license-changed') return;
        generation.current++;
        const previous = inFlight.current;
        if (previous)
          void previous.then(() => {
            if (mounted.current) void refresh();
          });
        else void refresh();
      };
    } catch {}
    window.addEventListener('focus', foreground);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', foreground);
    void refresh();
    return () => {
      mounted.current = false;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', foreground);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [refresh]);
  return { status, error, loading, refresh, setStatus: publishStatus };
}
