# Roster provenance follow-up

R17 / BACKLOG 3z. Reviewed 14 November 2026 on `2ccd62bd1`, following the [period sweep](2026-11-14-roster-period-sweep.md). Updated after the independent review of `2a3d20b43`; the [note review](2026-11-14-roster-provenance-note-review.md) lists all 60 source conflicts, the service-event convention and the complete-career holds. The complete [machine-readable findings](2026-11-14-roster-provenance-findings.json) retain every original interval and flagged member row, with exact corpus receipts or the remaining hold reason.

| Item | Before | After | How |
| --- | --- | --- | --- |
| Handbook fetch-date cutoffs | 81 current-person `service_end` values equal 2026-11-13 | All 81 have `service_end: null`, `observed_through: 2026-11-13` and an explicit observation classification | Reviewed the saved API response; changed the builder and committed metadata; added rebuild and committed-file guards |
| Intervals lacking a corpus match | 327 intervals | 48 gain an in-interval corpus bound; 279 remain unmatched | Exact person ID with agreeing reviewed name first, then the existing strict name safeguards; checked speeches and actual vote participation |
| Flagged raw member rows | 2,002 rows | 319 rows receive 535 sourced endpoint corrections in the review overlay and scratch copy; 1,683 remain held; 1,759 still carry raw-id signals after correction | Exact ID, agreeing full name, a complete single career and convention-normalised source agreement; retain residual identity/coverage flags |
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

The initial 327-row, 549-field proposal was superseded after independent review. The current overlay checks complete source careers, including pre-1993 rows, and normalises every proposed endpoint to the recorded House service-event convention: polling starts; dissolution for election retirement; polling day for defeat; actual dated resignation/death. Conflicts beyond that convention hold the whole row. See the [60-conflict table and corrected samples](2026-11-14-roster-provenance-note-review.md).

The original signals compare against unverified raw-ID speech coverage. Equality with a first or last speech is a signal, not tenure evidence. A record before a service start can belong to another person.

| Flag reason | Before | After sourced corrections |
| --- | ---: | ---: |
| Start equals first stored record | 1,833 | 1,530 |
| Start after first stored record | 141 | 204 |
| End equals last stored record | 1,165 | 998 |
| End before last stored record | 104 | 98 |
| Distinct flagged rows | 2,002 | 1,759 |

| Original flag combination | Rows | Corrected | Held |
| --- | ---: | ---: | ---: |
| End before last | 3 | 1 | 2 |
| End equals last | 25 | 3 | 22 |
| Start after first | 65 | 6 | 59 |
| Start after first; End before last | 19 | 1 | 18 |
| Start after first; End equals last | 57 | 5 | 52 |
| Start equals first | 668 | 139 | 529 |
| Start equals first; End before last | 82 | 5 | 77 |
| Start equals first; End equals last | 1,083 | 159 | 924 |
| Total | 2,002 | 319 | 1,683 |

All 319 corrected rows are House members. The 535 changes comprise 319 starts and 216 ends. Each retains its original raw value, normalised value, full source career, catalogue term key, source receipts, Handbook summary and endpoint decision. Open source ends never clear raw ends or assert current membership. Michael Johnson's `changed_party` end still cannot establish a departure.

| Hold reason | Rows |
| --- | ---: |
| No exact-ID catalogue term | 1,613 |
| Multiple catalogue terms or seats | 62 |
| Additional complete-career rows or disjoint parliaments | 4 |
| Unresolved conflict or unscoped primary summary | 4 |

The 236 literal `unknown` end sentinels remain outside the 2,002-row signal cohort. They are not converted into a retirement or null/current status.

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

The raw corrections are committed review metadata and applied only to a scratch copy. An exact comparison of all 2,699 member rows confirms that only the reviewed 319 rows and 535 fields changed, with all other member values preserved. The original `/home/jake/.cache/autoresearch/parli.db` was opened using SQLite `mode=ro` and `query_only=ON`. Its mtime remains 2026-11-10T10:23:44.736218+00:00. Findings describe this older local snapshot, without claims about production coverage.

Local evidence, the scratch database and gate logs are under `/home/jake/opax-work/evidence/im-roster-provenance/`, outside the public repository. Search, crawl, hubs and Victorian election test prerequisites were built offline, with table SQL preparation disabled. The unrelated regenerated agency-supplier ordering drift was archived and excluded from the patch. No production, KB or remote D1 writes, deployment or SSH occurred. Network use was limited to Git transport with user agent `opax-improve-audit`; no source pages were requested. Heavy processes ran at nice 10 and paused when the five-minute load exceeded 40.

Reproduce the review using `nice -n 10 python3 scripts/audit_roster_provenance.py --db /path/to/read-only/parli.db --out /scratch/provenance-review.json`. The optional `--speech-groups` accepts the complete sweep aggregate from the exact same snapshot. To replay corrections, first copy the database to scratch, then add `--apply-to-copy /scratch/parli.db` with the existing review JSON. The apply step checks every old endpoint and rolls back the entire transaction if any row moved.

## Gates

The current complete-run results are recorded in the [note review](2026-11-14-roster-provenance-note-review.md#gates). The original gate receipts and timing failures remain archived outside the repository.
