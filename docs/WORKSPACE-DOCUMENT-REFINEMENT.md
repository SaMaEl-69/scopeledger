# Workspace and document refinement

Historical acceptance for the preceding redesign. The newer signature/document layout and viewport audit are recorded in [document signatures and responsive verification](DOCUMENT-SIGNATURES-VERIFICATION.md); stable PDF paths now contain that later version.

Implemented locally on **6 October 2026**. The seven-step project sequence remains intact, with simpler controls and a restrained document design. Previous acceptance records retain their historical counts.

## Easier workspace

The focused workspace uses one centered form, a quieter step strip and a persistent Back/Continue bar. The change type and response choices use plain language. Costs are labelled Hours needed, Hourly cost and Extra expenses. The fee's compact cost/margin summary and agreement checkbox appear immediately after the proposed fee. Optional credit and timing settings are clearly labelled disclosures.

Detailed charts and recommendations are available under View financial breakdown. Save, approval and approved-work inclusion actions remain available. Show all steps restores the established complete editor, including the hourly slider, response tools, history and detailed labels. Find anything and the guarded keyboard shortcuts remain available.

Keep this request for later in Costs explicitly selects deferral without filling unknown values. Its focused Fee view hides unused fee and agreement inputs. Switching back to a charging response restores the cost/agreement requirements. No additional charge uses the existing zero-effective-fee rule while retaining the previously entered proposed fee. None of these presentation changes automatically quote, approve, reconcile, issue or settle records.

## Document design

Briefs, invoices and credits share a white-paper layout with embedded **DM Sans** body text and **Space Grotesk** headings. References are quiet text; aligned labels and content replace decorative cards. Fees and invoice totals use tabular figures and a clear type hierarchy. Agency logos remain fitted without distortion, and the selected agency color appears once in the letterhead rule. Page footers carry the document reference and page count.

The design uses ink `#202326`, body text `#373b3f`, muted text `#656b70`, rules `#d9dddf` and white paper. Small briefs use a labelled text grid; long authored sections use full-width paragraphs for readable pagination. Ordinary brief, invoice and credit samples fit on one A4 page. The long brief uses five pages and the long-name/large-total invoice uses two. All ten generated pages were visually inspected.

The shared template updates both the in-app preview and authorized downloads. The Home sample brief/invoice and built samples match the updated PDF bytes. The synthetic sample documents request no payment. The original uploaded/reference content, financial values and stored snapshots are retained; the renderer applies the new typography to preserved values.

Fonts are embedded as trusted data resources, so rendering needs no remote font requests. The existing script/network restrictions, private-field allowlist, decimal checks, approval rules, export authorization, quotas and duplicate-job guard remain. Font redistribution licenses are retained in `shared/dm-sans-LICENSE.txt` and `shared/space-grotesk-LICENSE.txt`. The footer escapes the reference before inserting it into HTML.

## Current checks

| Check                                                                            | Result                                                                                         | Evidence                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unit, financial, data and server tests                                           | 313 passed in 18 files                                                                         | [Log](../output/audit/refinement/unit.log)                                                                      |
| Full operational workflows, three browser engines                                | 168 passed                                                                                     | [Results](../output/audit/refinement/workflow-results.json), [log](../output/audit/refinement/workflow.log)     |
| Focused workflow, document and shortcut journeys against the production build    | 57 passed                                                                                      | [Results](../output/audit/refinement/usability-results.json), [log](../output/audit/refinement/usability.log)   |
| Real activation, PDF download, duplicate-click and device-slot journeys          | 6 passed                                                                                       | [Results](../output/audit/refinement/backend-results.json), [log](../output/audit/refinement/backend.log)       |
| Public previews, automated accessibility, focus, enlarged text and narrow reflow | 32 passed; one Firefox mobile-emulation skip                                                   | [Results](../output/audit/refinement/responsive-results.json), [log](../output/audit/refinement/responsive.log) |
| Home/workspace connection, branding, pricing and theme checks                    | 21 passed                                                                                      | [Results](../output/audit/refinement/site-results.json), [log](../output/audit/refinement/site.log)             |
| Normal navigation and all guided stages in both themes                           | 96 visits; zero console/runtime errors                                                         | [Report](../output/audit/refinement/runtime-final.json)                                                         |
| Five real protected PDF fixtures                                                 | Passed: totals, paragraph integrity, page bounds, tags, outlines, language and confidentiality | [PDF report](../output/pdf/QA-REPORT.json), [inspection log](../output/audit/refinement/pdf-inspection.log)     |
| Embedded document fonts in all five fixtures                                     | Passed                                                                                         | [Font report](../output/audit/refinement/pdf-fonts.json)                                                        |
| Home and built sample PDFs match the final artifacts                             | Passed                                                                                         | Compared against `output/pdf/change-brief.pdf` and `output/pdf/invoice.pdf`                                     |
| Strict TypeScript and production build                                           | Passed                                                                                         | [Build log](../output/audit/refinement/build.log)                                                               |

The focused layout journey includes 126 combinations of seven stages, three widths, two themes and three engines, plus 42 automated WCAG scans at 320px. These are included in the browser counts above. The new response journey checks plain-language choices, preserving unknown estimates during deferral, restoring charging requirements and a zero-fee brief without changing stored proposals or financial records.

## Provenance and limits

The preceding renderer, UI source and five PDFs are preserved in `output/audit/refinement/before/`. This task's reports are separate from the preceding sequence acceptance. Browser contexts and backend test databases are isolated; owner records, license keys and unfinished forms were not reset. Operational regression journeys use Show all steps; focused journeys test the new default presentation. Nine affected follow-ups and three delayed-view focus checks passed before the clean final replay. The first full replay identified a delayed focus/scroll race during rapid Firefox step selection, plus reload assertions that still expected the full editor's original labels. Focus now resolves before paint with an immediate scroll; delayed lazy-view targets still use the existing observer. Reload assertions explicitly reopen the full editor. A new rapid-navigation journey covers normal and reduced motion without changing records. The preceding run is preserved in `workflow-before-focus-fix.log` and `workflow-before-focus-fix.json`.

PDF content checks now use normalized PDF text in stream order, while visual word bounds still use pdfplumber. This keeps wrapped labels in the new grid from being mistaken for missing headings. Checks for financial totals, confidentiality, paragraph integrity and page counts remain. Font checks inspect the actual embedded font descriptors. Visual review covers everyday and stress documents. [Source fingerprints](../output/audit/refinement/source-fingerprints.json) identify the final UI, shared template, fonts, renderer and sample artifacts.

These checks do not establish perfect behavior on every physical device, keyboard layout or screen reader, or PDF/UA compliance. Firefox cannot run the backend's mobile-context emulation test; its narrow-screen and keyboard checks do run. The existing Vite bundle-size advisory remains, and embedded fonts add to the shared template's bundle. Hosting and live checkout remain unconfigured.

Run `npm test`, `npm run build`, `npm run test:pdf`, the bundled Python with `scripts/inspect-pdfs.py`, and the usability/cross-browser/local-browser/site Playwright configurations. Set `SCOPELEDGER_SEQUENCE_OUTPUT=output/audit/refinement` to keep current guided screenshots and runtime evidence separate. [The usage guide](WORKSPACE-USABILITY.md) describes the current controls.
