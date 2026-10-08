# Production runbook — prepared locally, not deployed

8 October 2026. The intended origin is `https://scopeledger.site`. The hosting provider, actual seller account, final policies and live device checks are still awaiting owner information. Purchases remain disabled. The files in `ops/` are Linux templates, not installed services.

## Source and verification

The application now has a local Git repository. Keep `output/`, `tmp/`, `dist/`, `.local-private/`, SQLite files, environment files and keys out of source control. `node scripts/check-source.mjs` checks tracked paths and common embedded credential patterns; it is a basic check, not a comprehensive secret scanner. Generated test keys remain confined to development fixtures. Public document samples use synthetic identities.

CI is prepared in `.github/workflows/verify.yml`: Node 24, locked dependency installation, dependency advisory gate, tracked-source check, unit and hostile HTTP tests, production build, three browser engines, isolated licensing/export tests and site checks. It will run when this repository is connected to a GitHub remote. No remote or hosted CI run has been created by this task.

Run locally before packaging:

```sh
npm ci
npm audit --audit-level=high
npm test
npm run test:security-http
npm run build
npm run test:local-browser
npm run test:site
```

Use fresh browser profiles for QA. Do not reset the owner's browser data. A different origin, browser or profile has an independent workspace. Export the existing owner's JSON backup deliberately before moving real work to HTTPS.

## Staging and installation

Choose a persistent Linux VPS with Node 24 LTS, sufficient measured CPU/memory, a working sandboxed Chrome/Chromium executable, a non-root `scopeledger` user, a durable `/var/lib/scopeledger`, and HTTPS on the canonical host. A static-only host cannot run licensing or protected export. The Linux templates have not been executed on this macOS workstation.

First rehearse the setup in an isolated staging environment. Use a separate database, secret and origin; do not share production cookies or entitlement files. Public staging may run in demo mode. Local-test mode deliberately requires development and loopback HTTP. Provider test purchases are rejected by live authorization; agree the real receipt/refund verification procedure with the seller before making a transaction.

Prepare these paths outside the public directory:

- `/etc/scopeledger/server.env`: root-owned, mode 600, copied from `ops/server.env.template` and filled privately. Preserve the same session secret across upgrades; it also encrypts provider keys.
- `/var/lib/scopeledger`: owned by the service user, mode 700, persistent across release replacement.
- `/opt/scopeledger/releases`: complete immutable version directories, writable by the deployment operator, read-only to the service.
- `/opt/scopeledger/asset-cache`: retained hashed public assets, readable by the service, writable by the deployment operator.

Install the Nginx template only after obtaining a valid certificate and verifying the DNS and host identity. Port 4173 remains bound to loopback. The template overwrites `X-Forwarded-For` with a single direct client address. Enable `SCOPELEDGER_TRUST_LOOPBACK_PROXY=true` only after testing that chain. A CDN requires its own verified trusted-address configuration; never trust an arbitrary incoming chain.

The systemd template uses a non-root user, a private temporary directory and a read-only system, with a writable state directory. Chromium's sandbox remains enabled. Host namespace/AppArmor/setuid requirements must be proven on the chosen distribution; do not fix a failed launch by disabling the sandbox. The readiness check launches Chromium with the same sandbox requirement and a restricted environment that omits licensing secrets.

## Build, release and rollback

Build away from the served directory. `postbuild` stamps `dist/release.json`. Packaging copies only the built site, runtime modules/scripts and locked package metadata; it refuses private paths and symlinks, retains hashed assets and writes SHA-256 checksums. Verification rejects unmanifested runtime files and symlinked release/parent directories; the installed node_modules tree is excluded and must come from the locked npm installation. Checksums detect changes but are not a signature from an independent release authority. Protect deployment permissions.

```sh
node scripts/release.mjs prepare /path/to/verified/source /opt/scopeledger RELEASE_ID
cd /opt/scopeledger/releases/RELEASE_ID
npm ci --omit=dev
```

Use a short maintenance window for the single-server process. Stop the service, switch the verified release, start it, then verify readiness and the actual workflow. The switch itself is an atomic symlink replacement; this is not a zero-downtime cluster deployment.

```sh
sudo systemctl stop scopeledger
node scripts/release.mjs activate /opt/scopeledger RELEASE_ID
sudo systemctl start scopeledger
node scripts/health-check.mjs https://scopeledger.site
```

Keep the previous complete release. To roll back, run the same stop/activate/start sequence with its ID. Runtime code changes require the restart. `SCOPELEDGER_ASSET_DIR` must point to the retained asset cache so tabs opened on a newer version can still load their chunks after rollback. Each static request resolves within one release directory. Do not prune recent releases/assets during rollout; retention and disk monitoring must reflect the actual audience and storage budget. Tools refuse overwriting a version and concurrent switching; stale locks after a killed deployment require operator inspection.

Release switching does not roll back SQLite. This update adds indexes and retains compatible tables. A future destructive schema change needs a deliberate migration/rollback strategy and its own backup; do not automatically replace the database during application rollback.

## Health, logs and capacity

- `/api/health`: process liveness and public release ID; no cookies, keys, record counts or filesystem paths.
- `/api/ready`: configured licensing, readable database connection and successful sandboxed runtime launch, cached for 30 seconds; reports 503 if any required check fails. Unconfigured demo/storage failures never launch Chromium. An expired check is deferred with 503 while exports are running; a probe shares the two-renderer capacity limit. Demo mode intentionally fails paid-service readiness. It does not verify a real provider transaction, seller payout, DNS ownership or policy approval.
- `scripts/health-check.mjs`: checks the HTTPS readiness endpoint with timeout and no redirects. Non-ready responses and missing release IDs exit nonzero. `ops/scopeledger-health.timer` schedules it every minute after installation.

The timer is a local failure signal in the journal, not a delivered pager alert. Connect it to an owner-chosen monitored alert destination and test delivery before launch. No external messages were sent. Monitor disk/WAL/asset-cache growth, restart loops, provider failures, 429/busy rates, export duration and host memory. Readiness probes share the two-renderer capacity limit with PDF exports. A briefly deferred check reports 503/checking_deferred and should trigger a bounded retry, not an immediate restart loop.

Application events contain operation/status/error-code/duration only. They omit request bodies, keys, cookies, document text, client IP and filenames. Nginx access logging is disabled in the template. Inspect Nginx error logs and the provider/host logs too; their data/retention is not controlled by the application. Configure a bounded journal and log rotation (for example 7 days and a disk cap), verify it, then reflect the actual policy in the published privacy notice.

Known expired activation-hour and PDF/project-day quota windows and expired sessions are pruned at most hourly. Unknown operations, licenses, device slots and recovery audit evidence are retained. A 14-day expired session does not free its device allocation. Keys/ownership evidence need an explicit real retention/deletion procedure before launch.

The renderer accepts at most two active jobs, coalesces identical concurrent requests for one device, rejects a different concurrent document for that device, and returns `renderer_busy` for overflow. It has no waiting queue. Busy requests do not consume PDF allowance. Allowances are 100 new render jobs per device and 500 per license per UTC day, with request/output size limits. Do not advertise unrestricted server usage. Run `node scripts/renderer-load-qa.mjs /private/qa-report.json` on an isolated development machine and repeat representative/bounded large documents on staging. Local RSS is not a production sizing guarantee.

## Request and security limits

See `docs/SECURITY-HARDENING.md` for the verified security changes and evidence. Public routes use a build-output allowlist; new public asset locations require an explicit server rule. Keep every credential, database and backup outside the public tree even with the defensive boundary.

The application allows 16 active API operations per process and eight distinct provider verification operations. Requests for the same purchase share its pending verification, including activation and refresh; each caller still checks its stored purchase identity. Overflow returns 503 with Retry-After: 5. There is no pending queue. These are per-process limits; do not add multiple application workers without designing shared resource limits and measuring capacity.

JSON uploads must use application/json and uncompressed UTF-8. Activation allows 16 KiB, release/project authorization 4 KiB, and client PDF snapshots 2,600,000 bytes. Uploads time out after 15 seconds; excess chunked input is rejected immediately. The built Node server has a 10-second header deadline, 20-second request upload deadline, 60-second socket inactivity limit, 16 KiB header size, at most 128 connections, and 100 requests per keep-alive socket.

The Nginx template belongs in the http context. It adds 10 API requests/second per direct client address with a burst of 20, at most 20 connections/address, bounded upload/proxy timeouts and canonical HTTPS Host checking. Run nginx -t and test normal startup, export, shared-office traffic and deliberate overload on staging before installation. The template has not been validated by Nginx on this Mac. Configure the firewall so only HTTPS/HTTP and deliberately restricted administration are public; port 4173 must remain loopback-only.

CSP allows self-hosted scripts and exact inline hashes, rejects script attributes and base tags, and limits network connections to the same origin. Inline styles remain permitted for document previews and responsive layout. Same-origin opener/resource policies supplement the existing no-sniff, frame, referrer and permissions headers. Verify headers through the real reverse proxy; it may replace application headers.

## Paired database and secret recovery

The backup tool uses SQLite's online backup API, so it includes committed WAL data. It validates database integrity, expected tables and decryption of retained provider keys. Inputs must be owner-only regular files; the new bundle is mode 700 with mode 600 files. A manifest authenticates checksums with the paired session secret. [Node documents the SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options).

```sh
node scripts/server-backup.mjs backup /var/lib/scopeledger/licenses.sqlite /etc/scopeledger/server.env /private/backups/NEW_BUNDLE
```

The bundle contains the full private environment, including the secret. It is not encrypted at rest by this tool. Use an encrypted off-host backup destination and restricted access; never place it in a release, public directory or Git. Establish backup scheduling, retention and tested retrieval with the chosen host. A browser workspace JSON backup is separate and does not restore server entitlements.

Restore offline into new unused paths; keep the original database/sidecars for investigation. The tool refuses existing destinations, checks the entire bundle before copying, rewrites the restored database path and sets both purchase flags false.

```sh
node scripts/server-backup.mjs restore /private/backups/BUNDLE /var/lib/scopeledger/RESTORED.sqlite /etc/scopeledger/RESTORED.env
```

Inspect the recovered configuration privately, point the stopped service to it, restart and verify an existing device/license, fresh activation, protected export and current-device release. Rehearse targeted lost-device recovery only with independent ownership evidence, using the existing administrative command. Preserve recovery audit evidence. The local rehearsal verifies recovery mechanics; actual off-host retrieval and production recovery are still required.

## Commercial and human launch gates

Complete `docs/SELLER-POLICY-WORKSHEET.md` with real owner information. Publish consistent seller identity/contact, license/lifetime/support definition, allowance limits, refund process and privacy/data-processing information on the site and checkout. Test support delivery and provider license-key receipt instructions. The current information dialogs are overviews, not the seller's final contract.

On the real host, verify valid receipt activation for both plans, one/five allocations, wrong seller/product rejection, outage behavior, sandboxed signature export, restart, slot release, independently verified recovery, adverse refund/revocation behavior, backup retrieval and rollback. Do not perform paid transactions without an agreed owner procedure.

Complete physical iOS/Android, desktop Safari/Chrome, VoiceOver/NVDA, actual zoom and PDF reading-order checks. Run a small uncoached pilot using the seven-step workflow. Emulated viewports and automated accessibility checks do not replace those human checks.

Only then, with explicit owner paid-launch approval, set seller verified and the two purchase/approval flags as described in `SERVER-CONFIGURATION.md`. This task did not set them, deploy, publish policies or send messages.
