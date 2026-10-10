# ScopeLedger application

A connected homepage and local-first commercial workspace for fixed-fee web agencies. The homepage at `/home/` adapts the supplied `/Users/samaelsmacbook/Downloads/index (1).html`; that original file remains preserved as the reference. The operational application is at `/workspace/`, with scope decisions, dashboard, calendar, agency toolkit, preserved client documents, manual invoice payments and protected licensing/PDF services. `/` opens Home; legacy `/app` links redirect to the canonical workspace and retain query strings.

## Run locally

Use Node.js 24 or newer; verification used Node.js 26 and installed macOS Google Chrome. Node 22.16+ in the 22 line is also supported. Use Node 24 LTS for deployment.

```sh
npm ci
npm run dev
```

Open [Home](http://127.0.0.1:5173/home/) or [the demo workspace](http://127.0.0.1:5173/workspace/). Development listens on loopback. For the optimized build, run `npm run build`, then `npm start`; open `http://127.0.0.1:4173/home/` or `/workspace/` on that origin. `PORT` changes that port. Home, workspace, assets and `/api` share one server/origin. Moving from `/app` to `/workspace/` on the same origin retains existing IndexedDB records and activation cookies. Different origins/browsers have independent data; transfer it deliberately through backup/restore.

Both pages share the `sl-theme` dark/light preference. The workspace Home link drains saves and preserves saved document drafts; failed/conflicting edits require a current backup before leaving. Get lifetime access opens the Individual USD 49/one-device and Agency USD 99/five-device chooser. A plan choice opens configured live checkout or existing-license activation; it does not activate a license itself. See [site deployment](docs/SITE-DEPLOYMENT.md) for the intended `scopeledger.site` setup and launch requirements, and [site verification](docs/SITE-VERIFICATION.md) for fresh integration evidence. The public demo is live at [scopeledger.site/home/](https://scopeledger.site/home/) and [scopeledger.site/workspace/](https://scopeledger.site/workspace/) on Cloudflare. Commercial services remain a separate paid-launch gate.

## Safe owner testing

For Cloudflare Workers hosting, see [Cloudflare deployment](docs/CLOUDFLARE-DEPLOYMENT.md). `npm run cloudflare:deploy` builds and publishes the current public demo. The existing Node/SQLite paid backend requires separate persistent hosting or a verified migration before commercial activation and customer PDF exports can be enabled.

The default server is demo mode. Purchases, real activation and protected customer-document PDF exports remain unavailable without configuration. Home's public sample PDFs are synthetic design-review documents and request no payment. To test actual one/five-device allocation and HTML-to-PDF locally:

```sh
npm run keys:local
npm run dev:local
```

The generator creates private files in ignored `.local-private/` without printing keys. Open [the labeled local-test workspace](http://127.0.0.1:5180/workspace/), then use the corresponding generated key from `.local-private/test-keys.json`. This origin has its own workspace. Local test mode requires explicit server configuration and loopback development; it cannot be enabled by a browser setting or in production. A test key does not represent a purchase.

Read [server configuration](docs/SERVER-CONFIGURATION.md) and [server operations](docs/SERVER-OPERATIONS.md) before setting up live Gumroad verification, HTTPS hosting, device recovery or database backups. The operations guide covers monitoring, updates, recurring costs, external commercial gates and the earlier live-cookie upgrade procedure. Real seller onboarding and paid launch remain outstanding.

## Included workflows

- One shared decimal engine, saved revisions, dated approval evidence and exact-once reconciliation.
- Choose an excluding-tax, including-tax or custom fee with an explicit tax percentage. Inclusive amounts retain the entered client total; delivery margins and baseline revenue use the fee before tax.
- Additional calendar days appear in project planning, briefs and invoices. Including an approved change adds its delivery days once to the project schedule; payment due dates remain independent.
- Dashboard attention queues, drill-downs, explicit filters, currency-grouped weighted contribution margins, tax and manually recorded cash separated.
- Month/week/agenda calendar, connected source deadlines, editable reminders, completion/cancellation/recovery, timezone validation and genuine `.ics` export.
- Reusable clients, agency identity/logo/defaults, custom scenarios, assumptions, editable message templates, search, archive and explicit project duplication.
- Client-response composer, saved alternative comparisons that preserve the active draft, and differences between preserved revisions.
- A visible Prepare invoice entry, counted document history, full-size brief/invoice/credit previews, linked readiness checks, immutable issued snapshots, manual payments/void history, and protected actual PDF downloads when activated. Proposed negative fees include a credit explanation; issued invoices/credits require dated approval and consistent tax/totals.
- Document options can hide logos, contact details, supporting scope sections, delivery timing, custom footers and signatures without deleting saved agreement content. Customer PDFs carry the agency's identity without a ScopeLedger credit; public samples retain demonstration branding and demo previews retain their watermark.
- Atomic IndexedDB saving, cross-tab conflict protection, recovery records, migrations and password-protected backups and an explicit plain JSON option.
- Optional view/dialog failures retain the application shell, navigation and core draft. Recovery offers workspace export and deliberate reload, explains temporary-form limits, and never automatically reloads or pretends a rejected lazy download can retry.
- In-app activation, current-device release, honest failure/retry guidance, and Lifetime support at `olim855597@gmail.com`.

Current fee, delivery and document checks are recorded in [the October 9 verification report](docs/FEE-DELIVERY-DOCUMENT-VERIFICATION.md).

## Commercial and data contract

Individual is USD 49 lifetime with one activated browser/device. Agency is USD 99 lifetime with five. Both have identical paid features. Devices keep independent local workspaces; there are no customer accounts or cloud synchronization. The demo permits the sample plus one custom project, including archived/trashed custom records. Additional project creation and PDF export require server activation. A backup cannot grant access.

Workspace schema is version 3; the IndexedDB structure remains version 1. Native schema-2 and known legacy version-1 sources migrate while preserving identities and history. Undated legacy approvals require dated reconfirmation before new invoicing/reconciliation. Existing local work is not erased because licensing is unavailable.

The shared decimal engine uses 1,024 significant digits, including safeguards for cancellation and upward cent rounding. Executable scalar inputs must be zero or nonnegative values from 10⁻¹⁰⁰ through 10²⁴, within the 120-character numeric syntax limit. Entries outside these bounds remain unchanged as drafts in saves, backups and restores; validation does not coerce them to zero. Reconciliation separately validates its editable cost split and resulting baseline. When older work has no saved agency timezone, operational and commercial dates consistently use the browser timezone. Accepted imported ISO instants retain their recorded text and precision.

Backups include branding, documents, payments, calendar, playbook, comparisons and activity. The validated workspace UTF-8 safety limit is 50 MiB. Backups are encrypted by default, with a deliberately acknowledged plain JSON option. Repeated logos and signatures are stored once in compact backup files; restores preserve exact document snapshots. Encrypted transport can be up to 67 MiB because base64 adds overhead. Clearing browser storage removes local work; keep backups outside the browser. Approval/payment history is manual local data, not a tamper-proof audit or payment processor. PDF requests transfer only a deliberate client-facing schema; private hours, costs, margins, notes and comparisons are excluded.

Live activation uses host-prefixed secure cookies, durable transaction-enforced slots and stable resource quotas. A provider timeout, malformed reply or identity mismatch leaves protected actions closed without permanently revoking stored entitlements. Only confirmed matching adverse purchase information records revocation. The renderer runs with its sandbox enabled, escaped text, scripts/external resources blocked and server secrets excluded from its environment. Production requires a compatible non-root browser runtime, retained secret/database, HTTPS and actual host verification. Export allowances and concurrency limits are documented in server configuration; review promised usage and recurring service costs before paid launch.

The local build uses `emptyOutDir: false` to retain older hashed assets for open tabs. Production updates still require a separately built complete release, atomic publication and deliberate retention of old assets at their existing public URLs. Building into the served directory or removing those assets can strand a tab's later view download. See the deployment/update procedure in server operations. Recovery backups preserve workspace records/current core edits; temporary unissued document forms and unfinished composer/comparison entries are excluded and reload clears them.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
```

After building, run `npm run test:local-browser` for actual protected activation/PDF journeys. It starts a separate temporary loopback backend and SQLite database for each engine, generates ephemeral test keys, and cleans up without using the owner's private testing files. Production mode is rejected. Part 3 responsive/accessibility checks use `npm run test:audit`; complete workflows across available installed browser engines use `npm run test:cross-browser`. `npm run test:performance` records local performance observations; `npm run test:crowded` checks large synthetic Dashboard/Calendar/Projects/Documents views and balances. Browser suites use isolated contexts; run their processes sequentially and keep performance measurements separate from other browser/render workloads. Override `PLAYWRIGHT_CHROME_PATH` for a different installed Chrome/Chromium path where supported. See verification results for actual completed checks and unavailable devices/engines.

Protected document QA uses:

```sh
npm run test:pdf
python3 scripts/inspect-pdfs.py
```

This generates five synthetic fixtures through the actual independently authorized endpoint with an isolated temporary development license/database: an everyday change brief and invoice, a long negative-fee brief, a long-identity invoice with logo/tax/large totals, and an explicit credit. Use `SCOPELEDGER_CHROME_PATH` for the PDF runtime if discovery fails. Inspection needs `pdfplumber`, `pypdf` and Poppler, falling back to `pypdfium2` and Pillow. Inspect every final raster page as well as the automated checks. Fresh files/reports live in `output/pdf/`; [site verification](docs/SITE-VERIFICATION.md) owns the current integration results. The prior 5 October document-refinement [QA report](output/pdf-before-multipage/QA-REPORT.json) records 1/1/5/2/1 pages and all ten visually inspected pages, with its [historical performance report](output/pdf-before-multipage/PERFORMANCE-REPORT.json) retained separately. That run checked actual tags/language/bookmarks, intact short paragraphs, flowable long content and unbroken large totals. Assistive-reader reading order and PDF/UA conformance remain unverified. These local checks use no live purchases or user's browser records and do not establish production capacity.

See [the owner guide](docs/OWNER-OPERATIONS.md), [the checkpoint](SCOPELEDGER-CHECKPOINT.md), [feature inventory](docs/FEATURE-INVENTORY.md), [prior Part 3 verification](docs/VERIFICATION.md), [site deployment](docs/SITE-DEPLOYMENT.md), [site verification](docs/SITE-VERIFICATION.md), [expanded audit prompt](docs/AUDIT-PROMPT.md), [feature choices](docs/FEATURE-CHOICES.md) and [premium-app proposal](docs/PREMIUM-APP-PROPOSAL.md).

# Production preparation

The 8 October prelaunch implementation is described in [Part 1](docs/PRELAUNCH-REPAIR-PART1.md) and [Part 2](docs/PRELAUNCH-REPAIR-PART2.md). Use the [production runbook](docs/PRODUCTION-RUNBOOK.md) for versioned rollout, health checks, monitoring and paired database/secret recovery. Persistent commercial backend hosting, seller onboarding, approved policies and human/device acceptance remain paid-launch gates.

## Public SEO and search discovery

The public site includes a guide hub, four practical guides, and about/privacy/license information. Its canonical URLs are governed by the explicit public document manifest. Workspace/API/demo-document indexing exclusions are independent of access authorization.

Run `npm run test:seo` before publishing (also part of the build), and `npm run test:seo:live` after deployment. After a meaningful public content update has been deployed, `npm run seo:indexnow` notifies participating search engines; Google discovery is managed through the sitemap and verified Search Console property. Avoid repeated submissions of unchanged pages.

See [the SEO implementation and handover report](docs/seo-launch-report.md) for actual Google indexing evidence, verification limits, current demo availability and ongoing work. Search-engine processing and rankings are not guaranteed by a successful build or submission.
