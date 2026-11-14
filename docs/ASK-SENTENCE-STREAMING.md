# Checked sentence streaming for Ask

Fresh research SSE responses stream checked sentences from the answer tool and the record writer. Their model, prompts, tool selection, token ceilings, spend reservations and final payload fields stay the same. JSON requests continue to use the non-streaming SDK transport. The baseline is commit `9fc487882701b3745c1e209836c75416f95fe770`. The final answer is pinned to the 16 pre-change offline replay answers in `portal/test/fixtures/ask-replay/answers.json`.

The SDK streams JSON internally. A complete sentence record includes its text, fact or passage IDs and coverage flag, in either property order. Partial strings and incomplete records never become answer text. The boundary recognises titles and initials, `Mr.`, `No. 3`, `s. 12`, decimals and `$1.5m`. A quotation spanning several sentences stays together until it closes and has been checked.

`Progress.answer` is an internal callback. Loop points are released only after the answer call has been accepted and the run has settled, so rejected arguments and runs falling back to the planner cannot leak text. The writer continues to release complete sentence records while generation runs. The callback passes verified cumulative records to the same language, grounding and presentation functions used at completion. Only that checker can produce the private sentence frames. `withAnswerLanguage` converts them to ordinary `delta {text}` frames, removes the private frames and releases the remaining checked tail immediately before `done`. The released lead is passed to final grounding and shaping as a fixed prefix. `leadWithFinding` and `leadWithAuthority` cannot reorder across that boundary. Tests assert exact equality between the concatenated deltas and `done.answer`. If another check still changes the prefix, the boundary sends `retry`, the full checked answer as one delta, then `done`. Both existing clients clear their streamed text on `retry`. A structured `research_loop_stream_reset` log records the reason and character counts, never answer or source text. Frames after `done` are ignored, and the route and writer close their preview callbacks at completion.

## Check inventory after the 13 November minimum-checks change

| Check | Scope | Streaming treatment |
| --- | --- | --- |
| Exact lookup, question scope and tool period guards (`guardExactLookupResult`, `guardToolPeriod`, `factLines`) | Sentence plus gathered facts; selection happens before writing | Reused unchanged. An exact lookup correction that will be prepended holds the answer tail from the opening. |
| Complete structured record and citation IDs | Sentence | An incremental scanner visits each JSON character once and returns only newly completed array entries. Never release the text property before its evidence IDs and coverage flag arrive. |
| Passage selection, full speaker name, recorded chamber and citation ranges | Sentence plus gathered passages | Reuse `draftAnswer`, `verifyResearchPoints` and `withRecordedChambers` after answer acceptance. Record selections go through the record writer first. Writer previews run the public grounding boundary once per new sentence record, rather than grounding it three times. |
| Plain public language, headings, list markers, punctuation and empty paragraphs | Sentence; lead cleanup also needs the settled opening | Reuse the public boundary. Do not manufacture a fallback when a partial prefix becomes empty. |
| Unsupported quotation marks | Sentence plus cited evidence | Reuse quote repair before emission. An unheld quotation is emitted as paraphrase, with no temporary quoted version. |
| Dollar owner, donor and reporting-period attribution | Sentence plus cited money records | Reuse `moneySentenceEdits`. Correct from an unambiguous record or omit the sentence. A figure in a speech is still not treated as a money record. |
| Official findings supported only by a member's speech | Sentence plus cited speaker, date and chamber | Reuse spoken-finding attribution before emission. |
| Repeated sentences, claim identities, figure sets and source-aware duplicates | Sentence plus preceding records | Reuse cumulative verification. Duplicate removal uses the original formatting for fresh JSON, SSE, fallback and cache responses. If this reflows a released prefix, the retry safety net resets it before delivering the full checked answer. |
| Incidental coverage notes | Sentence classification; relevance uses the gathered finding | Reuse coverage normalisation. Notes remain metadata; a limitation-only prefix stays held. |
| Quantitative primary/headline promotion | Needs the selected primary and potentially a later sentence | Primary facts are known before writing. Hold the affected opening until the writer has included its required headline, requested owners/amounts and vote split. |
| Required requested figures, recipients and aye/no split (`keepsAll`, `withRequired`) | Whole-answer presence test | Keep the existing test. Preview starts only once every requirement survives grounding. An incomplete draft cannot become a visible substitute. |
| Unrecorded lending language in receipt answers (`saysLent`) | Whole writer draft | Hold that draft until the existing complete-draft decision. This can replace the entire draft with recorded facts, so its affected tail starts at the opening. |
| Findings before debate claims or inquiry metadata (`leadWithFinding`, `leadWithAuthority`) | May need a later finding | Hold a mutable opening. Once the first on-topic official finding is settled, release that lead and retain the displaced context as the tail. Freeze every released lead during subsequent shaping, including when later cited speakers change the direct-lead predicate. An off-topic or relayed finding remains held when a later finding can still outrank it. |
| Combining fixed passage points with record prose (`appendWrittenPoints`, `leadWithModelAnswer`) | Needs the known points and the writer's record opening | Preview the same composed payload as completion, after the writer's required-content checks. Retain mutable ordering tails. |
| Person-overview excerpt completion (`completePersonOverview`) | Whole selected source list | Hold the affected overview tail until its source list is complete. Its appended excerpts and their citations remain unchanged. |
| Protected decisions and ambiguous surnames | Decision plus known identity context | Retain refusal, clarification and limitation ordering. Exact lookup corrections stay held; the known alternative-name hint appends after the checked answer. |
| Missing-answer, no-record and record-summary recovery (`ensureAnswerText`) | Whole completed response | No provisional fallback is emitted. Existing fallback paths retain their complete-response hold. |
| Spend, daily budget, limiter, credits, token and wall-clock caps | Request/call scoped | Existing admission and settlement remain unchanged. Streaming does not add a turn, model, provider or allowance. The writer stops 50 ms before its enclosing deadline and returns its complete checked released sentences. The enclosing race also retains that checked partial if provider cleanup stalls. With nothing released, a provider failure keeps the original facts fallback; partial raw JSON never becomes `lastDraft`. Completed drafts and released partials retain the required headline, recipients and vote split checks. |
| Claim, figure, entity, period, quotation and style audits | Telemetry only after the minimum-checks cut | Remain telemetry. No removed semantic rejection has been reintroduced. Style's existing direct-lead predicate only decides when a prefix is stable enough to release. |

The fallback period comment still applies. Fallback and cached text has not passed the shared writing/language and period boundary. A period mismatch now adds coverage metadata rather than replacing prose, but quote repair, money attribution and legacy normalisation can still change the text. Those paths continue to hold their original deltas. Unchanged cached answers replay the same frames after validation; changed cached answers release only their checked `done` payload.

Neither `mobile/src/features/ask/stream.ts` nor `portal/public/app.js` handles a `replace` SSE event. Normal delivery therefore uses option (a), holding the affected tail. The existing `retry` event is used only for unexpected prefix changes. Mobile `controller.ts` clears `streaming` and web `app.js` calls its reset handler on retry. No client change is required.

## Offline verification

All 16 replay cases run through the actual Worker route, with a scripted SDK model, fixture-backed services and a refused external network. The assertions pin the pre-change answer bytes, citation equality, API shape, model turn count and the delta/done contract. Focused tests additionally block the writer before its final token and read the first public delta while `done` is unavailable, test every JSON token split, test dropped and corrected money sentences, test paraphrased quotes and test unchanged/changed cached replay. The independent review's bill-then-speaker, rejected-answer-then-search and 1.5-second writer-cap repros are ported into the real test suite. Additional tests cover research-to-planner fallback, an outer writer race, late previews, required-headline and receipt holds, on-topic authority findings, exact-lookup holds and person-overview holds. Scratch-clone mutations demonstrate that each of the five previously uncovered guards fails on revert, along with acceptance, lead freezing, writer deadlines and retry recovery.

Paced runs use approximately 40 tokens/s, estimating four JSON characters per token. Pacing includes citation IDs and JSON syntax. The fixture emits on a fixed clock, so verification time does not silently reduce the provider's rate. First text is measured at arrival of the first parsed public `delta`, or at `done` when no delta is available. Timings include local routing and scripted research turns; deterministic pay and identity cases are included. These are offline measurements, not production latency claims.

Measured on all 16 replay cases (nearest-rank percentiles):

| Time to first answer text | Before | After |
| --- | ---: | ---: |
| p50 | 2.939 s | 2.811 s |
| p95 | 5.200 s | 5.066 s |

All 16 completed answers are byte-identical to the baseline, including with pacing enabled. No replay requires retry recovery. The p50 reduction is 4.4%; the p95 reduction is 2.6%. Acceptance holds reduce the earlier apparent gain, which included previews that could still be rejected. The money-ranking writer still starts at 2.535 s instead of 3.600 s, and the report-cited Robodebt writer starts at 4.262 s instead of 5.200 s. Cases whose opening remains mutable still wait for its existing whole-answer decision. For example, the ambiguous-surname overview waits for source-list completion, and a relayed accountability finding waits when another finding could outrank it.

Final gates passed: `cd portal && npx tsc --noEmit`, 241 focused checks, all 16 paced replay cases (17 test assertions), and the full portal suite with 4,977 passing tests at concurrency 4 through `jest-slot.sh`. The fresh worktree needed local generated search, crawl, hub and growth assets; they were built from the existing exports. No generated asset changes are part of this commit.

To reproduce a paced run, from the repository root:

```sh
ASK_REPLAY_TOKENS_PER_SECOND=40 ASK_REPLAY_RESULTS=/tmp/ask-stream-timings.json \
  /Users/jake/Projects/opax-ios/.ops/tools/jest-slot.sh \
  node --test --test-concurrency=4 portal/test/ask-replay.test.mjs
```

`ASK_REPLAY_ENTRY` optionally points at an unchanged baseline Worker source tree. It uses the same model script and services. The answer snapshots remain asserted on both versions; only the newly introduced progressive-delta assertion is skipped for the baseline entry.

The transport uses the installed AI SDK 7 `streamText`/`fullStream` API and retains the existing generation lifecycle callbacks. See the [official SDK streaming reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) and [Workers streaming guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
