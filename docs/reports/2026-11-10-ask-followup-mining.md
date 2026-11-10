# Ask receipt follow-up repair

Reproduced on branch `ask/fix-followup` at baseline `3097261d61a3cd191272ce97acecbb1a8e3867d6`, using the local Worker on port 8981. Requests went to `http://127.0.0.1:8981/api/ask?stream=1`, with the operator bearer authentication used by `ask_eval_gate.mjs` and `x-opax-research: loop`. The secret was loaded from `portal/.dev.vars` and was never logged. No requests were made to the production website. The local runner retained its existing read-only data bindings and model-provider access.

The first question was reconstructed as “How much has the Mining and Energy Union donated?” because the report did not give its exact wording. Follow-ups used the three reported questions verbatim. Requests used the mobile `requestBody` shape: `kind: 'all'`, up to 12 `{author: 'user' | 'answer', text}` turns, and up to six valid 32-character resource IDs from the last two answers. These receipt-tool sources have `fact-N` IDs, so `prior_resources` was empty in this reproduction. Previous questions and answers still travelled in `context`.

## Cause

- `claimClauses` treated the conjunction in “Mining and Energy Union has/was/recorded…” as a possible independent-clause boundary. The final grounding repair had a broader conjunction splitter that could remove everything from “and Energy Union” onwards. The unsupported clause disappeared, but “Mining.” or “The Mining.” survived as a cited sentence. The final citation check accepted any alphabetic sentence and did not reject these fragments.
- The donor fallback matched any named-donor question containing “receipts”, then unconditionally rendered the dollar total. It therefore offered the wrong metric for a receipt-count question. The model writer could sometimes answer the count, which explains why this part of the failure is variable.
- Transfer exclusions were detached tool notes. Fact selection could retain the aggregate while losing its reporting basis. A later fallback could repeat a donor amount instead of answering the new inclusion question.
- The local server returned intact ISO dates in source titles before the patch. The reported title stripping was not reproduced in the server response. New citations use readable dates, retain ISO boundaries in coverage metadata, and the final boundary removes legacy empty “( to )” title suffixes.

## Fix

Conjunctions can split claims only when the preceding text is a clause. Writing and final grounding reject bare entity fragments and short non-clauses. Rejected output falls back to complete selected facts; positional deletions preserve Unicode citation spans. Complete short statements and clarification requests remain valid.

Receipt aggregates now have separate count, transfer-basis, period and amount renderers. Complete selected receipt fields pass directly through the deterministic writer and grounding checks. Exploratory duplicate totals do not replace the requested donor or counterparty. The exclusion basis accompanies each tool citation, so it survives fact selection. Questions about votes, policy and causation cannot use these field renderers. The writing version is bumped to retire earlier cached answers.

## Local before and after

| Follow-up | Baseline local response | Patched local response |
| --- | --- | --- |
| How many receipts did the Mining and Energy Union make? | “The Mining and Energy Union made 56 disclosed receipts to all recipient parties across financial years 1998-99 to 2025-26, a federal total of $4,720,421.” This local model run answered correctly; the reported total-plus-fragments failure is covered by deterministic regression tests. | “56 disclosed receipts from Mining and Energy Union were recorded to all recipient parties in financial years 1998-99 to 2025-26.” |
| Are internal party transfers counted in the $4,720,421? | “Mining.” | “No, internal party transfers and public funding are excluded from the $4,720,421 in federal disclosed receipts from Mining and Energy Union.” |
| What financial years do the Mining and Energy Union receipts cover? | “Mining.” | “The Mining and Energy Union receipts are recorded in financial years 2001-02, 2002-03, 2021-22, 2023-24 and 2024-25.” |

The years answer came from a fresh annual tool call. These are the five financial years with recorded donor receipts. The lifetime aggregate separately states the dataset's financial-year window, 1998-99 to 2025-26, now displayed as “(1 July 1998 to 30 June 2026)”. Tests cover both the aggregate window and the complete annual series.

Local request/response captures and logs are retained, untracked, in `portal/private/ask-fix-followup/`. The committed fixture retains the actual local request context and baseline answer shapes. Regression tests exercise JSON, buffered SSE deltas, fragment repair, Unicode citation remapping, readable date boundaries, missing exclusion evidence, unrelated questions, and a three-follow-up Worker thread with fresh tool calls.

## Validation

- `npm run typecheck`: passed.
- Focused tests across receipt tools, writing, grounding, routing and existing money regressions: 289 passed.
- Full `npm test`: 4,319 passed, zero failures.

Local commit only. No push, rebase, merge or deployment.
