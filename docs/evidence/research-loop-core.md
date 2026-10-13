# Research loop core: local gate evidence

Branch: `web/research-loop`. Baseline commit:
`7ebabb229fdb03b793d46407721fb3cab172f9e2`.
Implementation and app compatibility follow the orchestrator's 04:00 contract and
the operator-eval/credit follow-up and round 3 grounding review. This is a local handoff, not a deployment
receipt. The release default is `RESEARCH_LOOP=shadow`; the orchestrator owns rollout.

## Gates

- `npm run check`: passed (runtime types, TypeScript, tokens, stamps, donor index).
- `npm run build:release`: passed for the merged release assets (search/release assets, stamps,
  photo identity check). The generated grants-map licence line-ending change was
  restored; no unrelated generated asset is committed.
- `node --test --test-concurrency=4 test/research*.test.mjs test/agentic*.test.mjs test/ask*.test.mjs test/generation-cache.test.mjs test/model-budget.test.mjs`:
  **413 passed, 0 failed/cancelled/skipped**, approximately 9.7 seconds. Includes
  `ask-steps`, `ask-research-sources`, and the merged eval harness tests.
- Worktree-local `npx --no-install wrangler deploy --dry-run --env="" --outdir .wrangler/research-loop-round3`: passed.
- `git diff --check`: passed.
- `votes.json`: byte-identical to baseline; SHA-256
  `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Runtime for the follow-up Mac gates: `v26.10.0`; worktree Wrangler `4.127.1`.
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
| Integrated research loop, UI and evals | 6,914.73 | 1,923.54 |
| Delta | **+704.35** | **+139.70** |

Round 3 adds 5.82 KiB raw / 1.27 KiB gzip to the round 2 Worker bundle.
The final raw bundle is about 6.75 MiB, below the current
[64 MiB uncompressed limit](https://developers.cloudflare.com/workers/platform/limits/).
Gzip is a comparison metric, not a current deployment limit.

## Changed files

- Dependencies: `portal/package.json`, `portal/package-lock.json` (`ai@7.0.139`,
  `@openrouter/ai-sdk-provider@3.1.0`; existing Zod retained without new imports).
- Integration: `portal/src/agentic-ask.ts`, `agentic-tools.ts`,
  `agentic-response.ts`, `index.ts`, `env.d.ts`, `portal/wrangler.jsonc`.
- Loop and boundaries: `portal/src/research-loop.ts`, `research-types.ts`,
  `research-evidence.ts`, `research-monitor.ts`, `research-response.ts`,
  `research-budget.ts`, `research-credit.ts`, `research-eval.ts`, `generation-cache.ts`.
- Daily ledger: `portal/migrations/0017_research_daily_budget.sql`.
- Tests: `portal/test/research-loop.test.mjs`, `research-route.test.mjs`,
  `fixtures/research-app-decoders.mjs`, `agentic-parity.test.mjs`,
  `ask-no-answer-parity.mjs`, `research-budget.test.mjs`, `research-eval-usage.test.mjs`,
  `fixtures/research-budget.mjs`.
- Merged UI: `portal/public/{app.js,ask-steps.js,style.css}` and stamped pages;
  `ask-steps.test.mjs`, `ask-research-sources.test.mjs`, stream/browser fixtures.
- Merged evals: `scripts/research_eval.mjs`, `research_eval_grade.mjs`,
  `portal/test/research-eval.test.mjs`, `fixtures/research-evals*.json`.
- Design and evidence: `docs/design/research-loop.md`, this file.

The research cases cover multi-round execution; fact selection and deterministic
rendering; dedupe; round/call ceilings; wall/token caps; per-turn limiter refusal;
provider errors and malformed args; request dates; quote/citation rejection,
repair and fallback; off identity; route and shadow cancellation; all-question
routing; numerical questions outside the old classifier; shadow comparison;
JSON/SSE native decoding; cache replay and planner/loop cache isolation.
The follow-up cases also cover atomic dollar admission, unknown-billing retention,
provider receipts, operator-only JSON/SSE overrides, cache bypass, ignored
unauthorized headers, complete or unavailable usage, eval timeout/cancellation,
402/credit errors, no retry, and 15-minute cooldown/expiry.

The parity pins are **scoped to `RESEARCH_LOOP=off`**, not imposed on route output.
The focused run verified 192 ordinary bodies unchanged and all legacy fields in
68 agentic JSON/SSE bodies unchanged. The newly required optional `research`
metadata is the sole gold-body rebaseline. The old standalone no-answer parity script is explicitly off
as well; the test gate runs the maintained `agentic-parity.test.mjs`.

## Native compatibility and monitoring

The executable decoder extraction comes from the shipped iOS Ask model and SSE
parser. The Android parity checkout has byte-identical copies (module hashes are
in the design document). Tests decode numerical, qualitative, fallback and cached
JSON/SSE results; optional research fields do not alter required native fields.
Neither app worktree or any other lane's worktree was edited.

`research-route.test.mjs` verifies authenticated `x-opax-research: loop|old` in
both JSON and SSE while the global flag is shadow. It checks mode, steps, usage,
native decoding, no-store and zero shared-answer-cache reads/writes. Wrong or
missing bearer credentials, a missing operator secret, and invalid header values
retain the normal response and background shadow run. Validation errors under an
authorized override are no-store too.

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

Credit failures specifically log `reason: 'research_credit_exhausted'`; they do not
retry and open a 15-minute per-isolate cooldown. The separate D1 daily admission
cap defaults to US$5/UTC day (`RESEARCH_LOOP_DAILY_USD`). Each turn reserves its
remaining token allowance at a US$10/million ceiling or a higher configured price.
Only actual billing receipts permit refunds; estimates and unknown costs retain
the conservative charge. Missing/unavailable ledger fails closed for loop calls.
The existing fallback path retains its own model controls.

**Before shadow deployment:** the orchestrator must apply migration 0017 to
production `COMMUNITY_DB`, **`opax-community`** (id
`ea0ca399-189f-4fc0-83f8-66a41204a180`). This lane applied it only in local SQLite tests.
From this worktree's `portal/` directory, the exact pinned-CLI command is:

```sh
npx --no-install wrangler d1 migrations apply opax-community --remote --env=""
```

The empty environment selects the top-level production binding. The command
applies pending migrations, including 0017. It was documented, not executed.
The hub has confirmed the production provider secret is set; this lane did not
read, create or modify it.

The orchestrator owns secret readiness, quality evals, the five-question production
probe, merge and deployment. Roll back through `RESEARCH_LOOP=off`.

## Round 3 integration and grounding fixes

Merged `web/research-ui` at `a088d8417` and `web/research-evals` at `aa137bdd5`
into this branch. The core usage tests were renamed to `research-eval-usage.test.mjs`
before merging so both suites remain intact. Both merges completed cleanly.

- F1/F12: estimate next-call tokens as bytes/4; defaults 96,000 tokens (160,000
  ceiling), five rounds (six ceiling), 12-second wall. A realistic four-turn
  search/count/count/finish case reports 36,000 input + 2,000 output and succeeds.
- F2/F13: shadow skips cache HITs and requests without successful reader quota;
  samples at 0.2; checks the same fail-closed daily ledger before starting and
  reserves atomically in every `prepareStep`. Failed shadow runs never pay for
  another planner. Tests cover absent/failed limiters, thresholds, zero/malformed
  rates, daily refusal and unavailable D1.
- F3: covered claims cannot introduce another roster person unless the name is
  in the supporting quote; accepted `research.sources` carries `speaker`.
- F4/F5: numerical `answer` misroutes preserve `finish` and do not consume repair;
  rejected terminal drafts are referenced in instructions only by a SHA-256 hash.
- F6/F7/F8: ordinary loop failures and timeouts go directly to ordinary Ask;
  deterministic money/pay answers precede route inference with zero model calls.
- F9–F11/F14: filter search/read notes from numerical prose; emit `failed` for
  existing web clients; delete stale JSON content-length; remember SDK-swallowed
  tool errors and stop before another model call.
- Every stepped payload now has `research`, and every trail row has `round`,
  including committee checks. Fallback retains the executed trail; cached JSON
  and SSE retain grouping. This includes old-path failed tool steps that proceed
  to ordinary Ask. Prompt/tool versions are bumped to 6.
- Eval `--operator` and `--prod` send bearer auth plus `x-opax-research: old|loop`
  to the same base's `/api/ask`; no unused body mode hint or secret in reports.

All checks used fake providers/offline fixtures. No production migration,
deployment, Ask, auth, or model call was made.
