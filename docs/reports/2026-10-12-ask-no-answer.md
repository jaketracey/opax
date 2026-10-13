# Ask: suppress unsupported machine answers

Branch: `web/ask-no-answer`. Local commits only, including the requested merge of `origin/main`; no push or deployment.

The model response contract now requires `{"answered": boolean, "answer": string}`. The schema is included in the existing prompt and validated at the API boundary. The existing BYOK pipeline documents that it cannot combine `answer_json_schema` with `llm_footnotes`, so this uses the established prompt-level JSON approach and keeps the citation mode. No decision is inferred from the wording of the answer.

Both `/api/ask` and SSE `done` include `answered`. When false, `reason` is `declined`, `no_supported_claim`, or `grounding_failed`, and `answer` is empty. Sources remain, with citations cleared and `cited: false`. A server-derived `next_step` points to the roster person's canonical page, including explicitly selected speakers, or `/ask?view=search`. Deliberate declines are not retried or cached. The pipeline version retires previous cached drafts.

The existing original-passage, citation-range, quotation, topic, and position/number verification checks remain in the acceptance path. A draft still rejected after bounded recovery is suppressed. Original supported proposal quotations still work. Accepted answer text is unchanged by the decision field. Live drafts are held until verification finishes; SSE still reports progress, and validated cached answers can still replay as deltas.

The website renders exactly: “OPAX couldn't find a clear answer to this in the record.” It omits the answer's machine label and actions, opens the retrieved sources, and offers the record/profile link. Normal answers follow the existing render path. Web chat carries the decision through saved turns and avoids generated follow-ups for a declined answer.

## App impact (read-only inspection)

The iOS and Android apps share the React Native implementation under `/Users/jake/Projects/opax-ios/mobile/src/features/ask/`. They call `/api/ask?stream=1`. The additive fields do not break `decodeAnswer`, but that decoder currently drops them. The empty `answer` is accepted and `controller.ts` treats it as an `AskFailure('empty', ...)`; `AnswerView.tsx` still renders the machine label. The non-answer prose is no longer sent, but the apps need the same no-answer presentation.

Required app changes, outside this lane:

- `model.ts`: extend `Answer` and `decodeAnswer` with optional `answered`, the reason enum, and the validated `next_step` link. Preserve them in the web/account serialisation around `result.answer_status`; restore already passes saved result fields through `decodeAnswer`.
- `controller.ts`: when `answered === false`, treat the result as a successful search with no answer, rather than the empty-generation error. Keep its sources, persist the decision, and skip follow-up generation.
- `AnswerView.tsx`: branch on `answered === false` before `MachineLabel` and `AnswerBody`; show the exact plain line, retrieved sources, and a person-page or Search records link. Use the existing app link resolver for the canonical web path. Apply the same branch to restored results.

No files under `mobile/` were changed.

## Fixture verification

The actual Worker tests cover sync/SSE parity for declines, failed quote grounding, absent citations, and numeric-verifier rejection; they also cover a normal answer's exact text/citations and both inferred and explicit roster links. UI tests cover no machine block, the plain line, and retained sources. Browser QA uses local Wrangler with stubbed generation; the stub refuses every external destination. No production Ask, generation, voice, or auth requests were made.

Local QA reproduction (Node 24, installed portal dependencies):

```sh
node test/ask-no-answer-prepare.mjs
ulimit -n 8192
./node_modules/.bin/wrangler dev --local --config test/fixtures/ask-no-answer-wrangler.jsonc --port 8964
```

In a second terminal, run `test/ask-no-answer-browser.mjs` with `OPAX_PLAYWRIGHT_MODULE` pointing to an installed Playwright module and `OPAX_BROWSER_EXECUTABLE` pointing to Chrome. The minimal asset mirror avoids a file-descriptor failure from watching the entire export; it links the actual app assets and required data.

Shots in `portal/private/ask-no-answer/`:

- `declined-390.png`, `declined-820.png`, `declined-1440.png`
- `grounding_failed-390.png`, `grounding_failed-820.png`, `grounding_failed-1440.png`
- `answered-390.png`, `answered-820.png`, `answered-1440.png`

`chat-`-prefixed shots cover the same cases and widths in chat. Declined and grounding-failed chat results were also checked after reload.

`browser-proof.json` records all 18 checks, one stubbed Ask request each, no page errors, no horizontal overflow, and identical normal-answer DOM with the additive flag.

The complete Node 24 suite passed: 1,506 tests, zero failures, including donor and directory checks, using `ox-heavy.sh node --test --test-concurrency=6 test/*.test.mjs`. TypeScript and all 18 browser checks also passed. `build:release`, `npm run check` (including regenerated Worker types and `tsc --noEmit`), and Wrangler `deploy --dry-run` all passed. The release build, check, and dry-run ran together under the heavy wrapper. The baseline SHA-256 of `portal/public/votes.json` is `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

## 13 October review fixes

Merged `origin/main` (`2d24cb800fa566947b2e15e66b4f813ad9c8b188`) first, including sponsor links, the money-map fix and emu loader. The sole conflict was the generated app hash, regenerated from the merged JavaScript. The local merge commit is `70ee3e835`.

The reasoning fallback now verifies each cited claim against an individually cited passage in an already verified original speaking turn. It applies the original-turn and topic checks, `positionPointSupported` for numbers and policy details, and quotation grounding. Rejection returns `answered:false`, `reason:grounding_failed`, with answer and citations cleared. Accepted text is left unchanged. The numeric fixture now repeats the unsupported `$999999` claim in the reasoning fallback, after both strict attempts reject it; both routes must reject all three drafts.

Position recovery preserves an explicit decline from either its first attempt or its repair. It returns `reason:declined` immediately, without reaching another model call. Actual sync and SSE tests assert one generation call for a first-attempt decline.

Both routes use the existing sync retry rule: an empty or malformed response is retried only with at least five retrieved resources and a first attempt within the retry budget. A one-source empty response returns no answer after one call in either route. The fixture would return a supported answer on a second call, so the test detects an unwanted retry.

The source timeline hides “Cited in the answer” when no source is cited, while retaining the retrieved-source timeline and legend. Browser QA asserts the missing legend for no-answer results. The reproducible local server now uses port 8964, within the web port range required by the common brief.

Review-round validation: the final full suite passed **1,532/1,532**, with zero failures, cancellations or skips, including donor, directory and financial privacy checks. The focused checks passed **112/112**, and the corrected witness checks passed **12/12**. The first full run found a stale witness scope fixture that supplied only a catalog response and omitted the new verifier dependencies; it now supplies a structured answer, original passage and real verification helpers.

All **10/10** successful-response comparisons with `origin/main` passed, preserving every existing response field byte for byte apart from the additive `answered:true` field. This covers both sync and SSE for named overview, unnamed records, explicit speaker selection, supported position summary and supported reasoning fallback. Proof: `portal/private/ask-no-answer/fix-main-parity.json`; reproducible with `node test/ask-no-answer-parity.mjs`.

All **18/18** local browser checks passed again at 390, 820 and 1440 pixels, including saved chat restoration, zero page errors and no horizontal overflow. Screenshot paths remain those listed above, and `browser-proof.json` records the completed checks. The decline at 390, grounding failure at 820 and normal answer at 1440 were also visually inspected.

Node 24 `build:search` ran before tests. The complete suite, `build:release`, `npm run check`, standalone `tsc --noEmit` and Wrangler dry-run passed through `ox-heavy.sh`. `votes.json` remains byte-identical to `origin/main` and the initial lane baseline, with the SHA-256 listed above. All model responses were stubbed; no production Ask, generation, push or deployment occurred.
