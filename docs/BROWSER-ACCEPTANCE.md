# Part 3 browser and responsive acceptance

> **Historical record.** This preserves browser acceptance before the 6 October 2026 Home/workspace integration. Counts, timings and conditions below belong to that earlier release. For the current connected site, use [site verification](SITE-VERIFICATION.md). Preserved reports are linked below; the PDF archive contains the earlier files and reports, without archived raster page images.

Audit: 4–5 October 2026. Automated contexts are isolated, synthetic, one worker and Asia/Dhaka. The user's workspace is not reset. Runs launch browsers sequentially. Local preview is [ScopeLedger](http://127.0.0.1:5173/app).

## Workflow coverage

The coordinated document-design workflow run passed **111/111 tests in 5.8 minutes**: 37 each in Chromium, Firefox and WebKit. It covers reference results and phone save/approval; scenario replacement; demo allowance including archive/trash; exact-once reconciliation; stale approval history; unfinished numeric reload; fresh/repeated backup restore; failed saves and current-edit export; in-flight drain; conflicting tabs; blocked BroadcastChannel/IndexedDB; valid legacy migration and invalid raw recovery; fabricated premium claims; private-field-free demo briefs.

Integrated journeys cover independent comparisons, actual client wording, composer edits/purpose switches, unissued document navigation/type switches/replacement, manual reminders/reload/ICS and completion semantics, readiness links, issued invoices/partial cash/frozen defaults, project duplication with source history preserved, custom scenarios/assumptions, actual logo upload/replacement/removal/invalid upload/backup. Composer reset confirms replacement of edited text. Reduced-motion tests verify instant mobile result/readiness navigation. [Final workflow JSON](../output/audit/multipage-workflows-before-integration.json) records all 111 passes, including the two new per-engine document-workbench journeys for invoice entry, independent drafts, approval lock, chronology, history/filter/focus recovery and frozen partial balances. The eight additional journeys per engine cover current-edit export before failed-save reload, comparison replacement, visible captions and hints, true project state and filtered empty views, chronological recent projects, timezone preservation, complete queues and basic ISO reminders.

Chromium uses installed macOS Chrome 154.0.8037.97; Playwright Firefox 155 and WebKit 26.6 are automated desktop engines. WebKit is not a physical iOS device or Apple's installed Safari application. [Runtime evidence](../output/audit/browser-environment.json) records actual `browser.version()` values and Node 26/macOS arm64.

After the final internal-ID display correction, [18 affected document journeys](../output/audit/document-workflow-final-subset-results.json) pass in 1.3 minutes (six per engine): invoice shortcut, separate temporary drafts, approval lock, chronological/filterable history, immutable partial balances, readiness, preview privacy and reduced motion. The full 111-test result remains separately preserved.

## Responsive matrix and conditions

The final built-application run passed **113 checks / 1 explicit skip / 0 unresolved failures in 15.3 minutes**. It is one complete run after the document refinement and internal-ID display correction. Counts come from this run only; historical and interrupted runs remain separate. Each engine visits all nine primary views at all 26 dimensions; assertions include navigation, context, settled drawer state, page width and a 16 px minimum for visible phone text controls. [Final raw report](../output/audit/multipage-responsive-before-integration.json), [summary/provenance](../output/audit/multipage-responsive-summary-before-integration.json).

The preceding complete run passed 107 cases and exposed three WebKit native-control overflows. All 12 affected reruns passed, then the whole final matrix passed. [Before final readability repair](../output/audit/polish-responsive-before-final-readability.json), [affected reruns](../output/audit/polish-final-targets.json). The earlier interrupted phone-font run is also retained; it is not counted as completed coverage.

| Coverage          | CSS dimensions                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Phones            | 320×740, 360×800, 375×812, 390×844, 430×932                                                |
| Tablets           | 600×900, 768×1024, 820×1180, 1024×768                                                      |
| Laptops/desktops  | 1280×900, 1366×768, 1440×1000, 1536×960, 1920×1080, 2560×1440                              |
| Short landscape   | 844×390                                                                                    |
| Transition widths | 469×800, 471×800, 699×900, 701×900, 759×900, 761×900, 899×900, 901×900, 1199×900, 1201×900 |

Chromium, Firefox and WebKit each cover all nine views at all 26 dimensions, plus shared input/accessibility/recovery cases. Long document selections are also checked at all 26 dimensions in every engine, including native control focus with doubled text. The only skip is unsupported Firefox mobile-context emulation; desktop Firefox keyboard/phone-width coverage still runs. No full-view dimensions are deliberately skipped.

Additional cases exercise:

- Axe WCAG A/AA tags across nine views and Create project dialog; no detected violations is limited to the scanned DOM/rules, not full accessibility certification.
- Keyboard editing, Tab trapping, Escape, Keep editing/Discard, return focus, and narrow/short dialog scrolling.
- Scenario, comparison, composer, baseline, reminder, project and locked-activation dialogs at 320×740 and 844×390.
- All views at 640×768 and 320×768 as 200%/400% reflow-equivalent widths for a 1280 px layout; all views at 768×1000 with root text size doubled.
- Touch emulation at 390×844, reduced to 390×360 during entry as a software-keyboard obstruction proxy; Firefox's unsupported mobile-emulation case is skipped explicitly.
- Very large finite financial figures, unfinished invalid numbers, a truthful draft warning and reachable save action at 320 px.

An earlier native Chrome inspection visibly confirmed 200% browser zoom. Final native 400% inspection could not be completed while native browser focus was in use; it remains **not tested**. Automated narrow reflow is recorded separately and is not presented as actual browser zoom or physical-device testing. No physical iOS/Android devices or real software keyboard were available. Mouse/keyboard automation and emulated touch do not establish hardware behavior.

The three public-preview checks additionally visit four document fixtures at five widths (280, 320, 600, 760 and 1,024 px), totaling 60 visits across the engines. They assert complete references/totals, no private cost copy or internal UUID, and no internal horizontal overflow. A [final preview rerun](../output/audit/document-preview-final-subset-results.json) repeats those checks with distinct per-kind screenshot filenames; all 12 final phone captures were independently visually reviewed. Automated Axe scans cover the outer app; sandboxed iframe document structure and visuals are checked separately. Actual reader/PDF-UA evaluation remains unperformed.

## Actual allocation, rendering and release

The actual generated-key suite passes **6/6 in 18.8 seconds**, two journeys per engine. [Machine-readable result](../output/audit/multipage-local-before-integration.json). Each engine uses an isolated temporary loopback backend, database, secret and generated keys with the actual built application. Cleanup removes temporary test data; no owner private files are used and production mode is rejected. Individual activates, creates extra projects, downloads a real protected PDF, verifies repeated export taps share a renderer job, and releases without deleting work. Agency allocates five independent contexts, denies a sixth, releases only the current device, permits a replacement and preserves other activations. Unauthorized other-device removal is rejected. Cleanup releases generated fixtures. Tracing remains off to avoid capturing keys.

These call real development SQLite/allocation/rendering. An initial shared-server run hit the correctly enforced 20 activation attempts/IP/hour limit after five passing journeys; isolating backend databases fixes the harness while retaining that rate limit. [Original evidence](../output/audit/local-browser-before-isolation.json). Provider failure tests separately mock Gumroad. No live purchase, payout, seller onboarding, deployed HTTPS cookie behavior or refund is established.

## Difficult states and evidence

Typical/empty sample-excluded operational views, locked activation, incomplete drafts, invalid uploads, restore replacement, recovery and save failures are included. Crowded browser fixtures cover 300 projects, 1,500 changes, 300 invoices, 600 payments and 600 manual events at 1440×1000 and 320×740, including 300 visible timed agenda rows, five currency groups, asserted USD contribution/invoice/cash/outstanding totals and an $840 invoice with $480 recorded/$360 outstanding. The final graph is 2,637,341 bytes. Screenshots were visually inspected, including phone agenda and issued balances. [Crowded evidence](../output/audit/multipage-crowded-before-integration.json).

Durable artifacts are in [output/audit](../output/audit/); failures/traces are in ignored `test-results`. Browser automation never clears the user's local data. Earlier PDF files and reports are in the [preserved PDF archive](../output/pdf-before-multipage/); the original raster page images were not archived. The [acceptance record](VERIFICATION.md) separates passed, failed, external-blocked and not-tested gates.

## Reproduction

```sh
npm run build
npm run test:cross-browser
npm run test:audit
npm run test:local-browser
# Start npm start in another terminal before the following:
npm run test:crowded
npm run test:performance
```

Install the Firefox/WebKit test browsers with Playwright's official installer when absent. `PLAYWRIGHT_CHROME_PATH` can select installed Chrome for the audit/workflow tests. Run build before starting built-app acceptance; do not replace hashed assets during an active run. Publish atomically and retain prior hashed assets for existing tabs. Twelve built-chunk recovery/delayed-field checks pass across the three engines: failed routes retain core edits, Settings backup remains usable, newer edits invalidate earlier recovery exports, a failed comparison remains closable, and delayed readiness navigation focuses the requested field after load. Missing routes offer controlled recovery without claiming a lazy retry. Temporary unsubmitted entries are disclosed before reload.
