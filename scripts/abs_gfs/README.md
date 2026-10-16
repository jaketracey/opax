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

The browser harness uses a local Worker with an in-memory staged asset binding, no production bindings, and blocks external browser requests. It saves 390/1440 screenshots under `portal/private/abs-gfs/` and checks shared-table filtering, CSV receipts, no page overflow and JavaScript-disabled rendering. Native app work is [plan only](../../docs/coverage/abs-gfs/app-plan.md).

Promotion is supported by `scripts/promote_hub_data.py abs-gfs` only after an approved `review.json` joins the exact staged input digests to a reviewed commit. The lane runs only its `--dry-run`. The default four-hub promotion list and nightly scripts are unchanged: the orchestrator must activate this lane and promote its reviewed asset before shipping the route. Without that asset the route returns a source-linked 503. No production data, nightly, push or deployment is part of this lane.
