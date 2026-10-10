# ScopeLedger SEO implementation and handover

Reviewed 11 October 2026. Production: https://scopeledger.site/. This report distinguishes deployed changes from search-engine processing, which cannot be controlled by the site.

## What was actually preventing visibility?

Google Search Console confirms that **https://scopeledger.site/home/ was already indexed** before this update. Its last reported crawl was 10 October 2026, using Googlebot smartphone: crawling allowed, successful fetch, indexing allowed, and the Google-selected canonical was the inspected homepage. Google reports no manual actions or security issues for the property.

An exact-brand/domain web search returned no results in the search tool during this audit. That observation does not override Search Console’s actual index status and does not establish Google rank positions. The site has very limited public content and is newly launched; visibility is a different problem from being blocked from Google.

ScopeLedger was absent from the signed-in account’s Search Console property list. The domain property is now verified using a DNS TXT record in Cloudflare, without granting Google DNS-account access. Keep this record to retain ownership verification.

## Deployed technical improvements

- Permanent HTTP 308 redirects consolidate root, `www`, slashless and `index.html` aliases. Existing `/home/` remains the canonical homepage; there is no unnecessary homepage migration.
- An explicit public-document manifest governs public routing and the asset allowlist. Accidental/private HTML uploads remain inaccessible.
- All nine public pages have a unique title, description, one H1, self-referencing canonical, social metadata and readable static HTML.
- The homepage identifies the actual category: scope change management for fixed-fee agencies. Its slogan and established branding remain intact.
- Homepage FAQ answers are now in HTML. The accordion enhances those existing answers instead of creating them after JavaScript runs. Answers remain readable without JavaScript.
- XML sitemap lists nine canonical public URLs. `lastmod` records this content revision rather than an unrelated build time. `robots.txt` advertises the sitemap and permits public content/resources.
- Workspace shells can be crawled to read `noindex`. Workspace, API responses, error responses, demonstration PDFs, machine information and release metadata carry appropriate `X-Robots-Tag` exclusions. These indexing controls do not replace the existing access/security boundaries.
- Organization/WebSite/WebApplication metadata describes real capabilities. The approved logo also has an explicitly sized 256px vector asset for organization markup. Guides have Article/Breadcrumb metadata and visible ScopeLedger authorship. Service pages use appropriate page/breadcrumb metadata. No invented reviews, ratings or live purchase offers were added.
- Locally served guide fonts, dimensioned brand images, accessible navigation, skip links, table overflow containers and manual/system appearance keep the new content usable.
- `npm run test:seo` runs during every build. It checks the publication manifest, sitemap, metadata uniqueness, canonical URLs, schema JSON, headings, IDs, local links and unsupported claims. `npm run test:seo:live` verifies production responses under browser, Googlebot and Bingbot identities.

## Public content and search intent

These are intent targets, not claimed search volumes or promised rankings.

| URL                                   | Reader’s task / topic                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `/home/`                              | Understand ScopeLedger and try scope change management software for fixed-fee agencies |
| `/guides/`                            | Find practical scope, fee and client-document guides                                   |
| `/guides/handle-scope-creep/`         | Handle scope creep and respond to a client’s additional request                        |
| `/guides/change-order-template/`      | Use an agency change order template with scope, fee, tax, timing and approval          |
| `/guides/price-additional-work/`      | Price additional work using delivery cost and contribution margin                      |
| `/guides/project-baseline-checklist/` | Capture a project scope baseline, revision limits, exclusions and financial inputs     |
| `/about/`                             | Understand the product’s purpose, workflow and current availability                    |
| `/privacy/`                           | Understand local records, encrypted/plain backups and public hosting data flow         |
| `/license/`                           | See planned pricing, device allowances and current service limits                      |

The four guides contain original practical instructions, a copyable change-order structure, a checklist and worked calculations. The calculation example uses a baseline net fee of $8,000 and delivery cost of $5,200 (35% contribution margin). Absorbing eight hours at $65 adds $520 and reduces that margin to 28.5%. A fee of $800 before tax preserves 35%; at 5% tax the client total is $840. Contribution margin is not described as net profit.

Homepage resource cards and footer links connect the guides and service information. Article pages link to related tasks and the free demo. The public GitHub repository now links to the official site and has a factual product description.

## Accuracy and buyer trust

The public deployment currently remains a **free demo**. Purchasing, license activation and protected customer PDF exports are not configured. Planned lifetime prices remain $49 Individual (one activated browser/device) and $99 Agency (five). Every device has independent local data; there is no team synchronization.

Public copy now states this availability directly. The unsupported “pays for itself the first time” assertion was replaced with a cost-calculation invitation. Stale 10 MiB language was corrected to the current 50 MiB workspace safety limit. Workspace help now distinguishes password-protected encrypted exports from optional readable JSON exports. Local browser records are not presented as wholly encrypted.

The site does not imply remote authenticated e-signing, automated payment collection, live Slack/email/Figma integrations or AI interpretation of pasted links. An imported signature image does not establish client approval. Public privacy/service pages describe the actual demo and qualify prepared future services.

Final seller identity, checkout terms, production retention and refund handling still need the owner’s business decisions before paid launch. No invented legal identity or policies were published.

## Submission and Google state

- Google Search Console domain ownership: **verified**.
- Homepage before update: **indexed**; Google smartphone fetch successful and canonical matched. Its update has now been accepted into Google’s priority crawl queue.
- New guide hub: accepted into Google’s priority crawl queue; it was not yet indexed at inspection.
- Manual actions and security issues: **none detected in Search Console**.
- Updated nine-page sitemap: **submitted**. Initial Search Console processing reported “Sitemap could not be read”; the sitemap ingestion report remains unresolved. Google’s own live Inspection Tool then confirmed **URL available to Google, Crawl allowed: Yes, Page fetch: Successful**, using its smartphone fetcher. Independent HTTP checks confirmed valid XML, correct MIME type, HTTP 200, no challenge/login/redirect, no `noindex`, and nine same-origin URLs. This establishes live Google fetchability, while the sitemap processing report still needs to update.
- IndexNow: the nine canonical URLs were received with **HTTP 202**. Key validation/processing remains the participating engines’ work. This does not submit to Google or prove indexing.

Google processing and ranking cannot be completed on demand. [Google’s recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) says discovery/crawling can take days to weeks and a crawl request does not guarantee inclusion. New Search Console performance/indexing summaries are processing and do not yet provide a usable baseline for clicks, impressions or queries.

## Verification evidence

- Production build and TypeScript passed.
- 474 tests passed across 30 suites, including routing, security, storage and financial behavior.
- HTTP security checks passed for unfinished headers, unfinished JSON uploads and oversized headers, without creating sessions.
- Source SEO checks passed for all nine pages.
- Live SEO checks passed for all nine pages under three client identities, with exact canonical/title checks, sitemap parity, permanent redirects and indexing exclusions.
- Responsive DOM checks covered nine pages at 320, 390, 588, 768, 1024, 1440 and 1920 pixels: no page horizontal overflow or duplicate H1. Actual mobile/desktop and light/dark visual review supplemented those checks; this is representative viewport testing, not a guarantee for every browser/device combination.
- The homepage loads compressed HTML and small cached JavaScript independently of the React workspace. The pre-change HTTP inventory found ~35 KB gzip HTML and ~20 KB gzip homepage JS; after adding static content the build reports ~38 KB gzip HTML and ~19 KB gzip homepage JS.
- Images have dimensions; the public sample-document image is lazy loaded. No measured resource defect justified speculative performance changes.
- The existing full GitHub validation workflow was already failing before this SEO task: 12 licensed PDF/readiness browser tests failed across three engines, including a 503 readiness response. This is not presented as a passed full release pipeline; the SEO unit/build/live checks above are separate.
- Google PageSpeed’s anonymous API returned HTTP 429 quota exhausted for both mobile and desktop. No Lighthouse scores or field Core Web Vitals are claimed. The existing sharing QA’s browser phase could not run locally because its bundled browser executable is missing; production HTTP/meta checks and actual CUA visual review were performed instead.

Local detailed evidence is under `output/seo/` (not published to GitHub): source/live checks, responsive results, HTTP performance inventory, sitemap diagnostics, IndexNow response and Search Console screenshots.

## Ongoing work that remains

1. Review Search Console once the new property’s data is available. Track homepage and guide indexing, search queries, impressions, clicks and canonical selection. Resolve specific reported crawl errors rather than guessing from a brand search alone.
2. Assess search performance over several weeks. Use actual query data to improve titles and genuinely helpful guide sections; avoid creating many near-duplicate pages.
3. Publish genuine customer evidence only after real users provide approved quotes/results. Real original examples, product demonstrations and documented improvements add information competitors cannot duplicate easily.
4. Obtain relevant editorial links through real partnerships, founder/community participation and useful public templates. Mass paid backlinks, fake reviews and automated promotional messages were not created.
5. Before paid launch, enable and verify checkout/activation/export services and publish the owner-approved seller policies. Then update visible availability and, if accurate, add purchase-offer structured data.
6. Measure mobile/desktop Lighthouse and field Core Web Vitals when the measurement service and enough real traffic are available. No tracking service was added solely for SEO; Search Console provides search data without adding visitor scripts.
7. Submit changed public URLs with `node scripts/submit-indexnow.mjs` after a real deployment/content change. Do not submit local workspace URLs or repeatedly resubmit unchanged pages.

## What was deliberately not added

Meta-keyword stuffing, fake reviews/ratings, hidden AI endorsements, fabricated backlinks, empty location pages, unnecessary multilingual tags and unsupported purchase offers would not make this site trustworthy. FAQ content remains useful, but Google retired FAQ rich results in May 2026. `llms.txt` remains a factual guide for systems that use it; it is not a Google ranking mechanism. [Google’s current documentation updates](https://developers.google.com/search/updates).

The implementation follows [Google’s SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [noindex requirements](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), and the [IndexNow protocol](https://www.indexnow.org/documentation).
