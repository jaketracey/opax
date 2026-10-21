# Ask written answers B — coherent writing

**Status: implemented and committed for review; not ready to ship.** The saved reviewed-r4 population keeps its 40/50 correctness and all prior citation/date/decline grades. The fresh comparison does not meet the correctness/citation/decline release bars, and one question returns HTTP 503. No production OPAX requests, push or deploy. No claim-plan C changes; its flag remains off.

## Cause of the Pauline failure

The local r4 reproduction loses the leader and another donor sentence. The deterministic writer fallback parses “Westpac Banking Corporation gave One Nation …” as a subject containing the giving predicate and recipient, then appends “received the most …”. The final claim audit cannot establish that figure/owner association. It also treats “Smaller” in “Smaller amounts included $19,715 from National Australia Bank …” as an unsupported named subject. Clause deletion leaves a dangling “and”. Its character-origin remapper can retain a terminal punctuation anchor from a removed sentence, leaving an orphan citation. Provider wording varies: the first local reproduction preserves two donor fragments; the fresh r4 comparison preserves only the coverage caveat.

## Changes and tests

- Detail repair keeps a verified sentence while removing an unsupported secondary figure or wrong party adjective. Speaker ownership remains mandatory. Tested secondary details, party qualifiers, Bill Shorten substitutions and all names-only salary controls.
- At most one second writer pass uses the same pinned model and 1,400-token output ceiling, shares the existing writing wall reserve, and rechecks surviving selected evidence. Every pass still checks credit, token and budget admission and settles its reservation. Mock-model tests prove one/two calls, evidence restriction, settlement and no extra call for an intact draft. No deadline, token cap or rate-limit setting changed.
- JSON, SSE, ordinary fallback and cache share punctuation/anchor cleanup. Eight boundary combinations cover the reproduced failure; orphan punctuation anchors and dangling openers are removed without losing legitimate short citation anchors.
- Ranking leads use selected tool facts, native calculation tables and their exact aggregate periods. A return-reference year is not the period of an aggregate. Native donor-table coverage recovers a true leader even when the writer selected only smaller rows. Existing speech-ranking clauses are repaired and moved, preserving their other facts and citations.
- Missing direct leads, substantial stripping and donor fragments use an independently audited deterministic summary: lead, short descending list with amounts/periods/citations, then one coverage caveat. Donor identities remain upstream privacy-filtered; receipts remain distinct from gifts and personal payments, with no influence inference. Complete organisation names containing initials are protected as literal selected names instead of being split into sentence fragments.
- Six tool-derived donor questions added to the eval set: One Nation/Pauline Hanson, Greens, Liberal, Labor, Nationals and Queensland LNP. The shared grader checks direct opening, selected ranking leader/amount/period, orphan anchors, dangling openers and excessive stripping without fallback. Style checks are shared with the serving boundary. A qualitative “between 1998 and 2000” constraint is not treated as a request for a numerical comparison.

26 new coherence tests pass; existing name and salary tests remain enabled. The rollback parity test is pinned to the assigned main baseline `6b021dc84` so later unrelated changes to `origin/main` cannot break its scratch checkout. Older r3 tests now expect a specific limitation ahead of an incidental figure when that figure cannot answer the requested ranking; their citation-preservation and audit assertions remain.

## Budget logic and guards

`portal/src/research-claim-audit.mjs` is byte-identical to the names-only commit `8954ed767`. The extracted financial functions still match literal live r4 `31e00250a`: **budget/financial-function diff: none**. Combined financial-region SHA-256: `a5b4cc718c94a81aaefbd49f6208f475522d68acb6c2b7c4839b74b4b3e65ef5`. Budget-versus-payment gaps remain known and deferred to lane C. No closed-world prototype rule was ported.

Temporal, chamber, ACT, privacy, moderation, rate/budget admission and speaker/figure ownership gates remain enabled. The final suite includes their existing tests. The answer-writing cache version is bumped to `written-answer-6`.

## Saved-payload replay

Both 50-case populations were replayed through literal r4 and B without network/model calls, with the same final grader. The only changed answers are `GOLD-R02`, `GOLD-M03`, `RESEARCH-H01` and `RESEARCH-Q04`: a supported ranking lead is repaired, or a checked answer/limitation is moved first; H01 also repairs its dangling passage opener. **Every citation-key difference: none, in both populations.** Detailed sentence lists are retained in private `replay.json` and `final-report.json`.

| Reviewed r4 population (50) | r4 | B |
|---|---:|---:|
| Correctness pass/partial/fail | 40/5/5 | 40/5/5 |
| Citations pass/partial/fail; n/a | 39/0/1; 10 | 39/0/1; 10 |
| Dates/constraints | 23/23 | 23/23 |
| Decline decisions | 49/50 | 49/50 |
| Coherence | 46/50 | 50/50 |
| Audit findings | 0 | 0 |

The 50-case r2 population likewise retains every prior correctness/citation/date/decline grade and all citation keys, with coherence improving 46→50 and zero audit findings.

## Fresh comparison and limits

Both arms use the local harness and the same pinned DeepSeek/Together model, original deadlines, and identical final grading. Baseline code is detached literal `31e00250a`. Source modules and the money/pay/roster/electorate assets match the assigned `6b021dc84` base; its pre-existing nightly `votes.json` differs from the older checkout. Fresh B responses are also replayed through the final deterministic boundary after the last repairs; this replay makes no model calls. Usage and HTTP latency below are measurements from the fresh calls, rather than another complete run of the final binary.

| Original 50, fresh calls | r4 | B |
|---|---:|---:|
| Correctness pass/partial/fail | 34/6/10 | 32/8/9; 1 error |
| Citations pass/partial/fail; n/a | 37/0/1; n/a 12 | 33/0/1; n/a 15; 1 error |
| Date/constraint checks | 21/23 | 23/23 |
| Decline decisions | 45/50 | 42/50; 1 error |
| Coherence | 40/50 | 49/50; 1 error |
| Audit findings | 0 | 0 |
| New donor correctness | 0/6 | 6/6 |
| New donor coherence | 1/6 | 6/6 |

B has 55 coherent graded responses out of 56 attempted cases; `GOLD-E04` (Victorian state electorate with lowest median income) returns HTTP 503, including one retry. That error is not counted as a coherence pass. The original-50 correctness, citation and decline release bars are not met by the fresh B arm. No further model calls are made after the spend guard stops the run.

Second writer: **32/55** successful B responses. Deterministic fallback: **21/55**. These are observed counts, including coverage/provider fallbacks, not an assumption that revision was rare. The error case has no usable counters.

| All 56 HTTP attempts | r4 | B |
|---|---:|---:|
| p50 | 2.357 s | 3.188 s |
| p95 | 23.093 s | 20.459 s |
| Mean reported response cost | US$0.003112 (55 receipts) | US$0.002857 (55 receipts) |

Reported-cost means exclude missing receipts; exact all-attempt mean cost cannot be certified. Neither request deadlines nor writing limits were raised.

r4 slowest three:
- AMBIG: 33.194 s, /api/ask, planner / timeout.
- GOLD-M03: 29.569 s, /api/ask, planner / grounding.
- GOLD-C01: 23.093 s, /api/ask, planner / grounding.

B slowest three:
- GOLD-E04: 25.984 s, /api/ask, error / HTTP 503.
- GOLD-M03: 21.356 s, /api/ask, planner / grounding.
- GOLD-T05: 20.459 s, /api/ask, planner / grounding.

**Spend:** US$0.351456 confirmed; US$1.00 retained as conservative reservations for four unmetered attempts; **US$1.351456 accounted against US$1.50** across 124 local requests, including probes/retries. A further US$0.25 request reservation would exceed the cap, so all model calls stop. This is not a claim that missing usage was free or that the reserved amount is the final billed amount.

## Pauline question — full before/after

Question: `who does pauline hansons party take the most money from`

First local r4 reproduction (full):

The Australian Hotels Association (NSW) followed with $126,996 in 2012-13. [1]

and $3,000 from the Registered Clubs Association of NSW (t/as ClubsNSW) in 2017-18. [2]

These disclosed party receipts cover only the published selection, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [3]

B (full, final-boundary replay of the confirmed local response):

Westpac Banking Corporation provided the most disclosed funding to One Nation: $161,787 in financial years 1998-99 to 2025-26. [1]

- Australian Hotels Association (NSW) provided disclosed funding: $126,996 in financial years 1998-99 to 2025-26. [2]

- Sporting Shooters Association of Australia (Queensland) Inc provided disclosed funding: $43,057 in financial years 1998-99 to 2025-26. [3]

- Adani Mining Pty Ltd provided disclosed funding: $30,000 in financial years 1998-99 to 2025-26. [4]

- National Australia Bank provided disclosed funding: $19,715 in financial years 1998-99 to 2025-26. [5]

These disclosed party receipts cover only the published selection, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [6]

## Gates and artifacts

**Full portal suite: 2,576/2,576 pass**, zero failures/skips (`node --test --test-concurrency=4 test/*.test.mjs`). Search assets were built first. Standalone `tsc --noEmit`, `npm run check`, Worker deploy **dry run only**, and `git diff --check` pass. Generated build timestamps are restored before committing.

- votes.json: 1321573 bytes, unchanged; SHA-256 a112166dc583c6acac8b38ab452de83f9e698aab62b4ed5ca94e52ca7c6f46eb.
- pay.json: 590501 bytes, unchanged; SHA-256 ea884852338db9bcf4c05e4cf0752a8cf86606e01ca185edd44f42eb70b15722.

Raw model payloads, preserved earlier attempts, per-turn usage, grades, full sentence differences, budget/protected-data receipts and gate logs remain git-ignored under `portal/private/ask-written-answers-coherence/`. No `.dev.vars` contents were printed or committed. Both owned local servers are stopped. No production OPAX calls, push, deploy or C changes.

Time: approximately 41 minutes since the first local eval setup, excluding earlier B rounds.
