# ScopeLedger connected site

Prepared 6 October 2026 for `scopeledger.site`. Hosting is not set up yet; these routes and files are implemented and verified locally. This document does not record a live deployment.

## Pages and navigation

- `https://scopeledger.site/home/`: the supplied landing page, with its descriptions retained and the requested price changed from $149 to $49.79.
- `https://scopeledger.site/workspace/`: the current operational application, with a shared dark/light preference, charcoal surfaces, mint accents and guarded Home navigation.
- `/` redirects to `/home/`. Entry paths gain canonical trailing slashes. Old `/app` and `/app/*` links redirect into `/workspace/`, preserving query strings.
- Home opens the workspace, its license activation flow and safe public sample PDFs. Workspace opens Home after draining saves; saved document drafts are preserved and included in backups. Failed/conflicting edits require a current backup before leaving.
- Get lifetime access opens Individual **$49.79 / one device** and Agency **$69.79 / five devices**. Both keep identical paid features. Valid configured live checkout links open on Gumroad; otherwise the chooser offers demo/existing-license activation. Choosing a plan never activates a license itself.
- `/samples/change-brief.pdf` and `/samples/invoice.pdf` contain only synthetic design-review fixtures. They request no payment. Customer document exports still require protected authorization.

The origin must stay the same for both pages and `/api/*`. Browser records are origin-bound; a different hostname, protocol or port represents a separate local workspace. Licensing cookies follow host/path and secure-cookie rules and are not isolated by port; the backend additionally validates the configured request origin. Path redirects preserve the origin and local records. Do not introduce a separate app subdomain without a deliberate data-transfer plan.

## Build and serve

```sh
npm install
npm run build
npm start
```

The Vite build includes `home/index.html`, `workspace/index.html` and the compatibility input. `npm start` serves the whole `dist` through the integrated Node server. It keeps the licensing/PDF API and private-file boundary active; an HTML-only static host cannot supply those protected services by itself.

For development, use `npm run dev` and open `/home/` or `/workspace/` on the displayed local origin. The development, Vite preview and built server use the same entry routing. The supplied Downloads HTML stays as the original reference; the site source is `home/index.html` with authored interactions in `home/landing.js` and connected controls in `home/site.js`.

## Production setup still required

Choose a Node-capable host with HTTPS, durable storage for the entitlement database/secret, a compatible sandboxed non-root Chrome runtime and sufficient measured memory. Point the domain's DNS to that chosen host using its documented records. Serve both pages and `/api/*` on `https://scopeledger.site`; route the reverse proxy to the loopback Node server. Follow [server configuration](SERVER-CONFIGURATION.md) and [server operations](SERVER-OPERATIONS.md) for the exact license provider, origin, secrets, database, proxy, quota and renderer configuration.

Set the allowed origin to `https://scopeledger.site`, provide the actual seller/product identifiers and the two exact Gumroad checkout URLs, and retain HTTPS secure-cookie behavior. Do not publish development keys or `.local-private`. Do not set test mode in production. Validate real activation, PDF export, restart/recovery and current-device release on the actual host before advertising live purchase availability.

Build complete releases separately and switch them atomically. Retain old hashed assets while existing tabs may still need a later view download; building into a currently served directory can strand those tabs. Back up the license database/retained secret and export local workspace backups before migration. Canonical metadata and `public/sitemap.xml` name the intended domain; they do not establish hosting or DNS ownership. The workspace is marked noindex and excluded from the marketing sitemap.

## Supplied copy and policy information

The imported marketing descriptions were corrected on 8 October 2026 to match manual requests, local browser records, independent one/five-device licenses, twelve built-in scenarios, imported signatures, manual approvals/payments, JSON backups and protected PDF exports. Unsupported integration, cloud-region, client-portal, outcome-statistic and refund commitments were removed. Final seller policies, support delivery and live provider behavior still require owner verification before publication.

Footer policy links open accurate service-information summaries and provide a workspace-help fallback. These summaries explain the current local data, licensing and PDF flow; they are not a published seller contract or signed DPA. Final seller identity, privacy/retention/refund/license terms remain owner-supplied launch decisions. The reference contact addresses are preserved; verify that those mailboxes receive mail before publication.

## Verification

Fresh acceptance evidence for this integration is recorded in the [site verification](SITE-VERIFICATION.md). Historical Part 3 counts and reports remain separate. Actual production/DNS/provider, physical-device and assistive-reader checks require the external setup described above.

# Versioned deployment update — 8 October 2026

The local release tooling, Git/CI preparation, CSP, health/readiness and recovery implementation are recorded in [Part 2](PRELAUNCH-REPAIR-PART2.md). Follow the [production runbook](PRODUCTION-RUNBOOK.md) rather than rebuilding a live directory. Hosting and seller details are still pending; this task did not deploy or enable checkout.
