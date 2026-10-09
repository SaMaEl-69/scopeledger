import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  ArrowUpRight,
  Clock,
  RotateCcw,
  Trash2,
  Check,
  X,
  Filter,
} from 'lucide-react';
import { Modal, Empty } from '../components/ui';
import type { CalendarEvent, EventType, Workspace } from '../domain/types';
import { recordedDateToDate } from '../domain/dates';
import { projectDeliveryDate } from '../domain/delivery';
import type { OperationalProps } from './types';
import {
  EVENT_LABELS,
  activeTimezone,
  calendarEvents,
  filterCalendarEvents,
  unscheduledChanges,
  saveManualEvent,
  updateEventStatus,
  deleteEvent,
  recoverEvent,
  setProjectDeadline,
  exportCalendarIcs,
  type CalendarFilters,
  type OperationalEvent,
} from './calendar';
import {
  addDays,
  dateLabel,
  eventDate,
  eventOverlapsPeriod,
  eventDateRange,
  editedLocalDateTimeToInstant,
  instantToLocalDateTime,
  isDateOnly,
  periodDays,
  shiftPeriod,
  todayInZone,
  validateEventDates,
} from './dates';
import './operational.css';

export function CalendarView({
  w,
  onChange: saveWorkspace,
  onNavigate,
  notify,
  selectedEventId,
  createIntent = 0,
  onCreateHandled,
}: OperationalProps & { createIntent?: number; onCreateHandled?: () => void }) {
  const timezone = activeTimezone(w);
  const onChange: OperationalProps['onChange'] = (update) => {
    if (saveWorkspace(update) === false)
      throw new Error(
        'This calendar edit exceeds workspace capacity and was not applied. Review storage in Settings & backup.',
      );
  };
  const [current, setCurrent] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setCurrent(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const today = todayInZone(timezone, current);
  const [cursor, setCursor] = useState(today),
    [view, setView] = useState<'month' | 'week' | 'agenda'>(() =>
      typeof window !== 'undefined' && window.innerWidth < 700 ? 'agenda' : 'month',
    );
  const [filters, setFilters] = useState<CalendarFilters>({ status: 'all' }),
    [selected, setSelected] = useState<OperationalEvent | null>(null);
  const advancedFilterCount = [
    !!(filters.type && filters.type !== 'all'),
    !!(filters.status && filters.status !== 'all'),
    !!filters.includeDeleted,
  ].filter(Boolean).length;
  const hasAnyFilters = !!filters.projectId || advancedFilterCount > 0;
  const [editing, setEditing] = useState<{ event?: CalendarEvent; date?: string } | null>(null),
    [deadlineProject, setDeadlineProject] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [overdueLimit, setOverdueLimit] = useState(8),
    [unscheduledLimit, setUnscheduledLimit] = useState(8);
  const handledCreateIntent = useRef(0);
  useEffect(() => {
    if (createIntent <= 0) {
      handledCreateIntent.current = 0;
      return;
    }
    if (handledCreateIntent.current === createIntent) return;
    handledCreateIntent.current = createIntent;
    if (!editing && !selected && !deadlineProject) setEditing({ date: today });
    onCreateHandled?.();
  }, [createIntent, onCreateHandled, today, editing, selected, deadlineProject]);
  const handledEvent = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedEventId) {
      handledEvent.current = null;
      return;
    }
    if (handledEvent.current === selectedEventId) return;
    const event = calendarEvents(w, current).find((event) => event.id === selectedEventId);
    if (event) {
      setSelected(event);
      setCursor(eventDate(event, timezone));
      handledEvent.current = selectedEventId;
    }
  }, [selectedEventId, w, current, timezone]);
  const allEvents = useMemo(() => calendarEvents(w, current), [w, current]);
  const projects = useMemo(
    () => new Map(w.projects.map((project) => [project.id, project])),
    [w.projects],
  );
  const projectLabel = (projectId: string) => {
    const project = projects.get(projectId);
    return `${project?.name ?? 'Project'}${project?.sample ? ' · Sample' : ''}${project?.deletedAt ? ' · Project in trash' : project?.archivedAt ? ' · Archived project' : ''}`;
  };
  const events = useMemo(() => filterCalendarEvents(allEvents, filters), [allEvents, filters]),
    days = useMemo(() => periodDays(cursor, view === 'month' ? 'month' : 'week'), [cursor, view]);
  const start = view === 'agenda' ? cursor : days[0],
    end = view === 'agenda' ? addDays(cursor, 30) : days[days.length - 1];
  const visible = useMemo(
    () => events.filter((event) => eventOverlapsPeriod(event, timezone, start, end)),
    [events, timezone, start, end],
  );
  const dayEvents = useMemo(() => {
    const buckets = new Map(days.map((day) => [day, [] as OperationalEvent[]]));
    for (const event of visible) {
      const range = eventDateRange(event, timezone);
      for (const day of days)
        if (range.first <= day && range.last >= day) buckets.get(day)!.push(event);
    }
    return buckets;
  }, [visible, days, timezone]);
  const missing = unscheduledChanges(w, allEvents).filter(
    (change) => !filters.projectId || change.projectId === filters.projectId,
  );
  const overdue = useMemo(() => events.filter((event) => event.overdue), [events]);
  useEffect(() => {
    setOverdueLimit(8);
    setUnscheduledLimit(8);
  }, [filters.projectId, filters.type, filters.status, filters.includeDeleted, w.id]);
  const run = (action: () => void, message?: string) => {
    try {
      action();
      setError('');
      if (message) notify?.(message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The calendar could not be updated.');
    }
  };
  const source = (event: OperationalEvent) =>
    onNavigate({
      view: event.documentId ? 'documents' : 'workspace',
      projectId: event.projectId,
      ...(event.changeId ? { changeId: event.changeId } : {}),
      ...(event.documentId ? { documentId: event.documentId } : {}),
    });
  const period =
    view === 'month'
      ? dateLabel(cursor, { month: 'long', year: 'numeric' })
      : `${dateLabel(start)} – ${dateLabel(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const download = () =>
    run(() => {
      const blob = new Blob(
          [exportCalendarIcs(visible, { name: 'ScopeLedger operational calendar' })],
          { type: 'text/calendar;charset=utf-8' },
        ),
        url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'scopeledger-calendar.ics';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Calendar file exported. It does not create automatic synchronization.');
  return (
    <div className="operational calendar-operational">
      <div className="operational-banner">
        <CalendarDays size={20} />
        <div>
          <strong>One calendar, connected to the work</strong>
          <p>
            Active timezone: <b>{timezone}</b>. Reminders work while you use this app. No email or
            closed-app notifications are sent.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing({ date: cursor })}>
          <Plus size={16} /> New reminder
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="operational-filter-area">
        <div className="operational-filter-primary">
          <div className="operational-filters primary-filters">
            <label>
              Project
              <select
                aria-label="Calendar project filter"
                value={filters.projectId ?? ''}
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
              >
                <option value="">All projects</option>
                {w.projects
                  .filter(
                    (project) =>
                      !project.deletedAt ||
                      allEvents.some((event) => event.projectId === project.id),
                  )
                  .map((project) => (
                    <option value={project.id} key={project.id}>
                      {projectLabel(project.id)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {hasAnyFilters && (
            <button className="text-button" onClick={() => setFilters({ status: 'all' })}>
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
              Event type
              <select
                aria-label="Calendar event type"
                value={filters.type ?? 'all'}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value as EventType | 'all' })
                }
              >
                <option value="all">All types</option>
                {Object.entries(EVENT_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                aria-label="Calendar status filter"
                value={filters.status ?? 'all'}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value as CalendarFilters['status'] })
                }
              >
                {['all', 'open', 'completed', 'cancelled', 'overdue'].map((status) => (
                  <option key={status} value={status}>
                    {status[0].toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="operational-check">
              <input
                type="checkbox"
                checked={!!filters.includeDeleted}
                onChange={(e) => setFilters({ ...filters, includeDeleted: e.target.checked })}
              />{' '}
              Include reminder trash
            </label>
          </div>
          <p className="operational-footnote">
            Filters apply to the calendar and overdue list. Project deadlines and invoice due dates
            remain connected to their source records.
          </p>
        </details>
      </div>
      <section className="card calendar-card">
        <div className="calendar-toolbar">
          <div className="calendar-period">
            <button
              className="icon-button"
              aria-label="Previous calendar period"
              onClick={() =>
                setCursor(shiftPeriod(cursor, view === 'month' ? 'month' : 'week', -1))
              }
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next calendar period"
              onClick={() => setCursor(shiftPeriod(cursor, view === 'month' ? 'month' : 'week', 1))}
            >
              <ChevronRight size={18} />
            </button>
            <h2>{period}</h2>
            <button className="button secondary small" onClick={() => setCursor(today)}>
              Today
            </button>
          </div>
          <div className="calendar-tools">
            <div className="operational-segment" aria-label="Calendar view">
              {(['month', 'week', 'agenda'] as const).map((mode) => (
                <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>
                  {mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <button className="button secondary small" onClick={download}>
              <Download size={15} /> Export .ics
            </button>
          </div>
        </div>
        {view !== 'agenda' ? (
          <div className={`calendar-grid ${view}`}>
            <div className="calendar-weekdays">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-days">
              {days.map((day) => {
                const items = dayEvents.get(day)!;
                return (
                  <div
                    key={day}
                    className={`calendar-day ${day.slice(0, 7) !== cursor.slice(0, 7) && view === 'month' ? 'outside' : ''} ${day === today ? 'today' : ''}`}
                  >
                    <button
                      className="calendar-day-number"
                      aria-label={`Add reminder on ${day}`}
                      onClick={() => setEditing({ date: day })}
                    >
                      {Number(day.slice(-2))}
                    </button>
                    {items.slice(0, view === 'week' ? 8 : 3).map((event) => (
                      <button
                        key={event.id}
                        className={`calendar-chip ${event.overdue ? 'overdue' : ''} ${event.status} ${event.deletedAt ? 'trashed' : ''}`}
                        onClick={() => setSelected(event)}
                      >
                        <span className="calendar-chip-dot" />
                        {event.title}
                        {event.derived && <span className="derived-mark">↗</span>}
                      </button>
                    ))}
                    {items.length > (view === 'week' ? 8 : 3) && (
                      <button
                        className="calendar-more"
                        onClick={() => {
                          setView('agenda');
                          setCursor(day);
                        }}
                      >
                        View {items.length} events
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="calendar-agenda">
            {visible.length ? (
              visible.map((event) => (
                <button
                  className={`agenda-event ${event.overdue ? 'overdue' : ''}`}
                  key={event.id}
                  onClick={() => setSelected(event)}
                >
                  <div className="agenda-date">
                    <strong>{dateLabel(eventDate(event, timezone), { day: 'numeric' })}</strong>
                    <span>{dateLabel(eventDate(event, timezone), { month: 'short' })}</span>
                  </div>
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {projectLabel(event.projectId)} · {EVENT_LABELS[event.type]}
                      {event.derived ? ' · Source deadline' : ' · Manual reminder'}
                    </p>
                    <span>
                      {event.allDay
                        ? `All day${event.endsAt && event.endsAt !== event.startsAt ? ` · through ${dateLabel(event.endsAt)}` : ''}`
                        : new Intl.DateTimeFormat('en', {
                            timeZone: timezone,
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(recordedDateToDate(event.startsAt))}{' '}
                      · {event.deletedAt ? 'In trash' : event.overdue ? 'Overdue' : event.status}
                    </span>
                  </div>
                  <ArrowUpRight size={17} />
                </button>
              ))
            ) : (
              <Empty title="No events in this period">
                Choose another period, adjust filters, or{' '}
                <button className="text-button" onClick={() => setEditing({ date: cursor })}>
                  add a reminder
                </button>
                .
              </Empty>
            )}
          </div>
        )}
      </section>
      <div className="operational-two-columns">
        <section className="card">
          <h2>Overdue & unresolved</h2>
          <p className="section-description">
            An overdue date never marks a quote approved or an invoice paid.
          </p>
          {overdue.length ? (
            <>
              <p className="field-hint" role="status">
                Showing {Math.min(overdueLimit, overdue.length)} of {overdue.length} overdue
                {overdue.length === 1 ? ' record' : ' records'}.
              </p>
              {overdue.slice(0, overdueLimit).map((event) => (
                <button
                  className="operational-row"
                  key={event.id}
                  onClick={() => setSelected(event)}
                >
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {dateLabel(eventDate(event, timezone))} ·{' '}
                      {event.derived ? 'Source deadline' : 'Manual reminder'}
                    </span>
                  </div>
                  <span className="badge danger">Overdue</span>
                </button>
              ))}
              {overdueLimit < overdue.length && (
                <div className="button-row">
                  <button
                    className="text-button"
                    onClick={() => setOverdueLimit((limit) => limit + 8)}
                  >
                    Show more overdue records
                  </button>
                  <button className="text-button" onClick={() => setOverdueLimit(overdue.length)}>
                    Show all {overdue.length} overdue records
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="operational-empty">Nothing overdue in this filter.</p>
          )}
        </section>
        <section className="card">
          <h2>Unscheduled quotes & approved work</h2>
          <p className="section-description">Add a follow-up without changing commercial terms.</p>
          {missing.length ? (
            <>
              <p className="field-hint" role="status">
                Showing {Math.min(unscheduledLimit, missing.length)} of {missing.length}
                {missing.length === 1 ? ' unscheduled decision' : ' unscheduled decisions'}.
              </p>
              {missing.slice(0, unscheduledLimit).map((change) => (
                <div className="operational-row" key={change.id}>
                  <button
                    onClick={() =>
                      onNavigate({
                        view: 'workspace',
                        projectId: change.projectId,
                        changeId: change.id,
                      })
                    }
                  >
                    <strong>{change.title || 'Untitled change'}</strong>
                    <span>
                      {change.status} ·{' '}
                      {w.projects.find((project) => project.id === change.projectId)?.name}
                    </span>
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      setEditing({
                        event: {
                          id: '',
                          projectId: change.projectId,
                          changeId: change.id,
                          title: `${change.status === 'Quoted' ? 'Quote' : 'Approval'} follow-up: ${change.title}`,
                          startsAt: today,
                          allDay: true,
                          type: change.status === 'Quoted' ? 'quote-followup' : 'approval-followup',
                        },
                      })
                    }
                  >
                    Schedule
                  </button>
                </div>
              ))}
              {unscheduledLimit < missing.length && (
                <div className="button-row">
                  <button
                    className="text-button"
                    onClick={() => setUnscheduledLimit((limit) => limit + 8)}
                  >
                    Show more unscheduled decisions
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setUnscheduledLimit(missing.length)}
                  >
                    Show all {missing.length} unscheduled decisions
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="operational-empty">
              Every open quote or approval has a reminder, or there is no unscheduled work.
            </p>
          )}
        </section>
      </div>
      <p className="operational-footnote">
        The .ics file contains the filtered events in the visible period. Importing it does not
        connect calendars or establish synchronization. It includes reminder titles and notes;
        review them before sharing. Timed exports use whole-second precision. Re-export after
        changes.
      </p>
      {selected && (
        <Modal title="Calendar event" onClose={() => setSelected(null)}>
          <div className="calendar-details">
            <span className="badge">
              {selected.derived ? 'Source deadline' : 'Manual reminder'}
              {w.projects.find((project) => project.id === selected.projectId)?.sample
                ? ' · Sample project'
                : ''}
            </span>
            <h3>{selected.title}</h3>
            <p>
              {dateLabel(eventDate(selected, timezone), {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}{' '}
              ·{' '}
              {selected.allDay
                ? 'All day'
                : `${instantToLocalDateTime(selected.startsAt, selected.timezone).replace('T', ' ')} ${selected.timezone}`}
            </p>
            {selected.endsAt && (
              <p>
                {selected.allDay
                  ? `Through ${dateLabel(selected.endsAt, { year: 'numeric', month: 'long', day: 'numeric' })}, inclusive.`
                  : `Ends ${instantToLocalDateTime(selected.endsAt, selected.timezone).replace('T', ' ')} ${selected.timezone}.`}
              </p>
            )}
            <p>{selected.notes || EVENT_LABELS[selected.type]}</p>
            <p>
              Status:{' '}
              <strong>
                {selected.deletedAt
                  ? 'In reminder trash'
                  : selected.overdue
                    ? 'Overdue'
                    : selected.status}
              </strong>
            </p>
            {selected.source === 'invoice' && (
              <p>
                This date comes from a preserved issued invoice. Record payments or void the invoice
                in Documents; rescheduling a reminder never changes the invoice.
              </p>
            )}
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => {
                  source(selected);
                  setSelected(null);
                }}
              >
                Open {selected.documentId ? 'document' : 'project / change'}{' '}
                <ArrowUpRight size={15} />
              </button>
              {selected.source === 'invoice' && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditing({
                      event: {
                        id: '',
                        projectId: selected.projectId,
                        changeId: selected.changeId,
                        documentId: selected.documentId,
                        title: `Invoice follow-up: ${selected.title}`,
                        startsAt: selected.startsAt,
                        allDay: true,
                        type: 'invoice-due',
                      },
                    });
                    setSelected(null);
                  }}
                >
                  Add independent reminder
                </button>
              )}
              {selected.source === 'project' && (
                <button
                  className="button primary"
                  onClick={() => {
                    setDeadlineProject(selected.projectId);
                    setSelected(null);
                  }}
                >
                  Edit project deadline
                </button>
              )}
              {!selected.derived &&
                (!selected.deletedAt ? (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditing({ event: selected });
                        setSelected(null);
                      }}
                    >
                      Edit / reschedule
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(() => {
                          onChange((w) =>
                            updateEventStatus(
                              w,
                              selected.id,
                              selected.status === 'completed' ? 'open' : 'completed',
                            ),
                          );
                          setSelected(null);
                        })
                      }
                    >
                      {selected.status === 'completed' ? (
                        <RotateCcw size={15} />
                      ) : (
                        <Check size={15} />
                      )}{' '}
                      {selected.status === 'completed' ? 'Reopen' : 'Complete'}
                    </button>
                    {selected.status !== 'cancelled' && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          run(() => {
                            onChange((w) => updateEventStatus(w, selected.id, 'cancelled'));
                            setSelected(null);
                          })
                        }
                      >
                        <X size={15} /> Cancel reminder
                      </button>
                    )}
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(() => {
                          onChange((w) => deleteEvent(w, selected.id));
                          setSelected(null);
                        })
                      }
                    >
                      <Trash2 size={15} /> Move to trash
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    onClick={() =>
                      run(() => {
                        onChange((w) => recoverEvent(w, selected.id));
                        setSelected(null);
                      })
                    }
                  >
                    <RotateCcw size={15} /> Recover reminder
                  </button>
                ))}
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <EventEditor
          w={w}
          value={editing.event}
          date={editing.date ?? today}
          onClose={() => setEditing(null)}
          onSave={(input, id) =>
            run(() => {
              onChange((w) => saveManualEvent(w, input, id));
              setEditing(null);
            }, 'Reminder updated locally.')
          }
        />
      )}
      {deadlineProject && (
        <ProjectDeadlineEditor
          w={w}
          projectId={deadlineProject}
          onClose={() => setDeadlineProject(null)}
          onSave={(deadline) =>
            run(() => {
              onChange((w) => setProjectDeadline(w, deadlineProject, deadline));
              setDeadlineProject(null);
            })
          }
        />
      )}
    </div>
  );
}
function EventEditor({
  w,
  value,
  date,
  onClose,
  onSave,
}: {
  w: Workspace;
  value?: CalendarEvent;
  date: string;
  onClose: () => void;
  onSave: (input: Omit<CalendarEvent, 'id'>, id?: string) => void;
}) {
  const timezone = value?.timezone ?? activeTimezone(w),
    allDayInitial = value?.allDay ?? (value ? isDateOnly(value.startsAt) : true);
  const initialProject =
    value?.projectId ??
    (w.projects.some((project) => project.id === w.context.projectId && !project.deletedAt)
      ? w.context.projectId
      : (w.projects.find((project) => !project.deletedAt)?.id ?? ''));
  const [projectId, setProject] = useState(initialProject),
    [changeId, setChange] = useState(
      value?.changeId ??
        (w.changes.some(
          (change) => change.id === w.context.changeId && change.projectId === initialProject,
        )
          ? w.context.changeId
          : ''),
    ),
    [documentId, setDocument] = useState(value?.documentId ?? '');
  const [title, setTitle] = useState(value?.title ?? ''),
    [type, setType] = useState<EventType>(value?.type ?? 'task'),
    [notes, setNotes] = useState(value?.notes ?? ''),
    [allDay, setAllDay] = useState(allDayInitial),
    [zone, setZone] = useState(timezone);
  const [start, setStart] = useState(
      value
        ? allDayInitial
          ? value.startsAt
          : instantToLocalDateTime(value.startsAt, timezone)
        : date,
    ),
    [end, setEnd] = useState(
      value?.endsAt
        ? allDayInitial
          ? value.endsAt
          : instantToLocalDateTime(value.endsAt, timezone)
        : '',
    ),
    [disambiguation, setDisambiguation] = useState<'reject' | 'earlier' | 'later'>('reject'),
    [error, setError] = useState('');
  const entries = JSON.stringify({
    projectId,
    changeId,
    documentId,
    title,
    type,
    notes,
    allDay,
    zone,
    start,
    end,
    disambiguation,
  });
  const originalEntries = useRef(entries);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const originalZone = value?.timezone ?? activeTimezone(w);
      const startsAt = allDay
          ? start
          : editedLocalDateTimeToInstant(
              start,
              zone,
              disambiguation,
              value && !allDayInitial
                ? { instant: value.startsAt, timezone: originalZone }
                : undefined,
            ),
        endsAt = end
          ? allDay
            ? end
            : editedLocalDateTimeToInstant(
                end,
                zone,
                disambiguation,
                value?.endsAt && !allDayInitial
                  ? { instant: value.endsAt, timezone: originalZone }
                  : undefined,
              )
          : undefined;
      const input: Omit<CalendarEvent, 'id'> = {
        projectId,
        ...(changeId ? { changeId } : {}),
        ...(documentId ? { documentId } : {}),
        title,
        startsAt,
        ...(endsAt ? { endsAt } : {}),
        allDay,
        timezone: zone,
        type,
        status: value?.status ?? 'open',
        source: 'manual',
        notes,
      };
      validateEventDates(input);
      onSave(input, value?.id || undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Check the event fields.');
    }
  };
  return (
    <Modal
      title={value?.id ? 'Edit / reschedule reminder' : 'New calendar reminder'}
      onClose={onClose}
      dirty={entries !== originalEntries.current}
    >
      <form onSubmit={submit} className="operational-form">
        <label>
          Reminder title
          <input
            aria-label="Reminder title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={1000}
            required
          />
        </label>
        <div className="operational-two-columns">
          <label>
            Project
            <select
              aria-label="Reminder project"
              value={projectId}
              onChange={(e) => {
                setProject(e.target.value);
                setChange('');
                setDocument('');
              }}
            >
              {w.projects
                .filter((project) => !project.deletedAt)
                .map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Reminder type"
              value={type}
              onChange={(e) => setType(e.target.value as EventType)}
            >
              {Object.entries(EVENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Related change
            <select
              aria-label="Reminder change"
              value={changeId}
              onChange={(e) => {
                setChange(e.target.value);
                setDocument('');
              }}
            >
              <option value="">Project only</option>
              {w.changes
                .filter((change) => change.projectId === projectId && !change.deletedAt)
                .map((change) => (
                  <option key={change.id} value={change.id}>
                    {change.title || 'Untitled change'} · revision {change.revision}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Related document
            <select
              aria-label="Reminder document"
              value={documentId}
              onChange={(e) => setDocument(e.target.value)}
            >
              <option value="">No document</option>
              {w.documents
                .filter(
                  (document) =>
                    document.projectId === projectId &&
                    (!changeId || document.changeId === changeId),
                )
                .map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.snapshot?.reference ?? document.kind}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="operational-check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => {
              setAllDay(e.target.checked);
              setStart(e.target.checked ? start.slice(0, 10) : `${start.slice(0, 10)}T09:00`);
              setEnd('');
            }}
          />{' '}
          All-day calendar date
        </label>
        <div className="operational-two-columns">
          <label>
            {allDay ? 'First day' : 'Start in selected timezone'}
            <input
              aria-label="Reminder start"
              type={allDay ? 'date' : 'datetime-local'}
              step={allDay ? undefined : 'any'}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            {allDay ? 'Last day (inclusive, optional)' : 'End in selected timezone (optional)'}
            <input
              aria-label="Reminder end"
              type={allDay ? 'date' : 'datetime-local'}
              step={allDay ? undefined : 'any'}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label>
          Timezone
          <input
            aria-label="Reminder timezone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            list="calendar-timezones"
          />
          <datalist id="calendar-timezones">
            {['Asia/Dhaka', 'UTC', 'Europe/London', 'America/New_York', 'Australia/Sydney'].map(
              (zone) => (
                <option key={zone} value={zone} />
              ),
            )}
          </datalist>
        </label>
        {!allDay && (
          <label>
            Daylight-saving interpretation
            <select
              aria-label="Daylight saving interpretation"
              value={disambiguation}
              onChange={(e) => setDisambiguation(e.target.value as typeof disambiguation)}
            >
              <option value="reject">Reject skipped or repeated local times</option>
              <option value="earlier">Explicitly use earlier occurrence / shift</option>
              <option value="later">Explicitly use later occurrence / shift</option>
            </select>
            <span className="field-hint">
              Earlier/later may shift a skipped local time. The event details show the stored time
              in this timezone.
            </span>
          </label>
        )}
        <label>
          Reminder notes (included in .ics export)
          <textarea
            aria-label="Reminder notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={100_000}
          />
        </label>
        <p className="field-hint">
          Changing this reminder does not change approval, invoice dates, payments, or agreed terms.
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" data-close-dialog onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            <Clock size={15} /> Save reminder
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ProjectDeadlineEditor({
  w,
  projectId,
  onClose,
  onSave,
}: {
  w: Workspace;
  projectId: string;
  onClose: () => void;
  onSave: (date: string | null) => void;
}) {
  const project = w.projects.find((project) => project.id === projectId)!;
  const [date, setDate] = useState(project.deadline ?? '');
  const originalDate = useRef(date);
  const adjustedDate = projectDeliveryDate({ ...project, deadline: date || null });
  return (
    <Modal title="Edit project deadline" onClose={onClose} dirty={date !== originalDate.current}>
      <form
        className="operational-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(date || null);
        }}
      >
        <p>
          {project.name}. Edit the original deadline. Additional project days still extend its
          connected calendar event.
        </p>
        <label>
          Project deadline
          <input
            aria-label="Project deadline"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {adjustedDate && (
          <p className="field-hint">
            Adjusted delivery: {dateLabel(adjustedDate)} · {project.additionalDays ?? '0'}{' '}
            additional calendar days.
          </p>
        )}
        <p className="field-hint">
          An empty date removes the deadline. Issued invoices and approved change terms stay
          preserved.
        </p>
        <div className="modal-actions">
          <button type="button" className="button secondary" data-close-dialog onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Save project deadline</button>
        </div>
      </form>
    </Modal>
  );
}
