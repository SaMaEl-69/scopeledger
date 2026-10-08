import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  AlertTriangle,
  CheckCheck,
  CalendarDays,
  FileText,
  ShieldCheck,
  Filter,
  FolderKanban,
  Coins,
} from 'lucide-react';
import { Empty, Modal } from '../components/ui';
import { CURRENCIES } from '../domain/types';
import type { Change, Currency, DocumentRecord, Project } from '../domain/types';
import { formatMoney, formatPercent } from '../domain/finance';
import type { NavigationTarget, OperationalProps } from './types';
import { buildDashboard, draftMissing, type DashboardFilters } from './dashboard';
import { dateLabel, eventDate } from './dates';
import './operational.css';

interface Drilldown {
  title: string;
  description: string;
  rows: { id: string; title: string; detail: string; target: NavigationTarget }[];
}
export function DashboardView({
  w,
  onNavigate,
  storageError,
  onNewProject,
}: OperationalProps & { onNewProject?: () => void }) {
  const [filters, setFilters] = useState<DashboardFilters>({ status: 'all', includeSample: false }),
    [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [current, setCurrent] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setCurrent(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const data = useMemo(() => buildDashboard(w, filters, current), [w, filters, current]);
  const hasRealProjects = w.projects.some((project) => !project.sample);
  const hasUserFilters = !!(
    filters.projectId ||
    filters.clientId ||
    filters.currency ||
    filters.from ||
    filters.to ||
    (filters.status && filters.status !== 'all')
  );
  const advancedFilterCount = [
    !!filters.clientId,
    !!(filters.status && filters.status !== 'all'),
    !!filters.from,
    !!filters.to,
    !!filters.includeSample,
    !!filters.includeArchived,
    !!filters.includeTrashed,
  ].filter(Boolean).length;
  const hasAnyFilters = hasUserFilters || advancedFilterCount > 0;
  const sampleProject = w.projects.find(
    (project) => project.sample && !project.deletedAt && !project.archivedAt,
  );
  const resetFilters = () => setFilters({ status: 'all', includeSample: false });
  const changeRow = (change: Change) => ({
    id: change.id,
    title: change.title || 'Untitled change',
    detail: `${w.projects.find((project) => project.id === change.projectId)?.name} · ${change.status} · revision ${change.revision}`,
    target: { view: 'workspace' as const, projectId: change.projectId, changeId: change.id },
  });
  const projectRow = (project: Project) => ({
    id: project.id,
    title: project.name,
    detail: `${project.state ?? 'active'} · ${project.currency}${project.sample ? ' · Sample' : ''}`,
    target: { view: 'workspace' as const, projectId: project.id },
  });
  const documentRow = (document: DocumentRecord) => ({
    id: document.id,
    title: document.snapshot?.reference ?? 'Legacy document',
    detail: `${w.projects.find((project) => project.id === document.projectId)?.name} · ${document.kind} · ${document.voidedAt ? 'Voided' : 'Preserved issued record'}`,
    target: {
      view: 'documents' as const,
      projectId: document.projectId,
      changeId: document.changeId,
      documentId: document.id,
    },
  });
  const inspectChanges = (title: string, changes: Change[], description: string) =>
    setDrilldown({ title, description, rows: changes.map(changeRow) });
  const attention = [
    {
      title: 'Quotes awaiting a decision',
      count: data.attention.quoted.length,
      detail: 'Record the client response or schedule a follow-up.',
      action: () =>
        inspectChanges(
          'Quotes awaiting a decision',
          data.attention.quoted,
          'These quotes are awaiting a recorded client decision.',
        ),
    },
    {
      title: 'Approved · reconcile next',
      count: data.attention.approvedUnreconciled.length,
      detail: 'Allocate incurred and future costs before the next change.',
      action: () =>
        inspectChanges(
          'Approved work awaiting reconciliation',
          data.attention.approvedUnreconciled,
          'Approval has been recorded, but its costs and revenue have not been included in the baseline.',
        ),
    },
    {
      title: 'Approved · document needed',
      count: data.attention.awaitingInvoice.length,
      detail: 'Issue an invoice or an explicit credit for agreed work.',
      action: () =>
        setDrilldown({
          title: 'Approved work awaiting an invoice or credit',
          description:
            'Only nonzero approved fees or explicit credits are included. Open a record to prepare the relevant document.',
          rows: data.attention.awaitingInvoice.map((change) => ({
            ...changeRow(change),
            target: {
              view: 'documents' as const,
              projectId: change.projectId,
              changeId: change.id,
            },
          })),
        }),
    },
    {
      title: 'Incomplete draft estimates',
      count: data.attention.drafts.length,
      detail: 'Correct unknown costs and missing scope.',
      action: () =>
        setDrilldown({
          title: 'Drafts missing essential information',
          description: 'Unknown estimates remain unknown until the following fields are completed.',
          rows: data.attention.drafts.map((change) => ({
            ...changeRow(change),
            detail: draftMissing(w, change).slice(0, 3).join(' · '),
          })),
        }),
    },
  ];
  const overdue = data.invoices.filter((invoice) => invoice.overdue),
    outstanding = data.invoices.filter(
      (invoice) =>
        invoice.status === 'unpaid' ||
        invoice.status === 'partial' ||
        invoice.status === 'unavailable',
    );
  return (
    <div className="operational dashboard-operational">
      <div className="operational-filter-area">
        <div className="operational-filter-primary">
          <div className="operational-filters dashboard-filters primary-filters">
            <label>
              Project
              <select
                aria-label="Dashboard project filter"
                value={filters.projectId ?? ''}
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
              >
                <option value="">All projects</option>
                {w.projects
                  .filter((project) => !project.deletedAt && !project.archivedAt)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.sample ? ' · Sample' : ''}
                    </option>
                  ))}
              </select>
            </label>
            <label className="dashboard-currency-filter">
              Currency
              <select
                aria-label="Dashboard currency filter"
                value={filters.currency ?? ''}
                onChange={(e) =>
                  setFilters({ ...filters, currency: e.target.value as Currency | undefined })
                }
              >
                <option value="">All currencies</option>
                {CURRENCIES.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>
          {hasAnyFilters && (
            <button className="text-button" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>
        <details className="operational-more-filters">
          <summary>
            <Filter size={15} /> More filters
            {advancedFilterCount > 0 && (
              <span className="filter-count">{advancedFilterCount} active</span>
            )}
          </summary>
          <div className="operational-filters advanced-filters">
            <label>
              Client
              <select
                aria-label="Dashboard client filter"
                value={filters.clientId ?? ''}
                onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
              >
                <option value="">All clients</option>
                {w.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name || 'Unnamed client'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                aria-label="Dashboard status filter"
                value={filters.status ?? 'all'}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value as DashboardFilters['status'] })
                }
              >
                {[
                  'all',
                  'active',
                  'on-hold',
                  'completed',
                  'Draft',
                  'Quoted',
                  'Approved',
                  'Rejected',
                ].map((status) => (
                  <option key={status} value={status}>
                    {status === 'all' ? 'All states' : status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                aria-label="Dashboard date from"
                type="date"
                value={filters.from ?? ''}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              />
            </label>
            <label>
              Through
              <input
                aria-label="Dashboard date through"
                type="date"
                min={filters.from}
                value={filters.to ?? ''}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </label>
            <label className="operational-check">
              <input
                type="checkbox"
                checked={!!filters.includeSample}
                onChange={(e) => setFilters({ ...filters, includeSample: e.target.checked })}
              />{' '}
              Include sample data
            </label>
            <label className="operational-check">
              <input
                type="checkbox"
                checked={!!filters.includeArchived}
                onChange={(e) => setFilters({ ...filters, includeArchived: e.target.checked })}
              />{' '}
              Include archived projects
            </label>
            <label className="operational-check">
              <input
                type="checkbox"
                checked={!!filters.includeTrashed}
                onChange={(e) => setFilters({ ...filters, includeTrashed: e.target.checked })}
              />{' '}
              Include project trash
            </label>
          </div>
          <details className="filter-explanation disclosure-note">
            <summary>
              How these filters affect your totals <span>{data.timezone}</span>
            </summary>
            <p className="operational-footnote">
              Dates apply to each record: project or decision last update, document issue date, and
              calendar event start date, in {data.timezone}. Project-state filters apply to
              projects; Draft/Quoted/Approved/Rejected filters apply to decision lists. Committed
              totals still use every current approval in the selected projects. Archive and trash
              are excluded by default; include them to inspect preserved financial history. Invoice
              currency stays as issued; payment totals follow their document's issue-date filter.
            </p>
          </details>
        </details>
      </div>
      {(storageError || data.backup.needed) && (
        <div className={`operational-banner ${storageError ? 'operational-danger' : ''}`}>
          <ShieldCheck size={22} />
          <div>
            <strong>
              {storageError ? 'Protect unsaved work' : 'Keep a recovery copy outside this browser'}
            </strong>
            <p>
              {storageError ||
                `Projects are local to this browser. ${data.backup.ageDays === null ? 'No backup has been recorded.' : `The last backup was ${data.backup.ageDays} days ago.`}`}
            </p>
          </div>
          <button className="button secondary" onClick={() => onNavigate({ view: 'settings' })}>
            Backup & recovery <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      {!!data.hiddenHistoricalInvoices && (
        <div className="operational-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>
              {data.hiddenHistoricalInvoices} outstanding or unknown invoices belong to archived /
              trashed projects
            </strong>
            <p>Archiving does not cancel invoice obligations or erase recorded payments.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setFilters({ ...filters, includeArchived: true, includeTrashed: true })}
          >
            Inspect financial history
          </button>
        </div>
      )}
      {!!data.attention.approvalReview.length && (
        <div className="operational-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>
              {data.attention.approvalReview.length} recorded approval dates need review
            </strong>
            <p>
              A future approval date may indicate an incorrect device clock or history entry.
              Pending contribution stays unknown; invoice issue and reconciliation wait for review.
              Original records and baselines remain preserved.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              inspectChanges(
                'Review recorded approval dates',
                data.attention.approvalReview,
                'Check the device clock and original approval evidence. Reopen an incorrect approval as a draft and record dated confirmation; its previous history is preserved.',
              )
            }
          >
            Review approvals <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      {!data.projects.length && !data.changes.length && !data.documents.length ? (
        <section className="card">
          <Empty
            title={
              hasRealProjects || hasAnyFilters
                ? 'No work matches these filters'
                : 'Start with your real project'
            }
          >
            {hasRealProjects || hasAnyFilters ? (
              <>
                Adjust the filters to see your work, or review archived and trashed projects in
                Projects.{' '}
                <button
                  className="text-button"
                  onClick={() => setFilters({ status: 'all', includeSample: false })}
                >
                  Reset filters
                </button>{' '}
                <button className="text-button" onClick={() => onNavigate({ view: 'projects' })}>
                  Open Projects
                </button>
              </>
            ) : (
              <>
                Sample work is excluded from your totals. Create a project to start, or try the
                sample request.
                <span className="operational-start-actions">
                  <button
                    className="button primary"
                    onClick={() =>
                      onNewProject ? onNewProject() : onNavigate({ view: 'projects' })
                    }
                  >
                    Create project
                  </button>
                  {sampleProject && (
                    <button
                      className="button secondary"
                      onClick={() => onNavigate({ view: 'workspace', projectId: sampleProject.id })}
                    >
                      Open sample request
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setFilters({ ...filters, includeSample: true })}
                  >
                    Include sample data
                  </button>
                </span>
              </>
            )}
          </Empty>
        </section>
      ) : (
        <>
          <div className="dashboard-priority">
            <div className="operational-section-heading">
              <div>
                <h2>What needs attention</h2>
                <p>Move the next decision forward.</p>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  setDrilldown({
                    title: 'Selected projects',
                    description:
                      'Project states are retained locally. Sample projects are identified explicitly.',
                    rows: data.projects.map(projectRow),
                  })
                }
              >
                <FolderKanban size={16} />{' '}
                {data.projects.filter((project) => (project.state ?? 'active') === 'active').length}{' '}
                active projects
              </button>
            </div>
            <div className="dashboard-attention-grid">
              {attention.map((item) => (
                <button
                  className={`dashboard-attention ${item.count ? 'has-items' : ''}`}
                  key={item.title}
                  onClick={item.action}
                >
                  <span>{item.title}</span>
                  <strong>{item.count}</strong>
                  <p>{item.detail}</p>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </div>
          <div className="operational-two-columns">
            <section className="card dashboard-list">
              <div className="section-heading">
                <h2>Invoice attention</h2>
                <button
                  className="text-button"
                  onClick={() =>
                    setDrilldown({
                      title: 'Invoices requiring attention',
                      description:
                        'Balances use only manually recorded active payments. Due dates do not mark invoices paid.',
                      rows: outstanding.map((invoice) => ({
                        ...documentRow(invoice.document),
                        detail: `${invoice.status === 'partial' ? 'Partially paid' : 'Unpaid'} · ${formatMoney(invoice.balance, invoice.document.snapshot!.currency)} outstanding${invoice.overdue ? ' · Overdue' : ''}`,
                      })),
                    })
                  }
                >
                  {outstanding.length} open <ArrowUpRight size={15} />
                </button>
              </div>
              <p className="section-description">
                Manual tracking · {overdue.length} overdue. Cash collected is distinct from approved
                project value.
              </p>
              {outstanding.length ? (
                outstanding.slice(0, 5).map((invoice) => (
                  <button
                    className="operational-row"
                    key={invoice.document.id}
                    onClick={() => onNavigate(documentRow(invoice.document).target)}
                  >
                    <div>
                      <strong>{invoice.document.snapshot?.reference}</strong>
                      <span>
                        {!invoice.known
                          ? 'Balance unknown'
                          : invoice.overdue
                            ? 'Overdue'
                            : invoice.status === 'partial'
                              ? 'Partially paid'
                              : 'Unpaid'}{' '}
                        · due {invoice.document.snapshot?.dueDate}
                      </span>
                    </div>
                    <strong className={invoice.overdue ? 'danger-text' : ''}>
                      {formatMoney(invoice.balance, invoice.document.snapshot!.currency)}
                    </strong>
                  </button>
                ))
              ) : (
                <div className="operational-empty">
                  No outstanding invoices in this filter.{' '}
                  <button className="text-button" onClick={() => onNavigate({ view: 'documents' })}>
                    Open Documents
                  </button>
                </div>
              )}
            </section>
            <section className="card dashboard-list">
              <div className="section-heading">
                <h2>Contribution forecast below target</h2>
                <span className="badge">{data.attention.belowTarget.length}</span>
              </div>
              <p className="section-description">
                Weighted committed outcome, including approved work awaiting reconciliation.
                Contribution margin is not net profit.
              </p>
              {data.attention.belowTarget.length ? (
                data.attention.belowTarget.slice(0, 5).map((item) => (
                  <button
                    className="operational-row"
                    key={item.project.id}
                    onClick={() => onNavigate({ view: 'workspace', projectId: item.project.id })}
                  >
                    <div>
                      <strong>{item.project.name}</strong>
                      <span>
                        Target {formatPercent(item.target)}
                        {item.project.sample ? ' · Sample' : ''}
                      </span>
                    </div>
                    <strong className="danger-text">{formatPercent(item.margin)}</strong>
                  </button>
                ))
              ) : (
                <p className="operational-empty">No known contribution forecast is below target.</p>
              )}
              {!!data.attention.unknownProjectIds.length && (
                <button
                  className="operational-note-button"
                  onClick={() =>
                    setDrilldown({
                      title: 'Unknown project forecasts',
                      description:
                        'These projects are excluded from contribution totals rather than treated as zero. Complete baseline inputs and outstanding approved estimates, or review recorded approval dates and the device clock.',
                      rows: data.projects
                        .filter((project) => data.attention.unknownProjectIds.includes(project.id))
                        .map(projectRow),
                    })
                  }
                >
                  <AlertTriangle size={15} /> {data.attention.unknownProjectIds.length} incomplete
                  forecasts excluded · inspect
                </button>
              )}
            </section>
          </div>
          <section className="card portfolio-card">
            <div className="operational-section-heading">
              <div>
                <h2>Committed contribution, by currency</h2>
                <p>
                  Approved baseline plus current approved, unincluded changes. Reconciled work is
                  counted once.
                </p>
              </div>
              <Coins size={22} />
            </div>
            {data.portfolio.map((group) => (
              <div className="portfolio-group" key={group.currency}>
                <div className="portfolio-heading">
                  <strong>
                    {group.currency}
                    {filters.includeSample ? ' · sample included' : ''}
                  </strong>
                  <button
                    className="text-button"
                    onClick={() =>
                      setDrilldown({
                        title: `${group.currency} contribution records`,
                        description:
                          'Only projects with complete executable forecasts contribute to these totals. Approved costs awaiting allocation are separate from the actual/remaining baseline.',
                        rows: data.projects
                          .filter((project) => group.projectIds.includes(project.id))
                          .map(projectRow),
                      })
                    }
                  >
                    Inspect {group.completeProjectIds.length} known / {group.projectIds.length}{' '}
                    projects <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="portfolio-numbers">
                  <div className="portfolio-primary">
                    <span>Weighted contribution margin</span>
                    <strong>{formatPercent(group.margin)}</strong>
                  </div>
                  <div>
                    <span>Approved project revenue · excluding tax</span>
                    <strong>{formatMoney(group.revenue, group.currency)}</strong>
                  </div>
                  <div>
                    <span>Actual cost in baselines</span>
                    <strong>{formatMoney(group.actual, group.currency)}</strong>
                  </div>
                  <div>
                    <span>Remaining forecast in baselines</span>
                    <strong>{formatMoney(group.remaining, group.currency)}</strong>
                  </div>
                  <div>
                    <span>Net approved cost awaiting reconciliation</span>
                    <strong>{formatMoney(group.unallocatedCost, group.currency)}</strong>
                  </div>
                </div>
                {!!group.excludedProjectIds.length && (
                  <p className="field-hint">
                    {group.excludedProjectIds.length} projects with unknown estimates or approval
                    dates needing review are excluded from revenue/cost forecast totals. Their
                    records are preserved.
                  </p>
                )}
                <details className="portfolio-details">
                  <summary>Inspect proposals, invoices, tax, and manual payments</summary>
                  <div className="portfolio-accounting">
                    <button
                      onClick={() =>
                        inspectChanges(
                          `${group.currency} conditional proposed fees`,
                          data.changes.filter(
                            (change) =>
                              group.projectIds.includes(change.projectId) &&
                              !['Approved', 'Rejected'].includes(change.status) &&
                              ['Quote', 'Exchange'].includes(change.route) &&
                              w.projects.find((project) => project.id === change.projectId)
                                ?.currency === group.currency,
                          ),
                          'Unapproved proposals are conditional and never added to committed project revenue. Saved comparisons are alternatives and are not counted.',
                        )
                      }
                    >
                      <span>Conditional net proposed fees</span>
                      <strong>{formatMoney(group.proposedFees, group.currency)}</strong>
                    </button>
                    <button
                      onClick={() =>
                        setDrilldown({
                          title: `${group.currency} issued invoices`,
                          description:
                            'Issued invoice subtotals exclude tax and do not represent cash collected.',
                          rows: data.documents
                            .filter(
                              (document) =>
                                group.invoiceIds.includes(document.id) && !document.voidedAt,
                            )
                            .map(documentRow),
                        })
                      }
                    >
                      <span>Issued invoice subtotals</span>
                      <strong>{formatMoney(group.invoiceSubtotal, group.currency)}</strong>
                    </button>
                    <button
                      onClick={() =>
                        setDrilldown({
                          title: `${group.currency} tax on issued invoices`,
                          description:
                            'Tax is kept separate and never enters contribution calculations. This tool does not determine tax compliance.',
                          rows: data.documents
                            .filter(
                              (document) =>
                                group.invoiceIds.includes(document.id) && !document.voidedAt,
                            )
                            .map(documentRow),
                        })
                      }
                    >
                      <span>Invoice tax, separate</span>
                      <strong>{formatMoney(group.tax, group.currency)}</strong>
                    </button>
                    <button
                      onClick={() =>
                        setDrilldown({
                          title: `${group.currency} manual incoming payments`,
                          description:
                            'Payments are manually recorded against issued invoices, not bank or payment-provider reconciliation. Voiding an invoice does not erase or refund a recorded payment.',
                          rows: data.documents
                            .filter((document) => group.invoiceIds.includes(document.id))
                            .map(documentRow),
                        })
                      }
                    >
                      <span>Manually recorded incoming payments</span>
                      <strong>{formatMoney(group.paid, group.currency)}</strong>
                    </button>
                    <button
                      onClick={() =>
                        setDrilldown({
                          title: `${group.currency} outstanding invoices`,
                          description:
                            'Invoice totals include tax. Only active manually recorded payments reduce these balances.',
                          rows: data.invoices
                            .filter(
                              (invoice) =>
                                group.invoiceIds.includes(invoice.document.id) &&
                                (invoice.status === 'unpaid' ||
                                  invoice.status === 'partial' ||
                                  invoice.status === 'unavailable'),
                            )
                            .map((invoice) => documentRow(invoice.document)),
                        })
                      }
                    >
                      <span>Outstanding, including invoice tax</span>
                      <strong>{formatMoney(group.outstanding, group.currency)}</strong>
                    </button>
                    <button
                      onClick={() =>
                        setDrilldown({
                          title: `${group.currency} explicit credit records`,
                          description:
                            'Credits and outgoing manual settlements are separate. They do not silently reduce invoice balances.',
                          rows: data.documents
                            .filter((document) => group.creditIds.includes(document.id))
                            .map(documentRow),
                        })
                      }
                    >
                      <span>Explicit credits issued / manually settled</span>
                      <strong>
                        {formatMoney(group.creditTotal, group.currency)} /{' '}
                        {formatMoney(group.creditSettled, group.currency)}
                      </strong>
                    </button>
                  </div>
                  {!!group.proposedExcludedIds.length && (
                    <p className="field-hint">
                      {group.proposedExcludedIds.length} proposed fees remain unknown and are
                      excluded.
                    </p>
                  )}
                  {!!group.unknownDocumentIds.length && (
                    <p className="field-hint">
                      {group.unknownDocumentIds.length} document payment balances are unknown. Known
                      issued subtotals and tax remain included; affected cash or outstanding totals
                      stay unknown until the records are corrected or voided.
                    </p>
                  )}
                </details>
              </div>
            ))}
          </section>
          <div className="operational-two-columns">
            <section className="card dashboard-list">
              <div className="section-heading">
                <h2>Upcoming & overdue dates</h2>
                <button className="text-button" onClick={() => onNavigate({ view: 'calendar' })}>
                  <CalendarDays size={16} /> Calendar
                </button>
              </div>
              {[...data.attention.overdueEvents, ...data.attention.events]
                .slice(0, 8)
                .map((event) => (
                  <button
                    key={event.id}
                    className="operational-row"
                    onClick={() =>
                      onNavigate({
                        view: 'calendar',
                        eventId: event.id,
                        projectId: event.projectId,
                        ...(event.changeId ? { changeId: event.changeId } : {}),
                        ...(event.documentId ? { documentId: event.documentId } : {}),
                      })
                    }
                  >
                    <div>
                      <strong>{event.title}</strong>
                      <span>
                        {dateLabel(eventDate(event, data.timezone))} ·{' '}
                        {event.derived ? 'Source deadline' : 'Manual reminder'}
                      </span>
                    </div>
                    <span className={`badge ${event.overdue ? 'danger' : ''}`}>
                      {event.overdue ? 'Overdue' : 'Upcoming'}
                    </span>
                  </button>
                ))}
              {!data.attention.events.length && !data.attention.overdueEvents.length && (
                <p className="operational-empty">
                  No upcoming or overdue events.{' '}
                  <button className="text-button" onClick={() => onNavigate({ view: 'calendar' })}>
                    Plan a follow-up
                  </button>
                  .
                </p>
              )}
            </section>
            <section className="card dashboard-list">
              <div className="section-heading">
                <h2>Recent decisions & documents</h2>
                <CheckCheck size={19} />
              </div>
              {data.recent.changes.slice(0, 4).map((change) => (
                <button
                  key={change.id}
                  className="operational-row"
                  onClick={() => onNavigate(changeRow(change).target)}
                >
                  <div>
                    <strong>{change.title || 'Untitled change'}</strong>
                    <span>
                      {change.status} · revision {change.revision}
                    </span>
                  </div>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {data.recent.documents.slice(0, 4).map((document) => (
                <button
                  key={document.id}
                  className="operational-row"
                  onClick={() => onNavigate(documentRow(document).target)}
                >
                  <div>
                    <strong>{document.snapshot?.reference ?? 'Preserved document'}</strong>
                    <span>
                      {document.kind} · {document.voidedAt ? 'Voided' : 'Issued snapshot'}
                    </span>
                  </div>
                  <FileText size={16} />
                </button>
              ))}
              {!data.recent.changes.length && !data.recent.documents.length && (
                <p className="operational-empty">
                  No decisions or issued documents in this filter.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {drilldown && (
        <Modal title={drilldown.title} onClose={() => setDrilldown(null)}>
          <div className="dashboard-drilldown">
            <p>{drilldown.description}</p>
            {drilldown.rows.length ? (
              drilldown.rows.map((row) => (
                <button
                  className="operational-row"
                  key={row.id}
                  onClick={() => {
                    onNavigate(row.target);
                    setDrilldown(null);
                  }}
                >
                  <div>
                    <strong>{row.title}</strong>
                    <span>{row.detail}</span>
                  </div>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <Empty title="No records in this filter">
                Adjust the dashboard filters or{' '}
                <button
                  className="text-button"
                  onClick={() => {
                    onNavigate({ view: 'projects' });
                    setDrilldown(null);
                  }}
                >
                  open Projects
                </button>
                .
              </Empty>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
