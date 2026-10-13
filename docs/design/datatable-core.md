# DataTable core

The dependency-free ES module serves Worker SSR and browser hydration. Import
`datatable.css` alongside the design-system tokens and served `fonts.css`. The
implementation uses the same query grammar and optional
neutral `aggregate` row metadata; the original exports and fields remain.

`dataTableHTML(config, page)` emits a real captioned table and escaped hydration
payload. `mountDataTable` accepts its section, table or container; `destroy()`
removes listeners, timers, requests and robots ownership. Queries use the optional
prefix or unprefixed parameters. Only recognised table parameters are removed
from the URL and canonical, preserving unrelated parameters and other tables.
Page handlers must also set canonical/noindex metadata for incoming SSR state.

The toolbar keeps search and export visible and groups facets, column choices and
density inside Filters. Desktop uses one row; phones use search, Filters/export,
then sort. Facets exclude their own selection from counts and remain present and
focused when their column becomes constant. Chips remove applied state; constant
chips reveal hidden columns. Row menus have deterministic distinct identities;
Escape closes the nearest disclosure and returns focus, and redraws close row
menus. Sort/disclosure controls use the design-system stroke SVGs. Desktop bars
have a track and a visible zero-to-maximum scale; phone cards omit the bars and
use consistently aligned label/value fields. Pagination has a visible Rows per
page label and disabled buttons with token-based styling and no hover response.

Client inputs are immutable for the duration of a mount. Searchable row text is
normalised once and cached; queries are normalised once per evaluation. One pass
computes matching rows and facets, with a bounded result cache reused by paging,
constant detection, scales and export. Already validated state avoids a second
redraw. Server requests preserve endpoint/configured parameters and add the
unprefixed serialised query, default sort and page size. Aborts and revision checks
prevent stale responses replacing current state. Errors expose generic retry text.
CSV exports use exact underlying values, RFC 4180 quoting and formula protection.
Analytics contain `{table_id, page_type}` only.

## Donor rollout requirements

Tables validate types, length, numeric bounds and duplicate query keys. They do
not run a donor privacy matcher, request a private registry, or POST validation
to the Worker. Client and server queries share the serializer and query engine.
Donor adapters preserve disclosure spelling and return references, with profile
links supplied only by confident match evidence. See [API](datatable.api.md).

## Size and measurements

Full exported ESM bundles, esbuild 0.28.2, ES2022, neutral platform, minification,
no legal comments, gzip level 9; KB means 1,000 bytes:

| Module | Minified bytes | Gzip bytes | Gzip KB |
| --- | ---: | ---: | ---: |
| In-house core, SSR, hydration and privacy | 27,932 | 10,558 | 10.56 |
| TanStack table-core 9.2.8 with its store | 113,528 | 30,087 | 30.09 |

Keep the in-house core. TanStack still needs SSR, controls, URL, privacy and export
adapters. Reproduce with `DT_BROWSER_TOOLS=/tmp/opax-dt-tools node test/datatable-size.mjs`.
Browser measurements include a 2,000-row hydration and ten filter/redraw samples;
raw samples and summary statistics are in `private/dt-core/timings.json` and the
browser results. Compare both idle and concurrent-gate timings; CPU contention
can increase wall time while pure filtering remains cached.

## Local validation

Build generated assets with `npm run build:search` before the full Node gate.
Rebuild the workbench and DOM-free SSR snapshot with
`node test/build-datatable-workbench.mjs`. The workbench uses fictional organisation
records and stubs only its receipt endpoint. Its validator uses the local Worker;
no production services or analytics SDKs are called.

Run the Chrome gate from `portal/` with Playwright installed outside the worktree:

```sh
unshare -rn sh -c 'ip link set lo up; DT_BROWSER_TOOLS=/tmp/opax-dt-tools node test/datatable-browser.mjs'
```

The runner starts Wrangler with local bindings, stops only its own child process,
blocks non-local browser hosts and checks served fonts. Screenshots of default,
filtered, empty and server views at 390 and 1280, downloaded CSVs, timings and logs
are kept in the ignored `portal/private/dt-core/` directory. The regular gates are
the full `node --test test/*.test.mjs`, `npm run check`, TypeScript and
`npx wrangler deploy --dry-run`. `votes.json` must remain byte-identical.

Final review gates: 1,249 full-suite tests and 28 focused checks passed; check,
TypeScript and Wrangler dry-run passed. The final 2,000-row Chrome fixture measured
59.7 ms hydration, 30.8–72.2 ms filtering with redraw
(median 46.9 ms), and 0.7 ms median pure filtering.
All eight Wrangler screenshots passed with both fonts loaded, no page errors and
no external browser requests. votes.json is byte-identical to the contract branch.
