# Progress Agentic RAG feature review — 8 September 2026

Opax's Ask pipeline now requests LLM footnotes, includes one paragraph before
and after each retrieval hit, and supplies classification metadata while respecting the current
rule that index speaker metadata cannot establish who said a debate passage. Follow-up conversations use
`chat_history` instead of the deprecated `context` parameter. The public Opax
request still accepts `context`, preserving existing clients and saved chats.

## Evidence and release inventory

Reviewed the official [changelog](https://docs.rag.progress.cloud/docs/changelog/),
[Ask guide](https://docs.rag.progress.cloud/docs/rag/advanced/ask/),
[RAG strategies](https://docs.rag.progress.cloud/docs/rag/rag-strategy/), and
[API reference](https://docs.rag.progress.cloud/docs/nucliadb-agentic-api/),
using Context7 and the published
[API models](https://github.com/nuclia/nucliadb/blob/main/nucliadb_models/src/nucliadb_models/search.py).
The changelog's latest entry at review was 14 July 2026. The footnote guide
labels the feature **beta**, without a release date. Context expansion and
`chat_history` are current documented capabilities; this review does not assign
them an unverified release date.

| Capability | Opax disposition |
| --- | --- |
| LLM footnotes (beta) | Implemented for synchronous answers, streaming and cache replays. |
| Neighbouring paragraphs | Implemented with a bounded one-before/one-after window. |
| Provenance metadata in the generation context | Implemented using classification labels; origin speaker metadata stays excluded. |
| Current conversation history API | Implemented with existing 24-message/6,000-character bounds and no shared chat cache. |
| Hybrid retrieval and reranking | Already present; kept the existing `predict` reranker. |
| Structured outputs | Already used by follow-up generation; kept separate from citations. |
| New Claude, OpenAI and Gemini model options (May–July) | Available platform options; Opax retains its existing BYOK model. No model migration required for these features. |
| AWS Australia region (26 June) | Opax already runs its knowledge box in `aws-ap-southeast-2-1`. |
| MCP OAuth (12 June) and smart-agent feedback/MCP integration (28 May) | Require an external retrieval workflow and configured MCP source; this portal currently uses direct KB retrieval. No unused connector or credential flow added. |
| Snowflake agent (5 May), SQL/Pandas agents (23 April) | Require database connections and retrieval-agent configuration. Opax's published financial catalog remains served by its existing deterministic search. |
| Pagehound visual extraction (28 April), Gemini 2 embeddings (24 April) | Ingestion/index changes requiring corpus evaluation or reprocessing; no corpus/model rewrite in this answer-pipeline release. |
| Cloud sync, ShareFile, Bedrock/Vertex BYOK and security enforcement | Source/account administration features. No new private data connector, key or access-group policy is needed for this public corpus. |

## Citation contract

Progress's live synchronous response uses `citation_footnote_to_context`;
the guide also documents `footnote_to_context`. Both are supported. Streaming
uses `footnote_citations.footnote_to_context`. The live Opax model can emit
plain `[1]` / `[1]: block-AA` references as well as Markdown `[^1]` references.
Both are resolved through the provider's mapping, never source ordering.

Only references to returned original paragraphs or augmented text belonging
to a returned resource become citations. Generated `da-*` fields and resources
cannot support a citation. References become Unicode code-point ranges into
the clean answer, so the existing accessible source buttons and exports retain
their contract. A cited neighbouring paragraph can supply the source snippet.
Internal footnote markers and definitions are withheld during streaming.

A live probe also reproduced an answer containing numbers without the mapping.
For a substantive retrieved answer with no usable citations, Opax makes one
bounded attempt using the legacy `default` citation mode. If recovery fails,
the complete original answer remains retrieved-only. No citations are invented.
The Ask cache includes a pipeline version, preventing old answers from masking
the release without invalidating unrelated corpus caches.

## Verification

- Live provider probes confirmed the current request fields and both response mapping paths.
- Regression coverage exercises Unicode positions, multiple/repeated references,
  missing mappings, generated/unknown source rejection, neighbouring evidence,
  legacy compatibility, every streaming chunk boundary, NDJSON decoding, frontend
  marker placement, conversation limits and versioned cache keys.
- The full portal suite and citation/context checks pass, including integration
  with the concurrently released financial-record Ask context.
- TypeScript, asset stamps and Worker deployment dry-run passed.
- The locally running Worker returned 10 citations across 9 cited sources for a
  speaker-scoped question. A streamed follow-up returned 4 citations and 19
  retrieved sources, with no retry or error event.

Rollback: deploy the preceding Worker version, or revert this release and run
`npm run deploy` from `portal/`. No corpus, credential or model configuration
was changed.
