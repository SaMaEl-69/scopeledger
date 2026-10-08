# Prelaunch repairs — Part 2 local implementation

**8 October 2026.** The local production safeguards and remaining product repairs are implemented. **Public paid launch is still pending real hosting, seller details, published policies and human acceptance.** No deployment, customer message, real purchase or owner license activation was performed.

Use the [production runbook](PRODUCTION-RUNBOOK.md) for the exact rollout/recovery procedure and the [seller worksheet](SELLER-POLICY-WORKSHEET.md) for information that must come from the real owner. This continues [Part 1](PRELAUNCH-REPAIR-PART1.md).

## Implemented

| Area                    | Result                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source/release controls | Local Git repository; private/generated files excluded; tracked-path/common credential check; locked dependencies; prepared CI with pinned official action revisions and read-only permissions |
| Version identity        | Build stamp and public release ID; packaged runtime/site checksums                                                                                                                             |
| Deployment/rollback     | Exclusive complete releases, verified atomic symlink switch, serialized switching and retained hashed asset cache; rollback rehearsed in temporary storage                                     |
| Server security         | CSP with exact inline-script hashes, self-only network connections, restricted frames/resources, no eval/object execution; compatible inline styles retained for previews and runtime layouts  |
| Production templates    | Same-origin HTTPS Nginx configuration, staged HSTS, non-root systemd service, persistent/private state, explicit proxy identity and disabled purchase flags                                    |
| Health/monitoring       | Separate liveness/readiness, actual sandboxed Chromium launch check, cached readiness, timeout/nonzero probe and prepared one-minute timer                                                     |
| Recovery                | Online WAL-aware SQLite backup, integrity/decryption checks, authenticated bundle checksums, paired private environment/secret, exclusive restore paths and purchases disabled after restore   |
| Retention               | Indexed hourly pruning of expired known quota windows and sessions; entitlements, device allocations and recovery evidence preserved                                                           |
| Storage safety          | Settings usage meter, 80% notice and core edit rejection before replacing the prior state at the 10 MiB limit                                                                                  |
| Real-work defaults      | Explicit review of studio name/currency/loaded cost/target; durable confirmation invalidated by changes; required before new documents for non-sample projects                                 |
| Search                  | Local clients, requests, document references and reminders added; bounded displayed results and narrower-query guidance                                                                        |
| Navigation              | Meaningful page/project/change/document/client/reminder URLs; local relationship validation; browser Back/Forward; unavailable links explained rather than selecting another record silently   |
| License freshness       | Coalesced server refresh on foreground/online and cross-tab activation changes, with stale-response protection; no key or trusted entitlement value broadcast                                  |
| Product disclosure      | Current workspace/render allowances visible in the Home service information; unsupported return-on-investment sentence removed from the lifetime chooser                                       |

The existing green identity, main design and PDF layouts were preserved. The new storage notice wraps on narrow/enlarged-text screens and appears only near capacity. Actual Linux templates and external alert delivery remain uninstalled.

## Verification and limits

- **348 unit tests passed** across 21 files. New coverage includes open-WAL backup and paired restore, wrong secrets/tampering/permissions, refused overwrites, atomic release/rollback, retained assets/private hardlink rejection, retention boundaries, health, CSP, defaults review, capacity and local URL relationships.
- **TypeScript and production build passed.** Production dependency audit reported **zero known vulnerabilities** on this run; this is an advisory snapshot, not proof that no vulnerability exists.
- The complete application was packaged, checksum-verified and switched in an isolated temporary deployment directory. Runtime dependency installation, real Linux service startup and real-host rollback are still external checks.
- **21 isolated licensing/application browser scenarios validated across final runs** in Chromium, Firefox and WebKit, including actual protected signed PDF export, one/five device allocations, CSP across both pages/all workspace views, route history, local record search, durable defaults and cross-tab activation/release. The focused final capacity run includes rejected core/project actions and the storage notice with enlarged text in both themes. A broad action rerun initially failed because its test did not confirm the existing discard-entries prompt; the corrected three-engine capacity run passes.
- **3 corrected core-capacity checks passed**: refused edit, preserved prior value after reload and a subsequent smaller valid edit. The final run also checks the high-capacity notice at phone/tablet/desktop widths, both themes and doubled text.
- **15 layout matrix checks passed** in three engines: 1,512 main-view combinations, 240 modal/form combinations, loaded-view enlarged-text/spacing regressions, Home ROI and pricing bounds. Tested widths span 320–2560 px and important breakpoint neighbors.
- The site suite covered **54 unique scenarios**: 50 passed in its broad run; its canonical URL expectations were updated and an actual initial-routing/activation-dialog regression was repaired. All **6 focused canonical/activation checks passed** afterward. The initial failed logs are retained.
- The selected document/keyboard/persistence suite covered **54 unique scenarios**: 51 passed initially; three direct-IndexedDB fixtures incorrectly retained record URLs from their previous graph. The fixtures now navigate to their replacement graph's view, and all **3 focused issued-draft checks passed**. The frozen snapshot/durable editable draft behavior remains verified.
- The renderer burst test passed with two distinct active jobs, one duplicate sharing its job and four overflow requests rejected as busy. Every rejected request succeeded when retried. The sampled process-tree RSS sum peaked around **2,299 MiB** on this Mac. Shared pages can be counted more than once, and simultaneous QA affects timing. This is not maximum-document, sustained-load or production memory sizing.

Evidence: [Part 2 verification](/Users/samaelsmacbook/Documents/scopeledger/output/implementation/part2-2026-10-08/). Final results, initial failures and the renderer report are retained separately. The local server remains available at `http://127.0.0.1:4173/home/` and `/workspace/`.

## Remaining launch gates

1. **Actual host and domain:** provider/account selection, DNS, certificate, Linux sandbox, memory/disk sizing, persistent storage and verified client proxy chain. The templates alone do not prove these.
2. **Real seller:** seller verification, actual distinct products/checkout URLs, delivered license-key instructions, account-specific receipts, activation/refund/outage/recovery behavior and payout onboarding.
3. **Final commercial information:** true seller identity, monitored public support, approved license/lifetime/refund/privacy terms, actual provider/log/backup retention and any applicable data-processing agreement. The site's information summaries are not final seller policies.
4. **Operational delivery:** connect/readiness failures to a monitored alert destination, prove delivery, configure bounded logs and encrypted off-host backups, rehearse retrieval and real existing-license restoration, install the service/timer, and run hosted CI on a connected remote.
5. **Human acceptance:** physical iOS/Android, real Safari/Chrome zoom, VoiceOver/NVDA, PDF reading order and an uncoached user pilot.
6. **Explicit paid-launch approval:** keep the two purchase/approval flags false until all preceding gates are satisfied and the owner approves paid launch.

Owner hosting and seller/policy questions were sent while implementation continued. Their answers are required for these external steps. No passwords or secrets should be pasted into chat.

## Remaining product scale work

The 10 MiB cap is now visible and safe to approach, but saved images are still repeated in immutable document/revision snapshots. No automatic history deletion or asset deduplication was introduced. A future storage migration must preserve exact document snapshots and backup portability, with migration/rollback tests. Keep image sizes modest and maintain backups; a separate browser workspace has independent records.

Search covers local supported records and actions, not every private narrative field or a cloud service. Results are bounded to 80 per query; the empty menu prioritizes actions/pages/recent projects. Navigation restores record/page identity, while transient open disclosures and each wizard's visual step are not all serialized as shareable routes. Sharing a URL does not transfer its local data.

Client signing portals, automated capture, payment collection and cloud collaboration remain future features rather than advertised capabilities. Their service costs and privacy model should be agreed before expanding a lifetime product's obligations.
