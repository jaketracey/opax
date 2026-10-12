# Agentic Ask: design and spike (October 2026)

Lane `web/agentic-ask-spike`, 12–13 Oct 2026. Jake's prompt: on /ask, "Who is making the most speeches about gambling reform" gave up and fell back to overall speech counts (Abbott 5,878, Howard 5,562). He asked for multi-step flows that do the work, then steered (12 Oct) towards a Nuclia Retrieval Agent or smart agent, with an OPAX MCP server, all on OpenRouter DeepSeek "like the rest of OPAX".

This note covers what the knowledge box can count, the gold set, the two designs measured on it, and what to build. The measured table and recommendation are in [Results](#results) and [Recommendation](#recommendation).

Nothing here is live. The prototype is behind two flags that are unset in every environment (`AGENTIC_ASK_ENABLED`, `AGENTIC_MCP_TOOLS`).

## A. What the KB can answer deterministically

### Where a speech keeps its facts

The sync is `parli/ingest/arag_sync.py` `map_speech`; topic labels come from the opax-enrich Worker.

| Fact | Stored as | Facetable |
|---|---|---|
| Speaker name | `origin.collaborators[0]` (one name, normalised at sync) | **yes**, as the raw path `/u/o` (the public alias `/origin.collaborators` returns an empty facet) |
| person_id, electorate, word count, raw names | `extra.metadata` | no (extra metadata is not indexed) |
| Party, chamber, state, decade, kind, source, speaker_type | `usermetadata.classifications` labels | yes, `/classification.labels/<set>` |
| Topic (21-topic classifier) | label `topic/<slug>`, several per speech | yes |
| Speech date | `origin.created` | filter only, and only on `/search` and `/find` (see below) |

Fields per speech: `t/body` (the text), `t/da-summary-t-body` (the model brief), `a/title`.

### Facet behaviour, tested 12 Oct

- **`/catalog` facets are exact and count every match, not the top k.**
  - On `kind=speech AND topic=gambling` (4,482 speeches), `faceted=/u/o` returns 866 speakers.
  - Each value equals the filtered catalog total for that speaker: Pocock 134 = 134, Henderson 98 = 98, Wilkie 60 = 60, Paterson 52 = 52.
  - One request gives the full ranking. Label filters combine with `and`/`or`/`not` under `filter_expression.resource`.
- **`/catalog` cannot filter on the speech date.**
  - Its `created` is index time: every resource was indexed in 2026, so `since 2022` matches everything.
  - The `date` prop is rejected by the catalog filter grammar.
  - Dates on the catalog are therefore decade labels only.
- **`/search` fulltext totals are exact, but its facets are not.**
  - `/search` (features `fulltext`) with `filter_expression.field` and `{prop: created, since, until}` filters on the speech date.
  - Its `total` counts **fields**, so a speech counts once per field (4,710 > 4,482). Restricting to `{prop: field, type: text, name: body}` gives one row per speech; the total then equals the catalog's (4,482).
  - **Facets on `/search` are wrong.** They're the same for `top_k` 5 and 50, but they don't match the totals: Pocock 132 vs 134; Pocock 134 "since 2022" but 132 all-time. Never count from `/search` facets.
- **Exact date-window rankings** take two steps:
  1. Candidates from the catalog facet over the overlapping decade labels (top 30).
  2. One body-only `/search` total per candidate with the `created` window.

  The ranking is exact when the n-th window count is at least the best decade count outside the candidate list; the tool reports `exact: true|false`. Measured cost: about 0.7–1 s for 30 candidates at concurrency 4.
- **Paragraph and sentence results** carry no `/u/o` facet.

### A speaker facet already exists, so no re-sync is needed

`/u/o` is the nidx label the platform writes for every origin collaborator. The re-sync question doesn't arise.

If a public alias were wanted, `origin.tags` with `speaker:<name>` would be the change. It would be a metadata-only patch through the existing `arag_patch_speakers.py` read-merge-write path: about 873k resources at the patch script's measured throughput, so days of background sync, and it needs a `CACHE_EPOCH` bump. It isn't worth doing while `/u/o` works.

**Party** is the gap: only federal speeches and about 27% of Queensland speeches carry a party label (NSW 0 of 112,022, Victoria 0 of 50,744, SA 0 of 37,971, ACT 0 of 9,177). A state party ranking needs a roster join (speaker to party at the date). That is a tool change, not a re-sync.

### Coverage facts every answer must be able to state

These were found while building the gold set. They are record facts, not bugs in this lane.

- **Topic labels cover 633,948 of 873,200 speeches (73%).** By decade: 1990s 22%, 2000s 63%, 2010s 91%, 2020s 89%. All-time topic counts under-count older years.
- **The federal chamber Hansard gap is in the source data.**
  - Federal chamber speeches in the record: 2019 8,556 · 2020 10,203 · 2021 11,562 · 2022 3,611 · 2023 2,995 · **2024 79** · 2025 4,828 · 2026 6,805.
  - parli.db shows the same hole (Wilkie: 14 speeches in 2023, 1 in 2024), so mid-2022 to mid-2025 is missing upstream, not just from the KB.
  - Any "since 2022", "this term" or year-on-year federal answer is shaped by it.
- **Committee hearings are stored one turn per record.**
  - 117,395 `senate_committee`, 24,956 `joint_committee` and 14,257 `house_committee` records.
  - A committee-active senator's turns outnumber their speeches about 10:1 (Pocock: 1,700 committee turns, 181 Senate speeches).
  - A "speech" in the tools and the gold set is therefore a chamber record; committee turns are a separate count.
- **Speaker attribution** (data-speaker-attribution-check, 12 Oct): 16,909 federal debate documents carry several speakers' words under one MP (the OpenAustralia legacy `<p>`).
  - The gold set records, for each top speaker, how many of their counted speeches come from the OpenAustralia source.
  - For Jake's question the top five are 0–3% OpenAustralia (Wilkie: 2 of 60). The ranking stands even if those documents are wrong.
  - It does reach quotes: `find_quotes` for Wilkie returned a minister's answer filed under Wilkie (speech-827738).
- **The record keeps moving.** Enrichment labelled more speeches during the spike: chamber speeches by members labelled gambling went from 3,416 (12:15 UTC) to 3,435 (about 14:35 UTC), and Ruddock's immigration count from 1,233 to 1,237. The gold set is a dated snapshot, and scoring accepts a count that matches either of two snapshots taken around the runs.

## B. The gold set

`portal/test/fixtures/agentic-ask-gold.json`, written by `scripts/agentic_ask_gold.mjs` (read-only KB queries plus the exported JSON; no model; about 150 KB calls, 70 s).

- **30 questions**: 10 speaker rankings, 4 party rankings, 6 trends, 5 votes-versus-words comparisons, 5 money joins.
- **Jake's exact question is R01.**
- **Each entry keeps** the expected answer, the exact query or file selection that produced it, and the method.

**Definitions** (also in the fixture):
- A speech is a chamber record of a member (committee turns and witnesses are counted separately).
- "About X" means the OPAX topic label.
- With no period stated, the whole record and every parliament.
- Money is federal AEC returns (`graph/money.json`) after `withholdIndividualDonors`. Donors not named are aggregated and never ranked by name.

**Special cases:**
- P04 (NSW parties) is a **decline** question: NSW speeches carry no party label, so the right answer says so.
- R02, P02, T01, T05 and M05 cross the federal coverage gap, so the expected answer must state it (`coverage_caveat`).

Jake's question, from the record (chamber speeches labelled gambling, all parliaments):

| Rank | Speaker | Speeches | Attribution risk (OpenAustralia share) |
|---|---|---:|---|
| 1 | Justin Field (NSW LC) | 87 | 0% |
| 2 | Andrew Wilkie | 60 | 3% |
| 3 | Paterson (ACT; the record holds a surname only) | 52 | 0% |
| 4 | Cate Faehrmann | 47 | 0% |
| 5 | Connie Bonaros | 46 | 0% |

Committee-hearing turns on gambling, ranked separately: David Pocock 130, Sarah Henderson 94, Sarah Hanson-Young 65.

## C. The two designs

### (ii) Nuclia smart agent with the KB and OPAX MCP drivers (Jake's primary path)

The platform supports this inside the knowledge box. It needs no Retrieval Agents product, no dashboard enablement and no new tier:

- `POST /kb/{kb}/sources/{id}` declares the sources: a `nucliadb` source (this KB, with the portal's standard filter) and an `mcp` source (`uri`, `headers`, `tool_choice_model`).
- `POST /kb/{kb}/agentic_configs/{id}` declares the agent: `smart_agent {mode, models {planner, executor, context_validation}, sources, extra_prompt}`, plus `rephrase` and `summarize`, each with its own model.
- `/ask` with `agentic_config_id` runs it.
  - As an NDJSON POST it returns only the final answer.
  - As a websocket (`wss://…/kb/{kb}/ask?agentic_config_id=…`, service-account header) it streams every step: rephrase, each reactive iteration and its tool calls, the KB agent's RAG and facet calls, context validation, summarize.

The KB source gives the agent two functions: `ask_agent__nucliadb-agent-<source>` (RAG) and `facets_count__nucliadb-agent-<source>` (an LLM-planned faceted count). The MCP source adds the server's tools.

Spike objects, all deleted at the end (see the report):
- sources `opax-spike-kb` and `opax-spike-mcp`;
- configs `opax-spike-agent` (KB only) and `opax-spike-agent-mcp` (KB plus the live `/mcp`).

In both configs every model field is `{"_type":"llm_config","model_id":"openai-compatible"}`, and the MCP source's `tool_choice_model` is the same.

### (i) OPAX orchestration in the Worker (baseline)

`portal/src/agentic-ask.ts`, route `POST /api/ask-agentic` (flag `AGENTIC_ASK_ENABLED`):

1. **Route classifier** (rules, no model): `classifyAgentic`.
2. **Planner**: one model call on the openai-compatible slot through the existing `kbFetch('/ask')` path (`top_k` 1, `reranker` noop, custom prompt). It returns a JSON list of tool calls; `$1`/`$1.party` carry an earlier result into a later step.
3. **Tools**: `portal/src/agentic-tools.ts` runs the steps deterministically, at most 6 steps within a 40 s budget.
4. **Composer**: one model call over a numbered fact sheet.
   - `verifyComposition` keeps a sentence only if every figure in it appears in a fact it cites.
   - It drops causal donation claims and "Based on…" openings.
   - If nothing survives, a deterministic template answers from the facts.
5. **Payload**: `answered: false` with `reason` (`declined`, `no_supported_claim`) when the plan or tools give nothing, matching web-ask-no-answer's contract.

## Tools (shared by both designs)

`portal/src/agentic-tools.ts`. The same specs back design (i) and the MCP tools registered on `/mcp` when `AGENTIC_MCP_TOOLS` is `true` (`portal/src/community-mcp.ts`; zod schemas generated from the specs).

None calls a model. Every result has the same envelope:
- `cite[]`: what a reader can open to check it;
- `query`: the exact request;
- `notes[]`: coverage limits the answer must state;
- `ok` and `error`.

| Tool | Input | Source of every number | Measured through local `/mcp` |
|---|---|---|---|
| `count_speeches` | topic, speaker, party, state, chamber, venue (chamber/committee/all), since, until, term, group_by (speaker/party/none), limit | `/catalog` facet `/u/o` or `party`; date windows via body-only `/search` totals per candidate; reports `exact` | 0.7–1.1 s |
| `speech_trend` | the same filters, by year/decade/term, from_year, to_year | body-only `/search` totals per period, plus the topic-labelled denominator and share | 0.1 s (by term) |
| `find_people` | name | `parliamentarians.json` (returns the name the record indexes speeches under) | 0.01 s |
| `member_votes` | keyword, person or party | KB title search over `kind=division`, then `divisions/<slug>.json` | 0.4 s |
| `party_donations` | party or industry, from_year, to_year, limit | `graph/money.json` after `withholdIndividualDonors`; withheld donors become one "Donors not named (N)" row | 0.01 s |
| `find_quotes` | query plus filters | `/find` passages with record links (a sample; the tool says never count them) | 1.1 s |

Bad arguments fail cleanly (an unknown topic gives MCP `-32602` with the allowed list). The existing `search_records`, `read_record` and `corpus_coverage` stay as they are.

**Size limit for agent use.** Nuclia's MCP driver rejects any tool result over 16 KB (`Tool result rejected | kind=text; observed_bytes=139970; byte_limit=16384`, seen in the probe on `read_record` of a bill text). Measured at their largest settings, every agentic tool fits:
- `count_speeches` (15 rows) 3.9 KB;
- `speech_trend` (34 years) 8.2 KB;
- `member_votes`: Greens, 63 divisions capped at 40 rows, 10.8 KB; Wilkie 7.2 KB;
- `party_donations` (15 rows) 4.3 KB;
- `find_quotes` (8 passages) 5.9 KB.

A test should hold them under 16 KB.

## Progress events (prototype shape; the visible UI is a later Opus lane)

The agentic stream keeps the existing SSE contract (`status` phases, then `done`) and adds steps. Older clients ignore the unknown phases and keep "Searching the record" active.

```
event: status  {"phase":"searching"}                      stream open (existing)
event: status  {"phase":"planning"}                       the planner call
event: status  {"phase":"plan","steps":[{"id":1,"tool":"count_speeches","label":"Counting gambling speeches by speaker"}]}
event: status  {"phase":"step","step":{"id":1,"tool":"count_speeches","label":"…","state":"running"}}
event: status  {"phase":"step","step":{"id":1,"tool":"count_speeches","label":"…","state":"done","ms":947}}
event: status  {"phase":"writing"}                        existing phase: the composer
event: done    {answered, reason?, answer, answer_source, shape, facts[{id,text,url,kind,value}], notes[], steps[], timings, tokens, routed}
```

For `stages.js`: `plan` replaces the fixed "Searching the record" row with one row per planned step (labels come from the planner, falling back to fixed labels per tool). `step` drives each row's ring through pending, active and done (or error). `writing` maps to "Writing the answer" as today, and `cached` completes every row.

Design (ii) can feed the same events by mapping its websocket steps:
- `module: smart`, "Tool calls: …" → `step running`;
- `nucliadb_agent` / `mcp` results → `step done`;
- `summarize` → `writing`.

The Worker would hold the websocket and re-emit SSE.

## Budget and cache

- **Budget.** Design (i) stops starting tools 8 s before a 40 s deadline and leaves the composer at least 5 s; with fewer, it falls back to the template. Planner timeout 15 s, composer 20 s, at most 6 steps. The 30–45 s ceiling is enforced inside the run, not by Cloudflare.
- **Cache.**
  - Key: `sha256({q: normalised question, epoch: CACHE_EPOCH, model: AGENTIC_MODEL || ASK_MODEL, v: AGENTIC_PROMPT_VERSION, t: AGENTIC_TOOLS_VERSION})` under `cache.opax.internal/ask-agentic/`.
  - Normalising lower-cases, folds quotes, strips punctuation and collapses spaces.
  - A corpus change (CACHE_EPOCH bump), a model re-pin, or a prompt or tool change each retire every cached answer.
  - Only `answered: true` payloads are stored, for 7 days like `/api/ask`.
  - The tools read live facets, so between epoch bumps a cached count can lag the record. During the spike the enrich Worker was labelling the 1990s and 2000s backlog: topic-labelled speeches rose from 633,948 to 637,611 in about 2.5 hours, and Bob Brown's Senate climate count rose from 285 to 341. The epoch, not the TTL, is what keeps answers honest, so the enrich Worker's labelling passes need epoch bumps like corpus loads.
- **Spend guards.** Same limiter as `/api/ask` (`ASK_LIMITER`), and `kbFetch` already checks `MODEL_LIMITER` before any `/ask`.

## Route classifier (route-only rollout)

`classifyAgentic` (rules, ordered; money wins because a money join is also a ranking):

| Shape | Rule |
|---|---|
| money | a money word (donat-, donor, gave, funded, money) **and** a speech word |
| comparison | a vote word **and** a speech word; or compare/versus with "how often/how many" |
| trend | "how many" with a speech word; or a trend phrase (more…than / this term / since, changed, over time, which year, increase…) with a speech word |
| ranking | who / which (+ up to two words) MPs, senators, politicians, parties, ministers… **and** most/least/top N/leading **and** a speech word or "about/on" |
| everything else | today's Ask |

Speech words: speech(es), spoke, spoken, speak(s/ing), said, says, mention(s/ed), talk(s/ed/ing), debate(d), discuss(ed/es), raise(d).

Measured:
- All 30 gold questions route agentic.
- On October's real Ask traffic before the spike (138 reader questions, 81 distinct, from the KB activity log), 2 route agentic (1.4%), and both are Jake's gambling question. None of the other 80 distinct questions would leave today's Ask.
- Unit tests in `portal/test/agentic-ask.test.mjs`.

## Non-negotiables, and where the prototype meets them

| Requirement | Design (i) prototype | Design (ii) as measured |
|---|---|---|
| Counts and rankings from facets or DB, never the LLM | Tools only; the composer may only copy fact figures (`verifyComposition`) | Not met. `facets_count` returns whole-KB label totals, and 4 gold answers presented them as answers to a filtered question (T03 decade totals, T05 "28,504" 2023 immigration speeches, C02 Pocock "4,626 documents", M03 party totals). The first KB-only run counted passages instead ("27 speech blocks"). Nothing checks the summarizer's numbers |
| Every number cited | 47 of 47 figure sentences cited, each fact linked to a `/search` URL that reproduces the count, or to the division or money page | 21 of 22 figure sentences carry a footnote, but footnotes point at context blocks (`block-AA`), not at a reproducible count |
| `answered: false` contract | `answered`, `reason` (`declined`, `no_supported_claim`) | Only the platform's canned prose "Not enough data to answer this." (23 of 30 gold answers). Detecting it means matching prose, which the no-answer lane rules out |
| No-causation wording | In the composer prompt, enforced by `CAUSAL` sentence drop | Prompt only (extra_prompt and summarize system prompt) |
| Donor rule | `party_donations` aggregates withheld donors; MCP args naming a withheld donor get the fixed reply | Same on the MCP side once deployed; the KB driver has no donor data |
| Progress steps | `status` plan/step/writing events (above) | Websocket steps, which a Worker relay could map |
| 30–45 s budget | 40 s in-run deadline, template fallback; p95 17.4 s | Not met: p50 51 s, p95 78 s, 21 of 30 over 45 s. 29 of 30 runs used all 5 reactive iterations; plan_execute was slower (up to 152 s) |
| Cache per normalised question | `agenticCacheKey` with `CACHE_EPOCH` and the model pin | Would sit in the Worker relay, same key |

## Rollout plan (route-only; turning it on for readers is Jake's call)

1. **Build** (lanes below), still flagged off.
2. **Staging only.** Set `AGENTIC_ASK_ENABLED=true` on staging, and let `/api/ask` call `classifyAgentic` and delegate the four shapes. Note that staging proxies `/api` to production (memory: use `wrangler dev`), so a staging check needs the flag on a preview deploy or local dev.
3. **Shadow week** on production with the flag still off for readers. A cron or operator-only route runs the agentic path for each classifier hit and logs the answer beside today's Ask. Compare.
4. **On for the four shapes**, with today's Ask as the fallback whenever the agentic path returns `answered: false` or overruns 40 s.
5. **Bump `AGENTIC_TOOLS_VERSION`** whenever a tool's definition changes (e.g. the chamber/committee split). It retires cached answers like a corpus change does.

## Build lanes

| Lane | Model | Scope |
|---|---|---|
| 1. Agentic route and tools | Codex (non-visual) | Promote `agentic-tools.ts` and `agentic-ask.ts` out of spike state; `/api/ask` delegation behind the flag; rule-based fallback plan when the planner times out or returns junk (the R10 timeout); SSE relay; cache in `GENERATION_CACHE` KV like `/api/ask`; tests |
| 2. Tool depth | Codex | Roster join for state party rankings; division lookup by bill key as well as title; trend by sitting week; quote attribution guard (drop passages where the turn is another speaker, after the attribution repair lands) |
| 3. Progress UI | Opus | `stages.js` dynamic rows from `plan` and `step` events; facts table under the answer with "check this count" links; mobile layout; the no-answer state from web-ask-no-answer |
| 4. MCP tools live (only if Jake chooses design (ii) or wants the tools for researchers) | Codex | Flagged deploy of `AGENTIC_MCP_TOOLS`, rate limits per tool, the `tools/list` contract in docs |

## Evidence for the steer's four checks

### 1. Every agent model can select the openai-compatible slot: yes

Request (`POST /kb/{kb}/agentic_configs/opax-spike-agent-mcp`; the `GET` returns the same):

```json
{"title":"opax-spike-agent-mcp",
 "rephrase":{"model":{"_type":"llm_config","model_id":"openai-compatible"},"history":false},
 "smart_agent":{"mode":"reactive","sources":["opax-spike-kb","opax-spike-mcp"],"history":false,
   "models":{"context_validation":{"_type":"llm_config","model_id":"openai-compatible"},
             "planner":{"_type":"llm_config","model_id":"openai-compatible"},
             "executor":{"_type":"llm_config","model_id":"openai-compatible"}}},
 "summarize":{"model":{"_type":"llm_config","model_id":"openai-compatible"},"conversational":false,"history":false}}
```

- Response: `201`.
- The MCP source's `tool_choice_model` (sent as the string `openai-compatible`) is stored as `{"_type":"llm_config","model_id":"openai-compatible"}`.
- The schema's defaults are native (`chatgpt-azure-5.6-luna` / `-terra`), so every field has to be set explicitly. A field left out falls back to a native model.
- The KB's own `generative_model` is `openai-compatible`, so the KB driver's inner RAG call also stays on the slot.
- No model setting beyond the slot was needed: no reasoning flag, no `max_tokens`.

### 2. DeepSeek's tool calling inside the agent: unreliable as measured

- **Repetition.**
  - The planner repeats the identical call until the 5-iteration cap. In the first KB-only run it made `ask_agent(question=…)` four times, then `facets_count`.
  - On the gold run, R01 made `facets_count(question=…)` five times, with the same text each time, despite the extra prompt "never call the same function with the same arguments twice".
- **Platform errors.** The KB driver's `facets_count` raised a Nuclia-side exception mid-run: `Error executing tool 'facets_count' … cannot access local variable 'context' where it is not associated with a value`. The executor then marked the next call `SkippedToolCall`.
- **Context validation can drop the counting result.** In the KB-only run it kept 4 of 5 contexts and dropped the faceted count, and the summary was written from passage counting ("27 speech blocks").
- **MCP:** see the gold-run table and the MCP probe below.

### 3. No native ARAG generation tokens: supported, not proven

- **Per step (websocket):** every rephrase, reactive iteration, KB-agent, facet, context-validation and summarize step reports `input_nuclia_tokens: 0, output_nuclia_tokens: 0`, and the run ends `Smart agent: Reactive mode completed | Completed after 5 iteration(s). Total tokens: 0.0 in / 0.0 out`.
- **Per request (NDJSON POST with `X-SHOW-CONSUMPTION: true`):** `{"normalized_tokens":{"input":0.0,"output":0.0},"customer_key_tokens":{"input":0.0,"output":0.0}}`. `normalized_tokens` is the field the docs call billed ARAG tokens.
- **OpenRouter:** the KB's BYOK key's usage counter rose on every agentic run (US$0.0138 for the first KB-only question, US$0.0206 for the second), so the generation ran on the slot.
- **The gap:**
  - Agentic runs do not appear in the KB activity log (no `ask`, `chat`, `retrieve`, `augment` or `search` rows in the run windows), so there is no second ledger.
  - A plain `/ask` on the same slot reports `metadata.tokens.input_nuclia: 0.032` for a 32-token call while `consumption.normalized_tokens` is 0, so zero step counters fit "not billed" without proving it.
  - **Jake should compare the dashboard's ARAG token counter across the spike's agentic windows: 12 Oct 2026 12:00–12:08 UTC (two KB-only trials) and 14:49–15:40 UTC (the gold run, the MCP probe and the plan_execute variant).**

## Results

**The runs**
- 12 Oct 2026, one question at a time, against the gold set.
- Design (i) ran on local `wrangler dev --local` (calling the KB and its openai-compatible slot directly).
- Design (ii) ran on the KB's agentic `/ask` over the websocket.
- Runner: `scripts/agentic_ask_spike.mjs`. Per-question rows, answers and frames are in `portal/private/agentic-ask-spike/` (git-ignored).

**Scoring**
- Deterministic: the leader named first with its exact count and at least 2 of the top 3 names; every expected number; the coverage caveat where required; the decline where required.
- No model judge.
- **Drift:** the record moved during the runs, so a count is accepted if it matches any of three gold snapshots taken at 12:15, 14:49 and 15:28 UTC.

| | (i) OPAX orchestration | (ii) smart agent: KB + live `/mcp`, reactive | (ii) plan_execute (4 questions) |
|---|---|---|---|
| Accuracy (gold, deterministic) | **20/30 (67%)** | **1/30 (3%)**: only the decline question | 0/4 |
| by shape | rankings 12/13 · decline 1/1 · trends 1/6 · votes vs words 2/5 · money joins 4/5 | rankings 0/13 · decline 1/1 · trends 0/6 · votes 0/5 · money 0/5 | |
| Jake's question (R01) | Pass: Justin Field 87, Andrew Wilkie 60, Paterson 52, with the limits | "Not enough data to answer this." | "Not enough data" |
| Wrong or misleading answers | 4 (C01, C03 claimed "the record does not show" his or her votes after a bad plan; M05 money window; T05 no caveat) | 6 (T03, T05, C02, M03 used whole-KB counts; C01, C03 "consistently voted in favour" from 3 sampled divisions) | 1 |
| Declined / `answered: false` | 3 (planner timeouts) | 23 ("Not enough data") | 3 |
| Latency p50 / p95 | **12.4 s / 17.4 s** (0 over 45 s) | 51.4 s / 77.9 s (21 over 45 s) | 69.6 s / 152 s (one 150 s timeout) |
| $ per question (OpenRouter) | **US$0.0014** (US$0.0012 from token counts) | US$0.027 | US$0.12 |
| ARAG tokens | 0 (`normalized_tokens` 0 on every call) | 0 reported on every step (see check 3) | 0 reported |
| Figures traceable to tool output | 94/94 | 36/36, but 4 answers used a count that answers a different question | 2/2 |
| Figure sentences cited | 47/47, to reproducible count links | 21/22, to context blocks | 2/2 |
| Tool-calling failures | 2 runs with a failed tool step (missing `member_votes` keyword) | 26/30 runs looped or errored: 77 identical repeated calls, 29/30 hit the iteration cap, 15/30 hit a Nuclia `facets_count` exception | |

**MCP tool use in isolation** (probe, `scripts/agentic_ask_mcp_probe.mjs`): 10 lookup questions, MCP-only config, the live `/mcp`'s existing read-only tools.
- **Use:** all 10 runs called MCP; 30 MCP calls, all with valid arguments (no `-32602`).
- **Loops:** 4 of 10 runs repeated an identical call (10 repeats, e.g. `corpus_coverage` five times), and 4 hit the iteration cap.
- **Errors:** 1 run hit size limits (OPAX's 180 KB response cap twice, Nuclia's 16 KB result cap twice).
- **Cost and time:** p50 35 s, US$0.038 per question.
- DeepSeek picks sensible MCP tools and arguments. The failure is looping, not malformed calls.

**What design (ii) would score once the new tools are on a reachable `/mcp`**

This is an estimate; it couldn't be measured without a deploy.
- **Accuracy:** the tools themselves match the gold set (the local `/mcp` returns the gold figures for R01, P01, C01 and M01 and their siblings). So (ii)'s accuracy would be bounded by how often DeepSeek, inside the agent, calls the right tool with the right filters and the summarizer copies the figure.
- **Planner proxy:** design (i)'s planner is the same model on the same tool descriptions, and it chose a correct plan for 22 of 30 questions. That is the realistic ceiling for (ii).
- **What would pull it below that ceiling:**
  - the loop rate seen here (40–87% of runs);
  - context validation dropping a tool result (seen once in the first run);
  - an unverified summarizer.
- **Latency:** stays at 35–78 s, because the iterations, context validation and summarize are fixed platform steps.
- **Cost:** stays near US$0.03–0.04 per question, about 20–30× design (i).

## Recommendation

**Build design (i).** Keep the structured tools as an MCP surface for researchers, but don't put the Nuclia smart agent in front of readers.

On the gold set, (i) is right on 20 of 30 against 1 of 30. It answers in 12 s rather than 51 s, at about a twentieth of the cost, and it is the only design that meets the non-negotiables by construction: numbers come only from tools, every number is cited to a reproducible count, and `answered: false` is structured.

Design (ii)'s problems are platform-shaped and not fixable from OPAX's side:
- the KB facet function can't filter or group by speaker;
- the agent loops on identical calls;
- the agent's latency floor is above the 45 s budget;
- nothing verifies the summarizer's numbers.

Even with the new tools deployed, the best case is (i)'s planner accuracy at four times the latency and twenty to thirty times the cost.

**Before building, fix (i)'s measured failure modes** (lane 1 below):
1. A rule-based fallback plan when the planner times out (3 of 30), and a planner timeout of 20 s instead of 15.
2. Schema-check plans before running them, and re-ask once on a tool error, so a missing argument never turns into "the record does not show" (C01, C03).
3. Make the coverage caveat a fact the composer must keep, not a note it may drop (T05).
4. Return decade and term totals from `speech_trend`, so the composer never sums (T06's 45 was a sum).
5. Give `member_votes` synonyms per topic (gambling: betting, wagering, poker machines, pokies), which recovers C04's missing division.

## Cost projection

**Inputs**
- **Ask volume:** about 20 `/api/ask` 200s in the 23 hours to 14:32 UTC on 12 Oct (Cloudflare, real user agents: AU 16, US 3, CO 1), so about **140 a week**. PostHog had no key in `insights.env`, so this is one day's sample.
- **The KB activity log** shows 138 reader questions reaching generation in the 11.5 days before the spike (about 84 a week; the rest were cache hits).
- **Route share:** the classifier routes 1.4% of those.

Paid runs a month, at 4.35 weeks:

| Agentic share of Asks | Paid runs, no cache hits | (i) a month | (ii) a month | (ii) at DeepSeek peak price |
|---|---:|---:|---:|---:|
| 1.4% (measured classifier share) | 8.5 | US$0.01 | US$0.23 | US$0.46 |
| 10% (if the Ask builder promotes these shapes) | 61 | US$0.08 | US$1.64 | US$3.27 |
| 25% | 152 | US$0.21 | US$4.09 | US$8.18 |
| Every Ask (ceiling) | 609 | US$0.83 | US$16.37 | US$32.74 |

- A 30% cache hit rate takes 30% off each row.
- For scale, all of OPAX's OpenRouter generation cost US$2.63 in the 12 days of October before the spike (about US$6.50 a month).
- DeepSeek's first-party price doubles in weekday windows 01:00–04:00 and 06:00–10:00 UTC (11:00–14:00 and 16:00–20:00 AEST), which is the right-hand column.

## Spike spend and objects

- **OpenRouter** (the KB's BYOK key counter, which production traffic shares): US$1.90 from 11:59 to 15:40 UTC on 12 Oct. That covers both gold runs, the probe, the plan_execute variant, the KB-only trials and the production traffic in that window. The cap was US$10.
- **KB objects** (all deleted, each `204`; `GET /sources` and `GET /agentic_configs` return `{}`):
  - sources: `opax-spike-kb`, `opax-spike-mcp`;
  - agentic configs: `opax-spike-agent`, `opax-spike-agent-mcp`, `opax-spike-agent-mcp-plan`, `opax-spike-agent-mcponly`.
  - The `openai-compatible` slot, the KB configuration and the labelsets were not touched.
- **MCP token:** one 24-hour token was minted for the operator member row (key id `593df4af-…`, SHA-256 in `mcp_keys`, D1 `opax-community`) and revoked at 15:40:30 UTC (`revoked_at` set). The live `/mcp` now answers 401 to it. The token was never printed or committed.
- **Local only:** a throwaway member and key in the local D1 for timing the new tools through `/mcp`.

## What Jake must decide

1. **The design.** Design (i) as recommended, or a flagged deploy of the MCP tools (`AGENTIC_MCP_TOOLS`) to measure design (ii) with them properly.
   - The steer named (ii) as the primary path, but on this evidence it can't meet the 45 s budget or the numbers-from-tools rule.
   - A short-lived tunnel to a local server would avoid a production deploy for that measurement. It's also an outward-facing step, so it's your call.
2. **What "speeches" means.** The tools count chamber speeches and report committee-hearing turns separately. The alternative is to count both.
   - It decides Jake's own question. On chamber speeches the leaders are Justin Field (87), Andrew Wilkie (60) and Paterson (52). On committee turns they are David Pocock (130), Sarah Henderson (94) and Sarah Hanson-Young (65).
3. **The default period** for "who is making the most speeches": the whole record (as built), or the current term. The present tense suggests the current term, but federal coverage for 2022–25 is thin, so a current-term answer for federal is small (Pocock 4, Wilkie 3 since 2022).
4. **Turning it on for readers** (the rollout's step 4) is a stop-and-ask item, after the shadow week.

## Findings for other lanes

- **Data: a federal chamber Hansard gap**, mid-2022 to mid-2025, in parli.db itself (2023: 2,995 speeches; 2024: 79). Every federal trend answer is shaped by it.
- **Data: state party labels.** NSW, Victorian, SA and ACT speeches carry no party label, so state party rankings need a roster join at the date.
- **Data: attribution.** `find_quotes` surfaced a minister's answer filed under Andrew Wilkie (speech-827738, 15 Feb 2023), a live example of the 16,909-document attribution fault. Quote tools should wait for, or guard against, the repair.
- **Ops: labelling drift.** The enrich Worker's labelling moves topic counts by up to 20% for older senators within hours (Bob Brown, Senate climate: 285 to 341). Cached answers built on topic counts should be retired by an epoch bump when a labelling pass lands, like a corpus load.
- **Platform (Nuclia), worth a support ticket:**
  - `facets_count` raises `cannot access local variable 'context' where it is not associated with a value` (15 of 30 gold runs);
  - agentic runs don't appear in the KB activity log;
  - `consumption.customer_key_tokens` reads 0 even on customer-key calls, where `metadata.tokens` holds the real counts.

## Build lane 1 delivery (13 Oct, supersedes the rollout above)

Jake selected design (i). Design (ii) stays documented as spike evidence, and its MCP registration has been removed. `/api/ask-agentic` and the spike enable/model flags are retired. No deploy is performed by this isolated lane.

The orchestrator deploys `AGENTIC_ASK_MODE=route` after review, with `ASK_MODEL=openai-compatible` and the existing corpus `CACHE_EPOCH`. Unset, `off`, and unknown values leave Ask unchanged. `shadow` remains available for background runs but there is no shadow waiting period. The optional monitoring price vars are `AGENTIC_INPUT_USD_PER_MILLION` and `AGENTIC_OUTPUT_USD_PER_MILLION` (USD per million tokens); use the currently pinned model's verified rates. Costs are token estimates, or NULL when rates/token usage are unavailable, and zero on cache hits.

Apply `portal/migrations/0016_agentic_shadow.sql` to the target `COMMUNITY_DB` before enabling the route. It adds only `question_hash`, `shape`, `latency_ms`, and `cost_usd`; it stores no question, answer, tool args, step labels or exception strings. Route runs, including unsuccessful attempts and cache hits, are monitored. This lane validates the migration locally only. The orchestrator must apply it remotely and deploy.

Routed SSE follows the 13 Oct shared step-event brief: existing `searching`, fixed tool labels with arguments capped at 40 characters, `running`/`done`/`failed` in real time, then existing `writing` and the ordinary Ask payload with `agentic: {steps, ms}`. There is no plan event or model-written progress text. Ordinary Ask has no steps or `done.agentic`. The cached path uses existing `cached` replay and the stored collapsed steps. The client contract is the existing source-range renderer; there is no new answer block, banner or feature wording.

Present-tense questions default to the current parliament (since 22 July 2025); otherwise the whole record. Explicit periods and selected date controls win. Every answer has one plain period sentence. The alternative period is an ordinary `followups` question; no switch. Committee turns are counted separately when including them changes the chamber ranking. Coverage limits, including the current federal gap where the selected period crosses it, remain ordinary answer sentences, with source-method citation ranges; no separate caveat block.

Counts are from catalog facets or body-only search totals. Window rankings whose candidate bound is insufficient fail closed. All model plans are schema-checked; malformed plans, wrong-subject counts and planner timeouts use a rule plan. Ranked speech and money rows are copied deterministically, with no discarded composer call billed. Tool fetches and body reads carry cancellation signals, and races enforce the deadline even if a provider ignores abort. Tool errors or insufficient evidence fall back to ordinary Ask. Successful answers alone enter `GENERATION_CACHE`, alongside the existing edge cache, for seven days. Keys include normalized question, effective period and filters, `CACHE_EPOCH`, `ASK_MODEL`, prompt version, and `AGENTIC_TOOLS_VERSION`.

Money reads the federal published export only. A donor is named only when its published source spellings agree after whitespace/case folding; different spellings/aliases and anonymous nodes contribute to one `Donors not named (N)` amount. Industry or legal form does not decide whether an individual can be named. These uncertain aggregate figures are cited to the party page. The published export is still a selection, so totals are lower bounds. A donation is not evidence of influence on a vote or speech. Existing publication sanitizers still protect the served assets.

Operator gold runner (kept for deterministic comparisons in either enabled mode):

```sh
# DAILY_POST_OPERATOR_SECRET is supplied through the operator environment.
node scripts/agentic_ask_shadow.mjs --base https://opax.com.au --out /path/to/gold-results.json
# Offline scoring, with no network or generation:
node scripts/agentic_ask_shadow.mjs --fixture /path/to/fixture-rows.json
```

Only the bearer-guarded `/api/ops/ask-gold` is used. It bypasses staging's production API proxy and runs the same classifier and orchestration; it never invokes production `/api/ask`. The historical gold defines unstated periods as the whole record, so the runner makes that period explicit for those questions. The snapshot predates the new donor rule and present-tense default; it is not proof of current-record accuracy, and its counts can drift. The runner is delivered but is not run against a deployed host in this lane.

Fixture proof: `docs/evidence/agentic-ask-route-fixture.sse`, `.txt` and `.html`, generated offline by `node portal/test/fixtures/render-agentic-sse.mjs`. The question is Jake's exact gambling question. People and counts are synthetic and are not a claim about the current live ranking. The HTML comes from the actual existing Ask renderer, and the tests assert identical rendered markup for an ordinary payload and the routed payload.

Deferred to tool-depth follow-up: state-party roster joins, division lookup by bill key and topic synonyms, sitting-week trends, and the quote attribution repair. No MCP surface for design (ii) is shipped. The no-answer lane has not landed on `origin/main` at this build's baseline; the route already matches its `answered: false`, empty answer and `declined`/`no_supported_claim`/`grounding_failed` reason contract. Integration with that lane is for the orchestrator when it lands.
