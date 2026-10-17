# Treasury Tax Expenditures and Insights Statement — staged lane

**18 October 2026 Melbourne. Branch `coverage/tax-expenditures`. Staged and locally verified only. No public data asset, promotion, nightly, production data write, push or deploy.**

The latest bounded inventory is the **2025–26 statement**, published **17 December 2025**. It contains revised historical estimates and forward estimates for **2021–22 to 2028–29**. Those measure years are not eight statement vintages. Earlier statements are outside this lane because their matching machine-readable layouts and per-file rights have not been reviewed. The [inventory](../../../data/staged/tax-expenditures/inventory.json), [tidy observations](../../../data/staged/tax-expenditures/series.jsonl), [summary](../../../data/staged/tax-expenditures/summary.json) and [receipts](../../../data/staged/tax-expenditures/receipts.json) are committed staging evidence.

| Download linked from the statement | Format | Statement | Rights and use |
| --- | --- | --- | --- |
| [Statement PDF](https://treasury.gov.au/sites/default/files/2025-12/p2025-721342.pdf) | PDF, 222 pages | 2025–26 | CC BY 4.0 publication notice, page 2; independent controls for Tables 2.2 and 2.4, PDF pages 17 and 20. |
| [Statement Word](https://treasury.gov.au/sites/default/files/2025-12/p2025-721342.docx) | DOCX, native tables | 2025–26 | Same explicit CC BY 4.0 publication notice; Appendix A.1 benchmark/type/reliability metadata and source controls; two published combined tables. |
| [Chart data workbook](https://treasury.gov.au/sites/default/files/2025-12/p2025-721342-chart-data.xlsx) | XLSX, 35 sheets | 2025–26 | Treasury website CC BY 4.0 grant; all sheets reviewed, no narrower notice. Despite the chart-data label, its first sheet is the full `Revenue forgone estimates` table. |

The [rights finding](licence.md) records the website and publication grants, attribution wording and exclusions: the Commonwealth Coat of Arms, Treasury logo, third-party and otherwise marked material. Selected numerical tables and metadata are Treasury-produced; branding and narrative/chart bodies are not projected. Every row retains the original file URL, statement year, source sheet/native table/cell, source snapshot and SHA-256. Blocks show the source, statement year, snapshot and licence; CSV retains full provenance and benchmark references.

## Staged observations and reconciliation

**2,448 observations**: **304 item IDs × eight years = 2,432 item rows**, plus **16 cells in two Treasury-published combined groups**. All are **revenue forgone estimates**, in nominal AUD million on an accrual basis. Historical years are not relabelled actuals. No numerical outlay-equivalent series is published in this statement; its explanation of that alternative method is not an outlay-equivalent dataset.

**133 estimates are negative.** Original workbook markers are preserved as distinct non-numeric values:

| Original code | Treasury meaning | Observations |
| --- | --- | --- |
| `*` | Unquantifiable | 1,175 |
| `..` | Non-zero rounded to zero | 91 |
| `-` | Nil, without an inclusion reference | 75 |
| `-` plus native statement reference | Included in another item; workbook nil | 48 |
| `nfp` | Not for publication due to commercial sensitivities | 4 |

The six included IDs are **A13 → A43; B16 → B92; B71/B73/B74 → B72; D5 → D9**. The Word tables use a single merged “Included in” cell across all eight years while the workbook uses `-`. This source difference is explicit in each affected row's status, rather than being treated as zero or silently asserted as identical numerical data. No withheld estimate is reconstructed.

All **2,457 reconciliation checks pass**:

- 2,384 direct XLSX-to-native-statement item-cell comparisons, including negative and source-code values.
- 48 explicit workbook-nil versus native-statement inclusion-reference checks.
- **16 published combined-cell controls**, copying the DOCX values and comparing with Treasury's own PDF: Table 2.2 **C2+C3** and Table 2.4 **C1+C4**, all eight years. The statement-year values are **32,200** and **28,500 AUD million**, respectively.
- Nine published inventory count controls: eight tax categories and the statement's **304-item** count. These count records, not monetary estimates.

There is **no OPAX monetary total** across items, categories or years. The two combined groups are Treasury-published observations, retained separately from their constituents. Reprints of a single item's estimate in distributional analysis are not added as extra item observations. The [reconciliation ledger](../../../data/staged/tax-expenditures/reconciliation.json) identifies each source control.

## Source access

Six sequential GETs with `OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)`: robots, copyright terms, statement page, Word, XLSX and PDF. All returned **200**. Current robots permits all requested statement/download paths. Minimum observed completion-to-next-request spacing: **5.101035 seconds**. No refusal, challenge or reset occurred. No alternate user agent, proxy, archive or Firecrawl was used. The acquisition helper permanently stops after a 403, challenge, reset or other failure and retains a compact status/date/hash receipt without challenge bytes.

## Web and promotion boundary

`/register/tax-expenditures` uses the existing Worker SSR and shared DataTable/register-table implementation. It explains benchmarks, non-additivity and the difference from cash spending; shows the six largest positive item estimates for **2025–26**; separates Treasury's two combined estimates; and exposes all 2,448 rows with search, filters, sorting and CSV. Numeric estimate sorting is available as “Estimate in AUD” in the sort control; formatted values/codes are not sorted lexically. Lowercase m/bn follows the shared money formatter. Original values/codes and units remain in CSV. No private-person profiles, identities or joins are created. The app is [plan only](app-plan.md).

`tax-expenditures` is registered with `scripts/promote_hub_data.py`, **outside default/nightly hubs**. The [review file](../../../data/staged/tax-expenditures/review.json) remains **pending**, with the five exact input digests. The orchestrator must approve a committed snapshot and explicitly run the reviewed promoter. This lane never runs real promotion. The actual unpromoted Worker returns **503** and keeps the gated Money → Public money link hidden. The local preview injects staged bytes into ASSETS in memory, enabling review without producing `portal/public/tax-expenditures/data.json`.

The shared CSV guard has one narrow change: an exact standalone `-` is exported unchanged as a safe nil code; other formula-prefixed strings retain formula escaping. Generated asset stamps include its importer chain.

## Validation and holds

`npm ci` completed before Node tests. Targeted parser/access/licence/promotion tests, GFS/promoter regressions, shared register-table tests and focused navigation readiness checks, `npx tsc --noEmit -p .`, `npm run -s check`, the staging dry run with original-file verification, and **Wrangler deploy --dry-run** pass. The reviewed-promoter dry run returns its expected **pending-review refusal** and creates no asset. `votes.json` is byte-identical to both the lane start and `origin/main`; schema remains 1. The existing full navigation suite cannot start in this clean checkout because its ignored `portal/public/hubs/index.json` build prerequisite is absent; no unrelated public hub data was built. Its annual-lane fixture mapping is updated for tax expenditures, while focused unit and actual-Worker browser tests cover both Money-gate states. See [validation receipt](validation.json).

Browser proof runs the actual bundled local Worker with external browser requests blocked. Both 390px and 1440px return 200 with staged fixture data, render six item headlines plus two combined groups, search 2,448 → 24 rows for “Main residence”, and export source/licence/codes. Without JavaScript the 25-row SSR table and all eight cards remain. At 390px the table, its own scroll extent and container are each **350px**, and all 25 displayed estimate cells lie inside the container. Desktop table width is about **1325px** in a 1325px container. No page errors. Removing staged injection proves 503, no table and no Money link; populated injection proves the Money link appears.

Screenshots and raw QA logs are local, under `portal/private/tax-expenditures/`:

- `tax-expenditures-390-top.png` and `tax-expenditures-390-table.png`
- `tax-expenditures-1440-top.png` and `tax-expenditures-1440-table.png`
- `browser-results.json`, targeted-test logs, staging/check and Worker dry-run logs

**Held:** real promotion, deployment and public navigation await orchestrator review/shipping. No acquired document has a rights/access hold in this bounded scope. Four `nfp` cells remain publisher-withheld codes. Earlier statement vintages and 34 distributional/chart sheets remain outside the reviewed scope; no claim of complete historical or distributional coverage. No native app work has shipped.
