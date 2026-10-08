import { useRef, useState } from 'react';
import type { Change, Workspace } from '../domain/types';
import { Modal } from '../components/ui';
import {
  composeClientMessage,
  copyClientResponse,
  messagePlaceholders,
  type TemplateKind,
} from './messages';
import './toolkit.css';

export function ClientResponseComposer({
  w,
  change,
  onClose,
}: {
  w: Workspace;
  change: Change;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<TemplateKind>(change.route.toLowerCase() as TemplateKind);
  const composed = composeClientMessage(w, change, kind),
    [edits, setEdits] = useState<Partial<Record<TemplateKind, string>>>({}),
    [notice, setNotice] = useState(''),
    [confirmReset, setConfirmReset] = useState(false);
  const responseRef = useRef<HTMLTextAreaElement>(null);
  const copied = useRef(new Set<string>());
  const edited = edits[kind] ?? null,
    text = edited ?? composed.text,
    unresolved = messagePlaceholders(text);
  const dirty = Object.entries(edits).some(
    ([purpose, value]) =>
      value !== composeClientMessage(w, change, purpose as TemplateKind).text &&
      !copied.current.has(`${purpose}:${value}`),
  );
  const resetTemplate = () => {
    setEdits((current) => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
    setConfirmReset(false);
    setNotice('Current template restored.');
    queueMicrotask(() => responseRef.current?.focus());
  };
  return (
    <Modal title="Compose a client response" wide dirty={dirty} onClose={onClose}>
      <p className="modal-intro">
        Uses the current scope, fee, assumptions and approval state. Review the wording before
        copying. Private cost estimates and notes are excluded. Choose another response in the
        change workspace before composing different terms.
      </p>
      <label className="field">
        <span className="composer-label">Message purpose</span>
        <select
          aria-label="Message purpose"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as TemplateKind);
            setNotice('');
            setConfirmReset(false);
          }}
        >
          {([change.route.toLowerCase() as TemplateKind, 'followup'] as const).map((value) => (
            <option key={value} value={value}>
              {value === 'followup' ? 'Follow-up' : value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="composer-label">Client response</span>
        <textarea
          ref={responseRef}
          aria-label="Client response"
          className="composer-output"
          value={edited ?? composed.text}
          onChange={(event) => {
            setEdits((current) => ({ ...current, [kind]: event.target.value }));
            setNotice('');
            setConfirmReset(false);
          }}
        />
      </label>
      {unresolved.length > 0 && (
        <p className="notice warning">
          Unresolved placeholders: {unresolved.map((token) => `{{${token}}}`).join(', ')}. Edit or
          remove them before copying.
        </p>
      )}
      <p className="composer-status" role="status">
        {notice || 'This composer prepares text; it does not send a message or record approval.'}
      </p>
      {confirmReset && (
        <div className="notice warning" role="alert">
          <div>
            <strong>Replace your edited response?</strong>
            <p>The current template will replace this message purpose's text.</p>
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                autoFocus
                onClick={() => {
                  setConfirmReset(false);
                  queueMicrotask(() => responseRef.current?.focus());
                }}
              >
                Keep response
              </button>
              <button type="button" className="button secondary" onClick={resetTemplate}>
                Replace with current template
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button
          className="button secondary"
          onClick={() => {
            if (edited !== null && edited !== composed.text) setConfirmReset(true);
            else resetTemplate();
          }}
        >
          Reset to current template
        </button>
        <button
          className="button primary"
          disabled={unresolved.length > 0}
          onClick={() => {
            void copyClientResponse(text).then((success) => {
              if (success) copied.current.add(`${kind}:${text}`);
              setNotice(
                success
                  ? 'Client response copied.'
                  : 'Clipboard access failed. Select the text and copy it manually.',
              );
            });
          }}
        >
          Copy client response
        </button>
        <button className="button secondary" data-close-dialog onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
export default ClientResponseComposer;
