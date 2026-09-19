# UI release, 20 September 2026

Application commit: `990f0b9e` on `main`.
Production Worker version: `89cd2085-f6d9-4170-91e0-e9927ec5a9f5`.
Origins: https://opax.com.au and https://www.opax.com.au.

## Scope

- Complete the shared button migration: `actionBtn` and `explainBtn` render `.ui-button`, page actions use the shared variants and sizes, legacy action styles are removed, and download analytics recognise shared buttons. The sentence-style question builder retains its approved exception.
- Add the homepage Spotlight section after Explore by subject. The underlined heading select switches Gambling, Housing and Climate together with their report figures, charts, rankings and suggested questions. “Ask about [subject]” labels the questions; a right-aligned “Learn more about [subject]” link opens the selected topic page. Subject names in these two labels are lowercase.
- Introduce default (`--divider-default`, #B8B4A8) and subtle (`--divider-subtle`, #DFDCD2) divider roles, documented and demonstrated in the local workbench. Major homepage sections use default rules and 48px desktop padding; internal rules are subtle. The opening keeps 68px above and has 80px below. Mobile spacing is unchanged.
- Remove extra dividers around horizontal newly indexed records. Keep subtle separators between stacked mobile entries. Move the money-map coverage note below the map and above its industry filters, and remove the divider above guided exploration.

## Validation

- TypeScript, generated Worker types and asset-stamp checks pass.
- All **625 tests pass**, including three spotlight regression tests covering real report data and topic links, out-of-order responses, and failure recovery.
- Browser review covers the homepage divider hierarchy, map caption position, record row and spotlight heading/questions. Previous local review also checked the spotlight's mobile chart layout.
- The workbench and old homepage prototype remain excluded by `portal/public/.assetsignore`. They are committed contributor references, not production assets.

## Deployment

Deploy the combined changes to the existing `opax-portal` Worker using the command and account documented in [the previous release](UI_RELEASE_2026-09-19.md#deployment). `npm run deploy` rebuilds generated assets and stamps entry references before upload. After deployment, verify the new homepage/module and button helper, research routes, and 404 responses for every excluded workbench/prototype URL.

## Production verification

- Homepage HTML, stamped homepage CSS and the spotlight module include the released changes.
- `/ask`, `/ask?view=search`, the canonical parliamentarian page and all three report exports return 200.
- The released application asset contains the migrated shared button helpers.
- Legacy `/search` redirects preserve the query, state filter, keyword retrieval mode and Search view.
- `/ui-workbench`, `/ui-workbench.html`, `/ui-workbench.js`, `/ui-workbench.css`, `/home-prototype` and `/home-prototype.html` return 404.
