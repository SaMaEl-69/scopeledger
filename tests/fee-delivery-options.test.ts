import { describe, expect, it } from 'vitest';
import {
  createWorkspace,
  updateChange,
  recordApproval,
  reconcileChange,
  updateProjectTiming,
} from '../src/domain/operations';
import {
  buildBrief,
  buildInvoice,
  issueDocument,
  documentReadiness,
} from '../src/domain/commercial';
import { calculate, feeBasisPatch, feeTaxPatch } from '../src/domain/finance';
import { projectDeliveryDate } from '../src/domain/delivery';
import { calendarEvents, setProjectDeadline } from '../src/operational/calendar';
import { defaultSections } from '../src/documents/options';
import { documentHtml, validateClientDocument } from '../shared/client-document.mjs';
import { serializeWorkspace, parseBackup } from '../src/storage/repository';
import { composeClientMessage } from '../src/toolkit/messages';
import { revisionDifferences } from '../src/domain/comparisons';
function ready(
  mode: 'excluding-tax' | 'including-tax' | 'custom',
  fee = '1100',
  taxRate = '10',
  credit = '0',
) {
  let w = createWorkspace();
  w.agency = {
    ...w.agency,
    legalName: 'Test Studio Limited',
    address: 'Test address',
    email: 'test@example.test',
    paymentInstructions: 'Use the agreed transfer method.',
  };
  w.clients[0].address = 'Test client billing address';
  w = updateChange(w, w.changes[0].id, {
    feeMode: mode,
    fee,
    taxRate,
    credit,
    creditReason: credit === '0' ? '' : 'Agreed scope reduction',
    contractConfirmed: true,
  });
  return w;
}
const approval = (w: ReturnType<typeof ready>) =>
  recordApproval(
    w,
    w.changes[0].id,
    'Written client acceptance recorded for this revision.',
    '2020-01-02',
  );
const invoice = (w: ReturnType<typeof ready>) =>
  buildInvoice(w, w.changes[0].id, { dueDate: '2030-01-01', demo: false });
describe('fee basis across estimates and client documents', () => {
  it('updates an inclusive total and credit on a tax edit without consuming the net fee', () => {
    const w = ready('including-tax', '1100', '10', '110');
    const patch = feeTaxPatch(w.changes[0], '20');
    expect(patch).toEqual({ taxRate: '20', fee: '1200.00', credit: '120.00' });
    const next = updateChange(w, w.changes[0].id, patch);
    expect(calculate(next.projects[0].baseline, next.changes[0]).effectiveFee).toBe('900');
    expect(buildBrief(next, next.changes[0].id)).toMatchObject({
      subtotal: '900.00',
      tax: '180.00',
      total: '1080.00',
    });
    expect(invoice(approval(next))).toMatchObject({
      subtotal: '900.00',
      tax: '180.00',
      total: '1080.00',
    });
    expect(feeTaxPatch(next.changes[0], '0')).toEqual({
      taxRate: '0',
      fee: '1000.00',
      credit: '100.00',
    });
  });
  it.each(['excluding-tax', 'custom'] as const)(
    'retains the before-tax amount in %s mode while documents update tax',
    (mode) => {
      const w = ready(mode, '1000', '10');
      expect(feeTaxPatch(w.changes[0], '20')).toEqual({ taxRate: '20' });
      const next = updateChange(w, w.changes[0].id, feeTaxPatch(w.changes[0], '20'));
      expect(buildBrief(next, next.changes[0].id)).toMatchObject({
        subtotal: '1000.00',
        tax: '200.00',
        total: '1200.00',
      });
    },
  );
  it('does not reinterpret unchanged rates, unfinished fees or invalid tax drafts', () => {
    const w = ready('including-tax', '0.03', '100');
    expect(feeTaxPatch(w.changes[0], '100')).toEqual({ taxRate: '100' });
    for (const tax of ['', '.', '-1', '100.01', '1.001', 'Infinity'])
      expect(feeTaxPatch(w.changes[0], tax)).toEqual({ taxRate: tax });
    for (const fee of ['', '.', '0.001', '-1', 'Infinity'])
      expect(feeTaxPatch({ ...w.changes[0], fee, credit: '' }, '20')).toEqual({ taxRate: '20' });
  });
  it('invalidates previous approval for a tax edit and retains issued invoices unchanged', () => {
    let w = approval(ready('including-tax', '1100', '10'));
    w = issueDocument(w, w.changes[0].id, 'invoice', { dueDate: '2030-01-01' });
    const snapshot = structuredClone(w.documents[0].snapshot);
    w = updateChange(w, w.changes[0].id, feeTaxPatch(w.changes[0], '20'));
    expect(w.approvals[0].invalidatedAt).toBeTruthy();
    expect(w.changes[0].status).toBe('Draft');
    expect(w.documents[0].snapshot).toEqual(snapshot);
    expect(
      documentReadiness(w, w.changes[0].id, 'invoice').find((x) => x.key === 'approval')?.complete,
    ).toBe(false);
  });
  it('compares legacy fee terms using readable defaults rather than undefined fields', () => {
    const legacy = ready('excluding-tax').changes[0];
    delete legacy.feeMode;
    delete legacy.taxRate;
    delete legacy.additionalDays;
    expect(
      revisionDifferences(legacy, {
        ...legacy,
        feeMode: 'excluding-tax',
        taxRate: '0',
        additionalDays: '0',
      }),
    ).toEqual([]);
    expect(revisionDifferences(legacy, { ...legacy, feeMode: 'including-tax' })[0]).toMatchObject({
      before: 'Excluding tax',
      after: 'Including tax',
    });
  });
  it('excludes tax from revenue while showing it separately on briefs and invoices', () => {
    const w = ready('excluding-tax', '1000');
    expect(calculate(w.projects[0].baseline, w.changes[0]).effectiveFee).toBe('1000');
    expect(buildBrief(w, w.changes[0].id)).toMatchObject({
      subtotal: '1000.00',
      tax: '100.00',
      total: '1100.00',
    });
    expect(invoice(approval(w))).toMatchObject({
      subtotal: '1000.00',
      tax: '100.00',
      total: '1100.00',
    });
  });
  it('keeps an inclusive client total fixed and produces the same net margin as an excluding-tax fee', () => {
    const w = ready('including-tax');
    const result = calculate(w.projects[0].baseline, w.changes[0]);
    const net = ready('excluding-tax', '1000');
    expect(result.effectiveFee).toBe('1000');
    expect(result.agreedMargin).toBe(
      calculate(net.projects[0].baseline, net.changes[0]).agreedMargin,
    );
    expect(invoice(approval(w))).toMatchObject({
      subtotal: '1000.00',
      tax: '100.00',
      total: '1100.00',
    });
    expect(composeClientMessage(w, w.changes[0]).text).toContain(
      '$1,100.00 (USD), including 10% tax',
    );
  });
  it('retains a custom before-tax fee and converts fee basis without changing its net value', () => {
    const w = ready('custom', '500');
    const patch = feeBasisPatch(w.changes[0], 'including-tax');
    expect(patch).toMatchObject({ fee: '550.00', credit: '0.00' });
    const next = updateChange(w, w.changes[0].id, patch);
    expect(calculate(next.projects[0].baseline, next.changes[0]).effectiveFee).toBe('500');
  });
  it('keeps cent boundaries exact rather than inflating a tax-inclusive total', () => {
    const w = ready('including-tax', '0.03', '100');
    const document = invoice(approval(w));
    expect(document).toMatchObject({ subtotal: '0.02', tax: '0.01', total: '0.03' });
    expect(() => validateClientDocument({ ...document, tax: '0.02' })).toThrow();
  });
  it('uses the same inclusive basis for an explicit credit and reconciles only net revenue', () => {
    let w = approval(ready('including-tax', '110', '10', '220'));
    expect(buildBrief(w, w.changes[0].id)).toMatchObject({
      subtotal: '-100.00',
      tax: '-10.00',
      total: '-110.00',
    });
    const credit = buildInvoice(w, w.changes[0].id, { dueDate: '2030-01-01' }, 'credit');
    expect(credit).toMatchObject({ subtotal: '100.00', tax: '10.00', total: '110.00' });
    w = reconcileChange(w, w.changes[0].id, '520', '0');
    expect(w.projects[0].baseline.fee).toBe('7900');
  });
  it.each(['', '-1', '100.01', '1.001', 'Infinity'])(
    'keeps invalid tax rate %s as a blocked draft',
    (taxRate) => {
      const w = ready('including-tax', '1100', taxRate);
      expect(calculate(w.projects[0].baseline, w.changes[0]).valid).toBe(false);
      expect(() => approval(w)).toThrow();
    },
  );
});
describe('delivery adjustments and document choices', () => {
  it('carries proposed days to both document types and applies them once to the project/calendar', () => {
    let w = ready('including-tax');
    w = updateProjectTiming(w, w.projects[0].id, { deadline: '2028-02-27', additionalDays: '1' });
    w = updateChange(w, w.changes[0].id, { additionalDays: '2', contractConfirmed: true });
    expect(buildBrief(w, w.changes[0].id)).toMatchObject({
      additionalDays: '2',
      deliveryDate: '2028-03-01',
    });
    expect(projectDeliveryDate(w.projects[0])).toBe('2028-02-28');
    w = approval(w);
    expect(invoice(w)).toMatchObject({ additionalDays: '2', deliveryDate: '2028-03-01' });
    w = reconcileChange(w, w.changes[0].id, '520', '0');
    expect(w.projects[0].additionalDays).toBe('3');
    const changedTiming = updateProjectTiming(w, w.projects[0].id, { deadline: '2028-04-01' });
    expect(buildBrief(changedTiming, w.changes[0].id).deliveryDate).toBe('2028-03-01');
    expect(buildBrief(w, w.changes[0].id).deliveryDate).toBe('2028-03-01');
    expect(
      calendarEvents(w).find((event) => event.id.startsWith('project-deadline:'))?.startsAt,
    ).toBe('2028-03-01');
    expect(() => reconcileChange(w, w.changes[0].id, '520', '0')).toThrow();
    expect(parseBackup(serializeWorkspace(w))).toEqual(w);
  });
  it('keeps issued terms immutable while changes to project timing require new approval', () => {
    let w = approval(ready('including-tax'));
    w = issueDocument(w, w.changes[0].id, 'invoice', { dueDate: '2030-01-01' });
    const preserved = structuredClone(w.documents[0].snapshot);
    w = setProjectDeadline(w, w.projects[0].id, '2030-01-03');
    expect(w.changes[0].status).toBe('Draft');
    expect(w.approvals[0].invalidatedAt).toBeTruthy();
    expect(w.documents[0].snapshot).toEqual(preserved);
  });
  it('does not imply a delivery commitment for deferred requests', () => {
    let w = ready('custom');
    w = updateChange(w, w.changes[0].id, { route: 'Defer', additionalDays: '5' });
    const document = buildBrief(w, w.changes[0].id);
    expect(document).toMatchObject({
      additionalDays: '0',
      deliveryDate: '',
      subtotal: '',
      total: '',
    });
    expect(documentHtml(document)).not.toContain('<h2>Delivery timing</h2>');
  });
  it('removes optional content and signatures from rendering without losing source content', () => {
    const w = ready('custom', '500');
    const document = buildBrief(w, w.changes[0].id, {
      sections: {
        ...defaultSections(),
        exclusions: false,
        dependencies: false,
        assumptions: false,
        footer: false,
        delivery: false,
      },
      demo: false,
    });
    const html = documentHtml(document);
    expect(document.exclusions).toBe(w.changes[0].exclusions);
    expect(html).not.toContain('<h2>Exclusions</h2>');
    expect(html).not.toContain('<h2>Dependencies</h2>');
    expect(html).not.toContain('<h2>Assumptions</h2>');
    expect(html).not.toContain('Prepared with');
    expect(html).not.toContain('class="signoff"');
    const signed = issueDocument(approval(w), w.changes[0].id, 'brief', {
      sections: document.sections,
    });
    expect(parseBackup(serializeWorkspace(signed)).documents[0].snapshot?.sections).toEqual(
      document.sections,
    );
    expect(() =>
      validateClientDocument({ ...document, sections: { ...document.sections, secret: false } }),
    ).toThrow();
  });
  it('keeps required invoice identities/addresses when optional contact details are hidden', () => {
    const w = approval(ready('custom', '500'));
    const document = buildInvoice(w, w.changes[0].id, {
      dueDate: '2030-01-01',
      sections: { ...defaultSections(), contactDetails: false },
    });
    const html = documentHtml(document);
    expect(html).toContain('Test address');
    expect(html).toContain('Test client billing address');
    expect(html).not.toContain('test@example.test');
  });
});
