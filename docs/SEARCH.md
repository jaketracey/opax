# Unified public-record search

Find records uses `GET /api/search-all` and defaults to all published record types. The existing `/api/search` endpoint remains document-only for internal callers. Ask continues to answer from parliamentary documents.

The unified endpoint combines the document retrieval service with a generated lexical catalog of people, parties, government agencies, donors, political receipts, suppliers, contracts, grants, bills, interests, expenses, meetings, lobbying and foreign-influence registers, campaigners, and reports. Result labels distinguish datasets; links open the relevant profile, map connection, recipient or contract notice. Financial-only searches do not invoke the document service.

## Coverage

The catalog indexes the JSON datasets published in `portal/public`, not the complete upstream source databases. Map connections, expense totals and recipient profiles are aggregates and can overlap individual records. Published grant and interest detail exports contain samples of their source registers. Each response includes coverage text, the catalog version and the number of catalog matches. The UI makes this available under Search coverage.

Catalog search intersects normalized query terms, including a prefix match on the last term. It searches titles, aliases, identifiers and descriptions. Type, jurisdiction, party, speaker, topic and year filters intersect; an explicit filter excludes records without matching metadata. Year filters use published reporting periods for aggregates and exclude undated records. Catalog-only searches use keyword mode.

Both sources return at most 200 candidates. Reciprocal rank combines their independently ranked results; their native scores are not comparable. The response provides a maximum 200-result window, paginated or exported with `per=200`. `truncated` and visible warnings disclose retrieval limits or an unavailable source. Results can still display if one source fails. A total source failure returns 503.

## Rebuilding and release

Run `npm --prefix portal run build:search` after changing source exports. Both deploy scripts also rebuild it automatically. `scripts/build_search_catalog.mjs` owns only `portal/public/search-catalog/`; it replaces generated files and writes a deterministic content-versioned manifest, metadata, 64 term partitions and 256-record detail shards. Commit the generated assets with source changes.

The Worker reads these files through its ASSETS binding. Metadata and a bounded set of term partitions are cached per isolate; record shards are request-scoped. Typed arrays and a 200-item heap bound matching allocations on common words. No additional database or remote index is provisioned. Staging searches its own catalog and obtains document results through its production service binding.

Validation: `node --test portal/test/*.test.mjs` and `npm --prefix portal run check`. Catalog tests use the actual generated assets, including exact contract IDs, ABNs, prefixes, map-only awards and filters. Unified endpoint tests cover mixed ranking, paging, source isolation and partial failure; export and supplier tests verify destination links and direct notice opening.
