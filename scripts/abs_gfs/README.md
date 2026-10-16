# ABS annual Government Finance Statistics

This lane stages published aggregate numerical cells only. Acquisition, parsing, projection, validation and the local preview are separate; staging never fetches, writes a database or copies JSON into `portal/public`.

- `acquire.py URL cache_filename` is an explicit identifying, sequential ABS fetch. It checks the saved robots policy, enforces at least 5.1 seconds after the previous request completes, records hashes/status/dates, follows only permitted same-host redirects, and stops a run on refusal, challenge or transport failure. Only release/rights pages and inventory-listed XLSX/CSV downloads are allowed. Fetch robots first in a new snapshot. No Data API, alternate identity, proxy or Firecrawl.
- The original files and publisher pages remain under `portal/private/abs-gfs/`. The committed receipt ledger and inventory record their paths and hashes. All 81 originals are retained locally and verified against those hashes.
- `python3 scripts/abs_gfs/stage.py` is offline. It checks every workbook/sheet notice before parsing the exact ABS operating-statement and balance-sheet layouts; holds unreviewed rights and rejects unknown units, markers and layouts. It keeps the publisher's fiscal years, original AUD million values and explicit consolidation group. Missing/suppressed values are not zero. Release is part of the observation key.
- `inventory.json` lists 81 workbooks; `tables.json` lists 299 tables with source, release, fiscal periods/stock dates, government levels, jurisdictions, sectors, format and licence. Comparison and education cubes retain their original table headings and coverage. Education/GDP context is separate from public-sector measures.
- `series.jsonl` has 3,906 headline observations. Five measures have ten years per published group. Six L2 net debt cells come directly from Key Tables `Table_15`, at 30 June 2025. National stays distinct from Commonwealth. No historical or individual-state debt is reconstructed from rounded release-page charts, balance-sheet components or budget papers. Function/education tables are inventoried, not staged.
- `reconciliation.json` records 2,466 checks: 2,340 within-group operating/financing/balance-sheet identities (1.5m rounding tolerance), 120 exact comparisons to the independent ABS level table, and six within-column L2 identities (2m rounding tolerance). The L2 component arithmetic is a check only: the exported value is the published L2 cell.
- `hub.json` is the cleared page/export projection. A held workbook, altered source hash or invented consolidation group cannot enter it.

Read-only gates from the repo root:

```sh
python3 -m unittest discover -s tests -p test_abs_gfs.py
python3 scripts/abs_gfs/check.py --dry-run --verify-originals
```

Portal gates (after `npm ci` in `portal/`):

```sh
node --test test/government-finance.test.mjs
node test/government-finance-browser.mjs
npx tsc --noEmit -p .
npm run -s check
npx wrangler deploy --dry-run --outdir private/abs-gfs/worker-dry-run
```

The browser harness uses a local Worker serving the actual `portal/public/government-finance/data.json`, with no production bindings, and blocks external browser requests. It verifies the served bytes and approved commit against the promoted asset, then saves 390/1440 screenshots under `portal/private/abs-gfs/`. Checks cover shared-table filtering, CSV receipts, page and phone-table fit, dependent selectors and JavaScript-disabled rendering. Promote the reviewed asset before running this harness; there is no staged fallback. Native app work is [plan only](../../docs/coverage/abs-gfs/app-plan.md).

Promotion requires an approved `review.json` joining the exact staged input digests to a reviewed commit. Round 2 promotes that reviewed projection into the single local public asset so it ships with the route. No push, deployment or KB/D1 write occurs. The default four-hub promotion list and nightly scripts remain unchanged: GFS is annual and stays outside nightly.

For a future release, review the new staged inputs and update the receipt before an explicit local re-promotion from the approved checkout (using its `HEAD` as the votes baseline):

```sh
python3 scripts/promote_hub_data.py abs-gfs --votes-reference HEAD
python3 scripts/promote_hub_data.py abs-gfs --check-public --votes-reference HEAD
```

The [Round 2 promotion report](../../docs/coverage/abs-gfs/promotion-round-2.md) records this release's asset digest and validation. Shipping remains the orchestrator's responsibility.
