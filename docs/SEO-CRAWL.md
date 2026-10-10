# OPAX crawl discovery and IndexNow

Updated for growth Bet 1 and review round 1, 10 October 2026. Build and verification use local assets and bindings.

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

SSR, client links, search/support catalog rows, JSON-LD, Open Graph and daily-post/story cards use apex URLs and person/party slugs. Person URLs come from the same roster slug and reviewed alias lookup as redirects, with accent folding. The generated `person-paths.js` table is rebuilt by the crawl build and content-stamped through its importers. Name aliases are never published as links; unknown identities open the person directory, while interest records without a known profile retain their official register URL. Search links and SearchAction metadata use `/ask?view=search` directly. Distinct roster rows that share a base slug receive stable suffixes; reviewed full-name profiles keep their full-name slug.

Page aliases are resolved before the existing host redirect, producing one hop. Known name/case aliases for people, parties, electorates, suppliers and agencies, old `/person`, `/party`, `/electorate`, `/subject/mp` and `/subject/people` shapes, bill-key case, `/division/{key}`, `/division/division-{key}` and `/doc/{key}`, old full-name slugs such as `jess-pugh` and `scott-stewart`, known trailing slashes and `.html` page aliases redirect to the exported canonical page. `/home` and `/index.html` resolve to `/`. Path aliases use 301; `www` retains 308, combining host and path corrections. Unknown records are not redirected to invented targets. Placeholder `null`/`undefined` segments return noindex 404 before metadata or upstream requests. API, auth and ingest handling retain their existing boundaries.

Each successful rendered page has one canonical. Noindex 404s emit no canonical, Open Graph URL or page JSON-LD, including unknown reports, topics and divisions. Money journeys and ordinary filter variants canonicalise to the base page, while identity-bearing grant program/recipient-award queries and directory pagination remain distinct. Hydration preserves the server-normalised canonical (for example `/bills?page=999999` becomes `?page=60`), and directory updates clamp and synchronise canonical and Open Graph URLs. `/ask` query variants are noindex. `/search` redirects to `/ask?view=search`, with noindex when queried; it is omitted from the sitemap. No RSS publisher is present.

Bills render the sponsor and recorded party, stage labels and dates, official division totals, dated party tallies, bounded member lists, related bills by sponsor/portfolio and the dated, attributed model-written summary.

The sponsor is resolved by main’s validated `sponsor-person.js` resolver, also used by the client; shared IDs never select the first roster row. Full named member lists are expanded for at most the three most recent divisions, and only when they fit. Older or oversized lists retain official tallies, dated party splits and a link to the full division page. Party counts are indexed from the exported dated member evidence, avoiding reads of older member shards. Crawl bodies have an 80,000-byte ceiling and reserve 70 links for the page shell inside the 300-link ceiling; complete bill pages stay below 120,000 bytes. Nullable stage chambers show “Chamber not recorded”. Partial or missing vote coverage is stated explicitly.

Suppliers render contracted agencies, their largest contracts with date/value/agency/AusTender notice lookup and suppliers recorded with the same agencies. Direct notice URLs are used when exported; register-only URLs become searches for the exact CN reference. Campaigners show “disclosed relationship” with the parties recorded in the register. Every crawl body pairing money with politicians or votes includes **An association does not prove influence.** Money, connections, explore, map and the homepage map area have factual export totals, dates and sources before JavaScript. The community shell has factual introductory text.

The available `parliamentarians.json` and electorate member export contain no death/date-of-death field. No death is inferred and no deceased notice is added. Supplying an authoritative death field is a separate data task.

### Googlebot measurements

Words and internal `<a>` links are counted inside the raw `<section id="prerender">`, before JavaScript, using local Wrangler and `curl -A Googlebot`. Each row returned 200. Canonicals are absolute `https://opax.com.au` plus the path below, exactly once before and after; `/map` had no canonical before and has one afterwards.

| Page/path | Words before → after | Links before → after |
|---|---:|---:|
| Bill `/bill/au-federal-r7537` | 225 → 397 | 1 → 11 |
| Supplier `/subject/supplier/s-f93824d9abc756c8f32f` | 49 → 411 | 7 → 27 |
| Person `/subject/person/bruce-baird` | 386 → 386 | 31 → 31 |
| Division `/doc/division-federal-representatives-10266` | 85 → 855 | 1 → 153 |
| `/money` | 35 → 257 | 0 → 40 |
| Division-bearing bill `/bill/au-federal-r7534` | 1,839 → 2,830 | 12 → 193 |
| `/map` | 0 → 253 | 0 → 40 |
| `/connections` | 23 → 255 | 0 → 40 |

Round 1 renders every one of the **2,989 exported bills** without throwing. The largest crawl body is r5626: **7,035 words, 181 internal links, 69,279 bytes**; its complete Googlebot response is **101,094 bytes and 247 internal links**, compared with the review’s approximately 428 kB and 3,836 links. The highest link count is r6820: **230 crawl-body links, 296 whole-page links, 60,871 whole-page bytes**. Every generated person path (1,704 distinct paths including the directory) returns a direct 200 with a matching canonical. Local checks also cover s1479 naming/linking Mehreen Faruqi, the exposure draft with a null chamber, Pugh, Stewart, Zoë Daniel and out-of-range directory pagination.

The specified r7537 bill has no recorded divisions or portfolio and only five other bills from its sponsor. Its 11 links reflect those available facts; division-bearing bills exceed the 20-link aim. No unrelated relationships are invented to reach a link quota.

## IndexNow operation

The public key is **3fd7466e2dc64b00a55ee502b82c51ad**. It is committed at `portal/public/3fd7466e2dc64b00a55ee502b82c51ad.txt` and served at `/3fd7466e2dc64b00a55ee502b82c51ad.txt`. It is an ownership file, not a secret.

The existing `*/5 * * * *` cron checks `CACHE_EPOCH` before its usual housekeeping. No new cron, DNS, zone or dashboard change is needed. The notification snapshot fingerprints published bill profiles, bill-associated divisions and people pages (roster plus available vote and interests exports). A new epoch compares it with **successfully submitted fingerprints** in `indexnow_sent`. The first run after migration imports the last completed snapshot and the sent prefixes of incomplete jobs (older prefixes add missing receipts without reverting newer completed fingerprints). A partial job therefore advances the baseline immediately, without making its unsent pages look submitted. HTTP 200 and 202 update the sent baseline, cursor and accepted count in one D1 transaction. Export-only timestamp changes can cause a conservative extra notification. The build does not query production.

A new epoch deduplicates and carries forward older incomplete jobs' unsent URLs, then marks those jobs `superseded=1`; superseded epochs cannot send again. URLs already accepted with the same fingerprint are omitted. Carried pages retain their fingerprints even if absent from the new manifest. Changed person, donor and division fingerprints **relative to the preceding planned epoch**, plus pending private donor extras, go first; people and donors precede changed divisions so a large division refresh cannot hold up privacy re-pings. Other new or carried URLs follow. Payload validation preserves this order. Existing jobs made by the old implementation are rebuilt once in place (`plan_version=1`), including the current privacy epoch, so rollout needs no extra epoch bump. New plans retain any outstanding backoff from superseded jobs.

The payload follows the [IndexNow protocol](https://www.indexnow.org/documentation): POST to `https://api.indexnow.org/indexnow`, with `host`, `key`, root `keyLocation` and `urlList`. Batches contain at most **500 URLs**. At most two batches run per tick, each with a 10-second fetch timeout; later batches resume on subsequent ticks. Canonical OPAX bill, division, person and validated donor URLs are accepted.

`INDEXNOW_DAILY_CAP` sets the maximum URLs sent per **UTC day**, default **2,000**. Set it to a non-negative integer; `0` pauses sends, and invalid values use the default. `indexnow_daily` reserves the traffic count before each request, including failed or ambiguous requests, and records accepted URLs separately. A final batch is shortened to fit the remaining allowance. Quota applies across epochs and resets at UTC midnight, including during a tick. The shared D1 lease in `indexnow_control` serialises planning, supersession and quota reservations across concurrent epochs. Existing per-job leases are respected during rollout. The new daily counter starts at rollout; the legacy journal has no per-batch acceptance dates, so historical daily usage cannot be reconstructed.

HTTP **429 and 5xx** persist `next_attempt_at` and a consecutive failure count on the job. `Retry-After` delta-seconds or HTTP dates take precedence (even longer than 24 hours); absent or invalid values use exponential delays of **1, 2, 4, 8, 16, then 24 hours**, capped at 24 hours. Ticks before that time make no submission. An accepted batch resets the backoff. `indexnow_backoff` logs the HTTP status and next attempt time in Unix milliseconds. Other HTTP/network/manifest/database failures log `indexnow_failed` without preventing the existing cron work.

Every enabled tick logs a read-only `indexnow_status`: epoch, cursor, total, completion/supersession, next attempt time, UTC day, cap, URLs sent today and URLs accepted today. Logs include counts and times, never private paths. Completed and superseded payloads and old snapshots are pruned after completion; sent fingerprints and small epoch receipts remain. The protocol has no idempotency token: a lost response or crash after remote acceptance but before saving a receipt can still cause a repeat notification. Known accepted URLs are never repeated across unchanged epochs.

Flags are configured in `wrangler.jsonc`: production `INDEXNOW_ENABLED=true`, `INDEXNOW_DRY_RUN=false`; staging disabled with dry run enabled. Missing enable flags disable the handler. `INDEXNOW_DRY_RUN=true` computes/logs counts without calling IndexNow or advancing the journal. For local development override both flags to `false`/`true` in ignored `.dev.vars`, or use Wrangler's `--var` flags. Local gates must not trigger the production-configured publisher.

**Re-crawl after a privacy change (October 2026 donor hotfix).** A person page's fingerprint includes the donor names its "Donors to their party" block shows (`namedDonors` in `scripts/build_crawl_catalog.mjs`), and whether a declared-interest entry was left out for naming a withheld donor, so any change in who is named re-pings the page and a change of amounts or wording does not. Main's fingerprints carried no names, so the first job after the hotfix re-pings every page that names a donor once; nearly all of them named a now-withheld donor before the hotfix, and round 1 changed them without a ping. The public `/crawl/indexnow.json` manifest omits donor pages, so a donor page made noindex is pinged through the optional private secret `INDEXNOW_EXTRA_PATHS`: whitespace-separated `/subject/donor/<one segment>` paths, decoded and checked before use (`donorPath` in `portal/src/indexnow.ts`: malformed escapes, dot segments, backslashes, double slashes and anything decoding outside one segment are dropped), at most 1,000; Workers secrets cap at 5 KB. The next epoch's job adds them to the front of its plan; they never enter the public snapshot. Receipts store a digest of the canonical secret list: retaining that same list across epochs does not re-ping accepted extras, and pending extras survive supersession even if the secret is removed. A changed list identifies a new one-off re-ping request. `node scripts/donor_privacy_changed_urls.mjs` renders every person page and every pre-hotfix sitemap donor URL with the pre-hotfix and current Worker, offline, and writes the ignored `portal/private/donor-privacy/changed-urls.txt` and `indexnow-extra-paths.txt`. To use it: `npx wrangler secret put INDEXNOW_EXTRA_PATHS < portal/private/donor-privacy/indexnow-extra-paths.txt`, deploy with a new `CACHE_EPOCH`, wait for `indexnow_epoch_complete`, then `npx wrangler secret delete INDEXNOW_EXTRA_PATHS`. Never commit or paste those files: donor URLs carry names.

**Orchestrator rollout (this lane makes no remote calls):**

1. From `portal/`, use the existing production migration procedure: `npx wrangler d1 migrations apply opax-community --remote`. Apply pending numbered migrations in order, including `0013_indexnow.sql` if needed, then **`0014_indexnow_backoff.sql`**. The latter adds job backoff, supersession, plan metadata and totals, plus `indexnow_control`, `indexnow_sent` and `indexnow_daily`. Do not deploy the new handler before its migration; missing tables/columns log a database failure.
2. Deploy the reviewed fix through the orchestrator. Keep `INDEXNOW_EXTRA_PATHS` configured until the privacy job completes. The current `2026-10-10-donor-privacy` job is upgraded on its first enabled tick; no epoch bump or journal reset is needed. Optional future cap changes use the `INDEXNOW_DAILY_CAP` environment variable.
3. Check `indexnow_plan`, `indexnow_status` and any `indexnow_backoff` logs. Confirm the older incomplete jobs are superseded and the current cursor advances; a future next-attempt time or an exhausted daily cap explains a paused cursor. Inspect counts only, without printing job URL lists or the private secret. Verify the public key and built crawl assets through the normal deployment checks.
4. After `indexnow_epoch_complete`, remove the private extra-path secret through the normal secret procedure. Continue normal epoch changes; accepted prefixes and the D1 daily counter carry across them.

**Expected drain time for the 10 October backlog:** the reported 8,621-URL plan, less the 3,000 already accepted unchanged URLs, leaves approximately **5,621 distinct unsent URLs** after carry-forward. At 2,000/day that takes **three UTC quota days** (2,000 + 2,000 + 1,621), assuming successful responses, no additional changes and unused daily allowance. With 1,024 changed person pages plus 64 donor extras, all approximately **1,088 privacy URLs** fit in the first three 500-URL batches, across two cron ticks (normally within 10 minutes of rollout). A full 8,621-URL plan without accepted-prefix credit would take five quota days. Backoff, rejected requests consuming allowance and ongoing changes can extend these times. The three original plans are overlapping work and must not be added together.

Jake's manual step: open Bing Webmaster Tools, import the verified OPAX property from Google Search Console, and submit `https://opax.com.au/sitemap.xml`. This lane does not set up the account or submit the property.

## Validation

Use Node 24. Run `npm ci` in `portal/`, then `npm run build:search` before tests. The deployment build steps are search, social, grants-map, analytics and voice; also rebuild graph after graph/client URL changes. Run asset stamping, privacy and photo identity checks, without `wrangler deploy`.

On this desktop, local servers and Wrangler type generation need a network namespace:

```sh
cd portal
unshare -rn sh -c 'ip link set lo up; node --test test/*.test.mjs'
unshare -rn sh -c 'ip link set lo up; npm run check'
npx tsc --noEmit
uv run --frozen --with pytest python -m pytest tests -q # from repo root
unshare -rn sh -c 'ip link set lo up; npx wrangler dev --local --port 8787 --var INDEXNOW_ENABLED:false --var INDEXNOW_DRY_RUN:true'
```

Inside that same namespace, GET the measurement paths with `curl -A Googlebot`; count the prerender block and inspect the canonical. Check `/subject/person/Bruce%20Baird`, `/sitemap.xml` and `/sitemaps/bills-1.xml`. Wrangler rewrites the configured upstream host and matching `Location` headers: to verify `www`, run a separate local session with `--local-upstream www.opax.com.au`, then curl with `-H 'Host: www.opax.com.au'`. `/money`, the Bruce name plus trailing slash and an uppercase bill key plus trailing slash must each return one 308 to the HTTPS apex canonical. The combined `/map/` and `/community/` forms do the same; their apex slash aliases use 301. Do not follow that redirect onto production; fetch the canonical path through the apex local session instead. Apex name/path redirects return 301 (Wrangler may display the equivalent localhost location).

`www` discovery requests (`/sitemap.xml`, `/sitemaps/*.xml`, `/robots.txt`, `/llms.txt`) use one host-level **301** to the apex, combining a trailing-slash correction where needed. Apex files serve directly with 200. This follows Google’s [permanent redirect guidance](https://developers.google.com/search/docs/crawling-indexing/301-redirects); Google also [follows HTTP redirects for robots.txt](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec). The same direct-response and one-hop table checks cover GET and HEAD.

`seo-render.test.mjs` bundles and dispatches the real Worker against built disk assets, samples every route type and checks one canonical, canonical OPAX anchors/JSON-LD, factual content and no loading/error text. Table-driven GET/HEAD alias checks combine `www`, case, names and slashes, check one hop and fetch the final exported page. Crawl tests cover orphan divisions, per-record dates, fallback counts and chunk limits. Social tests check profile/card paths. Sponsor tests retain all main resolver cases and verify the actual Faruqi SSR block. All bill bodies are exercised, including every nullable stage; page budgets and person-link targets are checked against built assets. Wording checks cover every route type and all 438 campaigners. Hydration tests preserve normalised initial pagination and synchronise later updates. Exporter tests protect the existing member evidence and reject mismatched party enrichment. Compare `votes.json` bytes to `a290fbbf`; schema remains 1 and SHA-256 is `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Validated on 10 October 2026 with Node 24.21.0: **1,094 JavaScript tests**, **536 Python tests and 236 subtests** passed; TypeScript, `npm run check`, deployment build steps (including graph), privacy/stamp/photo checks and local Googlebot probes passed. The Python suite includes the exporter, refresh guard, nightly exports and bill enrichment tests. Main at `3790ecdf` was merged first (`789e485f`), preserving the validated sponsor resolver and its tests. No push, deploy, production write, sitemap submission or external IndexNow ping was performed. Generated crawl/catalog assets are rebuilt by deployment; the tracked search manifest is left at its baseline. The strategy and data-appendix reference copies are excluded from the commit.

Jake's remaining steps: the orchestrator merges and deploys; Jake submits or resubmits the sitemap through Search Console/Bing by hand. The individual-donor indexing decision remains pending. A deceased notice requires an authoritative source field. The IndexNow key, enable/dry-run flags and cron remain as above; the orchestrator must apply the journal migrations before rolling out the revised handler.
