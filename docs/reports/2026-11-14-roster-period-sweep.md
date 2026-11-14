# Roster period sweep — orchestrator note 1

Reviewed 14 November 2026, on top of `9412816c8196d5b0a057b57d2d8c7e8ce20adf27`. This supersedes the Benjamin Hood hold in [the initial evidence report](2026-11-14-sa-council-evidence.md).

The cutoff, interval-match and raw-cache findings below describe the original sweep. Their follow-up dispositions are recorded in [the roster provenance report](2026-11-14-roster-provenance.md). The Fraser Anning windows remain held.

## Proven correction

Benjamin Hood's accepted Council start is now **2023-03-07**, replacing **2026-11-13**, the date the official list first observed him. His published first recorded-service year is now **2023**. His [SA Parliament member record](https://www.parliament.sa.gov.au/Search/Member?id=7056&type=member) states “Date Elected 07 March 2023” and electoral history from 7 March 2023 to current, Member, Legislative Council. It names Benjamin (Ben) Robin Hood, distinct from Dennis Garry Edward Hood.

Primary evidence: saved `member-7056.html`, SHA-256 `207347d02bf44bb7552309ee0d233526397dacdaa1e8bfb781638e260e955bda`, fetched 14 November Australia/Sydney in the first pass. The previously reviewed [Wikidata Q116885607](https://www.wikidata.org/wiki/Q116885607) start agrees and is retained as a secondary source, explicitly dated to its 13 November review; it was not requested again.

Our local corpus independently holds six speeches printed **The Hon. B.R. HOOD**, 3–17 May 2023. The earliest is `speeches.speech_id=1193228`, **2023-05-03**, stored under `sa_dge_hood`. The initial print plus the Parliament's full name establishes Benjamin Hood; Dennis Hood's earlier speeches are not used to date him. The six speeches still need attribution repair. The source-only profile notice now says **“No speeches are attributed to this profile yet.”** This accurately describes the pending count without falsely asserting that no Hansard is held.

## Scope and counts by house

Inventoried **1,414 service/party interval records** across the published roster, accepted service additions, reviewed service/history/career records, Parliamentary Handbook party periods and the active immutable electorate release. These are record counts, not distinct members: a catalog term and its party interval, or a reviewed record and its shipped affiliation, are independently checked views of the same service. Source-local keys let a reviewer inspect every interval in the [period exception/coverage list](../../scripts/roster_period_exceptions.json). All raw-cache signals, shared-date member lists, 81 metadata cutoffs and supplemental vote windows are also included in the checked-in [cache findings](2026-11-14-roster-period-cache-findings.json); they remain findings, not corrected tenure facts.

Also inspected **523 dated observations** from shipped identity evidence and reviewed official lists, **254 point-in-time catalog rosters** (representatives: 150, senate: 8, vic_la: 88, vic_lc: 8; 354 member observations), and **20 attribution-coverage windows** separately, and the local source caches: **2,699 members-table rows** and **1,711 Wikidata state-roster rows**. An observation date, a fetch-through date and a coverage boundary are not election or retirement dates.

| House | Service/party records | Exact corpus bound | Dated observations | Coverage windows | Local members rows | Cached state-roster rows | Placeholder fixed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| representatives | 1308 | 988 | 0 | 0 | 1282 | 0 | 0 |
| senate | 81 | 81 | 0 | 0 | 429 | 0 | 0 |
| act_la | 0 | 0 | 32 | 0 | 0 | 0 | 0 |
| nsw_la | 2 | 2 | 0 | 0 | 329 | 357 | 0 |
| nsw_lc | 15 | 9 | 43 | 0 | 158 | 158 | 0 |
| nt_la | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| qld_la | 0 | 0 | 262 | 20 | 124 | 385 | 0 |
| sa_ha | 0 | 0 | 17 | 0 | 85 | 244 | 0 |
| sa_lc | 7 | 1 | 47 | 0 | 29 | 103 | 1 |
| tas_ha | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| tas_lc | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| vic_la | 1 | 0 | 122 | 0 | 221 | 305 | 0 |
| vic_lc | 0 | 0 | 0 | 0 | 42 | 159 | 0 |
| wa_la | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| wa_lc | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Zero means no such stored interval in this checkout/cache, not verified absence of members. ACT has observations here; WA, Tasmania and NT have no interval or local roster source rows in these inputs. Acquiring missing jurisdiction histories remains outside what this cache can establish.

## Refresh-date and shared-date checks

Looked up actual local refresh starts in `~/.cache/autoresearch/pipeline/daily.log` and `manual-refresh-20260908.log`, plus refresh-related pipeline logs and git history for the roster/evidence inputs. There are **21 distinct audit dates**: 2026-09-02, 2026-09-03, 2026-09-04, 2026-09-05, 2026-09-07, 2026-09-08, 2026-09-09, 2026-09-13, 2026-09-14, 2026-09-21, 2026-09-22, 2026-09-28, 2026-10-03, 2026-10-04, 2026-10-06, 2026-10-16, 2026-10-18, 2026-11-10, 2026-11-12, 2026-11-13, 2026-11-14. The direct run logs cover 2–28 September; git history supplies later review/export dates. The roster's shipped `meta.generated` is 18 October; the Council observation that created Hood's placeholder is 13 November.

**One published interval endpoint matched a refresh/first-seen date without a dated term source: Hood's start. It is fixed. No other installed roster service/party start or end matched those refresh dates; neither source cache had an endpoint equal to those dates or its own fetch date.** The report does not infer validity from a non-match.

A separate metadata check found **81 Handbook person records with `current: true` and `service_end: 2026-11-13`**, exactly the fetch day. These are synthesized current-person cutoffs rather than proved Senate retirements; they are not installed roster period `end` fields. They remain **owed for metadata classification/renaming**, with all 81 names and ids in `handbook-observation-end-metadata.json`. The existing linked-service builder rejects current records before using `service_end`. No federal member-page lookup was made outside the allowed hosts.

Also inspected the accept list's **14 reviewed vote-party evidence intervals** and **two unresolved vote-label hold windows** separately from roster tenure (`supplemental-vote-evidence-windows.json`). Their first/last-vote bounds limit where a party label is supported; they do not assert election, resignation or retirement. The two Fraser Anning party-transition hold windows remain owed to primary-source review under the existing APH/ParlInfo access prohibition.

Common published dates were reviewed against their source intervals. The largest start clusters are 1996-03-02 (111 records), 2016-07-02 (89), 2007-11-24 (86), 2013-09-07 (85) and 1998-10-03 (84). They are election-date groups, with catalog service sources, rather than refresh dates. The eight open Handbook party periods observed through 2026-11-13 keep `end: null`; `through` is an evidence limit, not a retirement. The 117 shipped identity-evidence points with `start == end == as_of` remain observations. Queensland's 20 reviewed witness intervals are attribution coverage, including year precision, rather than exact parliamentary tenure.

Unusual clusters also occur in the raw members cache. Examples below are signals for provenance review, not corrections to a sourced term:

| Raw field | House | Date | Members |
| --- | --- | --- | ---: |
| member-start | qld_la | 2024-02-14 | 57 |
| member-start | vic_la | 2018-02-06 | 57 |
| member-end | vic_la | 2022-09-21 | 55 |
| member-end | nsw_la | 2022-11-16 | 39 |
| member-start | vic_la | 2022-12-20 | 39 |
| member-start | vic_lc | 2024-03-21 | 37 |
| member-end | nsw_lc | 2022-10-20 | 32 |
| member-start | representatives | 1998-03-02 | 32 |
| member-start | senate | 2023-02-07 | 28 |
| member-start | senate | 2006-02-07 | 25 |
| member-start | vic_la | 2023-02-07 | 25 |
| member-start | sa_ha | 2020-02-05 | 22 |
| member-end | senate | 2013-12-12 | 22 |
| member-end | vic_la | 2022-09-20 | 22 |
| member-start | nsw_la | 2015-05-05 | 21 |

The raw-table comparison found **1833 starts equal to the first stored speech date**, **1165 ends equal to the last stored speech date**, **141 starts after an earlier same-id/house record**, and **104 ends before a later same-id/house record**. These signals affect **2002 raw member rows**; multiple signals can concern one row. There are also **236 literal `unknown` end sentinels**, which were not treated as dates. The comparison deliberately uses raw stored ids to expose source-cache issues; it does not certify that every attached speech is that member. `raw-member-date-signals.json` lists every name, id, endpoint, first/last record and reason, and `raw-member-date-summary.json` gives counts by house.

Raw-cache signals by house (a member can appear in several columns):

| House | Start = first record | Start after earlier record | End = last record | End before later record |
| --- | ---: | ---: | ---: | ---: |
| representatives | 969 | 36 | 712 | 23 |
| senate | 333 | 10 | 231 | 2 |
| vic_la | 122 | 47 | 63 | 17 |
| nsw_lc | 58 | 9 | 34 | 27 |
| qld_la | 96 | 10 | 0 | 0 |
| nsw_la | 118 | 20 | 55 | 30 |
| sa_lc | 24 | 4 | 25 | 0 |
| sa_ha | 74 | 5 | 45 | 5 |
| vic_lc | 39 | 0 | 0 | 0 |

## Starts after the first own-house record

The comparison found **166 interval records before the Hood correction, 165 after**. Of the remaining records, **158 are legitimate later terms, seats, offices or party intervals**: each exception cites an earlier dated interval that contains the first corpus record. **Seven interval records concern two known corpus identity mix-ups**, listed below; backdating service to someone else's speech would be incorrect.

| House | Legitimate later intervals | Known identity exceptions | Fixed first-seen start |
| --- | ---: | ---: | ---: |
| representatives | 129 | 7 | 0 |
| senate | 25 | 0 | 0 |
| nsw_lc | 4 | 0 | 0 |
| sa_lc | 0 | 0 | 1 |

The test and repeatable offline audit live in `scripts/test_roster_periods.py` and `scripts/audit_roster_periods.py`. `scripts/roster_period_exceptions.json` pins every allowed period key, actor, house, start/end and earliest date, with a reason and source. An edited interval cannot borrow its old exception, and stale exceptions fail. New official-list additions must also have an explicit reviewed term source; a list observation cannot silently become installed service.

## Owed

| Owed work | Evidence and scale | Disposition |
| --- | --- | --- |
| Benjamin Hood attribution | Six B.R. HOOD Council speeches, 2023-05-03 to 2023-05-17, stored under Dennis Hood's id; earliest speech 1193228 | Term date corrected. Reassign/review the speech attribution separately; no database rows were written. |
| Tony Smith identity repair | **85** non-Wragge House speeches under id 10592, 1998-03-02 to 1998-07-15, say **Dickson**; one print expands **Tony (Anthony Charles)**. Earliest speech **5**. The current roster/catalog member is the **Casey** Tony Smith, elected in 2001. | Five catalog interval records are allowed as known corpus namesakes. Do not backdate Casey service to the 1998 Dickson record. |
| Fiona Martin identity repair | **Four** non-Wragge `Dr MARTIN,MP` House speeches under id 10937, 2002-03-14 to 2002-05-14, say **Cunningham, ALP**. Earliest speech **73570**. Fiona Martin's catalog service is **Reid from 2019**. | Two catalog interval records are allowed as known corpus namesakes. Repair attribution before treating these as her speeches. |
| Corpus identity/coverage matches | **327 interval records**, covering 146 member/house identities: House 320, NSW Council 6, Victorian Assembly 1 | No unambiguous corpus bound under the strict reviewed name/id rules. Endpoints remain sourced as before; every record is listed under `unmatched_periods` in the checked-in exception file. This is an evidence gap, not a finding that all 327 dates are wrong. |
| SA intervals without a held speech | Six interval records: Bernardi, El Dannawi, Gumbys, Hewett, Quaremba, Selwood | Primary member pages confirm their starts. The cached SA Council speeches end before these services; these are documented expected coverage gaps. |
| Handbook metadata cutoffs | **81** current-person `service_end` values equal the 2026-11-13 fetch date | Not roster retirement facts. Classify or rename to an observed-through field after source review; the linked-service path already refuses current records. All names/ids are archived. |
| Fraser Anning party-transition holds | Two existing Senate vote-label windows, 2017-11-10–2018-01-15 and 2018-10-01–2018-11-26 | Cached Handbook dates conflict with contemporary reporting. Primary Senate Journals remain owed; no APH/ParlInfo request was made. |
| Raw source-cache provenance | Shared first/last dates in the raw members cache, listed in `unusual-member-date-clusters.json` | Do not promote ingestion coverage or an unverified raw date to a term fact. 2002 flagged raw member rows require primary provenance or identity/coverage classification before these fields can be promoted as service dates. The cache itself was not rewritten. |

## Evidence boundaries and reproducibility

The local database was opened with SQLite `mode=ro` and `query_only=ON`; its file mtime is **2026-11-10T10:23:44.736218+00:00**. The pinned snapshot has **1,495 actor/house earliest records**. It uses the published-roster corpus window from **1993-03-13**, excludes Wragge XML and chair/unknown/witness types, and applies no length or count floor. Votes include aye/no/paired records. Full source names and reviewed prints match within the same house; a conflicting numeric id rejects a match, and a bare surname needs an agreeing id. The documented B.R. HOOD override uses his exact print, not the incorrect stored id. Ambiguous and unmatched source groups remain counted as unknown.

The initial all-loaded comparison exposed old surname namesakes before the published corpus window, so that raw extract is retained for review rather than silently used to backdate a current person. The pinned snapshot is a reproducible check against this local copy, not a claim to have freshly audited the production database or all historical backfills. Updating the bounds requires rerunning the local read-only extraction and reviewing its identity matches and exceptions.

No network requests were needed for note 1: the saved SA Parliament page was reused. No SSH was used. All fetched pages remain under `~/opax-work/evidence/im-sa-council-evidence/`; the sweep's raw extracts, per-person/date lists, refresh-log/history receipts, unusual clusters and gate logs are under its `note1/` subdirectory, outside the repo. The checked-in exception file lists all unmatched and late interval records for review.

## Gates

- Node roster/person suites plus the changed held-transcript and crawl suites, `--test-concurrency=4`: **135 passed**, no failures/skips.
- Focused evidence, source-profile and period checks: **31 passed**; the strengthened explicit-coverage-debt check also passed **4/4**.
- Roster accept-list validation: **842 groups applied, 25 new rows, 7 dropped rows; 0 problems**.
- Offline search and crawl builds completed. The search index now carries Hood's 2023 first service year. Asset stamps were regenerated for the profile notice.
- Load5 was checked before gates and was below 40 (about 8); no wait was required.
- Full Python roster gate, `python3 -m pytest -q -p no:cacheprovider scripts/test_roster*.py tests/test_roster_profile_reconciliation.py tests/test_state_roster*.py`: **182 passed, 14,182 subtests passed**, no failures/skips, in **865.80 seconds**. Both frozen full-export replay scenarios passed. The additional explicit missing-bound assertions passed in the focused period-suite run as documented above.
- `git diff --check` and `node scripts/stamp_assets.mjs --check`: passed.
