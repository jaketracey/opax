# Division and voting-record tables

The web bill pages, sitting-week division lists and person voting records use
`portal/public/vote-tables.js`, shared by the Worker and browser. The tables use
the frozen DataTable contract without additions. The shared core and table API
are separate merge dependencies; this lane keeps the frozen core stub intact.

Division titles use the recorded stage plus date. Missing tallies remain unknown,
and party position is displayed only when explicitly supplied by the vote source.
Repeated bill counts retain the existing deduplication rule. Sitting-week records
with different IDs remain separate. Member lists, questions and party tallies are
linked from the primary cell to the division page.

SSR seeds the first page from the available exports. The config contains a server
source and no client-mode row set. Hidden crawlable tables on SPA pages keep
separate IDs and do not also hydrate. Browser search, facets, sorting, paging and
full filtered CSV use the following endpoints and fixed scope parameters:

| List | Endpoint | Scope parameters | URL state |
| --- | --- | --- | --- |
| Bill divisions | `/api/table/divisions` | `bill`: bill key | `dv.*` |
| Sitting-week divisions | `/api/table/divisions` | `jurisdiction`: `federal`, `start` and `end`: inclusive ISO dates | `dv.*` |
| Person votes | `/api/table/votes` | `person`: roster person ID, or canonical person slug when no ID exists | `vr.*` |

The API needs to enforce scope before applying query filters and CSV export.
Normalized division rows contain `title`, `date`, `chamber`, `outcome`, `ayes`,
`noes` and `href`; vote rows contain `title`, `date`, `vote`, `party_position` and
`href`. These are ordinary `Row` properties, not contract additions. The fixture
adapter uses the same projections in `portal/test/dt-votes-browser.mjs`.

Filtered URLs are shareable and noindex; canonical URLs omit table state. Local
fixtures never ship as an API route. `votes.json` is read without modification.
The donor privacy test needs no extension because this lane has no money tables.

Before screenshots are captured from the original web renderers. After screenshots
and measurements live in `portal/private/dt-votes/`, with bill, person and hub
views at 390 and 1280 pixels. `after-*` uses the frozen stub. `after-core-*` checks
integration against a local DT-core preview, with its source hash recorded in
`after-core-measurements.json`. Chrome runs headless in an isolated network
namespace; every request is served from disk or fixtures and non-local hosts are
blocked by both request interception and the resolver.

Run the browser check after `npm ci` and `npm run build:search`:

```sh
cd portal
unshare -rn sh -c 'ip link set lo up; OPAX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/dt-votes-browser.mjs'
```

Set `OPAX_DT_CORE_DIR` to a local directory containing `datatable.js` and
`datatable.css` to check the core integration before its merge. The runner reads
those files into memory and changes no core files. It covers source scoping,
hydration, phone cards, primary links, Status labels, search, facets, URL reload, sort,
paging and full CSV export.
