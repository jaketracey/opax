# Contracts table rollout

The contracts hub is `/discover`, the existing Government contracts destination.
It uses server mode at `/api/table/contracts`. Supplier profiles use client rows
at 2,000 contracts or fewer; larger profiles use the same endpoint with the
fixed `supplier=<stable supplier id>` source parameter.

The shared adapter is `portal/public/contracts-table.js`, using the approved
DT-core implementation at `7a57261b4`. Procurement rows carry `title`, `agency`,
`amount`, `start_date` and `id`; CN ids are hidden initially. The primary title
uses the pass 5 description/title/counterpart rule. AusTender URLs are restricted
to the source domain, with keyword lookup when a direct notice is absent.
Undated zero-value placeholders remain omitted.

SSR retains the recorded totals, agency links, coverage, latest-notice rule and
largest-notice details. Table state never changes the canonical URL. URLs with
table state are noindex. Legacy `?contract=CN…` links become `t.q` searches.

Both modes register `privacy: 'donors'`, the shared `privacyCheck` and the optional
`rowPrivacyCheck`. The row hook validates procurement schema; the text hook uses
DT-core's `/api/table/privacy`, backed by the shared graph index with no office
holder exemptions. SSR and the local fixture use that same policy synchronously.
Withheld records retain only their summed amount and a deduplicated identity
count. The core generates “Donors not named (N)” and removes all identifying
fields, categories and actions. Identity counts are derived server-side; the
index and identity IDs never enter public payloads.

Value bars use DT-core's column-wide scale from the full matched amount range;
paging does not rescale them. The core hides bars on phones. It owns query
validation, URL state, actual downloads and the sanitized analytics events.
Supplier identity resolution and comparison selection preserve unrelated URL
parameters. Ignored table fields are checked against the same privacy hook.

Until DT-api merges, SSR reads the exported snapshot through ASSETS. The local
fixture in `portal/test/contracts-table-fixture.mjs` implements the GET endpoint
using the real core query/CSV functions, including supplier scope and the
50,000-row CSV cap. It is served by an isolated local proxy and is never routed
by the production Worker. All other routes, including privacy validation, use
actual `wrangler dev --local`.

`portal/test/contracts-table-browser.mjs` registers the supplier client table and
hub server table with `registerTablePrivacy` in the core's shared browser hook.
It checks guarded input, server rows/facets, actual CSV downloads, URL state,
rendered HTML, accessible text and analytics, including rejected searches and
facets. Screenshots and validation logs live in `portal/private/dt-contracts/`.

Contract addition: optional `rowPrivacyCheck` on `DataTableConfig`, matching the
DT-grants adapter pattern. The default donor-row classifier remains fail-closed.
