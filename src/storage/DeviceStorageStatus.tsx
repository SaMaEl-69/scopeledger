import { useEffect, useRef, useState } from 'react';

export function DeviceStorageStatus() {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const storage = navigator.storage;
    void storage
      ?.persisted?.()
      .then((value) => {
        if (alive.current) setPersistent(value);
      })
      .catch(() => {});
    void storage
      ?.estimate?.()
      .then(({ usage, quota }) => {
        if (
          alive.current &&
          typeof quota === 'number' &&
          Number.isFinite(quota) &&
          typeof usage === 'number' &&
          Number.isFinite(usage)
        )
          setAvailable(Math.max(0, quota - usage));
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);
  const retain = async () => {
    setBusy(true);
    setMessage('');
    try {
      const granted = await navigator.storage.persist();
      if (alive.current) {
        setPersistent(granted);
        setMessage(
          granted
            ? 'Persistent storage enabled. Keep a separate backup for browser cleanup or device loss.'
            : 'The browser has not granted persistent storage. Your records are saved; keep an external backup.',
        );
      }
    } catch {
      if (alive.current)
        setMessage('This browser could not change storage retention. Keep an external backup.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="device-storage-status">
      <p className="field-hint">
        {persistent === null
          ? 'Storage retention is managed by this browser.'
          : persistent
            ? 'Persistent browser storage is enabled.'
            : 'This browser may clear local data when storage is low.'}
        {available !== null &&
          ` Approximately ${(available / 1048576).toFixed(0)} MiB is available to this site; browser quotas can change.`}{' '}
        Clearing site data or losing this device still removes local work.
      </p>
      {persistent === false && typeof navigator.storage?.persist === 'function' && (
        <button className="button secondary" disabled={busy} onClick={() => void retain()}>
          {busy ? 'Requesting storage…' : 'Keep storage on this device'}
        </button>
      )}
      {message && (
        <p className="field-hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
