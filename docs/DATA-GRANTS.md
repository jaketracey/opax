# OPAX grants data: who gets the money, and which of them fund parties

Status 2026-09-05: **built and exposed.** Every Commonwealth grant award published on
GrantConnect since the register opened, plus every Queensland Government funding line,
resolved to recipient entities, given ABNs from the ABN Bulk Extract, tied to the donor
register, and served on the portal as the Explore module **"Who gets the grants"**
(`portal/public/grants.js`, files under `portal/public/graph/grants.*.json` and
`portal/public/grants/`).

| Table | Rows | Source | Coverage |
|---|---:|---|---|
| `ext_grants` | 360,058 | GrantConnect (Department of Finance), `parli.ingest.grantconnect` | awards published 24 Nov 2017 to 5 Sep 2026 ($235.5B) |
| `ext_grant_details` | growing (background) | GrantConnect award detail pages, `scripts/grantconnect_details.py` | largest awards first; ABN, location, selection process, program, purpose |
| `government_grants` | 230,007 | QLD Government Investment Portal (pre-existing, `parli.ingest.grants --qld`) | 2017-18 to 2024-25 ($85.7B), every row with an ABN and a federal electorate |
| `ext_grant_recipients` | 132,511 | `parli.ingest.grant_recipients` | one row per recipient entity across both sources |
| `ext_grant_recipient_keys` | 159,976 | same | (source, ABN or raw name) -> recipient |

Every load is in `ext_ingest_log`. Nothing pre-existing was modified. Nothing here is in the
ARAG knowledge base: grants are a table, and stay one.

## 1. Sources

### 1.1 GrantConnect (Commonwealth) -> `ext_grants`

GrantConnect is where every Australian Government entity must publish a Grant Award (GA)
within 21 days of the agreement taking effect, mandatory since 31 December 2017. The site
is licensed **CC BY 3.0 AU** (footer of every page); `robots.txt` allows `/Ga/*` and
forbids `/Search/*` and `/Reports/*`. Its help pages say downloads need a registered
account and there is no API. Both are half true, and the traps cost a morning
(measured 2026-09-05):

- **The results page's "Download Results" link answers anonymously** with an XLSX of the
  awards in a publish-date window:
  `GET /Ga/DownloadResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord&DateType=Publish%20Date&DateStart=01-Jul-2024&DateEnd=07-Jul-2024`
  (the form also takes `ValueStart`/`ValueEnd`). Columns: GA ID, Grant Activity, Agency,
  Publish Date, Category, Start Date, End Date, Value (AUD), GO ID, Recipient Name,
  One-off/Ad hoc, Aggregate Grant Award, Aggregate Reason, Number of Awards Aggregated,
  Last Updated. A GA ID carries its current version as a `-Vn` suffix.
- **A window the server will not filter comes back as an unfiltered dump** of the whole
  register in 10,000-row chunks (30,000 or 50,000 rows, publish dates from 2017 to
  today, duplicate IDs) with a 200 and a spreadsheet content type. Nothing says so.
  Whole financial years always do this; months almost never; two single days
  (23 and 24 July 2018, 5,573 awards) do it at any window and had to be exported in
  value bands. The loader walks months, checks every export for out-of-window dates
  and repeated IDs, halves a window that fails, falls back to value bands for a single
  day, and compares each accepted window's row count with the results page's own
  "Showing 1-15 of N records". The 2026-09-05 load matched the site on all 133 windows
  (the two July 2018 days are 8 rows short of the site count, which double-counts
  versions).
- **The export has no recipient ABN, location, selection process, program or purpose.**
  Those are only on each award's detail page, `/Ga/Show/{guid}`, and the GUID is only
  discoverable by searching the GA ID (`/Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId=GA578028`).
  Two requests per award. `scripts/grantconnect_details.py` walks them largest-first in
  the background on the DB host at about one award a second (see the runbook); the
  portal export reads whatever has landed, so ABN and electorate coverage rise over time
  and are reported in `meta.counts.abn_known_share` / `electorate_known_share`.
- GrantConnect answers **403 to any user agent that does not look like a browser**,
  the project's plain `OPAX research (...)` UA included. Both scripts send
  `Mozilla/5.0 (compatible; OPAX research; +https://opax.com.au; contact ...)`.
- The site occasionally drops connections outright (HTTP 000 from curl) for a minute
  after a burst of requests; the harvester backs off and resumes.

### 1.2 Queensland Government Investment Portal -> `government_grants`

Pre-existing table (`parli.ingest.grants --qld`, loaded 2026-03-28): consolidated
expenditure per funding agreement per financial year from data.qld.gov.au, **CC BY 4.0**,
with the recipient's ABN, type (nfp / business / individual / local government), the
federal electorate, suburb and postcode, and a grant type classified at load time
(formula / multi-year / discretionary / one-off). 'Multiple' recipients (25,424 rows,
$18.8B: aggregated lines) have ABN '0' and are shown as not disclosed. A multi-year
agreement appears once per year it was paid, so a recipient's "grants" count here is
funding lines, not agreements; the UI says "funding lines".

### 1.3 ABN Bulk Extract -> ABNs for recipients

`parli.ingest.abr_match` (built for the donor register) indexes every non-individual
name in the ABR bulk extract (`~/.cache/autoresearch/abr/abr_names.sqlite`, 16.9M
names, CC BY 3.0 AU). `grant_recipients` reuses its `match_entity` rules unchanged:
unique main-name match on the exact key, then on the legal-suffix-stripped key, then a
unique business or trading name whose owner shares the first significant word.
Ambiguous names (several active ABNs with one main name, 1,035 federal names) get no
ABN. Sole traders are not in the index and people never get an ABN.

## 2. Entity resolution (`parli.ingest.grant_recipients`)

One recipient per ABN when an ABN is known from the source (all QLD rows; federal rows
with a fetched detail page) or from the ABR; otherwise one per `norm_rule` name (the
donor register's own normaliser: case, punctuation, legal suffixes, branch tails).
People (`looks_like_person`) key on `norm_person`. Placeholder names (n/a, Multiple,
Various, Confidential, Withheld ...) and aggregate awards go to one undisclosed bucket
per source so the totals still reconcile.

Kinds come from the ABR entity type (PRV/PUB company, OIE/UIE association, trusts,
partnerships, super funds, CG*/SG*/TG* government, LG* council) with name rules for
universities, councils and health services on top, then the QLD recipient type, then a
name guess. Display names prefer a non-shouting spelling of the commonest form and
title-case ALL-CAPS filings; the ABR legal name is used only when it is the same name.

A recipient is tied to a donor-register entity (`ext_donor_entities`) by, in order:
ABN (1.0), `norm_exact` of a spelling equal to a donor alias (0.95), `norm_rule` equal to
a donor alias with two or more significant words and exactly one owning entity (0.85),
or one of the ABN's registered names keying to exactly one donor entity (0.8). People,
government bodies, councils, universities and party units are never linked.

Measured 2026-09-05: 132,511 recipients (96,937 with an ABN; 74,753 federal names
matched through the ABR), of which 1,091 are in the donor register: 821 by ABN, 106 by
exact name, 61 by rule name, 103 through a registered business name. Those recipients
received **$28.1B of the $235.5B Commonwealth total (11%)** and **$3.3B of the $85.7B
Queensland total (3.8%)**. The share of dollars whose recipient carries an ABN from the
award itself was 21% federal at export time and rises with the detail harvest.

## 3. Exposure

`scripts/export_grants.py {federal|qld}` streams a stdlib-only program to the DB host and
writes:

- `portal/public/graph/grants.<jur>.json` (federal ~1,181 KB raw / 329 KB gz, QLD ~961 KB /
  280 KB): `meta` (source, licence, coverage, caveats, counts, the government of the day
  by date, party blocs, years, chart years), `agencies[]` and `categories[]` (referenced
  by index), `recipients[]` (the 3,800 largest by dollars plus every donor among them,
  cap 6,000, plus any recipient the *other* jurisdiction's export already lists by ABN
  forced in regardless of rank so a shard's cross-jurisdiction pointer never dangles:
  4,688 federal, 4,268 QLD, measured 2026-09-13), `programs[]` (top 500 by dollars;
  federal grouped by GO ID, QLD by program name with stray whitespace collapsed; each
  row carries the program file key, section 3.2), `electorates[]` (per federal division:
  totals, donor share, the members who held it since 2017 from `members`, margins from
  `electorates` 2019 and 2022), `years{}`, `kinds{}`.
- `portal/public/grants/<jur>/shard-NN.json`: the listed recipients' files in 40 shards by
  crc32 of the file key (`sh` on the index entry): the recipient's 40 largest grants,
  ABR record, aliases, agencies, programs, selection mix, electorates, the donor entity
  with AEC donations by party and year and each exposed state register (qld, vic, tas)
  separately, and a pointer to its grants in the other jurisdiction.
- `portal/public/grants/<jur>/programs/<key>.json`: one file per listed program (section
  3.2).

### 3.2 Program files (2026-09-13)

The Programs view opens a program the way the Recipients view opens a recipient. The
index lists the 500 largest programs per jurisdiction by dollars (`--programs`; the
export falls back to 300 if the index would pass 1.6 MB) and writes a file for each of
them, so `counts.program_files` equals `counts.programs_listed`.

Grouping. Federal programs are GO ids. 136,454 awards ($51B, mostly published 2018-2020
and since 2025) carry no GO id in the register; when such an award's fetched detail page
names a program that only one GO id uses, the award files under that GO id (GA34203, the
Qantas Founders Museum airpark roof, is a Community Development Grants award with no GO
id and files under GO3141). Program names that several GO ids share (181 of 767, e.g.
"Comprehensive Primary Health Care") are left alone. An award with no GO id and no such
name is its own `activity:<title>` program, as before. QLD programs are program names
with stray whitespace collapsed.

A program's heading (`program_name`) is the commonest name its awards carry that reads
as a name: detail-page program names weigh three, activity titles one; descriptions
(over 90 characters or ending in a full stop), bare values ("$4,672.80", "0") and a
title shared by only one or two awards in a program of twenty or more are never
headings. That last rule matters for research rounds and the RISE Fund, where every
award is its own project: such a program needs at least one fetched detail page to be
named at all, else it shows its GO id. On 2026-09-13, 58 of the top 500 were in that
state and were named by fetching two awards each
(`grantconnect_details.py --ids ...`); a fresh top-500 entrant can need the same.

GrantConnect's export ships curly quotes and dashes as UTF-8 read as cp1252 in about
500 titles ("Australiaâ€™s"). `unmangle` in the export and in
`parli.ingest.grantconnect.parse_xlsx` reverses it sequence by sequence, including
twice-mangled text and the closing-quote byte the source drops.

Layout. A programs[] index row carries `key` (the file name: the program id lowercased,
every run of non-alphanumerics to `-`, trimmed, at most 80 characters; `GO3141` ->
`go3141`, `activity:Some title` -> `activity-some-title`; two ids that slug the same
way get `-2`, `-3` on the smaller), `cnc` (Closed Non-Competitive dollars), `selk`
(dollars with a selection process recorded) and, federal only, `gov` (dollars in
government-held seats at the grant date), `elk` (dollars with an electorate mapped) and
`marg` (dollars in seats that were marginal at the latest prior election with a row).
`meta.elections` lists the election days the timing buckets use. The file itself holds
the program's totals, agencies, top 8 categories, top 6 PBS program lines (federal, from
each award's detail page), the selection mix, dollars by financial year, the seat split
(`seats`: gov / opp / cross / unknown), the margin split, every electorate with a grant
and the members who held it on the grant dates, the 60 largest recipients (each flagged
when it is in the donor registers), the timing buckets, and the grants themselves,
largest first, at most 600 (`grants_total` / `grants_listed` say how many there are
and how many are listed). Every [d, c] pair is [dollars, count]. Federal-only fields are
present in a QLD file with the value null.

Rules.
- The grant date is the start date, else the approval date (federal detail pages only),
  else unknown. Seat holder, bloc, margin type and months to the election all use it;
  an unknown date gives holder null, bloc "unknown", margin null and timing "unknown".
  A source value that is not a date (a run of hash marks in one QLD line, "unknown" in a
  few roster rows) reads as no date.
- The holder is the member of the House for the seat on the grant date, layered because
  the roster's service dates are wrong for about a tenth of the seats (Bass has Ross Hart
  sitting until 2026 and Bridget Archer since 1907; the 2025 intake has no dates at
  all): from 18 May 2019 to 2 May 2025 the recorded general-election winner
  (`electorates`, 2019 and 2022 rows, `winning_candidate`) holds the seat for the term,
  with the six House by-elections of those terms applied (Eden-Monaro, Groom, Aston,
  Fadden, Dunkley, Cook; `BY_ELECTIONS` in the script); from 3 May 2025 the portal's
  current roster (`portal/public/parliamentarians.json`, `current` federal
  representatives) holds it; before May 2019, and wherever those tables have no row,
  the member whose entered / left dates span the date (`members`, chamber
  representatives, anyone who sat since 2010; the index's `electorates[].mps` keeps its
  since-2017 window; a roster row with no dates at all counts only once every dated
  member has left). Names keep the roster's spelling when the winner is the same
  person; party spellings are unified (A.L.P. and ALP are Labor, KAP is Katter's
  Australian Party). Measured 2026-09-13 before the layering: the roster alone
  disagreed with the recorded winner in 16 of 151 seats for 2019 and 29 of 151 by
  January 2024.
- Bloc: the holder's party through `meta.blocs` (Liberal, Nationals, LNP, CLP =
  Coalition; Labor = Labor); "gov" when that bloc governed on the grant date per
  `meta.government`, "opp" when it is the other major bloc, "cross" for the Greens,
  independents and minor parties, "unknown" when the electorate, the holder or the
  holder's party is unknown or the date is before the government table starts
  (September 2013; two awards).
- Margin type: the `electorates` table only has the 2019 and 2022 results, so a grant
  takes the seat type from the latest election day on or before its date that has a
  row. Grants before 18 May 2019 have no margin type and count as "unknown" in the
  split; the UI says so.
- Months to the election: from the grant date to the next election day in the file's
  own jurisdiction's list (federal 2013, 2016, 2019, 2022, 2025; QLD 2015, 2017, 2020,
  2024), in months of 30.44 days: 0_3, 3_6, 6_12, 12_24, over_24. A date after the last
  listed election is "unknown" (60,735 federal awards start after 3 May 2025).
- Approval to start (federal): start date minus approval date in days: before_approval
  (start before the recorded approval), 0_30, 31_90, 91_365, over_365; only where the
  detail page has been fetched (`timing.approval_known`).

Caveats.
- Everything about seats is as of the grant date, not today: a seat that changed hands
  in 2022 or 2025 shows the earlier member for earlier grants, and the electorates list
  names every member who held the seat across the program's grants.
- Federal electorates come from the delivery or recipient postcode of a fetched detail
  page (highest-ratio division), so `el_known` grows with the detail harvest and a
  postcode straddling a boundary is approximate. Redistributions are not tracked: a
  2019 grant in a seat abolished since is still filed under that seat.
- QLD grants are state money and their electorates are federal divisions, so the QLD
  file has seats, margins, bloc, margin type, PBS lines and approval timing null. It keeps
  electorates (with the federal members who held them), the selection mix (the load-time
  grant type: formula, discretionary, one-off, multi-year) and the timing against
  Queensland elections. 127,268 of the 230,007 QLD lines have no start date and so no
  holder or election timing.
- The remote program shares its rules with `scripts/test_export_grants.py`: the same
  functions are sourced into the streamed program, so `python3 -m unittest
  scripts/test_export_grants.py` exercises what the export runs, without the DB host.

The module `portal/public/grants.js` (`mountGrants`, Explore card "Who gets the grants",
megamenu and drawer links, `data-game="grants"`) has three views over one filtered set:
Recipients (a row opens the file in place), Programs (share of each program's dollars
that went to recipients in the donor registers), Electorates (held-by chips linking to
person pages, latest margin and seat type). Filters: jurisdiction, donors only, text,
kind, agency, financial-year window (re-summed from the year cells), minimum awarded.
Tiles, a year chart with the donor share as the solid bar and the government of the
day as a legend line, CSV export with the caveats in the comment header, fineprint from
the file's own `meta`. Pure data functions are tested in `portal/test/grants.test.mjs`.

Honesty rules carried by every file and screen:
- Grant totals are awarded values as published; a varied award counts at its current
  value. Aggregate awards and withheld recipients are the not-disclosed bucket.
- A recipient counts as a donor only through the register match above; people are
  never matched by name.
- AEC donations and state-register gifts sit side by side and are never summed.
- A donor receiving a grant is a fact about the public record, not a finding. The
  recipient file states what share of its grant dollars was awarded while a party it has
  given to was in government, phrased as timing, and shows the selection process
  wherever the source records it.
- Federal electorates are mapped from the award's delivery or recipient postcode via
  `postcode_electorates` (highest-ratio division) and only for awards with a fetched
  detail page; the coverage share is in `meta.counts`. Queensland electorates are the
  federal divisions the QLD data records; the government of the day there is the
  Queensland Government.
- WA, ACT and NT state donations stay behind their licence gates (`EXPOSED_STATES`).

### 3.1 On the money map (2026-09-05)

`scripts/export_money_graph.py` and `scripts/export_state_money.py qld` carry a
`grants_layer`: for each of the map's top-250 donors that `ext_grant_recipients` ties to
the same donor entity, the grants it received (by year, top programs, explorer file), a
central grantor node ("Commonwealth grants" / "Queensland grants") and one grant flow
per such donor. Measured 2026-09-05: 30 of the federal map's donors received $1.0B in
Commonwealth grants (Telstra $466M, BlueScope $150M, Regional Express $140M, Ramsay
$70M); 27 of the Queensland map's donors received $334M (Ramsay $229M, Black & White
Cabs $51M). The legend's "Public money" chip toggles the layer; donor cards gain "Public
money received" with a deep link into the explorer (`/explore?game=grants&jur=..&open=..`).
See `portal/graph/README.md`, "The grants layer". Never summed with donations.

## 4. Runbook

All from the worktree on the Mac unless noted. `uv run` fails here; use `.venv`.

| Step | Command | Cadence |
|---|---|---|
| Federal awards, full | `PYTHONPATH=. .venv/bin/python -m parli.ingest.grantconnect` (13 min, 133 windows, cached XLSX under `~/.cache/autoresearch/ext_money/grantconnect/`) | once |
| Federal awards, refresh | `... -m parli.ingest.grantconnect --since 2026-08-01 --refetch` (replaces rows published in the range; awards can be varied, so refresh the last two months) | weekly |
| Detail pages (background, on desktop) | `scp scripts/grantconnect_details.py desktop:/tmp/ && ssh desktop 'nohup python3 /tmp/grantconnect_details.py > /tmp/gc_details.log 2>&1 & echo $! > /tmp/gc_details.pid'`; status `ssh desktop 'tail -2 /tmp/gc_details.log'`; stop `ssh desktop 'kill $(cat /tmp/gc_details.pid)'`. Resumes where it left off. | started 2026-09-05 11:35 local, ~0.8 awards/s, ~5 days for the register |
| Recipients | `rsync -a --exclude __pycache__ parli/ desktop:~/opax-sync/parli/ && ssh desktop 'cd ~/opax-sync && PYTHONPATH=. python3 -m parli.ingest.grant_recipients --db ~/.cache/autoresearch/parli.db --abr-dir ~/.cache/autoresearch/abr'` (~1 min) | after any grants load or donor-register rebuild, and daily while the detail harvest runs |
| Export | `.venv/bin/python scripts/export_grants.py federal && .venv/bin/python scripts/export_grants.py qld`; money maps `ssh desktop python3 - < scripts/export_money_graph.py > portal/public/graph/money.json` and `ssh desktop python3 - qld < scripts/export_state_money.py > portal/public/graph/money.qld.json`, then `node graph/smoke-test.mjs` and `npm run deploy` from `portal/` | with the recipients step |
| Tests | `cd portal && node --test test/grants.test.mjs`; `python3 -m unittest scripts/test_export_grants.py` | with any change to grants.js / export_grants.py |

## 5. Open items

- Detail-page coverage: 18% of federal dollars had a fetched page at first export; the
  harvester needs about five days for the whole register. Re-run recipients + export as
  it progresses; the electorate view for the Commonwealth is thin until then.
- Other states' grants (NSW, VIC, SA, WA) are not loaded. NSW publishes grants on
  data.nsw.gov.au per agency; VIC through the Victorian Government grants portal; each
  is its own fetcher and its own licence check.
- A one-line "who they are" descriptor per top recipient (an LLM pass over the ABR
  record, category and agency mix) would make the recipients table read faster; it is
  paid model time, so it is the user's call.
- Grants to individuals are listed by name because GrantConnect publishes them; a
  policy decision to fold them into an "individuals" bucket is one flag in the export.
- Donor-page cross-link: person and donor entry pages do not yet show "grants received";
  the shard files carry what a "Grants received" section needs.
