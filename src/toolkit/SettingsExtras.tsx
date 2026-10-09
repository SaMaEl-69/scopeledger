import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { prepareLogo } from './branding';
import { IMAGE_UPLOAD_ACCEPT } from '../documents/image-import';
import { activeTimezone, validTimezone } from '../operational/dates';
import './toolkit.css';

export function AgencyBranding({
  w,
  onChange,
}: {
  w: Workspace;
  onChange: (next: Workspace | ((current: Workspace) => Workspace)) => void;
}) {
  const file = useRef<HTMLInputElement>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    logoJob = useRef(0);
  const timezone = activeTimezone(w);
  const timezones = useMemo(
    () => [...new Set(['UTC', timezone, ...Intl.supportedValuesOf('timeZone')])].sort(),
    [timezone],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      logoJob.current += 1;
    };
  }, []);
  const patch = (value: Partial<Workspace['agency']>) =>
    onChange((current) => ({ ...current, agency: { ...current.agency, ...value } }));
  return (
    <section className="card toolkit-settings">
      <h2>Agency identity & document defaults</h2>
      <p>
        Enter your actual issuer details. Blank legal details stay visible as missing invoice
        requirements.
      </p>
      <label className="field">
        <span>Workspace timezone</span>
        <select
          id="agency-timezone"
          aria-label="Workspace timezone"
          aria-describedby="agency-timezone-hint"
          value={timezone}
          onChange={(event) => {
            const value = event.target.value;
            if (!validTimezone(value)) {
              setError('Choose a valid IANA timezone, such as Asia/Dhaka.');
              return;
            }
            setError('');
            patch({ timezone: value });
          }}
        >
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <span id="agency-timezone-hint" className="field-hint">
          Calendar views, today's date, and overdue status use this timezone. Date-only records keep
          their dates; timed reminders preserve their own timezone and stored instant.
        </span>
      </label>
      <div className="toolkit-fields">
        {(
          [
            ['legalName', 'Legal issuer name'],
            ['address', 'Issuer address'],
            ['email', 'Issuer email'],
            ['website', 'Agency website'],
            ['invoicePrefix', 'Invoice reference prefix'],
            ['defaultTaxRate', 'Default manual tax percentage'],
            ['paymentInstructions', 'Default payment instructions'],
            ['approvalText', 'Default approval requirements'],
            ['deliveryImplications', 'Default delivery implications'],
            ['documentFooter', 'Document footer'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="field">
            <span>{label}</span>
            {[
              'address',
              'paymentInstructions',
              'approvalText',
              'deliveryImplications',
              'documentFooter',
            ].includes(key) ? (
              <textarea
                id={key === 'address' ? 'issuer-address' : `agency-${key}`}
                aria-label={label}
                rows={3}
                value={w.agency[key] ?? ''}
                onChange={(event) => patch({ [key]: event.target.value })}
              />
            ) : (
              <input
                id={key === 'legalName' ? 'legal-name' : `agency-${key}`}
                aria-label={label}
                value={w.agency[key] ?? ''}
                onChange={(event) => patch({ [key]: event.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Document accent color</span>
        <input
          aria-label="Document accent color"
          type="color"
          value={w.agency.accentColor ?? '#27695d'}
          onChange={(event) => patch({ accentColor: event.target.value })}
        />
      </label>
      <div className="logo-editor">
        {w.agency.logoDataUrl ? (
          <img
            className="agency-logo-preview"
            src={w.agency.logoDataUrl}
            alt="Uploaded agency logo, fitted to document bounds"
          />
        ) : (
          <p>No logo uploaded.</p>
        )}
        <input
          ref={file}
          type="file"
          accept={IMAGE_UPLOAD_ACCEPT}
          aria-label="Upload agency logo image"
          hidden
          onChange={(event) => {
            const upload = event.target.files?.[0];
            if (!upload) return;
            const workspaceId = w.id,
              job = ++logoJob.current;
            setBusy(true);
            setError('');
            void prepareLogo(upload)
              .then((data) => {
                if (!mounted.current || job !== logoJob.current) return;
                onChange((current) =>
                  current.id === workspaceId
                    ? { ...current, agency: { ...current.agency, logoDataUrl: data } }
                    : current,
                );
              })
              .catch((reason) => {
                if (mounted.current && job === logoJob.current) setError(reason.message);
              })
              .finally(() => {
                if (mounted.current && job === logoJob.current) {
                  setBusy(false);
                  if (file.current) file.current.value = '';
                }
              });
          }}
        />
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            {busy ? 'Preparing logo…' : w.agency.logoDataUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {w.agency.logoDataUrl && (
            <button
              className="button secondary"
              onClick={() => {
                logoJob.current += 1;
                setBusy(false);
                patch({ logoDataUrl: '' });
              }}
            >
              Remove logo
            </button>
          )}
        </div>
        <p className="field-hint">
          PNG, JPEG, WebP, GIF, AVIF or BMP · up to 2 MiB · up to 4096 px per side. Automatically
          fitted and saved as a static image with transparency preserved. Stored in this browser and
          included in backups.
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
      <p className="field-hint">
        Tax is calculated from the percentage you supply. ScopeLedger does not determine tax
        treatment or claim invoice compliance.
      </p>
    </section>
  );
}
export const SettingsExtras = AgencyBranding;
