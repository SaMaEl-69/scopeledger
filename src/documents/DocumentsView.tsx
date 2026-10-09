import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileText,
  History,
  Receipt,
  Undo2,
} from 'lucide-react';
import type { ClientDocument, Workspace } from '../domain/types';
import { id } from '../domain/types';
import { formatMoney } from '../domain/finance';
import { compareRecordedDates, recordedDateToDate } from '../domain/dates';
import {
  buildBrief,
  buildInvoice,
  documentReadiness,
  issueDocument,
  localDate,
  paymentBalances,
  recordPayment,
  voidDocument,
  voidPayment,
  type DocumentOverrides,
  type NavigateTarget,
} from '../domain/commercial';
import { documentHtml } from '../../shared/client-document.mjs';
import { Modal } from '../components/ui';
import { exportPdf, usePdfExport } from './export';
import {
  documentDraftKey,
  forgetDocumentDraft,
  readDocumentDraft,
  recentDocumentDraftKind,
  rememberDocumentDraft,
} from './drafts';
import { ProjectSequence } from '../components/ProjectSequence';
import { SignatureEditor } from './SignatureEditor';
import { emptySignatures } from './signatures';
import { defaultSections } from './options';
import './documents.css';
import { serializeWorkspace } from '../storage/repository';

export interface DocumentsViewProps {
  w: Workspace;
  onChange: (next: Workspace) => void;
  onNavigate: (target: NavigateTarget) => void;
  onActivate: () => void;
  active: boolean;
  mode: string;
  selectedProjectId?: string;
  selectedChangeId?: string;
  selectedDocumentId?: string;
  requestedKind?: ClientDocument['kind'] | null;
  onKindHandled?: () => void;
  onKindChange?: (kind: ClientDocument['kind']) => void;
  flowStep?: number;
  onFlowStep?: (step: number) => void;
  onLeaveFlow?: () => void;
}
const makeDefaults = (
  w: Workspace,
  kind: ClientDocument['kind'],
  changeId = w.context.changeId,
): DocumentOverrides => ({
  reference: `${kind === 'brief' ? 'BRF' : w.agency.invoicePrefix?.trim() || (kind === 'credit' ? 'CR' : 'INV')}-${String(w.documents.length + 1).padStart(4, '0')}`,
  issueDate: localDate(w.agency.timezone),
  dueDate: '',
  taxRate:
    w.changes.find((change) => change.id === changeId)?.taxRate ?? w.agency.defaultTaxRate ?? '0',
  paymentInstructions: w.agency.paymentInstructions ?? '',
  deliveryImplications: w.agency.deliveryImplications ?? '',
  approvalText:
    w.agency.approvalText?.trim() ||
    'Please confirm the scope, fee and dependencies in writing before additional work begins. Existing agreement terms apply.',
  footer: w.agency.documentFooter ?? '',
  signatures: emptySignatures(kind),
  sections: defaultSections(),
});
const documentNames: Record<ClientDocument['kind'], string> = {
  brief: 'Change brief',
  invoice: 'Invoice',
  credit: 'Credit note',
};
const balanceLabel = (status: string, credit = false) =>
  status === 'partial'
    ? credit
      ? 'Partially settled'
      : 'Partially paid'
    : status === 'paid'
      ? credit
        ? 'Settled'
        : 'Paid'
      : status === 'unpaid'
        ? credit
          ? 'Unsettled'
          : 'Unpaid'
        : status === 'unavailable'
          ? 'Review payment records'
          : status;

export function DocumentsView({
  w,
  onChange,
  onNavigate,
  onActivate,
  active,
  mode,
  selectedProjectId,
  selectedChangeId,
  selectedDocumentId,
  requestedKind,
  onKindHandled,
  onKindChange,
  flowStep,
  onFlowStep,
  onLeaveFlow,
}: DocumentsViewProps) {
  const [projectId, setProjectId] = useState(selectedProjectId ?? w.context.projectId),
    [changeId, setChangeId] = useState(selectedChangeId ?? w.context.changeId);
  const [kind, setKind] = useState<ClientDocument['kind']>(
      () => recentDocumentDraftKind(w, projectId, changeId) ?? 'brief',
    ),
    [draftOverrides, setOverrides] = useState<DocumentOverrides>(
      () =>
        readDocumentDraft(w, documentDraftKey(w, projectId, changeId, kind)) ??
        makeDefaults(w, kind, changeId),
    );
  const draftKey = documentDraftKey(w, projectId, changeId, kind);
  useEffect(() => {
    setOverrides(readDocumentDraft(w, draftKey) ?? makeDefaults(w, kind, changeId));
  }, [draftKey, w.documentDrafts]);
  const editOverrides = (next: DocumentOverrides) => {
    try {
      const updated = rememberDocumentDraft(w, draftKey, next);
      setOverrides(next);
      onChange(updated);
      setError('');
      return true;
    } catch (reason) {
      setError(
        `Draft edit was not applied. ${reason instanceof Error ? reason.message : 'The workspace could not be saved.'}`,
      );
      return false;
    }
  };
  const [selectedId, setSelectedId] = useState(selectedDocumentId ?? ''),
    [kindFilter, setKindFilter] = useState('all'),
    [statusFilter, setStatusFilter] = useState('all'),
    [changeFilter, setChangeFilter] = useState('all');
  const [error, setError] = useState(''),
    [modal, setModal] = useState<
      'issue' | 'payment' | 'void-document' | 'void-payment' | 'reset-draft' | null
    >(null),
    [reason, setReason] = useState(''),
    [paymentId, setPaymentId] = useState(''),
    [amount, setAmount] = useState(''),
    [date, setDate] = useState(localDate(w.agency.timezone)),
    [reference, setReference] = useState(''),
    [note, setNote] = useState('');
  const initialPaymentDate = useRef(date);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const controlsPanel = useRef<HTMLElement>(null);
  const handledKindRequest = useRef<string | null>(null);
  const exporting = usePdfExport();
  const [showBriefDetails, setShowBriefDetails] = useState(false);
  const [signatureBusy, setSignatureBusy] = useState(false);
  useEffect(() => {
    onKindChange?.(kind);
  }, [kind, onKindChange]);
  const [clockVersion, setClockVersion] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClockVersion((version) => version + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selectedProjectId !== undefined) setProjectId(selectedProjectId);
    if (selectedChangeId !== undefined) setChangeId(selectedChangeId);
    if (selectedDocumentId !== undefined) setSelectedId(selectedDocumentId);
  }, [selectedProjectId, selectedChangeId, selectedDocumentId]);
  const project = w.projects.find((record) => record.id === projectId),
    changes = w.changes.filter((record) => record.projectId === projectId && !record.deletedAt),
    change = changes.find((record) => record.id === changeId);
  const overrides = useMemo(
    () =>
      change?.feeMode === 'including-tax'
        ? { ...draftOverrides, taxRate: change.taxRate ?? '0' }
        : draftOverrides,
    [draftOverrides, change?.feeMode, change?.taxRate],
  );
  const balances = useMemo(
    () => paymentBalances(w),
    [w.documents, w.payments, w.agency.timezone, clockVersion],
  );
  const selected = w.documents.find(
      (record) =>
        record.id === selectedId && record.projectId === projectId && record.changeId === changeId,
    ),
    balance = selected ? (balances.get(selected.id) ?? null) : null;
  useEffect(() => {
    if (selected) setKind(selected.kind);
  }, [selected?.id]);
  useEffect(() => {
    setChangeFilter('all');
  }, [projectId]);
  const authoring = useMemo(() => {
    if (!change) return { readiness: [], document: null as ClientDocument | null, error: '' };
    try {
      const fields = { ...overrides, demo: !active };
      const readiness = documentReadiness(w, change.id, kind, fields);
      const ready = readiness.every((item) => item.complete);
      const document =
        kind === 'brief'
          ? buildBrief(w, change.id, fields)
          : ready
            ? buildInvoice(w, change.id, fields, kind)
            : null;
      return { readiness, document, error: '' };
    } catch (reason) {
      return {
        readiness: [],
        document: null,
        error: reason instanceof Error ? reason.message : 'Review the document inputs.',
      };
    }
  }, [w, change, kind, overrides, active, clockVersion]);
  const preview = selected?.snapshot
    ? { ...selected.snapshot, demo: !active }
    : selected
      ? null
      : authoring.document;
  const html = useMemo(() => {
    try {
      return preview ? documentHtml(preview) : '';
    } catch (reason) {
      return '';
    }
  }, [preview]);
  const run = (operation: () => Workspace, afterChange?: (next: Workspace) => void) => {
    try {
      const next = operation();
      serializeWorkspace(next);
      onChange(next);
      afterChange?.(next);
      setError('');
      setModal(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The operation could not be completed.');
    }
  };
  const focus = (target: NavigateTarget) => {
    if (target.view !== 'documents') {
      onNavigate(target);
      return;
    }
    if (kind !== 'brief' && target.field === 'document-approval-text') {
      onNavigate({ view: 'workspace', projectId, changeId });
      return;
    }
    if (target.field) {
      document.getElementById(target.field)?.focus();
      return;
    }
    const existing = w.documents.find(
      (record) =>
        record.changeId === (target.changeId ?? changeId) &&
        record.kind !== 'brief' &&
        record.issuedAt &&
        !record.voidedAt,
    );
    if (existing) setSelectedId(existing.id);
    document.querySelector('.document-history')?.scrollIntoView({ block: 'start' });
  };
  const changeKind = (value: ClientDocument['kind']) => {
    setKind(value);
    if (value !== kind || selected) {
      setOverrides(
        readDocumentDraft(w, documentDraftKey(w, projectId, changeId, value)) ??
          makeDefaults(w, value, changeId),
      );
    }
    setSelectedId('');
    setError('');
    onNavigate({ view: 'documents', projectId, changeId, documentId: '' });
  };
  useEffect(() => {
    if (!requestedKind) {
      handledKindRequest.current = null;
      return;
    }
    // Route context must settle before reading the independent draft for this purpose.
    if (
      modal !== null ||
      (selectedProjectId !== undefined && selectedProjectId !== projectId) ||
      (selectedChangeId !== undefined && selectedChangeId !== changeId)
    ) {
      return;
    }
    const requestKey = JSON.stringify([w.id, projectId, changeId, requestedKind]);
    if (handledKindRequest.current === requestKey) return;
    handledKindRequest.current = requestKey;
    changeKind(requestedKind);
    onKindHandled?.();
  }, [
    w.id,
    requestedKind,
    selectedProjectId,
    selectedChangeId,
    projectId,
    changeId,
    onKindHandled,
    modal,
  ]);
  const resetDraft = () => {
    onChange(forgetDocumentDraft(w, draftKey));
    setSelectedId('');
    setOverrides(makeDefaults(w, kind, changeId));
    onNavigate({ view: 'documents', projectId, changeId, documentId: '' });
    setModal(null);
  };
  const projectDocuments = w.documents.filter(
    (record) => !projectId || record.projectId === projectId,
  );
  const history = projectDocuments
    .filter(
      (record) =>
        (changeFilter === 'all' || record.changeId === changeFilter) &&
        (kindFilter === 'all' || record.kind === kindFilter) &&
        (statusFilter === 'all' ||
          (statusFilter === 'voided' ? !!record.voidedAt : !record.voidedAt)),
    )
    .sort((a, b) => compareRecordedDates(b.createdAt, a.createdAt));
  const missingReadiness = authoring.readiness.filter((item) => !item.complete);
  const completeReadiness = authoring.readiness.filter((item) => item.complete);
  const readyToSave = !!authoring.document && missingReadiness.length === 0 && !signatureBusy;
  const guidedBrief = !!flowStep && flowStep >= 6 && !selected;
  const exportStep = guidedBrief && flowStep === 7;
  const downloadPreview = () => {
    if (signatureBusy) return;
    if (!active) {
      onActivate();
      return;
    }
    if (preview) void exportPdf(preview).catch((reason) => setError(reason.message));
  };
  const preparationAction =
    kind === 'brief'
      ? 'Save brief snapshot'
      : kind === 'credit'
        ? 'Review and issue credit'
        : 'Review and issue invoice';
  const documentFields = (
    [
      'reference',
      'issueDate',
      'dueDate',
      'taxRate',
      'paymentInstructions',
      'deliveryImplications',
      'approvalText',
      'footer',
    ] as const
  ).filter((key) =>
    kind === 'brief'
      ? !['dueDate', 'taxRate', 'paymentInstructions'].includes(key)
      : !['deliveryImplications', 'approvalText'].includes(key),
  );
  const showHistory = () => {
    historyHeading.current?.scrollIntoView({ block: 'start' });
    historyHeading.current?.focus({ preventScroll: true });
  };
  return (
    <div
      className={`documents-view ${guidedBrief ? `project-brief-flow ${exportStep ? 'flow-export' : 'flow-review'} ${readyToSave ? 'ready' : 'needs-details'} ${showBriefDetails ? 'editing-brief' : ''}` : ''}`}
    >
      {guidedBrief && onFlowStep && (
        <section className="request-route brief-flow-route">
          <ProjectSequence step={flowStep!} onSelect={onFlowStep} documentKind={kind} />
          <div className="brief-flow-context">
            <span>
              {project?.name} · {change?.title || 'Change brief'}
            </span>
            <div className="brief-flow-tools">
              {!exportStep && (
                <button
                  className="text-button"
                  aria-pressed={showBriefDetails}
                  onClick={() => setShowBriefDetails((value) => !value)}
                >
                  {showBriefDetails ? 'Hide document details' : 'Edit document details'}
                </button>
              )}
              <button className="text-button" onClick={onLeaveFlow}>
                All documents
              </button>
            </div>
          </div>
        </section>
      )}
      <section className="document-purpose-bar" aria-label="Document workflow">
        <div className="document-purpose-heading">
          <div>
            <h2>What do you need to send?</h2>
            <p className="document-purpose-description">
              Choose a document, finish the highlighted details, then review and save it.
            </p>
          </div>
          <button
            className="button secondary"
            aria-label="View document history"
            onClick={showHistory}
          >
            <History size={16} aria-hidden="true" />
            Saved documents & payments{' '}
            <span className="document-count">{projectDocuments.length}</span>
          </button>
        </div>
        <div className="document-purpose-choices" aria-label="Prepare a document">
          {(
            [
              {
                value: 'brief',
                action: 'Prepare brief',
                description: 'Explain the scope, fee and approval needed.',
                icon: FileText,
              },
              {
                value: 'invoice',
                action: 'Prepare invoice',
                description: 'Request payment for an approved change.',
                icon: Receipt,
              },
              {
                value: 'credit',
                action: 'Prepare credit note',
                description: 'Record an approved reduction to the fee.',
                icon: Undo2,
              },
            ] as const
          ).map(({ value, action, description, icon: Icon }) => (
            <button
              key={value}
              className={`document-purpose-choice ${!selected && kind === value ? 'selected' : ''}`}
              aria-label={action}
              aria-pressed={!selected && kind === value}
              aria-describedby={`document-purpose-${value}`}
              disabled={!change}
              onClick={() => changeKind(value)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>
                <strong>{action}</strong>
                <span id={`document-purpose-${value}`}>{description}</span>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      {guidedBrief && (
        <div className="guided-document-switch" role="group" aria-label="Document type">
          <span>Document</span>
          <div>
            {(['brief', 'invoice', 'credit'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                disabled={signatureBusy || exporting.busy}
                onClick={() => {
                  setShowBriefDetails(false);
                  changeKind(value);
                }}
              >
                {value === 'brief' ? (
                  <FileText size={16} />
                ) : value === 'invoice' ? (
                  <Receipt size={16} />
                ) : (
                  <Undo2 size={16} />
                )}
                {value === 'brief' ? 'Brief' : value === 'invoice' ? 'Invoice' : 'Credit note'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="document-toolbar">
        <label>
          Project
          <select
            aria-label="Document project"
            value={projectId}
            onChange={(event) => {
              const nextId = event.target.value,
                nextChangeId =
                  w.changes.find((record) => record.projectId === nextId && !record.deletedAt)
                    ?.id ?? '';
              setProjectId(nextId);
              setChangeId(nextChangeId);
              setSelectedId('');
              onNavigate({
                view: 'documents',
                projectId: nextId,
                changeId: nextChangeId,
                documentId: '',
              });
            }}
          >
            {w.projects.map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
                {record.sample ? ' · Sample' : record.deletedAt ? ' · In trash' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Change
          <select
            aria-label="Document change"
            value={changeId}
            onChange={(event) => {
              setChangeId(event.target.value);
              setSelectedId('');
              onNavigate({
                view: 'documents',
                projectId,
                changeId: event.target.value,
                documentId: '',
              });
            }}
          >
            {changes.map((record) => (
              <option key={record.id} value={record.id}>
                {record.title || 'Untitled request'} · R{record.revision} · {record.status}
              </option>
            ))}
          </select>
        </label>
        <label className="document-purpose-picker">
          Document type
          <select
            id="document-kind"
            aria-label="Document type"
            value={selected?.kind ?? kind}
            onChange={(event) => changeKind(event.target.value as ClientDocument['kind'])}
          >
            <option value="brief">Change brief</option>
            <option value="invoice">Invoice</option>
            <option value="credit">Credit note</option>
          </select>
        </label>
        {(selected || readDocumentDraft(w, draftKey)) && (
          <button
            className="button secondary"
            disabled={!change}
            title="Start over with your agency defaults. You can keep your current draft."
            onClick={() => {
              if (readDocumentDraft(w, draftKey)) setModal('reset-draft');
              else resetDraft();
            }}
          >
            Prepare new document
          </button>
        )}
      </div>
      <div className="document-layout">
        <section className="card document-controls" ref={controlsPanel}>
          {selected ? (
            <>
              <div className="document-record-heading">
                <span>{documentNames[selected.kind]}</span>
                <span
                  className={`badge ${selected.voidedAt ? 'document-status-voided' : 'document-status-preserved'}`}
                >
                  {selected.voidedAt
                    ? 'Voided'
                    : !selected.snapshot
                      ? 'Historical record'
                      : selected.kind === 'brief'
                        ? 'Saved snapshot'
                        : 'Issued'}
                </span>
              </div>
              <h2 tabIndex={-1}>{selected.snapshot?.reference ?? 'Legacy document metadata'}</h2>
              <p className="document-muted">
                {documentNames[selected.kind]} · Revision {selected.revision} ·{' '}
                {selected.voidedAt ? 'Voided' : 'Preserved snapshot'}
              </p>
              <p className="notice">
                This is a saved document. Its values stay unchanged when you edit the project or
                your settings. To create another, choose a document type above.
              </p>
              {selected.voidedAt && <p className="notice warning">Voided: {selected.voidReason}</p>}
              {selected.kind !== 'brief' && selected.snapshot && balance && (
                <>
                  <h3>{selected.kind === 'credit' ? 'Credit settlement' : 'Track payments'}</h3>
                  <p className="field-hint">
                    Manual records only. This is not payment processing or bank reconciliation.
                  </p>
                  <div className="document-balance">
                    <div>
                      <span>Document total incl. tax</span>
                      <strong>{formatMoney(balance.total, selected.snapshot?.currency)}</strong>
                    </div>
                    <div>
                      <span>
                        Recorded {selected.kind === 'credit' ? 'settlements' : 'payments'}
                      </span>
                      <strong>{formatMoney(balance.paid, selected.snapshot?.currency)}</strong>
                    </div>
                    <div className="document-outstanding">
                      <span>Outstanding</span>
                      <strong>
                        {formatMoney(balance.outstanding, selected.snapshot?.currency)}
                      </strong>
                    </div>
                    <span className={`badge document-payment-status status-${balance.status}`}>
                      {balanceLabel(balance.status, selected.kind === 'credit')}
                    </span>
                  </div>
                  {balance.status === 'unavailable' && (
                    <p className="notice warning">
                      A historical payment amount or date is invalid, future-dated, or exceeds the
                      document. Records stay preserved. Check the device clock and actual receipt
                      date; void an incorrect entry with a reason below to restore a dependable
                      balance.
                    </p>
                  )}
                  {!selected.voidedAt &&
                    balance.status !== 'paid' &&
                    balance.status !== 'unavailable' && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setAmount('');
                          initialPaymentDate.current = localDate(w.agency.timezone);
                          setDate(initialPaymentDate.current);
                          setReference('');
                          setNote('');
                          setPaymentId(id());
                          setModal('payment');
                          setError('');
                        }}
                      >
                        Record manual {selected.kind === 'credit' ? 'settlement' : 'payment'}
                      </button>
                    )}
                  <div className="document-payments">
                    <h3>{selected.kind === 'credit' ? 'Settlement history' : 'Payment history'}</h3>
                    {!w.payments.some((payment) => payment.documentId === selected.id) && (
                      <p>
                        No manual {selected.kind === 'credit' ? 'settlements' : 'payments'} recorded
                        yet.
                      </p>
                    )}
                    {w.payments
                      .filter((payment) => payment.documentId === selected.id)
                      .map((payment) => (
                        <article key={payment.id}>
                          <strong>
                            {formatMoney(payment.amount, selected.snapshot?.currency)} ·{' '}
                            {payment.receivedAt}
                          </strong>
                          <p>
                            {payment.reference || 'No payment reference'}
                            {payment.note ? ` · ${payment.note}` : ''}
                          </p>
                          {payment.voidedAt ? (
                            <p className="field-hint">Voided: {payment.voidReason}</p>
                          ) : (
                            <button
                              className="text-button danger"
                              onClick={() => {
                                setPaymentId(payment.id);
                                setReason('');
                                setModal('void-payment');
                                setError('');
                              }}
                            >
                              Void manual record
                            </button>
                          )}
                        </article>
                      ))}
                  </div>
                </>
              )}
              {selected.issuedAt && !selected.voidedAt && (
                <button
                  className="text-button danger"
                  onClick={() => {
                    setReason('');
                    setModal('void-document');
                    setError('');
                  }}
                >
                  Void document
                </button>
              )}
            </>
          ) : (
            <>
              <h2 tabIndex={-1}>Prepare a client document</h2>
              <p className="document-muted">
                {documentNames[kind]} for {change?.title || 'your change'} · Revision{' '}
                {change?.revision ?? '—'} · {change?.status ?? 'Select a change'}
              </p>
              <div
                className={`document-preparation-state ${missingReadiness.length || authoring.error || !change ? 'needs-review' : ''}`}
              >
                {missingReadiness.length || authoring.error || !change ? (
                  <CircleAlert size={17} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={17} aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {!change
                      ? 'Select a change to begin'
                      : missingReadiness.length
                        ? `${missingReadiness.length} ${missingReadiness.length === 1 ? 'detail' : 'details'} to complete`
                        : authoring.error
                          ? 'Review the document inputs'
                          : kind === 'brief'
                            ? 'Your brief is ready to save'
                            : `Your ${kind === 'credit' ? 'credit note' : 'invoice'} is ready to issue`}
                  </strong>
                  <span>
                    {missingReadiness.length
                      ? 'Choose a detail below to go straight to it.'
                      : kind === 'brief'
                        ? 'Review the preview, then save this version.'
                        : 'Review the preview before confirming the issued document.'}
                  </span>
                </div>
                {missingReadiness.length > 0 && (
                  <button className="text-button" onClick={() => focus(missingReadiness[0].target)}>
                    Fix first detail <ArrowDown size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              {missingReadiness.length > 0 && (
                <div className="document-required-details" aria-label="Details to finish">
                  <h3>Finish these details</h3>
                  <ul className="document-readiness">
                    {missingReadiness.map((item) => (
                      <li key={item.key} className="missing">
                        <CircleAlert size={15} aria-hidden="true" />
                        <button onClick={() => focus(item.target)} title={item.message}>
                          {item.label}
                          <span>{item.message}</span>
                        </button>
                        <ArrowRight size={15} aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                className="button primary"
                disabled={!readyToSave}
                onClick={() => {
                  setError('');
                  setModal('issue');
                }}
              >
                {preparationAction}
              </button>
              <p className="field-hint document-save-hint">
                {kind === 'brief'
                  ? 'Save keeps an exact copy in document history. It does not approve the change.'
                  : 'Issue keeps an exact copy in document history. Record received payments there.'}
              </p>
              <details className="disclosure-note document-draft-policy">
                <summary>Editable draft · saved with your workspace</summary>
                <p className="field-hint">
                  Your edits are saved on this device and included in workspace backups. Wait for
                  “Saved on this device” before closing. Each document type and change revision has
                  its own draft. Confirm a snapshot to preserve an exact version in document
                  history.
                </p>
              </details>
              <div className="document-settings-heading">
                <h3>Edit document details</h3>
                <p>Changes appear in the preview.</p>
              </div>
              <div className="document-settings-links" aria-label="Source document details">
                <button
                  className="text-button"
                  onClick={() => onNavigate({ view: 'settings', field: 'legal-name' })}
                >
                  Agency details <ArrowRight size={13} aria-hidden="true" />
                </button>
                <button
                  className="text-button"
                  disabled={!project}
                  onClick={() =>
                    onNavigate({
                      view: 'clients',
                      clientId: project?.clientId,
                      field: 'client-address',
                    })
                  }
                >
                  Client details <ArrowRight size={13} aria-hidden="true" />
                </button>
                <button
                  className="text-button"
                  disabled={!change}
                  onClick={() => onNavigate({ view: 'workspace', projectId, changeId })}
                >
                  Scope & approval <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
              <div className="document-fields">
                <div className="document-delivery-summary">
                  <span>Delivery timing</span>
                  <strong>
                    {change?.route === 'Defer'
                      ? 'No date commitment'
                      : `${change?.additionalDays || '0'} additional calendar days`}
                  </strong>
                  {preview?.deliveryDate && (
                    <p className="field-hint">
                      {preview.status === 'Approved' ? 'Agreed' : 'Proposed'} delivery:{' '}
                      {preview.deliveryDate}
                    </p>
                  )}
                  <button
                    className="text-button"
                    disabled={!change}
                    onClick={() =>
                      onNavigate({
                        view: 'workspace',
                        projectId,
                        changeId,
                        field: 'additional-days',
                      })
                    }
                  >
                    Edit delivery timing <ArrowRight size={13} />
                  </button>
                </div>
                {documentFields.map((key) => {
                  const label = {
                    reference: 'Document reference',
                    issueDate: 'Issue date',
                    dueDate: 'Due date',
                    taxRate: 'Manual tax percentage',
                    paymentInstructions: 'Payment instructions',
                    deliveryImplications: 'Delivery implications',
                    approvalText: 'Approval requirements',
                    footer: 'Document footer',
                  }[key];
                  return (
                    <label
                      className={`document-field ${['paymentInstructions', 'deliveryImplications', 'approvalText', 'footer'].includes(key) ? 'wide' : ''}`}
                      key={key}
                    >
                      <span>{label}</span>
                      {[
                        'paymentInstructions',
                        'deliveryImplications',
                        'approvalText',
                        'footer',
                      ].includes(key) ? (
                        <textarea
                          id={`document-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`}
                          aria-label={label}
                          rows={key === 'footer' ? 2 : 3}
                          value={overrides[key] ?? ''}
                          onChange={(event) =>
                            editOverrides({ ...overrides, [key]: event.target.value })
                          }
                        />
                      ) : (
                        <input
                          id={`document-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`}
                          type={key.endsWith('Date') ? 'date' : 'text'}
                          aria-label={label}
                          disabled={key === 'taxRate' && change?.feeMode === 'including-tax'}
                          value={overrides[key] ?? ''}
                          onChange={(event) =>
                            editOverrides({ ...overrides, [key]: event.target.value })
                          }
                        />
                      )}
                      {key === 'taxRate' && change?.feeMode === 'including-tax' && (
                        <span className="field-hint">
                          Uses the agreed tax-inclusive rate. Edit Choose a fee to change the
                          agreement.
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <details className="disclosure-note document-complete-checks">
                <summary>{completeReadiness.length} checks already complete</summary>
                <ul className="document-readiness">
                  {completeReadiness.map((item) => (
                    <li key={item.key} className="complete">
                      <CheckCircle2 size={15} aria-hidden="true" />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <p className="field-hint">
                Invoices require a recorded current-revision approval. Manual tax arithmetic is not
                a tax-compliance determination. Legal fields are never invented.
              </p>
            </>
          )}
          {(error || authoring.error) && (
            <p className="field-error" role="alert">
              {error || authoring.error}
            </p>
          )}
        </section>
        <section className="document-preview-panel">
          <div className="document-preview-heading">
            <div>
              <h2>
                {guidedBrief
                  ? kind === 'brief'
                    ? 'Client brief'
                    : documentNames[kind]
                  : 'Full-size document preview'}
              </h2>
              <p>
                {selected
                  ? 'Preserved document values'
                  : 'Current revision · editable document settings'}
                {!active
                  ? ' · DEMO watermark'
                  : mode === 'local-test' || mode === 'test'
                    ? ' · Local test activation'
                    : ''}
              </p>
            </div>
            {!guidedBrief && (
              <button
                className={exportStep ? 'button primary' : 'button secondary'}
                disabled={
                  exporting.busy ||
                  signatureBusy ||
                  !preview ||
                  !!selected?.voidedAt ||
                  (guidedBrief && !readyToSave)
                }
                onClick={downloadPreview}
              >
                {exporting.busy
                  ? 'Exporting PDF…'
                  : active
                    ? exportStep
                      ? 'Export PDF'
                      : 'Download PDF'
                    : 'Activate for PDF'}
              </button>
            )}
          </div>
          {!selected && !exportStep && (
            <SignatureEditor
              key={draftKey}
              value={overrides.signatures ?? emptySignatures(kind)}
              sections={overrides.sections ?? defaultSections()}
              kind={kind}
              onSectionsChange={(sections) => editOverrides({ ...overrides, sections })}
              onChange={(signatures) => editOverrides({ ...overrides, signatures })}
              onBusy={setSignatureBusy}
            />
          )}
          {exporting.busy && (
            <p className="notice" role="status">
              {exporting.message}
            </p>
          )}
          {exporting.error && (
            <p className="field-error" role="alert">
              {exporting.error}
            </p>
          )}
          {html ? (
            <iframe
              className="client-document-frame"
              title="Client document preview"
              sandbox=""
              srcDoc={html}
            />
          ) : (
            <div className="card document-empty">
              <h3>
                {selected
                  ? 'Original document contents unavailable'
                  : kind === 'brief'
                    ? 'Select a change to prepare a brief'
                    : kind === 'credit'
                      ? 'Complete the credit readiness checklist'
                      : 'Complete the invoice readiness checklist'}
              </h3>
              <p>
                {selected
                  ? 'This is a legacy metadata record. Its historical contents have not been fabricated or rebuilt from current defaults.'
                  : 'The document preview appears when required fields are valid. Missing legal or billing details remain visible in the checklist.'}
              </p>
            </div>
          )}
        </section>
      </div>
      {guidedBrief && onFlowStep && (
        <div className="flow-action-dock">
          {exporting.error && <p role="alert">{exporting.error}</p>}
          <div>
            <button className="button secondary" onClick={() => onFlowStep(exportStep ? 6 : 5)}>
              Back
            </button>
            <span>Step {flowStep} of 7</span>
            {exportStep ? (
              <button
                className="button primary"
                disabled={exporting.busy || !preview || !readyToSave}
                onClick={downloadPreview}
              >
                {exporting.busy ? 'Exporting PDF…' : active ? 'Export PDF' : 'Activate for PDF'}{' '}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={!readyToSave}
                onClick={() => onFlowStep(7)}
              >
                Continue to export <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
      <section className="card document-history">
        <div className="document-history-heading">
          <div>
            <h2 ref={historyHeading} tabIndex={-1}>
              Document history
            </h2>
            <p>Open a saved document to download it, record a payment or review its history.</p>
          </div>
          <span className="document-count">
            {history.length} of {projectDocuments.length}
          </span>
        </div>
        <div className="document-history-filters">
          <label>
            Change
            <select
              aria-label="Filter document change"
              value={changeFilter}
              onChange={(event) => setChangeFilter(event.target.value)}
            >
              <option value="all">All changes in project</option>
              {changes.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.title || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Filter document type"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="brief">Briefs</option>
              <option value="invoice">Invoices</option>
              <option value="credit">Credits</option>
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Filter document status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All documents</option>
              <option value="active">Active</option>
              <option value="voided">Voided</option>
            </select>
          </label>
        </div>
        {history.map((record) => {
          const state = balances.get(record.id)!;
          return (
            <button
              className={`document-history-row ${selectedId === record.id ? 'selected' : ''}`}
              key={record.id}
              onClick={() => {
                setSelectedId(record.id);
                setError('');
                onNavigate({
                  view: 'documents',
                  projectId: record.projectId,
                  changeId: record.changeId,
                  documentId: record.id,
                });
                requestAnimationFrame(() => {
                  controlsPanel.current?.scrollIntoView({ block: 'start' });
                  controlsPanel.current?.querySelector('h2')?.focus({ preventScroll: true });
                });
              }}
            >
              <span>
                <strong>{record.snapshot?.reference ?? 'Legacy document metadata'}</strong>
                <small>
                  {documentNames[record.kind]} · Revision {record.revision} ·{' '}
                  {recordedDateToDate(record.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </small>
              </span>
              <span className="document-history-amount">
                <strong>
                  {record.snapshot
                    ? formatMoney(record.snapshot.total, record.snapshot.currency)
                    : 'Original values unavailable'}
                </strong>
                {record.kind !== 'brief' && !record.voidedAt && record.snapshot && (
                  <small>
                    {state.status === 'unavailable'
                      ? 'Balance needs review'
                      : `${formatMoney(state.outstanding, record.snapshot.currency)} outstanding`}
                  </small>
                )}
              </span>
              <span
                className={`badge document-history-status ${record.voidedAt ? 'document-status-voided' : record.kind === 'brief' ? 'document-status-preserved' : `status-${state.status}`}`}
              >
                {record.voidedAt
                  ? 'Voided'
                  : record.kind === 'brief'
                    ? (record.snapshot?.status ?? 'Metadata')
                    : balanceLabel(state.status, record.kind === 'credit')}
              </span>
            </button>
          );
        })}
        {history.length === 0 && (
          <div className="document-history-empty">
            <p className="document-muted">
              {projectDocuments.length
                ? 'No documents match these filters. Clear the filters to review the project history.'
                : 'No saved documents yet. Prepare a brief or issue an approved invoice above.'}
            </p>
            {projectDocuments.length > 0 && (
              <button
                className="button secondary"
                onClick={() => {
                  setChangeFilter('all');
                  setKindFilter('all');
                  setStatusFilter('all');
                }}
              >
                Clear document filters
              </button>
            )}
          </div>
        )}
        {selected && (
          <details className="scope-details">
            <summary>Document activity</summary>
            {w.activity
              .filter((activity) => activity.documentId === selected.id)
              .map((activity) => (
                <p className="document-muted" key={activity.id}>
                  {activity.at.slice(0, 10)} · {activity.message}
                </p>
              ))}
          </details>
        )}
      </section>
      {modal === 'issue' && authoring.document && change && (
        <Modal
          title={
            kind === 'brief'
              ? 'Preserve this brief snapshot'
              : kind === 'credit'
                ? 'Confirm credit issue'
                : 'Confirm invoice issue'
          }
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            Preserve {authoring.document.reference} for {authoring.document.client.name}, revision{' '}
            {authoring.document.revision}. The exact client-facing values will stay unchanged when
            defaults or source records change.
          </p>
          <div className="notice">
            <strong>
              {kind === 'brief'
                ? 'Proposed fee'
                : kind === 'credit'
                  ? 'Total credit'
                  : 'Invoice total'}
              : {formatMoney(authoring.document.total, authoring.document.currency)}
            </strong>
            <p>
              {kind === 'brief'
                ? `This is a ${change.status.toLowerCase()} brief snapshot, not a new approval.`
                : 'The document uses the currently approved revision. Review the description, dates, tax and payment instructions.'}
            </p>
          </div>
          <p className="field-hint">
            Saving a local document does not activate PDF access or process a payment.
          </p>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() =>
                run(
                  () =>
                    forgetDocumentDraft(
                      issueDocument(w, change.id, kind, { ...overrides, demo: !active }),
                      draftKey,
                    ),
                  (next) => {
                    const issued = next.documents.at(-1)!;
                    setSelectedId(issued.id);
                    onNavigate({
                      view: 'documents',
                      projectId: issued.projectId,
                      changeId: issued.changeId,
                      documentId: issued.id,
                    });
                  },
                )
              }
            >
              {kind === 'brief'
                ? 'Confirm brief snapshot'
                : kind === 'credit'
                  ? 'Issue credit'
                  : 'Issue invoice'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'payment' && selected && (
        <Modal
          title={
            selected.kind === 'credit'
              ? 'Record a manual credit settlement'
              : 'Record a manual payment'
          }
          onClose={() => setModal(null)}
          dirty={
            amount !== '' || reference !== '' || note !== '' || date !== initialPaymentDate.current
          }
        >
          <p className="modal-intro">
            Record an actual received payment or outgoing credit settlement. A due date does not
            establish payment.
          </p>
          <label className="document-field">
            <span>Recorded amount</span>
            <input
              aria-label="Recorded amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="document-field">
            <span>Payment date</span>
            <input
              aria-label="Payment date"
              type="date"
              max={localDate(w.agency.timezone)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="document-field">
            <span>Payment reference</span>
            <input
              aria-label="Payment reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label className="document-field">
            <span>Private payment note</span>
            <textarea
              aria-label="Private payment note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" data-close-dialog onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() =>
                run(() =>
                  recordPayment(w, selected.id, { id: paymentId, amount, date, reference, note }),
                )
              }
            >
              Save manual record
            </button>
          </div>
        </Modal>
      )}
      {(modal === 'void-document' || modal === 'void-payment') && selected && (
        <Modal
          title={
            modal === 'void-document' ? 'Void preserved document' : 'Void manual payment record'
          }
          dirty={!!reason.trim()}
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            History stays preserved. Voiding a document retains every payment record; it does not
            refund money or erase the record.
          </p>
          <label className="document-field">
            <span>Reason for voiding</span>
            <textarea
              aria-label="Reason for voiding"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" data-close-dialog onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={!reason.trim()}
              onClick={() =>
                run(() =>
                  modal === 'void-document'
                    ? voidDocument(w, selected.id, reason)
                    : voidPayment(w, paymentId, reason),
                )
              }
            >
              Confirm void
            </button>
          </div>
        </Modal>
      )}
      {modal === 'reset-draft' && (
        <Modal title="Start a new document draft?" onClose={() => setModal(null)}>
          <p>
            Replace the unissued settings for this project, change and document type with current
            defaults? Saved snapshots stay preserved.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Keep editing
            </button>
            <button className="button primary" onClick={resetDraft}>
              Replace draft settings
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default DocumentsView;
