# DataTable core

The implementation uses the frozen contract in `datatable.contract.md` and
`portal/public/datatable.d.ts`, with no contract additions. It is a dependency-free
ES module shared by Worker SSR and browser hydration. Import `datatable.css` alongside
the design-system tokens; it uses one money accent, sentence-case controls and token
roles for colour, typography, spacing, borders and sizes.

`dataTableHTML(config, page)` renders a real captioned table, controls, the supplied
page and a safely escaped JSON hydration payload. Mount either its enclosing section,
the table itself or a containing element with `mountDataTable(element, config)`.
The returned `destroy()` removes listeners, timers, requests and robots ownership.
The page handler owns the canonical link and initial HTTP/head robots metadata:
keep the canonical free of the table's query parameters and mark an incoming nonempty
parsed query noindex. Hydration maintains noindex, preserves existing robots directives
and unrelated URL parameters, and cleans the table prefix from an existing canonical.
Several tables can share a document without clearing each other's noindex state.

Client mode filters and sorts the complete input before paging. Facets count values
with their own filter excluded, so multi-value choices remain available. Category
columns that become constant move into chips; removing a constant chip reveals its
column. Removing selected search/range/category chips clears that filter. Clear all
clears search and filters. Density and column choices are local display preferences;
the frozen Query type carries search, filters, sort and pagination only. Constant
server columns depend on full-result facet metadata, never a single page's rows.
Phone cards retain table semantics and include a visible sort control.

Server mode sends GET requests to `source.endpoint`, preserving endpoint parameters
and adding `source.params` and the unprefixed `serializeQuery(query)` parameters,
including the configured default sort and page size when the query omits them.
Its first SSR page stays visible during fetching. An aborted or older response cannot
replace a newer query. Failures show a generic retry state. CSV requests use the same
filters/sort plus `format=csv`, without page or page-size parameters. The endpoint owns the full
filtered export and its 50,000-row cap. Client exports cover every filtered row, even
when only one page or some columns are visible, and use underlying exact values.
CSV fields quote delimiters/newlines and protect string fields from formula execution.

Donor privacy is opt-in via `privacy: 'donors'`. Every naming surface uses the shared,
fail-closed organisation gate. Rows can be graph nodes (`label`, `aliases`), nested
donor nodes (`donor`) or flattened rows (`donorName`, `donor_name`, `donor`, `label`,
`name`, with optional aliases). Unsafe rows are excluded before search, facets,
sorting, paging, SSR and CSV. A server page containing unsafe rows loses its untrusted
aggregate facets. Donor facet values are separately checked. Client URL state removes
withheld labels, aliases and phrases derived from input rows. The server money
endpoint must enforce the complete donor index and never echo withheld queries;
server-mode free text is only reflected in HTML/URL state when public results
substantiate it. This conservatively removes unverified empty searches from money
URL state. A neutral removable chip and Clear all remain available, and the
active filtered view stays noindex. Other table types retain ordinary empty searches. Analytics emit only
`{table_id, page_type}` via `opax:analytics`; the shared allowlist accepts the three
contract events without adding route or query properties.

## Size decision

Measured with esbuild 0.28.2, full exported ESM bundles, ES2022, neutral platform,
minification, no legal comments, and gzip level 9. KB means 1,000 bytes.

| Module | Minified bytes | Gzip bytes | Gzip KB |
| --- | ---: | ---: | ---: |
| In-house core, SSR, hydration and donor privacy | 24,315 | 9,328 | 9.33 |
| TanStack table-core 9.2.8, including its store dependency | 113,528 | 30,087 | 30.09 |

Keep the in-house module: it is smaller and shares direct query/HTML functions
between the Worker and browser without an adapter or store. TanStack is headless
and would still need the contract's SSR, controls, URL, privacy and export code.
These are complete-module measurements, not a prediction of a selected-feature
TanStack adapter's final bundle. See the [official TanStack overview](https://tanstack.com/table/latest/docs/overview).
Reproduce with `DT_BROWSER_TOOLS=/tmp/opax-dt-tools node test/datatable-size.mjs`
from `portal/`, after installing the comparison package outside this worktree.
No TanStack or browser-test dependency is added to the portal.

## Offline workbench and checks

Open `/datatable-workbench.html`. Default, filtered, empty and server examples use
only fictional organisation records; the server example stubs `window.fetch` for
`/__fixtures/table/receipts`. It never calls a production API or loads analytics SDKs.
Rebuild its static SSR and snapshot with `node test/build-datatable-workbench.mjs`.
The regular gate includes `test/datatable.test.mjs` (pure functions and a DOM-free
SSR snapshot) and the derived money-table cases in `test/donor-privacy.test.mjs`.

Install `playwright-core` outside the worktree and point `DT_BROWSER_TOOLS` at its
package directory. Run Chrome in the required isolated network namespace:

```sh
unshare -rn sh -c 'ip link set lo up; DT_BROWSER_TOOLS=/tmp/opax-dt-tools node test/datatable-browser.mjs'
```

The browser runner starts and closes its own loopback asset server and Chrome. It
blocks every non-local request and also disables external hostname resolution.
It verifies sorting, focus, search, facet/range removal, paging and live-region node
identity, density, visibility, URL/canonical/multiple-table noindex ownership, exact
client/server downloads, event payloads, fetch parameters, failure/retry, stale
response suppression, and phone cards. Screenshots and JSON results stay in the
ignored `portal/private/dt-core/` directory:

- `default-390.png`, `filtered-390.png`, `empty-390.png`, `server-390.png`
- `default-1280.png`, `filtered-1280.png`, `empty-1280.png`, `server-1280.png`
- `error-1280.png`, `browser-results.json`, `sizes.json`

Validation for this lane: the full Node suite passed 1,240 tests; the final targeted
run passed 30 checks, including 13 core tests. The derived table privacy cases
passed in both modes. TypeScript, `npm run check`, and the Wrangler deployment
dry run passed. Chrome completed the interaction checks with no page errors.
`votes.json` remains byte-identical to the contract branch.
