# Phase 1 — ScopeLedger SEO audit and validation

Observed 11 October 2026. Branch `seo/audit-and-validation`, based on main `9c974f9a9c6144a398554a34b9409f19cecdc761`. This is a validation-only PR; no production deployment or content changes were made. No package.json, lockfile, dependencies, public HTML, sitemap, robots.txt, schema, routing, noindex, licensing, activation, workspace security, pricing, or claims were changed. [Coverage recorded before adding checks](../seo-phase1-coverage.md).

## Observed command results

The linked logs contain unfiltered stdout/stderr, including warnings. Commands were redirected with `> filename 2>&1` and their actual exit codes retained. No audit response, test result or browser report was mocked.

| Exact command                                                                                      | Observed result                                                                                           | Raw output                                               |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `npm run build` before adding stricter gates                                                       | Exit 0; created the real production `dist` audited below                                                  | [Baseline build](raw/baseline-build.txt)                 |
| `npm run build` with this PR's gates                                                               | Exit 1 in prebuild; 3 strict failures, 4 length warnings. TypeScript/Vite did not run in this invocation  | [Build](raw/build.txt)                                   |
| `npm run test:seo`                                                                                 | Exit 1; 3 strict failures, 4 warnings                                                                     | [Source check](raw/test-seo.txt)                         |
| `node scripts/audit-links.mjs`                                                                     | Exit 1; 9/9 served pages, 36 real HTTP responses, 31 failure messages                                     | [Links](raw/audit-links.txt)                             |
| `SCOPELEDGER_SEO_ORIGIN=http://127.0.0.1:4173 npm run test:seo:live`                               | Exit 1; 30 failure messages, 4 warnings                                                                   | [Local served check](raw/test-seo-served.txt)            |
| `npm run test:seo:live`                                                                            | Exit 1 against actual production; 30 failure messages, 4 warnings                                         | [Production check](raw/test-seo-live.txt)                |
| `npx playwright test --config playwright.site.config.ts tests/site/seo.spec.ts --project chromium` | Exit 1: both strict CLI gates failed; all 18 viewport checks passed; no skipped tests in this 20-test run | [Playwright](raw/playwright.txt)                         |
| `npm run typecheck`                                                                                | Exit 0                                                                                                    | [TypeScript](raw/typecheck.txt)                          |
| `npm test`                                                                                         | Exit 0: 474 tests across 30 suites passed                                                                 | [Unit tests](raw/unit-tests.txt)                         |
| `SCOPELEDGER_SEO_ORIGIN=https://scopeledger.site node scripts/audit-images.mjs --dom`              | Exit 0: 94 img/visible-SVG elements, 51 report-only findings, 0 unverified fetches                        | [Image command](raw/images.txt), [full table](images.md) |
| `node scripts/check-source.mjs` before staging                                                     | Exit 0; 289 tracked paths, no matched private paths or credential patterns                                | [Source scan](raw/check-source.txt)                      |

The initial `dist` came from an ordinary successful `npm run build` before extending checks. Public files and application code are unchanged in this PR; no later failing gate was bypassed to manufacture a build. The final Playwright run started `npm start` via the existing `playwright.site.config.ts` / `playwright.audit.config.ts` webServer setup, then the SEO and link scripts requested that real production server. It used the existing Chromium project's default installed Google Chrome executable, without changing browser configuration. The direct link command also requested that same production server implementation, not static files. The managed Playwright Chromium needed for Lighthouse is a different, missing executable.

## Verified contracts and measurements

- Nine manifest/sitemap URLs match exactly, use the plural `sitemaps.org` namespace, and match the required lowercase trailing-slash route pattern. Existing lastmod values remain unchanged.
- Exactly one title, description, canonical, H1 and viewport declaration per public page; unique titles/descriptions across pages. No public meta robots or X-Robots-Tag contained noindex in the checked responses.
- All nine actual public pages returned 200 for all three tested user-agent strings. These strings do **not** establish crawler identity or indexing.
- Canonicals and og:url are absolute and self-referencing. Every og:image is the same absolute PNG URL, returned 200 locally and live, and its header bytes measured exactly **1200 × 630**, **66,583 bytes**. No image library was used. The JPEG parser was also exercised against the existing real JPEG fixture (640 × 160, 13,769 bytes): [raw header output](raw/image-headers.txt).
- JSON-LD parses. Existing BreadcrumbList items have ordered positions, names and required URLs; WebSite nodes have name/url. Article/Organization have no universally required Google properties; their actually provided fields/references/dates are validated without adding content. AboutPage/WebPage/CollectionPage/ItemList are not assigned invented Google rich-result requirements. WebApplication eligibility gaps are listed below.
- Source robots.txt has exactly one matching Sitemap directive. No Disallow rule matched the nine routes or the inventoried public CSS/JS/image/font paths. Built HTML had no hard-coded HTTP link/resource attributes or CSS URL resources. SVG namespace declarations are identifiers, not fetched resources.
- No link audit request returned 404; no multi-hop redirect chain or orphaned guide was found. The failed checks concern one missing fragment and noncanonical root links.
- All nine pages at **360px and 390px** had document/body scroll widths equal to their viewport widths. Viewport declarations specify device width and scale 1; insignificant whitespace after the comma is accepted. [Playwright raw results](raw/playwright.txt).

### Metadata lengths (warnings only)

| Route                                 | Title characters | Description characters | Warning                              |
| ------------------------------------- | ---------------: | ---------------------: | ------------------------------------ |
| `/home/`                              |               60 |                    148 | None                                 |
| `/guides/`                            |               52 |                    142 | None                                 |
| `/guides/handle-scope-creep/`         |               61 |                    151 | Title outside 50–60 guidance         |
| `/guides/change-order-template/`      |               59 |                    135 | None                                 |
| `/guides/price-additional-work/`      |               62 |                    153 | Title outside 50–60 guidance         |
| `/guides/project-baseline-checklist/` |               59 |                    147 | None                                 |
| `/about/`                             |               54 |                    150 | None                                 |
| `/privacy/`                           |               58 |                    163 | Description outside 120–160 guidance |
| `/license/`                           |               63 |                    155 | Title outside 50–60 guidance         |

No copy was rewritten to silence these warnings.

### HTTPS / live headers (read-only)

| Exact command                                | Observed status / destination                  | HSTS               |
| -------------------------------------------- | ---------------------------------------------- | ------------------ |
| `curl -I http://scopeledger.site/home/`      | 308; Location `https://scopeledger.site/home/` | Not sent over HTTP |
| `curl -I https://scopeledger.site/home/`     | 200                                            | `max-age=31536000` |
| `curl -I https://www.scopeledger.site/home/` | 308; Location `https://scopeledger.site/home/` | `max-age=31536000` |

[HTTP output](raw/http-home-head.txt), [HTTPS output](raw/https-home-head.txt), [www output](raw/www-home-head.txt). The observed HTTP homepage path reaches HTTPS in one hop. This does not assert every possible hostname/path combination.

## DEFECTS — grouped by route

### `/home/`

1. **Heading jump:** exact failure `file: skipped heading level h2 → h6: Product`. The footer's Product/Help/Service information labels are h6 elements. Proposed fix: use a consistent appropriate heading level and retain their current appearance. Not applied in this validation-only PR.
2. **Missing fragment:** exact failure `missing #anchor target /privacy/#data-flow (target http://127.0.0.1:4173/privacy/)`. The privacy page has `hosting`, not `data-flow`. Proposed fix: point that link to `/privacy/#hosting`, with no visible wording change. Not applied.
3. **Software-app rich-result eligibility:** missing `offers.price` and a genuine `aggregateRating` or `review`, which Google documents as requirements for WebApplication software-app rich results. This is **not a JSON syntax error or evidence of an indexing problem**. Proposed resolution: leave the factual schema alone until genuine applicable offer/review information exists, or separately decide whether that rich-result type is wanted. No offer, author, publisher, rating or review was fabricated. The requested strict eligibility check remains failing; schema changes are forbidden here. [Google software-app documentation](https://developers.google.com/search/docs/appearance/structured-data/software-app).
4. Report-only image findings: 32 visible SVGs without an explicit SVG accessible name/decorative designation; 20 elements lack explicit positive dimensions (one element overlaps these groups). Some icons are within named controls, so these counts are **not** asserted WCAG violations. Proposed review: classify decorative icons explicitly, preserve meaningful accessible names, and provide dimensions where appropriate. No image edits/conversions.

### `/guides/`

Three anchors use `href="/"`, producing one 308 to `/home/`. Exact failures include `internal document link lacks canonical path/trailing slash: /` and `noncanonical internal link redirects: / → http://127.0.0.1:4173/home/`. Proposed fix: use `/home/` for those links, leaving the existing root 308 unchanged. Not applied.

### `/guides/handle-scope-creep/`

Same three root-link defects; same proposed href-only fix. Title length is a warning, not a failure.

### `/guides/change-order-template/`

Same three root-link defects; same proposed href-only fix.

### `/guides/price-additional-work/`

Same three root-link defects; same proposed href-only fix. Title length is a warning, not a failure.

### `/guides/project-baseline-checklist/`

Same three root-link defects; same proposed href-only fix.

### `/about/`, `/privacy/`, `/license/`

No strict page defects observed. `/privacy/` is the target of the broken homepage fragment; it does not need a new anchor to make an incorrect incoming link valid. Metadata length warnings are listed above.

### Protected / nonindexable endpoints

All tested excluded responses sent **`X-Robots-Tag: noindex, nofollow`**, omitting the required **`noarchive`**. Workspace HTML also omitted noarchive. Exact failure example: `required X-Robots-Tag noarchive missing; actual "noindex, nofollow" (200)`.

Affected tested paths: `/workspace/`, `/workspace/projects`, `/app`, `/api/license/status`, `/api/license/activate`, `/api/pdf`, `/api/ready`, `/api/health`, `/api/unknown-seo-path`, `/samples/change-brief.pdf`, `/samples/invoice.pdf`, `/llms.txt`, `/product-guide.txt`, `/release.json`, `/indexnow-key.txt`, `/not-a-public-page`. The meta check applies to the two workspace responses. These are representative actual paths, not a proof over infinitely many paths/methods.

Proposed fix: separately add the requested noarchive directive to the relevant response/header/meta contract. **Not applied:** noindex/security code is protected in this PR. No noindex assertion was added for sitemap.xml or robots.txt. `/api/ready` returned 503 in both tested environments; the Phase 2 renderer/readiness failures were not fixed or reclassified by this PR.

### Applied metadata / markup fixes

**None.** This PR preserves the full production content/security baseline and exposes defects through strict validation. Every proposed fix above is separate from the check implementation.

## Lighthouse — report only

| Local production URL                               | Profile | LCP        | CLS        | TBT        | Total page weight | Result                                       |
| -------------------------------------------------- | ------- | ---------- | ---------- | ---------- | ----------------- | -------------------------------------------- |
| `http://127.0.0.1:4173/home/`                      | Mobile  | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED        | Required managed Chromium executable missing |
| `http://127.0.0.1:4173/guides/handle-scope-creep/` | Mobile  | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED        | Required managed Chromium executable missing |

Preflight used Node built-ins and the existing `@playwright/test` export:

```js
import { chromium } from '@playwright/test';
import { access } from 'node:fs/promises';
const path = chromium.executablePath();
console.log('SCOPELEDGER_CHROME_PATH=' + path);
await access(path);
```

Exact observed error: `ENOENT: no such file or directory, access '/Users/samaelsmacbook/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'`. [Full preflight output](raw/lighthouse-preflight.txt).

The npx Lighthouse commands were **not executed** because the required browser preflight failed.

No browser was installed, no flags/security settings changed and no alternate browser substituted for Lighthouse. No performance scores, metrics, thresholds or field Core Web Vitals are claimed. A later Lighthouse report would be lab data, not field data.

## Images — report only

[Every img and visible SVG in the observed DOM, with format, byte size, alt/name, dimensions and findings](images.md). [Machine-readable inventory](images.json). DOM snapshots came from the real local production build at 390px, including icons inserted by the real homepage JavaScript. External image bytes were fetched read-only from the unchanged production site. All img elements are included even when hidden; SVG definition blocks/hidden SVG are excluded from the visual-SVG inventory. Inline SVG byte counts measure serialized markup, not additional network transfer.

| Route                                 | Elements | Elements with findings | Missing img alt | Missing SVG designation/name | Missing explicit dimensions |
| ------------------------------------- | -------: | ---------------------: | --------------: | ---------------------------: | --------------------------: |
| `/home/`                              |       78 |                     51 |               0 |                           32 |                          20 |
| `/guides/`                            |        2 |                      0 |               0 |                            0 |                           0 |
| `/guides/handle-scope-creep/`         |        2 |                      0 |               0 |                            0 |                           0 |
| `/guides/change-order-template/`      |        2 |                      0 |               0 |                            0 |                           0 |
| `/guides/price-additional-work/`      |        2 |                      0 |               0 |                            0 |                           0 |
| `/guides/project-baseline-checklist/` |        2 |                      0 |               0 |                            0 |                           0 |
| `/about/`                             |        2 |                      0 |               0 |                            0 |                           0 |
| `/privacy/`                           |        2 |                      0 |               0 |                            0 |                           0 |
| `/license/`                           |        2 |                      0 |               0 |                            0 |                           0 |

Decorative img elements with `alt=""` are recorded as decorative, not missing-alt findings. SVG accepts aria-label, aria-labelledby, title or explicit aria-hidden decoration. Contextual semantics still require human review.

## CI run #11 and this PR

Observed command `gh run view 38096144164 --json number,headSha,conclusion,jobs,url`: [raw metadata](raw/run-11.json). Observed command `gh run view 38096144164 --log`: [full raw log](raw/run-11.log). [Actual run #11](https://github.com/SaMaEl-69/scopeledger/actions/runs/38096144164), commit `9c974f9`.

- `npm run test:seo` was invoked by prebuild during successful `npm run build` (step 10). It was **not skipped**.
- `npm run test:seo:live` had **no workflow step**, so it was **not scheduled**, not skipped.
- Step 13 `npm run test:local-browser`: 48 passed, 12 failed. Existing activation/PDF/download/readiness test failures remain outside Phase 1.
- Steps 14 (social previews), 15 (HTTPS proxy/security) and 16 (site tests) were skipped after that failure.
- This PR adds a served-SEO/link/mobile test step after selecting the browser runtime and before local-browser tests. It invokes `npm run test:seo:live` against the test server via `SCOPELEDGER_SEO_ORIGIN`, mapping absolute public metadata asset URLs to that local origin.
- **Important:** the new stricter prebuild source gate already fails on existing homepage defects. A fresh CI run can therefore stop at build before it reaches the 12 known Phase 2 tests. Those tests were not deleted, skipped, retried, relaxed or given longer timeouts. This PR must not be described as a green release pipeline.

Observed after opening the PR: [branch push run #12](https://github.com/SaMaEl-69/scopeledger/actions/runs/38112907620) and [PR run #13](https://github.com/SaMaEl-69/scopeledger/actions/runs/38112946870), both on code commit `4baec8d`, **failed at step 10, npm run build**, on the same three strict homepage findings. The npm audit, source/secret scans, unit tests and HTTP security steps passed. Later browser/served-SEO steps were automatically skipped because the build failed; the 12 Phase 2 tests were not reached. No explicit test skip or continue-on-error was added. [Raw push-run metadata](raw/phase1-ci.json), [exact failed-step log](raw/phase1-ci-failed.log). Commands: `gh run view 38112907620 --json number,headSha,conclusion,jobs,url` and `gh run view 38112907620 --log-failed`; the PR run was inspected with `gh run view 38112946870 --json number,headSha,conclusion,jobs,url`.

Raw terminal logs intentionally preserve CRLF, trailing whitespace and warnings. The extra `git diff --cached --check` command returned exit 2 with whitespace reports on those saved logs; this is not reported as a passed check. Its full local output is `output/seo/diff-check.txt`. No evidence was trimmed to hide the reports. The staged source scan also passed: [323-path scan](raw/check-source-staged.txt). [Protected-file guard](raw/protected-files.txt) returned exit 0.

## UNVERIFIED

1. Lighthouse LCP, CLS, TBT, page weight and reports: prerequisite executable missing; no npx Lighthouse audit ran.
2. Google/Bing rankings, discovery, indexing, canonical selection or new crawl behavior: no Search Console inspection was performed as part of this Phase 1. User-agent checks cannot confirm these. No IndexNow submission was made because no public content changed.
3. Real-world field performance/INP/CWV and every browser/device: not measured. Mobile results cover the recorded Chromium configuration at 360/390 only.
4. Authenticity/freshness of factual schema dates and authorship beyond the unchanged published values: syntax, ordering, references and preservation were checked; no external fact verification or invented data added.
5. Contextual accessibility of every icon and images appearing only after other interactions/themes/breakpoints: the image table records the observed DOM and attributes, not a complete manual accessibility certification.
6. Exhaustive private endpoint behavior across all possible paths/methods and production protected PDF readiness: representative noindex checks and the recorded 503 are evidence only. Phase 2 remains separate.
7. Any future CI run after further changes: the recorded runs above confirm only the inspected commit; no future green outcome is assumed.

Google references used for the checker contract: [Breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [Software app](https://developers.google.com/search/docs/appearance/structured-data/software-app), [Article](https://developers.google.com/search/docs/appearance/structured-data/article), [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [Site names](https://developers.google.com/search/docs/appearance/site-names). These references describe requirements, not observed search-engine behavior for ScopeLedger.
