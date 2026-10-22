# Ask coherence fix 2: structural decisions and monetary citations

Baseline: `c6348c221`. No production OPAX requests, push, deployment, model calls or paid evaluation. Claim-plan C remains unchanged and off.

## P1 design (three lines)

1. The writer and research loop emit `answer_decision`: answer, limitation, clarification or refusal; legacy prose-only decisions migrate conservatively to preserve, and the enum travels through the response adapter, JSON, SSE and cache.
2. Typed non-answers retain their purpose before lead selection or reconstruction; factual figures and quotes still undergo the same ownership audit. No prose phrase list grants reconstruction permission.
3. A ranked reconstruction requires an original rejected figure tied by its citation, amount and unit to a selected ranking fact, plus matching question intent, party, period and jurisdiction; the writer snapshots its draft before verification, and its lead repair and retry fallback use the same gate.

The `preserve` migration value makes no semantic guess about legacy wording. A declared answer without figures cannot grant ranking permission. Coverage-only tool selections, ambiguous-person decisions and the loop decline tool emit their decision directly; required headline facts and all existing budgets/deadlines remain in place.

## Regression tests

Controls were added and observed failing before implementation. The two review phrases and three additional variants each retain their own text in all eight JSON/SSE × ordinary-fallback × cache combinations:

- “The selected records are insufficient to determine a reliable donor ranking.”
- “Which financial year do you mean? Please specify the period before I rank donors.”
- “This sample leaves the identity of the leading donor unresolved.”
- “I need the recipient and financial year before making that comparison.”
- “Would you like federal returns or Queensland disclosures?”

`portal/test/research-coherence-structural.test.mjs` also covers typed, legacy and explicitly answered writer responses; a supported lower donor; an unrelated rejected amount; a permitted rejected ranking figure; writer lead repair/retry permission; misattributed quotes and causal allegations; selected monetary support; nonmutation and cache idempotence. `research-loop.test.mjs` checks that refusal/clarification enums survive the adapter. The earlier review matrix, WHY, PLACE-OLD, Q04, FOLLOW-PAY, roster/Bill, salary and financial behavior controls remain in the full suite.

Three older donor recovery tests now include an actual rejected draft figure before expecting reconstruction. Their previous “selected facts exist but no draft figure was rejected” premise is intentionally disallowed by P1. The supported-lower-donor negative control retains that former premise explicitly. The count-comparison control declares the writer’s answer decision and remains a comparison, not a donor ranking.

## GOLD-M03

The final fallback checks monetary claims against selected sources with the same owner, amount and period. Existing sentence citations are retained when they support that claim; missing anchors are repaired from a selected supporting source. If the only supporting source was unselected, the monetary sentence is omitted. USER_CONTEXT cannot become supporting evidence.

- Omitted: “A Greens-indexed Senate motion states the gambling industry donated almost $3 million to the Liberal, Labor and Australian Conservatives parties in 2017-18.” Its supporting record `3a9f00aad3ff46caa54d627fb6aa5f07` was not selected.
- Repaired: “Another representatives passage gives Labor about $5 million.” It now cites selected record `6a600425312249cfb937ecf6572d6e77`, using its existing key `/t/body/88171-88942`.
- Retained: the $10 million Senate-passage claim, already cited to selected record `ed9ab66b61ff4bf283755cf5312457a4`.

All four citation keys remain: none is invented, lost or reassigned to an unselected source. Code-point ranges shift around the omitted sentence, and the repaired monetary sentence receives its own range. Independent attribution audit remains zero.

## Saved paired results

Offline inputs are the exact 50 original cases, six donors and 23 follow-up turns on each arm (158 payloads). Fetch is replaced with a throwing function during replay. The literal-r4 model arm remains the frozen comparison baseline; B’s 79 saved finals pass through the new boundary and the unchanged grader. No new research selection or model output is substituted.

| Measure | Frozen r4 | B before fix 2 | B after fix 2 |
|---|---:|---:|---:|
| Original 50 correctness P/partial/F | 38/5/7 | 39/6/5 | 39/6/5 |
| Original 50 citations P/partial/F | 38/0/0 | 37/1/0 | 38/0/0 |
| Original 50 dates P/partial/F | 23/0/0 | 23/0/0 | 23/0/0 |
| Original 50 declines P/partial/F | 48/0/2 | 48/0/2 | 48/0/2 |
| Original 50 coherence P/partial/F | 37/0/13 | 50/0/0 | 50/0/0 |
| Citation n/a | 12 | 12 | 12 |
| Donor golds | 0/6 | 6/6 | 6/6 |
| Follow-up turns, all four checks | 7/23 | 23/23 | 23/23 |
| Complete conversations | 0/10 | 10/10 | 10/10 |
| Independent audit findings | 0 | 0 | 0 |

**Only B result difference: GOLD-M03 citations partial → pass.** Its one sentence omission and one monetary-anchor repair are listed above. All other 78 B answers and citation maps are identical; all other B grades are unchanged. Hanson and all 23 follow-up answers are unchanged. All 158 replayed payloads are idempotent through another boundary pass.

The prior PAY-COMPARE research/ordinary-fallback variance remains unchanged; this patch does not manufacture a missing selected pay comparison. The previous absolute 40/50 correctness and 49/50 decline targets remain unmet by the measured B population (39 and 48). No new latency or provider-cost claim is inferred from this offline run.

## Both-arm boundary compatibility diagnostic

For completeness, each of the 79 frozen r4 finals was also passed through both the prior B boundary and the new B boundary. This counterfactual applies B code to r4 responses that have already been stripped; it is **not** the literal-r4 arm in the paired table above. An already stripped r4 payload cannot supply a lost draft claim as permission to rebuild.

The following list contains every patch-caused answer/citation difference on those r4 payloads. Except the empty-bullet cleanup, each is the required P1 veto: the prior B boundary generated a ranking without an eligible rejected draft figure; the new boundary keeps the checked original content. All are retained as full before/after records in private `replay.json`.

- **PAY-COMPARE** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **MONEY-YEAR** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **GOLD-R02** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **RESEARCH-Q04** — remove a residual empty bullet before returning; no grade changes.
- **COH-PHON** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **COH-GREENS** — P1: no eligible rejected ranking figure; affected grades: correctness, coherence.
- **COH-LAB** — P1: no eligible rejected ranking figure; affected grades: correctness, coherence.
- **COH-LNP** — P1: no eligible rejected ranking figure; affected grades: correctness, coherence.
- **FOLLOW-D01-T2** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D02-T1** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D03-T1** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D04-T1** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D04-T2** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D05-T1** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D05-T2** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D06-T1** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D06-T2** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D07-T3** — P1: no eligible rejected ranking figure; affected grades: coherence.
- **FOLLOW-D10-T1** — P1: no eligible rejected ranking figure; affected grades: coherence.

| r4 payload compatibility: original 50 | Prior B boundary | New B boundary |
|---|---:|---:|
| correctness P/partial/F | 37/4/9 | 37/4/9 |
| citations P/partial/F | 36/0/0 | 36/0/0 |
| constraints P/partial/F | 23/0/0 | 23/0/0 |
| decline P/partial/F | 46/0/4 | 46/0/4 |
| coherence P/partial/F | 50/0/0 | 47/0/3 |

The three original-50 coherence changes are PAY-COMPARE, MONEY-YEAR and GOLD-R02. On donor compatibility controls, COH-GREENS, COH-LAB and COH-LNP also lose the old B boundary’s generated headline; their correctness changes reflect the required veto, not any new audit deletion of supported content. No unsafe refusal is converted into an answer.

### Every frozen-r4-input to new-B-output content difference

This separate list includes pre-existing B boundary behavior as well as the changes above, so it is longer than the single changed B final. Full code-point ranges and complete sentences are in `portal/private/ask-coherence-fix2/replay.json`.

- **GRANTS-PERTH** — removed 0 sentence(s), added 0; lost citation keys fact-9/t/body/0, fact-10/t/body/0; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **WHY** — removed 1 sentence(s), added 0; lost citation keys 12cc28ac8e99428aabf9508ac1fcf568/t/body/0-4029; gained none.
  - Removed: .
- **GOLD-R08** — removed 0 sentence(s), added 0; lost citation keys fact-2/t/body/0, fact-3/t/body/0; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **GOLD-T01** — removed 0 sentence(s), added 0; lost citation keys none; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **GOLD-T05** — removed 0 sentence(s), added 1; lost citation keys none; gained none.
  - Added: The selected records do not establish separate annual speech counts for 2023 and 2024; they supply a combined total.
- **GOLD-M03** — removed 0 sentence(s), added 0; lost citation keys none; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **RESEARCH-H01** — removed 0 sentence(s), added 0; lost citation keys none; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **RESEARCH-Q01** — removed 1 sentence(s), added 0; lost citation keys 4e00f8de80e04c56b14d6401ac7c6fa0/t/body/0-8221; gained none.
  - Removed: .
- **RESEARCH-Q03** — removed 0 sentence(s), added 1; lost citation keys none; gained none.
  - Added: The selected excerpts do not establish how Labor and the Coalition differ on nuclear power.
- **RESEARCH-Q04** — removed 0 sentence(s), added 0; lost citation keys none; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **RESEARCH-Q06** — removed 2 sentence(s), added 0; lost citation keys 90a6d5a2bfe642b6a4e64af992e38db6/t/body/3130-3642, 2bd98e9982544b14af968a21d7749747/t/body/9954-10939; gained none.
  - Removed: .
  - Removed: .
- **REG-natural-dates** — removed 1 sentence(s), added 0; lost citation keys none; gained none.
  - Removed: .
- **COH-LIB** — removed 0 sentence(s), added 0; lost citation keys none; gained none.
  - Existing sentences were reordered, cleaned or their citation ranges remapped.
- **FOLLOW-D01-T2** — removed 1 sentence(s), added 1; lost citation keys none; gained none.
  - Removed: and $19,907,893 from the Australian Workers Union in 2007-08.
  - Added: $19,907,893 from the Australian Workers Union in 2007-08.
- **FOLLOW-D03-T1** — removed 1 sentence(s), added 1; lost citation keys none; gained none.
  - Removed: and Australian Hotels Association (NSW) gave $11,162,821.
  - Added: Australian Hotels Association (NSW) gave $11,162,821.
- **FOLLOW-D06-T2** — removed 1 sentence(s), added 1; lost citation keys none; gained none.
  - Removed: Other named donors include the Australian Hotels Association (NSW) at $126,996 from 17 disclosed receipt records, the Sporting Shooters Association of Australia (Queensland) Inc at $43,057 from 1 disclosed receipt record.
  - Added: named donors include the Australian Hotels Association (NSW) at $126,996 from 17 disclosed receipt records, the Sporting Shooters Association of Australia (Queensland) Inc at $43,057 from 1 disclosed receipt record.

The new `answer_decision` metadata is present on every replayed final. There are no new model calls, financial-audit changes or selected-source promotions hidden in these differences.

## Gates, invariants and spend

```json
{
  "status": "passed",
  "build_search": "passed",
  "full_suite": {
    "tests": 2728,
    "pass": 2728,
    "fail": 0,
    "skipped": 0
  },
  "focused_review_tests": 295,
  "tsc": "passed",
  "check": "passed",
  "dry_run": "passed; no deployment",
  "votes_byte_identical": true,
  "pay_byte_identical": true,
  "financial_audit_diff": [],
  "new_model_calls": 0,
  "new_spend_usd": 0
}
```

Financial audit functions against literal r4: **no diff**. The entire claim audit remains byte-identical to names-only B. Votes and pay remain byte-identical to the starting commit; SHA-256 votes a112166dc583c6acac8b38ab452de83f9e698aab62b4ed5ca94e52ca7c6f46eb, pay ea884852338db9bcf4c05e4cf0752a8cf86606e01ca185edd44f42eb70b15722. Budget-versus-payment remains deferred to C. Writing cache version: written-answer-8.

**New spend: US$0.00; model calls: 0.** Round accounting remains US$4.446307 of US$5, including the prior retained usage reservations; US$0.553693 remains. Replay, red/green tests, gate logs and invariants are under git-ignored portal/private/ask-coherence-fix2/. Nothing was pushed or deployed.
