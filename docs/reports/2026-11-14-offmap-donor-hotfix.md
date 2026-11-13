# Off-map donor hotfix — 14 November 2026

Branch `im/offmap-donor-hotfix`, from `origin/main` at `53df1f8b3085a320937c336cb955c0b37cf5aa51`. This hotfix is independent of the larger Ask rankings branch: no uncapped public graph, ranking migration or map change is included.

## Cause and fix

The retained donor exporter summed legacy `donations` rows, which hold both party receipts and donor declarations of the same gifts. Map membership then determined which measure a donor page displayed. The hotfix reads only recipient-side `aec_receipt_records` through the existing `aec_receipt_selection.ReceiptSelection`, without a drawing cap. Public Funding and the selection's existing exclusions stay excluded. Repeated genuine recipient rows remain distinct; donor declarations contribute nothing. Published entity IDs and exact alias spellings retain the existing identity contract. No source sheets or `scripts/aec_*` selection rules change.

The normal donor export writes its selected total/count and `by_type` / `by_type_year`; the index carries them to retained pages. Browser and server blocks project those typed cells and name their receipt types, rather than calling the entire amount gifts or donations. State figures, source names, resolver evidence and original references are preserved. A source with no eligible recipient receipt has no invented total. The directory recognises selected retained receipts and drops its obsolete both-sides warning for them.

Linc Energy: **$671,498 / 18 records → $357,799 / 9 receipts**. Its recipient receipts are **$294,999 / 5 Donation Received** plus **$62,800 / 4 Other Receipt**, with no typed loans. The $313,699 / 9 donor declarations are removed. Nimrod Resources: **$1,000,000 / 2 records → $500,000 / 1 Donation Received**.

## Effect on main's published data

Local comparison of the before/after **published federal donor-index entries carrying retained totals**, counted once per retained entity, moves 665 retained federal entries to the selected-receipt contract and gives **512 donor pages with changed figures**: 507 amounts decrease and five increase. The drawing graph's donor index entries have no total and are excluded from this count; unused donor-disclosure export rows are also excluded. Source-only references and state figures do not contribute. No production requests were made.

**Gross removed: $17,913,193.63. Net reduction: $17,807,993.63.** Five figures increase by a combined $105,200.00, because the selected recipient corpus contains eligible lines missing from the old legacy aggregate (Biocelect, Glide Products, Captain Cook Cruises, Housing Industry Association and Australian Airports Association). The [complete before/after ledger](2026-11-14-offmap-donor-hotfix.json) records every change.

| Five largest reductions | Before: AUD / source records | After: AUD / selected receipts | Removed |
| --- | ---: | ---: | ---: |
| Crown Resorts Limited | $2,968,754.00 / 363 | $718,154.00 / 43 | $2,250,600.00 |
| Beach Energy Limited | $836,300.00 / 19 | $290,000.00 / 6 | $546,300.00 |
| Nimrod Resources Limited | $1,000,000.00 / 2 | $500,000.00 / 1 | $500,000.00 |
| New Hope Corporation Limited | $935,000.00 / 9 | $480,000.00 / 5 | $455,000.00 |
| INPEX Operations Australia Pty Ltd | $537,830.00 / 44 | $90,000.00 / 3 | $447,830.00 |

The amount includes every selected receipt type, rather than treating Other Receipt or Loan as a donation. Donation Received alone is a donation; the labels spell out that distinction.

## Tests and gates

The Python regression covers donor/recipient copies, two equal genuine gifts, Other Receipt, Loan, Public Funding, a source without eligible receipts, and an incomplete backfill. Node regressions pin Linc and Nimrod in both public exports, actual Worker pages and browser/server blocks with poisoned legacy totals; receipt type labels also exclude Public Funding.

- Python money and donor suites: **73 passed, 608 subtests passed**.
- Money Node suites: passed in the clean full run; the focused run's missing generated division-bills cache was built and its affected donor/party checks passed **16/16**.
- TypeScript: **passed** (`npm --prefix portal run typecheck`).
- Asset stamps, donor-index freshness and staged diff checks: **passed**.
- Full `PATH="$PWD/.venv/bin:$PATH" npm --prefix portal test -- --test-concurrency=4`: **4,872 tests; 4,861 passed, 11 skipped, 0 failed**, 292.8 seconds.
- The first full attempt exposed a local crawl-before-hubs build order error and a hydration timeout during a load spike. Rebuilt the local crawl cache after the hubs; both affected suites then passed **36/36**, followed by the clean full run. No assertion or timeout was loosened.
- Load5 was checked before gates and was below 40 when each run began (28.74 before the clean full run). It rose above 40 during that run; no additional suite was started then.
- The generated export, unchanged state/reference metadata and the complete impact ledger reproduced from the read-only local corpus.

All work was local/offline apart from the authorised Git fetch/push; no production, model or SSH calls.
