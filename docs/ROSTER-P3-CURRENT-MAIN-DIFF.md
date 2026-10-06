# Roster P3 review follow-up: current-main comparison

Baseline: current live main `44b44b2f790e9bf18c028afa90a986ca69b6d738`, compared on 6 October 2026. This follow-up changes `f7ceb838` without deployment or production writes.

## Clean profiles

The person-page party statement is identical to main: `partyNow || roster?.party || spokeAs`. All 1,700 roster people are deeply equal to main. Each of the 1,684 clean records remains outside the split alias and service-scope paths.

| Comparison | Checked | Changes from current main |
|---|---:|---:|
| Roster people, every field | 1,700 | 0 |
| Clean-record identity | 1,684 | 0 |
| Clean-profile party across five retrieved-party states | 8,420 | 0 |
| Clean-profile parties using captured production speech samples | 729 | 0 |
| Pages flagged by the review's older-rule comparison | 279 | 0 |

The 277 pages with no retrieved party retain their curated roster chips. Ken O'Dowd remains Nationals and Latham remains Independent. The [full list of 279 pages](ROSTER-P3.md#clean-page-party-audit) is preserved in the original audit. The categorised Python record comparison also reports zero changes in every category, including clean records. The [original categorised diff](ROSTER-P3-DIFF.md) covers the complete branch's roster comparison.

## Intentional mention-row correction

Both subject and party mentions lists preserve existing row labels. Missing labels use only unambiguous dated affiliations matching the speech's jurisdiction and chamber, with inclusive start/end dates and any split service bounds. Missing dates, invalid dates, conflicting affiliations, other houses and unattributed evidence receive no inferred party. Neither current `party` nor `party_now` supplies a missing historical label.

This deliberately changes missing-party metadata in mentions lists, including on clean pages with historical affiliations; clean identities and profile-party chips are unchanged. Sullivan currently has no dated affiliation in the published roster, so an unlabelled February 2024 speech has no chip. An explicit Labor label remains Labor. Tests cover both actual renderers, actual Latham affiliation periods, Sullivan's missing affiliation, party-switch boundaries, service bounds and ambiguous evidence.

## Gates

- Node 24.21.0: `npm run build:search` then `npm test`, 881 passed, zero failed or skipped.
- `npm run check`: passed, including types, asset stamps and privacy checks.
- Python discovery under `tests/` and `scripts/`: 354 + 208 = 562 passed.
- Current-main party replay and categorised record comparison: passed with zero clean-profile changes.
- Generated search catalog output excluded from the commit; no production writes or deploys.
