# Division and voting-record tables

The web bill pages, sitting-week division lists and person voting records use
`portal/public/vote-tables.js`, shared by the Worker and browser. The tables use
the approved core from `web/dt-core` at `7a57261b4`. DT-api remains a separate
merge dependency, so local browser checks use a Wrangler-only fixture entry.

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
| Bill divisions | `/api/table/divisions` | `bill`: bill key | `dv.*` |
| Sitting-week divisions | `/api/table/divisions` | `jurisdiction`: `federal`, `start` and `end`: inclusive ISO dates | `dv.*` |
| Person votes | `/api/table/votes` | `person`: roster person ID, or canonical person slug when no ID exists | `vr.*` |

The API needs to enforce scope before applying query filters and CSV export.
Normalized division rows contain `title`, `date`, `chamber`, `outcome`, `ayes`,
`noes` and `href`; vote rows contain `title`, `date`, `vote`, `party_position` and
`href`. These are ordinary `Row` properties, not contract additions. The fixture
adapter uses the same projections in `portal/test/dt-votes-worker.mjs`.

Filtered URLs are shareable and noindex; canonical URLs omit table state. Local
fixtures never ship as an API route. `votes.json` is read without modification.
Both configs register `privacy: 'donors'`, `privacyCheck` and the optional
`rowPrivacyCheck`. The row predicate admits the division/vote shape and, on SSR,
checks all row fields with the shared index. SSR uses `tablePrivacyCheck` or its
read-boundary adapter; browser hydration uses the read-only `/api/table/privacy`
validator. Names and aliases stay server-side. Encoded links are checked decoded.
The optional `rowPrivacyCheck` field is the sole contract addition in this lane.
No aggregate rows are used here; the core's money aggregate label is now
“Donors not named (N)” as requested.

Ayes and Noes enable core bars and numeric ranges, so each bar uses the whole
filtered column's scale across server pages. Outcome stays visible for its Status
label; other constant categories use the core's single applied-filter label.

Before screenshots remain in `portal/private/dt-votes/`. The current merged-core
shots are `after-wrangler-{bill,person,hub}-{390,1280}.png`, served by local Wrangler.
Chrome runs headless in an isolated network namespace. Non-local hosts are blocked
by request interception and the resolver. The fixture Worker refuses model,
generation, voice, auth and ingest dispatch.

Run the browser check after `npm ci` and `npm run build:search`:

```sh
cd portal
unshare -rn sh -c 'ip link set lo up; OPAX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/dt-votes-dev.mjs'
```

The runner owns and stops its Wrangler PID. It covers source scoping, hydration,
phone cards, primary links, Status labels, search, facets, URL reload, sort, paging,
actual downloaded CSV, and the 50,000-row server export cap. Both table configs
are checked against every runtime-derived withheld name/alias in unit tests.
The browser gate calls the core's shared `assertTablePrivacy` for client input,
server rows/facets, an actual CSV file, URL state, rendered and accessible text,
and analytics. Rejected searches download headers only. Results and source hash
are recorded in `after-wrangler-measurements.json`.
