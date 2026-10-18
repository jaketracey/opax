# Roster accept review, 18 October 2026

Input: the raw box export of 18 Oct (`OPAX_ROSTER_ACCEPT=1 bash scripts/vm/export_people.sh`, 1,621 people,
sha256 `47b1a33b…`), against the shipped `portal/public/parliamentarians.json` (meta.generated 2026-10-04, 1,600
people). The overlay reported 627 differing records, 23 new rows (1 sitting) and 1 dropped row. The decisions are in
`scripts/roster_accept.json`; the mechanism is `scripts/roster_accept.py` (read its docstring).

Sources: the Parliamentary Handbook API (`handbookapi.aph.gov.au`, `individuals` and `recordsofservice`, fetched
18 Oct, sequentially, OPAXBot user agent) joined to OPAX pids through OpenAustralia's `people.csv` APH ids; the
repo's own dated rosters (`scripts/roster_state_evidence.json`) and record evidence. No QLD, SA or www.aph.gov.au
page was fetched.

## Result

| | Records | |
|---|---:|---|
| Fully accepted | 566 | |
| Partly accepted (corpus in, identity held) | 18 | |
| Held entirely | 43 | |
| New rows accepted | 18 | 17 former senators (Senate 2019-2022 backfill) and Vanessa Bleyer |
| New rows held | 5 | 4 NSW surname-only stubs, 1 parser fragment ("The") |
| Dropped row kept | 1 | Paul Calvert |

Accepted groups by evidence: Hansard growth 440, witness partition 129, presiding officer 4, reorder 1 (corpus,
574 records); Handbook 3, repo state rosters 8, record evidence 1 (identity, 12 records).

- **Hansard growth.** Counts only rise. First years move no earlier than 2019, which is the federal missing-day
  backfill (`docs/reports/2026-10-13-federal-hansard-backfill.md`). Last years only move later. Only committee
  chambers are added. Per-turn attribution (`docs/operations/2026-10-12-speaker-attribution-repair.md`) explains the
  large rises.
- **Witness partition.** The production SQL split of a majority-witness print (`docs/ROSTER-WITNESS-SPLIT.md`):
  - The testimony moves to `separated_witnesses`, and `transcript` keeps the aggregate, which is conserved or rises.
  - No identity field moves; all 129 rows were already neutral.
- **Presiding officers.** Chair turns are no longer personal speeches:
  - Milton Dick (Speaker from 2022-07-26)
  - John Hogg (President 2008–14)
  - Alan Ferguson (President 2007–08)
  - Sue Lines (President from 2022-07-26)

  The dates come from Handbook `recordsofservice` type 8.
- **Identity.**
  - From the Handbook:
    - Barnaby Joyce and Russell Broadbent gain their `parties` list.
    - Ben Small gains `senate` (senator for WA from 2020-11-25, then Member).
  - From the repo's dated rosters: the seat basis wording for Staley, Burgess, Northe, Fentiman, Enoch, Furner,
    Weir and Basham.
  - From the record's own `identity_evidence`: Latham's Werriwa basis.
- **New rows.** Each one matches the Handbook by pid → APH id, with name, Senate, state and service dates.
  - Bleyer: chosen by the Parliament of Tasmania on 20 Aug 2026 vice Whish-Wilson, in the current Parliament.

## Held, by reason (61 records)

| Reason | Records |
|---|---:|
| Pinned QLD witness split: the export publishes a number and drops the pending basis | 16 |
| The export drops a curated value: `full` 13, `party` 7, `recorded_parties` 13, Hanson's `parties` 1 | 34 |
| `party` flips to the speech-dominant label after the backfill; the Handbook's current party is the shipped one (Littleproud, Tyrrell, Cox, McDonald, Rennick) | 5 |
| A party added to a surname stub or a neutral committee namesake (Lee, Watts) | 2 |
| Rattenbury: the export drops the Kurrajong seat and adds a name and party; the ACT current list of 6 Oct lacks him | 1 |
| Hockey: the export undoes the reviewed Joe Hockey alias and pid | 1 |
| Chris Minns: gains `nsw_lc`, a house he never sat in | 1 |
| David Van: a new fold of "Van" (refused on main, party differs); his counts carry the print whose row is kept | 1 |

The held parts of a partly accepted record keep the shipped value (for example the 13 `recorded_parties` on
partitioned prints, the five flipped parties beside their accepted counts).

**Paul Calvert** (dropped) was President of the Senate from 2002-08-19 to 2007-08-14 (Handbook). His 2006–07 turns
are chair turns since the attribution repair, so his own count falls below the floor of five. This is not an export
bug; the row is kept as shipped.

## Checks

- **Current members.** None of the 249 current records loses a party, a row, a pid or the current flag (250 after,
  with Bleyer).
- **Addresses.** No slug or name-fold holder moves; 18 slugs are added.
- **Sponsor census** (`portal/test/fixtures/sponsor-link-counts.json`): 55 bills now link to accepted former
  senators by pid with an agreeing name; 7 still lack a profile.
- **Grants research.** `tests/test_grants_research.py` records +18 roster profiles. The roster KB plan is 18
  creates and 9 replacements (the basis wording), dry-run unless `OPAX_ROSTER_SYNC_KB=1`.
- Left for the box: the KB roster-profile sync and `speakers.json`. The search manifest and `party-members.json`
  are build-only.
