# Server licensing and PDF configuration

The checked-in application defaults to demo mode. No Gumroad seller identity, product IDs, checkout links, production secret, deployment, or real purchase has been configured or verified. Generated local keys prove the application workflow only. They are never production entitlements.

## Runtime and deployment

Use Node.js 24 LTS with `node:sqlite`, a writable persistent local disk, and a supported Chrome/Chromium executable. The package supports `^22.13.0 || >=24.0.0`; Node 23 is outside that range. Node 22.13 removed the SQLite flag requirement ([Node documentation](https://nodejs.org/api/sqlite.html)). The verification performed here used Node 26 and installed Google Chrome. `playwright-core` does not install a browser itself.

```sh
npm ci
npm run build
node --env-file=/absolute/private/scopeledger.env scripts/serve.mjs
```

The built server binds `127.0.0.1`, port 4173 by default (`PORT` overrides it), and serves only `dist`. Put it behind an HTTPS reverse proxy at the exact canonical origin below. Forward `/home/`, `/workspace/`, their assets, `/samples/` and `/api` to the same integrated server; forwarding the whole origin also retains `/`, canonical redirects and legacy `/app` aliases. Preserve the original browser `Origin` header. Do not deploy only the static bundle: `/api` requires the independently authorizing backend. Vite development and preview also install that backend and the entry routing.

The intended production origin is `https://scopeledger.site`, with Home and workspace on that origin. Changing from `/app` to `/workspace/` there retains local records and usable licensing cookies. Local records belong to the exact origin; changing hostname, protocol or port does not transfer those records. Cookies follow host/path and secure-cookie rules rather than port isolation, while the backend enforces its configured request origin. Home and workspace share `sl-theme`, and Home's two-plan chooser uses the server's checkout readiness response before opening a live Gumroad link. Selecting a plan never grants activation. Public sample PDFs are synthetic; customer PDF exports retain independent authorization. Hosting has not been configured. See [site deployment](SITE-DEPLOYMENT.md) and [site verification](SITE-VERIFICATION.md).

Run one application process per deployment. SQLite transactions protect device capacity across connections; PDF concurrency and singleflight coordination are process-local. For the documented local HTTPS proxy, explicitly enable `SCOPELEDGER_TRUST_LOOPBACK_PROXY=true` only after configuring it to overwrite `X-Forwarded-For` with one verified client IP. Otherwise activation throttling uses the connecting proxy's shared address. Forwarding headers are ignored by default and from non-loopback peers. See the [proxy instructions](SERVER-OPERATIONS.md#configure-the-trusted-local-proxy).

Run as a dedicated non-root operating-system user. The renderer explicitly enables Chromium's sandbox, disables JavaScript, blocks external requests, and receives only the operating-system environment needed to start the browser. Licensing/encryption environment variables are not passed to Chrome. The target host must support Chromium's sandbox; test an actual export there before opening sales. Containers may need the user/namespace/seccomp setup described in [Playwright's deployment guidance](https://playwright.dev/docs/docker). Do not solve an unsupported host by adding `--no-sandbox`.

See [server operations and commercial readiness](SERVER-OPERATIONS.md) for monitoring, updates, cost planning and the current acceptance record.

## Exact production settings

Supply these as server environment values or a private environment file, never `VITE_` values, source code, browser storage, build-time public configuration, or a committed file.

| Variable                                    | Required value or purpose                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                  | `production`                                                                                                                                  |
| `SCOPELEDGER_MODE`                          | `live`                                                                                                                                        |
| `SCOPELEDGER_ORIGIN`                        | Exact HTTPS origin, intended `https://scopeledger.site`; no trailing slash or path                                                            |
| `SCOPELEDGER_DB_PATH`                       | Absolute path to the persistent licensing SQLite file; outside the served directory                                                           |
| `SCOPELEDGER_SESSION_SECRET`                | Unique cryptographically random 32-byte secret, encoded as 64 hexadecimal characters                                                          |
| `SCOPELEDGER_GUMROAD_SELLER_ID`             | Verified seller's exact Gumroad seller ID                                                                                                     |
| `SCOPELEDGER_GUMROAD_INDIVIDUAL_PRODUCT_ID` | Exact Gumroad product ID for the $49.79 Individual lifetime plan                                                                              |
| `SCOPELEDGER_GUMROAD_AGENCY_PRODUCT_ID`     | Different exact product ID for the $69.79 Agency lifetime plan                                                                                |
| `SCOPELEDGER_SELLER_VERIFIED`               | `true` only after the owner has completed and verified real seller onboarding                                                                 |
| `SCOPELEDGER_PURCHASES_ENABLED`             | `true` only when checkout is ready; otherwise omit or `false`                                                                                 |
| `SCOPELEDGER_LAUNCH_APPROVED`               | `true` only after the owner explicitly approves a paid launch; otherwise omit or `false`                                                      |
| `SCOPELEDGER_INDIVIDUAL_CHECKOUT_URL`       | Actual HTTPS Gumroad URL for the Individual product                                                                                           |
| `SCOPELEDGER_AGENCY_CHECKOUT_URL`           | Actual HTTPS Gumroad URL for the Agency product                                                                                               |
| `SCOPELEDGER_CHROME_PATH`                   | Optional absolute Chrome/Chromium executable path if automatic discovery does not find it                                                     |
| `SCOPELEDGER_LOG_EVENTS`                    | Optional `true` for sanitized operational event logging; no keys, cookies or document content                                                 |
| `SCOPELEDGER_TRUST_LOOPBACK_PROXY`          | Optional live-only `true` after the local proxy overwrites `X-Forwarded-For` with one client IP; omitted or `false` uses the direct socket IP |
| `PORT`                                      | Optional loopback HTTP port, default 4173                                                                                                     |

Checkout URLs are returned only when both purchase and launch flags are `true`; only `gumroad.com` and its subdomains are accepted. Live verification can be configured while purchase links remain disabled. A complete configuration is not proof that a seller account, payout, purchase, or deployment has been verified. Missing or invalid setup leaves activation and PDF creation closed while demo projects remain usable. A database startup failure returns `license_storage_failed` and likewise leaves the application available without claiming activation success.

Create and retain the production secret once. Changing it changes stable license identity hashes and invalidates sessions/device signatures; it also prevents decrypting previously stored verification keys. Do not rotate it by regenerating local-test files or restarting a deployment with a new random secret.

The proxy flag accepts only the literal values `true` or `false`; an invalid value leaves licensing unconfigured. It cannot be enabled in local-test mode. With live opt-in, only a loopback transport peer may supply one standard IPv4/IPv6 address. Missing identity returns `proxy_client_ip_required`; a chain, duplicate header, port, brackets, zone identifier or malformed address returns `proxy_client_ip_invalid`. Rejected identity does not spend quota. Equivalent IPv6 spellings and IPv4-mapped addresses share the same counter. Client IPs are used for a server-secret HMAC quota identity, never included in application logs or error responses.

Vite development, preview and the built server reject `.local-private`, environment files, configured licensing databases/sidecars and aliases of known owner files. Keep private configuration and storage outside served directories anyway; this guard protects against specific path mistakes and is not a general secret scanner.

## Bangladesh seller setup and paid-launch blockers

As checked on 2026-10-04, Gumroad lists Bangladesh for bank payouts in BDT and requires a local bank account for the selected country. That eligibility does not verify this owner's payout account or guarantee onboarding. See [Gumroad's payout-country table and requirements](https://gumroad.com/help/article/13-getting-paid).

The owner must choose the truthful individual/business account type, supply their legal name and physical address, complete requested identity verification, and configure matching bank details. Business registration and representative documents apply when selling as a registered business. See [Gumroad's payout settings and identity requirements](https://gumroad.com/help/article/260-your-payout-settings-page).

Before enabling real purchases, the owner still needs to:

1. Complete seller identity, account review, payout and applicable tax/business requirements in Gumroad; confirm no outstanding verification block.
2. Create distinct Individual and Agency lifetime products at the stated prices, enable license keys, and confirm seller/product IDs and actual checkout URLs. See [Gumroad license keys](https://gumroad.com/help/article/76-license-keys) and the [official API](https://gumroad.com/api).
3. Confirm real purchase verification returns the seller, product, key, stable purchase ID and explicit purchase-status fields this server requires. Mocked responses and generated keys do not establish that compatibility.
4. Deploy the HTTPS backend with persistent database storage, a retained secret, supported Chrome, backups and support access; exercise activation, release, expiry/revalidation and actual exports on that deployment.
5. Review customer-facing terms, privacy/support information and prices, then explicitly approve launch before setting both launch flags. Support currently points to `olim855597@gmail.com`.

None of those external steps has been completed by this implementation. No test purchase is represented as a real sale. The application has no customer accounts, shared project database, cloud sync, or customer payment processing beyond links to the configured provider.

## License/session behavior

Individual permits one active browser/device; Agency permits five. A signed, HttpOnly browser cookie identifies an activation. Reusing the same browser/device reuses its slot and refreshes its session. A different browser/profile, private window, or cleared cookie can consume another slot. Device labels are descriptive, not identity credentials. Sessions last 14 days, and signed device cookies last one year. Live cookies use `__Host-` names, `Path=/`, `Secure`, `HttpOnly`, and `SameSite=Strict`, without a `Domain` attribute. Local-test cookies use unprefixed names on `/api`. Cross-site requests are rejected before changing device cookies.

SQLite uses WAL, a busy timeout, and `BEGIN IMMEDIATE` allocation transactions. Capacity, released devices, encrypted verification keys, stable quota identities, and recovery audits survive process restarts. Gumroad verification always sends `increment_uses_count=false`; provider usage counts are not used as the activation database.

Live status revalidation occurs after a five-minute verification TTL, with one concurrent check per license. A timeout, outage, malformed response, mismatched seller/key/purchase, missing status field, or provider test sale fails protected actions closed and preserves existing entitlement records. Only adverse information matched to the configured seller, product, key and purchase ID records revocation: a refund, chargeback, or unresolved dispute. A won dispute alone is not adverse. The current authenticated browser may release its own slot even during provider uncertainty; this limited action never grants export/project access. There is no public API to release another device.

Limits are stable across session refresh: activation 20 requests per canonical client IP per hour (the direct socket IP unless trusted local proxy mode is enabled); project authorization 1,000 per license/device per day; PDF exports 500 per license and 100 per license/device per day. Device and license PDF counters increment atomically, so a rejected device-limit retry does not spend the shared license allowance. There are at most two PDF jobs per process, one job per device. Identical simultaneous exports share the same job; a different overlapping document returns a useful busy response. PDF uploads have a 15-second timeout and 2.6 MB bound; renders have a 45-second timeout and 20 MB output bound.

## API integration and document confidentiality

Mutating requests require JSON and an exact matching `Origin`. Paid actions require the HttpOnly session and signed device cookie; client flags and local storage cannot authorize them.

| Endpoint                       | Input and result                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/license/status`      | `{configured,mode,active,plan,deviceLabel,slotsUsed,slotsLimit,checkout,message}`; uncertainty may include `error` |
| `POST /api/license/activate`   | Exactly `{key,plan:'individual'\|'agency',deviceLabel}`; sets cookies and returns status                           |
| `POST /api/license/release`    | Exactly `{}`; releases only the current authenticated browser/device                                               |
| `POST /api/projects/authorize` | Exactly `{}`; returns a short-lived authorization receipt `{grant,expiresAt}` for local creation                   |
| `POST /api/pdf`                | **Direct `ClientDocument` JSON**, not a `{document:...}` wrapper; returns PDF bytes                                |

`shared/client-document.mjs` is the single allowlist validator and HTML renderer for preview and export. Unknown/private keys, including nested keys, are rejected before rendering. The transfer contains the preserved public document fields only: issuer/client identity, public scope/description/terms, approved/proposed commercial amount, tax/totals, approval evidence and payment instructions. Internal hours, loaded cost, margin/targets, actual/remaining cost, comparisons and private notes are not schema fields and must never be submitted. Public descriptions must still be written as client-facing text; the server cannot infer that a secret was pasted into an allowed public field.

Briefs permit incomplete draft identity/amounts, with paired known/unknown subtotal and total, equal signed values and zero/blank actual tax. Negative values explicitly label a proposed credit and its public explanation. Invoices/credit notes require recorded approval and its real approval date, issuer/client readiness, real issue/due dates, correct cent-rounded tax/totals and nonnegative absolute amounts; credits have their own kind and payment-offset wording. Practical metadata bounds prevent enormous unbreakable headers. Logo input is bounded PNG/JPEG data only, never remote URLs or SVG; decoded image dimensions are checked as well. Text is escaped, JavaScript is disabled, and all renderer network requests are blocked except data images. PDF bytes are returned without storing customer documents server-side.

## Local owner testing

Generate private keys once, then reuse the same files and database:

```sh
npm run keys:local
npm run dev:local
```

The first command requires explicit development/local-test mode (the npm command supplies it). It creates `.local-private/test-keys.json`, `.local-private/local-test.env`, and `.local-private/licenses.sqlite` with private permissions. It prints file paths only and refuses to overwrite existing key/environment files. Read the private key file locally and activate the matching plan; do not copy keys into public docs or logs.

`dev:local` reads that private environment without printing secret values; open its workspace at `http://127.0.0.1:5180/workspace/` or Home at `/home/` on that origin. Default demo port 5173 and its browser projects remain separate; old `/app` links redirect without changing the origin. An alternate port can be passed to `node scripts/run-local-test.mjs 5182`. Local-test mode requires `NODE_ENV=development`, an HTTP loopback origin, a persistent database and secret; it rejects public hosts/peers and cannot enable in production. Generated keys enforce the same one/five device limits and actual PDF authorization. No checkout is enabled.

## Current release and lost-device recovery

Customers should first use **Release this browser/device** on the browser that owns the slot. Clearing local cookies is not a server-side release. If that browser is lost, contact the seller; possession of an Agency shared key alone is insufficient evidence to release someone else's activation.

The seller/operator must independently verify purchase ownership using the actual seller purchase dashboard and a matching receipt/purchaser channel. Identify the intended license/device in the protected server database; retain the other devices. Prepare a mode-600 JSON file outside served directories with:

```json
{
  "licenseId": "verified stable license identity from the server database",
  "deviceId": "the specific lost device identity",
  "operator": "named authorized seller/operator",
  "purchaseOwnershipVerified": true,
  "independentReceiptReference": "receipt matched in the seller purchase dashboard",
  "verificationChannel": "verified purchaser email",
  "evidence": "How ownership was independently established and why this device is the lost device."
}
```

Run from the trusted server host with its existing private configuration:

```sh
SCOPELEDGER_ADMIN_RECOVERY=enabled node --env-file=/absolute/private/scopeledger.env scripts/recover-device.mjs /absolute/private/recovery-evidence.json
```

The CLI requires explicit administrative scope and independent evidence, removes only the specified device/session, and writes a durable audit row containing operator, evidence, time and identities. It never accepts a key on the command line or exposes a public recovery endpoint. The human operator must perform the ownership check; setting the JSON boolean is an assertion, not automated proof. Protect audit evidence as personal information and remove the temporary evidence file according to the operator's retention policy.

## Persistence, secrets and backups

Keep the database and secret outside `dist` with least-privilege access. The application creates database files mode 600 and new parent directories mode 700. The server database stores encrypted license keys and activation data, not browser project content; browser projects require their own local backups.

Back up the SQLite database consistently with its WAL state using SQLite's backup facility, or stop the application before copying the database and associated WAL/SHM files. Back up the matching encryption/session secret separately in a protected secret store. Restore the database **with the same secret** and test activation/status before reopening protected actions. Never replace or delete the production database to free slots, and do not publish `.local-private`, `.env` files, database files, receipts or recovery evidence. Those file classes are ignored by Git; ignoring them does not make an external upload safe. A lost secret needs an explicit migration/recovery plan, not an automatic reset that silently forgets entitlements.

## Repeatable verification

After `npm run build`, `npm run test:local-browser` automatically starts an isolated loopback development backend for each browser engine, with a temporary SQLite database, secret and generated keys. It calls the actual authorization/renderer and cleans up; no owner private files or live provider are used. It rejects production mode. Per-engine isolation avoids consuming the owner test server's persisted 20-activation-per-IP-per-hour quota; that application limit remains unchanged.

```sh
npm test -- tests/server-document.test.ts tests/server-licensing.test.ts tests/server-http.test.ts tests/server-pdf.test.ts tests/server-static.test.ts tests/server-vite.test.ts tests/server-recovery.test.ts tests/server-proxy.test.ts tests/access.test.ts
npm run test:pdf
python3 scripts/inspect-pdfs.py
```

The Python inspection requires `pdfplumber`, `pypdf` and Poppler's `pdftoppm`, with `pypdfium2`/Pillow as the rendering fallback. `test:pdf` uses an isolated temporary SQLite database, generated development entitlement, actual same-origin protected HTTP requests and local Chrome. It does not alter workspace projects or claim a real purchase. It generates five registered fixtures in `output/pdf`: an everyday brief/invoice, a long negative-fee brief, invoice with long identities/a bounded PNG logo/tax/very large amount, and explicit credit. The huge invoice is fictional stress data. Inspection renders every page to PNG, verifies no page-bound clipping/private sentinel leak, checks the huge total remains an unbroken number and checks actual tags/language/bookmarks. Inspect every final PNG visually as well. `QA-REPORT.json` records page counts and bounds checks; `PERFORMANCE-REPORT.json` records sequential export time and sampled RSS with its limitations. Prior document-refinement reports remain in `output/pdf-before-multipage/`; fresh route/theme/document evidence is in [site verification](SITE-VERIFICATION.md).

# Production preparation update — 8 October 2026

Use the [production runbook](PRODUCTION-RUNBOOK.md) for the prepared service/proxy templates, release switching, readiness checks and paired database/secret recovery. Expired known quota windows and sessions now receive hourly pruning; licenses, device slots and recovery audit evidence remain retained. Published seller policies and actual hosting/provider checks are still required before enabling purchases.
