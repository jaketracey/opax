# DataTable D1 endpoint

`GET /api/table/<dataset>` reads `TABLE_DB` (`opax-tables`). Published source
exports feed the loader; `votes.json` remains unchanged. Table SQL and indexes
stay under ignored `portal/private/dt-api/sql/`, outside the asset directory.
Legacy `/table-index/*` requests return 404.

## Query and export

The endpoint accepts the core serializer's `q`, `f.<column>=["value",…]`,
`f.<numeric>={"min":…,"max":…}`, `sort=key:asc|desc`, `page` and `pageSize`.
A consistent optional URL-key prefix is accepted. Dataset column names are
allowlisted and SQL values are bound. Duplicate keys, malformed types, invalid
numeric bounds and excessive input lengths return fixed 400 JSON errors.
Page size is capped at 200. Search uses FTS5 token prefixes ANDed across terms.
Category facets exclude their own filter and return up to 100 values; numeric
facets use MIN/MAX. Row reads use LIMIT/OFFSET.

`format=csv` streams batches of 200 rows, up to 10,000 per response and 50,000
per logical export. CSV pages 1–5 select consecutive chunks, independently of
JSON page size. `Link` headers preserve filters and sorting. Partial responses
include a CSV range/count note and a continuation URL where available.
`X-Table-Total`, `X-Table-Exported`, `X-Table-Page`, `X-Table-Truncated` and
`X-Table-Export-Note` describe the response; `X-Table-Export-Truncated` indicates
a matching set exceeding 50,000. The client retains escaping and inert formula
handling, cancellation, scoped URL state, keyboard focus and retry behavior.

Responses use a versioned ETag, normalised Content-Location and a 60-second
public max-age. Filtered and CSV responses carry `X-Robots-Tag: noindex`.
Unsupported methods return 405; unknown datasets return 404; unavailable D1
returns a fixed 503 without database details.

## Disclosure names and links

There is no runtime donor privacy matcher, privacy mode, privacy POST endpoint,
identity hash registry, fingerprint binding or fingerprint-mismatch reload trap.
The loader publishes names and values from the disclosure exports without
withholding or anonymous aggregate rows. Donor identity resolution remains a
data-quality step, separate from what the disclosure source says.

`money-connections` and `party-money` include `return_reference`, `from_href`
and `to_href`. These are computed output fields, excluded from SQL schema,
SELECTs, facets and sorting. They require no new D1 columns or reload gate.
The API enriches rows from `/graph/donor-index.json` by jurisdiction and name. The index also includes
source-backed identities referenced beyond the bounded maps. Source-only hints
carry their original record reference, no monetary claim and no profile link.
Missing enrichment metadata leaves names visible with no guessed identity link
and supplies the source register, return category and period for receipts.

Only exact or curated matches at confidence 1 carry the existing profile link.
An uncertain match shows the original disclosure spelling as plain text and
its return type, year and source return/transaction identifier or URL. A shared
ambiguous spelling never chooses a profile by iteration order. JSON, rendered
tables and CSV follow the same rule. Source-published redactions remain source
values; OPAX no longer creates donor name placeholders.

## Schema and loading

`scripts/table-schema.mjs` generates the schema from
`portal/src/table-datasets.mjs`. Hyphens become underscores in table names.
Each dataset has a typed `table_<dataset>` table with unique id, stable INTEGER
rowid and search text; B-tree sort/facet indexes; an FTS5 unicode61 index with
1/2/3-character prefixes; and an indexed category facet table. Array categories
have one entry per value. `table_meta.version` is the cache identity; no privacy
fingerprint, stripped lengths or private identity publication is written/read.
Historical private-identity migration objects are unused and need no destructive
migration to remove the runtime dependency.

`npm run build:tables` prepares batched SQL plus a manifest under
`portal/private/dt-api/sql/`. Preparation is repeatable; application replaces
rows, facets and FTS content. The version is written last. Run a data reload to
publish refreshed disclosure names, as for any data update; its completion is
not a code/registry synchronisation requirement. The production loader is not
invoked by this change's local validation.

## Validation

`table-api.test.mjs` covers paging, sorting, search, facets, query validation,
conditional caching and all five CSV continuation pages. `dt-votes-api` and
core vote suites preserve alias IDs, source schema, search and filters.
`donor-disclosure.test.mjs` exercises uncertain/confident links across money
surfaces, legacy SQL compatibility without privacy metadata, and zero generated
donor placeholders in built output. Optional browser runners retain interaction,
responsive layout, hydration and actual CSV coverage without donor matcher gates.
