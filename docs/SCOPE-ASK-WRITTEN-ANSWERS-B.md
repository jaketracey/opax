# Ask coherence: review fix and follow-up evidence

This is the fix 1 evaluation record. The subsequent [structural decision fix and offline replay](SCOPE-ASK-COHERENCE-FIX2.md) resolve its P1 wording bypass and GOLD-M03 citation finding; the original measurements below remain unchanged.

**Scope:** local review only. No production OPAX HTTP requests, push or deployment. Claim-plan C was not changed or enabled. Roster/speaker name binding remains in place; all financial audit functions remain literal r4.

The local Hanson failure came from two rejected owner associations: the old fallback turned “Westpac Banking Corporation gave One Nation …” into a subject ending “received the most …”, and the audit treated “Smaller” in a later donor sentence as a named owner. Deleting those clauses removed the leader and left a dangling conjunction. A citation anchored to removed sentence punctuation survived as an orphan. The new boundary preserves authoritative refusals, validates the requested ranking scope, and reconstructs only from selected evidence.

## Findings and regression controls

- **Protected decisions:** answered:false, temporal/coverage and causal refusals, ambiguous-person clarification and moderation short-circuit lead promotion and reconstruction. Remaining factual claims still undergo ownership audit. Tests: `protected 1990 coverage`, `causal refusal`, `Smith clarification`, `answered false`, `moderation` on JSON/SSE × cache × ordinary fallback, plus first-paragraph misattribution and harmless question echoes.
- **Ranking scope and selected evidence:** “most years” is not ranking intent. Recipient party, requested period and jurisdiction must match selected facts; user context is excluded and reconstructed citations must resolve. Tests: `ranking scope`, `GOLD-M03 never reconstructs or cites unselected USER_CONTEXT`, encoded calculation URLs and receipt period preservation.
- **Checked points:** arbitrary source-quotation replacement is removed; surviving reasons remain alongside specific limitations. Tests: `WHY retains surviving checked reasons`, incomplete qualitative comparisons and combined two-year counts.
- **Coverage and qualitative fallback:** preserve the Census versus 2005 explanation and remove empty record-refusal prefixes beside checked passage points. Tests: `PLACE-OLD proseFallback`, `RESEARCH-Q04 mixed cached answer` across JSON/SSE × cache × fallback, and equivalent coverage/historical-chamber rubric controls on both arms.
- **Writer ownership:** required pay headline facts and explicitly named donor figures survive pruning and revision, with the same model, 1,400-token ceiling and shared writing reserve. Tests: `FOLLOW-PAY a revision cannot drop the required highest-paid subject` and `a named donor cannot be replaced by a different selected donor`.
- **Aggregate prose:** coverage range occurs once in the lead; selection, lower-bound, receipts-not-gifts and no-influence caveats remain. Tests: `aggregate donor range occurs once`, quoted organisation initials and native recipient/profile-total preservation.
- **Conversation context:** requests mirror sendChat's resolved money_question/asked_as turns, 12-turn context, minimal source metadata and six prior resource IDs; resolution uses the original deadline. Tests: `conversation requests carry resolved questions`, recipient switches, explicit-year retention, causal pronouns and a new year after refusal, plus all 23 evaluated turns.
- **Evidence and harness:** retain pre_writer_sources, non-2xx and SSE error bodies, failed attempts and missing-usage reservations. Tests: `loop follow-ups search the standalone question, expose asked_as and pre-writer evidence`, `eval harness preserves non-2xx bodies`, and `eval harness also retains a streamed error body`.

Tests are in `portal/test/research-coherence-review.test.mjs`, `research-coherence.test.mjs`, `research-followups.test.mjs`, `research-route.test.mjs`, `ask-money.test.mjs`, and the existing name/salary suites. Review controls were introduced before their fixes; red/green logs are retained privately.

## Single-turn comparison

Both arms use literal r4 code `31e00250a` versus this branch, with identical vote, pay, roster and federal/Queensland money assets. Both receive the same questions and final grader. The original 50 are reported separately from the six donor questions. The complete paired run covered all 79 requests on each arm. After that run, narrow native-receipt and generic coverage preservation fixes were validated with targeted new-arm requests; the causal follow-up and its following turn were rerun on both arms. Every saved response was regraded with the final identical grader. The table uses the latest response per case; all earlier attempts remain retained. It is not a second complete paired run after those last narrow fixes.

| Original 50 | r4 | New |
|---|---:|---:|
| Correctness P/partial/F | 38/5/7 | 39/6/5 |
| Citations P/partial/F | 38/0/0 | 37/1/0 |
| Dates P/partial/F | 23/0/0 | 23/0/0 |
| Decline decisions P/partial/F | 48/0/2 | 48/0/2 |
| Coherence P/partial/F | 37/0/13 | 50/0/0 |
| Citation n/a | 12 | 12 |
| Date checks | 23/23 | 23/23 |
| Audit findings | 0 | 0 |
| Donor golds | 0/6 | 6/6 |
| Donor coherence | 0/6 | 6/6 |

The state question explicitly asks about LNP funding **in Queensland**. Its gold comes from the local `ranked_money` calculator and `/graph/money.qld.json`: J.J. RICHARDS & SONS PTY LTD, $754,314 across 2013–14 to 2026–27. The previous federal LNP gold ($8,857,209) was a different jurisdiction and was corrected before the final paired run.

### Every regressed single-turn grade

**Review status: not an unqualified ship recommendation.** Coherence, donor golds, follow-ups, temporal checks and independent attribution audit pass. One paired citation regression remains unresolved, PAY-COMPARE remains an unnecessary refusal, and one final response lacks a full usage receipt. The original-50 correctness is better than the fresh r4 arm but remains below the earlier absolute 40/50 target. The aggregate decline grade is tied rather than reaching the earlier 49/50 target. No protected decline became an unsafe or ranked answer.

- **PAY-COMPARE** (correctness, citations, decline): Research/ordinary-fallback difference before this writer: r4 retained selected pay-3 (Albanese), pay-6 (Taylor) and pay-calculation-scope; B's two parliamentary_pay calls succeeded but its two answer attempts failed grounding, and the ordinary fallback retained only uncited USER_CONTEXT salary cards and unrelated passages. It has no pre_writer_sources or writer/coherence statistics because this writer never ran. A same-input replay of r4 through the new boundary keeps both named salary owners, amounts and citations (canonicalized to /t/body/0), although it rewrites the malformed lead and omits the population-count qualification. This supports upstream/fallback attribution for the paired missing answer, not a claim that final source differences alone prove initial selection variance. The unnecessary refusal remains a failed paired case.
- **GOLD-M03** (citations): Citation pass → partial: B has three monetary sentences but only one is anchored; all four remaining citation keys resolve to selected sources, with no USER_CONTEXT citations. Both arms reach ordinary planner fallback after grounding failure, with no pre_writer_sources or coherence writer, and retain different debate passages. Applying the new boundary to the actual r4 payload loses no citation key. The retained B claims include conflicting debate figures rather than structured party-by-party receipts. Selection/fallback variance is present, but the missing anchors cannot be conclusively assigned to initial research from these artifacts. This is reported as an unresolved citation regression, not waived or counted as a pass. Correctness already fails on both arms.

## Follow-ups (separate population)

10 conversations, 23 turns. Gold owner/amount pairs come from `partyDonations` and were cross-checked against the local receipt calculator. “Who else?” requires a newly named donor from tool data, beyond the actual preceding answer. Context checks also reject recipient-role inversion.

The fixture pins `/graph/money.json` at source revision `c6348c2213a65691555f241196c960d23ecd4671`, generated 18 October 2026. Its original exact-byte `source_sha256` remains historical provenance. The live-source guard uses `source_semantic_sha256`: SHA-256 of JSON with recursively sorted object keys and array order preserved, omitting only `meta.generated` after validating it as a UTC calendar date. A weekly export can update that date without changing the gold. Every other metadata value, node, edge, identity, amount, receipt count and period remains guarded; financial or provenance changes require review of the gold and a deliberate fingerprint update. This guard does not approve refreshed data or replace publication gates.

All four checks pass on 7/23 r4 turns versus 23/23 new turns; complete conversations 0/10 versus 10/10. Coherence across all single-turn and follow-up cases: 47/79 versus 79/79.

Each cell below is **context / owners and figures / citations / decline**. P = pass, F = fail, — = not applicable, E = request error.

| Conversation/turn | Question | r4 | New |
|---|---|---|---|
| FOLLOW-D01-T1 | Who gives the most money to One Nation? | P/P/P/P | P/P/P/P |
| FOLLOW-D01-T2 | what about Labor? | P/F/P/P | P/P/P/P |
| FOLLOW-D01-T3 | and in 2019-20? | F/F/P/F | P/P/P/P |
| FOLLOW-D02-T1 | Who gives the most money to the Greens? | P/P/P/P | P/P/P/P |
| FOLLOW-D02-T2 | who else gave to them? | F/F/P/F | P/P/P/P |
| FOLLOW-D03-T1 | Top donors to the Liberal Party | P/F/P/P | P/P/P/P |
| FOLLOW-D03-T2 | how much was that? | F/F/P/P | P/P/P/P |
| FOLLOW-D04-T1 | Who gave the most money to Labor in 2019-20? | P/F/P/P | P/P/P/P |
| FOLLOW-D04-T2 | what about the Greens? | F/F/P/P | P/P/P/P |
| FOLLOW-D04-T3 | and in 2023-24? | F/F/P/P | P/P/P/P |
| FOLLOW-D05-T1 | Who donates the most to the Nationals? | P/P/P/P | P/P/P/P |
| FOLLOW-D05-T2 | and in 2019-20? | F/F/P/P | P/P/P/P |
| FOLLOW-D06-T1 | Who gives the most money to LNP in federal records? | P/P/P/P | P/P/P/P |
| FOLLOW-D06-T2 | what about One Nation? | P/F/P/P | P/P/P/P |
| FOLLOW-D07-T1 | Who gives the most money to One Nation? | P/F/—/F | P/P/P/P |
| FOLLOW-D07-T2 | did that buy their votes? | F/P/—/P | P/P/—/P |
| FOLLOW-D07-T3 | Who gives the most money to Labor? | P/F/P/P | P/P/P/P |
| FOLLOW-D08-T1 | Which Smith gave the most money to One Nation? | P/P/—/P | P/P/—/P |
| FOLLOW-D08-T2 | I mean Westpac. How much did it give to One Nation? | P/F/P/F | P/P/P/P |
| FOLLOW-D09-T1 | Who gave the most money to One Nation in 1990? | P/P/—/P | P/P/—/P |
| FOLLOW-D09-T2 | and in 2019-20? | F/P/P/F | P/P/—/P |
| FOLLOW-D10-T1 | Who gives the most money to One Nation? | P/F/P/P | P/P/P/P |
| FOLLOW-D10-T2 | Did Westpac give money to One Nation in most years? | P/P/P/P | P/P/P/P |

| Conversation | r4 turns passing all four | New turns passing all four |
|---|---:|---:|
| FOLLOW-D01 | 1/3 | 3/3 |
| FOLLOW-D02 | 1/2 | 2/2 |
| FOLLOW-D03 | 0/2 | 2/2 |
| FOLLOW-D04 | 0/3 | 3/3 |
| FOLLOW-D05 | 1/2 | 2/2 |
| FOLLOW-D06 | 1/2 | 2/2 |
| FOLLOW-D07 | 0/3 | 3/3 |
| FOLLOW-D08 | 1/2 | 2/2 |
| FOLLOW-D09 | 1/2 | 2/2 |
| FOLLOW-D10 | 1/2 | 2/2 |

### Two conversations for Jake’s review

Answers are shown in full. Footnote numbers are rendered from the saved citation ranges; JSON retains source keys and code-point anchors.

#### FOLLOW-D01

**Turn 1: Who gives the most money to One Nation?**

| r4 | New |
|---|---|
| **Understood as:** Who gives the most money to One Nation?<br><br>Westpac Banking Corporation received the most disclosed funding in 1998–99 to 2024–25, with $161,787. [1]<br><br>Australian Hotels Association (NSW) follows with $126,996 from 17 disclosed receipt records, then Sporting Shooters Association of Australia (Queensland) Inc with $43,057 from 1 record. [2] [3]<br><br>These disclosed party receipts cover only the published selection, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [1] [4] | **Understood as:** Who gives the most money to One Nation?<br><br>Across disclosed returns from 1998–99 to 2024–25 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding to One Nation: $161,787. [1]<br><br>- Australian Hotels Association (NSW) provided disclosed funding: $126,996. [1]<br><br>- Sporting Shooters Association of Australia (Queensland) Inc provided disclosed funding: $43,057. [1]<br><br>- Adani Mining Pty Ltd provided disclosed funding: $30,000. [1]<br><br>- National Australia Bank provided disclosed funding: $19,715. [1]<br><br>These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [1] [2] |

**Turn 2: what about Labor?**

| r4 | New |
|---|---|
| **Understood as:** what about Labor?<br><br>and $19,907,893 from the Australian Workers Union in 2007-08. [1]<br><br>and $11,958,054 from TWU - Transport Workers Union NSW in 2009-10. [2]<br><br>These disclosed party receipts cover only the published selection, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [3] | **Understood as:** Who donates the most to Labor in federal records?<br><br>Across disclosed returns from 1998–99 to 2025–26 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding: $55,227,183. [1]<br><br>- Shop Distributive & Allied Employees' Association Vic Branch provided disclosed funding: $42,837,142. [2]<br><br>- CFMEU Mining & Energy Division provided disclosed funding: $32,152,941. [3]<br><br>- Australian Workers Union provided disclosed funding: $19,907,893. [4]<br><br>- Communications, Electrical and Plumbing Union - Electrical, Energy and Services Division provided disclosed funding: $17,926,857. [5]<br><br>These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [1] [6] |

**Turn 3: and in 2019-20?**

| r4 | New |
|---|---|
| **Understood as:** and in 2019-20?<br><br>These are disclosed party receipts including more than gifts, not donations-only or personal payments, and they cover a selection rather than every donor; an industry grouping is not proof of coordinated lobbying or influence. [1]<br><br>The figures use the first year of each financial year, and undated records are excluded, so they may not match a strict 2019 calendar-year total. [1] [2] | **Understood as:** Who donates the most to Labor in federal records in 2019?<br><br>Across disclosed returns from 2019–20 in OPAX’s published selection, Shop Distributive & Allied Employees' Association Vic Branch provided the most disclosed funding: $974,058. [1]<br><br>- United Workers Union provided disclosed funding: $701,883. [2]<br><br>- Westpac Banking Corporation provided disclosed funding: $683,400. [3]<br><br>- Communications, Electrical and Plumbing Union - Electrical, Energy and Services Division provided disclosed funding: $576,229. [4]<br><br>- CFMEU Mining & Energy Division provided disclosed funding: $503,780. [5]<br><br>These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [1] [6] |

#### FOLLOW-D07

**Turn 1: Who gives the most money to One Nation?**

| r4 | New |
|---|---|
| **Understood as:** Who gives the most money to One Nation?<br><br>The available records do not establish an answer to this question. | **Understood as:** Who gives the most money to One Nation?<br><br>Across disclosed returns from 1998–99 to 2024–25 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding: $161,787. [1]<br><br>- Australian Hotels Association (NSW) provided disclosed funding: $126,996. [2]<br><br>- Sporting Shooters Association of Australia (Queensland) Inc provided disclosed funding: $43,057. [3]<br><br>- Adani Mining Pty Ltd provided disclosed funding: $30,000. [4]<br><br>- National Australia Bank provided disclosed funding: $19,715. [5]<br><br>These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [1] [6] |

**Turn 2: did that buy their votes?**

| r4 | New |
|---|---|
| **Understood as:** did that buy their votes?<br><br>Public donation and voting records do not establish that money caused a vote. I can help compare the disclosed records without making that allegation. | **Understood as:** Did the disclosed funding to One Nation buy its votes?<br><br>Public donation and voting records do not establish that money caused a vote. I can help compare the disclosed records without making that allegation. |

**Turn 3: Who gives the most money to Labor?**

| r4 | New |
|---|---|
| **Understood as:** Who gives the most money to Labor?<br><br>Westpac Banking Corporation gives the most money to Labor in this published selection. [1] | **Understood as:** Who gives the most money to the Australian Labor Party?<br><br>Across disclosed returns from 1998-99 to 2025-26 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding to Labor: $55,227,183. [1]<br><br>- Shop Distributive & Allied Employees' Association Vic Branch provided disclosed funding: $42,837,142. [2]<br><br>- CFMEU Mining & Energy Division provided disclosed funding: $32,152,941. [3]<br><br>- Australian Workers Union provided disclosed funding: $19,907,893. [4]<br><br>- Communications, Electrical and Plumbing Union - Electrical, Energy and Services Division provided disclosed funding: $17,926,857. [5]<br><br>These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [6] |


## Hanson: before and after, in full

### r4

The next largest donors are the Australian Hotels Association (NSW) at $126,996 in 2012-13. [1]

These disclosed party receipts cover only the published selection, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [2]

### New

Across disclosed returns from 1998-99 to 2025-26 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding to One Nation: $161,787. [1]

- Australian Hotels Association (NSW) provided disclosed funding: $126,996. [2]

- Sporting Shooters Association of Australia (Queensland) Inc provided disclosed funding: $43,057. [3]

- Adani Mining Pty Ltd provided disclosed funding: $30,000. [4]

- National Australia Bank provided disclosed funding: $19,715. [5]

These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [6]

## Writer, fallback, latency and cost

Fallback counts include coverage, provider/budget/time and no-usable-row fallbacks, as well as coherence repair. They are not all one-third-stripping repairs.

| All 79 final requests | r4 | New |
|---|---:|---:|
| Second writer | 0 | 50 |
| Fallback | 0 | 48 |
| p50 ms | 2379 | 3277 |
| p95 ms | 20659 | 17107 |
| Usage receipts | 79 | 78 |
| Mean reported USD per receipt | 0.002475 | 0.002495 |

Reported-receipt mean change: 0.8%. At least one final request lacks complete usage; the exact all-request mean and +10% cost bar cannot be certified. Missing receipts remain reserved in the spend ledger. No request deadline was raised.

| Arm | Slowest three (id; ms; path; route/failure) |
|---|---|
| r4 | GOLD-R09; 38435; /api/ask; planner/timeout<br>GOLD-C01; 24838; /api/ask; planner/error<br>RESEARCH-H01; 23196; /api/ask; planner/malformed_args |
| B | GOLD-C01; 24830; /api/ask; planner/grounding<br>GOLD-M03; 19940; /api/ask; planner/grounding<br>GOLD-E04; 19617; /api/ask; planner/grounding |

**Round spend:** US$4.446307 accounted against US$5: the user-provided US$1.35 start, US$1.096307 in new measured charges, and US$2.00 retained reservations. All prior fix iterations and failed attempts are included. Five local ECONNREFUSED requests made no model call; their US$1.25 reservation was released with health/process evidence. The preceding HTTP 500 remains reserved.

## Gates and invariants

Gate logs, raw paired responses, attempt history, tool golds and the spend ledger are under git-ignored `portal/private/ask-coherence-fix1/`. The final gate result and extracted financial-function comparison are recorded in `gates.json` and `invariants.json`.

```json
{
  "status": "passed",
  "build_search": "passed",
  "full_suite": {
    "tests": 2674,
    "pass": 2674,
    "fail": 0,
    "skipped": 0
  },
  "tsc": "passed",
  "check": "passed",
  "dry_run": "passed (no deploy)",
  "financial_functions_diff": [],
  "votes_byte_identical": true,
  "pay_byte_identical": true
}
```

`research-claim-audit.mjs` remains byte-identical to names-only `8954ed767`. Its six financial functions match literal `31e00250a`: periods, figures, amountOwners, givingActor, dateSupported and metricSupported. Financial-function diff: **none**. Budget-versus-payment reproductions remain known and deferred to claim-plan C. No closed-world prototype was ported.

`votes.json` and `pay.json` are byte-identical to the starting branch. The detached r4 comparison uses the same vote asset as this branch; no protected asset was changed here. The answer-writing cache version is `written-answer-7`.

## Saved 100-payload replay

- **r4, 50 payloads:** correctness passes 40 → 41; audit findings 0 → 0; citation keys lost 0. Changed answers: GOLD-R02, GOLD-T05, GOLD-M03, RESEARCH-H01, RESEARCH-Q03. Main-axis differences: RESEARCH-Q03 correctness partial→pass.
- **r2, 50 payloads:** correctness passes 39 → 40; audit findings 0 → 0; citation keys lost 0. Changed answers: GOLD-R02, GOLD-T05, GOLD-M03, RESEARCH-H01, RESEARCH-Q03. Main-axis differences: RESEARCH-Q03 correctness partial→pass.

No new Asks or model calls were used for this saved-payload replay. Full sentence and citation-key differences remain in private `replay.json`.
