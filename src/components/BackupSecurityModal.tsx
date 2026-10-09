import { useState, useRef, useEffect } from 'react';
import { Download, LockKeyhole } from 'lucide-react';
import { Modal } from './ui';
import { encryptWorkspaceBackup, decryptWorkspaceBackup } from '../storage/encrypted-backup';
import { compactBackup } from '../storage/compact-backup';
export function BackupSecurityModal({
  raw,
  unlocking = false,
  onClose,
  onComplete,
}: {
  raw: string;
  unlocking?: boolean;
  onClose: () => void;
  onComplete: (raw: string, encrypted: boolean) => void;
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [passphrase, setPassphrase] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [plain, setPlain] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const valid = plain
    ? acknowledged
    : passphrase.trim().length >= 16 && (unlocking || passphrase === confirmation);
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const compact = unlocking ? raw : compactBackup(raw);
      const processed = plain
        ? compact
        : unlocking
          ? await decryptWorkspaceBackup(raw, passphrase)
          : await encryptWorkspaceBackup(compact, passphrase);
      if (alive.current) onComplete(processed, !plain);
    } catch (reason) {
      if (alive.current)
        setError(reason instanceof Error ? reason.message : 'Backup could not be processed.');
    } finally {
      if (alive.current) {
        setBusy(false);
        setPassphrase('');
        setConfirmation('');
      }
    }
  };
  return (
    <Modal
      title={unlocking ? 'Unlock your backup' : 'Back up your workspace'}
      onClose={busy ? () => {} : onClose}
    >
      <p className="modal-intro">
        {unlocking
          ? 'Enter the passphrase used to encrypt this file. Your current work stays in place until you review and confirm the restore.'
          : 'Protect client details with an encrypted file. Encryption happens in this browser; your passphrase is never saved or sent to the server.'}
      </p>
      {!unlocking && (
        <p className="field-hint">
          Backups store repeated logos and signatures once. Restoring keeps every saved document and
          signature unchanged.
        </p>
      )}
      {!unlocking && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={plain}
            disabled={busy}
            onChange={(event) => {
              setPlain(event.target.checked);
              setAcknowledged(false);
              setError('');
            }}
          />
          <span>Use an unencrypted JSON file instead</span>
        </label>
      )}
      {plain ? (
        <label className="check-label">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I understand anyone with this JSON file can read its client and project details.
          </span>
        </label>
      ) : (
        <div className="form-grid">
          <label className="field full">
            Backup passphrase
            <input
              type="password"
              autoComplete={unlocking ? 'off' : 'new-password'}
              value={passphrase}
              maxLength={1024}
              disabled={busy}
              onChange={(event) => setPassphrase(event.target.value)}
            />
            <span className="field-hint">
              At least 16 characters. Keep it separately; a forgotten passphrase cannot be
              recovered.
            </span>
          </label>
          {!unlocking && (
            <label className="field full">
              Confirm passphrase
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                maxLength={1024}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={busy || !valid} onClick={() => void submit()}>
          {plain ? <Download size={16} /> : <LockKeyhole size={16} />}
          {busy
            ? 'Processing…'
            : unlocking
              ? 'Unlock backup'
              : plain
                ? 'Download JSON backup'
                : 'Download encrypted backup'}
        </button>
      </div>
    </Modal>
  );
}
