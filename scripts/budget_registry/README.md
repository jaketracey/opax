# Federal Budget staging

This lane writes only within this worktree's `data/staged` directory. It has no KB, production D1 or publication client. `/budget` reads `/budget/data.json` only after a separate reviewed nightly load. Do not copy a candidate into `portal/public` or activate a production loader as part of this lane.

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
