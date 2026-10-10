# Grants table rollout

`/money/grants` mounts the shared DataTable in server mode at
`/api/table/grants`. The table state uses the `t` URL prefix. Existing program,
recipient and largest-award deep links retain their record views.

The six displayed row fields are `recipient`, `program`, `agency`, `value`,
`date` and `electorate`. `value` is an exact numeric Australian-dollar award
commitment; `date` is the source's start date, falling back to its approval date.
Recipient links use `recipientId` and `jurisdiction`. The `donor` node contains
the same public organisation label for the core's existing privacy adapter.

The temporary handler in `portal/src/grants-table-fixture.ts` reads selected
published GrantConnect program files. It exposes organisation awards only,
fails closed on unreadable privacy data, and searches recipient, program and
agency names only. Its CSV contains the complete filtered sample. The page
identifies that coverage as a preview. Queensland data is outside this sample.

At the DT-api merge, replace the temporary route and SSR sample reader with
the shared endpoint/query engine. Keep the row fields above (or map the API's
`amount` and `start_date` fields), include electorate and recipient link
metadata, and keep free-text search restricted to the three name fields.
The temporary query parser follows the core's serialized query, including JSON
category arrays and numeric ranges. Do not substitute a different filter wire
format at this boundary.

No frozen contract types or fields changed. The rollout imports the existing
renderer and hydration API; interactive controls and responsive cards arrive
with DT-core. Private screenshots include the lane's before/after captures and
an additional integration preview using the DT-core working copy. That preview
does not change the committed core module.
