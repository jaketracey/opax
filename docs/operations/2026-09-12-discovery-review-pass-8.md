# Discovery review — pass 8, 12 September 2026

Funding questions now distinguish overlapping organisation names and offer explicit choices for short names. A person asking about Tabcorp can choose Tabcorp Holdings Limited; Macquarie and Crown show separate organisations instead of guessing or combining their receipts.

## Reproduced problem

The `58587ecd` baseline returned no calculated answer for rankings using bare Tabcorp, Pratt or Macquarie. Those requests could fall through to general generation. More seriously, “Who receives the most funding from Crown Castle Australia?” also matched the Crown alias on Crown Resorts Limited. It combined the organisations and reported Labor at $1,455,714.

Independently summing the existing published federal graph shows Crown Castle Australia alone at $27,000 across eight receipts, all to Labor. Crown Resorts is a separate node, with $2,968,754 in receipts across parties. This pass changes matching, not the underlying records or classifications.

## Changes

The receipt matcher chooses the longest complete name at each occurrence of a name in a question. An embedded alias cannot add another donor to that same occurrence. Shared aliases and aliases that also begin another organisation name ask the reader to choose. Existing qualified aliases such as Macquarie Bank and Crown Limited continue to resolve.

Unresolved single-ranking questions stay in the receipt flow. Prefix matches offer up to six explicit full-name choices; they never automatically merge a corporate identity. Each choice replaces only the unresolved donor phrase, validates the entire request and embeds the resolved party, jurisdiction and financial year in its question link. Follow-up choices keep the previous selection, including dates selected through controls. Additional words such as Europe, Mining, Foundation or an unknown second group cannot be silently discarded to offer a partial total.

Choices render as keyboard-accessible links with at least 44-pixel tap targets in Ask and chat. They stay within the current app environment. Ordinary evidence permalinks retain the canonical production origin. The shared voice receipt tool also gets the corrected name matching and full-name clarification instead of an ambiguous aggregate; no live audio session was started.

## Validation

The pre-integration pass completed 424 portal tests, TypeScript, asset stamps, four jurisdiction graph smoke checks and a production Worker dry run. Chromium and WebKit each passed 21 actual-request checks at 390, 768 and 1440 pixels: Macquarie choices, keyboard selection, Crown follow-up choices, exact Crown Castle result, Tabcorp follow-up and year preservation, and unsupported qualifiers. All checks stayed on the expected origin, with no horizontal overflow or page errors.

Independent Codex review checked original graph sums, stable donor IDs, exact source-link filters and decoded correction questions. Its 37 focused tests passed. In particular: Tabcorp to Liberal in FY2020–21 is $87,300; the Queensland Labor selection in the same financial year is $12,100; Labor in FY2021–22 is $139,705. Macquarie choices resolve distinct nodes and totals. Unknown qualifiers have no choice, figure or evidence citation.

Initial browser attempts exposed the existing answer renderer's canonical-origin behavior: clicking a new choice left the local preview for production. Those deterministic requests were treated as baseline diagnostics, not successful local validation. The corrected browser runs assert origin at every step. No paid application-generation or enrichment calls were made.

Post-integration validation passed 429 portal tests, TypeScript, stamps, graph smoke checks and Worker dry run. The independent UI review caught a parenthesised donor-name link that the Markdown parser could not render. Choice URLs now encode those parentheses before rendering. A Visa AP (Australia) regression checks the full question and exact donor focus, and the expanded browser suite covers keyboard selection at all three widths. Focused backend and link validation passed 40/40.

The release is rebased onto current main before shipping so concurrent site improvements are preserved. Final post-integration counts, production checks, commit and Worker version are recorded in `/Users/jake/.cache/opax/discovery-reviews/pass-8-20260912/release-verified.json`. Working evidence is `/tmp/opax-discovery-pass8`, including the independent report and exact responses.

## Limits and next pass

Prefix choices are bounded and conservative, not fuzzy spelling correction or a corporate ownership registry. Unsupported suffix variants can still require a fully explicit name. The selected dataset is not a complete donor universe, its receipts include more than gifts, and funding does not establish influence. WebKit viewport tests are not a physical iPhone or a live voice call. Named-person generation was not remeasured here.

The final scheduled pass should return to original speaking turns and ordinary-user discovery questions, keeping proposal details and dates visible and ensuring a clicked next step produces a useful sourced answer.
