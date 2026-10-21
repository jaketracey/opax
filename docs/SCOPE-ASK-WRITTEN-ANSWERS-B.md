# Ask written answers B — roster names only

Final scope: retain roster name binding and speaker-owned quotations from `3379a8c92`; restore the financial audit exactly to live r4 `31e00250a`. The budget changes from `3379a8c92`, `ce0e1e0dd` and `be807ff1c` are superseded. Read `review-ask-written-answers-b-r3.last.md` and the four salary reproductions before implementing this reduction.

## Retained name binding

Person identity comes from the existing roster name/canonical-slug index and selected speaker/recipient metadata. There is no word-based `Bill` exclusion. Personal quotations bind to the evidence speaker; textual name presence and amount ownership do not establish quotation ownership. Document subjects match selected titles and record identities. Existing unresolved reporting-subject checks remain enabled.

All **7 original name tests** remain unchanged: Bill Shorten substitution rejection, own-speaker quote and canonical-slug preservation, selected Bill/Act/Report titles, and recipient-versus-speaker ownership. The **21 reviewer name controls** also pass across **168 response-boundary checks**, including Bill Tilley, Michaelia Cash, possessives and titles containing surnames.

## Financial code restored to r4

Budget-versus-payment handling is **known and deferred to the structured claim-plan lane C**. The superseded B budget rejection/restoration tests are removed, with that decision recorded in the test-file comment. B introduces no budget metric, scope inheritance, budget predicate or evidence-wide budget override.

The following financial source regions are byte-identical to `31e00250a`:

- `periods()`, `figures()`, `amountOwners()`, `givingActor()`, `dateSupported()` and `metricSupported()`.
- `financialPredicate`.
- `evidenceRows()` line/figure processing.
- The complete numeric-claim loop in `auditPayload()`.

The shared evidence-row header still carries `recipient` as name-binding metadata. The entire remaining audit diff against r4 consists of roster/person identity, selected-title matching, attribution and speaker-owned quotation changes.

The extracted financial-function diff is empty:

```text
diff -u portal/private/ask-written-answers-b/names-only/r4-financial.mjs \
        portal/private/ask-written-answers-b/names-only/B-financial.mjs
(no output; exit 0)
```

The snapshots, empty `budget-r4.diff` and `budget-identity.json` receipt are retained alongside the replay logs. Combined financial source SHA-256: `a5b4cc718c94a81aaefbd49f6208f475522d68acb6c2b7c4839b74b4b3e65ef5`.

All **53 prior financial controls** produce exactly the same complete response payload under literal r4 and names-only B across JSON/SSE × ordinary/fallback metadata × cache/miss. This intentionally preserves r4's known budget gaps, including budget-only evidence supporting payment claims and the unlabelled office-budget statement being removed. Those cases are not claimed as fixed in B.

## Salary and payment preservation

All four reviewer salary snippets retain `Avery Example earned a salary of $100,000.` and its citation:

1. `Avery Example: office budget $50,000 and salary $100,000.`
2. `Avery Example: office budget of $50,000 and salary of $100,000.`
3. `Avery Example has an office budget of $50,000 and an annual salary of $100,000.`
4. `Avery Example has a $50,000 office budget and a $100,000 salary.`

These run on speech and record sources: **8 committed tests / 64 response-boundary checks**, all preserving exact answer text, citation ranges and `cited: true`. The four earlier payment-preservation tests also remain enabled: payments followed by a separate budget sentence and payments funded from the office budget. The focused B/audit/r3/acceptance set passes **77/77**.

The separate control comparison totals **82 cases / 656 B response-boundary checks**: 21 name, 53 financial-parity and 8 salary cases. Financial and salary payloads match literal r4 exactly; name cases follow the corrected expected attribution. Complete inputs and results are in private `names-only/controls.json`.

## Saved-payload replay

Replayed **50 reviewed r4 payloads from `acceptance-r3` and 50 reviewer r2 payloads** through exact r4 (`31e00250a`) and names-only B, in memory with network fetch disabled. Inputs remain copied read-only under `portal/private/ask-written-answers-b/`; original paths and input hashes are in `inputs.json`.

**Every sentence, citation-key and full-grade difference: none.** The unchanged grader recomputes the reviewed-r4 metrics below.

| Metric | r4 | Names-only B |
|---|---:|---:|
| Correctness pass/partial/fail | 40/5/5 | 40/5/5 |
| Citations pass/partial/fail; n/a | 39/0/1; 10 | 39/0/1; 10 |
| Date/constraint pass; n/a | 23; 27 | 23; 27 |
| Decline decisions | 49/50 | 49/50 |
| Audit findings/atoms | 0/530 | 0/530 |

The r2 replay remains identical in both arms, with audit **0/523**. GOLD-M03 retains five citation keys and RESEARCH-H01 retains two. Per-case payloads, complete grades and audit atoms are in private `names-only/replay.json`.

Saved p95 **19.121 s** and mean cost **US$0.00277353** are unchanged by construction. No new Ask/model calls or performance measurements were made.

## Gates and boundaries

`npm run build:search` passes, followed by the **full portal suite: 2,550/2,550 pass**, zero failures/skips (`node --test --test-concurrency=4 test/*.test.mjs`). `tsc --noEmit`, `npm run check`, the Worker dry run and `git diff --check` pass. The extracted financial-function diff remains empty (exit 0).

Restored the generated search manifest and party-member index to their original bytes after the complete suite; no generated public-data changes are committed. Reproducing the suite requires `npm run build:search` first. Build logs, exact commands, exit-code receipts, control/replay results and byte hashes are retained in `portal/private/ask-written-answers-b/names-only/`. Elapsed before committing: **3.5 minutes**, within the 20-minute limit.

`votes.json` and `pay.json` are byte-identical to this round's starting commit `be807ff1c` and the supplied worktree baseline `6b021dc84`. The earlier nightly update to `votes.json` relative to literal `31e00250a` is retained; only financial code is restored to that r4 commit.

No production requests, model calls, push or deployment. Spend: **US$0**. Further budget-versus-payment work belongs to lane C.
