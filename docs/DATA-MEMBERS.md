# Members roster currency

The `members` table (parli.db on desktop) is the source for who sits today, for which party,
and it feeds `parliamentarians.json` (`scripts/export_parliamentarians.py`), the interests
matcher and the money/votes joins. It drifted badly through 2025–26: 301 rows were "current"
against a real 226, sitting senators carried 2023 exit dates, and 144 current rows had no
canonical party.

## Sweep of 2026-09-04 (`ext_ingest_log` source `aph-current-sweep`)

Source: the APH Senators and Members list, fetched through Firecrawl (the site's WAF refuses
non-browser agents; robots allows the path) as two member pages and one senator page — the
`sr` page parameter only reaches two pages of a combined query, so the query is split by
chamber. 226 rows: 150 members, 76 senators, each with name, seat/state and party.
Historical acquisition only; Firecrawl refresh is disabled under the 10 Oct
2026 decision; see [SOURCES-ACCESS.md](SOURCES-ACCESS.md).

Saved as `aph_current.json` in the session scratch; re-fetch is three Firecrawl credits.

Applied to `members` (matched 225 of 226 by full name, nickname-tolerant):

* 13 `party_canonical` corrections — Barnaby Joyce → One Nation, Fatima Payman → Australia's
  Voice, Tammy Tyrrell → Labor, Matt Canavan → Nationals, LNP members who sat in `members`
  as Liberal/Nationals → LNP (Buchholz, Landry, Littleproud, both O'Briens, McDonald),
  office strings (SPK, PRES, DPRES) replaced by the party.
* 42 `left_house` cleared for sitting members wrongly marked as departed.
* 118 `left_house` set for rows that are not on the current list: the person's last
  recorded speech date when it is 2019 or later, otherwise 2025-05-03 (election day).
  Approximate by design; the exact date is not in any source we hold.
* 1 insert: Senator Vanessa Bleyer (Greens, TAS, casual vacancy) as `aph_25813` — she has no
  OpenAustralia id yet; `entered_house` is a placeholder 2026-01-01.

Known dirt left alone: `entered_house` holds birth dates for a few dozen historic rows
(Sussan Ley 1926, Malcolm Turnbull 1946…); fix from the first speech date when it matters.

## What the portal shows

`parliamentarians.json` now carries `current: true` and `party_now` (canonical) for the 313
name entries that resolve to a sitting member. The person page leads with `party_now` and
adds "formerly <speech-dominant party>" when they differ (Joyce: One Nation · formerly
Nationals; Payman: Australia's Voice · formerly Labor). The directory rows use `party_now`
too. The "In parliament" mentions on donor/party pages link the speaker and the party chip,
and fill a missing chip from the roster (speeches made from the chair or a ministry carry an
office string, not a party).

## Refresh

The offline state-party repair and its chamber-level coverage limits are documented in
[State member party gaps, 12 November 2026](reports/2026-11-12-state-party-gaps.md).
The weekly source-profile stage regenerates reviewed missing affiliations from
dated official state rosters. These observations do not add current flags or
party windows for historical speeches.

The APH member-list refresh is paused pending permission (10 Oct 2026).
Do not re-run the historical Firecrawl fetches. Once honest direct access is
authorised, re-fetch and re-run the diff (`/tmp/aph_diff.json` on desktop was the
session's dry run), apply, then `export_parliamentarians.py` on desktop and copy the JSON in.
Do it after every by-election, casual vacancy or defection; quarterly otherwise.

## Re-verification of 2026-11-16

The 226 sitting federal people were checked again, by OpenAustralia person id, against
OpenAustralia's public member files (last modified 11 September 2026; Parliament's site was
not fetched). Nobody is missing on either side and no seat, chamber or state differs. One
roster row (Chris Gatenby) records no Senate seat, and a group for the accept list is
proposed. The report is [roster-reverify-2026-11-16.md](roster-reverify-2026-11-16.md);
`scripts/roster_reverify.py` re-runs the comparison from cached files and
`scripts/roster_verification.json` logs each check. The seat roster's own date stays
4 September 2026.

## State party corrections (2026-10-03)

Annabelle Cleeland is the Victorian member for Euroa, [The Nationals](https://www.parliament.vic.gov.au/members/annabelle-cleeland/).
She is outside the APH federal sweep above. Her `vic_annabelle_cleeland` member row
incorrectly carries `party = ALP`; her Victorian Hansard speeches have no party,
so the directory exporter inherited Labor from the member fallback. Older
federal `Mr Cleeland` speeches were also mislinked to that state ID. The federal
surname lookup now accepts only federal chambers; state matching stays scoped
to its jurisdiction.

The same audit found `sa_harvey` (Richard Manuel Harvey), wrongly carrying ALP
and linked to federal speeches by other people, including older `Mrs Harvey`
speeches and recent committee turns. In the 28 September snapshot, 179 federal
rows dated since 1993 remain linked to that state ID, mostly recent committee
rows. They extend the `Harvey` directory entry to 2026 and add `senate_committee`
to its chambers. The [South Australian
parliamentary record](https://hansardsearch.parliament.sa.gov.au/daily/uh/2018-05-16/35)
identifies Richard Harvey as a Liberal member for Newland. His directory entry
is the surname-only `Harvey`. Yasmin Catley's row has the same historical
cross-link, but its Labor party is correct. Genuine federal/state careers such
as Mark Latham's do not imply a party error.

`scripts/export_parliamentarians.py` applies two sourced member-party repairs
before the fallback. Each requires the exact ID, name, jurisdiction, chamber
and known incorrect Labor label; a different future party is preserved. The
read-only export therefore survives a refresh from the existing DB snapshot.
Speech party histories, dates, counts and representation are retained. The
underlying stored cross-links are not repaired by this export. The linker fills
unlinked speeches; changing its lookup does not clear existing wrong IDs.

Follow-up, not performed by this fix: audit and apply a one-off relink of the
existing mislinked federal rows, including `sa_harvey`, `nsw_david_shoebridge`,
`nsw_mehreen_faruqi` and other affected state IDs. Recent federal speeches by
current federal members still carry their former state IDs. Relink actual
members to their federal identities while keeping committee witnesses separate,
then re-export the directory with its normal representation enrichment.

## First speech and first division in the record (2026-11-15)

`portal/public/people/firsts.json` is a side file to the roster, written by
`scripts/export_people_firsts.py` (read-only on `parli.db`; it reads the
shipped roster and never rewrites it). For each roster person it holds the
date and document of the first speech the corpus holds for them, and the date
and source address of the first division in which they are recorded voting aye
or no. The script's docstring is the contract: what counts, how a speech or a
division is matched to one roster row, and when nothing is published (a name
two rows answer to, a scoped namesake, a division with no source address).

"First" is a claim, so the export makes it only when the record can carry it.
Each fact names its chamber, and `meta.coverage` gives the date the record of
speeches and of divisions starts for each chamber. It is read from the
database, never a constant, with a density floor: the first date held in the
first calendar year with at least `meta.coverage_min_days` distinct days of
rows, so one stray early row cannot move it. A chamber with no such year has
no start. `meta.coverage_earliest_row` gives the bare earliest date beside it,
and the export prints both per chamber for review.

A fact is marked `"first": true` only for a person with a roster id that
exactly one Parliamentary Handbook person (`ext_handbook_people`) is matched
to, where the Handbook lists them in that one chamber only, their service
history starts on or after that chamber's coverage start, and the fact falls
no more than `meta.first_window_days` after it. The Handbook's service start
is the first-ever entry to the federal parliament. The members table is not
used: it holds one row per person with the latest membership's chamber and
dates, so a member who returned or changed chamber would look newly arrived
(it is read only to withhold a first when it dates the entry earlier than the
Handbook does). The Handbook table holds recent parliaments only, so earlier
members and every state member are never marked.

Readers label a marked fact "First speech" or "First division". Every other
fact is the earliest the record holds: readers say "Earliest speech in the
OPAX record (from 1998)", with the year from `meta.coverage`, or leave it out
when the chamber has no start, and never call it a first. Nothing ranks or
compares people.

A roster row with a `pid` is under `by_pid`; a row without one is under
`by_name` by its exact roster name. Fields are only ever added.
`portal/test/people-firsts.test.mjs` holds the shape the apps decode, on a
sample built from a synthetic database (`scripts/test_export_people_firsts.py`).

The `firsts` data group owns the file (`scripts/vm/data_groups.sh`), validated
right after `people` by `validate_data.py firsts`: the shape, people that are
in the roster on disk, no fewer people than HEAD's by more than a tenth, and no
fact marked first without an entry date inside its chamber's record. The
weekly refresh writes it in step `x_firsts`, after `x_people`, and logs the
coverage the export printed. The speeches are scanned and deduped once a
night: the roster export's own pass also writes each speaker's earliest
speech (`export_parliamentarians.py --speech-facts`), and `x_firsts` reads
that file instead of the table; with no facts the step is skipped and the
shipped file kept. An export holds at least 500 people, so a broken first
export fails validation instead of publishing an empty file. The nightly publishes only paths HEAD already
has, so the committed file starts as an empty seed (no people, and a note
saying so); the first gated weekly run replaces it. It is never exported by
hand.
