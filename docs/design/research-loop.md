# Ask research loop

As of 21 October 2026, `RESEARCH_LOOP=route` makes research the default for every
Ask, including follow-ups and non-speech kinds. The classifier supplies answer
shape and numerical safeguards; it does not decide whether an Ask gets an agent.
The ordinary RAG path and numerical planner remain the bounded automatic fallback.
This change is evaluated locally; it does not deploy or request production Ask.

## Request path

Request validation and network blocks precede routing. Cache hits retain their
existing quota behaviour. A cache miss takes one reader quota before research;
model-minute admission and the atomic daily USD reservation still precede every
model turn. Fallback reuses the reader quota. Conversations and prior-resource
turns retain private cache isolation. Calculated pay and receipt answers remain
uncached, and uncited answers and fixed declines are not written to the cache.
The tools version separates this release's cache keys from older answers.

The configured model remains `deepseek/deepseek-v4.1-flash` on Together via
OpenRouter, with the existing 15-second research wall, 96,000 token budget and
US$10 daily cap. Step limits, cancellation, reservation settlement, credit
cooldown and fallback deadlines retain their existing implementation. No model,
provider, data load or public data schema changes are part of this release.

`rankedMoneyAnswer` and `paidAnswer` no longer return before inference. The agent
can call them as `ranked_money` and `paid_answer`, alongside `parliamentary_pay`,
`electorates`, grants, contracts, interests, record discovery, speech searches,
counts and votes. `person_overview` exposes the existing overview retrieval.
Electorate answers also run through research: the agent calls the published
Census tool and selects its facts. It may select a calculator's complete answer
only after seeing its result. Independent reads may run together; terminal calls
wait for every in-flight result before selecting fact ids.

`ask-constraints.ts` extracts period, jurisdiction, chamber, party, named people,
place, superlatives and trend intent. Supported tool parameters are constrained
before execution. An explicit question year overrides stale UI dates on both
loop and ordinary fallback paths. Open-ended dates clear any stale opposite
bound: `since`/`until` are inclusive and `after`/`before` exclude the named day
(or whole named year). `between` includes both endpoints. ACT jurisdiction
uses exact statute identity before positive territory syntax. `build:ask-titles`
derives `/ask-statute-titles.json` from shipped bill short titles, linked Act
titles and the FRL instrument title index, normalized without case or years.
A complete title matching this list is a statute, within a single sentence or
clause (`.?!;:,`, em/en dashes, a spaced hyphen or a newline ends the segment).
Punctuation inside parentheses or square brackets stays within the title, as
does `Act.` followed by a year. Exact matching is bounded by the catalogue's
longest title. Generic dated and parenthesized statute-title exclusions
also apply when the catalogue loads, including the territory's Self-Government
Act. Uncatalogued Australian Capital Territory … Act and A.C.T. … Act/Regulations
title constructions are also removed, with balanced nested qualifiers. Only explicit territory patterns (the full name, A.C.T., the ACT, ACT plus a
jurisdiction noun, or for/in/from ACT) constrain retrieval. The same statute-free
text is used for other jurisdiction names, so words such as Northern Territory
inside an Act title do not force a filter. Bare or otherwise ambiguous ACT stays
unfiltered. The agent still sees the original question.

Questions mentioning Act, the full territory name or A.C.T., and explicit ACT
filters, use the local title asset. Its load is bounded at 500 ms inside the
research deadline. Missing, invalid or unavailable data
never forces ACT: genuine territory references also stay unfiltered until the
catalogue is available. Jurisdiction inference is soft for Act/instrument
questions when title identities cannot be verified; the original question,
dates, chamber and named scope still reach the agent. Stale ACT UI filters and
ACT tool arguments are cleared on that path. Territory abbreviations and the
full name trigger the same bounded asset load as Act questions.
The release build regenerates the asset; `check` verifies freshness. Each date
bound keeps its approved operator: "after 2005 and before 2010" is
2006-01-01 through 2009-12-31.
Every tool result carries coverage dates/as-of, or explicitly unknown coverage.
A mismatched result loses its figures and becomes a coverage-only fact. Census
2021 cannot answer a 2005 demographic question as though it were contemporary.

`pay-history.ts` reads the existing salary base steps and dated office spells.
A whole year is split at salary and office changes; an exact date uses that day.
Pre-7 December 1999, future and state salary requests explain the available
coverage. The export does not date party/chamber affiliation changes, so a
historical ranking by those labels is explicitly unavailable rather than joined
to today's roster. Person and office salary calculations retain the dated spells.

## Evidence and answers

`search` performs bounded Nuclia `/find` retrieval with the existing Ask filter
builder. `read_passage` accepts only an id returned by this request's search,
bounds search passages to 1,200 characters, reads the original record through the existing resource handler, and verifies
that the selected passage is in that record. The resource handler and evidence
adapter retain SA excerpt policy. Named-person evidence must be inside the
original first speaking turn. Generated fields and news cannot be cited.

For numerical questions, `finish({facts: number[]})` chooses ids from `factSheet`.
Passage snippets and people lookups cannot be selected as numerical evidence.
The existing plan scope checks, completeness/`no_supported_claim` checks,
committee supplement, `selectAnswerFacts` and `templateAnswer` still own fact
selection and validation. Free text from the selection turn is ignored. Fact
ordering remains deterministic; the checked writing step below authors the prose.

For qualitative and structured-record questions, `answer` selects record fact ids,
verified passage points, or both. Calculated answers retain their original source and evidence IDs when selected
as a complete answer; writing rebuilds their Unicode citation spans. A `decline` tool
lets the agent select fixed clarification, private-person, out-of-scope or
no-causation wording; it cannot supply free-form allegations.

The 16 October contract still applies: an answer beats no answer. Soft checks
leave points uncited (and remove unverified quotation marks); the existing hard
lines on attribution, private people, causation and SA placeholders still drop
points. Explicit date constraints are a hard boundary: the loop never cites a
passage outside the requested window, and a tool with incompatible or unknown
coverage can supply only a coverage explanation, not its current figures.
Both requested and observed coverage must match, including calculated receipt
answers. Receipt coverage uses financial-year starting-year keys explicitly;
it does not claim calendar-year totals. Dated fallback and cached replay paths
suppress unvalidated SSE deltas and release only the validated final answer.
Progress events still stream immediately.

The SA display omission label is never evidence. Intake cleans passage text,
structured excerpts and prior assistant turns before either engine sees them,
including with full-text permission. Final/cache boundaries remove any legacy
placeholder quotation and its citation ranges without corrupting Unicode
offsets. The sanitiser no longer inserts a quotable placeholder. Bare unmapped
numeric markers are stripped from both ordinary JSON and streamed text, including
the H02 pattern of 581 markers; numeric Markdown links remain valid.

## Caps and fallback

| Control | Default | Ceiling / behavior |
| --- | --- | --- |
| `RESEARCH_LOOP_STEPS` | 5 numerical/agentic model turns; 6 qualitative | 6 |
| Actual tool calls | 6, including terminal tools | Duplicates reuse output |
| `RESEARCH_LOOP_MS` | 8,000 ms | Ask route enforces 8,000 ms even if configured higher; standalone loop ceiling 30,000 ms |
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
the fallback retains its existing planner/RAG token limit. Ordinary fallback
receives its own wall envelope so a loop failure cannot consume its budget.

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
and every loop timeout go directly to ordinary Ask with its full fallback
budget. Other failures on a numerical/agentic question can invoke its old planner
once, followed
by ordinary Ask if needed. A shadow failure records the failed attempt without
calling the already-served planner again. A client disconnect cannot start
fallback. A spent loop deadline does not abort the fresh ordinary deadline.
If ordinary upstream service itself exhausts its allowance, route returns a
controlled 503/error event instead of a research-caused 504.
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
  cost_usd?: number | null, failure?: ResearchStop,
  turns?: [{round, input, output, provider, reasoning, cached, cached_input, input_reserve, ms, cost_usd}],
  cached_input_by_turn?: (number | null)[]
}
```

Research sources contain only evidence used by selected facts or accepted
qualitative claims. The planner fallback uses its executed steps. An ordinary
RAG fallback preserves any executed loop trail rather than paying for a discarded
planner; a direct ordinary response has no tool trail. Used sources are copied
from the served payload. Numerical prose omits search/read-only sampling notes
while retaining the numerical tools' coverage notes. Existing fields survive unchanged. Cache hit/miss
headers and SSE cached replay remain in the current cache transport.
Every fallback retains one fixed `research.failure` code and emits one compact
`research_loop_fallback` record. Per-turn input/output, cached input, elapsed
time, input reserve in tokens, and reported/estimated USD make admission
decisions observable. An unfinished provider call reports null usage, not zero.
Normal ordinary fallbacks leave combined usage unknown; authenticated evals
observe and combine both engines' consumption.
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
only after the production quality eval passes; the 30-request round-4 report
explicitly says not to route. `off` (including unset/unknown values) takes today's route unchanged.
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

## Answer writing contract (21 October 2026)

A selected tool result is evidence, including a complete `paid_answer` or
`ranked_money` calculation. Selecting it never authorises rendering its answer
block. After record selection and the existing period, entity, chamber and
counting-basis checks, the same pinned research model writes a short answer from
a fact sheet. The opening answers the question with its subject and key figure.
Subsequent sentences add the requested figures and context without repeating
points, paragraphs or figure sets. Coverage is at most one sentence, in prose;
there is no `Coverage:` block, raw salary-rate line or calculator table.

`research-writing.ts` separates evidence atoms from final sentences. Overlapping
calculator and record results are deduplicated. Older calculators' one-character
citation anchors are resolved to their source snippets; those anchors must not
be mistaken for fact text. Each written sentence selects supporting fact IDs.
Each numeric atom carries its entity, metric, value, unit, chamber, period and
source evidence ID. Clauses are checked against these associations in either
word order, including percentages and dates before amounts. Quoted text of any
length must occur literally in the selected source. Figures are checked against
those facts, including date associations; an
unsupported numeric clause or sentence is removed under the 16 October loose
answer contract, preserving supported prose. Citation ranges are rebuilt in
Unicode code points and retain original resource/evidence IDs and source URLs.
Verified passage points already written by the research model retain their
existing attribution, quotation and loose-point checks.

Writing uses the existing model/provider, per-call limiter, daily reservation,
token ceiling, request cancellation and remaining wall budget. The existing
15-second production primary research allowance reserves four seconds for writing:
name resolution, research and selection must finish inside its first eleven
seconds, with a small handoff margin. This cap starts at the primary request
entry, rather than restarting after name resolution. The writer receives only
the time remaining inside that same allowance. No primary or fallback deadline
is increased; expired selection cannot consume the reserved writing slice. No retry or
provider substitution is introduced. Failure, timeout or exhausted admission
uses a bounded deterministic prose template from the selected facts: a direct
sentence, key figures and one coverage sentence. It never returns the raw tool
block. A failed research run cannot auto-select an ordinary instant calculator.

JSON and SSE share this final payload. Ordinary fallback and cache replay buffer
answer text until the period and writing checks complete; status events can
still stream. Ordinary fallback prose also removes repeated sentences and
claims identified by entity, metric, period and value, rebasing citation spans and unciting dropped-only sources.
The writing version participates in both answer cache keys, so
answers produced under the earlier calculator-rendering contract cannot replay.
Caches store only the completed answer, with the existing privacy, conversation
and uncited-answer exclusions.

The routing fixture and deterministic grader include `no_tool_echo`,
`no_duplicates`, `direct_first_sentence` and `required_components`. The opening
must match the selected subject, requested ranking or relationship and available
headline value. Comparison checks require both sides, their primary figures and
relevant coverage. Equal figures for different entities or periods remain
distinct claims. Coverage notes have stable distinct evidence IDs, and source
assembly retains all supporting text. Financial-year metadata is factual scope,
rather than a limitation that is excluded from ordinary claims. Comparison runs use the first 45
routing cases plus the five reviewer probes, separately against a detached live
baseline and the working branch, with no production Ask requests. Report strict
pass and each rubric axis separately; a style improvement is not evidence of
factual correctness or complete historical coverage.

Pace live local comparisons rather than bypassing the deployed rate limits:
`--interval 6000` with one mode per local Worker, or `--interval 3000` for a
sequential `--mode both` run. `--review-probes --set routing --limit 50` combines
the first 45 cases and all five review probes. Waiting between requests is
excluded from each request's measured latency. The grader treats an explicit
OPAX coverage decline as a decline, recognises denial of causation with singular
or plural subjects, and excludes day-of-month tokens in both prose date orders
from financial-figure checks.
