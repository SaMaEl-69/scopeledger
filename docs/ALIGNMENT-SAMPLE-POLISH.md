# Alignment and sample identity polish

Updated locally on 7 October 2026.

The dark Aster badge in Home came from the QA image embedded in the public sample brief. Public brief and invoice samples now use the document's typographic Aster Studio identity on white. An identical legal name is no longer repeated below a text wordmark; distinct legal names and identity below an uploaded logo remain visible. The uploaded-logo stress fixture retains its image to verify that agency uploads still work.

The Home preview is rasterized from the regenerated protected brief export. Both downloads and the preview use new cache versions. Public and built sample bytes match. The workspace's agency initial now uses the existing green/mint appearance roles rather than a stark neutral block.

The mobile menu's generic link rules previously overrode the access action's padding and centering. The action now centers its text with consistent padding, including when it wraps. The menu scrolls within short landscape screens, keeping the access action reachable. Brand symbol and lettering now share the same optical center. Workspace controls reserve the icons' dimensions; the agency name can wrap without squeezing its status indicator.

Enlarged-text review also exposed the Shortcuts action floating halfway down a wrapped action-button group. It now aligns with the first action row and shares the buttons' control height. Loading placeholders are excluded from the view audit, so the checks measure the loaded view.

Evidence is retained under `output/audit/alignment-polish/`. Owner browser data, projects, form drafts and agency uploads were not reset. Existing issued documents were not rewritten.

Verification:

- 33 document unit checks passed, including identical/different issuer identities and uploaded logos.
- 42 Home/site checks passed across Chromium, Firefox and WebKit, including mobile access centering, landscape scrolling, enlarged menu text, appearance, navigation and automated accessibility.
- The initial workspace matrix passed 21 checks: all nine views, seven widths from 320 to 2560 px, both themes, and three engines (378 view visits). Icons stayed centered in controls and action text stayed within its bounds.
- The final Shortcuts correction passed six additional workspace checks at 768 and 1440 px across three engines (108 view visits), plus 36 enlarged-text view checks in Chromium at 768 and 1440 px in both themes.
- Three document iframe checks passed across three engines, covering brief, invoice, credit and large totals at 280–1024 px.
- Five actual protected PDF fixtures, ten rasterized pages, content bounds, totals, signatures and confidentiality checks passed. The two public downloads and Home preview match the regenerated exports.
- Strict TypeScript/production build and formatting passed. The existing bundle-size advisory remains.

The full Home and initial workspace matrix precede the last Shortcuts-row refinement. The final workspace replays and enlarged-text checks verify that refinement. [Summary](../output/audit/alignment-polish/summary.json) and [source fingerprints](../output/audit/alignment-polish/source-fingerprints.json) preserve the scope. The sample pages, mobile menu, ordinary/enlarged workspace controls and the ten-page PDF contact sheet were visually inspected. These checks cover the specified fixtures and viewports; they are not a guarantee for every possible device or user input.
