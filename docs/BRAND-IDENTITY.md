# ScopeLedger identity

The current identity returns to the two-frame ledger direction preferred by the user. The upper frame is the full agreed scope entry. The smaller, offset lower frame is a separately recorded change. Both remain bounded and aligned, reflecting the product's purpose: make the original agreement and each commercial change clear.

The two outlined frames have consistent 2.6-unit bands, a restrained rising angle, and a clear separation at small sizes. The upper frame is 26 units wide; the lower frame is 23 units wide. Their different widths and positions give the ledger symbol its own proportions. Navigation and favicon use the emblem on transparency, without a containing tile. The favicon uses deep green on light browser surfaces and mint on dark browser surfaces.

The lowercase `scopeledger` wordmark restores the earlier visual direction. It uses outlined DM Sans Bold with fixed letter spacing and a small accent full stop. SVG outlines keep the typography consistent across platforms.

The colors match Home and workspace: charcoal `#0e0f11`, light-surface text `#0c0d10`, deep green `#00683d`, mint `#5ef0a8`, and dark-surface text `#f2f3f5`. Both light and dark variants use the same geometry. The monochrome emblem works as a single ink mark.

Home navigation and footer use a 150 px wide lockup; the workspace uses 166 px. The hero product card uses 131 px. Keep the aspect ratio intact and allow at least half the emblem's width around standalone artwork. Use the emblem alone when there is insufficient room for the complete name. Client documents retain the agency's branding.

Assets:

- [Light-surface logo](../public/brand/scopeledger-logo-light.svg)
- [Dark-surface logo](../public/brand/scopeledger-logo-dark.svg)
- [Light-surface emblem](../public/brand/scopeledger-mark.svg)
- [Dark-surface emblem](../public/brand/scopeledger-mark-dark.svg)
- [Monochrome emblem](../public/brand/scopeledger-mark-monochrome.svg)
- [Favicon](../public/brand/scopeledger-favicon.svg)
- [Font attribution](../public/brand/FONT-LICENSE.txt)

Theme variants follow the application's resolved `data-theme` value, including manual choices and live system changes. Entry points use versioned image URLs. Navigation controls retain accessible ScopeLedger labels while decorative image pairs stay hidden from screen readers. Product avatar badges use the same ledger geometry.

The editable artwork, generation record, and before-assets are retained in `output/audit/ledger-return/`. Earlier identity audits describe earlier marks; this guide describes the current identity.

Verification on 7 October 2026 covered 36 Home/workspace layouts: 320, 768 and 1434 px, both themes, and Chromium, Firefox and WebKit. Loading, accessible names, clipping, navigation alignment and horizontal overflow checks passed without page errors or failed brand requests. Twelve manual appearance switches and the logo's Overview action also passed. The emblem and favicon were visually inspected at 16–64 px. All six production assets match the sources. TypeScript and the production build passed with the existing bundle-size advisory. See [browser checks](../output/audit/ledger-return/verification.json), [asset fingerprints](../output/audit/ledger-return/assets.json), and [build log](../output/audit/ledger-return/build.log).
