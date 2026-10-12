# Federal budget coverage lane

Checked **13 October 2026 (Australia/Sydney)**. Branch `coverage/budget`, created from `origin/main` at `c41740e8e52128b7b761a2499a186277387f93b3`. The candidate commit SHA is supplied in the handoff. Everything is staged or local code/QA: no KB, production D1, live JSON, push or deploy. The default `/budget` route returns a sourced unavailable message until a reviewed budget asset is loaded; local QA substitutes the staged projection through an in-memory Worker asset binding.

## Review fixes

Merged `origin/main` at `608b824b3` and preserved both isolated fixture storage and the `OPAX_TEST_HOST` setting. Unlinked portfolio entries remain in the discovery inventory but are filtered from the hub; empty portfolio sections are omitted. Rendered filler fell from **25 to 0** for `/budget?year=2015-16`, and **252 to 0** across all 12 years. [Per-year counts](fix-results.json). [2015–16 at 390](budget-2015-16-390.png), [2015–16 at 1440](budget-2015-16-1440.png).

The **25 early receipts** were re-acquired using a fresh, empty cache, with three fresh robots checks before the origin's source requests. The **28 outgoing GETs** record the actual shared OPAX identity hash, request start/previous start, measured interval and robots policy receipt/decision. The shortest interval was **1.000060 seconds**, with no pacing violations. The archive returned robots HTTP 404 (no published rules); Budget and Treasury returned robots HTTP 200. All 25 body hashes matched; the three PDFs' document grants were rechecked before updating staged provenance and parser fixture receipts. No original UA or pacing evidence is reconstructed. [Repair evidence](../../../data/staged/budget/receipt-repair.json).

## Inventory and scope

[Inventory](../../../data/staged/budget/inventory.json): **852 distinct document-file URLs**, 2015–16 to 2026–27. Files and publications are different grains; these counts are not additive.

| Whole publications | Count |
| --- | ---: |
| Budget Paper 1 | 13 |
| Budget Paper 2 | 13 |
| Budget Paper 3 | 13 |
| Budget Paper 4 | 13 |
| MYEFO | 10 |
| Final Budget Outcome, supplemental actuals evidence | 11 |

The 13 Budgets cover 12 financial years, including March and October 2022 separately. No standalone 2022–23 MYEFO is linked in those archives; the October Budget is retained separately. 2026–27 MYEFO is not linked at this snapshot. Neither missing slot is fabricated.

| Linked file format | Count |
| --- | ---: |
| PDF | 481 |
| DOCX | 301 |
| DOC | 47 |
| XLSX | 4 |
| CSV | 12 |
| ZIP | 7 |

There are **307 Treasury PBS file URLs**. The inventory also retains **305 portfolio availability entries**: 252 archival names with their document links removed by the publisher, 38 linked indexes held after robots/access refusal or response deadlines, and 15 Treasury index links. The PBS inventory is bounded by what Treasury and Budget expose; it is not a complete inventory of documents on other departments’ websites. No missing URL is guessed, and no challenge is bypassed.

Original series: [Budget archive](https://archive.budget.gov.au/), [current Budget](https://budget.gov.au/), [Treasury PBS](https://treasury.gov.au/treasury-portfolio-budget-papers). Four links on the 2019–20 archive pointed into the 2018–19 folders (BP1, BP3, BP4 and FBO). Their original index year/title and receipts are retained; the document year follows the source folder, verified against the original PDFs. This prevents missing 2018–19 or attributing its figures to 2019–20.

## Licence findings and holds

**426 files** have CC BY 4.0 and **425** have CC BY 3.0 Australia publication grants. Rights are attached to a checked whole paper/PBS preliminaries and its indexed sections/formats, rather than inferred from today’s website default. The inventory distinguishes fetched files from inventory-only links: 427 files were acquired for rights/table work; 425 remain link-only, with the applicable paper grant and exceptions recorded. An open label permits only the publication’s authorised material, not its marked third-party content.

Exceptions retain Commonwealth Coat of Arms, third-party content and material otherwise stated. Treasury PBS notices additionally exclude its logo, photographs, images and signatures. Fiscal values are transcribed/converted/charted with **“Based on Commonwealth of Australia data”** and a no-endorsement statement. The [receipts ledger](../../../data/staged/budget/receipts.json) records source URL, snapshot, response result and SHA-256; request identity references the repository’s shared OPAX user-agent policy and its hash.

**One document section is held conservatively:** [2026–27 BP1 Statement 4, DOCX](https://budget.gov.au/content/bp1/download/bp1_bs-4.docx). Its marked Cotality/RP Data material reserves third-party rights. This is not a blanket denial of the Commonwealth’s whole Budget Paper 1 grant. No body or tables from that DOCX are reproduced in the hub projection. Its rights excerpt and full-file receipt are retained in the inventory:

- Snapshot: `2026-10-12T21:39:49.258778+00:00`.
- SHA-256: `fbe8e92a7adf27e8e5e178efc85ce4d40f9806c150962420d54d215d227a36bb`.

The 38 linked portfolio index holds are access/discovery holds, separate from this document rights hold. Records identify robots denial, existing APH refusal, PM&C challenge detection or bounded response deadlines. No document request follows a refused robots check. A host is held for the rest of the run after refusal, and its cached refusal is retained. Older archival portfolio entries without links are unavailable, not silently counted as acquired statements.

## Staged observations and web surface

[Aggregates](../../../data/staged/budget/aggregates.json): **805 observations**, comprising receipts, payments, underlying cash balance and net debt. All 13 Budget and 10 linked MYEFO vintages have all four headline metrics for their budget year. Estimates, projections and reported actuals remain separate, with original millions/billions, source year, comparison vintage, paper/table, physical PDF page, snapshot and document hash. Forward estimates extend to 2029–30; current-year actuals are not fabricated. Final outcomes provide revised historical actuals, including the latest 2025–26 outcome series.

[Measures](../../../data/staged/budget/measures.json): **2,347 native Word table rows** across five files: 2024–25 Budget (660), 2024–25 MYEFO Appendix A (430), 2025–26 Budget (278), 2025–26 MYEFO Appendix A (413), 2026–27 Budget (566). Raw source cells and headers, `nfp`, nil, rounded-zero and unquantifiable markers are retained with document-order table/row IDs. No numeric amount is invented from suppression markers or merged columns. Historical PDF-only measures remain linked originals; no OCR measures reconstruction is claimed.

`/budget` is server rendered, with a financial-year list, four headline aggregates, four selectable estimates-versus-actuals chart tables, the shared DataTable for release vintages, and original-paper/PBS links. Each displayed figure cites its source table and PDF page; receipt disclosures and CSV retain snapshot/hash/licence. The original Budget is compared with the latest reported actual, including March as the original 2022–23 Budget. The chart preserves negative balances and missing actuals. Different underlying-cash-balance/Future Fund definitions remain explicit. Design-system type, colour and spacing tokens are used; no private-person profile or identity join is created.

[App plan](app-plan.md): a signed-out web link first, then a possible native catalogue alongside Bills/Registers after a reviewed static-data contract. No app code, app API changes, simulator or native build.

## Validation and next load

- Desktop full portal suite: **1,538 passed**, `OPAX_TEST_HOST=::1`.
- Parser/rights/refusal fixtures and shared source-access checks: final totals in `validation.json`.
- TypeScript, `check`, `build:release`, staged projection dry-run and Worker deployment dry-run pass locally. No deployment command without `--dry-run` was run.
- Existing Miniflare D1/voice fixture harnesses now honour `OPAX_TEST_HOST`, resolving desktop IPv4-loopback failures. Wrangler runtime types were generated with the exact compatibility flags over IPv6 and then reused by the normal `check` command.
- [Browser receipt](browser-results.json): actual local Worker dispatch; source-only in-memory staged asset binding; 390/1440, all four charts, source links, zero horizontal overflow/errors, table search/CSV receipts and JavaScript-disabled figures. [390 shot](budget-390.png), [1440 shot](budget-1440.png); [390 viewport](budget-390-viewport.png), [1440 viewport](budget-1440-viewport.png).
- `votes.json` is byte-identical to the branch base and `origin/main`; SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Publication cadence is annual Budget/PBS, MYEFO and final outcome releases. A subsequent approved acquisition should use a **new dated cache**, recheck robots/document terms and retain revised snapshots; it must not reuse an indefinitely cached index as evidence of a new release. Stage into `data/staged/budget`, reconcile required metric coverage, then review the projection. Production copying to `/budget/data.json` belongs to the later reviewed nightly path. This lane neither activates a nightly production loader nor copies staged data into `portal/public`.
