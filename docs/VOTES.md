# Voting records (divisions) — audit, source survey, pipeline, ingestion plan

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
