# Contracts and suppliers tables

Approved DT-core `7a57261b4` and DT-api `85a3c7298` are merged. The contracts hub
at `/discover` uses server mode against D1 `/api/table/contracts`, including
its SSR first page. The supplier directory uses `/api/table/suppliers`.
Supplier profiles use client mode at 2,000 source contracts or fewer; larger
profiles use the contracts endpoint with fixed `supplier=<stable supplier id>`.

The contracts adapter uses the pass 5 description/title/counterpart rule,
agency facets, money values with column-wide bars, start dates and initially
hidden CN ids. Its icon action opens an AusTender source notice or CN lookup.
Undated zero-value placeholders remain omitted. Paging keeps the same bar scale;
phones hide bars through the core's design-system CSS.

SSR keeps procurement facts, agency links, coverage, latest-notice rules and
largest-notice details. Table queries remain outside canonical URLs and cause
noindex. Legacy contract queries migrate to `t.q`; unrelated URL parameters
survive. A rejected initial parameter keeps zero rows and header-only exports
through hydration until the reader changes or clears the query.

Supplier pages contain procurement records, without donation blocks, donor
links, donor aliases or political-money notes. Organisation procurement remains
public independently of donor classification. Individual/person/sole-trader
kinds and ABN type `IND` override organisation-looking names. Recipient labels,
aliases, legal names and ABNs come from supplier and grant profiles at runtime.
Withheld award values remain in neutral “Donors not named (N)” aggregates without
identities, categories or actions.

Both adapters register `privacyCheck` and `rowPrivacyCheck`. Query validation
uses the combined donor/recipient index. The optional `dataPrivacyCheck` uses
the recipient policy for procurement data, facets and exports; it defaults to
`privacyCheck` for existing tables. Data approval never approves query state.
Neither privacy index enters public assets or payloads.

`build:search` includes `build:tables`. The local-only SQL application helper
loads the sanitised output into D1. The Chrome gate runs directly against
Wrangler, with non-local hosts blocked and no fixture endpoint substitution.
Shared privacy registrations cover actual client input, D1 responses/facets,
downloaded CSV, URL state, rendered and accessible text, and analytics. Additional
checks cover complete supplier profiles and initial rejected hidden facets.
Screenshots and verification logs are under `portal/private/dt-contracts/`.

Optional contract additions are `rowPrivacyCheck` and `dataPrivacyCheck`.
