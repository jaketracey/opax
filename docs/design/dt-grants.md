# Grants table rollout

`/money/grants` uses main's server DataTable and `/api/table/grants` D1 query
engine. SSR calls that engine, obtains `tablePrivacyCheck(env.ASSETS)`, and
passes the original request URL to `dataTableHTML`. Browser hydration uses
main's shared `/api/table/privacy` validator. There is no fixture route,
fixture SSR reader, lane rejection index or lane query validator.

The six visible fields are `recipient`, `program`, `agency`, `amount`,
`start_date` and `electorate`. Search indexes only recipient, program and
agency names. Category filters use JSON arrays; value filters use numeric
ranges. Facets apply every other filter while retaining their own alternatives.
The shared column-wide value scale spans the full filtered result. CSV uses
main's paginated D1 export with its 50,000-row cap.

The minimal optional additions in `table-datasets.mjs` project `electorate`,
`recipientId`, `recipientKind`, `recipientABNType`, `recipientAvailable` and
`recipientCount`. Missing metadata remains null. `recipientAvailable` is 1
only when the recipient exists in both the jurisdiction's profile index and
its shard. Migration `0002_grants_projection.sql` upgrades main's existing
schema; apply migrations before importing the regenerated table SQL.
Optional `searchKeys` limits the grants FTS projection to the three name fields.

The loader and browser share main's recipient evidence classifier. The loader
checks all original entity-kind and ABN-type evidence before projection;
individual and sole-trader evidence overrides labels. Main's complete hashed
registry checks every field, including programs, facets, IDs and profile links.
Rejected queries return zero rows and cannot broaden initial hydration.

The previously approved optional core `rowPrivacyCheck` and
`aggregate.subject: 'recipients'` fields remain additive. Entity classification
runs alongside main's whole-row hashed guard. Anonymous grants use the core's
neutral aggregate shape and fixed `Recipients not named (N)` wording; IDs,
links and categories are removed from its hydration and rendered row.

Current `origin/main` (`80bf798c8`) includes the DataTable core round-two work,
shared table API, hashed registry, raw-query validation and fingerprint gate.
The obsolete grants fixture and its privacy validator have been removed.
Tests derive source identities in memory and use synthetic fixture IDs.
Organisation controls must survive API, HTML and actual CSV downloads.
Local gates block non-local hosts and production model, voice and auth calls.
Screenshots are kept privately under `portal/private/dt-grants/` at 390 and
1280 pixels.
