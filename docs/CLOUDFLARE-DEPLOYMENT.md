# Cloudflare deployment

The public Cloudflare release hosts `/home/` and `/workspace/` on one origin using Workers Static Assets. It runs the current **demo mode**: local browser projects, calculations, document previews, backup and restore, and downloadable public sample PDFs. Individual is $49; Agency is $99.

Purchases, license activation, additional paid project authorizations, and protected customer PDF exports remain unavailable. The Worker cannot be activated by local storage, a cookie, an import, or client flags. `/api/health` reports website availability; `/api/ready` deliberately returns 503 until commercial services exist.

## Build and publish

Use Node 24 or newer and the pinned project-local Wrangler. Authenticate through `npx wrangler login` or an appropriately scoped deployment token kept out of Git. Cloudflare's official agent skills are installed globally; its MCP connection is configured separately in Codex.

```sh
npm ci
npm run build
npm run cloudflare:check
npm run cloudflare:dev
```

Review local Workers runtime behavior at `http://localhost:8787/home/`, then publish with `npm run cloudflare:deploy`. Publishing includes only release assets from `dist` and the bundled public Worker. The public-file allowlist also rejects private files accidentally copied into that directory.

Wrangler authentication, `.wrangler`, `.dev.vars`, `.env`, local databases, customer backups, test artifacts and `node_modules` are excluded from Git. No persistent licensing data is stored in this Worker. Logs omit request bodies, cookies, authorization headers and customer data; invocation logs are disabled.

## Domain

`scopeledger.site` and `www.scopeledger.site` are attached to the `scopeledger` Worker as custom domains, declared in `wrangler.jsonc`. The Worker redirects www and HTTP navigation to the HTTPS apex while preserving paths and queries. Mail MX and SPF records remain intact. Future publishes use the same checked-in domain configuration; GitHub upload alone does not deploy a release.

## Commercial launch

The existing Node backend remains in `server/`, with encrypted durable SQLite licensing and a sandboxed Chromium PDF renderer. Workers Static Assets do **not** run that backend. Before accepting money, deploy that service with durable storage and connect it safely, or implement and independently verify a Cloudflare-native persistent licensing and rendering service. Configure the real checkout products, seller policies and production signing/encryption secrets before enabling paid access. Avoid running SQLite licensing on an ephemeral container disk.

## Verification

`tests/cloudflare.test.ts` checks canonical URLs, CSP, safe public files, demo authorization, protected routes, origin rejection, health/readiness and failures. Also run the adapter with `wrangler dev` and repeat HTTP and browser smoke checks against the live URL after publishing. A successful dry run alone does not prove deployment or domain readiness.

`playwright.cloudflare.config.ts` runs the existing site journeys against port 8787. Set `SCOPELEDGER_SITE_URL` to the deployed HTTPS origin to repeat them there. Browser tests create isolated contexts and do not alter the owner's local workspace.

## Current release — document and storage update, 9 October 2026

- Application commit: `80af5e2` on the private GitHub repository, including the main update `9dec3d2`.
- Worker deployment version: `e606a559-fda1-4b91-8ad0-4b6e769e2df0`.
- Release: `20261009T104539Z-05832df54dec`.
- Adds guided Brief / Invoice / Credit note selection, tax-inclusive total adjustment, six image upload formats up to 2 MiB, a 50 MiB expanded workspace cap, compact encrypted backups, and an optional browser storage-retention request. The invoice approval requirement now focuses the commercial decision step directly.
- Local validation: 465 unit/server tests after the final correction; 37 browser checks across new document/storage journeys, real PDF/capacity journeys and existing workflow/signature/logo tests; all three engines additionally repeat the final approval-navigation regression. Strict build and full/production npm audits pass. Staged source and Git history secret scans report no findings; ignored local test credentials and historical diagnostic artifacts are excluded from publication.
- Live verification: 21 connected-site checks across Chromium, Firefox and WebKit after the main publish, including Home at 35 widths from 320 to 2560 px in both themes. The final corrected release additionally passes the document/fee/storage/approval journey in all three engines and all 19 HTTP checks for routes, TLS/security headers, redirects, private-file denial, samples, demo status and protected-service rejection.
- [Implementation, limits and storage proposal](STORAGE-AND-DOCUMENT-UPDATE.md). Workspace data remains in the browser. This release does not enable paid checkout, production licensing or protected customer PDF exports.

## Initial custom-domain release — 9 October 2026

- Repository: `https://github.com/SaMaEl-69/scopeledger` (private, full source/assets and local commit history pushed).
- Deployed site: `https://scopeledger.site/home/` and `/workspace/`. The initial `https://scopeledger.olim855597.workers.dev` address remains available.
- Worker: `scopeledger`, Cloudflare account `1e27f19ccd8101c4b41e0b911c507781`.
- Deployment version: `fb0a3729-ad74-4d1a-9c72-55494641334b`.
- Release: `20261009T093239Z-249c20145876`.
- Verification: 440 unit/server tests before final domain binding and all 24 current Worker contract tests after the HTTPS/www update; 9 targeted browser checks against the local Workers runtime; 18 checks against the initial Workers address and another 18 against `https://scopeledger.site`, across Chromium, Firefox and WebKit. These cover canonical routes, sample downloads, price/ROI, mobile navigation, both themes, short screens and larger text. All 19 final domain HTTP checks passed, including private-file denial, protected APIs and HTTPS/www redirects. Both projects' npm dependency audits and the application Git history secret scan reported zero findings.
- Cloudflare's official agent setup installed 16 skills and registered/authenticated its MCP server. Wrangler 4.149.0 is pinned locally; its OAuth credentials are encrypted with the key stored in macOS Keychain.
- Separate Remotion 4.0.534 project: `/Users/samaelsmacbook/Documents/scopeledger-launch-video`. Lint, TypeScript, bundling and Studio startup passed. Its blank starter composition is ready for later video work.

### Verified domain connection

Zone `984eccd0ee474a6795d755097cc4ecb5` is active with nameservers `braden.ns.cloudflare.com` and `zainab.ns.cloudflare.com`. The apex A and www CNAME parking records were replaced by Cloudflare-managed Worker records. All five MX records and the SPF TXT record were retained. Both custom domains are enabled and have issued certificate identifiers.

The public HTTPS Home response returned 200 with the updated $49 price, CSP, HSTS and nosniff headers. Domain verification also checks Workspace, both sample PDFs, canonical redirects, protected APIs and private-file denial. No certificate validation bypass was used. No registrar credentials or Cloudflare API tokens belong in the repository.

The old localhost workspace and the live domain have different origins. Transfer the owner's project data deliberately using backup/restore; deploying source does not migrate IndexedDB records.
