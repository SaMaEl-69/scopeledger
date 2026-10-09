import { Temporal } from '@js-temporal/polyfill';
import type { Project } from './types';
import { calendarDate } from './dates';
export function deliveryDays(value: string | undefined, maximum = 3650): number | null {
  if (value === undefined) return 0;
  if (!/^\d{1,5}$/.test(value)) return null;
  const number = Number(value);
  return number <= maximum ? number : null;
}
export function addDeliveryDays(date: string | null | undefined, days: number): string | null {
  if (!date || !calendarDate(date)) return null;
  try {
    const result = Temporal.PlainDate.from(date).add({ days }).toString();
    return calendarDate(result) ? result : null;
  } catch {
    return null;
  }
}
export function projectDeliveryDate(
  project: Pick<Project, 'deadline' | 'additionalDays'>,
): string | null {
  const days = deliveryDays(project.additionalDays, 36500);
  return days === null ? null : addDeliveryDays(project.deadline, days);
}
