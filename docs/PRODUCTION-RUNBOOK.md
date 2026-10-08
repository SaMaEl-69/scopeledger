# Production runbook — prepared locally, not deployed

Updated 9 October 2026. The intended origin is `https://scopeledger.site`. The hosting provider, actual seller account, final policies and live device checks are still awaiting owner information. Purchases remain disabled. The files in `ops/` are Linux templates, not installed services.

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

Choose a persistent Linux VPS with Node 24 LTS, sufficient measured CPU/memory, a working sandboxed Chrome/Chromium executable, a non-root `scopeledger` user, a durable `/var/lib/scopeledger`, and HTTPS on the canonical host. A static-only host cannot run licensing or protected export. Native Nginx syntax and an isolated HTTPS gateway rehearsal have passed locally; the Linux service/firewall still require the actual host.

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

The Nginx template belongs in the http context. It adds 10 API requests/second per direct client address with a burst of 20, at most 20 connections/address, bounded upload/proxy timeouts and canonical HTTPS Host checking. Run nginx -t and test normal startup, export, shared-office traffic and deliberate overload on staging before installation. The template has passed native Nginx syntax and local HTTPS gateway checks on this Mac. Configure the firewall so only HTTPS/HTTP and deliberately restricted administration are public; port 4173 must remain loopback-only.

CSP allows self-hosted scripts and exact inline hashes, rejects script attributes and base tags, and limits network connections to the same origin. Inline styles remain permitted for document previews and responsive layout. Same-origin opener/resource policies supplement the existing no-sniff, frame, referrer and permissions headers. Verify headers through the real reverse proxy; it may replace application headers.

## Authenticated encrypted recovery

Server backups now use AES-256-GCM with a separate random recovery key, private permissions and exclusive output creation. The archive authenticates the paired database/environment before restoration writes. The previous plain staging CLI is disabled. Staging helpers are internal implementation/testing tools.

Generate the key outside source/public/release paths. Keep a separate protected off-host key copy; never upload it alongside an archive. Losing the key makes these archives unrecoverable.

```sh
sudo node scripts/secure-backup.mjs keygen /etc/scopeledger/recovery.key
sudo node scripts/secure-backup.mjs backup /var/lib/scopeledger/licenses.sqlite /etc/scopeledger/server.env /etc/scopeledger/recovery.key /private/backups/NEW.slarchive
```

Transfer the encrypted archive to the chosen off-host destination. Scheduling, access, retention and alert delivery need the future host/destination. The tool bounds database size to 64 MiB, environment size to 256 KiB and archive size to 96 MiB. Monitor growth and rehearse recovery before these bounds. Temporary plaintext snapshots stay in an owner-only directory and are removed after normal success/failure. Protect the live disk and state directory too.

Restore while the application is stopped, into new unused paths:

```sh
sudo node scripts/secure-backup.mjs restore /private/backups/NEW.slarchive /etc/scopeledger/recovery.key /var/lib/scopeledger/RESTORED.sqlite /etc/scopeledger/RESTORED.env
sudo chown scopeledger:scopeledger /var/lib/scopeledger/RESTORED.sqlite
```

Wrong keys, tampered/truncated archives, aliases, unsafe permissions and existing database/environment/sidecar destinations are refused. Recovery invalidates all sessions, frees device allocations for reactivation and disables both purchase flags. Historical purchases remain. Review the recovered configuration, select it deliberately in the service and verify reactivation/export. Never send plain snapshots off-host.

## Incident controls

These are privileged local operator tools, not HTTP endpoints. Rehearse with disposable state; never run incident commands against owner records as routine QA.

```sh
sudo node scripts/revoke-sessions.mjs /var/lib/scopeledger/licenses.sqlite OPERATOR 'INCIDENT REASON OF AT LEAST TWENTY CHARACTERS'
```

This atomically invalidates all sessions, frees slots and records an audit. Valid purchasers can reactivate; browser workspaces are preserved. For an exposed signing/encryption secret, rotate offline into new files:

```sh
sudo systemctl stop scopeledger
sudo node scripts/rotate-secret.mjs /var/lib/scopeledger/licenses.sqlite /etc/scopeledger/server.env /var/lib/scopeledger/ROTATED.sqlite /etc/scopeledger/ROTATED.env OPERATOR 'INCIDENT REASON OF AT LEAST TWENTY CHARACTERS'
sudo chown scopeledger:scopeledger /var/lib/scopeledger/ROTATED.sqlite
```

Rotation re-encrypts keys, remaps secret-derived license identities and known references, verifies the new pair, invalidates sessions and disables purchases. Original files remain. Review/select the new pair before restart and investigate the incident. Retained license/device quota references move to the new identities; old IP hashes cannot be recomputed, so activation-IP counters restart. Rotate a leaked independent recovery key separately and generate new archives.

## Browser backup protection

Export backup now opens an encrypted flow. The passphrase needs at least 16 characters and is never saved or sent to the server. Encryption uses AES-256-GCM, PBKDF2-SHA256 with 600,000 iterations, a fresh salt and nonce. Import unlocks locally, then requires the existing replacement review/confirmation. Wrong passphrases or changed files leave work intact. Keep the passphrase separately; it cannot be recovered.

Legacy JSON imports remain supported. Plain JSON export requires an explicit choice and acknowledgement. Recovery/reload guards await the asynchronous download and require another export after newer edits. Actually retain the downloaded file before discarding unsaved work. Browser backups do not restore server entitlements. IndexedDB remains local browser storage governed by origin/profile and device access.

## Production verification

The production entry point rejects root execution, test licensing, non-production live startup, incomplete live settings, a database in public assets and an unusable sandboxed renderer. Live storage rejects unsafe permissions and file aliases. The service sets its state directory to mode 700 and adds kernel/control-group/personality/realtime restrictions while preserving the Chromium sandbox.

```sh
node scripts/verify-deployment.mjs https://scopeledger.site
node scripts/verify-deployment.mjs https://scopeledger.site --require-licensing
```

The verifier checks trusted TLS, HTTPS redirects, security headers, private-file denial, live cookie flags, cross-site rejection, forged-session rejection and readiness. Disabled TLS verification is refused. The optional --test-limits flag adds a bounded 40-request burst; use it deliberately on isolated staging. Local Nginx QA also verifies spoofed client-address overwrite and throttling.

CI scans full Git history using checksum-pinned Gitleaks with redacted output and only the exact synthetic fixture key allowlisted. It also runs the HTTPS gateway and sandboxed export checks. A hosted CI run and real host protections can only be verified after those resources exist.

## Commercial and human launch gates

Complete `docs/SELLER-POLICY-WORKSHEET.md` with real owner information. Publish consistent seller identity/contact, license/lifetime/support definition, allowance limits, refund process and privacy/data-processing information on the site and checkout. Test support delivery and provider license-key receipt instructions. The current information dialogs are overviews, not the seller's final contract.

On the real host, verify valid receipt activation for both plans, one/five allocations, wrong seller/product rejection, outage behavior, sandboxed signature export, restart, slot release, independently verified recovery, adverse refund/revocation behavior, backup retrieval and rollback. Do not perform paid transactions without an agreed owner procedure.

Complete physical iOS/Android, desktop Safari/Chrome, VoiceOver/NVDA, actual zoom and PDF reading-order checks. Run a small uncoached pilot using the seven-step workflow. Emulated viewports and automated accessibility checks do not replace those human checks.

Only then, with explicit owner paid-launch approval, set seller verified and the two purchase/approval flags as described in `SERVER-CONFIGURATION.md`. This task did not set them, deploy, publish policies or send messages.
