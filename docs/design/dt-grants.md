# Grants table rollout

`/money/grants` mounts the shared DataTable in server mode at
`/api/table/grants`. The table state uses the `t` URL prefix. Existing program,
recipient and largest-award deep links retain their record views.

The six displayed fields are `recipient`, `program`, `agency`, `value`, `date`
and `electorate`. `value` is an exact numeric Australian-dollar award commitment;
`date` is the start date, falling back to the approval date. Recipient links
require `recipientAvailable`, checked against the index and recipient shard.
Unavailable destinations return null. `recipientKind`, `recipientABNType` and their evidence arrays
retain the metadata needed for privacy checks; source types are checked before
joining so a conflicting individual/sole-trader type cannot be overwritten.

`recipient-privacy.js` mirrors the app's `features/money-public/privacy.ts`:
entity kinds and ABN types override labels. The optional core `rowPrivacyCheck` hook applies that same typed policy to
HTML and CSV, alongside the shared text validation hook. The server builds its
rejection index from every federal grant recipient and alias, source recipient
types, and the donor graphs. It checks all returned fields, including program,
agency, IDs and link metadata. Name-only withheld queries return zero rows.
The config supplies `privacyCheck` against the same server index at
`POST /api/table/grants/privacy`; only a boolean is returned. SSR supplies the
same synchronous predicate. Core round 1 is merged; round 2 is pending. Until
its shared hook lands, the endpoint and local initial-load guard fail closed.
Initial hydration passes the rejected query to the core before sanitising the
URL, so cleaning cannot broaden the result set.

Anonymous totals use the core's neutral aggregate shape, with optional
`aggregate.subject: 'recipients'` for the fixed recipient wording. No IDs,
links, names or categories survive in this row. These totals appear only in
the unfiltered view; a name or facet search never confirms a withheld award.

The temporary handler reads selected published GrantConnect program files.
Search matches recipient, program and agency names only. Facets apply the
search and all other filters, excluding their own. Numeric facet bounds span
the complete result. Value bars stay disabled until core round 2 supplies one
column-wide scale. CSV exports
the complete filtered sample, capped at 50,000 rows. The page identifies this
coverage as a preview. Queensland data is outside this sample.

At the DT-api merge, replace the temporary route and SSR sample reader with
the shared endpoint/query engine. Retain privacy validation, profile availability,
row mappings (or map `amount` and `start_date`), electorate, and name-only search.
The wire format uses JSON category arrays and numeric ranges. Normalised-query
caching remains an API handoff check; this fixture deliberately returns no-store.

The Chrome gate is `portal/test/grants-table-browser.mjs`, run in an isolated
network namespace with loopback enabled. It uses the real core and disk-backed
Worker, blocks non-local requests, derives private test sets at run time, and
checks initial URLs, actual CSV downloads, rendered/accessibility text, input,
responses, analytics and URL state. It uses the shared privacy assertion hook
when available, with a local fallback until the core round 2 merge.
Private screenshots are in `portal/private/dt-grants/` at 390 and 1280 pixels.
