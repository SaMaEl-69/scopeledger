import { useState } from 'react';
import { Modal, Field } from '../components/ui';
import { SupportAction } from '../components/SupportAction';
import { PLANS } from '../domain/access';
import { licenseRequest, type LicenseStatus } from './useLicense';
export function ActivationModal({
  status,
  statusError,
  onStatus,
  onRefresh,
  onClose,
  initialPlan = 'individual',
}: {
  status: LicenseStatus;
  statusError: string;
  onStatus: (s: LicenseStatus) => void;
  onRefresh: () => Promise<LicenseStatus | null>;
  onClose: () => void;
  initialPlan?: 'individual' | 'agency';
}) {
  const [key, setKey] = useState(''),
    [plan, setPlan] = useState<'individual' | 'agency'>(initialPlan),
    [label, setLabel] = useState('This browser'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  const displayedPlan = status.active && status.plan ? status.plan : plan;
  const action = async (release = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await licenseRequest<LicenseStatus>(
        release ? '/api/license/release' : '/api/license/activate',
        release ? {} : { key, plan, deviceLabel: label },
      );
      onStatus(next);
      setKey('');
      setConfirm(false);
      setLabel('This browser');
      setPlan(initialPlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation could not complete.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Activate ScopeLedger"
      onClose={onClose}
      dirty={!status.active && (!!key || label !== 'This browser' || plan !== initialPlan)}
    >
      <p className="modal-intro">
        One-time lifetime purchase. Identical paid features, with additional projects and PDF
        downloads. No conventional account or subscription.
      </p>
      <div className="plan-grid">
        {Object.entries(PLANS).map(([name, p]) => (
          <div className={`plan-card ${displayedPlan === name ? 'selected-plan' : ''}`} key={name}>
            <h3>{name === 'individual' ? 'Individual' : 'Agency'}</h3>
            {displayedPlan === name && <span className="plan-selection-label">Selected plan</span>}
            <strong>${p.price}</strong>
            <span>one time · lifetime</span>
            <p>
              {p.activations} activated browser{p.activations > 1 ? 's/devices' : '/device'}
            </p>
            {status.mode === 'live' && status.checkout?.[name as 'individual' | 'agency'] ? (
              <a
                className="button secondary"
                target="_blank"
                rel="noopener noreferrer"
                href={status.checkout[name as 'individual' | 'agency']!}
              >
                Purchase on Gumroad
              </a>
            ) : (
              <p>Purchases unavailable until seller setup is confirmed.</p>
            )}
          </div>
        ))}
      </div>
      {status.mode === 'local-test' && (
        <div className="notice warning">
          <strong>LOCAL DEVELOPMENT TEST MODE</strong>
          <p>
            Generated owner test keys use the real slot allocator and PDF renderer. They are not
            purchases or production licenses.
          </p>
        </div>
      )}
      {(error || statusError) && (
        <div className="alert error" role="alert">
          {error || statusError}
        </div>
      )}
      {!status.configured ? (
        <div className="notice warning">
          <strong>Purchases and activation are unavailable</strong>
          <p>
            Seller and server configuration are incomplete. Demo work and backups remain available.
          </p>
        </div>
      ) : status.active ? (
        <div className="notice">
          <strong>
            {status.plan === 'agency' ? 'Agency' : 'Individual'} activated · {status.deviceLabel}
          </strong>
          <p>
            {status.slotsUsed} of {status.slotsLimit} device slots allocated. Other Agency devices
            keep independent local workspaces.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Release this browser’s activation. Local projects stay here.
          </label>
          <button
            className="button secondary"
            disabled={!confirm || busy}
            onClick={() => void action(true)}
          >
            {busy ? 'Releasing…' : 'Release current device'}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action();
          }}
        >
          <Field label="Purchased plan">
            <select
              aria-label="Purchased plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as typeof plan)}
            >
              <option value="individual">Individual — one device</option>
              <option value="agency">Agency — five devices</option>
            </select>
          </Field>
          <Field label="License key">
            <input
              required
              autoComplete="off"
              type="password"
              maxLength={240}
              aria-label="License key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <Field label="Device label">
            <input
              required
              maxLength={80}
              aria-label="Device label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <button className="button primary" disabled={busy}>
            {busy ? 'Verifying…' : 'Activate this browser'}
          </button>
        </form>
      )}
      <p className="field-hint">
        A key does not grant permission to release someone else’s device. For a lost device, contact
        support with purchase ownership evidence. Activation is server verified; project work stays
        browser local. Clearing cookies may require seller-assisted slot recovery.
      </p>
      {status.configured && !status.active && (
        <p className="field-hint">
          Unsubmitted activation entries stay in this dialog. Closing clears them; keys never enter
          a workspace backup.
        </p>
      )}
      <SupportAction context="Device activation" />
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={() => void onRefresh()}>
          Refresh status
        </button>
        <button data-close-dialog className="button primary" disabled={busy} onClick={onClose}>
          {status.active ? 'Return to workspace' : 'Continue with demo'}
        </button>
      </div>
    </Modal>
  );
}
