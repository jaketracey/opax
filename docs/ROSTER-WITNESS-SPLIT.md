# Roster witness split (P2)

The surname directory now identifies a proven Queensland Assembly MP only for
their own parliamentary rows. Witness testimony stays unattributed. This follows
the no-harm roster repair in [ROSTER-MIXUPS.md](ROSTER-MIXUPS.md).

Baseline: `origin/main`, `8e1977cfe8681e09536ac8573fadf0c825654416`, refreshed on
2026-10-06. Work is local on `web/roster-witness-split`; no deployment, KB apply,
desktop connection or production write was performed.

## Attribution contract

- The SQL exporter partitions rows marked by either `witness_name` or
  `speaker_type=witness` **before** counting MP IDs, parties, jurisdictions,
  chambers and speech years. The witness partition contains only transcript
  facts; no MP identity, party or seat.
- The repair resolves identity from the non-witness partition. An ambiguous
  surname or fewer than five own rows stays neutral. Explicit witness markers
  override even a reviewed same-person alias or a stale numeric MP ID.
- The nightly `scripts/vm/export_people.sh` runs the same exporter and repair.
  The existing 25-identity change cap remains. Its final check rejects MP fields
  on testimony even when `OPAX_ROSTER_ACCEPT=1` is set.
- The public Worker restricts restored speaker search, Ask retrieval and topic
  catalogs to `kind=speech`, `state=qld`, `chamber=qld_la`, excluding witness,
  chair and unknown turns. Search also rejects results outside this scope after
  retrieval. Prior Ask citations cannot bypass the new scope.
- Search results, answer sources and individual document APIs remove stale MP
  IDs and party fields from testimony and out-of-scope surname records. Their
  links open `?attribution=unattributed`; that view has no MP identity, seat,
  party, portrait or Person structured data. No MP portrait is shown beside
  such a document or source card.

Witness-only names retain the existing exclusion from the parliamentarian
directory; their evidence remains retrievable. Anderson and Bishop remain
neutral, as do unproven QLD cases Kelly and Morton and multi-state names such as
Brown, King and Smith.

## Offline roster and counts

The desktop database is unavailable. The public aggregate identifies witness
totals but does not give a count for each remaining chamber. Consequently the
checked-in restoration requires one actual house, Queensland Assembly, a unique
name supported by the dated parliamentary snapshots, and an enforced own-house
retrieval scope. Federal committees cannot establish the scoped QLD identity.
Multi-state and federal-house aggregates cannot use this shortcut.

`scripts/split_roster_witnesses.py` produces the pinned restoration. Original
counts, jurisdictions, chambers and years remain under `transcript`;
`separated_witnesses` preserves the witness count without attribution. The
remaining count is explicitly a **non-witness upper bound**, marked by
`speech_count_basis` and disclosed in the directory, search catalog and metadata.
The retained year range is labelled as transcript years, not an MP's service
dates or the dates of their own speeches.
It is not presented as a measured count of this MP's own house speeches.
The SQL export computes the exact witness/non-witness partition when it becomes
available. No sitting status or current tenure is inferred from these snapshots.

| Printed name | Parliamentary identity | Recorded party | Non-witness upper bound | Witness rows separated |
|---|---|---|---:|---:|
| Stewart | Scott Stewart | Labor | 178 | 203 |
| Pugh | Jess Pugh | Labor | 65 | 288 |
| Walker | Les Walker | Labor | 120 | 152 |
| Bennett | Stephen Bennett | LNP | 65 | 134 |
| Stevens | Ray Stevens | LNP | 76 | 88 |
| Kirkland | Donna Kirkland | LNP | 55 | 82 |
| Bourne | Wendy Bourne | Labor | 26 | 109 |
| Sullivan | Jimmy Sullivan | Labor | 60 | 74 |
| Field | Russell Field | LNP | 39 | 90 |
| Young | Rebecca Young | LNP | 46 | 61 |
| Hutton | Nigel Hutton | LNP | 41 | 58 |
| Dillon | Sean Dillon | LNP | 43 | 51 |
| Hart | Michael Hart | LNP | 24 | 38 |
| Robinson | Mark Robinson | LNP | 9 | 87 |
| Harper | Aaron Harper | Labor | 28 | 67 |
| Crawford | Craig Crawford | Labor | 6 | 25 |

The 13 review cases total **838** non-witness rows in the pinned aggregate. The
three further historical cases, Robinson, Harper and Crawford, add **43**. These
881 rows are upper bounds; the own-house API filter determines attribution for
each retrieved row. All 1,607 separated witness rows stay unattributed.

## No-harm diff

[ROSTER-WITNESS-SPLIT-DIFF.md](ROSTER-WITNESS-SPLIT-DIFF.md) compares every field
of all 1,700 roster records with refreshed main. The scoped resolver must exactly
reproduce every restoration; an edited or unproven split fails the audit.

| Exclusive category | Changed records |
|---|---:|
| Witness split | 16 |
| Mix-up corrected | 0 |
| Witness-dominated | 0 |
| Spans parliaments | 0 |
| Alias normalisation | 0 |
| Clean record changed | 0 |

**1,684 records are exactly unchanged.** QLD party rows increase **81 → 97**:
Labor **37 → 44**, LNP **38 → 47**. Total party rows increase **1,058 → 1,074**.
SA party rows stay **74**, including Labor 33 and Liberal 35. These are directory
rows, not counts of unique MPs or current seats. No wrong attribution is permitted
by the split guards or observed in the fixture and local checks; an exhaustive
replay of the unavailable desktop database is not claimed.

## KB reconciliation dry-run

The existing captured public inventory was replayed offline, with no credentials
or apply. It contains 983 indexed profiles; it is the same snapshot used for the
main plan, so the comparison isolates this change.

| Plan measure | Main | P2 | Change |
|---|---:|---:|---:|
| Desired profiles | 961 | 977 | +16 |
| Replace | 52 | 54 | +2 |
| Retire | 27 | 25 | −2 |
| Create | 5 | 19 | +14 |

Exactly 16 operations change, all belonging to the restored prints. Crawford and
Sullivan move from retire to replace; the other 14 gain create operations. The
previous five creates and all unrelated operations are unchanged. Restored KB
profiles include the own-house scope and explicitly separate testimony.

Retirements plus replacements remain **79**, above the unchanged apply cap of
30. **Nothing was applied.** The inventory is a captured public projection, with
one value per labelset; a fresh native inventory may produce a different plan.

```sh
python3 scripts/reconcile_roster_profiles.py --dry-run \
  --inventory /Users/jake/Projects/opax-ios-wt/roster-mixups/scripts/_photos_work/qa-roster-mixups/round2/roster-profile-plan.inventory.json \
  --output scripts/_photos_work/qa-roster-witness-split/roster-profile-plan.json
```

The plan, inventory and QA logs remain ignored and are not committed.

## Validation

- Python suites: **251 passed** across roster/export/identity (120), reconciliation
  (12), discovery (19), research (4), and committee/ingestion/evidence tests (96).
  Split coverage includes 11 tests, including refusal of unscoped or modified
  identity restorations and rejection of witness attribution with the override.
- Fixtures freeze the actual public records from `8e1977cf` for the 13 QLD
  review cases, three historical restorations and witness-heavy/ambiguous controls.
  Synthetic SQL rows use those observed counts and the production schema to
  exercise the real nightly wrapper; they are not a desktop row snapshot.
  The 13 QLD cases yield exactly 838 synthetic own rows, plus neutral one-row
  Anderson and Bishop residues. Witness type-only markers and contradictory
  member links cannot contribute MP identity or party.
- The legacy all-roster synthetic replay now exceeds the identity change cap
  after partitioning its artificial scopes. It is **held**, and the wrapper
  preserves the shipped file byte for byte; the cap was not raised.
- Node **24.21.0**, `npm ci`, `npm run build:search`, then `npm test`:
  **869 passed**, zero failed or skipped. Search build output is excluded from
  the commit.
- `npm run check`: passed. `node scripts/photo_identity.mjs --strict`: passed.
- Categorised diff: passed, 16 witness splits, zero clean changes.
- Local `wrangler dev --local` at `127.0.0.1:8791`: browser spot checks passed for
  Scott Stewart/Townsville/Labor, Les Walker/Mundingburra/Labor,
  Ray Stevens/Mermaid Beach/LNP, Jess Pugh/Mount Ommaney/Labor and
  Stephen Bennett/Burnett/LNP. Each displays the QLD Assembly scope and a
  separate testimony link. Bennett's link was opened and the neutral evidence
  view verified. Local development had no KB credentials, so speech retrieval
  is verified by fixtures rather than a live KB query.

```sh
python3 -m unittest scripts.test_roster_identity \
  scripts.test_enrich_profile_jurisdictions scripts.test_roster_main_preservation \
  scripts.test_roster_export_wrappers scripts.test_roster_witness_split scripts.test_export_grants
python3 -m unittest tests.test_roster_profile_reconciliation
python3 -m unittest discover -s tests -p 'test_discovery.py'
python3 -m unittest tests.test_grants_research
python3 -m pytest tests/test_committee_sync.py tests/test_committee_witnesses.py \
  tests/test_committee_transcript.py parli/tests/test_evidence_layers.py \
  parli/tests/test_text_patch.py parli/tests/test_words_sync.py -q
python3 scripts/audit_roster_changes.py --baseline origin/main \
  --output docs/ROSTER-WITNESS-SPLIT-DIFF.md
```
