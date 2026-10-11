# Contracts and suppliers tables

Approved DT-core `7a57261b4` and DT-api `85a3c7298` are merged. The contracts hub
at `/discover` uses server mode against D1 `/api/table/contracts`, including
its SSR first page. The supplier directory uses `/api/table/suppliers`.
Supplier profiles use client mode at 2,000 source contracts or fewer; larger
profiles use the contracts endpoint with fixed `supplier=<stable supplier id>`.
Main `5bb219592cc45cd1a6d2663179674ea916dc82e7`, including donor-withhold,
is merged. All query state uses the core's shared validator, including hidden
fields, repeated keys and numeric bounds. D1 enforces the registry fingerprint.

The contracts adapter uses the pass 5 description/title/counterpart rule,
agency facets, money values with column-wide bars, start dates and initially
hidden CN ids. Its icon action opens an AusTender source notice or CN lookup.
Undated zero-value placeholders remain omitted. Paging keeps the same bar scale;
phones hide bars through the core's design-system CSS.

SSR keeps procurement facts, agency links, coverage, latest-notice rules and
largest-notice details. Table queries remain outside canonical URLs and cause
noindex. Legacy contract queries migrate to `t.q`; unrelated URL parameters
survive. A rejected initial parameter keeps zero rows and disables downloads
through hydration until the reader changes or clears the query.

Supplier pages retain source aliases, evidence, tax/charity and permitted funding
features. For donor-withheld entities, political-money blocks, donor links,
donor aliases and political-money notes are suppressed. Unsafe optional identity
fields are withheld individually; the organisation and its procurement remain
public independently of donor classification. Individual/person/sole-trader
kinds and ABN type `IND` override organisation-looking names. Recipient labels,
aliases, legal names and ABNs are collected by the shared build-time source loader.
Withheld award values remain in neutral “Donors not named (N)” aggregates without
identities, categories or actions.

Both adapters register `privacyCheck` and `rowPrivacyCheck`. Query validation
uses the complete shared hashed registry. The optional `dataPrivacyCheck` uses
the recipient policy for procurement data, facets and exports; it defaults to
`privacyCheck` for existing tables. Data approval never approves query state.
The same registry carries recipient and donor scopes, withheld supplier IDs,
and IDs of suppliers whose original identities withhold political information.
Those IDs preserve that decision when publication removes unsafe aliases. Only
hashes and matching metadata are published; raw source identities stay in memory.
Recipient publication preserves complete official names from the public agency
directory when a short private alias also occurs as an ordinary agency-name word.
Other fields are checked independently; this does not change query rejection.
Optional hashed lookup selectors keep large CSV validation from constructing
every candidate substring. Older registries retain the original matching path.

`build:search` includes `build:tables`. The local-only SQL application helper
loads the sanitised output into D1. Existing databases first apply
`0002_procurement_recipient.sql`; `0001_tables.sql` retains main's original schema.
The upgrade test preserves existing records and compares all dataset schemas
and indexes with a fresh database. The Chrome gate runs directly against
Wrangler, with non-local hosts blocked and no fixture endpoint substitution.
Shared privacy registrations cover actual client input, D1 responses/facets,
downloaded CSV, URL state, rendered and accessible text, and analytics. Additional
checks cover complete supplier profiles and initial rejected hidden facets.
The browser audit checks all derived donor-matched supplier profiles. A separate
local D1 sweep checks the loaded financial rows and facets against their scopes.
Profile DOM probes resolve only the map renderer's exact shortened labels from
that profile's verified agency entries back to their complete official names;
all other text and attributes retain the recipient checks.
Screenshots and verification logs are under `portal/private/dt-contracts/`.

Optional contract additions are `rowPrivacyCheck` and `dataPrivacyCheck`.
