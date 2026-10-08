import { describe, expect, it, vi } from 'vitest';
import { createWorkspace, reconcileChange, recordApproval } from '../src/domain/operations';
import {
  buildBrief,
  issueDocument,
  recordPayment,
  voidDocument,
  voidPayment,
} from '../src/domain/commercial';
import { buildDashboard } from '../src/operational/dashboard';
import {
  calendarEvents,
  filterCalendarEvents,
  invoiceSummary,
  saveManualEvent,
  updateEventStatus,
  deleteEvent,
  recoverEvent,
  setProjectDeadline,
  unscheduledChanges,
  exportCalendarIcs,
  foldIcsLine,
} from '../src/operational/calendar';
import {
  addDays,
  eventDate,
  isDateOnly,
  isPersistedDate,
  instantToLocalDateTime,
  editedLocalDateTimeToInstant,
  eventDateRange,
  eventOverlapsPeriod,
  localDateTimeToInstant,
  periodDays,
  shiftPeriod,
  todayInZone,
  validateEventDates,
} from '../src/operational/dates';
import type { OperationalEvent } from '../src/operational/calendar';
import type { Workspace } from '../src/domain/types';
import { parseBackup, serializeWorkspace } from '../src/storage/repository';
import { confirmDefaults } from '../src/domain/setup';

const current = '2026-10-01T18:30:00Z';
function realWorkspace(): Workspace {
  const w = createWorkspace();
  w.projects[0].sample = false;
  w.projects[0].name = 'Real Harbor';
  w.projects[0].updatedAt = '2026-10-01T08:00:00Z';
  w.agency.timezone = 'Asia/Dhaka';
  w.agency.legalName = 'Aster legal';
  w.agency.address = 'Test address';
  w.agency.email = 'issuer@example.test';
  w.agency.paymentInstructions = 'Manual test instructions';
  w.clients[0].address = 'Client billing address';
  w.changes[0].updatedAt = '2026-10-01T08:00:00Z';
  w.changes[0].contractConfirmed = true;
  return confirmDefaults(w);
}
function approve(w: Workspace): Workspace {
  const c = w.changes[0];
  c.status = 'Approved';
  w.approvals.push({
    id: 'approval-1',
    projectId: c.projectId,
    changeId: c.id,
    revision: c.revision,
    approvedAt: '2020-01-01',
    recordedAt: '2020-01-01T09:00:00Z',
    evidence: 'Client approved by email',
    invalidatedAt: null,
  });
  return w;
}
function invoiced(w = approve(realWorkspace())) {
  return issueDocument(w, w.changes[0].id, 'invoice', {
    reference: 'TEST-001',
    issueDate: '2020-01-01',
    dueDate: '2020-01-15',
    taxRate: '5',
  });
}

describe('explicit calendar dates, timezones and export', () => {
  it('uses the same browser timezone for legacy approvals, document dates and payments when no agency zone was saved', () => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-02T00:30:00Z'));
      const w = realWorkspace();
      delete w.agency.timezone;
      const c = w.changes[0];
      expect(buildDashboard(w).timezone).toBe('America/Los_Angeles');
      expect(buildDashboard(w).today).toBe('2026-10-01');
      expect(buildBrief(w, c.id).issueDate).toBe('2026-10-01');
      expect(() => recordApproval(w, c.id, 'Client acceptance', '2026-10-02')).toThrow('future');
      const approved = recordApproval(w, c.id, 'Client accepted today', '2026-10-01');
      expect(buildBrief(approved, c.id).approvalDate).toBe('2026-10-01');
      const issued = invoiced(approved);
      expect(() =>
        recordPayment(issued, issued.documents[0].id, {
          id: 'future-local-payment',
          amount: '10',
          date: '2026-10-02',
        }),
      ).toThrow('future');
      const paid = recordPayment(issued, issued.documents[0].id, {
        id: 'current-local-payment',
        amount: '10',
        date: '2026-10-01',
      });
      expect(buildDashboard(paid).portfolio[0]).toMatchObject({ paid: '10.00' });
    } finally {
      vi.useRealTimers();
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
  it('accepts only real date-only or explicit-offset persisted dates', () => {
    for (const value of [
      '2024-02-29',
      '2026-10-04T12:30:45.123456789Z',
      '2026-10-04T18:30:45+06:00',
    ])
      expect(isPersistedDate(value)).toBe(true);
    for (const value of [
      '2026-02-29',
      '2026-02-31T12:00:00Z',
      '2026-10-04T12:30',
      '10/04/2026',
      '2026-13-01',
      'yesterday',
    ])
      expect(isPersistedDate(value)).toBe(false);
  });
  it('keeps exact seconds and recorded DST-fold instants when an existing reminder is unchanged', () => {
    const instant = '2026-11-01T06:30:45.123456789Z',
      timezone = 'America/New_York';
    const local = instantToLocalDateTime(instant, timezone);
    expect(local).toBe('2026-11-01T01:30:45.123456789');
    expect(editedLocalDateTimeToInstant(local, timezone, 'reject', { instant, timezone })).toBe(
      instant,
    );
    expect(() =>
      editedLocalDateTimeToInstant('2026-11-01T01:31', timezone, 'reject', { instant, timezone }),
    ).toThrow('occurs twice');
    expect(localDateTimeToInstant('2026-10-04T12:30:45.123456789', 'UTC')).toBe(
      '2026-10-04T12:30:45.123456789Z',
    );
  });
  it('shows timed continuations in the display timezone and excludes an exact midnight end', () => {
    const event = {
      startsAt: '2026-10-01T17:00:00Z',
      endsAt: '2026-10-01T19:00:00Z',
      allDay: false,
      timezone: 'UTC',
    };
    expect(eventDateRange(event, 'Asia/Dhaka')).toEqual({
      first: '2026-10-01',
      last: '2026-10-02',
    });
    expect(eventOverlapsPeriod(event, 'Asia/Dhaka', '2026-10-02')).toBe(true);
    expect(eventOverlapsPeriod(event, 'UTC', '2026-10-02')).toBe(false);
    const midnight = { ...event, endsAt: '2026-10-01T18:00:00Z' };
    expect(eventDateRange(midnight, 'Asia/Dhaka')).toEqual({
      first: '2026-10-01',
      last: '2026-10-01',
    });
    expect(eventOverlapsPeriod(midnight, 'Asia/Dhaka', '2026-10-02')).toBe(false);
    expect(
      eventOverlapsPeriod(
        { startsAt: '2024-02-28', endsAt: '2024-03-01', allDay: true },
        'UTC',
        '2024-02-29',
      ),
    ).toBe(true);
  });
  it('validates leap dates, midnight and a real end date without date normalization', () => {
    expect(isDateOnly('2024-02-29')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2026-02-31')).toBe(false);
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(todayInZone('Asia/Dhaka', '2026-10-01T18:30:00Z')).toBe('2026-10-02');
    expect(() =>
      validateEventDates({ startsAt: '2026-10-01', endsAt: '2026-09-30', allDay: true }),
    ).toThrow('last day');
    expect(() =>
      validateEventDates({
        startsAt: '2026-10-01T10:00:00Z',
        endsAt: '2026-10-01T10:00:00Z',
        allDay: false,
        timezone: 'UTC',
      }),
    ).toThrow('after the start');
    expect(() =>
      validateEventDates({ startsAt: '2026-10-01T10:00', allDay: false, timezone: 'UTC' }),
    ).toThrow('explicit UTC offset');
    expect(() => validateEventDates({ startsAt: '2026-10-01T10:00:00Z', allDay: false })).toThrow(
      'explicit IANA',
    );
  });
  it('rejects DST gaps and repeated times unless an interpretation is explicitly chosen', () => {
    expect(() => localDateTimeToInstant('2026-03-08T02:30', 'America/New_York')).toThrow(
      'does not exist or occurs twice',
    );
    expect(() => localDateTimeToInstant('2026-11-01T01:30', 'America/New_York')).toThrow(
      'does not exist or occurs twice',
    );
    expect(localDateTimeToInstant('2026-11-01T01:30', 'America/New_York', 'earlier')).toBe(
      '2026-11-01T05:30:00Z',
    );
    expect(localDateTimeToInstant('2026-11-01T01:30', 'America/New_York', 'later')).toBe(
      '2026-11-01T06:30:00Z',
    );
    expect(localDateTimeToInstant('2026-10-02T00:00', 'Asia/Dhaka')).toBe('2026-10-01T18:00:00Z');
  });
  it('builds Monday-based month/week periods through month and year boundaries', () => {
    const month = periodDays('2026-02-28', 'month');
    expect(month).toHaveLength(42);
    expect(month[0]).toBe('2026-01-26');
    expect(month[41]).toBe('2026-03-08');
    expect(periodDays('2026-12-31', 'week')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(shiftPeriod('2026-01-31', 'month', 1)).toBe('2026-02-01');
    expect(shiftPeriod('2026-12-31', 'week', 1)).toBe('2027-01-07');
  });
  it('uses date-only inclusive deadlines and stable UIDs with exclusive .ics end dates', () => {
    const w = realWorkspace(),
      next = saveManualEvent(w, {
        projectId: w.projects[0].id,
        title: 'Content; copy, imagery\nReview',
        startsAt: '2026-10-03',
        endsAt: '2026-10-04',
        allDay: true,
        timezone: 'Asia/Dhaka',
        type: 'client-content',
      });
    const events = calendarEvents(next, current),
      ics = exportCalendarIcs(events, { now: current });
    expect(ics).toContain(`UID:${next.calendarEvents[0].id}@scopeledger.local`);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261003');
    expect(ics).toContain('DTEND;VALUE=DATE:20261005');
    expect(ics).toContain('Content\\; copy\\, imagery\\nReview');
    expect(ics).toContain('DTSTAMP:20261001T183000Z');
    expect(exportCalendarIcs(events, { now: current })).toBe(ics);
  });
  it('exports timed events as genuine UTC instants and folds UTF-8 without splitting characters', () => {
    const event: OperationalEvent = {
      id: 'timed-id',
      projectId: 'project',
      title: '界'.repeat(50),
      startsAt: '2026-11-01T05:30:00Z',
      endsAt: '2026-11-01T06:30:00Z',
      allDay: false,
      timezone: 'America/New_York',
      type: 'task',
      status: 'open',
      source: 'manual',
      derived: false,
      overdue: false,
    };
    const ics = exportCalendarIcs([event], { now: current });
    expect(ics).toContain('DTSTART:20261101T053000Z');
    expect(ics).toContain('DTEND:20261101T063000Z');
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75);
    expect(foldIcsLine('SUMMARY:' + event.title).replace(/\r\n /g, '')).toBe(
      'SUMMARY:' + event.title,
    );
    expect(eventDate(event, 'Asia/Dhaka')).toBe('2026-11-01');
  });
  it('exports a positive subsecond duration as a valid whole-second UTC interval', () => {
    const w = saveManualEvent(realWorkspace(), {
      projectId: 'sample-harbor',
      title: 'Precise reminder',
      startsAt: '2026-10-04T12:00:00.1Z',
      endsAt: '2026-10-04T12:00:00.2Z',
      allDay: false,
      timezone: 'UTC',
    });
    const ics = exportCalendarIcs(calendarEvents(w, current), { now: current });
    expect(ics).toContain('DTSTART:20261004T120000Z');
    expect(ics).toContain('DTEND:20261004T120001Z');
    expect(w.calendarEvents[0].endsAt).toBe('2026-10-04T12:00:00.2Z');
  });
});

describe('calendar source relationships and recoverable reminders', () => {
  it('sorts timed reminders by their actual instant despite different stored offsets', () => {
    let w = realWorkspace();
    for (const [title, startsAt] of [
      ['Earlier', '2026-10-01T18:00:00+06:00'],
      ['Later', '2026-10-01T13:00:00Z'],
    ] as const)
      w = saveManualEvent(w, {
        projectId: w.projects[0].id,
        title,
        startsAt,
        allDay: false,
        timezone: 'Asia/Dhaka',
      });
    w = saveManualEvent(w, {
      projectId: w.projects[0].id,
      title: 'All day',
      startsAt: '2026-10-01',
      allDay: true,
      timezone: 'Asia/Dhaka',
    });
    expect(calendarEvents(w, current).map((event) => event.title)).toEqual([
      'All day',
      'Earlier',
      'Later',
    ]);
  });
  it('uses the active agency date for all-day deadlines and keeps ongoing ranges unresolved without early overdue flags', () => {
    let w = realWorkspace();
    w = saveManualEvent(w, {
      projectId: w.projects[0].id,
      title: 'Date in the agency calendar',
      startsAt: '2026-10-01',
      allDay: true,
      timezone: 'America/Los_Angeles',
    });
    expect(calendarEvents(w, current)[0].overdue).toBe(true);
    w = saveManualEvent(w, {
      projectId: w.projects[0].id,
      title: 'Ongoing work',
      startsAt: '2026-10-01',
      endsAt: '2026-10-03',
      allDay: true,
      timezone: 'UTC',
    });
    w = saveManualEvent(w, {
      projectId: w.projects[0].id,
      title: 'Overnight work',
      startsAt: '2026-10-01T17:00:00Z',
      endsAt: '2026-10-01T19:00:00Z',
      allDay: false,
      timezone: 'UTC',
    });
    const events = calendarEvents(w, current);
    expect(events.find((event) => event.title === 'Ongoing work')!.overdue).toBe(false);
    expect(events.find((event) => event.title === 'Overnight work')!.overdue).toBe(false);
    expect(buildDashboard(w, {}, current).attention.events.map((event) => event.title)).toContain(
      'Overnight work',
    );
  });
  it('edits, reschedules, completes, cancels, trashes and recovers without changing commercial terms', () => {
    const w = realWorkspace(),
      c = w.changes[0],
      original = structuredClone(w.changes);
    let next = saveManualEvent(w, {
      projectId: c.projectId,
      changeId: c.id,
      title: 'Quote follow-up',
      startsAt: '2026-09-30',
      allDay: true,
      type: 'quote-followup',
      timezone: 'Asia/Dhaka',
    });
    const id = next.calendarEvents[0].id;
    expect(calendarEvents(next, current)[0].overdue).toBe(true);
    next = saveManualEvent(
      next,
      {
        projectId: c.projectId,
        changeId: c.id,
        title: 'Rescheduled',
        startsAt: '2026-10-05',
        allDay: true,
        type: 'quote-followup',
        timezone: 'Asia/Dhaka',
      },
      id,
    );
    expect(next.calendarEvents).toHaveLength(1);
    expect(next.calendarEvents[0].id).toBe(id);
    expect(calendarEvents(next, current)[0].overdue).toBe(false);
    next = updateEventStatus(next, id, 'completed');
    expect(calendarEvents(next, current)[0].status).toBe('completed');
    next = updateEventStatus(next, id, 'cancelled');
    next = deleteEvent(next, id);
    expect(filterCalendarEvents(calendarEvents(next, current))).toHaveLength(0);
    expect(
      filterCalendarEvents(calendarEvents(next, current), { includeDeleted: true }),
    ).toHaveLength(1);
    next = recoverEvent(next, id);
    next = updateEventStatus(next, id, 'open');
    expect(calendarEvents(next, current)[0].status).toBe('open');
    expect(next.changes).toEqual(original);
    expect(next.approvals).toEqual(w.approvals);
    expect(next.activity).toHaveLength(7);
  });
  it('rejects mismatched project/change/document relationships and source deadline mutation', () => {
    const w = realWorkspace(),
      input = { projectId: w.projects[0].id, title: 'Task', startsAt: '2026-10-05', allDay: true };
    expect(() => saveManualEvent(w, { ...input, projectId: 'missing' })).toThrow(
      'available project',
    );
    expect(() => saveManualEvent(w, { ...input, changeId: 'missing' })).toThrow(
      'change in this project',
    );
    expect(() => saveManualEvent(w, { ...input, documentId: 'missing' })).toThrow(
      'document in this project',
    );
    expect(() => saveManualEvent(w, input, 'invoice-due:missing')).toThrow('Source deadlines');
    expect(() => deleteEvent(w, 'project-deadline:missing')).toThrow('derived from its source');
  });
  it('updates the single derived project deadline from its source and completes only with project state', () => {
    let w = realWorkspace();
    w = setProjectDeadline(w, w.projects[0].id, '2026-09-30');
    const first = calendarEvents(w, current)[0];
    expect(first.overdue).toBe(true);
    w = setProjectDeadline(w, w.projects[0].id, '2026-10-10');
    const next = calendarEvents(w, current);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(first.id);
    expect(next[0].startsAt).toBe('2026-10-10');
    w.projects[0].state = 'completed';
    expect(calendarEvents(w, current)[0].status).toBe('completed');
    w = setProjectDeadline(w, w.projects[0].id, null);
    expect(calendarEvents(w, current)).toHaveLength(0);
  });
  it('keeps invoice due identities stable and responds to manual payment/void state', () => {
    let w = invoiced();
    const document = w.documents[0],
      first = calendarEvents(w, current).find((event) => event.documentId === document.id)!;
    expect(first.overdue).toBe(true);
    expect(first.status).toBe('open');
    w = recordPayment(w, document.id, { id: 'partial', amount: '240', date: '2020-01-10' });
    expect(invoiceSummary(w, document, current)).toMatchObject({
      status: 'partial',
      balance: '600.00',
      overdue: true,
    });
    w = recordPayment(w, document.id, { id: 'remaining', amount: '600', date: '2020-01-11' });
    const paid = calendarEvents(w, current).find((event) => event.documentId === document.id)!;
    expect(paid.id).toBe(first.id);
    expect(paid.status).toBe('completed');
    expect(paid.overdue).toBe(false);
    w = voidPayment(w, 'remaining', 'Record entered twice');
    expect(
      calendarEvents(w, current).find((event) => event.documentId === document.id)!.status,
    ).toBe('open');
    w = voidDocument(w, document.id, 'Agreed cancellation');
    expect(
      calendarEvents(w, current).find((event) => event.documentId === document.id)!.status,
    ).toBe('cancelled');
  });
  it('finds unscheduled work and filters reminders without treating completion as approval', () => {
    const w = realWorkspace(),
      c = w.changes[0];
    c.status = 'Quoted';
    expect(unscheduledChanges(w)).toHaveLength(1);
    let next = saveManualEvent(w, {
      projectId: c.projectId,
      changeId: c.id,
      title: 'Follow-up',
      startsAt: '2026-10-05',
      allDay: true,
      type: 'quote-followup',
      timezone: 'Asia/Dhaka',
    });
    expect(unscheduledChanges(next)).toHaveLength(0);
    expect(filterCalendarEvents(calendarEvents(next, current), { type: 'delivery' })).toHaveLength(
      0,
    );
    next = updateEventStatus(next, next.calendarEvents[0].id, 'completed');
    expect(unscheduledChanges(next)).toHaveLength(1);
    expect(next.changes[0].status).toBe('Quoted');
  });
});

describe('persisted dashboard contribution and cash semantics', () => {
  it('retains accurate multi-currency totals and a full backup under a crowded 300-project history', () => {
    const source = invoiced(),
      w = realWorkspace();
    w.projects = [];
    w.changes = [];
    w.approvals = [];
    w.documents = [];
    w.payments = [];
    w.calendarEvents = [];
    const currencies = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const;
    for (let p = 0; p < 300; p++) {
      const projectId = `crowded-project-${p}`,
        changeId = `crowded-change-${p}-0`,
        documentId = `crowded-invoice-${p}`,
        currency = currencies[p % currencies.length];
      w.projects.push({
        ...structuredClone(source.projects[0]),
        id: projectId,
        currency,
        name: `Real project ${p}`,
      });
      for (let c = 0; c < 5; c++)
        w.changes.push({
          ...structuredClone(source.changes[0]),
          id: `crowded-change-${p}-${c}`,
          projectId,
          status: c === 0 ? 'Approved' : c === 4 ? 'Draft' : 'Quoted',
          ...(c === 4 ? { title: '', hours: '.' } : {}),
        });
      w.approvals.push({
        ...structuredClone(source.approvals[0]),
        id: `crowded-approval-${p}`,
        projectId,
        changeId,
      });
      w.documents.push({
        ...structuredClone(source.documents[0]),
        id: documentId,
        projectId,
        changeId,
        snapshot: {
          ...structuredClone(source.documents[0].snapshot!),
          currency,
          changeReference: changeId,
          reference: `CROWDED-${p}`,
        },
      });
      for (let n = 0; n < 2; n++) {
        w.payments.push({
          id: `crowded-payment-${p}-${n}`,
          projectId,
          documentId,
          amount: '240',
          receivedAt: '2020-01-10',
        });
        w.calendarEvents.push({
          id: `crowded-event-${p}-${n}`,
          projectId,
          changeId,
          title: `Project ${p} follow-up ${n}`,
          startsAt: n ? '2026-10-04T12:00:00Z' : '2026-10-03',
          allDay: !n,
          timezone: 'Asia/Dhaka',
          status: 'open',
          source: 'manual',
          type: 'quote-followup',
        });
      }
    }
    w.context.projectId = w.projects[0].id;
    w.context.changeId = w.changes[0].id;
    const raw = serializeWorkspace(w),
      restored = parseBackup(raw);
    expect(restored).toEqual(w);
    const result = buildDashboard(restored, {}, current);
    expect(result.projects).toHaveLength(300);
    expect(result.changes).toHaveLength(1500);
    expect(result.attention.drafts).toHaveLength(300);
    expect(result.attention.quoted).toHaveLength(900);
    expect(result.invoices).toHaveLength(300);
    expect(calendarEvents(w, current)).toHaveLength(900);
    for (const group of result.portfolio)
      expect(group).toMatchObject({
        revenue: '528000.00',
        invoiceSubtotal: '48000.00',
        tax: '2400.00',
        paid: '28800.00',
        outstanding: '21600.00',
      });
    const measure = (operation: () => unknown) => {
      const values = Array.from({ length: 5 }, () => {
        const start = performance.now();
        operation();
        return performance.now() - start;
      }).sort((a, b) => a - b);
      return Number(values[2].toFixed(2));
    };
    console.info(
      'DATA_AUDIT_MEASUREMENT',
      JSON.stringify({
        projects: 300,
        changes: 1500,
        documents: 300,
        payments: 600,
        manualEvents: 600,
        backupBytes: new TextEncoder().encode(raw).byteLength,
        dashboardMedianMs: measure(() => buildDashboard(w, {}, current)),
        calendarMedianMs: measure(() => calendarEvents(w, current)),
        backupMedianMs: measure(() => serializeWorkspace(w)),
        parseMedianMs: measure(() => parseBackup(raw)),
      }),
    );
  });
  it('excludes sample data by default and includes it only deliberately', () => {
    const w = createWorkspace();
    expect(buildDashboard(w, {}, current).portfolio).toHaveLength(0);
    expect(buildDashboard(w, {}, current).projects).toHaveLength(0);
    expect(buildDashboard(w, { includeSample: true }, current).portfolio[0]).toMatchObject({
      revenue: '8000.00',
      margin: '35',
    });
  });
  it('weights aggregate contributions rather than averaging project percentages', () => {
    const w = realWorkspace(),
      second = structuredClone(w.projects[0]);
    second.id = 'second-project';
    second.name = 'Second';
    second.baseline = { ...second.baseline, fee: '2000', actual: '1600', remaining: '0' };
    w.projects.push(second);
    const result = buildDashboard(w, {}, current);
    expect(result.portfolio[0]).toMatchObject({
      revenue: '10000.00',
      actual: '3600.00',
      remaining: '3200.00',
      margin: '32',
    });
    expect(result.attention.belowTarget.map((item) => item.project.id)).toEqual(['second-project']);
  });
  it('counts approved work once before and after reconciliation without inventing an incurred/future allocation', () => {
    const w = approve(realWorkspace()),
      before = buildDashboard(w, {}, current).portfolio[0];
    expect(before).toMatchObject({
      revenue: '8800.00',
      actual: '2000.00',
      remaining: '3200.00',
      unallocatedCost: '520.00',
      margin: '35',
    });
    const reconciled = reconcileChange(w, w.changes[0].id, '0', '520'),
      after = buildDashboard(reconciled, {}, current);
    expect(after.portfolio[0]).toMatchObject({
      revenue: '8800.00',
      actual: '2000.00',
      remaining: '3720.00',
      unallocatedCost: '0.00',
      margin: '35',
    });
    expect(after.attention.approvedUnreconciled).toHaveLength(0);
  });
  it('keeps reconciled Exchange fees awaiting invoicing against the preserved before-baseline', () => {
    let w = approve(realWorkspace());
    w.changes[0].route = 'Exchange';
    w.changes[0].removed = '3000';
    w.changes[0].removedScope = 'Remove eligible future production';
    expect(buildDashboard(w, {}, current).attention.awaitingInvoice).toHaveLength(1);
    w = reconcileChange(w, w.changes[0].id, '0', '520');
    expect(w.projects[0].baseline.remaining).toBe('720');
    expect(buildDashboard(w, {}, current).attention.awaitingInvoice).toHaveLength(1);
    w = issueDocument(w, w.changes[0].id, 'invoice', {
      reference: 'EXCHANGE-1',
      issueDate: '2020-01-01',
      dueDate: '2020-01-15',
    });
    expect(buildDashboard(w, {}, current).attention.awaitingInvoice).toHaveLength(0);
  });
  it('excludes rejected, deferred, stale and unapproved changes from committed outcomes', () => {
    for (const status of ['Draft', 'Quoted', 'Rejected', 'Approved'] as const) {
      const w = realWorkspace();
      w.changes[0].status = status;
      expect(buildDashboard(w, {}, current).portfolio[0].revenue).toBe('8000.00');
    }
    const deferred = approve(realWorkspace());
    deferred.changes[0].route = 'Defer';
    expect(buildDashboard(deferred, {}, current).portfolio[0].revenue).toBe('8000.00');
    const stale = approve(realWorkspace());
    stale.approvals[0].invalidatedAt = current;
    expect(buildDashboard(stale, {}, current).portfolio[0].revenue).toBe('8000.00');
  });
  it('keeps conditional fees separate and never sums saved alternatives', () => {
    const w = realWorkspace(),
      c = w.changes[0];
    c.status = 'Quoted';
    const terms = { ...c };
    w.comparisons.push({
      id: 'alternative',
      projectId: c.projectId,
      changeId: c.id,
      name: 'Alternative',
      terms,
      createdAt: current,
      deletedAt: null,
    });
    const group = buildDashboard(w, {}, current).portfolio[0];
    expect(group.revenue).toBe('8000.00');
    expect(group.proposedFees).toBe('800.00');
    expect(buildDashboard(w, {}, current).attention.quoted).toHaveLength(1);
  });
  it('discloses incomplete estimates without converting them to zero', () => {
    const w = realWorkspace();
    w.projects[0].baseline.actual = '';
    w.changes[0].hours = '.';
    const result = buildDashboard(w, {}, current);
    expect(result.portfolio[0].revenue).toBeNull();
    expect(result.portfolio[0].margin).toBeNull();
    expect(result.portfolio[0].excludedProjectIds).toEqual([w.projects[0].id]);
    expect(result.attention.drafts).toHaveLength(1);
  });
  it('preserves future approval history while holding its pending contribution for clock/evidence review', () => {
    const w = approve(realWorkspace());
    w.approvals[0].approvedAt = '2099-01-01';
    const original = structuredClone(w),
      result = buildDashboard(w, {}, current);
    expect(result.portfolio[0].revenue).toBeNull();
    expect(result.portfolio[0].margin).toBeNull();
    expect(result.attention.approvalReview.map((change) => change.id)).toEqual([w.changes[0].id]);
    expect(result.attention.approvedUnreconciled).toHaveLength(0);
    expect(result.attention.awaitingInvoice).toHaveLength(0);
    expect(w).toEqual(original);
    expect(parseBackup(serializeWorkspace(w)).approvals[0].approvedAt).toBe('2099-01-01');
    w.approvals[0].approvedAt = '2020-01-01';
    expect(buildDashboard(w, {}, current).portfolio[0].revenue).toBe('8800.00');
  });
  it('keeps valid imported basic ISO history usable across approval, payment and backup calculations', () => {
    const w = approve(realWorkspace());
    w.approvals[0].approvedAt = '2020-01-01T090000Z';
    expect(buildBrief(w, w.changes[0].id)).toMatchObject({
      status: 'Approved',
      approvalDate: '2020-01-01',
    });
    const issued = invoiced(w);
    issued.payments.push({
      id: 'basic-iso-receipt',
      projectId: issued.projects[0].id,
      documentId: issued.documents[0].id,
      amount: '10',
      receivedAt: '2020-01-02T120000Z',
    });
    issued.context.lastBackupAt = '2026-10-01T083000Z';
    const restored = parseBackup(serializeWorkspace(issued));
    const result = buildDashboard(restored, {}, '2026-10-01T183000Z');
    expect(result.attention.approvalReview).toHaveLength(0);
    expect(result.portfolio[0]).toMatchObject({ paid: '10.00', outstanding: '830.00' });
    expect(result.backup).toEqual({ ageDays: 0, needed: false });
    expect(restored.approvals[0].approvedAt).toBe('2020-01-01T090000Z');
    expect(restored.payments[0].receivedAt).toBe('2020-01-02T120000Z');
  });
  it('does not treat a future nanosecond as occurred when the device clock has only reached its enclosing millisecond', () => {
    const approved = approve(realWorkspace());
    approved.approvals[0].approvedAt = '2026-10-01T18:30:00.000000001Z';
    const result = buildDashboard(approved, {}, current);
    expect(result.attention.approvalReview.map((change) => change.id)).toEqual([
      approved.changes[0].id,
    ]);
    expect(result.portfolio[0].revenue).toBeNull();
    const paid = invoiced();
    paid.payments.push({
      id: 'future-nanosecond-receipt',
      projectId: paid.projects[0].id,
      documentId: paid.documents[0].id,
      amount: '10',
      receivedAt: '2026-10-01T18:30:00.000000001Z',
    });
    expect(invoiceSummary(paid, paid.documents[0], current)).toMatchObject({
      status: 'unavailable',
      paid: null,
      balance: null,
    });
  });
  it('keeps future payment records but does not assume their cash or balance has occurred', () => {
    const w = invoiced(),
      document = w.documents[0];
    w.payments.push({
      id: 'future-receipt',
      projectId: document.projectId,
      documentId: document.id,
      amount: '240',
      receivedAt: '2099-01-01',
    });
    expect(buildDashboard(w, {}, current).portfolio[0]).toMatchObject({
      invoiceSubtotal: '800.00',
      tax: '40.00',
      paid: null,
      outstanding: null,
    });
    expect(parseBackup(serializeWorkspace(w)).payments[0].receivedAt).toBe('2099-01-01');
  });
  it('groups currencies and respects project/client/state/date filters with explicit record dates', () => {
    const w = realWorkspace(),
      second = structuredClone(w.projects[0]);
    second.id = 'eur-project';
    second.currency = 'EUR';
    second.state = 'on-hold';
    second.updatedAt = '2026-09-01T00:00:00Z';
    w.projects.push(second);
    expect(buildDashboard(w, {}, current).portfolio.map((group) => group.currency)).toEqual([
      'USD',
      'EUR',
    ]);
    expect(
      buildDashboard(w, { currency: 'EUR', status: 'on-hold' }, current).projects.map(
        (project) => project.id,
      ),
    ).toEqual(['eur-project']);
    expect(
      buildDashboard(w, { from: '2026-10-01', to: '2026-10-02' }, current).projects.map(
        (project) => project.id,
      ),
    ).toEqual([w.projects[0].id]);
    expect(buildDashboard(w, { clientId: 'missing' }, current).projects).toHaveLength(0);
  });
  it('orders recent decisions and documents by actual time across preserved timestamp offsets', () => {
    const w = invoiced();
    const original = w.changes[0];
    original.updatedAt = '2026-10-01T18:00:00+06:00';
    w.changes.push({
      ...structuredClone(original),
      id: 'later-decision',
      status: 'Quoted',
      updatedAt: '2026-10-01T13:00:00Z',
    });
    w.documents[0].issuedAt = '2026-10-01T18:00:00+06:00';
    const snapshot = structuredClone(w.documents[0].snapshot!);
    snapshot.changeReference = 'later-decision';
    w.documents.push({
      ...structuredClone(w.documents[0]),
      id: 'later-document',
      changeId: 'later-decision',
      issuedAt: '2026-10-01T13:00:00Z',
      snapshot,
    });
    const recent = buildDashboard(w, {}, current).recent;
    expect(recent.changes[0].id).toBe('later-decision');
    expect(recent.documents[0].id).toBe('later-document');
  });
  it('sorts accepted basic ISO and nanosecond timestamps without losing chronology', () => {
    const w = invoiced();
    const original = w.changes[0];
    original.updatedAt = '2026-10-01T120000.000000001Z';
    w.changes.push({
      ...structuredClone(original),
      id: 'later-nanosecond-decision',
      status: 'Quoted',
      updatedAt: '2026-10-01T120000.000000002Z',
    });
    w.documents[0].issuedAt = original.updatedAt;
    const snapshot = structuredClone(w.documents[0].snapshot!);
    snapshot.changeReference = 'later-nanosecond-decision';
    w.documents.push({
      ...structuredClone(w.documents[0]),
      id: 'later-nanosecond-document',
      changeId: snapshot.changeReference,
      issuedAt: '2026-10-01T120000.000000002Z',
      snapshot,
    });
    const restored = parseBackup(serializeWorkspace(w));
    const recent = buildDashboard(restored, {}, current).recent;
    expect(recent.changes[0].id).toBe('later-nanosecond-decision');
    expect(recent.documents[0].id).toBe('later-nanosecond-document');
  });
  it('keeps invoice subtotal/tax/manual cash/balance distinct and retains cash after void', () => {
    let w = invoiced();
    w = recordPayment(w, w.documents[0].id, { id: 'paid-240', amount: '240', date: '2020-01-10' });
    let result = buildDashboard(w, {}, current);
    expect(result.portfolio[0]).toMatchObject({
      revenue: '8800.00',
      invoiceSubtotal: '800.00',
      tax: '40.00',
      paid: '240.00',
      outstanding: '600.00',
    });
    expect(result.invoices[0]).toMatchObject({ status: 'partial', overdue: true });
    expect(result.attention.awaitingInvoice).toHaveLength(0);
    w = voidDocument(w, w.documents[0].id, 'Cancel invoice');
    result = buildDashboard(w, {}, current);
    expect(result.portfolio[0]).toMatchObject({
      invoiceSubtotal: '0.00',
      tax: '0.00',
      paid: '240.00',
      outstanding: '0.00',
    });
    expect(result.invoices[0].status).toBe('voided');
  });
  it('propagates unknown legacy payment balances and preserves historical obligations behind explicit filters', () => {
    const w = invoiced(),
      document = w.documents[0];
    w.payments.push({
      id: 'legacy-payment',
      projectId: document.projectId,
      documentId: document.id,
      amount: 'unknown legacy amount',
      receivedAt: '2020-01-10',
    });
    const summary = invoiceSummary(w, document, current);
    expect(summary.status).toBe('unavailable');
    expect(summary.balance).toBeNull();
    expect(buildDashboard(w, {}, current).portfolio[0]).toMatchObject({
      invoiceSubtotal: '800.00',
      tax: '40.00',
      paid: null,
      outstanding: null,
      unknownDocumentIds: [document.id],
      invoiceIds: [document.id],
    });
    w.projects[0].archivedAt = current;
    const hidden = buildDashboard(w, {}, current);
    expect(hidden.portfolio).toHaveLength(0);
    expect(hidden.hiddenHistoricalInvoices).toBe(1);
    expect(buildDashboard(w, { includeArchived: true }, current).documents).toHaveLength(1);
  });
  it('preserves issued currency filters after project settings change and archived history remains inspectable', () => {
    const w = invoiced();
    w.projects[0].currency = 'EUR';
    const usd = buildDashboard(w, { currency: 'USD' }, current);
    expect(usd.projects).toHaveLength(0);
    expect(usd.documents.map((document) => document.id)).toEqual([w.documents[0].id]);
    expect(usd.portfolio[0]).toMatchObject({
      currency: 'USD',
      invoiceSubtotal: '800.00',
      tax: '40.00',
      outstanding: '840.00',
    });
    expect(buildDashboard(w, { currency: 'EUR' }, current).portfolio[0]).toMatchObject({
      currency: 'EUR',
      invoiceSubtotal: '0.00',
    });
    w.projects[0].deletedAt = current;
    expect(buildDashboard(w, { currency: 'USD' }, current).hiddenHistoricalInvoices).toBe(1);
    expect(
      buildDashboard(w, { currency: 'USD', includeTrashed: true }, current).documents,
    ).toHaveLength(1);
    expect(
      calendarEvents(w, current).find((event) => event.documentId === w.documents[0].id),
    ).toMatchObject({ status: 'open', overdue: true });
  });
  it('cancels voided source deadlines even when their preserved payment history is unknown', () => {
    let w = invoiced();
    const document = w.documents[0];
    w.payments.push({
      id: 'legacy-invalid',
      projectId: document.projectId,
      documentId: document.id,
      amount: 'unknown',
      receivedAt: '2020-01-10',
    });
    w = voidDocument(w, document.id, 'Cancel obligation');
    expect(invoiceSummary(w, w.documents[0], current)).toMatchObject({
      status: 'voided',
      paid: null,
      balance: null,
      overdue: false,
    });
    expect(
      calendarEvents(w, current).find((event) => event.documentId === document.id),
    ).toMatchObject({ status: 'cancelled', overdue: false });
    expect(buildDashboard(w, {}, current).portfolio[0]).toMatchObject({
      invoiceSubtotal: '0.00',
      tax: '0.00',
      paid: null,
      outstanding: '0.00',
    });
  });
  it('surfaces backup reminders and overdue manual dates using the workspace timezone', () => {
    let w = realWorkspace();
    w = saveManualEvent(w, {
      projectId: w.projects[0].id,
      title: 'Content due',
      startsAt: '2026-10-01',
      allDay: true,
      timezone: 'Asia/Dhaka',
      type: 'client-content',
    });
    const result = buildDashboard(w, {}, current);
    expect(result.today).toBe('2026-10-02');
    expect(result.attention.overdueEvents).toHaveLength(1);
    expect(result.backup.needed).toBe(true);
    w.context.lastBackupAt = '2026-10-01T00:00:00Z';
    expect(buildDashboard(w, {}, current).backup.needed).toBe(false);
  });
});
