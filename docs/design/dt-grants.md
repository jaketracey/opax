# Grants table rollout

The grants page uses the shared DataTable and D1 query engine. SSR and hydration
keep ordinary query grammar, type, length and duplicate-key validation. Every
source recipient is shown; there is no donor matcher, privacy POST, withholding
mode, anonymous aggregate or fingerprint requirement.

The six visible fields are recipient, program, agency, value, date and electorate.
Search indexes recipient, program and agency names. Category filters use JSON
arrays; numeric filters use ranges. Each facet keeps alternatives while applying
the other filters. The value scale covers the full filtered result. CSV retains
the shared paginated export and 50,000-row ceiling.

Recipient IDs, kind, ABN type and availability remain source metadata. A recipient
links only when its exact ID exists in the jurisdiction's profile index and
shard. Otherwise the source name remains plain text. The ordinary grants schema
migration remains part of the table reload lane. CI metadata-only releases skip
private SQL preparation and write no identity or fingerprint artifacts.

Tests cover source names including individuals, exact amounts, existing profile
links, facet alternatives, name-only search, real D1 CSV and hydration without a
validation POST. See [the API contract](datatable.api.md) and
[the shared contract](datatable.contract.md).
