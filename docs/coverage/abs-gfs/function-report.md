# ABS GFS expenses by function

Review fix 1: [shared consolidation headings and diagnostic-containment proof](function-fix-1.md). Current screenshot receipts are in the fix validation; the original numerical findings below are unchanged.

20 October 2026 Melbourne. Worktree `abs-gfs-function`, branch `coverage/abs-gfs-function`, baseline `c926a72c3`. **LIVE-pending**: implementation and staged data only. The headline core remains live. The orchestrator owns review, explicit promotion and deployment of this extension. No push, deploy, nightly, production data write, production Ask/generation/voice/auth call, native change or source request occurred.

## Reused source receipts and rights

All **81 retained XLSX originals** were copied from the original GFS lane's local cache and SHA-256 checked against the existing [inventory](../../../data/staged/abs-gfs/inventory.json) and [HTTP receipts](../../../data/staged/abs-gfs/receipts.json). **81/81 match**; no file changed and no new snapshot or HTTP receipt was needed. The [reuse verification ledger](../../../data/staged/abs-gfs/function-receipts.json) records each URL, workbook, original snapshot, status and SHA-256. The original receipts remain byte-identical.

The function parser uses **21 workbooks / 32 tables**:

- Twenty general-government `Table_4` Expenses by Purpose tables, `55120DO002` through `55120DO021`.
- Education `55120DO095`: public operating expenses by purpose in `Table_1` and `Table_7` through `Table_17`. Other education summaries are duplicates or different measures and are not exported.

One release vintage: **2024–25**, published **21 April 2026**, reference years **2015–16 to 2024–25**. [Dated ABS release](https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25).

The original [rights finding](licence.md) applies unchanged to these exact retained bytes: ABS numerical tables are **CC BY 4.0** under the [website grant](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer#copyright-and-creative-commons), with every worksheet/notes/footer already reviewed. The only workbook rights notice is © Commonwealth of Australia 2026; no workbook-specific exception. Branding, trade marks, third-party material and microdata remain excluded. The original attribution, dated release, workbook links, source cells, snapshots and licence block are reused.

**New source requests: zero. Source holds: none.** No refusal, challenge, reset, alternate agent, proxy, Firecrawl or Data API request. Any future acquisition remains subject to the original OPAXBot, sequential, at-least-five-second and stop-on-refusal rules.

## Staged observations

[Function series](../../../data/staged/abs-gfs/function-series.jsonl), [summary](../../../data/staged/abs-gfs/function-summary.json), [combined page projection](../../../data/staged/abs-gfs/hub.json).

**4,340 additional observations**:

| Series | Rows | Published coverage |
| --- | ---: | --- |
| Expenses by function | 3,860 | Twenty general-government groups, ten years each; 2,020 division cells, 1,640 group cells, 200 published Total Expenses cells |
| Education operating expenses by purpose | 480 | Twelve published groups, ten years each; three purpose categories plus their published education total |

| ABS level | Additional rows |
| --- | ---: |
| Commonwealth | 270 |
| State | 2,560 |
| Local | 880 |
| State and local | 320 |
| Control n.f.d. | 150 |
| All levels of government | 160 |
| **Total** | **4,340** |

Every observation retains release/date, level, jurisdiction, sector, classification, published division/group and exact row label, reference year, value, unit, prices/series basis, original workbook/sheet/cell, URL, snapshot and SHA-256. All source values remain AUD million, current prices, original series. Null/suppressed markers remain distinct from zero. The original 3,906 headline rows are unchanged.

**Numeric COFOG-A codes are not published in these workbooks.** `division_code` and `group_code` remain null with `code_status: Not published in workbook`; codes are never assigned from an external taxonomy. Combined published categories such as Other health are not split into inferred groups. Capitalisation such as Environmental Protection is retained. Education keeps its own **School education** label, distinct from the function cube's **Pre-primary, primary and secondary education**.

**Excluded by scope:** Education `Table_19` private expenditure/GDP; education economic-transaction, asset, sales and intergovernment-grant tables. No private-sector expenditure enters the public function series. No missing Defence division or missing local ACT group is invented. ACT education `Table_16` stays **State**. State-and-local groups with only education detail are explicitly labelled **Education only** in the page.

## Reconciliation and basis

All **1,040** [new diagnostics](../../../data/staged/abs-gfs/function-reconciliation.json) pass. The original **2,466** headline checks remain unchanged: **3,506 checks in total**.

| Diagnostic | Checks | Maximum difference (AUD million) | Tolerance |
| --- | ---: | ---: | --- |
| Published function divisions to published Total Expenses | 200 | 2 | 0.5 × (number of rounded component cells + one published total) |
| Published function total to staged headline expenses, same dimensions/year | 200 | 0 | Exact |
| Published groups to their published division total | 480 | 2 | Same component-count rounding rule |
| Education purpose categories to published education total | 120 | 1 | 2m (four rounded cells) |
| Education total to corresponding published function Education division | 40 | 0 | Exact |

Arithmetic is **diagnostic only**, within one release/level/jurisdiction/sector/year. Export and display always retain the ABS-published cell. No total is created across levels, jurisdictions or functions, and division rows are never added to their overlapping group rows for display.

**Basis differences in matched groups: none.** All 200 all-function totals equal the headline expenses cells exactly. The 40 comparable education totals (Commonwealth, all levels, Control n.f.d. and ACT State) equal the function Education division exactly. The other 80 education totals use State-and-local groups absent from the all-function tables; they are not forced onto State-only or Local-only figures.

Education `Table_2` explicitly publishes **less Intra-sector transfers** before its all-level total. The parser uses the already consolidated education cells, rather than combining government levels or re-adding transfers. Its all-level total ties exactly to the published Education function division. This is retained as a basis explanation; it is not a cross-level arithmetic check or a reconstructed total.

## Web, screenshots and app plan

`/register/government-finance` now server-renders a **Spending by function** section, latest-year published division split and totals per jurisdiction, then a shared DataTable/register-table series. The existing release, level, sector and jurisdiction selectors scope both series. Function-table search, year, division, row-level and series filters are independent from headline-table filters. CSV preserves the original values, labels, missing codes, consolidation group and complete source receipts. Held/unreviewed files, altered hashes and invented groups/totals fail the serving boundary.

The same source/release/snapshot/licence blocks, token palette, typography and lowercase m/bn money formatter are used. No client framework or native code was added. [App plan](app-plan.md) extended only.

Local Worker browser checks block external browser requests and use an explicitly **test-only temporary promoter fixture**, with the staged candidate served from `portal/private/abs-gfs-function/preview-data.json`. This is not an approved public promotion and makes no live/deployed claim. [Browser evidence](../../../portal/private/abs-gfs-function/browser-results.json).

| Width | Top | New section | New table |
| --- | --- | --- | --- |
| 390 | [Top](../../../portal/private/abs-gfs-function/government-finance-390-top.png) | [Function split](../../../portal/private/abs-gfs-function/government-finance-390-functions.png) | [Function table](../../../portal/private/abs-gfs-function/government-finance-390-function-table.png) |
| 1440 | [Top](../../../portal/private/abs-gfs-function/government-finance-1440-top.png) | [Function split](../../../portal/private/abs-gfs-function/government-finance-1440-functions.png) | [Function table](../../../portal/private/abs-gfs-function/government-finance-1440-function-table.png) |

Both widths return HTTP 200, with nine headline/function jurisdiction groups, 451 default headline observations and 2,560 function-table observations. Function search Hospital narrows to 90 rows without affecting the headline table. Source-rich CSV, selector transitions and JavaScript-disabled SSR pass. No browser page errors or horizontal page overflow.

At **390px**, **each table itself**, its scroll width and its container measure **350px**, with every amount cell inside the container. The function table also passes with JavaScript disabled. At 1440px both tables fit their approximately 1,325px containers. All six screenshots were visually inspected.

## Promotion and gates

The existing explicit `scripts/promote_hub_data.py abs-gfs` entry now pins **ten inputs**, including function observations, checks, summary and reuse receipts. GFS remains outside the default four nightly hubs; nightly scripts are unchanged.

The real [review receipt](../../../data/staged/abs-gfs/review.json) is **pending** with all ten exact digests and the previous approved headline commit recorded. The previous headline-only approval cannot approve changed inputs. A real promoter dry run correctly refuses pending review. The local public `government-finance/data.json` remains byte-identical to baseline. The orchestrator should review this commit, write a real approved receipt for these exact inputs, run explicit promotion and readback, then deploy and flip LIVE-pending to LIVE.

The promoter's dry-run → atomic promotion → check-public round-trip passes in isolated temporary **synthetic-review fixtures**. Tests also prove pending review and changed input hashes prevent writes and preserve the last good asset and votes. Those fixtures do not approve the real staging receipt. Temporary directories are removed automatically.

Passed:

- 20 Python GFS tests (12 headline + 8 function), official-layout fixtures, labels/codes, missing versus zero, hierarchy/rounding, no invented groups, rights gating and promoter round-trip.
- 17 targeted register tests (11 headline + 6 function), SSR/hydration, independent filters, unchanged published values, CSV provenance, held-file exclusion and code absence.
- 14 existing promoter regression tests.
- `python3 scripts/abs_gfs/check.py --dry-run --verify-originals`: all original hashes/cells plus reparsed function metadata match; no writes.
- `npx tsc --noEmit -p .` and `npm run -s check`.
- `npx wrangler deploy --dry-run --outdir private/abs-gfs-function/worker-dry-run`: local bundle only, no deployment.
- `npm run build:search`, then full portal suite `node --test --test-concurrency=4 test/*.test.mjs`: **2,189 passed, zero failed/skipped**.
- 390/1440 local browser and JavaScript-disabled table geometry above; `git diff --check`.

Regenerated `search-catalog/manifest.json`, `graph/party-members.json`, `social/*.json` and `growth/*.json` restored after the full suite. Asset stamping was regenerated, including the SPA shell; shell/entry diffs are `?v=` only and the generated SPA shell is unchanged.

`votes.json` is byte-identical to baseline `c926a72c3`, schema 1; SHA-256 `9b7fc46c65185223d70a49b1bd8ee807327473330b02392963aa320b191b7a93`.

`docs/COVERAGE.md` now records the function extension as LIVE-pending in the ABS row and Next #1. The stale Next #3 Victorian advertising expansion is corrected to **LIVE 19 October**, with deployment references `61a9cb859` and `1e1079c95` supplied in the lane brief; its 30 attachment holds remain unchanged. This lane made no production verification request.
