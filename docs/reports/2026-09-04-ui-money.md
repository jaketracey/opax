# MONEY, INFLUENCE and PEOPLE implementation report

Implemented all six approved proposals on branch `ui-money`. Nothing was deployed. `CACHE_EPOCH`, the knowledge-box configuration, enrichment tasks and `/api/ask` were not touched.

## 1. Declared ties — `7f28131`

- Extended `scripts/export_interests.py` to compare every eligible, uncapped register row with AEC donor labels and aliases, registered lobbying firms, and FITS registrants.
- Kept matching conservative: exact normalised names, provider-aware matching in gift and travel prose, and the small reviewed brand list requested in the brief. Liabilities and the folded `other` bucket are excluded so ordinary bank accounts and mortgages do not read as ties.
- Added `ties` to person exports and `interests/ties-by-donor.json` as the donor-side mirror.
- Added the person-page “Declared ties to disclosed money” section above the register accordions and “Named in members' registers” on donor pages. Both disappear when no match exists and retain the identification-not-accusation/source wording.
- Regenerated the static interests export from the read-only database: 10,052 non-nil rows, 317 people, 249 ties and 44 donor mirrors.

## 2. Where the party's money comes from — `0b755ca`

- Added the annual-return receipts strip to party pages using the already-loaded AEC extras export.
- Each year divides receipts into itemised donations, itemised other receipts and the remainder not itemised; all figures link to AEC Transparency.
- Added the three approved summary figures, legend, screen-reader table, infobox receipt line and historic-row clamp note.
- Kept all 27 available annual returns for long-running parties. To keep the dense run quiet, the not-itemised percentage is printed only on the newest and peak rows.

## 3. Against the chamber — `73d1a7d`

- Replaced “Five largest line items” with annualised category bars and chamber-median ticks.
- The comparison cohort is computed from `expenses.json`: 232 sitting parliamentarians claiming in the latest year who began claiming at least three years earlier.
- Totals, annual figures and medians link to the IPEA source; the note names the cohort and cautions that electorate size and portfolio affect costs.

## 4. Remove or simplify — `0f64fac`

- Removed the party-seeded 3D map from person pages and replaced it with one quiet link to the party's money map. Donor and party maps remain.
- Removed the weekly money fun fact and every “Search the web” action.
- Moved the person Quick facts infobox directly below the subject header on narrow screens.
- Limited the FEDERAL vote chip to people with records in more than one parliament and removed the duplicate They Vote For You action.
- Rebuilt `portal/public/money-map.js` from `portal/graph/index.ts` after removing the map-card web-search action.

## 5. The balance — `9b657e1`

- Added the donor-page year ledger under “Where the money went”: Coalition to the left, Labor to the right and other parties outlined underneath.
- Grouped Liberal, Nationals, LNP and Country Liberal Party as Coalition; the source note lists the actual parties grouped as “other” for each donor.
- Marked federal election years, scaled the three series to the donor's largest grouped year, labelled each series' peak on wider screens and supplied every annual figure in a screen-reader table.
- Chose the quieter data rule for one-sided donors: omit years with no disclosed flow at all, while retaining zero-length sides in every year that does have a flow.

## 6. Just declared — `b12c555`

- Added `interests/recent.json`, built from uncapped dated additions and deletions and deduplicated across repeated source snapshots. It contains the newest 300 of 1,660 dated alterations, currently spanning 15 June to 2 September 2026; 16 rows carry exact organisation matches from proposal 1.
- Added a six-row “Just declared” front-page module.
- Added `/declared`, grouped by week, with category and party filters, person deep links, register source links, deletion styling, lazy same-origin portraits, exact cross-register name matches and source/licence notes.
- Linked each person page's alterations summary to `/declared?person=…`.
- On phones, the date becomes a once-per-day running head; on wider screens it remains in each ledger row.

## Skipped

No requested proposal was skipped. Proposals 7 (“the party's family”) and 8 (“the division list”) were not attempted, as instructed. No live deployment or production check was performed.

## Regenerating the interests exports

The script opens `/home/jake/.cache/autoresearch/parli.db` through SQLite's read-only URI. From the repository root:

```sh
mkdir -p /tmp/opax-interests-export
scp scripts/export_interests.py portal/public/access.json portal/public/fits.json portal/public/graph/money.json desktop:/tmp/opax-interests-export/
ssh desktop 'rm -rf /tmp/interests && python3 /tmp/opax-interests-export/export_interests.py --out /tmp/interests --money /tmp/opax-interests-export/money.json --access /tmp/opax-interests-export/access.json --fits /tmp/opax-interests-export/fits.json'
rsync -a --delete desktop:/tmp/interests/ portal/public/interests/
```

If the graph source changes, rebuild its checked-in browser bundle with:

```sh
cd portal
npx esbuild graph/index.ts --bundle --minify --format=esm --target=es2022 --outfile=public/money-map.js
```

## Verification completed

- Before each proposal commit: `node --check portal/public/app.js` and `cd portal && npx tsc --noEmit -p .`.
- Also checked the touched Python exporter with `python3 -m py_compile scripts/export_interests.py` and ran `git diff --check`.
- Exercised person, party, donor, home and `/declared` routes in the browser at phone and desktop widths.
- Confirmed no document-level horizontal overflow at the tested phone width; filters and source controls retain 44 px targets.
- Confirmed the approved Westpac balance figures ($48.3M Coalition, $55.2M Labor, $2.2M other), its three peak years, 28 year rows and 10 election rules.
- Confirmed the One Nation receipt headline and the Pauline Hanson expense comparison against the 232-person cohort.
- Confirmed person pages contain no canvas, one They Vote For You action, no redundant single-jurisdiction FEDERAL chips and a working party money-map link.
- Confirmed the recent export is newest-first, duplicate-free, source-linked and filterable, and that the Jo Briskey person link resolves to her ledger rows.

## What to check by eye after a future deploy

- At 390 px, inspect Jo Briskey and Pauline Hanson: Quick facts should lead, register ties should stack cleanly, long declarations should wrap, and the party money-map link should remain quiet.
- On One Nation, Labor and Liberal party pages, compare receipt segment contrast and the oldest clamped rows against their AEC returns.
- On Westpac and Mineralogy donor pages, confirm the centre axis, peak labels, election rules and outlined “other” bars remain legible on the production fonts.
- On `/declared` and the home page, check portrait crops, deletion strike-throughs, day/week rhythm, category/party filters and several APH page fragments in a new tab.
- Reconfirm production CSP permits only the new same-origin JSON and `/photos/*.webp` requests and that no console or failed-network errors appear.
