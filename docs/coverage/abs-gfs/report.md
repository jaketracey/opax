# ABS Government Finance Statistics annual lane

UI review fixes at baseline `15f86fe11` are complete: [fix round 1 report](fix-round-1.md) and [Round 1 validation](fix-round-1-validation.json). Review r2 approved `d7b0a7052`. The unchanged staged projection is now promoted into the local public asset: [Round 2 promotion report](promotion-round-2.md) and [current validation](promotion-round-2-validation.json). Original source/number/licence findings below are unchanged.

17 October 2026 Melbourne. Branch `coverage/abs-gfs`, baseline `71c3615b8`. Reviewed public asset promoted locally and verified; **no push, deploy, nightly or KB/D1 write**. The orchestrator owns shipping. GFS remains outside nightly; future releases require explicit reviewed re-promotion.

The [2024–25 release](https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25) was published **21 April 2026**. It links **81 XLSX workbooks / 299 tables**, all acquired. Reference years are **2015–16 through 2024–25**; debt-matrix stock date is **30 June 2025**. There is one release vintage: earlier reference years retain `release: 2024-25`, rather than being represented as earlier release vintages. No full historical-release inventory is claimed.

## Inventory and staged rows

[Workbook inventory](../../../data/staged/abs-gfs/inventory.json), [table inventory](../../../data/staged/abs-gfs/tables.json), [summary](../../../data/staged/abs-gfs/summary.json), [tidy series](../../../data/staged/abs-gfs/series.jsonl), [page projection](../../../data/staged/abs-gfs/hub.json).

The 78 unmixed time-series cubes below are disjoint. Three additional mixed/auxiliary workbooks are the all-level comparison cube (001), Key Tables (094) and Education (095). Their tables carry separate original headings, level/sector/jurisdiction coverage, fiscal periods/stock dates, format, licence and receipts. Do not count a mixed workbook again for each of its component sectors or levels.

| ABS level | Unmixed time-series workbooks | Headline observations, including six Key Tables debt cells |
| --- | ---: | ---: |
| Commonwealth | 5 | 250 |
| State | 44 | 2,201 |
| Local | 11 | 551 |
| State and local | 10 | 500 |
| Control n.f.d. | 3 | 150 |
| All levels of government | 5 | 253 |
| National (Key Tables only) | 0 | 1 |
| **Total core cubes / observations** | **78** | **3,906** |

| ABS sector | Unmixed time-series workbooks | Headline observations |
| --- | ---: | ---: |
| General government | 28 | 1,404 |
| Public non-financial corporations | 12 | 600 |
| Non-financial public sector | 14 | 701 |
| Public financial corporations | 10 | 500 |
| Total public sector | 14 | 701 |
| **Total** | **78** | **3,906** |

Revenue, expenses, net operating balance, net lending/borrowing and net worth each contribute **780 observations**: ten years for each of the 78 published groups. Net debt (L2) contributes **six published cells**, from Key Tables `Table_15!B15:G15`. The National general government column stays **National**, distinct from Commonwealth. State/local consolidated totals stay separate from individual jurisdictions. No total is built by adding levels, jurisdictions or sectors.

Every observation retains the source workbook, sheet, cell, source URL, release/date, reference year, snapshot/SHA-256, original AUD million value, current-prices/original-series basis, exact consolidation label and licence. Display conversion to AUD uses the shared money formatter, with lowercase compact suffixes; CSV also preserves the original million-dollar value. No private-person records or identity joins are created.

## Rights and access

All **81 files are cleared for numerical-table reuse** under the [ABS CC BY 4.0 website grant](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer#copyright-and-creative-commons). Every worksheet, including Contents/notes/footer cells, was checked before numerical ingestion. The only distinct rights notice is **© Commonwealth of Australia 2026**; no workbook-specific exception was found. Branding, trade marks, microdata and third-party content remain excluded. The [licence finding](licence.md) records the terms URL, ABS citation guidance and attribution wording used on the page.

[87 compact source receipts](../../../data/staged/abs-gfs/receipts.json): **86 HTTP 200**, one permitted same-host **302** from ABS's old attribution link to the current citation guide. All outgoing requests used `OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)`, sequentially; minimum recorded completion-to-next-request spacing **5.100 seconds**. Robots permits the requested paths. No 403, challenge, reset, alternate user agent, proxy, Firecrawl or Data API request occurred. Original XLSX files, policy and pages are retained locally under `portal/private/abs-gfs/`, with committed hashes/path receipts; they are excluded from Git. Selected screenshots and browser evidence are committed in that directory.

**Held: none.** Individual-state and historical net debt are absent from these workbook downloads. The release page contains rounded historical chart figures; they are not reconstructed into workbook observations. Function/COFOG-A and education tables are inventoried and rights-reviewed, but their numerical series are a deferred stretch goal. The private-expenditure/GDP education context table is explicitly distinct from public-sector coverage.

## Reconciliation

[All 2,466 recorded checks pass](../../../data/staged/abs-gfs/reconciliation.json):

- **2,340** within-group identities: revenue − expenses = operating balance; operating balance − net acquisition of non-financial assets = lending/borrowing; assets − liabilities = net worth. Tolerance **1.5 AUD million**, reflecting three rounded published values.
- **120** comparisons against the separate ABS latest-year level comparison workbook (001): exact equality, zero tolerance.
- **6** within-column L2 checks against the published L1, SDR and currency/deposit components: tolerance **2 AUD million**. These are diagnostics only; the exported debt value is the published L2 cell.

Maximum observed identity difference is **1 AUD million**. There are no failed or unavailable checks, duplicate observation keys, cross-level sums, imputed zeros or omitted held-file leaks. The read-only original-cell gate verified every staged value against the retained XLSX bytes and SHA-256.

## Web and app

`/register/government-finance` server-renders jurisdiction headlines and the year-by-year shared DataTable/register-table view. It has release, level, sector and jurisdiction selectors, shared table measure/year filters, source-cell links, CSV provenance and source/release/snapshot/licence on every main block. There are nine default State/general-government headline groups, including the published total state group. Jurisdiction labels are unlinked because main has no exact state-page routes. Money navigation links to the register.

The design reuses OPAX's Merriweather/Public Sans, paper/ink/navy/money tokens, native labelled controls and tabular money figures. Desktop uses a responsive jurisdiction grid; 390px uses one column. Source hashes remain available in each card's disclosure. No client framework, database or generation/auth dependency was added.

Local Worker screenshots: [390 full page](../../../portal/private/abs-gfs/government-finance-390.png), [1440 full page](../../../portal/private/abs-gfs/government-finance-1440.png), plus viewport captures in the same directory. [Browser evidence](../../../portal/private/abs-gfs/browser-results.json): both HTTP 200, no horizontal page overflow, no page errors; filters narrow 451 default observations to 90 net-worth rows; CSV retains source/cell/snapshot/hash/licence; JavaScript-disabled headlines and table render. Browser external requests were blocked. Current Round 2 evidence uses the actual promoted public asset, verifies its served bytes and approval manifest, and records 9 headline groups / 46 figures and 451 default series rows at both widths; the 390px table fits its 350px container.

Native work is [plan only](app-plan.md). No app code, build or device claim.

## Gates and handoff

Passed:

- **12 Python lane tests**: official-layout synthetic fixtures, rounding/reconciliation, suppressed/null versus zero, release identities, no invented groups, licence gating, exact National/L2 matrix mapping, opt-in promotion and reviewed promotion dry-run with no output writes.
- **8 register tests**: SSR, shared-table hydration, CSV provenance, published-only totals, held-file exclusion, query guards, unique staged source cells and Money navigation.
- **14 existing promotion regression tests**, scoped to the four active hubs; the new lane has its own dry-run/review gate test.
- `python3 scripts/abs_gfs/check.py --dry-run --verify-originals`.
- `npx tsc --noEmit -p .` after generating the fresh worktree's Worker types.
- `npm run -s check` (types, TypeScript, tokens, stamps and donor-index currency).
- Worker `npx wrangler deploy --dry-run --outdir private/abs-gfs/worker-dry-run`.
- 390/1440 local Worker browser checks above; `git diff --check`.

An additional targeted legacy navigation-suite attempt **failed at module load** because this fresh checkout lacks generated `portal/public/hubs/index.json`. No broad build was run to manufacture that unrelated asset. The register-specific Money navigation and actual Worker/browser checks pass; the shared navigation test now supplies the staged GFS fixture when a complete release build runs it.

`votes.json` is byte-identical to baseline `71c3615b8`, schema 1; SHA-256 `f9908e4f46f7148a82daee2d0b14c62cd7f2172ff1cd310df9a132a152970aff`.

The promoter supports the explicit `abs-gfs` hub, with exact input digests and a reviewed-commit receipt. The [staging review receipt](../../../data/staged/abs-gfs/review.json) now pins approved commit `d7b0a7052` with all six input digests unchanged. Round 2 ran the real reviewed promotion, then checked public-byte equality and a new dry run. Only `portal/public/government-finance/data.json` changed under public; stamps were already current. The local route returns 200 against this asset. [Round 2 validation](promotion-round-2-validation.json) records current tests, asset and screenshot hashes. Default promotion remains the four scheduled hubs: annual GFS stays outside nightly. No push, deployment or KB/D1 write occurred.
