import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspace,
  archiveRecord,
  deleteRecord,
  recordApproval,
  reconcileChange,
  recoverRecord,
  saveDecision,
  updateBaseline,
  updateChange,
} from '../src/domain/operations';
import {
  buildBrief,
  buildInvoice,
  calendarDate,
  documentReadiness,
  duplicateProject,
  issueDocument,
  localDate,
  paymentBalance,
  paymentBalances,
  recordPayment,
  saveAssumption,
  saveCustomScenario,
  setAssumptionDeleted,
  setScenarioDeleted,
  voidDocument,
  voidPayment,
} from '../src/domain/commercial';
import { validateWorkspace } from '../src/storage/repository';
import { documentHtml, validateClientDocument } from '../shared/client-document.mjs';
import { SCENARIOS } from '../src/content/scenarios';
import type { Workspace } from '../src/domain/types';

const overrides = {
  reference: 'TEST-INV-001',
  issueDate: '2026-10-01',
  dueDate: '2026-10-20',
  taxRate: '7.25',
  paymentInstructions: 'Test fixture: bank transfer using the invoice reference.',
};
function ready(): Workspace {
  let w = createWorkspace();
  w.agency = {
    ...w.agency,
    legalName: 'Example Test Studio Ltd',
    address: 'Test issuer address',
    email: 'issuer@example.test',
    timezone: 'Asia/Dhaka',
  };
  w.clients[0] = {
    ...w.clients[0],
    email: 'client@example.test',
    address: 'Test client billing address',
    notes: 'CONFIDENTIAL-CLIENT-NOTE',
  };
  w = updateChange(w, w.changes[0].id, { contractConfirmed: true });
  return recordApproval(
    w,
    w.changes[0].id,
    'CONFIDENTIAL-APPROVAL-DETAIL; signed client acceptance on file.',
    '2020-01-02',
  );
}

describe('client-facing document source and preserved issuance', () => {
  it('requires actual legal details, billing address and approval before invoicing', () => {
    const w = createWorkspace();
    const missing = documentReadiness(w, w.changes[0].id, 'invoice', overrides).filter(
      (item) => !item.complete,
    );
    expect(missing.map((item) => item.key)).toEqual(
      expect.arrayContaining(['approval', 'agency.legal', 'client.address']),
    );
    expect(missing.every((item) => !!item.target.view)).toBe(true);
    expect(() => buildInvoice(w, w.changes[0].id, overrides)).toThrow(/approval|issuer/i);
    expect(w.agency.legalName).toBe('');
  });
  it('uses exact validated fee and manual decimal tax without exposing private source fields', () => {
    const w = ready(),
      doc = buildInvoice(w, w.changes[0].id, overrides);
    expect(doc).toMatchObject({
      kind: 'invoice',
      subtotal: '800.00',
      taxRate: '7.25',
      tax: '58.00',
      total: '858.00',
      status: 'Approved',
    });
    expect(doc.client.address).toBe('Test client billing address');
    expect(doc.approvalRecorded).toBe('Approval recorded for revision 1.');
    expect(Object.keys(doc)).not.toEqual(
      expect.arrayContaining([
        'hours',
        'rate',
        'outside',
        'removed',
        'target',
        'baseline',
        'notes',
      ]),
    );
    const output = JSON.stringify(doc) + documentHtml(doc);
    expect(output).not.toContain('CONFIDENTIAL-CLIENT-NOTE');
    expect(output).not.toContain('CONFIDENTIAL-APPROVAL-DETAIL');
    expect(output).not.toContain('Loaded hourly');
    expect(() => validateClientDocument({ ...doc, hours: '8' })).toThrow(/unapproved|Private/);
  });
  it('keeps current client lookup reusable while an issued snapshot stays immutable', () => {
    const w = ready(),
      issued = issueDocument(w, w.changes[0].id, 'invoice', overrides);
    const original = structuredClone(issued.documents[0].snapshot);
    const edited = structuredClone(issued);
    edited.agency.name = 'Changed current agency';
    edited.agency.address = 'Changed current issuer address';
    edited.clients[0].name = 'Changed current client';
    edited.clients[0].address = 'Changed billing address';
    edited.projects[0].name = 'Changed current project';
    expect(buildBrief(edited, edited.changes[0].id).client.name).toBe('Changed current client');
    expect(edited.documents[0].snapshot).toEqual(original);
    expect(documentHtml(edited.documents[0].snapshot!)).not.toContain('Changed current');
    expect(w.documents).toHaveLength(0);
    expect(issued.activity[0].kind).toBe('document-issued');
    expect(() => validateWorkspace(issued)).not.toThrow();
  });
  it('uses the pre-reconciliation decision baseline and does not change invoice amounts afterward', () => {
    const w = ready(),
      changeId = w.changes[0].id;
    const reconciled = reconcileChange(w, changeId, '0', '520');
    expect(reconciled.projects[0].baseline.fee).toBe('8800');
    expect(buildInvoice(reconciled, changeId, overrides).subtotal).toBe('800.00');
  });
  it('rejects stale approval, duplicate references and double invoicing for a revision', () => {
    const w = ready();
    const stale = updateChange(w, w.changes[0].id, { fee: '900' });
    expect(() => buildInvoice(stale, stale.changes[0].id, overrides)).toThrow(/approval/i);
    const issued = issueDocument(w, w.changes[0].id, 'invoice', overrides);
    expect(() => issueDocument(issued, w.changes[0].id, 'invoice', overrides)).toThrow(
      /unique|already/i,
    );
    expect(() =>
      issueDocument(issued, w.changes[0].id, 'invoice', { ...overrides, reference: 'OTHER-REF' }),
    ).toThrow(/already/);
    const voided = voidDocument(issued, issued.documents[0].id, 'Incorrect issue date');
    expect(() => issueDocument(voided, w.changes[0].id, 'invoice', overrides)).toThrow(/unique/);
    expect(
      issueDocument(voided, w.changes[0].id, 'invoice', { ...overrides, reference: 'REISSUE-001' })
        .documents,
    ).toHaveLength(2);
  });
  it('canonicalizes whitespace and case when reserving issued or voided document references', () => {
    const w = ready(),
      issued = issueDocument(w, w.changes[0].id, 'invoice', {
        ...overrides,
        reference: '  TEST-INV-001  ',
      });
    expect(issued.documents[0].snapshot?.reference).toBe('TEST-INV-001');
    const voided = voidDocument(issued, issued.documents[0].id, 'Reference corrected');
    expect(() =>
      issueDocument(voided, w.changes[0].id, 'invoice', {
        ...overrides,
        reference: ' test-inv-001 ',
      }),
    ).toThrow(/unique/);
  });
  it('permits explicitly preserved draft briefs without misrepresenting approval or deferral', () => {
    let w = createWorkspace();
    const changeId = w.changes[0].id;
    const issued = issueDocument(w, changeId, 'brief', { reference: 'DRAFT-BRIEF' });
    expect(issued.documents[0].snapshot).toMatchObject({
      kind: 'brief',
      status: 'Draft',
      demo: true,
      approvalRecorded: '',
    });
    expect(issued.documents[0].snapshot?.approvalText).toContain('Contract review is pending');
    w = updateChange(w, changeId, { route: 'Defer' });
    const deferred = buildBrief(w, changeId);
    expect(deferred.subtotal).toBe('');
    expect(deferred.approvalText).toContain('no delivery, date or fee commitment');
  });
  it('keeps malformed draft dates/tax editable and reports readiness rather than fabricating values', () => {
    const w = ready(),
      changeId = w.changes[0].id;
    const checklist = documentReadiness(w, changeId, 'invoice', {
      ...overrides,
      issueDate: '2026-02-30',
      dueDate: '2026-01-01',
      taxRate: '.',
    });
    expect(checklist.filter((item) => !item.complete).map((item) => item.key)).toEqual(
      expect.arrayContaining(['issueDate', 'dueDate', 'taxRate']),
    );
    expect(buildBrief(w, changeId, { issueDate: 'bad-date', taxRate: '.' })).toMatchObject({
      issueDate: '',
      taxRate: '',
    });
    expect(calendarDate('2024-02-29')).toBe(true);
    expect(calendarDate('2026-02-29')).toBe(false);
    expect(calendarDate('2026-13-01')).toBe(false);
    expect(localDate('Asia/Dhaka')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('represents an agreed negative fee as an explicit separate credit and refuses a positive invoice', () => {
    let w = ready(),
      changeId = w.changes[0].id;
    w = updateChange(w, changeId, {
      fee: '0',
      credit: '100',
      creditReason: 'Agreed reduction in client scope',
      contractConfirmed: true,
    });
    w = recordApproval(w, changeId, 'Credit adjustment approved in writing.', '2020-01-02');
    const brief = buildBrief(w, changeId);
    expect(brief.subtotal).toBe('-100.00');
    expect(documentHtml(brief)).toContain('Agreed credit');
    expect(documentHtml(brief)).not.toContain('Proposed credit');
    for (const decision of ['Draft', 'Quoted'] as const) {
      const proposed = buildBrief(saveDecision(w, changeId, decision), changeId);
      expect(proposed).toMatchObject({ status: decision, subtotal: '-100.00' });
      expect(documentHtml(proposed)).toContain('Proposed credit');
      expect(documentHtml(proposed)).not.toContain('Agreed credit');
    }
    expect(() => buildInvoice(w, changeId, overrides)).toThrow(/credit document/);
    const credit = buildInvoice(
      w,
      changeId,
      { ...overrides, reference: 'CR-001', taxRate: '0' },
      'credit',
    );
    expect(credit).toMatchObject({ kind: 'credit', subtotal: '100.00', total: '100.00' });
    expect(documentHtml(credit)).toContain('not a request for payment');
  });
  it('requires approved client fees to use whole currency cents before invoicing', () => {
    let w = ready();
    w = updateChange(w, w.changes[0].id, { fee: '800.005' });
    w = recordApproval(w, w.changes[0].id, 'Approved fee recorded.', '2020-01-02');
    expect(() => buildInvoice(w, w.changes[0].id, overrides)).toThrow(/whole currency cents/);
  });

  it.each([
    { fee: '800.005', credit: '0', creditReason: '' },
    { fee: '0', credit: '100.005', creditReason: 'Explicit scope credit' },
  ])('never silently rounds a fractional-cent client fee in a preserved brief', (terms) => {
    let w = createWorkspace();
    w = updateChange(w, w.changes[0].id, terms);
    const original = structuredClone(w),
      doc = buildBrief(w, w.changes[0].id);
    expect(doc.subtotal).toBe('');
    expect(doc.total).toBe('');
    expect(
      documentReadiness(w, w.changes[0].id, 'brief').find((item) => item.key === 'briefAmount')
        ?.complete,
    ).toBe(false);
    expect(() => issueDocument(w, w.changes[0].id, 'brief')).toThrow(/fractional-cent/);
    expect(w).toEqual(original);
  });

  it('shows timestamp approval on its real calendar day in the agency timezone', () => {
    let w = createWorkspace();
    w.agency.timezone = 'Asia/Dhaka';
    w = recordApproval(w, w.changes[0].id, 'Client acceptance', '2020-01-01T19:00:00Z');
    expect(buildBrief(w, w.changes[0].id).approvalDate).toBe('2020-01-02');
    expect(w.approvals[0].approvedAt).toBe('2020-01-01T19:00:00.000Z');
  });

  it('preserves an imported future approval but withholds authorization until its actual date', () => {
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T18:30:00Z'));
      const w = ready(),
        changeId = w.changes[0].id;
      w.approvals[0].approvedAt = '2027-01-02';
      const original = structuredClone(w);
      expect(() => validateWorkspace(w)).not.toThrow();
      expect(buildBrief(w, changeId)).toMatchObject({
        status: 'Approval requires review',
        approvalRecorded: '',
        approvalDate: '',
      });
      expect(
        documentReadiness(w, changeId, 'invoice', overrides).find((item) => item.key === 'approval')
          ?.complete,
      ).toBe(false);
      expect(() => buildInvoice(w, changeId, overrides)).toThrow(/approval/i);
      expect(() => reconcileChange(w, changeId, '0', '520')).toThrow(
        /device clock|approval requires review/,
      );
      expect(w).toEqual(original);
      const reopened = saveDecision(w, changeId, 'Draft'),
        reconfirmed = recordApproval(
          reopened,
          changeId,
          'Actual acceptance reconfirmed',
          '2026-10-02',
        );
      expect(reconfirmed.approvals[0].approvedAt).toBe('2027-01-02');
      expect(reconfirmed.approvals[0].invalidatedAt).toBeTruthy();
      expect(buildInvoice(reconfirmed, changeId, overrides).subtotal).toBe('800.00');
      vi.setSystemTime(new Date('2027-01-02T06:00:00Z'));
      expect(buildInvoice(w, changeId, overrides).approvalDate).toBe('2027-01-02');
    } finally {
      vi.useRealTimers();
    }
  });

  it('prices a reconciled exchange from its preserved before-baseline when current remaining cost is smaller', () => {
    let w = ready(),
      changeId = w.changes[0].id;
    w = updateBaseline(w, w.projects[0].id, { remaining: '1000' });
    w = updateChange(w, changeId, {
      route: 'Exchange',
      removed: '800',
      removedScope: 'Approved old collection',
      fee: '300',
      contractConfirmed: true,
    });
    w = recordApproval(w, changeId, 'Exchange accepted', '2020-01-02');
    w = reconcileChange(w, changeId, '520', '0');
    expect(w.projects[0].baseline.remaining).toBe('200');
    expect(buildInvoice(w, changeId, overrides).subtotal).toBe('300.00');
  });

  it.each(['project', 'change'] as const)(
    'requires recovery before new documents on an archived or trashed %s while preserving existing history',
    (kind) => {
      const w = ready(),
        changeId = w.changes[0].id;
      const issued = issueDocument(w, changeId, 'invoice', overrides),
        recordId = kind === 'project' ? w.projects[0].id : changeId;
      for (const locked of [
        archiveRecord(issued, kind, recordId),
        deleteRecord(issued, kind, recordId),
      ]) {
        expect(() =>
          issueDocument(locked, changeId, 'brief', { reference: 'LOCKED-BRIEF' }),
        ).toThrow(/Recover or unarchive/);
        expect(locked.documents).toEqual(issued.documents);
        const payment = recordPayment(locked, issued.documents[0].id, {
          id: 'retained-payment',
          amount: '50',
          date: '2020-01-02',
        });
        expect(paymentBalance(payment, issued.documents[0].id).paid).toBe('50.00');
        expect(
          issueDocument(recoverRecord(locked, kind, recordId), changeId, 'brief', {
            reference: 'RECOVERED-BRIEF',
          }).documents,
        ).toHaveLength(2);
      }
    },
  );
});

describe('manual invoice payments and retained activity', () => {
  const issued = () => {
    const w = ready();
    return issueDocument(w, w.changes[0].id, 'invoice', overrides);
  };
  it('calculates partial/paid balances from invoice total including tax, not project contract revenue', () => {
    let w = issued(),
      documentId = w.documents[0].id;
    const snapshot = structuredClone(w.documents[0].snapshot!),
      issuedHtml = documentHtml(snapshot);
    expect(issuedHtml).toContain('>Total<');
    expect(issuedHtml).not.toContain('Amount due');
    expect(paymentBalance(w, documentId)).toMatchObject({
      status: 'unpaid',
      total: '858.00',
      paid: '0.00',
      outstanding: '858.00',
    });
    w = recordPayment(w, documentId, {
      id: 'payment-one',
      amount: '300',
      date: '2020-01-02',
      reference: 'Test receipt 1',
    });
    expect(paymentBalance(w, documentId)).toMatchObject({
      status: 'partial',
      paid: '300.00',
      outstanding: '558.00',
    });
    w = recordPayment(w, documentId, { id: 'payment-two', amount: '558', date: '2020-01-03' });
    expect(paymentBalance(w, documentId)).toMatchObject({
      status: 'paid',
      paid: '858.00',
      outstanding: '0.00',
    });
    expect(w.projects[0].baseline.fee).toBe('8000');
    expect(w.documents[0].snapshot).toEqual(snapshot);
    expect(documentHtml(w.documents[0].snapshot!)).toBe(issuedHtml);
    expect(w.activity.filter((record) => record.kind === 'payment-recorded')).toHaveLength(2);
    expect(() => validateWorkspace(w)).not.toThrow();
  });
  it('uses stable payment identities to avoid duplicate entries and rejects changed reuse/overpayment', () => {
    let w = issued(),
      documentId = w.documents[0].id;
    const payment = {
      id: 'stable-payment',
      amount: '300',
      date: '2020-01-02',
      reference: 'RECEIPT-1',
      note: '',
    };
    w = recordPayment(w, documentId, payment);
    expect(recordPayment(w, documentId, payment)).toBe(w);
    expect(recordPayment(w, documentId, { ...payment, amount: '300.00' })).toBe(w);
    expect(() => recordPayment(w, documentId, { ...payment, amount: '301' })).toThrow(/identity/);
    expect(() =>
      recordPayment(w, documentId, { id: 'too-much', amount: '559', date: '2020-01-02' }),
    ).toThrow(/exceeds/);
    for (const amount of ['0', '-1', 'Infinity', '.', '0.001'])
      expect(() =>
        recordPayment(w, documentId, { id: 'invalid', amount, date: '2020-01-02' }),
      ).toThrow(/amount/);
    expect(() =>
      recordPayment(w, documentId, { id: 'bad-date', amount: '1', date: '2026-02-30' }),
    ).toThrow(/date/);
    expect(() =>
      recordPayment(w, documentId, { id: 'future', amount: '1', date: '2099-01-01' }),
    ).toThrow(/date/);
  });
  it('voids with a reason while preserving payments, snapshots and activity history', () => {
    let w = issued(),
      documentId = w.documents[0].id;
    w = recordPayment(w, documentId, { id: 'paid-record', amount: '300', date: '2020-01-02' });
    const originalSnapshot = structuredClone(w.documents[0].snapshot);
    expect(() => voidDocument(w, documentId, '')).toThrow(/reason/);
    const voided = voidDocument(
      w,
      documentId,
      'Client details corrected; payment needs manual review',
    );
    expect(voided.payments).toEqual(w.payments);
    expect(voided.documents[0].snapshot).toEqual(originalSnapshot);
    expect(paymentBalance(voided, documentId)).toMatchObject({ status: 'voided', paid: '300.00' });
    expect(() =>
      recordPayment(voided, documentId, { id: 'new-payment', amount: '10', date: '2020-01-02' }),
    ).toThrow(/active issued/);
    const reversed = voidPayment(w, 'paid-record', 'Receipt entered against wrong invoice');
    expect(reversed.payments).toHaveLength(1);
    expect(reversed.payments[0].voidedAt).not.toBeNull();
    expect(paymentBalance(reversed, documentId)).toMatchObject({
      status: 'unpaid',
      outstanding: '858.00',
    });
    expect(() => validateWorkspace(voided)).not.toThrow();
    expect(() => validateWorkspace(reversed)).not.toThrow();
  });
  it('preserves invalid legacy payment text as unknown and allows a deliberate correction record', () => {
    let w = issued(),
      documentId = w.documents[0].id;
    w.payments.push({
      id: 'legacy-incomplete',
      projectId: w.projects[0].id,
      documentId,
      amount: '.',
      receivedAt: '2020-01-02',
    });
    expect(paymentBalance(w, documentId)).toMatchObject({
      status: 'unavailable',
      total: '858.00',
      paid: null,
      outstanding: null,
    });
    expect(() =>
      recordPayment(w, documentId, { id: 'new-payment', amount: '10', date: '2020-01-02' }),
    ).toThrow(/historical payment/);
    w = voidPayment(
      w,
      'legacy-incomplete',
      'Incomplete amount from an old record; manual review required',
    );
    expect(paymentBalance(w, documentId)).toMatchObject({
      status: 'unpaid',
      paid: '0.00',
      outstanding: '858.00',
    });
    expect(w.payments[0].amount).toBe('.');
  });

  it('keeps a voided invoice cancelled even when old payment values are incomplete', () => {
    let w = issued(),
      documentId = w.documents[0].id;
    w.payments.push({
      id: 'legacy-unknown',
      projectId: w.projects[0].id,
      documentId,
      amount: '.',
      receivedAt: '2020-01-02',
    });
    w = voidDocument(w, documentId, 'Cancelled with legacy payment review pending');
    expect(paymentBalance(w, documentId)).toEqual({
      status: 'voided',
      total: '858.00',
      paid: null,
      outstanding: null,
    });
    expect(w.payments[0].amount).toBe('.');
  });

  it('preserves future receipt dates as review/unknown until the agency date or exact instant occurs', () => {
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T18:30:00Z'));
      const w = issued(),
        documentId = w.documents[0].id;
      w.agency.timezone = 'America/Los_Angeles';
      w.payments.push({
        id: 'future-receipt',
        projectId: w.projects[0].id,
        documentId,
        amount: '50',
        receivedAt: '2026-10-02',
      });
      const original = structuredClone(w);
      expect(() => validateWorkspace(w)).not.toThrow();
      expect(paymentBalance(w, documentId)).toMatchObject({
        status: 'unavailable',
        total: '858.00',
        paid: null,
        outstanding: null,
      });
      expect(paymentBalances(w).get(documentId)).toEqual(paymentBalance(w, documentId));
      expect(() =>
        recordPayment(w, documentId, { id: 'extra', amount: '1', date: '2026-10-01' }),
      ).toThrow(/device clock|future-dated/);
      expect(w).toEqual(original);
      const cancelled = voidDocument(w, documentId, 'Cancelled; receipt history requires review');
      expect(paymentBalance(cancelled, documentId).status).toBe('voided');
      vi.setSystemTime(new Date('2026-10-02T08:00:00Z'));
      expect(paymentBalance(w, documentId)).toMatchObject({
        status: 'partial',
        paid: '50.00',
        outstanding: '808.00',
      });
      expect(paymentBalance(w, documentId, '2026-10-01T18:30:00Z').paid).toBeNull();
      expect(paymentBalances(w, '2026-10-01T18:30:00Z').get(documentId)?.paid).toBeNull();
      const timed = structuredClone(w);
      timed.payments[0].receivedAt = '2026-10-02T08:01:00Z';
      expect(paymentBalance(timed, documentId).paid).toBeNull();
      vi.setSystemTime(new Date('2026-10-02T08:01:00Z'));
      expect(paymentBalance(timed, documentId).paid).toBe('50.00');
      timed.payments[0].receivedAt = '2026-10-01T24:00:00Z';
      expect(paymentBalance(timed, documentId).paid).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('indexes balances without mixing document payments, including voided and unavailable histories', () => {
    let w = issued();
    w = recordPayment(w, w.documents[0].id, {
      id: 'known-payment',
      amount: '25',
      date: '2020-01-02',
    });
    const second = structuredClone(w.documents[0]);
    second.id = 'second-invoice';
    second.snapshot!.reference = 'OTHER-INVOICE';
    w.documents.push(second);
    w.payments.push({
      id: 'second-unknown',
      projectId: w.projects[0].id,
      documentId: second.id,
      amount: '.',
      receivedAt: '2020-01-02',
    });
    const third = structuredClone(second);
    third.id = 'voided-invoice';
    third.voidedAt = '2020-01-02';
    third.voidReason = 'Retained cancelled history';
    w.documents.push(third);
    w.payments.push({ ...w.payments[1], id: 'third-unknown', documentId: third.id });
    const index = paymentBalances(w);
    for (const document of w.documents)
      expect(index.get(document.id)).toEqual(paymentBalance(w, document.id));
    expect(index.get(w.documents[0].id)?.paid).toBe('25.00');
    expect(index.get(second.id)?.paid).toBeNull();
    expect(index.get(third.id)?.status).toBe('voided');
  });
});

describe('agency playbook and deliberate project carry-over', () => {
  it('duplicates chosen baselines/drafts with reused client and safely remapped historical identities', () => {
    const w = ready();
    const copied = duplicateProject(w, w.projects[0].id, {
      name: 'Harbor copy',
      carryBaseline: true,
      carryChanges: true,
      carryHistory: true,
    });
    const project = copied.projects[1],
      change = copied.changes.find((record) => record.projectId === project.id)!;
    expect(project.clientId).toBe(w.projects[0].clientId);
    expect(project.sample).toBe(false);
    expect(project.baseline).toEqual(w.projects[0].baseline);
    expect(change).toMatchObject({ status: 'Draft', contractConfirmed: false, includedAt: null });
    expect(change.id).not.toBe(w.changes[0].id);
    expect(copied.approvals).toHaveLength(w.approvals.length);
    expect(copied.documents).toHaveLength(0);
    expect(copied.payments).toHaveLength(0);
    const history = copied.revisions.filter((record) => record.projectId === project.id);
    expect(history.length).toBeGreaterThan(0);
    expect(
      history.every(
        (record) =>
          record.changeId === change.id &&
          record.change.id === change.id &&
          record.change.status === 'Draft',
      ),
    ).toBe(true);
    expect(() => validateWorkspace(copied)).not.toThrow();
    expect(() =>
      duplicateProject(copied, project.id, {
        name: 'Third',
        carryBaseline: false,
        carryChanges: false,
      }),
    ).toThrow(/activation/);
  });
  it('does not carry costs, changes, approvals or deadlines without explicit choices', () => {
    const w = ready(),
      copied = duplicateProject(w, w.projects[0].id, {
        name: 'Empty carry-over',
        carryBaseline: false,
        carryChanges: false,
      });
    expect(copied.projects[1].baseline).toMatchObject({
      fee: '',
      actual: '',
      remaining: '',
      approvedScope: '',
    });
    expect(copied.projects[1].deadline).toBeNull();
    expect(copied.changes).toHaveLength(w.changes.length);
    expect(() =>
      duplicateProject(w, w.projects[0].id, {
        name: 'Invalid history',
        carryBaseline: false,
        carryChanges: false,
        carryHistory: true,
      }),
    ).toThrow(/Copy changes/);
  });
  it('edits reusable scenario/assumption identities and keeps trash recoverable', () => {
    let w = createWorkspace();
    w = saveCustomScenario(w, { ...SCENARIOS[0], id: '', title: 'Agency CMS wording' });
    const scenarioId = w.customScenarios[0].id;
    w = saveCustomScenario(
      w,
      { ...w.customScenarios[0], title: 'Edited agency CMS wording' },
      scenarioId,
    );
    expect(w.customScenarios).toHaveLength(1);
    expect(w.customScenarios[0].id).toBe(scenarioId);
    w = setScenarioDeleted(w, scenarioId, true);
    expect(w.customScenarios[0].deletedAt).not.toBeNull();
    w = setScenarioDeleted(w, scenarioId, false);
    expect(w.customScenarios[0].deletedAt).toBeNull();
    w = saveAssumption(
      w,
      'Content readiness',
      'Client supplies approved content before the agreed build dependency.',
    );
    const presetId = w.assumptionPresets[0].id;
    w = saveAssumption(w, 'Updated readiness', 'Confirm the actual content handoff.', presetId);
    expect(w.assumptionPresets).toHaveLength(1);
    w = setAssumptionDeleted(w, presetId, true);
    expect(w.assumptionPresets[0].deletedAt).not.toBeNull();
    w = setAssumptionDeleted(w, presetId, false);
    expect(w.assumptionPresets[0].deletedAt).toBeNull();
    expect(() => validateWorkspace(w)).not.toThrow();
  });
});
