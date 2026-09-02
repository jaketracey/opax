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
data: {"phase":"reading","words":<n>}        heartbeat every 2 s while the model reasons

event: delta
data: {"text":"..."}                          answer text to append

event: retry
data: {"reason":"refusal"|"empty"}            attempt one is withdrawn; text resets

event: done
data: {"answer":"...","citations":{...},"sources":[...]}   the synchronous payload, verbatim

event: error
data: {"error":"..."}
```

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
  thrown error carries `shown: true` once any `delta` has been handed on.
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

## Caching

Every `/api/ask` miss is a paid generative call that takes 15-40 s, and the
same questions come back all day: twelve home-page chips, the topic pages'
"What has parliament said about X?", the money map's industry asks, the
harness, the report generator. The Worker therefore keeps finished answers
in `caches.default` and replays them — including down the SSE path, so
`readAskStream` in `app.js` needs no change and never learns the difference.

`X-OPAX-Cache: HIT | MISS | BYPASS` is on every cached endpoint.

| endpoint | TTL | key |
| --- | --- | --- |
| `POST /api/ask` | 7 days | SHA-256 of the canonical ask input (below) |
| `GET /api/search` | 10 min | SHA-256 of epoch + the query string, `nocache` dropped, params sorted |
| `GET /api/resource/<slug>` | 1 hour | epoch + slug |
| `POST /api/followups` | 24 hours | SHA-256 of epoch + question + answer + the cleaned passages |
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

`caches.default` is **per Cloudflare location**. A question warmed in Sydney
is a miss in Frankfurt. Accepted: the readers are Australian, and
`scripts/warm_cache.py` is run from Australia.

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

`limit()` is called **after** the cache read, so a hit costs no quota — the
hot questions stay free no matter how often they are asked. Over the limit
is `429` with `{"error": …}` and `Retry-After: 60`. The limiter **fails
open**: a binding outage, or a build without it, logs a warning and lets the
request through. Losing the site to a limiter fault would be the worse
failure. Miniflare implements the binding locally, so `wrangler dev`
enforces the real thing.

`CACHE_EPOCH` is the kill switch for all of it. Bump it in
`portal/wrangler.jsonc` and deploy, and every cached answer, search, resource
and follow-up is orphaned at once (the old entries simply age out). Bump it
whenever the corpus changes — see the invariant in `MIGRATION-ARAG.md`.
