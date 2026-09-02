# Registers of members' interests — audit, source survey, parsers, accuracy, load, exposure design

Status 2026-09-02: federal House (48th Parliament) and Queensland (58th) registers are
parsed and **loaded into new `ext_interests*` tables on `desktop`**; the Senate parser is
written and verified on two saved pages but the other 74 senators are not fetched (access
decision below). **Nothing has been pushed to the KB**; every step that costs money or
touches a third party's terms is marked **GATE (user decision)**.

Recommendation in one paragraph: expose declared interests on person pages **now** from
`ext_interests` — 246 documents / 8,268 rows, every row linking to the page of the source
PDF, with a measured **995 / 997 (99.8 %) entry-exact extraction** on a 26-member House
sample and 262 / 272 (96.3 %) on QLD — and keep the register **out of the KB** for the moment (CC BY-NC-ND
on aph.gov.au makes a re-rendered statement a derivative; the QLD terms could not be read
past its WAF). The one access question worth a decision is the Senate: www.aph.gov.au's
WAF blocks every non-browser client, so completing the 76 senators needs either a browser
session that saves the pages, an explicit `--browser-ua` opt-in, or ~76 firecrawl credits.
Of the other states only TAS and ACT are fetchable, and both publish copier scans (OCR).

---

## Phase 1 — audit of what we have (parli.db on `desktop`)

There is no `interests` table; the pre-existing table is **`mp_interests`** (449 rows).

| Column | What it holds |
|---|---|
| `person_id` | 20 distinct members, all matched to `members` (House, 48th) — surnames Abdo → Caldwell only, i.e. the first screen of the alphabetical index |
| `interest_type` | 14 free values (`other` 127, `savings` 54, `gift` 41, `property` 40, `shareholding` 39, `liability` 36, `income` 26, `travel` 26, `trust` 20, `directorship` 17, `bond` 10, `partnership` 10, `investment` 2, `asset` 1) |
| `declared_date` | 2025-08-01 → 2025-08-19 on 309 rows, NULL on 140 |
| `source_url` | a bare filename (`Byrnes_48P.pdf`), not a URL |
| `raw_text` | NULL except a handful of JSON fragments |
| `created_at` | 2026-03-28 20:31 → 21:17 UTC — one 46-minute session |

It also stores nil cells as interests (`Butler: shareholding "Not Applicable"`, `Bowen:
directorship "NIL"`), has no `holder` (self / spouse / children), no page reference, no
parliament-period key beyond `parliament_number=48`, and **no code in the repo reads it**
(grep over `*.py`, `*.ts`, `*.js`, `*.md`: zero references; no views). Verdict: an abandoned
prototype. Per the ext_* convention it is left untouched (still 449 rows after the load);
drop it whenever convenient. The new tables supersede it.

## Phase 2 — sources and access (measured 2026-09-02, honest User-Agent `OPAX research (opax.com.au)`)

### Federal — House of Representatives (done)

* Index: `https://www.aph.gov.au/Senators_and_Members/Members/Register` — one row per
  member with a last-updated date and a PDF link. **www.aph.gov.au returns a WAF block page
  to every non-browser User-Agent** (python-requests, curl, WebFetch — and `robots.txt`
  itself is blocked, so robots cannot be verified from here). The saved copy used for this
  run is `scratchpad/pages/house_register.html` (captured by the previous session).
* Documents: `https://static.aph.gov.au/-/media/03_Senators_and_Members/32_Members/Register/48p/<AB|CF|…>/<Name>_48P.pdf?rev=…`
  — **static.aph.gov.au serves the research UA**. 151 PDFs (all current members), 2,559
  pages, ~1.7 % of pages scanned (signature pages, three fully scanned statements, one
  member's scanned alteration set). Cached in `~/.cache/autoresearch/conduct_interests/federal/house/48p`
  (this run: `scratchpad/pdfs/reps_all`, meta `.json` per file records the index `rev`).
* Form: typed "Statement of Registrable Interests" (14 numbered items, one table per item
  with Self / Spouse-Partner / Dependent-Children rows and 1–3 columns) followed by
  "Notification of alteration(s)" pages (ADDITION / DELETION tables of Item + Details, a
  `Submitted Date` per notification).
* Licence: site-wide **CC BY-NC-ND 4.0**. Facts are extracted and every row links to the
  page of the source document; re-publishing rendered statements is a derivative (§6).
* Archive: `…/Members/Register/Previous_Parliaments/47th_Parliament_Register_of_Members_interests`
  (same PDF host) — not fetched; the parser is parliament-agnostic (`PARLIAMENT` read from
  the cover page).

### Federal — Senate (parser verified, fetch gated)

* One server-rendered HTML page per senator:
  `https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register/<id>`
  (tables per section, dated Addition/Deletion items, `Last modified` in the details box).
  Same WAF as the index. Two saved pages (`16913` Ayres, `298839` Allman-Payne) parse
  exactly: 16 + 9 and 14 + 3 non-nil table rows / alteration items in the HTML vs 16 + 9 and
  14 + 3 parsed rows, per-section counts identical.
* **GATE (user decision) — how to fetch the other 74:** (a) a browser session saves the
  index and each senator page into a directory → `senate --senate-html-dir DIR`; (b) opt in
  to `--browser-ua` (the module never spoofs by default because the WAF is an explicit
  anti-bot control); (c) firecrawl at ~1 credit per page (that is how the previous session
  obtained the two pages and the House index). robots.txt cannot be read from here.

### Queensland — Legislative Assembly (done)

* One combined PDF for the whole Assembly, republished by the Clerk with an "AS AT <date>"
  cover: `https://documents.parliament.qld.gov.au/Assembly/Procedures/MembersRegister.pdf`
  (this run: as at **2026-08-28**, 120 pages, 93 members = every seat). The documents host
  serves the research UA. Typed, two-column layout (s.7(5) subclause label + legal
  description on the left, the member's declaration on the right, entries separated by
  semicolons).
* Licence: the site footer says "© 2026 All rights reserved"; `/Global/Copyright` sat behind
  an Azure WAF challenge when probed (both curl and WebFetch). **Unverified** — facts with a
  source link only until someone reads the terms (§6).

### States and territories — survey (curl + WebFetch only, one sample document each)

| Jurisdiction | Where | Format | Access | Licence | Coverage | Difficulty |
|---|---|---|---|---|---|---|
| **NSW** LA + LC | Tabled papers DB (`parliament.nsw.gov.au/tp/files/<id>/<title>.pdf`); LA register 2 volumes/yr "as at 30 June", LC annual + half-yearly | unknown (blocked) | **Cloudflare JS challenge** on robots, landing and PDFs; WebFetch 403 | Copyright page (search snippet) permits copying with © notice but **excludes "papers tabled in Parliament"** | 93 + 42 members; LA registers 2003 → | Hard: blocked + tabled-paper carve-out. Ask the Clerk for bulk copies. |
| **VIC** LA + LC | `parliament.vic.gov.au` tabled-documents database, `tabled-paper-<N>` PDFs (LA 2 vols, LC 1; half-yearly since 2024) | not inspected | **robots.txt `Disallow: /`** for all agents (nothing fetched) | "All other material … is copyright"; CC applies to Library research only | 88 + 40; tabled-paper ids 4034 (2018) → 10071 (2026) | Hard (policy): needs written permission from the Presiding Officers. |
| **SA** HA + LC | No online register found (HA/LC sites probed; site open, no WAF) | — | site 200; `legislation.sa.gov.au` and AustLII 403 | none linked | 47 + 22 | Not published online; the 1983 Act reportedly restricts publication — check before any work. |
| **WA** joint | Tabled paper "Annual Returns as at 30 June" (`parliament.wa.gov.au/publications/tabledpapers.nsf/…`) one combined PDF/yr | unknown | **Azure WAF 403** on everything incl. robots; WebFetch 403 | "All contents Copyright © 2019. All rights reserved." | 59 + 37; papers seen for 2008/2010/2021/2023 | Hard: blocked. |
| **TAS** HA + LC | `parliament.tas.gov.au/house-of-assembly/hamembersinterests` (+ `…/legislative-council/lcmembersinterests`), per-year pages; `__data/assets/pdf_file/…/{Annual,Primary,Variation}-Return-<Surname>,-<First>-DD-MM-YYYY.pdf`, one PDF per member per return | **copier scans, no text layer** (RICOH; 0.7–7 MB; statutory form) | **200** to research UA; robots only blocks CMS internals | footer "© 2026 Parliament of Tasmania", no licence page | 35 + 15; HA 2017-18 →, LC 2019 → | Medium: trivial crawl, OCR required, ~60–70 PDFs/yr. |
| **ACT** | `parliament.act.gov.au/members/ethics-and-accountability` (moved; old URL 404s); `<Surname>-Combined-<D-Month-YYYY>.pdf`, 24 of 25 MLAs | **copier scans, no text layer** (1-bit CCITT, 6 MB / 13 pp) | **200**; robots permissive | **CC BY-NC-ND 4.0** ("Except where otherwise noted") | 25 MLAs, current Assembly | Medium: easy fetch, OCR, NC-ND. |
| **NT** | `parliament.nt.gov.au/members/registrable-interests`; annual "Members' Registrable Interests Reports Volume 1/2" PDFs, March 2019 → March 2026 | unknown | **Cloudflare JS challenge**; WebFetch 403 | not found | 25 MLAs | Hard: blocked. |
| **QLD** | one combined PDF (above) | typed, text layer | 200 | unverified | 93 | **Done.** |

Samples and headers are under `scratchpad/state_survey/`. Nothing was spoofed; where a site
challenged the client the survey stopped.

## Phase 3 — the parsers

`parli/ingest/conduct_interests_federal.py` (House PDFs, Senate HTML, storage, load, KB
export) and `parli/ingest/conduct_interests_qld.py` (QLD PDF; reuses the federal data classes
and storage). Both write **only** to `ext_interests_documents` / `ext_interests` (+ a line in
`ext_ingest_log`), never to `mp_interests` or any legacy table. `pdfplumber>=0.11` was added
to `pyproject.toml` (keep it); OCR needs `pytesseract` + the `tesseract` binary (brew).

How the House parser works, in the order things go wrong:

1. **Page classification** — cover / statement / alteration by text; scanned pages (no text
   layer, or an embedded garbage OCR layer) go through tesseract and a text-line fallback
   (`ocr=1`, or `ocr=2` for the garbage-layer class). Rows from OCR carry the flag so
   consumers can hide or caveat them.
2. **Sections** — headings `1.` … `14.` located on the page; each `find_tables()` table is
   attached to the nearest heading above it. A section whose tables spill onto the next page
   has no heading there, so the last heading (and the 2(i)/2(ii) table count) is **carried
   across the page break** (this recovered Watts's two trustee rows).
3. **Holder rows** — Self / Spouse-Partner / Dependent-Children from the first cell; nil
   cells (`Not Applicable`, `N/A`, `Nil`, `None`, dashes, the typo `Not appilcable`, the
   prose `None other than otherwise disclosed…`) are dropped.
4. **Entry segmentation** (the hard part) — a cell's text lines are partitioned into entries
   by `_break_scores`: terminal punctuation, capitalisation, dangling connectives, open
   brackets, how far the previous line ran toward the cell edge, and — decisive in this form
   — **vertical pitch**: a wrapped line sits 12.1 pt below the previous one, a new entry
   15.1 pt (30.1 pt between alteration items). The pitch is a weighted signal, not a rule,
   because a few members type every line as a paragraph (Watts p2). The first non-empty
   column anchors the entry count; other columns are partitioned into exactly that many
   groups or attached by vertical position.
5. **Alterations** — ADDITION / DELETION tables, Item (`9. Other Assets`) + Details;
   continuation pages (with or without detectable borders) are merged into the block they
   continue; every row in a notification gets that notification's `Submitted Date`
   (fallback: `Processed by Registrar`).
6. **Identity** — `member_name` via `parli.ingest.speaker_names.normalize_speaker` after
   stripping honorifics per comma segment (`the Hon. Ayres, Tim` → `Tim Ayres`);
   `person_id` matched against `members` by surname + chamber, disambiguated by electorate,
   then by current membership.

QLD: words are bucketed into left/right columns at x = 255 pt; member headers are the only
bold 11 pt text (`BATES , Rosslyn Mary (Ros) (Mudgeeraba)`, `de BRENNI, …`, `McCALLUM, …` —
the electorate is always the last bracket, a preferred name may sit in an earlier one, and a
header repeated at the top of a continuation page is the same member); entries split on
`;` and additionally at a paragraph gap (≥ 18 pt), a line ending in `:` (a common typo for
`;`) or `.` followed by a capital. Superscripts are re-glued (`606m²`). `member_name` uses the
preferred name (`Ros Bates`, `Deb Frecklington`, `Mick de Brenni`) — the form Hansard and the
speaker index use — and never middle names.

Running it (the repo's `uv run` is broken on the Mac — the lock pins a Linux-only
`torch==2.9.1+cu128` — so use a scratch venv):

```
uv venv venv && uv pip install --python venv/bin/python pdfplumber pytesseract beautifulsoup4 lxml requests
export PYTHONPATH=/path/to/worktree
venv/bin/python -m parli.ingest.conduct_interests_federal house --index-html house_register.html \
      --pdf-dir pdfs/reps_all --export-jsonl house.jsonl --eval-dump eval/ --dry-run     # ~4 min for 151 PDFs
venv/bin/python -m parli.ingest.conduct_interests_federal senate --senate-html-dir senate_html/ --export-jsonl senate.jsonl --dry-run
venv/bin/python -m parli.ingest.conduct_interests_qld --fetch --export-jsonl qld.jsonl --dry-run
# load on the DB host (stdlib only):
scp parli/ingest/conduct_interests_federal.py *.jsonl desktop:/tmp/opax_interests/
ssh desktop 'cd /tmp/opax_interests && python3 conduct_interests_federal.py load --jsonl house.jsonl --db ~/.cache/autoresearch/parli.db'
```

Re-running a load replaces rows per `doc_id` and appends an `ext_ingest_log` line per
`(chamber, parliament)` source; other sources are never touched. `PARSER_VERSION`
(`2026-09-02.2`) is stamped on every document.

## Phase 4 — accuracy, measured honestly

Method. `--eval-dump` writes one file per member with, page by page, the PDF's text layer
and the parsed rows side by side. A stratified sample — every 6th member of the 151 in
index order, **26 members, 379 pages, 1,001 parsed rows** — was scored by four independent
scorers who enumerated the declared entries from the source text themselves and classified
each as *correct* (exactly one row, only that entry, right section, holder, kind and date),
*merged*, *split*, *wrong attribute*, *text error* or *missed*, plus *spurious* rows. Then
the parser was fixed (pitch signal, section carry, nil typos, OCR label filter), the 13
members whose output changed were **re-scored by fresh scorers**, and the other 13 were
verified byte-identical.

| | ground-truth entries | exactly one correct row | merged | split | wrong section/holder/kind/date | text error | missed | spurious |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| before fixes | 997 | **953 (95.6 %)** | 30 | 6 | 0 | 6 | 2 | 3 |
| **after fixes (loaded)** | 997 | **995 (99.8 %)** | 0 | 2 | 0 | 0 | 0 | 0 |

The two residual splits: an all-caps ETF name that wraps at a 15.1 pt pitch (Watts p2) and
an 8-bullet managed-fund list typed inside one cell (O'Brien p5). Every sampled alteration
row (all kinds, sections, holders and `Submitted Date`s) was correct in both passes.

Caveats that matter for consumers:

* **Granularity is cell = entry.** A comma/semicolon list typed on one line (`ING, Beyond
  Bank`; eight ALP branches in one cell) and several gifts listed under a single
  `11. Gifts` label are **one row**. Counting rows undercounts individual gifts for a few
  members (Bell p13/14/19, King p15, Butler p6, Plibersek p6).
* **Scanned statements are unreliable.** Katter (all pages scanned) yielded 12 OCR rows that
  cannot be verified; at least two are form labels and one page produced nothing.
  Albanese's 15 scanned alteration pages are not parsed at all (recorded in
  `warnings`). Across the House load **87 rows (1.5 %) carry `ocr ≥ 1`** — show them with
  a caveat or hide them. 20 documents have no `statement_date` (undated statement, no
  alteration yet).
* Ground truth was the PDF text layer, not the rendered page; in one cell (Watts 2(i)) the
  column pairing follows the text order and may not match the printed layout.

QLD. An 8-member sample (every 13th member, **272 entries**) scored **245 / 272 (90.1 %)**
on the first parser version — all 27 defects were under-segmentation where the member used
a line break, colon or full stop instead of a semicolon. After adding the paragraph-gap /
colon / full-stop splits the four changed members were re-scored by a fresh scorer and the
four unchanged ones kept their scores: **262 / 272 (96.3 %)**, 10 merged, 0 split, 0 wrong
category, 0 missed, 0 spurious. The 10 residual merges are all one mechanism: an item that
ends with no punctuation at all and the next item starting on the next line (Purdie p100
`…investment, joint` ⏎ `Golden Beach…`; Lee p63 `…Superannuation Fund` ⏎ `ALD; ALL; …` and
`WDS` ⏎ `Specialised Private Capital…`, in both his (a)(iii) and (c) lists) — geometrically
indistinguishable from a wrap because QLD's pitch is 11–12 pt for both. Zero left-column
legal text leaked into any row; category mapping was 100 %; one row's `page` points at the
page before the one its entry starts on (first item after a page break inside a continuing
list — Lee (c) Vanguard). Line-end hyphens now rejoin without a space (`brother-in-law`).

Senate. Two pages, structural check exact (above); rows spot-checked.

## Phase 5 — what is loaded

`ext_interests_documents` (one row per member-period document):
`doc_id` (`house-48-abdo-48p`, `senate-48-16913`, `qld-58-bates-mudgeeraba`), `jurisdiction`
(`federal` | `qld`), `chamber` (`house` | `senate` | `qld_la`), `parliament` (the period:
48 / 58), `person_id` (nullable, `members.person_id`), `member_name_raw`, `member_name`
(speaker form), `electorate`, `state`, `party`, `source_url`, `source_rev` (index `rev` /
QLD as-at), `file_sha256`, `pages`, `ocr_pages`, `last_updated`, `statement_date`,
`fetched_at`, `parsed_at`, `parser_version`, `n_rows`, `warnings` (JSON), `kb_text`.

`ext_interests` (one row per declared entry) — the schema the brief asked for, plus the
form's own structure:
`doc_id`, `person_id`, `member_name`, `jurisdiction`, `chamber`, `parliament` (= period),
`holder` (`self` | `spouse` | `children` | `unspecified`), `section_code` (federal item
1–14, NULL for QLD), `section_title`, `subsection` (`i`/`ii` for trusts, `donation` for
QLD (m)), `category`, `kind` (`statement` | `addition` | `deletion`), `fields_json` (the
cell values as printed, incl. QLD `subclause`), `description`, `date_declared` (alteration
`Submitted Date`; QLD as-at date; NULL on undated statements), `source_url` (**with
`#page=n`**), `page`, `ocr`.

Categories stored (fine-grained) and the mapping to the nine buckets the brief names:

| bucket | stored `category` values |
|---|---|
| shareholdings | `shareholdings` (federal item 1; QLD (a)(i),(iii),(iv)) |
| real estate | `real_estate` |
| trusts | `trusts` |
| directorships | `directorships` |
| gifts | `gifts` |
| travel | `travel` (sponsored travel / hospitality) |
| memberships | `memberships` (organisations, office-holder roles, QLD donations) |
| liabilities | `liabilities` |
| other | `other`, `savings`, `investments` (bonds/debentures), `income`, `other_assets`, `partnerships` |

Loaded 2026-09-02 (`ext_ingest_log` ids 76–79; 79 is the idempotent QLD re-load after the hyphenation fix — 2,469 rows deleted, 2,469 inserted):

| source | documents | rows | matched to `members` |
|---|---:|---:|---:|
| `house-48` | 151 | 5,757 (statement 4,655 / addition 962 / deletion 140) | 149 — unmatched: Alison Byrnes (the aph index spells her "Brynes"), David Farley (not in `members`) |
| `senate-48` | 2 | 42 | 2 |
| `qld_la-58` | 93 | 2,469 | 79 — 14 unmatched: `members.qld_la` rows are surname-only and dirty (`Mc Bailey`, no `de Brenni`, straight vs curly apostrophes in O'Connor/O'Shea, several 2024 entrants missing) |
| **total** | **246** | **8,268** | 230 |

Rows by category across the load: memberships 1,803 · savings 971 · gifts 812 ·
shareholdings 736 · real estate 708 · liabilities 620 · travel 564 · other assets 477 ·
other 462 · trusts 366 · income 358 · directorships 255 · investments 86 · partnerships 50.

## Phase 6 — exposure design

### "Declared interests" on person pages (recommended, no KB, no new cost)

Static export per person from `ext_interests` (same shape as the `votes/` tree planned in
`docs/VOTES.md`): `interests/{person_id}.json` = `{documents:[{doc_id, chamber, parliament,
as_at, source_url, pages, ocr_pages, warnings}], buckets:{shareholdings:{count, rows:[…]},
…}}`, where each row carries `holder`, `kind`, `description`, `date_declared`, `source_url`
(with `#page=`), `ocr`. The Worker serves it as a file; the page renders:

* a header line — "Register of Members' Interests, 48th Parliament, as at *last_updated*
  · statement dated *statement_date* · *n* alterations" — with the provenance sentence and
  licence;
* nine bucket cards with counts (rows, not gifts — say so in the tooltip), expanding to the
  rows; spouse/children rows labelled; additions shown as `+ added dd Mon yyyy`, deletions
  struck through with the date, so the current position and its history are both visible;
* every row ends in "source, p. *n*" → the PDF page (`#page=` works in every desktop
  browser's viewer; QLD rows point at the combined register's page);
* OCR rows (flag ≥ 1) rendered with a "machine-read from a scan" caveat, or hidden behind a
  toggle; documents with `warnings` show "some pages could not be read — see source".

Export SQL: `SELECT person_id, category, kind, holder, description, date_declared,
source_url, page, ocr FROM ext_interests WHERE person_id = ? ORDER BY category, kind, id`.
For the 16 unmatched documents key by `member_name` until the `members` rows are repaired
(the dirty `members` table is a known cross-cutting problem — see MIGRATION-ARAG.md).

Natural cross-links for later: `ext_donations.donor_name` ↔ declared shareholdings /
directorships; lobbyist clients ↔ directorships; travel/hospitality ↔ IPEA expenses.

### Optional — KB documents `kind=interests_statement` — GATE (user decision)

`conduct_interests_federal.py kb-export --db … --out kb_interests.jsonl` writes one document
per member-period from `kb_text` (a plain-text rendering grouped by section, each line
`- [holder]: description (+ added / − deleted, date)`, headed by the member, chamber,
parliament and source URL), slug `interests-{doc_id}`, `speaker` = the normalised name
so speaker filters and the provenance turn work.

| | now | with Senate | with a 47th-Parliament archive |
|---|---:|---:|---:|
| documents | 246 | 322 | ~640 |
| text | ~0.63 M chars ≈ 160 K tokens | ~0.8 M | ~1.6 M |
| share of the 1.67 GB speech corpus | 0.04 % | 0.05 % | 0.1 % |

Platform ingest cost is negligible at this size (the 25-speech smoke push took 4 s), and a
BYOK `/ask` over them costs the usual ~$0.0014. The reasons it is a decision rather than a
default: (1) **licence** — aph.gov.au is CC BY-NC-ND; a re-rendered statement is a
derivative, and the QLD terms are unread; the person-page path shows facts with a link and
is the safer footing; (2) **misattribution risk** — `/ask` answers would cite a member's
declared interests without the alteration history unless the KB text keeps additions and
deletions inline (it does); (3) **OCR rows** would enter the corpus as fact — filter
`ocr ≥ 1` out of `kb_text` before any push. If approved: push with `licence` in metadata,
`created` = `last_updated`, and re-push on every re-load (same slug → replace).

## Open items and next steps

1. **Senate fetch** — pick (a)/(b)/(c) above; the parser and loader are ready
   (`senate --senate-html-dir`).
2. **Refresh cadence** — House: re-read the index; a changed `rev` means a new PDF (cache
   compares it). QLD: the cover date; the PDF is republished roughly weekly. Loads are
   idempotent per `doc_id`.
3. **Scanned statements** — 3 House statements (Katter and two others) and Albanese's
   scanned alteration set need either better OCR or a manual pass; until then they carry
   `ocr` / `warnings` and should be caveated in the UI.
4. **Granularity** — if per-gift counts are wanted, split cells on `;` and on date-led
   comma lists (`12 April 2025 …; 27 April 2025 …`) at export time; the raw cell text is
   kept in `fields_json` so no re-parse is needed.
5. **Members table** — 16 unmatched documents trace to dirty/missing `members` rows, not
   to the parser; fixing `qld_la` rows (full names, apostrophes, 2024 entrants) and adding
   Farley recovers them.
6. **Other states** — TAS and ACT are one OCR pipeline away (copier scans; ACT is
   NC-ND); VIC needs written permission (robots `Disallow: /`); NSW / NT / WA are behind
   WAFs — ask the Clerks; SA is not online.
7. **47th Parliament** archive for history (same PDF host; parliament number is read from
   the cover).
8. Drop `mp_interests` once nothing could still read it (nothing does today).
