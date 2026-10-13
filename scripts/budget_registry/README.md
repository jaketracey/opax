# Federal Budget staging

Acquisition and staging write only within this worktree's `data/staged` directory. They have no KB, production D1 or publication client. `/budget` reads `/budget/data.json`, now promoted by the reviewed nightly path using `scripts/promote_hub_data.py`.

Acquisition dependencies: Python 3.12+, requests, beautifulsoup4, PyMuPDF. The parser tests create offline Word fixtures with the standard library. Existing shared HTTP tests also need aiohttp. Portal QA uses the repository's npm dependencies, Miniflare and a local Chromium/Playwright installation.

Use a **fresh dated cache for each acquisition**. Old cached index pages are evidence of their original snapshot, not current release discovery.

```sh
python3 scripts/budget_registry/acquire.py --cache .cache/budget-2026-10-13 --out data/staged/budget
python3 scripts/budget_registry/reparse.py --cache .cache/budget-2026-10-13 --stage data/staged/budget
python3 -m scripts.budget_registry.stage --stage data/staged/budget --dry-run
```

For this snapshot, original bytes and rights receipts are retained in `.cache/budget`. The staged inventory distinguishes acquired originals from link-only sections/formats and records each paper's licence/exceptions. It preserves misleading publisher index labels when the authoritative document folder belongs to a different year. Host refusals stop subsequent requests to that host. Robots/challenges are never bypassed; a bounded response deadline retains a hold rather than publishing a partial response.

The offline reparser rechecks full-file hashes and rights before rebuilding fiscal observations and native Word measure rows. It rejects truncated fiscal-year headers and unsupported units/columns, separates Budget/PEFO/MYEFO comparisons, excludes dollar totals and GDP-only medium-term columns, preserves the different October actuals boundary, and retains Word's nonbreaking hyphen and suppression markers. No OCR or historic PDF-only measures reconstruction is claimed. Older final-outcome layouts without the supported nominal historical table IDs remain inventoried originals; the latest outcome provides all 2015–16 to 2025–26 actuals.

The local preview substitutes a staged file through an in-memory Worker asset binding, never through a public asset copy:

```sh
node scripts/budget_registry/preview.mjs
node portal/test/budget-browser.mjs
```

The browser test runs at 390/1440, exercises four metric charts and shared-table search/CSV, verifies JavaScript-disabled figures and blocks off-origin browser requests. It records snapshot/code hashes beside screenshots. Set `OPAX_BUDGET_BROWSER_TOOLS` to the directory containing the local Playwright package; `OPAX_BUDGET_PORT` selects the IPv6 loopback port. `OPAX_TEST_HOST=::1` selects the same loopback family for desktop portal fixtures.

To repair receipts that predate request-identity evidence, use a separate empty cache:

```sh
python3 -m scripts.budget_registry.refresh_receipts --cache .cache/budget-receipt-repair-YYYY-MM-DD
```

This command selects the incomplete ledger entries, performs serial robots-aware GETs, and records each outgoing request's shared identity hash, start time, previous start, measured interval and applicable robots receipt/decision. It requires unchanged document bytes and an open document licence before moving staged provenance; changed rights, source status or index links stop promotion and leave the fresh cache for review. The receipt repair never publishes data. The original source cache remains the retained body store when the fresh hashes match.

After a new snapshot is reviewed, update `data/staged/budget/review.json` with
the reviewed commit and SHA-256 of every named input. Nightly promotes after the
other static exports, validates the public asset and rolls back only this hub on
failure. Inventory-only links retain their licensed-paper receipts; the held
document, its rows and all access/licence-held PBS indexes never enter the public
projection. A final output scan rejects any held item, ID or URL, including nested
receipts and other references, before the asset is written. Original-file hashes
join the committed acquisition ledger; the promoter does not require the VM to
have the desktop acquisition cache or fetch originals again.

```sh
python3 scripts/promote_hub_data.py budget --dry-run --votes-reference HEAD
python3 scripts/promote_hub_data.py budget
python3 scripts/promote_hub_data.py budget --check-public
```

The asset's `promotion` manifest carries counts, the UTC snapshot date and input
hashes. The promoter checks that mobile `votes.json` stays byte-identical during
its run; the optional git reference also enforces a lane's unchanged-votes gate.
