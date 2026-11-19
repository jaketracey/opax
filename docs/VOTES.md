# Voting records (divisions) — audit, source survey, pipeline, ingestion plan

**10 October 2026 update:** the supplied snapshot already contains all 10,575
cached TVFY IDs through 20 August. The historical 6,924 gap below is no longer
the remaining gap. The XML feed, current reconciliation and staging-only schema
proof are documented in [DATA-OA-FEED.md](DATA-OA-FEED.md).

Status 2026-09-02 (second pass): audit complete, source survey complete, and the pipeline
runs end to end — `parli/ingest/votes_state.py` fetches real divisions from NSW, VIC, QLD
and the federal table, normalises every voter's name, and loads them into two new additive
tables on `desktop`, **`ext_divisions` (143 rows) / `ext_votes` (7,608 rows)**, with zero
ayes/noes count mismatches. **Nothing has been pushed to the KB.** Every step that costs
money or publishes anything is marked **GATE (user decision)**.

Recommendation in one paragraph: refresh the federal table from TheyVoteForYou first — the
audit shows the DB holds **3,651 of the API's 10,575 divisions (65% missing)** and is five
months stale; the fix is free (~2 h at 1 req/s). Take **NSW** as the first state: its
Hansard API is **CC BY 3.0 AU**, structured XML with per-member ids, pairs and counts back
to 2016, and this pass parsed 82 divisions across 2025 and 2026 sittings with every count
exact. Then **VIC** and **QLD** from their Hansard PDFs (regular machine-set text; parsers
count-exact on every sampled day), noting VIC's all-rights-reserved terms. Treat **SA, WA
and NT as blocked** — all three sit behind bot challenges for non-browser clients — and
ACT/TAS as small, later work. Ingest divisions into the KB as one short third-person
resource each (`kind=division`, every voter a collaborator): ≈14K resources ≈ **15 MB**,
about 2.7% of the speech corpus by count and well under 1% by bytes. Keep the relational
truth in `ext_votes` and extend the existing static `votes.json` export from it.

---

## Phase 1 — audit of what we have (parli.db on `desktop`)

| Table | Rows | What it actually holds |
|---|---:|---|
| `divisions` | 3,995 | 3,651 federal rows (`state='federal'`; `house` = `representatives` 1,473 / `senate` 2,178), 2006-02-07 → 2026-03-26, TVFY ids 10 → 10113; **plus 344 `qld_la` rows** (`state='qld'`), 2024-02-14 → 2026-03-04, synthetic hash ids |
| `votes` | 304,059 | aye 151,333 / no 152,726 — **only `aye`/`no`** ever recorded (TVFY lists members present; absence is implicit). 620 distinct `person_id`, all present in `members`. Covers 3,650 of the 3,651 federal divisions (one 2009 Senate division has none) and **none** of the 344 QLD rows |
| `bills` | 5,313 | 1988-12 → 2022-03 only; not linked to divisions |
| `members` | 2,415 | federal 1,707 + state members already present: nsw 212, vic 261, qld 121, sa 114 (ids like `nsw_david_shoebridge`, `qld_frecklington`). **Party is empty for every NSW, VIC and SA member** and set for 64/121 QLD members — the state party-line calculation cannot come from this table |
| `division_votes_fetched` | 3,651 | bookkeeping for the vote detail fetch |
| **`ext_divisions`** (new) | 143 | unified schema, all four jurisdictions — Phase 3 |
| **`ext_votes`** (new) | 7,608 | one row per member per division, normalised names — Phase 3 |

**Provenance.** The federal rows are TheyVoteForYou (OpenAustralia Foundation) API v1:
`parli/ingest/divisions.py` walks `divisions.json` month by month per house (1 req/s),
`parli/ingest/fetch_division_votes.py` fetches `divisions/{id}.json` for per-member votes,
`parli/ingest/load_votes.py` also mines cached `tvfy_policy_*` blobs in `analysis_cache`.
`person_id` is TVFY's `member.person.id` (stable across seat changes). Hygiene:
`fetch_division_votes.py:24` hard-codes a TVFY API key in the repo and the key is **not**
in `.env` (`divisions.py` expects `TVFY_API_KEY` there) — rotate it and put it in `.env`.

The 344 QLD rows come from `qld_parliament.py::extract_divisions()` — a regex over
Record-of-Proceedings PDF text that captures counts only. Roughly half are junk (the regex
also matches the PDF's table of contents: names like `"Resolved in the affirmative. ..... 479"`,
`"4 Mar 2026"`). The `summary` column of the real ones holds the party-grouped voter list
(`AYES, 51: LNP, 51—Baillie, Barounis, …`) — proof the PDFs carry per-member names, which
the new QLD parser now extracts properly. Recommendation: delete these 344 rows once the
ext_ path covers QLD (it mutates a legacy table, so it is the user's call; nothing here
touches them).

### TVFY reconciliation (month-by-month against the live API, completed 2026-09-02)

Windowed list calls (half-month, split on the 100-row cap) over 2006-01 → 2026-08, both houses:

| | Count |
|---|---:|
| Divisions in the TVFY API | **10,575** (newest id 10744, Senate, **2026-08-20**) |
| Divisions in parli.db | 3,651 (newest id 10113, 2026-03-26) |
| **Missing from the DB** | **6,924 (65%)** |
| In the DB but not the API | 0 |

Missing per year (House + Senate): 2006 277 · 2007 226 · 2008 254 · 2009 274 · 2010 201 ·
2011 386 · 2012 387 · 2013 227 · 2014 282 · 2015 302 · 2016 328 · 2017 330 · 2018 270 ·
2019 273 · 2020 299 · 2021 373 · 2022 186 · 2023 426 · 2024 661 · 2025 244 · 2026 718.
The Senate is worse than the House every year (e.g. 2006: 244 of 300 Senate divisions
missing vs 33 of 213 House). The gap is not concentrated in any era — it is systemic.

Root causes, all in `divisions.py`: `has_divisions_in_range()` skips a whole month as
soon as *one* division exists in it, so any interrupted run leaves months permanently
half-fetched; nothing handles the list endpoint's silent 100-row cap (busy Senate months
exceed it); and the run simply stopped in March 2026.

Schema gaps: `possible_turnout` is null for every Senate row and all but 2006 House rows;
`number` is null for the Senate; `summary` is populated on 535 rows (a mix of motion text
and HTML). The detail endpoint returns `bills[]` (ParlInfo `official_id` like `r7456` +
URL) which we never stored — the natural bill link.

Related corpus gaps noticed on the way: NSW speeches end **2024-11-22** and SA speeches
end **2024-11-12** in parli.db (corpus.json advertises both to 2026); the SA stop
coincides with the Azure WAF now in front of hansardsearch (Phase 2).

**Refresh path (free; ≈ 2 h at 1 req/s).** Page by half-month with split-on-100 (the audit
script's `fetch_window()` already does this), never skip windows, `INSERT OR IGNORE` by id,
fetch detail only for ids not in `division_votes_fetched` (6,924 + ~50/month new), store
`bills[]`. Then `votes_state.py federal --since 2006-01-01 --days 100000 --load` on
`desktop` maps the whole table into `ext_divisions`/`ext_votes` in one pass. Writing to
the legacy `divisions`/`votes` tables is optional; the ext_ tables become the source of
truth for the export and the KB.

**Licence.** TVFY publishes its data under the **Open Data Commons Open Database License
(ODbL)** — attribution + share-alike ("You are free to reuse/republish the parliamentary
data … with a reference and link to this website"; `app/views/help/licencing.html.haml`
in github.com/openaustralia/theyvoteforyou). The underlying Hansard is Commonwealth
copyright under **CC BY-NC-ND 3.0 AU**, the same terms the speech corpus already lives under.

---

## Phase 2 — where state division results live

Probed live on 2026-09-02 with `User-Agent: OPAX research (opax.com.au)` unless marked
otherwise. "Names" = are individual members' votes recorded in a machine-readable way.

| Jur. | Source of record | Format | Names? | Member ids? | Licence | Cadence | Verdict |
|---|---|---|---|---|---|---|---|
| **Federal** | TheyVoteForYou API (from OpenAustralia's Hansard XML); official: House Votes & Proceedings, Senate Journals (aph.gov.au) | JSON | Yes — first/last name, party, electorate | TVFY member + person ids | ODbL (TVFY); Hansard CC BY-NC-ND 3.0 AU | ~1 day after sitting | **Machine-readable. Use.** |
| **NSW** | Hansard API `api.parliament.nsw.gov.au/api/hansard/search` (no auth; documented at parliament-api-docs.readthedocs.io/en/latest/new-south-wales/): daily TOC XML has a `<division>` per vote with `<ayes><count>`, one `<aye>`/`<noe>` per member, `<pairs><group>`, `<questionresolved>`; the topic fragment adds the motion text and a surname+initial table. Also V&P (LA) / Minutes (LC) PDFs | XML | **Yes.** 2016→ as member `<id>`s (resolved via the TOC's `<talker>` id+name — 136 ids recovered from the 2025+2026 TOCs); 1991–2015 as `Mr Barr`-style names with `<teller>` flag | Yes (Parliament's ids, 2016→) | **CC BY 3.0 AU** — the Parliament of NSW lists the API on data.gov.au (`nsw-hansard-api`, "September 1991 to present") under Creative Commons Attribution 3.0 Australia. The www site's copyright page is behind Cloudflare, but the data portal licence is the one that governs the API | Same day (`Uncorrected` flag), corrected later. 2026 has 57 chamber-days listed through 2026-08-06 | **Machine-readable, structured, permissively licensed. Best state source.** 2025 volume: LA 133 divisions / 53 days, LC 280 / 50 days, 20,134 member-votes |
| **VIC** | Daily Hansard PDF per chamber (Proof ~4 h, Final ~5 days); sitting days listed by the undocumented JSON `/api/search/debate` (52 sitting days per house in 2025); same text as HTML `hansard-details` pages. Divisions are summarised in Hansard: `Assembly divided on motion:` / `Ayes (50): Full Name, …` / `Noes (29): …` / `Motion agreed to.` | PDF (text layer) | **Yes — full names** (best name quality of any source) | No | **All rights reserved**: reuse beyond personal/research needs permission of the Presiding Officers (info@parliament.vic.gov.au) | Proof same day | **PDF-scraping, but regular text. Parser count-exact on 10/10 sampled chamber-days.** |
| **QLD** | Record of Proceedings PDF `documents.parliament.qld.gov.au/events/han/YYYY/YYYY_MM_DD_{A,WEEKLY}.PDF`. The Open Data API (members, tabled papers, sitting calendar; CC BY 4.0) has **no** divisions or Hansard text | PDF (text layer) | **Yes — surnames grouped by party**: `AYES, 51:` `LNP, 51—Baillie, …` `Ind, 1—Sullivan.` `Pair: Perrett, Furner.` Initials only for clashes (`B. James`, `T. James`) | No (API member ids exist; join by surname+electorate) | Website text CC BY-NC-ND 3.0 AU but "Queensland Parliament materials" (Hansard) are excluded from it — permission basis | Proof same day; weekly PDF later | **PDF-scraping, regular. Parser done.** Party comes for free. |
| **SA** | `hansardsearch.parliament.sa.gov.au` XML TOC + extracts (what `sa_hansard.py` uses); V&P PDFs | XML — **behind an Azure WAF JavaScript challenge** (HTTP 403 "Challenge" on the site root and the `/api/search/toc` endpoint, re-confirmed this pass) | Yes in the text (`The house divided on the motion:` then Ayes/Noes/Majority and AYES/NOES/PAIRS lists — surname + initials) — the corpus rows stop at the "divided" line, the lists were never captured | No | Not verified (site unreachable) | Proof same day | **Blocked.** No official bulk alternative found: `parliament.sa.gov.au` serves its front page but no Hansard/V&P index at any guessed path, and the only "Hansard API" dataset on data.sa.gov.au is the **NSW** API's federated listing. Options: Playwright with a persistent profile, or ask the SA Parliament for API access (also unblocks the SA speech feed, stalled since 2024-11-12). |
| WA | Hansard daily PDFs + Lotus-Notes HTML search; V&P PDFs | PDF/HTML | Yes (`Ayes (30)` … honorific + surname, tellers, pairs) | No | No commercial reuse without written permission; Parliament "prefers publications not be republished on a website but linked" | Proof next day | **Blocked for us**: `parliament.wa.gov.au` returns 403 with a bot challenge to our client. Even if fetched, **link, don't republish** |
| TAS | `parliament.tas.gov.au/hansard` (HTTP 200 to our client); search.parliament.tas.gov.au — Hansard HTML (1979→), V&P searchable 1992→ | HTML | Yes (V&P record division lists) | No | Not verified | Days | HTML scraping is possible; small (35-member House); low priority |
| ACT | hansard.act.gov.au Debates in HTML + PDF per sitting day; Minutes of Proceedings | HTML | Yes (`Ayes 13 / Noes 12` with member lists) | No | **CC BY-NC-ND 4.0** (reuse-policy page, attribution to the ACT Legislative Assembly) | Proof next day | `hansard.act.gov.au` returned 403 to our client on both index paths tried; unicameral, 25 members; low priority |
| NT | Parliamentary Record + Minutes of Proceedings via parliament.nt.gov.au / Territory Stories | mostly PDF | Yes (Minutes) | No | Not verified | — | `parliament.nt.gov.au` is behind Cloudflare ("Just a moment" 403); 25 members, few divisions; lowest priority |

Honest summary: **only federal (JSON) and NSW (XML) are machine-readable**, and NSW is
the only state source under a permissive licence. VIC and QLD are PDF-scraping of regular,
machine-generated text (the parsers hit the printed counts exactly on every sampled day).
SA, WA and NT block non-browser clients outright; ACT blocked our client too. TAS is
reachable but small.

Licence flag for the user: federal, NSW, QLD and ACT are CC BY / CC BY-NC-ND flavours —
the same family as the speech corpus — but **VIC and WA Hansard are all-rights-reserved**.
The *facts* of a division (who voted how) aren't copyrightable; a division record written
in our own words from those facts (which is what the KB document below is) is a different
object from republishing Hansard text, but this is a position to take deliberately, not by
accident.

---

## Phase 3 — unified schema, prototype, and the ext_ tables

`parli/ingest/votes_state.py`. Fetching/parsing is stdlib only (runs under the system
python3 on `desktop`); PDF text via `pdftotext`, falling back to pdfminer.six — neither is
installed on `desktop`, so VIC/QLD run on the laptop. Loading imports
`parli/ingest/ext_common.py` (the shared ext_ writer; `requests` is on both machines).

```
division  id            federal-{house}-{tvfy_id} | nsw-{la|lc}-{date}-{n} | vic-{la|lc}-{date}-{n} | qld-la-{date}-{n}
          jurisdiction  federal | nsw | vic | qld | sa | wa | tas | act | nt
          house         corpus chamber codes: representatives, senate, nsw_la, nsw_lc, vic_la, vic_lc, qld_la, sa_ha, sa_lc
          date          ISO
          number        ordinal within the sitting day
          name          topic / bill / motion label
          question      the motion as put, when recoverable
          bill_ref      "… Bill 2026" when recoverable
          ayes_count, noes_count, result (affirmative|negative)
          source, source_url, extra{}   (source-specific: NSW topic uid + viewer URL + name table + tellers, VIC divided_on, QLD party groups + pairs …)
vote      division_id
          person_name   normalize_speaker(person_raw) — identical to the KB's origin.collaborators value for that person
          person_key    relaxed join key (casefold, straight apostrophes, no diacritics) — a join aid, NOT an identity
          person_raw    as printed ("The Hon. MARK BANASIAK", "Baillie", "Juliana Addison", "Anthony Albanese")
          person_id     source-scoped: tvfy_10007, nsw_2256, else null
          vote          aye | no | paired      (pairs are recorded, never counted)
          party         where the source gives it (federal from members, QLD from the party groups)
```

### `ext_divisions` / `ext_votes` (created 2026-09-02 on `desktop`, additive, ext_ conventions)

DDL lives in `votes_state.py::EXT_DDL`. `ext_divisions` has the division columns above
plus `extra` (JSON) and `ingested_at`; `ext_votes` has the vote columns plus
`jurisdiction`, `house`, `date`, `source` denormalised so a chamber-day replace needs no
join. Indexes: `(source, house, date)` on both, `(division_id)` and `(person_key, date)`
on votes, `(bill_ref)` on divisions.

Load semantics (`load_ext()`): **per source, per chamber-day replace** — DELETE every
`(house, date)` the run covered for that source, INSERT the fresh rows, log to
`ext_ingest_log`. Re-running a day picks up a corrected Hansard (VIC Proof → Final, NSW
Uncorrected → corrected) without disturbing the rest of the table; the federal fetcher
selects whole chamber-days so a run never carries half a day; overlapping sample files
dedupe by division id at read time (later file wins). Verified idempotent on a scratch
SQLite file (re-loading one file: deleted 23 / inserted 23, totals unchanged, 0 orphans).
The legacy `divisions` (3,995) and `votes` (304,059) tables are never touched.

Federal table → unified mapping: `divisions.division_id` → `extra.tvfy_division_id` and
the id `federal-{house}-{id}`; `house`, `date`, `number` pass through; `name` → `name` +
`bill_ref` by regex; `summary` (HTML stripped) → `question`; `aye_votes`/`no_votes` →
counts; `possible_turnout`, `rebellions` → `extra`; `votes.person_id` → `tvfy_{id}`;
`members.full_name` → `person_raw` → `normalize_speaker` → `person_name`;
`members.party_canonical` → `party`. Missing today: TVFY `bills[]` (not stored) and the
canonical URL `number` for Senate rows.

### Results (fetched 2026-09-01/02; files in `scripts/harness_runs/`; loaded to `desktop`)

| Jur. | Sample | Divisions | Votes (paired) | Count mismatches | Names normalised | Exact match to a corpus speaker | With relaxed key | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---|
| federal | 6 newest chamber-days in parli.db (2026-03-11 → 03-26), run on `desktop` | 19 | 1,544 (0) | 0 | 100% | **78.1%** | 78.1% | misses are MPs elected May 2025 — the federal speech corpus ends 2025-02-10 |
| nsw | 8 chamber-days: 2025-11-27 → 12-23 (LA 1, LC 3) **and 2026-08-05/06 (LA 2, LC 2)**; member map from all 2025+2026 TOCs (136 ids) | 82 | 4,207 (240) | 0 | 99.7% (13 votes on one unresolved id, `nsw_133`, who never speaks) | **69–71%** | 71.6% | misses have 0–2 speeches in our NSW corpus (which ends 2024-11-22); motion text recovered 22/82, bill 63/82 |
| vic | 10 chamber-days, 2026-08-14 → 08-28 (LA 4, LC 6), Proof + Final PDFs | 40 | 1,683 (0) | 0 | 100% | **95.9%** | **98.4%** | remaining misses are two members with no speeches in our window; question 12/40, bill 9/40 (heading heuristics are the weak part) |
| qld | 1 sitting day, 2026-03-04 (weekly PDF) | 2 | 174 (4) | 0 | 100% | **92.0%** | **94.3%** | remaining misses are clash initials (`B. James`/`T. James`, `G. Kelly`/`J. Kelly` — the corpus has plain `James`) and `de Brenni` |
| **merged → ext_** | `votes_sample.json` | **143** | **7,608** | **0** | 99.8% | | | `ext_votes`: 5,751 rows carry a source person_id (federal + NSW), 1,714 carry a party (federal + QLD) |

Zero count mismatches means every parsed ayes/noes list has exactly the number of names
the record prints — the parsers are not dropping or merging voters. Cross-jurisdiction
`person_key` collisions in the sample: none.

Fixed this pass: NSW members who were in the chair came through as run-on strings
(`The DEPUTY PRESIDENTMs Abigail Boyd`) — stripped in the TOC member map and on load of
the cached map; the wording of KB documents for VIC fallbacks and QLD "That …" questions.

Reproduce (all from the repo root on the laptop unless noted; `--load` writes to `desktop`):

```
python3 -m parli.ingest.votes_state nsw --year 2026 --days 4 --out scripts/harness_runs/votes_nsw_2026.json   # ~35 s; --no-map once the TOCs are cached
python3 -m parli.ingest.votes_state nsw --year 2025 --days 4 --out scripts/harness_runs/votes_nsw.json
python3 -m parli.ingest.votes_state vic --days 8 --out scripts/harness_runs/votes_vic.json
python3 -m parli.ingest.votes_state qld --date 2026-03-04 --out scripts/harness_runs/votes_qld.json           # or --pdf <cached> --pdf-url <url>
scp parli/ingest/votes_state.py parli/ingest/speaker_names.py desktop:/tmp/arag_mig/parli/ingest/
ssh desktop 'cd /tmp/arag_mig && python3 -m parli.ingest.votes_state federal --since 2025-06-01 --days 6 --out /tmp/votes_federal.json'
scp desktop:/tmp/votes_federal.json scripts/harness_runs/votes_federal.json
python3 -m parli.ingest.votes_state merge scripts/harness_runs/votes_{federal,nsw,nsw_2026,vic,vic_2026,qld}.json --out scripts/harness_runs/votes_sample.json
python3 -m parli.ingest.votes_state load scripts/harness_runs/votes_sample.json            # -> ext_divisions / ext_votes on desktop (ssh + scp)
python3 -m parli.ingest.votes_state render scripts/harness_runs/votes_sample.json --limit 3  # the KB documents; prints, pushes nothing
```

Known rough edges (not blockers): VIC/NSW motion-text and bill-heading recovery is
heuristic (wrapped PDF headings); NSW pre-2016 name-only format is handled in code but
untested at volume; QLD initials-clash surnames need the QLD Open Data members API
(electorate → full name) to disambiguate; QLD sitting days are given by hand (`--date`)
— the Open Data sitting calendar (CC BY 4.0) can drive discovery; nothing yet for
SA/WA/TAS/ACT/NT.

### Name matching — what the numbers say

Normalisation itself is not the problem: every printed name normalises, and where the
person has speeches in the corpus the strings match exactly (VIC 96%). The misses are (a)
**corpus coverage** — members elected since our speech feeds stopped (federal Feb 2025,
NSW Nov 2024) simply have no collaborator value yet — and (b) mechanical variants:
particle casing (`de`/`De`), hyphen casing, straight vs curly apostrophes, and QLD surname
clashes. `person_key` fixes (b) at join time (VIC 95.9 → 98.4%, QLD 92.0 → 94.3%) without
touching `speaker_names.normalize_speaker`, which defines the collaborator values already
in the KB and must not change. What remains is (a), which closes itself as the speech
feeds catch up, plus the QLD clashes, which need the members API.

### Party for state divisions

The `members` table carries no party for NSW/VIC/SA members. QLD prints party inline in
the division list (captured). NSW's public API has no members endpoint (the readthedocs
documentation lists sitting dates, TOCs, fragments, by-speaker and by-bill searches only).
Options, in order: the NSW/VIC Parliaments' members pages (Cloudflare-fronted; a one-off
manual export is fine — ~200 rows each), Wikipedia's member lists, or the AEC/VEC candidate
files. Until one lands, state "party-line" statistics are not computable; the division
documents and per-person records do not need party.

---

## Phase 4 — ingestion design (plan only; no pushes made)

### KB document per division (`kind=division`) — implemented as `division_document()`

`python3 -m parli.ingest.votes_state render <json>` prints exactly what would be pushed.
Measured on the 143-division sample: **body 547–2,957 bytes, mean 1,059**; **25–140
collaborators per document, mean 53**; 148 KB for the whole sample.

```
slug         division-{unified id}            e.g. division-federal-senate-10113, division-nsw-la-2025-12-22-3
title        "{House} division, {date}: {name}"
texts.body   On 23 December 2025 the NSW Legislative Council divided on President of the Legislative Council.
             Question: That this House dissent from the ruling of the President. Ayes 4: Mark Banasiak, Mark Latham,
             John Ruddick, Robert Borsak. Noes 34: Scott Barrett, Sue Higginson, …. Paired (recorded, not counted): ….
             The question was resolved in the negative (4–34). Bill: … Bill 2025. [federal: "N members crossed the floor."]
origin       source_id = source; url = source_url; created = date; collaborators = every voter's person_name (incl. paired)
labels       kind=division · source · state (federal|nsw|vic|qld…) · chamber (house code) · decade · result
             — no party label: divisions are multi-party; party belongs on votes
extra        counts, result, bill_ref, tvfy/nsw ids, and the per-side name arrays as JSON so the doc page renders a
             proper ayes/noes table instead of re-parsing the body
```

Third-person prose, so the speaker-filter provenance-turn invariant in MIGRATION-ARAG.md
(about first-person Hansard) does not bite. Because every voter is a collaborator, the
existing Workbench speaker filter and `/ask` speaker note surface a member's votes
alongside their speeches with no new filter grammar. The corpus junk predicates (P1–P7)
already drop Hansard roll-call rows, so division resources are net-new content, not
duplicates. Question text is capped at 600 characters and the TVFY "Mover I move:" prefix
is stripped; federal bodies are the longest (mean 1.7 KB) because TVFY summaries carry the
whole motion.

### Volume and cost

| Scope | Divisions | Body | Notes |
|---|---:|---|---|
| Federal 2006→ (TVFY) | **10,575** (audited; ≈ 520/yr recently) | ~1.7 KB | ids stable, names full, party known |
| NSW 2016→ (structured) | ≈ 4,100 (413/yr measured for 2025) | ~1.0 KB | + ≈ 25 yrs × ~300/yr name-only back to 1991 if wanted |
| VIC 2016→ | ≈ 3,500–5,500 (104 chamber-days/yr; 3.5–5 divisions/chamber-day in the samples) | ~0.8 KB | count a full year before sizing |
| QLD 2016→ | ≈ 800 (~80/yr) | ~1.0 KB | older PDFs same format, unverified |
| SA 2016→ | ≈ 500 (~50/yr HA from corpus mentions) | ~1 KB | blocked today |
| **Total (decade, federal since 2006)** | **≈ 19–21K resources, ≈ 22 MB** | | ≈ 4% of the 518,685-speech corpus by count, ≈ 1.3% of its 1.67 GB by bytes; growth ≈ 1,500–2,000/yr |
| States-only phase | ≈ 9–11K resources, ≈ 10 MB | | if the federal side stays in `votes.json` only |

**GATE 1 (user decision) — platform ingest tokens.** The per-resource processing burn is
still the unmeasured §Costs item in MIGRATION-ARAG.md (the bulk load is running; the
account dashboard gives the empirical number). Divisions add ≈ 4% to the resource count
and ≈ 1.3% to the bytes of whatever the speech load costs — decide alongside that number.
**GATE 2 — enrichment.** No summary pass is needed (the body *is* the summary). If the
topic labeller (`opax-topics`, apply=ALL) is left running it will label divisions as they
arrive; at the sample rate ($70–100 per 519K speeches) 20K divisions cost ≈ $3–4 —
trivial, still a decision, and the label quality on name-lists is unverified.
**GATE 3 — the 5-document probe.** Before any bulk push, push five real divisions (one per
source, from `render --json`) to verify (a) the platform accepts 80–140 collaborators on
one resource (federal House divisions), (b) the speaker filter and `origin_collaborator`
facets behave, (c) retrieval doesn't let name-list documents crowd out speeches — then
delete them. Even this is a push and therefore the user's call.

### Static per-person votes for profile pages — extending `scripts/export_votes.py`

Today: `export_votes.py` runs on `desktop`, reads the legacy `votes`/`divisions`, and
writes `portal/public/votes.json` (290 KB) for the **200 people with portraits**, keyed by
TVFY `person_id` because `photos/people.json` maps lowercased name → portrait id
(`app.js:1398-1412`, front-page encyclopedia slider only). Its value is the `for`/`against`
bill lists, derived from TVFY division-name polarity ("pass the bill", "decline a second
reading" …). Don't duplicate it; extend it in three steps:

1. **Read from `ext_votes`/`ext_divisions` instead of the legacy tables** once the federal
   refresh has loaded them (same query shape: `SELECT division_id, vote FROM ext_votes
   WHERE person_key IN (...)`). Key people by `person_key` (the export can still emit the
   portrait id for the 200 federal faces via `people.json`; state members get
   `person_key` slugs, e.g. `penny-sharpe`). Add `jurisdiction`/`house` to each entry.
2. **State polarity** comes from the standardised questions rather than TVFY names:
   `That this bill be now read a second/third time` (NSW, QLD, VIC) → aye backs the bill;
   `That the bill be agreed to` / `That the motion be agreed to` with a bill in `bill_ref`
   likewise; amendments, suspension of standing orders and closure motions → procedural
   (skipped, as today). VIC's `extra.divided_on` (`motion` | `amendment` | …) is the cheap
   first filter.
3. **Don't ship one file at full scale.** At ≈ 1.3M vote rows the single `votes.json`
   becomes ~250 MB. Ship `portal/public/votes/divisions.json` (≈ 20K divisions × ~200 B ≈
   4 MB, ~0.8 MB gz), one compact shard per person `votes/{slug}.json` =
   `[[division_index, "a"|"n"|"p"], …]` (~500 votes × 6 B ≈ 3 KB each, ≈ 10 MB for ~3,000
   people) and `votes/index.json` (name → slug, jurisdiction, counts). Keep the current
   `votes.json` shape as the summary layer the slider already reads (add state people to
   it under their slugs). Comfortably inside Workers static-asset limits; generated by the
   same script from `ext_votes`, keyed on the same normalised names as the KB collaborators.

Profile-page copy must say what a division is: most questions are decided on the voices
and leave no per-member record, so "no recorded vote" ≠ "did not vote".

### Risks

- **Identity across jurisdictions.** `normalize_speaker` output is a display string, not
  an identity, and `person_key` is a relaxed join aid: a person who served in two
  parliaments, or two people sharing a name, merge into one collaborator. Surname-only
  sources (QLD, NSW pre-2016, SA) collide (`James`, `Kelly`). Keep `person_id` per source
  and build the cross-source identity table explicitly; treat "not found" as "no speeches
  in our window", not "never spoke".
- **Pairs, abstentions, absences.** TVFY lists only members who voted; absence is implicit
  (use `possible_turnout` only where present). NSW and QLD record pairs (VIC didn't in the
  sampled weeks). Abstentions are not recorded anywhere except as a member "sitting in
  the middle" in Hansard text. Casting votes by the Speaker on a tie appear in text only.
- **Divisions are not all votes.** Most questions are decided on the voices; a member
  with no division on a bill did not necessarily not vote. Say so on profile pages.
- **Free / conscience votes and rebellions.** TVFY supplies `rebellions` federally; for
  states a party-line calculation needs member → party at the date, which nothing we hold
  supplies today for NSW/VIC/SA (QLD prints party inline).
- **Proof vs final.** VIC `Proof` and NSW `Uncorrected` records get corrected later; a
  corrected Hansard can add or renumber a division, which moves a `{date}-{n}` id. The
  chamber-day replace handles the table; the KB side needs the same re-sync (delete the
  day's `division-*` slugs, re-push). Prefer source document ids where they exist (NSW
  topic uid in `extra`).
- **Retrieval pollution.** Name-list documents are strong matches for name queries.
  Default `/ask` and search to `kind != division` unless vote intent is detected or the
  user opts in; the Workbench gets an explicit "Votes" scope. GATE 3 measures this.
- **Licences** — see Phase 2; VIC/WA are the sensitive ones.
- **Single-point dependency on TVFY** (a small non-profit). Keep the raw JSON cache; the
  fallback is OpenAustralia's Hansard XML (same data, more work).
- **Bot protection is spreading.** SA, WA, NT and NSW's www site all challenge
  non-browser clients now; the NSW *API* host does not. Anything built on scraping a
  www site should assume it will need a real browser eventually.

### Suggested order

1. Fix and re-run the federal fetcher (free; ≈ 2 h); store `bills[]`; rotate the key and
   move it to `.env`; `federal --load` on `desktop` to fill `ext_` for all 10,575.
2. NSW backfill 2016→ from the API (free; ≈ 1 GB XML, cached); build the id → name map
   from all TOCs of each year; resolve the handful of never-speaking ids from the fragment
   name tables; source party from a one-off members export.
3. VIC: run a full year of PDFs to harden the heading/motion heuristics; QLD: drive sitting
   days from the Open Data calendar, resolve initials via the members API, regenerate the
   344 legacy rows' worth of history.
4. SA: Playwright with a persistent profile against the WAF, or ask the SA Parliament for
   API access (also unblocks the stalled SA speech feed). WA/NT: same blocker; ACT/TAS:
   small, later.
5. `export_votes.py` over `ext_votes` (steps 1–3 above) → `votes/` tree → profile pages.
6. **GATE 3** probe → **GATE 1/2** decision → bulk push → "Votes" scope in the Workbench.

---

## Phase 5 — shipped 2026-09-02 (votes agent): refresh, person pages, KB ingestion

User decision: "ship it all" (GATE 1/2 approved), with the five-document probe kept as the
first push. Everything below ran from the `arag-migration` worktree; nothing was committed by
the agent.

### Federal refresh — `parli/ingest/tvfy_refresh.py`

Stdlib-only, runs under the system python3 on `desktop` (`cd /tmp/arag_mig && nohup python3
-m parli.ingest.tvfy_refresh > logs/tvfy_refresh.log 2>&1 &`; progress: `tail -3
/tmp/arag_mig/logs/tvfy_refresh.log`; resume after any interruption with the same command,
or `--detail-only` once the list phase is complete). Two phases:

- **List**: month windows 2006-01 → today for both houses, any window returning the
  endpoint's 100-row cap is halved recursively (August 2026 alone had 93 Senate divisions);
  `INSERT OR IGNORE` into the legacy `divisions` table with `state='federal'`, NULL `number`
  / `possible_turnout` / `rebellions` back-filled from the list (the Senate rows never had a
  `number`, so their TVFY URLs were unbuildable). Months that ended more than 45 days ago are
  remembered in `~/.cache/autoresearch/tvfy/refresh_state.json`; recent months are always
  re-listed. The whole list pass took **~8 minutes / ~500 requests** and found **6,921
  divisions missing** (audit predicted 6,924; the 3 extra were March 2026 rows already there).
- **Detail**: `divisions/{id}.json` for every federal division not in `division_votes_fetched`,
  newest first (so the person-page export benefits immediately), 1 req/s → **~2 h**. Per
  division: `INSERT OR IGNORE` votes; members the `members` table has never seen are added
  (never updated; `party_canonical` via the same alias map as `arag_sync.py`); the detail's
  `bills[]` (ParlInfo `official_id` + URL) goes into the new additive **`division_bills`**
  table; NULL `summary` is filled. Transient failures are not marked fetched (re-run
  retries), a 404 is. Raw JSON is cached under `~/.cache/autoresearch/tvfy/{list,division}/`
  (the TVFY-outage fallback the risks section asked for).

Key: `TVFY_API_KEY` from the environment / `.env`; **still falls back to the key checked into
`fetch_division_votes.py:24`** because no key is in any `.env` — rotate it and add it to
`.env` (the script logs which source it used).

After the detail phase completes, map the whole federal table into `ext_`:
`ssh desktop 'cd /tmp/arag_mig && python3 -m parli.ingest.votes_state federal --since 2006-01-01 --days 100000 --out /tmp/votes_federal_all.json --load'`
(the `--load` path writes to the same parli.db; it replaces the federal chamber-days in
`ext_divisions` / `ext_votes`). Then re-run the export and the KB push (both skip what is done).

### Person pages — `scripts/export_votes.py` + `renderPersonVotes()` in `portal/public/app.js`

`votes.json` now covers **every** voter, not only the 200 portrait people: federal members
keyed by TVFY `person_id` (unchanged shape, the slider keeps working), state members keyed
`{jurisdiction}:{slug}` of the normalised name (`nsw:penny-sharpe`), plus a **`_names`**
index (lowercased name → keys; a name that voted in two parliaments lists both, e.g.
`darren cheeseman` → federal `10117` + `vic:darren-cheeseman`). Entries carry `jurisdiction`
and `house`; `for` / `against` hold up to **6** bills each with `jur` per entry; the unused
`summary` text was dropped (the slider reads only `name` + `date`). First run: **960 people
(620 federal, 133 NSW, 122 VIC, 85 QLD)**, 1.2 MB raw / **79 KB gzipped**.

Polarity additions: TVFY names before 2010 and from 2026 are Hansard-style (`X Bill 2025 —
Second Reading`, or `Bills — X Bill 2026; Second Reading`) with no "what the vote meant"
tail, so a bare second/third-reading stage now counts as the bill question **unless the
stored motion text contains omit/amendment/substitute** (a second-reading amendment). State
divisions qualify only on a recognisable standardised question (`That this bill be now read a
second/third time`, `That the bill be agreed to`, `That the motion, as amended, be agreed
to` with a bill in `bill_ref`); VIC `divided_on` amendment(s) is excluded. Only 8 of the 124
state sample divisions qualify, because NSW question recovery is sparse (22/82) — the
known rough edge from Phase 3.

`renderPersonVotes(name, personId, sections)` (one function, one call inserted before
`await subjectNews(name, sections)` in the person branch of `openSubject`): appends a
`#subject-votes` placeholder synchronously so the section order is stable, lazy-loads
`photos/people.json` + `votes.json`, resolves records via the portrait id **and** `_names`,
merges multi-jurisdiction records, and renders the "Voting record" kicker, a one-sentence
count line, two hairline columns (`.ency-votes*` classes reused from the slider; bill name,
stage, year, bronze jurisdiction chip), and the fineprint on divisions vs voices and the
They Vote For You / Hansard sources with a TVFY link for federal members. Guarded with
`currentSubjectKey`; `esc()` on every interpolation; no new CSS.

### KB ingestion — `parli/ingest/votes_ingest.py` (`kind=division`)

Sources: `--from-ext` (ext_ tables, any jurisdiction), `--from-legacy` (the federal legacy
tables as the refresh lands them, same mapping as `votes_state.run_federal` plus
`division_bills`), `--from-json`. Body from `votes_state.division_document()` →
`texts.body` PLAIN, `origin.source_id` = source, `origin.url`, `origin.created` =
division date, `origin.collaborators` = every voter, classifications kind / source / state /
chamber / decade / result, `extra.metadata` = counts + per-side name arrays. State file
`~/.cache/autoresearch/votes_ingest_state.json`; 409 = done; `--full` lifts the 100-doc cap.

**Platform finding (GATE 3a): `origin.collaborators` is capped at 100 items** — the
140-voter House division was rejected with `422 List should have at most 100 items`. The
fix, `division_documents()`: a division with more than 100 named voters is pushed as
**parts** — ayes (with pairs) in part 1, noes in part 2, a side above 100 split into
near-equal alphabetical chunks — slugs `division-{id}`, `division-{id}-p2`, …, titles
suffixed `(part k of n)`, each part's body naming only its own voters ("Noes 46: listed in
another part of this record"), `extra.metadata.part / parts / part_slugs`. Every voter is a
collaborator on exactly one resource per division and no name is indexed twice. The 143-division
sample becomes 149 resources; federal House divisions (120–150 voters) will roughly double
their resource count.

**Probe (GATE 3) results, 2026-09-02 10:25–10:28 AEST.** First push 4/5: NSW LA (90
voters), QLD (87), VIC LA (79), Senate (62) accepted in 0.5–0.7 s each; the 140-voter House
division rejected with the 422 above. Second push after the split fix 6/6 (a 95-voter part
and its 8-voter `-p2`; the four repeats came back 409 in 0.16 s and count as done). **GET
/slug** on every probe resource returns the title, the full collaborator list (90/90 on the
NSW one) and the classifications, i.e. storage is verified. **The collaborator-filtered
/find could not be verified in-session**: every division sat at `metadata.status = PENDING`
because the speech bulk load (`arag_sync`, 425,697 speeches pushed) was still running and the
KB had **69,354 resources queued for processing**; divisions join that queue. No 429 /
backpressure was seen on any division push. The retrieval-pollution measurement (3c) is
therefore still open; the post-refresh chain job below records a first reading in
`logs/votes_verify.log`, and `python3 -m parli.ingest.votes_ingest --from-ext --jurisdiction
nsw --verify-only --no-poll` re-runs it any time (each report line carries
`find_filtered`, `unfiltered_top10_divisions`).

Queue observation: PENDING grew from 69,354 (10:29) to 77,279 (10:38), **+1,500 per
minute net** while the speech load keeps pushing at ~10/s, i.e. the platform processes
slower than the bulk load submits; divisions will become searchable only after the speech
load finishes and the queue drains (hours, not minutes). Check with
`python3 -m parli.ingest.votes_ingest --from-ext --jurisdiction nsw --verify-only --no-poll`.

Decision taken: with storage verified, the platform cap handled, and the Worker defaulting
`kind` to `speech` (divisions never enter default retrieval), the bulk push went ahead
without waiting for the queue.

**Pushed so far.** 149 resources from the 143-division ext_ sample (0 failures, 6 workers,
10.5 resources/s, latency p50 0.51 s / p95 0.73 s / max 1.4 s). Federal legacy push
(`--from-legacy --full`, everything with votes at 10:30: 3,651 old + the newest refreshed
divisions): **5,233 resources, 0 failures, 711 s (7.4/s with 6 workers), latency p50 0.50 s
/ p95 0.66 s / max 65.8 s, 24 pushes over 10 s** — those long tails are the client absorbing
`429 try_after` backpressure inside `parli.arag._request`; no push failed on it. The House
divisions split into parts roughly double the resource count. **KB total after these runs:
5,382 division resources, 0 failed** (`~/.cache/autoresearch/votes_ingest_state.json`).

Probe verification lines (both probe runs, `logs/votes_probe*.log`): every stored resource
`get_slug: ok` with `collaborators_stored` equal to the voter count (90, 87, 79, 62, 95, 8);
`find_filtered: missing` on all (PENDING); `unfiltered_top10_divisions: 0` on all (trivially,
since nothing is indexed yet). The 140-voter slug reports `get_slug: 404` because that
resource was never created (the 422).

**Chained follow-up on `desktop`** (`/tmp/arag_mig/votes_after_refresh.sh`, log
`logs/votes_after_refresh.log`): waits for the refresh process to exit, re-runs
`tvfy_refresh --detail-only` (retries any transient failures), loads the whole federal
table into `ext_divisions` / `ext_votes` (`votes_ingest --from-legacy --load-ext-only`, a
chamber-day replace like `votes_state --load`), pushes the remaining divisions
(`--from-legacy --full`; the state file skips what is already in), writes a fresh
`/tmp/votes.json` on `desktop` (copy it over `portal/public/votes.json`: `scp
desktop:/tmp/votes.json portal/public/votes.json`), then runs the NSW verification pass.
Expected finish ≈ 2.5 h after 10:17 AEST.

### Worker / UI wiring still to do (lead)

- `portal/src/index.ts`: `/api/search` and `/api/ask` default `kind` to `speech`; divisions
  are reachable with `kind=all` (and `kind=division`) today. Add a **"Divisions"** option to
  the `#search-kind` Corpus select (`portal/public/index.html`) and let the doc page render
  `extra.metadata.ayes` / `noes` as a table for `division-*` slugs (`SLUG_RE` in the Worker
  currently accepts only `speech|legal|news`).
- Person page speaker searches (`speaker: name`) stay on `kind=speech`; a "Votes" tab or a
  `kind=division` speaker search is the natural next step now that divisions carry the same
  collaborator strings.
- Retrieval pollution check (GATE 3c) numbers are in the probe results below; if divisions
  crowd out speeches under `kind=all`, keep the default at `speech` (as now).

## Victorian divisions of the 60th Parliament, from the daily Hansard (16 and 17 November 2026)

`parli/ingest/vic_divisions.py` reads every sitting day of the 60th Parliament (20 December 2022 to
24 September 2026, both houses) with the same source, ids and unified rows as the sampled
`votes_state.py vic` path. Reuse is by permission of the Parliament of Victoria
([SOURCES-ACCESS.md](SOURCES-ACCESS.md), 13 October 2026): fairly and accurately, without misleading
readers, free of charge.

**The record is not complete.** No Legislative Council division before 6 February 2024 is published: all
109 Council divisions of 2023 are held. 116 divisions in all are held (below). Nothing on the site or in
these documents may describe the 2022 to 2026 record as complete while any is held.

Before the first content request the run read `robots.txt` (it names two Facebook crawlers only and
disallows nothing) and the site's copyright and disclaimer pages (copyright, reuse beyond personal and
research use by permission of the Presiding Officers; neither restricts automated reading). That run
identified itself as `opax-improve-audit`, as the hub directed; the committed importer sends the shared OPAX
agent through the shared transport's request, like every other source.

| Step | Count |
| --- | ---: |
| Requests made, all to www.parliament.vic.gov.au, one at a time, two seconds or more apart, none refused | 405 (and 1 member page for the follow-up) |
| Sitting days fetched (Assembly 188, Council 189), each a Final daily Hansard PDF | 377 |
| Divisions found | 1,113 |
| Reconciled | 997 |
| Held on the mismatch list, not published | 116 |
| Published Victorian division records | 999 (925 new, 74 from the earlier import) |

### What a division must pass to be published

1. The names parsed for each side equal the tally Hansard prints, and Hansard prints a result line.
2. The result line agrees with the tally.
3. Every name is exactly one person of that house in the committed roster.
4. Every member voted inside their service dates. The dates are the House's own: the member list at the front
   of each house's last sitting day names every member of the Parliament and footnotes those who were sworn
   in or appointed during it and those who resigned or died (`member_service`; 11 Assembly and 4 Council
   members carry a date). A vote before a member's start or after their end, or a name the list does not hold
   once, holds the division. No vote in the 1,113 divisions failed this.
5. The printed text is what was voted on (`text_faults`): the motion text sits under a real motion lead, is not
   speech, and is under 2,000 characters unless a person has reviewed it; the title is a heading, not a
   procedural report line.
6. Its number on the chamber-day does not dispute a record already published under that id.

In all 1,113 divisions the names parsed equal the tallies Hansard states. Nothing is held for a count fault.

### The mismatch list (`data/staged/vic-divisions/mismatches.json`)

- **unresolved-name, 109.** Council divisions from 7 February 2023 to 30 November 2023 that list Matthew Bach,
  who is in no committed roster file. The follow-up adds him through the accept list
  ([DATA-MEMBERS.md](DATA-MEMBERS.md)) and releases them.
- **result-contradicts-tally, 3.** Hansard's own result line disagrees with its tally: `vic-la-2023-02-23-4`
  (Ayes 52, Noes 28, "Question defeated.") and `vic-la-2023-11-30-5` and `-7` ("divided on omission (members
  in favour vote no)").
- **numbering-differs-from-published, 3.** The earlier import missed one Council division on 27 August 2026
  (Ayes 15, Noes 21, page 104), so the published `vic-lc-2026-08-27-12` and `-13` are that day's 13th and
  14th. The missed division is published nowhere; the other two are published under the number before their
  own (`published_as`). The fix is a renumbering in its own change.
- **text unconfirmed, 1.** `vic-lc-2025-05-15-1` (below).

### The false motion text of 15 May 2025, its cause, and the sweep

`vic-lc-2025-05-15-1` (Council, Fire Services Property Amendment (Emergency Services and Volunteers Fund) Bill
2025, second reading, Ayes 22, Noes 18) was published with a member's incorporated speech of 4,961 characters
as its `question`.

**Cause.** Hansard sets a motion as put in smaller indented type under a line that ends in a colon ("I
move:"). It sets an incorporated speech the same way: small indented type under "David ETTERSHANK (Western
Metropolitan) incorporated the following:". `question_before` took any block of small type that ended directly
before the division line as the question, provided the line above it ended in a colon. On 15 May 2025 the last
thing before "Council divided on motion:" was that incorporated speech, so the speech was taken. The motion
itself ("Debate resumed on motion of Harriet Shing: That the bill be now read a second time.") is printed 42
pages earlier, at the start of the debate, with the whole debate between it and the division.

**Fix.** A block is a question only under a real motion lead (`MOTION_LEAD_RE`): a member moving ("I move:",
"I move, by leave:"), the Chair putting the question ("The question is:", "The house will divide on the
question:"), or Hansard's own "Debate resumed on motion of ...:" and "And ...'s amendment:". Small type under
any other lead directly before a division holds the division (`question-lead-not-a-motion`); so does text that
reads as speech ("incorporated", a timestamp, a speaker's turn, the first person) and text over 2,000
characters that no person has reviewed. For this record the text Hansard ties to the division cannot be
established from the page, so it is held and its published file removed.

**Sweep.** `python3 -m parli.ingest.vic_divisions sweep` runs every class over every committed Victorian
record (`portal/public/divisions/division-vic-*.json`), reading each lead from the staged import, and
`tests/test_vic_divisions.py` pins it: a record may match a class only through a reviewed entry in
`REVIEWED_TEXT`. Counts at the reviewed head (`7ca4a90c7`, 1,000 records) and now (999):

| Class | Before | Now | Records and what happened |
| --- | ---: | ---: | --- |
| Motion text under a lead that is not a motion lead | 1 | 0 | `vic-lc-2025-05-15-1`: held, file removed |
| Speech markers in the motion text | 1 | 0 | the same record |
| Motion text over 2,000 characters | 1 | 0 | the same record. `vic-lc-2026-09-22-1` is a genuine motion of 13,624 characters (264 lines under "I move:", pages 92 to 98, dividing a bill in two): reviewed, allow-listed, and now published in full (the earlier import published a 199-character sentence that the Final Hansard does not print) |
| Published motion text the staged reading does not give for that id | 14 | 0 | all from the earlier import; 13 corrected from the staged reading (list below); `vic-lc-2026-08-27-13` checked by hand against page 109 and allow-listed (it is the right text, under a number held for renumbering) |
| One text on an amendment and on the motion it amends | 1 pair | 0 | `vic-la-2026-09-10-3` and `-4`: the lost amendment's text was on the vote for the motion; `-4` now carries the motion |
| A long text shared by different titles, other than a standing form | 0 | 0 | |
| A long standing form shared by different titles (not a fault) | 2 pairs | 2 pairs | the Assembly's second-reading question with government amendments: `vic-la-2025-02-20-3` with `vic-la-2026-06-18-3`, and `vic-la-2026-02-05-4` with `vic-la-2026-08-27-4`; each checked on its page |
| Title taken from a procedural report line | 0 | 0 | five were fixed before that head |
| Member name carrying page furniture | 3 | 0 | `vic-lc-2026-09-10-2`, `-9` ("Sheena Watt 4198 Legislative Council") and `vic-la-2026-09-10-6` ("Meng 3948 Legislative Assembly Heang Tak"): corrected |

The sweep also showed that 17 new records had only their division line as the question although the Chair
states the question directly before the division ("the question is:" not at the start of a sentence, or "The
house will divide on the question:"). They now carry that text; nothing else in them changed.

### Records from the earlier import, corrected from the staged reading

`scripts/export_division_pages.py --correct-from-staged` replaces the name, question and Hansard link (and a
member name with page furniture in it) of a published record with the staged reading of the same division,
and only when the date, house, tallies, result and every vote are the same. Each change is carried on the
record as `_meta.corrections` with its Hansard page. Of the 74 earlier records, 67 are corrected and 7 are
untouched (5 already read the same; 2 are the renumbering pair).

Seventeen had wrong or unconfirmable text, or furniture in a member name:

| Record | Was | Now |
| --- | --- | --- |
| `vic-la-2026-09-10-4` | the lost amendment's text ("That the following words be inserted ...") as title and question | title "Health infrastructure"; question "That this house condemns the Leader of the Opposition for her plan ..." (the motion of Melissa Horne) |
| `vic-lc-2026-09-08-4`, `vic-lc-2026-09-10-12` | "That the report be now adopted." | "That the bill be now read a third time and do pass." (moved directly before the division) |
| `vic-lc-2026-09-22-1` | a 199-character sentence not in the Final Hansard | the motion as moved, in full |
| `vic-la-2026-08-26-1` | "That the amendments be agreed to." run on into the minister's speech | the division line |
| `vic-la-2026-09-10-5` | the division line | the motion printed directly before it |
| `vic-lc-2026-08-14-11`, `vic-lc-2026-08-27-8`, `vic-lc-2026-09-24-1` | a nearby "That ..." paragraph Hansard does not tie to the division (one cut off at "That this house:") | the division line |
| `vic-lc-2026-08-14-2`, `-3`, `-4`, `vic-lc-2026-08-27-6`, `-7` | the bill title as the question | the division line |
| `vic-lc-2026-09-10-2`, `-9`, `vic-la-2026-09-10-6` | a member name with a page number and the house name in it | the member's name |

The other 50 change in title only: the earlier import titled them with their division line or their motion
text, and they now carry the heading the division sits under, as every new record does. Every corrected link
now opens on the division's page.

### Hand check of 20 records

Seed `20261117`, `random.sample` over the 999 sorted keys, before the title corrections above: 14 Assembly and
6 Council; 2023 (3), 2024 (3), 2025 (6), 2026 (8). Each was read against its cached Hansard page: the heading
above the division, the lines directly before the division line, and the result line.

`vic-la-2023-03-07-1`, `vic-la-2023-05-18-1`, `vic-la-2023-10-17-1`, `vic-la-2024-08-27-1`,
`vic-la-2025-03-19-2`, `vic-la-2025-04-02-5`, `vic-la-2025-04-02-6`, `vic-la-2025-06-19-2`,
`vic-la-2025-11-20-1`, `vic-la-2026-02-03-1`, `vic-la-2026-02-05-4`, `vic-la-2026-07-30-1`,
`vic-la-2026-08-11-1`, `vic-la-2026-08-27-2`, `vic-lc-2024-06-20-7`, `vic-lc-2024-08-15-1`,
`vic-lc-2025-10-28-1`, `vic-lc-2026-05-12-2`, `vic-lc-2026-07-28-1`, `vic-lc-2026-09-23-2`.

- Tallies and result: 20 of 20.
- Motion text: 19 of 20 exact. `vic-la-2023-05-18-1` carried its division line although Hansard prints "The
  house will divide on the question: That the words proposed to be omitted stand part of the question."
  directly before it. Nothing false was shown, but the printed question was missed; the lead rule now takes
  it, with 16 like it.
- Title: 18 of 20 exact. `vic-la-2026-08-27-2` and `vic-lc-2026-09-23-2`, both from the earlier import, were
  titled by their division line where the page has a heading ("Associations Incorporation Reform Amendment
  Bill 2026", "Sex work regulation"). They are among the 50 title corrections.

After the changes all 20 match on both.

### What each record keeps, and how it is read

- `source_url`: the day's Hansard PDF at the division's page; `date`: the sitting day.
- `name`: the heading the division sits under (a bill title, "Program", "Sessional orders").
- `question`: the motion or amendment only where Hansard prints it directly before the division line under a
  motion lead (241 of the 999), and otherwise the division line itself ("Council divided on amendment", 758).
  No text is summarised or reworded.
- **The 758 with only a division line.** The amendment or motion is usually moved pages earlier (an amendment
  in committee is moved, debated, then put), and several may be before the committee at once, so the page does
  not tie one text to the division. No text is attached. Beside the record, apart from the question, the page
  says the kind of question and that the record names nothing more: "Amendment: the record names no further
  detail." (or "Motion:", "Clause:", "New clause:", as the division line has it). The link opens the Hansard page.
- **"Words proposed to be omitted stand part".** The page says, in OPAX's words: "On this question a Yes vote
  (aye) keeps the words as they are, which is a vote against the amendment. A No vote takes the words out,
  which is a vote for the amendment."
- **What Hansard's lists leave out.** "Hansard's division lists do not record pairs, tellers or absences. A
  member who is not listed was not necessarily absent and did not necessarily abstain." The record's page and
  the member voting section say so.
- These three lines are OPAX's own words. They are shown in their own lines beside the record and are never
  written into `question` or `name`, which stay as Hansard prints them.
- **Presiding officers.** The Speaker is listed among the ayes on `vic-la-2024-02-22-3` and `vic-la-2025-02-20-2`.
  Both pages were read: "Maree Edwards" is printed inside the alphabetical Ayes list, between Paul Edbrooke
  and Eden Foster. Hansard records the vote; it is not page furniture.
- Member names as printed, published by name slug as the earlier records are. The roster's person ids are in
  the staged file (`roster_person_id`), not on the published record.

### Held divisions are said wherever a count is read

`parse` writes `portal/public/data/vote-coverage.json`: one note for each house and reason, with the count,
the dates, the division ids and the members those divisions name. A division published under another number
is not counted. The same sentence (`voteCoverageText` in `portal/public/vote-tables.js`) shows:

- on the coverage page, in the "Recorded division catalogue" row;
- on the voting section of each member a held division names, in the browser and on the server page, and only
  when the note's dates fall inside the years that member's published counts span. Before the box load the
  counts start in 2026, so a member sees the note for 27 August 2026 and not the notes for 2023 and 2025;
  after it they see every note that names them;
- in the `member_divisions` and `count_records` tools that Ask and the MCP server use, for the chamber, period
  and member asked about, including when the period lies outside the index.

An empty list removes every note.

### Reproduce

```
python3 -m parli.ingest.vic_divisions fetch --cache ~/opax-work/vic-hansard-cache --from 2022-12-20
python3 -m parli.ingest.vic_divisions parse --cache ~/opax-work/vic-hansard-cache --out data/staged/vic-divisions
python3 scripts/export_division_pages.py --add-staged data/staged/vic-divisions
python3 -m parli.ingest.vic_divisions sweep
```

The cache lives outside the repository; `parse` and `sweep` make no requests. `--add-staged` writes only
records that are not published yet and rebuilds the index. Parties come from the same dated-roster rule as
every other division.

### The box load (not done here: it writes to the database)

The nightly does not load these divisions unaided. Until someone runs the load on the refresh box, the nightly
division export keeps the new records flagged `refresh_retained: missing-division` and the corrected earlier
records flagged `source-facts-changed` (all stay published as committed), and `votes.json` (member vote counts)
and `seo/recent-votes.json` cover Victoria from 14 August 2026 only.

Run from the repository checkout on the box, on main after this change is merged. `DB=~/.cache/autoresearch/parli.db`,
`PY=.venv/bin/python`.

**1. Look first.**

```sh
sqlite3 "$DB" "SELECT count(*), min(date), max(date) FROM ext_divisions WHERE source='vic_hansard_pdf'; SELECT count(*) FROM ext_votes WHERE source='vic_hansard_pdf';"
```

Expected: 74 divisions, 2026-08-14 to 2026-09-24. Keep a copy to roll back from:

```sh
sqlite3 "$DB" ".mode insert ext_divisions" ".output /tmp/vic_divisions_before.sql" "SELECT * FROM ext_divisions WHERE source='vic_hansard_pdf';" ".mode insert ext_votes" ".output /tmp/vic_votes_before.sql" "SELECT * FROM ext_votes WHERE source='vic_hansard_pdf';"
```

**2. Build the load file and rehearse it.**

```sh
$PY -m parli.ingest.vic_divisions unified --staged data/staged/vic-divisions --out /tmp/votes_vic_60.json
$PY -m parli.ingest.votes_state load /tmp/votes_vic_60.json --db "$DB" --dry-run
```

Expected from the first: `986 divisions, 51544 votes, 279 chamber-days; left out for renumbering: vic_lc 2026-08-27`.
The load replaces whole chamber-days, so that one day (11 staged of its 14 divisions) is left out and the
database keeps its 13 published rows.

**3. Load.**

```sh
$PY -m parli.ingest.votes_state load /tmp/votes_vic_60.json --db "$DB"
```

Expected: `ext_divisions` inserted 986, deleted 61 (the 74 less the 13 kept); `ext_votes` inserted 51,544.

**4. Validate before anything is published.**

```sh
sqlite3 "$DB" "SELECT count(*), min(date), max(date) FROM ext_divisions WHERE source='vic_hansard_pdf'; SELECT count(*) FROM ext_votes WHERE source='vic_hansard_pdf';"   # 999, 2022-12-20, 2026-09-24; 52026
$PY scripts/export_division_pages.py && $PY -m parli.ingest.vic_divisions sweep && git status --short portal/public/divisions | grep -c 'division-vic'
```

Expected: the sweep prints every class at 0 (two standing-form pairs) and exits 0. The export may rewrite
Victorian records only in `_meta` (the retained flags clear, the source reads `parli.db-ext-divisions`, parties
are refilled): no `name`, `question`, `source_url`, tally or vote changes. `$PY -m pytest tests/test_vic_divisions.py -q`
fails if any published text has moved off the staged reading.
Then `scripts/refresh_divisions.sh`'s last three lines write `votes.json`:

```sh
tmp=$(mktemp); $PY scripts/export_votes.py > "$tmp"; $PY scripts/vm/keep_if_unchanged.py portal/public/votes.json "$tmp"; $PY scripts/vm/divisions_guard.py --votes-only
```

Expected: Victorian members' `years` now start in 2022 or 2023 and their `divisions_total` rises; no federal
figure moves.

This was rehearsed here on a scratch copy of the vote tables as they stood on 10 November 2026 (65 Victorian
rows, not the box's 74): 986 inserted, 999 Victorian divisions afterwards, and an export from that copy changed
no published Victorian text, link, tally or vote, before the load or after it.

**Rollback.** `sqlite3 "$DB" "DELETE FROM ext_votes WHERE source='vic_hansard_pdf'; DELETE FROM ext_divisions WHERE source='vic_hansard_pdf';"`,
then `sqlite3 "$DB" < /tmp/vic_divisions_before.sql` and `sqlite3 "$DB" < /tmp/vic_votes_before.sql`, and
`git checkout -- portal/public/votes.json portal/public/divisions portal/public/seo/recent-votes.json`. The
published division records do not depend on the load: they are as committed either way.

**One thing the load depends on.** Four reviewed title corrections for Victorian records
(`divisions-votes-011` in `scripts/corrections/divisions.json`) are removed by this change. The records they
corrected now carry the staged reading, and a correction whose `from` value the database no longer holds stops
the export. With them gone the export runs before the load and after it.
