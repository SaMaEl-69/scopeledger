# ScopeLedger owner guide

The application is usable locally. Checkout remains disabled until real seller, product and production setup is verified. Local test keys are for owner testing and do not represent purchases. Lifetime support is `olim855597@gmail.com`; no response-time guarantee is promised.

## Open the application

Use Node 24 LTS and an installed supported Chrome/Chromium. In the ScopeLedger folder, run:

```sh
npm ci
npm run dev
```

Open [Home](http://127.0.0.1:5173/home/) or [the workspace](http://127.0.0.1:5173/workspace/). `/` opens Home, and old `/app` links redirect into `/workspace/` with their query strings. At the same browser origin, that path change retains existing projects and activation cookies. The Harbor sample shows the starting flow: review the approved baseline, estimate a request, review its pricing, save the decision, record actual approval, then include the agreed change once. Create your own project from Projects. The demo permits the sample plus one custom project; archived and trashed projects still use that allowance.

Home and workspace share the `sl-theme` dark/light preference. The workspace Home link waits for saving, preserves saved document drafts and requires a current-edit backup after failed/conflicting writes. Home's Get lifetime access chooser offers Individual USD 49/one device or Agency USD 99/five devices, both with identical paid features. Until actual purchase setup is verified, it provides the demo/existing-license activation route. Selecting a plan does not activate a license. Public sample briefs/invoices are synthetic and request no payment.

In Change workspace, open Project planning to change the project's Active, On hold or Completed state and delivery deadline. Its collapsed summary keeps the current state and any deadline visible. Recent projects in the sidebar follow actual update time. Projects and Clients provide clear-search actions when a filter hides every matching record; an empty filtered Dashboard offers Reset filters.

Compare responses keeps private alternatives separate from the active change. Save an alternative deliberately before closing. Reviewing another saved alternative asks whether to Keep editing or Replace comparison when the current comparison has unfinished edits. Replacing those comparison entries leaves the active change, approvals and documents intact.

For the optimized site, run `npm run build` and `npm start`, then open [built Home](http://127.0.0.1:4173/home/) or [the built workspace](http://127.0.0.1:4173/workspace/). Both pages and `/api` share the same origin/server. Different origins and browsers have separate data. Export and restore a backup when moving work deliberately.

## Test the paid workflow safely

Run `npm run keys:local` once and `npm run dev:local`. Open [the clearly labeled local testing workspace](http://127.0.0.1:5180/workspace/). Read the generated test key in `.local-private/test-keys.json` on your computer and enter it in View activation options. The Individual key has one slot; Agency has five. Tests exercise actual allocation and PDF rendering. Never publish this private folder or use test keys in production. The generator refuses to overwrite existing files.

## Protect and recover projects

1. In Settings & backup, choose Export backup. Keep copies outside the browser, ideally on another protected drive. A backup includes projects, approvals, revisions, issued documents, payments, reminders, playbook and branding. It excludes license keys and activation cookies.
2. Backups are unencrypted. Protect them like client records. Keep a copy before browser cleanup, moving devices or updating the application. The maximum backup is 10 MiB.
3. To restore, use Restore backup in Settings & backup, inspect the replacement summary, then confirm replacement. The recovery screen uses Choose backup. Restore preserves record identities and replaces the workspace deliberately. Restoring more than the demo allowance requires active server authorization.
4. If the app says Not saved, keep it open and choose Export current edits before closing. Reload saved version stays disabled until a backup of the current workspace starts downloading. Keep that file before reloading; any newer workspace change requires another export. These recovery exports do not update the ordinary last-backup timestamp. Retry after resolving storage capacity or permissions. A conflicting tab must export its own edits before reloading; neither tab silently overwrites the other.
5. For corrupt or unsupported data, retain the raw recovery download and previous saved copy. Do not clear storage or substitute the sample. The technical migration/recovery notes are in [the checkpoint](../SCOPELEDGER-CHECKPOINT.md) and [data audit](PART3-DATA-AUDIT.md).

Core project/change edits save automatically. Closing an edited dialog asks before discarding it. Reload clears unsubmitted dialog, composer and comparison entries; workspace backups exclude those unfinished entries, so save or copy them deliberately before reloading. Unissued document form settings save with the workspace, survive reloads and are included in backups. Each project/change/revision/document type has its own draft. Wait for “Saved on this device” before closing. Confirm a document snapshot to preserve its exact issued content in history. Issued documents stay frozen when client, branding or project settings change. Restoring a workspace deliberately replaces drafts with the ones in that backup. Backups from before durable drafts were introduced contain no document drafts.

## Understand the calendar and cash records

Reminders live locally. The app does not send emails, notify while closed or synchronize calendars. Exporting an ICS file creates a calendar file; importing it elsewhere does not establish a live connection. Dates without times remain calendar dates; timed events use the selected timezone. Completing a reminder does not approve a quote or record payment.

Choose Workspace timezone in Settings & backup to control calendar display, today's date and overdue evaluation. The picker accepts valid named timezones and saves automatically. Changing it leaves date-only records unchanged and preserves each existing timed reminder's stored instant and its own timezone. Imported supported ISO timestamps remain preserved when displayed.

The overdue and unscheduled calendar queues show the actual total and how many records are visible. Use Show more to reveal the next eight or Show all to inspect the complete queue. Each revealed record keeps its reminder details, source project/change navigation and scheduling actions. Filter changes return these queues to their initial eight-row view.

In Documents, choose a Document type or use Prepare invoice. Brief and invoice drafts retain their separate edits while navigating; drafts are included in local saves and backups. Complete the linked readiness items, including approval for the current revision, before Review and issue invoice. Use Document history to reach preserved documents, filter them and review Payment history. The PDF states the issued total; the app separately shows recorded receipts and outstanding balance. Changing defaults never rewrites an issued snapshot.

Record payments only after money is actually received. These are manual records, not a bank feed or payment processor. Imported future-dated approvals or payments remain in history, but require clock/date review before they can authorize new commercial work or appear as reliable cash. Correct an erroneous payment through its documented void action with a reason. Do not rewrite issued invoice history to match new settings.

## Handle support and lost activations

Use Lifetime support in the app to prepare an email or copy `olim855597@gmail.com`. The app never sends an email or attaches backups or keys automatically. Ask customers to describe the action, visible error, browser, app version and approximate time. Never ask them to post a key or confidential client data in a public issue. Share a redacted backup only when needed and through an agreed private channel.

A customer can release the current browser's activation without removing projects. Lost browsers/cookies may leave an allocated slot. Verify purchase ownership independently before using the [targeted owner recovery command](SERVER-CONFIGURATION.md#current-release-and-lost-device-recovery). A shared key does not authorize releasing somebody else's device. Provider outages do not justify deleting projects or assuming a refund.

## Configure sales and publish updates

Give the deployer [site deployment](SITE-DEPLOYMENT.md), [server configuration](SERVER-CONFIGURATION.md) and [server operations](SERVER-OPERATIONS.md). They explain the intended `https://scopeledger.site` origin, both pages, Gumroad seller/product matching, license-key issuance, persistent storage, HTTPS, the retained server secret, browser sandbox requirements and owner launch flags. The public demo is now live on Cloudflare at `https://scopeledger.site`; see [current deployment](CLOUDFLARE-DEPLOYMENT.md). No live seller account, product IDs, purchase URLs or persistent production commercial backend have been supplied or verified here. Do not enable checkout merely because local tests pass. The homepage is an authorized copy of the supplied Downloads HTML, which remains preserved as the reference; review the supplied marketing/policy claims listed in site deployment before publication. Fresh integration evidence is in [site verification](SITE-VERIFICATION.md).

Before publishing an update:

1. Export project backups; back up the production license database and retained server secret with the documented consistent procedure.
2. In a separate staging environment, install the lockfile dependencies, build, run the tests and test migration/backup restoration with copies.
3. Check the actual host's commercial eligibility, disk persistence, Chromium sandbox, memory, request limits and HTTPS. Check purchase-to-activation-to-PDF-to-release and refund/dispute behavior only with owner authorization and provider-supported procedures.
4. Publish Home, `/workspace/`, shared assets, sample files and `/api` together on the same origin through one integrated server process. Keep legacy `/app` redirects and the original reference file. Switch releases atomically and retain older hashed assets while existing tabs may still request them. The local build retains those assets with `emptyOutDir: false`; production still needs a separate complete release and deliberate asset retention. Retain the previous release for rollback. Check both pages, activation, saving, PDF and error logs after the update.

If upgrading an earlier live installation to the new host-prefixed cookies, follow [the cookie upgrade procedure](SERVER-OPERATIONS.md#earlier-live-cookie-upgrade) before deployment. Release the current activation first; retain the database, secret, configured identity and customer project data. An already stranded slot requires verified targeted recovery, not clearing site data.

Schema 3 migrates native schema 2 and recognized legacy schema 1 while preserving history; the IndexedDB structure remains version 1. A future unsupported schema must open recovery rather than silently downgrade. Rollback needs a backup compatible with the older application; do not improvise a schema downgrade.

## Monitor cost and protect secrets

Use the sanitized server events and resource checks in [server operations](SERVER-OPERATIONS.md). Monitor failures, renderer duration, quota responses, memory/disk use and database backup age. Do not log request bodies, keys, cookies, client documents or private project finances. Keep `.local-private`, environment files, the license database and server secrets out of source control and public static files. Do not put secrets into variables beginning `VITE_`.

Lifetime sales still have recurring hosting, database backup, browser rendering and support costs. Text composition and local project calculations make no recurring AI calls. PDF service has documented quotas and resource limits; do not reduce promised features or change limits silently. Review actual customer usage and host bills, and make pricing/service decisions explicitly. Bangladesh seller and payout eligibility must be confirmed through the owner's actual Gumroad account. Privacy/retention and license terms remain owner decisions before launch.
