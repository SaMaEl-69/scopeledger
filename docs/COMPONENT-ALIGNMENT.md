# Component alignment verification

Updated locally on 7 October 2026.

The shared control styles now give dropdowns, date fields and numeric fields the same text-scaled height. Dropdown arrows have a consistent size and inset, and Lucide icons retain square proportions when compact breakpoints change their width.

Mobile quick actions align their leading icons and labels down each column. Recovery and calendar notices use aligned icon, copy and action columns. On narrower screens, their actions share the copy's left edge. Suggested-fee actions follow the amount field's row rather than relying on a fixed top margin; small phones get a full-width action beneath the amount and its explanation.

Wrapped checkbox labels align with the first text line. Paired fields adapt to available width and enlarged text, including baseline and reminder dialogs. Project planning has consistent vertical spacing when its fields stack. Project metrics, classification choices, history tabs, backup controls and support actions reflow without widening the page. The mobile decision bar can stack its action below the margin value and reserves enough content space beneath it.

Evidence is retained in `output/audit/component-alignment/`, including before/after measurements, screenshots, browser results, build diagnostics and source fingerprints. Browser checks used separate contexts and retained the owner's workspace and drafts.

Verification covers:

- All nine workspace views in Chromium, Firefox and WebKit: 24 widths from 320 to 2560 px, both themes, plus doubled text at 320, 387, 768 and 1440 px. The final matrix opens additional Overview filters and project planning before measuring. This represents 1,512 view/layout combinations. Checks include paired control positions and heights, icon dimensions and centering, action-column edges, checkbox alignment, dropdown padding, suggested-fee alignment, decision-bar layout and page overflow.
- Baseline, duplicate-project, all-day reminder and timed reminder forms: 240 layout combinations across three engines, both themes, five phone/tablet/desktop/landscape sizes, and ordinary/doubled text. Native selection, date entry, numeric entry and keyboard checkbox interaction passed.
- Home: 210 layout combinations across 35 widths and three engines, both themes; section reflow, brand proportions, action labels and sample-download geometry. Short-screen search and workspace action-padding checks also passed. The final dialog and planning-gap refinements are scoped to workspace components.
- Seven guided steps at 320, 768 and 1440 px in both themes across three engines, plus the explicit brief-export journey using a mocked export response. This verifies the UI journey; it does not revalidate PDF rendering.
- Chromium checks for automated accessibility across views and dialogs, focus trapping and restoration, dirty-dialog handling, phone/landscape dialog scrolling, touch entry after a keyboard-sized viewport reduction, and large financial values/unfinished inputs.
- Strict TypeScript/production build and changed-file formatting passed. Vite continues to report the existing large-bundle advisory.

The mobile Overview, paired planning controls, fee panel, document-history filters, enlarged decision bar, narrow/enlarged cards, Home purpose card and modal forms were visually inspected. These results cover the listed layouts and fixtures. Document content and public PDF artifacts were unchanged in this pass.
