import { useRef, useState } from 'react';
import type { Scenario, Workspace } from '../domain/types';
import { Modal } from '../components/ui';
import { SCENARIOS } from '../content/scenarios';
import {
  saveAssumption,
  saveCustomScenario,
  setAssumptionDeleted,
  setScenarioDeleted,
} from '../domain/commercial';
import { MESSAGE_TEMPLATES, MESSAGE_TOKENS, type TemplateKind } from './messages';
import './toolkit.css';

const blankScenario = (): Scenario => ({
  id: '',
  title: '',
  description: '',
  request: '',
  deliverables: '',
  exclusions: '',
  dependencies: '',
  assumptions: '',
  contractChecks: '',
  classification: 'Addition',
  route: 'Quote',
  confirm: '',
});
export function PlaybookView({
  w,
  onChange,
  onOpenChange,
}: {
  w: Workspace;
  onChange: (next: Workspace) => void;
  onOpenChange?: (projectId: string, changeId: string) => void;
}) {
  const [scenario, setScenario] = useState<Scenario | null>(null),
    [assumption, setAssumption] = useState<{ id?: string; title: string; text: string } | null>(
      null,
    ),
    [trash, setTrash] = useState(false),
    [error, setError] = useState('');
  const scenarioInitial = useRef<Scenario | null>(null),
    assumptionInitial = useRef<typeof assumption>(null);
  const openScenario = (value: Scenario) => {
    scenarioInitial.current = structuredClone(value);
    setScenario(value);
  };
  const openAssumption = (value: NonNullable<typeof assumption>) => {
    assumptionInitial.current = structuredClone(value);
    setAssumption(value);
  };
  const run = (operation: () => Workspace) => {
    try {
      onChange(operation());
      setScenario(null);
      setAssumption(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review the wording and try again.');
    }
  };
  return (
    <div className="playbook-view">
      <p>
        Reusable agency wording and document defaults live in this browser. They do not assume a
        price, delivery estimate or contractual right to charge.
      </p>
      <label className="check-label toolkit-restore-check">
        <input
          type="checkbox"
          checked={trash}
          onChange={(event) => setTrash(event.target.checked)}
        />
        Show recoverable playbook trash
      </label>
      <div className="playbook-layout">
        <section className="card">
          <div className="section-heading">
            <h2>Custom scenarios</h2>
            <button className="button secondary" onClick={() => openScenario(blankScenario())}>
              New scenario
            </button>
          </div>
          {w.customScenarios
            .filter((record) => (trash ? !!record.deletedAt : !record.deletedAt))
            .map((record) => (
              <article className="playbook-record" key={record.id}>
                <h3>{record.title}</h3>
                <p>{record.description || record.request}</p>
                <span className="badge">
                  {record.classification} · {record.route}
                </span>
                <div className="button-row">
                  {record.deletedAt ? (
                    <button
                      className="text-button"
                      onClick={() => run(() => setScenarioDeleted(w, record.id, false))}
                    >
                      Recover scenario
                    </button>
                  ) : (
                    <>
                      <button className="text-button" onClick={() => openScenario(record)}>
                        Edit scenario
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() => run(() => setScenarioDeleted(w, record.id, true))}
                      >
                        Move scenario to trash
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          {!w.customScenarios.some((record) => (trash ? record.deletedAt : !record.deletedAt)) && (
            <p className="playbook-empty">
              {trash
                ? 'No scenarios in trash.'
                : 'Create a scenario or adapt one of the twelve built-in examples.'}
            </p>
          )}
          {!trash && (
            <details className="scope-details">
              <summary>Adapt a built-in scenario</summary>
              <div className="playbook-fields">
                {SCENARIOS.map((record) => (
                  <button
                    className="text-button"
                    key={record.id}
                    onClick={() =>
                      openScenario({ ...record, id: '', title: `${record.title} — agency version` })
                    }
                  >
                    {record.title}
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Reusable assumptions</h2>
            <button
              className="button secondary"
              onClick={() => openAssumption({ title: '', text: '' })}
            >
              New assumption
            </button>
          </div>
          {w.assumptionPresets
            .filter((record) => (trash ? !!record.deletedAt : !record.deletedAt))
            .map((record) => (
              <article key={record.id} className="playbook-record">
                <h3>{record.title}</h3>
                <p>{record.text}</p>
                <div className="button-row">
                  {record.deletedAt ? (
                    <button
                      className="text-button"
                      onClick={() => run(() => setAssumptionDeleted(w, record.id, false))}
                    >
                      Recover assumption
                    </button>
                  ) : (
                    <>
                      <button className="text-button" onClick={() => openAssumption(record)}>
                        Edit assumption
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() => run(() => setAssumptionDeleted(w, record.id, true))}
                      >
                        Move assumption to trash
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          {!w.assumptionPresets.some((record) =>
            trash ? record.deletedAt : !record.deletedAt,
          ) && (
            <p className="playbook-empty">
              {trash
                ? 'No assumptions in trash.'
                : 'Save wording you regularly confirm with clients. Apply it from the change workspace.'}
            </p>
          )}
          {onOpenChange && w.context.changeId && (
            <button
              className="text-button"
              onClick={() => onOpenChange(w.context.projectId, w.context.changeId)}
            >
              Return to current change
            </button>
          )}
        </section>
      </div>
      <section className="card toolkit-template-editor">
        <h2>Client-message templates</h2>
        <p className="template-tokens">
          Supported placeholders: {MESSAGE_TOKENS.map((token) => `{{${token}}}`).join(', ')}.
          Unknown fields stay visible; private financial fields are never available.
        </p>
        <div className="playbook-layout">
          {(Object.keys(MESSAGE_TEMPLATES) as TemplateKind[]).map((kind) => (
            <label key={kind} className="field">
              <span className="composer-label">
                {kind === 'followup'
                  ? 'Follow-up message template'
                  : `${kind[0].toUpperCase() + kind.slice(1)} message template`}
              </span>
              <textarea
                rows={8}
                aria-label={`${kind} message template`}
                value={w.agency.messageTemplates?.[kind] ?? MESSAGE_TEMPLATES[kind]}
                onChange={(event) =>
                  onChange({
                    ...w,
                    agency: {
                      ...w.agency,
                      messageTemplates: {
                        ...MESSAGE_TEMPLATES,
                        ...w.agency.messageTemplates,
                        [kind]: event.target.value,
                      },
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {scenario && (
        <Modal
          title={scenario.id ? 'Edit custom scenario' : 'Create custom scenario'}
          wide
          dirty={JSON.stringify(scenario) !== JSON.stringify(scenarioInitial.current)}
          onClose={() => {
            setScenario(null);
            setError('');
          }}
        >
          <div className="playbook-fields">
            {(
              [
                'title',
                'description',
                'request',
                'deliverables',
                'exclusions',
                'dependencies',
                'assumptions',
                'contractChecks',
                'confirm',
              ] as const
            ).map((key) => (
              <label key={key} className="field">
                <span>
                  {
                    {
                      title: 'Scenario title',
                      description: 'Short description',
                      request: 'Request wording',
                      deliverables: 'Deliverables',
                      exclusions: 'Exclusions',
                      dependencies: 'Client dependencies',
                      assumptions: 'Delivery assumptions',
                      contractChecks: 'Contract checks',
                      confirm: 'PM confirmation guidance',
                    }[key]
                  }
                </span>
                <textarea
                  rows={key === 'request' ? 3 : 2}
                  aria-label={`Custom scenario ${key}`}
                  value={scenario[key]}
                  onChange={(event) => setScenario({ ...scenario, [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="field">
              <span>Suggested classification</span>
              <select
                aria-label="Suggested classification"
                value={scenario.classification}
                onChange={(event) =>
                  setScenario({
                    ...scenario,
                    classification: event.target.value as Scenario['classification'],
                  })
                }
              >
                {['Addition', 'Included', 'Defect', 'Ambiguous'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Suggested response</span>
              <select
                aria-label="Suggested response"
                value={scenario.route}
                onChange={(event) =>
                  setScenario({ ...scenario, route: event.target.value as Scenario['route'] })
                }
              >
                {['Quote', 'Absorb', 'Exchange', 'Defer'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              data-close-dialog
              onClick={() => setScenario(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => run(() => saveCustomScenario(w, scenario, scenario.id || undefined))}
            >
              Save custom scenario
            </button>
          </div>
        </Modal>
      )}
      {assumption && (
        <Modal
          title={assumption.id ? 'Edit reusable assumption' : 'Create reusable assumption'}
          dirty={JSON.stringify(assumption) !== JSON.stringify(assumptionInitial.current)}
          onClose={() => {
            setAssumption(null);
            setError('');
          }}
        >
          <label className="field">
            <span>Assumption title</span>
            <input
              aria-label="Assumption title"
              value={assumption.title}
              onChange={(event) => setAssumption({ ...assumption, title: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Reusable assumption wording</span>
            <textarea
              aria-label="Reusable assumption wording"
              rows={5}
              value={assumption.text}
              onChange={(event) => setAssumption({ ...assumption, text: event.target.value })}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              data-close-dialog
              onClick={() => setAssumption(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() =>
                run(() => saveAssumption(w, assumption.title, assumption.text, assumption.id))
              }
            >
              Save reusable assumption
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default PlaybookView;
