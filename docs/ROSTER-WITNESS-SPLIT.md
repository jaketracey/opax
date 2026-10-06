# Roster witness split — review fixes, round 2

Baseline: refreshed `origin/main` (`8e1977cfe8681e09536ac8573fadf0c825654416`).
Previous branch commit: `c4106f4e` (initial split: `4a60eab4`). The desktop database remains unreachable.
No deployment, production write or reconciliation apply was performed.

## Nightly identity and count gate

The 16 reviewed identities remain pinned, restricted to Queensland's Assembly.
`scripts/roster_witness_service.json` records bounded attribution coverage;
its dates describe the reviewed corpus coverage, not first election dates or
current tenure. The 57th Parliamentary Record establishes the historical
identities; the 2026 photosheet establishes the newer identities and service
year. The [official dissolution and election dates](https://www.parliament.qld.gov.au/Global/FAQs/Frequently-Asked-Questions-during-an-election-period/Dates-of-the-Writ)
exclude the dissolution gap and pre-election turns of the new intake.
Historical MPs' coverage ends on 30 September 2024. New members' coverage starts
on 26 October 2024. Continuing members' coverage is limited to the reviewed
2024–2026 service years. Future years require reviewed evidence.

The production SQL exporter retains date, jurisdiction, chamber and speaker-type
counts until identity resolution. A majority-witness print can acquire an MP
identity only when its own-house, in-service non-witness count reaches **five**.
Committee turns, witnesses, chairs, unknown speakers and out-of-coverage house
turns cannot contribute. Committee namesakes cannot establish or contradict the
restricted Assembly identity. Other actual houses still block this restoration.
The separate witness aggregate has no MP name, ID, party or representation.

Unresolved majority-witness prints remain neutral, including Brooks, Kerr,
Clark, Anderson and Bishop. The export refuses a named split without an own-house
scope and service limits, including with `OPAX_ROSTER_ACCEPT=1`. The unchanged
25-identity safety cap and sitting-ID protection still apply. Non-majority
records keep the established aggregate contract and identity resolver; their
witness markers continue to prevent per-row MP attribution.

The same house and date scope is sent to retrieval and checked again on returned
search results, answers, resources and browser speech rows. Missing dates fail
closed for a dated scope.

## Dated party and displayed counts

Sullivan's party is **Independent**, with Labor preserved as a historical party.
The [Parliamentary Library's dated record](https://www.aph.gov.au/About_Parliament/Parliamentary_departments/Parliamentary_Library/Research/FlagPost/2025/September/GendercompositionofAustralianparliamentsbyparty)
places the switch on 12 May 2025. SQL uses the party at the latest eligible own
speech, rather than the dominant historical party or a 2024 roster snapshot.
His coverage ends on 9 April 2026, supported by the
[official vacancy notice](https://www.parliament.qld.gov.au/Work-of-the-Assembly/Tabled-Papers/docs/5826t0542/5826t542.pdf).

All 16 pinned `speeches` keys are **omitted**, with a pending count basis. The
existing iOS decoder accepts an absent count but rejects JSON null; the full
export is checked against its roster field list to prevent that regression.
The real `ios/app` decoder also accepts all 1,700 records, including the 16
missing counts; reintroducing a null count is rejected. The
old totals and scopes remain under `transcript` for provenance. Neither 178
nor 120 is presented as Scott Stewart's or Les Walker's own speech count.
The directory, search description and search catalog say **Count pending exact
export**. Share cards omit the numeric statistic. A SQL refresh publishes only
an exact own-house, in-service count. Pending counts do not remove the MP from
party membership lists.

The attribution helper import is non-fatal: rejected loading still runs the
slug loader, Ask builder and router. Existing attribution fallbacks fail closed.

## Replay results

The reviewer harness was available. Its A/B population logic is now checked in
as `ShippedIdentityReplayTests.populate_replay`, exercised through the production
SQL and `scripts/vm/export_step.sh` / `export_people.sh`, without an override.
It deliberately alternates each aggregate's first/last years.

| Fixture | Result | Scoped identities | Identity differences / cap |
|---|---|---:|---:|
| Reviewer A: committee witnesses | Ships, no hold | 14 of 16 | 5 / 25 |
| Reviewer B: witnesses plus committee MP turns | Ships, no hold | 14 of 16 | 5 / 25 |
| Detailed 16-case own-service shape plus controls | Ships, no hold | All 16 | Within cap |

The only omitted split identities in A/B are:

- **Robinson:** three eligible house rows in A and two in B; the other
  compressed turns are post-service or committee turns, below the five-row floor.
- **Crawford:** three eligible house rows in both A and B; the other compressed
  turns are post-service, below the five-row floor.

Both remain neutral; invalid rows do not rescue the threshold. Their detailed
fixture supplies eight and five eligible own rows, respectively, and restores
both. That detailed fixture separates committee witnesses from non-witness
committee MPs, including Jana Stewart and Charlotte Walker, and adds same-house
rows outside coverage. It yields **627 exact eligible own rows across 16 MPs**;
Scott Stewart has 30 and Les Walker 28. These are synthetic SQL fixtures shaped
from the reviewed public aggregates and sampled scopes, not a desktop snapshot.
All witness counts are preserved separately. Threshold tests independently check
four own rows plus many committee or post-service rows cannot name an MP.

The other three A/B identity differences are the established synthetic stub
coalescences: Blandthorn, D'Ambrosio and McDermott. No additional split is named.
There are **zero named unscoped splits** and **zero wrong attributions observed**
in the fixtures. An exhaustive replay of the unavailable desktop DB is not claimed.

```sh
python3 -m unittest scripts.test_roster_export_wrappers.ShippedIdentityReplayTests
python3 -m unittest scripts.test_roster_witness_split
```

## Categorised diff against main

[ROSTER-WITNESS-SPLIT-DIFF.md](ROSTER-WITNESS-SPLIT-DIFF.md) compares every field of
all 1,700 records. There are **16 witness splits**, **1,684 exactly unchanged**,
and zero mix-up, witness-dominated, multi-parliament, alias or clean-record changes.
QLD party rows remain **81 → 97**; total party rows **1,058 → 1,074**. Party facets
are QLD Labor **37 → 44**, LNP **38 → 47**, Independent **1 → 2**. Historical Labor
on Sullivan still counts in the Labor facet; his leading party is Independent.
SA's 74 party rows are unchanged. **1,607 witness rows** remain separate and
unattributed. All 16 own counts await an exact SQL refresh.

## KB reconciliation dry-run

The same captured public inventory (983 indexed profiles) was replayed offline.
Against main, desired profiles remain **961 → 977**, replace **52 → 54**, retire
**27 → 25**, create **5 → 19**. Against `4a60eab4`, operation counts are unchanged;
**16 desired operation payloads change** to carry service limits, including
Sullivan's corrected party. Unrelated operations are unchanged. The apply cap
remains 30; retirements plus replacements remain 79. **Nothing was applied.**

This is a captured public projection with one value per labelset; a fresh native
inventory can produce a different plan. Plans and QA logs are ignored.

## Validation

- Python: 123 roster/export/identity, 12 reconciliation, 19 discovery, four
  research and 96 committee/ingestion/evidence tests: **254 passed**.
- Node 24.21.0: `npm run build:search`, then `npm test`: **872 passed**.
- `npm run check` and strict photo identity audit: passed.
- Reviewer A/B replay and categorised diff: passed.
- Local `wrangler dev --local`: five restored MP pages checked; pending own
  counts and scoped identities verified. No KB credentials were supplied.
- Search build output is excluded from the commit.

## P3 follow-ups

[ROSTER-P3.md](ROSTER-P3.md) records the full-name retrieval fixes, canonical
Pugh route, wording changes, shared method, clean-page party audit, gates and
before/after speech retrieval counts. The changes are local and committed;
no deployment or production write was performed.
