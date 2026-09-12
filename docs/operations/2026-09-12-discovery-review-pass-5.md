# Discovery review — pass 5, 12 September 2026

This pass corrects financial-year interpretation in funding answers and brings the period and selected-donor coverage next to the finding. It uses the published receipt graph and makes no model calls.

## Production failures reproduced

“Who gets the most money from gambling in 2020/2021?” pooled the 2020 and 2021 year cells and reported Labor $1,468,701. The conventional single financial year 2020–21 contains $457,673 in the published selection. The equivalent short label “2020–21” incorrectly requested a donor name matching “21”. The Labor/Liberal comparison similarly reported a $649,477 difference instead of $97,478 for that one financial year.

Four existing ranking/comparison/clarification controls still passed; passing controls did not establish that date interpretation was correct.

## Changes

- Slash and short financial-year labels resolve to the first-year key. Explicit FY labels also support a full ending year. Unlabelled full dashed pairs are ambiguous and ask for a clearer period; continuous ranges use “from … to …” or “between … and …”.
- “Financial year ending/ended 2021” resolves to 2020–21. Unsupported calendar-year, month, quarter, half-year and date requests ask for a financial-year period rather than returning a broader total.
- Separate year lists are not silently expanded to include intervening years. Ask's existing two-year comparison still calculates two separate cells and cites each year; the direct voice receipt tool requests a continuous range when it cannot express a discrete selection.
- A compact paragraph before the result table identifies financial years, the number of donors with matching receipts, jurisdiction, receipt scope and nominal currency. Actual matching-record dates are shown when they differ from the requested range. The original text remains present in exports.
- A period with no matching data returns an evidence gap with no fabricated winner, zero or calculation citation.

## Independent challenge

The independent reviewer reproduced two additional blockers through the local HTTP endpoint: financial-year-ending interpretation and non-adjacent year lists being pooled. Follow-up probes covered comma and ampersand lists, Australian day/month/year dates, H1/H2, abbreviated months, explicit filters, continuous ranges and exact two-year comparisons. All reported cases were corrected. Independent sums from the original graph confirm Labor $457,673, Liberal $360,195, a $97,478 difference, and seven donors with matching receipts in the 2020–21 gambling selection.

## Validation

- 401 portal tests passed after rebuilding the generated search catalog and Worker types; TypeScript passed.
- All four jurisdiction graph smoke checks and the deployment dry run passed.
- The independent review passed 50 related tests and 12 local HTTP cases.
- Twelve real local browser submissions at 390, 768 and 1440 pixels covered one-year rankings, party comparisons, ambiguous periods and missing data. Citation clicks and exact-year source links worked; no horizontal overflow or page errors. Scope typography uses the existing Public Sans, ink and rule tokens.
- Baseline and local requests used deterministic calculations only. No paid enrichment or application-generation calls were made.

Reproduce the new cases with `scripts/ask_regression.py --bench scripts/ask_discovery_financial_years.json --base https://opax.com.au --out /tmp/opax-fy-review`. Exact expectations refer to the published 7 September 2026 selection; review them when that export changes. Structural checks are not a substitute for source arithmetic.

Working evidence: `/tmp/opax-discovery-pass5`. Persistent evidence: `/Users/jake/.cache/opax/discovery-reviews/pass-5-20260912`. Fresh production results and deployed version are recorded in the release receipt after shipping.

## Limits and next review

The graph is a selection, not the complete donor universe, and disclosed receipts include more than gifts. Election returns can use polling-year keys. Date-language parsing is deliberately conservative and cannot answer subyear questions from annual cells. Correct sums do not establish influence or misconduct. The mobile question field still collapses long questions after submission; the next presentation pass should make the full question readable and simplify repeated answer metadata.
