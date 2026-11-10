# Ask v1 integration

Completed on 10 November 2026 in `/Users/jake/Projects/opax-ios-wt/ask-v1`, branch `ask/v1`.

Read `COMMON.md`, `REPORT-v1.md`, the lane briefs and commits, and all eleven final reports at `/Users/jake/Projects/opax-ios/.ops/codex-runs/<label>.last.md`. This report covers the five lanes already merged and the six integrated here. No live answer evaluation or pass-rate measurement was performed.

## Lane changes

| Lane | Result |
| --- | --- |
| `ask-p0-guards` | Identity questions bypass position-evidence guards and return cited roster facts in JSON and streaming responses, including party, chamber, electorate and service questions. |
| `ask-p0-writing` | Answers lead with the requested finding, use prose instead of raw rows, deduplicate facts and citations, and put relevant source caveats in `coverage.note`. |
| `ask-p1-bills` | Bill discovery exposes recorded introduction, dated chamber stages, passage, assent, Act-number and sponsor fields to Ask and MCP. Missing or conflicting lifecycle values remain unknown. |
| `ask-p1-expenses` | Shared `member_expenses` supports calendar and financial years, with sums from actual IPEA quarters and explicit partial coverage. Register mappings retain published amounts and units. |
| `ask-p2-evalgate` | The harness prefers reported costs, has a frozen stratified 150-question gate covering all 44 families, and supports serial resumption and comparison against previous results. Grading is unchanged. |
| `ask-p1-division` | Shared `division` returns exact division details, outcome, ayes/noes, member and party votes, calculated dissenters, and period floor-crossing or party-agreement aggregates. |
| `ask-p1-counts` | Shared `count_records` counts complete published division and bill indexes by chamber and period, with grouped series, snapshot and coverage facts. Speech counting remains with the existing speech tools. |
| `ask-p1-money` | Shared `money_totals` sums federal receipts and produces total rankings and annual series. Named grant recipient totals use complete summaries rather than shortened award lists. |
| `ask-p0-names` | `find_people` handles conservative fuzzy matches, reordered names, titles, suffixes and nicknames, with confidence-ranked candidates, explicit ties and no nearest-stranger fallback. |
| `ask-p0-absence` | Exact lookups state missing records plainly, correct checked false premises first, preserve title years and requested dates, and give recorded dates for future requests. |
| `ask-p1-interests` | Interests expose declared items, holders, register dates and changes. Dated service reaches the writer by chamber and seat, while grants support complete recipient, program and financial-year aggregates. |

## Merge record

Each branch was merged separately using `git merge --no-ff`, in the requested order. All six branch tips are ancestors of the integrated branch.

| Branch | Lane commit | Merge commit |
| --- | --- | --- |
| `ask/p1-division` | `00242ace4` | `ca9091bf4` |
| `ask/p1-counts` | `1aecc6307` | `7980dc347` |
| `ask/p1-money` | `dd4ab6451` | `cb2418a04` |
| `ask/p0-names` | `d6a9e6172` | `ab9ecb6f2` |
| `ask/p0-absence` | `d6392941e` | `0c34003d8` |
| `ask/p1-interests` | `160e381ae` | `e5c1dcd9f` |

## Conflicts and precedence

- `tools/index.ts` and the public MCP inventory tests: retained all existing tools and added `division`, `count_records` and `money_totals`, including the already merged `member_expenses`. Kept the registry version increase. Inventory checks use the shared registry alongside explicit new-tool checks, replacing obsolete six/seven-tool inventories.
- `research-writing.ts`: retained the writing lane's direct lead, prose, deduplication and separate coverage contract. Added division outcome and tally guidance, count-first and comparison guidance, full grouped series, and snapshot coverage. Checked false-premise corrections remain first through the absence lane's final correction wrapper.
- `research-loop.ts`: retained count, money and absence routing instructions alongside the writing rules. Combined compact division-member projection with grouped-count feedback compaction, preserving both result-size protections. Service facts remain selectable structured records.
- `agentic-tools.ts`: combined conservative name resolution with representation metadata, dated service enrichment, and the division and receipt routing descriptions. Service joins retain the resolved source ID and chambers recorded under aliases, so aliases cannot invent an earlier Senate start from House service.
- `agentic-ask.ts`: kept exact-record checking, service facts and each planner hint. Count questions use `count_records`; individual division questions use `division`; summed receipts use `money_totals`; member expenses use `member_expenses`. Identity routing continues to bypass the position guard.
- `tools/grants.ts`: combined both grant interfaces. Simple recipient totals share the money lane's complete-summary calculation and expose the interests lane's count, period and completeness fields. Program and yearly breakdowns retain the interests lane's aggregate paths. Both paths preserve financial-year boundaries and reject unsupported partial periods. Largest-grant lists retain their existing calendar-year filters.

## Interaction fixes

- The absence precheck now uses the same conservative fuzzy resolver as `find_people`. A valid typo or tied real names cannot become a false no-record answer. Interests questions also check the register's own member directory before declaring a roster-missing person absent.
- `decline(no_record)` requires a successful empty lookup and rejects ambiguous name results. An unsupported no-record attempt returns feedback so the loop can ask for clarification. An unavailable roster remains a tool failure.
- Empty division-count windows within the recorded date range remain available to `count_records`; dates outside available coverage retain the absence explanation.
- Recipient, program and jurisdiction-year grant aggregates preserve exact Ask financial-year dates. Calendar and partial financial years produce a coverage limitation rather than an invented split or a silently widened range.
- Full party receipt totals retain their complete-party methodology instead of being described as a selected-donor lower bound. Exact record counts retain their snapshot and latest-record dates in the coverage note. The coverage filter recognises an exact count's phrase "not a ranked sample" correctly.

## Test expectation changes

No assertions were deleted to obtain a pass. Expectations changed where the combined lanes deliberately replaced the old contract:

- Name-result equality now includes the representation and service fields added by guards and interests, while preserving every previous metadata check.
- The absence loop fixture now supplies an available empty roster and exercises the loop directly. Its former `null` roster encodes unavailability under the names lane and cannot establish absence.
- Grant citation checks retain their amounts, counts, source basis and periods while accepting the money lane's dated recipient-total prose. A grant period outside source coverage now expects a limitation instead of zero. Unsupported recipient filters expect schema rejection before a data read instead of a later handler error.
- The per-turn reservation test still checks the exact reservation formula and unknown-cost settlement. Its old fixed US$0.02 prompt-size assumption was replaced by the whole-request ceiling, because the new tool schemas and descriptions increase the legitimate input reserve.

Added regressions cover fuzzy and ambiguous absence checks, register-only members, empty count windows, service IDs and alias chamber history, grant breakdown periods, full-party receipt caveats and count snapshots.

## Validation and generated prerequisites

- Added the missing portal `typecheck` script, `tsc --noEmit`.
- Generated ignored Worker declarations with the existing `npm run types` command. `npm run typecheck` passed after the final code changes.
- Ran the local `npm run build:search` chain to restore missing ignored search shards, hubs, crawl/sitemap outputs, Victorian election data and table indexes. This also completes the expenses lane's search-catalogue rebuild request.
- Retained the generated statute-title source-count correction, refreshed party-member projection and updated search manifest. The final search catalogue contains 332,188 records, version `752b21989ec4cc16`.
- The first full suite found 74 failures, including the missing/stale generated assets reported by the lanes. After rebuilding and fixing interactions, a second full run passed 4,150 tests and exposed one new count-coverage regression. That filter was fixed.
- Final focused writer/service run: **42 passed, zero failed**.
- Final full portal `npm test`: **4,152 passed, zero failed, zero skipped, zero cancelled**, in 60.1 seconds. Log: `/tmp/ask-v1-integration-test-final.log`.
- `git diff --check` passed. No conflict entries remain.

## Lane-reported limits and remaining source work

- All lanes reported full-suite failures caused by generated assets or other blockers. Those suite blockers are resolved in this checkout. Several reported that `npm run typecheck` did not exist; the script is now present.
- Bills: Act-number text requires a projection rebuild from retained `bill_events.event_raw` on the data box. The lane did not rebuild or publish those bill assets, and neither did this integration. Missing original source fields still require an authorised source refresh. No database migration is needed. The existing ParlInfo acquisition pause remains in force. See [bill lifecycle rebuild requirements](../../../docs/reports/2026-11-10-ask-bill-lifecycle.md).
- Expenses and registers: yearly figures depend on actual available quarters and may be partial. The cached Victorian gift tables contain no value column, so those source amounts cannot be supplied by a mapping fix. SA grant retrieval and pay were unchanged in that lane.
- Division: title-only discovery is capped at 1,000 candidates and reports incompleteness; detail output defaults to one division and discloses truncation. Member lists can be partial. Party labels may reflect later affiliations, so calculated dissent is not independently verified historical floor crossing. Aggregate eligibility limits are retained.
- Counts: exact counts describe the published indexes, not complete parliamentary history. Undated records cannot be assigned to requested date groups, and bill status describes the snapshot introduction cohort.
- Money: full party totals and selected donor flows have different source scopes. Donor rankings cover the published donor selection, and disclosed receipts include more than gifts. Partial/calendar-year receipt requests remain limitations. The lane also reported that the local evaluation harness omits grant shards; that harness asset handoff remains for a future authorised evaluation. No harness was run or changed here. See [money totals handoff](../../../docs/reports/2026-11-10-ask-money-totals.md).
- Interests and service: published register items can be previews even when category counts cover the register. Missing dates remain unknown; clipped careers and careers spanning chambers do not establish Senate entry dates. Recipient/program intersections require complete award lists, otherwise they report unavailability.
- Names and absence: confidence is a ranking score, tied people require clarification, and unavailable source indexes do not prove absence. The names lane's rejection of all 15 invented baseline names is a unit-test result, not a new live evaluation.
- Evaluation gate: the final request can cross the configured spend cap. The runner, subset and accounting changes are integrated, but no release gate, local Ask harness, subset evaluation or full evaluation was run. No new pass-rate or latency claim is made.

No deployment, push or rebase was performed. All integration work is local to `ask/v1`.
