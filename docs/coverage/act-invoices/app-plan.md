# ACT invoice app plan

Plan only. No app files, native builds, simulator runs or app API changes in this lane.

After independent review, promotion and verified web delivery, start with an
in-app web link to `/register/act-invoices`. A later native table can use the same
paged `/api/table/act-invoices` contract and source receipt. Keep Supplier, Date
and Amount visible on a phone, dates on one line, and a bounded CSV export.

Reuse the reporting-entity, payment-month/financial-year and amount filters.
Search only description and reporting entity. Supplier names and ABNs stay
unlinked inside their source records: no profiles, identity nodes, filter values,
search entities or joins. Do not add invoice rows to supplier screens or graphs.
Public bodies may link only on an exact existing agency-name match; this lane
creates no agency links.

Show ACT Government, dataset `kzmf-7uhp`, source URL, snapshot and CC BY 4.0 on the
record block. Explain the $25,000 invoice-value threshold, paid-invoice grain,
received-date caveats, changed reporting entities and missing values. Row IDs
identify a snapshot record, never a unique invoice. Retain source duplicates and
pre-start dates. No computed spending totals or claim of all ACT spending.

Nightly acquisition/promotion remains off. The reviewed D1 receipt is required
before the table is available; a future app must handle 404 and 503 explicitly.
`votes.json` remains schema 1 and both votes/pay exports stay byte-identical.
