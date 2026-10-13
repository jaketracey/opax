# Division and voting-record tables

The web bill pages, sitting-week division lists and person voting records use
`portal/public/vote-tables.js`, shared by the Worker and browser. The tables use
the approved core from `web/dt-core` at `7a57261b4`, with shared query validation
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
Both configurations use ordinary type and length validation. Rows and reader
queries pass through no donor matcher. Hydration fetches only table data and
makes no `/api/table/privacy` request. Source titles and dates remain intact;
filters, sorting, paging and scoped URLs keep the shared core grammar.
