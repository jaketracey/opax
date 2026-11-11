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
