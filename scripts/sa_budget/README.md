# South Australian historical budget staging

This lane inventories publisher HTML and retains five originals privately under
`portal/private/sa-budget/acquisition/`, keyed by SHA-256. The 117 budget resources
and the function dataset’s two links are in `data/staged/sa-budget/inventory.json`.
Only Table 1.3, Tables A.1/A.4/A.7 and the authorised direct function resource
were downloaded. The separate ABS link was not followed.

`acquire.py` reuses Queensland’s no-redirect handler and wildcard robots matcher.
It persists one receipt per exact URL, stops on refusal/challenge/network error,
uses the shared OPAXBot identity without proxies, and spaces requests by at least
5.11 seconds after completion (or the applicable robots crawl delay). A process
lock now serialises invocations. **The run has one recorded pre-lock overlap
between dataset HTML requests.** Receipts were restored from exact tool output
after that race; timestamps were not altered. See `acquisition-audit.json`.
Do not re-fetch this fixed run to erase the deviation.

The function download basename embeds a desktop account identifier. Exact HTML
and original link stay private; committed receipts retain its URL SHA-256 and
resource UUID. Workbooks use UUID filenames in the tidy contract. No workbook
author/core-properties identities are extracted.

Offline commands from the repository root:

```sh
python3 -m scripts.sa_budget.stage
python3 -m scripts.sa_budget.check --dry-run
python3 -m unittest discover -s tests -p test_sa_budget.py
python3 scripts/promote_hub_data.py sa-budget --dry-run --votes-reference origin/main
```

The independent r2 review approved `afb8837ee`; `review.json` records that verdict
and the six unchanged staged-input hashes. The reviewed local promotion is
**LIVE pending deploy**. The dry runs validate 447 budget cells; 4,774 function
cells remain held for scale and reconciliation. Five of
353 function diagnostics fail; all 120 budget checks pass. No public amount is
computed from those diagnostic sums. Blank cells are absent, not zero.

`hub.json` is a staging input. `check.projection()` whitelists source fields and
excludes held numerical content. The portal rechecks each value against the
source-cell manifest before HTML, hydration or CSV. No SA amounts are added to
the search catalogue or `/mcp`. No public data asset is written by staging.

`sa-budget` is an explicit annual opt-in to `scripts/promote_hub_data.py`, with
exact input hashes and independent approved review required. Its default hubs,
nightly and existing data assets are unchanged. The acquisition deviation also
requires review. `scripts/sa_budget/preview.mjs` serves the promoted public asset
by default through the actual local Worker with local file bindings and no
production bindings. Set `OPAX_SA_PREVIEW_DATA=candidate` only for an explicit
preview of the private projected fixture at
`portal/private/sa-budget/candidate.json`. External Worker requests are disabled.

Future explicit re-promotion, after confirming the local `origin/main` reference
and independent approval of the exact input hashes:

```sh
python3 scripts/promote_hub_data.py sa-budget --votes-reference origin/main
python3 scripts/promote_hub_data.py sa-budget --check-public --votes-reference origin/main
```

The promoter may write only `portal/public/sa-budget/data.json`. Any input change
requires a new independent review receipt before re-promotion. See
`docs/coverage/sa-budget/promotion-round-3.md` for the approved promotion evidence.

Python requires `openpyxl` (the Mac run used 3.1.5). Parser fixtures are synthetic
versions of the inspected official split-header, scaled-money and ETF layouts.
See `docs/coverage/sa-budget/report.md` for findings and validation evidence.
