import { useRef, useState } from 'react';
import type { Workspace, Project, Change, ChangeTerms } from '../domain/types';
import { now } from '../domain/types';
import { calculate, formatMoney, formatPercent } from '../domain/finance';
import { pickTerms, saveComparison } from '../domain/comparisons';
import { Modal, Field, NumberField } from './ui';
export function ComparisonModal({
  w,
  project,
  change,
  onChange,
  onClose,
}: {
  w: Workspace;
  project: Project;
  change: Change;
  onChange: (w: Workspace) => void;
  onClose: () => void;
}) {
  const [terms, setTerms] = useState<ChangeTerms>(pickTerms(change)),
    [name, setName] = useState('Alternative response'),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [savedSignature, setSavedSignature] = useState(() =>
      JSON.stringify({ name: 'Alternative response', terms: pickTerms(change) }),
    );
  const [pendingAlternative, setPendingAlternative] = useState<
    Workspace['comparisons'][number] | null
  >(null);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const dirty = JSON.stringify({ name, terms }) !== savedSignature;
  const loadAlternative = (alternative: Workspace['comparisons'][number]) => {
    const nextTerms = structuredClone(alternative.terms);
    setName(alternative.name);
    setTerms(nextTerms);
    setSavedSignature(JSON.stringify({ name: alternative.name, terms: nextTerms }));
    setPendingAlternative(null);
    setError('');
    setStatus('Loaded into comparison editor; active draft preserved');
    queueMicrotask(() => document.getElementById('comparison-name')?.focus());
  };
  const baseline =
    w.reconciliations.find((r) => r.changeId === change.id)?.before ?? project.baseline;
  const alternatives = w.comparisons.filter((c) => c.changeId === change.id && !c.deletedAt),
    result = calculate(baseline, terms);
  return (
    <Modal title="Compare responses" wide onClose={onClose} dirty={dirty}>
      <p className="modal-intro">
        Save each alternative before closing this dialog. Private alternatives use the current
        project baseline. They preserve the active draft and are excluded from approvals, invoices
        and portfolio totals.
      </p>
      <Field label="Comparison name">
        <input
          id="comparison-name"
          aria-label="Comparison name"
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Alternative response">
        <select
          aria-label="Alternative response"
          value={terms.route}
          onChange={(e) => setTerms({ ...terms, route: e.target.value as ChangeTerms['route'] })}
        >
          {['Quote', 'Absorb', 'Exchange', 'Defer'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <div className="two-fields">
        {(['fee', 'credit', 'hours', 'rate', 'outside', 'removed'] as const).map((k) => (
          <NumberField
            key={k}
            id={`comparison-${k}`}
            label={
              {
                fee: 'Proposed fee',
                credit: 'Client credit',
                hours: 'Hours',
                rate: 'Loaded cost',
                outside: 'Outside cost',
                removed: 'Removed future cost',
              }[k]
            }
            value={terms[k]}
            onChange={(v) => setTerms({ ...terms, [k]: v })}
          />
        ))}
      </div>
      {(['removedScope', 'creditReason', 'assumptions'] as const).map((k) => (
        <Field
          key={k}
          label={
            {
              removedScope: 'Agreed removed scope',
              creditReason: 'Credit reason',
              assumptions: 'Alternative assumptions',
            }[k]
          }
        >
          <textarea
            aria-label={`Comparison ${k}`}
            maxLength={100000}
            value={terms[k]}
            onChange={(e) => setTerms({ ...terms, [k]: e.target.value })}
          />
        </Field>
      ))}
      <div className="notice">
        <strong>
          {result.deferred
            ? 'Deferred: no committed financial effect'
            : result.valid
              ? `Conditional margin: ${formatPercent(result.agreedMargin)}`
              : 'Estimates are incomplete'}
        </strong>
        <p>
          Effective fee {formatMoney(result.effectiveFee, project.currency)} · Change floor{' '}
          {formatMoney(result.changeFloor, project.currency)} · Project restoration{' '}
          {formatMoney(result.restorationFee, project.currency)}
        </p>
      </div>
      <button
        className="button primary"
        onClick={() => {
          try {
            onChange(saveComparison(w, change.id, name, terms));
            setSavedSignature(JSON.stringify({ name, terms }));
            setStatus('Comparison added; active draft preserved. Check the workspace save status.');
            setError('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Save comparison
      </button>
      <span role="status">{status}</span>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <h3>Saved alternatives</h3>
      {pendingAlternative && (
        <div className="notice warning comparison-replace" role="alert">
          <strong>Replace unfinished comparison?</strong>
          <p>
            Loading {pendingAlternative.name} replaces the current comparison entries. Save them
            first if you want to keep both alternatives.
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              autoFocus
              onClick={() => {
                setPendingAlternative(null);
                queueMicrotask(() => reviewTrigger.current?.focus());
              }}
            >
              Keep editing
            </button>
            <button
              className="button secondary"
              onClick={() => loadAlternative(pendingAlternative)}
            >
              Replace comparison
            </button>
          </div>
        </div>
      )}
      <div className="record-list">
        {alternatives.map((a) => {
          const c = calculate(baseline, a.terms);
          return (
            <div className="record-row" key={a.id}>
              <div>
                <strong>{a.name}</strong>
                <span>
                  {a.terms.route} · {c.valid ? formatPercent(c.agreedMargin) : 'Unknown'}{' '}
                  conditional margin · {formatMoney(c.effectiveFee, project.currency)}
                </span>
              </div>
              <button
                className="text-button"
                disabled={!!pendingAlternative}
                onClick={(event) => {
                  if (dirty) {
                    reviewTrigger.current = event.currentTarget;
                    setPendingAlternative(a);
                  } else loadAlternative(a);
                }}
              >
                Review
              </button>
              <button
                className="text-button"
                disabled={!!pendingAlternative}
                onClick={() =>
                  onChange({
                    ...w,
                    comparisons: w.comparisons.map((x) =>
                      x.id === a.id ? { ...x, deletedAt: now() } : x,
                    ),
                  })
                }
              >
                Archive alternative
              </button>
            </div>
          );
        })}
        {!alternatives.length && <p>No saved alternatives yet.</p>}
      </div>
      {w.comparisons
        .filter((c) => c.changeId === change.id && c.deletedAt)
        .map((a) => (
          <button
            key={a.id}
            className="text-button"
            onClick={() =>
              onChange({
                ...w,
                comparisons: w.comparisons.map((x) =>
                  x.id === a.id ? { ...x, deletedAt: null } : x,
                ),
              })
            }
          >
            Recover {a.name}
          </button>
        ))}
      <div className="modal-actions">
        <button data-close-dialog className="button secondary" onClick={onClose}>
          Return to active draft
        </button>
      </div>
    </Modal>
  );
}
