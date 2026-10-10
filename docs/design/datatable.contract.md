# DataTable contract (frozen 10 Oct 2026)

Every OPAX web table is built on this contract: the core (`portal/public/datatable.js`), the server endpoint (`/api/table/<dataset>`), and each rollout lane. Changing it needs the orchestrator's sign-off. Add optional fields only; never rename or remove one.

## Modules
- `portal/public/datatable.js`: an ES module shared by the Worker (SSR) and the browser.
  - **Exports:** `dataTableHTML(config, page)`, `mountDataTable(el, config)`, `applyQuery(rows, config, query)`, `toCSV(rows, config)`, `parseQuery(urlSearchParams, urlKey)`, `serializeQuery(query, urlKey)` and `formatCell(value, column)`.
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
  align?: 'start' | 'end';     // default end for money/count/year
  bar?: boolean;               // inline scale bar in numeric cells
  hideWhenConstant?: boolean;  // default true for category: hidden column, value shown as a facet chip
  format?: 'compact' | 'exact';// money/count display; tooltip + CSV always exact
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
  privacy?: 'donors';            // money tables: rows/facets/CSV/URL pass isOrganisationDonor (portal/public/donor-entity.js)
}
type Row = Record<string, unknown>;
```

## Behaviour (both modes)
- **SSR:** `dataTableHTML(config, page)` returns a real `<table>` with a `<caption>`, a toolbar and the first page of rows. It has no loading text. Its canonical URL ignores table state (filtered views are shareable, but `noindex` when the query isn't empty).
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
- **Money datasets** enforce `isOrganisationDonor` server-side. A withheld donor never appears in rows, facets, the CSV or echoed query values. A query naming one returns zero rows, with no echo.
- **Caching:** responses are cached by the normalised query; there are no production writes.

## Privacy regression (blocking)
The shared derived test, `portal/test/donor-privacy.test.mjs`, covers every table in every mode. That includes the rows, facets, CSV and URL state of each.

## Optional recipient privacy fields

- `DataTableConfig.rowPrivacyCheck?` is a synchronous `(row: Row) => boolean` organisation policy for money rows. True means public; exceptions and non-boolean results fail closed. Without it the donor label policy applies. Grants use the shared recipient classifier with all source entity kinds and ABN types retained. Text validation remains separate and must use the withheld index.
- Neutral rows can carry optional `aggregate.subject: 'recipients'` alongside `aggregate: {kind: 'individual-donors', count: number}`. The core generates fixed `Recipients (N, names withheld)` wording, retains only configured numeric values and removes IDs, aliases, categories and links. Other subject values are discarded. The default donor wording remains unchanged.

## Additive privacy and endpoint notes (review follow-up)

- `DataTableConfig.privacyCheck?` accepts `(text: string) => boolean | Promise<boolean>`; true means safe against the shared withheld index, independently of table rows. SSR and `applyQuery` require a synchronous predicate; absent or asynchronous validation fails closed for searches. Worker renderers use `await tablePrivacyCheck(env.ASSETS)` from `src/table-privacy.ts`, which derives the shared graph index using `withheldPhrases` with no donor-context office-holder exemptions. Browser hydration defaults to the read-only, no-store `POST /api/table/privacy` validator and waits before reflecting state. Do not send the index or withheld names to the browser. A custom validator must use that same shared index; an organisation-only input is insufficient.
- A row may optionally carry `aggregate: {kind: 'individual-donors', count: number}`. Counts must be nonnegative safe integers. For this neutral aggregate the core generates `Individual donors (N)` in the primary/name column and keeps only configured numeric counts/totals; it removes identifying fields, aliases, IDs, categories and links/actions. Money rollouts must emit this shape, rather than a donor-shaped text label, to retain anonymous totals in HTML and CSV.
- An omitted `urlKey` uses unprefixed `q`, `f.<facet>`, `sort`, `page` and `pageSize`, with the same popstate/canonical/noindex behavior. Only recognized table parameters are removed; unrelated parameters survive.
- Server CSV cap is an endpoint boundary obligation. With 50,001 matching rows, return exactly the first 50,000 data records, then the separate final CSV record `# Export truncated at 50,000 rows.`, and the response header `x-table-export-truncated: true`. The core announces a fixed truncation message after the download. dt-api must register `registerServerCSVContract` from `portal/test/datatable-endpoint-contract.mjs` with its real handler and seeded dataset before server rollouts; the core's reference endpoint test cannot certify dt-api.
- Every rollout registers `registerTablePrivacy` from `portal/test/datatable-privacy.mjs` in its local Chrome gate. The registration names its actual public input module, table host, secondary facet and server example/endpoint. The hook derives withheld values at run time and asserts public client input, server responses, actual downloaded files, URL state, rendered and accessible text, and analytics in both modes. Core registration lives in `portal/test/datatable-browser.mjs`.
