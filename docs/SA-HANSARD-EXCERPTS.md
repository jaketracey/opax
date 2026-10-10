# South Australian Hansard display policy

`SA_HANSARD_FULL_TEXT` defaults to the string `"false"` in production and staging. Missing values and all values except the exact string `"true"` restrict SA Hansard to excerpts. Set this one flag to `"true"` only after permission is granted to restore the existing full-text behaviour.

The policy identifies SA Hansard through source, jurisdiction and chamber metadata. It applies at the public response boundary, after internal retrieval and generation. The knowledge box, original documents, internal retrieval caches and model context remain unchanged.

Restricted source passages contain at most 120 words. A sentence window centres on the matched or cited passage, otherwise it starts at the opening. An overlong single sentence is word-capped. Repeated source fields reuse a canonical excerpt; copied Ask passages share a per-source budget. Every excerpt carries this notice and the resource's existing official Parliament URL:

> Excerpt. The full record is on the Parliament of South Australia's site.

Missing or untrusted official URLs withhold source text until the raw resource resolves provenance. Only Parliament of South Australia hostnames qualify. Machine summaries are retained, including the existing Machine pill.

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

Unclassified streamed answer deltas and summary points are held until the final payload supplies source metadata. Status events continue. The checked final answer and points are then emitted. With the flag on, streams and JSON responses pass through unchanged.

There is no full-text download or copy-full-text action for restricted SA records. Other jurisdictions retain their document behaviour; synthetic federal, Victorian and Queensland snapshots assert byte-identical JSON.

Additional private snapshots of existing federal, Victorian and Queensland API documents verify byte-identical responses with both flag values. Existing SA snapshots verify that missing URLs withhold text, retain summaries and restore the original JSON with the flag on.

Validation uses `node --test test/*.test.mjs`, `npm run check` and `npx wrangler deploy --dry-run` under Node 24. No deployment is performed. `portal/public/votes.json` must remain byte-identical.

Local screenshots at 390 and 1280 pixels cover the SA document, search result and opened Ask citation. They are stored under `portal/private/web-sa-excerpts/` with capture metrics and stub logs. Every API request is intercepted by fixtures, including Ask, generation, auth and voice; external browser requests are blocked.
