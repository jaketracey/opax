# Ask: suppress unsupported machine answers

Branch: `web/ask-no-answer`. Local commit only; no push, merge or deployment.

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
./node_modules/.bin/wrangler dev --local --config test/fixtures/ask-no-answer-wrangler.jsonc --port 8793
```

In a second terminal, run `test/ask-no-answer-browser.mjs` with `OPAX_PLAYWRIGHT_MODULE` pointing to an installed Playwright module and `OPAX_BROWSER_EXECUTABLE` pointing to Chrome. The minimal asset mirror avoids a file-descriptor failure from watching the entire export; it links the actual app assets and required data.

Shots in `portal/private/ask-no-answer/`:

- `declined-390.png`, `declined-820.png`, `declined-1440.png`
- `grounding_failed-390.png`, `grounding_failed-820.png`, `grounding_failed-1440.png`
- `answered-390.png`, `answered-820.png`, `answered-1440.png`

`chat-`-prefixed shots cover the same cases and widths in chat. Declined and grounding-failed chat results were also checked after reload.

`browser-proof.json` records all 18 checks, one stubbed Ask request each, no page errors, no horizontal overflow, and identical normal-answer DOM with the additive flag.

The complete Node 24 suite passed: 1,506 tests, zero failures, including donor and directory checks, using `ox-heavy.sh node --test --test-concurrency=6 test/*.test.mjs`. TypeScript and all 18 browser checks also passed. `build:release`, `npm run check` (including regenerated Worker types and `tsc --noEmit`), and Wrangler `deploy --dry-run` all passed. The release build, check, and dry-run ran together under the heavy wrapper. The baseline SHA-256 of `portal/public/votes.json` is `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.
