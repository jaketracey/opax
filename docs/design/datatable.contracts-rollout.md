# Contracts table rollout

The contracts hub is `/discover`, the existing Government contracts destination.
It uses server mode at `/api/table/contracts`. Supplier profiles use client rows
at 2,000 contracts or fewer; larger profiles use the same endpoint with the
fixed `supplier=<stable supplier id>` source parameter.

The shared adapter is `portal/public/contracts-table.js`. It uses the frozen
DataTable exports and types without adding fields to the contract. Procurement
rows carry `title`, `agency`, `amount`, `start_date` and `id`; CN ids are hidden
initially. The primary title uses the pass 5 description/title/counterpart rule.
AusTender URLs are restricted to the source domain, with keyword lookup when a
direct notice is absent. Undated zero-value placeholders remain omitted.

SSR retains the recorded totals, agency links, coverage, latest-notice rule and
largest-notice details. Table state never changes the canonical URL. URLs with
table state are noindex. Legacy `?contract=CN…` links become `t.q` searches.

The existing donor matcher guards rows before paging, facets or CSV. A first-word
index limits candidates while preserving that matcher's organisation and office
holder exceptions. The index is server/build only. Browser searches are checked
by the table endpoint before the shared core can persist them; zero-result text
is removed from URL state and leaves an empty view and CSV.

Until DT-api merges, SSR reads the exported snapshot through ASSETS. The local
fixture in `portal/test/contracts-table-fixture.mjs` implements the GET endpoint,
including supplier scope, query state, facets, paging and the 50,000-row CSV cap.
It is used by the isolated local screenshot proxy and is never routed by the
production Worker.

The frozen branch's `datatable.js` is a stub. After screenshots and browser
interaction checks use a temporary snapshot of DT-core's `datatable.js` and CSS;
those shared files are not included in this lane's commit. Screenshots, capture
metadata and validation logs live in `portal/private/dt-contracts/`.
