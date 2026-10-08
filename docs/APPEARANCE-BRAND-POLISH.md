# Appearance, identity and detail refinement

Implemented locally on 7 October 2026, following [document signatures and responsive verification](DOCUMENT-SIGNATURES-VERIFICATION.md).

## Appearance

Home and workspace share System, Light and Dark choices through the existing `sl-theme` preference. New visitors follow their device. Existing manual Light or Dark preferences remain intact. System follows live device changes without turning the resolved color into a manual preference. Selections synchronize between open tabs and survive reloads when browser storage is available. Controls remain usable within the current page when storage is restricted.

All three entrypoints apply the preference before their first paint. The root color scheme, background and browser theme color follow the resolved appearance. Home has an accessible disclosure beside the navigation actions plus matching footer controls; the workspace has three aligned icon/label buttons with a short status hint. Escape dismisses the Home disclosure and returns keyboard focus to its opener. Choosing a mode also closes it. The manual choices override device changes until System is selected again.

## Visual changes

The [ScopeLedger identity](BRAND-IDENTITY.md) uses an original vector mark across Home navigation, footer, product preview, generated product badges, workspace branding, recovery/loading states and favicons. Subsequent identity refinements are described in that identity guide; the current identity returns to the user's preferred ledger-frame direction and lowercase wordmark in Home and workspace's charcoal/mint palette. Agency marks in client documents remain agency-specific.

The intermediate two-stroke replacement was built and checked separately on 7 October 2026 at 320, 768 and 1434 px, in both themes across Chromium, Firefox and WebKit (36 page visits). All logos loaded, navigation labels remained separated, and no horizontal overflow or page errors occurred. Favicon and navigation sizes were visually inspected. Evidence is in [minimal-logo verification](../output/audit/minimal-logo/verification.json); the earlier verification below retains its original scope.

The Home paper is a rasterized preview of the actual public brief. Opening it shows the same PDF that the sample-download button delivers. The sample brief and invoice have clearer studio/client sample metadata and preserve the premium document layout and signature areas.

Document history filters use equal columns, common control heights, aligned labels, and consistent chevrons with reserved text padding. They stack into full-width fields on phones. Appearance controls stack when workspace text is enlarged; the seven workflow steps wrap into readable rows instead of colliding inside a fixed seven-column strip. The evidence section uses a quieter grid of six specific product benefits, inspectable documents and a direct workspace action.

No genuine customer reviews were supplied. Unverified ratings, named endorsements, customer counts, recovery statistics and the fictional founder story were replaced with factual product copy. No invented customer testimony is presented as real. Genuine reviews can be added when approved source quotes and attribution are available.

## Demo watermark

Demo document previews now have a repeated diagonal ScopeLedger / DEMO PREVIEW watermark across the entire paper, plus a readable demo status line. It scrolls with the document and does not block focus or pointer interaction. Activated document previews and exports remain clean. Browsers cannot prevent screenshots; the watermark visibly identifies demo captures. Public sample files are deliberate downloads and remain clean, clearly identified samples.

## Verification

Final evidence is saved under `output/audit/appearance-brand/`. Automated checks cover live system changes, saved manual overrides, cross-tab updates, reloads, blocked storage, keyboard dismissal, original logo assets, actual sample files, filter alignment, screen bounds, automated accessibility and demo/active watermark behavior. Browser contexts, records and test licenses are isolated from owner data.

| Check                                                                | Result                                                          | Evidence                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unit/domain/persistence/server                                       | 328 passed, 20 files                                            | [Log](../output/audit/appearance-brand/unit.log)                                                           |
| Full Home/site/navigation replay                                     | 36 passed, three engines                                        | [Results](../output/audit/appearance-brand/site-polish-final-results.json)                                 |
| Final appearance, enlarged text, alignment, watermark and navigation | 18 passed, three engines                                        | [Results](../output/audit/appearance-brand/layout-final-results.json)                                      |
| Final seven-step workflow and everyday actions                       | 24 passed, three engines                                        | [Results](../output/audit/appearance-brand/workflow-final-results.json)                                    |
| Signature import/history/focus regressions                           | 15 passed, three engines                                        | [Results](../output/audit/appearance-brand/signature-results.json)                                         |
| Brief/invoice/credit iframe layout                                   | 3 passed, three engines                                         | [Results](../output/audit/appearance-brand/pdf-preview-results.json)                                       |
| Five protected exports, ten rasterized pages                         | Bounds, exact content, totals, fonts and imported images passed | [PDF report](../output/pdf/QA-REPORT.json), [font report](../output/audit/appearance-brand/pdf-fonts.json) |
| Public brief/invoice and Home preview bytes                          | Match the protected sample exports and raster                   | [Summary](../output/audit/appearance-brand/summary.json)                                                   |
| Strict TypeScript/production build                                   | Passed, with the existing bundle-size advisory                  | [Log](../output/audit/appearance-brand/build.log)                                                          |

The full site replay covers Home at 27 widths from 320 to 2560 px in both themes, with dialogs, route connections, price choices, failed-module recovery and accessibility checks across all nine workspace views. The final focused matrix additionally checks the new Home sections and appearance disclosure at 19 widths, document filters at ten widths, demo/active previews at three widths, and doubled workspace text at four widths, each across three engines and both themes where applicable. Guided workflow checks cover all seven stages, three widths and both themes, plus normal/reduced motion and guarded export behavior.

The 96 passing browser checks include deliberate focused replays. The full site suite precedes the last text-hint and enlarged-layout refinements; the final layout/appearance and guided-workflow suites run against those refinements. The [summary](../output/audit/appearance-brand/summary.json) and [source fingerprints](../output/audit/appearance-brand/source-fingerprints.json) preserve that scope.

An earlier audit exposed the primary button's one-pixel hover movement oscillating after a viewport resize when the pointer remained at its edge. Primary buttons now keep a stable position and use color/shadow feedback. Initial audit-harness issues—overlapping trace directories, sandboxed-iframe scanning and an invalid excluding-tax brief fixture—were corrected before the final clean replays. Prior diagnostic outputs are retained separately and excluded from final counts.

All ten latest PDF pages, normal/enlarged workspace controls and the revised Home sections were visually inspected. No owner workspace, form, activation record or browser tab was reset. Tests establish behavior for the configured viewports, engines and fixtures; they do not guarantee perfect behavior on every physical device or certify PDF/UA. Hosting and live checkout remain unconfigured; this change does not publish the site.
