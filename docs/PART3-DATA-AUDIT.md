# Part 3 data, persistence, dashboard and calendar audit

Prior Part 3 audit: 4 October 2026. Follow-up domain review: 5 October 2026, Asia/Dhaka. Scope: `src/storage/`, `src/operational/`, their shared commercial/date contracts, and focused synthetic fixtures. The existing landing page was not edited. This report distinguishes verified data behavior from browser, device and production checks owned by the wider acceptance record.

## Passed

Prior Part 3 scoped command:

```sh
npm test -- tests/storage.test.ts tests/operational.test.ts --reporter=verbose --silent=false
```

The prior Part 3 baseline passed **62 tests: 29 storage and 33 operational tests**, plus strict TypeScript checking. The 5 October follow-up passed **200 scoped tests across eight files** after the timestamp and numeric-boundary repairs:

```sh
npx vitest run tests/finance.test.ts tests/operations.test.ts tests/operational.test.ts tests/storage.test.ts tests/commercial.test.ts tests/access.test.ts tests/comparisons.test.ts tests/toolkit.test.ts
```

The newer regressions cover unset legacy timezone consistency; imported basic ISO timestamps; exact approval/payment eligibility and chronological ordering; negative numeric underflow; and recommendations checked against an independent BigInt rational cent-ceiling oracle. The full-product build, browser and performance reruns are recorded in the consolidated [verification report](VERIFICATION.md).

| Area                                | Actual evidence                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable graph and drafts            | Native IndexedDB API exercised through fake-indexeddb: reopen, exact IDs/sequence, revisions/context, and unfinished numeric strings retained without coercion.                                                                                                                                                                                                                                                               |
| Failure and conflict                | Concurrent stale writes produce one winner; quota and explicit transaction abort roll back current and previous together; unavailable storage rejects truthfully; blocked BroadcastChannel still uses atomic sequence protection. These are simulated failures, not physical quota exhaustion.                                                                                                                                |
| Recovery                            | Corrupt JSON, mismatched envelope sequence, impossible dates, local timestamps without offsets, missing current records and valid previous records are exercised. Normal saves cannot overwrite recovery candidates. Deliberate replacement preserves corrupt raw bytes in quarantine.                                                                                                                                        |
| Migrations                          | Native schema 2 upgrades to schema 3 without changing IDs, sequence, numeric drafts or actual approval dates. Timed event instants remain unchanged and receive explicit timezone semantics. Flat v1 projects/snapshots preserve IDs, wording and metadata, including snapshots of absent projects. Undated legacy approvals become preserved history requiring dated reconfirmation; import time is never approval evidence. |
| Restore                             | Sample plus one custom project restores repeatedly without duplicates. A realistic graph includes dated approvals, reconciliation, a tax invoice, partial incoming cash, a voided payment, outgoing credit settlement, voided credit history, a logo and a linked subsecond timed reminder. Existing over-demo work loads/migrates; deliberate demo restore still enforces its allowance.                                     |
| Structural boundary                 | Unknown fields, unsupported versions, duplicate identities, orphaned relationships, stale approvals, repeated reconciliation, source impersonation and private snapshot fields are rejected. Issued snapshot identity/content cannot be rewritten by ordinary saves. Save/export/import share the 10 MiB UTF-8 limit.                                                                                                         |
| Dashboard                           | Sample exclusion; weighted contribution by currency; approved unincluded work exactly once before/after reconciliation; rejected/deferred/unapproved alternatives excluded; missing estimates remain unknown. Reconciled Exchanges use the preserved before-baseline for invoice attention.                                                                                                                                   |
| Issued values and cash              | Snapshot currency survives project currency changes and remains filterable. Known invoice subtotal/tax remains visible even when a legacy payment is invalid or future dated. Affected cash/outstanding totals become unknown, not zero. Voiding an invoice does not erase cash. Credits and outgoing settlements remain separate.                                                                                            |
| Historical records and future dates | Archive/trash filters retain accessible financial history and disclose hidden outstanding obligations. Unpaid invoice due sources survive project trash. Future approval/payment records remain importable; pending forecast and balances wait for clock/history review rather than rewriting the original data.                                                                                                              |
| Calendar semantics                  | Leap dates, midnight, month/year boundaries, Monday weeks, all-day inclusive ranges, active-agency dates and explicit IANA zones. Timed ranges span displayed days with an exclusive end; midnight ends do not occupy the following day. Mixed-offset times sort by actual instant. Ongoing ranges are not prematurely overdue.                                                                                               |
| Reminder/source integrity           | Manual create/edit/reschedule/complete/cancel/trash/recover retains IDs. Completion does not approve changes or pay invoices. Project deadlines derive from project state/date; invoice due completion/cancellation derives from payment/void state, including voided invoices with unknown payment history.                                                                                                                  |
| DST and export                      | Gaps/overlaps reject unless explicitly interpreted. Unchanged edits preserve the original fold instant and nanosecond precision. ICS has stable UIDs, escaped strings, CRLF and UTF-8 folding, exclusive all-day DTEND and UTC times. Subsecond intervals expand outward to valid whole-second export precision; stored instants stay exact.                                                                                  |

Related evidence is in [storage.test.ts](../tests/storage.test.ts) and [operational.test.ts](../tests/operational.test.ts). The broader browser and shared lifecycle tests are recorded separately; this scoped pass did not launch a browser.

## Repairs implemented

Legacy workspaces without a saved agency timezone now use the browser's resolved IANA timezone consistently for approvals, document dates, manual payments, Dashboard and Calendar; Asia/Dhaka remains the last fallback when no browser zone is available. Accepted imported ISO instants are converted through Temporal for display and ordered by their exact instants, including basic ISO time forms and nanoseconds. Imported source strings remain unchanged. New timestamp approvals retain accepted submillisecond precision; future approval/payment eligibility is recomputed against the current clock. Parsed history caches are bounded at 256 entries, rather than caching whether a record has occurred.

The shared money context now has **1,024 significant digits**. Executable scalar entries must be zero or nonnegative values from **10⁻¹⁰⁰ through 10²⁴**, within the existing 120-character numeric syntax limit. Unsupported, unfinished or legacy numeric text remains verbatim in local saves, backup exports and restore; validation explains the correction instead of substituting zero. The original mantissa is checked so Decimal.js exponent underflow cannot make a nonzero or negative input executable as zero.

This precision bound accounts for product tails, cancellation and repeating division near a cent. Conservatively, scalar decimal units can reach 10⁻²¹⁹ and products 10⁻⁴³⁸; exact sums/products need fewer than 490 digits. Restoration compares a repeating quotient with an approved fee plus a cent boundary: the nonzero separation can be as small as 10⁻⁶⁵⁷, while the quotient magnitude remains below 10¹⁷⁰. At 1,024 digits the arithmetic rounding scale stays far below that separation. An independent BigInt rational oracle verifies a cancellation fixture that previously returned 0.00 instead of 0.01, plus 100 combinations of extreme scalar values and target margins. This numerical guarantee relies on the stated input bounds and the current formulas; it does not remove the separately validated editable reconciliation ranges.

Dashboard aggregates separate known issued values from unknown payment balances, preserve immutable currency filters, retain source-specific record drilldowns and use reconciliation history for included Exchanges. Future pending approvals have a linked review notice and unknown contribution forecast. Original baselines and evidence stay intact. Invoice payment filters explicitly follow the document issue date; payment dates are not silently treated as that filter's basis.

Calendar uses a common interval model, preserves exact edited instants, sorts offsets correctly and keeps invoice obligations visible after project trash. Editor date/timezone errors appear inside the dialog. Reminder/deadline editors use the shared dirty-dialog guard: attempted Close, Escape or Cancel retains entries until Keep editing or Discard entries is chosen. Unsubmitted dialog fields are in memory, not a cloud or reload-safe draft. Reminder notes are explicitly disclosed as included in ICS export.

Operational font sizes use rem, outside-month dates use `#56677f`, cancelled/trash chips retain readable foregrounds, financial figures can wrap, and toolbars/banners/segments reflow. Final enlarged-text, contrast and responsive browser verification belongs to the wider UI audit, not these unit-test claims.

## Prior Part 3 performance measurements

Synthetic fixture: **300 projects, 1,500 changes, 300 issued invoices, 600 payments, 600 manual events**, five currencies; derived invoice events bring the calendar to 900 records. Its full backup is **2,607,909 UTF-8 bytes**. The fixture also verifies 300 incomplete drafts and 900 quotes without treating missing estimates as zero.

Prior baseline runtime: Node v26.0.0, macOS/darwin arm64. Each measurement was the median of five in-process runs after fixture construction, before the 5 October numeric/timestamp repairs. These are algorithm timings, not current UI responsiveness scores, device benchmarks or real disk write times; use the consolidated verification report for fresh measurements.

| Operation                      | Prior observed median |
| ------------------------------ | --------------------: |
| Build dashboard                |              56.74 ms |
| Derive/sort calendar           |               5.80 ms |
| Validate/serialize full backup |              17.52 ms |
| Parse/validate full backup     |              16.03 ms |

Reproduce with:

```sh
npm test -- tests/operational.test.ts -t 'crowded 300' --reporter=verbose --silent=false
```

Payment buckets, approval/reconciliation lookup maps and memoized views avoid repeated whole-history scans. Calendar day buckets avoid repeated timezone conversion for every cell. Pure date/timezone validation caches have a maximum of 256 entries each; clock-dependent eligibility is never cached. An earlier measured version spent about 83 ms serializing and 76 ms parsing this fixture, mostly repeating date/timezone validation.

Persistence still atomically writes the complete validated workspace and retains a previous version. The existing 10 MiB limit is unchanged. Immutable snapshots can repeat logos; this fixture does not measure a workspace filled with maximum-size branding images. Use a suitably optimized logo and check backup size. No promised paid functionality or safeguard was removed to make these measurements pass.

## Recovery instructions for the owner

1. On a failed save, keep the tab open and export the current backup from Settings. A successful calculation is not proof that a save succeeded. Exported drafts preserve unfinished numeric entries.
2. If storage is full or unavailable, preserve the backup first. Free device space or retry in the same browser/origin once storage works. Clearing ScopeLedger site storage deletes local work; a previous saved version is not an external backup.
3. If tabs conflict, export the current tab's edits before reloading the newest saved copy. Compare copies and deliberately restore only the one you intend to keep. Repeated blind retries cannot safely merge two independently edited graphs.
4. For corrupt data, download the untouched recovery copy, review a known-good previous version or external backup, then confirm replacement. Unsupported/malformed source data is never silently replaced with a fresh sample. Corrupt bytes remain available through repository quarantine after deliberate recovery; the original `scopeledger.v1` localStorage source is retained during migration.
5. Review future approval/payment warnings against the device clock and original evidence. Correct the clock when appropriate; void an incorrect payment, or reopen an incorrect approval as a draft and record dated confirmation. Preserve the earlier history.
6. Keep external backups somewhere you control. Backups and ICS files are unencrypted and may contain private client/workspace information. An ICS export is a file, not synchronization, email delivery or a closed-app notification service.

Implementation entry points: [repository.ts](../src/storage/repository.ts) (`load`, `save`, deliberate `restore`/`restorePrevious`, `getRecoveryRaw`, `parseBackup`, `prepareRestore`, `serializeWorkspace`), [useWorkspace.ts](../src/storage/useWorkspace.ts) (serial autosave, migration and conflict locks), [dashboard.ts](../src/operational/dashboard.ts), [calendar.ts](../src/operational/calendar.ts) and [dates.ts](../src/operational/dates.ts).

## Failed

No known failing scoped storage/operational check remains after these repairs. This is not a claim of zero defects in the full application.

## Blocked by external dependency

Physical iOS/Android storage, browser eviction behavior and production-host durability require supplied devices/a configured deployment. No such external environment was exercised in this scoped audit.

## Not tested in this scoped pass

- Physical quota exhaustion, power-loss durability, OS/browser eviction or real production disk latency; fake-indexeddb is not a substitute for these conditions.
- Final responsive/zoom/software-keyboard/accessibility appearance after CSS repairs; root owns the consolidated Chromium/Firefox/WebKit acceptance record.
- The crowded fixture's actual browser rendering, typing latency, maximum-size repeated logos, or data at every record/size boundary.
- Live Gumroad, purchase/refund, production authorization, actual exported PDF appearance and production secrets; those have separate owners/evidence.

Use the completed consolidated acceptance record for whole-product release decisions. This report's algorithm and simulated-storage results must not be relabeled as physical-device or live-production verification.
