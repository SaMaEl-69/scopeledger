import { Money, calculate, parseAmount } from './finance';
import { canCreateProject } from './access';
import { defaultsReviewed } from './setup';
import { id, now } from './types';
import type {
  Workspace,
  Change,
  ClientDocument,
  DocumentRecord,
  PaymentRecord,
  CustomScenario,
  Scenario,
  AssumptionPreset,
} from './types';
import { validateClientDocument } from '../../shared/client-document.mjs';
import { calendarDate, localDate, recordedDateHasOccurred, recordedDateToDate } from './dates';
import { deliveryDays, addDeliveryDays, projectDeliveryDate } from './delivery';
import { feeAmounts } from '../../shared/fee-math.mjs';
export { calendarDate, localDate } from './dates';

export interface NavigateTarget {
  view: Workspace['context']['view'];
  projectId?: string;
  changeId?: string;
  documentId?: string;
  eventId?: string;
  clientId?: string;
  field?: string;
}
export interface ReadinessItem {
  key: string;
  label: string;
  complete: boolean;
  message: string;
  target: NavigateTarget;
}
import type { DocumentOverrides } from './types';
export type { DocumentOverrides } from './types';
const clone = <T>(value: T): T => structuredClone(value);
const finish = (w: Workspace): Workspace => ({ ...w, updatedAt: now() });
function records(w: Workspace, changeId: string) {
  const change = w.changes.find((record) => record.id === changeId);
  const project = w.projects.find((record) => record.id === change?.projectId);
  const client = w.clients.find((record) => record.id === project?.clientId);
  if (!change || !project || !client) throw new Error('Select a valid project, client and change.');
  const approvalRecord = w.approvals.find(
    (record) =>
      record.projectId === project.id &&
      record.changeId === change.id &&
      record.revision === change.revision &&
      !record.invalidatedAt,
  );
  const approval =
    approvalRecord?.evidence.trim() &&
    recordedDateHasOccurred(approvalRecord.approvedAt, localDate(w.agency.timezone))
      ? approvalRecord
      : undefined;
  const baseline =
    w.reconciliations.find((record) => record.changeId === change.id)?.before ?? project.baseline;
  return {
    change,
    project,
    client,
    approval,
    approvalNeedsReview: !!approvalRecord && !approval,
    calculation: calculate(baseline, change),
  };
}

/** This deliberate allowlist is the only client-facing transfer shape. */
export function buildBrief(
  w: Workspace,
  changeId: string,
  overrides: DocumentOverrides = {},
): ClientDocument {
  const { change, project, client, approval, approvalNeedsReview, calculation } = records(
    w,
    changeId,
  );
  const date = localDate(w.agency.timezone);
  const signed = calculation.effectiveFee === null ? null : new Money(calculation.effectiveFee);
  // A client document must not silently replace a fractional-cent agreement
  // with a rounded amount. Keep the estimate editable and show an unknown fee.
  const clientFee = signed?.eq(signed.toDecimalPlaces(2)) ? signed : null;
  const doc: ClientDocument = {
    schemaVersion: 1,
    kind: 'brief',
    reference: `BRF-${change.id.slice(0, 8)}-R${change.revision}`,
    agency: {
      name: w.agency.name,
      legalName: w.agency.legalName ?? '',
      address: w.agency.address ?? '',
      email: w.agency.email ?? '',
      website: w.agency.website ?? '',
      logoDataUrl: w.agency.logoDataUrl ?? '',
      accentColor: w.agency.accentColor ?? '#27695d',
    },
    client: {
      name: client.name,
      contact: client.contact,
      email: client.email,
      address: client.address ?? '',
    },
    projectName: project.name,
    changeTitle: change.title,
    changeReference: change.id,
    revision: change.revision,
    status: change.status === 'Approved' && !approval ? 'Approval requires review' : change.status,
    currency: project.currency,
    issueDate: date,
    dueDate: '',
    scope: change.request,
    deliverables: change.deliverables,
    removedScope: change.removedScope,
    exclusions: change.exclusions,
    dependencies: change.dependencies,
    assumptions: change.assumptions,
    deliveryImplications: w.agency.deliveryImplications ?? '',
    approvalText:
      w.agency.approvalText?.trim() ||
      (change.route === 'Defer'
        ? 'Deferred request: no delivery or fee commitment.'
        : 'Please confirm the scope, fee and dependencies in writing before additional work begins. Existing agreement terms apply.'),
    approvalRecorded: approval ? `Approval recorded for revision ${change.revision}.` : '',
    approvalDate: approval
      ? calendarDate(approval.approvedAt)
        ? approval.approvedAt
        : localDate(w.agency.timezone, recordedDateToDate(approval.approvedAt))
      : '',
    description: `${change.title}\n${change.request}\n${change.deliverables}`,
    subtotal: clientFee?.toFixed(2) ?? '',
    taxRate: change.taxRate ?? '0',
    tax: clientFee ? '0.00' : '',
    total: clientFee?.toFixed(2) ?? '',
    paymentInstructions: '',
    footer: w.agency.documentFooter ?? '',
    demo: true,
    feeMode: change.feeMode ?? 'excluding-tax',
    additionalDays:
      change.route === 'Defer'
        ? '0'
        : deliveryDays(change.additionalDays) === null
          ? ''
          : String(deliveryDays(change.additionalDays)),
    deliveryDate:
      change.route === 'Defer'
        ? ''
        : ((change.includedAt
            ? w.reconciliations.find((record) => record.changeId === changeId)?.deliveryDate || null
            : addDeliveryDays(
                projectDeliveryDate(project),
                deliveryDays(change.additionalDays) ?? 0,
              )) ?? ''),
    ...overrides,
  };
  doc.reference = doc.reference.trim();
  if (change.route === 'Defer')
    doc.approvalText =
      'Deferred request: no delivery, date or fee commitment. The request must be reviewed and agreed before work is scheduled.';
  else if (!change.contractConfirmed && !approval)
    doc.approvalText = `Contract review is pending; proposed terms remain subject to the existing agreement. ${doc.approvalText}`;
  if (approvalNeedsReview)
    doc.approvalText = `The recorded approval requires review. Check the evidence, device clock and actual date, or reopen the decision and record fresh approval. ${doc.approvalText}`;
  if (signed?.isNegative())
    doc.description = `${doc.description}\nExplicit client credit: ${change.creditReason}`;
  // Editable document fields remain drafts; only executable values cross the rendering boundary.
  if (!calendarDate(doc.issueDate)) doc.issueDate = '';
  if (!calendarDate(doc.dueDate) || (doc.issueDate && doc.dueDate < doc.issueDate))
    doc.dueDate = '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(doc.taxRate) || new Money(doc.taxRate).gt(100)) doc.taxRate = '';
  if (doc.feeMode === 'including-tax')
    doc.taxRate = calculation.errors.taxRate ? '' : new Money(change.taxRate ?? '0').toString();
  if (clientFee && doc.taxRate !== '') {
    const amount =
      doc.feeMode === 'including-tax' && change.route !== 'Absorb'
        ? new Money(change.fee).minus(change.credit).toString()
        : clientFee.toString();
    Object.assign(doc, feeAmounts(amount, doc.taxRate, doc.feeMode));
  } else if (doc.taxRate === '') {
    doc.tax = '';
    doc.total = '';
    doc.subtotal = '';
  }
  return validateClientDocument(doc);
}

export function documentReadiness(
  w: Workspace,
  changeId: string,
  kind: ClientDocument['kind'],
  overrides: DocumentOverrides = {},
): ReadinessItem[] {
  const { change, project, client, approval, calculation } = records(w, changeId);
  const doc = buildBrief(w, changeId, overrides);
  const fields: ReadinessItem[] = [];
  const add = (
    key: string,
    label: string,
    complete: boolean,
    message: string,
    target: NavigateTarget,
  ) => fields.push({ key, label, complete, message, target });
  add(
    'source',
    'Active project and change',
    !project.archivedAt && !project.deletedAt && !change.archivedAt && !change.deletedAt,
    'Recover or unarchive the source project and change before preserving a new document. Existing documents stay available in history.',
    {
      view: project.archivedAt || project.deletedAt ? 'projects' : 'workspace',
      projectId: project.id,
      changeId,
    },
  );
  add('agency.name', 'Agency identity', !!doc.agency.name.trim(), 'Enter the agency name.', {
    view: 'settings',
    field: 'agency-name',
  });
  if (!project.sample)
    add(
      'agency.defaults',
      'Studio defaults reviewed',
      defaultsReviewed(w.agency),
      'Confirm your studio name, currency, loaded cost and target margin in Settings before issuing documents for real work.',
      { view: 'settings', field: 'agency-name' },
    );
  add('client.name', 'Client identity', !!client.name.trim(), 'Enter the client name.', {
    view: 'clients',
    clientId: client.id,
    field: 'client-name',
  });
  const projectDays = deliveryDays(project.additionalDays, 36500),
    changeDays = deliveryDays(change.additionalDays);
  add(
    'delivery',
    'Valid delivery days',
    change.route === 'Defer' ||
      (projectDays !== null &&
        changeDays !== null &&
        (!project.deadline || !!doc.deliveryDate || !!change.includedAt)),
    'Enter whole calendar days and review the adjusted project delivery date.',
    {
      view: 'workspace',
      projectId: project.id,
      changeId,
      field: projectDays === null ? 'project-additional-days' : 'additional-days',
    },
  );
  add(
    'scope',
    'Scope and deliverables',
    !!change.title.trim() && !!change.request.trim() && !!change.deliverables.trim(),
    'Complete the request title, scope and deliverables.',
    { view: 'workspace', projectId: project.id, changeId, field: 'request-title' },
  );
  add(
    'reference',
    'Unique document reference',
    !!doc.reference.trim() &&
      !w.documents.some(
        (record) =>
          record.snapshot?.reference.trim().toLocaleLowerCase() ===
          doc.reference.trim().toLocaleLowerCase(),
      ),
    'Enter a unique document reference; issued and voided references stay reserved.',
    { view: 'documents', field: 'document-reference' },
  );
  const issueDate = overrides.issueDate ?? doc.issueDate,
    dueDate = overrides.dueDate ?? doc.dueDate;
  add('issueDate', 'Valid issue date', calendarDate(issueDate), 'Enter a real calendar date.', {
    view: 'documents',
    field: 'document-issue-date',
  });
  add(
    'approvalText',
    'Approval requirements or recorded approval',
    !!approval ||
      change.route === 'Defer' ||
      !!(overrides.approvalText ?? w.agency.approvalText ?? doc.approvalText).trim(),
    'State the client approval requirements before preserving the brief.',
    { view: 'documents', field: 'document-approval-text' },
  );
  if (kind === 'brief') {
    const fee = calculation.effectiveFee === null ? null : new Money(calculation.effectiveFee);
    add(
      'briefAmount',
      'Client fee in whole currency cents',
      !fee || fee.eq(fee.toDecimalPlaces(2)),
      'Review the fractional-cent client fee before preserving this brief. The original draft amount has not been rounded or changed.',
      { view: 'workspace', projectId: project.id, changeId, field: 'proposed-fee' },
    );
    add(
      'taxRate',
      'Valid tax percentage',
      change.route === 'Defer' || !calculation.errors.taxRate,
      'Enter a tax percentage from 0 to 100 with at most two decimals.',
      { view: 'workspace', projectId: project.id, changeId, field: 'fee-tax-rate' },
    );
  } else {
    add(
      'approval',
      'Approval for this revision',
      change.status === 'Approved' && !!approval?.evidence.trim(),
      'Record approval evidence for the current revision before invoicing. If imported evidence is future-dated, review the device clock and actual date or reopen and reconfirm the decision.',
      { view: 'workspace', projectId: project.id, changeId, field: 'commercial-results' },
    );
    add(
      'agency.legal',
      'Issuer legal details',
      !!doc.agency.legalName.trim() && !!doc.agency.address.trim() && !!doc.agency.email.trim(),
      'Complete issuer legal name, address and email. No seller details are assumed.',
      { view: 'settings', field: 'legal-name' },
    );
    add(
      'client.address',
      'Client billing details',
      !!doc.client.address.trim(),
      'Enter the client billing address.',
      { view: 'clients', clientId: client.id, field: 'client-address' },
    );
    add(
      'dueDate',
      'Issue and due dates',
      calendarDate(dueDate) && dueDate >= issueDate,
      'The due date must be a real date on or after the issue date.',
      { view: 'documents', field: 'document-due-date' },
    );
    add(
      'paymentInstructions',
      'Payment instructions',
      !!doc.paymentInstructions.trim(),
      'Enter the agreed payment or credit instructions.',
      { view: 'documents', field: 'document-payment-instructions' },
    );
    const fee = calculation.effectiveFee === null ? null : new Money(calculation.effectiveFee);
    add(
      'amount',
      'Approved amount in currency cents',
      calculation.valid && !!fee && !fee.isZero() && fee.eq(fee.toDecimalPlaces(2)),
      'Complete valid approved terms with a nonzero fee in whole currency cents. Review fractional-cent client fees before invoicing.',
      { view: 'workspace', projectId: project.id, changeId, field: 'proposed-fee' },
    );
    add(
      'kind',
      'Invoice or explicit credit',
      !!fee &&
        (kind === 'credit' ? fee.isNegative() && !!change.creditReason.trim() : fee.isPositive()),
      'Use a credit document for a negative agreed adjustment, with an explicit credit reason.',
      { view: 'documents', field: 'document-kind' },
    );
    add(
      'alreadyIssued',
      'No duplicate charge for this revision',
      !w.documents.some(
        (record) =>
          record.changeId === changeId &&
          record.revision === change.revision &&
          record.kind !== 'brief' &&
          record.issuedAt &&
          !record.voidedAt,
      ),
      'This revision already has an issued invoice or credit. Review its history rather than invoicing it again.',
      { view: 'documents', projectId: project.id, changeId },
    );
    const errors: Record<string, string> = {};
    const taxText = overrides.taxRate ?? doc.taxRate;
    const tax = parseAmount(taxText, 'taxRate', errors, 'Tax percentage');
    add(
      'taxRate',
      'Manual tax percentage',
      !!tax &&
        tax.lte(100) &&
        tax.eq(tax.toDecimalPlaces(2)) &&
        (change.feeMode !== 'including-tax' || tax.eq(change.taxRate ?? '0')),
      change.feeMode === 'including-tax'
        ? 'Tax-inclusive invoices use the tax rate agreed in Choose a fee. Review the source agreement to change it.'
        : 'Enter a manual tax percentage from 0 to 100 with at most two decimal places. This is arithmetic, not tax-compliance advice.',
      { view: 'documents', field: 'document-tax-rate' },
    );
  }
  return fields;
}

export function buildInvoice(
  w: Workspace,
  changeId: string,
  overrides: DocumentOverrides = {},
  kind: 'invoice' | 'credit' = 'invoice',
): ClientDocument {
  const defaults: DocumentOverrides = {
    reference: `${w.agency.invoicePrefix?.trim() || (kind === 'credit' ? 'CR' : 'INV')}-${String(w.documents.length + 1).padStart(4, '0')}`,
    taxRate:
      w.changes.find((change) => change.id === changeId)?.taxRate ?? w.agency.defaultTaxRate ?? '0',
    paymentInstructions: w.agency.paymentInstructions ?? '',
    ...overrides,
  };
  const readiness = documentReadiness(w, changeId, kind, defaults);
  const missing = readiness.filter((item) => !item.complete);
  if (missing.length) throw new Error(missing.map((item) => item.message).join(' '));
  const doc = buildBrief(w, changeId, defaults);
  return validateClientDocument({
    ...doc,
    kind,
    subtotal: new Money(doc.subtotal).abs().toFixed(2),
    taxRate: new Money(doc.taxRate).toString(),
    tax: new Money(doc.tax).abs().toFixed(2),
    total: new Money(doc.total).abs().toFixed(2),
  });
}

export function issueDocument(
  w: Workspace,
  changeId: string,
  kind: ClientDocument['kind'],
  overrides: DocumentOverrides = {},
): Workspace {
  const ready = documentReadiness(
    w,
    changeId,
    kind,
    kind === 'brief'
      ? overrides
      : {
          reference: `${w.agency.invoicePrefix?.trim() || (kind === 'credit' ? 'CR' : 'INV')}-${String(w.documents.length + 1).padStart(4, '0')}`,
          paymentInstructions: w.agency.paymentInstructions ?? '',
          taxRate:
            w.changes.find((change) => change.id === changeId)?.taxRate ??
            w.agency.defaultTaxRate ??
            '0',
          ...overrides,
        },
  );
  const missing = ready.filter((item) => !item.complete);
  if (missing.length) throw new Error(missing.map((item) => item.message).join(' '));
  const snapshot =
    kind === 'brief'
      ? buildBrief(w, changeId, overrides)
      : buildInvoice(w, changeId, overrides, kind);
  const change = w.changes.find((record) => record.id === changeId)!;
  const at = now(),
    document: DocumentRecord = {
      id: id(),
      projectId: change.projectId,
      changeId,
      revision: change.revision,
      kind,
      createdAt: at,
      snapshot: clone(snapshot),
      issuedAt: at,
      voidedAt: null,
      voidReason: '',
    };
  return finish({
    ...w,
    documents: [...w.documents, document],
    activity: [
      ...w.activity,
      {
        id: id(),
        at,
        kind: 'document-issued',
        message: `${kind === 'brief' ? 'Brief snapshot saved' : kind === 'credit' ? 'Credit issued' : 'Invoice issued'}: ${snapshot.reference}`,
        projectId: change.projectId,
        changeId,
        documentId: document.id,
      },
    ],
  });
}

export interface PaymentBalance {
  status: 'unavailable' | 'unpaid' | 'partial' | 'paid' | 'voided';
  total: string | null;
  paid: string | null;
  outstanding: string | null;
}

function summarizePayments(
  document: DocumentRecord | undefined,
  payments: readonly PaymentRecord[],
  clock: { today: string; time: number },
): PaymentBalance {
  const unknownStatus = document?.voidedAt ? ('voided' as const) : ('unavailable' as const);
  if (!document?.snapshot || !document.issuedAt || document.kind === 'brief')
    return { status: unknownStatus, total: null, paid: null, outstanding: null };
  const errors: Record<string, string> = {},
    total = parseAmount(document.snapshot.total, 'total', errors, 'Document total');
  if (!total || !total.eq(total.toDecimalPlaces(2)))
    return { status: unknownStatus, total: null, paid: null, outstanding: null };
  let paid = new Money(0);
  for (const payment of payments) {
    if (payment.voidedAt) continue;
    const amount = parseAmount(payment.amount, 'payment', errors, 'Recorded payment');
    if (
      !amount ||
      amount.lte(0) ||
      !amount.eq(amount.toDecimalPlaces(2)) ||
      !recordedDateHasOccurred(payment.receivedAt, clock.today, clock.time)
    )
      return {
        status: unknownStatus,
        total: total.toFixed(2),
        paid: null,
        outstanding: null,
      };
    paid = paid.plus(amount);
  }
  if (paid.gt(total))
    return {
      status: unknownStatus,
      total: total.toFixed(2),
      paid: null,
      outstanding: null,
    };
  return {
    status: document.voidedAt
      ? ('voided' as const)
      : paid.gte(total)
        ? ('paid' as const)
        : paid.gt(0)
          ? ('partial' as const)
          : ('unpaid' as const),
    total: total.toFixed(2),
    paid: paid.toFixed(2),
    outstanding: Money.max(0, total.minus(paid)).toFixed(2),
  };
}

function paymentClock(w: Workspace, current: Date | string) {
  const instant = typeof current === 'string' ? recordedDateToDate(current) : current;
  return { today: localDate(w.agency.timezone, instant), time: instant.getTime() };
}

export function paymentBalance(
  w: Workspace,
  documentId: string,
  current: Date | string = new Date(),
): PaymentBalance {
  return summarizePayments(
    w.documents.find((record) => record.id === documentId),
    w.payments.filter((record) => record.documentId === documentId),
    paymentClock(w, current),
  );
}

/** One shared pass for document histories, dashboards and calendars. */
export function paymentBalances(
  w: Workspace,
  current: Date | string = new Date(),
): Map<string, PaymentBalance> {
  const clock = paymentClock(w, current);
  const buckets = new Map<string, PaymentRecord[]>();
  for (const payment of w.payments) {
    const bucket = buckets.get(payment.documentId);
    if (bucket) bucket.push(payment);
    else buckets.set(payment.documentId, [payment]);
  }
  return new Map(
    w.documents.map((document) => [
      document.id,
      summarizePayments(document, buckets.get(document.id) ?? [], clock),
    ]),
  );
}

export function recordPayment(
  w: Workspace,
  documentId: string,
  input: { id: string; amount: string; date: string; reference?: string; note?: string },
): Workspace {
  const errors: Record<string, string> = {},
    amount = parseAmount(input.amount, 'amount', errors, 'Payment amount');
  if (!amount || amount.lte(0) || !amount.eq(amount.toDecimalPlaces(2)))
    throw new Error('Enter a positive payment amount in whole currency cents.');
  const existing = w.payments.find((payment) => payment.id === input.id);
  if (existing) {
    if (
      existing.documentId === documentId &&
      new Money(existing.amount).eq(amount) &&
      existing.receivedAt === input.date &&
      (existing.reference ?? '') === (input.reference ?? '') &&
      (existing.note ?? '') === (input.note ?? '')
    )
      return w;
    throw new Error('This payment identity has already been used for different details.');
  }
  const document = w.documents.find((record) => record.id === documentId);
  if (!document?.snapshot || !document.issuedAt || document.kind === 'brief' || document.voidedAt)
    throw new Error('Record a manual payment only against an active issued invoice or credit.');
  if (!input.id.trim()) throw new Error('A stable payment identity is required.');
  if (!calendarDate(input.date) || input.date > localDate(w.agency.timezone))
    throw new Error('Enter a real payment date that is not in the future.');
  const balance = paymentBalance(w, documentId);
  if (balance.outstanding === null)
    throw new Error(
      'Review invalid, future-dated or overpaid historical payment records before recording another payment. Check the device clock or void an incorrect entry with a reason.',
    );
  if (amount.gt(balance.outstanding!))
    throw new Error('The recorded amount exceeds the outstanding document balance.');
  const at = now(),
    payment: PaymentRecord = {
      id: input.id,
      projectId: document.projectId,
      documentId,
      amount: amount.toFixed(2),
      receivedAt: input.date,
      reference: input.reference ?? '',
      note: input.note ?? '',
      createdAt: at,
      voidedAt: null,
      voidReason: '',
    };
  return finish({
    ...w,
    payments: [...w.payments, payment],
    activity: [
      ...w.activity,
      {
        id: id(),
        at,
        kind: 'payment-recorded',
        message: `Manual ${document.kind === 'credit' ? 'credit settlement' : 'payment'} recorded: ${amount.toFixed(2)} ${document.snapshot.currency}`,
        projectId: document.projectId,
        documentId,
      },
    ],
  });
}

export function voidPayment(w: Workspace, paymentId: string, reason: string): Workspace {
  const payment = w.payments.find((record) => record.id === paymentId);
  if (!payment) throw new Error('Payment not found.');
  if (!reason.trim()) throw new Error('Record a reason before voiding a manual payment.');
  if (payment.voidedAt) return w;
  const at = now();
  return finish({
    ...w,
    payments: w.payments.map((record) =>
      record.id === paymentId ? { ...record, voidedAt: at, voidReason: reason.trim() } : record,
    ),
    activity: [
      ...w.activity,
      {
        id: id(),
        at,
        kind: 'payment-voided',
        message: `Manual payment voided: ${reason.trim()}`,
        projectId: payment.projectId,
        documentId: payment.documentId,
      },
    ],
  });
}

export function voidDocument(w: Workspace, documentId: string, reason: string): Workspace {
  const document = w.documents.find((record) => record.id === documentId);
  if (!document?.snapshot || !document.issuedAt)
    throw new Error('Only an issued document can be voided.');
  if (!reason.trim())
    throw new Error(
      'Record a reason before voiding an issued document. Payments will remain in history.',
    );
  if (document.voidedAt) return w;
  const at = now();
  return finish({
    ...w,
    documents: w.documents.map((record) =>
      record.id === documentId ? { ...record, voidedAt: at, voidReason: reason.trim() } : record,
    ),
    activity: [
      ...w.activity,
      {
        id: id(),
        at,
        kind: 'document-voided',
        message: `Document voided; recorded payments retained: ${reason.trim()}`,
        projectId: document.projectId,
        changeId: document.changeId,
        documentId,
      },
    ],
  });
}

export function duplicateProject(
  w: Workspace,
  projectId: string,
  options: {
    name: string;
    carryBaseline: boolean;
    carryChanges: boolean;
    carryHistory?: boolean;
    activated?: boolean;
  },
): Workspace {
  if (!options.activated && !canCreateProject(w))
    throw new Error('Additional custom projects require verified activation.');
  const source = w.projects.find((project) => project.id === projectId);
  if (!source || source.deletedAt) throw new Error('Recover this project before duplicating it.');
  if (!options.name.trim()) throw new Error('Enter a name for the duplicated project.');
  if (options.carryHistory && !options.carryChanges)
    throw new Error('Copy changes before copying their historical revisions.');
  const at = now(),
    projectIdCopy = id();
  const baseline = options.carryBaseline
    ? clone(source.baseline)
    : { fee: '', actual: '', remaining: '', target: w.agency.defaultTarget, approvedScope: '' };
  const project = {
    ...clone(source),
    id: projectIdCopy,
    name: options.name.trim(),
    sample: false,
    baseline,
    originalBaseline: clone(baseline),
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
    deadline: null,
    state: 'active' as const,
  };
  const mapping = new Map<string, string>();
  const changes: Change[] = options.carryChanges
    ? w.changes
        .filter((change) => change.projectId === projectId && !change.deletedAt)
        .map((change) => {
          const changeId = id();
          mapping.set(change.id, changeId);
          return {
            ...clone(change),
            id: changeId,
            projectId: projectIdCopy,
            revision: options.carryHistory ? change.revision + 1 : 1,
            status: 'Draft',
            contractConfirmed: false,
            includedAt: null,
            archivedAt: null,
            deletedAt: null,
            createdAt: at,
            updatedAt: at,
          };
        })
    : [];
  const revisions = options.carryHistory
    ? w.revisions
        .filter((revision) => mapping.has(revision.changeId))
        .map((revision) => ({
          ...clone(revision),
          id: id(),
          projectId: projectIdCopy,
          changeId: mapping.get(revision.changeId)!,
          reason: `Copied historical record — requires new approval. ${revision.reason}`,
          change: {
            ...clone(revision.change),
            id: mapping.get(revision.changeId)!,
            projectId: projectIdCopy,
            status: 'Draft' as const,
            contractConfirmed: false,
            includedAt: null,
          },
        }))
    : [];
  return finish({
    ...w,
    projects: [...w.projects, project],
    changes: [...w.changes, ...changes],
    revisions: [...w.revisions, ...revisions],
    context: {
      ...w.context,
      projectId: projectIdCopy,
      changeId: changes[0]?.id ?? '',
      view: 'workspace',
    },
    activity: [
      ...w.activity,
      {
        id: id(),
        at,
        kind: 'project-duplicated',
        message: `Duplicated ${source.name}; copied decisions are drafts and require new approval.`,
        projectId: projectIdCopy,
      },
    ],
  });
}

export function saveCustomScenario(
  w: Workspace,
  scenario: Scenario,
  scenarioId?: string,
): Workspace {
  if (!scenario.title.trim() || !scenario.request.trim())
    throw new Error('A reusable scenario needs a title and request wording.');
  const at = now(),
    existing = w.customScenarios.find((record) => record.id === scenarioId);
  const record: CustomScenario = {
    ...clone(scenario),
    id: existing?.id ?? id(),
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    deletedAt: null,
  };
  return finish({
    ...w,
    customScenarios: existing
      ? w.customScenarios.map((item) => (item.id === existing.id ? record : item))
      : [...w.customScenarios, record],
  });
}
export function setScenarioDeleted(w: Workspace, scenarioId: string, deleted: boolean): Workspace {
  return finish({
    ...w,
    customScenarios: w.customScenarios.map((record) =>
      record.id === scenarioId
        ? { ...record, deletedAt: deleted ? now() : null, updatedAt: now() }
        : record,
    ),
  });
}
export function saveAssumption(
  w: Workspace,
  title: string,
  text: string,
  presetId?: string,
): Workspace {
  if (!title.trim() || !text.trim())
    throw new Error('A reusable assumption needs a title and text.');
  const existing = w.assumptionPresets.find((record) => record.id === presetId),
    record: AssumptionPreset = {
      id: existing?.id ?? id(),
      title: title.trim(),
      text: text.trim(),
      deletedAt: null,
    };
  return finish({
    ...w,
    assumptionPresets: existing
      ? w.assumptionPresets.map((item) => (item.id === existing.id ? record : item))
      : [...w.assumptionPresets, record],
  });
}
export function setAssumptionDeleted(w: Workspace, presetId: string, deleted: boolean): Workspace {
  return finish({
    ...w,
    assumptionPresets: w.assumptionPresets.map((record) =>
      record.id === presetId ? { ...record, deletedAt: deleted ? now() : null } : record,
    ),
  });
}
