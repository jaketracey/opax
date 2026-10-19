# DataTable contract (frozen 10 Oct 2026)

Every OPAX web table is built on this contract: the core (`portal/public/datatable.js`), the server endpoint (`/api/table/<dataset>`), and each rollout lane. Changing it needs the orchestrator's sign-off. Add optional fields only; never rename or remove one.

## Modules
- `portal/public/datatable.js`: an ES module shared by the Worker (SSR) and the browser.
  - **Exports:** `dataTableHTML(config, page, requestURL?)`, `guardTableURL(config, requestURL)`, `mountDataTable(el, config)`, `applyQuery(rows, config, query)`, `toCSV(rows, config)`, `parseQuery(urlSearchParams, urlKey)`, `serializeQuery(query, urlKey)` and `formatCell(value, column)`.
- `portal/public/datatable.d.ts`: the types below.
- `portal/public/datatable.css`: the styles, on the design-system tokens only (no raw values, no uppercase).

## Types
```ts
type ColumnType = 'text' | 'category' | 'money' | 'count' | 'year' | 'date';
interface Column {
  key: string;                 // property on the row
  label: string;               // header text (sentence case, no redundant words)
  type: ColumnType;
  sortable?: boolean;          // default true for money/count/year/date/text
  facet?: 'chips' | 'multi' | 'range' | null;   // category→chips|multi, money/count/year→range
  facetOptions?: string[];     // optional valid choices retained with zero matches
  align?: 'start' | 'end';     // default end for money/count/year
  bar?: boolean;               // inline scale bar in numeric cells
  hideWhenConstant?: boolean;  // default true for category: hidden column, value shown as a facet chip
  format?: 'compact' | 'exact';// money/count display; tooltip + CSV always exact
  href?: (row: Row) => string | null; // optional link on a non-primary cell
  primary?: boolean;           // the cell that carries primaryLink
}
interface Action { icon: string; label: string; href: (row: Row) => string | null }
interface Query {
  q?: string;                               // free text
  filters?: Record<string, string[] | { min?: number; max?: number }>;
  sort?: { key: string; dir: 'asc' | 'desc' };
  page?: number;                            // 1-based
  pageSize?: number;
}
interface Page { rows: Row[]; total: number; page: number; pageSize: number;
                 facets?: Record<string, { value: string; count: number }[] | { min: number; max: number }> }
interface DataTableConfig {
  id: string;                    // unique per page; analytics table_id
  caption: string;               // visible caption / accessible name
  columns: Column[];
  rows?: Row[];                  // client mode
  source?: { endpoint: string; params?: Record<string, string> };   // server mode: GET endpoint?{serializeQuery}
  pageSize?: number;             // default 50
  defaultSort?: Query['sort'];
  primaryLink?: (row: Row) => string | null;
  actions?: Action[];            // rendered as one compact icon button + menu per row
  export?: { filename: string } | false;   // CSV of the FILTERED view, exact values
  urlKey?: string;               // query-string prefix, e.g. 't' → t.q, t.f.party, t.sort, t.page
  density?: 'comfortable' | 'compact';
  columnsVisible?: string[];
  pageType: string;              // analytics page_type
}
type Row = Record<string, unknown>;
```

## Behaviour (both modes)
- **SSR:** `dataTableHTML(config, page)` returns a real `<table>` with a `<caption>`, a toolbar and the first page of rows. It has no loading text unless the page is pending (below). Its canonical URL ignores table state (filtered views are shareable, but `noindex` when the query isn't empty).
- **Loading, empty, error (19 Oct 2026):** a page with no rows yet is `pendingPage(config)` (or no server page at all in server mode). Until a request answers, the body holds the shared animal loader (`[data-dt-loader]`, drawn by `mountTableLoaders` from `wombat.js`, `aria-hidden`), the region is `aria-busy="true"`, and the live count reads `config.loadingLabel` or "Loading <caption>". "No results" appears only after a finished request returns zero rows. A failed request shows its own alert with "Try again" ("Table unavailable" in the count), except a failed hydration check of server-drawn rows, which keeps them. A refetch keeps the rows it has, dimmed (`data-dt-stale` while `aria-busy`); with no rows to keep it waits on the loader. A superseded request is aborted and its late answer ignored.
- **Hydration:** `mountDataTable` adds sorting (`aria-sort`), search, facets (removable chips plus "Clear all"), paging ("Showing 1–50 of 1,159", announced in a live region), density, column visibility and CSV export. The state lives in the URL under `urlKey`.
- **Formatting:** tabular numerals; money is compact ($35.4bn) with the exact value in `title` and in the CSV; counts carry thousands separators; dates are "19 Aug 2026".
- **Phones** (under 600 px): rows become stacked cards with the `primary` cell and the first money or count cell prominent.
- **Analytics:** `table_sort`, `table_filter` and `table_export` events with `{table_id, page_type}` only. Never row values.
- **Client mode** handles at most about 2,000 rows (about 300 KB of JSON). Above that, use server mode.

## Server mode: `/api/table/<dataset>`
- `GET /api/table/<dataset>?<serializeQuery(query)>` returns `Page` as JSON. `&format=csv` returns the full filtered CSV, capped at 50,000 rows.
- **Datasets:**
  - `money-connections`;
  - `contracts`;
  - `suppliers`;
  - `grants`;
  - `divisions`;
  - `votes`;
  - `instruments`;
  - `audit-reports`;
  - `interests`;
  - `party-money`.
- **Money datasets** publish disclosure names and return references. Only confident identity matches carry profile links.
- **Caching:** responses are cached by the normalised query; there are no production writes.

## Disclosure regression
`portal/test/donor-disclosure.test.mjs` covers confident and uncertain names across money surfaces. Core and endpoint suites retain validation, facets, search, CSV and URL-state checks.

## Disclosure and query validation (13 October 2026)

Privacy modes, row/text matcher callbacks, the shared hash registry and the
privacy validation endpoint have been removed. The core keeps input type and
length validation, numeric bounds, duplicate-key handling, escaping, inert CSV
formulas, scoped URLs and fetch cancellation. Votes and divisions retain their
search and facets; `votes.json` remains schema 1.

Donor names are disclosure strings. Confident exact/curated matches retain their
profile links. Uncertain matches show a plain-text name and return reference.
The monetary API's reference and href fields are computed from published donor
metadata; they add no D1 column or fingerprint requirement. See
[API contract](datatable.api.md).
