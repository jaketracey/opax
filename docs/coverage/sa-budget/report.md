# South Australian historical budget: staged core and function hold

**Current status: LIVE pending deploy.** The independent r2 review approved
`afb8837ee`, and the unchanged inputs have passed the reviewed local promoter.
See the [round 3 promotion report](promotion-round-3.md) for the public asset,
hashes, containment tests and browser evidence. The source-acquisition and
initial-staging account below records the earlier state of this lane.

Checked **21 October 2026 Melbourne (20 October UTC)** on `coverage/sa-budget`,
from `d20bf14e0f5e333a7b01e950a0f0451c94165e28`. Local staging and code only:
no public data asset, push, deployment, nightly, KB or D1 write. Independent
review and promotion remain pending. Implementation and staged-input SHA: **`48ca4a47bf4001e8c2b31da00a6cb9dd869e6181`**.
The report and validation evidence are recorded in a separate local closeout commit.

## Inventory and rights

The [inventory](../../../data/staged/sa-budget/inventory.json) contains all
**117 XLSX resource entries** from the [Budget 2015–16 dataset HTML](https://data.sa.gov.au/data/dataset/budget-2015-16-data):
**105 Table entries and 12 Figure entries**. UUIDs, full titles from the heading
attributes, published table/figure numbers and formats are retained. The two
separate B.6 UUIDs remain separate; no deduplication by title. Five selected
resources were acquired: four budget workbooks, well below the 15-file cap,
and the one authorised function workbook. The function dataset's other resource
is an ABS link, inventoried but not followed. No CKAN API, DataStore, archive,
proxy, alternative identity or Firecrawl was used.

Both dataset pages and all five selected resource pages explicitly grant
**CC BY 4.0**. All **eight workbook sheets**, their text, comments, hidden-sheet
states and headers/footers were reviewed. No separate copyright/notes sheet or
narrower rights notice was found. Dataset/resource grants apply per file; the
website footer is not the sole licence evidence. The publisher’s
[copyright terms](https://data.sa.gov.au/copyright) say specific data terms
prevail, exclude branding/images/trade marks and reserve third-party rights.
No such exception was found in the selected numerical cells.

The required attribution form is retained per file: **Organisation name,
Jurisdiction, title of dataset, date the content was sourced, dataset URL**.
The resulting wording starts “Department of Treasury and Finance, Government
of South Australia”, followed by the exact dataset title, “Sourced on
2026-10-20” (UTC), and dataset URL. Source/snapshot/licence accompany every
candidate table and the function explanatory block. Attribution does not imply
government endorsement.

| Selected resource | UUID | Source cells | Original SHA-256 |
| --- | --- | ---: | --- |
| Table 1.3 · Summary of key general government sector budget indicators | `36aa6d87-bb0d-46c8-b9c6-561b64044890` | 42 | `11fcc45e8430cc37821b3d8ad391efe994eff435614a0ebb938b6164c61021d5` |
| Table A.1 · General government sector operating statement | `17f1a0f9-803f-4ae6-93d6-59ba25e2d2bf` | 135 | `045f1c33e73b26fca83d89e81cc7810dbb2da95cb362ca5dbe50769d8f011c0c` |
| Table A.4 · General government sector balance sheet | `380d951d-0c42-4b10-a385-69522813f687` | 120 | `d4f67dd4ccd0cf521d84b4ee9030f3fe2f9f0347703661b6e8b1fdc2beae9bed` |
| Table A.7 · General government sector cash flow statement | `2c5cc0b4-ab92-4959-8ce2-a9fec90bfa6f` | 150 | `41616659392c9b6431e962ac44a9e4f72a7f444424f7e32c12ca2ee446c998c5` |
| General government expenses by function and economic type · held | `3f756590-9e67-4a05-97a0-f594247d2c72` | 4,774 | `91d101229068313af2a43a7b00f2a267c960592a28d34681e91bab96283f9768` |

## Cells, scaling and reconciliation

[Tidy staging](../../../data/staged/sa-budget/series.jsonl) has **5,221 rows**,
one per published numeric or em-dash cell: **447 locally reviewed budget cells**
and **4,774 held function cells**. Each retains workbook UUID filename, sheet,
cell, source/dataset/resource, vintage, snapshot, original SHA-256, measure,
fiscal year, estimate/actual, the publisher's status label, value, units and
basis. Stored values, Excel number formats/display divisors and displayed
precision are retained too. Blank cells remain absent, never inferred zero.
Twenty-nine published em dashes remain markers rather than numerical zeroes.
The operating statement retains the publisher’s Revenue/Expenses headings so
its two “Grants” labels remain distinct; the original row labels are retained
separately in the source-cell and CSV contracts.

The budget core is the **2015–16 historical publication**, with fiscal-year
columns **2013–14 to 2018–19** in Table 1.3 and **2014–15 to 2018–19** in the
three UPF statements. “Estimated Result” remains an estimate, distinct from
actual, Budget and forward Estimate. Table 1.3’s money cells use a trailing
comma in their Excel format to divide the stored value by 1,000 and display
whole millions; percentage cells display one decimal. This is source display
scaling, not an inferred currency correction. Stored and displayed values are
both available in the CSV contract. Published notes, including the original
“calcualtions” spelling and rounding warning, are preserved verbatim.

**All 120 budget reconciliations pass**: 100 published component/control
identities in A.1/A.4/A.7 and 20 cross-table controls against Table 1.3. Bounds
allow the rounding of the participating published cells; no tolerance is
expanded to hide a failure. Identities requiring a blank or em dash to mean
zero are skipped. Published repeated totals remain separate source cells.
Reconciliation sums/differences stay in the
[internal diagnostic file](../../../data/staged/sa-budget/reconciliation.json),
never in page data, hydration, CSV, search or MCP. The dry run re-parses retained
original bytes and checks every staged value against its source cell.

The function file’s **four sheet titles and A1 headers establish 2012–13,
2013–14, 2014–15 and 2015–16**. No 2005–2011 holdings are inferred from the
catalogue. ETF columns are read from each sheet; 2012–13 has an extra `1145`
column. Three numeric GPC cells use `0000` formatting; their leading zeroes
are retained alongside their original stored codes.

**The entire function workbook is held from numerical publication.** Its
sheets do not state a unit scale; the catalogue says `$million`, while its
scale conflicts with the budget statements. No thousands-to-millions conversion
is inferred. Of **353 native-scale internal diagnostics**, **348 pass and five
exceed rounding**: 2015–16 `G76`/`H76`, and 2012–13 `U23`/`U24`/`U25`.
Sparse blank semantics and consolidation adjustments are not supplied in these
workbooks. They are not silently resolved, and no figures are added across
sectors, years or ABS series.

The resource warning is preserved **verbatim** in staging and the candidate
explanatory block:

> This resources provides the Final Budget Outcome for Government sector expenses categorised by the 4 digit Government Purpose Classification and the Economic Type Framework ($million). This data is more detailed than reported by Department of Treasury and Finance to the ABS or the Final Budget Outcome. It should, however, not be relied on and is provided for interest and is subject to revision.

## Access receipts and deviation

The [ledger](../../../data/staged/sa-budget/receipts.json) records **14 GETs,
all HTTP 200**: robots, terms, two dataset pages, five resource pages and five
original downloads. Each exact original was requested once. There were **zero
redirects, 403s, challenges, resets or timeouts**. No redirect Location exists
for this run. Bodies stay in the ignored private cache; failure bodies would
be discarded after hashing. All requests used the prescribed OPAXBot identity,
no proxy, no automatic redirects, and robots was first on the sole host.

**The run did not fully comply with sequential fetching.** The larger budget
dataset request started at `22:31:09.234804` UTC and completed at
`22:31:20.095703`; the function dataset request started at `22:31:19.252260`,
overlapping its final **0.843443 seconds**. Both returned 200. The concurrent
invocations also raced the ledger; the exact second receipt was restored from
tool output without changing its timestamps. No original was retried.
An exclusive process lock was added **before all subsequent requests**.
Those resource/download requests are sequential and at least 5.11 seconds
after the preceding completion. The
[acquisition audit](../../../data/staged/sa-budget/acquisition-audit.json)
retains the deviation; it requires independent review and is not presented as
a clean acquisition pass.

One publisher download basename embeds a local desktop account identifier.
The exact URL remains in private source HTML. Its committed receipt retains
the resource UUID, requested-URL SHA-256, response status, timing and file
SHA-256, with an explicit URL-withheld reason. It is not an unknown URL or a
missing receipt. No core-properties authors or private-person entities are
extracted. The other 112 budget resources are unselected, not access failures.

## Surfaces and release boundary

The candidate extends **`/budget#sa-budget`**, using the existing budget hub,
tokens, money house style, shared server-rendered DataTable, filters and CSV.
These are Treasury forecasts/accounts published with a historical budget;
ABS GFS has a different classification and revision basis. Keeping the SA
section on the budget hub avoids duplicating the finance register and clearly
separates the two sources. The lede explicitly says **2015–16 historical
budget vintage, not the current budget**. Each table links to its dataset,
resource and source cells, with vintage, snapshot, attribution and licence.

No `portal/public/sa-budget/data.json` exists. Without that reviewed annual
asset the existing federal page keeps its prior content. The local preview
uses the actual Worker with a private candidate fixture through a local asset
binding; it has no production bindings. The function file has an explanatory
block and original resource link only; no held amounts appear in numerical
views. No SA records or totals are added to the search catalogue or `/mcp`.
[App plan only](app-plan.md); no app code or native verification.

`sa-budget` is registered as an **explicit annual opt-in** in
`scripts/promote_hub_data.py`; the default hubs and nightly are unchanged.
The pending review records exact staged input hashes. The promoter dry run
**correctly refuses** with `FAIL sa-budget: review: sa-budget`. It is not an
approved publication or promotion pass. No approval was fabricated.

## Validation and screenshots

Results, protected-file checks and artifact hashes are in
[validation.json](validation.json). The completed checks are:

- **14 Python tests**: synthetic official-layout fixtures, split year/status
  headers, Excel scaling/rounding, sparse ETF matrix and leading-zero GPC,
  published markers, reconciliation, licence gates, refusal persistence,
  one-request behaviour, process lock, original-cell tamper detection and
  rejection of pending promotion.
- **23 portal tests**: SA and federal budget rendering, no computed/held or
  altered cells in HTML/hydration/CSV, optional-asset failure, independent
  table filters, existing search-catalogue exclusion, stub-only MCP search,
  shared asset-cache rules and `plain-language.test.mjs`.
- Existing Queensland acquisition tests and all **14 promoter regression
  tests** pass. `tsc`, `npm run check`, staged read-only dry run and Wrangler
  deployment dry run pass. `votes.json` is byte-identical to the lane base.
- Actual local Worker page responses are **200 at 390 and 1440**, with four
  SA tables, all 447 source rows in server HTML, no page-level horizontal
  overflow, no browser errors and no external browser requests. After review fix 1, phones show Measure, Fiscal year and Value, with
  estimate/actual beneath the measure. All four tables and captions fit their
  350px containers without horizontal scrolling. Desktop retains the seven
  full columns inside its 1325px containers. These are candidate renders, not live proof.

Screenshots: [390 full page](../../../portal/private/sa-budget/budget-390.png),
[1440 full page](../../../portal/private/sa-budget/budget-1440.png),
[390 SA section](../../../portal/private/sa-budget/sa-section-390.png),
[1440 SA section](../../../portal/private/sa-budget/sa-section-1440.png).
All are local ignored evidence under `portal/private/sa-budget/`.

Setup corrections are recorded in validation: runtime types were generated
before the final typecheck; Wrangler dev hit a local `spawn EBADF`, so the
existing Miniflare preview pattern was used; deployment dry run succeeded.
No production Ask, generation, voice or auth route was driven. No pattern
kills, volume changes, private names in fixtures, push or deploy.


## Review fix 1

All six requested changes are implemented offline from `7d0a75e3d`.
The SA-only adapter supplies the phone Value column ($m or published percent)
and secondary estimate/actual line, including after paging/filtering. The
shared DataTable files and defaults are byte-identical. Captions are shortened,
fiscal-year cells are scoped `nowrap`, and record-focused copy preserves all
publisher notes verbatim. Snapshot dates use `shortDate`, with the exact timestamp
in `<time datetime>`, metadata and CSV. Both COVERAGE statuses now read
“staged; independent review and promotion pending”, without em dash separators;
the guard paragraph and 19 Oct line remain byte-identical to the lane base.

**26 targeted portal tests and 14 SA Python tests pass**, including the expanded
plain-language scope. `tsc`, `check`, staged dry run and Worker deployment dry run
pass. Promotion still correctly refuses pending review. Votes and every staged
source input remain byte-identical. No new source or external network requests,
production writes, nightly, push or deployment. CLI checks use a preload guard
that rejects any external connection before DNS/connect, with telemetry disabled.

Fresh local Worker browser assertions pass at 390 and 1440: Value visible and
inside the phone viewport, exactly three phone headers, full desktop columns,
no caption/table/page overflow, fiscal-year nowrap, paging status line restored,
and a percentage value after filtering. No browser errors or external requests.
[Fix validation and current screenshot hashes](fix1-validation.json) supersede
the original surface evidence. Current screenshots are
[390 SA section](../../../portal/private/sa-budget/sa-section-390.png),
[1440 SA section](../../../portal/private/sa-budget/sa-section-1440.png), and
[390 first-table crop, 900px tall](../../../portal/private/sa-budget/sa-table13-390.png).
