import { Temporal } from '@js-temporal/polyfill';

// Cache parsed history only. Whether an instant has occurred is checked against each new clock.
const recordedInstants = new Map<string, Temporal.Instant>();

/** Calendar dates remain dates; timestamp callers supply an explicit display timezone. */
export function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function localDate(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka',
  instant = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  return ['year', 'month', 'day']
    .map((key) => parts.find((part) => part.type === key)?.value)
    .join('-');
}

/** Imported history stays intact; eligibility can change when the clock advances. */
export function recordedTimestampIsValid(value: string): boolean {
  if (value.length > 100 || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return false;
  try {
    recordedInstant(value);
    return true;
  } catch {
    return false;
  }
}

/** Display accepted ISO instants without depending on Date.parse's narrower grammar. */
export function recordedDateToDate(value: string): Date {
  return new Date(recordedInstant(value).epochMilliseconds);
}

/** New approval records use UTC while preserving any accepted submillisecond precision. */
export function recordedTimestampToIso(value: string): string {
  const instant = recordedInstant(value);
  return instant.epochNanoseconds % 1_000_000n === 0n
    ? new Date(instant.epochMilliseconds).toISOString()
    : instant.toString();
}

function recordedInstant(value: string) {
  const cached = recordedInstants.get(value);
  if (cached) return cached;
  const parsed = Temporal.Instant.from(calendarDate(value) ? `${value}T00:00:00Z` : value);
  if (recordedInstants.size >= 256) recordedInstants.delete(recordedInstants.keys().next().value!);
  recordedInstants.set(value, parsed);
  return parsed;
}

/** Keep preserved offsets and submillisecond history in chronological order. */
export function compareRecordedDates(first: string, second: string): number {
  return Temporal.Instant.compare(recordedInstant(first), recordedInstant(second));
}

export function recordedDateHasOccurred(
  value: string,
  today: string,
  currentTime = Date.now(),
): boolean {
  if (calendarDate(value)) return value <= today;
  if (!recordedTimestampIsValid(value)) return false;
  try {
    return (
      Temporal.Instant.compare(
        recordedInstant(value),
        Temporal.Instant.fromEpochMilliseconds(currentTime),
      ) <= 0
    );
  } catch {
    return false;
  }
}
