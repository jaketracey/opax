Ask r3 agentic, round 2, 10 November 2026

Merged `ask/r3-data` cleanly with the requested `git merge --no-ff ask/r3-data` (merge commit `caf33cf70`). No conflict resolution, push, rebase, deployment, research harness or eval run. All verification used portal unit tests and local published assets. No requests to the live OPAX site.

The important stopping limit was cumulative tokens, rather than elapsed time. Run 5 records `answer_stats.salvaged = tokens` after four turns for TT-YDEB-003, TT-YDEB-004, NP-SAID-012 and BL-STAT-001. For TT-YDEB-004 the reported input usage grows from 14,096 to 16,422, 20,255 and 23,195 tokens. The next input reservation, including the enlarged tool catalogue and accumulated results, exhausted the old 96,000-token allowance before a synthesis turn. Recovery calls had already retrieved useful material. The agreement and Tyrrell failures instead rejected usable facts as `named_unresolved`; additional time would not repair that stale scope.

The loop now reserves an answer turn as token headroom shrinks, passes original registry excerpts into its citation verifier, and avoids sending duplicate count rows or duplicate excerpt text to the model. Passage tools have passage citation IDs instead of a second, competing set of record fact IDs. Complete, single-purpose lifecycle, member-vote and count findings can finish immediately. Compound comparisons retain the research path until their other components are available. Exact detail IDs remain callable without incompatible search filters being injected; their returned date, jurisdiction, chamber, party and member still face evidence checks.

The limits in `portal/src/ask-budgets.ts` are:

| Limit | Value |
| --- | --- |
| Cumulative default / maximum tokens | 256,000 / 320,000, increased this round |
| Lookup calls / model rounds | 16 / 8 |
| Soft answer target / hard request wall time | 30 s / 60 s |
| Per-question model spend admission ceiling | US$0.25 |
| Maximum output per selection turn | 1,800 tokens |
| Per-result model payload / lookup wall cap | 16,384 bytes / 20 s |
| Writing reserve / legacy fallback allowance | 4 s / US$0.05 |

The spend cap, unknown-billing reservations, daily ledger, model limiter and per-IP limits remain in force. Counting work retains its candidate bound and four-worker pool; original corpus reads retain their six-record bound. Awaited reads consume wall time, not Worker CPU. Hard cases can now use four to eight turns rather than losing the synthesis turn after four. Expected latency is still one or two turns for exact record questions, roughly 10 to 35 seconds for substantial research, with a 60-second ceiling. Based on the supplied run's receipts, approximately US$0.002 to US$0.02 is a planning estimate, not a new measured average. Actual latency, cost and pass rate require the lead's next gate.

Each requested case was addressed as follows. Saved questions, usage, source shapes and traces are in `portal/test/fixtures/ask-r3-round2.json`; behavioural tests are in `portal/test/ask-r3-round2.test.mjs`.

| ID | Run 5 cause and calls | Change and local evidence |
| --- | --- | --- |
| TT-YDEB-004 | Two speech counts and six searches over four turns; token salvage before synthesis. | Larger cumulative allowance and an answer-turn reserve. A unit test with the saved usage and verified bushfire excerpts reaches a fifth synthesis turn. Topic-specific evidence remains a sample, not an invented prominence ranking. |
| TT-YDEB-003 | Two corpus calls, five speech counts, two searches and two person-quote calls over four turns; token salvage. | Saved usage now permits all eight recovery turns in the bounded unit test, rather than failing token admission on the fifth. Run 5 retains source metadata but no final excerpts for this case, so the test does not invent drought quotations. |
| TT-AGRE-008 | Division agreement and count returned usable records; answer rejected as `named_unresolved`. | Party masking and collective-subject grammar now recognise “Liberal Party and the Nationals” as parties. The real question resolves both parties without inventing a person. |
| NP-VOTE-015 | Name resolution found Tammy Tyrrell; the first division lookup missed, and the recovered Fuel division was found, but the answer retained unresolved “Tanmy” scope. | Grammatical name slots resolve typos against authoritative names. A successful in-loop identity result updates the constraints and resolved question. Tested with the actual Fuel division `federal-senate-10022`. |
| TT-AGRE-004 | Count and division agreement succeeded; “Labor and the Liberal Party” was treated as an unresolved person. | Same collective-subject repair, tested separately with this real question. |
| NP-VOTE-021 | Name lookup and division succeeded, but “how'd Sharkie” missed surname scope and the final answer emphasised the result and floor crossing. | Contracted question grammar resolves Rebekha Sharkie. The member's recorded vote now leads, with the division and date. |
| DT-YEAR-014 | One zero bill count plus six speech searches. A bill index whose dated records start in 2010 was allowed to supply a 2002 zero, and a bill-count renderer took over a question about debates. | Counts outside observed dated coverage return `total: null`, a coverage limitation and no count citation. Debate questions cannot use bill counts as their answer. Broad absence from a narrow lookup is blocked until a complete scoped count is checked. The integration test rejects a decline after two empty searches, then admits the counted result. |
| BL-STAT-001 | Correct bill discovery was followed by four searches and a person lookup; token salvage selected the neighbouring Levy Amendment Bill. | Bare “TITLE Bill YEAR status?” now establishes an exact title. Complete status evidence is selected before speech salvage and finishes after the lookup. Tested against `au-federal-r5842`, not its amendment neighbour. |
| DV-PRTY-036 | Legacy title aggregate and two detailed divisions were present. Rendering selected the 11-division aggregate instead of the requested vote. | Dated division evidence takes precedence over aggregates. When the title covers several votes, the answer keeps their dates, latest first, including Labor's no vote on 3 December 2015. |
| NP-INTR-007 | Correct Queensland register returned; only coherence/direct-first-sentence checks failed. | The answer now starts “Bree James declared ...”. Added explicit register jurisdiction filtering; a federal request cannot substitute her Queensland register. The actual question has no federal qualifier and its expected source is Queensland. |
| NP-VOTE-040 | Correct Mark Furner no vote. Only the duplicate checker failed on the legitimate tied tally, 32 ayes and 32 noes. | The requested member vote leads without unasked equal-tally or floor-crossing commentary. The vote and date remain grounded in the actual source. |
| DT-SINC-008 | A monthly count returned 22 groups totalling 310; `finish` selected only the first 15 and omitted a total. | Grouped count results also cite their whole-selection total. A total question selects 310 rather than a truncated monthly series; actual monthly sums are checked. |
| DT-MNTH-005 | Correct count 17 and bill titles, but the long combined sentence lost its headline during grounding. | How-many questions retain the concise total; titles are included when a list is requested. Tested through final grounding with the published November 2021 records. |
| DT-MNTH-008 | Same count/list rendering problem for 22 bills in November 2022. | Same fix, tested independently with the real misspelt question and published records. |
| NP-SAID-012 | Person quotes, three searches, two passage reads and two corpus calls retrieved Zali Steggall's words; token salvage prevented synthesis. | The saved usage now reaches a fifth synthesis turn. Registry corpus excerpts can support answer points, and the existing speaking-turn checks remain. No changes to the round 2 statement safeguards. |
| BL-ASNT-004 | Two exact bill lookups had the assent date, but “become law” did not select the assent field. | Assent intent and title extraction recognise that wording. The explicit 5 December 2022 assent citation leads through grounding and a two-turn lookup test. |

All twelve formerly separate data capabilities now have registry definitions, bringing the shared catalogue from 18 to 30. `TOOL_REGISTRY_VERSION` is `structured-tools-9-shared-ask-data`.

| Shared module | Capabilities |
| --- | --- |
| `tools/speech-data.ts` | Moved speech counts, speech trends, people and receipt breakdowns. `member_votes` delegates to `member_divisions` or `division`; it exposes continuation metadata and summarises only a complete scoped scan. `find_quotes` delegates to verified `corpus_records`. |
| `tools/person-quotes.ts` | Verified member excerpts from the shared original corpus reader. |
| `tools/corpus-aliases.ts` | Public `search`, `read_passage` and `person_overview` capabilities. |
| `tools/calculated-records.ts` | Public deterministic `paid_answer` and `ranked_money` calculators, accepting the full question. No generation credentials or writes. |

`agentic-tools.ts` is a compatibility facade. The SDK reads registry descriptions, includes the seven data-lane tools automatically, preserves paging/detail metadata, and prefers dedicated capabilities. Ask retains its request-specific scope, original speaking-turn verification, citation IDs and overview formatting around those capabilities. Public passage reads use stable record IDs; Ask can recheck a citation ID from the current conversation. The duplicate bespoke MCP `person_quotes` registration was removed. Canonical schema and payload parity for the moved tools is exercised through authenticated MCP calls and Ask's registry adapter. Shared date parsing was extracted to `ask-period.ts` so the pay calculators do not introduce an orchestration/catalogue initialisation cycle.

Two grader issues remain untouched. TT-YDEB-003 and TT-YDEB-004 expect names from `years/2002.json` and `years/2003.json` `voices.speakers`, but those files explicitly aggregate four curated debate probes. Their global rankings do not establish prominence in the one debate asked about. The tests retain useful topic evidence without hardcoding those expected names. NP-VOTE-040's expected answer itself contains “32 to 32”; run 5 passed its member-vote, citation, correctness and coherence checks and failed only `no_duplicates`. Equal tallies are separate labelled facts, not a repeated claim. No question or grader was edited.

Validation:

- `npm run typecheck`: passed.
- Final combined focused run: 419 passed, zero failed. Covers the new regression tests, empty-result recovery, token/spend limits, registry corpus detail and citation IDs, MCP parity, count/date scope, writing/grounding, existing division and money tools, and all five round 2 wins in `ask-r2-said.test.mjs`.
- `npm test` ran once before the final commit: 4,206 passed, 88 failed, three skipped. Follow-up focused runs fixed the task-related failures in that run, including catalogue initialisation, old vote/quote fixtures, coverage propagation and progress labels. The full suite was not rerun after those repairs. Its other failures include absent generated search-catalogue/hubs/crawl/table fixtures, missing Python `openpyxl`, and existing model-budget fixture failures. The full suite is therefore not reported as green. Logs: `/tmp/ask-r3-r2-all.log`, `/tmp/ask-r3-r2-gate.log`, `/tmp/ask-r3-r2-types.log`.
- The 150-question gate was not run. Post-merge grading and real latency/cost measurement remain with the lead.
