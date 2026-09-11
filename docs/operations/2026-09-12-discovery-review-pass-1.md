# Discovery review — scheduled pass 1, 12 September 2026

This is the first of three scheduled follow-up passes after the initial discovery refinement. It targets a wrong-answer failure in mixed donor and industry questions. The existing enrichment monitor remains active.

## Production evidence

Five bounded production probes included two new mixed-scope questions, a familiar party-funder question, the existing 2020 gambling comparison and Pocock's housing proposals. All passed the old structural harness; reading the actual answers exposed two material failures:

- “Who gets more money from gambling and aerospace, Labor or Liberal?” returned a gambling-only winner and dollar difference, silently dropping aerospace (0.32 seconds).
- “Who gets the most money from Mineralogy and Acme Space Widgets?” returned the Mineralogy-only United Australia Party ranking, silently dropping the second company (0.34 seconds).

The three controls remained useful. The proposal control was a cache hit; this review did not request a fresh generated answer or change the model. Local enrichment uses the existing Codex worker, with no paid external model calls.

## Change

Before returning a calculated Ask ranking, the service now accounts for the donor names, aliases, industries, parties and ordinary question wording used by the calculation. Unmatched names or qualifiers request clarification and link to the money map. A recognised term cannot silently absorb an unknown second term. Named companies mixed with an industry also require clarification when the existing calculation would otherwise discard the industry.

This is a conservative lexical guard, not full natural-language understanding. Less familiar wording may need clarification. It does not prove that all financial questions are supported, and voice-tool totals are unchanged by this Ask-specific check. Unsupported multi-period comparisons remain outside the direct calculator.

Clarifications now say “Choose the scope” and hide the corpus stamp and source-download actions. Those controls return when a subsequent question produces a sourced answer. Period clarifications also skip generated follow-up suggestions. Ranking and clarification responses precede the generation cache, so this fix needs no broad cache invalidation or new model calls.

## Source verification

The 2020 first-year financial-year key was independently summed from published donor-to-party edges using decimal arithmetic: gambling receipts to Labor were $457,673, to Liberal $360,195, and the difference $97,478. Grant and contract flows were excluded. These are selected disclosed receipts, not all donors, gifts-only donations, personal payments or evidence of influence.

The original Pocock speech, `speech-1204764` (2 July 2026), was read again through the production resource endpoint. It proposes an affordable-housing obligation for residential development on surplus Commonwealth land sold or leased to private entities. The text defines rent as at most 75% of market rent or 30% of tenant household income if lower, requires registered community housing providers, and preserves obligations when land is on-sold. The cached answer's concrete claims match those passages; this is an attributed proposal, not proof of enacted law or current policy.

## Validation

- 351 portal tests passed, including mixed unknown industries, unknown companies, industry subsets, mixed company/industry questions, known aliases and explicit party-filter overrides.
- TypeScript, asset stamps and all four jurisdiction graph smoke checks passed.
- Eight local end-to-end funding cases passed. Three new regression cases require `needs_scope` and reject dollar amounts, so a plausible but partial calculation cannot pass.
- Browser checks at 390, 768 and 1440 pixels verified the clarification, linked money map, absence of a partial table, lack of horizontal overflow, working comparison citations, and restoration of source controls after asking a valid question.

Review evidence is retained locally under `/tmp/opax-discovery-pass1`. Repeat the focused cases with `scripts/ask_regression.py --bench scripts/ask_discovery_questions.json --only mixed-industries mixed-donors industry-subset gambling-party-comparison gambling-party-comparison-year mineralogy-familiar-name industry-comparison banks-not-finance` and the intended base URL. A structural pass is not factual endorsement; original-source and arithmetic checks remain necessary.

## Remaining review candidates

Distinct historical-period comparisons, compact but accurate coverage explanations, and better follow-up questions remain candidates for the next two scheduled passes. Bank-only figures still require a named bank because the map's finance classification is broader. Research on project locations remains dependent on the desktop research host becoming reachable.
