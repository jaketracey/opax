# Streaming answers

How an OPAX answer reaches the page as it is written. Two halves: what the
Progress Agentic RAG platform sends when `/ask` is called without
`x-synchronous`, and the Server-Sent Events the Worker turns that into for
the browser.

## The platform's raw stream

`POST {ragBase}/ask` with `accept: application/x-ndjson` and no
`x-synchronous` header answers `application/x-ndjson`: one JSON object per
line, each `{"item": {...}}`. Probed live 2026-09-02 with
`scratchpad/probe_stream.py` (python urllib; curl needs `--http1.1`).

Item shapes, in the order they arrive:

| `item.type` | fields | notes |
| --- | --- | --- |
| `answer` | `text: ""` | Empty placeholders interleaved with reasoning while the model thinks. |
| `reasoning` | `text` | The model's thinking, a few characters per item (~1.6k chars over 336-513 items). |
| `answer` | `text` | Visible answer text, 1-6 characters per item. Starts only after the last reasoning item. |
| `retrieval` | `results: {resources: {...}}`, `best_matches: [...]` | One item, 47-113 KB. The full `/find` payload the answer drew on. Arrives AFTER the last answer word. |
| `status` | `code: "0"`, `status: "success"` | `"0"` success; `"-1"` error; `"-2"`/`"-3"` no context / no retrieval data (those two still carry the platform's own refusal text as the answer). |
| `augmented_context` | `augmented: {paragraphs, fields}` | Empty for us. |
| `citations` | `citations: {"<rid>/f/<field>/<range>": [[start, end], ...]}` | Same map as the synchronous `citations`. |
| `metadata` | `tokens: {input, output, ...}`, `timings: {generative_first_chunk, generative_total}` | |
| `consumption` | `normalized_tokens`, `customer_key_tokens` | |

Timings from the two probes (unfiltered speech asks):

| | pokies (1621 chars) | Murray-Darling (716 chars) |
| --- | --- | --- |
| first byte (retrieval + rerank done, reasoning begins) | 4.0 s | 2.9 s |
| first visible answer character | (not logged) | 6.4 s |
| last answer character | | 7.6 s |
| `retrieval` and the tail (`status` .. `consumption`) | 17.8 s | 8.7 s |

So nothing at all arrives for the first 3-4 seconds, visible text begins
when reasoning ends (4-12 s in, depending on how long the model thinks),
and the sources land 1-2 seconds after the last word. The synchronous path
waits for all of it; the streamed path shows the words as they come.

Measured end to end in Chrome against `wrangler dev` (2026-09-02, a slow
platform hour): time to first visible text 17.8-33.8 s, `done` 3-8 s after
that. The SSE chunks reach the browser every 20-30 ms with 1-3 deltas each,
so the answer text itself lands in about 1.5-3 s; what streaming buys the
reader is that window plus the 1-2 s tail before the sources arrive, and a
page that visibly moves the moment the model starts writing.

## The Worker's SSE contract

`POST /api/ask?stream=1` (or `Accept: text/event-stream`) answers
`text/event-stream`. `apiAsk` builds the same body it would send
synchronously (`buildAskBody`: filter expression, provenance and guidance
context turns, the custom prompt for filtered asks) and hands it to
`apiAskStream`, which runs `streamAskOnce` inside `ctx.waitUntil` and writes
through a `TransformStream` (no body is ever buffered whole; the 80-113 KB
`retrieval` line is the only thing held, and only until its newline).

```
event: status
data: {"phase":"searching"}                   the stream is open: the question is read,
                                              the cache checked, the retrieval in hand
data: {"phase":"retrieved","sources":[...]}   position answers only: the speeches found
                                              ({title, date, speaker} × up to 4, `total`)
data: {"phase":"writing"}                     generation has begun: the platform's first
                                              item (retrieval and rerank done), or the
                                              position path's one generation call
data: {"phase":"reading","words":<n>}        heartbeat every 2 s while the model reasons
data: {"phase":"cached","cached_at":"..."}   a cached answer is being replayed

event: delta
data: {"text":"..."}                          answer text to append

event: retry
data: {"reason":"refusal"|"empty"}            attempt one is withdrawn; text resets

event: done
data: {"answer":"...","citations":{...},"sources":[...]}   the synchronous payload, verbatim

event: error
data: {"error":"...","final":true?}           `final`: the browser must not retry synchronously
```

The `status` phases are what a waiting state is drawn from (13 September
2026): a step the Worker never reports stays pending, so the page can never
claim work that did not happen. Position answers (`isPositionBody`) are
built whole by `documentedPositionAnswer` - retrieval, then the originals
read and bounded, then one generation call - so with `?stream=1` they go out
through `streamPositionAnswer`: `searching`, `retrieved`, `writing`, then
`done` with the synchronous payload verbatim and no `delta` at all. A failure
there is sent as a `final` error: the synchronous fallback would only pay for
the same failure again.

Conversations (13 September 2026): a follow-up rarely names its subject, and
retrieval searches the words as typed (prior turns reach generation as
`chat_history`, never the search), so `apiAsk` first rewrites the latest
message as a standalone question drawn from the conversation
(`standaloneQuestion`: one generation-only `/ask` call on the OpenRouter slot,
`top_k: 1`, ~3-6 s, null on timeout or when the message already stands
alone). Scope, retrieval and the prompt then work from the rewrite, and the
`done` payload carries it as `asked_as`; the chat shows it under the reader's
turn as "Understood as: …" and sends it, not the typed words, as later
context. A conversation turn takes its rate-limit token before the rewrite.
The chat also sends `prior_resources` - the platform ids (32 hex) of the
records its last two answers cited - and `buildAskBody` gives each of the
first four its own pinned retrieval pass (a `prequeries` rag strategy,
`resource_filters: [id]`, `top_k: 10`, weight 1, corpuskit's prior-paper
passes), so the records the conversation is about stay in the pool whatever
the new wording retrieves. Local records cited as `USER_CONTEXT_n` are never
pinned (the platform rejects them, 422), and the lighter retry body drops
the strategy altogether.

Rules the Worker keeps:

- `done` is `askPayload(result)`, byte-for-byte the shape the synchronous
  `/api/ask` returns (`cited` flags, `da-` slugs dropped, snippet windowing).
- The refusal retry mirrors the synchronous rule: a refusal over a healthy
  retrieval (5+ resources), or any empty answer, gets one silent retry. A
  `RefusalGate` holds back text while it could still be the start of a
  refusal ("Not enough data...", "The record retrieved for this question
  does not discuss..."), so the reader never sees a refusal that is about to
  be withdrawn; in practice `retry` therefore arrives before any `delta`.
- When the browser goes away (a newer question aborted the fetch), the
  writer's next `write` rejects; the Worker aborts its upstream fetch so the
  platform stops generating words nobody will read.
- One upstream connection per streamed ask; well inside the Workers cap of
  six simultaneous connections noted in MIGRATION-ARAG.md.

## The browser

`portal/public/app.js`:

- `readAskStream(body, signal, on)` reads the SSE response (`\n\n`-delimited
  blocks, `event:` / `data:` lines) and resolves with the `done` payload. A
  thrown error carries `shown: true` once any `delta` has been handed on, or
  when the Worker marked the error `final`. `on.open` fires once the response
  is known to be a stream; `on.status` gets every `status` payload.
- `portal/public/stages.js` draws the waiting state the conversation shows
  (`sendChat`): the three steps - reading your question, searching the
  record, writing the answer - as a hairline run under the loading animal,
  moved on by `open` / `searching`, `retrieved` + `writing` (or the
  `reading` heartbeat), and finished by the first `delta` or by `done`. The
  run then lifts away (`exit()`, a 340 ms beat) and the answer rises into
  its place (`.answer-in`); what lands under the answer fades up after it
  (`.answer-tail`). `cached` completes every step at once. All of it stops
  under `prefers-reduced-motion`.
- `askRecord(body, signal, on)` tries the stream and, if it fails before any
  text has been shown, falls back to the synchronous `api("/api/ask")` call
  with its one silent retry on a blank answer. A streamed `done` is taken as
  it comes (the Worker already retried).
- `streamRenderer(container, alive)` accumulates fragments and re-parses the
  whole text through `renderAnswer` at most every 120 ms (structure builds up
  as it lands); blocks new since the previous paint get `.stream-in`
  (380 ms fade, inside `prefers-reduced-motion: no-preference` only).
  `streamSafeText` shows an unclosed `**` plain and holds back a marker-only
  last line (`#`, `*`, `|`). `alive()` stops a superseded question painting
  late.
- Consumers: `runAsk` (first delta hides the wombat, clears the previous
  answer's stamp/sources/action row and reveals `#ask-result`; `done` runs
  the existing post-answer path), `runSearchAnswer` (first delta hides the
  rail loader), `sendChat` (a provisional `.chat-turn-answer` sits under the
  loader slot; `done` re-renders the thread from `chatThread` as before).
  `retry` clears the container and brings the loader back.
- `portal/public/thenvsnow.js` mirrors `readAskStream`/`streamRenderer` for
  the two era panels (it is a standalone module by design).

Existing AbortControllers cancel the stream: the signal is on the fetch, so
`reader.read()` rejects with `AbortError` and the Worker sees the client go.

Model text still reaches the DOM only through `textContent` (`renderAnswer`
and `appendInline`); no `innerHTML` is on the streaming path.

## The search overview streams too (12 September 2026)

`GET /api/search-summary?stream=1&…` answers as Server-Sent Events instead of
one JSON body:

    event: point   {text, source_ids}   a validated point, sent the moment its
                                        JSON object closes in the model's reply
    event: done    {status:'ready', points, sources, reviewed_count, partial}
                                        the synchronous payload, verbatim; this
                                        is what gets cached
    event: error   {error}

The Worker reads the platform's NDJSON answer chunks, pulls complete objects
out of `{"points":[…]}` as they arrive (`SummaryPointStream`, which tracks
JSON string state so braces inside quoted excerpts do not count), and runs
each through `summaryPointValidator` — the same per-point rules as
`parseSearchSummary`, shared so the streamed and synchronous paths cannot
drift. If nothing validates, the repair generation runs synchronously as
before and its points are sent together. A cache HIT, an empty result set and
an error still answer as plain JSON; `readSummaryStream` in app.js accepts
either shape. The page shows the skeleton at once, shrinks it to one bar as
points land, fades each point in (`.summary-point.stream-in`, off under
reduced-motion) and attaches numbered citations and the source list on `done`.
Measured live: first point ~2.5 s before the whole payload used to arrive.

## Caching

Every `/api/ask` miss is a paid generative call that takes 15-40 s, and the
same questions come back all day: twelve home-page chips, the topic pages'
"What has parliament said about X?", the money map's industry asks, the
harness, the report generator. The Worker therefore keeps finished answers
in `caches.default`, backed by shared Workers KV for public generations, and replays them — including down the SSE path, so
`readAskStream` in `app.js` needs no change and never learns the difference.

`X-OPAX-Cache: HIT | MISS | BYPASS` is on every cached endpoint.

| endpoint | TTL | key |
| --- | --- | --- |
| `POST /api/ask` | 7 days | SHA-256 of the canonical ask input (below) |
| `GET /api/search-summary` | 24 hours | prompt version + corpus epoch + query/scope + source snapshot |
| `POST /api/journey-story` | 7 days | prompt version + corpus epoch + server-loaded graph facts |
| `GET /api/search` | 10 min | SHA-256 of epoch + the query string, `nocache` dropped, params sorted |
| `GET /api/resource/<slug>` | 1 hour | epoch + slug |
| `POST /api/followups` | 7 days | SHA-256 of epoch + question + answer + the cleaned passages |
| `GET /api/stats`, `/api/recent` | 5 min | the route |
| `GET /api/news` | 15 min | the route |
| `GET /api/topics`, `/api/topic/*` &c. | as before | the route (`cachedJson`) |

### The ask key

`askCacheInput()` canonicalises exactly what `buildAskBody` and
`filterExpression` act on, then hashes it with `CACHE_EPOCH`:

- `question` — trimmed, whitespace-collapsed, lower-cased
- `kind` — as the filter sees it (missing means `speech`; `all` means no clause)
- `speaker` — through `canonicalSpeaker()`, so "john howard" and "John Howard"
  are one entry (the filter is the same; only the provenance turn's casing
  differs, which the model does not care about)
- `party`, `state` — trimmed, case kept (they are exact label matches)
- `topic` — only when it is one of the 21 slugs, mirroring `filterExpression`
- `from`, `to` — only when they are four digits
- `filtered` — whether ANY filter field was non-empty, because that alone
  swaps in the custom prompt and the guidance turn even for a value the
  filter expression then discards
- `epoch` — `CACHE_EPOCH` from `portal/wrangler.jsonc` vars

Two rules keep the cache honest:

- **Chat turns are never cached.** A body with a non-empty `context` gets no
  key at all: the answer depends on the conversation.
- **Only an answer worth a week is stored.** Not an `isRefusal()` ("Not
  enough data to answer this.", "The record retrieved…"), not empty, and it
  must cite at least one source. A thin-record refusal is re-asked every
  time, so the day the corpus grows the reader gets the new answer. Verified:
  the harness's teleportation-booth question is `MISS` on both of two asks.

`?nocache=1` (or `x-opax-nocache: 1`) skips the **read** and still **writes** —
what the harness wants when it is measuring the live model, and what makes a
`BYPASS` run leave the cache warm behind it.

### Follow-ups are prefetched (2026-09-04)
The Ask page requests `/api/followups` the moment its answer lands
(`prefetchAskFollowups` in `app.js`) and keeps the result on `lastAsk`, so
"Keep asking about this" seeds the chat with the chips already present; if the
fetch is still running the chat awaits it rather than asking twice. When chips
land in the chat the view scrolls to the composer so they are seen. Cost is
unchanged: one follow-ups call per answer, just earlier.

### Slow-platform guard (2026-09-04)
The platform's retrieval step normally lands in 4-6 s, but on 2026-09-04 a
chat follow-up sat for 100 s and came back as a 524 while a labelling task was
loading the index. The Worker no longer waits that out:
- **Stall:** an ask that has produced no NDJSON item at all within 25 s is
  aborted and re-asked once with lighter retrieval (`reranker: noop`,
  `top_k: 12`), announced to the reader as `event: retry {reason: "slow"}`.
  The lighter attempt gets 50 s. Non-OK upstream statuses take the same path.
- **Refusal retry is bounded:** the silent second ask on a "not enough data"
  answer only happens when the first attempt took under 20 s; an empty
  answer is still always retried.
- **Synchronous `/api/ask`** carries a 40 s `AbortSignal.timeout` per attempt
  with the same lighter retry, answering 504 rather than hanging.
Measured after reasoning was switched off on the OpenRouter preset: plain
asks 3.4-7 s, the reranker ~1 s of that.

### Replaying a cached answer as a stream

A `HIT` on `/api/ask?stream=1` goes to `replayCachedAsk()`, which writes the
same SSE contract from the stored payload: one `status` (`phase: "cached"`,
with `cached_at`), the answer in ~300-character pieces cut on word
boundaries with a 30 ms pause between them so `streamRenderer` still paints
progressively, then the stored payload verbatim as `done`. The pieces
concatenate to `done.answer` byte for byte — that is the contract
`readAskStream` relies on, and the reason the chunker snaps to spaces rather
than re-wrapping. The whole replay lands in about 0.3 s.

A `MISS` on either path writes on the way out, under `ctx.waitUntil`: the
streamed path caches the `done` payload (the same bytes the reader got), and
it does so even when the reader left early — the answer was paid for either
way.

`caches.default` is **per Cloudflare location**. As of 2026-09-10, successful
Ask answers, cited search summaries and journey stories also have an expiring
copy in `GENERATION_CACHE` (Workers KV). An edge miss checks this shared copy
before making another paid call, then warms the local edge for the remaining
lifetime. Existing edge answers are adopted without extending their expiry.
Staging has a separate namespace. Conversation turns still bypass this cache.

`X-OPAX-Cache-Tier: edge | shared` identifies the layer serving a hit. Structured
`generation_cache` logs contain only route and outcome, never questions, answers,
user identifiers or credentials. Storage failures fail open; only successful,
validated JSON responses up to 1 MB enter shared storage. Account/cookie responses
cannot enter this cache. KV is eventually consistent, so simultaneous cold
requests can still generate separately during propagation. This is response
reuse, not a global concurrency lock. Ordinary edge-only caches are unchanged.

The cache retains the existing TTLs and corpus/prompt keys. A corpus epoch bump
invalidates both layers together. No model or citation-validation rules change.

Measured against `wrangler dev`, 2026-09-02:

| | MISS | HIT |
| --- | --- | --- |
| `/api/ask` synchronous | 26.2 s | 0.05 s |
| `/api/ask?stream=1` | 25.6 s (230 deltas) | 0.32 s (6 deltas) |
| `/api/search` | 11.0 s | 0.003 s |
| `/api/resource/<slug>` | 0.22 s | 0.003 s |
| `/api/followups` | 6.8 s | 0.002 s |

The two ask paths share one cache: a streamed miss makes the synchronous
call a hit and the other way round (verified — same answer hash both ways).

### Warming it

`python3 scripts/warm_cache.py` asks each recurring question once,
synchronously, one a second, and prints question / cache status / seconds /
cited count. `--dry-run` lists them, `--limit N` takes the first N,
`--source chips,topics,…` narrows it. 75 distinct questions across five
sources (home chips, the 24 harness questions with their filters, the 21
topic pages, the report generator's questions, the money map's industry
asks); a fully cold run is 75 model calls, roughly $0.60. Re-running is
free: anything already warm answers `HIT`. Run it from Australia, after a
deploy or a `CACHE_EPOCH` bump.

### Rate limits

Cloudflare's Rate Limiting binding (`ratelimits` in `portal/wrangler.jsonc`;
needs Wrangler ≥ 4.36), keyed on `CF-Connecting-IP`:

| binding | endpoint | limit |
| --- | --- | --- |
| `ASK_LIMITER` | `/api/ask` | 20 / 60 s |
| `FOLLOWUPS_LIMITER` | `/api/followups` | 20 / 60 s |
| `SEARCH_LIMITER` | `/api/search` | 120 / 60 s |
| `MODEL_LIMITER` | every paid generation (one key for all readers) | 60 / 60 s |

`limit()` is called **after** the cache read, so a hit costs no quota — the
hot questions stay free no matter how often they are asked. Over the limit
is `429` with `{"error": …}` and `Retry-After: 60`. The limiter **fails
open**: a binding outage, or a build without it, logs a warning and lets the
request through. Losing the site to a limiter fault would be the worse
failure. Miniflare implements the binding locally, so `wrangler dev`
enforces the real thing.

The calculated money answer's opening paragraph is a paid call too: it spends
the reader's `ASK_LIMITER` token after its own cache read, and past the limit
the calculated answer goes out without the paragraph (`x-opax-overview:
rate-limited`).

`MODEL_LIMITER` is the aggregate cap (October 2026). Every platform `/ask`
call, whether answer, retry, rewrite, overview, follow-ups, journey story or search
overview, checks one constant key first, so the cap covers all readers at a
Cloudflare location together; cache hits never reach it. Past it, the call is
answered `429` with `x-opax-model-budget: spent` and the caller's fallback
stands: an Ask answer is a `503` "busy, try again in a minute" with
`Retry-After: 60` and no lighter retry, a position answer falls back to its
excerpts, and the overview, follow-ups, story and search overview are simply
absent. Change the limit per environment in the binding's `simple.limit`
(staging has no limiters). Like the others it fails open.

**Warm-up after an epoch bump.** A bump orphans every cached answer, so the
first asks of each question are model calls again: the 75 recurring questions
of `warm_cache.py` (about $0.60 cold) and whatever readers ask. Expect the
hit rate to recover over the first day as the common questions are asked
again. At most 60 generations a minute per location run while it is cold,
whatever the traffic, so the worst case for a sustained burst is about 3,600
calls an hour per location, with readers past the cap seeing "busy" instead
of a bill. Run `warm_cache.py` after the deploy so the recurring questions
are warm before readers reach them.

`CACHE_EPOCH` is the kill switch for all of it. Bump it in
`portal/wrangler.jsonc` and deploy, and every cached answer, search, resource
and follow-up is orphaned at once (the old entries simply age out). Bump it
whenever the corpus changes — see the invariant in `MIGRATION-ARAG.md`.

### Current Progress footnotes (8 September 2026)

Ask now requests `citations: "llm_footnotes"` and retains `footnote_citations`
plus `augmented_context` items from NDJSON. The Worker resolves provider block
mappings to known original evidence, removes reference syntax from prose and
returns the existing clean-answer/citation-range payload. Streaming deltas hide
incomplete footnote syntax; the final `done` contains verified ranges. The
`retry` event can also carry `reason: "citations"` when beta generation omitted
its mapping and Opax retries once with legacy citations. See the
[feature review](operations/2026-09-08-progress-rag-features.md) for live format
findings, compatibility details and the broader release inventory.

## Whole-person overviews (10 October 2026)

`ask-person-overview.ts` recognises broad, roster-resolved requests such as
“What has X said in parliament?”, “What does X talk about?”, “X's views”,
“Summarise X's speeches”, “X's positions”, “X's speeches”, “What has X talked
about?” and “What topics does X discuss?”. The roster-loading gate shares the
parser's candidate grammar. Matching uses an
exact public roster name and a complete question pattern. A topic, date window,
comparison or hypothetical stays on its existing answer path. Explicit scope
controls still win. The conversation rewrite and “Understood as” are unchanged;
intent detection happens after that rewrite and normal scope resolution.

These first answers use the ordinary `buildAskBody` generation preset, 1,800
output tokens and `llm_footnotes`, with the existing citation normalization,
quotation verification and bounded recovery. They receive a cited evidence pack
in `extra_context` (ordinary `USER_CONTEXT_n` IDs). The prompt asks for about
300 words: 3–5 counted themes, recent speeches and bills with dates, then one or
two verbatim quotes. It forbids editorialising, party-based inference, attribution
of other speaking turns, and inferring sponsorship or votes from a bill speech.
The overview stream emits a fixed `searching` status before roster loading,
cache checks or retrieval. It holds answer deltas until final verification and
the withheld-name check, then emits the usual `done` payload, including when
the aggregate fails and ordinary Ask retrieval supplies the answer. Cache keys
retire the previous prompt pipeline version.

`OVERVIEW_RETRIEVAL_MS` is one cancellable 4,000ms deadline for pack preparation
and retrieval; each call has `OVERVIEW_CALL_MS` = 1,200ms beneath it. Abort signals
reach catalogue, find and original-resource fetches, including response-body
reads. Catalogue pages, theme searches and the peer facet share a pool of five
connections; originals are deduplicated and consumed through the same bounded
parallelism. Timeout, schema rejection or another pack error cancels the remaining
work and falls back to `retrieveAskRecords` and ordinary Ask generation. Pack
failure never returns a 503. `OVERVIEW_FIRST_ANSWER_MS` bounds the whole first
answer to 20,000ms, including generation and verification. Citation/quote recovery
gets at most `OVERVIEW_VERIFICATION_MS` = 2,000ms within the remaining allowance;
it cannot restart the clock. The same first-answer budget reaches the conversation
rewrite fetch and its response-body read (with the existing nine-second per-call
timeout clipped to the remaining budget). Reader cancellation or deadline expiry
aborts that call; cancellation is checked before retrieval can continue. Client
cancellation stops pending rewrite, retrieval and generation. The existing model, output token cap and citation/quote rules remain.

The pack is assembled from:

- A speaker-filtered `/catalog` with topic facets and metadata pages of 200
  resources, capped at 10 pages / 2,000 speeches (the catalogue contract caps
  page size at 200). It uses a **resource-only** filter; field exclusions remain
  on `/find`. Facets give whole-record totals
  and top topic counts. Metadata dates give the rolling year ending at the
  exported corpus snapshot and the two most recent dated speeches. Catalogue
  `created` is index time and is never used for this. Counts overlap because
  speeches can carry several topic labels. `enumeration_complete`, `dates_complete`
  and `classifications_complete` are tracked separately. A missing/invalid date or
  missing/unrecognised topic classification keeps whole-record facets but omits
  rolling-year counts and “latest” claims, even with full slug enumeration.
  Split identities have house/service checks against metadata dates and require
  all three completeness checks for their counts.
- Up to five theme-filtered **keyword-only** `/find` passes (`top_k: 10`,
  `features: ['keyword']`, `reranker: 'noop'`), up to two originals per
  theme, read through the existing resource cache. Only the indexed speaker's
  first speaking turn passes `positionEvidence`; no ministerial replies enter
  the pack. The two recent originals bring the total to at most 12 reads.
- `/growth/person-bills/<name-hash>.json`, built by `build:growth` from the complete
  published bill exports: exact speaker links and resolved public sponsors,
  introduction dates and up to three linked speech dates. Twelve candidate bills
  per person are exported; the pack retains the two most recent relevant bills.
  This projection contains no summaries, donors or donation fields.
- One topic-filtered collaborator facet for an optional comparison member,
  accepted only if they resolve to another public roster member.

Evidence text is capped at 24,000 characters, with each ordinary context record
still capped at 1,800 characters. The pack uses a ten-minute **per-Worker-isolate
LRU**, capped at **500 keys**, keyed by corpus epoch, pipeline version and
person/scope and the SA full-text policy flag. Pack entries no longer create Cache API keys; eviction and expiry
are application-controlled. Existing originals retain their
one-hour cache; successful first answers retain the seven-day generation cache.
On a cold pack, the request maximum falls from 38 extra upstream calls to **28**:
10 catalogue pages, five keyword finds, one peer facet and at most 12 originals.
The deadline often stops earlier; a warm pack makes none of these calls.
The previous five hybrid/predict finds requested **five query-embedding plus five
predictive-rerank operations** outside the BYOK answer-generation budget. They
are now keyword/noop finds with **zero additional embedding/rerank operations**.
That is five extra inference-using requests reduced to zero for the theme pack.
Main's SA safeguard now performs a generation-disabled Ask preflight: SA evidence
then goes to Predict with explicit capped context; non-SA uses the normal Ask
after that preflight (two retrieval requests). Both paths keep one BYOK generation,
with the existing main semantic query and reranking plus bounded recoveries.
The pack adds no generation call; added context increases answer input tokens.
This counts requested inference operations, not measured account charges:
[Progress consumption](https://docs.rag.progress.cloud/docs/rag/advanced/consumption/)
distinguishes normalized platform tokens from customer-key tokens, and catalogue
and original reads still consume platform requests even though they add no model
inference. Conversation rewriting retains its existing separate call.
Person chips are deterministic and add no generation cost; other answer follow-ups
keep their existing model and evidence checks. A latest-speech chip uses the same
cached metadata pack to select the most recent dated original, rather than a
nearest-chunk search.

All newly exposed evidence, bill projection text, comparison names, finished
answers and source previews pass the withheld-name detector backed by
`donor-entity.js`. The panel is a server-created public person projection; the
model cannot supply its identity fields. The chat keeps 2–4 full-question chips
on their individual answer, without a heading. Vote and comparison chips clear
the speech filter for that request. The desktop panel uses the existing portrait
map, party dot and design tokens, and is hidden below 1,000px and in the dock.
The generated overview and the panel's machine-classified top topics use the
shared Machine label from `labels.js`.

The overview applies main's `saEvidenceRecord` helper to each selected SA speech
before `recordContext` serialises it for generation. The 120-word cap includes the
speaker/date/topic prefix. SA source-only and chamber-only classifications also
retain their provenance; state, chamber and the official source URL remain
in both model context and citation sources. Original resource provenance fills gaps
in catalogue metadata. SA quotations without an official Parliament URL are withheld;
`SA_HANSARD_FULL_TEXT=true` follows main's explicit bypass. Main's generation-context,
conversation, cache-hit, stream-event and public display guards remain in place.

Offline verification is in `test/ask-person-overview.test.mjs` and
`test/ask-person-route.test.mjs`, with shared synthetic record/model fixtures.
`test/ask-first-answer-browser.mjs` captures the real `/chat` UI at 390, 1280 and
1440 pixels, intercepting every API request and rejecting all external traffic.
Run it under the local-server network namespace, with `OPAX_PLAYWRIGHT_MODULE`
and `OPAX_BROWSER_EXECUTABLE` pointing to the local installed browser tools.
Artifacts go to `portal/private/ask-first-answer/`. Slow (1s per upstream call),
failing and delayed-verification stubs record first-byte/answer timings in
`review-timings.json`; catalogue fixtures reject forbidden predicates with 422.
