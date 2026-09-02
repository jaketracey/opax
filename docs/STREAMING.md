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
