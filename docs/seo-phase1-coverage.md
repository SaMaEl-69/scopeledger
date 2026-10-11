# Phase 1: existing coverage before extending checks

Baseline: main `9c974f9a9c6144a398554a34b9409f19cecdc761`. Recorded before implementing additional checks.

`npm run test:seo` currently reads source HTML. It checks an exact nine-URL sitemap string (including namespace and fixed lastmod values), one canonical matching the manifest URL, one H1, presence and uniqueness of the first title/description, JSON-LD syntax/presence, absence of fabricated offers/reviews/ratings/FAQ schema, public meta robots without noindex, fixed OG URL/image values, duplicate IDs, same-page anchors and an internal-path allowlist. Internal redirect aliases are normalized rather than rejected. It does not request served pages or image bytes over HTTP.

`npm run test:seo:live` includes those source checks, then requests each canonical page using browser/Googlebot/Bingbot user-agent strings. It requires 200, no noindex header, title/canonical parity, sitemap content parity, 308 on four aliases and noindex (only that directive) on five excluded endpoints. User-agent strings do not establish real crawler identity, search indexing or ranking.

Missing coverage to extend: exact title/description counts, heading jumps, absolute metadata URLs, image header dimensions and served status, schema required-property validation, full noindex/nofollow/noarchive contracts in both directions, robots directive matching, canonical links across served pages, cross-page fragments, redirect chains, orphan guides, built-HTML HTTP links/resources, explicit mobile viewport/overflow, and a read-only image inventory. Metadata lengths and Lighthouse measurements are reports rather than gates.

In workflow run #11 (`9c974f9`, https://github.com/SaMaEl-69/scopeledger/actions/runs/38096144164), the source SEO check ran as `prebuild` within `npm run build` (step 10, success). There was no explicit `test:seo:live` step, so it was **not scheduled**, not a skipped SEO step. The social preview check (14), HTTPS reverse-proxy check (15) and site browser check (16) were skipped after `test:local-browser` failed (13). The 12 existing PDF/readiness failures are outside this PR.

Restrictions: no package.json/dependency changes, no deployment, no Cloudflare changes, no sitemap/robots/schema/claims/pricing/license/security changes. Audit failures remain failures. No result is simulated and no assertion is loosened.
