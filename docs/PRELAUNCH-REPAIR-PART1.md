# Prelaunch repairs — Part 1 completed, Part 2 defined

**Date: 8 October 2026.** This implements the first stage of the [7 October audit](/Users/samaelsmacbook/Documents/scopeledger/output/audit/prelaunch-2026-10-07/FULL-AUDIT.md). The application is ready for continued local review; paid public launch still depends on Part 2.

## The two parts

| Part                                                      | Scope                                                                                                                                                                                                                          | Status                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **1 — Product accuracy, durable work and usable layouts** | Correct unsupported sales claims; make document drafts durable; protect document actions at capacity; repair reproduced responsive/text-spacing defects; improve loading; verify the changed workflows.                        | **Completed locally**                                                                                      |
| **2 — Production and commercial readiness**               | Configure and prove hosting/HTTPS and the real seller; publish final policies/support; establish source/release/rollback controls; wire monitoring and restoration; address the remaining storage/onboarding/navigation risks. | **Local implementation completed; external launch gates remain — see [Part 2](PRELAUNCH-REPAIR-PART2.md)** |

No customer messages, real purchases, deployment, or owner license activation were performed. Existing owner browser records were not reset. Browser acceptance and paid-export tests used fresh profiles and isolated fixtures.

## Part 1 changes

### Accurate sales page

- Removed unsupported automatic Slack/email/Figma capture, automated SOW analysis, client signing links, cloud region/encryption, unlimited teammates, 24 scripts, CSV export, and client-portal claims.
- Removed the unsupported 87% approval statistic, unverified refund/outcome promises, response-time guarantee, and business/closure commitments.
- Updated metadata, hero, process, comparison, pricing, FAQ, and final call to action around the actual manual workflow.
- Marked the homepage's animated client requests as illustrative scenarios and removed simulated claims that an actual order was sent.
- Made Individual **$49.79 / one activated browser/device** and Agency **$69.79 / five** visible in the pricing section. Both have identical paid features and independent local records.
- Replaced the mismatched `.com` founder-email shortcut with the existing support view. Renamed informational footer links to describe their actual overview content rather than imply completed policies.
- Preserved the existing logo, palette, and document demonstration assets.

The purchase chooser still reports actual server availability. Live checkout remains disabled until seller setup and launch approval are complete. Policies/support delivery are Part 2 requirements, not invented commitments.

### Durable document drafts

Unissued settings are now part of the saved workspace, rather than a 50-entry memory cache. They survive reload after saving, are included in JSON backups, and remain independent by workspace/project/change/revision/document type. No older draft is silently evicted when another is edited.

Existing schema-3 workspaces and backups without drafts remain valid. Draft records are bounded and validated, including source relationships, duplicate contexts, revision boundaries, allowed fields, and signature images. Restoring a backup deliberately restores its own draft set; an older backup has no drafts to restore.

Issued snapshots remain separate and unchanged. Confirming a document removes only its corresponding editable draft. Resetting a brief leaves an independent invoice draft intact. The editor and recovery guidance now explain that drafts are included in workspace saving and backups.

Draft edits and document actions that exceed the 10 MiB workspace limit are rejected before replacing the current workspace. The prior records are preserved and the error explains that the edit was not applied. Signature imports also respect that result: a rejected import does not show a success notice or replace an existing signature.

**Saving remains asynchronous. Wait for “Saved on this device” before closing or reloading.** Core pending-write/conflict guards still apply. Drafts from an already-open older application version remain subject to that old version's memory-only behavior; copy or preserve old unfinished wording before deliberately refreshing. Backups containing the new draft extension require the updated application.

### Layout and accessibility repairs

- Home's ROI amount and suffix wrap independently with increased text spacing.
- The illustrative request list can wrap its source/status metadata without horizontal clipping.
- Workspace footer groups wrap/stack naturally instead of turning their text into competing narrow flex columns.
- Calendar date targets scale with text and retain the number inside their hit area.
- Decision choices, cost totals, margin comparisons, headings, assumption actions, and backup buttons accommodate enlarged text.
- Both license prices fit their cards on phone, tablet, and desktop. Their restrained type size uses the intended component rule rather than the old single-price display rule.

The layout regressions now wait for optional views to finish loading before measuring them. Calendar/PDF content may use deliberate internal two-dimensional scrolling; ordinary page overflow is checked separately.

### Loading and baseline response headers

The built server now negotiates Brotli/gzip for suitable text assets, provides ETags and conditional responses, uses long-lived immutable caching for hashed assets, and keeps HTML revalidated. Compressed representations are reused in a bounded file cache. Binary PDF samples remain intact, and HEAD responses retain correct representation headers without a body.

React, date libraries, and decimal arithmetic now have independently cached chunks. The largest main workspace chunk is about **297 KB**, down from about **707 KB**. Total raw initial JavaScript is roughly unchanged because the library chunks are still needed; measured network delivery benefits from compression and reuse.

The local server also sends explicit framing, referrer, and permissions headers. A compatible CSP and production HTTPS/HSTS review remain in Part 2.

## Verification

- **336 unit tests passed** across 20 files, including actual IndexedDB reopen, backup round-trip, stale/duplicate/foreign draft rejection, capacity protection, preserved snapshots, compression negotiation, conditional caching, HEAD, and changed-file invalidation.
- **TypeScript and the production build passed.** The former oversized-chunk build warning is gone.
- The broad browser workflow run passed 183 cases initially. Three old reload expectations were updated for durable drafts, with an explicit saved-state wait; all corrected cases pass in the focused final run.
- **15 final draft checks passed** in Chromium, Firefox, and WebKit, including reload, signatures, backups, issuing from history, independent document types, and explicit draft replacement.
- **18 final signature checks passed**, including rejected-import feedback at capacity, asynchronous import/context handling, frozen snapshots, responsive controls, and keyboard access.
- **51 site checks passed**; **15 relevant final site checks passed** after the layout refinements, including the new product-description contract check.
- **6 final component/form matrix checks passed**, covering 1,512 main-view layout records and 240 modal/form records in three engines and both themes.
- **9 final layout regressions passed**, covering both themes, 216 loaded-workspace enlarged-text/spacing combinations, Home ROI spacing, and license price bounds at six widths.
- **6 isolated licensing/export checks passed**, verifying one/five device allowances and actual protected exports. The latest Individual export was also repeated successfully in all three engines after the final signature-feedback change.
- The protected-export pages were rendered and inspected; the three inspected outputs had no extracted words outside page bounds.

Initial failed expectations and intermediate logs are retained. The first overlapping audit test runs also shared an artifact directory, causing one trace-cleanup failure; the final runs use separate artifact directories and pass. Those intermediate results are not represented as successful final checks.

Evidence is under [Part 1 verification](/Users/samaelsmacbook/Documents/scopeledger/output/implementation/part1-2026-10-08/). The final machine-readable results and benchmark values are in [summary.json](/Users/samaelsmacbook/Documents/scopeledger/output/implementation/part1-2026-10-08/summary.json).

### Performance comparison

With fresh browser profiles, cache disabled, 387 × 844 viewport, 1.6 Mbps download, 150 ms latency, and 4× CPU throttling, the representative median workspace LCP improved from approximately **4.7 seconds to 1.9 seconds**. Home improved from approximately **1.4 seconds to 0.75 seconds**. Final exact measurements are recorded with each run and resource header in the evidence directory.

This is a local synthetic comparison, not production field data. The intended host, physical phones, true OS/browser zoom, assistive technologies, real provider behavior, and expected production concurrency still need verification.

## Part 2 execution order

1. **Versioned source and releases:** repository, CI checks, staging, release identity, atomic rollout, old-asset retention, and rollback rehearsal.
2. **Real hosting and seller:** same-origin HTTPS routing, persistent database/secrets, non-root sandboxed renderer, trusted proxy identity, real configured products/receipts/license instructions, activation, export, release/recovery, outage, and refund/revocation checks.
3. **Final commercial information:** actual seller identity, monitored branded support, license/refund/privacy terms, applicable data-processing information, truthful storage/export allowances, and sustainable lifetime service costs.
4. **Production controls:** compatible CSP, HTTPS/HSTS, sanitized logs and retention, health/readiness and alerts, database/secret restoration, renderer queue/memory tests, and expired counter/session retention.
5. **Remaining product risks:** storage-capacity visibility and image/history scaling; confirmation of real issuer/currency/cost assumptions; precise search scope; meaningful project/document navigation and browser Back behavior; license-state refresh across tabs.
6. **Final human acceptance:** physical iOS/Android, desktop Safari/Chrome, screen readers, true zoom, PDF reading order, and a small uncoached real-user pilot.

Client acceptance links, payment automation, cloud collaboration, and capture integrations remain optional future features. They should be designed around real demand, costs, and privacy before they are advertised as included.

Paid launch must remain disabled until the real-host/seller/policy checks and the owner's explicit launch approval are complete.
