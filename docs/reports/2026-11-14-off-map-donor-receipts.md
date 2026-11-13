# Off-map donor receipts (im-ask-money-uncapped, note 1)

The retained federal donor export summed the legacy `donations` table after a donor left the drawing cap. That table holds both party receipt records and donor declarations. The typed map instead uses recipient-side records selected by `aec_receipt_selection.ReceiptSelection`. Changing map membership switched measures without changing a receipt.

## Sources and corrections

| Surface | Previous source | Corrected source |
| --- | --- | --- |
| Retained donor export (`scripts/export_donor_disclosures.py`, `donor-disclosures.json`) | Positive legacy `donations` rows, both declaration sides; receipt types lost | Typed donor cells from the money build's uncapped `money-receipts.json`; same ReceiptSelection as factual rankings |
| Retained donor index (`scripts/build_donor_index.mjs`, `donor-index.json`) | Copies the retained export's legacy total/count | Copies its selected recipient total/count and receipt types |
| Browser `app.js` `donorRecordHTML` | Export total/count labelled “Disclosed gifts” | Typed receipt figures; “Disclosed receipts”, with every included receipt type named |
| Server `subject-figures.ts` `donorRecordsHTML` | Export total/count labelled AEC records, both-side warning | Typed receipt figures and type breakdown; old untyped records retain their explicit record scope |
| Main donor page | Already switched to uncapped recipient receipts in the preceding commit | Also names receipt types and links its JSON download to the uncapped asset |
| Donor directory | Capped federal graph, then raw index-only figures beyond the cap | Uncapped federal graph; selected retained figures if needed; state files retain their existing scope |
| Funding records and CSV (`ledger.js`) | Capped federal drawing graph; an off-map donor could have no rows | Uncapped receipt asset, same recipient totals as its profile; CSV names this scope |
| Search donor snippets | Retained index figures described as records | Selected typed totals described as receipts, with the federal receipt scope |
| Actual money map and cards | Capped drawing graph | Still capped; no drawing data changed |

The ledger’s Federal source metadata and download label also identify the uncapped recipient selection.

The weekly donor exporter now requires the uncapped receipt asset; it cannot silently publish a federal legacy sum in its place. Source names, resolver evidence and original return references remain separate from receipt figures. Canonical entity IDs and exact names take precedence over folded spellings, so a separately resolved case variant cannot overwrite a canonical entity’s figures. A name without an eligible recipient receipt retains its provenance but acquires no receipt total. Public Funding never contributes. A typed Loan remains explicitly named as Loan in an all-receipt total; only Donation Received contributes to donation rankings.

## Pins and reconciliation

| Donor (both absent from the current drawing graph) | Before, retained export | After, uncapped selected receipts | Reason |
| --- | --- | --- | --- |
| Linc Energy | $671,498 / 18 source records | **$357,799 / 9 receipts** | Remove $313,699 / 9 donor-declared records already represented by the party-side receipts. The two sides report different amounts, so the dollar sum is not an exact double. |
| Nimrod Resources Limited | $1,000,000 / 2 source records | **$500,000 / 1 receipt** | Count the party's $500,000 receipt once; remove the donor declaration of the same gift. |

Linc's nine selected receipts comprise **Donation Received: $294,999 / 5** and **Other Receipt: $62,800 / 4**. There are no typed Linc loans. Its recipient split is Liberal **$208,000 / 4**, LNP **$124,999 / 2**, and Labor **$24,800 / 3**. This exactly reproduces its former typed map figure; no new receipt was added. The old fallback's “gifts” label wrongly covered the Other Receipts too.

Nimrod's single receipt is **Donation Received: $500,000 / 1**, received by Liberal.

[The full generated change list](2026-11-14-off-map-donor-repins.json) records all 730 retained federal figures that move or lose a total. Every change replaces a mixed-side legacy sum with the already-built selected receipt cells. The 1,533 retained donor records, their spellings and references are preserved; state records and source-only references are unchanged. The refresh applies `select_federal_receipts` to the existing federal records using `money-receipts.json`, then runs `node scripts/build_donor_index.mjs`. No source-sheet, ingestion or `scripts/aec_*` selection changes.

Regression coverage pins both real donors across the uncapped graph, retained export, index, browser block, server block, actual Worker page, donor directory and the funding-record ledger/CSV. Poisoned legacy totals cannot override typed cells. A separate receipt-type case proves that Loan and Other Receipt are named separately from donations and Public Funding is excluded. The Python integration fixture contains donor/recipient copies, Other Receipt, Loan and Public Funding and exercises the production exporter boundary.

## Gates

- Python money and donor tests: **75 passed, 608 subtests passed** (`test_aec_receipt_types`, `test_money_sources`, associated entities, classify repair, daily money projections and `scripts/test_donor_disclosure.py`).
- Money and Ask Node suites, donor suites and the moved subject-figures suite: **passed in the full run**. Six new off-map regressions also passed in isolation, including the real ledger/CSV loader.
- `npm --prefix portal run typecheck`: **passed**.
- `node scripts/stamp_assets.mjs --check`, `node scripts/build_donor_index.mjs --check`, and staged diff checks: **passed**.
- Full `PATH="$PWD/.venv/bin:$PATH" npm --prefix portal test -- --test-concurrency=4`: **4,879 tests; 4,868 passed, 11 skipped, 0 failed**, 213.9 seconds.
- `/proc/loadavg` checked before test gates; load5 stayed below 40 (7.50 before the full run), so no wait was needed. No tests remain under `portal/src/*.test.*`.

All verification was local/offline; no model, production or SSH calls. The generated retained export was reproduced from the existing source metadata and uncapped receipt asset. No push.
