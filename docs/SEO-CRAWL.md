# OPAX crawl discovery and IndexNow

Lane B, 8 October 2026. No production changes are required to build or test this lane.

## Sitemap and corpus guide

`npm run build:search` also runs `scripts/build_crawl_catalog.mjs`. `npm run build:crawl` can rebuild discovery alone. The existing CI and deploy build paths therefore include these generated assets without a second workflow. The generated `portal/public/crawl/` directory is ignored by Git and included in the Worker asset upload.

`/sitemap.xml` is the index; `/sitemaps/{type}-{part}.xml` contains at most **49,999** unique canonical URLs and stays below the XML size limit. `robots.txt` points at the index. Dates come from export metadata, rather than request/build time: roster/representation exports for people, electorate release dates, bill projection export dates for bills and divisions, grants export dates, report export/update dates and corpus snapshot dates for static/topics pages. Every row has lastmod. A generated manifest records counts and child files.

Current export counts:

| Type | URLs |
|---|---:|
| People | 1,703 |
| Parties | 19 |
| Electorates | 625 |
| Bills | 2,989 |
| Divisions | 3,865 |
| Grant programs | 1,000 |
| Grant recipients | 9,982 |
| Topics and reports | 28 |
| Static pages and directories | 26 |
| Suppliers | 21,629 |
| Donors | 813 |
| Campaigners | 438 |
| Agencies | 164 |

Division discovery covers the distinct divisions in the published bill profiles. The corpus manifest's larger division resource count includes records without an exported URL index; it is not the sitemap count. Recipient discovery excludes the **64 individual recipients** in the federal and Queensland indexes, as well as undisclosed or missing IDs. Programs use the app's existing canonical query URL, `/money/grants?jur=…&program=…`, and must have a published profile file.

Supplier IDs are retained because they resolve to human-readable named AusTender profiles with award facts and sources. They have their own sitemap and priority **0.2**, preventing them from dominating the core entity sitemap files. Name aliases are omitted.

`/llms.txt` is a bounded Markdown guide built from `corpus.json` and the grants export metadata. It describes scope, dates, entity URL patterns, canonical and original-source citation, privacy and the source-specific licence restrictions, linking to `/methods`. It follows the [llms.txt convention](https://llmstxt.org/). No `llms-full.txt` is generated: the corpus is too large for a cheap, bounded full-text export.

## Indexing hygiene

`/ask` with any query string gets a noindex HTTP header and HTML robots tag. `/search` retains its existing redirect to the unified ask/search UI; query-bearing redirects now carry noindex too. Bare `/ask` and `/search` keep their indexable response headers. `/money` query variants canonicalise to `/money`; recipient award canonicals keep the existing award parameter.

Placeholder `null`/`undefined` entity segments, including percent-encoded/case variants, return a real 404 with noindex before any metadata lookup, person redirect or paid upstream request. Client link builders reject missing IDs: grants render plain spans, and app template anchors omit href (so they have no link semantics). Legacy grant redirects and exported search rows are guarded too.

## IndexNow operation

The public key is **3fd7466e2dc64b00a55ee502b82c51ad**. It is committed at `portal/public/3fd7466e2dc64b00a55ee502b82c51ad.txt` and served at `/3fd7466e2dc64b00a55ee502b82c51ad.txt`. It is an ownership file, not a secret.

The existing `*/5 * * * *` cron checks `CACHE_EPOCH` before its usual housekeeping. No new cron, DNS, zone or dashboard change is needed. Each build fingerprints published bill profiles, division records and people pages (roster plus available vote and interests exports). A new epoch compares that snapshot against the last completed epoch. The first epoch submits all important URLs; later epochs submit new/changed bills, divisions and people pages. Export-only timestamp changes can cause a conservative extra notification. The build does not query production.

The payload follows the [IndexNow protocol](https://www.indexnow.org/documentation): POST to `https://api.indexnow.org/indexnow`, with `host`, `key`, root `keyLocation` and `urlList`. Batches contain **1,000 URLs**, below the protocol's 10,000 limit. At most two batches run per tick, each with a 10-second fetch timeout; further batches resume next tick. Only canonical OPAX bill, division and person URLs are accepted.

`indexnow_jobs` stores a frozen plan, cursor and completed epoch receipt. An atomic D1 lease prevents concurrent sends for the same epoch. HTTP 200 or 202 advances the cursor; accepted batches and completed epochs are skipped on later ticks. Failed HTTP/network/manifest/database operations are logged as `indexnow_failed` and do not prevent the existing cron work. The next tick retries unaccepted work. The current baseline and pending snapshots are retained; old completed snapshots and payloads are removed while small epoch receipts remain. As the protocol has no idempotency token, a lost response or a crash after remote acceptance but before saving a receipt can cause a repeat notification.

Flags are configured in `wrangler.jsonc`: production `INDEXNOW_ENABLED=true`, `INDEXNOW_DRY_RUN=false`; staging disabled with dry run enabled. Missing enable flags disable the handler. `INDEXNOW_DRY_RUN=true` computes/logs counts without calling IndexNow or advancing the journal. For local development override both flags to `false`/`true` in ignored `.dev.vars`, or use Wrangler's `--var` flags. Local gates must not trigger the production-configured publisher.

**Orchestrator prerequisite before deploying:** apply `portal/migrations/0013_indexnow.sql` to the intended production `COMMUNITY_DB` using the existing migration procedure. This lane applies nothing remotely. If omitted, IndexNow logs a database failure and moves on until the migration is applied. Verify the public key file and crawl build assets after deployment.

Jake's manual step: open Bing Webmaster Tools, import the verified OPAX property from Google Search Console, and submit `https://opax.com.au/sitemap.xml`. This lane does not set up the account or submit the property.

## Validation

Use Node 24. Install in `portal/` with `npm ci`, then run `npm run build:search` before `node --test test/*.test.mjs`. Generate Wrangler types and run `npx tsc --noEmit`. Run the deploy workflow's search, social, grants-map, analytics and voice builds, privacy/stamp/photo checks, without invoking deployment.

Local `wrangler dev` checks must use local bindings with IndexNow disabled and dry run enabled. Check the sitemap index and one child, `/llms.txt`, the key file, a placeholder entity 404 and `/ask?q=x` noindex. IndexNow tests use an in-memory SQLite journal and stubbed outbound fetch; no live ping is needed.

Validated in this worktree on 8 October 2026 with Node 24.21.0: **912 tests passed**, including 16 new crawl/IndexNow tests; TypeScript passed; all five workflow builds and the privacy, stamp and photo checks passed. Local Wrangler served 13 sitemap children and 2,989 bills, the Markdown guide and key file, returned noindex 404 for placeholder recipient/person IDs, set noindex on query routes, and canonicalised the money journey to `/money`. No deploy, push, remote migration or external IndexNow ping was performed. Generated data/stamp churn was removed from the commit; the deployment build regenerates it.
