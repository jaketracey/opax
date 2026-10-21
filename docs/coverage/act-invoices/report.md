# ACT Notifiable Invoices Register — 22 October 2026

**Staged; review and promotion pending.** No push, deploy, production data write,
nightly change, app build or production Ask/generation/voice/auth request.
Branch `coverage/act-invoices`, baseline `6b021dc84`, Mac worktree
`/Users/jake/Projects/opax-ios-wt/act-invoices`.

## Inventory and rights

ACT Government's [Notifiable Invoices Register](https://www.data.act.gov.au/Government-and-Transparency/Notifiable-Invoices-Register/kzmf-7uhp),
dataset **`kzmf-7uhp`**, catalogues **July 2015–September 2026**, monthly.
The fresh [schema metadata](https://www.data.act.gov.au/api/views/kzmf-7uhp.json)
and the metadata embedded in the full export both grant **Creative Commons
Attribution 4.0 International**. The publisher's attribution field is exactly
**“ACT Government”**. Its terms link is
`http://creativecommons.org/licenses/by/4.0/legalcode`; public blocks link to
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), attribute ACT Government,
identify the source/dataset/snapshot and describe OPAX's date-display and
payment-period additions. No narrower data notice was found in the selected
page, schema or export. No other ACT publisher's rights are inferred.

[Inventory](../../../data/staged/act-invoices/inventory.json),
[schema](../../../data/staged/act-invoices/schema.json),
[receipts](../../../data/staged/act-invoices/receipts.json),
[acquisition audit](../../../data/staged/act-invoices/acquisition-audit.json),
[grain/month/duplicate report](../../../data/staged/act-invoices/reconciliation.json)
and [pending review receipt](../../../data/staged/act-invoices/review.json).

The live schema has eight fields:

| Published field | API name | Type |
| --- | --- | --- |
| Supplier Name | supplier_name | text |
| Supplier ABN | supplier_abn | text |
| Reporting Entity | reporting_entity | text |
| Publish Description | publish_description | text |
| Date Invoice Received | date_invoice_received | calendar_date |
| Payment Date | payment_date | calendar_date |
| Payment Amount | payment_amount | number |
| Contract Number | contract_number | text |

The description mentions a Procurement Unique Identifier, but there is no
separate such column in either live schema. Contract Number has source position
9; no missing column or invoice identifier is invented. Full schema metadata,
including Socrata's supplier-bearing cached samples, stays private; the committed
schema evidence contains column definitions only.

## Acquisition and size

Four sequential GETs: robots, schema, dataset page, and the page's linked
`https://www.data.act.gov.au/api/views/kzmf-7uhp/rows.json` full export. All 200.
No paging, server aggregation, export alternative, redirect, retry, refusal,
challenge, reset or timeout. The exact export URL was checked against fresh
robots before requesting it. Robots on this run specified one second; the
engine imposed at least 5.11 seconds after completion. The measured minimum
completion-to-next-start gap was **7.015138 seconds**, with no overlap. The SA
lane's no-redirect transport, robots matcher and refusal primitives are reused
under an exclusive process lock and the required OPAXBot user agent.

Snapshot completed **2026-10-21 22:08:57 UTC**, **22 October in Melbourne**.
Source metadata and the export agree on schema and source update version.

| Item | Count / size |
| --- | --- |
| Published rows, all retained | **127,437** |
| Full original export | **35,967,878 bytes** (34.3 MiB) |
| Local source-record series | **98,252,512 bytes** (93.7 MiB) |
| Local candidate SQL | **101,155,819 bytes** |
| Valid-span payment months, July 2015–September 2026 | **135**, none empty |
| Other payment months | **2005-12: 1 row; 2015-04: 1 row** |
| Missing payment dates | **2 rows** |

The size decision was reported before implementing the surface. The original
alone exceeds the approximately 2 MB guide, so this uses **D1 + the existing table
API + shared server-rendered DataTable**, with no static public row asset.

Original snapshot SHA-256:

```text
9461967d519fd9ea21f47301975b16b792f2829b4f231bb1d87a90dde0d66dac
```

Every staged record retains all eight original fields, including nulls, raw
amount/date text, ABN leading zeros, its export-array position, Socrata ID/SID/
position, snapshot time and snapshot SHA-256. Derived payment day, month,
financial year and numeric amount are separate fields. There is no identity
normalisation or source-record deduplication.

Supplier-bearing originals and `data/staged/act-invoices/series.jsonl` are local
and ignored by Git, respecting the no-private-names-in-commits rule. Four
hash-verified original bodies also have a durable local handoff outside the
worktree: [handoff receipt](originals-handoff.json). Restoring those hash-named
bodies to the documented private acquisition directory reproduces the staged
series and its review digests offline. No new source request is needed.

## Rows by payment year

These are source-record counts, not invoice counts or monetary totals.

| Payment year | Staged rows |
| --- | ---: |
| 2005 | 1 |
| 2015 | 4,686 |
| 2016 | 10,242 |
| 2017 | 9,533 |
| 2018 | 9,861 |
| 2019 | 9,444 |
| 2020 | 10,356 |
| 2021 | 10,502 |
| 2022 | 12,382 |
| 2023 | 12,806 |
| 2024 | 15,091 |
| 2025 | 13,167 |
| 2026, through September | 9,364 |
| Payment date not supplied | 2 |

`inventory.json` and `reconciliation.json` also carry counts for each payment
month as fetched. There is no separate reporting-month field. Nonempty payment
months do not prove complete reporting by every entity.

## Grain, caveats and privacy

**1,530 exact duplicate groups / 2,393 extra copies** are reported by a digest of
all eight published fields and their source positions. Every copy stays staged.
Source coordinates and Socrata row IDs are unique in this snapshot; neither is
a unique invoice ID. Repeated Contract Number values are not invoice identities
and are never used for joins.

There are **58 missing amounts**, **18,926 missing received dates**, **31 payments
below $25,000**, including **two negative payments**, and the two pre-start
payment dates above. All remain as published. The threshold is **invoice value**,
not the amount of every individual payment. No monetary aggregate, reconciliation
sum or inferred publisher total has been computed or exposed.

The page explains the catalogued period, paid-invoice grain, 21-day publication
regime, non-uniform/missing received dates, the publisher's June/July 2017 caveats,
and reporting-entity changes including 19 August 2025. Dates preceding the stated
start are flagged rather than corrected. Payment month/year filters use payment
date; missing dates stay unallocated. This is not all ACT spending, a contract
award register or a claim of complete reporting.

Supplier names and ABNs appear only as plain source-record fields in rows and
CSV. There are no supplier links, person/profile/entity exports, supplier facets,
name/ABN filter values or supplier/ABN joins. FTS contains **description and
reporting entity only**. Unsupported identity filters/sorts and spoofed entity
labels are rejected without echo; HTML/history scrub invalid supplier state.
Reporting entities stay as published, without merging labels or adding agency
links. Search catalogue and `/mcp` remain outside this dataset.

## Web, promotion and holds

`/register/act-invoices` is server-rendered with the shared DataTable and money
styles/tokens. Filters: reporting entity, payment month, financial year, amount
range. All eight source fields and provenance remain available through columns
and bounded CSV exports. The shared CSV contract caps each logical export at
50,000 rows, with continuation/limit notices; filtering narrows that scope.
Money → Public money and the generated menu/footer include the new register.
[App plan only](app-plan.md).

The explicit shared promoter validates the retained originals, complete staging
and all review-input digests before accepting an independent approved receipt.
Its ACT destination is **`data/promoted/act-invoices/table.json`**, outside public
assets and Git. The D1 builder accepts only that reviewed artifact, verifies the
series digest/coordinates and stores its source receipt in `table_meta`.

Fix 1 supplies the reviewed GitHub release-asset transfer before the SQL build;
see [fix 1 report](fix1-report.md) and the [orchestrator steps](../../../scripts/act_invoices/README.md#fix-1-reviewed-public-release-delivery).
The orchestrator uses the existing `OPAX_TABLE_RELOAD=on` deployment path. Ordinary
reloads without it preserve the last approved ACT rows and receipt; they cannot
clear or refresh them. A fresh database without an ACT receipt serves no ACT
rows: page and API fail closed. Nightly never acquires or promotes this source.

**Holds:** no acquisition hold; independent review and explicit promotion remain
pending, with duplicate/date/missing-value caveats for that review. The pending
review receipt is unchanged. Fix 1 also commits a pending release manifest; no
public release asset exists from this lane. No reviewed artifact was written. Browser evidence
uses the full staged snapshot in an isolated local D1 with an explicitly
labelled test-only receipt, no production bindings and outbound network denied.

## Validation and evidence

[Validation summary](validation.json). `npm ci` completed in `portal/`.

- **117 targeted Node checks pass:** ACT money-table privacy, real D1/API/CSV,
  URL state, source facets, missing-review gating, retained-data reload behavior,
  table schema/load, reload orchestration, plain language, navigation, SA grants
  and asset cache regressions. All new suppliers/ABNs in fixtures are synthetic.
- **8 ACT Python checks and 12 SA grants Python checks pass:** parser/grain,
  missing months/values, duplicate reporting, exact-query robots refusal, 200
  challenge/403/reset/timeout stops, robots/licence order and reviewed promotion
  gates. No partial data or public asset emerges from held inputs.
- `tsc --noEmit` and `npm run check` pass, including generated runtime types,
  token/stamp and existing release-data checks.
- Offline staging dry run passes for all 127,437 rows. The promoter dry run
  intentionally exits 1 at **`review: act-invoices`**, with zero writes.
- Full candidate SQL imports into fresh SQLite with matching counts, and into
  isolated local D1. No remote reload was run.
- 390/1440 browser checks pass with no page errors or page overflow, including
  sorting, no-JavaScript phone rendering and unsupported identity URL state.
  At 390, Supplier x=20–153, Date x=153–254.5, Amount x=254.5–370; date is nowrap.
  Screenshots use the ordinary `t.pageSize=10` table state.
- `votes.json` and `pay.json` are byte-identical to `6b021dc84`. The shared guard
  paragraph and 19 October private-names decision are byte-identical.

An additional existing SA budget regression attempt passed 11 of 14 checks;
three checks require the pre-existing SA private originals cache, which is absent
from this worktree. Their cache-dependent results are unavailable, not new ACT
failures. No SA original or held source was re-requested.

Local evidence in `portal/private/act-invoices/`:

- `390-table-crop.png`, `390-section.png`, `1440-section.png`;
- `390-metrics.json`, `1440-metrics.json`, `browser-check.log`;
- `targeted-tests.log`, `python-tests.log`, `check.log`, `tsc.log`;
- `staging-dry-run.log`, `promoter-dry-run.log`, `table-preflight.log`;
- hash-named acquisition originals, with the separate durable handoff above.

The preview process is stopped after verification and its reproducible temporary
SQL/runtime storage is removed. Source originals, staged records, receipts,
screenshots and logs remain for independent review.
