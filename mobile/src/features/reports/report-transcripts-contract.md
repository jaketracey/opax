# Report transcripts contract (jaketracey/opax PR #275, live 12 Nov 2026)

Written by gov-reports-lead; placed here by the orchestrator.

## Endpoints
- `GET /api/report/<slug>`: a top-level `transcripts` field holds the first page (20 rows). The field is absent when the record has no transcripts.
- `GET /api/report/<slug>/transcripts?offset=<n>&limit=<m>`:
  - offset defaults to 0 and limit to 20; limit must be 1 to 100;
  - non-integer or out-of-range values return 400 `{error}`; an unknown slug returns 404;
  - a record with no transcripts returns `count: 0` and `items: []`.

## Envelope
- `label`: "Hearing transcript: evidence, not findings"
- `count`: total rows, the same on every page
- `first_date`, `last_date`: ISO dates (YYYY-MM-DD), the same on every page
- `offset`: echoes the request
- `items[]`: see below
- `next_offset`: offset plus items.length, or null when there are no more rows

Order: newest hearing_date first, ties broken by id.

## Items
- `id`: string
- `hearing_date`: YYYY-MM-DD
- `title`: string. Always present for royal commissions; integrity bodies may give `case` instead of, or as well as, a title.
- `case?`: string, integrity hearings only
- `pages?`: number
- `url`: the publisher's PDF
- `page_url?`: the publisher's page for the hearing day, omitted when it equals `url`
- `publisher_redacted`: boolean, always present
- `notes`: string[], always present and possibly empty. It holds the row's own notes. If the commission has suppression, non-publication or publication orders, their notes are added here too, and so is a restriction note for no-quote transcripts.
- `orders`: string[], always present and possibly empty, holding only https URLs of order documents

There are no witness fields and no transcript text.
