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
