# ABS GFS function promotion, round 3

20 October 2026 Melbourne. Branch `coverage/abs-gfs-function`. Re-review r2 approved both fixes at **`affa233bc194d4c1f40548c2649c06b3aa6bbd53`**. The ten staged inputs are byte-identical to that commit; no numerical restaging or ABS request occurred.

**LIVE-pending.** The reviewed function asset is promoted locally. No push, deployment, nightly, KB/D1 write, production Ask/generation/voice/auth call or new source acquisition. The orchestrator owns deployment and the later LIVE status change.

## Merge and stamps

Merged `origin/main` **`8f397ad50d4171f521cbd7ec54321b5c769b12bd`**, the Ask-link fix, in merge commit **`1b671dd99`**. The only conflict was the `app.js` version in `portal/public/index.html`. Main's HTML was restored, then `npm run -s stamp` ran from `portal/`, including SPA-shell regeneration.

All **13 HTML/shell files** compare equal to main after removing `?v=` values. Only `index.html` differs from main, in stamps alone; `spa-shell.js` is byte-identical to main. `app.js` and the register-table entry retain main's code and differ from main only in their branch-required import stamps. The Ask-link change is retained. No HTML file was resolved by accepting a side's final stamped file without regeneration.

## Reviewed promotion

The [review receipt](../../../data/staged/abs-gfs/review.json) now records the explicit round 3 approval of `affa233bc` and the same ten SHA-256s reviewed at that commit. The original source receipts, inventories, numerical series, reconciliation files, summaries and staged projection remain unchanged. Annual GFS remains outside the default/nightly hub list.

Ran the real promoter and readback, using current main for votes:

```sh
python3 scripts/promote_hub_data.py abs-gfs --dry-run --votes-reference origin/main
python3 scripts/promote_hub_data.py abs-gfs --votes-reference origin/main
python3 scripts/promote_hub_data.py abs-gfs --check-public --votes-reference origin/main
```

Only the declared output changed during promotion:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `portal/public/government-finance/data.json` | 11,416,422 | `87d7f07134ad60aa530cce8856d0206a9767c0ebe805dfae7dacbc73f20bb991` |

The asset carries the reviewed commit and all ten input digests. It includes **3,906 headline observations + 4,340 function observations**: 3,860 expenses-by-function and 480 education-by-purpose cells, 2015–16 to 2024–25. All **2,466 headline + 1,040 function checks** pass. Every public monetary value retains its source workbook/sheet/cell and snapshot SHA-256; diagnostic sums remain internal. No private education/GDP context is included.

Public-file hashes captured immediately before the promoter confirm that it changed only this file. After the test build, regenerated `search-catalog/manifest.json`, `graph/party-members.json`, `social/*.json` and `growth/*.json` are restored. Compared with main, other public changes are the already reviewed function stylesheet/register-table code and required stamps.

## Actual promoted-asset browser proof

The function browser harness now checks the **real approved public asset by default**. It clears any candidate override, verifies served-byte equality with the declared public file, verifies the approved commit/ten input digests, and checks both tables and all consolidation headings. `--fixture` remains an explicit test-only option.

[Browser evidence](../../../portal/private/abs-gfs-function/browser-results.json): local Worker, external browser requests blocked, no production bindings.

| Width | Route | Headline groups / rows | Function groups / rows | Table containment |
| --- | --- | --- | --- | --- |
| 390 | `/register/government-finance`, HTTP 200 | 9 / 451 | 9 / 2,560 | Both tables, their scroll widths and containers are 350px; every amount is inside |
| 1440 | Same route, HTTP 200 | 9 / 451 | 9 / 2,560 | Both tables fit their approximately 1,325px containers |

The file contains 4,340 function observations overall; the default State/general-government selection scopes the function table to 2,560. Function search Hospital narrows it to 90 rows without changing the 451 headline rows. Source-rich CSV, selector transitions and JavaScript-disabled SSR/phone containment pass. No 503, page overflow or browser page error.

The browser verifies these headings against the approved asset: Commonwealth government; Total state governments; Total local governments; Total state and local governments; Control n.f.d.; Australia, all levels of government; National general government. The separate National debt group stays distinct from Commonwealth. Individual state/territory names remain unchanged.

Screenshots: [390 top](../../../portal/private/abs-gfs-function/government-finance-390-top.png), [390 function split](../../../portal/private/abs-gfs-function/government-finance-390-functions.png), [390 table](../../../portal/private/abs-gfs-function/government-finance-390-function-table.png); [1440 top](../../../portal/private/abs-gfs-function/government-finance-1440-top.png), [1440 function split](../../../portal/private/abs-gfs-function/government-finance-1440-functions.png), [1440 table](../../../portal/private/abs-gfs-function/government-finance-1440-function-table.png).

## Verification and handoff

[Round 3 validation](../../../portal/private/abs-gfs-function/round3-validation.json) records the final gate totals, input hashes, asset hash, vote equality, restored generated files and stamp audit.

- Targeted register/public-output/page-entry tests, with `OPAX_GFS_VERIFY_ORIGINALS=1`: **25 pass**, including source-cell verification of all 8,246 observations in both the real and test-fixture promoted assets. Public-output tests inspect both CSVs, SSR/hydration, the built catalogue and authenticated local `/mcp`; diagnostic probes remain excluded.
- **20 Python GFS tests** and **14 promoter regression tests** pass.
- Original-cell dry run verifies all 81 original hashes, all published cells and reparsed function metadata, without writes.
- `npx tsc --noEmit -p .`, `npm run -s check`, real reviewed promoter dry run/readback, Worker `deploy --dry-run`, browser geometry/heading checks and `git diff --check` pass.
- Full portal suite follows `build:search` at `--test-concurrency=4`: **2,194 pass, zero failures/skips**.

`votes.json` remains schema 1 and byte-identical to main `8f397ad50`: SHA-256 `9b7fc46c65185223d70a49b1bd8ee807327473330b02392963aa320b191b7a93`. Coverage remains LIVE-pending. No production/live claim follows from this local promotion.

For future re-promotion, first review the new release's staging and update its real approval receipt to pin the reviewed commit and exact inputs. Then run from that checkout against current main:

```sh
python3 scripts/promote_hub_data.py abs-gfs --votes-reference origin/main
python3 scripts/promote_hub_data.py abs-gfs --check-public --votes-reference origin/main
```

This explicit annual command is never part of nightly. Deploying and flipping LIVE remain with the orchestrator.
