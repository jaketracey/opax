# ABS GFS fix round 1

Review baseline: `15f86fe11cdd72663621060cb06fe12466253d32`. All work is local on `coverage/abs-gfs`. No new ABS requests, production writes, nightly, push or deploy. All eight staged GFS files, including the numerical series, source receipts and licence review, are byte-identical to that baseline.

1. **P2 mobile table** — `portal/public/government-finance.css:25` gives only GFS a phone layout using the existing shared table DOM: measure and amount lead each row, then jurisdiction, fiscal year, release and original-cell link. Other register tables and CSV fields are unchanged. `portal/test/government-finance-browser.mjs:12` measures the table and its scroll container and checks every rendered amount cell's horizontal bounds. At 390px the table, scroll width and container are all **350px**; all **25** amounts are inside the container, with JavaScript enabled and disabled. Desktop keeps six columns.
2. **P2 dependent selectors** — `portal/src/government-finance.ts:75` derives levels from the release, sectors from the selected release/level, and jurisdictions from that release/level/sector. A known stale lower-level choice resets to the first published choice. Higher-level selections take priority; unknown values and repeated parameters still return 400. Changing NSW to Commonwealth selects Australia and returns **50** source observations. National + Total public sector resets to General government and returns its **one** published L2 observation. Both transitions pass server-render and real browser tests.
3. **P3 absent measures** — `portal/src/government-finance.ts:93` emits a headline field only when that card has an observation. It retains **Not published** for a genuine null source cell, and a published zero remains zero. The National card contains just its published Net debt (L2) field.
4. **P3 spacing** — `portal/public/government-finance.css:1` replaces the stacked summary margin/prerender padding/content padding/lede margin with the register row-spacing tokens. The measured summary-to-lede gap is **24px** at both 390 and 1440, down from the reviewed 88px.

## Gates

All passed:

- `python3 -m unittest discover -s tests -p test_abs_gfs.py`: **12 passed**.
- `python3 -m unittest discover -s tests -p test_promote_hub_data.py`: **14 passed**.
- `node --test test/government-finance.test.mjs test/register-tables.test.mjs test/vic-gifts.test.mjs test/state-bills.test.mjs`: **35 passed**, zero failures/skips.
- `node test/government-finance-browser.mjs`: 390/1440 server rendering, table/container geometry, amount visibility, selector transitions, absent measures, spacing, filtering, CSV provenance and a JavaScript-disabled phone table. Browser external requests are blocked; Worker assets come from the staged snapshot in memory.
- `npx tsc --noEmit -p .` and `npm run -s check`.
- `npx wrangler deploy --dry-run --outdir private/abs-gfs/fix1-worker-dry-run`.
- `python3 scripts/promote_hub_data.py abs-gfs --dry-run --votes-reference 15f86fe11` (no output writes).
- `git diff --check`; `votes.json` schema 1 and byte-identical SHA-256 `f9908e4f46f7148a82daee2d0b14c62cd7f2172ff1cd310df9a132a152970aff`.

## Current screenshots and evidence

| Width | Top of page | Table |
| --- | --- | --- |
| 390 | [Top](../../../portal/private/abs-gfs/government-finance-390-viewport.png) | [Table](../../../portal/private/abs-gfs/government-finance-390-table.png) |
| 1440 | [Top](../../../portal/private/abs-gfs/government-finance-1440-viewport.png) | [Table](../../../portal/private/abs-gfs/government-finance-1440-table.png) |

Full-page captures were refreshed in the same directory. [Browser measurements](../../../portal/private/abs-gfs/browser-results.json) and [validation with code/input/screenshot hashes](fix-round-1-validation.json) bind these checks to this change. The original `validation.json` remains historical and points to this current UI evidence. No native app code changed.
