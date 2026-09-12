# Discovery review pass 11 — selected-period receipt totals

## Reproduced failure

On production `/money/receipts?jur=qld`, filtering Tabcorp to return year 2020 kept lifetime edge totals: LNP $101,840 (13 records), Labor $83,045 (13), total $184,885. The original published `byYear['2020']` values are Labor $12,100 (2), LNP $11,990 (2), total $24,090. The error changed the ranking as well as the amounts.

## Change

Preserve the yearly cells and recalculate each flow before aggregation, ranking, minimums and CSV export. Blank year bounds retain all recorded totals; selected years exclude undated or unavailable yearly amounts. An empty gap does not keep a lifetime edge just because its first and last years overlap.

Use neutral “Return years” labels: federal graph keys can combine financial-year starts and election polling years, so displaying every key as a financial-year span would misrepresent some sources. Show the year convention beside the filters. Invalid and reversed ranges explain the problem and disable exports without silently changing input. Jurisdiction loads clear old results and source links; a failed fetch cannot redisplay or export another jurisdiction's values.

Mobile controls have 44px targets, 16px form text, consistent select arrows, and two-column jurisdiction/industry/party layouts. Wider desktop year inputs keep all four digits visible. Bump both ledger imports so returning visitors fetch the corrected module.

## Validation

- Independent Codex review challenged source semantics, invalid ranges, and stale jurisdiction information. Corrections included before release.
- Five new tests cover selected amounts/counts/dates, gaps, undated/missing data, one-sided ranges, aggregation, ranking, minimums and CSV. Reconcile all four published jurisdiction datasets against independent sums of original cells.
- Portal suite: 449 tests passed. The initial full run overlapped catalog generation and had 12 missing-file errors; the sequential run and final run passed.
- Type, syntax, stamp and deployment dry-run checks passed.
- Chromium and WebKit at 390, 768 and 1440 pixels: values, ranking, CSV, year validation, clear/reset, jurisdiction switch, source navigation, keyboard focus and page overflow.
- Both engines: delayed and failed graph requests keep stale results, exports and source links unavailable.
- Evidence and screenshots: `/Users/jake/.cache/opax/discovery-reviews/pass-11-20260913`.
- No paid generation probes or provider calls. This is a calculation/presentation fix; original graph data is unchanged.

## Limits

This remains the published selection, not an exhaustive donor universe. Federal year cells do not separate financial-year returns from polling-year returns. The mobile table remains horizontally scrollable; a future pass should assess making recipient and amount visible together. Browser-engine checks are not a physical iPhone test. Named-person generation quality was not remeasured in this pass.

Production verification is recorded separately after deployment in the local release receipt.
