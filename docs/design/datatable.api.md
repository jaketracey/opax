# DataTable server endpoint

`GET /api/table/<dataset>` implements the frozen `datatable.contract.md` and
`portal/public/datatable.d.ts`. There are no contract additions. This endpoint
reads published assets only, including in staging; it never proxies another API.

Queries use `q`, repeated `f.<column>` category values, `f.<column>.min` and
`f.<column>.max` numeric bounds, `sort=<column>:asc|desc`, `page`, and `pageSize`.
A consistent table URL prefix, such as `t.q` and `t.f.party`, is also accepted.
Category values are ORed within a column; columns and search words are ANDed.
Category values preserve the exact exported strings, including Unicode and spaces.
Search folds case and whitespace and matches partial words, including Unicode.
Numeric bounds are inclusive. Pages start at one and stale pages clamp to the
last page. The default size is 50; the maximum is 200.

`format=csv` ignores paging and exports the filtered, sorted rows, capped at
50,000. Values are unformatted and fields use CSV quoting, including quotes and
newlines. `X-Table-Total` and `X-Table-Exported` report the total and exported
counts. JSON conforms to `Page`; it adds no echoed query properties. Facets
describe the full filtered set, before paging; empty ranges are omitted.

The column keys, types, facets and default sorts are defined in
`portal/public/table-datasets.js`:

| Dataset | Published source and row meaning |
| --- | --- |
| money-connections | Four money graphs; one recognised receipt, contract or grant connection per row |
| party-money | The receipt connections from those graphs, with donor and party names in `from` and `to` |
| contracts | Supplier profile shards; one contract notice per distinct notice ID |
| suppliers | `suppliers.json`; one supplier aggregate per row |
| grants | Federal and Queensland recipient shards; one exported grant award per row |
| divisions | Division index and detail files; one division per row |
| votes | A separate member-summary projection of the unchanged schema-1 `votes.json` |
| instruments | Instrument index records |
| audit-reports | Audit index report records |
| interests | Member register shards; one declared entry per row |

These are the exported snapshots, including their original coverage limits.
Contract and grant values remain award values; they are not payments. Recipient
and interest shards may contain samples rather than every underlying source row.

Money connections pass `isOrganisationDonor` for every donor node. Known withheld
names and aliases are removed from the financial datasets and declared interests
at build time. Money requests repeat the privacy check server-side, withhold
queries naming donors, and validate row evidence and facets before responding.
Withheld queries return zero rows and omit the name from normalized URL state.
No withheld-name index is published.
Interest entries retain public register roles; references to withheld donors in
the entry text follow the same office-holder exemptions as the existing site.

`npm run build:search` includes `build:tables`. The table build creates versioned
row shards with dictionaries for repeated strings, category postings, sorted
numeric ranges, sort orders, and 16 search
posting buckets per dataset under the ignored `public/table-index/` directory.
Unfiltered JSON pages read a small facet summary instead of the query postings.
Requests load only the relevant term buckets and selected row shards. The
additive build budget is 1,500 files and 200 MiB, with a 20 MiB ceiling per asset.
The build reports actual file counts and bytes and fails if that budget is
exceeded. These generated files are deployment artifacts, not committed exports.

Responses use a normalized query key, dataset version and cache epoch in the edge
cache. CSV keys omit paging. `Content-Location` exposes normalized URL state;
withheld names are omitted. Responses have a 60-second cache age and ETags for
conditional GET. CSV byte chunks are cached individually; their normalized
cache entry is published after all chunks finish. A missing chunk regenerates
the export before sending a response. Errors are JSON with fixed codes: `not_found` (404),
`method_not_allowed` (405), `invalid_query` (400), or `unavailable` (503).
