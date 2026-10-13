# Victorian gifts in the app — plan only

Place ministerial gifts alongside interests in the declarations feed, labelled
“Victorian ministerial gifts and hospitality”. Each entry represents a published
register row, with its reporting period and original source, rather than a dated
gift event when the publisher supplies no separate event date. Include a filter
for ministers or parliamentary secretaries and the exact linked office holder.

On an existing Victorian person screen, add a “Gifts and hospitality” section
beside declared interests. Show the number of published entries, reporting periods
and a link to `/register/vic-gifts`, then an optional read-only native table after a
reviewed data contract exists. An unmatched holder stays unlinked in the register.
The native person section must use an existing roster identity; it must not create
a person from the register wording.

Retain the description and giver as published in each row. Givers never receive
entities, profile links, autocomplete entries, name-search hits or cross-record
identity joins. Restrict search to official holder, portfolio and reporting period.
Do not include donor addresses. Separate date, estimated value and action fields
remain missing where unpublished, including all 282 rows in this snapshot.

Every block needs the original DPC page, reporting period, table/row ID, snapshot,
SHA-256, applicable licence and State Government attribution. Licence-blocked or
provenance-mismatched rows must be excluded before a feed export is produced.
Counts describe entries and do not imply monetary totals or misconduct.

The first release can open the sourced web register from the declarations and
person screens. Native feed/schema/allowlist work and production loading require
a later review. This lane changes no app code, app API contract or `votes.json`.
