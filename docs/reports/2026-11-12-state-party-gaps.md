# State member party gaps, 12 November 2026

Chris Rath's checked-in public profile now records Liberal, sourced to the NSW Legislative Council member list dated 25 September 2026 already held in `scripts/roster_state_evidence.json`. No parliamentary source was refetched or production data changed.

## Cause and display path

The cached NSW loader explicitly writes an empty speech party because the fragments do not supply it (`parli/ingest/nsw_hansard.py`). Rath's cached member stub also has an empty party; the two cached Wikidata term rows do not supply one either. All 276 speeches on `nsw_chris_rath` have an empty raw party and no canonical party. The directory has 275 eligible speeches after its existing corpus rules. Its profile previously had no party, person ID or representation.

The independently reviewed NSW Council list already names Rath as Liberal. That list was available to identity repair, but full-name profiles with no party were not generally enriched from it. The electorate release has current Victorian rosters, but no NSW roster, so a seat-catalog fallback cannot supply Rath's affiliation.

Read-only inspection of the available `origin/ios/app` code confirms the reader uses `DocumentReader`'s `Speaker`, `sponsorRows`, then `personPartyFor`: an explicit speech label takes precedence, otherwise the joined profile's recorded party can be shown. Both inputs were empty for Rath. This is a data omission, rather than a party-window rejection by that reader. This inspection does not establish the exact TestFlight build's source revision. No mobile files or other worktrees were changed.

The portal's separate `datedAffiliationParty` helper deliberately requires dated service covering a speech. A roster snapshot does not meet that rule. That guard remains in place: the new directory affiliation is not a claim about the party on every historical speech date.

## Change

`scripts/roster_state_parties.py` reads the active, digest-checked electorate reference and existing reviewed state extracts. It fills a missing directory party only for an exact full name or explicit source alias, in its own state and chamber, where the snapshot overlaps the profile's recorded years. It refuses initials, surname prints, mixed parliaments, witnesses, ambiguous identities or parties, and existing party histories. A member's recorded move between the two houses of one state is allowed.

There are 161 reviewed per-record additions through `scripts/roster_accept.json`. The additions affect 39 NSW Council profiles and 122 Victorian name entries. Only `party` and, where needed, dated `representation` change. Speech counts, speech labels, person IDs, current flags and party service windows are preserved. The 39 new representation entries carry the observation date and public source URL. A previously protected Victorian record remains held; its party already resolves from the electorate catalog.

The existing weekly source-profile stage regenerates these observations. The accept gate rechecks each source value, URL and date before installation. Its exception for an empty neutral profile applies only to this verified full-name rule. Other curated protections remain in force. A stale or changed source cannot overwrite the reviewed shipped value.

Dated service identity matching also reads explicit catalog aliases. This keeps a preferred name and its documented legal spelling together during repair, without adding fuzzy name matches. A legal middle name cannot become another member's given-name alias. Testimony after bounded parliamentary service remains unattributed; a reviewed ongoing career is preserved. The existing fixed research-export totals now include 36 additional sourced representation profiles; no research export was published.

## Counts and limits

Counts below are unique members named by the latest available 2026 official list for each chamber. They measure party availability through the directory and the app's existing seats-first catalog fallback. They are observations on the source date, not a verified national membership census on 12 November. A full-name profile which cannot be safely joined counts as a gap. Surname similarity never supplies a party.

| Chamber | Source date | Listed members | No resolved party before | After | No safely joined directory profile |
| --- | --- | ---: | ---: | ---: | ---: |
| ACT Legislative Assembly | 2026-10-06 | 25 | 7 | 7 | 7 |
| NSW Legislative Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| NSW Legislative Council | 2026-09-25 | 41 | 39 | 1 | 0 |
| NT Legislative Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Queensland Legislative Assembly | 2026-06-02 | 93 | 27 | 27 | 27 |
| SA House of Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| SA Legislative Council | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Tasmania House of Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Tasmania Legislative Council | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Victoria Legislative Assembly | 2026-09-09 | 88 | 0 | 0 | 1 |
| Victoria Legislative Council | 2026-09-09 | 40 | 0 | 0 | 0 |
| WA Legislative Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| WA Legislative Council | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Measured chambers | Various | 287 | 73 | 35 | 35 |

Victorian catalog parties already resolved, including one member with no safely joined directory row. Counting only missing directory party fields, before the catalog fallback, gives ACT 7 to 7; NSW Council 39 to 1; Queensland 27 to 27; Victorian Assembly 67 to 1; Victorian Council 40 to 0. Multiple printed name entries can refer to one source-listed member.

The remaining NSW Council gap is Ben Franklin: the directory's own-speech coverage ends in 2022, before the 2026 snapshot. This change does not invent an overlapping service window. The ACT and Queensland gaps include guarded surname aggregates and unresolved source-name joins, as well as absent profiles. These need identity evidence, rather than guessed parties. The safely unmatched Victorian directory member still has a party in the seat catalog.

No qualifying 2026 official current membership list is held by this pipeline for the eight chambers marked unavailable. Older SA records, undated NSW member-cache entries, empty coverage and Wikidata terms with no recorded end date cannot establish their current membership. A complete all-chamber census remains unavailable under the offline source constraint.

Reproduce the audit with `python3 scripts/roster_state_parties.py --audit <roster.json>`. The before roster is commit `1bdb0a8c4`; the after roster is this change. The JSON includes both directory-only gaps and catalog-assisted gaps, with unknown values represented as null. Names are omitted from audit output.

## Validation

From `portal/`, `npx tsc --noEmit` and `uv run --project .. npm test` pass: 4,726 tests, zero failures. `npm run check` also passes, including types, design tokens, asset stamps, donor index and statute title checks. There is no portal lint script.

The final Python pipeline run passes 140 tests and 958 subtests:

```sh
uv run --with pytest pytest -q \
  scripts/test_roster_state_parties.py scripts/test_roster_source_profiles.py \
  scripts/test_roster_overlay.py scripts/test_roster_main_preservation.py \
  scripts/test_enrich_profile_jurisdictions.py scripts/test_roster_identity.py \
  scripts/test_export_parliamentarians.py tests/test_grants_research.py \
  tests/test_roster_profile_reconciliation.py
```

The identity and frozen-roster suites also pass separately: 52 tests and 63 subtests. The frozen audit retains zero unexplained clean-record changes. Tests cover source movement, ambiguity, witnesses, chamber and date boundaries, preferred/legal names, and a legal middle name which belongs to someone else's given name.

`uv run --with pytest pytest -q scripts/test_roster_export_wrappers.py` passes: four tests and five subtests in 7 minutes 42 seconds. Both box-shaped database scenarios exercise normal weekly preservation and the raw review override. They retain all shipped records, keep unscoped witnesses neutral and preserve the reviewed preferred-name identity.

Public files were regenerated through `scripts/roster_source_profiles.py`, `scripts/roster_overlay.py`, `npm --prefix portal run build:search`, `npm --prefix portal run build:methods` and `npm --prefix portal run stamp`. The final data comparison confirms the same 1,619 people and 669,898 attributed speeches; only the reviewed party and representation fields change. Existing accepted groups, new-person entries and reviewed drops are preserved.

No source refresh, production write, deploy, push or device run was performed. Native display behaviour still needs the orchestrator's device check after integration.
