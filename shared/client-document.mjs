import Decimal from 'decimal.js';
import { documentFonts } from './document-fonts.mjs';
import { feeAmounts } from './fee-math.mjs';
const D = Decimal.clone({ precision: 80 });
const FIELDS = [
  'schemaVersion',
  'kind',
  'reference',
  'agency',
  'client',
  'projectName',
  'changeTitle',
  'changeReference',
  'revision',
  'status',
  'currency',
  'issueDate',
  'dueDate',
  'scope',
  'deliverables',
  'removedScope',
  'exclusions',
  'dependencies',
  'assumptions',
  'deliveryImplications',
  'approvalText',
  'approvalRecorded',
  'approvalDate',
  'description',
  'subtotal',
  'taxRate',
  'tax',
  'total',
  'paymentInstructions',
  'footer',
  'demo',
];
const AGENCY = ['name', 'legalName', 'address', 'email', 'website', 'logoDataUrl', 'accentColor'];
const CLIENT = ['name', 'contact', 'email', 'address'];
const fail = (message) => {
  throw new Error(`Document: ${message}`);
};
function shape(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail(`${label} must be an object.`);
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail(`${label} contains missing or unapproved fields. Private data must not be transferred.`);
}
function calendar(value, label, optional = false) {
  if (optional && value === '') return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail(`${label} must be a real calendar date.`);
}
function imageDimensions(url, label, maxBytes) {
  if (!url) return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match || match[2].length % 4 || match[2].length > Math.ceil(maxBytes / 3) * 4)
    fail(`${label} must be a PNG or JPEG data image, up to ${maxBytes / 1024} KiB.`);
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  if (bytes.length > maxBytes) fail(`${label} exceeds ${maxBytes / 1024} KiB.`);
  return rasterDimensions(bytes, match[1], label);
}
function rasterDimensions(bytes, format, label) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width, height;
  if (format === 'png') {
    if (
      bytes.length < 33 ||
      [137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => bytes[i] !== n) ||
      String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
    )
      fail(`Invalid PNG ${label.toLowerCase()}.`);
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else {
    if (bytes[0] !== 255 || bytes[1] !== 216) fail(`Invalid JPEG ${label.toLowerCase()}.`);
    let position = 2;
    while (position + 8 < bytes.length) {
      if (bytes[position++] !== 255) fail('Invalid JPEG marker.');
      while (bytes[position] === 255) position++;
      if (position + 3 > bytes.length) fail('Invalid JPEG marker.');
      const marker = bytes[position++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) fail('Invalid JPEG segment.');
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) fail('Invalid JPEG dimensions segment.');
        height = view.getUint16(position + 3);
        width = view.getUint16(position + 5);
        break;
      }
      position += length;
    }
  }
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16777216)
    fail(`${label} dimensions must be 1–4096 pixels and at most 16 megapixels.`);
  return { width, height };
}
export const logoDimensions = (url) => imageDimensions(url, 'Logo', 524288);
export const signatureDimensions = (url) => imageDimensions(url, 'Signature', 262144);
export function signatureUploadDimensions(bytes, mime) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 2097152 ||
    !['image/png', 'image/jpeg'].includes(mime)
  )
    fail('Signature import must be a PNG or JPEG up to 2 MiB.');
  return rasterDimensions(bytes, mime === 'image/png' ? 'png' : 'jpeg', 'Signature');
}
export function validateClientDocument(input) {
  // This optional, explicit extension keeps schema-1 snapshots byte-for-byte compatible.
  shape(
    input,
    [
      ...FIELDS,
      ...['signatures', 'feeMode', 'additionalDays', 'deliveryDate', 'sections'].filter((key) =>
        Object.hasOwn(input ?? {}, key),
      ),
    ],
    'snapshot',
  );
  shape(input.agency, AGENCY, 'agency');
  shape(input.client, CLIENT, 'client');
  if (
    input.schemaVersion !== 1 ||
    !['brief', 'invoice', 'credit'].includes(input.kind) ||
    !['USD', 'GBP', 'EUR', 'CAD', 'AUD'].includes(input.currency) ||
    typeof input.demo !== 'boolean' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1
  )
    fail('Invalid version, kind, currency, revision, or demo state.');
  let length = 0;
  for (const [key, value] of Object.entries(input)) {
    if (
      ['schemaVersion', 'revision', 'demo', 'agency', 'client', 'signatures', 'sections'].includes(
        key,
      )
    )
      continue;
    if (typeof value !== 'string' || value.length > 100000) fail(`${key} must be bounded text.`);
    length += value.length;
  }
  if (
    input.feeMode !== undefined &&
    !['excluding-tax', 'including-tax', 'custom'].includes(input.feeMode)
  )
    fail('Invalid fee basis.');
  if (
    input.additionalDays !== undefined &&
    !(input.kind === 'brief' && input.additionalDays === '') &&
    (!/^\d{1,4}$/.test(input.additionalDays) || Number(input.additionalDays) > 3650)
  )
    fail('Additional days must be whole calendar days from 0 to 3,650.');
  if (input.deliveryDate !== undefined) calendar(input.deliveryDate, 'deliveryDate', true);
  if (input.sections !== undefined) {
    const sectionKeys = [
      'agencyLogo',
      'contactDetails',
      'exclusions',
      'dependencies',
      'assumptions',
      'delivery',
      'footer',
    ];
    shape(input.sections, sectionKeys, 'sections');
    if (Object.values(input.sections).some((value) => typeof value !== 'boolean'))
      fail('Document section visibility must be boolean.');
  }
  for (const record of [input.agency, input.client])
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== 'string' || value.length > (key === 'logoDataUrl' ? 700000 : 100000))
        fail(`${key} must be bounded text.`);
      if (key !== 'logoDataUrl') length += value.length;
    }
  if (input.signatures !== undefined) {
    shape(input.signatures, ['enabled', 'showClient', 'issuer', 'client'], 'signatures');
    if (
      typeof input.signatures.enabled !== 'boolean' ||
      typeof input.signatures.showClient !== 'boolean'
    )
      fail('Signature visibility must be a boolean.');
    for (const party of ['issuer', 'client']) {
      const signer = input.signatures[party];
      shape(signer, ['name', 'role', 'date', 'imageDataUrl'], `${party} signature`);
      for (const [key, limit] of [
        ['name', 300],
        ['role', 200],
        ['date', 10],
        ['imageDataUrl', 350000],
      ]) {
        if (typeof signer[key] !== 'string' || signer[key].length > limit)
          fail(`${party} signature ${key} must be bounded text.`);
        if (key !== 'imageDataUrl') length += signer[key].length;
      }
      calendar(signer.date, `${party} signature date`, true);
      signatureDimensions(signer.imageDataUrl);
    }
  }
  if (length > 200000) fail('Document text exceeds 200,000 characters.');
  // Metadata has practical limits so a header cannot become an unbreakable page.
  const metadata = [
    [input.reference, 200],
    [input.changeReference, 200],
    [input.status, 80],
    [input.projectName, 1000],
    [input.changeTitle, 1000],
  ];
  for (const record of [input.agency, input.client])
    for (const key of ['name', 'legalName', 'contact', 'address', 'email', 'website']) {
      if (Object.hasOwn(record, key))
        metadata.push([
          record[key],
          key === 'address' ? 4000 : key === 'email' ? 254 : key === 'website' ? 2048 : 1000,
        ]);
    }
  if (metadata.some(([value, limit]) => value.length > limit))
    fail('Document header metadata exceeds its practical length limit.');
  if (!/^#[0-9a-f]{6}$/i.test(input.agency.accentColor))
    fail('Accent must be a six-digit hex color.');
  logoDimensions(input.agency.logoDataUrl);
  for (const key of ['issueDate', 'dueDate', 'approvalDate']) calendar(input[key], key, true);
  if (input.issueDate && input.dueDate && input.dueDate < input.issueDate)
    fail('Due date cannot precede issue date.');
  const numbers = {};
  for (const key of ['subtotal', 'taxRate', 'tax', 'total']) {
    if (input.kind === 'brief' && input[key] === '') {
      numbers[key] = null;
      continue;
    }
    const signedBrief = input.kind === 'brief' && ['subtotal', 'tax', 'total'].includes(key);
    if (
      !(signedBrief ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(input[key]) ||
      new D(input[key]).abs().greaterThan('1e24')
    )
      fail(
        `${key} must be a valid amount up to 10²⁴ with at most two decimals. Invoices and credit notes use nonnegative absolute amounts.`,
      );
    numbers[key] = new D(input[key]);
  }
  if (numbers.taxRate?.greaterThan(100)) fail('Tax rate must be between 0% and 100%.');
  if (input.kind === 'brief' && input.feeMode === undefined) {
    if (
      (numbers.subtotal === null) !== (numbers.total === null) ||
      (numbers.subtotal !== null && !numbers.total.equals(numbers.subtotal))
    )
      fail(
        'Brief fee and total must both remain unknown or state the same excluding-tax adjustment.',
      );
    if (numbers.tax !== null && !numbers.tax.isZero())
      fail(
        'Briefs state an excluding-tax adjustment; actual tax belongs on the invoice or credit note.',
      );
  }
  if (input.feeMode !== undefined && input.kind === 'brief') {
    if (
      [numbers.subtotal, numbers.tax, numbers.total].some((value) => value === null) &&
      ![numbers.subtotal, numbers.tax, numbers.total].every((value) => value === null)
    )
      fail('Brief amounts must all be known or all remain unknown.');
  }
  if (input.feeMode !== undefined && numbers.subtotal !== null && numbers.taxRate !== null) {
    const expected = feeAmounts(
      input.feeMode === 'including-tax' ? input.total : input.subtotal,
      input.taxRate,
      input.feeMode,
    );
    if (
      !numbers.subtotal.eq(expected.subtotal) ||
      !numbers.tax.eq(expected.tax) ||
      !numbers.total.eq(expected.total)
    )
      fail('Tax and total do not match the selected fee basis.');
  }
  if (input.kind !== 'brief') {
    if (input.status !== 'Approved' || !input.approvalRecorded.trim())
      fail('Invoices and credits require recorded approval.');
    if (
      ![
        input.reference,
        input.agency.legalName,
        input.agency.address,
        input.agency.email,
        input.client.name,
        input.client.address,
        input.description,
        input.paymentInstructions,
      ].every((value) => value.trim())
    )
      fail('Complete issuer, client, reference, approved description and payment instructions.');
    calendar(input.issueDate, 'issueDate');
    calendar(input.dueDate, 'dueDate');
    calendar(input.approvalDate, 'approvalDate');
    if (
      (input.feeMode !== 'including-tax' &&
        !numbers.tax.equals(
          numbers.subtotal
            .times(numbers.taxRate)
            .div(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        )) ||
      !numbers.total.equals(numbers.subtotal.plus(numbers.tax))
    )
      fail('Tax and total do not match the stated subtotal and tax rate.');
  }
  return structuredClone(input);
}
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const money = (value, currency) =>
  value === ''
    ? 'To confirm'
    : `${currency} ${new D(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
export function documentHtml(snapshot) {
  const d = validateClientDocument(snapshot),
    e = escape;
  const visible = (key) => d.sections?.[key] !== false;
  const section = (label, value) =>
    value
      ? `<section class="document-section${value.length > 900 ? ' section-long' : ''}"><h2>${label}</h2><div class="section-body">${value
          .split(/\r?\n[\t ]*\r?\n/)
          .map((paragraph) => {
            const short = paragraph.length <= 600 && paragraph.split('\n').length <= 7;
            return `<p${short ? ' class="short-paragraph"' : ''}>${e(paragraph)}</p>`;
          })
          .join('')}</div></section>`
      : '';
  const lines = (values) =>
    values
      .filter((value) => value.trim())
      .map(e)
      .join('\n');
  const brief = d.kind === 'brief';
  const credit = d.kind === 'credit';
  const agreed = d.status === 'Approved';
  const proposedCredit = brief && d.subtotal !== '' && new D(d.subtotal).lessThan(0);
  const title = brief ? 'Change brief' : credit ? 'Credit note' : 'Invoice';
  // Keep opaque source identity in the preserved payload, not client copy.
  const sourceIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    d.changeReference,
  );
  const positiveFee = brief && d.subtotal !== '' && new D(d.subtotal).greaterThan(0);
  const feeLabel = proposedCredit
    ? agreed
      ? 'Agreed credit'
      : 'Proposed credit'
    : positiveFee
      ? agreed
        ? 'Agreed additional fee'
        : 'Proposed additional fee'
      : d.subtotal === ''
        ? 'Commercial adjustment'
        : agreed
          ? 'Agreed adjustment'
          : 'Proposed adjustment';
  const supportingTerms = [
    ['Exclusions', visible('exclusions') ? d.exclusions : ''],
    ['Dependencies', visible('dependencies') ? d.dependencies : ''],
    ['Assumptions', visible('assumptions') ? d.assumptions : ''],
    ['Delivery implications', visible('delivery') ? d.deliveryImplications : ''],
  ];
  const compactTerms = supportingTerms.every(
    ([, value]) => value.length <= 400 && value.split('\n').length <= 5,
  );
  const supportingHtml = supportingTerms.map(([label, value]) => section(label, value)).join('');
  const wideAmounts = [d.subtotal, d.tax, d.total].some(
    (value) => money(value, d.currency).length > 23,
  );
  const inclusive = d.feeMode === 'including-tax';
  const feeSummary = `<div class="brief-summary${wideAmounts ? ' wide' : ''}"><span class="fee-label">${feeLabel}</span><strong>${money(inclusive ? d.total : d.subtotal, d.currency)}</strong><p class="summary-caption">${inclusive ? `Including ${e(d.taxRate)}% tax` : 'Excluding tax'} · ${agreed ? 'Recorded terms for this revision' : 'Subject to written approval'}</p>${d.feeMode && d.tax !== '' && !new D(d.tax).isZero() ? `<p class="fee-tax-detail">${inclusive ? `Net fee ${money(d.subtotal, d.currency)} · Tax ${money(d.tax, d.currency)}` : `Tax (${e(d.taxRate)}%) ${money(d.tax, d.currency)} · Total ${money(d.total, d.currency)}`}</p>` : ''}</div>`;
  const detail = (label, value) =>
    `<div><dt>${label}</dt><dd>${e(value || 'To confirm')}</dd></div>`;
  const issuer = lines([
    d.agency.logoDataUrl || d.agency.legalName !== d.agency.name ? d.agency.legalName : '',
    !brief || visible('contactDetails') ? d.agency.address : '',
    visible('contactDetails') ? d.agency.email : '',
    visible('contactDetails') ? d.agency.website : '',
  ]);
  const recipient = lines([
    d.client.name,
    visible('contactDetails') ? d.client.contact : '',
    visible('contactDetails') ? d.client.email : '',
    !brief || visible('contactDetails') ? d.client.address : '',
  ]);
  const delivery = visible('delivery')
    ? section(
        'Delivery timing',
        [
          d.additionalDays && Number(d.additionalDays) > 0
            ? `${d.additionalDays} additional calendar ${Number(d.additionalDays) === 1 ? 'day' : 'days'}.`
            : '',
          d.deliveryDate ? `${agreed ? 'Agreed' : 'Proposed'} delivery: ${d.deliveryDate}.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    : '';
  const totals = `<div class="amounts${wideAmounts ? ' wide' : ''}">
    <div><span>${credit ? 'Credit subtotal' : 'Subtotal'}, excluding tax</span><strong>${money(d.subtotal, d.currency)}</strong></div>
    <div><span>Tax (${e(d.taxRate)}%)</span><strong>${money(d.tax, d.currency)}</strong></div>
    <div class="total"><span>${credit ? 'Total credit' : 'Total'}</span><strong>${money(d.total, d.currency)}</strong></div>
    <p class="total-caption">${credit ? 'Credit adjustment' : 'Invoice total'} · ${e(d.currency)}</p>
  </div>`;
  const signatory = (party, label, organisation) => {
    const signer = d.signatures[party];
    return `<div class="signatory"><h3>${label}</h3><p class="signer-organisation">${e(organisation)}</p><div class="signature-space">${signer.imageDataUrl ? `<img data-signature="${party}" src="${signer.imageDataUrl}" alt="Imported ${party} signature${signer.name ? ` for ${e(signer.name)}` : ''}">` : ''}</div><div class="signature-rule"></div><p class="signer-name">${signer.name ? e(signer.name) : '<span class="blank-label">Name</span>'}${signer.role ? `<span class="signer-role">${e(signer.role)}</span>` : ''}</p><p class="signer-date">Date${signer.date ? ` · ${e(signer.date)}` : '<span class="date-rule"></span>'}</p></div>`;
  };
  const signatures = d.signatures?.enabled
    ? `<section class="signoff" aria-label="Document signatures"><div class="signoff-heading"><h2>Sign-off</h2><span>${brief ? 'Scope & commercial terms' : 'Issued by'}</span></div><div class="signatories${d.signatures.showClient ? '' : ' issuer-only'}">${signatory('issuer', 'Prepared by', d.agency.name)}${d.signatures.showClient ? signatory('client', 'Accepted by', d.client.name) : ''}</div></section>`
    : '';
  const recordedApproval = d.approvalRecorded
    ? `<div class="notice"><h2>Recorded approval${d.approvalDate ? ` · ${e(d.approvalDate)}` : ''}</h2><p>${e(d.approvalRecorded)}</p></div>`
    : '';
  const settlement = !brief
    ? `<div class="invoice-settlement${wideAmounts || d.paymentInstructions.length > 600 || d.approvalRecorded.length > 400 ? ' settlement-long' : ''}"><div>${section('Payment instructions', d.paymentInstructions)}${recordedApproval}</div>${totals}</div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)} · ${e(d.reference)}</title><style>
  ${documentFonts}
  @page{size:A4;margin:18mm 18mm 21mm}
  :root{color-scheme:light;--ink:#202326;--body:#373b3f;--muted:#656b70;--line:#d9dddf;--paper:#fff}
  *{box-sizing:border-box}
  body{margin:0;color:var(--body);font:9.5pt/1.5 "Document Sans",Arial,sans-serif;background:var(--paper);overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
  article{position:relative;isolation:isolate;max-width:760px;margin:auto;--accent:${d.agency.accentColor}}
  header{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,165px);gap:30px;align-items:start;padding-bottom:12px;border-bottom:1.5px solid var(--accent)}
  .issuer{min-width:0}.issuer img{display:block;width:142px;height:34px;object-fit:contain;object-position:left center;margin-bottom:8px}
  .agency-name{display:block;font-family:"Document Display",Arial,sans-serif;font-size:17pt;font-weight:500;line-height:1.3;letter-spacing:-.5px;color:var(--ink);margin-bottom:10px}
  .issuer p{color:var(--muted);font-size:7.5pt;line-height:1.45}
  .reference{min-width:0;padding-top:3px;color:var(--ink)}
  .reference .eyebrow{display:block;font-size:8.5pt;color:var(--muted);font-weight:400}
  .reference strong{display:block;font-size:10pt;font-weight:500;line-height:1.5;margin-top:4px}.reference p{font-size:8.5pt;color:var(--muted);margin-top:8px}
  .document-intro{margin:17px 0 15px}
  h1{font-family:"Document Display",Arial,sans-serif;font-size:33pt;font-weight:500;line-height:1.1;letter-spacing:-1.3px;color:var(--ink);margin:0 0 9px}
  .project-name{color:var(--muted);font-size:8.5pt;margin-bottom:5px}
  .change-title{font-size:11pt;font-weight:500;line-height:1.4;color:var(--ink)}
  h2{font-size:9pt;line-height:1.55;color:var(--ink);margin:0 0 6px;font-weight:500}
  p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
  strong{font-weight:500}
  .meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:17px}
  .meta h2{font-size:8.5pt;color:var(--muted);font-weight:400;margin-bottom:8px}
  .meta p{font-size:8.5pt}.meta dl{margin:0}.meta dl div{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px;margin-bottom:5px}.meta dt{color:var(--muted);font-size:8.5pt}.meta dd{margin:0;color:var(--ink);font-size:9pt;font-variant-numeric:tabular-nums}
  .brief-summary{padding:0;margin:0 0 20px;break-inside:avoid}
  .fee-label{display:block;font-size:8.5pt;color:var(--muted)}
  .brief-summary strong{display:block;font-family:"Document Display",Arial,sans-serif;font-size:25pt;line-height:1.2;letter-spacing:-.8px;color:var(--ink);font-variant-numeric:tabular-nums;margin:7px 0}
  .brief-summary.wide strong{font-size:13pt}.brief-summary .summary-caption{font-size:8pt;color:var(--muted)}
  .meta .brief-summary{margin:0}
  .fee-tax-detail{font-size:7.5pt;color:var(--muted);margin-top:5px}
  section{margin:10px 0;break-inside:auto}section h2{break-after:avoid}section p{orphans:3;widows:3}section p+p{margin-top:1.2em}section p.short-paragraph{break-inside:avoid;page-break-inside:avoid}
  .document-section{display:grid;grid-template-columns:112px minmax(0,1fr);column-gap:25px;padding-bottom:11px;border-bottom:1px solid var(--line)}
  .document-section h2{font-size:9pt}.section-body{min-width:0}
  .section-long{display:block}.section-long h2{margin-bottom:9px}
  .support-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:11px 24px;padding:4px 0 12px;margin:12px 0 0;border-bottom:1px solid var(--line);break-inside:avoid}
  .support-grid .document-section{display:block;border:0;padding:0;margin:0;font-size:8.5pt;line-height:1.5}.support-grid h2{font-size:8pt;margin-bottom:4px;color:var(--ink)}
  .amounts{margin:22px 0 24px auto;max-width:340px;break-inside:avoid}
  .amounts div{display:flex;justify-content:space-between;gap:18px;align-items:baseline;padding:8px 0;font-variant-numeric:tabular-nums}
  .amounts span{min-width:0;flex:1;font-size:9pt;color:var(--muted)}.amounts strong{min-width:0;max-width:68%;overflow-wrap:anywhere;text-align:right;font-size:10pt;white-space:normal;color:var(--ink)}
  .amounts .total{border-top:1px solid var(--ink);padding-top:13px;margin-top:8px}
  .amounts .total span{font-size:10pt;font-weight:500;color:var(--ink)}.amounts .total strong{font-family:"Document Display",Arial,sans-serif;font-size:28pt;line-height:1.2;letter-spacing:-.8px}
  .amounts .total-caption{color:var(--muted);font-size:8pt;text-align:right;margin-top:4px}
  .amounts.wide{max-width:100%}.amounts.wide div{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:16px}
  .amounts.wide strong{max-width:none;white-space:nowrap;overflow-wrap:normal;font-size:10.5pt}.amounts.wide .total strong{font-size:13pt}
  .invoice-settlement{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;margin:22px 0 24px;break-inside:avoid}.invoice-settlement .document-section{display:block;border:0;margin:0;padding:0;font-size:8.5pt}.invoice-settlement h2{font-size:8.5pt;margin-bottom:6px}.invoice-settlement .notice{margin:15px 0 0}.invoice-settlement .notice p{font-size:8pt}.invoice-settlement .amounts{margin:0;max-width:none}.invoice-settlement.settlement-long{display:block}.settlement-long .amounts{margin-top:20px}
  .notice{padding:0;margin:18px 0;break-inside:avoid}.notice h2{font-size:9pt;margin-bottom:5px}.notice p{font-size:9pt;color:var(--muted)}

  .signoff{margin:16px 0 0;break-inside:avoid;page-break-inside:avoid}
  .signoff-heading{display:flex;justify-content:space-between;align-items:baseline;gap:20px;padding-bottom:6px;border-bottom:1px solid var(--ink)}.signoff-heading h2{font-size:9pt;margin:0}.signoff-heading span{color:var(--muted);font-size:7.5pt}
  .signatories{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px;padding-top:10px}.signatories.issuer-only{grid-template-columns:minmax(0,1fr);max-width:48%}
  .signatory{min-width:0}.signatory h3{font-size:8pt;font-weight:500;color:var(--ink);margin:0 0 3px}.signer-organisation{color:var(--muted);font-size:7.5pt;line-height:1.4}
  .signature-space{height:36px;margin:4px 0 2px}.signature-space img{display:block;width:100%;height:100%;object-fit:contain;object-position:left bottom}
  .signature-rule{border-top:1px solid #8b9295}.signer-name{font-size:8pt;color:var(--ink);padding-top:5px}.signer-role{display:block;font-size:7.5pt;color:var(--muted);margin-top:2px}.blank-label{color:var(--muted)}.signer-date{font-size:7.5pt;color:var(--muted);margin-top:5px;display:flex;align-items:baseline;gap:5px}.date-rule{display:inline-block;border-bottom:1px solid var(--line);flex:1;max-width:110px}
  .brief-document header{padding-bottom:10px}.brief-document .document-intro{margin:13px 0 11px}.brief-document .meta{padding:10px 0;margin-bottom:14px}
  .brief-document .document-section{padding-bottom:9px;break-inside:avoid}.brief-document .document-section h2{break-after:auto}.brief-document .section-long{break-inside:auto}.brief-document .section-long h2{break-after:avoid}
  .brief-document .support-grid{gap:9px 24px;padding-bottom:10px}.brief-document .support-grid .document-section{padding:0}.brief-document .signoff{margin-top:12px}.brief-document .signatories{padding-top:8px}.brief-document .signature-space{height:30px}
  .watermark{font-size:8pt;font-weight:500;color:var(--muted);padding:8px 0;border-bottom:1px solid var(--line);margin-bottom:20px}
  .demo-watermark{position:absolute;inset:0;z-index:2;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='210' viewBox='0 0 320 210'%3E%3Cg transform='translate(160 105) rotate(-28)' fill='%23202326' fill-opacity='.12' font-family='Arial,sans-serif' font-size='21' font-weight='600' text-anchor='middle'%3E%3Ctext y='0'%3ESCOPELEDGER%3C/text%3E%3Ctext y='27' font-size='14' letter-spacing='4'%3EDEMO PREVIEW%3C/text%3E%3C/g%3E%3C/svg%3E");background-size:320px 210px}
  footer{padding-top:7px;margin-top:10px;color:var(--muted);font-size:7.5pt;line-height:1.5;white-space:pre-wrap;orphans:3;widows:3}
  a{color:inherit;text-decoration:none}
  @media screen{body{padding:26px;background:#e8eaec}article{background:#fff;padding:42px;box-shadow:0 3px 12px #0001;min-height:1040px}}
  @media screen and (max-width:600px){body{padding:10px}article{padding:24px 18px;min-height:0}header{grid-template-columns:minmax(0,1fr);gap:18px;padding-bottom:18px}.reference{border-top:1px solid var(--line);padding-top:14px}.reference strong{font-size:10pt}.issuer img{width:140px;height:42px}.meta{grid-template-columns:minmax(0,1fr);gap:22px}.document-intro{margin-top:22px}h1{font-size:26pt}.document-section{grid-template-columns:minmax(0,1fr);gap:7px}.support-grid{grid-template-columns:minmax(0,1fr)}.invoice-settlement{grid-template-columns:minmax(0,1fr);gap:20px}.signatories{grid-template-columns:minmax(0,1fr);gap:24px}.signatories.issuer-only{max-width:100%}.amounts.wide div{grid-template-columns:minmax(0,1fr);gap:5px}.amounts.wide strong{white-space:normal;overflow-wrap:anywhere;text-align:left}.amounts .total strong{font-size:21pt}.brief-summary strong{font-size:22pt}.brief-summary.wide strong{font-size:12pt;overflow-wrap:anywhere}}
  @media print{.demo-watermark{position:fixed;inset:-10mm;z-index:10}.watermark{font-size:8pt}header{break-inside:auto}.brief-summary.wide strong{white-space:nowrap;overflow-wrap:normal}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><article class="${brief ? 'brief-document' : 'invoice-document'}">
  ${d.demo ? '<div class="demo-watermark" aria-hidden="true"></div><div class="watermark">DEMO PREVIEW · Activate for an unwatermarked PDF</div>' : ''}
  <header><div class="issuer">${d.agency.logoDataUrl && visible('agencyLogo') ? `<img src="${d.agency.logoDataUrl}" alt="Agency logo">` : `<strong class="agency-name">${e(d.agency.name)}</strong>`}${issuer ? `<p>${issuer}</p>` : ''}</div><div class="reference"><span class="eyebrow">${brief ? 'Brief' : title} reference</span><strong>${e(d.reference || 'To confirm')}</strong><p>${e(d.status)} · Revision ${d.revision}</p>${brief ? `<p>Prepared ${e(d.issueDate || 'To confirm')}${d.dueDate ? `<br>Due ${e(d.dueDate)}` : ''}</p>` : ''}</div></header>
  <div class="document-intro"><h1>${title}</h1><p class="project-name">${e(d.projectName)}${brief && !sourceIsUuid ? ` · ${e(d.changeReference)}` : ''}</p><p class="change-title">${e(d.changeTitle)}</p></div>
  <div class="meta"><div><h2>${brief ? 'Prepared for' : credit ? 'Credit to' : 'Bill to'}</h2><p>${recipient || 'To confirm'}</p></div><div>${brief && !wideAmounts ? feeSummary : `<h2>Document details</h2><dl>${detail(brief ? 'Prepared' : 'Issued', d.issueDate)}${!brief || d.dueDate ? detail('Due', d.dueDate) : ''}${detail('Currency', d.currency)}${detail(sourceIsUuid ? 'Revision' : 'Change', sourceIsUuid ? String(d.revision) : d.changeReference)}</dl>`}</div></div>
  ${brief && wideAmounts ? feeSummary : ''}
  ${brief ? section('Scope of request', d.scope) + section('Deliverables', d.deliverables) + section(agreed ? 'Approved scope removal' : 'Proposed scope removal', d.removedScope) + (compactTerms && supportingHtml ? `<div class="support-grid">${supportingHtml}</div>` : supportingHtml) : section('Approved description', d.description)}
  ${delivery}
  ${settlement}
  ${proposedCredit ? section('Credit explanation', d.description) : ''}
  ${brief ? section('Approval requirements', d.approvalText) : ''}
  ${brief ? recordedApproval : ''}
  ${signatures}
  ${(visible('footer') && d.footer) || credit ? `<footer>${visible('footer') ? e(d.footer) : ''}${credit ? '\nThis is a credit adjustment, not a request for payment.' : ''}</footer>` : ''}
  </article></body></html>`;
}
