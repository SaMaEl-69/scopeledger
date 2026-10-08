import { useEffect, useRef, useState } from 'react';
import { PenLine, Upload, X } from 'lucide-react';
import type { DocumentSignatures } from '../domain/types';
import { prepareSignature } from './signatures';

function keepControlVisible(control: HTMLElement) {
  if (document.activeElement !== control) return;
  const dock = document.querySelector<HTMLElement>('.flow-action-dock');
  if (!dock) return;
  const bounds = control.getBoundingClientRect();
  const header = document.querySelector<HTMLElement>('.topbar')?.getBoundingClientRect();
  if (
    bounds.bottom > dock.getBoundingClientRect().top - 12 ||
    bounds.top < Math.max(0, header?.bottom ?? 0) + 12
  )
    control.scrollIntoView({ block: 'center', behavior: 'instant' });
}

export function SignatureEditor({
  value,
  onChange,
  onBusy,
}: {
  value: DocumentSignatures;
  onChange: (value: DocumentSignatures) => boolean | void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState<'issuer' | 'client' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const panel = useRef<HTMLDetailsElement>(null);
  const latest = useRef({ value, onChange, onBusy });
  latest.current = { value, onChange, onBusy };
  const job = useRef(0),
    mounted = useRef(false);
  useEffect(() => {
    const element = panel.current;
    // WebKit date fields emit focus without the bubbling focusin React uses.
    const focused = (event: FocusEvent) => {
      const control = event.target;
      if (control instanceof HTMLElement) requestAnimationFrame(() => keepControlVisible(control));
    };
    const reposition = () => {
      const control = document.activeElement;
      if (control instanceof HTMLElement && panel.current?.contains(control))
        requestAnimationFrame(() => keepControlVisible(control));
    };
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    element?.addEventListener('focus', focused, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      element?.removeEventListener('focus', focused, true);
    };
  }, []);
  useEffect(() => {
    mounted.current = true;
    latest.current.onBusy(false);
    return () => {
      mounted.current = false;
      job.current++;
      latest.current.onBusy(false);
    };
  }, []);
  const patch = (party: 'issuer' | 'client', next: Partial<DocumentSignatures['issuer']>) =>
    onChange({ ...value, [party]: { ...value[party], ...next } });
  const importImage = async (party: 'issuer' | 'client', file: File) => {
    const operation = ++job.current;
    setBusy(party);
    latest.current.onBusy(true);
    setError('');
    setNotice('');
    try {
      const imageDataUrl = await prepareSignature(file);
      if (!mounted.current || operation !== job.current) return;
      const current = latest.current;
      const applied = current.onChange({
        ...current.value,
        enabled: true,
        [party]: { ...current.value[party], imageDataUrl },
      });
      if (applied === false) {
        setError(
          'This signature could not be saved. Review the document error and keep the original image.',
        );
        return;
      }
      setNotice(
        `${party === 'issuer' ? 'Issuer' : 'Client'} signature imported. Wait for “Saved on this device” before closing.`,
      );
    } catch (reason) {
      if (mounted.current && operation === job.current)
        setError(
          reason instanceof Error ? reason.message : 'This signature could not be imported.',
        );
    } finally {
      if (mounted.current && operation === job.current) {
        setBusy(null);
        latest.current.onBusy(false);
      }
    }
  };
  return (
    <details ref={panel} className="document-signature-editor">
      <summary>
        <PenLine size={17} aria-hidden="true" />
        <span>Signatures</span>
        <span className="signature-summary">
          {value.enabled ? 'Edit names or import an image' : 'Add a sign-off area'}
        </span>
      </summary>
      <div className="signature-editor-body">
        <label className="signature-option">
          <input
            type="checkbox"
            checked={value.enabled}
            disabled={!!busy}
            onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          />
          Include signature area in PDF
        </label>
        <p className="field-hint">
          Use blank lines or import a signature image. Importing a signature does not record client
          approval.
        </p>
        {value.enabled && (
          <>
            <label className="signature-option">
              <input
                type="checkbox"
                checked={value.showClient}
                disabled={!!busy}
                onChange={(event) => onChange({ ...value, showClient: event.target.checked })}
              />
              Include client signature
            </label>
            <div className="signature-parties">
              {(['issuer', 'client'] as const)
                .filter((party) => party === 'issuer' || value.showClient)
                .map((party) => {
                  const label = party === 'issuer' ? 'Issuer' : 'Client',
                    signer = value[party];
                  return (
                    <fieldset key={party} className="signature-party">
                      <legend>{party === 'issuer' ? 'Prepared by' : 'Client acceptance'}</legend>
                      <label>
                        <span>{label} signatory name</span>
                        <input
                          aria-label={`${label} signatory name`}
                          maxLength={300}
                          value={signer.name}
                          onChange={(event) => patch(party, { name: event.target.value })}
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        <span>{label} signatory role</span>
                        <input
                          aria-label={`${label} signatory role`}
                          maxLength={200}
                          value={signer.role}
                          onChange={(event) => patch(party, { role: event.target.value })}
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        <span>{label} signature date</span>
                        <input
                          aria-label={`${label} signature date`}
                          type="date"
                          value={signer.date}
                          onChange={(event) => patch(party, { date: event.target.value })}
                        />
                      </label>
                      {signer.imageDataUrl && (
                        <div className="signature-image-preview">
                          <img src={signer.imageDataUrl} alt={`Imported ${party} signature`} />
                        </div>
                      )}
                      <div className="signature-image-actions">
                        <label
                          className={`button secondary signature-import ${busy ? 'busy' : ''}`}
                        >
                          <Upload size={14} aria-hidden="true" />
                          <span>
                            {busy === party
                              ? 'Importing…'
                              : signer.imageDataUrl
                                ? 'Replace signature'
                                : 'Import signature'}
                          </span>
                          <input
                            aria-label={`Import ${party} signature`}
                            type="file"
                            accept="image/png,image/jpeg"
                            disabled={!!busy}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) void importImage(party, file);
                            }}
                          />
                        </label>
                        {signer.imageDataUrl && (
                          <button
                            className="button secondary"
                            aria-label={`Remove ${party} signature`}
                            disabled={!!busy}
                            onClick={() => {
                              patch(party, { imageDataUrl: '' });
                              setError('');
                              setNotice(`${label} signature removed.`);
                            }}
                          >
                            <X size={14} aria-hidden="true" />
                            Remove
                          </button>
                        )}
                      </div>
                    </fieldset>
                  );
                })}
            </div>
            <p className="field-hint">
              PNG or JPEG · up to 2 MB · fitted proportionally with transparency preserved. Save a
              snapshot to keep signatures in document history and backups.
            </p>
          </>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="field-hint" role="status">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
