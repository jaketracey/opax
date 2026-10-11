# DataTable D1 endpoint

`GET /api/table/<dataset>` reads `TABLE_DB` (`opax-tables`). The frozen
DataTable declarations are unchanged; the contract has an additive CSV
continuation clarification. No table data or indexes
are uploaded as static assets. Legacy `/table-index/*` requests return 404 and
the asset ignore file excludes that directory even if an old build recreates it.
Existing source exports remain the loader's input; `votes.json` is untouched.

## Query and export

The endpoint accepts the shared core's `serializeQuery` output: `q`,
`f.<column>=["value",…]`, `f.<numeric>={"min":…,"max":…}`, `sort=key:asc|desc`,
`page` and `pageSize`. A consistent optional URL-key prefix is accepted.
Identifiers are validated against the dataset schema; SQL values are bound.
Page size is capped at 200. Search uses FTS5 token prefixes, ANDed across terms.
Category facets exclude their own filter and return the 100 most frequent
values; numeric facets use SQL MIN/MAX. Every row read uses LIMIT/OFFSET.

`format=csv` streams batches of 200 rows, up to 10,000 per response, preserving
underlying numeric values. The complete filtered export still has a 50,000-row
ceiling. CSV `page=1` through `page=5` selects successive chunks; the fixed CSV
page size is independent of JSON `pageSize`. `Link` headers supply next/previous
URLs preserving filters and sort. Each partial response ends with a CSV record
showing its range and full matching count, the logical ceiling when applicable,
and a next URL when available. `X-Table-Total`, `X-Table-Exported`, `X-Table-Page`,
`X-Table-Truncated` and `X-Table-Export-Note` describe that response.
`X-Table-Export-Truncated` is true only when the matching set exceeds 50,000,
keeping core round two's existing ceiling message accurate.
Its shared privacy assertion is used
for all five financial datasets, extended with recipient/supplier identities
and ABNs. Its CSV endpoint registration runs against this actual D1 handler;
optional test-helper note and chunk-size overrides check the exact-total trailer.
No public core module is replaced here. The query integration test imports the
merged core module, or its query exports while this branch carries the stub;
it was also run against the round-two module at `7a57261b`.

Responses have a versioned ETag and a 60-second public max-age. Money datasets
omit Content-Location; other datasets use normalised Content-Location.
Filtered and CSV responses include `X-Robots-Tag: noindex` on
production as well as staging. Errors are fixed JSON without internal details.

## Schema

`portal/table-migrations/0001_tables.sql` is generated from
`scripts/table-schema.mjs` and `portal/src/table-datasets.mjs`.
Each of the ten datasets has:

- `table_<dataset>`: INTEGER rowid, unique TEXT id, typed public columns
  (REAL money, INTEGER counts/years, TEXT dates/text/categories) and search text.
- A B-tree index for each facet/sort column, with rowid for stable ordering.
- `table_<dataset>_fts`: FTS5 unicode61 index with 1/2/3-character prefix indexes,
  linked to the typed table; the loader rebuilds it after inserting public rows.
- `table_<dataset>_facets`: indexed `(key,value,rowid)` plus `(rowid,key,value)`;
  arrays such as portfolios have one entry per category value.

Hyphens become underscores in SQL names. `table_meta` holds version and
privacy phrase lengths. `table_private_identity` holds only SHA-256 hashes and
phrase lengths, indexed by hash; it never contains plaintext identities.

## Privacy

The loader reads every donor graph, supplier summary/profile and federal/QLD
recipient summary/profile. Donors pass `isOrganisationDonor`; recipients and
suppliers use kind and ABR entity type first, with individual/sole-trader
classification overriding names, then fail-closed organisation evidence.
Labels, aliases, legal names, person IDs and ABNs form a shared rejection set.
A second scan checks all fields of each financial row, including descriptions
and links. A denied row's value is retained only in a neutral dataset/jurisdiction
aggregate (also grouped by flow type for money), with no original identity,
ABN, alias or link. Non-additive aggregate fields are null. Named rows retain
exact source values; aggregates preserve source monetary totals.

Queries naming a denied identity return an empty page/export. Before any dataset
query or response header is built, filters are decoded and every nested string
and numeric value is checked. Numeric values use canonical decimal digits,
including scientific-notation bounds. The rejection index normalises case,
whitespace, diacritics and spaced ABNs. Money responses omit Content-Location
entirely. Denied requests have no continuation links; body, CSV, ETag and other
headers do not contain their state. Malformed input and database failures also
use fixed errors. There is no asset read in the table query path.

## Local preparation and loading

From the repository root, with Node 24:

```sh
cd portal
npm ci
npm run build:search
cd ..
unshare -rn sh -c 'ip link set lo up; node scripts/apply_table_sql.mjs --local'
unshare -rn sh -c 'ip link set lo up; node scripts/sweep_table_privacy.mjs'
```

`npm run build:tables` runs `scripts/load_tables.mjs`. It creates sanitised,
batched SQL and a manifest under ignored `portal/private/dt-api/sql/`, never
under public/. SQL statements are kept below 80 KB where possible. No raw
source snapshot or withheld identity is written to SQL. The local helper accepts
only `--local` and never prints SQL or source identities. Preparation is
repeatable; applying the manifest replaces table data and rebuilds FTS indexes.
Rebuild and reload the manifest for this revision: it adds accent-insensitive
rejection hashes while retaining the earlier hashes.
Run the load to completion before exposing the binding: a partial load is not a
published snapshot. D1 fixtures in the tests use Miniflare, never production.

## Merge orchestrator only: production setup

Create the real database with `wrangler d1 create opax-tables`, then replace the
placeholder UUID on the production and staging `TABLE_DB` bindings with the real
ID. Both configurations currently name this same table database. Review the
sanitised local manifest and privacy sweep before loading. After building from
the release exports, the orchestrator applies every file in manifest order:

```sh
cd portal
node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const dir='private/dt-api/sql/';
const {files}=JSON.parse(await readFile(dir+'manifest.json','utf8'));
for (const file of files) {
  const result=spawnSync('npx',['wrangler','d1','execute','opax-tables',
    '--remote','--file',dir+file],{stdio:'inherit'});
  if (result.status!==0) process.exit(result.status || 1);
}
JS
```

These remote commands are documentation for the orchestrator; this lane performs
only local database writes, with no push or deployment. The SQL includes schema
creation, so applying the separate schema migration is optional on first load.

## Initial D1 validation (10 October 2026)

The local database was loaded with all ten real exports. Preparation produced
103 sanitised SQL files, 168,626,461 bytes; the largest statement is 79,996 bytes.
The privacy sweep checked 236,909 financial rows plus their category facets
against 8,054 derived identity hashes and found **zero withheld identities**.
Neutral aggregate totals match the original exports.

The deploy dry-run reads 25,533 files before ignore rules. The eligible asset
set is **25,455 files / 911,834,594 bytes**, down 577 files / 141,188,473 bytes
from the reviewed build. There are **zero public table data/index files**.
`votes.json` is byte-identical (SHA-256
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`).

`scripts/measure_tables.mjs` profiles the actual Worker under local workerd,
with the real local D1 binding, for `q=a`. Run it from the repository root:

```sh
unshare -rn sh -c 'ip link set lo up; node scripts/measure_tables.mjs'
```

| Dataset | Response | Matching / returned rows | Sampled peak heap (MiB) | Sampled CPU (ms) | Local wall (s) |
| --- | --- | ---: | ---: | ---: | ---: |
| contracts | page | 73,359 / 200 | 13.70 | 145 | 1.48 |
| contracts | csv | 73,359 / 50,000 | 13.74 | 405 | 65.85 |
| grants | page | 118,605 / 200 | 13.78 | 82 | 0.81 |
| grants | csv | 118,605 / 50,000 | 13.85 | 358 | 65.11 |

Heap figures use a baseline workerd heap snapshot (including native backing
objects) plus V8 live-allocation sampling at 16 KiB, requested every 20 ms.
These are sampled estimates, not a hard bound on all transient allocations.
CPU counts active 1 ms V8 samples, excluding idle samples, and includes profiler
overhead; local D1 execution and streaming account for most wall time. All four
heap estimates are below the approximately 60 MiB target. Raw heap snapshots
stay in memory; Wrangler disk debug logging is disabled and only numeric results
and local connection metadata are retained.

After `npm run build:search`, all 1,248 Node tests passed, including the
shared round-two privacy assertion and real D1 CSV cap registration. The
serializer integration also passed against the actual round-two core module.
`npx tsc --noEmit`, `npm run check` and `npx wrangler deploy --dry-run` passed.
The declarations remain byte-identical to the contract lane. The original
contract text is retained with the additive CSV continuation clarification above.

Numeric evidence and screenshots are retained in ignored
`portal/private/dt-api/`: `memory-cpu.json`, `privacy-sweep.json`,
`suppliers-390.png` and `suppliers-1280.png`. Screenshots use headless Chrome
with non-local hosts blocked, displaying the local D1 response with design tokens.
No contract fields were added.

The memory measurements above describe the earlier 50,000-row single-response
export. The current response cap is 10,000 rows, with the same 200-row streaming
batches and bounded SQL query path.

## Re-review validation (11 October 2026)

The rebuilt manifest contains 103 sanitised SQL files, 168,627,250 bytes and
8,065 rejection hashes. Dataset row counts and the public asset set are unchanged.
Regression coverage includes Unicode-escaped JSON values, mixed case, whitespace,
composed/decomposed diacritics, spaced ABNs and scientific-notation numeric bounds
on all five money datasets, for page and CSV requests. It also checks nested
arrays/objects before grammar errors, no dataset SQL for denied state, and clean
response headers. The shared privacy gate separately exercises escaped donor,
recipient, supplier, alias and identifier values through the actual Worker.
CSV tests follow all five continuation pages, verify stable sort/filter state,
distinct cache keys and exactly 50,000 unique rows across a capped export.

The real local D1 database was reloaded completely. Its privacy sweep checked
236,909 financial rows and their facets with the updated rejection index and
found **zero withheld identities** (`p1-privacy-sweep.json`).

Local workerd was profiled again with `q=a`, using the same sampling method:

| Dataset | Response | Matching / returned rows | Sampled peak heap (MiB) | Sampled CPU (ms) | Local wall (s) |
| --- | --- | ---: | ---: | ---: | ---: |
| contracts | page | 73,359 / 200 | 13.63 | 120 | 1.58 |
| contracts | csv | 73,359 / 10,000 | 13.69 | 216 | 14.40 |
| grants | page | 118,605 / 200 | 13.71 | 177 | 6.73 |
| grants | csv | 118,605 / 10,000 | 13.77 | 255 | 11.70 |

Numeric evidence is in ignored `portal/private/dt-api/memory-cpu.json` and
`p1-memory-cpu.log`. No raw heap snapshot or private identity was written.

After the search build, all **1,250 Node tests passed**, including the shared
privacy gate, decoded-value regressions, CSV continuation tests and integration
with the actual round-two core module. `npx tsc --noEmit`, `npm run check` and
`npx wrangler deploy --dry-run` passed. The eligible assets remain
25,455 files / 911,834,594 bytes, with zero public table data/index files.
`votes.json` was compared byte for byte again and is unchanged.


Divisions/voting rollout alignment

Divisions expose optional title/chamber/outcome/href and bill/sitting scope
arrays alongside the original columns. Votes expose individual records with
optional title/date/vote/party_position/href/person alongside compatible metadata.
Use the existing JSON-array grammar (f.bill, f.person, f.sitting, f.jurisdiction),
not bare scope parameters. Both datasets enforce the full source-derived privacy
index. Migration 0002 adds record columns; a table load rebuilds their projections.

The final capped CSV continuation additionally ends with the separate record
# Export truncated at 50,000 rows. The core joins up to five continuation pages,
removes repeated headers and range trailers, and preserves that final record.
The shared contract registration certifies the combined real endpoint export.
