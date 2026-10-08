import type { Scenario } from '../domain/types';

/** Templates intentionally contain no assumed prices, hours, penalties or dates. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'cms-collection',
    title: 'Add a CMS collection during the build',
    description: 'A new structured content type appears after the original CMS model was approved.',
    request:
      'The client would like a new CMS collection for [content type], with a listing view and individual item template. Review the approved CMS model to identify the additional collection, fields, relationships and views.',
    deliverables:
      'Define the agreed collection fields and relationships; build the agreed listing and item template; connect supplied content; test the agreed publishing workflow.',
    exclusions:
      'Additional content types, unlisted filter or search behaviors, original copywriting, bulk population beyond the agreed content set, and third-party data synchronization.',
    dependencies:
      'Client approval of the field model, representative content, access permissions, and confirmation that the platform plan supports the proposed collection and item volume.',
    assumptions:
      'The existing approved design system can support the new templates. The platform capability and content volume must be checked before committing.',
    contractChecks:
      'Compare the agreed collection and template counts with the request. Check whether the contract already covers flexible collection configuration or future content types.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm the fields, relationships, content volume, template count and publishing behavior. Estimate only the additional delivery effort after checking existing scope.',
  },
  {
    id: 'late-assets',
    title: 'Review late client content or assets',
    description:
      'Delayed inputs may change delivery sequencing, but do not establish an automatic charge.',
    request:
      'Client content or assets for [area] have arrived later than the agreed dependency point. Review the delivery impact and any requested rework or resequencing before agreeing a revised plan.',
    deliverables:
      'Identify affected tasks, assess whether work can continue elsewhere, and document an agreed content handoff and revised delivery sequence. Describe any separately approved rework.',
    exclusions:
      'Automatic delay fees, assumed overtime, guaranteed retention of the original launch date, and content creation unless expressly included.',
    dependencies:
      'A complete, usable content package, required approvals, clear ownership of missing inputs, and confirmation of the client’s preferred revised sequence.',
    assumptions:
      'Unblocked approved work may continue where practical. A timeline change depends on current capacity and remaining dependencies.',
    contractChecks:
      'Review client-supplied content obligations, delay and rescheduling provisions, notification requirements and any agreed remedy. Separate an input delay from a new request.',
    classification: 'Ambiguous',
    route: 'Defer',
    confirm:
      'Confirm what was due, what arrived, the affected work and the actual additional cost. Do not treat lateness alone as proof that a fee is chargeable.',
  },
  {
    id: 'design-reversal',
    title: 'Revisit an approved design direction',
    description: 'A client asks to change a direction after a recorded approval.',
    request:
      'The client would like to replace the approved direction for [area] with [new direction]. Identify which approved design and build work must change and which elements can be retained.',
    deliverables:
      'Define the replacement direction, revise the agreed screens or components, and apply the approved revision to the specifically listed built pages.',
    exclusions:
      'A complete brand redesign, revisions to unlisted pages, new functionality, and unlimited exploratory directions.',
    dependencies:
      'One consolidated client brief, an authorized approver, access to the prior approval record, and timely selection of a replacement direction.',
    assumptions:
      'The proposed direction remains within the platform’s capabilities. Reusable work and eligible future work removed from scope will be identified separately.',
    contractChecks:
      'Check the prior approval, included revision rounds, change provisions and whether the original delivery departed from the approved direction.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm the approval evidence, affected screens and components, remaining revision entitlement and additional effort. If delivery failed to match approval, reassess the classification.',
  },
  {
    id: 'third-party-integration',
    title: 'Add a webhook or third-party integration',
    description: 'A new connection adds implementation, testing and third-party dependencies.',
    request:
      'Connect [source action] to [third-party destination] using the agreed API or webhook. Define the data fields, trigger, expected outcome and behavior when the destination is unavailable.',
    deliverables:
      'Implement the agreed data mapping and trigger; configure permitted credentials; test agreed success and failure cases; provide concise handover notes.',
    exclusions:
      'Unlisted systems, custom backend hosting, indefinite monitoring, vendor subscription charges, historical data synchronization and guarantees about vendor uptime.',
    dependencies:
      'Client-owned vendor account, approved credentials or delegated access, API documentation, test data and any required data-handling approval.',
    assumptions:
      'The vendor supports the required capability and access tier. Rate limits, authentication, failure recovery and ongoing ownership require confirmation.',
    contractChecks:
      'Check the approved integration list and any contract allowances for setup, backend work, security review, maintenance or third-party fees.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm the actual vendor capability, failure behavior and maintenance owner before estimating. Keep external fees and delivery effort explicit.',
  },
  {
    id: 'additional-pages',
    title: 'Add pages or reusable templates',
    description: 'Separate additional page population from a new template design.',
    request:
      'The client requests [pages or templates] beyond the agreed page list. Identify which pages reuse an approved template and which require a new layout or behavior.',
    deliverables:
      'Build the specifically listed pages or templates, place supplied content, connect agreed navigation and perform the agreed responsive checks.',
    exclusions:
      'Unlisted pages, original content creation, additional custom interactions and new CMS structures unless expressly added.',
    dependencies:
      'An approved page list, final copy and assets, page-level approvals and confirmation of navigation and platform limits.',
    assumptions:
      'Existing styles and components are reusable where the agreed page design permits. A new template may require separate design review.',
    contractChecks:
      'Compare page and template allowances, content population obligations and any agreed substitutions. Check whether the requested pages were already named in the approved sitemap.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm counts and complexity individually. For a scope exchange, name the removed future deliverable and estimate only its eligible unspent cost.',
  },
  {
    id: 'extra-revisions',
    title: 'Request another revision round',
    description: 'An extra feedback cycle needs a defined boundary and an entitlement check.',
    request:
      'The client requests a further revision round for [area]. Review feedback against the approved brief and the revision rounds already delivered, then agree one consolidated set of changes.',
    deliverables:
      'Review the agreed feedback list, implement the specifically approved revisions and present the revised work for one defined review.',
    exclusions:
      'Unlimited feedback cycles, new functionality, new design directions and correction of unrelated issues.',
    dependencies:
      'A consolidated feedback list from the authorized approver, prior review records and clarification of conflicting stakeholder requests.',
    assumptions:
      'The requested changes can be described before work begins. Corrections to an agency error will be separated from discretionary revisions.',
    contractChecks:
      'Check the number and meaning of included rounds, whether the current round is still open and whether the feedback corrects a deviation from the brief.',
    classification: 'Ambiguous',
    route: 'Defer',
    confirm:
      'Confirm remaining revision entitlement and classify the actual feedback before selecting a fee. A round count alone does not make correction work billable.',
  },
  {
    id: 'ecommerce-expansion',
    title: 'Expand the ecommerce scope',
    description:
      'New checkout or catalogue behavior can introduce platform and operational constraints.',
    request:
      'Add [ecommerce capability] to the approved store. Describe the required customer journey, affected product types, store settings and acceptance conditions.',
    deliverables:
      'Configure or build the agreed capability, update the specified store views and test the agreed purchase flows in a suitable test environment.',
    exclusions:
      'Unlisted checkout customizations, tax or legal advice, product data entry beyond the agreed set, vendor fees and ongoing fulfilment operations.',
    dependencies:
      'Client-approved business rules, required store access, product data, supported vendor accounts and approval of shipping, payment and tax settings by their responsible owner.',
    assumptions:
      'The chosen platform and plan support the requested capability. Payment-provider and fulfilment dependencies are verified before commitment.',
    contractChecks:
      'Compare the request with approved store functions, integration allowances, catalogue volume and testing obligations.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm platform support, testable acceptance conditions, operational ownership and third-party costs. Avoid promising changes to a hosted checkout that the platform does not permit.',
  },
  {
    id: 'localization',
    title: 'Add another language or locale',
    description: 'Localization affects content, templates, navigation and platform configuration.',
    request:
      'Introduce [language or locale] for the agreed pages and content types. Define which content is localized, how visitors select a locale and who owns translations.',
    deliverables:
      'Configure the agreed locale, apply supplied translations to the listed content, adapt agreed navigation and test the specified localized views.',
    exclusions:
      'Professional translation, unlisted locales, legal review, ongoing translation updates and locale-specific commerce behavior unless expressly included.',
    dependencies:
      'Approved translations, locale-specific assets, translation owner, platform localization access and client review by a qualified language reviewer.',
    assumptions:
      'Translation length and writing direction may require layout adjustments. Platform subscriptions and locale limits need verification.',
    contractChecks:
      'Check the included languages, translated content obligations, localization platform fees and review responsibilities.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm locale count, translated content volume, writing direction, review ownership and SEO requirements before agreeing scope.',
  },
  {
    id: 'content-migration',
    title: 'Migrate an additional content set',
    description: 'Volume, source quality and mapping determine the migration effort.',
    request:
      'Migrate [additional content set] from [source] into the approved destination structure. Confirm the record count, required fields, media handling and exceptions.',
    deliverables:
      'Map agreed source fields, migrate the defined content set, identify exceptions and verify the agreed sample or complete set according to the acceptance plan.',
    exclusions:
      'Rewriting or correcting source content, unlisted records, inaccessible source systems, undocumented redirects and repeated migrations after content changes.',
    dependencies:
      'Usable source export or access, approved field mapping, media permissions, a content freeze decision and a client owner for exceptions.',
    assumptions:
      'Source quality and volume will be inspected before estimating. Unsupported data or missing assets require an agreed exception process.',
    contractChecks:
      'Compare the approved migration volume, source formats, content cleanup allowance, redirect requirements and number of migration runs.',
    classification: 'Addition',
    route: 'Quote',
    confirm:
      'Confirm volume and a representative source sample. Define reconciliation and exception handling without assuming all source records are importable.',
  },
  {
    id: 'accelerated-launch',
    title: 'Assess an accelerated launch',
    description: 'A shorter schedule is a feasibility decision before it is a commercial decision.',
    request:
      'The client requests an earlier launch for [reason]. Assess the remaining approved scope, dependencies and available capacity; present a feasible delivery option for review.',
    deliverables:
      'Review critical dependencies and capacity, identify an agreed launch scope and record the proposed sequence, acceptance checks and any separately deferred deliverables.',
    exclusions:
      'An automatic rush fee, an unverified launch guarantee, assumed overtime and removal of essential acceptance checks without explicit agreement.',
    dependencies:
      'Prompt client approvals, complete launch content, required domain and vendor access, and availability of the responsible delivery and client teams.',
    assumptions:
      'An earlier date may require an explicit scope exchange or later delivery of named items. Feasibility must be confirmed before a commitment.',
    contractChecks:
      'Review the original milestones, launch obligations, change process, client dependencies and any applicable acceleration terms.',
    classification: 'Ambiguous',
    route: 'Defer',
    confirm:
      'Confirm feasibility, actual additional costs, removed future scope and acceptance responsibilities. Enter dates only after an agreed plan exists.',
  },
  {
    id: 'accessibility-testing',
    title: 'Expand accessibility or testing requirements',
    description: 'Additional testing needs an explicit standard, coverage and acceptance scope.',
    request:
      'The client requests expanded accessibility or testing for [coverage]. Define the applicable agreed criteria, pages, states, browsers or assistive technologies and reporting expectations.',
    deliverables:
      'Perform the defined audit or tests, report findings and remediate the specifically agreed issues within agency-controlled parts of the site.',
    exclusions:
      'Certification, blanket compliance guarantees, unlisted environments, third-party remediation and indefinite future monitoring.',
    dependencies:
      'Client confirmation of required criteria, representative content and user flows, access to test environments and ownership of third-party findings.',
    assumptions:
      'Findings may reveal separate remediation work. Agreed accessibility obligations already in the baseline remain included and must be honored.',
    contractChecks:
      'Compare the requested criteria and coverage with the original acceptance requirements. Determine whether a finding is an existing delivery defect or an expanded requirement.',
    classification: 'Ambiguous',
    route: 'Defer',
    confirm:
      'Confirm the standard and version, coverage, evidence required and original obligations. Classify each remediation item before proposing a charge.',
  },
  {
    id: 'post-launch-defect',
    title: 'Review a post-launch defect or warranty issue',
    description: 'Investigate the reported issue and warranty obligations before discussing a fee.',
    request:
      'The client reports [observed problem] after launch. Record reproduction steps, expected behavior, affected environments and the first known occurrence, then assess the cause.',
    deliverables:
      'Investigate the reported issue, document the findings and, where covered, correct agency delivery defects and verify the affected agreed behavior.',
    exclusions:
      'New functionality, unrelated enhancements, third-party outages, client-made changes and ongoing maintenance unless the agreement covers them.',
    dependencies:
      'Reproduction details, appropriate site access, relevant change history and confirmation of the expected behavior in the approved requirements.',
    assumptions:
      'Cause and responsibility remain provisional until investigated. A warranty expiry alone does not establish that a charge is contractually permitted.',
    contractChecks:
      'Review acceptance criteria, warranty scope and period, reporting requirements, maintenance terms and the history of changes after handover.',
    classification: 'Defect',
    route: 'Absorb',
    confirm:
      'Confirm the cause, contractual remedy and whether this is a defect or a new requirement. Absorption retains the delivery cost; use Quote only after the basis for a charge is established.',
  },
];
