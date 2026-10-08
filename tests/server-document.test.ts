import { describe, it, expect } from 'vitest';
import {
  validateClientDocument,
  documentHtml,
  logoDimensions,
} from '../shared/client-document.mjs';
import { fixture, logo } from './server/fixtures.mjs';
describe('client-facing transfer confidentiality and shared HTML', () => {
  it.each(['brief', 'invoice', 'credit'] as const)(
    'embeds the approved ScopeLedger logo offline without replacing the %s issuer',
    (kind) => {
      const html = documentHtml(
        fixture({ kind, ...(kind === 'brief' ? { tax: '0', total: '800.00' } : {}) }),
      );
      expect(html).toContain('class="document-brand"');
      expect(html).toContain('alt="ScopeLedger"');
      expect(html).toContain('data:image/svg+xml;charset=utf-8,');
      expect(html).toContain('class="agency-name">Aster Studio');
    },
  );
  it('keeps issuer identity clear without repeating an identical text wordmark', () => {
    const base = fixture();
    const header = (agency: typeof base.agency) =>
      documentHtml(fixture({ agency })).split('<div class="issuer">')[1].split('</div>')[0];
    const sameName = { ...base.agency, legalName: base.agency.name };
    expect(header(sameName).match(/Aster Studio/g)).toHaveLength(1);
    expect(header({ ...sameName, legalName: 'Aster Studio Limited' })).toContain(
      'Aster Studio Limited',
    );
    expect(header({ ...sameName, logoDataUrl: logo })).toContain('<p>Aster Studio');
  });
  it.each(['brief', 'invoice', 'credit'] as const)(
    'keeps opaque source identity out of %s copy without changing the snapshot',
    (kind) => {
      const sourceId = 'd1513e04-9cb2-455b-a080-2515a9d9852e';
      const snapshot = fixture({
        kind,
        changeReference: sourceId,
        ...(kind === 'brief' ? { tax: '0', total: '800.00' } : {}),
      });
      const original = structuredClone(snapshot);
      const html = documentHtml(snapshot);
      expect(html).not.toContain(sourceId);
      expect(html).toContain('Revision 1');
      expect(snapshot).toEqual(original);
      expect(validateClientDocument(snapshot).changeReference).toBe(sourceId);
    },
  );
  it('accepts a preserved invoice snapshot and returns a separate clone', () => {
    const doc = fixture();
    const validated = validateClientDocument(doc);
    expect(validated).toEqual(doc);
    expect(validated).not.toBe(doc);
  });
  it.each(['hours', 'rate', 'target', 'actual', 'remaining', 'privateNotes', 'internalComparison'])(
    'rejects private top-level %s',
    (key) => {
      expect(() => validateClientDocument({ ...fixture(), [key]: 'PRIVATE SENTINEL' })).toThrow(
        /unapproved fields/,
      );
    },
  );
  it('rejects hidden private nested fields and unapproved missing fields', () => {
    const d = fixture();
    expect(() =>
      validateClientDocument({ ...d, agency: { ...d.agency, privateNotes: 'secret' } }),
    ).toThrow(/unapproved fields/);
    const { scope, ...missing } = d;
    expect(() => validateClientDocument(missing)).toThrow(/missing/);
  });
  it('escapes user HTML and embeds no remote resources', () => {
    const html = documentHtml(
      fixture({
        scope: '<script>fetch("https://evil.example")</script>',
        description: '<img src=https://evil.example onerror=alert(1)>',
      }),
    );
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=https:');
    expect(html).not.toMatch(/@import|url\(https?:|<link/);
  });
  it('keeps all private data outside the HTML content', () => {
    const html = documentHtml(fixture());
    expect(html).not.toMatch(/loaded cost|margin target|actual delivery|internal comparison/i);
    expect(html).toContain('USD 840.00');
  });
  it('preserves plain-text paragraph boundaries without interpreting markup', () => {
    const html = documentHtml(
      fixture({
        kind: 'brief',
        tax: '0',
        total: '800.00',
        scope: 'Scope section 1\n<script>private()</script>\n\nScope section 2\nSecond paragraph',
      }),
    );
    expect(html).toContain(
      '<p class="short-paragraph">Scope section 1\n&lt;script&gt;private()&lt;/script&gt;</p><p class="short-paragraph">Scope section 2\nSecond paragraph</p>',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('section p{orphans:3;widows:3}');
  });
  it('keeps short paragraphs intact without making long authored text unbreakable', () => {
    const long = 'Continuous long content. '.repeat(100);
    const html = documentHtml(
      fixture({
        kind: 'brief',
        tax: '0',
        total: '800.00',
        scope: `Short delivery paragraph.\n\n${long}`,
      }),
    );
    expect(html).toContain('<p class="short-paragraph">Short delivery paragraph.</p>');
    expect(html).toContain(`<p>${long}</p>`);
    expect(html).toContain('section p.short-paragraph{break-inside:avoid;page-break-inside:avoid}');
  });
  it.each(['Draft', 'Quoted', 'Approved'])(
    'labels a %s brief credit with its actual agreement status and watermarks demo',
    (status) => {
      const d = fixture({
        kind: 'brief',
        status,
        subtotal: '-100.00',
        total: '-100.00',
        taxRate: '0',
        tax: '0',
        demo: true,
      });
      const html = documentHtml(d);
      expect(html).toContain(status === 'Approved' ? 'Agreed credit' : 'Proposed credit');
      expect(html).not.toContain(status === 'Approved' ? 'Proposed credit' : 'Agreed credit');
      expect(html).toContain('DEMO PREVIEW');
    },
  );
  it.each(['Draft', 'Quoted', 'Approved'])(
    'distinguishes a %s positive brief fee from a recorded agreement',
    (status) => {
      const html = documentHtml(
        fixture({ kind: 'brief', status, subtotal: '800.00', tax: '0', total: '800.00' }),
      );
      expect(html).toContain(
        status === 'Approved' ? 'Agreed additional fee' : 'Proposed additional fee',
      );
      expect(html).not.toContain(
        status === 'Approved' ? 'Proposed additional fee' : 'Agreed additional fee',
      );
      expect(html).toContain('USD 800.00');
    },
  );
  it('renders public credit explanations and marks proposed removal accurately', () => {
    const html = documentHtml(
      fixture({
        kind: 'brief',
        status: 'Quoted',
        subtotal: '-100.00',
        total: '-100.00',
        taxRate: '0',
        tax: '0',
        removedScope: 'One archive template',
        description: 'Explicit client credit: agreed scope reduction.',
      }),
    );
    expect(html).toContain('Credit explanation');
    expect(html).toContain('agreed scope reduction');
    expect(html).toContain('Proposed scope removal');
    expect(html).not.toContain('Approved scope removal');
  });
  it('widens very large financial summaries and bounds header metadata', () => {
    expect(
      documentHtml(
        fixture({
          subtotal: '900000000000000000000000.00',
          taxRate: '5',
          tax: '45000000000000000000000.00',
          total: '945000000000000000000000.00',
        }),
      ),
    ).toContain('class="amounts wide"');
    expect(() => validateClientDocument(fixture({ reference: 'X'.repeat(201) }))).toThrow(
      /metadata/,
    );
  });
  it('requires an actual approval date on invoice and credit transfers', () => {
    for (const kind of ['invoice', 'credit'] as const)
      expect(() => validateClientDocument(fixture({ kind, approvalDate: '' }))).toThrow(
        /approvalDate/,
      );
    expect(() => validateClientDocument(fixture({ approvalDate: '2026-02-30' }))).toThrow(
      /calendar/,
    );
  });
  it('rejects contradictory brief amounts while preserving draft invoice tax input', () => {
    expect(() =>
      validateClientDocument(fixture({ kind: 'brief', tax: '0', total: '799.00' })),
    ).toThrow(/Brief fee/);
    expect(() =>
      validateClientDocument(fixture({ kind: 'brief', subtotal: '', tax: '0', total: '800.00' })),
    ).toThrow(/unknown/);
    expect(() =>
      validateClientDocument(fixture({ kind: 'brief', tax: '1', total: '800.00' })),
    ).toThrow(/excluding-tax/);
    expect(
      validateClientDocument(fixture({ kind: 'brief', tax: '0', total: '800.00', taxRate: '7.25' }))
        .taxRate,
    ).toBe('7.25');
  });
  it('does not mislabel negative zero as a proposed client credit', () => {
    expect(
      documentHtml(fixture({ kind: 'brief', subtotal: '-0.00', total: '-0.00', tax: '0' })),
    ).not.toContain('Proposed credit');
  });
  it('permits incomplete brief fields without replacing unknowns with zero', () => {
    const d = fixture({
      kind: 'brief',
      subtotal: '',
      total: '',
      tax: '',
      taxRate: '',
      dueDate: '',
      issueDate: '',
      approvalDate: '',
    });
    expect(documentHtml(d)).toContain('To confirm');
  });
  it('requires approved invoices, explicit credit kind and correct tax totals', () => {
    expect(() => validateClientDocument(fixture({ status: 'Draft' }))).toThrow(/approval/);
    expect(() => validateClientDocument(fixture({ subtotal: '-100' }))).toThrow(/nonnegative/);
    expect(() => validateClientDocument(fixture({ tax: '39.99' }))).toThrow(/do not match/);
    expect(() => validateClientDocument(fixture({ total: '839.99' }))).toThrow(/do not match/);
    expect(documentHtml(fixture({ kind: 'credit' }))).toContain('not a request for payment');
  });
  it('validates dates, numeric precision and issuer readiness', () => {
    expect(() => validateClientDocument(fixture({ dueDate: '2026-09-30' }))).toThrow(/precede/);
    expect(() => validateClientDocument(fixture({ issueDate: '2026-02-30' }))).toThrow(/calendar/);
    expect(() => validateClientDocument(fixture({ subtotal: '800.001' }))).toThrow(/two decimals/);
    const d = fixture();
    expect(() => validateClientDocument({ ...d, agency: { ...d.agency, legalName: '' } })).toThrow(
      /issuer/,
    );
  });
  it('accepts bounded PNG, rejects SVG/remote/oversized dimensions and bytes', () => {
    expect(logoDimensions(logo)).toEqual({ width: 1, height: 1 });
    expect(() => logoDimensions('https://evil.example/logo.png')).toThrow(/PNG or JPEG/);
    expect(() => logoDimensions('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(/PNG or JPEG/);
    const bytes = Buffer.from(logo.split(',')[1], 'base64');
    bytes.writeUInt32BE(5000, 16);
    expect(() => logoDimensions(`data:image/png;base64,${bytes.toString('base64')}`)).toThrow(
      /dimensions/,
    );
    expect(() =>
      logoDimensions(`data:image/png;base64,${Buffer.alloc(524289).toString('base64')}`),
    ).toThrow(/512/);
  });
  it('rejects unreasonable document text and CSS injection', () => {
    expect(() => validateClientDocument(fixture({ description: 'A'.repeat(100001) }))).toThrow(
      /bounded text/,
    );
    const d = fixture();
    expect(() =>
      validateClientDocument({
        ...d,
        agency: { ...d.agency, accentColor: 'red; background:url(https://evil.example)' },
      }),
    ).toThrow(/hex color/);
  });
});
