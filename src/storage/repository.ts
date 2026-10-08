import type { Baseline, Change, Project, Workspace } from '../domain/types';
import { isWithinDemoAllowance } from '../domain/access';
import {
  logoDimensions,
  signatureDimensions,
  validateClientDocument,
} from '../../shared/client-document.mjs';
import {
  isDateOnly,
  isPersistedDate,
  validTimezone,
  validateEventDates,
} from '../operational/dates';

/** The same UTF-8 limit applies to local saves, backup exports, and restores. */
export const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
export const DATABASE_VERSION = 1;
export const WORKSPACE_STORE = 'workspace';
export const EVENTS_CHANNEL = 'scopeledger-core-events';
const TEXT_LIMIT = 100_000;
const NUMBER_LIMIT = 1_000;
const currencies = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'];
const classifications = ['Addition', 'Included', 'Defect', 'Ambiguous'];
const routes = ['Quote', 'Absorb', 'Exchange', 'Defer'];
const statuses = ['Draft', 'Quoted', 'Approved', 'Rejected'];

export class WorkspaceValidationError extends Error {
  readonly code = 'INVALID_WORKSPACE';
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}
export class StorageConflictError extends Error {
  readonly code = 'STORAGE_CONFLICT';
  constructor() {
    super(
      'Another tab saved a newer workspace. Export your current work, then reload the saved version.',
    );
    this.name = 'StorageConflictError';
  }
}
export class StorageRecoveryError extends Error {
  readonly code = 'RECOVERY_REQUIRED';
  constructor() {
    super(
      'Stored data needs recovery. Export the recovery copy before deliberately restoring a backup or the previous saved version.',
    );
    this.name = 'StorageRecoveryError';
  }
}
export class StorageUnavailableError extends Error {
  readonly code = 'STORAGE_UNAVAILABLE';
  constructor(
    message = 'Local storage is unavailable. Keep this tab open and export a backup of your work.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

function fail(path: string, message: string): never {
  throw new WorkspaceValidationError(`${path}: ${message}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, 'expected a plain object');
  return value as Record<string, unknown>;
}
function shape(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const item = object(value, path);
  for (const key of required)
    if (!Object.hasOwn(item, key)) fail(`${path}.${key}`, 'missing field');
  for (const key of Object.keys(item))
    if (!required.includes(key) && !optional.includes(key))
      fail(`${path}.${key}`, 'unrecognized field');
  return item;
}
function string(value: unknown, path: string, max = TEXT_LIMIT): asserts value is string {
  if (typeof value !== 'string') fail(path, 'expected text; values are never coerced');
  if (value.length > max)
    fail(path, `must contain at most ${max.toLocaleString('en-US')} characters`);
}
function identity(value: unknown, path: string, optional = false): asserts value is string {
  string(value, path, 100);
  if (!optional && !value.trim()) fail(path, 'identity cannot be empty');
}
function enumeration(value: unknown, path: string, allowed: readonly string[]) {
  if (typeof value !== 'string' || !allowed.includes(value))
    fail(path, `expected ${allowed.join(', ')}`);
}
function integer(value: unknown, path: string, min = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    fail(path, `expected a safe integer of at least ${min}`);
}
function boolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') fail(path, 'expected true or false');
}
function date(value: unknown, path: string, nullable = false) {
  if (nullable && value === null) return;
  string(value, path, 100);
  if (!isPersistedDate(value))
    fail(path, 'expected a real YYYY-MM-DD date or ISO timestamp with an explicit UTC offset');
}
function fields(
  item: Record<string, unknown>,
  path: string,
  names: readonly string[],
  max = TEXT_LIMIT,
) {
  for (const name of names) string(item[name], `${path}.${name}`, max);
}
const baselineKeys = ['fee', 'actual', 'remaining', 'target', 'approvedScope'];
function baseline(value: unknown, path: string) {
  const item = shape(value, path, baselineKeys);
  fields(item, path, baselineKeys.slice(0, 4), NUMBER_LIMIT);
  string(item.approvedScope, `${path}.approvedScope`);
}
const termText = [
  'title',
  'request',
  'deliverables',
  'exclusions',
  'dependencies',
  'assumptions',
  'contractChecks',
  'removedScope',
  'creditReason',
];
const termNumeric = ['hours', 'rate', 'outside', 'removed', 'fee', 'credit'];
const changeKeys = [
  ...termText,
  ...termNumeric,
  'classification',
  'route',
  'contractConfirmed',
  'id',
  'projectId',
  'revision',
  'status',
  'createdAt',
  'updatedAt',
  'archivedAt',
  'deletedAt',
  'includedAt',
];
function validateChange(value: unknown, path: string) {
  const item = shape(value, path, changeKeys);
  identity(item.id, `${path}.id`);
  identity(item.projectId, `${path}.projectId`);
  fields(item, path, termText);
  fields(item, path, termNumeric, NUMBER_LIMIT);
  enumeration(item.classification, `${path}.classification`, classifications);
  enumeration(item.route, `${path}.route`, routes);
  enumeration(item.status, `${path}.status`, statuses);
  boolean(item.contractConfirmed, `${path}.contractConfirmed`);
  integer(item.revision, `${path}.revision`, 1);
  date(item.createdAt, `${path}.createdAt`);
  date(item.updatedAt, `${path}.updatedAt`);
  for (const name of ['archivedAt', 'deletedAt', 'includedAt'])
    date(item[name], `${path}.${name}`, true);
}
function list(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected a list');
  if (value.length > max) fail(path, `too many records (maximum ${max})`);
  return value;
}
function unique(items: { id: string }[], path: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(path, `duplicate identity ${item.id}`);
    seen.add(item.id);
  }
}
const workspaceKeys = [
  'schemaVersion',
  'id',
  'sequence',
  'updatedAt',
  'agency',
  'clients',
  'projects',
  'changes',
  'revisions',
  'approvals',
  'reconciliations',
  'documents',
  'payments',
  'calendarEvents',
  'activity',
  'customScenarios',
  'assumptionPresets',
  'comparisons',
  'context',
];
const extensionKeys = ['activity', 'customScenarios', 'assumptionPresets', 'comparisons'];
const agencyTextKeys = [
  'legalName',
  'address',
  'email',
  'website',
  'invoicePrefix',
  'paymentInstructions',
  'documentFooter',
  'approvalText',
  'deliveryImplications',
];
function validateTerms(value: unknown, path: string) {
  const terms = shape(value, path, [
    ...termText,
    ...termNumeric,
    'classification',
    'route',
    'contractConfirmed',
  ]);
  fields(terms, path, termText);
  fields(terms, path, termNumeric, NUMBER_LIMIT);
  enumeration(terms.classification, `${path}.classification`, classifications);
  enumeration(terms.route, `${path}.route`, routes);
  boolean(terms.contractConfirmed, `${path}.contractConfirmed`);
}

/** Storage validates structure and relationships. Unfinished numeric drafts stay verbatim. */
export function validateWorkspace(value: unknown): asserts value is Workspace {
  const item = shape(value, 'workspace', workspaceKeys, ['documentDrafts']);
  if (item.schemaVersion !== 3) fail('workspace.schemaVersion', 'unsupported schema version');
  identity(item.id, 'workspace.id');
  integer(item.sequence, 'workspace.sequence');
  date(item.updatedAt, 'workspace.updatedAt');
  if (item.documentDrafts !== undefined) {
    list(item.documentDrafts, 'documentDrafts', 10_000).forEach((value, index) => {
      const path = `documentDrafts[${index}]`;
      const draft = shape(value, path, [
        'projectId',
        'changeId',
        'revision',
        'kind',
        'updatedAt',
        'values',
      ]);
      identity(draft.projectId, `${path}.projectId`);
      identity(draft.changeId, `${path}.changeId`);
      integer(draft.revision, `${path}.revision`, 1);
      enumeration(draft.kind, `${path}.kind`, ['brief', 'invoice', 'credit']);
      date(draft.updatedAt, `${path}.updatedAt`);
      const fields = shape(
        draft.values,
        `${path}.values`,
        [],
        [
          'reference',
          'issueDate',
          'dueDate',
          'taxRate',
          'paymentInstructions',
          'deliveryImplications',
          'approvalText',
          'description',
          'footer',
          'demo',
          'signatures',
        ],
      );
      for (const [key, input] of Object.entries(fields)) {
        if (key === 'demo') boolean(input, `${path}.values.demo`);
        else if (key === 'signatures') {
          const signatures = shape(input, `${path}.values.signatures`, [
            'enabled',
            'showClient',
            'issuer',
            'client',
          ]);
          boolean(signatures.enabled, `${path}.values.signatures.enabled`);
          boolean(signatures.showClient, `${path}.values.signatures.showClient`);
          for (const party of ['issuer', 'client']) {
            const signerPath = `${path}.values.signatures.${party}`;
            const signer = shape(signatures[party], signerPath, [
              'name',
              'role',
              'date',
              'imageDataUrl',
            ]);
            for (const key of ['name', 'role', 'date']) string(signer[key], `${signerPath}.${key}`);
            string(signer.imageDataUrl, `${signerPath}.imageDataUrl`, 350_000);
            try {
              signatureDimensions(signer.imageDataUrl as string);
            } catch (error) {
              fail(signerPath, error instanceof Error ? error.message : 'invalid signature');
            }
          }
        } else
          string(input, `${path}.values.${key}`, key === 'taxRate' ? NUMBER_LIMIT : TEXT_LIMIT);
      }
    });
  }
  const agency = shape(
    item.agency,
    'agency',
    ['name', 'defaultCurrency', 'defaultRate', 'defaultTarget'],
    [
      ...agencyTextKeys,
      'logoDataUrl',
      'accentColor',
      'timezone',
      'defaultTaxRate',
      'messageTemplates',
      'defaultsReviewedFor',
    ],
  );
  string(agency.name, 'agency.name');
  if (agency.defaultsReviewedFor !== undefined)
    string(agency.defaultsReviewedFor, 'agency.defaultsReviewedFor', 400000);
  enumeration(agency.defaultCurrency, 'agency.defaultCurrency', currencies);
  fields(agency, 'agency', ['defaultRate', 'defaultTarget'], NUMBER_LIMIT);
  for (const key of agencyTextKeys)
    if (agency[key] !== undefined) string(agency[key], `agency.${key}`);
  if (agency.defaultTaxRate !== undefined)
    string(agency.defaultTaxRate, 'agency.defaultTaxRate', NUMBER_LIMIT);
  if (agency.logoDataUrl !== undefined) {
    string(agency.logoDataUrl, 'agency.logoDataUrl', 750_000);
    try {
      logoDimensions(agency.logoDataUrl as string);
    } catch (error) {
      fail('agency.logoDataUrl', error instanceof Error ? error.message : 'invalid logo');
    }
  }
  if (
    agency.accentColor !== undefined &&
    (typeof agency.accentColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(agency.accentColor))
  )
    fail('agency.accentColor', 'expected a six-digit hex color');
  if (agency.timezone !== undefined && !validTimezone(agency.timezone))
    fail('agency.timezone', 'expected an IANA timezone');
  if (agency.messageTemplates !== undefined) {
    const templates = shape(agency.messageTemplates, 'agency.messageTemplates', [
      'quote',
      'absorb',
      'exchange',
      'defer',
      'followup',
    ]);
    fields(templates, 'agency.messageTemplates', [
      'quote',
      'absorb',
      'exchange',
      'defer',
      'followup',
    ]);
  }
  list(item.clients, 'clients', 2_000).forEach((value, index) => {
    const path = `clients[${index}]`,
      client = shape(value, path, ['id', 'name', 'contact', 'email', 'notes'], ['address']);
    identity(client.id, `${path}.id`);
    fields(client, path, ['name', 'contact', 'email']);
    // Unreconstructable legacy branding/document metadata remains available for owner review.
    string(client.notes, `${path}.notes`, 1_048_576);
    if (client.address !== undefined) string(client.address, `${path}.address`);
  });
  list(item.projects, 'projects', 2_000).forEach((value, index) => {
    const path = `projects[${index}]`,
      project = shape(
        value,
        path,
        [
          'id',
          'clientId',
          'name',
          'currency',
          'sample',
          'baseline',
          'originalBaseline',
          'createdAt',
          'updatedAt',
          'archivedAt',
          'deletedAt',
        ],
        ['state', 'deadline'],
      );
    identity(project.id, `${path}.id`);
    identity(project.clientId, `${path}.clientId`);
    string(project.name, `${path}.name`);
    enumeration(project.currency, `${path}.currency`, currencies);
    boolean(project.sample, `${path}.sample`);
    if (project.sample === true && project.id !== 'sample-harbor')
      fail(`${path}.sample`, 'only the canonical sample-harbor project can be the demo sample');
    baseline(project.baseline, `${path}.baseline`);
    baseline(project.originalBaseline, `${path}.originalBaseline`);
    date(project.createdAt, `${path}.createdAt`);
    date(project.updatedAt, `${path}.updatedAt`);
    date(project.archivedAt, `${path}.archivedAt`, true);
    date(project.deletedAt, `${path}.deletedAt`, true);
    if (project.state !== undefined)
      enumeration(project.state, `${path}.state`, ['active', 'on-hold', 'completed']);
    if (
      project.deadline !== undefined &&
      project.deadline !== null &&
      !isDateOnly(project.deadline)
    )
      fail(`${path}.deadline`, 'expected a real calendar date YYYY-MM-DD');
  });
  list(item.changes, 'changes', 10_000).forEach((value, index) =>
    validateChange(value, `changes[${index}]`),
  );
  list(item.revisions, 'revisions', 30_000).forEach((value, index) => {
    const path = `revisions[${index}]`,
      revision = shape(value, path, [
        'id',
        'projectId',
        'changeId',
        'revision',
        'at',
        'reason',
        'change',
        'baseline',
      ]);
    for (const key of ['id', 'projectId', 'changeId']) identity(revision[key], `${path}.${key}`);
    integer(revision.revision, `${path}.revision`, 1);
    date(revision.at, `${path}.at`);
    string(revision.reason, `${path}.reason`, 1_048_576);
    validateChange(revision.change, `${path}.change`);
    baseline(revision.baseline, `${path}.baseline`);
  });
  list(item.approvals, 'approvals', 10_000).forEach((value, index) => {
    const path = `approvals[${index}]`,
      approval = shape(value, path, [
        'id',
        'projectId',
        'changeId',
        'revision',
        'approvedAt',
        'recordedAt',
        'evidence',
        'invalidatedAt',
      ]);
    for (const key of ['id', 'projectId', 'changeId']) identity(approval[key], `${path}.${key}`);
    integer(approval.revision, `${path}.revision`, 1);
    string(approval.evidence, `${path}.evidence`);
    if (!(approval.evidence as string).trim())
      fail(`${path}.evidence`, 'approval evidence cannot be empty');
    date(approval.approvedAt, `${path}.approvedAt`);
    date(approval.recordedAt, `${path}.recordedAt`);
    date(approval.invalidatedAt, `${path}.invalidatedAt`, true);
  });
  list(item.reconciliations, 'reconciliations', 10_000).forEach((value, index) => {
    const path = `reconciliations[${index}]`,
      record = shape(value, path, [
        'id',
        'projectId',
        'changeId',
        'approvalId',
        'at',
        'addedFee',
        'incurred',
        'remaining',
        'removedFuture',
        'before',
        'after',
      ]);
    for (const key of ['id', 'projectId', 'changeId', 'approvalId'])
      identity(record[key], `${path}.${key}`);
    date(record.at, `${path}.at`);
    fields(record, path, ['addedFee', 'incurred', 'remaining', 'removedFuture'], NUMBER_LIMIT);
    baseline(record.before, `${path}.before`);
    baseline(record.after, `${path}.after`);
  });
  list(item.documents, 'documents', 10_000).forEach((value, index) => {
    const path = `documents[${index}]`,
      document = shape(
        value,
        path,
        ['id', 'projectId', 'changeId', 'revision', 'kind', 'createdAt'],
        ['assetId', 'snapshot', 'issuedAt', 'voidedAt', 'voidReason'],
      );
    for (const key of ['id', 'projectId', 'changeId']) identity(document[key], `${path}.${key}`);
    integer(document.revision, `${path}.revision`, 1);
    enumeration(document.kind, `${path}.kind`, ['brief', 'invoice', 'credit']);
    date(document.createdAt, `${path}.createdAt`);
    if (document.assetId !== undefined) identity(document.assetId, `${path}.assetId`);
    for (const key of ['issuedAt', 'voidedAt'])
      if (document[key] !== undefined) date(document[key], `${path}.${key}`, true);
    if (document.voidReason !== undefined) string(document.voidReason, `${path}.voidReason`);
    if (document.snapshot !== undefined && document.snapshot !== null) {
      let snapshot;
      try {
        snapshot = validateClientDocument(document.snapshot);
      } catch (error) {
        fail(
          `${path}.snapshot`,
          error instanceof Error ? error.message : 'invalid client-facing document',
        );
      }
      if (snapshot.kind !== document.kind || snapshot.revision !== document.revision)
        fail(`${path}.snapshot`, 'document kind/revision does not match preserved snapshot');
      if (snapshot.changeReference !== document.changeId)
        fail(`${path}.snapshot`, 'change identity does not match the document relationship');
    }
    if (document.issuedAt && !document.snapshot)
      fail(`${path}.snapshot`, 'issued documents require a preserved client-facing snapshot');
  });
  list(item.payments, 'payments', 10_000).forEach((value, index) => {
    const path = `payments[${index}]`,
      payment = shape(
        value,
        path,
        ['id', 'projectId', 'documentId', 'amount', 'receivedAt'],
        ['reference', 'note', 'createdAt', 'voidedAt', 'voidReason'],
      );
    for (const key of ['id', 'projectId', 'documentId']) identity(payment[key], `${path}.${key}`);
    string(payment.amount, `${path}.amount`, NUMBER_LIMIT);
    date(payment.receivedAt, `${path}.receivedAt`);
    for (const key of ['reference', 'note', 'voidReason'])
      if (payment[key] !== undefined) string(payment[key], `${path}.${key}`);
    if (payment.createdAt !== undefined) date(payment.createdAt, `${path}.createdAt`);
    if (payment.voidedAt !== undefined) date(payment.voidedAt, `${path}.voidedAt`, true);
  });
  list(item.calendarEvents, 'calendarEvents', 10_000).forEach((value, index) => {
    const path = `calendarEvents[${index}]`,
      event = shape(
        value,
        path,
        ['id', 'projectId', 'title', 'startsAt'],
        [
          'changeId',
          'documentId',
          'endsAt',
          'allDay',
          'timezone',
          'type',
          'status',
          'source',
          'notes',
          'createdAt',
          'updatedAt',
          'deletedAt',
        ],
      );
    identity(event.id, `${path}.id`);
    identity(event.projectId, `${path}.projectId`);
    string(event.title, `${path}.title`);
    string(event.startsAt, `${path}.startsAt`, 100);
    if (event.changeId !== undefined) identity(event.changeId, `${path}.changeId`);
    if (event.documentId !== undefined) identity(event.documentId, `${path}.documentId`);
    if (event.endsAt !== undefined) string(event.endsAt, `${path}.endsAt`, 100);
    if (event.allDay !== undefined) boolean(event.allDay, `${path}.allDay`);
    if (event.timezone !== undefined && !validTimezone(event.timezone))
      fail(`${path}.timezone`, 'expected an IANA timezone');
    if (event.type !== undefined)
      enumeration(event.type, `${path}.type`, [
        'milestone',
        'delivery',
        'client-content',
        'quote-followup',
        'approval-followup',
        'invoice-due',
        'task',
      ]);
    if (event.status !== undefined)
      enumeration(event.status, `${path}.status`, ['open', 'completed', 'cancelled']);
    if (event.source !== undefined)
      enumeration(event.source, `${path}.source`, ['manual', 'invoice', 'project']);
    if (
      (event.source === undefined || event.source === 'manual') &&
      /^(invoice-due|project-deadline):/.test(event.id as string)
    )
      fail(`${path}.id`, 'manual reminder identities cannot impersonate derived source deadlines');
    if (event.notes !== undefined) string(event.notes, `${path}.notes`);
    for (const key of ['createdAt', 'updatedAt'])
      if (event[key] !== undefined) date(event[key], `${path}.${key}`);
    if (event.deletedAt !== undefined) date(event.deletedAt, `${path}.deletedAt`, true);
    try {
      validateEventDates(event);
    } catch (error) {
      fail(path, error instanceof Error ? error.message : 'invalid event dates');
    }
  });
  list(item.activity, 'activity', 30_000).forEach((value, index) => {
    const path = `activity[${index}]`,
      record = shape(
        value,
        path,
        ['id', 'at', 'kind', 'message'],
        ['projectId', 'changeId', 'documentId'],
      );
    identity(record.id, `${path}.id`);
    date(record.at, `${path}.at`);
    string(record.kind, `${path}.kind`, 100);
    string(record.message, `${path}.message`);
    for (const key of ['projectId', 'changeId', 'documentId'])
      if (record[key] !== undefined) identity(record[key], `${path}.${key}`);
  });
  list(item.customScenarios, 'customScenarios', 5_000).forEach((value, index) => {
    const path = `customScenarios[${index}]`,
      record = shape(value, path, [
        'id',
        'title',
        'description',
        'request',
        'deliverables',
        'exclusions',
        'dependencies',
        'assumptions',
        'contractChecks',
        'classification',
        'route',
        'confirm',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ]);
    identity(record.id, `${path}.id`);
    fields(record, path, [
      'title',
      'description',
      'request',
      'deliverables',
      'exclusions',
      'dependencies',
      'assumptions',
      'contractChecks',
      'confirm',
    ]);
    enumeration(record.classification, `${path}.classification`, classifications);
    enumeration(record.route, `${path}.route`, routes);
    date(record.createdAt, `${path}.createdAt`);
    date(record.updatedAt, `${path}.updatedAt`);
    date(record.deletedAt, `${path}.deletedAt`, true);
  });
  list(item.assumptionPresets, 'assumptionPresets', 5_000).forEach((value, index) => {
    const path = `assumptionPresets[${index}]`,
      record = shape(value, path, ['id', 'title', 'text', 'deletedAt']);
    identity(record.id, `${path}.id`);
    fields(record, path, ['title', 'text']);
    date(record.deletedAt, `${path}.deletedAt`, true);
  });
  list(item.comparisons, 'comparisons', 10_000).forEach((value, index) => {
    const path = `comparisons[${index}]`,
      record = shape(value, path, [
        'id',
        'projectId',
        'changeId',
        'name',
        'terms',
        'createdAt',
        'deletedAt',
      ]);
    for (const key of ['id', 'projectId', 'changeId']) identity(record[key], `${path}.${key}`);
    string(record.name, `${path}.name`);
    validateTerms(record.terms, `${path}.terms`);
    date(record.createdAt, `${path}.createdAt`);
    date(record.deletedAt, `${path}.deletedAt`, true);
  });
  const context = shape(item.context, 'context', [
    'projectId',
    'changeId',
    'view',
    'guideDismissed',
    'lastBackupAt',
  ]);
  identity(context.projectId, 'context.projectId', true);
  identity(context.changeId, 'context.changeId', true);
  enumeration(context.view, 'context.view', [
    'workspace',
    'dashboard',
    'projects',
    'clients',
    'settings',
    'support',
    'calendar',
    'documents',
    'playbook',
  ]);
  boolean(context.guideDismissed, 'context.guideDismissed');
  date(context.lastBackupAt, 'context.lastBackupAt', true);

  const workspace = value as Workspace;
  for (const key of [
    'clients',
    'projects',
    'changes',
    'revisions',
    'approvals',
    'reconciliations',
    'documents',
    'payments',
    'calendarEvents',
    'activity',
    'customScenarios',
    'assumptionPresets',
    'comparisons',
  ] as const)
    unique(workspace[key], key);
  const clients = new Map(workspace.clients.map((record) => [record.id, record]));
  const projects = new Map(workspace.projects.map((record) => [record.id, record]));
  const changes = new Map(workspace.changes.map((record) => [record.id, record]));
  const approvals = new Map(workspace.approvals.map((record) => [record.id, record]));
  const documents = new Map(workspace.documents.map((record) => [record.id, record]));
  function relationship(projectId: string, changeId: string, path: string) {
    if (!projects.has(projectId)) fail(path, 'missing referenced project');
    const change = changes.get(changeId);
    if (!change || change.projectId !== projectId)
      fail(path, 'change belongs to a missing or different project');
    return change;
  }
  for (const project of workspace.projects)
    if (!clients.has(project.clientId)) fail('projects', 'missing referenced client');
  for (const change of workspace.changes)
    if (!projects.has(change.projectId)) fail('changes', 'missing referenced project');
  const draftContexts = new Set<string>();
  for (const draft of workspace.documentDrafts ?? []) {
    const change = relationship(draft.projectId, draft.changeId, 'documentDrafts');
    if (draft.revision > change.revision)
      fail('documentDrafts', 'draft references a future revision');
    const key = JSON.stringify([draft.projectId, draft.changeId, draft.revision, draft.kind]);
    if (draftContexts.has(key)) fail('documentDrafts', 'duplicate draft context');
    draftContexts.add(key);
  }
  for (const revision of workspace.revisions) {
    const current = relationship(revision.projectId, revision.changeId, 'revisions');
    if (
      revision.revision > current.revision ||
      revision.change.id !== revision.changeId ||
      revision.change.projectId !== revision.projectId ||
      revision.change.revision !== revision.revision
    )
      fail('revisions', 'revision identity or number does not match its change');
  }
  const activeApprovals = new Set<string>();
  for (const approval of workspace.approvals) {
    const current = relationship(approval.projectId, approval.changeId, 'approvals');
    if (approval.revision > current.revision)
      fail('approvals', 'approval references a future revision');
    if (approval.invalidatedAt === null) {
      if (approval.revision !== current.revision || current.status !== 'Approved')
        fail('approvals', 'active approval is stale');
      if (activeApprovals.has(current.id))
        fail('approvals', 'multiple active approvals for one change');
      activeApprovals.add(current.id);
    }
  }
  const reconciled = new Set<string>();
  for (const record of workspace.reconciliations) {
    const current = relationship(record.projectId, record.changeId, 'reconciliations');
    const approval = approvals.get(record.approvalId);
    if (
      !approval ||
      approval.projectId !== record.projectId ||
      approval.changeId !== record.changeId
    )
      fail('reconciliations', 'approval belongs to a missing or different change');
    if (reconciled.has(current.id))
      fail('reconciliations', 'a change cannot be included in the baseline twice');
    if (current.includedAt !== record.at)
      fail('reconciliations', 'included date does not match the change');
    reconciled.add(current.id);
  }
  for (const change of workspace.changes)
    if (change.includedAt !== null && !reconciled.has(change.id))
      fail('changes', 'included change has no reconciliation record');
  for (const document of workspace.documents) {
    const current = relationship(document.projectId, document.changeId, 'documents');
    if (document.revision > current.revision)
      fail('documents', 'document references a future revision');
  }
  for (const payment of workspace.payments) {
    const document = documents.get(payment.documentId);
    if (!document || document.projectId !== payment.projectId)
      fail('payments', 'document belongs to a missing or different project');
    if (document.kind === 'brief')
      fail('payments', 'manual settlements must reference invoices or explicit credits');
  }
  for (const event of workspace.calendarEvents) {
    if (!projects.has(event.projectId)) fail('calendarEvents', 'missing referenced project');
    if (event.changeId !== undefined)
      relationship(event.projectId, event.changeId, 'calendarEvents');
    if (event.documentId !== undefined) {
      const document = documents.get(event.documentId);
      if (
        !document ||
        document.projectId !== event.projectId ||
        (event.changeId !== undefined && document.changeId !== event.changeId)
      )
        fail('calendarEvents', 'document belongs to a missing or different source');
    }
    if (event.source === 'invoice' && !event.documentId)
      fail('calendarEvents', 'invoice-derived deadline requires its source document');
    if (event.source === 'invoice' && event.documentId) {
      const document = documents.get(event.documentId)!;
      if (document.kind !== 'invoice' || !document.issuedAt || !document.snapshot)
        fail('calendarEvents', 'invoice-derived deadline requires an issued invoice source');
    }
  }
  for (const comparison of workspace.comparisons)
    relationship(comparison.projectId, comparison.changeId, 'comparisons');
  for (const record of workspace.activity) {
    if (record.projectId && !projects.has(record.projectId))
      fail('activity', 'missing referenced project');
    if (record.changeId) {
      const change = changes.get(record.changeId);
      if (!change || (record.projectId && change.projectId !== record.projectId))
        fail('activity', 'change belongs to a missing or different project');
    }
    if (record.documentId) {
      const document = documents.get(record.documentId);
      if (
        !document ||
        (record.projectId && document.projectId !== record.projectId) ||
        (record.changeId && document.changeId !== record.changeId)
      )
        fail('activity', 'document belongs to a missing or different source');
    }
  }
  if (workspace.context.projectId && !projects.has(workspace.context.projectId))
    fail('context.projectId', 'missing referenced project');
  if (workspace.context.changeId)
    relationship(workspace.context.projectId, workspace.context.changeId, 'context');
}

function checkSize(raw: string) {
  if (new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BYTES)
    fail('workspace', 'backup and local save limit is 10 MB');
}
export function serializeWorkspace(workspace: Workspace): string {
  validateWorkspace(workspace);
  const raw = JSON.stringify(workspace);
  checkSize(raw);
  return raw;
}

const legacyText = [
  'name',
  'client',
  'agency',
  'title',
  'scope',
  'removedScope',
  'assumptions',
  'approval',
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'billing',
  'payment',
] as const;
const legacyNumeric = [
  'fee',
  'actual',
  'remaining',
  'target',
  'hours',
  'rate',
  'outside',
  'removed',
  'adjustment',
  'tax',
] as const;
type LegacyProject = Record<
  | (typeof legacyText)[number]
  | (typeof legacyNumeric)[number]
  | 'id'
  | 'logo'
  | 'currency'
  | 'classification'
  | 'route'
  | 'status',
  string
> & { revision: number };
function legacyProject(value: unknown, path: string): LegacyProject {
  const project = shape(
    value,
    path,
    [
      'id',
      ...legacyText,
      ...legacyNumeric,
      'currency',
      'classification',
      'route',
      'status',
      'revision',
    ],
    ['logo'],
  );
  identity(project.id, `${path}.id`);
  fields(project, path, legacyText);
  fields(project, path, legacyNumeric, NUMBER_LIMIT);
  if (project.logo === undefined) project.logo = '';
  string(project.logo, `${path}.logo`, 180_000);
  enumeration(project.currency, `${path}.currency`, currencies);
  enumeration(project.classification, `${path}.classification`, classifications);
  enumeration(project.route, `${path}.route`, routes);
  enumeration(project.status, `${path}.status`, statuses);
  integer(project.revision, `${path}.revision`, 1);
  return project as LegacyProject;
}
function legacyIdentity(prefix: string, value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${prefix}-${value.slice(0, 60)}-${(hash >>> 0).toString(16)}`;
}
function legacyBaseline(project: LegacyProject): Baseline {
  return {
    fee: project.fee,
    actual: project.actual,
    remaining: project.remaining,
    target: project.target,
    approvedScope: '',
  };
}
function legacyMetadata(project: LegacyProject) {
  return `Legacy document and decision metadata preserved for owner review; these are not reconstructed issued documents: ${JSON.stringify({ agency: project.agency, logo: project.logo, invoiceNumber: project.invoiceNumber, issueDate: project.issueDate, dueDate: project.dueDate, tax: project.tax, billing: project.billing, payment: project.payment, originalStatus: project.status, originalRevision: project.revision, approvalEvidence: project.approval, approvalDate: null })}`;
}
function legacyChange(project: LegacyProject, at: string): Change {
  return {
    id: legacyIdentity('legacy-change', project.id),
    projectId: project.id,
    revision: project.revision,
    status: project.status as Change['status'],
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
    includedAt: null,
    title: project.title,
    request: project.scope,
    deliverables: project.scope,
    exclusions: '',
    dependencies: '',
    assumptions: project.assumptions,
    contractChecks:
      'Migrated decision: review the original agreement and confirm that this change is billable before issuing a new quote.',
    classification: project.classification as Change['classification'],
    route: project.route as Change['route'],
    hours: project.hours,
    rate: project.rate,
    outside: project.outside,
    removed: project.removed,
    removedScope: project.removedScope,
    fee: project.adjustment,
    credit: '',
    creditReason: '',
    contractConfirmed: false,
  };
}
function migrateLegacy(value: Record<string, unknown>): Workspace {
  shape(value, 'legacy backup', ['version', 'projects', 'snapshots']);
  const projects = list(value.projects, 'legacy projects', 2_000).map((value, index) =>
    legacyProject(value, `legacy projects[${index}]`),
  );
  if (!projects.length) fail('legacy projects', 'expected at least one project');
  unique(projects, 'legacy projects');
  const snapshots = list(value.snapshots, 'legacy snapshots', 5_000).map((value, index) => {
    const path = `legacy snapshots[${index}]`,
      snapshot = shape(value, path, ['id', 'at', 'project']);
    identity(snapshot.id, `${path}.id`);
    date(snapshot.at, `${path}.at`);
    return {
      id: snapshot.id as string,
      at: snapshot.at as string,
      project: legacyProject(snapshot.project, `${path}.project`),
    };
  });
  unique(snapshots, 'legacy snapshots');
  // Deleted legacy projects could still have saved snapshots. Recover their identities as archived projects.
  const archived = new Set<string>();
  const byId = new Map(projects.map((project) => [project.id, project]));
  for (const snapshot of snapshots)
    if (!byId.has(snapshot.project.id)) {
      byId.set(snapshot.project.id, snapshot.project);
      projects.push(snapshot.project);
      archived.add(snapshot.project.id);
    }
  // Flat legacy records contain no creation or approval timestamp. This is
  // import record time, never an invented historical approval date.
  const at = new Date().toISOString();
  const first = projects[0];
  const result: Workspace = {
    schemaVersion: 3,
    id: 'migrated-scopeledger-v1',
    sequence: 0,
    updatedAt: at,
    agency: {
      name: first.agency,
      defaultCurrency: first.currency as Workspace['agency']['defaultCurrency'],
      defaultRate: first.rate,
      defaultTarget: first.target,
    },
    clients: projects.map((project) => ({
      id: legacyIdentity('legacy-client', project.id),
      name: project.client,
      contact: '',
      email: '',
      notes: legacyMetadata(project),
    })),
    projects: projects.map((project) => ({
      id: project.id,
      clientId: legacyIdentity('legacy-client', project.id),
      name: project.name,
      currency: project.currency as Project['currency'],
      sample: project.id === 'sample-harbor',
      baseline: legacyBaseline(project),
      originalBaseline: legacyBaseline(project),
      createdAt: at,
      updatedAt: at,
      archivedAt: archived.has(project.id) ? at : null,
      deletedAt: null,
    })),
    changes: projects.map((project) => legacyChange(project, at)),
    revisions: snapshots.map((snapshot) => ({
      id: snapshot.id,
      projectId: snapshot.project.id,
      changeId: legacyIdentity('legacy-change', snapshot.project.id),
      revision: snapshot.project.revision,
      at: snapshot.at,
      reason: `Migrated saved decision. ${legacyMetadata(snapshot.project)}`,
      change: legacyChange(snapshot.project, snapshot.at),
      baseline: legacyBaseline(snapshot.project),
    })),
    approvals: [],
    reconciliations: [],
    documents: [],
    payments: [],
    calendarEvents: [],
    activity: [],
    customScenarios: [],
    assumptionPresets: [],
    comparisons: [],
    context: {
      projectId: first.id,
      changeId: legacyIdentity('legacy-change', first.id),
      view: 'workspace',
      guideDismissed: false,
      lastBackupAt: null,
    },
  };
  for (const project of projects.filter((project) => project.status === 'Approved')) {
    let suffix = 0,
      recordId = legacyIdentity('legacy-current', project.id);
    while (result.revisions.some((revision) => revision.id === recordId))
      recordId = legacyIdentity(`legacy-current-${++suffix}`, project.id);
    result.revisions.push({
      id: recordId,
      projectId: project.id,
      changeId: legacyIdentity('legacy-change', project.id),
      revision: project.revision,
      at,
      reason: `Imported legacy approval history. The displayed date records this import, not client approval. No approval date was recorded in the source. Reconfirm with a real approval date before issuing or reconciling. ${legacyMetadata(project)}`,
      change: legacyChange(project, at),
      baseline: legacyBaseline(project),
    });
  }
  // Earlier snapshots occasionally contain a higher revision than a reopened legacy draft.
  for (const change of result.changes) {
    const greatest = Math.max(
      change.revision,
      ...result.revisions
        .filter((revision) => revision.changeId === change.id)
        .map((revision) => revision.revision),
    );
    if (change.status === 'Approved') {
      change.status = 'Draft';
      change.revision = greatest + 1;
      change.contractChecks +=
        ' Original legacy approval wording is preserved in history, but its date is unknown. Record dated reconfirmation before invoicing or reconciliation.';
    } else if (greatest !== change.revision) {
      change.revision = greatest + 1;
    }
  }
  return result;
}

export function parseBackup(raw: string): Workspace {
  string(raw, 'backup', MAX_WORKSPACE_BYTES);
  checkSize(raw);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail('backup', 'could not read JSON; the original recovery copy has not been changed');
  }
  const item = object(value, 'backup');
  const workspace =
    item.version === 1
      ? migrateLegacy(item)
      : item.schemaVersion === 2
        ? migrateSchema2(item)
        : value;
  validateWorkspace(workspace);
  // Migration can add metadata; its result must obey the exact same save limit.
  if (item.version === 1 || item.schemaVersion === 2) checkSize(JSON.stringify(workspace));
  return workspace;
}
/** Version 2 has the same record identities; schema 3 adds arrays without replacing old work. */
export function migrateSchema2(value: unknown): Workspace {
  const source = shape(
    value,
    'schema 2 workspace',
    workspaceKeys.filter((key) => !extensionKeys.includes(key)),
  );
  if (source.schemaVersion !== 2) fail('schema 2 workspace', 'expected schemaVersion 2');
  const migrated: Record<string, unknown> = {
    ...structuredClone(source),
    schemaVersion: 3,
    activity: [],
    customScenarios: [],
    assumptionPresets: [],
    comparisons: [],
  };
  const agency = migrated.agency as Workspace['agency'];
  const timezone =
    agency.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Dhaka';
  migrated.calendarEvents = (migrated.calendarEvents as Workspace['calendarEvents']).map(
    (event) => ({
      ...event,
      allDay: event.allDay ?? isDateOnly(event.startsAt),
      timezone: event.timezone ?? timezone,
      source: event.source ?? 'manual',
      status: event.status ?? 'open',
      type: event.type ?? 'task',
      deletedAt: event.deletedAt ?? null,
    }),
  );
  validateWorkspace(migrated);
  return migrated;
}
/** Restore replaces identities; it never creates copies or duplicates on repeated use. */
export function prepareRestore(raw: string, demo = true): Workspace {
  const workspace = parseBackup(raw);
  if (demo && !isWithinDemoAllowance(workspace))
    fail(
      'backup',
      'the demo can restore one sample project and one custom project. Additional custom projects require activation',
    );
  return workspace;
}

interface StoredRecord {
  raw: string;
  sequence: number;
}
export interface LoadResult {
  workspace: Workspace | null;
  sequence: number;
  recovery?: { raw: string; reason: string };
  previous?: Workspace;
  migrated?: boolean;
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new StorageUnavailableError(
            'The local save was cancelled. Export a backup and try again.',
          ),
      );
  });
}
function rawRecord(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as StoredRecord).raw === 'string')
    return (value as StoredRecord).raw;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[Stored record could not be serialized]';
  }
}
function sequenceOf(value: unknown): number {
  return value &&
    typeof value === 'object' &&
    Number.isSafeInteger((value as StoredRecord).sequence) &&
    (value as StoredRecord).sequence >= 0
    ? (value as StoredRecord).sequence
    : 0;
}
function readRecord(value: unknown): Workspace {
  const item = shape(value, 'stored record', ['raw', 'sequence']);
  string(item.raw, 'stored record.raw', MAX_WORKSPACE_BYTES);
  integer(item.sequence, 'stored record.sequence');
  const workspace = parseBackup(item.raw as string);
  if (workspace.sequence !== item.sequence)
    fail('stored record', 'sequence does not match its workspace');
  return workspace;
}
function storageError(error: unknown): Error {
  if (
    error instanceof StorageConflictError ||
    error instanceof StorageRecoveryError ||
    error instanceof WorkspaceValidationError ||
    error instanceof StorageUnavailableError
  )
    return error;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  return new StorageUnavailableError(
    name === 'QuotaExceededError'
      ? 'Device storage is full. Your previous saved work is safe. Export a backup and free space before trying again.'
      : undefined,
    { cause: error },
  );
}

/** Native IndexedDB provides an atomic compare-and-save transaction across tabs. */
export class Repository {
  private database?: Promise<IDBDatabase>;
  private channel?: BroadcastChannel;
  constructor(readonly databaseName = 'scopeledger-core') {
    // Notifications are optional; the IndexedDB compare-and-save remains the source of truth.
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(EVENTS_CHANNEL);
      } catch {
        /* Some privacy modes block this API. */
      }
    }
  }
  private open(): Promise<IDBDatabase> {
    if (!this.database)
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new StorageUnavailableError());
          return;
        }
        let operation: IDBOpenDBRequest;
        try {
          operation = indexedDB.open(this.databaseName, DATABASE_VERSION);
        } catch (error) {
          reject(storageError(error));
          return;
        }
        operation.onupgradeneeded = () => {
          const database = operation.result;
          if (!database.objectStoreNames.contains(WORKSPACE_STORE))
            database.createObjectStore(WORKSPACE_STORE);
          // Future branding images and generated document assets use blobs, without localStorage size limits.
          if (!database.objectStoreNames.contains('assets'))
            database.createObjectStore('assets', { keyPath: 'id' });
        };
        let blocked = false;
        operation.onsuccess = () => {
          if (blocked) {
            operation.result.close();
            return;
          }
          operation.result.onversionchange = () => {
            operation.result.close();
            this.database = undefined;
          };
          resolve(operation.result);
        };
        operation.onerror = () => reject(storageError(operation.error));
        operation.onblocked = () => {
          blocked = true;
          reject(
            new StorageUnavailableError(
              'Another tab is blocking the storage upgrade. Close other ScopeLedger tabs and retry.',
            ),
          );
        };
      }).catch((error) => {
        this.database = undefined;
        throw error;
      });
    return this.database;
  }
  async load(): Promise<LoadResult> {
    try {
      const database = await this.open(),
        transaction = database.transaction(WORKSPACE_STORE, 'readonly'),
        done = transactionDone(transaction),
        store = transaction.objectStore(WORKSPACE_STORE);
      const [[current, old]] = await Promise.all([
        Promise.all([request(store.get('current')), request(store.get('previous'))]),
        done,
      ]);
      let previous: Workspace | undefined;
      if (old !== undefined) {
        try {
          previous = readRecord(old);
        } catch {
          /* A bad recovery candidate is never adopted. */
        }
      }
      if (current === undefined) {
        if (old !== undefined)
          return {
            workspace: null,
            sequence: 0,
            recovery: {
              raw: rawRecord(old),
              reason:
                'The current workspace record is missing. Review the preserved previous record before restoring.',
            },
            ...(previous ? { previous } : {}),
          };
        return { workspace: null, sequence: 0 };
      }
      try {
        const workspace = readRecord(current);
        const sourceVersion = JSON.parse(rawRecord(current)).schemaVersion;
        return {
          workspace,
          sequence: workspace.sequence,
          ...(previous ? { previous } : {}),
          ...(sourceVersion !== 3 ? { migrated: true } : {}),
        };
      } catch (error) {
        return {
          workspace: null,
          sequence: sequenceOf(current),
          recovery: {
            raw: rawRecord(current),
            reason: error instanceof Error ? error.message : 'Stored record is corrupt',
          },
          ...(previous ? { previous } : {}),
        };
      }
    } catch (error) {
      throw storageError(error);
    }
  }
  save(workspace: Workspace, expectedSequence: number): Promise<number> {
    return this.write(workspace, expectedSequence, false);
  }
  /** Call only after a user deliberately confirms replacement in the restore preview. */
  restore(workspace: Workspace, expectedSequence: number): Promise<number> {
    return this.write(workspace, expectedSequence, true);
  }
  async restorePrevious(expectedSequence: number): Promise<number> {
    const result = await this.load();
    if (result.sequence !== expectedSequence) throw new StorageConflictError();
    if (!result.previous) throw new StorageRecoveryError();
    return this.restore(result.previous, expectedSequence);
  }
  /** Returns the untouched corrupt bytes, including after a deliberate replacement. */
  async getRecoveryRaw(): Promise<string | null> {
    const result = await this.load();
    if (result.recovery) return result.recovery.raw;
    try {
      const database = await this.open(),
        transaction = database.transaction(WORKSPACE_STORE, 'readonly'),
        done = transactionDone(transaction);
      const [quarantine] = await Promise.all([
        request(transaction.objectStore(WORKSPACE_STORE).get('quarantine')),
        done,
      ]);
      return quarantine === undefined ? null : rawRecord(quarantine);
    } catch (error) {
      throw storageError(error);
    }
  }
  private async write(
    workspace: Workspace,
    expectedSequence: number,
    deliberate: boolean,
  ): Promise<number> {
    integer(expectedSequence, 'expectedSequence');
    if (expectedSequence >= Number.MAX_SAFE_INTEGER)
      fail('expectedSequence', 'sequence limit reached; export your workspace');
    const sequence = expectedSequence + 1,
      raw = serializeWorkspace({ ...workspace, sequence });
    try {
      const database = await this.open();
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction(WORKSPACE_STORE, 'readwrite'),
          store = transaction.objectStore(WORKSPACE_STORE);
        let failure: Error | undefined;
        const get = store.get('current');
        get.onsuccess = () => {
          const current: unknown = get.result;
          const commit = () => {
            try {
              if (sequenceOf(current) !== expectedSequence) throw new StorageConflictError();
              if (current !== undefined) {
                let good = false;
                let saved: Workspace | undefined;
                try {
                  saved = readRecord(current);
                  good = true;
                } catch {
                  if (!deliberate) throw new StorageRecoveryError();
                }
                if (saved && !deliberate)
                  for (const existing of saved.documents.filter(
                    (document) => document.issuedAt && document.snapshot,
                  )) {
                    const candidate = workspace.documents.find(
                      (document) => document.id === existing.id,
                    );
                    if (
                      !candidate ||
                      JSON.stringify(candidate.snapshot) !== JSON.stringify(existing.snapshot) ||
                      candidate.projectId !== existing.projectId ||
                      candidate.changeId !== existing.changeId ||
                      candidate.revision !== existing.revision ||
                      candidate.kind !== existing.kind ||
                      candidate.issuedAt !== existing.issuedAt
                    )
                      fail(
                        'documents',
                        'issued snapshots and their identities are preserved; void the document instead of rewriting history',
                      );
                  }
                if (good) store.put(current, 'previous');
                else
                  store.put(
                    { raw: rawRecord(current), sequence: sequenceOf(current) },
                    'quarantine',
                  );
              }
              store.put({ raw, sequence } satisfies StoredRecord, 'current');
            } catch (error) {
              failure = storageError(error);
              transaction.abort();
            }
          };
          if (current === undefined && !deliberate) {
            const old = store.get('previous');
            old.onsuccess = () => {
              if (old.result !== undefined) {
                failure = new StorageRecoveryError();
                transaction.abort();
              } else commit();
            };
          } else commit();
        };
        transaction.oncomplete = () => {
          try {
            this.channel?.postMessage({
              type: 'workspace-saved',
              databaseName: this.databaseName,
              sequence,
              workspaceId: workspace.id,
            });
          } catch {
            /* A failed optional notification cannot invalidate an already committed save. */
          }
          resolve(sequence);
        };
        transaction.onerror = () => reject(failure ?? storageError(transaction.error));
        transaction.onabort = () => reject(failure ?? storageError(transaction.error));
      });
    } catch (error) {
      throw storageError(error);
    }
  }
  async close(): Promise<void> {
    this.channel?.close();
    this.channel = undefined;
    if (this.database) {
      try {
        (await this.database).close();
      } catch {
        /* No database opened when storage was unavailable. */
      } finally {
        this.database = undefined;
      }
    }
  }
}
