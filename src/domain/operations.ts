import { calculate, Money, parseAmount } from './finance';
import { canCreateProject } from './access';
import { id, now } from './types';
import type { Baseline, Change, ChangeTerms, Currency, Project, Workspace } from './types';
import { MESSAGE_TEMPLATES } from '../toolkit/messages';
import {
  calendarDate,
  localDate,
  recordedDateHasOccurred,
  recordedTimestampIsValid,
  recordedTimestampToIso,
} from './dates';

const clone = <T>(value: T): T => structuredClone(value);
const finish = (workspace: Workspace): Workspace => ({ ...workspace, updatedAt: now() });

export const blankTerms = (rate = '65'): ChangeTerms => ({
  title: '',
  request: '',
  deliverables: '',
  exclusions: '',
  dependencies: '',
  assumptions: '',
  contractChecks: '',
  classification: 'Addition',
  route: 'Quote',
  hours: '',
  rate,
  outside: '0',
  removed: '0',
  removedScope: '',
  fee: '',
  credit: '0',
  creditReason: '',
  contractConfirmed: false,
});

function newChange(projectId: string, rate: string, terms?: Partial<ChangeTerms>): Change {
  const at = now();
  return {
    ...blankTerms(rate),
    ...terms,
    id: id(),
    projectId,
    revision: 1,
    status: 'Draft',
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
    includedAt: null,
  };
}

export function createWorkspace(): Workspace {
  const at = now();
  const baseline: Baseline = {
    fee: '8000',
    actual: '2000',
    remaining: '3200',
    target: '35',
    approvedScope:
      'A five-page Webflow website, one CMS collection, responsive build, and two design revision rounds.',
  };
  const project: Project = {
    id: 'sample-harbor',
    clientId: 'sample-client-harbor',
    name: 'Harbor / Website',
    currency: 'USD',
    sample: true,
    baseline: clone(baseline),
    originalBaseline: clone(baseline),
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
  };
  const change = newChange(project.id, '65', {
    title: 'Add a journal CMS collection',
    request:
      'The client would like a separate journal collection and reusable article template alongside the approved project.',
    deliverables: 'One journal CMS collection, one article template, and a journal listing page.',
    exclusions: 'Writing articles, bulk content entry, and a new visual direction.',
    dependencies: 'Client supplies approved copy and images before the agreed build date.',
    assumptions: 'Reuse the approved design system. One review round covers the new templates.',
    contractChecks:
      'Confirm that the approved scope includes one CMS collection and that this is a separate collection.',
    hours: '8',
    rate: '65',
    fee: '800',
  });
  return {
    schemaVersion: 3,
    id: id(),
    sequence: 0,
    updatedAt: at,
    agency: {
      name: 'Aster Studio',
      defaultCurrency: 'USD',
      defaultRate: '65',
      defaultTarget: '35',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka',
      legalName: '',
      address: '',
      email: '',
      website: '',
      logoDataUrl: '',
      accentColor: '#4265d5',
      invoicePrefix: 'SL',
      paymentInstructions: '',
      documentFooter: '',
      defaultTaxRate: '0',
      approvalText: 'Please confirm the scope and fee in writing before work begins.',
      deliveryImplications: '',
      messageTemplates: { ...MESSAGE_TEMPLATES },
    },
    clients: [
      {
        id: project.clientId,
        name: 'Harbor Studio',
        contact: '',
        email: '',
        notes: 'Sample client — edit this workspace to explore the workflow.',
      },
    ],
    projects: [project],
    changes: [change],
    revisions: [],
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
      projectId: project.id,
      changeId: change.id,
      view: 'workspace',
      guideDismissed: false,
      lastBackupAt: null,
    },
  };
}

function projectOf(workspace: Workspace, projectId: string): Project {
  const project = workspace.projects.find((record) => record.id === projectId);
  if (!project) throw new Error('This project could not be found.');
  return project;
}

function changeOf(workspace: Workspace, changeId: string): Change {
  const change = workspace.changes.find((record) => record.id === changeId);
  if (!change) throw new Error('This change could not be found.');
  return change;
}

function assertEditable(workspace: Workspace, change: Change) {
  const project = projectOf(workspace, change.projectId);
  if (project.deletedAt || project.archivedAt || change.deletedAt || change.archivedAt)
    throw new Error('Recover or unarchive this record before editing it.');
  if (
    change.includedAt ||
    workspace.reconciliations.some((record) => record.changeId === change.id)
  )
    throw new Error(
      'This change is already included in the baseline. Create a new change to revise agreed work.',
    );
}

function snapshot(workspace: Workspace, change: Change, reason: string) {
  if (
    workspace.revisions.some(
      (record) => record.changeId === change.id && record.revision === change.revision,
    )
  )
    return;
  workspace.revisions.push({
    id: id(),
    projectId: change.projectId,
    changeId: change.id,
    revision: change.revision,
    at: now(),
    reason,
    change: clone(change),
    baseline: clone(projectOf(workspace, change.projectId).baseline),
  });
}

function preserveFirstBaseline(workspace: Workspace, change: Change) {
  const project = projectOf(workspace, change.projectId);
  // A new custom project has no approved baseline yet. Freeze its first valid
  // quoted/approved baseline, then retain it through later edits and changes.
  if (!project.originalBaseline.fee.trim()) project.originalBaseline = clone(project.baseline);
}

function invalidate(workspace: Workspace, change: Change, reason: string) {
  const wasSaved = workspace.revisions.some(
    (record) => record.changeId === change.id && record.revision === change.revision,
  );
  if (wasSaved || change.status !== 'Draft') {
    // Preserve the latest state even when a decision was approved immediately.
    snapshot(workspace, change, reason);
    change.revision += 1;
  }
  const at = now();
  workspace.approvals.forEach((approval) => {
    if (approval.changeId === change.id && !approval.invalidatedAt) approval.invalidatedAt = at;
  });
  change.status = 'Draft';
  change.updatedAt = at;
}

export function createProject(
  workspace: Workspace,
  input: { name: string; client: string; currency?: Currency; activated?: boolean },
): Workspace {
  if (!canCreateProject(workspace, input.activated === true))
    throw new Error(
      'The demo includes one sample project and one custom project, including archived or trashed projects. Additional custom projects require activation; licensing is not configured yet.',
    );
  if (!input.name.trim() || !input.client.trim())
    throw new Error('Enter both a project name and a client name.');
  const next = clone(workspace);
  let client = next.clients.find(
    (record) => record.name.toLocaleLowerCase() === input.client.trim().toLocaleLowerCase(),
  );
  if (!client) {
    client = { id: id(), name: input.client.trim(), contact: '', email: '', notes: '' };
    next.clients.push(client);
  }
  const at = now();
  const baseline: Baseline = {
    fee: '',
    actual: '',
    remaining: '',
    target: next.agency.defaultTarget,
    approvedScope: '',
  };
  const project: Project = {
    id: id(),
    clientId: client.id,
    name: input.name.trim(),
    currency: input.currency ?? next.agency.defaultCurrency,
    sample: false,
    baseline: clone(baseline),
    originalBaseline: clone(baseline),
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
  };
  const change = newChange(project.id, next.agency.defaultRate);
  next.projects.push(project);
  next.changes.push(change);
  next.context = { ...next.context, projectId: project.id, changeId: change.id, view: 'workspace' };
  return finish(next);
}

export function createChange(workspace: Workspace, projectId: string): Workspace {
  const project = projectOf(workspace, projectId);
  if (project.archivedAt || project.deletedAt)
    throw new Error('Recover or unarchive the project before adding a change.');
  if (
    workspace.changes.some(
      (change) =>
        change.projectId === projectId && change.status === 'Approved' && !change.includedAt,
    )
  ) {
    throw new Error(
      'Include the approved change in the baseline before evaluating the next change.',
    );
  }
  const next = clone(workspace);
  const change = newChange(projectId, next.agency.defaultRate);
  next.changes.push(change);
  next.context = { ...next.context, projectId, changeId: change.id, view: 'workspace' };
  return finish(next);
}

export function updateChange(
  workspace: Workspace,
  changeId: string,
  patch: Partial<ChangeTerms>,
): Workspace {
  const current = changeOf(workspace, changeId);
  assertEditable(workspace, current);
  const allowed = new Set(Object.keys(blankTerms()));
  const entries = Object.entries(patch).filter(([key]) => allowed.has(key)) as [
    keyof ChangeTerms,
    ChangeTerms[keyof ChangeTerms],
  ][];
  if (!entries.some(([key, value]) => current[key] !== value)) return workspace;
  const next = clone(workspace);
  const change = changeOf(next, changeId);
  invalidate(next, change, 'Commercial terms revised; prior approval is no longer current.');
  Object.assign(change, Object.fromEntries(entries));
  return finish(next);
}

export function updateBaseline(
  workspace: Workspace,
  projectId: string,
  patch: Partial<Baseline>,
): Workspace {
  const current = projectOf(workspace, projectId);
  if (current.archivedAt || current.deletedAt)
    throw new Error('Recover or unarchive the project before editing its baseline.');
  const entries = Object.entries(patch).filter(([key]) =>
    ['fee', 'actual', 'remaining', 'target', 'approvedScope'].includes(key),
  ) as [keyof Baseline, string][];
  if (!entries.some(([key, value]) => current.baseline[key] !== value)) return workspace;
  const next = clone(workspace);
  next.changes
    .filter((change) => change.projectId === projectId && !change.includedAt)
    .forEach((change) =>
      invalidate(
        next,
        change,
        'Project baseline revised; review the decision against the updated baseline.',
      ),
    );
  const project = projectOf(next, projectId);
  Object.assign(project.baseline, Object.fromEntries(entries));
  project.updatedAt = now();
  return finish(next);
}

function validateDecision(workspace: Workspace, change: Change, approving: boolean) {
  const result = calculate(projectOf(workspace, change.projectId).baseline, change);
  if (!result.valid) throw new Error(Object.values(result.errors)[0]);
  if (!change.title.trim() || !change.request.trim() || !change.deliverables.trim())
    throw new Error(
      'Add a title, request description, and deliverables before quoting or approving.',
    );
  if (!projectOf(workspace, change.projectId).baseline.approvedScope.trim())
    throw new Error('Describe the currently approved project scope before quoting or approving.');
  if (change.classification !== 'Addition' && !change.contractConfirmed)
    throw new Error(
      'Complete the contract review before treating included work, a defect, or an ambiguous request as an agreed commercial change.',
    );
  if (change.route === 'Exchange' && !new Money(change.removed).greaterThan(0))
    throw new Error('An exchange needs explicit scope removal and an eligible future-cost saving.');
  if (change.route === 'Defer')
    throw new Error(
      approving
        ? 'A deferred request is not a commitment. Choose a delivery route before recording approval.'
        : 'Save a deferred request as a draft; choose a delivery route before quoting.',
    );
}

export function saveDecision(
  workspace: Workspace,
  changeId: string,
  status: 'Draft' | 'Quoted' | 'Rejected',
): Workspace {
  const current = changeOf(workspace, changeId);
  assertEditable(workspace, current);
  if (status === 'Quoted') validateDecision(workspace, current, false);
  const next = clone(workspace);
  const change = changeOf(next, changeId);
  if (status === 'Quoted') preserveFirstBaseline(next, change);
  if (change.status === 'Approved' && status !== 'Draft')
    invalidate(
      next,
      change,
      `Decision changed to ${status.toLowerCase()}; prior approval invalidated.`,
    );
  if (change.status === 'Approved' && status === 'Draft')
    invalidate(next, change, 'Approved decision reopened as a draft.');
  change.status = status;
  change.updatedAt = now();
  snapshot(next, change, `Decision saved as ${status.toLowerCase()}.`);
  return finish(next);
}

export function recordApproval(
  workspace: Workspace,
  changeId: string,
  evidence: string,
  approvedAt: string,
): Workspace {
  const current = changeOf(workspace, changeId);
  assertEditable(workspace, current);
  validateDecision(workspace, current, true);
  if (!evidence.trim())
    throw new Error('Record approval evidence, such as the client’s email or signed acceptance.');
  const value = approvedAt.trim();
  const date = Date.parse(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  );
  if ((!dateOnly && !timestamp) || !Number.isFinite(date))
    throw new Error('Enter a valid approval date or an ISO timestamp with a timezone.');
  const calendarPart = /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) ? value.slice(0, 10) : null;
  if (calendarPart && !calendarDate(calendarPart))
    throw new Error('Enter a real calendar date for approval.');
  if (!dateOnly && !recordedTimestampIsValid(value))
    throw new Error('Enter a valid approval timestamp with a real time and timezone.');
  if (dateOnly) {
    // Use the agency's configured timezone, including when the browser or
    // owner's laptop is in a different zone. Preserve the selected date.
    if (value > localDate(workspace.agency.timezone))
      throw new Error('The approval date cannot be in the future.');
  } else if (!recordedDateHasOccurred(value, localDate(workspace.agency.timezone)))
    throw new Error('The approval date cannot be in the future.');
  if (
    workspace.approvals.some(
      (approval) =>
        approval.changeId === changeId &&
        approval.revision === current.revision &&
        !approval.invalidatedAt,
    )
  )
    throw new Error('This revision already has a current approval.');
  const next = clone(workspace);
  const change = changeOf(next, changeId);
  const at = now();
  preserveFirstBaseline(next, change);
  next.approvals.push({
    id: id(),
    projectId: change.projectId,
    changeId,
    revision: change.revision,
    evidence: evidence.trim(),
    approvedAt: dateOnly ? value : recordedTimestampToIso(value),
    recordedAt: at,
    invalidatedAt: null,
  });
  change.status = 'Approved';
  change.updatedAt = at;
  snapshot(next, change, 'Approval recorded with evidence.');
  return finish(next);
}

export function reconcileChange(
  workspace: Workspace,
  changeId: string,
  incurred: string,
  remaining: string,
): Workspace {
  const current = changeOf(workspace, changeId);
  assertEditable(workspace, current);
  if (current.status !== 'Approved')
    throw new Error('Record a current approval before including this change in the baseline.');
  const approval = workspace.approvals.find(
    (record) =>
      record.changeId === changeId && record.revision === current.revision && !record.invalidatedAt,
  );
  if (!approval)
    throw new Error('This approval is stale. Review the current terms and record fresh approval.');
  if (
    !approval.evidence.trim() ||
    !recordedDateHasOccurred(approval.approvedAt, localDate(workspace.agency.timezone))
  )
    throw new Error(
      'This approval requires review. Check the device clock and actual approval date, or reopen the decision and record fresh approval before reconciliation.',
    );
  validateDecision(workspace, current, true);
  const project = projectOf(workspace, current.projectId);
  const result = calculate(project.baseline, current);
  const errors: Record<string, string> = {};
  const actualCost = parseAmount(incurred, 'incurred', errors, 'Change cost already incurred');
  const futureCost = parseAmount(remaining, 'remaining', errors, 'Change cost still remaining');
  if (!actualCost || !futureCost) throw new Error(Object.values(errors)[0]);
  if (result.grossCost === null || !actualCost.plus(futureCost).equals(result.grossCost))
    throw new Error(
      'The incurred and remaining portions must add up exactly to the estimated additional delivery cost before scope savings.',
    );
  const removed = new Money(current.removed);
  const forecast = new Money(project.baseline.remaining).minus(removed).plus(futureCost);
  if (forecast.isNegative())
    throw new Error('Scope savings cannot make the remaining forecast negative.');
  const nextFee = new Money(project.baseline.fee).plus(result.effectiveFee!);
  const nextActual = new Money(project.baseline.actual).plus(actualCost);
  const baselineErrors: Record<string, string> = {};
  parseAmount(nextFee.toString(), 'baselineFee', baselineErrors, 'Resulting approved project fee');
  parseAmount(nextActual.toString(), 'actual', baselineErrors, 'Resulting actual delivery cost');
  parseAmount(
    forecast.toString(),
    'remaining',
    baselineErrors,
    'Resulting remaining delivery cost',
  );
  if (Object.keys(baselineErrors).length) throw new Error(Object.values(baselineErrors)[0]);
  const next = clone(workspace);
  const changedProject = projectOf(next, project.id);
  const changed = changeOf(next, changeId);
  const before = clone(changedProject.baseline);
  const after: Baseline = {
    ...before,
    fee: nextFee.toString(),
    actual: nextActual.toString(),
    remaining: forecast.toString(),
    approvedScope: `${before.approvedScope}\n\nApproved change: ${changed.title}\n${changed.deliverables}${removed.greaterThan(0) ? `\nRemoved scope: ${changed.removedScope}` : ''}`,
  };
  const at = now();
  changedProject.baseline = after;
  changedProject.updatedAt = at;
  changed.includedAt = at;
  changed.updatedAt = at;
  next.reconciliations.push({
    id: id(),
    projectId: project.id,
    changeId,
    approvalId: approval.id,
    at,
    addedFee: result.effectiveFee!,
    incurred: actualCost.toString(),
    remaining: futureCost.toString(),
    removedFuture: removed.toString(),
    before,
    after: clone(after),
  });
  // Other outstanding decisions were priced against the former baseline.
  next.changes
    .filter(
      (change) => change.projectId === project.id && change.id !== changeId && !change.includedAt,
    )
    .forEach((change) => {
      // Snapshot against the old baseline before invalidating approval.
      changedProject.baseline = before;
      invalidate(
        next,
        change,
        'Another approved change was included in the project baseline. Review this decision again.',
      );
      changedProject.baseline = after;
    });
  return finish(next);
}

export function archiveRecord(
  workspace: Workspace,
  kind: 'project' | 'change',
  recordId: string,
): Workspace {
  const next = clone(workspace);
  const record = kind === 'project' ? projectOf(next, recordId) : changeOf(next, recordId);
  if (record.deletedAt) throw new Error('Recover this record from trash before archiving it.');
  record.archivedAt = now();
  record.updatedAt = now();
  return finish(next);
}

export function deleteRecord(
  workspace: Workspace,
  kind: 'project' | 'change',
  recordId: string,
): Workspace {
  const next = clone(workspace);
  const record = kind === 'project' ? projectOf(next, recordId) : changeOf(next, recordId);
  record.deletedAt = now();
  record.updatedAt = now();
  return finish(next);
}

export function recoverRecord(
  workspace: Workspace,
  kind: 'project' | 'change',
  recordId: string,
): Workspace {
  const next = clone(workspace);
  const record = kind === 'project' ? projectOf(next, recordId) : changeOf(next, recordId);
  record.deletedAt = null;
  record.archivedAt = null;
  record.updatedAt = now();
  return finish(next);
}
