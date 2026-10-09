import { Temporal } from '@js-temporal/polyfill';
import { projectDeliveryDate } from '../domain/delivery';
import { paymentBalance, paymentBalances, type PaymentBalance } from '../domain/commercial';
import { id, now as timestamp } from '../domain/types';
import { updateProjectTiming } from '../domain/operations';
import type { CalendarEvent, DocumentRecord, EventType, Workspace } from '../domain/types';
import {
  activeTimezone,
  addDays,
  eventDate,
  isDateOnly,
  todayInZone,
  validateEventDates,
} from './dates';
export {
  activeTimezone,
  eventDate,
  todayInZone,
  periodDays,
  shiftPeriod,
  localDateTimeToInstant,
} from './dates';

export const EVENT_LABELS: Record<EventType, string> = {
  milestone: 'Project milestone',
  delivery: 'Delivery deadline',
  'client-content': 'Client content / assets',
  'quote-followup': 'Quote follow-up',
  'approval-followup': 'Approval follow-up',
  'invoice-due': 'Invoice due',
  task: 'Task / reminder',
};
export interface OperationalEvent extends CalendarEvent {
  allDay: boolean;
  timezone: string;
  type: EventType;
  status: 'open' | 'completed' | 'cancelled';
  source: 'manual' | 'invoice' | 'project';
  derived: boolean;
  overdue: boolean;
}
export interface InvoiceSummary {
  document: DocumentRecord;
  total: string | null;
  paid: string | null;
  balance: string | null;
  status: 'unavailable' | 'unpaid' | 'partial' | 'paid' | 'voided';
  overdue: boolean;
  known: boolean;
}
export function invoiceSummary(
  workspace: Workspace,
  document: DocumentRecord,
  current = new Date().toISOString(),
  recordedBalance?: PaymentBalance,
  today = todayInZone(activeTimezone(workspace), current),
): InvoiceSummary {
  const summary = recordedBalance ?? paymentBalance(workspace, document.id, current),
    status = document.voidedAt ? 'voided' : summary.status;
  const due = document.snapshot?.dueDate;
  return {
    document,
    total: summary.total,
    paid: summary.paid,
    balance: summary.outstanding,
    status,
    known: summary.total !== null && summary.paid !== null && summary.outstanding !== null,
    overdue: Boolean(
      status !== 'voided' && status !== 'paid' && due && isDateOnly(due) && due < today,
    ),
  };
}
export function calendarEvents(
  workspace: Workspace,
  current = new Date().toISOString(),
  balances = paymentBalances(workspace, current),
): OperationalEvent[] {
  const timezone = activeTimezone(workspace),
    today = todayInZone(timezone, current),
    currentInstant = Temporal.Instant.from(current),
    result: OperationalEvent[] = [];
  for (const event of workspace.calendarEvents) {
    // Source deadlines are regenerated from their immutable/authoritative source, never copied.
    if (event.source === 'invoice' || event.source === 'project') continue;
    const allDay = event.allDay ?? isDateOnly(event.startsAt),
      zone = event.timezone ?? timezone,
      status = event.status ?? 'open';
    result.push({
      ...event,
      allDay,
      timezone: zone,
      type: event.type ?? 'task',
      status,
      source: 'manual',
      derived: false,
      overdue:
        !event.deletedAt &&
        status === 'open' &&
        (allDay
          ? (event.endsAt ?? event.startsAt) < today
          : Temporal.Instant.compare(
              Temporal.Instant.from(event.endsAt ?? event.startsAt),
              currentInstant,
            ) < 0),
    });
  }
  for (const project of workspace.projects) {
    const deliveryDate = projectDeliveryDate(project);
    if (deliveryDate && !project.deletedAt) {
      const status = project.state === 'completed' ? 'completed' : 'open';
      result.push({
        id: `project-deadline:${project.id}`,
        projectId: project.id,
        title: `${project.name} · project deadline`,
        startsAt: deliveryDate,
        allDay: true,
        timezone,
        type: 'delivery',
        status,
        source: 'project',
        derived: true,
        overdue: status === 'open' && deliveryDate < today,
      });
    }
  }
  for (const document of workspace.documents)
    if (document.kind === 'invoice' && document.issuedAt && document.snapshot?.dueDate) {
      const summary = invoiceSummary(
          workspace,
          document,
          current,
          balances.get(document.id),
          today,
        ),
        due = document.snapshot.dueDate;
      if (!isDateOnly(due)) continue;
      result.push({
        id: `invoice-due:${document.id}`,
        projectId: document.projectId,
        changeId: document.changeId,
        documentId: document.id,
        title: `Invoice ${document.snapshot.reference} due`,
        startsAt: due,
        allDay: true,
        timezone,
        type: 'invoice-due',
        status:
          summary.status === 'voided'
            ? 'cancelled'
            : summary.status === 'paid'
              ? 'completed'
              : 'open',
        source: 'invoice',
        derived: true,
        overdue: summary.overdue,
      });
    }
  const dates = new Map(result.map((event) => [event.id, eventDate(event, timezone)]));
  const instants = new Map(
    result
      .filter((event) => !event.allDay)
      .map((event) => [event.id, Temporal.Instant.from(event.startsAt).epochNanoseconds]),
  );
  return result.sort(
    (a, b) =>
      dates.get(a.id)!.localeCompare(dates.get(b.id)!) ||
      Number(b.allDay) - Number(a.allDay) ||
      (!a.allDay && !b.allDay
        ? instants.get(a.id)! < instants.get(b.id)!
          ? -1
          : instants.get(a.id)! > instants.get(b.id)!
            ? 1
            : 0
        : 0) ||
      a.id.localeCompare(b.id),
  );
}
export interface CalendarFilters {
  projectId?: string;
  type?: EventType | 'all';
  status?: 'all' | 'open' | 'completed' | 'cancelled' | 'overdue';
  includeDeleted?: boolean;
}
export function filterCalendarEvents(events: OperationalEvent[], filters: CalendarFilters = {}) {
  return events.filter(
    (event) =>
      (filters.includeDeleted || !event.deletedAt) &&
      (!filters.projectId || event.projectId === filters.projectId) &&
      (!filters.type || filters.type === 'all' || event.type === filters.type) &&
      (!filters.status ||
        filters.status === 'all' ||
        (filters.status === 'overdue' ? event.overdue : event.status === filters.status)),
  );
}
export function unscheduledChanges(workspace: Workspace, events = calendarEvents(workspace)) {
  const live = new Set(
    workspace.projects
      .filter(
        (project) => !project.deletedAt && !project.archivedAt && project.state !== 'completed',
      )
      .map((project) => project.id),
  );
  const scheduled = new Set(
    events
      .filter((event) => !event.deletedAt && event.status === 'open' && event.changeId)
      .map((event) => event.changeId),
  );
  return workspace.changes.filter(
    (change) =>
      live.has(change.projectId) &&
      !change.deletedAt &&
      !change.archivedAt &&
      ['Quoted', 'Approved'].includes(change.status) &&
      change.route !== 'Defer' &&
      !scheduled.has(change.id),
  );
}
export type ManualEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
function activity(workspace: Workspace, event: CalendarEvent, message: string) {
  workspace.activity.push({
    id: id(),
    at: timestamp(),
    kind: 'calendar',
    message,
    projectId: event.projectId,
    ...(event.changeId ? { changeId: event.changeId } : {}),
    ...(event.documentId ? { documentId: event.documentId } : {}),
  });
  workspace.updatedAt = timestamp();
  return workspace;
}
export function saveManualEvent(
  workspace: Workspace,
  input: ManualEventInput,
  eventId?: string,
): Workspace {
  if (!input.title.trim()) throw new Error('Enter a reminder title.');
  if (input.title.length > 1000) throw new Error('Keep reminder titles under 1,000 characters.');
  if ((input.notes?.length ?? 0) > 100_000)
    throw new Error('Keep reminder notes under 100,000 characters.');
  const project = workspace.projects.find((project) => project.id === input.projectId);
  if (!project || project.deletedAt) throw new Error('Choose an available project.');
  if (
    input.changeId &&
    !workspace.changes.some(
      (change) => change.id === input.changeId && change.projectId === input.projectId,
    )
  )
    throw new Error('Choose a change in this project.');
  if (
    input.documentId &&
    !workspace.documents.some(
      (document) =>
        document.id === input.documentId &&
        document.projectId === input.projectId &&
        (!input.changeId || document.changeId === input.changeId),
    )
  )
    throw new Error('Choose a document in this project and change.');
  validateEventDates(input);
  const existing = eventId ? workspace.calendarEvents.find((event) => event.id === eventId) : null;
  if (eventId && (!existing || (existing.source && existing.source !== 'manual')))
    throw new Error('Source deadlines can only be changed in their project or invoice record.');
  const result = structuredClone(workspace),
    at = timestamp();
  const record: CalendarEvent = {
    ...input,
    id: existing?.id ?? id(),
    title: input.title.trim(),
    source: 'manual',
    allDay: input.allDay ?? isDateOnly(input.startsAt),
    timezone: input.timezone ?? activeTimezone(workspace),
    type: input.type ?? 'task',
    status: input.status ?? existing?.status ?? 'open',
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    deletedAt: existing?.deletedAt ?? null,
  };
  if (existing)
    result.calendarEvents[result.calendarEvents.findIndex((event) => event.id === existing.id)] =
      record;
  else result.calendarEvents.push(record);
  return activity(
    result,
    record,
    `${existing ? 'Rescheduled or edited' : 'Created'} reminder: ${record.title}`,
  );
}
function modifyManual(
  workspace: Workspace,
  eventId: string,
  patch: Partial<CalendarEvent>,
  message: string,
) {
  const result = structuredClone(workspace),
    record = result.calendarEvents.find((event) => event.id === eventId);
  if (!record || (record.source && record.source !== 'manual'))
    throw new Error(
      'This deadline is derived from its source. Open the project or document to update it.',
    );
  Object.assign(record, patch, { updatedAt: timestamp() });
  return activity(result, record, `${message}: ${record.title}`);
}
export function updateEventStatus(
  workspace: Workspace,
  eventId: string,
  status: 'open' | 'completed' | 'cancelled',
) {
  return modifyManual(
    workspace,
    eventId,
    { status },
    status === 'open'
      ? 'Reopened reminder'
      : `${status === 'completed' ? 'Completed' : 'Cancelled'} reminder`,
  );
}
export function deleteEvent(workspace: Workspace, eventId: string) {
  return modifyManual(workspace, eventId, { deletedAt: timestamp() }, 'Moved reminder to trash');
}
export function recoverEvent(workspace: Workspace, eventId: string) {
  return modifyManual(workspace, eventId, { deletedAt: null }, 'Recovered reminder');
}
export function setProjectDeadline(
  workspace: Workspace,
  projectId: string,
  deadline: string | null,
): Workspace {
  if (deadline !== null && !isDateOnly(deadline))
    throw new Error('Enter a real project deadline, or remove the date.');
  const result = updateProjectTiming(workspace, projectId, { deadline }),
    project = result.projects.find((project) => project.id === projectId);
  if (!project || project.deletedAt)
    throw new Error('Recover the project before changing its deadline.');
  project.updatedAt = timestamp();
  result.updatedAt = timestamp();
  result.activity.push({
    id: id(),
    at: timestamp(),
    kind: 'project-deadline',
    message: deadline ? `Project deadline changed to ${deadline}` : 'Project deadline removed',
    projectId,
  });
  return result;
}
function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}
export function foldIcsLine(value: string) {
  const encoder = new TextEncoder();
  let line = '',
    output = '',
    bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > 75) {
      output += `${line}\r\n`;
      line = ' ';
      bytes = 1;
    }
    line += character;
    bytes += size;
  }
  return output + line;
}
const utcIcs = (value: string, end = false) =>
  Temporal.Instant.from(value)
    .round({ smallestUnit: 'second', roundingMode: end ? 'ceil' : 'floor' })
    .toString({ smallestUnit: 'second' })
    .replace(/[-:]/g, '');
export function exportCalendarIcs(
  events: OperationalEvent[],
  options: { name?: string; now?: string } = {},
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScopeLedger//Local operational calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(options.name ?? 'ScopeLedger reminders')}`,
  ];
  for (const event of events.filter((event) => !event.deletedAt)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(event.id)}@scopeledger.local`,
      `DTSTAMP:${utcIcs(options.now ?? new Date().toISOString())}`,
      `SUMMARY:${escapeIcs(event.title)}`,
    );
    if (event.allDay)
      lines.push(
        `DTSTART;VALUE=DATE:${event.startsAt.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDays(event.endsAt ?? event.startsAt, 1).replace(/-/g, '')}`,
      );
    else {
      lines.push(`DTSTART:${utcIcs(event.startsAt)}`);
      if (event.endsAt) lines.push(`DTEND:${utcIcs(event.endsAt, true)}`);
    }
    lines.push(
      `DESCRIPTION:${escapeIcs(`${event.notes ?? ''}${event.notes ? '\n' : ''}Timezone: ${event.timezone}. Exported file; no automatic synchronization.`)}`,
      `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    );
    if (event.status === 'completed') lines.push('X-SCOPELEDGER-STATUS:COMPLETED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
