# Ask research loop

The 14 October 2026 04:00 shared contract makes this the engine for **all** Ask
questions when `RESEARCH_LOOP=route`. The existing numerical planner and ordinary
RAG path remain the automatic fallback. This lane prepares the implementation and
local gates; the orchestrator merges, evaluates and deploys it. No live Ask or
OpenRouter requests were used to build or test this lane.

## Request path

`apiAskRouted` selects `off`, `shadow` or `route`. In route mode it retains the
existing request validation, per-IP admission, cache transport and 40-second
`AskDeadline`. It calls `runAgentic` with `deps.research`, implemented by
`createResearch` using AI SDK `generateText`. The exact dependencies are
`ai@7.0.139` and `@openrouter/ai-sdk-provider@3.1.0`. The SDK accepts the existing
`TOOL_SPECS` through `jsonSchema`; no new Zod dependency is added.

The provider uses `@preset/opax-pro` and the optional Worker secret
`OPENROUTER_API_KEY`. Jake provisions that secret. A missing key immediately falls
back; it does not create a credential or use a different provider. Tests use
`ai/test`'s `MockLanguageModelV4`; route tests replace the provider factory with a
fake. The hub confirmed the production key is set. The release configuration now
defaults to `shadow`; this lane does not deploy it or call production Ask.

Every existing registered tool, including `electorates`, is available, together
with `search`, `read_passage`, `finish` and `answer`. Tool execution is serialized
so fact ids and progress ids remain ordered even when a model returns several
parallel calls. Request dates and explicit scopes pass through `periodPlan` before
execution. Original and scoped arguments are validated. Identical scoped calls
share their first result; `prepareStep` tells the model what already ran and
restricts a repeating model to terminal tools. No tool accepts an arbitrary URL or
writes to an external system.

Route mode first tries the existing published money and pay calculations. They
return their cited calculations in JSON/SSE with zero model usage, without calling
the money overview generator. Questions those calculations cannot answer proceed
to the loop. A numerical `answer` misroute leaves only `finish` active and does not
consume the qualitative repair allowance. Terminal drafts appear in subsequent
instructions only as `answer#<SHA256>`, never as full draft text or quotes.

`search` performs bounded Nuclia `/find` retrieval with the existing Ask filter
builder. `read_passage` accepts only an id returned by this request's search,
bounds search passages to 1,200 characters, reads the original record through the existing resource handler, and verifies
that the selected passage is in that record. The resource handler and evidence
adapter retain SA excerpt policy. Named-person evidence must be inside the
original first speaking turn. Generated fields and news cannot be cited.

For numerical questions, `finish({facts: number[]})` chooses ids from `factSheet`.
Passage snippets and people lookups cannot be selected as numerical evidence.
The existing plan scope checks, completeness/`no_supported_claim` checks,
committee supplement, `selectAnswerFacts` and `templateAnswer` still own the
answer. The model's free text is ignored. Fact ordering remains deterministic.

For qualitative questions, `answer` supplies:

```ts
{ text: string, citations: [{ id: string, quote: string,
                             start: number, end: number }] }
```

Offsets are Unicode code points into `text`, matching existing Ask citations.
Every claim must be covered by a valid range bound to a passage the loop read.
Supporting quotes must occur literally in original evidence. Existing
`originalContext`, `unsupportedQuotes`, `guardPositionAnswer`, `positionEvidence`,
`positionPointSupported`, eligibility checks and first-turn checks are reused.
Short quotes are checked too. The existing no-causation expression applies.
A rejected draft gets one repair turn with only `answer` available; another
failure returns to the old path. No unsupported quote is silently unquoted.
This verifies citation/quote integrity and existing position constraints; it is
not a general semantic entailment model.
Each citation's covered claim is also checked against the public roster: named
people must match the passage speaker or occur in the supporting quote. Accepted
sources carry the passage speaker into `research.sources`.

## Caps and fallback

| Control | Default | Ceiling / behavior |
| --- | --- | --- |
| `RESEARCH_LOOP_STEPS` | 5 model turns | 6 |
| Actual tool calls | 6, including terminal tools | Duplicates reuse output |
| `RESEARCH_LOOP_MS` | 12,000 ms | 30,000 ms; also limited to request time minus 8,000 ms |
| `RESEARCH_LOOP_TOKENS` | 96,000 cumulative loop tokens | 160,000 |
| `RESEARCH_LOOP_DAILY_USD` | US$5 per UTC day | Atomic D1 admission before every loop turn; invalid/zero disables inference |
| `RESEARCH_LOOP_SHADOW_RATE` | 0.2 | Metered cache misses only; invalid/zero disables shadow |
| Output per turn | 1,800 tokens | Reduced by remaining token reserve |
| Tool result entering context | 16,384 UTF-8 bytes | Includes the current fact sheet |
| Tool execution | Existing 12,000 ms bound | Also bounded by request and loop signals |
| Retry / repair | Provider retries disabled | One qualitative answer repair, within all caps |

Token admission estimates the next call in tokens using `ceil(UTF-8 bytes / 4)`
for messages, schemas, instructions and framing. This estimate is added once to
cumulative reported usage from previous calls; reported input and output usage is
accumulated and checked again before client-side tools. Missing usage is charged
against the reserved input and output rather than treated as zero. Cached input and reasoning
tokens are included by the SDK's total usage. The cap governs the loop attempt;
the fallback retains its existing planner/RAG token limit and shared request
wall budget.

`modelBudgetSpent`/`MODEL_LIMITER` is checked in the awaited `prepareStep` before
**every** provider call, with `maxRetries: 0`. This is intentionally not a throwing
telemetry callback: SDK 7 lifecycle callbacks may swallow callback errors. The
existing fallback calls still pass through `kbFetch`'s aggregate limiter.
Provider-reported cost is preferred; configured input/output prices supply an
estimate when cost is absent (defaults US$1 input / US$3 output per million).

The separate daily dollar guard uses `COMMUNITY_DB`, with migration
`0017_research_daily_budget.sql`. An atomic `INSERT ... ON CONFLICT ... RETURNING`
reserves the entire remaining request token allowance before each model call.
The reservation price per million tokens is the maximum of configured prices
and US$10. This is a conservative admission ceiling, not a provider price
guarantee; keep configured prices at or above the preset's rates.
A known provider receipt refunds unused reservation; an estimate cannot refund
the ledger. Without a receipt the full reservation stays charged. Unknown cost after timeout,
disconnect or crash retains the reservation. The ledger stores only UTC day and
integer microdollars, shared across isolates and locations. Missing table, D1
failure, or exhausted daily allowance refuses loop inference and falls back.
This limits direct research-provider admission, independently of the OpenRouter
key's credit limit; the existing old path keeps its own admission controls.
The orchestrator must apply migration 0017 before the first shadow deployment.

Production `COMMUNITY_DB` is **`opax-community`**, database id
`ea0ca399-189f-4fc0-83f8-66a41204a180`, in the top-level Wrangler configuration.
The orchestrator applies pending migrations, including 0017, with the worktree's
installed Wrangler (the empty environment explicitly selects top level):

```sh
cd /Users/jake/Projects/opax-ios-wt/research-loop/portal
npx --no-install wrangler d1 migrations apply opax-community --remote --env=""
```

This lane does not execute that production write. Command syntax is supported by
the [current D1 CLI documentation](https://developers.cloudflare.com/workers/wrangler/commands/d1/).

HTTP 402 and wrapped credit/insufficient-balance errors immediately fall back,
with no loop retry. They log `reason: 'research_credit_exhausted'` and open a
15-minute aggregate circuit breaker in that isolate. Further loop attempts skip
the provider until cooldown ends. A different isolate can encounter the limit
once before opening its own breaker. Refund cleanup uses `waitUntil`, so an
unavailable refund cannot delay the old answer or bypass the reserved charge.

The request signal and SSE reader cancellation abort model requests, tool fetches
and body reads. A Promise race also bounds a non-cooperative fake/provider.
After disconnect no paid fallback is started. Ordinary-question loop failures
and every loop timeout go directly to ordinary Ask inside the remaining deadline.
Other failures on an agentic question can invoke its old planner once, followed
by ordinary Ask if needed. A shadow failure records the failed attempt without
calling the already-served planner again. An expired request cannot start fallback.
SDK tool errors are remembered in `failed` before throwing because the SDK treats
tool throws as tool-error parts; `stopWhen` and the final check prevent another turn.

## Payload and app compatibility

SSE keeps `status`, `delta`, `retry`, `done` and `error`, and existing status shapes.
Tools emit `status {phase:'step', step}` with the same id for `running` and
`done`/`failed`, retaining the shipped web client's failure state. Labels remain fixed plain language; arguments are sanitized and
capped at 40 characters. Optional `tool`, `round`, `results` and `ms` fields are
added. Free model text is not streamed before verification.

`agenticAskPayload` retains `answer`, `answered`, optional `reason`, `citations`,
`sources`, `followups` and `agentic`. Every stepped answer, including the old
planner and fallback, carries the additive metadata:

```ts
research: {
  mode: 'loop' | 'planner', rounds: number,
  trail: [{id, tool, round, label, arg?, results?, ms, ok}],
  sources: [{title, url, date?, kind, speaker?}],
  ms?: number, tokens?: {input: number, output: number} | null,
  cost_usd?: number | null
}
```

Research sources contain only evidence used by selected facts or accepted
qualitative claims. The planner fallback uses its executed steps. An ordinary
RAG fallback preserves any executed loop trail rather than paying for a discarded
planner; a direct ordinary response has no tool trail. Used sources are copied
from the served payload. Numerical prose omits search/read-only sampling notes
while retaining the numerical tools' coverage notes. Existing fields survive unchanged. Cache hit/miss
headers and SSE cached replay remain in the current cache transport.
Every trail item carries its round, including post-loop committee checks, so a
cached response retains grouping without live events. Rebuilt JSON deletes its
old `content-length` header.

For operator evaluation, `/api/ask` accepts `x-opax-research: loop|old` only when
the existing `operatorAuthorized` bearer guard succeeds. `loop` forces route
within every cap; `old` serves the pre-loop planner/RAG route and suppresses
research shadow. Unauthenticated or invalid headers are ignored. Override JSON
and SSE responses carry `cache-control: no-store` and `x-opax-cache: BYPASS`, and
neither read nor write the edge or shared KV answer caches. Validation errors are
also no-store. Resource caches retain their existing behavior.

Each override's final `research` includes mode, latency, input/output tokens and
estimated USD. Usage includes failed loop turns and any subsequent old-path model
calls. A bounded observer reads old-provider consumption metadata while forwarding
the response bytes unchanged. If an old generation omits consumption, total tokens
and cost are `null`; missing usage is never presented as free inference. Existing
app fields and event names survive, and both native decoder fixtures accept the
override JSON and SSE payloads.

The merged `scripts/research_eval.mjs` uses those headers with the environment's
`DAILY_POST_OPERATOR_SECRET` when `--operator` or `--prod` is supplied. Both modes
use the same base URL and `/api/ask`; the request header selects old versus loop.
The secret is never printed or added to the report. Local non-operator runs may
still use separate configured fixture servers. The offline fixture runner, UI
round/count loader, research disclosure and merged source panel are integrated.

The native apps use the React Native Ask decoder and SSE parser in
`mobile/src/features/ask/{model,stream}.ts`. The iOS checkout and the Android parity
checkout contain byte-identical copies of both modules:

- `model.ts`: SHA-256 `b36fa7100da3e8123bd9579477793f5e15f2ff753c85c0688316ae3fc54d0079`
- `stream.ts`: SHA-256 `24b1fca670d0705a049a4860f40a46bab185f9b049d38d6223f8f2556dafa686`

`test/fixtures/research-app-decoders.mjs` is an executable extraction of
`decodeAnswer` and `AskStream` from those modules, avoiding a dependency on another
lane's checkout in CI. Route tests run real numerical, qualitative and fallback
JSON/SSE responses through that extraction, including incremental framing.
The Kotlin decoders under the Android voice module handle account/voice responses;
Ask uses the shared TypeScript decoder. Neither app worktree was edited.

## Flag, cache and shadow monitoring

`RESEARCH_LOOP=shadow` is the release default. The orchestrator flips it to `route`
after evaluation. `off` (including unset/unknown values) takes today's route unchanged.
Both prompt and tools versions are bumped. Loop cache keys additionally include
mode, preset, caps and record kind so planner/off answers cannot populate the
loop's cache. Conversation/prior-source requests remain unshared. Only complete,
cited successful results are eligible for storage under existing rules.

`shadow` serves the old response, including its additive stepped metadata. Cache
HITs and requests without a successful reader limiter token never run a shadow.
The remaining requests are sampled at 20% by default, then the primary D1 ledger
must have room for the first reservation. D1 failure fails closed in this gate;
the atomic `prepareStep` reservation still enforces admission under concurrency.
A capped loop runs alongside a sampled miss
with `waitUntil`; the background deadline is 28 seconds and the loop wall cap is
12 seconds by default, fitting the Workers post-response window. The loop result
is never exposed to the reader. The existing Workers observability sink receives
an allowlisted compact record:

```json
{
  "kind": "research_loop_shadow",
  "question_hash": "SHA256",
  "planner": {"steps": ["count_speeches"], "chosen_facts": [1],
              "rounds": 1, "ms": 25, "tokens": {"input": 11, "output": 6},
              "cost_usd": 0.00002, "mode": "planner", "failure": null},
  "loop": {"steps": ["count_speeches", "finish"], "chosen_facts": [1],
           "rounds": 2, "ms": 30, "tokens": {"input": 20, "output": 10},
           "cost_usd": 0.00003, "mode": "loop", "failure": null},
  "agreement": {"facts": true, "figures": true}
}
```

Fact agreement compares selected source/text identities internally, not local ids.
Figure agreement compares bound selected figures. Ordinary RAG has no planner
usage instrumentation; its unavailable rounds/time/tokens/cost are `null`, and
qualitative figure agreement is `null`. These values are not guessed. Questions,
answers, labels, args, passages, credentials and exception messages are not logged.
Failure logs are `research_loop_fallback` with question hash, fixed reason, rounds,
tokens and optional cost. Existing D1 latency/cost monitoring remains in place.

Rollback is **set `RESEARCH_LOOP=off`**, then deploy through the orchestrator.
`AGENTIC_ASK_MODE` retains its previous meaning. `agentic-parity.test.mjs` and the
legacy no-answer parity script are explicitly scoped to `RESEARCH_LOOP=off`;
ordinary byte pins and agentic legacy fields remain unchanged; the gold comparison
rebaselines only the newly required optional `research` property. Byte pins are
no longer gates on loop-route answers. The focused fake-model tests
keep quote/citation integrity and rollback identity. `votes.json` is untouched.

## Phase 2

Move long or resumable loops to Durable Objects/Workflows rather than increasing
public request caps. Broader routing across published structured datasets and
more expressive tool joins can improve coverage, although v1 already sends every
Ask question to the loop. Extend citation-checked qualitative synthesis only with
an evaluated grounding boundary. The UI and eval lanes consume the shared payload.
The orchestrator owns the small old/new quality eval, secret readiness, brief
shadow rollout and five-question production probe; this lane makes no production
Ask calls or deployment claims.

Current primary references: [AI SDK core](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling),
[OpenRouter provider](https://github.com/OpenRouterTeam/ai-sdk-provider),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
The current Worker size limit is 64 MiB uncompressed on both plans; compressed
size is reported for comparison, not as the deployment limit.
