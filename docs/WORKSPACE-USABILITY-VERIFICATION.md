# Workspace usability verification

Historical acceptance for the first usability refresh, verified locally on **6 October 2026**. The subsequent seven-step project workflow is covered by [project workflow verification](PROJECT-WORKFLOW-VERIFICATION.md). The workspace now puts everyday actions at the top, provides a context-aware next action and Request / Cost / Price / Review anchors, keeps project and request selectors together, simplifies Overview and Calendar filters, and offers direct document preparation/readiness routes. [The usability guide](WORKSPACE-USABILITY.md) lists the controls and keyboard shortcuts.

## Completed checks

| Check                                                                     | Result                                                                                    | Evidence                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Unit and domain/server tests                                              | 313 passed in 18 files                                                                    | [Unit log](../output/audit/ease/unit.log)                                                                                 |
| Operational workflows in Chromium, Firefox and WebKit                     | 150 passed; no failures or flaky results                                                  | [Full results](../output/audit/ease/workflow-final-results.json), [log](../output/audit/ease/workflow-final.log)          |
| Connected Home/workspace checks, both themes                              | 21 passed                                                                                 | [Results](../output/audit/ease/site-final-results.json)                                                                   |
| All nine views, 26 viewport sizes, dialogs, large text and accessibility  | 113 passed; one explicit Firefox mobile-emulation skip                                    | [Full results](../output/audit/ease/responsive-final-results.json), [log](../output/audit/ease/responsive-final.log)      |
| New usability journeys against the completed build                        | 39 passed across the same three engines                                                   | [Results](../output/audit/ease/usability-built-final-results.json), [log](../output/audit/ease/usability-built-final.log) |
| Mobile review/save/approval and reduced motion against the final build    | 9 passed across the three engines                                                         | [Results](../output/audit/ease/mobile-built-final-results.json)                                                           |
| Normal navigation through all nine views in both themes and three engines | 54 visits; zero console/runtime errors                                                    | [Runtime report](../output/audit/ease/runtime-final.json)                                                                 |
| Crowded synthetic workspace at 320px and 1440px                           | Passed: 300 projects, 1,500 requests, 300 invoices, 600 payment records and 600 reminders | [Report and figures](../output/audit/ease/crowded/crowded-browser.json)                                                   |
| Strict TypeScript and production build                                    | Passed                                                                                    | [Final build log](../output/audit/ease/build-final.log)                                                                   |

The new journeys verify search, arrow/Enter selection, disabled actions, typing protection, dialog focus/return, direct section navigation, repeated reminder creation, preservation of independent brief/invoice drafts, frozen document snapshots and command/help accessibility. At 320px and 390px, the main next action is visible in the initial phone screen in both themes. The original stacked-layer brand remains shared with Home.

## Repairs and evidence provenance

The initial shortcut run exposed a dialog focus-trap problem with negative-tabindex options. The modal now respects the actual tab order. Automated accessibility also identified unnamed shortcut spans; shortcut key groups now have valid accessible semantics. The reserved new-request chord is consumed while typing or inside dialogs so it cannot become an accidental form submission.

The first broad workflow run found that the new review scroll margin prevented the phone action from advancing. That run was stopped and preserved in [its log](../output/audit/ease/workflow-before-mobile-repair.log) and [results](../output/audit/ease/workflow-before-mobile-repair-results.json). Restoring the mobile review margin passed all nine affected checks across the three engines, followed by the clean 150-check workflow run. The full responsive/site scans above ran before that final scroll-only CSS correction; the final built usability suite and nine affected mobile workflow checks verify the completed artifact. No reports from the earlier connected-site task were overwritten.

The first normal-navigation harness applied its theme setup to sandboxed preview frames. It was corrected to initialize only the top frame; the clean 54-visit result above measures application errors without that injected harness error. Normal isolated browser contexts were used throughout; the owner's workspace and forms were not reset.

Eight crowded phone captures and the default dark/light workspace, Documents, Overview, Projects and command palette were visually inspected. Large totals and invoice balances remain readable; no clipped controls or material hierarchy issues were found. [Source fingerprints](../output/audit/ease/source-fingerprints.json) identify the final UI source.

## Reproduce and practical limits

Run `npm test`, `npm run build`, `npx playwright test --config playwright.usability.config.ts`, `npm run test:cross-browser`, `npm run test:site` and `npm run test:audit`. The usability configuration tests the production build on port 4173. The cross-browser configuration tests development on port 5173. Each origin retains independent local records.

These checks cover supported browser engines and automated accessibility; they do not establish perfect behavior on every physical device, assistive technology or keyboard layout. Vite still reports the existing main-chunk size advisory. Hosting and real checkout are not configured, and no production deployment is claimed. The PDF renderer and commercial/security contracts were preserved; prior PDF/backend acceptance remains in [site verification](SITE-VERIFICATION.md).
