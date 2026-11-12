# Roster reference audit, 12 November 2026

Baseline: `456839511`. Inputs were the local read-only `parli.db` cache and committed public exports. No source was fetched, no database was changed, and no production action was taken. APH remains paused.

## How the catalogs are built

`scripts/vm/export_people.sh`, called by the weekly refresh, runs the read-only `export_parliamentarians.py`, representation enrichment, surname folding, attribution checks and `roster_overlay.py`. The directory normally requires five qualifying speeches since 13 March 1993. The overlay preserves shipped rows and installs only reviewed per-record changes in `scripts/roster_accept.json`. See [the accept review](../ROSTER-ACCEPT-2026-10-18.md), [photos and export safeguards](../PHOTOS.md) and the accept script's docstring.

The electorate builder's `Builder.legacy()` loads member identities; `Builder.history()` joins OpenAustralia service records through the pinned people register and links candidacies only to a uniquely named holder of the same seat. `export_bundle()` publishes an immutable release and updates its manifest. Commit `ffe6f2ae3` had already added Bill Shorten's and Bob Sercombe's preferred-name aliases and legacy IDs, and linked Bill's 2019/2022 candidacies. Those links were present in this lane's baseline and are retained.

## Counts

Each category counts distinct non-empty person IDs, across all available dates including pre-1993 speeches. The cached schema has no person-ID column for donation recipients or committee attendance. Committee speech IDs are included separately and overlap the speeches category. Votes include the cached federal/state tables and the published vote export. Candidacies and service records come from the active electorate reference. Interests include both cached register tables and the published index.

An exact-ID gap means the directory has no matching `pid`, translating a catalog's hashed person ID through its own legacy ID where present. A profile gap means neither that ID nor an explicit unambiguous source name reaches a directory identity. Name variants count distinct `(source ID, normalised name)` pairs whose known directory identity lacks that spelling. Multiple roster spellings with the same verified pid count as one identity. Surname guessing, fuzzy matching and portraits supply no identity evidence in this audit.

| Domain | Referenced IDs | Exact-ID gaps before → after | Profile gaps before → after | Name variants before → after |
|---|---:|---:|---:|---:|
| speeches | 2,348 | 1,755 → 1,755 | 1,185 → 1,185 | 567 → 546 |
| committees | 381 | 196 → 196 | 195 → 195 | 211 → 211 |
| divisions votes | 1,727 | 1,122 → 1,122 | 52 → 52 | 8 → 8 |
| interests | 303 | 77 → 77 | 21 → 21 | 9 → 8 |
| candidacies | 233 | 0 → 0 | 0 → 0 | 6 → 2 |
| donation recipients | 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| service records | 560 | 148 → 147 | 119 → 118 | 351 → 52 |

Across overlapping categories, distinct exact-ID gaps are **3,017 → 3,016** and unresolved name variants are **927 → 606**. These are reference gaps, not a count of missing parliamentarians. Historic IDs, alternate state namespaces, parser stubs, witnesses and conflicting attributions are included. Service people without an addressable directory profile are **119 → 118**; service people without a legacy ID are **124 → 123**. Directory rows are **1,618 → 1,619**. Published speech totals and every existing speech/party/seat/identity field are preserved.

There are **2,934 → 2,934** unlinked candidacies and **0 → 0** unlinked elected candidacies. Unelected candidates are not automatically parliamentarians. Existing same-seat service evidence does not support linking the remainder. Bill's `aec-24310-32388` and `aec-27966-36441` candidacies both retain his person ID.

Donation recipient names that exactly reach a directory profile increase **49 → 97**; unmatched recipient labels fall **3,019 → 2,971**. Unmatched labels include parties and unelected candidates, so they are not counted as missing people. The audit does not identify donors as parliamentarians.

## Reviewed changes

- Alan Griffiths gains a service-only profile, `pid` **10268**, legal-name alias Alan Gordon Griffiths, and Maribyrnong representation from **1983-03-05 to 1996-01-29**. The pinned OpenAustralia people row 268 (APH ID `0H4`) is already recorded in `tests/test_electorate_people.py`; service row 226 is in the committed electorate reference. The profile is marked `roster_only`, with zero attributed speeches as a storage sentinel. Directory/search copy and the person tool say that no speech total has been published. His existing catalog person ID is preserved while adding the verified legacy ID and preferred-name alias.
- `wragge_griffiths` is not linked to Alan. The cache contains pre-1993 turns under that ID and recent turns attributed to a different named speaker. Its mixed attribution cannot supply Alan's count, alias, portrait or dated identity.
- **283 existing directory rows** gain explicit source aliases through reviewed `catalog-aliases` groups. Each addition must agree on both verified legacy ID and source name; every name is checked against the active reference digest. Malformed bylines are excluded. Three curated alias records (Joe Hockey, Jenny Macklin and Bernie Ripoll) retain their existing protection.
- Alias addresses and person resolution use the approved names. Exact normalised full printed names take priority over another row's alias, preserving the indexed speech filter. Ambiguous surname lookups such as Bishop return no person instead of selecting by speech count; the sole production caller, Ask person-quotes, directs the caller to find_people for clarification. Distinct people with a shared alias remain ambiguous; speech counts choose only between spellings of the same verified ID. Address aliases do not become speech filters.

`scripts/roster_source_profiles.py` regenerates these source values before the weekly overlay. Its catalog publication mode reuses `export_bundle()`. `Builder.history()` re-applies the reviewed service identity on future builds and relinks, so an older members snapshot cannot remove Alan's ID. Source additions fail closed without changing the directory when the reference or accept data cannot be verified. The existing overlay remains responsible for installation.

## Reproduction and limits

Create local aggregate rows with `scripts/audit_roster_gaps.py --db <cached-db> --snapshot-dir <private-dir> --output <report.json>`. Reuse that snapshot with `--roster <baseline.json> --reference <baseline-reference.json>` for the before result, and the default committed inputs for the after result. Snapshots contain unpublished names and must stay out of Git. The audit report itself contains counts and identifiers only.

For a reviewed source change, run `roster_source_profiles.py --directory <review-export.json>`, then `roster_overlay.py --directory <review-export.json>` and `roster_accept.py --check`. `--publish-catalog --generated 2026-11-12` regenerates the immutable electorate release offline. Regenerate search, passage names, crawl paths, party membership, coverage and asset stamps with the repository's build scripts.

Remaining profile and name-reference gaps need source review. The cache alone cannot safely turn every weak name, alternate ID or conflicting attribution into an alias or a new person. Alan has no portrait in the repository or local photo cache; none was fetched or borrowed. No remote KB profile sync was performed. The emitted KB plan gains one roster profile and remains an orchestrator action.

## Validation

- `portal/`: `npx tsc --noEmit` passed after generating the local Wrangler types; `npm test` passed **4,725 tests**. The test command ran through `uv run --project ..` so Python subprocess fixtures used the repository dependencies. `npm run check` also passed (types, TypeScript, tokens, asset stamps, donor index and statute titles). There is no portal lint script.
- `roster_accept.py --check`: **869 applied groups**, **19 reviewed new rows**, **0 problems**. The before/after roster comparison confirms **283 aliases-only changes** and one new profile, with the existing speech total unchanged. The immutable electorate reference differs only in Alan's aliases and legacy ID.
- Regenerated the electorate release, search catalog, crawl/person paths, passage-name projection, party membership, coverage, gold electorate cases and asset stamps with repository scripts. The electorate gold refresh used `agentic_ask_gold.mjs --electorates-only`, with zero KB/model calls.
- Initial checks exposed missing local build/type/Python prerequisites and stale generated or fixed-count fixtures. These were corrected. A combined Python run passed **122 tests and 946 subtests** but one full-export replay hit its existing 120-second subprocess timeout; the export suite was rerun alone. Shared-host contention also exhausted that deadline in isolation, so the large frozen-roster replay now has a 300-second deadline per export. Its assertions and the short fixtures' 120-second deadlines are unchanged. The isolated export suite then passed **4 tests and 5 subtests** in 557.83 seconds, including both complete scenarios. Every required Python test is covered by these successful assertions.
The combined Python command was:

```sh
uv run --with pytest pytest -q \
  scripts/test_roster_source_profiles.py scripts/test_roster_overlay.py \
  scripts/test_roster_main_preservation.py scripts/test_roster_export_wrappers.py \
  scripts/test_roster_identity.py scripts/test_export_parliamentarians.py \
  tests/test_grants_research.py tests/test_electorate_people.py tests/test_electorates.py
```

No native/device run, production action, source acquisition or remote KB sync was performed.
