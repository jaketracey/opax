# AEC receipt types, 12 November 2026

The federal graph now carries a recipient-side typed measure. The existing `total`, `count`, `byYear`, node selection, ordering, source references and public-money overlays are unchanged. Removing only `meta.receipt_types`, `by_type` and `by_type_year` produces the exact original JSON value. Existing all-record totals include donor declarations; use the new cells to measure recipient-side donations or all receipt types.

## Contract for Ask and the money map

- `edge.by_type`: AUD amounts keyed by mechanically normalised AEC receipt label. Donation-only means `donation_received`, not `donation`.
- `edge.by_type_year`: `{financial_year_or_event: {type: [AUD, row_count]}}`. Financial years use short form (`2000-01`); election and referendum event labels remain event labels. These amounts preserve cents. `unknown` means a blank source type; `unspecified` remains distinct.
- Typed donor and party node cells sum the visible receipt edges. Legacy party node totals cover a wider selection and include internal transfers. Grants and contracts never carry these fields.
- `meta.receipt_types.available` is true only after all expected receipt files from all three cached archives have been loaded. An older database exports an explicit unavailable note and no invented type cells.
- The graph remains a capped donor map, covering political party recipients with an exact unambiguous existing party mapping. It does not establish an exhaustive industry total. The report JSON includes uncapped party-receipt comparisons as well as visible-graph comparisons.

## Source access and inventory

The local source-access registry (`~/.cache/autoresearch/pipeline/source-access.json`) was checked before acquisition work. It has no paused entry for `transparency.aec.gov.au`, and the shared HTTP paused-host list has no AEC entry. No AEC request was made. All raw archives were already cached on 28 March 2026; this lane did not replace them. The existing downloader still uses the shared declared user agent and now also checks the registry before requesting a ZIP. The JSON report lists every CSV, exact columns, row counts, ZIP bytes and SHA-256 hashes.

| Cached archive | Bytes | URL (not fetched) |
| --- | ---: | --- |
| AllAnnualData.zip | 2,571,182 | https://transparency.aec.gov.au/Download/AllAnnualData |
| AllElectionsData.zip | 820,417 | https://transparency.aec.gov.au/Download/AllElectionsData |
| AllReferendumData.zip | 25,312 | https://transparency.aec.gov.au/Download/AllReferendumData |

Annual `Detailed Receipts.csv`: Financial Year, Return Type, Recipient Name, Received From, Receipt Type, Value. Election `Senate Groups and Candidate Donations.csv`: Event, Return Type (Candidate/Senate Group), Name, Donor Name, Date Of Gift, Gift Value. Donation-only election rows are identified by the donations-received file, with `receipt_type_basis=file`; annual detail types have `receipt_type_basis=column`.

No cached annual detail row is explicitly labelled Loan. Other Receipt can include loans and cannot be decomposed into lending. Annual Detailed Debts reports balances owed, not new loan receipts, and is not added to these flows. New source type labels, including Loan if supplied later, are mechanically preserved and normalised.

## Database and counting rule

`parli.schema.init_db` runs the idempotent additive migration in `parli.ingest.aec_receipts.migrate`. It adds receipt_type, return_type, recipient_kind, record_side and source_file to donations, plus the raw-row table `aec_receipt_records` and file-completeness table `aec_receipt_files`. Raw rows are keyed by archive, CSV filename and CSV record ordinal (header is row 1). Equal rows in a recipient file are retained because equal gifts need not be duplicates.

Recipient-side Detailed Receipts is the party measure. Donations Made, Donor Donations Received and their election/referendum donor-side equivalents are retained as cross-checks and never summed into typed flows. Capital Contributions and Detailed Discretionary Benefits remain separate, with record_side=separate. Associated Entity Returns summaries and return totals are not added to detailed receipts. The party graph takes only Political Party Return rows, so election candidate declarations and annual party declarations cannot count the same gift twice there.

Legacy rows are backfilled only on exact donor, recipient, amount, source and financial-year/event keys, allowing only the existing short/long financial-year spelling difference. Recipient declarations take precedence. A recovered row uses `record_side=recipient_match`, `cross_check_match` or `separate_match`: its source_file identifies the evidence for the recovered type, not proof of the old row's original file. Fresh annual/candidate loaders retain their known original side and file. Conflicting types are held rather than guessed, and a row removed from the raw snapshot loses any stale recovered type. This review copy had 161,033 backfilled rows, 317 ambiguous rows and 9,413 unmatched rows. Their IDs, amounts, classifications, canonical recipients and review flags are preserved. The complete raw table supplies the typed graph, independent of legacy deduplication losses.

## Supported recipients

| Source | Recipient kind | Raw recipient rows | AUD |
| --- | --- | ---: | ---: |
| aec_annual | associated_entity | 50,631 | $4,656,195,514 |
| aec_annual | member_of_parliament | 57 | $1,573,476 |
| aec_annual | political_campaigner | 3,306 | $934,488,825 |
| aec_annual | political_party | 65,124 | $3,330,245,274 |
| aec_annual | significant_third_party | 5,119 | $1,569,984,076 |
| aec_annual | third_party | 1,186 | $508,152,134 |
| aec_election | candidate | 2,252 | $32,598,359 |
| aec_election | senate_group | 15 | $171,548 |
| aec_election | third_party | 27 | $1,062,036 |
| aec_referendum | referendum_entity | 564 | $62,802,624 |

Annual MemberOfParliamentReturns.csv also contains 41 Member of House of Representatives and 11 Senator summaries. Detailed receipts contain 57 Member of HOR rows; there are no detailed Senator rows in this cache. Summary amounts are not inserted as additional gifts. Election candidate return summaries contain event, exact source name, party ID/name, electorate and state, enabling later identity review against an election roster. This lane creates no person links. Strict case-insensitive whole-name comparison of the 16,018 candidate summary rows with the published OPAX roster produced no exact matches. Almost all source candidate names (16,014) use a comma-separated name order; none of the 1,618 OPAX roster names does. Three (event, name) keys also repeat. Name-order transformations, initials and fuzzy matches were not used. A reviewed exact identity by name and election/seat is required before linking candidates or MPs to OPAX people.

## Annual receipt counts

Counts below cover every raw Detailed Receipts row, including blank types. The JSON report lists counts and amounts for each financial year and receipt type. They are raw counts, before graph exclusions.

| AEC type | Rows |
| --- | ---: |
| Donation Received | 25,382 |
| Other Receipt | 91,970 |
| Subscription | 1,894 |
| Public Funding | 330 |
| Unspecified | 4,521 |
| Blank (`unknown`) | 140 |
| Total | 124,237 |

## Industry comparisons

All cached Political Party Return itemised recipient receipts, uncapped donors. Exact existing recipient-party mappings and existing canonical donor industry tags. No donor declarations, public bodies, internal party transfers, nonpositive amounts or reviewed outliers. Property is OPAX's broad property/construction tag, not a reviewed developer-only list. Mining excludes the separate fossil_fuels tag.

Amounts below cover uncapped party receipts from the cached 1998-99 to 2024-25 annual data, using canonical party buckets. There may be fewer than five recipients. They exclude associated entities and candidates as recipients. The machine-readable report separately gives the capped graph numbers.

| Industry tag | Donation-only AUD | All-types AUD |
| --- | ---: | ---: |
| gambling | $4,152,439 | $12,343,894 |
| mining | $79,462,801 | $90,652,171 |
| property | $49,844,949 | $83,695,970 |
| unions | $78,098,936 | $210,513,010 |
| tobacco | $2,151,325 | $3,259,332 |
| finance | $39,059,336 | $203,671,178 |

| Industry tag | Top recipients, donation-only | Top recipients, all types |
| --- | --- | --- |
| gambling | Liberal $2,044,652; Labor $1,686,287; Nationals $371,500; LNP $50,000 | Labor $6,409,548; Liberal $5,332,306; Nationals $493,740; LNP $108,300 |
| mining | United Australia Party $61,988,301; Liberal $9,870,697; Labor $2,812,030; LNP $2,411,248; Nationals $2,108,525 | United Australia Party $62,900,932; Liberal $13,613,255; Labor $7,397,094; Nationals $3,326,342; LNP $3,112,548 |
| property | Liberal $26,669,924; Labor $19,990,255; LNP $1,564,000; Nationals $1,535,050; One Nation $57,720 | Liberal $36,174,596; Labor $34,182,976; LNP $8,737,755; Nationals $4,447,543; One Nation $107,720 |
| unions | Labor $74,594,600; Greens $2,606,036; Katter's Australian Party $499,000; Liberal $222,690; Nationals $130,110 | Labor $205,729,173; Greens $3,026,036; Liberal $1,038,508; Katter's Australian Party $499,000; Nationals $145,293 |
| tobacco | Liberal $1,316,365; Labor $470,260; Nationals $364,700 | Liberal $2,179,572; Labor $654,060; Nationals $425,700 |
| finance | Liberal $21,996,436; Labor $12,962,952; Nationals $2,176,116; LNP $1,154,491; Greens $672,341 | Labor $95,791,344; Liberal $80,315,511; Nationals $12,130,011; LNP $11,928,169; Greens $2,122,561 |

## Refresh and regeneration

`scripts/vm/nightly.sh` invokes `scripts/weekly_refresh.sh` for the weekly group, where `aec_receipt_types` now runs the non-destructive offline backfill before `x_money`. If backfill fails, the money export is held. No new AEC fetch schedule is introduced. Normal importer loads also retain types; re-import tests cover the actual offline command twice and require unchanged IDs, classifications, flags and typed raw-row counts.

```sh
uv run python -m parli.ingest.donations --db <local-review.sqlite> --cache-only --backfill-types
PYTHONPATH=. OPAX_DB=<local-review.sqlite> uv run python scripts/export_money_graph.py > <review-money.json>
PYTHONPATH=. uv run python scripts/report_aec_receipt_types.py --db <local-review.sqlite> --out <report.json>
```

The review database under ignored `staging/receipt-types/` was copied from read-only local SQLite inputs, with just the tables/columns required for this export. The shared 28.9 GB database was never modified. The full exporter was run before and after backfill and every legacy value was equal between those runs. The shared cache has newer public-money overlays and three different donor-party edge memberships from the shipped graph. For the committed artifact, the new typed measure was attached to the shipped graph using the same exporter helper, preserving every existing field and its ordering.

| Regenerated tracked file | Before bytes | After bytes | gzip bytes after |
| --- | ---: | ---: | ---: |
| portal/public/graph/money.json | 1,860,309 | 2,411,061 | 314,155 |
| docs/reports/2026-11-12-aec-receipt-types.json | new | 47,303 | 5,323 |

The graph remains below the 25 MiB per-asset limit. No other federal graph is used by receiptAnswer/isReceiptGraph: voice-money selects money.json for federal queries and money.qld.json, money.vic.json or money.tas.json for state queries. The money map and party register API read this same graph contract. The existing app-reader suite is included in the portal gate; the app catalogue currently omits money, so this repository has no dedicated app-API graph reader to change. No state graph, AEC extras, donor catalogue or app payload schema needed changing.

The research follow-up fixture fingerprint is re-pinned for the additive types and provenance note; all existing gold rows remain unchanged. Reader tests load the new graph through isReceiptGraph, the actual map buildGraph function and the party-money API, and reconcile each typed financial-year cell.

## Validation

- `uv run --with pytest pytest tests/test_aec_receipt_types.py tests/test_money_sources.py tests/test_money_associated_entities.py scripts/test_donor_disclosure.py -q`: 42 passed, 32 subtests passed. This includes repeated offline imports, schema migration, raw-file schema drift, exact matching, donor/recipient double-count prevention, stale-type removal, paused registry entries and holding the nightly export after a failed type backfill.
- Portal with Node 24.21.0: `npm ci`, `npx wrangler types`, `npm run build:release` and `npx tsc --noEmit` passed. The initial full test invocation exposed system Python dependency gaps and checks racing the release build. With the uv environment on PATH and release stamps settled, ordinary `npm test` passed 4,732 of 4,733 tests; the unrelated overview cancellation timing test passed immediately in isolation. `npm test -- --test-concurrency=4` then passed all 4,733 tests. This includes existing app-reader tests and the new typed graph, map and party-money API tests.
- `bash -n scripts/weekly_refresh.sh scripts/vm/nightly.sh` and `git diff --check` passed. All pre-existing graph values match the original after stripping only the three added fields. The raw annual CSV record count and amount reconcile exactly with the provenance table.
- Supplemental checks: the repository source-access guard reported 2,823 existing violations, with zero in lane changes; the changed-file guard passed. An additional unchanged nightly SEO test failed because its expected generated division fixture was absent. Neither unrelated area was changed.

Unrelated tracked release-build outputs were restored after verification. The importer/exporter implementation is commit `14e04fca0`; the graph, reader checks, pinned fixture and this report are in the following data commit. No push, deploy, production write, person link or AEC fetch was performed. Detailed gate logs and the isolated review database remain under ignored `staging/receipt-types/` in this worktree.
