# ABS GFS reviewed promotion, Round 2

17 October 2026 Melbourne. User review r2 approved `d7b0a7052a7ed33649f8cc0fb379335ca44e6ef4`. Updated `data/staged/abs-gfs/review.json` to that approval; all six staged input hashes are unchanged. No new ABS requests occurred.

Ran the real local promotion:

```sh
python3 scripts/promote_hub_data.py abs-gfs --votes-reference 71c3615b8
```

The single declared output is [portal/public/government-finance/data.json](../../../portal/public/government-finance/data.json): **4,904,581 bytes**, SHA-256 **`92062f93d0dab5e141cdb2137d47f84e49744c6d7121e9eb65194710acb83340`**. It contains the reviewed projection and approval/input-hash manifest: **81 documents, 3,906 observations, 2015–16 to 2024–25, 2,466 passing reconciliations**. Every staged file remains cleared for its numerical-table reuse; no held file is exported.

A before/after hash comparison of all public files confirms this is the only added or changed file under `portal/public/`. Stamps were already current, so no restamping writes were needed. `votes.json` remains schema 1 and byte-identical to `71c3615b8`, SHA-256 `f9908e4f46f7148a82daee2d0b14c62cd7f2172ff1cd310df9a132a152970aff`.

## Browser proof

Removed the staged-data override from `scripts/abs_gfs/preview.mjs`. The local Worker now reads the actual public asset. The browser harness requires its HTTP response bytes to equal the promoted file and its manifest to match the approved receipt before rendering the route. External browser requests are blocked; no production bindings are attached.

| Width | Route HTTP status | Headline groups | Headline figures | Default series rows | Table / container width |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 390 | 200 | 9 | 46 | 451 | 350 / 350 px |
| 1440 | 200 | 9 | 46 | 451 | 1324.8125 / 1325 px |

The asset itself returns 200. All 25 initially displayed amounts fit their container at both widths. No document overflow or page errors; summary-to-lede spacing is 24px. Filtering finds 90 net-worth rows from 451 default rows. CSV source receipts, both dependent-selector transitions, JavaScript-disabled headlines and phone table fit pass.

Retook all six images against the promoted asset, including the required top and table views. The PNG bytes match the approved Round 1 UI because promotion changes no visual content; capture times and hashes are in [current validation](promotion-round-2-validation.json).

- 390: [top](../../../portal/private/abs-gfs/government-finance-390-viewport.png), [table](../../../portal/private/abs-gfs/government-finance-390-table.png), [full page](../../../portal/private/abs-gfs/government-finance-390.png).
- 1440: [top](../../../portal/private/abs-gfs/government-finance-1440-viewport.png), [table](../../../portal/private/abs-gfs/government-finance-1440-table.png), [full page](../../../portal/private/abs-gfs/government-finance-1440.png).

## Gates

All passed; exact commands and exit statuses are in [validation](promotion-round-2-validation.json):

- `tests/test_abs_gfs.py`: 12 tests.
- `tests/test_promote_hub_data.py`: 14 tests.
- Portal government-finance, register-tables, Vic gifts and state bills suites: 35 tests.
- Browser check against the promoted public asset.
- `npx tsc --noEmit -p .` and `npm run -s check`.
- Worker `npx wrangler deploy --dry-run --outdir private/abs-gfs/r2-worker-dry-run`.
- Offline GFS validation, promoter `--check-public` and promoter `--dry-run`, with the pinned votes baseline.
- Stamp currency, public-file scope, unchanged staged input digests, unchanged nightly defaults and `git diff --check`.

## Future annual promotion

GFS stays outside nightly. Default promotion hubs and nightly/data-group wiring are unchanged. After staging and reviewing a future release, update its approved receipt and explicitly re-promote from that approved checkout, using its `HEAD` as the votes baseline:

```sh
python3 scripts/promote_hub_data.py abs-gfs --votes-reference HEAD
python3 scripts/promote_hub_data.py abs-gfs --check-public --votes-reference HEAD
```

Commit the reviewed asset with its code and evidence for the orchestrator to ship. No push, deploy, nightly run, KB/D1 write or app code occurred in this round.
