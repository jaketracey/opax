# Roster provenance follow-up

R17 / BACKLOG 3z. Reviewed 14 November 2026 on `2ccd62bd1`, following the [period sweep](2026-11-14-roster-period-sweep.md). The complete [machine-readable findings](2026-11-14-roster-provenance-findings.json) retain every original interval and flagged member row, with exact corpus receipts or the remaining hold reason.

| Item | Before | After | How |
| --- | --- | --- | --- |
| Handbook fetch-date cutoffs | 81 current-person `service_end` values equal 2026-11-13 | All 81 have `service_end: null`, `observed_through: 2026-11-13` and an explicit observation classification | Reviewed the saved API response; changed the builder and committed metadata; added rebuild and committed-file guards |
| Intervals lacking a corpus match | 327 intervals | 48 gain an in-interval corpus bound; 279 remain unmatched | Exact person ID with agreeing reviewed name first, then the existing strict name safeguards; checked speeches and actual vote participation |
| Flagged raw member rows | 2,002 rows | 327 rows receive 549 sourced endpoint corrections in the review overlay and scratch copy; 1,675 have no provable correction; 1,754 still carry raw-id signals after correction | Exact ID, agreeing full name and a single dated catalogue term; retain residual identity/coverage flags |
| Fraser Anning holds | Two held vote-label windows | Both remain held | Senate Journals remain owed; APH and ParlInfo were not fetched |

## Current-person cutoff classification

The saved `~/.cache/autoresearch/handbook/party_records.json`, fetched at 2026-11-13T04:13:49+00:00, contains 81 Senate-associated individuals marked `InCurrentParliament: true`; every `ServiceHistory_End` is 2026-11-13. These are synthesised current-person observation cutoffs. Current Parliament membership is a person-level flag and does not prove that a former senator still sits in the Senate.

`scripts/handbook_party_service.json` now keeps these dates only as `observed_through`. The builder always leaves current-person `service_end` null, including on later fetches. The 146 non-current records retain their previous metadata. All 59 party periods, including the eight current-person open periods' `through` dates, remain unchanged. The linked-service builder continues to reject current-person records before considering a service end.

The guard checks both the committed 81 records and rebuilds at two different fetch dates. It also verifies that open party periods retain null ends and that a genuinely closed person's end is preserved.

## Interval matching

| House | Previously unmatched | Gain corpus bound | Still unmatched |
| --- | ---: | ---: | ---: |
| representatives | 320 | 48 | 272 |
| nsw_lc | 6 | 0 | 6 |
| vic_la | 1 | 0 | 1 |
| Total | 327 | 48 | 279 |

All 48 recovered bounds are exact speech receipts across 23 member/house identities. An agreeing stored ID resolves the duplicate catalogue/roster name candidates while retaining the exact reviewed-name requirement. An ID alone cannot establish identity. Full names, reviewed aliases and source prints remain exact within the same house; conflicting numeric IDs reject a match, and a bare surname needs an agreeing reviewed ID. No middle names were dropped, nicknames inferred or fuzzy joins introduced. Mark Latham and Ros Spence remain ambiguous under these rules.

Of the 279 unmatched intervals, 275 have no strict identity match. Four have identifiable participation only outside their interval: two early Warwick Smith intervals and two early Leo McLeay office/party intervals. An earlier group minimum cannot stand in for a speech inside a later term. The six previously documented SA Council coverage gaps are a separate cohort and remain unchanged.

The audit reads individual speech and vote dates. It checks the published corpus window from 1993-03-13, excludes Wragge XML and chair/unknown/witness speech types, and imposes no speech length or count floor. Votes include aye/no/paired participation, excluding absence and abstention. It checked 6,535 speech records under the indexed prefilter, 853,754 extended vote records and 850,033 legacy vote records. Legacy and extended vote views can overlap; these are checked record counts, not distinct divisions.

The optional speech prefilter reuses the sweep's complete 4,890 eligible print/id groups from the same database mtime, with its SHA-256 recorded in the findings. Only 33 groups, covering 23 stored IDs, could satisfy a target identity. The audit uses those IDs to limit indexed reads, then checks each individual record's name, house and date again. It never substitutes a group minimum for an interval receipt. Without the prefilter it scans the same eligible speeches directly.

The initial unmatched list remains in `roster_period_exceptions.json` as the fixed review cohort. Its note points to the follow-up dispositions. No sourced service or party endpoints were moved to accommodate a corpus match.

## Raw member rows

The original signals are overlapping comparisons against unverified raw-ID speech coverage. Equality with the first or last speech is a signal, not proof of how an ingestion date was created. A record before an apparent service start can also be another person's speech.

| Flag reason | Before | After sourced corrections |
| --- | ---: | ---: |
| Start equals first stored record | 1,833 | 1,523 |
| Start after first stored record | 141 | 206 |
| End equals last stored record | 1,165 | 994 |
| End before last stored record | 104 | 98 |
| Distinct flagged rows | 2,002 | 1,754 |

These eight combinations partition the original 2,002 rows. “Corrected” means at least one endpoint changed from a dated source; it does not imply every identity/coverage signal disappeared.

| Original flag combination | Rows | Corrected | No provable correction |
| --- | ---: | ---: | ---: |
| End before last | 3 | 1 | 2 |
| End equals last | 25 | 4 | 21 |
| Start after first | 65 | 6 | 59 |
| Start after first; end before last | 19 | 1 | 18 |
| Start after first; end equals last | 57 | 5 | 52 |
| Start equals first | 668 | 142 | 526 |
| Start equals first; end before last | 82 | 5 | 77 |
| Start equals first; end equals last | 1,083 | 163 | 920 |
| Total | 2,002 | 327 | 1,675 |

All 327 corrected rows are House of Representatives members. Each has an exact catalogue legacy ID, an agreeing full name or explicit alias, and exactly one catalogue term in that house, sourced to the pinned OpenAustralia parliamentary service records. Only day-precision dated endpoints can replace raw endpoints: 327 starts and 222 ends. Every change retains its old/new values, catalogue term key, source URL and source SHA-256 in the findings. Only election, by-election or appointment starts and retirement, defeat, resignation or death ends can replace raw dates. Open catalogue ends never clear raw ends or silently assert current membership. Michael Johnson's end is labelled changed_party in the catalogue, so that endpoint remains held even though his election start is corrected.

For example, Anthony Albanese's raw 1998-03-02 start becomes the sourced 1996-03-02 election date. Julie Collins's raw 1929-02-27 start becomes the sourced 2007-11-24 date. The latter still has an earlier attached raw-ID record; the date correction cannot repair that attribution. Overall, 79 corrected rows retain signals, so the remaining flagged-row count is 1,675 + 79 = 1,754. The increase in “start after first” exposes these earlier attached records rather than legitimising them.

The remaining correction holds are:

| Hold reason | Rows | Evidence still needed |
| --- | ---: | --- |
| No exact-ID catalogue term | 1,613 | Primary tenure provenance and/or reviewed identity linkage; no surname or approximate-name joining |
| Multiple catalogue terms or seats | 62 | Reviewed career/seat scope before selecting endpoints; no arbitrary earliest/latest collapse |

The 236 literal `unknown` end sentinels identified in the original sweep are outside the 2,002-row signal cohort. They remain unknown, without conversion to a dated retirement or to null/current status.

## Fraser Anning

The held Senate vote-label windows remain 2017-11-10 to 2018-01-15 and 2018-10-01 to 2018-11-26, with exclusive ends as before. Cached Handbook dates conflict with contemporary reporting. Senate Journals remain required to settle them. The accept-list holds and their reasons are unchanged.

## Published files and evidence boundaries

| Published file or data | Diff |
| --- | --- |
| `portal/public/parliamentarians.json` | None |
| Immutable electorate release and manifest | None |
| Other tracked `portal/public/` files | None |
| `scripts/handbook_party_service.json` | 81 person-metadata classifications and the explanatory note; all party periods unchanged |
| Service dates, vote labels and accepted roster records | None |

The raw corrections are committed review metadata and applied only to a scratch copy. An exact comparison of all 2,699 member rows confirms that only the reviewed 327 rows and 549 fields changed, with all other member values preserved. The original `/home/jake/.cache/autoresearch/parli.db` was opened using SQLite `mode=ro` and `query_only=ON`. Its mtime remains 2026-11-10T10:23:44.736218+00:00. Findings describe this older local snapshot, without claims about production coverage.

Local evidence, the scratch database and gate logs are under `/home/jake/opax-work/evidence/im-roster-provenance/`, outside the public repository. Search, crawl, hubs and Victorian election test prerequisites were built offline, with table SQL preparation disabled. The unrelated regenerated agency-supplier ordering drift was archived and excluded from the patch. No production, KB or remote D1 writes, deployment or SSH occurred. Network use was limited to Git transport with user agent `opax-improve-audit`; no source pages were requested. Heavy processes ran at nice 10 and paused when the five-minute load exceeded 40.

Reproduce the review using `nice -n 10 python3 scripts/audit_roster_provenance.py --db /path/to/read-only/parli.db --out /scratch/provenance-review.json`. The optional `--speech-groups` accepts the complete sweep aggregate from the exact same snapshot. To replay corrections, first copy the database to scratch, then add `--apply-to-copy /scratch/parli.db` with the existing review JSON. The apply step checks every old endpoint and rolls back the entire transaction if any row moved.

## Gates

- Full Python roster/state/profile gate, plus `tests/test_vote_parties.py`: **244 passed, 14,181 subtests passed; one replay subtest timed out at its 300-second subprocess limit** during mandatory load pauses. The isolated rerun of the unchanged replay assertions passed **both scenarios A and B**, in 915.37 seconds, with a 1,200-second local subprocess allowance. The repository test limit remains at 300 seconds. The original full gate's timing failure remains recorded.
- Final focused provenance, period and vote-party guards: **67 passed**.
- Full portal `npm test -- --test-concurrency=4`, after offline `OPAX_TABLE_METADATA_ONLY=1 npm run build:search`: **4,966 passed, 11 skipped, two failed**, in 486.32 seconds. Both failures were `directory-render.test.mjs` shell timeouts at 15 seconds. The isolated rerun of that entire file at concurrency 4 passed **11/11**, without changing test code or limits. The full-run timing failures remain recorded, not reported as a clean full gate.
- Roster accept list: **842 groups applied, 25 new rows, 7 dropped rows, zero problems**.
- Scratch replay: **327 rows, 549 fields**, with an exact comparison preserving every other member value across all 2,699 rows and an unchanged source mtime.
- Offline search/crawl/hub/Victorian election builds, `git diff --check` and `node scripts/stamp_assets.mjs --check`: **passed**.
