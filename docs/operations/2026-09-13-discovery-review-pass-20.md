# Discovery review pass 20 — keep the topic when widening dates

## Reproduced weakness

After “Does Pauline Hanson support nuclear power in 2025?”, “And all years?” retained the 2025 filter and searched for “nuclear power in 2025 all years”. “What about all years?” instead searched only for “all years”. A bare “All years” lost the named speaker entirely. These follow-ups could therefore miss useful older statements.

The independent challenge found a second form: asking why she supported it before widening the dates left 2025 in the retrieval text even after clearing the structured date filters. A date placed before the topic had the same problem.

## Change

Recognise a complete all-years/all-time follow-up, retain the named speaker and speech topic, and remove inferred date bounds. Explicit request controls retain precedence independently. The retrieval query drops the previous date clause at the beginning, middle or end, while preserving event years such as “the 2011 Fukushima disaster”. Later dates, people and topics can still replace the previous selection.

Only complete follow-up forms trigger the reset: “all years of schooling” stays a topic, and “all years since 2020” retains its date restriction. Only user/question history can supply a person. Funding questions, unrelated subjects and non-speech controls cannot revive an earlier speaker. Existing original-speaking-turn attribution checks remain in force. Contextual requests already bypass shared generation caching, so no cache migration or model change is needed.

## Evidence and verification

The source replay uses archived originals, current retrieval/scope/attribution code and explicitly mocked generation. Hanson’s 21 March 2023 speech supports a technology mix including nuclear; her 27 August 2025 speech proposes repealing the ban and building one 1,400-megawatt reactor on the East Coast to start with. The 2023 statement must not inherit the specific 2025 proposal. Widening dates makes the older source eligible; it does not establish a current policy or a complete history.

The full suite passed 547 tests; 77 focused scope/evidence tests passed. Tests cover repeated follow-ups, partial explicit dates, topic/date replacements, bare and qualified all-years wording, non-user history, unrelated new subjects and date clauses before or after detail words. Type, asset-stamp and production bundle checks passed. Independent code/source review and Chromium/WebKit browser matrices at 390, 768 and 1440 pixels are archived under `/Users/jake/.cache/opax/discovery-reviews/pass-20-20260913/` with release identifiers and final readbacks.

Browser response replays verify rendering, request context and source destinations; they are not a new measurement of live model answer quality or a physical iPhone test. No paid external model calls were made. Five source-location candidates remain in review, with no inferred award/payment or electorate, and the existing summary-worker pause remains intact.

This completes the five-pass discovery cycle numbered 16–20. Enrichment and source monitoring continue under the existing hourly automation after its completed discovery-cycle instructions are removed.
