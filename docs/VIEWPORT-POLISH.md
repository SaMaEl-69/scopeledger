# Responsive polish

Updated on 7 October 2026.

The Home purpose card now uses the approved ScopeLedger wordmark as one compact identity. The old mobile grid let its tagline widen the symbol's column and pushed the name to the far side. The new layout keeps the logo, tagline and baseline/change/brief explanations aligned, with a smaller mobile headline and consistent inner spacing.

The sample-download caption and button now wrap without overlapping. Small phones get a centered caption and a full-width, 44 px tall action. The demonstration image's accessible description now identifies ScopeLedger. The mobile access action respects safe areas.

Workspace actions keep their padding when a label wraps. They retain two columns at ordinary mobile text sizes and can use one column with enlarged text. Home search now shrinks its scrollable results to the available screen height while keeping its input and keyboard hint visible. Its input uses 16 px text.

Evidence is under `output/audit/viewport-polish/`; `summary.json` records results and source fingerprints. Checks used isolated browser contexts without resetting the owner's projects or drafts.

- Home: 35 widths from 320 to 2560 px, both themes, Chromium/Firefox/WebKit; 210 layout combinations, including checks around breakpoints. Each main section was visited; logo proportions, action text and download-control geometry were checked.
- Workspace: 33 Chromium checks, including all nine views at 26 sizes in both themes, landscape, enlarged text, mobile dialogs, keyboard focus, touch entry and automated accessibility. This full pass preceded the final action-label refinement.
- After that refinement: 14 Firefox/WebKit checks replayed all nine views at seven representative widths, in both themes. Six focused cross-browser checks verified action padding and doubled text, plus Home search at heights down to 300 px.
- The seven guided steps passed in all three engines at 320, 768 and 1440 px, both themes. The 27 site checks passed, including menus, access dialogs, connected navigation, theme contrast and fallback behavior.
- Brief, invoice, credit and large-total previews passed 60 cross-browser cases at 280–1024 px.
- Production build and changed-file formatting passed. The existing large-bundle advisory remains.

The changed card, mobile download controls, ordinary and enlarged workspace actions, and short-screen search were visually inspected. These checks establish the tested layouts and fixtures, not every possible screen or user input. Document content and PDF artifacts were unchanged by this pass.
