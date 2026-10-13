# Research loop core: local gate evidence

Branch: `web/research-loop`. Baseline commit:
`7ebabb229fdb03b793d46407721fb3cab172f9e2`.
Implementation and app compatibility follow the orchestrator's 04:00 contract.
This is a local handoff, not a deployment receipt. `RESEARCH_LOOP=off`.

## Gates

- `npm run check`: passed (runtime types, TypeScript, tokens, stamps, donor index).
- `npm run build:release`: passed on final source (search/release assets, stamps,
  photo identity check). The generated grants-map licence line-ending change was
  restored; no unrelated generated asset is committed.
- `node --test --test-concurrency=4 test/research*.test.mjs test/agentic*.test.mjs test/ask*.test.mjs`:
  **345 passed, 0 failed/cancelled/skipped**, approximately 9.9 seconds.
- `wrangler deploy --dry-run --outdir .wrangler/research-loop-after`: passed.
- `git diff --check`: passed.
- `votes.json`: byte-identical to baseline; SHA-256
  `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Runtime for these Mac gates: `v24.21.0`; Wrangler `4.127.1`.
No desktop full suite, real OpenRouter request, production Ask, push, deployment,
key, secret or account creation occurred. The shared heavy wrapper stalled on an
existing empty lock; its own session was stopped and the authorized local build
ran directly at nice level 10. The shared lock was not edited or removed.

## Worker bundle

Both measurements use the same non-minified Wrangler dry-run and include Worker
JavaScript and bundled WASM; static asset directory size is not Worker size.

| | Raw KiB | Gzip KiB |
| --- | ---: | ---: |
| Baseline | 6,210.38 | 1,783.84 |
| Research loop | 6,897.20 | 1,919.36 |
| Delta | **+686.82** | **+135.52** |

The new raw bundle is about 6.74 MiB, below the current
[64 MiB uncompressed limit](https://developers.cloudflare.com/workers/platform/limits/).
Gzip is a comparison metric, not a current deployment limit.

## Changed files

- Dependencies: `portal/package.json`, `portal/package-lock.json` (`ai@7.0.139`,
  `@openrouter/ai-sdk-provider@3.1.0`; existing Zod retained without new imports).
- Integration: `portal/src/agentic-ask.ts`, `agentic-tools.ts`,
  `agentic-response.ts`, `index.ts`, `env.d.ts`, `portal/wrangler.jsonc`.
- Loop and boundaries: `portal/src/research-loop.ts`, `research-types.ts`,
  `research-evidence.ts`, `research-monitor.ts`, `research-response.ts`.
- Tests: `portal/test/research-loop.test.mjs`, `research-route.test.mjs`,
  `fixtures/research-app-decoders.mjs`, `agentic-parity.test.mjs`,
  `ask-no-answer-parity.mjs`.
- Design and evidence: `docs/design/research-loop.md`, this file.

The 22 new cases cover multi-round execution; fact selection and deterministic
rendering; dedupe; round/call ceilings; wall/token caps; per-turn limiter refusal;
provider errors and malformed args; request dates; quote/citation rejection,
repair and fallback; off identity; route and shadow cancellation; all-question
routing; numerical questions outside the old classifier; shadow comparison;
JSON/SSE native decoding; cache replay and planner/loop cache isolation.

The parity pins are **scoped to `RESEARCH_LOOP=off`**, not imposed on route output.
The focused run verified 192 ordinary and 68 agentic JSON/SSE bodies unchanged in
that rollback mode. The old standalone no-answer parity script is explicitly off
as well; the test gate runs the maintained `agentic-parity.test.mjs`.

## Native compatibility and monitoring

The executable decoder extraction comes from the shipped iOS Ask model and SSE
parser. The Android parity checkout has byte-identical copies (module hashes are
in the design document). Tests decode numerical, qualitative, fallback and cached
JSON/SSE results; optional research fields do not alter required native fields.
Neither app worktree or any other lane's worktree was edited.

The existing Worker observability sink receives:

```ts
{
  kind: 'research_loop_shadow', question_hash: string,
  planner: { steps, chosen_facts, rounds, ms, tokens, cost_usd, mode, failure },
  loop:    { steps, chosen_facts, rounds, ms, tokens, cost_usd, mode, failure },
  agreement: { facts: boolean, figures: boolean | null }
}
```

`steps` are tool names; chosen facts are local numeric ids. Facts are compared by
source/text identity internally, figures by selected bound values. No question,
answer, passage, raw args, labels, key or exception text is persisted. Ordinary
RAG metrics that the existing path does not expose are `null`. Failure records
use `research_loop_fallback` and a fixed reason with the usage gathered so far.

The orchestrator owns secret readiness, quality evals, the five-question production
probe, merge and deployment. Roll back through `RESEARCH_LOOP=off`.
