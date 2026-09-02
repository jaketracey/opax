# OPAX money data: sources, what was pulled, quality, exposure

Status 2026-09-02: **acquisition complete for everything that is machine-readable.**
Every source below is loaded into additive `ext_*` tables in `parli.db` (host `desktop`,
`/home/jake/.cache/autoresearch/parli.db`); nothing pre-existing (`donations`,
`mp_expenses`, `ministerial_meetings`, `federal_lobbyists*`, `contracts`) was touched.
Every load is recorded in `ext_ingest_log`. Nothing has been pushed to the ARAG
knowledge base; every KB idea below is marked as the user's cost decision.

| Table | Rows | Sources | Coverage |
|---|---:|---|---|
| `ext_donations` | 35,730 | QLD ECQ, VIC VEC, WA WAEC | 2012-13 to 2026-27 (see per-source) |
| `ext_expenses` | 1,229,512 | IPEA (37 quarters) | 1 Apr 2017 to 30 Jun 2026 |
| `ext_ministerial_meetings` | 61,499 | NSW Cabinet Office, QLD Cabinet (current govt) | NSW 2019 Q1 to 2026 Q2; QLD Nov 2024 to Jul 2026 (+1 Feb-2013 diary) |
| `ext_lobbyists` | 1,943 | AGD, NSW EC, QLD Integrity, VPSC, SA DPC, WA PSC | current registers incl. deregistered where published |
| `ext_lobbyist_clients` | 14,922 | same six | |
| `ext_lobbyist_people` | 5,943 | same six | |
| `ext_lobbyist_contacts` | 8,235 | QLD Integrity contact log | Sep 2016 to Sep 2026 |

Fetchers (all `parli/ingest/`): `money_state_donations.py`, `money_ipea.py`,
`money_diaries.py`, `money_lobbyists.py`, `money_classify.py`; shared plumbing in
`ext_common.py` (session/UA, date+money parsing, Power Pages grid client, `ExtWriter`
that ships gzip JSONL over ssh and loads inside one transaction). Everything identifies
as `OPAX research (opax.com.au; contact jake.tracey@noice.work)` and rate-limits.

## 1. Source register

### 1.1 State political-donation disclosures -> `ext_donations`

| Jurisdiction | Endpoint | Format | Licence | Coverage | Cadence | Status |
|---|---|---|---|---|---|---|
| **QLD** ECQ Electronic Disclosure System | `POST https://disclosures.ecq.qld.gov.au/Map/ExportCsv` with the page's anti-forgery token and empty filters (the "Download CSV" button on the Donor Location Map) | one CSV, whole register (~2.3 MB) | **CC BY 4.0** (data.qld.gov.au dataset "Electronic Disclosure System - State and Local Election Funding and Donations") | 2012-13 onwards; real-time since 2017 (gifts published within 7 business days) | continuous | **pulled in full: 23,618 gifts, $85.0m** |
| **VIC** VEC Disclosures portal | Power Pages entity list `pit_donation` on `https://disclosures.vec.vic.gov.au/public-donations/` via `/_services/entity-grid-data.json` (page size 5000) | JSON grid | Crown copyright (State of Victoria); no explicit open licence on the portal; published under Electoral Act 2002 s 217 | scheme began 25 Nov 2018; rows in the public grid date from 2020-21 | continuous (21-day disclosure) | **pulled in full: 4,237 donations, $11.4m** |
| **WA** WAEC Online Disclosure System | Power Pages entity list `waec_disclosure` on `https://disclosures.elections.wa.gov.au/public-dashboard/` | JSON grid; dates render m/d/yyyy | **Full Crown copyright, no open licence** (WAEC copyright notice) | real-time gifts since 1 Jul 2024; earlier years are PDF annual returns | continuous (7-day disclosure) | **pulled in full: 7,875 disclosures, $16.2m** (public exposure is a licence gate) |
| **NSW** Electoral Commission "Funding and disclosure online" | `https://efadisclosures.elections.nsw.gov.au/` (Salesforce Visualforce app `FDCLiteDisclosures`; has a `getDownloadURL` remoting action) | interactive search only; no published bulk file (the "downloadable resources" anchor on the disclosures page is empty; data.nsw.gov.au has only annual-report PDFs) | site terms: **"You are not allowed to use any software (like bots, scraper tools etc.) to access, monitor or copy the portal or its contents"**; robots.txt Content-Signal `ai-train=no` | 2018-19 onwards online | half-yearly + pre-election real time | **not pulled (terms).** Path: the Commission emails copies on request (`fdc@elections.nsw.gov.au`, stated on the View Disclosures page) -- ask for a CSV extract |
| **SA** ECSA | `https://www.ecsa.sa.gov.au/parties-and-candidates/disclosure-returns-%E2%80%93-state-elections` | ~18 PDF returns per election (party + associated-entity returns, edocman downloads); `disclosures.ecsa.sa.gov.au` no longer resolves | not stated (SA Government default CC BY) | 2022 state election returns; **SA banned political donations from 1 Jul 2025** | per election | **not pulled (PDF only, scheme ended).** Low value; skip |
| Federal AEC | already in `donations` (199,233 rows, 1998-99 to 2025-26) | | | | | out of scope here |

Unified schema (`ext_donations`): `jurisdiction, source, source_record_id, donor_name,
donor_type (individual|organisation|other), donor_suburb/state/postcode, recipient,
recipient_type (party|candidate|committee|other), recipient_party (canonical bucket),
amount, date_made, date_received, financial_year (AEC-style), disclosure_type, election,
is_political_donation (QLD flag), status, version (WA Original/Amended), industry,
industry_source, source_url, ingested_at`. Loads replace per `source`.

### 1.2 IPEA parliamentarian expenditure -> `ext_expenses`

| Item | Detail |
|---|---|
| Endpoint | data.gov.au CKAN: `package_search?q=organization:ipea`; each quarter is a dataset with `YYYYqNN_dataextract[_transactional].csv` plus repayments / certifications / office-costs-by-state / adjustments CSVs (only the transaction file is loaded) |
| Format | CSV, ~25-46K rows / 6-13 MB per quarter; columns incl. `UniqueId, ReportingPeriodId, FullNameWithTitle, Surname, FirstName, Party, StateOrTerritory, Electorate, Role, UserFirstName/UserSurname (traveller), HighLevelCategory, MajorSubCategory, MinorSubCategory, FromDate, ToDate, NumberNights, NightlyRate, Description, From/ToLocation, Amount, TripSequence, LegNumber, ReasonForTravel, PublishableNotes` |
| Licence | **CC BY** (`license_id: cc-by` on all 37 datasets) |
| Coverage | 37 quarters, 2017Q02 (1 Apr 2017) to 2026Q02 (30 Jun 2026); the 2024 quarters tag their resources `.CSV` (leading dot), which the discovery filter now tolerates |
| Cadence | quarterly, ~5-6 weeks after quarter end (2026Q02 published 2026-08-10) |
| Pulled | **1,229,512 rows, $1,352.1m**; 708 distinct parliamentarians; `person_id` linked for 1,217,845 rows (99.1%) via `members` first+last name |

Schema keeps IPEA's tree (`category_high/major/minor`) and adds the OPAX `category` via
`parli.ingest.ipea_expenses.map_category`, the traveller (family/staff differ from the
member), `unique_id` (stable across re-publications), `person_id`, `source_url` (the
dataset page). Loads replace per `(source, reporting_period_id)`. The legacy
`mp_expenses` (2.47M rows incl. the pre-2017 `icacpls` scrape) is untouched.

### 1.3 Ministerial diaries -> `ext_ministerial_meetings`

| Jurisdiction | Endpoint | Format | Licence | Coverage | Cadence | Status |
|---|---|---|---|---|---|---|
| **NSW** Cabinet Office ministers' diary disclosures | index `https://www.nsw.gov.au/departments-and-agencies/cabinet-office/access-to-information/ministers-diary-disclosures` -> one page per year -> one PDF per minister per quarter | PDF table `Date | Organisation/Individual | Purpose of Meeting`; some ministers also list `Lobbyist: <firm>, <person>` lines | **CC BY 4.0** (nsw.gov.au copyright statement) | 2019 Q1 to 2026 Q2 online (scheme began 2014; earlier years not on the site) | quarterly, ~1 month after quarter end | **pulled: 719 PDFs, 25,606 meetings (99.7% dated)** |
| **QLD** Cabinet and Ministerial Directory | `https://cabinet.qld.gov.au/ministers-portfolios.aspx` -> minister page -> one PDF per month (`/assets/diary/YYYY/month/slug.pdf`) | PDF table `Date | Organisation/Individual | Purpose` with a title block (Hon X MP, portfolios, period) | CC BY (cabinet.qld.gov.au copyright notice) | current government Nov 2024 to Jul 2026 (29 ministers/assistant ministers); former governments 2013-2024 available via `--period 2020-2024` etc. (not pulled) | monthly, end of following month | **pulled: 612 PDFs, 35,893 meetings (99.96% dated)** |
| VIC, WA, SA, TAS, federal | no published ministerial diary regime (VIC and federal publish nothing; WA/SA publish nothing systematic) | | | | | n/a |

Schema: `jurisdiction, source, minister_name, minister_title, portfolio, government_period,
period_start/end/label, meeting_date, meeting_date_raw, organisation (first line of the
cell), attendees (whole cell), lobbyist (NSW "Lobbyist:" lines), purpose, source_url,
pdf_page, row_order, ingested_at`. Loads replace per `(source, source_url)` so a re-run of
one quarter never disturbs the rest. PDFs are cached under `~/.cache/autoresearch/ext_money/diaries/`,
so re-parses are offline.

### 1.4 Lobbyist registers -> `ext_lobbyists` / `_clients` / `_people` / `_contacts`

| Jurisdiction | Endpoint | Format | Licence | Pulled |
|---|---|---|---|---|
| **Federal** AGD Register of Lobbyists | JSON API behind the SPA: `POST https://api.lobbyists.ag.gov.au/search/organisations`, `GET .../search/organisations/{id}/profile` (reuses `parli.ingest.federal_lobbyists` helpers) | JSON | **CC BY 4.0** | 696 orgs (359 active, 337 deregistered), 2,634 client links, 715 lobbyists (296 flagged former government representatives) |
| **NSW** Electoral Commission register | `https://lobbyists.elections.nsw.gov.au/` server-renders Active/Inactive/Cancelled/Suspended tables; clients, employees, owners via the page's Visualforce AJAX postback | HTML | listed on data.nsw.gov.au as CC BY-SA 3.0 AU (verify); robots `ai-train=no` | 463 entities (190 active, 216 inactive, 55 cancelled, 2 suspended), 5,801 client links, 2,924 people (1,744 employees, 1,180 owners) |
| **QLD** Integrity Commissioner Lobbying Register | Power Pages entity lists `dpc_lobbyist`, `dpc_client`, `dpc_contactlog` via `/_services/entity-grid-data.json` | JSON grid | **CC BY 4.0** | 224 entities, 239 lobbyists (38 former senior govt reps), 2,445 client links (627 from the client list, 1,818 inferred from the contact log), **8,235 lobbying contacts** 2016-09 to 2026-09 -- the only jurisdiction publishing lobbying *activity* |
| **VIC** VPSC register | `https://www.lobbyists.vic.gov.au/sitemap.xml` -> 247 `/search-the-register/{slug}` pages (content is inside `<template>` elements, unwrapped before parsing) | HTML | **CC BY 4.0** | 247 entities, 1,386 client links (1,334 current), 682 people (467 employees, 323 with a former-government-representative description; 215 owners) |
| **SA** DPC register | SPA `https://www.lobbyists.sa.gov.au/` backed by `https://saglobbyistapi02prdaue.azurewebsites.net/api/{lobbyist, client?lobbyistId=, employee?lobbyistId=}` (anonymous GET) | JSON | not stated on the register (SA Government default CC BY) | 187 entities (127 active, 60 surrendered), 1,925 client links (651 active), 910 employees (9 with restrictions) |
| **WA** Public Sector Commission register | `https://www.lobbyists.wa.gov.au/` embeds the whole register in the home-page script (`gridData.push`, per-company pushes); one fetch per run | HTML/JS | Crown copyright; wa.gov.au terms discourage automated access | 126 companies, 731 client links, 473 people (282 lobbyists, 191 owners) |
| TAS, ACT, NT | TAS (DPAC, ~30 entries) and ACT/NT registers are small HTML lists; not pulled | | | follow-up if wanted |

342 ABNs appear in more than one register; the most widely represented clients
(DoorDash, Bunnings, Mars, Optus, Rio Tinto, IFM Investors, Eli Lilly ...) are on all six.

## 2. Industry classification of state donors (`money_classify.py`)

Three tiers over `ext_donations` rows with `industry IS NULL`, each recorded in
`industry_source`:

1. **keyword** -- `INDUSTRY_KEYWORDS` from `classify_donations.py` (first industry in
   table order wins; identical to the AEC SQL pass). The table gained unambiguous terms
   the state data surfaced: `united voice`, `employees association`, `shop distributive`,
   `together queensland` (unions); `j.j. richards` (waste); `appea`, `senex energy`,
   `arrow energy`, `qgc` (fossil fuels); `clubs queensland`, `keno`, `lottery corporation`
   (gambling); `govstrat`, `sas consulting group` (lobbying); `watpac`, `builders`,
   `constructions`, `urban development institute` (property). `classify_donor_name()` was
   added for single-name use; `anthropic` became a lazy import so the module loads
   without the SDK. The AEC pass itself has **not** been re-run (it would relabel AEC
   rows; run `classify_donations` when that is wanted).
2. **individual** -- `donor_type = 'individual'`.
3. **aec_match** -- exact case-insensitive name match against the AEC `donations` table,
   inheriting the most common non-`other` industry (zero conflicting names measured).

Result (2026-09-02): keyword 786 new + 6,159 at ingest = **6,945**; individual **21,244**;
aec_match **1,933**; **5,608 rows / 3,032 donor names remain NULL** = the LLM-pass
candidate set. Top candidates by dollars: Sporting Shooters Assn (QLD) $456K, Apex Outdoor
$217K, St Baker Energy Innovation Trust $172K, QER Pty Ltd $141K, Firearm Dealers
Association $137K, Coogee Chemicals $116K ... -- mostly QLD/WA company names no keyword
knows, plus a firearms lobby that has no industry bucket in the taxonomy (consider adding
`firearms`). **LLM pass = user's cost decision**: ~3,032 names at 100 per call is ~31
Haiku-class calls, well under a dollar; `python -m parli.ingest.money_classify --report`
lists them.

## 3. Data-quality notes

Donations
- WA dates are m/d/yyyy in the grid (verified against 27 Aug 2026 disclosures); QLD gives
  `date_made` only, WA `date_received` only, VIC both.
- WA "compulsory party levy" rows are MPs paying their own party (donor = sitting member);
  they carry `disclosure_type='compulsory party levy'` and should be excluded from
  donor rankings. QLD `is_political_donation` = 0 rows are receipts that are gifts but not
  political donations under the Act (keep the flag visible).
- Recipient strings are as disclosed ("Australian Labor Party (State of Queensland)",
  "WA Labor", "AUSTRALIAN LABOR PARTY - VICTORIAN BRANCH"); `recipient_party` canonicalises
  them (LNP tested before Labor/Liberal). 1,950 rows ($13.0m) have no party bucket:
  candidates, committees, independents.
- Same donor, different spellings across sources ("J.J. RICHARDS & SONS PTY LTD" vs "J.J.
  Richards & Sons Pty Ltd"): only case-folding is applied; reuse `export_money_graph.norm_key`
  (suffix stripping) when aggregating.
- **Do not add state and federal totals.** AEC annual returns of federally registered
  parties include their state branches' receipts, so a QLD gift to the LNP can appear in
  both `donations` and `ext_donations`. Jurisdiction is a filter, never a union.

Expenses
- 18 of 708 members are unlinked to `members.person_id` (nickname/case mismatches: "Pat"
  vs "Patrick Conaghan", "Bob" vs "Robert Hawke"; former PMs and one senator absent from
  `members`). `members` is dirty (see MIGRATION-ARAG.md), so treat `person_id` joins as
  best-effort and prefer `member_name` for display.
- IPEA re-publishes quarters (2022Q02-2023Q02 were re-issued in 2026); `unique_id` is the
  stable key and the per-quarter replace absorbs re-publication. Negative amounts are
  IPEA adjustments/repayments and are kept as published.
- `role` is empty for 623,587 rows (older quarters did not publish it).

Diaries
- PDF headers are inconsistent: NSW names the **office**, not the minister; a surname is
  recovered from the file name where it carries one (`minister-catley-...`, `Minister
  Jackson - Diary Disclosure ...`): 8,788 of 25,606 NSW rows, 21 ministers. Two-line and
  overprinted headings, five date styles (`1.10.2025`, `1/10/25`, `1 October 2025`,
  `1st October 2025`, year-less `4 February`) and period lines with the year only on the
  end date -- all handled; year-less dates take the diary period's year. 906 rows (NSW 554,
  QLD 352) still have no parsed period; 52 NSW rows carry only a year label.
- QLD minister names are as published, so nickname variants coexist ("Dan Purdie" /
  "Daniel Purdie", "Samuel (Sam) O'Connor"); honorifics and post-nominals are stripped.
- Source typos: a meeting dated year 2926, a 2005 date inside a 2025 diary -- `meeting_date`
  is nulled when outside the diary period +/- 1 year (`meeting_date_raw` keeps the text).
- QLD links one 2013 Newman-era diary (Ros Bates) from her current page; it is loaded with
  its true period. The same PDF linked from two minister pages is now loaded once.
- 29 NSW PDFs yield no rows: they are the 22-31 December 2021 stub diaries issued after
  the Perrottet reshuffle and read "Nil return". No NSW or QLD PDF failed to parse.
- Attendee cells hold several names/roles per meeting; `organisation` = first line,
  `attendees` = whole cell, `lobbyist` = NSW "Lobbyist: ..." lines (113 rows; the
  convention is recent and minister-specific, so absence is not evidence of no lobbyist).
  NSW also prints "Minister X" / "Y MLC" lines for other members present -- left in
  `attendees`.
- The legacy `ministerial_meetings` (3,237 QLD rows, header strings mis-parsed as dates)
  is superseded and untouched.

Lobbyists
- VIC's former-representative flag is broad by design (it includes former ministerial
  advisers, so 69% of employees carry it); federal (41%) and QLD (16%) use narrower tests.
  Not comparable across jurisdictions.
- NSW "On Watchlist?" is blank for every entry (no one listed), so `on_watchlist = 0`
  everywhere; the NSW detail postback occasionally fails for a firm (logged, firm kept
  without clients).
- QLD publishes no ABNs; QLD client links from the contact log are inferred (`derived_from
  = 'contact_log'`) and only carry a first-seen date. 4,087 of 8,235 contacts have no
  `contact_mode`.
- SA `client.active` is derived from a missing end date; WA has no status/dates beyond
  `lastUpdated`.

## 4. Exposure design (money stays relational / static JSON)

Per MIGRATION-ARAG.md, structured money stays out of the KB; the portal reads static JSON
under `portal/public/graph/`. Proposed additions, in value order:

1. **Money map by jurisdiction. Shipped 2026-09-02 (QLD, VIC); see §4.1.**
   `scripts/export_state_money.py {qld|vic|wa}` reads `ext_donations` with the federal
   export's rules (`recipient_party` -> party nodes; `norm_key` on donors; public funding and
   party-internal exclusions) and writes `graph/money.qld.json` / `money.vic.json` in the
   **same node/edge shape** plus a `meta` block (`jurisdiction, commission, sourceShort,
   licence, coverage, threshold, not_summed`). Files are separate on purpose (no
   cross-jurisdiction sums, see §3). WA stays behind the licence gate: the script refuses
   `wa` without `--gated`, and nothing WA is served.
2. **Expenses on person pages** (`#/subject/person/{name}`). Export
   `graph/expenses/index.json` (per member: latest four quarters, lifetime total, rank) and
   `graph/expenses/{slug}.json` (quarter x category totals, top descriptions, member vs
   family/staff traveller split), keyed by the same normalised speaker name the person page
   uses (`speakers.json`), joined via `members.person_id` with a name fallback. Render as an
   "Expenses (IPEA)" infobox line + category bar list + link to the data.gov.au dataset.
   Federal members only; state MPs show nothing rather than a wrong zero.
3. **Meetings on person pages** for NSW/QLD ministers (they are in the corpus via NSW
   Hansard / QLD parliament): `graph/meetings/{slug}.json` with organisation counts and the
   raw list, plus the `lobbyist` field. Also a donor-page section "Met ministers" by
   organisation-name match against `ext_ministerial_meetings.organisation` (the
   money <-> access join).
4. **Donor pages**: "Also disclosed to state commissions" (per-jurisdiction totals from
   `ext_donations`) and "Registered lobbying client of" (`ext_lobbyist_clients` by client
   name) -- the money <-> lobbying join. One `graph/donors.json` for the top-N donors
   keeps it static.
5. **Lobbying graph** (`graph/lobbying.json`): firms <-> clients on the existing 3D engine,
   with per-register presence and the QLD contact time series as a small chart.
6. **KB ingestion (user's cost decision, not started):** the 62K diary meetings and 8K QLD
   contacts are short text rows (~2-3M tokens total) and would make "who met the gambling
   lobby in 2025" answerable through /ask with citations back to the PDF URL. It is paid
   processing on the platform; cost it from the step-4 sample before enabling. Donations,
   expenses and registers should **not** go into the KB -- they are tables.

### 4.1 State donations on the portal (shipped 2026-09-02)

Files (`portal/public/graph/`, static, committed):

| File | Size | Rows used | Donors | Parties | Edges | Top donors |
|---|---:|---:|---:|---:|---:|---|
| `money.qld.json` | ~98 KB | 22,703 gifts to parties (of 23,618) | 250 | 10 | 369 | Mineralogy $3.78m; Duncan Turpie $1.33m; United Voice QLD $829k; J.J. Richards & Sons $794k; CEPU Electrical Division QLD/NT $781k; CPSU PSU Group $768k; United Workers Union $745k; AWU QLD $643k; AMWU $497k; Pharmacy Guild QLD $430k |
| `money.vic.json` | ~82 KB | 3,416 donations to parties (of 4,237) | 250 | 11 | 291 | Jason McClintock $110k; Malik Zaveer $70k; Darren Natale $55k; Lucas Moon $48k; Peter Walsh $48k; Louise Staley $47k; Tim Read $42k; Matt Fregon $40k; Richard Welch $38k; Victorian Automotive Chamber of Commerce $24k |
| `money.wa.json` | not generated for the portal | | | | | **WA is excluded from public exposure**: WAEC asserts full Crown copyright with no open licence. `export_state_money.py wa --gated` produces a research copy outside `portal/public`. |

Rules on top of the federal export: gifts to candidates, committees and third parties
are out (no `recipient_party`); the other/NULL-industry floor is per jurisdiction (QLD
$100k, VIC $10k, WA $50k; the federal $5m would empty a state file); VIC `loan` rows and WA
`compulsory party levy` rows are dropped as not-gifts. QLD keeps every gift and reports the
`is_political_donation` split in `meta.political_donation_flag` (the flag only exists from
2022-23: 2,449 flagged political donations, 5,123 gifts the Act does not class as political
donations, 15,131 unflagged older rows). VIC's top disclosed donors are mostly individuals
and many are sitting MPs paying their own party (the register does not tag these the way WA
tags its levy); they are shown as disclosed.

Where it appears:

- `#/money` gets a Jurisdiction switch (Federal, Queensland, Victoria) above the map; the
  choice deep-links as `#/money?jur=qld` and defaults to Federal. Switching destroys and
  remounts the 3D map on the matching file; the ask and search triggers on the cards are
  unchanged. `/map?jur=qld` does the same on the full-screen page. The map hint reads
  `meta.sourceShort` ("ECQ gifts register 2012-13 to 2026-27") instead of "AEC returns".
- The Ledger (`ledger.js`) has the same switch; filters survive a switch only if the new
  file offers the same industry/party. The fineprint, the Raw data link and the CSV comment
  header are built from the loaded file's `meta` (commission, coverage, threshold, licence).
- Donor pages (`#/subject/donor/...`) get "Also disclosed to state commissions": one row per
  state file the donor appears in (jurisdiction, total, gift count, years, recipient parties)
  linking to that jurisdiction's map; exact match after `normName` (case and company
  suffixes), so "Mineralogy" (AEC) and "Mineralogy Pty Ltd" (ECQ) meet, spelling variants do
  not. Also rendered for donors outside the federal top 250.
- **Money & Words and Words per dollar stay federal.** They pair AEC industry totals with
  the speech index; adding state files would require a per-jurisdiction words series and
  would invite the sum the fineprint forbids. Left as-is on purpose.

Fineprint everywhere (map panel, ledger, donor section, CSV header) names the commission
as source, states the disclosure-threshold floor ("totals are a floor, not a ceiling") and
carries: *State and federal returns are not summed: AEC returns already include state
branch receipts.*

## 5. Runbook

`uv run` fails on this Mac (the lock pins a CUDA torch wheel), so use the worktree venv
directly: `uv pip install --python .venv/bin/python requests beautifulsoup4 lxml pdfplumber`
once, then `PYTHONPATH=. .venv/bin/python -m parli.ingest.<module>`. Writers default to
`ssh desktop`; `--db /tmp/x.db` for a local test file, `--dry-run` to fetch without writing.

| Refresh | Command | Cadence |
|---|---|---|
| State donations | `money_state_donations` (all three; `--source qld` etc.) | weekly |
| IPEA | `money_ipea --since 2026q03` | quarterly, mid Aug/Nov/Feb/May |
| NSW diaries | `money_diaries --jurisdiction nsw --years 2026` | quarterly |
| QLD diaries | `money_diaries --jurisdiction qld` (current govt; `--period 2020-2024` for former) | monthly |
| Lobbyists | `money_lobbyists` (all six, ~25 min; `--jurisdiction qld` alone for the contact log) | monthly |
| Classification | `money_classify --report` after any donation load | with donations |
| State money maps | `ssh desktop python3 - qld < scripts/export_state_money.py > portal/public/graph/money.qld.json` (and `vic`); then from `portal/`: `node graph/smoke-test.mjs` | after a state donation load |

Run-time 2026-09-02 (laptop, polite delays): donations ~5 min, IPEA ~35 min (37 CSV
downloads), NSW diaries ~40 min (633 PDFs), QLD diaries ~25 min (611 PDFs), lobbyists
~25 min total. Two loaders writing the same table concurrently is safe (remote temp
files are now unique; SQLite serialises with a 600 s busy timeout).

## 6. Open items

- NSW donations: request a bulk extract from the NSW Electoral Commission (their terms
  bar scraping; they email copies on request).
- WA donations: clear the WAEC copyright position before any public exposure.
- Optional LLM pass over the 3,032 unclassified state donors (`--report` lists them);
  consider a `firearms` industry bucket.
- QLD former-government diaries (2013-2024) are one flag away (`--period`), ~4x the current
  volume; TAS/ACT/NT lobbyist registers are small HTML lists.
- Re-run the AEC keyword pass (`classify_donations`) so federal rows pick up the new
  keywords.
