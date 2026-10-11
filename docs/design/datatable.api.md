# DataTable D1 endpoint

`GET /api/table/<dataset>` reads `TABLE_DB` (`opax-tables`). The shared query
contract retains its CSV continuation clarification and adds optional row/CSV
privacy callbacks. No table data or indexes
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
Rebuild and reload the manifest for this revision: it adds separator-stripped
rejection hashes while retaining every earlier hash and its word count.
Run the load to completion before exposing the binding: a partial load is not a
published snapshot. D1 fixtures in the tests use Miniflare, never production.

## Merge orchestrator only: production setup

The production and staging `TABLE_DB` bindings both name the configured
`opax-tables` database. Rebuild the sanitised manifest and verify its local
privacy sweep before deployment. Release order is **deploy, reload, verify**:
deploy the Worker built from these release exports, then apply every manifest
file in order, then verify the fingerprint and privacy endpoints. Privacy
datasets return 503 with `Retry-After: 60` between deployment and the completed
reload. Instruments and audit do not require this fingerprint. The orchestrator loads:

```sh
cd portal || exit
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

## Complete publication registry

The table loader seeds the complete donor registry from raw source identities held in memory, including compact-block numeric identifiers, and adds private recipient and supplier identities. The Worker reads `/table-private-identities.json`, containing hashed entries and the rolling-hash screening metadata described below. Existing SHA-256 inputs and word counts are unchanged: `identityVariants` produces NFKD accent-insensitive and legacy NFKC lowercase ASCII word phrases, inverted-name variants, and eleven-digit identifier variants; `words` remains the phrase word count. A full rebuild and ordered D1 reload is required to install the additional hashes, not a schema migration. The build also emits `src/table-registry-fingerprint.json` for the Worker and records `privacy_fingerprint` in D1's `table_meta`, published in the last SQL file. For the P2 reload, this fingerprint is SHA-256 of `row-token-v1\n` followed by the sorted identity hashes joined by a newline, with no trailing newline. The policy prefix forces the ordered row rebuild even when the identity set is unchanged. The API requires an exact match before any privacy dataset SQL or cached response. Missing or stale metadata returns 503 with `Retry-After: 60`, no rows and no echo. Additional compact forms use NFKC, case folding and letters/digits only, with the SHA-256 input `stripped:v1:` followed by that form. Their `words` field is 1. Minimum length is 4. Row fields require whole-token boundaries at both ends for every compact length; visitor queries retain substring rejection for lengths 6+ and token boundaries for lengths 4–5. `/table-private-identities.json` adds `strippedLengths`; D1 adds the `privacy_stripped_lengths` metadata row. The D1 schema stays unchanged, and the fingerprint includes both hash domains. All previous hashes and word counts remain unchanged. The orchestrator uses the remote manifest loop above after merge deployment; this lane uses local D1 only. The local sweep resolves TABLE_DB’s production database_id from wrangler.jsonc and rejects an empty store.

After the ordered reload, verify the published metadata (hashes only):

```sh
npx wrangler d1 execute opax-tables --remote --command "SELECT key,value FROM table_meta WHERE key IN ('version','privacy_fingerprint','privacy_stripped_lengths');"
node --input-type=module -e "import build from './src/table-registry-fingerprint.json' with {type:'json'}; console.log(build.fingerprint)"
```

The D1 fingerprint must equal the build fingerprint. Then verify the five privacy
page and CSV endpoints and the complete runtime rejection set against the
release, using counts-only diagnostics. An interrupted reload must finish before
these datasets can serve; the fingerprint marker is written last.

Round 7 adds compact hashes to the same ordered manifest reload; no command or schema migration changes. The build fingerprint is `f620d6a19ecb395c34e4f2f2e6a8b2a1e07e5524510c3b48ec962d7359b6ffd7`. Deploy, reload every manifest file using the remote loop above, then verify this fingerprint and the privacy endpoints. Privacy tables stay unavailable until the new fingerprint is installed.

The ordinary-query regression sample contains 53 distinct terms derived from existing tests and fictional workbench fixtures. Compact matching rejects one additional term (1/53, 1.89%); this ambiguous compact identity remains blocked. The 751 reviewer-derived donor and recipient compact variants are all rejected. Every prior 8,766 word hash and word count is retained; the new registry contains 17,518 hashes.

## DataTable privacy P2 reload (11 October 2026)

Row fields are checked individually, using compact exact or whole-token-run matches. The loader, direct SQL publication barrier and local D1 sweep use this policy. Visitor input retains strict separator-stripped substring rejection, including unknown query keys, numeric bounds and JSON escapes. Browser row/CSV approvals have a separate cache and cannot authorise a query. `privacyRowCheck` supplies the field policy to SSR or custom adapters; its conservative fallback is `privacyCheck`. The validator defaults to query policy, with `{text, mode:"row"}` for individual published fields and `{text, mode:"csv"}` for CSV. CSV validation honours RFC 4180 field boundaries, including quoted commas and multiline fields; adjacent cells cannot form an identity. `privacyCSVCheck` is available for custom browser adapters.

The publication registry is version 2. Each entry keeps its SHA-256 `hash` and `words` and adds `compact`, `length` and `rolling`, all derived at build time. No private source text is published. Rolling polynomial hashes screen fixed-size windows and SHA-256 confirms every candidate; collisions cannot produce a rejection without confirmation. Work is linear in input size for a fixed registry, and matching windows use ring storage bounded by the longest indexed form. Old publication registries fail closed. Historical hash-only indices remain supported only by the audit helper.

The [counts-only audit](datatable-privacy-p2-audit.json) reproduces the 49,625-row increase, including 46,826 grants. Contrary to the initial contains-rule hypothesis, 48,668 retained rows match four-character compact forms on complete tokens; removing those would require a separate policy decision. The requested field-boundary change restores 243 rows, leaving 49,382 field-local hits. Each retained row has an exact or token-run witness; no substring-only or cross-field witness is accepted. The deterministic sample classifies 49/50 as boundary-valid before the change and 50/50 after it, with zero boundary false positives in the final sample. Person attribution remains unverified for all 50 sampled rows: boundary validity does not establish the requested semantic false-positive rate below 1%. The precision target remains a reload blocker pending classification or an approved disambiguation rule.

| Dataset | Additional aggregated rows before | After | Restored |
| --- | ---: | ---: | ---: |
| money-connections | 36 | 33 | 3 |
| party-money | 25 | 23 | 2 |
| suppliers | 213 | 180 | 33 |
| contracts | 2,525 | 2,399 | 126 |
| grants | 46,826 | 46,747 | 79 |
| Total | 49,625 | 49,382 | 243 |

The exclusive rule breakdown is word-boundary 0, compact exact 581, compact token-aligned 48,801, compact contains 243 before; word-boundary 0, compact exact 581, compact token-aligned 48,801, compact contains 0 after. The audit includes matched compact lengths and dataset/length/rule counts. Source values never leave memory.

When any endpoint row is discarded, both SSR and hydration recompute the total, numeric facets and constant chips from surviving rows and reset the page to 1. Endpoint rows are not prefiltered before this reconciliation. Generated pagination state is validated under query policy before rendering.

The [reload manifest](datatable-privacy-p2-manifest.json) has 86 ordered SQL files, 139,035,696 bytes and 17,518 private identity hashes. The new fingerprint is `638847dbfe829bcb81d46645609572274a20ddb94c10951d074f2962363e956d`. The manifest lists every SQL filename and the count for each dataset. SQL remains outside public assets. The orchestrator rebuilds after merge, deploys the Worker, then loads every SQL file in manifest order; the final file publishes the fingerprint. This lane performs local validation only.

Validation after `npm run build:search`: all 1,408 tests passed, followed by an explicit query/row/CSV registry-mode test with zero misses for 666 donor labels and aliases, 81 identifiers and 169 recipient inputs. `npm run check`, Wrangler's deploy dry-run and `git diff --check` passed. The local D1 sweep found zero hits across 186,049 financial rows and their facets, with matching build/database fingerprints. The existing served-file publication gate found zero hits across 25,095 JSON files and 114 client/crawl files, applying its organisation, public-role and record-reference rules. The 1,670 row-injection cases had zero chip/facet/attribute hits; 162 numeric probes, 1,458 raw-query endpoint probes and all 607 donor + 144 recipient variants rejected without echoes or data reads. `votes.json` was compared byte for byte against the starting commit and remains identical, SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

The real contract CSV benchmark validates both ends for withheld identities and checks RFC 4180 cell boundaries. The 9,003-row export is 1,844,417 bytes; the 50,000-row export is 10,202,337 bytes. Isolated local workerd validation took 1,251 ms and 6,510 ms respectively; Node CPU was 1,530 ms and 8,988 ms. During the concurrent full suite, workerd wall time was 3,998 ms and 13,599 ms and Node CPU was 1,732 ms and 9,977 ms. These timings measure the privacy validator, including its request parsing in workerd, rather than the D1 export query. The benchmark gates Node CPU below 20 seconds and workerd wall time below 30 seconds. Candidate window storage is bounded by the longest registry form; the CSV parser retains only the current field, alongside the request text.
