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

Re-run the three Firecrawl fetches, re-run the diff (`/tmp/aph_diff.json` on desktop was the
session's dry run), apply, then `export_parliamentarians.py` on desktop and copy the JSON in.
Do it after every by-election, casual vacancy or defection; quarterly otherwise.

## State party corrections (2026-10-03)

Annabelle Cleeland is the Victorian member for Euroa, [The Nationals](https://www.parliament.vic.gov.au/members/annabelle-cleeland/).
She is outside the APH federal sweep above. Her `vic_annabelle_cleeland` member row
incorrectly carries `party = ALP`; her Victorian Hansard speeches have no party,
so the directory exporter inherited Labor from the member fallback. Historic
federal `Mr Cleeland` speeches were also linked to that state ID. The federal
surname lookup now accepts only federal chambers; state matching stays scoped
to its jurisdiction.

The same audit found `sa_harvey` (Richard Manuel Harvey), wrongly carrying ALP
and linked to historic federal `Mrs Harvey` speeches. The [South Australian
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
underlying stored cross-links are not repaired by this export.
