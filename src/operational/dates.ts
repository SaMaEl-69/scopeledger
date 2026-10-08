import { Temporal } from '@js-temporal/polyfill';
import type { CalendarEvent, Workspace } from '../domain/types';

// History records repeat dates and zones. Bound these pure validation caches so large
// autosaves do not recreate thousands of Intl formatters or Temporal values.
const dateChecks = new Map<string, boolean>();
const instantChecks = new Map<string, boolean>();
const zoneChecks = new Map<string, boolean>();
function remember(cache: Map<string, boolean>, value: string, valid: boolean) {
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(value, valid);
  return valid;
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const cached = dateChecks.get(value);
  if (cached !== undefined) return cached;
  try {
    return remember(
      dateChecks,
      value,
      Temporal.PlainDate.from(value, { overflow: 'reject' }).toString() === value,
    );
  } catch {
    return remember(dateChecks, value, false);
  }
}
/** Persisted dates never depend on the reader's local clock or Date.parse normalization. */
export function isPersistedDate(value: unknown): value is string {
  if (isDateOnly(value)) return true;
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return false;
  const cached = instantChecks.get(value);
  if (cached !== undefined) return cached;
  try {
    Temporal.Instant.from(value);
    return remember(instantChecks, value, true);
  } catch {
    return remember(instantChecks, value, false);
  }
}
export function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100 || !value.trim()) return false;
  const cached = zoneChecks.get(value);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return remember(zoneChecks, value, !/^[+-]/.test(value));
  } catch {
    return remember(zoneChecks, value, false);
  }
}
export function activeTimezone(workspace: Pick<Workspace, 'agency'>): string {
  if (validTimezone(workspace.agency.timezone)) return workspace.agency.timezone;
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return validTimezone(browser) ? browser : 'Asia/Dhaka';
}
export function todayInZone(timezone: string, now = new Date().toISOString()): string {
  return Temporal.Instant.from(now).toZonedDateTimeISO(timezone).toPlainDate().toString();
}
export function addDays(value: string, days: number) {
  return Temporal.PlainDate.from(value).add({ days }).toString();
}
export function localDateTimeToInstant(
  local: string,
  timezone: string,
  disambiguation: 'reject' | 'earlier' | 'later' = 'reject',
): string {
  if (!validTimezone(timezone))
    throw new Error('Choose a valid IANA timezone, such as Asia/Dhaka.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(local))
    throw new Error('Enter a complete local date and time.');
  try {
    return Temporal.PlainDateTime.from(local, { overflow: 'reject' })
      .toZonedDateTime(timezone, { disambiguation })
      .toInstant()
      .toString();
  } catch {
    throw new Error(
      'This local time does not exist or occurs twice because of daylight saving. Choose a different time, or explicitly choose the earlier or later occurrence.',
    );
  }
}
export function instantToLocalDateTime(instant: string, timezone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString();
}
/** Reopening an unchanged reminder preserves its recorded instant, including a DST fold. */
export function editedLocalDateTimeToInstant(
  local: string,
  timezone: string,
  disambiguation: 'reject' | 'earlier' | 'later',
  original?: { instant: string; timezone: string },
) {
  if (
    original &&
    timezone === original.timezone &&
    local === instantToLocalDateTime(original.instant, timezone)
  )
    return original.instant;
  return localDateTimeToInstant(local, timezone, disambiguation);
}
export function eventDate(
  event: Pick<CalendarEvent, 'startsAt' | 'allDay' | 'timezone'>,
  timezone: string,
): string {
  if (event.allDay ?? isDateOnly(event.startsAt)) return event.startsAt;
  return todayInZone(timezone, event.startsAt);
}
/** Timed intervals have an exclusive end; an end at midnight does not occupy the next day. */
export function eventDateRange(
  event: Pick<CalendarEvent, 'startsAt' | 'endsAt' | 'allDay' | 'timezone'>,
  timezone: string,
) {
  const first = eventDate(event, timezone);
  const last = !event.endsAt
    ? first
    : (event.allDay ?? isDateOnly(event.startsAt))
      ? event.endsAt
      : todayInZone(
          timezone,
          Temporal.Instant.from(event.endsAt).subtract({ nanoseconds: 1 }).toString(),
        );
  return { first, last };
}
export function eventOverlapsPeriod(
  event: Pick<CalendarEvent, 'startsAt' | 'endsAt' | 'allDay' | 'timezone'>,
  timezone: string,
  first: string,
  last = first,
) {
  const range = eventDateRange(event, timezone);
  return range.first <= last && range.last >= first;
}
export function validateEventDates(event: Record<string, unknown> | CalendarEvent): void {
  if (typeof event.startsAt !== 'string') throw new Error('Enter an event start.');
  if (event.timezone !== undefined && !validTimezone(event.timezone))
    throw new Error('Choose a valid IANA timezone, such as Asia/Dhaka.');
  const allDay = event.allDay ?? isDateOnly(event.startsAt);
  if (allDay) {
    if (!isDateOnly(event.startsAt))
      throw new Error('All-day deadlines must be a real YYYY-MM-DD calendar date.');
    if (event.endsAt !== undefined && (!isDateOnly(event.endsAt) || event.endsAt < event.startsAt))
      throw new Error('The last day must be on or after the first day.');
    return;
  }
  if (event.allDay === false && !validTimezone(event.timezone))
    throw new Error('Timed reminders require an explicit IANA timezone.');
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.startsAt))
    throw new Error('Timed events must include an explicit UTC offset.');
  try {
    const start = Temporal.Instant.from(event.startsAt);
    if (
      event.endsAt !== undefined &&
      (typeof event.endsAt !== 'string' ||
        Temporal.Instant.compare(Temporal.Instant.from(event.endsAt), start) <= 0)
    )
      throw new Error('The end must be after the start.');
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === 'The end must be after the start.'
        ? error.message
        : 'Enter a real start and end instant with an explicit UTC offset.',
    );
  }
}
export function periodDays(cursor: string, view: 'month' | 'week'): string[] {
  const date = Temporal.PlainDate.from(cursor),
    first = view === 'month' ? date.with({ day: 1 }) : date;
  const start = first.subtract({ days: first.dayOfWeek - 1 });
  return Array.from({ length: view === 'month' ? 42 : 7 }, (_, index) =>
    start.add({ days: index }).toString(),
  );
}
export function shiftPeriod(cursor: string, view: 'month' | 'week', amount: number) {
  const date = Temporal.PlainDate.from(cursor);
  return view === 'month'
    ? date.with({ day: 1 }).add({ months: amount }).toString()
    : date.add({ days: amount * 7 }).toString();
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
