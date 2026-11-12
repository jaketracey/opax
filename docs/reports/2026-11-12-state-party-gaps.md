# State member party gaps, 12 November 2026

Chris Rath keeps his sourced Liberal affiliation. Profiles with speeches predating the reviewed NSW Council term are held back until dated party history is available. Victorian profiles again use the dated seat-roster affiliation. No parliamentary source was refetched and no production data changed.

## Cause and reviewed correction

The NSW loader writes an empty speech party because its Hansard fragments omit it. Rath's cached member stub and both cached Wikidata term observations also omit party. All 276 speeches on `nsw_chris_rath` have an empty raw party and no canonical party. The directory has 275 eligible speeches after existing corpus rules. The repo's official NSW Council list of 25 September 2026 names Rath as Liberal.

The native reader's `sponsors.ts` uses `recorded ?? profile.party`; the web also falls back to the profile party. The earlier change therefore supplied today's undated party to earlier speeches. Testing only the separate `datedAffiliationParty` helper did not cover that fallback.

The correction takes the conservative hold-back option. `scripts/roster_service.json` records the Council term boundary of 25 March 2023, using its existing parliamentary election-analysis source. `roster_state_parties.py` requires speech coverage to begin in a later calendar year. Coverage beginning during the election year is held because year precision cannot distinguish speeches before and after the election. A reviewed first-term exception preserves Rath: both cached `ext_state_roster` rows for Wikidata Q111482817 record entry on 24 March 2022, fetched 21 September 2026. His party is sourced separately to the official Council list. These observations do not supply party histories for other members.

Eleven reviewed Council fills remain. Tania Mihailuk, Jeremy Buckingham, Rod Roberts and Taylor Martin have no undated party from this repair, so empty speech parties cannot fall back to their later affiliation. Their earlier Labor, Greens, One Nation and Liberal periods require sourced dated history before publication. This deliberately leaves more party gaps than the rejected implementation.

All Victorian snapshot-party writes are removed. The existing verified seat catalog still supplies the affiliation with its date and source. Moira Deeming consequently reads `Independent (parliamentary roster as at 9 Sep 2026)`. That dated observation is retained without claiming to describe a later official profile.

The weekly source-profile stage and the per-record accept list remain the installation path. Each retained group rechecks the term guard, exact source name or explicit alias, chamber, party, date and source URL. Weak names, witnesses, ambiguous joins and existing curated histories remain protected. Removed groups do not regenerate. The public directory was rebuilt from the prior reviewed roster through `roster_source_profiles.py` and `roster_overlay.py`, rather than editing generated person rows individually.

New writes pass through the shared `parli.ingest.speech_hygiene.clean_party` canonical labels. Its alias table now also covers Legalise Cannabis/Victoria, Libertarian/Libertarian Party and both Shooters, Fishers and Farmers spellings; its existing One Nation aliases cover Pauline Hanson's spelling. John Ruddick is written as Libertarian Party. Tests cover every requested pair.

## Counts per chamber

These counts use unique members in the latest official 2026 list already held for each chamber. They measure the directory plus the existing seat-catalog fallback. They describe the source dates, not a verified census on 12 November. An unavailable source means unknown, never zero.

| Chamber | Source date | Members | No party before initial repair | Rejected repair | Corrected |
| --- | --- | ---: | ---: | ---: | ---: |
| ACT Legislative Assembly | 2026-10-06 | 25 | 7 | 7 | 7 |
| NSW Legislative Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| NSW Legislative Council | 2026-09-25 | 41 | 39 | 1 | 28 |
| NT Legislative Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Queensland Legislative Assembly | 2026-06-02 | 93 | 27 | 27 | 27 |
| SA House of Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| SA Legislative Council | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Tasmania House of Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Tasmania Legislative Council | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Victoria Legislative Assembly | 2026-09-09 | 88 | 0 | 0 | 0 |
| Victoria Legislative Council | 2026-09-09 | 40 | 0 | 0 | 0 |
| WA Legislative Assembly | Unavailable | Unknown | Unknown | Unknown | Unknown |
| WA Legislative Council | Unavailable | Unknown | Unknown | Unknown | Unknown |
| Measured chambers | Various | 287 | 73 | 35 | 62 |

Directory-only gaps, before the seat fallback, are ACT 7 → 7, NSW Council 39 → 28, Queensland 27 → 27, Victorian Assembly 67 → 67 and Victorian Council 40 → 40. Safely unmatched directory profiles remain ACT 7, NSW Council 0, Queensland 27, Victorian Assembly 1 and Victorian Council 0. The unmatched Victorian member still has a party in the seat catalog.

Count reconciliation: the rejected repair removed 38 NSW party gaps and affected 123 Victorian chamber entries. Counting actual per-record writes in commit `e389477d9` gives 39 NSW Council profiles and 122 Victorian profiles (82 Assembly and 40 Council). Penny Sharpe already resolved through the separate Sharpe row, explaining 39 writes but 38 fewer NSW gaps. Jaclyn Symes has both Victorian chambers, explaining 122 profiles but 123 chamber entries. Counts must distinguish these units. Classifying a profile by its first chamber also misclassifies members who moved between houses. All 122 Victorian profile writes and 28 NSW profile writes have now been withdrawn; 11 NSW fills remain.

Ben Franklin's speech coverage ends in 2022, outside the snapshot. The other NSW gaps include the deliberately held earlier careers. ACT and Queensland gaps include guarded surname aggregates and unresolved full-name joins. No qualifying current 2026 list is held for the eight unavailable chambers. Older rosters, empty tables and open-ended Wikidata terms cannot establish current membership under the offline source constraint.

Reproduce counts with `python3 scripts/roster_state_parties.py --audit <roster.json>`. The initial baseline is `1bdb0a8c4`; the rejected repair is `e389477d9`; corrected counts use this tree. All versions retain 1,619 people and 669,898 attributed speeches.

## Name resolution and callers

An exact normalised full printed name now takes priority over an alias on another row. Sophie Panopoulos therefore resolves to her own 147-speech row for Ask's person-quotes filter and `find_people`, despite also being an alias of Sophie Mirabella. Fuzzy alternatives remain visible. Distinct exact owners and shared aliases remain ambiguous.

`git grep 'rosterPerson(' portal/src` finds one production caller, `research-loop.ts`'s person-quotes tool. An ambiguous surname such as Bishop now returns null instead of guessing Julie Bishop by speech count. The caller returns its existing instruction to try `find_people`; that tool supplies candidates and a clarification question. No caller requires the old surname guess. Exact full names, explicit legal/preferred aliases, same-ID spellings and surname ambiguity have regression tests.

## Validation

Main `023fc9b51` was merged, without rebasing, in `beb605e1d`. On the merged tree, `npx wrangler types`, `npm run build:release` and `npx tsc --noEmit` pass. The release build includes `build:search` and the photo identity preflight. Unrelated generated changes to events, the grants-map licence, supplier tie ordering and voice assets were restored, and asset stamps checked again. The search catalog contains 1,619 people.

The full portal suite passes 4,744 tests with zero failures using `uv run --project .. npm test -- --test-concurrency=1` from `portal/`. The default and eight-worker runs each hit the directory harness's existing 15-second child deadline under shared-host contention and were stopped. That suite also passes separately: nine tests, including the timed-out case. No harness deadline or assertion was changed.

The roster Python run passes 179 tests and 964 subtests:

```sh
uv run --with pytest pytest -q \
  scripts/test_roster_state_parties.py scripts/test_roster_source_profiles.py \
  scripts/test_roster_overlay.py scripts/test_roster_main_preservation.py \
  scripts/test_enrich_profile_jurisdictions.py scripts/test_roster_identity.py \
  scripts/test_export_parliamentarians.py tests/test_grants_research.py \
  tests/test_roster_profile_reconciliation.py parli/tests/test_speech_hygiene.py
```

The focused portal run passes 73 tests. Tests cover the four real NSW party-changing profiles and Rath through the actual flat-party fallback, the term-year boundary, all retained source groups, the dated Deeming profile, canonical party labels and both Ask resolver consumers. `roster_accept.py --check` reports 880 applied groups, 19 reviewed new rows and zero problems. All pre-existing accept groups, new people and drops are preserved; comparison with `1bdb0a8c4` finds only the 11 approved party/representation changes.

`nice -n 10 uv run --with pytest pytest -q scripts/test_roster_export_wrappers.py` passes separately: four tests and five subtests in 570.12 seconds. Both scenarios exercise the actual weekly preservation path and raw review export. The first concurrent attempt exceeded the existing 300-second deadline on scenario A's raw export; the isolated run passes with that deadline and all assertions unchanged.

No source refresh, production write, deploy, push or device run was performed. The orchestrator retains the native device check and any remote publication.
