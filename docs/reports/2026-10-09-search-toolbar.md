Search toolbar regression, branch `web/search-segment`, based on `792012be`.

The original `.ui-button` rule in `portal/public/ui-controls.css` sets
`overflow-wrap: anywhere`. Combined with
`#panel-search #search-readbar button { flex: 1 1 0; min-width: 0; }` in
`portal/public/style.css`, it squeezed Passages into two lines even at 1440px.
The toggle was 62px tall next to 48px actions. The Briefs note was a child of
the readbar, so appearing between the toggle and sort changed the controls'
width and position. At 1024px it pushed Export onto another row.

Shared segment buttons now use `white-space: nowrap`, `overflow-wrap: normal`,
`word-break: normal`, `min-width: max-content` and no shrinking. Search uses
flush segments with the same height, typography and vertical padding as the
other actions. Its summary wraps or takes a separate row before the intact
controls group. On phones the full-width toggle precedes the sort row and
Copy link/Export row. The short availability sentence is part of the summary
and identical in both reading modes: “20 have briefs; others show record
details.” The shared correction also covers the Ask question builder,
homepage question builder, homepage prototype and UI workbench's compact,
default and large segments. Mobile question builders use their existing select.

All screenshots are local artifacts under
`/home/jake/opax-work/wt/web-search-segment/results/search-segment/` (ignored by
Git). Before shots were captured before the fix, using Chromium and local
fixtures with 20 visible results, 156 total matches and 20 stored briefs.
Every request was fulfilled from local static files or fixtures; external
requests were blocked. No production API was called.

| Width | Before Passages | Before Briefs | After Passages | After Briefs |
| --- | --- | --- | --- | --- |
| 1440 | [PNG](../../results/search-segment/before/chromium-search-1440-passages.png) | [PNG](../../results/search-segment/before/chromium-search-1440-briefs.png) | [PNG](../../results/search-segment/after/chromium-search-1440-passages.png) | [PNG](../../results/search-segment/after/chromium-search-1440-briefs.png) |
| 1180 | [PNG](../../results/search-segment/before/chromium-search-1180-passages.png) | [PNG](../../results/search-segment/before/chromium-search-1180-briefs.png) | [PNG](../../results/search-segment/after/chromium-search-1180-passages.png) | [PNG](../../results/search-segment/after/chromium-search-1180-briefs.png) |
| 1024 | [PNG](../../results/search-segment/before/chromium-search-1024-passages.png) | [PNG](../../results/search-segment/before/chromium-search-1024-briefs.png) | [PNG](../../results/search-segment/after/chromium-search-1024-passages.png) | [PNG](../../results/search-segment/after/chromium-search-1024-briefs.png) |
| 820 | [PNG](../../results/search-segment/before/chromium-search-820-passages.png) | [PNG](../../results/search-segment/before/chromium-search-820-briefs.png) | [PNG](../../results/search-segment/after/chromium-search-820-passages.png) | [PNG](../../results/search-segment/after/chromium-search-820-briefs.png) |
| 390 | [PNG](../../results/search-segment/before/chromium-search-390-passages.png) | [PNG](../../results/search-segment/before/chromium-search-390-briefs.png) | [PNG](../../results/search-segment/after/chromium-search-390-passages.png) | [PNG](../../results/search-segment/after/chromium-search-390-briefs.png) |
| 1024, 200% text | [PNG](../../results/search-segment/before/chromium-search-1024-text-200-passages.png) | [PNG](../../results/search-segment/before/chromium-search-1024-text-200-briefs.png) | [PNG](../../results/search-segment/after/chromium-search-1024-text-200-passages.png) | [PNG](../../results/search-segment/after/chromium-search-1024-text-200-briefs.png) |

WebKit after shots use the same widths and both modes:
`after/webkit-search-{1440,1180,1024,820,390,1024-text-200}-{passages,briefs}.png`.

Other shared surfaces, after the fix:

| Surface | Chromium 1024 | Chromium 390 | WebKit 1024 | WebKit 390 |
| --- | --- | --- | --- | --- |
| Ask | [PNG](../../results/search-segment/after/chromium-ask-1024.png) | [PNG](../../results/search-segment/after/chromium-ask-390.png) | [PNG](../../results/search-segment/after/webkit-ask-1024.png) | [PNG](../../results/search-segment/after/webkit-ask-390.png) |
| Homepage | [PNG](../../results/search-segment/after/chromium-home-1024.png) | [PNG](../../results/search-segment/after/chromium-home-390.png) | [PNG](../../results/search-segment/after/webkit-home-1024.png) | [PNG](../../results/search-segment/after/webkit-home-390.png) |
| Homepage prototype | [PNG](../../results/search-segment/after/chromium-home-prototype-1024.png) | [PNG](../../results/search-segment/after/chromium-home-prototype-390.png) | [PNG](../../results/search-segment/after/webkit-home-prototype-1024.png) | [PNG](../../results/search-segment/after/webkit-home-prototype-390.png) |
| UI workbench | [PNG](../../results/search-segment/after/chromium-ui-workbench-1024.png) | [PNG](../../results/search-segment/after/chromium-ui-workbench-390.png) | [PNG](../../results/search-segment/after/webkit-ui-workbench-1024.png) | [PNG](../../results/search-segment/after/webkit-ui-workbench-390.png) |

`scripts/check_search_toolbar.mjs` follows the repository's standalone
Playwright check pattern. It serves local files through interception, toggles
Passages → Briefs → Passages → Briefs at every width in Chromium and WebKit,
and asserts identical bounding boxes for all four controls, whole labels,
equal control and segment-button heights, controls fitting inside the toolbar,
and no page overflow. Normal controls are 48px tall; at 200% root text size
they grow equally. JSON measurements are saved in `before/measurements.json`
and `after/measurements.json`. Run with `OPAX_PLAYWRIGHT_MODULE` and optional
`OPAX_CHROMIUM_PATH` / `OPAX_WEBKIT_PATH` for an existing machine installation;
`OPAX_TOOLBAR_WEBKIT=1` enables both engines. `OPAX_TOOLBAR_PHASE=before`
captures without enforcing the fixed layout; the default after phase asserts it.

`portal/test/search-toolbar.test.mjs` adds four Node regression tests covering
the shared no-wrap rule, status placement, identical summaries and pressed
states across mode changes (all, partial and zero briefs), loading state and
catalog-only results.

Validation with Node 24.21.0:

- `npm ci`, then `npm run build:search` before tests.
- `node --test test/*.test.mjs`: 1,026 passed, zero failed or skipped.
- Wrangler types and `npx tsc --noEmit`: passed.
- Search, social, grants map, analytics and voice deploy build steps: passed.
- Privacy, photo identity, asset stamping and stamp check: passed.
- Wrangler Worker bundle dry run: passed; deployment was not invoked.
- `git diff --check`: passed; `portal/public/votes.json` matches the base commit.

The host routes IPv4 loopback away from `lo`; the first suite run consequently
timed out in four unrelated local HTTP integration tests (1,022 passed).
The complete suite passed in a temporary user/network namespace with `lo`
enabled and no external network access. Wrangler used an existing runtime type
cache matching workerd 1.20260828.1, compatibility date 2026-09-01 and
`nodejs_compat`, then generated this worktree's binding types. Type declarations
are ignored local build output. Production configuration was not changed.

Asset stamps and the generated SPA shell are included so returning browsers
receive the corrected CSS and markup. Generated catalog and license churn was
discarded. No push, deployment or production writes were performed.
