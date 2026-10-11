# Division and voting-record tables

The web bill pages, sitting-week division lists and person voting records use
`portal/public/vote-tables.js`, shared by the Worker and browser. The tables use
the approved core from `web/dt-core` at `7a57261b4`, with the shared privacy guard
merged from main at `f0012b2e`. The approved dt-api at `85a3c729` supplies real
local D1 responses.

Division titles use the recorded stage plus date. Missing tallies remain unknown,
and party position is displayed only when explicitly supplied by the vote source.
Repeated bill counts retain the existing deduplication rule. Sitting-week records
with different IDs remain separate. Member lists, questions and party tallies are
linked from the primary cell to the division page.

SSR seeds the first page from the available exports. The config contains a server
source and no client-mode row set. Hidden crawlable tables on SPA pages keep
separate IDs and do not also hydrate. Browser search, facets, sorting, paging and
full filtered CSV use the following endpoints and fixed scope parameters:

| List | Endpoint | Scope parameters | URL state |
| --- | --- | --- | --- |
| Bill divisions | `/api/table/divisions` | `f.bill`: JSON array of bill keys | `dv.*` |
| Sitting-week divisions | `/api/table/divisions` | `f.jurisdiction`: `["federal"]`, `f.sitting`: JSON array of week-start IDs | `dv.*` |
| Person votes | `/api/table/votes` | `f.person`: JSON array of primary and alias person IDs | `vr.*` |

SSR, hydration and export derive those person IDs through `personVoteKeys`.
The helper normalizes source name keys and retains all matching alias IDs. The
two affected profiles each show the same 14 records on all three surfaces.

The API needs to enforce scope before applying query filters and CSV export.
Normalized division rows contain `title`, `date`, `chamber`, `outcome`, `ayes`,
`noes` and `href`; vote rows contain `title`, `date`, `vote`, `party_position` and
`href`. These are optional `Row` properties. The D1 loader and SSR share the same
projections, with migration 0002 upgrading the earlier summary schema.

Filtered URLs are shareable and noindex; canonical URLs omit table state. The local safety wrapper delegates table endpoints, SSR and assets unchanged;
it blocks unrelated API/ingest dispatch. `votes.json` is read without modification.
Both configs register `privacy: 'donors'`, `privacyCheck` and the optional
`rowPrivacyCheck`. The row predicate admits the division/vote shape and, on SSR,
checks all row fields with the shared index. SSR uses `tablePrivacyCheck` or its
read-boundary adapter; browser hydration uses the read-only `/api/table/privacy`
validator. The shared `tableIdentityIndex` covers donors, recipients and suppliers from
source exports, with kind and ABN type overriding name evidence. Names, aliases
and identifiers stay server-side; the published registry contains hashes only.
Encoded links are checked decoded. The rollout uses the shared registry without
an additional identity list. The shared URL guard checks raw query occurrences
before parsing and scrubs rejected state before rendering, including filter chips.
SSR guarding and rendering import the same core module to retain its rejection marker.
The loader applies that index before persisting every dataset, including interest
and instrument rows. Grant and donation aggregates use “Donors not named (N)”.
The optional `rowPrivacyCheck` field is the sole contract addition in this lane.
No aggregate rows are used here; the core's money aggregate label is now
“Donors not named (N)” as requested.

Ayes and Noes enable core bars and numeric ranges, so each bar uses the whole
filtered column's scale across server pages. Outcome stays visible for its Status
label; other constant categories use the core's single applied-filter label.

Before screenshots remain in `portal/private/dt-votes/`. The current merged-core
shots are `after-api-{bill,person,hub}-{390,1280}.png`, served by local Wrangler.
Chrome runs headless in an isolated network namespace. Non-local hosts are blocked
by request interception and the resolver. The local safety wrapper refuses unrelated API and ingest dispatch.
The published sitting windows have no divisions; their shots show the real empty
table and coverage note, without substituting fixture data.

Run the browser check after `npm ci` and `npm run build:search`:

```sh
cd portal
npm run build:tables
unshare -rn sh -c 'ip link set lo up; node ../scripts/apply_table_sql.mjs --local'
unshare -rn sh -c 'ip link set lo up; OPAX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/dt-votes-dev.mjs'
```

The runner owns and stops its Wrangler PID. It covers source scoping, hydration,
phone cards, primary links, Status labels, search, facets, URL reload, sort, paging,
actual downloaded CSV, and the 50,000-row server export cap. Both table configs
are checked against every runtime-derived withheld name/alias in unit tests.
The browser gate calls the core's shared `assertTablePrivacy` for client input,
server rows/facets, an actual CSV file, URL state, rendered and accessible text,
and analytics. Rejected searches and facets disable export, including initial URLs through hydration.
Sitting JSON-LD uses the same filtered/paged rows as SSR. Source text is checked
before formatting. The core follows real CSV continuation links and preserves
the required final truncation record. Both endpoints register the shared CSV
contract gate. The runner seeds isolated public cap scopes in local D1 only. Results and source hash
are recorded in `after-api-measurements.json`.
