# South Australian historical grants: local staging

**Status: staged; review and promotion pending.** Checked 21 October 2026
Melbourne on `coverage/sa-grants`, from `9c7deab0d0165805d687a90fbec4599a19842d04`.
No public grant asset, production data, push, deployment, nightly, KB, D1 or
native app change. The local commit SHA is supplied in the lane closeout.

## Inventory and licence

[Inventory](../../../data/staged/sa-grants/inventory.json): 12 resource entries
from two publisher dataset pages, seven selected successful-award files and
five explicitly excluded unsuccessful resources. Both Grants SA years are
published in the [same dataset](https://data.sa.gov.au/data/dataset/grants-sa-funded-projects-2016-2017);
no sibling dataset request was needed. The community fund is the bounded
[2008–09 to 2012–13 series](https://data.sa.gov.au/data/dataset/premier-s-community-initiatives-fund).

Both dataset pages and all seven selected resource pages have their own
explicit CC BY 4.0 grant, beyond the generic website footer. The publisher's
copyright terms were read before downloads. Specific data terms prevail;
branding, emblems, images and third-party material have exceptions. The two
CSV files contain five data columns, no separate rights notice or notes row,
and no published total. All file text was checked through the parser; there
is no narrower notice in those CSVs. The five XLS originals returned 404, so
**no XLS contents, sheets or document-level notices were available to review**.
Their catalogue grants do not establish a reviewed workbook.

Required attribution form: organisation name, jurisdiction, dataset title,
date sourced and dataset URL. Each candidate block and CSV row retains source,
dataset/resource URL, year, snapshot and licence; each file's block also carries
its exact resource UUID, attribution and hash. Attribution uses Department of
Human Services or Department of the Premier and Cabinet, Government of South
Australia, the published dataset title, sourced date and dataset URL. It does
not imply endorsement. Requests were on 21 October Melbourne; receipt/UI dates
are explicitly UTC (20 October).

| File | UUID | Staged awards | Original SHA-256 / hold |
| --- | --- | ---: | --- |
| Grants SA 2016–17 | `0760d21e-8344-4462-b305-2f7f92f22f72` | 318 | `3eb9b520edcd60bde341e20bdf5c5111fe98bc2d8ae7e7c3367ef17d3eb0d084` |
| Grants SA 2017–18 | `36f0af29-ef87-4793-a290-7061144e078f` | 359 | `70a175c9bc7e497cda0ea54459d2acdd21253e1e052344944c0858f64b33d063` |
| Successful PCIF 2008–09 | `baec199e-2218-4f8d-b8fb-059e2c428a38` | 0 | Original download 404 |
| Successful PCIF 2009–10 | `3e3c5bf1-038f-4cf8-a712-9476cb5b595d` | 0 | Original download 404 |
| Successful PCIF 2010–11 | `bd96c82f-fa18-433a-8608-68c57d1eb05f` | 0 | Original download 404 |
| Successful PCIF 2011–12 | `f58e0329-b0af-4666-8a5f-11380fb3db8a` | 0 | Original download 404 |
| Successful PCIF 2012–13 | `776a1e61-a44e-4239-a6af-c5c305c3adb7` | 0 | Original download 404 |

The retained 404 hash identifies the response, never a workbook. Excluded
resources have catalogue metadata only: no resource-page/file request and no
applicant or unsuccessful records. No original was retried, and no alternate
URL, API, archive, proxy or agent was tried.

## Rows, reconciliation and privacy

**677 awards staged**, one per nonblank source record. Windows-1252 punctuation
and all recipient, project-title, description, region and original amount
strings remain verbatim, including whitespace. The amount also has a numeric
AUD field. Logical CSV record number includes the header as row 1. The final
empty 2017–18 record is excluded. Years are taken from the publisher resource
titles because there is no year column in either CSV.

[Reconciliation](../../../data/staged/sa-grants/reconciliation.json) has two
passing source-file checks and 677 source-row checks. The offline dry run
re-parses retained originals and compares every source field, amount, UUID,
row, hash and snapshot against the local staged files. **No amount total was
computed**, internally or publicly, because neither CSV supplies a control
total. PCIF award counts, successful-sheet boundaries and totals cannot be
reconciled without original files. Synthetic XLS tests are boundary guards,
not evidence of a verified live XLS schema.

Source-record text is retained locally in
`data/staged/sa-grants/series.jsonl` and `hub.json`; both are intentionally
**git-ignored**. Originals and the local projected `candidate.json` are private.
This preserves the no-private-names-in-commits rule without altering the local
source records. The committed inventory/receipts/review hashes contain no award
text. A fresh clone alone is insufficient for this Mac-local review.

Recipients display as source-record text, including any private individual.
There are no recipient entities, profiles, facets, person links, donor joins,
name-based supplier/charity matches or other identity joins. The files provide
no authoritative existing route identifiers, so organisation names also remain
plain text. Search within a source-record table is not a recipient search
entity. Neither the search catalogue nor MCP receives this series. There is
no electorate or party comparison.

## Acquisition and promotion gate

[Receipts](../../../data/staged/sa-grants/receipts.json) and
[acquisition audit](../../../data/staged/sa-grants/acquisition-audit.json):
**18 sequential GETs, 13 HTTP 200 and five HTTP 404**, OPAXBot/1.0, robots first,
no automatic redirects/proxies, process lock, minimum completion-to-next-start
**5.110189 seconds**, zero overlaps. No 403, challenge, reset or timeout occurred.
The shared SA budget engine persists the stop condition; synthetic tests prove
no further transport call after any of those four conditions. Exact same-host
storage URLs came from selected resource pages and passed robots and terms.
The engine's new configuration defaults leave existing budget acquisition scope
unchanged; the grants wrapper rejects excluded resource UUIDs before transport.

[Review receipt](../../../data/staged/sa-grants/review.json) is **pending** and
records all six current input hashes, including both ignored local record files.
`reviewed-staged` is a local file/row validation status, not independent approval.
`scripts/promote_hub_data.py sa-grants` is explicit opt-in, outside the unchanged
four default hubs. Its dry run rechecks originals and rejects the pending review
with `FAIL sa-grants: review: sa-grants` (expected exit 1). No asset is written.
Approval must identify the reviewed commit and exact input hashes. No approval
was manufactured. A changed input invalidates the receipt.

## Web and app

The new **`/register/sa-grants`** is a separate historical register because the
existing federal/Queensland explorer uses recipient/program projections and
broader identity/total shapes. Reusing those projections would not fit these
source-record-only historical files. The existing grants page links to the
register only when a cleared serving asset is available, preventing a broken
navigation link while promotion is pending.

The actual local Worker rendered the explicit private candidate with **200**.
It uses the shared DataTable/query/CSV implementation, existing tokens and exact
AUD money style. The lede states 2016–17/2017–18, limited historical scope and
that it is not current SA-wide coverage. Awards are not proof of payment.
Source-row manifest equality and rights/held-file checks feed HTML, hydration
and CSV; fields are whitelisted and no aggregate builder is present. All five
PCIF files have explanatory source blocks only. The ordinary reader opens only
`/sa-grants/data.json`, never staging; without the explicit local candidate
substitution the missing public asset produces a 404 source explanation.

Phone tables show Recipient, Year and Amount. Year has `hideWhenConstant:false`
and `white-space:nowrap`, so a one-year file cannot lose its Year column. At
390, the Amount cell spans x=261.5–370 with page width exactly 390. At 1440 all
seven visible columns fit the page. Sorting/hydration and no-JavaScript phone
rendering pass. Only original source-row cells are linked. No native work was
performed; see [app plan](app-plan.md).

## Validation and evidence

- `npm ci` in portal completed.
- Python: **12/12 SA grants** synthetic parser, exclusions, stop/lock, projection
  and promoter checks; **14/14 SA budget** regression checks pass. Existing
  budget originals were copied from the SA budget worktree after verifying each
  hash, with zero additional source requests.
- Node: **53/53 targeted checks** pass: SA grants, plain language (new renderer
  included), existing grants/recipients, shared-table cache stamps and SA budget.
- `npx tsc --noEmit` and `npm run check` pass after generating Worker types.
  The fresh checkout's initial tsc lacked generated runtime types; check generated
  them. The new module was added to the existing asset-stamp graph.
- Staging dry run passes: 677 candidate awards, two reconciliations, 677 original
  row checks, five holds, zero public computed totals, zero writes.
- Promoter dry run rejects pending independent review (expected exit 1); no
  public asset exists. Synthetic tests reject changed input hashes.
- Browser CSV exports contain exactly 318 / 359 awards; recipient and original
  source-row sets match the candidate, with no aggregate rows.
- Actual Worker/browser: 390 and 1440 pass, Amount visible, Year never wraps,
  hydration/sort passes, no-JavaScript phone passes. All external browser and
  Worker requests are disabled. No production routes or bindings are exercised.
- `votes.json` is byte-identical to the requested base and local `origin/main`:
  SHA-256 `d89f34bd8acb440da2efe8364d147e51d0cb8737d5631bac091cd524fe9bf999`.
- Shared Next guard paragraph and 19 October line remain byte-identical.

Private evidence on this Mac:

- [390 table crop](../../../portal/private/sa-grants/390-table-crop.png)
- [390 source section](../../../portal/private/sa-grants/390-section.png)
- [1440 source section](../../../portal/private/sa-grants/1440-section.png)
- `portal/private/sa-grants/390-metrics.json`, `1440-metrics.json`,
  `targeted-tests.log`, `check.log`, `tsc.log`, `promoter-dry-run.log`,
  `csv-export-check.json`.

Committed [validation summary](validation.json), inventory, receipts,
reconciliation and pending review receipt accompany this report. No push,
deployment, nightly, production write or app build is claimed.
