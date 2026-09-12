# Discovery review pass 12 — readable mobile receipt results

## Reproduced failure

On production `/money/receipts?jur=qld`, filter Tabcorp to return year 2020. At 390px the recipient starts at x370 and the amount at x459: neither can be read alongside the donor without scrolling horizontally. The 760px table also clips the final year at tablet width. The source data correctly gives Labor $12,100, LNP $11,990, and $24,090 across four records; the problem is presenting that answer.

## Change

At widths up to 960px, show a native list of receipt cards with the full donor name, amount, recipient link and party colour, return years, record count and industry. The by-donor view shows the aggregate amount, largest recipient, share and number of parties. Keep the wider desktop table. CSS exposes only one representation, including to assistive technology.

Cards, table and CSV use the same filtered and sorted rows. Compact sort controls retain every column and each view's remembered direction. Loading, invalid ranges and failed jurisdiction changes hide stale results and disable export and sorting. Singular summary counts now read correctly. Bump both lazy ledger imports for returning visitors.

## Validation

- Independent Codex challenge: no material findings. A 320px long-name case exposes the recipient, amount and metadata without horizontal overflow; hidden table links are not focusable, and keyboard Space toggles sorting. The minor single-donor copy finding is corrected.
- Chromium and WebKit at 320, 390, 768 and 1440px: original selected-period totals/counts, donor aggregation, party filtering, sort directions and remembered view state, exact CSV values, endpoint links, invalid/empty states, jurisdiction changes, resizing, keyboard focus and overflow.
- Both engines: delayed and failed graph requests keep old records, source links and exports unavailable. Compact sorting stays disabled until usable results arrive.
- Portal suite: 449 tests passed. Type, syntax, asset stamp and deployment dry-run checks passed.
- Evidence and screenshots: `/Users/jake/.cache/opax/discovery-reviews/pass-12-20260913`.
- Original graph datasets and calculations are unchanged. No paid generation probes or provider calls.

## Limits

This is the published receipt selection, not the complete donor universe. A receipt is not necessarily a gift or a personal payment. Existing return-year conventions and source coverage remain visible. WebKit browser checks are not a physical iPhone test, and named-person generation quality was not remeasured in this presentation pass.

This completes the planned twelve discovery passes after production verification. Enrichment monitoring and independently reviewed source acquisition continue separately. The local release receipt records the merged commit, worker version and live checks.
