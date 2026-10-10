import { mkdir, writeFile, copyFile } from 'node:fs/promises';

import { dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';

// Original public content. Review dates change only after an actual content review.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const origin = 'https://scopeledger.site';

const reviewed = '2026-10-11';

const guides = [
  {
    slug: 'handle-scope-creep',
    title: 'How to Handle Scope Creep on Fixed-Fee Projects | ScopeLedger',
    heading: 'Handle scope creep before the next small yes.',
    category: 'Client conversations',
    description:
      'A practical process for fixed-fee agencies: compare requests with agreed scope, estimate costs, choose a response and confirm the next step in writing.',
    intro:
      'One more page. Another revision. A small feature. Before you answer, compare what changes in the agreement, your delivery cost and your schedule.',
    sections: [
      {
        id: 'recognize',
        title: 'Check what changed in the agreement.',
        content:
          '<p>Scope creep happens when work grows beyond its agreed boundaries without an explicit decision about the fee, schedule or other work. It often arrives as a friendly question rather than a formal request.</p><p>Compare the request with the <a href="/guides/project-baseline-checklist/">project baseline</a>: agreed deliverables, revision rounds, exclusions and dependencies. If the agreed scope includes the request, treat it as part of delivery. Fixing work that does not meet the agreed requirements is different from adding a new deliverable.</p><ul><li><strong>New deliverable:</strong> a journal collection added to a website that did not include one.</li><li><strong>More revisions:</strong> a new design direction after the included rounds are complete.</li><li><strong>Changed dependency:</strong> late content that requires a revised delivery sequence.</li><li><strong>Clarification:</strong> more detail about a requirement already included.</li></ul><p>If the agreement is ambiguous, make the uncertainty visible and clarify it with the client before assigning a fee.</p>',
      },
      {
        id: 'estimate',
        title: 'Estimate the work before you answer.',
        content:
          '<p>Describe what you will produce, what you can reuse, what is excluded and what you need from the client. Estimate additional hours and separate external costs. Use your loaded delivery cost; do not confuse it with the rate you charge a client.</p><div class="example"><h3>A small request with a measurable cost</h3><p>Harbor asks for a journal section. In this illustrative scenario, eight extra hours at USD 65 per hour mean <strong>USD 520 in additional delivery cost</strong>, before any separate expenses.</p><p>The calculation informs the decision. It does not automatically decide the selling price or establish who is responsible for the change.</p></div><p>Record additional delivery days separately. Eight hours of effort does not automatically mean one calendar day of delay: availability, dependencies and reviews affect the actual plan.</p>',
      },
      {
        id: 'respond',
        title: 'Choose an explicit response.',
        content:
          '<div class="table-scroll" tabindex="0" role="region" aria-label="Scope change responses"><table><caption>Four ways to handle additional work</caption><thead><tr><th scope="col">Response</th><th scope="col">What to make clear</th></tr></thead><tbody><tr><th scope="row">Charge for additional work</th><td>Added deliverables, fee, tax treatment and timing.</td></tr><tr><th scope="row">No additional charge</th><td>The deliberate exception and its cost to your project.</td></tr><tr><th scope="row">Replace some existing work</th><td>Removed work, its replacement and any fee difference.</td></tr><tr><th scope="row">Keep the request for later</th><td>No delivery or price is committed until it is reviewed.</td></tr></tbody></table></div><p>A strategic exception, an exchange or a later phase can be appropriate. Making the choice deliberately keeps the meaning clear.</p>',
      },
      {
        id: 'conversation',
        title: 'Give the client a calm, specific next step.',
        content:
          '<div class="example"><h3>For an additional fee</h3><p>“We can add the journal section. It is outside the current website scope, so I’ll send a short brief with the deliverables, additional fee and delivery impact for you to review before we start.”</p><h3>For an exchange</h3><p>“We can keep the current budget by replacing the agreed resource page with the journal section. I’ll confirm what comes out and what is included so we both have the same scope.”</p><h3>For a later phase</h3><p>“Let’s keep that request for the next phase. We’ll review the scope, fee and timing before scheduling it.”</p></div><p>Adapt the wording to the actual agreement. Do not present a newly invented rule as something the client already accepted.</p>',
      },
      {
        id: 'record',
        title: 'Put the decision and approval in writing.',
        content:
          '<p>Prepare a <a href="/guides/change-order-template/">change brief or change order</a> with the scope, fee, delivery impact, dependencies and approval requirements. Identify who can approve it, and record their written response against the relevant revision.</p><p>Importing a signature image is not evidence that the client approved that specific change. Approval and invoice issuance are separate steps.</p><p>Keep internal hours, delivery costs and margin analysis in your own records. Review client-facing free-text fields before sharing: anything you type there can appear in the document.</p>',
      },
    ],
  },
  {
    slug: 'change-order-template',
    title: 'Agency Change Order Template & Worked Example | ScopeLedger',
    heading: 'A change order template that makes the next step clear.',
    category: 'Document template',
    description:
      'Use a copyable agency change order template, a website example and a checklist for scope, fees, tax, delivery days and client approval.',
    intro:
      'What changes, what does it cost, what happens to delivery and what needs approval? Start with those four questions, then adapt the document to your project.',
    sections: [
      {
        id: 'purpose',
        title: 'Use a brief before issuing an invoice.',
        content:
          '<p>A change brief describes proposed work and its commercial terms. An invoice requests payment for an agreed charge; it should not be the first place a client discovers that the scope or fee changed.</p><p>“Change order,” “scope addendum” and “change brief” can mean different things in different agreements. Use the name that fits your process. The content and approval record matter more than the label.</p><div class="note"><p>This is a practical drafting template, not a legal contract or a guarantee of enforceability. Adapt it to the original agreement, the project and the requirements that apply to your business.</p></div>',
      },
      {
        id: 'template',
        title: 'Copy the template and add the actual details.',
        content:
          '<div class="example"><pre class="template">CHANGE BRIEF · [reference] · [revision]\nPrepared on: [date]\nProject: [name]\nPrepared by: [agency and contact]\nPrepared for: [client and contact]\nOriginal agreement: [reference / date / relevant scope]\n\nREQUEST\n[What changes and why.]\n\nDELIVERABLES\n[Specific work you will produce.]\n\nEXCLUSIONS\n[Work not included in this change.]\n\nDEPENDENCIES AND ASSUMPTIONS\n[Inputs, access, decisions or approvals required.]\n\nFEE\nNet additional fee: [currency and amount]\nTax: [label, percentage and amount, if applicable]\nClient total: [currency and amount]\nPayment terms: [agreed terms]\n\nDELIVERY\nAdditional delivery days: [number and day basis]\nDelivery implications: [effect on dates and dependencies]\n\nAPPROVAL\n[Who confirms scope, fee and timing; how and by when.]\n[Which original terms continue to apply.]\n\nSIGN-OFF, IF REQUIRED\nPrepared by: [name / role / date / signature]\nAccepted by: [name / role / date / signature]</pre></div><p>Remove fields that are irrelevant, but do not remove a real dependency or approval requirement just to fit the document onto one page.</p>',
      },
      {
        id: 'example',
        title: 'A worked website change.',
        content:
          '<p>Aster Studio is preparing a journal collection for Harbor’s website. This is an illustrative scenario, not a real customer case study.</p><div class="example"><h3>Harbor / Website — journal collection</h3><p><strong>Scope:</strong> Add a journal section using the existing visual design and content system.</p><p><strong>Deliverables:</strong> One collection, one reusable article template and one listing page. One review round covers the templates.</p><p><strong>Exclusions:</strong> Copywriting, bulk content entry and additional integrations.</p><p><strong>Dependency:</strong> Harbor supplies approved copy and images before the build begins.</p><p><strong>Fee:</strong> USD 800.00 excluding tax. At an illustrative 5% rate, tax is USD 40.00 and the client total is USD 840.00.</p><p><strong>Delivery:</strong> Two additional business days; confirm the revised date after the required content is received.</p><p><strong>Approval:</strong> Confirm scope, fee and dependencies in writing before additional work begins. Remaining original terms continue to apply.</p></div><p>Use the actual applicable tax treatment and agreed payment terms. Do not copy the example’s tax rate without checking it.</p>',
      },
      {
        id: 'review',
        title: 'Review the terms before sharing.',
        content:
          '<ul><li>Client, project, reference and revision match the proposed change.</li><li>Deliverables are specific enough to establish what “done” means.</li><li>The fee says whether tax is included or added, and totals agree.</li><li>Additional days say whether they are business or calendar days.</li><li>Dependencies explain what can affect the revised date.</li><li>The authorized approver and approval method are identified.</li><li>Signature images have not been mistaken for recorded approval.</li><li>Internal cost or margin notes are absent from client-facing text.</li></ul><p>For a scope exchange, list removed work and replacement work. For a deferred request, avoid wording that accidentally commits a price or delivery date.</p>',
      },
      {
        id: 'sample',
        title: 'Inspect the public demonstration PDFs.',
        content:
          '<p>The samples show how a brief and an invoice present scope and fees at different points in the workflow. They do not show approval by a real customer.</p><div class="actions"><a class="button" href="/samples/change-brief.pdf">Open the sample brief PDF</a><a class="button" href="/samples/invoice.pdf">Open the sample invoice PDF</a></div><p class="small">The free workspace includes document previews. Protected customer PDF exports require activated export services, which are not yet enabled on the public deployment.</p>',
      },
    ],
  },
  {
    slug: 'price-additional-work',
    title: 'How to Price Additional Work: Cost, Margin & Tax | ScopeLedger',
    heading: 'Price additional work with cost and margin in view.',
    category: 'Pricing calculations',
    description:
      'Calculate delivery costs, compare contribution margins and separate a net additional fee from tax and the client total. Includes a worked agency example.',
    intro:
      'Use a clear estimate to compare absorbing the cost, charging a fee, exchanging work or deferring a request. A calculation makes the tradeoff visible before you answer.',
    sections: [
      {
        id: 'cost',
        title: 'Calculate the additional delivery cost.',
        content:
          '<p>Estimate the extra work and the work you can reuse. Multiply additional hours by your loaded hourly delivery cost, then add separate external costs. Loaded cost is the cost of doing the work; it differs from a client billing rate.</p><p class="formula">Additional cost = additional hours × loaded hourly cost + external costs</p><div class="example"><h3>Illustrative Harbor request</h3><p>Eight hours at USD 65 per hour cost <strong>USD 520</strong>. This example has no separate external costs. If costs are unknown, identify them instead of silently treating them as zero.</p></div><p>An estimate remains an estimate. A confidence range or unresolved dependency can be more useful than a precise-looking total based on uncertain inputs.</p>',
      },
      {
        id: 'margin',
        title: 'See the effect of absorbing the work.',
        content:
          '<p>Contribution margin compares project revenue with delivery costs included in your model. It is not business net profit: overhead outside that model, financing and business taxes can change the result.</p><p class="formula">Contribution margin = (net revenue − delivery cost) ÷ net revenue</p><div class="table-scroll" tabindex="0" role="region" aria-label="Illustrative contribution calculation"><table><caption>Example: a USD 8,000 fixed-fee project</caption><thead><tr><th scope="col">Measure</th><th scope="col" class="number">Before</th><th scope="col" class="number">Absorb change</th></tr></thead><tbody><tr><th scope="row">Net revenue</th><td class="number">$8,000</td><td class="number">$8,000</td></tr><tr><th scope="row">Delivery cost</th><td class="number">$5,200</td><td class="number">$5,720</td></tr><tr><th scope="row">Contribution</th><td class="number">$2,800</td><td class="number">$2,280</td></tr><tr><th scope="row">Margin</th><td class="number">35%</td><td class="number">28.5%</td></tr></tbody></table></div><p>Absorbing USD 520 reduces the modeled contribution by USD 520 without changing the fee. You may choose that deliberately. The calculation gives the choice a visible cost.</p>',
      },
      {
        id: 'fee',
        title: 'Use a margin calculation, not a markup.',
        content:
          '<p>To give the additional work a target contribution margin, divide its delivery cost by one minus that target.</p><p class="formula">Net additional fee = additional delivery cost ÷ (1 − target margin)</p><p>For USD 520 of cost and a 35% target, <strong>520 ÷ 0.65 = USD 800</strong>. Adding 35% to cost produces USD 702: that is a 35% markup, with a margin of about 25.9%.</p><div class="facts"><div class="fact"><span>Delivery cost</span><b>$520</b></div><div class="fact"><span>Net additional fee</span><b>$800</b></div><div class="fact"><span>Contribution</span><b>$280</b></div></div><p>Charging USD 800 gives combined revenue of USD 8,800 and delivery cost of USD 5,720. The modeled overall margin remains 35%.</p><p>This is a calculation method, not a required price. Your agreement, risk, market and chosen response can lead to a different fee. A positive margin target must be below 100%. A zero-revenue project needs separate handling because the margin calculation divides by revenue.</p>',
      },
      {
        id: 'tax',
        title: 'Separate the net fee, tax and client total.',
        content:
          '<p>Tax collected for the transaction should not inflate delivery margin. State whether your proposed fee is net of tax or the total including tax.</p><ul><li><strong>Excluding tax:</strong> start with the net fee and add tax for the client total.</li><li><strong>Including tax:</strong> show the total and calculate its net fee and tax components.</li><li><strong>Custom fee:</strong> choose an amount deliberately and check the resulting margin and document totals.</li></ul><div class="example"><h3>Illustrative tax calculation</h3><p>At an illustrative 5% tax rate, a USD 800 net fee has USD 40 tax and a USD 840 client total. From the inclusive amount, <strong>840 ÷ 1.05 = USD 800 net</strong>.</p><p>In ScopeLedger, changing the tax percentage recalculates an inclusive proposed fee while preserving the net fee. Review all three values before confirming the decision.</p></div><p>Tax applicability varies by transaction and location. Confirm it through your accounting process. Percentage arithmetic does not establish tax compliance.</p>',
      },
      {
        id: 'timing',
        title: 'Agree delivery as well as the fee.',
        content:
          '<p>Hours estimate cost; additional days describe delivery impact. Record the day basis, required inputs and the effect on the existing schedule instead of automatically converting hours into days.</p><p>For an exchange, identify the removed work and eligible cost reduction without counting work twice. For a deferred request, avoid treating a provisional estimate as approved revenue or a delivery commitment.</p><p>Put the chosen scope, fee, tax treatment and timing into a <a href="/guides/change-order-template/">client brief</a>, then record approval before issuing an invoice.</p>',
      },
    ],
  },
  {
    slug: 'project-baseline-checklist',
    title: 'Project Scope Baseline Checklist for Agencies | ScopeLedger',
    heading: 'Build a baseline you can compare the next request against.',
    category: 'Project setup',
    description:
      'Set up a fixed-fee project baseline with agreed deliverables, revision limits, exclusions, dependencies, fees, costs, dates and an approval record.',
    intro:
      'A baseline is the agreed starting point. Keep it specific enough to guide a later decision, with the original agreement and its approval record easy to find.',
    sections: [
      {
        id: 'scope',
        title: 'Record what the client actually agreed.',
        content:
          '<p>Start with the agreement rather than rebuilding it from memory. Record its reference, date and revision. Describe the scope in terms you can compare with a later request.</p><ul><li><strong>Deliverables:</strong> pages, templates, components, collections or other outputs.</li><li><strong>Acceptance criteria:</strong> what makes the agreed work complete.</li><li><strong>Revision rounds:</strong> what a round includes and its agreed limit.</li><li><strong>Exclusions:</strong> features, services and content not included.</li><li><strong>Dependencies:</strong> required inputs, access, decisions and approvals.</li></ul><div class="example"><h3>A baseline with useful boundaries</h3><p>“Design and build a website” leaves a lot open. “Home, services and contact pages; one case-study template; two consolidated review rounds; client-supplied final copy” gives you a starting point for comparison.</p><p>The baseline must still match the agreement. A workspace note cannot silently change what the client approved.</p></div>',
      },
      {
        id: 'financials',
        title: 'Separate fees, costs and unknowns.',
        content:
          '<p>Record the fee, currency and tax basis. Use net revenue consistently when reviewing contribution margin.</p><ul><li><strong>Actual delivery cost:</strong> costs already incurred.</li><li><strong>Remaining forecast cost:</strong> estimated cost to finish the agreed work.</li><li><strong>Loaded hourly cost:</strong> your delivery cost basis for extra hours.</li><li><strong>Target contribution margin:</strong> a planning target, not a promise of net profit.</li></ul><p>Do not count the same cost in actual and remaining amounts. If a forecast is incomplete, keep that uncertainty visible. A tidy margin is unreliable when its inputs are missing.</p><p>The <a href="/guides/price-additional-work/">additional-work pricing guide</a> shows the difference between cost, net fee, tax and the client total.</p>',
      },
      {
        id: 'schedule',
        title: 'Make dates and dependencies visible.',
        content:
          '<p>Record delivery dates and milestones with the conditions on which they depend. Clarify whether additional delivery days mean business or calendar days.</p><p>A request can add work, move a dependency or change the delivery sequence. Describe that effect rather than turning hours into days automatically.</p><ul><li>Which client inputs are outstanding?</li><li>Who reviews or approves each milestone?</li><li>How does a late input affect the schedule?</li><li>Which dates are agreed and which are provisional?</li></ul><p>Use the schedule-change process in the agreement. A revised estimate should not appear as an already-approved date.</p>',
      },
      {
        id: 'approval',
        title: 'Keep approval attached to the right revision.',
        content:
          '<p>Identify who can approve scope and later changes. Keep the approval date and written evidence or reference with the revision it relates to.</p><p>Compare a change with the approved baseline and prepare a new decision. Preserve enough history to explain the original understanding and what changed.</p><div class="note"><p>A signature image is a document asset. It does not by itself establish identity, consent or approval of a particular revision. Record the actual response separately.</p></div><p>An agreed change, an invoice and a payment are different events. A manually recorded payment does not confirm receipt through your bank or accounting system.</p>',
      },
      {
        id: 'checklist',
        title: 'Review the baseline before using it.',
        content:
          '<ul><li>Correct client, project and agreement reference.</li><li>Specific deliverables, revision limits and exclusions.</li><li>Visible dependencies and acceptance criteria.</li><li>Clear fee, currency and tax basis.</li><li>Complete, separate actual and remaining forecast costs.</li><li>Consistent revenue and cost basis for the target margin.</li><li>Agreed dates and a clear day basis.</li><li>An authorized approver and approval evidence.</li></ul><p>Then use the <a href="/guides/handle-scope-creep/">scope-change response process</a> to assess the next request. If a key detail is unresolved, resolve it or label it before committing to a fee.</p>',
      },
      {
        id: 'storage',
        title: 'Keep a recovery copy.',
        content:
          '<p>ScopeLedger keeps project records locally in the browser with a 50 MiB workspace safety limit. Clearing browser data or losing access to the browser can remove local records; browser storage is not a cloud backup.</p><p>Export a recovery copy and protect its password. Backup archives are encrypted, which does not mean the active browser workspace is encrypted as a whole. The planned Agency license covers five independently activated browsers/devices, each with its own workspace. It does not provide shared records or synchronization.</p><p>Read the <a href="/privacy/">privacy overview</a> and <a href="/license/">license information</a> for the current boundaries. The public demo lets you explore the process before purchase availability is enabled.</p>',
      },
    ],
  },
];

const organization = {
  '@type': 'Organization',
  '@id': origin + '/#organization',
  name: 'ScopeLedger',
  url: origin + '/',
  logo: origin + '/brand/scopeledger-mark-256.svg',
};

function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function breadcrumb(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: origin + path,
    })),
  };
}

function head(title, description, path, graph) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="theme-color" content="#f5f5f2"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${origin}${path}"><link rel="icon" type="image/svg+xml" href="/brand/scopeledger-favicon.svg"><link rel="stylesheet" href="/guides/guides.css"><script src="/guides/guides.js"></script>
<meta property="og:type" content="${path === '/guides/' ? 'website' : 'article'}"><meta property="og:site_name" content="ScopeLedger"><meta property="og:locale" content="en_US"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${origin}${path}"><meta property="og:image" content="${origin}/brand/scopeledger-social-v1.png"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="ScopeLedger: scope changes, made clear">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${origin}/brand/scopeledger-social-v1.png"><meta name="twitter:image:alt" content="ScopeLedger: scope changes, made clear">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [organization, ...graph] }).replaceAll('<', '\\u003c')}</script></head>`;
}

function header() {
  return `<body class="sl-guide"><a class="skip-link" href="#main-content">Skip to content</a><header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="ScopeLedger home"><img class="logo-light" src="/brand/scopeledger-logo-light.svg" width="249" height="40" alt="ScopeLedger"><img class="logo-dark" src="/brand/scopeledger-logo-dark.svg" width="249" height="40" alt="ScopeLedger"></a><nav class="header-nav" aria-label="Main navigation"><a class="home-link" href="/">Product</a><a class="guides-link" href="/guides/">Guides</a><a class="button" href="/workspace/">Try the free demo</a></nav></div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container footer-inner"><span>© 2026 ScopeLedger. Clear scope. Considered decisions.</span><nav class="footer-links" aria-label="Footer navigation"><a href="/guides/">Guides</a><a href="/about/">About</a><a href="/privacy/">Privacy</a><a href="/license/">License information</a><a href="mailto:support@scopeledger.site">Contact support</a></nav><label class="appearance" for="appearance">Appearance <select id="appearance" data-appearance><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></footer></body></html>`;
}

function crumbs(title) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li>${title ? '<a href="/guides/">Guides</a>' : '<span aria-current="page">Guides</span>'}</li>${title ? `<li aria-current="page">${escape(title)}</li>` : ''}</ol></nav>`;
}

function availability() {
  return `<p class="small">The public release currently offers a free demo. Checkout, license activation and protected customer PDF exports are not yet enabled. Planned lifetime prices are USD 49 for one activated browser/device and USD 99 for five independent browsers/devices. Team data does not synchronize.</p>`;
}

function guideHtml(guide) {
  const path = `/guides/${guide.slug}/`;
  const data = {
    '@type': 'Article',
    '@id': origin + path + '#article',
    headline: guide.heading,
    description: guide.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': origin + path },
    datePublished: reviewed,
    dateModified: reviewed,
    inLanguage: 'en',
    author: { '@id': organization['@id'] },
    publisher: { '@id': organization['@id'] },
    image: `${origin}/brand/scopeledger-social-v1.png`,
  };
  const related = guides
    .filter((item) => item.slug !== guide.slug)
    .map(
      (item) =>
        `<li><a href="/guides/${item.slug}/">${escape(item.title.split(' | ')[0])}</a></li>`,
    )
    .join('');
  return `${head(guide.title, guide.description, path, [
    data,
    breadcrumb([
      ['Home', '/'],
      ['Guides', '/guides/'],
      [guide.title.split(' | ')[0], path],
    ]),
  ])}${header()}
<main id="main-content" class="container">${crumbs(guide.category)}<article><header class="article-header"><p class="eyebrow">${escape(guide.category)}</p><h1>${escape(guide.heading)}</h1><p class="intro">${escape(guide.intro)}</p><div class="byline"><span>By ScopeLedger</span><span>Published &amp; reviewed <time datetime="${reviewed}">11 October 2026</time></span></div></header>
<div class="article-layout"><div class="article-body">${guide.sections.map(({ id, title, content }) => `<section id="${id}" aria-labelledby="${id}-heading"><h2 id="${id}-heading">${escape(title)}</h2>${content}</section>`).join('\n')}
<section class="article-end" aria-labelledby="try-heading"><h2 id="try-heading">Try the workflow with the sample project.</h2><p>Compare an agreed baseline with a new request, review the costs, choose a response and inspect the client document preview.</p><div class="actions"><a class="button button-primary" href="/workspace/?project=sample-harbor">Open the free workspace demo</a><a class="button" href="/about/">How ScopeLedger works</a></div>${availability()}</section>
<section class="article-end" aria-labelledby="related-heading"><h2 id="related-heading">Related guides</h2><ul>${related}</ul></section></div><aside class="toc" aria-label="On this page"><p>On this page</p><ol>${guide.sections.map(({ id, title }) => `<li><a href="#${id}">${escape(title)}</a></li>`).join('')}</ol></aside></div></article></main>${footer()}`;
}

function hubHtml() {
  const title = 'Scope Change Guides & Agency Templates | ScopeLedger';
  const description =
    'Practical guides for fixed-fee agencies: build a project baseline, handle scope creep, price additional work and prepare a clear change order.';
  const graph = {
    '@type': 'CollectionPage',
    '@id': `${origin}/guides/#collection`,
    url: `${origin}/guides/`,
    name: title,
    description,
    inLanguage: 'en',
    publisher: { '@id': organization['@id'] },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: guides.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${origin}/guides/${guide.slug}/`,
        name: guide.title.split(' | ')[0],
      })),
    },
  };
  return `${head(title, description, '/guides/', [
    graph,
    breadcrumb([
      ['Home', '/'],
      ['Guides', '/guides/'],
    ]),
  ])}${header()}<main id="main-content" class="container">${crumbs()}<header class="hub-intro"><p class="eyebrow">Practical guides</p><h1>A clearer process for the next “can you just…”</h1><p class="intro">Useful starting points for fixed-fee agencies, freelancers and design studios. Build the baseline, understand the change and give your client a specific next step.</p></header><div class="hub-grid">${guides.map((guide) => `<a class="guide-card" href="/guides/${guide.slug}/"><span class="guide-category">${escape(guide.category)}</span><h2>${escape(guide.title.split(' | ')[0])}</h2><p>${escape(guide.description)}</p><span class="card-link">Read the guide →</span></a>`).join('')}</div><section class="hub-availability" aria-labelledby="hub-demo"><h2 id="hub-demo">Explore the process in the free workspace.</h2><p>ScopeLedger puts the agreed scope, the change, your costs and the proposed fee into one guided workflow. These guides explain the decisions behind that process.</p><div class="actions"><a class="button button-primary" href="/workspace/">Try the free demo</a><a class="button" href="/about/">About ScopeLedger</a></div>${availability()}</section></main>${footer()}`;
}

async function generate() {
  for (const guide of guides) {
    await mkdir(resolve(root, `public/guides/${guide.slug}`), { recursive: true });
    await writeFile(
      resolve(root, `public/guides/${guide.slug}/index.html`),
      guideHtml(guide) + '\n',
    );
  }
  await writeFile(resolve(root, 'public/guides/index.html'), hubHtml() + '\n');
  await mkdir(resolve(root, 'public/guides/fonts'), { recursive: true });
  for (const [family, weights] of [
    ['dm-sans', [400, 600]],
    ['space-grotesk', [500, 600]],
  ]) {
    for (const weight of weights) {
      const name = `${family}-latin-${weight}-normal.woff2`;
      await copyFile(
        resolve(root, `node_modules/@fontsource/${family}/files/${name}`),
        resolve(root, `public/guides/fonts/${name}`),
      );
    }
    await copyFile(
      resolve(root, `shared/${family}-LICENSE.txt`),
      resolve(root, `public/guides/fonts/${family}-LICENSE.txt`),
    );
  }
  console.log(`Generated ${guides.length} ScopeLedger guides and their index.`);
}

await generate();
