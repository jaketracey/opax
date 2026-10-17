# Treasury Tax Expenditures and Insights Statement — staged lane

**18 October 2026 Melbourne. Branch `coverage/tax-expenditures`. Reviewed public asset promoted and verified locally against fixed commit `88881839f`. Deployment pending; not live. No new Treasury request, nightly, KB/D1 write, push or deploy.**

The latest bounded inventory is the **2025–26 statement**, published **17 December 2025**. It contains revised historical estimates and forward estimates for **2021–22 to 2028–29**. Those measure years are not eight statement vintages. Earlier statements are outside this lane because their matching machine-readable layouts and per-file rights have not been reviewed. The [inventory](../../../data/staged/tax-expenditures/inventory.json), [tidy observations](../../../data/staged/tax-expenditures/series.jsonl), [summary](../../../data/staged/tax-expenditures/summary.json) and [receipts](../../../data/staged/tax-expenditures/receipts.json) are committed staging evidence.

| Download linked from the statement | Format | Statement | Rights and use |
| --- | --- | --- | --- |
| [Statement PDF](https://treasury.gov.au/sites/default/files/2025-12/p2025-721342.pdf) | PDF, 222 pages | 2025–26 | CC BY 4.0 publication notice, page 2; independent controls for Tables 2.2 and 2.4, PDF pages 17 and 20. |
| [Statement Word](https://treasury.gov.au/sites/default/files/2025-12/p2025-721342.docx) | DOCX, native tables | 2025–26 | Same explicit CC BY 4.0 publication notice; Appendix A.1 benchmark/type/reliability metadata and source controls; two published combined tables. |
| [Chart data workbook](https://treasury.gov.au/sites/default/files/2025-12/p2025-721342-chart-data.xlsx) | XLSX, 35 sheets | 2025–26 | Treasury website CC BY 4.0 grant; all sheets reviewed, no narrower notice. Despite the chart-data label, its first sheet is the full `Revenue forgone estimates` table. |

The [rights finding](licence.md) records the website and publication grants, attribution wording and exclusions: the Commonwealth Coat of Arms, Treasury logo, third-party and otherwise marked material. Selected numerical tables and metadata are Treasury-produced; branding and narrative/chart bodies are not projected. Every row retains the original file URL, statement year, source sheet/native table/cell, source snapshot and SHA-256. Blocks show the source, statement year, snapshot and licence; CSV retains full provenance and benchmark references.

## Staged observations and reconciliation

**2,448 internal source observations**: **304 item IDs × eight years = 2,432 item rows**, plus **16 cells in two Treasury-published combined groups**. The public projection contains **2,444 observations**: four publisher-withheld G8 cells (2025–26 through 2028–29, G280:J280) are retained only in internal source/reconciliation evidence and excluded from the public hub, cell allowlist, HTML, hydration and CSV. All are **revenue forgone estimates**, in nominal AUD million on an accrual basis. Historical years are not relabelled actuals. No numerical outlay-equivalent series is published in this statement; its explanation of that alternative method is not an outlay-equivalent dataset.

**133 estimates are negative.** Original workbook markers are preserved as distinct non-numeric values:

| Original code | Treasury meaning | Observations |
| --- | --- | --- |
| `*` | Unquantifiable | 1,175 |
| `..` | Non-zero rounded to zero | 91 |
| `-` | Nil, without an inclusion reference | 75 |
| `-` plus native statement reference | Included in another item; workbook nil | 48 |
| `nfp` | Not for publication due to commercial sensitivities; internal evidence only | 4 |

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

`/register/tax-expenditures` uses the existing Worker SSR and shared DataTable/register-table implementation. It explains benchmarks, non-additivity and the difference from cash spending; shows the six largest positive item estimates for **2025–26**; separates Treasury's two combined estimates; and exposes 2,444 public rows with search, filters, sorting and CSV. Four publisher-withheld cells are excluded. Numeric estimate sorting is available as “Estimate in AUD” in the sort control; formatted values/codes are not sorted lexically. Lowercase m/bn follows the shared money formatter. Public source values, permitted codes and units remain in CSV. No private-person profiles, identities or joins are created. The app is [plan only](app-plan.md).

`tax-expenditures` is registered with `scripts/promote_hub_data.py`, **outside default/nightly hubs**. The [review file](../../../data/staged/tax-expenditures/review.json) is approved and binds the five unchanged-or-fixed input digests to fixed commit **`88881839f55187437bd17ff722fc9838eb99cfd9`** under the user's explicit fix-and-promote instruction. Only this hub was promoted, using the shared reviewed promoter. The committed asset is [`portal/public/tax-expenditures/data.json`](../../../portal/public/tax-expenditures/data.json): **3,198,949 bytes**, SHA-256 **`12a5c84c800b66f3984e5438159b9ae107bf80851d5e7d30b106805b1bfe3d79`**.

The actual local Worker reads that promoted public asset and returns **200** at `/register/tax-expenditures`. Money → Public money shows the link. No staged data is injected by the preview. Simulating a missing asset still proves **503**, no table and a closed menu gate. Deployment and production verification belong to the orchestrator; this is not a claim that the route is live.

The shared CSV guard has one narrow change: an exact standalone `-` is exported unchanged as a safe nil code; other formula-prefixed strings retain formula escaping. Generated asset stamps include its importer chain.

## Validation and holds

`npm ci` completed before Node tests. **10 targeted Python tests** and **40 Node tests** (Treasury, ABS GFS and shared DataTable), `npx tsc --noEmit -p .`, `npm run -s check`, original-file staging dry run, reviewed-promoter dry run, real single-hub promotion, `--check-public`, and **Wrangler deploy --dry-run** pass. `votes.json` is byte-identical to the round start and `origin/main`, with schema 1 unchanged. The promoter output bytes and public asset bytes for **budget, vic-gifts, bills-tas, bills-act and abs-gfs** match their before-fix SHA-256 receipts exactly. No nightly or database writes. See [validation receipt](validation.json).

Browser proof runs the actual bundled local Worker against the **promoted public asset**, with external browser requests blocked. The fetched asset bytes, size, SHA-256 and reviewed-commit manifest are checked. Both 390px and 1440px return **200**, render **six item cards plus two combined cards**, and report **2,444 observations**, **25 visible table rows**. Search narrows 2,444 → 24 for “Main residence”; G8's full title returns only **four earlier-year observations**, with no withheld future-year rows. Full CSV, SSR/hydration and promoted JSON exclude all four withheld cells and the marker/status. The four source rows still have passing internal reconciliation entries.

Without JavaScript, all eight cards and the 25-row SSR table remain. At 390px, the table, its own scroll extent and container are each **350px**, and all 25 displayed estimate cells lie inside the container. Desktop width is about **1325px** in a 1325px container. No page errors. Asset absence closes both the page and Money link; presence opens the Money link.

Screenshots and raw QA logs are local, under `portal/private/tax-expenditures/`:

- `tax-expenditures-390-top.png` and `tax-expenditures-390-table.png`
- `tax-expenditures-1440-top.png` and `tax-expenditures-1440-table.png`
- `browser-results.json`, targeted-test logs, staging/check and Worker dry-run logs

**Held:** deployment and production verification await orchestrator shipping; local reviewed promotion is complete. No acquired document has a rights/access hold in this bounded scope. Four `nfp` cells remain only in internal reconciliation evidence and never enter the public projection. Earlier statement vintages and 34 distributional/chart sheets remain outside the reviewed scope; no claim of complete historical or distributional coverage. No native app work has shipped.

## Review correction and explicit promotion

Round 1 addresses the sole P1 from the review of `e4c9b2f87`: withhold G8 2025–26..2028–29 from every public output. Both the Python projection and TypeScript serving boundary reject the source marker and withheld status. Public item metadata also omits those four cell references. Internal rows and all 2,457 reconciliations remain unchanged. The browser checker now reads the actual promoted public asset, verifies its review manifest and byte identity, checks all public/hydrated/exported outputs, and expects 2,444 observations. Promotion was expressly authorised in the follow-up user instruction, bound to fixed commit `88881839f`, and completed through the shared promoter. No new Treasury request is required or made.


Next year's re-promotion remains explicit, after a new source/licence review, committed staged reconciliation and updated approved receipt:

```sh
python3 scripts/promote_hub_data.py tax-expenditures --dry-run --votes-reference origin/main
python3 scripts/promote_hub_data.py tax-expenditures --votes-reference origin/main
python3 scripts/promote_hub_data.py tax-expenditures --check-public --votes-reference origin/main
```
