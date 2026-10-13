# Contracts and suppliers tables

The contracts hub at `/discover` uses server mode against D1
`/api/table/contracts`, including its SSR first page. The supplier directory uses
`/api/table/suppliers`. Supplier profiles use client mode at 2,000 source
contracts or fewer; larger profiles use the contracts endpoint with fixed
`supplier=<stable supplier id>`. Funding-profile links retain `donor=` through
SSR, hydration, filters, facets and CSV continuation.

The adapter uses the pass 5 description/title/counterpart rule, agency facets,
money values with the core's column-wide bars, start dates and initially hidden
CN ids. Its icon action opens an AusTender source notice or CN lookup. Undated
zero-value placeholders are omitted.

SSR retains procurement facts, agency links, coverage, latest-notice rules and
largest-notice details. Table queries stay outside canonical URLs and cause
noindex. Legacy contract queries migrate to `t.q`; unrelated parameters survive.
Supplier evidence, tax/charity, aliases and funding features follow main.

Batch 4 removes the rollout's recipient/donor privacy gates and tests, bound
identity subsets, registry fingerprints and build-time withholding. Procurement
rows use the published source records. Donor display and links follow main's
shared disclosure policy. The recipient classifier remains shared for display
and linking only.

`build:search` includes `build:tables`. Existing databases first apply
`0002_procurement_recipient.sql`, which adds the contract's supplier scope;
`0001_tables.sql` remains unchanged. Local Wrangler verification uses generated
SQL and local D1, with no production calls. Evidence is under
`portal/private/dt-contracts/`. No contract additions.
