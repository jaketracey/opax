# Discovery review — pass 3, 12 September 2026

This pass fixes a named-person attribution failure found during the previous funding and proposal reviews. Enrichment workers and their provider configuration are unchanged.

## What failed

The cached Hanson housing answer attributed a supply-versus-investor argument to her from `speech-1203782`. The original 29,517-character record contains several speakers. The quoted argument occurs after the first speaker's time expires and a new 1:08 pm turn begins; the later speaker refers to their home state of Western Australia. The record's Hanson metadata does not establish that attribution.

The useful control is `speech-1194323`, dated 11 February 2025: a five-year GST moratorium for essential building materials for homes up to $1 million, with her stated $1.4 billion four-year costing. The other control is David Pocock's `speech-1204764`, dated 2 July 2026: affordable-housing conditions on surplus Commonwealth land sold or leased for residential development. Its definition caps rent at 75% of market rent or 30% of tenant household income, whichever is lower, with management by registered community housing providers. These are documented proposals, not enacted policies or predicted future statements.

## What changed

Named hypothetical-position and proposal questions now search the requested speaker and filters, read up to eight original speeches, and stop at the first detected speaker boundary before generation. Titles, generated briefs and later turns cannot substitute for original first-turn evidence. An explicit proposal in a long first turn takes priority over a repetitive introduction when selecting a bounded passage, preserving the conditions near the end of Pocock's bill speech.

One structured generation produces up to two dated points. Each surviving point needs a real excerpt from its passage, and both the point and its supporting excerpt must address the query. An unrelated NDIS point cannot survive by appending “not directly tied to housing affordability.” A bad point is discarded without discarding another verified, useful point. Original-text read failures return an unavailable response; empty or unverifiable selections never replay unverified search snippets.

Provider probes also exposed a 20,000-character query limit and occasional malformed JSON/HTML-link spacing. Prompts now fit below 19,500 characters by dropping lower-ranked sources. Normalisation can restore a single missing outer brace and exact source whitespace; it cannot invent words, numbers or source IDs. Search overview defaults retain their previous passage limit.

Only named position-answer caches gain a new version. General Ask and existing financial calculations retain their caches. Stream-request clients accept the resulting JSON, while existing cached replay remains supported. No source records, source metadata, graph figures, voice configuration or model selection were changed.

## Validation and limits

- 371 portal tests passed, including speaker boundaries, ministerial replies, topic leakage, fabricated quotes, incorrect source identity, query bounds, missing root braces, Unicode/spacing, proposal conditions and selective cache invalidation.
- TypeScript, asset-stamp checks and all four jurisdiction graph smoke checks passed.
- Bounded live-provider iterations exposed and corrected both attribution and irrelevant-point failures; structural citation success alone was not treated as factual verification. Original source text and raw responses are archived for review. Local generated checks took approximately 15–18 seconds; cache replay and receipt calculations avoid repeat model calls.
- Local UI checks replay captured, validated output at 390, 768 and 1440 pixels to avoid repeat generation. Production verification must additionally exercise real API responses and working source links after deployment.

This is a conservative retrieval guard, not a repair of all combined debates. It may omit a speaker's resumed turn after an interruption, and undetected boundaries or incorrect original metadata remain possible. A bounded ranked selection cannot establish the absence of a position, the speaker's current position, or the completeness of their proposals. Exact quotation and numeric checks do not prove every paraphrase; original-record review remains required before promoting a claim.

Working evidence: `/tmp/opax-discovery-pass3`. Persistent archive: `/Users/jake/.cache/opax/discovery-reviews/pass-3-20260912`. The reproducible questions are in `scripts/ask_discovery_questions.json`.

## Production follow-up

Initial release PR #135 (`bd9e37bf9085b5cfe92080ab263f9edee2d35278`, Worker `62a705c0-566f-43f4-94e3-3602a1ac4fe5`) passed the Pocock proposal, unsupported-topic and financial controls. A fresh Hanson request still returned an evidence gap after 20.79 seconds despite the known original proposal. This was treated as a release defect, not a successful no-hallucination check.

The follow-up retains one generation attempt and, if it cannot produce a verified summary, selects at most two short verbatim sentences containing an explicit, on-topic proposal from the already bounded original turns. It displays the speaker, date and direct citation and identifies the result as source evidence. Procedural openings, unrelated proposals and later turns cannot fill this fallback. If no qualifying sentence exists, the explicit evidence gap remains. This adds no model retry or source fetch; valid cached summaries remain usable. The regression suite now has 373 passing tests.
