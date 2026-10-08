import { Money, calculate, parseAmount } from '../domain/finance';
import { paymentBalances } from '../domain/commercial';
import { compareRecordedDates, recordedDateHasOccurred, recordedDateToDate } from '../domain/dates';
import type {
  Change,
  Currency,
  DecisionStatus,
  DocumentRecord,
  Project,
  Workspace,
} from '../domain/types';
import { activeTimezone, addDays, eventDate, eventOverlapsPeriod, todayInZone } from './dates';
import { calendarEvents, invoiceSummary, type InvoiceSummary } from './calendar';

export interface DashboardFilters {
  projectId?: string;
  clientId?: string;
  status?: 'all' | 'active' | 'on-hold' | 'completed' | DecisionStatus;
  currency?: Currency;
  from?: string;
  to?: string;
  includeSample?: boolean;
  includeArchived?: boolean;
  includeTrashed?: boolean;
}
export interface PortfolioGroup {
  currency: Currency;
  projectIds: string[];
  completeProjectIds: string[];
  excludedProjectIds: string[];
  revenue: string | null;
  actual: string | null;
  remaining: string | null;
  unallocatedCost: string | null;
  margin: string | null;
  proposedFees: string;
  proposedExcludedIds: string[];
  invoiceSubtotal: string;
  tax: string;
  paid: string | null;
  outstanding: string | null;
  creditTotal: string;
  creditSettled: string | null;
  invoiceIds: string[];
  creditIds: string[];
  unknownDocumentIds: string[];
}
const live = (record: { archivedAt: string | null; deletedAt: string | null }) =>
  !record.archivedAt && !record.deletedAt;
const inRange = (value: string, filters: DashboardFilters, timezone: string) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayInZone(timezone, value);
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
};
export function draftMissing(workspace: Workspace, change: Change): string[] {
  const project = workspace.projects.find((project) => project.id === change.projectId);
  if (!project) return ['Project'];
  const issues = Object.values(calculate(project.baseline, change).errors);
  for (const [label, value] of [
    ['Request title', change.title],
    ['Request description', change.request],
    ['Deliverables', change.deliverables],
    ['Approved project scope', project.baseline.approvedScope],
  ])
    if (!value.trim()) issues.push(label);
  if (change.classification !== 'Addition' && !change.contractConfirmed)
    issues.push('Contract review');
  return issues;
}
function projectForecast(
  project: Project,
  changes: Change[],
  approvedIds: Set<string>,
  reconciledIds: Set<string>,
  approvalReviewIds: Set<string>,
) {
  if (
    changes.some(
      (change) =>
        approvalReviewIds.has(change.id) && !change.includedAt && !reconciledIds.has(change.id),
    )
  )
    return null;
  const errors = {},
    revenue = parseAmount(project.baseline.fee, 'fee', errors, 'Approved fee'),
    actual = parseAmount(project.baseline.actual, 'actual', errors, 'Actual cost'),
    remaining = parseAmount(project.baseline.remaining, 'remaining', errors, 'Remaining forecast');
  if (!revenue || !actual || !remaining || revenue.lessThanOrEqualTo(0)) return null;
  let fee = revenue,
    unallocated = new Money(0),
    removed = new Money(0);
  for (const change of changes.filter(
    (change) =>
      change.projectId === project.id &&
      approvedIds.has(change.id) &&
      !change.includedAt &&
      !reconciledIds.has(change.id),
  )) {
    const result = calculate(project.baseline, change);
    if (!result.valid || result.netCost === null || result.effectiveFee === null) return null;
    fee = fee.plus(result.effectiveFee);
    unallocated = unallocated.plus(result.netCost);
    removed = removed.plus(change.removed);
  }
  if (fee.lessThanOrEqualTo(0) || removed.greaterThan(remaining)) return null;
  return {
    revenue: fee,
    actual,
    remaining,
    unallocatedCost: unallocated,
    margin: fee.minus(actual).minus(remaining).minus(unallocated).div(fee).times(100).toString(),
  };
}
export function buildDashboard(
  workspace: Workspace,
  filters: DashboardFilters = {},
  current = new Date().toISOString(),
) {
  const timezone = activeTimezone(workspace),
    today = todayInZone(timezone, current);
  const projectById = new Map(workspace.projects.map((project) => [project.id, project]));
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const balances = paymentBalances(workspace, current);
  const summaries = new Map(
    workspace.documents
      .filter((document) => document.kind !== 'brief' && document.snapshot && document.issuedAt)
      .map((document) => [
        document.id,
        invoiceSummary(workspace, document, current, balances.get(document.id), today),
      ]),
  );
  const changesByProject = new Map<string, Change[]>();
  for (const change of workspace.changes) {
    const group = changesByProject.get(change.projectId) ?? [];
    group.push(change);
    changesByProject.set(change.projectId, group);
  }
  const activeApprovals = new Map(
    workspace.approvals
      .filter((record) => record.invalidatedAt === null)
      .map((record) => [record.changeId, record]),
  );
  const approvalReviewIds = new Set(
    workspace.changes
      .filter(
        (change) =>
          change.status === 'Approved' &&
          change.route !== 'Defer' &&
          activeApprovals.get(change.id)?.revision === change.revision &&
          !recordedDateHasOccurred(
            activeApprovals.get(change.id)!.approvedAt,
            today,
            recordedDateToDate(current).getTime(),
          ),
      )
      .map((change) => change.id),
  );
  const approvedIds = new Set(
    workspace.changes
      .filter(
        (change) =>
          change.status === 'Approved' &&
          change.route !== 'Defer' &&
          activeApprovals.get(change.id)?.revision === change.revision &&
          !approvalReviewIds.has(change.id),
      )
      .map((change) => change.id),
  );
  const reconciledIds = new Set(workspace.reconciliations.map((record) => record.changeId));
  const reconciliationBefore = new Map(
    workspace.reconciliations.map((record) => [record.changeId, record.before]),
  );
  const issuedDecisions = new Set(
    workspace.documents
      .filter((document) => document.issuedAt && !document.voidedAt)
      .map((document) => `${document.changeId}:${document.revision}:${document.kind}`),
  );
  const decisionStatus =
    filters.status && ['Draft', 'Quoted', 'Approved', 'Rejected'].includes(filters.status)
      ? filters.status
      : null;
  const eligible = workspace.projects.filter(
    (project) =>
      (filters.includeArchived || !project.archivedAt) &&
      (filters.includeTrashed || !project.deletedAt) &&
      (filters.includeSample || !project.sample) &&
      (!filters.projectId || project.id === filters.projectId) &&
      (!filters.clientId || project.clientId === filters.clientId) &&
      (!filters.status ||
        filters.status === 'all' ||
        decisionStatus ||
        (project.state ?? 'active') === filters.status),
  );
  const eligibleIds = new Set(eligible.map((project) => project.id));
  const projects = eligible.filter(
    (project) =>
      (!filters.currency || project.currency === filters.currency) &&
      inRange(project.updatedAt, filters, timezone),
  );
  const projectIds = new Set(projects.map((project) => project.id));
  const changes = workspace.changes.filter(
    (change) =>
      eligibleIds.has(change.projectId) &&
      (!filters.currency || projectById.get(change.projectId)!.currency === filters.currency) &&
      live(change) &&
      (!decisionStatus || change.status === decisionStatus) &&
      inRange(change.updatedAt, filters, timezone),
  );
  const documents = workspace.documents.filter(
    (document) =>
      eligibleIds.has(document.projectId) &&
      (!filters.currency ||
        (document.snapshot?.currency ?? projectById.get(document.projectId)!.currency) ===
          filters.currency) &&
      inRange(document.snapshot?.issueDate || document.createdAt, filters, timezone),
  );
  const invoices: InvoiceSummary[] = documents
    .filter((document) => document.kind === 'invoice' && document.issuedAt && document.snapshot)
    .map((document) => summaries.get(document.id)!);
  const events = calendarEvents(workspace, current, balances).filter(
    (event) =>
      eligibleIds.has(event.projectId) &&
      (!filters.currency ||
        (event.documentId
          ? (documentById.get(event.documentId)?.snapshot?.currency ??
            projectById.get(event.projectId)!.currency)
          : projectById.get(event.projectId)!.currency) === filters.currency) &&
      !event.deletedAt &&
      event.status === 'open' &&
      inRange(eventDate(event, timezone), filters, timezone),
  );
  const forecasts = new Map(
    projects.map((project) => [
      project.id,
      projectForecast(
        project,
        changesByProject.get(project.id) ?? [],
        approvedIds,
        reconciledIds,
        approvalReviewIds,
      ),
    ]),
  );
  const approvedChanges = changes.filter((change) => approvedIds.has(change.id));
  const awaitingInvoice = approvedChanges.filter((change) => {
    const project = projectById.get(change.projectId)!;
    const result = calculate(reconciliationBefore.get(change.id) ?? project.baseline, change);
    if (result.effectiveFee === null || new Money(result.effectiveFee).isZero()) return false;
    const kind = new Money(result.effectiveFee).isNegative() ? 'credit' : 'invoice';
    return !issuedDecisions.has(`${change.id}:${change.revision}:${kind}`);
  });
  const currencies = [
    ...new Set([
      ...projects.map((project) => project.currency),
      ...documents.map(
        (document) => document.snapshot?.currency ?? projectById.get(document.projectId)!.currency,
      ),
    ]),
  ];
  const portfolio: PortfolioGroup[] = currencies.map((currency) => {
    const selected = projects.filter((project) => project.currency === currency),
      complete = selected.filter((project) => forecasts.get(project.id) !== null),
      excluded = selected.filter((project) => forecasts.get(project.id) === null);
    let revenue = new Money(0),
      actual = new Money(0),
      remaining = new Money(0),
      unallocated = new Money(0),
      proposed = new Money(0),
      invoiceSubtotal = new Money(0),
      tax = new Money(0),
      paid = new Money(0),
      outstanding = new Money(0),
      creditTotal = new Money(0),
      creditSettled = new Money(0);
    const proposedExcludedIds: string[] = [],
      invoiceIds: string[] = [],
      creditIds: string[] = [],
      unknownDocumentIds: string[] = [];
    for (const project of complete) {
      const forecast = forecasts.get(project.id)!;
      revenue = revenue.plus(forecast.revenue);
      actual = actual.plus(forecast.actual);
      remaining = remaining.plus(forecast.remaining);
      unallocated = unallocated.plus(forecast.unallocatedCost);
    }
    for (const change of changes.filter(
      (change) =>
        projectIds.has(change.projectId) &&
        !['Approved', 'Rejected'].includes(change.status) &&
        ['Quote', 'Exchange'].includes(change.route) &&
        projectById.get(change.projectId)!.currency === currency,
    )) {
      const result = calculate(projectById.get(change.projectId)!.baseline, change);
      if (result.effectiveFee === null) proposedExcludedIds.push(change.id);
      else proposed = proposed.plus(result.effectiveFee);
    }
    let unknownIncoming = false,
      unknownOutstanding = false,
      unknownCreditSettled = false;
    for (const document of documents.filter(
      (document) =>
        document.snapshot?.currency === currency && document.issuedAt && document.kind !== 'brief',
    )) {
      const summary = summaries.get(document.id)!,
        subtotal = parseAmount(document.snapshot!.subtotal, 'subtotal', {}, 'Subtotal'),
        amountTax = parseAmount(document.snapshot!.tax, 'tax', {}, 'Tax');
      const valuesKnown = summary.total !== null && subtotal !== null && amountTax !== null;
      const paymentsKnown = summary.paid !== null && summary.balance !== null;
      if (!valuesKnown || !paymentsKnown) unknownDocumentIds.push(document.id);
      if (document.kind === 'credit') {
        creditIds.push(document.id);
        if (!document.voidedAt && summary.total !== null)
          creditTotal = creditTotal.plus(summary.total);
        if (summary.paid !== null) creditSettled = creditSettled.plus(summary.paid);
        else unknownCreditSettled = true;
      } else {
        invoiceIds.push(document.id);
        if (summary.paid !== null) paid = paid.plus(summary.paid);
        else unknownIncoming = true;
        if (!document.voidedAt) {
          if (subtotal !== null) invoiceSubtotal = invoiceSubtotal.plus(subtotal);
          if (amountTax !== null) tax = tax.plus(amountTax);
          if (summary.balance !== null) outstanding = outstanding.plus(summary.balance);
          else unknownOutstanding = true;
        }
      }
    }
    const known = complete.length > 0 || !excluded.length;
    return {
      currency,
      projectIds: selected.map((project) => project.id),
      completeProjectIds: complete.map((project) => project.id),
      excludedProjectIds: excluded.map((project) => project.id),
      revenue: known ? revenue.toFixed(2) : null,
      actual: known ? actual.toFixed(2) : null,
      remaining: known ? remaining.toFixed(2) : null,
      unallocatedCost: known ? unallocated.toFixed(2) : null,
      margin: revenue.greaterThan(0)
        ? revenue
            .minus(actual)
            .minus(remaining)
            .minus(unallocated)
            .div(revenue)
            .times(100)
            .toString()
        : null,
      proposedFees: proposed.toFixed(2),
      proposedExcludedIds,
      invoiceSubtotal: invoiceSubtotal.toFixed(2),
      tax: tax.toFixed(2),
      paid: unknownIncoming ? null : paid.toFixed(2),
      outstanding: unknownOutstanding ? null : outstanding.toFixed(2),
      creditTotal: creditTotal.toFixed(2),
      creditSettled: unknownCreditSettled ? null : creditSettled.toFixed(2),
      invoiceIds,
      creditIds,
      unknownDocumentIds,
    };
  });
  const belowTarget = projects.flatMap((project) => {
    const forecast = forecasts.get(project.id),
      target = parseAmount(project.baseline.target, 'target', {}, 'Target margin');
    return forecast && target && target.lessThan(100) && new Money(forecast.margin).lessThan(target)
      ? [{ project, margin: forecast.margin, target: target.toString() }]
      : [];
  });
  const lastBackup = workspace.context.lastBackupAt,
    ageDays = lastBackup
      ? Math.max(
          0,
          Math.floor(
            (recordedDateToDate(current).getTime() - recordedDateToDate(lastBackup).getTime()) /
              86_400_000,
          ),
        )
      : null;
  const historicalIds = new Set(
    workspace.projects
      .filter(
        (project) =>
          (project.archivedAt || project.deletedAt) &&
          !eligibleIds.has(project.id) &&
          (filters.includeSample || !project.sample) &&
          (!filters.projectId || project.id === filters.projectId) &&
          (!filters.clientId || project.clientId === filters.clientId),
      )
      .map((project) => project.id),
  );
  const hiddenHistoricalInvoices = workspace.documents
    .filter(
      (document) =>
        document.kind === 'invoice' &&
        document.issuedAt &&
        !document.voidedAt &&
        historicalIds.has(document.projectId) &&
        (!filters.currency ||
          (document.snapshot?.currency ?? projectById.get(document.projectId)!.currency) ===
            filters.currency) &&
        inRange(document.snapshot?.issueDate || document.createdAt, filters, timezone),
    )
    .filter(
      (document) =>
        !['paid', 'voided'].includes(summaries.get(document.id)?.status ?? 'unavailable'),
    ).length;
  return {
    projects,
    changes,
    documents,
    invoices,
    portfolio,
    timezone,
    today,
    attention: {
      approvalReview: changes.filter((change) => approvalReviewIds.has(change.id)),
      drafts: changes.filter(
        (change) => change.status === 'Draft' && draftMissing(workspace, change).length > 0,
      ),
      quoted: changes.filter((change) => change.status === 'Quoted' && change.route !== 'Defer'),
      approvedUnreconciled: approvedChanges.filter(
        (change) => !change.includedAt && !reconciledIds.has(change.id),
      ),
      awaitingInvoice,
      belowTarget,
      events: events.filter(
        (event) =>
          !event.overdue && eventOverlapsPeriod(event, timezone, today, addDays(today, 14)),
      ),
      overdueEvents: events.filter((event) => event.overdue),
      unknownProjectIds: projects
        .filter((project) => !forecasts.get(project.id))
        .map((project) => project.id),
    },
    recent: {
      changes: [...changes]
        .sort((a, b) => compareRecordedDates(b.updatedAt, a.updatedAt))
        .slice(0, 8),
      documents: [...documents]
        .filter((document) => document.issuedAt)
        .sort((a, b) => compareRecordedDates(b.issuedAt ?? b.createdAt, a.issuedAt ?? a.createdAt))
        .slice(0, 8),
    },
    backup: { needed: ageDays === null || ageDays >= 14, ageDays },
    hiddenHistoricalInvoices,
    sampleCount: workspace.projects.filter((project) => project.sample && live(project)).length,
  };
}
