# Official reports in public search

`npm run build:search` projects the deployed JSON in `royal-commissions`,
`integrity-reports`, `annual-reports` and `agency-reports`. It never fetches a
publisher. `scripts/build_report_catalog.mjs` also runs separately when needed.

There is one row per commission, integrity report, agency document, or
Commonwealth body and reporting year. Six historical Commonwealth body-years
currently have only a title, without an official report URL or loaded
disclosures, and are excluded because they cannot supply a row-level citation.

The catalogue builder appends the rows after existing records, retaining their
IDs and tie order. It indexes titles, commission names, publisher short names,
acronyms, body names and years. A precomputed exact-name lookup gives a named
report priority within the report kind. Both the usual catalogue metadata and
this lookup are cached per isolate. Search reads token partitions and only the
record shards needed for the page. It never reads the report datasets or detail
files. Detail routes read one projected JSON asset, without a growing detail cache.

The `report` kind remains published when OPAX's research essays are disabled.
`/search` redirects to the existing `/ask?view=search` page, whose report filter
and result links open the server-rendered `/report/<slug>` record.
`/api/search` retains its existing corpus-only contract.

## Contracts

Search rows add the following fields only to `kind: "report"` records:

```ts
{
  kind: "report",
  report_type: "royal_commission" | "integrity_report" | "annual_report" | "agency_report",
  title: string, body: string, jurisdiction: string,
  date: string | null, year: string | null,
  href: "/report/<slug>", slug: string, snippet: string,
  citation: { url: string, document: string, page?: number },
  source_url: string, source: string, resource: "",
  dateLabel?: string
  // Existing search machinery adds score and sort_date.
}
```

Snippets are verbatim prefixes from the record. A null date means no published
or tabled day is held, never the snapshot date.

`GET /api/report/<slug>` returns the same projection used by the HTML page:

```ts
{
  schema: 1, kind: "report", report_type, slug, title, body, jurisdiction,
  date, date_basis: string | null, year, snippet, citation,
  snapshot_at: string, caveats: string[], publisher: object,
  record: object, facts: object[], tables: object[], headline: object | null
}
```

`record` retains the source commission, integrity report, body-year metadata or
agency document. Its recommendations, findings, labels, kind, number, cite,
status, notes and court context are unchanged. `facts` retains agency quotes,
labels, units, pages and URLs. Annual `tables` retain original rows, source file
and row references, plus an explicit unit and official source URL. `headline`
retains the published body-year figures and source identifiers. Empty extracted
lists do not establish that a report contains no findings or recommendations.

Missing or malformed records return 404, unavailable assets return 503, and
HEAD returns the GET headers without a body. No authentication is needed.

### Hearing transcripts

A royal commission's `record.transcripts` lists its hearing transcripts. An
integrity report whose case has public hearing transcripts carries them in
`record.transcripts.items` (added 12 November 2026; the summary fields `label`,
`case`, `count`, `first_date`, `last_date` and `file` are unchanged).

When a report has hearing transcripts, `GET /api/report/<slug>` also carries a
top-level `transcripts` envelope with the first 20, and
`GET /api/report/<slug>/transcripts?offset=0&limit=20` pages the rest. Both use
the same shape, newest first with ties broken by id, so an offset names the same
row on every call:

```ts
{
  label: "Hearing transcript: evidence, not findings",
  count: number, first_date: string | null, last_date: string | null,
  offset: number, next_offset: number | null,
  items: {
    id: string, hearing_date: string, title?: string, case?: string,
    pages?: number, url: string, page_url?: string,
    publisher_redacted: boolean, notes: string[], orders: string[]
  }[]
}
```

`url` is the publisher's PDF and `page_url` the publisher's page (left out when
they are the same). `notes` carries the publisher's notes and any publication
restriction recorded by the commission or in the transcript; `orders` holds links
to the publisher's order documents. `next_offset` is `offset` plus the items
returned, or null at the end. `limit` is 1 to 100 (default 20); a bad `offset` or
`limit` returns 400, an offset past the end returns no items with
`next_offset: null`, and a report with no transcripts has no top-level field and
returns `count: 0` from the paged route. The page lists the same rows in a "Hearing transcripts:
evidence, not findings" section, one line per transcript in month folds (newest
month open), and leaves them out of "Official documents".

## Local measurements

Snapshot tested: 2,250 report records: 18 commissions, 738 integrity reports,
1,372 Commonwealth body-years and 122 agency documents. The catalogue contains
332,892 total records. Report row JSON totals 2,156,269 bytes; the exact-name
lookup is 394,384 bytes. Detail assets total 26,512,541 bytes and are loaded only
by record routes. These are uncompressed sizes, excluding shared postings and
metadata.

Run `cd portal && node test/report-search-local.mjs` after building. The script
executes the real `/api/search-all?kind=all&per=20` handler with disk-backed ASSETS
and a fixed local corpus service fixture. It warms both queries ten times, then
interleaves 100 samples per query and consumes each JSON response. This measures
local Node wall-clock latency, not production Worker CPU or corpus latency.

The final isolated run on Node v26.10.0 measured:

| Query | Report rows | Warm median | Warm p95 |
| --- | ---: | ---: | ---: |
| robodebt | 1 | 4.73 ms | 5.65 ms |
| Woodside | 0 | 2.17 ms | 3.09 ms |

Wrangler's local runtime failed to start with `spawn EBADF` in this environment,
so these measurements do not establish the production CPU budget. No remote
service or deployment was used to obtain them.
