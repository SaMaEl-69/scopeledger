# ScopeLedger security completion record

9 October 2026. Hosting is still not set up, confirmed by the owner. This pass completes the additional application, recovery and deployment protections that can be implemented and verified locally. No owner records were reset, real transactions made, purchases enabled or domain published.

## Implemented and verified

- Encrypted workspace backups are the default export flow. AES-256-GCM protects file confidentiality and integrity, with PBKDF2-SHA256 at 600,000 iterations, random salt/nonce and a passphrase of at least 16 characters. No passphrase is saved or sent to the backend. Legacy JSON imports still work; plain exports require explicit selection and acknowledgement.
- Encrypted import checks the file locally, unlocks it, validates its workspace graph and shows the existing replacement confirmation. A wrong passphrase or changed file preserves current records. Recovery, failed saves, logo backup/import and repeated restores remain tested. Asynchronous backup completion now controls reload/Home guards; newer edits require another export.
- Server archives encrypt the paired database/environment using an independent random recovery key. Authentication finishes before restoration writes. Wrong keys, tampering, truncated input, aliases, unsafe permissions and reused destinations are rejected. Sensitive staging files are owner-only and cleaned up after normal completion/failure; new private outputs are flushed and failed writes are removed. The old plain transport CLI is disabled.
- Server restore invalidates all sessions, frees device allocations for verified reactivation and closes checkout. Purchases/history remain. Privileged tools can revoke sessions atomically and rotate signing/encryption secrets offline into a newly verified database/environment pair, preserving originals and recording an audit.
- Live storage refuses unsafe ownership/permissions and symbolic/hardlink aliases. Invalid timestamps fail closed; future provider-check timestamps force revalidation instead of extending authorization.
- Production startup refuses root execution, test mode, non-production live mode, incomplete settings, a public-directory database and an unusable sandboxed renderer before accepting connections.
- The HTTPS gateway verifier checks trusted certificates, redirects, headers, private paths, live cookie flags, cross-site requests, forged sessions and runtime readiness. Local native Nginx QA also proves that client-address spoofing is overwritten and a bounded request burst is throttled.
- Full-history secret scanning now uses Gitleaks, with redacted reports and only the exact synthetic purchase-fixture key allowlisted. CI pins its binary checksum, scans full history, and runs the HTTPS gateway checks. Encrypted archives and known JSON backup names are refused in development serving, source checks and release packaging. Previous API/body/provider/render limits, CSP, private serving, public-schema validation and release-integrity protections remain in place.

AES-GCM and separate key management follow the [OWASP cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html). The browser implementation uses the standard [Web Crypto encryption and key derivation APIs](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).

## Verification evidence

Current evidence is retained in output/security/2026-10-09, excluded from Git:

| Check                                                           | Result                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/integration suite                                          | 403 passed across 25 files                                                                                                                       |
| Built app across Chromium, Firefox and WebKit                   | 33 passed, including encrypted backup round trips, wrong passphrases, signatures, licensing, malicious text, CSP and navigation                  |
| Recovery compatibility                                          | Six passed: failed-save reload guards, unavailable storage, raw legacy recovery, logo backup/import, repeated restores and unsaved-number export |
| Backup dialog layout                                            | Widths 320, 390, 768 and 1440 in both system themes across three engines, included in the browser suite                                          |
| Native Nginx HTTPS rehearsal                                    | 13 gateway checks passed with TLS certificate verification enabled; spoofed client addresses rejected by overwrite and request burst throttled   |
| Secret scanning                                                 | Full history and current tracked source scanned with redacted output; no real credentials detected                                               |
| Build, types, formatting, source boundaries and release package | Verified locally; complete 778-file release packaged, checked and activated in a disposable directory                                            |

The earlier report and evidence retain the original adversarial HTTP/upload, real renderer burst and dependency advisory checks. The recovered server databases, rotation tests, gateway and browser contexts were disposable; the owner's browser storage was untouched. Native Nginx and Gitleaks were installed for local QA; no persistent Nginx service was enabled.

## External boundary

There is no hosting server available to configure. Accordingly, no claim is made that scopeledger.site currently has a verified live firewall, Linux sandbox, private persistent disk, delivered alerts or an off-host backup destination. These require the actual host, destination and credentials. The protections and verification commands are implemented in the [production runbook](PRODUCTION-RUNBOOK.md); they are no longer just recommendations.

The Linux service template remains a template until installation. The local HTTPS rehearsal used a trusted temporary test certificate and synthetic seller configuration; it proves gateway behavior, not public DNS ownership or genuine purchases. A hosted CI run also requires a repository remote. Real seller/receipt/refund checks and policy approval remain commercial launch gates, not completed transactions.

## Limits kept explicit

Encryption protects exported backups; IndexedDB remains local to its browser profile. Protect the browser/device and retain passphrases/recovery keys separately. A complete stolen cookie pair is session compromise until revoked; device identity is a browser profile, not hardware attestation. Neither watermarks nor browser project limits are tamper-proof DRM. The PDF backend independently authorizes its protected operations.

Server archive bounds are 64 MiB of database, 256 KiB of environment and 96 MiB of encrypted archive. Normal staging cleanup does not guarantee secure erasure after a machine crash; host disk protection is still required. Root-owned recovery outputs need the service's correct database ownership before restart, which the startup gate enforces. Rotation restarts IP-based activation counters because old one-way hashes cannot be recomputed.

No confirmed application security finding from these two passes remains intentionally unfixed. This is a tested hardening record, not a promise that future vulnerabilities or a compromised host/browser cannot exist.
