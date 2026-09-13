# Discovery review pass 17 — keep both parties when changing the year

## Reproduced weakness

“Who gets more gambling money, Labor or Liberal?” calculated correctly, but “And in 2020–21?” and “And in 2021–22?” discarded the comparison and fell through to ordinary Ask. Both complete dated questions already worked. The issue was lost conversation scope rather than missing receipt data.

Independent sums of the published donor-to-party edges confirm Labor $457,673 (47 records) versus Liberal $360,195 (33) in FY2020–21: a difference of $97,478. FY2021–22 is Labor $1,011,028 (67) versus Liberal $459,029 (31): a difference of $551,999. These are the graph's single starting-year cells, not pooled two-year ranges or a complete industry total.

## Change and independent challenge

A validated two-party comparison now retains both parties and its donor or industry for a period-only follow-up. It returns a canonical question containing the complete selection and effective financial-year bounds, so successive replies and the browser's bounded conversation history retain scope. Explicit date controls remain authoritative. Every party source link keeps its own recipient and the common donor/industry and year filters. A missing period produces an evidence gap, not a zero or false winner, and can be corrected in the next turn.

Independent review caught two gaps in the first implementation: an unsupported time baseline could be lost while rebuilding history, and attached FY labels were rejected before normalization. Initial answers and follow-up reconstruction now share the same baseline guard. Follow-ups use the established financial-year parser, including attached FY labels and nonbreaking hyphens.

This pass intentionally supports period changes for two-party comparisons only. Changing parties or industries within a comparison, comparing multiple dimensions and unrelated intervening questions keep conservative handling. Assistant text and supplied totals never define the calculation. No receipt data or generated-position prompts changed.

## Verification

Focused regression tests cover the exact before/after journey, both scoped citation destinations, arithmetic and record counts, canonical round trips past the history limit, UI date controls, date clarification and correction, all-years reset, missing-data recovery, exact donors, unsupported time baselines and established FY formats.

Release evidence in `/Users/jake/.cache/opax/discovery-reviews/pass-17-20260913/` records final test/type/build results, independent review, and Chromium/WebKit checks at 390, 768 and 1440px. Browser checks use actual deterministic Ask responses with unrelated generation intercepted. This is not a new measurement of model-generated politician answers or a physical iPhone test. No paid external model calls were made.

Passes 18–20 remain after a verified release. Existing enrichment/source monitoring continues; the explicit summary-worker stop marker remains in place.
