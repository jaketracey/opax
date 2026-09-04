# CPI-adjusted money-map report

## CPI series and calculation

The static table in `portal/graph/cpi.ts` comes from [ABS 6401.0, Consumer Price Index, Australia, June 2026, Table 17](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/jun-2026/6401017.xlsx). It uses original series `A2325846C`, “Index Numbers; All groups CPI; Australia”, the weighted average of eight capital cities. The release was published 29 July 2026 and downloaded 5 September 2026. Its index reference period is September quarter 2025 = 100.0.

Each OPAX value is the arithmetic mean of the September, December, March and June quarter index numbers in that financial year. Money-map `byYear` keys name the starting calendar year, so key `2025` means 2025–26. The adjustment multiplier for key `y` is `101.0150 / index[y]`.

| Financial year | Map key | CPI average |
| --- | ---: | ---: |
| 1997–98 | 1997 | 46.4900 |
| 1998–99 | 1998 | 47.0975 |
| 1999–00 | 1999 | 48.2150 |
| 2000–01 | 2000 | 51.0950 |
| 2001–02 | 2001 | 52.5600 |
| 2002–03 | 2002 | 54.1800 |
| 2003–04 | 2003 | 55.4575 |
| 2004–05 | 2004 | 56.7975 |
| 2005–06 | 2005 | 58.6275 |
| 2006–07 | 2006 | 60.3375 |
| 2007–08 | 2007 | 62.3900 |
| 2008–09 | 2008 | 64.3275 |
| 2009–10 | 2009 | 65.8275 |
| 2010–11 | 2010 | 67.8725 |
| 2011–12 | 2011 | 69.4500 |
| 2012–13 | 2012 | 71.0125 |
| 2013–14 | 2013 | 72.9475 |
| 2014–15 | 2014 | 74.1875 |
| 2015–16 | 2015 | 75.2050 |
| 2016–17 | 2016 | 76.4925 |
| 2017–18 | 2017 | 77.9800 |
| 2018–19 | 2018 | 79.2500 |
| 2019–20 | 2019 | 80.3225 |
| 2020–21 | 2020 | 81.6025 |
| 2021–22 | 2021 | 85.2600 |
| 2022–23 | 2022 | 91.2500 |
| 2023–24 | 2023 | 95.0725 |
| 2024–25 | 2024 | 97.3900 |
| 2025–26 | 2025 | 101.0150 |

The June 2026 release contains all four quarters for 2025–26, so no partial-year average is used in this snapshot. Interpolated or TODO years: **none**. A cell outside 1997–98 through 2025–26 clamps to the nearest table year, as documented beside the lookup code. Undated dollars remain nominal because they have no financial year to which a CPI multiplier can be assigned.

## What changed

- Added the off-by-default **Adjust for inflation** checkbox and the requested “in 2025–26 dollars, ABS CPI” sub-line beside the scrub. The label is a 44px-or-larger target.
- CPI scaling now happens per financial-year cell before `windowFigures()` totals it. The returned `byYear` cells are adjusted too, keeping map geometry, flow labels, cards and any per-year/peak consumers on the same view. Donation counts are unchanged.
- Added the requested card fine print in adjusted mode only.
- Full-map URL state uses `cpi=1` alongside `from` and `to`. Jurisdiction switches and the full-screen map link preserve all three values; mini-map embeds keep their state local.
- Phone chrome keeps the scrub and CPI switch in one compact row above the map card. Reduced-motion rules remain static, and card sizing is recomputed when the fine print appears or disappears.
- Rebuilt the committed `portal/public/money-map.js` bundle. Donor and party entry-page figures were not changed.

## Verification

The following completed successfully from `portal/` unless noted otherwise:

- `npx tsc --noEmit -p .`
- `npx esbuild graph/index.ts --bundle --minify --format=esm --target=es2022 --outfile=public/money-map.js`
- `node --check public/money-map.js`
- `node --check public/app.js`
- `node graph/smoke-test.mjs` — federal, Queensland, Victoria and Tasmania passed, including CPI coverage, base-year, clamping, adjusted cells/totals and unchanged counts
- `git diff --check` from the worktree root

The typecheck used locally generated Wrangler binding declarations. The ignored generated file needed the two dashboard-provided `ARAG_KB_ID` and `ARAG_KB_TOKEN` string bindings added locally; no tracked configuration changed.

Headless Chrome ran against local `wrangler dev` with `--use-angle=swiftshader`, `--use-gl=angle`, `--enable-webgl` and `--ignore-gpu-blocklist`. WebGL reported ANGLE over the SwiftShader Vulkan device. At exact 390×844 and 1280×900 viewports:

- Westpac changed from `$105.8m` nominal to `$154.2m` adjusted;
- the adjusted card showed the exact requested fine print and the nominal card showed none;
- the CPI target measured about 143×60px on phone and 244×44px on desktop;
- the control did not intersect the open card, and there was no horizontal overflow; and
- reduced-motion emulation matched and left the map transitions at `0s`.

URL behaviour was exercised through Federal → Queensland → Victoria with an active 2015–2022 scrub window. The final route was `/money?jur=vic&from=2015&to=2022&cpi=1`, and the checkbox remained checked.

Screenshots:

- `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/cpi-off-390.png`
- `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/cpi-on-390.png`
- `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/cpi-off-1280.png`
- `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/cpi-on-1280.png`

## What to check by eye

- At desktop width, compare node size and the `$55.2m`/`$84.1m` flow label as well as the Westpac card total; confirm the scrub/CPI plate remains comfortably separate from the card.
- At phone width, confirm the years, two scrub thumbs and checkbox remain readable in the compact row, and that opening or scrolling the card never covers the control.
- Switch jurisdictions with CPI and a narrowed year window active, then reload or share the URL and confirm the same state returns.
- On a physical low-end phone, check that the longer adjusted fine print remains easy to scan and that the static reduced-motion presentation feels settled.

No deployment or paid API call was made. `CACHE_EPOCH`, `portal/wrangler.jsonc` and `portal/graph/explain.ts` were not modified.

## Commit summary

- `8a80723` — add CPI adjustment to the money map.
- Report and verification evidence — this document's commit.
