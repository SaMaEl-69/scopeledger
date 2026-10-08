import { describe, expect, it, vi } from 'vitest';
import {
  archiveRecord,
  createChange,
  createProject,
  createWorkspace,
  deleteRecord,
  recordApproval,
  reconcileChange,
  recoverRecord,
  saveDecision,
  updateBaseline,
  updateChange,
} from '../src/domain/operations';
import { calculate } from '../src/domain/finance';
import type { Workspace } from '../src/domain/types';

const changeId = (workspace: Workspace) => workspace.changes[0].id;
const approve = (workspace: Workspace) =>
  recordApproval(
    workspace,
    changeId(workspace),
    'Client accepted the named scope and fee in email.',
    '2020-01-02',
  );

describe('workspace and commercial decision operations', () => {
  it('starts with a realistic sample and persistent identity/context', () => {
    const workspace = createWorkspace();
    expect(workspace.projects[0]).toMatchObject({
      id: 'sample-harbor',
      name: 'Harbor / Website',
      sample: true,
    });
    expect(workspace.clients[0].name).toBe('Harbor Studio');
    expect(workspace.agency.name).toBe('Aster Studio');
    expect(workspace.context.projectId).toBe('sample-harbor');
    expect(workspace.context.changeId).toBe(changeId(workspace));
    expect(calculate(workspace.projects[0].baseline, workspace.changes[0]).valid).toBe(true);
  });

  it('permits sample plus one custom project and distinct unlimited changes', () => {
    let workspace = createProject(createWorkspace(), {
      name: 'A real build',
      client: 'A real client',
      currency: 'GBP',
    });
    const custom = workspace.projects[1];
    expect(custom.currency).toBe('GBP');
    expect(custom.baseline.fee).toBe('');
    workspace = createChange(workspace, custom.id);
    expect(workspace.changes.filter((change) => change.projectId === custom.id)).toHaveLength(2);
    expect(new Set(workspace.changes.map((change) => change.id)).size).toBe(3);
    expect(() => createProject(workspace, { name: 'Third', client: 'Other' })).toThrow(
      /activation/,
    );
  });

  it('does not bypass the demo allowance through archive or trash', () => {
    let workspace = createProject(createWorkspace(), { name: 'Custom', client: 'Client' });
    workspace = archiveRecord(workspace, 'project', workspace.projects[1].id);
    expect(() => createProject(workspace, { name: 'Another', client: 'Other' })).toThrow(
      /archived or trashed/,
    );
    workspace = deleteRecord(workspace, 'project', workspace.projects[1].id);
    expect(() => createProject(workspace, { name: 'Another', client: 'Other' })).toThrow(
      /activation/,
    );
  });

  it('does not mutate the caller’s workspace', () => {
    const original = createWorkspace();
    const changed = updateChange(original, changeId(original), { fee: '1200' });
    expect(original.changes[0].fee).toBe('800');
    expect(changed.changes[0].fee).toBe('1200');
  });

  it.each(['Quoted', 'Approved'] as const)(
    'freezes a custom project’s first valid baseline when %s',
    (status) => {
      let workspace = createProject(createWorkspace(), { name: 'Custom', client: 'Client' });
      const projectId = workspace.context.projectId;
      const change = workspace.context.changeId;
      workspace = updateBaseline(workspace, projectId, {
        fee: '10000',
        actual: '1000',
        remaining: '4000',
        approvedScope: 'Approved five-page website',
      });
      workspace = updateChange(workspace, change, {
        title: 'Extra page',
        request: 'Add an approved page',
        deliverables: 'One extra page',
        hours: '2',
        fee: '200',
      });
      expect(workspace.projects[1].originalBaseline.fee).toBe('');
      workspace =
        status === 'Quoted'
          ? saveDecision(workspace, change, 'Quoted')
          : recordApproval(workspace, change, 'Accepted by email', '2020-01-02');
      expect(workspace.projects[1].originalBaseline).toMatchObject({
        fee: '10000',
        actual: '1000',
        remaining: '4000',
      });
      workspace = updateBaseline(workspace, projectId, { fee: '11000' });
      expect(workspace.projects[1].originalBaseline.fee).toBe('10000');
    },
  );

  it('saves incomplete drafts and rejections without inventing executable values', () => {
    const initial = createWorkspace();
    const workspace = updateChange(initial, changeId(initial), { hours: '' });
    const saved = saveDecision(workspace, changeId(workspace), 'Draft');
    expect(saved.changes[0].hours).toBe('');
    expect(saved.revisions).toHaveLength(1);
    expect(saveDecision(saved, changeId(saved), 'Rejected').changes[0].status).toBe('Rejected');
    expect(() => saveDecision(saved, changeId(saved), 'Quoted')).toThrow(/additional hours/);
  });

  it('requires project scope, title, request and deliverables for a quote', () => {
    const initial = createWorkspace();
    expect(() =>
      saveDecision(
        updateChange(initial, changeId(initial), { deliverables: '' }),
        changeId(initial),
        'Quoted',
      ),
    ).toThrow(/deliverables/);
    expect(() =>
      saveDecision(
        updateBaseline(initial, initial.projects[0].id, { approvedScope: '' }),
        changeId(initial),
        'Quoted',
      ),
    ).toThrow(/approved project scope/);
  });

  it('keeps one immutable terms snapshot for each revision', () => {
    let workspace = createWorkspace();
    workspace = saveDecision(workspace, changeId(workspace), 'Draft');
    workspace = saveDecision(workspace, changeId(workspace), 'Quoted');
    workspace = approve(workspace);
    expect(workspace.revisions).toHaveLength(1);
    expect(workspace.revisions[0].change.status).toBe('Draft');
    expect(workspace.changes[0].status).toBe('Approved');
    expect(workspace.approvals[0].revision).toBe(workspace.revisions[0].revision);
  });

  it('preserves prior terms and invalidates approval after commercial edits', () => {
    const original = approve(createWorkspace());
    const changed = updateChange(original, changeId(original), {
      fee: '1000',
      deliverables: 'Revised scope',
    });
    expect(changed.changes[0]).toMatchObject({ revision: 2, status: 'Draft', fee: '1000' });
    expect(changed.approvals[0].invalidatedAt).toBeTruthy();
    expect(changed.revisions[0].change.fee).toBe('800');
    expect(original.approvals[0].invalidatedAt).toBeNull();
    expect(() => reconcileChange(changed, changeId(changed), '0', '520')).toThrow(
      /current approval/,
    );
    const revisedDraft = updateChange(changed, changeId(changed), { fee: '1100' });
    expect(revisedDraft.changes[0].revision).toBe(2);
  });

  it('does not invalidate approval for an unchanged patch', () => {
    const workspace = approve(createWorkspace());
    expect(updateChange(workspace, changeId(workspace), { fee: '800' })).toBe(workspace);
    expect(updateBaseline(workspace, workspace.projects[0].id, { fee: '8000' })).toBe(workspace);
  });

  it('invalidates outstanding decisions when project baseline changes and preserves original baseline', () => {
    const original = approve(createWorkspace());
    const changed = updateBaseline(original, original.projects[0].id, { actual: '2100' });
    expect(changed.changes[0].status).toBe('Draft');
    expect(changed.changes[0].revision).toBe(2);
    expect(changed.approvals[0].invalidatedAt).toBeTruthy();
    expect(changed.revisions[0].baseline.actual).toBe('2000');
    expect(changed.projects[0].originalBaseline.actual).toBe('2000');
  });

  it.each(['Included', 'Defect', 'Ambiguous'] as const)(
    'requires contract confirmation for %s',
    (classification) => {
      const original = createWorkspace();
      const workspace = updateChange(original, changeId(original), { classification });
      expect(() => approve(workspace)).toThrow(/contract review/);
      const reviewed = updateChange(workspace, changeId(workspace), { contractConfirmed: true });
      expect(approve(reviewed).changes[0].status).toBe('Approved');
    },
  );

  it('requires actual scope removal for an exchange', () => {
    const original = createWorkspace();
    expect(() =>
      approve(updateChange(original, changeId(original), { route: 'Exchange' })),
    ).toThrow(/explicit scope removal/);
    const exchange = updateChange(original, changeId(original), {
      route: 'Exchange',
      removed: '600',
      removedScope: 'Remove an approved collection',
    });
    expect(approve(exchange).changes[0].status).toBe('Approved');
  });

  it('cannot approve a deferred request', () => {
    const original = createWorkspace();
    const deferred = updateChange(original, changeId(original), { route: 'Defer' });
    expect(() => approve(deferred)).toThrow(/deferred request/);
    expect(() => saveDecision(deferred, changeId(deferred), 'Quoted')).toThrow(/deferred request/);
  });

  it('requires approval evidence and a real nonfuture calendar date', () => {
    const workspace = createWorkspace();
    const id = changeId(workspace);
    expect(() => recordApproval(workspace, id, '', '2020-01-02')).toThrow(/evidence/);
    expect(() => recordApproval(workspace, id, 'Accepted', '')).toThrow(/valid approval date/);
    expect(() => recordApproval(workspace, id, 'Accepted', '2020-02-31')).toThrow(
      /real calendar date/,
    );
    expect(() => recordApproval(workspace, id, 'Accepted', '2999-01-01')).toThrow(/future/);
  });

  it('accepts and preserves today’s date at 00:30 in Dhaka while rejecting tomorrow', () => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Dhaka';
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-30T18:30:00.000Z'));
      expect(new Date().getDate()).toBe(1);
      const workspace = createWorkspace();
      const accepted = recordApproval(
        workspace,
        changeId(workspace),
        'Client accepted today',
        '2026-10-01',
      );
      expect(accepted.approvals[0].approvedAt).toBe('2026-10-01');
      expect(() =>
        recordApproval(workspace, changeId(workspace), 'Client acceptance', '2026-10-02'),
      ).toThrow(/future/);
    } finally {
      vi.useRealTimers();
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it('continues to validate timestamp approvals as exact instants', () => {
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-30T18:30:00.000Z'));
      const workspace = createWorkspace();
      const accepted = recordApproval(
        workspace,
        changeId(workspace),
        'Accepted at this instant',
        '2026-10-01T00:30:00+06:00',
      );
      expect(accepted.approvals[0].approvedAt).toBe('2026-09-30T18:30:00.000Z');
      expect(() =>
        recordApproval(
          workspace,
          changeId(workspace),
          'Future acceptance',
          '2026-10-01T00:31:00+06:00',
        ),
      ).toThrow(/future/);
      expect(() =>
        recordApproval(
          workspace,
          changeId(workspace),
          'Invalid calendar date',
          '2020-02-31T00:00:00Z',
        ),
      ).toThrow(/real calendar date/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves submillisecond approval instants and rejects a future fractional instant', () => {
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-30T18:30:00.000Z'));
      const workspace = createWorkspace();
      const accepted = recordApproval(
        workspace,
        changeId(workspace),
        'Accepted just before this instant',
        '2026-10-01T00:29:59.999999999+06:00',
      );
      expect(accepted.approvals[0].approvedAt).toBe('2026-09-30T18:29:59.999999999Z');
      expect(() =>
        recordApproval(
          workspace,
          changeId(workspace),
          'Future acceptance',
          '2026-10-01T00:30:00.000000001+06:00',
        ),
      ).toThrow('future');
      expect(workspace.approvals).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the configured agency timezone for today even when the host is in another zone', () => {
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T18:30:00Z'));
      const workspace = createWorkspace();
      workspace.agency.timezone = 'Asia/Tokyo';
      expect(
        recordApproval(workspace, changeId(workspace), 'Accepted today', '2026-10-02').approvals[0]
          .approvedAt,
      ).toBe('2026-10-02');
      expect(() =>
        recordApproval(workspace, changeId(workspace), 'Not yet accepted', '2026-10-03'),
      ).toThrow(/future/);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['1', '2020', '01/02/2020', 'January 2, 2020', '2020-01-02T12:30:00'])(
    'rejects ambiguous approval date input %s while preserving the draft',
    (value) => {
      const workspace = createWorkspace(),
        before = structuredClone(workspace);
      expect(() =>
        recordApproval(workspace, changeId(workspace), 'Acceptance evidence', value),
      ).toThrow(/valid approval date/);
      expect(workspace).toEqual(before);
    },
  );

  it.each([
    '2020-01-02T24:00:00Z',
    '2020-01-02T23:60:00Z',
    '2020-01-02T23:59:60Z',
    '2020-01-02T12:00:00+24:00',
    '2020-01-02T12:00:00+01:60',
  ])('rejects normalized or impossible approval timestamp %s', (value) => {
    const workspace = createWorkspace();
    expect(() =>
      recordApproval(workspace, changeId(workspace), 'Acceptance evidence', value),
    ).toThrow(/valid approval/);
    expect(workspace.approvals).toHaveLength(0);
  });

  it('refuses duplicate approval for the current revision', () => {
    expect(() => approve(approve(createWorkspace()))).toThrow(/already has a current approval/);
  });

  it('reopening or rejecting an approved decision invalidates approval', () => {
    const workspace = approve(createWorkspace());
    const reopened = saveDecision(workspace, changeId(workspace), 'Draft');
    expect(reopened.changes[0].revision).toBe(2);
    expect(reopened.approvals[0].invalidatedAt).toBeTruthy();
    const rejected = saveDecision(workspace, changeId(workspace), 'Rejected');
    expect(rejected.changes[0].status).toBe('Rejected');
    expect(rejected.approvals[0].invalidatedAt).toBeTruthy();
  });

  it('requires reconciliation before starting the next change', () => {
    const workspace = approve(createWorkspace());
    expect(() => createChange(workspace, workspace.projects[0].id)).toThrow(/baseline before/);
    const trashed = deleteRecord(workspace, 'change', changeId(workspace));
    expect(() => createChange(trashed, trashed.projects[0].id)).toThrow(/baseline before/);
    const reconciled = reconcileChange(workspace, changeId(workspace), '0', '520');
    expect(createChange(reconciled, reconciled.projects[0].id).changes).toHaveLength(2);
  });

  it('includes the reference change exactly once and preserves the original baseline', () => {
    const approved = approve(createWorkspace());
    const reconciled = reconcileChange(approved, changeId(approved), '0', '520');
    expect(reconciled.projects[0].baseline).toMatchObject({
      fee: '8800',
      actual: '2000',
      remaining: '3720',
    });
    expect(reconciled.projects[0].originalBaseline).toMatchObject({
      fee: '8000',
      actual: '2000',
      remaining: '3200',
    });
    expect(reconciled.reconciliations).toHaveLength(1);
    expect(reconciled.reconciliations[0]).toMatchObject({
      addedFee: '800',
      incurred: '0',
      remaining: '520',
      removedFuture: '0',
    });
    expect(reconciled.changes[0].includedAt).toBeTruthy();
    expect(() => reconcileChange(reconciled, changeId(reconciled), '0', '520')).toThrow(
      /already included/,
    );
    expect(() => updateChange(reconciled, changeId(reconciled), { fee: '900' })).toThrow(
      /already included/,
    );
  });

  it('separates already-incurred and future cost, removing only future scope', () => {
    const initial = createWorkspace();
    const exchange = updateChange(initial, changeId(initial), {
      removed: '600',
      removedScope: 'Remove approved collection',
      route: 'Exchange',
      fee: '0',
    });
    const reconciled = reconcileChange(approve(exchange), changeId(exchange), '200', '320');
    expect(reconciled.projects[0].baseline).toMatchObject({
      fee: '8000',
      actual: '2200',
      remaining: '2920',
    });
    expect(reconciled.reconciliations[0].removedFuture).toBe('600');
    expect(reconciled.projects[0].baseline.approvedScope).toContain(
      'Removed scope: Remove approved collection',
    );
  });

  it('reconciles explicit credits as revenue reductions', () => {
    const initial = createWorkspace();
    const credit = updateChange(initial, changeId(initial), {
      fee: '0',
      credit: '100',
      creditReason: 'Agreed scope credit',
    });
    const reconciled = reconcileChange(approve(credit), changeId(credit), '520', '0');
    expect(reconciled.projects[0].baseline.fee).toBe('7900');
    expect(reconciled.projects[0].baseline.actual).toBe('2520');
    expect(reconciled.projects[0].baseline.remaining).toBe('3200');
    expect(reconciled.reconciliations[0].addedFee).toBe('-100');
  });

  it('rejects unknown, negative, or mismatched reconciliation splits', () => {
    const approved = approve(createWorkspace());
    expect(() => reconcileChange(approved, changeId(approved), '', '520')).toThrow(/unknown/);
    expect(() => reconcileChange(approved, changeId(approved), '-1', '521')).toThrow(/negative/);
    expect(() => reconcileChange(approved, changeId(approved), '200', '300')).toThrow(
      /add up exactly/,
    );
    const draft = createWorkspace();
    expect(() => reconcileChange(draft, changeId(draft), '0', '520')).toThrow(/current approval/);
  });

  it('reconciles decimal costs without binary rounding', () => {
    const original = createWorkspace();
    const fractional = updateChange(original, changeId(original), { hours: '3.25', rate: '65.01' });
    const result = reconcileChange(approve(fractional), changeId(fractional), '100', '111.2825');
    expect(result.projects[0].baseline.remaining).toBe('3311.2825');
  });

  it('does not write a reconciled baseline outside the supported numeric range', () => {
    const original = createWorkspace();
    const workspace = updateBaseline(original, original.projects[0].id, { fee: '1e24' });
    const approved = approve(workspace);
    expect(() => reconcileChange(approved, changeId(approved), '0', '520')).toThrow(
      /Resulting approved project fee/,
    );
    expect(approved.projects[0].baseline.fee).toBe('1e24');
    expect(approved.reconciliations).toHaveLength(0);
  });

  it('invalidates a separately approved outstanding change when another is reconciled', () => {
    let workspace = createWorkspace();
    workspace = createChange(workspace, workspace.projects[0].id);
    const first = workspace.changes[0];
    const second = workspace.changes[1];
    workspace = updateChange(workspace, second.id, { ...first, title: 'Another request' });
    expect(workspace.changes[1].id).toBe(second.id);
    workspace = recordApproval(workspace, first.id, 'First accepted', '2020-01-02');
    workspace = recordApproval(workspace, second.id, 'Second accepted', '2020-01-02');
    const result = reconcileChange(workspace, first.id, '0', '520');
    expect(result.changes[1].status).toBe('Draft');
    expect(
      result.approvals.find((approval) => approval.changeId === second.id)?.invalidatedAt,
    ).toBeTruthy();
  });

  it('recovers archives and trash with related identities and history intact', () => {
    const approved = approve(createWorkspace());
    const originalId = changeId(approved);
    const trashed = deleteRecord(
      archiveRecord(approved, 'change', originalId),
      'change',
      originalId,
    );
    expect(() => updateChange(trashed, originalId, { fee: '1' })).toThrow(/Recover/);
    const recovered = recoverRecord(trashed, 'change', originalId);
    expect(recovered.changes[0]).toMatchObject({
      id: originalId,
      archivedAt: null,
      deletedAt: null,
      status: 'Approved',
    });
    expect(recovered.approvals).toEqual(approved.approvals);
    expect(recovered.revisions).toEqual(approved.revisions);
  });
});
