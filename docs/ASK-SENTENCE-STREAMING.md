# Checked sentence streaming for Ask

Fresh research SSE responses stream checked sentences from the answer tool and the record writer. Their model, prompts, tool selection, token ceilings, spend reservations and final payload fields stay the same. JSON requests continue to use the non-streaming SDK transport. The answer baseline is commit `9fc487882701b3745c1e209836c75416f95fe770`; the before/after performance comparison below uses the safe, completion-held implementation at `240a39b79c67cb44defda1e97c2c245514745294`. The final answer is pinned to the 16 pre-change offline replay answers in `portal/test/fixtures/ask-replay/answers.json`.

The SDK streams JSON internally. A complete sentence record includes its text, fact or passage IDs and coverage flag, in either property order. Partial strings and incomplete records never become answer text. The boundary recognises titles and initials, `Mr.`, `No. 3`, `s. 12`, decimals and `$1.5m`. A quotation spanning several sentences stays together until it closes and has been checked.

`Progress.answer` is an internal callback. Loop points start streaming during argument generation when the deterministic preconditions already pass at `tool-input-start`. Each complete point is checked against the same gathered evidence and roster as the final answer. Calls needing record selection or a subsequent writer stay held. Unknown later failures use retry recovery. The writer continues to release complete sentence records while generation runs. The callback passes verified cumulative records to the same language, grounding and presentation functions used at completion. Only that checker can produce the private sentence frames. `withAnswerLanguage` converts them to ordinary `delta {text}` frames, removes the private frames and releases the remaining checked tail immediately before `done`. The released lead is passed to final grounding and shaping as a fixed prefix. `leadWithFinding` and `leadWithAuthority` cannot reorder across that boundary. Tests assert exact equality between the concatenated deltas and `done.answer`. If another check still changes the prefix, the boundary sends `retry`, the full checked answer as one delta, then `done`. Both existing clients clear their streamed text on `retry`. A structured `research_loop_stream_reset` counter records the reason and character counts, never answer or source text. Every fresh research stream completion logs `research_loop_stream_complete {count:1,retries,preview_chars,answer_chars}`. Counting completions with retries against all completions supplies the production retry rate. Every emitted or passed-through retry clears the server prefix and held delta buffers, matching both clients. Frames after `done` are ignored, and the route and writer close their preview callbacks at completion.

## Check inventory after the 13 November minimum-checks change

| Check | Scope | Streaming treatment |
| --- | --- | --- |
| Exact lookup, question scope and tool period guards (`guardExactLookupResult`, `guardToolPeriod`, `factLines`) | Sentence plus gathered facts; selection happens before writing | Reused unchanged. An exact lookup correction that will be prepended holds the answer tail from the opening. |
| Complete structured record and citation IDs | Sentence | An incremental scanner visits each JSON character once and returns only newly completed array entries. Never release the text property before its evidence IDs and coverage flag arrive. |
| Passage selection, full speaker name, recorded chamber and citation ranges | Sentence plus gathered passages | Reuse `draftAnswer`, `verifyResearchPoints` and `withRecordedChambers` on complete point records before acceptance, after the deterministic call gates pass. Record selections go through the record writer first. Writer previews run the public grounding boundary once per new sentence record, rather than grounding it three times. |
| Plain public language, headings, list markers, punctuation and empty paragraphs | Sentence; lead cleanup also needs the settled opening | Reuse the public boundary. Do not manufacture a fallback when a partial prefix becomes empty. |
| Unsupported quotation marks | Sentence plus cited evidence | Reuse quote repair before emission. An unheld quotation is emitted as paraphrase, with no temporary quoted version. |
| Dollar owner, donor and reporting-period attribution | Sentence plus cited money records | Reuse `moneySentenceEdits`. Correct from an unambiguous record or omit the sentence. A figure in a speech is still not treated as a money record. |
| Official findings supported only by a member's speech | Sentence plus cited speaker, date and chamber | Reuse spoken-finding attribution before emission. |
| Repeated sentences, claim identities, figure sets and source-aware duplicates | Sentence plus preceding records | Reuse cumulative verification. Drop repeated lines and preserve the separators between surviving text in JSON, SSE, fallback and cache responses. Case-variant duplicates retain the first wording and merge citations, including citation upgrades after release. |
| Incidental coverage notes | Sentence classification; relevance uses the gathered finding | Reuse coverage normalisation. Notes remain metadata; a limitation-only prefix stays held. |
| Quantitative primary/headline promotion | Needs the selected primary and potentially a later sentence | Primary facts are known before writing. Hold the affected opening until the writer has included its required headline, requested owners/amounts and vote split. |
| Required requested figures, recipients and aye/no split (`keepsAll`, `withRequired`) | Whole-answer presence test | Keep the existing test. Preview starts only once every requirement survives grounding. An incomplete draft cannot become a visible substitute. |
| Unrecorded lending language in receipt answers (`saysLent`) | Whole writer draft | Hold that draft until the existing complete-draft decision. This can replace the entire draft with recorded facts, so its affected tail starts at the opening. |
| Findings before debate claims or inquiry metadata (`leadWithFinding`, `leadWithAuthority`) | May need a later finding | Hold a mutable opening. Once the first on-topic official finding is settled, release that lead and retain the displaced context as the tail. Freeze every released lead during subsequent shaping, including when later cited speakers change the direct-lead predicate. An off-topic or relayed finding remains held when a later finding can still outrank it. |
| Combining fixed passage points with record prose (`appendWrittenPoints`, `leadWithModelAnswer`) | Needs the known points and the writer's record opening | Preview the same composed payload as completion, after the writer's required-content checks. Retain mutable ordering tails. |
| Person-overview excerpt completion (`completePersonOverview`) | Whole selected source list | Stream checked model points. Defer only the appended source excerpts until the complete source list is known; partial grounding never inserts provisional excerpts ahead of later model points. Final excerpts and citations remain unchanged. |
| Protected decisions and ambiguous surnames | Decision plus known identity context | Retain refusal, clarification and limitation ordering. Exact lookup corrections stay held; the known alternative-name hint appends after the checked answer. |
| Missing-answer, no-record and record-summary recovery (`ensureAnswerText`) | Whole completed response | No provisional fallback is emitted. Existing fallback paths retain their complete-response hold. |
| Spend, daily budget, limiter, credits, token and wall-clock caps | Request/call scoped | Existing admission and settlement remain unchanged. Streaming does not add a turn, model, provider or allowance. The writer stops 50 ms before its enclosing deadline and returns its complete checked released sentences. The enclosing race also retains that checked partial if provider cleanup stalls. If the request deadline expires after checked text was sent, the route sends `done` with that exact prefix and a short cut-short sentence. If nothing streamed, the existing planner fallback allowance and terminal error behaviour remain in place. With nothing released, a provider failure keeps the original facts fallback; partial raw JSON never becomes `lastDraft`. Completed drafts and released partials retain the required headline, recipients and vote split checks. |
| Claim, figure, entity, period, quotation and style audits | Telemetry only after the minimum-checks cut | Remain telemetry. No removed semantic rejection has been reintroduced. Style's existing direct-lead predicate only decides when a prefix is stable enough to release. |

The fallback period comment still applies. Fallback and cached text has not passed the shared writing/language and period boundary. A period mismatch now adds coverage metadata rather than replacing prose, but quote repair, money attribution and legacy normalisation can still change the text. Those paths continue to hold their original deltas. Unchanged cached answers replay the same frames after validation; changed cached answers release only their checked `done` payload.

Neither `mobile/src/features/ask/stream.ts` nor `portal/public/app.js` handles a `replace` SSE event. Normal delivery therefore uses option (a), holding the affected tail. The existing `retry` event is used only for unexpected prefix changes. Mobile `controller.ts` clears `streaming` and web `app.js` calls its reset handler on retry. No client change is required.

## Loop rejection and settlement inventory

No existing rejection, limiter or settlement rule is removed. Preview work restores the answer tally and selected-points state after checking a prefix, so provisional checks cannot change the final selection or its telemetry. If argument generation stops at the wall or output ceiling, the latest checked point snapshot is verified again as salvage.

| Rule or failure | Knowable before argument generation? | Treatment |
| --- | --- | --- |
| Missing model/key; exhausted research credits | Yes, before the call | Existing admission rejects before any provider stream. The preview gate also requires unblocked credits. |
| Round ceiling; input/output token reservation; model limiter; question spend cap; daily budget refusal or unavailable database | Yes, in awaited `prepareStep` | Admission stays unchanged. Preview requires an admitted reservation and a round within the configured limit. It makes no second limiter, budget or model call. |
| Parent cancellation, research wall time, an existing failed state or a finished terminal call | Current state is known; later expiry/failure is not | Gate on the known state at answer start, and hold new previews in the final six seconds of the research wall. A later request deadline completes the released checkpoint with a cut-short notice; other final divergence uses retry recovery. |
| A lookup must have run (`steps.length`) | Yes | Round-one answers without a completed lookup stay private. A failed/empty lookup still counts as a run, as before; recovery instructions are not a new semantic rejection. |
| Numerical shape answered with `answer` instead of `finish` | Yes | Only qualitative `answer` calls preview. Numerical finish selections stay held. |
| Required introduction list and focussed fact selection | Yes, from gathered records | Introduction-list answers stay held for their complete selection and record rendering. |
| Hearing evidence requires the eligible royal-commission/integrity transcript record kinds and turns | Yes for gathered evidence; selection arrives later | Hold hearing selections and keep their existing transcript checks and writer/record path. |
| Bill-speech answer requires speech points, rather than metadata alone | Gathered kinds are known; point content arrives later | Hold when no speech passage is gathered. Check each completed point with the existing answer verifier. Empty points still reject. |
| Record facts or non-speech/bill passages can enter `writeRun` | Yes | Hold this call's points for the existing record selection and writer. No provisional record prose escapes. |
| Independent lookups in flight; terminal calls wait for all of them | Current in-flight set is known | Hold if any lookup is in flight at answer start. Calls emitted later in the same provider response remain a residual risk handled by retry if the result changes. |
| Invalid tool schema, extra properties, field lengths, more than eight points | Per completed point; whole JSON only at close | Validate completed point records before preview. The SDK `jsonSchema()` declaration has no runtime `validate` function. Preview code explicitly checks each complete point's allowed keys, types and lengths and the eight-point maximum. At execution, existing semantic checks verify lookup history, usable points/facts and question scope; full-call schema extras are not rejected. Malformed JSON or unresolved top-level references can still invoke recovery. |
| Unresolvable top-level `$N`/`$N.party` references | Only when those arguments finish | Existing `resolveArgs` rejection stays. Structured points themselves are not reference-expanded; a later invalid top-level argument uses retry recovery. |
| No usable points/facts; empty answer; insufficient time for a repair | Per completed point; final emptiness at close | Call `draftAnswer` on complete records and emit nothing for an empty checked prefix. Final answer acceptance and repair decisions stay unchanged. Legacy text/citation calls wait for acceptance because their anchors may arrive last. |
| Stray, repeated or non-record fact IDs; full-name scope; count relevance; named entity scope; metadata/coverage filtering | Selection/content dependent | Existing filters discard unusable selections rather than adding a new rejection. Fact selections stay held for their existing renderer. |
| Pay comparison missing a requested person/party | Requires complete selected facts | Hold record selections. Keep the existing complete-comparison rejection. |
| `finish` rejects invalid fact IDs, missing introduction lists, bill-speech metadata, missing hearing transcripts or no usable fact lines | Selection dependent | `finish` has no point preview lane. Existing validation and rendering are unchanged. |
| Result byte ceiling; terminal call after another finish; invalid tool calls; forced tool-choice violation; no terminal answer at the round/call ceiling | Some state is known; complete result/provider response is not | Keep all existing checks and salvage. Only the first answer call in a step may preview. Later divergence uses retry rather than a dead stream. Only lookups count against the call cap; terminal tools remain reachable. |
| Reported usage exceeds the token ceiling; provider disconnect, timeout or credit error | No | Existing accounting and salvage run. An accepted final answer still wins. If the wall or output ceiling interrupts argument generation, salvage uses the latest complete checked points without another model call. Other final divergence uses normal fallback and checked retry recovery. |
| Previous-turn settlement in `prepareStep`; final settlement after generation | Previous settlement finishes before the next call; final receipt/failure is unknown | Keep `settle()` and its `daily_budget_unavailable` failure. No charge is refunded early to permit a preview. |
| `finally` settlement, missing provider receipt and cleanup failure | No | Preserve conservative ceiling charges, existing receipt-based refunds and cleanup handling. Preview errors cannot enter the research-failure path. |
| Last bounded salvage call after a stopped run | No, until a stop | Keep its stop-reason, remaining-time, token, credit and spend checks and one-call maximum. This recovery call remains on `generateText` and is delivered after final verification. |
| Exact lookup correction before the loop | Yes, in `runAgentic` | The existing loop and writer preview callbacks stay disabled because that correction must lead the answer. |

## Offline verification

All 16 replay cases run through the actual Worker route, with a scripted SDK model, fixture-backed services and a refused external network. The assertions pin the pre-change answer bytes, citation equality, API shape, model turn count and the delta/done contract. Focused tests additionally block the writer before its final token and read the first public delta while `done` is unavailable, test every JSON token split, test dropped and corrected money sentences, test paraphrased quotes and test unchanged/changed cached replay. The independent review's bill-then-speaker, rejected-answer-then-search and 1.5-second writer-cap repros are ported into the real test suite. Additional tests cover research-to-planner fallback, an outer writer race, late previews, required-headline and receipt holds, on-topic authority findings, exact-lookup holds and person-overview excerpt deferral. Further regressions block the loop after its first point, throw on the first and second preview in the loop, writer and composition boundary, pass a planner retry through the public boundary, and expire the real route deadline before and after a checked sentence. Check exceptions log one `research_loop_preview_error {stage,count:1}`; deadline and disconnected-reader send failures do not count as check exceptions. Both disable further previews for that answer and leave generation, final verification and billing intact. The reviewer probes run only from a scratch clone.

Paced runs use approximately 40 tokens/s, estimating four JSON characters per token. Pacing includes citation IDs and JSON syntax. The fixture emits on a fixed clock, so verification time does not silently reduce the provider's rate. First text is measured at arrival of the first parsed public `delta`, or at `done` when no delta is available. Timings include local routing and scripted research turns; deterministic pay and identity cases are included. These are offline measurements, not production latency claims.

Measured at approximately 40 tokens/s on all 16 cases after the round-3 fixes. Before is `240a39b79`; both runs use the same scripted model and the same refusal of external requests. Early characters are deltas received at least 100 ms before `done`, divided by the final answer length. First-delta lead is the time from the first delta to `done` (zero for text delivered only in `done`). Retries count the events the clients actually consume.

| Case | Path | Early chars before | Early chars after | First-delta lead before | First-delta lead after | Retries before / after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| robodebt | loop points | 0% | 76% | 0.007 s | 2.613 s | 0 / 0 |
| sports-rorts | loop points | 0% | 71% | 0.000 s | 2.934 s | 0 / 0 |
| money-ranking | writer | 63% | 63% | 1.086 s | 1.088 s | 0 / 0 |
| pay | fixed text | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| identity | fixed text | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| vote | record selection | 0% | 0% | 0.028 s | 0.028 s | 0 / 0 |
| why | loop points | 0% | 77% | 0.000 s | 2.812 s | 0 / 0 |
| what-happened | loop points | 0% | 64% | 0.000 s | 2.307 s | 0 / 0 |
| ambiguous-surname | loop points | 0% | 52% | 0.000 s | 0.606 s | 0 / 0 |
| off-topic | fixed text | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| accountability-robodebt | loop points | 0% | 46% | 0.007 s | 1.808 s | 0 / 0 |
| accountability-blame | loop points | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| accountability-decided | loop points | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| robodebt-live-r100 | record selection | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| spoken-finding | loop points | 0% | 0% | 0.000 s | 0.000 s | 0 / 0 |
| robodebt-report-cited | writer | 100% | 100% | 0.930 s | 0.928 s | 0 / 0 |

Across all answer characters, early delivery increased from **8.0% to 34.4%**. Six of the eleven cases previously grouped as loop answers now deliver text early. The two record-selection cases render complete selected facts; they do not have a token-by-token prose writer. The three fixed-text cases still arrive at completion. The two writer cases retain progressive delivery.

Three point answers still hold their opening: `accountability-blame`, `accountability-decided` and `spoken-finding`. Their initial debate claim, off-topic finding or relayed speech finding can give way to a later official finding. The affected opening stays held until that choice is settled. This is a measured limitation, and the table does not count a burst immediately before `done` as streaming.

| Time to first answer text | Before | After |
| --- | ---: | ---: |
| p50 | 2.817 s | 2.090 s |
| p95 | 5.064 s | 4.346 s |

All **16/16** final answers are byte-identical to the original answer snapshots and to the before run. All sixteen retry counts are zero. Model-call counts, citations and API shapes remain pinned. The paced replay gate additionally requires at least 30% of all answer characters to arrive 100 ms before completion, so restoring the completion-wide loop hold fails the gate.

Final gates passed: `cd portal && npx tsc --noEmit`, 262 focused checks, all 16 paced replay cases (17 assertions), then the full portal suite with **4,998 passing tests** at concurrency 4 through `jest-slot.sh`. Nine scratch-clone mutations each fail their targeted regression: non-speech/bill passage kinds, lookups in flight, hearing selection, bill-speech selection, per-point schema, tally restoration, checked pending-point salvage, the six-second hold and the second-answer gate. All seven round-3 reviewer harness cases finish with matching client/done text, two model calls and zero retries. Local generated search, crawl, hub and growth assets from the previous run remain excluded from the change.


To reproduce a paced run, from the repository root:

```sh
ASK_REPLAY_TOKENS_PER_SECOND=40 ASK_REPLAY_RESULTS=/tmp/ask-stream-timings.json \
  /Users/jake/Projects/opax-ios/.ops/tools/jest-slot.sh \
  node --test --test-concurrency=4 portal/test/ask-replay.test.mjs
```

`ASK_REPLAY_ENTRY` optionally points at an unchanged baseline Worker source tree. It uses the same model script and services. The answer snapshots remain asserted on both versions; only the newly introduced progressive-delta assertion is skipped for the baseline entry.

The transport uses the installed AI SDK 7 `streamText`/`fullStream` API and retains the existing generation lifecycle callbacks. See the [official SDK streaming reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) and [Workers streaming guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

Review round 3 also covers checked pending-point salvage at the wall and output ceiling, the hold during the final six seconds, two answer calls in one step, per-point schema validation, tally restoration and each held-selection clause. Case-variant duplicates keep the first wording and merge citations. Later citation upgrades cannot rewrite a released opening. Removing a repeated figure preserves the earlier lines and separators. A failed planner fallback after released text ends with the checked prefix, a cut-short notice and `done`, including fallback SSE error frames. `research_loop_stream_cut_short` counts these completions by deadline or fallback failure. `research_loop_stream_complete.preview_chars` counts all preview characters released across retries, while the current prefix resets on each retry.
