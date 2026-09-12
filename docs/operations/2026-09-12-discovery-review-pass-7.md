# Discovery review — pass 7, 12 September 2026

Funding conversations now retain the selected recipient, donor or industry, jurisdiction and financial year. A person can ask who gave most to Labor, follow with “What about Liberal?”, switch industry, name a donor and change the year without silently returning to a general generated answer.

## Reproduced problem

At the current-main baseline `d9e6684b`, the deterministic ranking predicate rejected every request with conversation history. “What about Liberal?”, “And fossil fuel donors?” and “And in 2021–22?” all returned no calculated answer. This was reproduced against the original module and published graph; no paid generated baseline was requested.

The independent review also found that Keep Asking discarded dates chosen only through the Ask controls. A filtered FY2020–21 starting question followed by “What about Liberal?” could become a lifetime ranking. A long conversation could then discard the original selection when the browser shortened its history.

## Changes

Receipt calculations run before speech scope inference. A bounded parser reconstructs a single funding selection from user turns, replacing only the named dimension. Self-contained funding questions reset it; speech questions and unresolved groups end inherited funding scope. The calculator and source links use the same explicit selection. Current API controls take precedence.

Calculated single rankings return a canonical question containing the resolved selection, without amounts or answer prose. Keep Asking stores it alongside the original visible question, including the UI-only filters, and preserves it after subsequent answers and reloads. Financial-year context and the existing methodology disclosure remain visible in the conversation.

Date-only clarification preserves the selection so “And last year?” can be corrected with “And in 2021–22?”. Mixed unknown groups and relative dates do not preserve it. Leaving funding for a speech question clears the funding year and avoids prepending a funding query to speech retrieval.

## Independently checked example

In the selected federal map, FY2020–21 Labor gambling receipts are led by Tabcorp Holdings Limited at $140,600 across nine records. “What about Liberal?” gives Sportsbet at $175,500 across five records. “And fossil fuel donors?” gives Woodside Energy at $137,000 across five records. “What about Tabcorp Holdings?” gives $87,300 across six records to Liberal. “And in 2021–22?” gives $87,500 across five records.

These are selected disclosed party receipts, including more than gifts, not a complete donor ranking or evidence of influence. The independent reviewer summed the original public graph and checked each source-link dimension. Graph SHA-256: `15be3f52de85bcd72c816a90cd7fa06501050a63722a1b8f8e60c70585e28c7a`.

## Validation

- 414 portal tests, TypeScript, asset stamps, four jurisdiction graph smoke checks and production Worker dry run passed.
- 26 actual-request browser checks passed in Chromium and another 26 in WebKit. They cover 390, 768 and 1440 pixel widths, the full funding chain, unknown groups, actual UI date controls, nine terse follow-ups, reload after the seventh turn and correction after a date clarification. No horizontal overflow or page errors were observed.
- Independent Codex review passed arithmetic, period boundaries, selected source links, explicit overrides, Queensland scope, ambiguity, missing data, answer-text exclusion and the funding-to-speech transition. Its final focused suites passed 76 tests.
- Application-generated follow-up suggestions alone were stubbed empty in browser checks to avoid paid calls. All Ask calculations were real requests. No paid application-generation or enrichment calls were made.

Current production model configuration and unrelated main changes are preserved. Local checks have no live knowledge-base credentials; the local statistics failure is not counted as a production fault. Working evidence is in `/tmp/opax-discovery-pass7`; the final release receipt, production checks and screenshots are archived under `/Users/jake/.cache/opax/discovery-reviews/pass-7-20260912` after deployment.

## Remaining limits

Short follow-ups use a conservative grammar. Comparisons do not become single-party rankings; unsupported combinations need an explicit question. Existing corporate aliases remain limited: “Tabcorp Holdings” works, bare “Tabcorp” asks for clarification. Old saved conversations cannot recover UI-only filters already discarded before this release. WebKit viewport checks do not cover a physical iPhone or its software keyboard. This pass does not remeasure named-person generation quality.

Next review priority: test ordinary short donor names and funding questions from discovery entry points, and ensure an unsupported request leads to a useful correction. Continue testing named-person proposal questions against original speaking turns in the remaining scheduled passes.
