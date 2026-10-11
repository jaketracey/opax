# South Australian Hansard display policy

`SA_HANSARD_FULL_TEXT` defaults to the string `"false"` in production and staging. Missing values and all values except the exact string `"true"` restrict SA Hansard to excerpts. Set this one flag to `"true"` only after permission is granted to restore the existing full-text behaviour.

The policy identifies SA Hansard through source, jurisdiction and chamber metadata. Original documents, the knowledge box and retrieval stay complete. While restricted, selected SA evidence is capped before generation, and public source payloads are capped again for display.

`kbFetch('/ask')` first retrieves with `generate_answer:false`. When that retrieval includes SA, `saGenerationContext` bounds the original, neighbouring, expanded and prior-record passages before submitting explicit `query_context` to the KB's generation-only `/predict/chat` proxy. One matched excerpt is reused across the same record's context blocks. Model selection, prompts and original paragraph IDs are retained, so footnote citations still map to the original record. Non-SA generation uses the existing `/ask` body and response; permission bypasses the preflight entirely. The adapter follows the provider's [ChatModel](https://github.com/nuclia/nucliadb/blob/main/nucliadb_models/src/nucliadb_models/search.py) and [Predict proxy](https://github.com/nuclia/nucliadb/blob/main/nucliadb/src/nucliadb/search/search/predict_proxy.py) contracts; provider calls in validation are stubbed.

Search-summary and documented-position prompts also bound their inline evidence. Follow-ups and conversation turns carry source metadata from the client; legacy passages without provenance receive the same conservative cap. Prior assistant quotations are bounded before the question-rewrite model as well as the answer model. Voice and MCP tools obtain their evidence through the protected public resource/search reader. No knowledge-box writes are involved.

Restricted source passages contain at most 120 words. A sentence window centres on the matched or cited passage, otherwise it starts at the opening. An overlong single sentence is word-capped. Repeated source fields reuse a canonical excerpt; copied Ask passages share a per-source budget. Every excerpt carries this notice and the resource's existing official Parliament URL:

> Excerpt. The full record is on the Parliament of South Australia's site.

Missing or untrusted official URLs withhold source text until the raw resource resolves provenance, including evidence that could become a streamed quotation. Only Parliament of South Australia hostnames qualify. Machine summaries are retained, including the existing Machine pill.

Read-only verification on 10 October 2026 found that existing SA resources `speech-1159189`, `speech-1164157` and `speech-1076106` have neither an origin URL nor a metadata `source_url`. The speech ingestion/sync currently omits these links. Those records therefore withhold source quotations while the flag is off and retain their machine summaries. This branch does not invent record URLs or change the knowledge box. Source-link recovery is required for those records to display linked excerpts.

| Surface | Protection |
| --- | --- |
| Document pages and iOS-facing `/api/resource/{slug}` | `text` becomes an excerpt; additive policy fields identify the cap and official record. Existing string-valued labels remain intact. |
| Search, unified search, people, parties, organisations, topics and related records | Search result source passages are capped; every rendered passage has the notice and official link. Expansion cannot replace an SA excerpt with the full speech. |
| Search summaries | Supporting source and per-point evidence are capped; machine prose remains. |
| Ask answers, citation panels and quote rails | Copied prose and quoted passages are bounded; Unicode citation ranges are remapped. Saved browser conversations are checked again before rendering. |
| JSON APIs, cached responses, staging proxy and MCP `read_record` | The public boundary applies the same policy. Internal raw resource reads remain complete. |
| Reports and source exports | Static report JSON runs through the Worker; repeated citations reuse one excerpt. CSV exports include the excerpt notice. |
| Share cards | Machine summary remains; both landscape and portrait cards show the notice and official URL. Their cache key includes the flag. |
| `llms.txt` | The guide describes excerpt-only resource and MCP access while the flag is off. It contains no Hansard body text. |

SSE responses pass through `saPublicResponse` by identity, preserving their body stream, bytes and headers. Deltas and points retain their existing progressive timing. Before the server encodes `done` or `sources`, `saEventPayload` caps source/citation views and adds the notice and official URL, without rewriting generated prose or citation offsets. Cached Ask JSON is checked before replay, preventing legacy full passages from being streamed. JSON rewriting and `no-store` apply only to payloads containing SA records; non-SA JSON bytes and cache headers remain unchanged.

Truncated excerpts use one trailing ellipsis in place of the sentence's final full stop. Complete short sentences retain their punctuation.

There is no full-text download or copy-full-text action for restricted SA records. Other jurisdictions retain their document behaviour; synthetic federal, Victorian and Queensland snapshots assert byte-identical JSON.

Additional private snapshots of existing federal, Victorian and Queensland API documents verify byte-identical responses with both flag values. Existing SA snapshots verify that missing URLs withhold text, retain summaries and restore the original JSON with the flag on.

Validation uses `node --test test/*.test.mjs`, `npm run check` and `npx wrangler deploy --dry-run` under Node 24. No deployment is performed. `portal/public/votes.json` must remain byte-identical.

Local screenshots at 390 and 1280 pixels cover the SA document, search result and opened Ask citation. They are stored under `portal/private/web-sa-excerpts/` with capture metrics and stub logs. Every API request is intercepted by fixtures, including Ask, generation, auth and voice; external browser requests are blocked.
