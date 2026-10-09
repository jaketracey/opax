# OPAX crawl discovery and IndexNow

Updated for growth Bet 1, 10 October 2026. Build and verification use local assets and bindings.

## Sitemap and corpus guide

`npm run build:search` also runs `scripts/build_crawl_catalog.mjs`. `npm run build:crawl` can rebuild discovery alone. The existing CI and deploy build paths therefore include these generated assets without a second workflow. The generated `portal/public/crawl/` directory is ignored by Git and included in the Worker asset upload.

`/sitemap.xml` is the index; `/sitemaps/{type}-{part}.xml` contains at most **49,999** unique canonical URLs and stays below the XML size limit. `robots.txt` points at the index. Each URL uses the record's latest valid date: bill stages/divisions/summary updates, division date, speech or interests updates, dated seat representation, grant publication/start dates, contract publication/start dates, report updates and instrument registration/version/status dates. Future milestones and invalid dates are excluded. Records with no usable date retain their export date; `crawl/manifest.json` counts these fallbacks by type. A year or financial-year range is not converted into an invented day.

Current export counts (73,974 URLs, 14 children; 3,519 lastmod fallbacks):

| Type | URLs | Lastmod fallbacks |
|---|---:|---:|
| People | 1,703 | 960 |
| Parties | 19 | 19 |
| Electorates | 625 | 368 |
| Bills | 2,989 | 0 |
| Divisions | 10,755 | 0 |
| Grant programs | 1,000 | 197 |
| Grant recipients | 9,982 | 1,017 |
| Topics and reports | 28 | 21 |
| Static pages and directories | 27 | 27 |
| Suppliers | 21,629 | 0 |
| Organisational donors | 472 | 472 |
| Campaigners | 438 | 438 |
| Agencies | 164 | 0 |
| Instruments | 24,143 | 0 |

Division discovery reads `divisions/index.json`, including divisions without a bill association. The separate division exporter reads the existing local `parli.db` with SQLite `mode=ro` and `query_only`, retaining the refresh guard. This refresh publishes 10,755 divisions: 7,058 have matching recorded member tallies and 3,697 have partial lists. The fuller verified `federal-senate-10701` snapshot remains intact. Party labels come from dated vote rows; retained snapshots accept missing party labels only when the division date, house, totals, source and each member's vote match. `votes.json` remains byte-identical with schema 1.

Individual donors remain excluded from the sitemap and every new crawl block. Recipient discovery excludes the **64 individual recipients** in the federal and Queensland indexes, as well as undisclosed or missing IDs. Programs use the app's existing canonical query URL, `/money/grants?jur=…&program=…`, and must have a published profile file.

Supplier IDs are retained because they resolve to human-readable named AusTender profiles with award facts and sources. They have their own sitemap and priority **0.2**, preventing them from dominating the core entity sitemap files. Name aliases are omitted.

`/llms.txt` is a bounded Markdown guide built from `corpus.json` and the grants export metadata. It describes scope, dates, entity URL patterns, canonical and original-source citation, privacy and the source-specific licence restrictions, linking to `/methods`. It follows the [llms.txt convention](https://llmstxt.org/). No `llms-full.txt` is generated: the corpus is too large for a cheap, bounded full-text export.

## Canonicals, redirects and factual crawl bodies

SSR, client links, search/support catalog rows, JSON-LD, Open Graph and daily-post/story cards use apex URLs and person/party slugs. Name aliases are never published as links. Search links and SearchAction metadata use `/ask?view=search` directly. Distinct roster rows that share a base slug receive stable suffixes; reviewed full-name profiles keep their full-name slug.

Page aliases are resolved before the existing host redirect, producing one hop. Known name/case aliases for people, parties, electorates, suppliers and agencies, old `/person`, `/party`, `/electorate`, `/subject/mp` and `/subject/people` shapes, bill-key case, `/division/{key}`, `/division/division-{key}` and `/doc/{key}`, known trailing slashes and `.html` page aliases redirect to the exported canonical page. `/home` and `/index.html` resolve to `/`. Path aliases use 301; `www` retains 308, combining host and path corrections. Unknown records are not redirected to invented targets. Placeholder `null`/`undefined` segments return noindex 404 before metadata or upstream requests. API, auth and ingest handling retain their existing boundaries.

Each rendered page has one canonical. Money journeys and ordinary filter variants canonicalise to the base page, while identity-bearing grant program/recipient-award queries and directory pagination remain distinct. `/ask` query variants are noindex. `/search` redirects to `/ask?view=search`, with noindex when queried; it is omitted from the sitemap. No RSS publisher is present.

Bills render the sponsor and recorded party, stage labels and dates, official division totals, dated party tallies, all exported named votes, related bills by sponsor/portfolio and the dated, attributed model-written summary. Partial or missing vote coverage is stated explicitly. Suppliers render contracted agencies, their largest contracts with date/value/agency/AusTender notice lookup and suppliers recorded with the same agencies. Direct notice URLs are used when exported; register-only URLs become searches for the exact CN reference. No influence claim is made: **An association does not prove influence.** Money, connections, explore, map and the homepage map area have factual export totals, dates and sources before JavaScript. The community shell has factual introductory text.

The available `parliamentarians.json` and electorate member export contain no death/date-of-death field. No death is inferred and no deceased notice is added. Supplying an authoritative death field is a separate data task.

### Googlebot measurements

Words and internal `<a>` links are counted inside the raw `<section id="prerender">`, before JavaScript, using local Wrangler and `curl -A Googlebot`. Each row returned 200. Canonicals are absolute `https://opax.com.au` plus the path below, exactly once before and after; `/map` had no canonical before and has one afterwards.

| Page/path | Words before → after | Links before → after |
|---|---:|---:|
| Bill `/bill/au-federal-r7537` | 225 → 397 | 1 → 11 |
| Supplier `/subject/supplier/s-f93824d9abc756c8f32f` | 49 → 411 | 7 → 27 |
| Person `/subject/person/bruce-baird` | 386 → 386 | 31 → 31 |
| Division `/doc/division-federal-representatives-10266` | 85 → 855 | 1 → 153 |
| `/money` | 35 → 251 | 0 → 40 |
| Division-bearing bill `/bill/au-federal-r7534` | 1,839 → 5,606 | 12 → 690 |
| `/map` | 0 → 247 | 0 → 40 |
| `/connections` | 23 → 249 | 0 → 40 |

The specified r7537 bill has no recorded divisions or portfolio and only five other bills from its sponsor. Its 11 links reflect those available facts; division-bearing bills exceed the 20-link aim. No unrelated relationships are invented to reach a link quota.

## IndexNow operation

The public key is **3fd7466e2dc64b00a55ee502b82c51ad**. It is committed at `portal/public/3fd7466e2dc64b00a55ee502b82c51ad.txt` and served at `/3fd7466e2dc64b00a55ee502b82c51ad.txt`. It is an ownership file, not a secret.

The existing `*/5 * * * *` cron checks `CACHE_EPOCH` before its usual housekeeping. No new cron, DNS, zone or dashboard change is needed. The existing notification snapshot still fingerprints published bill profiles, bill-associated division records and people pages (roster plus available vote and interests exports). A new epoch compares that snapshot against the last completed epoch. The first epoch submits all important URLs; later epochs submit new/changed bills, divisions and people pages. Export-only timestamp changes can cause a conservative extra notification. The build does not query production.

The payload follows the [IndexNow protocol](https://www.indexnow.org/documentation): POST to `https://api.indexnow.org/indexnow`, with `host`, `key`, root `keyLocation` and `urlList`. Batches contain **1,000 URLs**, below the protocol's 10,000 limit. At most two batches run per tick, each with a 10-second fetch timeout; further batches resume next tick. Only canonical OPAX bill, division and person URLs are accepted.

`indexnow_jobs` stores a frozen plan, cursor and completed epoch receipt. An atomic D1 lease prevents concurrent sends for the same epoch. HTTP 200 or 202 advances the cursor; accepted batches and completed epochs are skipped on later ticks. Failed HTTP/network/manifest/database operations are logged as `indexnow_failed` and do not prevent the existing cron work. The next tick retries unaccepted work. The current baseline and pending snapshots are retained; old completed snapshots and payloads are removed while small epoch receipts remain. As the protocol has no idempotency token, a lost response or a crash after remote acceptance but before saving a receipt can cause a repeat notification.

Flags are configured in `wrangler.jsonc`: production `INDEXNOW_ENABLED=true`, `INDEXNOW_DRY_RUN=false`; staging disabled with dry run enabled. Missing enable flags disable the handler. `INDEXNOW_DRY_RUN=true` computes/logs counts without calling IndexNow or advancing the journal. For local development override both flags to `false`/`true` in ignored `.dev.vars`, or use Wrangler's `--var` flags. Local gates must not trigger the production-configured publisher.

**Orchestrator prerequisite before deploying:** apply `portal/migrations/0013_indexnow.sql` to the intended production `COMMUNITY_DB` using the existing migration procedure. This lane applies nothing remotely. If omitted, IndexNow logs a database failure and moves on until the migration is applied. Verify the public key file and crawl build assets after deployment.

Jake's manual step: open Bing Webmaster Tools, import the verified OPAX property from Google Search Console, and submit `https://opax.com.au/sitemap.xml`. This lane does not set up the account or submit the property.

## Validation

Use Node 24. Run `npm ci` in `portal/`, then `npm run build:search` before tests. The deployment build steps are search, social, grants-map, analytics and voice; also rebuild graph after graph/client URL changes. Run asset stamping, privacy and photo identity checks, without `wrangler deploy`.

On this desktop, local servers and Wrangler type generation need a network namespace:

```sh
cd portal
unshare -rn sh -c 'ip link set lo up; node --test test/*.test.mjs'
unshare -rn sh -c 'ip link set lo up; npm run check'
npx tsc --noEmit
python3 -m unittest tests.test_export_division_pages tests.test_division_refresh_guard # from repo root
unshare -rn sh -c 'ip link set lo up; npx wrangler dev --local --port 8787 --var INDEXNOW_ENABLED:false --var INDEXNOW_DRY_RUN:true'
```

Inside that same namespace, GET the measurement paths with `curl -A Googlebot`; count the prerender block and inspect the canonical. Check `/subject/person/Bruce%20Baird`, `/sitemap.xml` and `/sitemaps/bills-1.xml`. Wrangler rewrites the configured upstream host and matching `Location` headers: to verify `www`, run a separate local session with `--local-upstream www.opax.com.au`, then curl with `-H 'Host: www.opax.com.au'`. `/money`, the Bruce name plus trailing slash and an uppercase bill key plus trailing slash must each return one 308 to the HTTPS apex canonical. Do not follow that redirect onto production; fetch the canonical path through the apex local session instead. Apex name/path redirects return 301 (Wrangler may display the equivalent localhost location).

`seo-render.test.mjs` bundles and dispatches the real Worker against built disk assets, samples every route type and checks one canonical, canonical OPAX anchors/JSON-LD, factual content and no loading/error text. Table-driven GET/HEAD alias checks combine `www`, case, names and slashes, check one hop and fetch the final exported page. Crawl tests cover orphan divisions, per-record dates, fallback counts and chunk limits. Social tests check profile/card paths. Exporter tests protect the existing member evidence and reject mismatched party enrichment. Compare the byte hash of `votes.json` to HEAD; schema remains 1.

Validated on 10 October 2026 with Node 24.21.0: **1,080 JavaScript tests** and **23 Python tests** passed; TypeScript, `npm run check`, deployment build steps and privacy/stamp/photo checks passed. The division exporter and refresh guard tests passed. Local Googlebot requests served the pages in the table and sitemap index/child; apex person alias and combined `www` aliases passed. No deploy, push, merge, production write, sitemap submission or external IndexNow ping was performed. Generated crawl/catalog assets are rebuilt by deployment; the tracked search manifest is left at its baseline. The strategy and data-appendix reference copies are excluded from the commit.

Jake's remaining steps: the orchestrator merges and deploys; Jake submits or resubmits the sitemap through Search Console/Bing by hand. The individual-donor indexing decision remains pending. A deceased notice requires an authoritative source field. Existing IndexNow flags, key, cron and journal behavior are unchanged; the prerequisite migration above still applies if it has not already been applied.
