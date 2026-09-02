# DATA-WORDS — what politicians said outside the chamber, and the documents they debated

Status (2026-09-02): **acquisition verified per source; samples loaded into
`ext_` tables on `desktop`; nothing pushed to the ARAG knowledge base.** The KB
push is a separate, costed decision for Jake (§8). Fetchers:
`parli/ingest/words_press_releases.py` (press releases / transcripts),
`parli/ingest/words_parlinfo.py` (ParlInfo: bills, EMs, digests, committee
reports, press-release index; plus the Federal Register of Legislation Act
join). Shared plumbing: `parli/ingest/words_common.py`. They run on the box
that holds `parli.db` (`ssh desktop`, code copy in `/tmp/arag_mig`, logs in
`/tmp/arag_mig/logs/`).

Ground rules baked into the code: every writer refuses non-`ext_` table names;
loads are `INSERT OR REPLACE` on the source's own primary key (re-runs are
idempotent); the honest User-Agent `OPAX research (opax.com.au)` is the
default; robots.txt is honoured (ParlInfo's `/parlInfo/download/` and
`/parlInfo/genpdf/` are never requested).

## 1. Source table

| # | Source | What it is | Endpoint / format | Volume | Dates | Licence | Access with honest UA | Fetcher | State |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **PM Transcripts** pmtranscripts.pmc.gov.au | Every PM's speeches, media releases, interviews, doorstops since Curtin | Documented XML API `/query?transcript=<id>`; ids 1..~47,700 with gaps (~26K docs) | ~26K | 1941 → today | **CC BY 4.0** | yes | `words_press_releases pmtranscripts` | **7,007 stored** (stride-25 survey + dense ids 40000–47576) |
| 2 | **NSW ministerial media releases** nsw.gov.au | Whole-of-government ministerial releases | Elasticsearch proxy `/api/v1/elasticsearch/prod_content/_search?q=subtype:ministerialmediarelease` (JSON incl. `html_content`) | 6,221 | 2022-03 → today | **CC BY 4.0** | yes | `words_press_releases nsw --all` | **complete** |
| 3 | **QLD ministerial media statements** statements.qld.gov.au | Every ministerial statement since Borbidge/Beattie | Sequential `/statements/<id>` HTML with `ld+json` NewsArticle (`articleBody`) and a minister/portfolio block; ids 1..~105,990 (≥106,000 → 404, probed) | ~106K | 1997-08 → today | **CC BY 4.0** (qld.gov.au/legal/copyright) | yes (no robots.txt) | `words_press_releases qld` | **3,225 stored** (1-in-50 survey + dense ids 104000–105990) |
| 4 | **VIC Premier media centre** premier.vic.gov.au | Premier + ministers' releases (Andrews/Allan) | `sitemap.xml?page=1..12` (2,000 URLs each) → `/api/tide/page?path=/<slug>` JSON (`type: news`, `body.content`) | 23,938 slugs | 2014-12 → today | **CC BY 4.0** | yes; robots `Crawl-delay: 2` | `words_press_releases vic` | **842 stored** (oldest slugs first) |
| 5 | **Treasury portfolio ministers** ministers.treasury.gov.au | Treasurer / Assistant Treasurers' releases, speeches, transcripts, op-eds | Drupal JSON:API `/jsonapi/node/media?include=field_minister,field_media_type` (body HTML, date, minister term, media type) | ~3.9K | 2022-05 → today (older archive is HTML-only and 403s the honest UA) | **CC BY 4.0** (treasury.gov.au/copyright-disclaimer) | JSON:API yes; HTML 403 | `words_press_releases treasury --all` | **complete — 3,883 stored** |
| 6 | Other federal portfolio ministers (Defence, Infrastructure, Education, Health, Foreign, Trade, Industry, PM&C, DVA, Finance, Agriculture, AG, DEWR, DSS, Home Affairs) | Same shape as Treasury | `/rss.xml` → 20 newest items only; `/jsonapi` 403/404 everywhere except Treasury; HTML listings 404 (path differs) or 403 (WAF); health.gov.au (65 pages for Butler), minister.defence.gov.au (8 pages), minister.dva.gov.au listings answer 200 | unknown, tens of thousands in total | mixed | CC BY 4.0 on most (per-site copyright page — confirm each) | partial | none yet | plan step (§7) |
| 7 | **ParlInfo press-release index** (`Dataset:pressrel`) | The Library's index of every MP/senator/minister release, transcript, speech since 1889 | Search listing (100/page): date, title, office, author, category, OCR excerpt; display page adds Party / In Government | 663,680 | 1889 → today | CC BY-NC-ND 4.0 (aph.gov.au) | **403** — Azure WAF blocks non-browser UAs; module requires `--browser-ua` | `words_parlinfo listing/display --dataset pressrel` | 300 index rows; text is PDF under robots-disallowed `/download/` → **metadata only** |
| 8 | **ParlInfo bill homepages** (`billhome`) | One record per bill with the Library's neutral summary, portfolio, progress | Listing excerpt = summary; display page links every text version + EM | 6,469 | 1996 → today | CC BY-NC-ND 4.0 | 403 / `--browser-ua` | `words_parlinfo listing --dataset billhome` | 500 newest |
| 9 | **ParlInfo bill text** (`bills`) | Full text of every bill version, one record per section/schedule | Display page renders the section as HTML inside `#documentContent`; `bill-sections` walks `r7451_first-reps/0000, /0001, …` until the 301 that marks the end; stages `first-reps`, `first-senate`, `third-reps`, `third-senate`, `aspassed`; `billshistorical/*` back to 1901 | 72,339 sections | 1901 → today | CC BY-NC-ND 4.0 | 403 / `--browser-ua` | `words_parlinfo bill-sections` | 311 sections = 79 versions of 62 bills (§3) |
| 10 | **ParlInfo explanatory memoranda** (`ems`) | EM / supplementary EM / revised EM for every bill | Display page embeds the Word export as HTML (`WordSection` divs) after the download icons → full text | 12,354 | 1996 → today | CC BY-NC-ND 4.0 | 403 / `--browser-ua` | `words_parlinfo display --dataset ems` | 103 full texts |
| 11 | **ParlInfo Bills Digests** (`billsdgs`) | Parliamentary Library's independent digest of each bill | Display page carries the digest's OCR text inline (~22K chars for a 9-page digest) → full text | 7,985 | 1990s → today | CC BY-NC-ND 4.0 | 403 / `--browser-ua` | `words_parlinfo display --dataset billsdgs` | 100 full texts |
| 12 | **ParlInfo committee reports** (`reportsen` / `reportrep` / `reportjnt`) | Senate / House / Joint committee reports, one record per chapter (members, recommendations, chapters, dissenting reports, appendices) | Display page renders the chapter HTML inline | 7,600 / 1,529 / 5,301 chapters | 1990s → today | CC BY-NC-ND 4.0 | 403 / `--browser-ua` | `words_parlinfo display --dataset report*` | 500 chapters (200 / 100 / 200) |
| 13 | **Federal Register of Legislation** api.prod.legislation.gov.au | Every Act title; `originatingBillUri` points at the ParlInfo `billhome` code → Acts ↔ bills ↔ `legal_documents` join | OData v4 `/v1/titles?$filter=collection eq 'Act'&$top=100&$skip=N` (100 max/page; `$count=true` works; date filters and `$orderby` 500) | 13,732 Acts | 1901 → today | CC BY 4.0 (legislation.gov.au) | yes | `words_parlinfo frl-acts` | **complete** |
| 14 | SA Premier / ministers premier.sa.gov.au | Ministerial releases | Cloudflare **managed JS challenge** on every path incl. robots.txt and RSS | — | — | — | **blocked** | — | not feasible with curl/urllib |
| 15 | legislation.gov.au full text | Acts / instruments as made and compiled | FRL `Documents` are Word/PDF/Epub only (`contents` empty) | — | — | CC BY 4.0 | yes | — | not pulled: `legal_documents` (Open Australian Legal Corpus) already holds 11,648 legislation + 31,696 regulation docs |
| 16 | aph.gov.au HTML digests / committee pages | Same content as 11–12 | Old `bd/bdNNNN` HTML URLs now 301 to the Library landing page; site behind the same WAF | — | — | — | 403 | — | superseded by ParlInfo display pages |

## 2. Licences — what is clean and what needs a call

* **CC BY 4.0 (clean, attribution only):** PM Transcripts, NSW, QLD, VIC,
  Treasury, FRL. Attribution strings are stored per row in
  `ext_press_releases.licence` / the KB `extra.metadata.licence`.
* **CC BY-NC-ND 4.0 (aph.gov.au / ParlInfo):** covers bill text, EMs, digests,
  committee reports and the press-release index. Two clauses need Jake's call
  before any push: **NC** — OPAX must stay non-commercial for this material;
  **ND** — the KB stores and quotes text verbatim (fine) but the enrichment
  passes (summaries, topic labels) produce derived text; keep enrichment off
  ParlInfo-sourced resources, or get the Library's OK. (Bill text and EMs are
  also Commonwealth legislative material with an arguable public-policy
  exemption, but that is a legal opinion, not a licence.)
* **Access decision on ParlInfo:** the WAF rejects the honest UA with HTTP 403
  on every page; robots.txt is permissive (`Allow: /`, disallowing only the
  PDF/`genpdf` paths). `words_parlinfo.py` refuses to run without
  `--browser-ua`, so sending a Firefox UA is an explicit operator choice each
  run (the pre-existing `committee_hearings.py` ingester does the same). The
  samples in §3 were fetched that way at ≤0.7 requests/s.

## 3. What was pulled (counts on `desktop`, 2026-09-02)

See `python3 -m parli.ingest.words_press_releases stats` and
`python3 -m parli.ingest.words_parlinfo stats` for live numbers.

**`ext_press_releases` — 21,178 rows** (PK `source, source_id`; `body_html` + `body_text`,
`speaker` = `normalize_speaker()` form, `role`, `party`, `government`, `licence`).

| source | rows | dates | named speaker | party | avg body | ≥200 chars & ≥1993 | coverage of the source |
|---|---:|---|---:|---:|---:|---:|---|
| pmtranscripts | 7,007 | 1941 → 2026-08 | 7,003 | 7,003 | 10.2K | 6,638 | 1-in-25 survey of ids 1–47,700 + dense ids 40,000–47,576 (every Turnbull/Morrison/Albanese item); ~19K ids 1–40K still to walk |
| nsw | 6,221 | 2022-03 → 2026-09 | 971 (Premier / Deputy Premier only) | 970 | 3.5K | 6,220 | **complete** |
| treasury | 3,883 | 2022-05 → 2026-09 | 3,883 | 3,883 | 8.3K | 3,883 | **complete** (JSON:API archive; 1,960 transcripts / 1,350 releases / 341 speeches / 173 op-eds) |
| qld | 3,225 | 1997-08 → 2026-09 | 3,225 | 3,147 | 3.1K | 3,224 | 1-in-50 survey of ids 1–106K + dense ids 104,000–105,990; ~100K ids to walk |
| vic | 842 | 2019-01 → 2020-01 | 824 | 824 | 2.4K | 842 | first 846 of 23,938 sitemap slugs (sitemap is oldest-first); ~23K to walk |

**`ext_parlinfo_docs` — 1,814 rows** (PK `parlinfo_id`; `body_text`, `excerpt`, `bill_code`,
`bill_id`, `meta_json`). Every dataset's display page was exercised; bodies below were
re-fetched after the UTF-8 fix (0 rows with mojibake residue).

| dataset | rows | dates | inline body | avg body | min–max | total text | notes |
|---|---:|---|---:|---:|---|---:|---|
| billhome | 500 | 2006 → 2026 | — (summary in `excerpt`, 379 ≥200 chars) | — | — | — | 198 linked to `bills.bill_id`; 313 of them are the `originatingBill` of an Act in `ext_frl_acts` |
| bills (text) | 311 sections = **79 versions of 62 bills** | 2006 → 2026 | 311 | 13.5K/section, ~53K/version | 51 – 170K | 4.2 MB | versions by stage: 28 `first-reps`, 15 `first-senate`, 8 `third-reps`, 25 `aspassed`, 3 historic `first`; 3 pre-2012 bills verified (r2664–r2667) |
| ems | 103 | 2009 → 2026 | 103 | **118K** | 509 – 700K | 12.1 MB | 100 from the listing + 3 stubs discovered on bill-home pages |
| billsdgs | 100 | 2024-11 → 2026-08 | 100 | 41K | 13K – 96K | 4.1 MB | OCR layer, mojibake repaired |
| reportsen | 200 | 2026-07 → 2026-09 | 200 (190 ≥200 chars) | 12.3K | 50 – 97K | 2.5 MB | 42 chapters across the three report sets are "recommendations" chapters |
| reportjnt | 200 | 2026-02 → 2026-08 | 200 (198) | 9.1K | 57 – 89K | 1.8 MB | |
| reportrep | 100 | 2025-03 → 2026-06 | 100 | 21.5K | 271 – 224K | 2.2 MB | |
| pressrel | 300 | 2026-08 → 2026-09 | 0 | — | — | — | index only; 299 authors normalised, 30 with party from display pages |

**`ext_frl_acts` — 13,732 rows (complete register).** 4,049 Acts carry an
`originatingBillUri` → `bill_code` (all 3,954 of 3,971 Acts made since 2000; 4,049 of 5,094 since
1993-03-13; none before 1990). 313 join the 500 stored bill homepages.

Request budget spent today: ≈14.6K HTTP requests (PM Transcripts 4,751 + 1,900 survey · QLD
1,600 + 2,120 survey · VIC 514 · Treasury 3×80 · FRL 2×138 · ParlInfo ≈1,700 at ≤0.7 rps).
`ext_ingest_log` is untouched by these fetchers (they upsert on natural keys); run
`stats` for live counts.

## 4. Quality issues found (and what the code does about them)

**PM Transcripts.** The XML `release-type` field is a free-text vocabulary:
`Transcript` 38%, `Media Release` 27%, `Speech` 16%, `Interview` 10%, then a
tail where subject strings leaked into the type (`Broadband`, `Health`,
`School Education`, `Index`) — kept raw in `release_type`, and the KB label is
whatever the source says. 4 of 2,259 rows have no PM name; a handful of very
old items have an empty `<content>` (PDF scan only, `document_url` recorded).
Party comes from a surname table (`PM_PARTY`); McEwen is the only
non-Liberal/Labor PM.

**NSW.** Attribution is by *portfolio*, not person (`name_ministers` =
"Premier", "Minister for Health"). Only the Premier / Deputy Premier are
resolved to a person by date of office (971 of 6,221 rows). Resolving the rest
needs a NSW ministry list joined by date — a follow-up, not a blocker (the
portfolio is stored in `role`).

**QLD.** Clean minister names + portfolios on every statement (`statement-
ministers` block; `extra_json.ministers` keeps all co-signatories, `speaker` is
the first). Party is inferred from the government of the day only when it is
single-party (Labor / LNP); Borbidge-era Coalition rows get none. 1997–2003
statements are short (~1.5K chars).

**VIC.** The sitemap lists 23,938 slugs (12 pages × 2,000); non-news pages are
filtered by `type == "news"`. Attribution is parsed from the "Quotes
attributable to <role> <name>" convention (191 of 196 sample rows resolved);
names are the last two tokens (three when a particle such as *De* precedes),
so double-barrelled surnames without a hyphen will mis-split — `speaker_raw`
keeps the source line for correction. robots `Crawl-delay: 2` makes the full
site a 13-hour crawl (§7).

**Treasury.** Minister taxonomy terms carry the term year ("Jim Chalmers
2022") — stripped before `normalize_speaker`; `role` = the term's
`field_position`. The JSON:API exposes ~3.9K nodes from May 2022; the
pre-2022 archive exists as HTML but returns 403 to the honest UA. Party via
the federal-government table (Labor only; Coalition eras get none).

**ParlInfo (all datasets).** (a) Two encoding layers: the server sends
`text/html` with **no charset**, so `requests` decodes the UTF-8 body as
ISO-8859-1 (`’` → `â€™`) — every page is now decoded explicitly as UTF-8
(`page_text()`); underneath that, the digests' OCR layer is itself
UTF-8-as-Latin-1 (`â\x80¢` for `•`), which `fix_mojibake()` re-decodes per
line where it round-trips. Rows fetched before the fix were re-fetched. (b) Word exports break lines mid-paragraph — collapsed before
text extraction. (c) The metadata `<dd>Title` truncates at 80 chars; the
`<title>` tag is used instead. (d) Bill sections: `/0000` is the cover page +
table of contents; a KB resource is one *version* (all sections joined, §5).
(e) Digests end with ~600 chars of Library boilerplate; EMs start with the
"Circulated by the authority of…" front matter — both left in (they are part
of the document). (f) Committee reports are per-chapter records; member lists
and submission appendices are short (<500 chars) and mostly fall under the
200-char / usefulness filter for the KB. (g) Press-release index rows have no
body: `pdf_url` is recorded but never fetched (robots). (h) Author strings
"DUTTON, Peter, (former Member)" → `normalize_speaker` after stripping
parentheticals; the 25-code `PARTY_CODES` map covers what the sample showed.

**Joins.** `link-bills` matches `billhome` / `ems` / `billsdgs` titles to
`bills.bill_id` (ALRC status list, 1998–2022 only): 198 of the 500 newest bill
homepages matched — the rest are post-2022 bills the ALRC file never saw.
`bill_code` (`r7451` / `s1511`) is the durable key between billhome ↔ bill
text ↔ EM ↔ FRL Act; digests carry no code and join by title.

## 5. KB mapping (shape mirrors `parli/ingest/arag_sync.py`; `map` commands print it)

| Source rows | `kind` label | slug | title | collaborators (`normalize_speaker`) | labels beyond `kind`/`source`/`state`/`decade` |
|---|---|---|---|---|---|
| `ext_press_releases` (all five sources) | `press_release` | `press-{pmt\|nsw\|qld\|vic\|tre}-{source_id}` | "{speaker or role} — {title} — {date}" | `[speaker]` when the row names a person | `party`, `release_type`, `government` |
| `ext_parlinfo_docs` billhome | `bill` | `parlinfo-legislation-billhome-{code}` | "{House} — {bill title} — {date}" | none | `portfolio` |
| bills (grouped per version) | `bill_text` | `parlinfo-legislation-bills-{code}_{stage}` | "{bill title} — {stage} — {date}" | none | `stage`, `portfolio` |
| ems | `explanatory_memorandum` | `parlinfo-legislation-ems-{id}` | "{House} — {bill title} — {date}" | none | — |
| billsdgs | `bills_digest` | `parlinfo-legislation-billsdgs-{id}` | "Bills Digest Service — {bill title} — {date}" | none | — |
| report* (per chapter) | `committee_report` | `parlinfo-committees-{dataset}-{report}-{chapter}` | "{committee} — {report title : chapter} — {date}" | none | `chamber`, `committee` |
| pressrel (index only) | `press_release` | `parlinfo-media-pressrel-{id}` | — | `[author]` | `party` | **not pushed** (no body) |

Common to all: `texts.body` = title + blank line + body (titles are not
searchable on the platform, so the headline is part of the text);
`origin.created = date + T00:00:00Z`; `origin.url` = the public page;
`extra.metadata` carries the raw attribution, licence string, `bill_code`,
`bill_id`, PDF URL. Filter: `date ≥ 1993-03-13` and body ≥ 200 chars, as for
speeches (`arag_sync.py`), except bill text / EMs / digests where the bill's
date decides. Speaker-filtered asks need the provenance turn (MIGRATION-ARAG.md
invariant) — unchanged.

## 6. Volume + cost estimates

Token counts use chars ÷ 4. The speech corpus that is loading now is 518,685
docs / 1.67 GB / ~0.42 B tokens; the ARAG platform's ingest price per token is
the open sign-off in MIGRATION-ARAG.md §Costs, so this table gives sizes and
the ratio to the speech load rather than dollars for ingest. Enrichment is
priced at the BYOK DeepSeek rate actually in use ($0.44 in / $1.32 out per 1M;
~150 prompt + ~150 output tokens per doc).

Measured averages (body chars per document, from the samples in §3): PM
Transcripts 8.9K · NSW 3.5K · QLD 2.9K · VIC 2.3K · Treasury 8.3K · Bills
Digests 43.7K · EMs 126K mean / 76K median (n=87; deciles 6K → 380K, max
700K — the mean is right for totals) · bill text 11.5K per section, ~50K per
bill version · committee-report chapters 12.7K.

| Set (post-1993 filter) | KB resources | Text | Tokens (÷4) | vs speech load (1.67 GB) | Enrichment, one pass (BYOK DeepSeek) |
|---|---:|---:|---:|---:|---:|
| PM Transcripts (ids 9K→47.7K are post-1993) | ~20K | ~180 MB | ~45 M | 0.11× | ~$25 |
| NSW ministerial releases | 6.2K | 21 MB | 5 M | 0.01× | ~$4 |
| QLD ministerial statements | ~106K | ~300 MB | ~76 M | 0.18× | ~$60 |
| VIC Premier media centre | ~24K | ~56 MB | ~14 M | 0.03× | ~$12 |
| Treasury ministers | 3.9K | 32 MB | 8 M | 0.02× | ~$5 |
| **Press releases, all five (CC BY)** | **~160K** | **~0.6 GB** | **~150 M** | **0.36×** | **~$105** |
| Bills Digests | 8.0K | ~350 MB | ~87 M | 0.21× | ~$40 |
| Explanatory memoranda | 12.4K | ~1.55 GB | ~390 M | 0.93× | ~$175 |
| Bill text (one resource per version) | ~15K versions (72K sections) | ~0.83 GB | ~210 M | 0.5× | ~$95 |
| Committee reports (chapters ≥200 chars) | ~12K | ~180 MB | ~46 M | 0.11× | ~$25 |
| **ParlInfo documents, all (CC BY-NC-ND)** | **~47K** | **~2.9 GB** | **~730 M** | **1.75×** | **~$335** |
| **Everything** | **~210K** | **~3.5 GB** | **~880 M** | **2.1×** | **~$440** |

Reading the table: the ARAG platform's ingest charge is per processed token
with an undisclosed multiplier (MIGRATION-ARAG.md §Costs, sign-off 1), so the
"vs speech load" column is the honest unit — the whole WORDS set would cost
roughly 2.1× whatever the current 518K-speech load turns out to cost; the
CC BY press-release set alone is about a third of it, and EMs alone are
almost a full speech-load equivalent (they are long, and the bill text they
explain is already in the set — a digest-first order is the cheaper path to
"what was this bill about"). The enrichment
column is the labeller *or* summaries pass at the OpenRouter price actually in
use ($0.44 in / $1.32 out per 1M tokens; both passes together ≈ double).
Nothing here includes retrieval/ask costs, which scale with usage, not corpus
size. The 1993-03-13 cutoff removes ~6K PM Transcripts, ~7.8K Acts-era bill
records and nothing from the state sets (all post-1997).

## 7. Plan steps — the crawls that are hours, not minutes (run on `desktop`, `nohup … &`)

| Step | Command | Requests | Wall time | Notes |
|---|---|---|---|---|
| PM Transcripts, full | `words_press_releases pmtranscripts --ids 1-25000` then `--ids 25000-47700` | 47.7K probes (~26K hits) | ~3.3 h at 4 rps | stride survey shows ids 25K–40K are nearly empty; skipping them saves ~1 h |
| QLD, full | `words_press_releases qld --ids 1-105990 --rps 2 --workers 2` | 106K | ~15 h at 2 rps (29 h at the default 1 rps) | no robots.txt; keep ≤2 rps |
| VIC, full | `words_press_releases vic --limit 0 --sitemap-pages 14` (set limit high) | 23.9K + 14 | ~13.3 h (robots Crawl-delay 2) | resumable — skips stored slugs |
| ParlInfo EMs, full | `--browser-ua listing --dataset ems --pages 124` then `display --dataset ems --limit 12400` | 124 + 12.4K | ~5 h at 0.7 rps; pages are 100 KB–800 KB (~3 GB) | operator UA decision |
| ParlInfo digests, full | `listing --dataset billsdgs --pages 80` + `display --dataset billsdgs --limit 8000` | 80 + 8K | ~3.2 h | |
| ParlInfo committee reports, full | `listing --dataset report{sen,rep,jnt}` (76 / 16 / 54 pages) + `display` for 14,430 chapters | ~14.6K | ~5.8 h | |
| ParlInfo bill text, full | `listing --dataset billhome --pages 65` then `bill-sections --limit 6500` | ~6.5K billhome + ~72K sections | ~31 h at 0.7 rps; ~10 h if limited to bills since 1993 whose versions are only `first-*` + `aspassed` | biggest single crawl; alternatively `listing --dataset bills --pages 724` (17 min) enumerates every section id first |
| Other portfolio sites | new GovCMS HTML-listing fetcher for health.gov.au / minister.defence.gov.au / minister.dva.gov.au (the three whose listings answer 200) | ~5K pages | ~2 h | RSS gives only 20 items; JSON:API is closed on all but Treasury |
| NSW ministry list join | scrape the NSW Parliament ministry list by date → resolve portfolio → minister | small | — | lifts NSW attribution from 16% to ~100% |

## 8. The push — Jake's decision, not this branch's

Nothing here writes to the KB. When approved, the sync is a small extension of
`arag_sync.py`: iterate `ext_press_releases` through
`words_press_releases.map_press_release` and `ext_parlinfo_docs` through
`words_parlinfo.map_parlinfo_doc` / `map_bill_version`, reusing the
checkpointed, 429-aware loader. Recommended order by value per token:
(1) PM Transcripts + Treasury (federal, CC BY, named speakers — plugs straight
into the speaker filter); (2) QLD + NSW + VIC ministerial releases (state
words, CC BY); (3) Bills Digests (the Library's neutral explanation of every
bill — highest value per byte of the ParlInfo set); (4) EMs; (5) committee
reports; (6) bill text (largest, most redundant with `legal_documents` for
passed bills). Steps 3–6 need the CC BY-NC-ND call in §2 first.
