# AEC receipt types, 12 November 2026

Fix round 1 also makes the map consume that typed measure and shares the row-selection rule with the uncapped comparison. The two Ask-owned source files remain unchanged in this lane.

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
| portal/public/graph/money.json | 1,860,309 | 2,410,933 | 314,248 |
| docs/reports/2026-11-12-aec-receipt-types.json | new | 47,217 | 5,461 |

The graph remains below the 25 MiB per-asset limit. No other federal graph is used by receiptAnswer/isReceiptGraph: voice-money selects money.json for federal queries and money.qld.json, money.vic.json or money.tas.json for state queries. The money map and party register API read this same graph contract. The existing app-reader suite is included in the portal gate; the app catalogue currently omits money, so this repository has no dedicated app-API graph reader to change. No state graph, AEC extras, donor catalogue or app payload schema needed changing.

The research follow-up fixture fingerprint is re-pinned for the additive types and provenance note; all existing gold rows remain unchanged. Reader tests load the new graph through isReceiptGraph, the actual map buildGraph function and the party-money API, and reconcile each typed financial-year cell.

## Initial validation

- `uv run --with pytest pytest tests/test_aec_receipt_types.py tests/test_money_sources.py tests/test_money_associated_entities.py scripts/test_donor_disclosure.py -q`: 42 passed, 32 subtests passed. This includes repeated offline imports, schema migration, raw-file schema drift, exact matching, donor/recipient double-count prevention, stale-type removal, paused registry entries and holding the nightly export after a failed type backfill.
- Portal with Node 24.21.0: `npm ci`, `npx wrangler types`, `npm run build:release` and `npx tsc --noEmit` passed. The initial full test invocation exposed system Python dependency gaps and checks racing the release build. With the uv environment on PATH and release stamps settled, ordinary `npm test` passed 4,732 of 4,733 tests; the unrelated overview cancellation timing test passed immediately in isolation. `npm test -- --test-concurrency=4` then passed all 4,733 tests. This includes existing app-reader tests and the new typed graph, map and party-money API tests.
- `bash -n scripts/weekly_refresh.sh scripts/vm/nightly.sh` and `git diff --check` passed. All pre-existing graph values match the original after stripping only the three added fields. The raw annual CSV record count and amount reconcile exactly with the provenance table.
- Supplemental checks: the repository source-access guard reported 2,823 existing violations, with zero in lane changes; the changed-file guard passed. An additional unchanged nightly SEO test failed because its expected generated division fixture was absent. Neither unrelated area was changed.

Unrelated tracked release-build outputs were restored after verification. The importer/exporter implementation is commit `14e04fca0`; the graph, reader checks, pinned fixture and this report are in the following data commit. No push, deploy, production write, person link or AEC fetch was performed. Detailed gate logs and the isolated review database remain under ignored `staging/receipt-types/` in this worktree.

## Fix round 1: selection, map reader and Ask handoff

Both graph attachment and the uncapped comparison now call `ReceiptSelection.exclusion` in `scripts/aec_receipt_selection.py`. The shared rule requires recipient-side, positive, itemised Political Party Return receipts, an exact unambiguous recipient-party mapping, no exact reviewed-outlier key, and no government/party-unit entity or public-funding/party-name donor spelling. A canonical entity's presence on the map never overrides an excluded raw donor spelling. The map's additional restriction is existing donor-party edge membership. Visible industry tags remain the released graph tags; uncapped tags use the documented canonical donor classification. There is no separate per-name exclusion policy.

The six Perth Trades Hall / Labor Business Roundtable rows are now excluded from both scopes. They remove $1,135,207 from visible typed all-types receipts, including $175,000 labelled Donation Received, all from the unions selection. Visible typed unions become $70,298,062 donation-only / $184,916,932 all types. Uncapped comparisons are unchanged. The graph now contains 16,063 eligible recipient rows. The regression `test_graph_and_uncapped_report_share_per_name_exclusions_for_an_on_map_entity` uses invented names with the six reviewed amounts and types, resolving an eligible spelling and a party-name spelling to the same entity; both production consumers exclude the same six rows and agree before the map cap.

`portal/graph/index.ts` projects typed fields through `windowFigures` and `receiptGraphView` before building geometry, summing an industry, rendering a card or reporting a filtered view. The full map offers “All receipt types” (default) and “Donation-only”. `receipt=donations` preserves donation-only in the URL. Year filters use the first year of `by_type_year` financial-year keys; event keys use their polling year, including the documented named by-elections. A dated selection excludes unassignable periods. CPI scales the selected typed year cells. Public awards and graphs without typed fields retain their previous semantics. The 2D fallback uses the same projection and offers the same measure choice. Empty typed objects mean zero eligible receipts and never fall back to legacy totals.

The actual map-conversion regression reproduces the review's gambling figures and all four party ranks:

| Map selection | AUD | Ranking |
| --- | ---: | --- |
| Gambling donations | 2,468,918 | Liberal 1,093,352; Labor 1,067,066; Nationals 258,500; LNP 50,000 |
| Gambling all receipt types | 8,668,512 | Labor 4,699,593; Liberal 3,538,879; Nationals 343,740; LNP 86,300 |
| Finance donations | 24,731,335 | Liberal 14,402,567; Labor 8,694,783; Nationals 1,335,985; LNP 270,000; Greens 28,000 |
| Finance all receipt types | 169,586,920 | Labor 82,267,799; Liberal 64,102,300; Nationals 10,982,297; LNP 10,209,821; Katter's Australian Party 1,017,881 |

A mounted-map regression switches the select control, checks the emitted amounts and card labels, then applies a financial-year filter. A separate year-window regression poisons legacy `total`, `byYear` and `undated` values and requires the amounts and counts from `by_type_year`. Existing API compatibility tests continue to check that released legacy fields retain their previous values.

The independent verifier `scripts/reconcile_aec_receipts.py` imports only Python standard-library modules. It reads cached `Detailed Receipts.csv` using csv/zipfile and Decimal, with existing DB classifications, identity mappings and review exclusions. It independently checks all 866 typed receipt edges and their financial-year/type amount/count cells, then compares uncapped and visible-map gambling and finance totals and top-five rankings with the regenerated report. Its output is `2026-11-12-aec-receipt-types-reconciliation.json`. No pipeline receipt calculation or production predicate is imported by the verifier.

Ask reader handoff, for im-ask-money-rank:

- Availability: `graph.meta.receipt_types.available === true`, with `schema === 1`. `graph.meta.receipt_types.donation_type` is the literal string `donation_received`.
- Lifetime amount: `edge.by_type` has shape `Record<normalised_AEC_receipt_type, AUD_number>`. Donation-only is `edge.by_type.donation_received ?? 0`; all receipt types is the sum of every value in `edge.by_type`. Do not use legacy `edge.total` for either typed measure.
- Period amounts and counts: `edge.by_type_year` has shape `Record<financial_year_or_event, Record<normalised_AEC_receipt_type, [AUD_number, row_count_integer]>>`. Financial-year keys are short form, such as `2024-25`. Sum the chosen type cells in the selected periods; lifetime row count is the corresponding count-cell sum over all periods. Use these cells for year filters, rather than legacy `byYear`. Event strings and undated periods are not financial-year strings; do not silently coerce them into a financial year.
- Type names in this cache are `donation_received`, `other_receipt`, `subscription`, `public_funding`, `unspecified` and `unknown`. Unknown means a blank source type. Missing donation cells mean zero recorded eligible donations. The cache has no explicit loan type; Other Receipt cannot establish lending or a donation.
- Only donor-to-party receipt edges belong in this measure. Never add grant/contract edges. Typed node cells sum the visible receipt edges; party legacy totals cover a wider selection. The graph remains a capped donor selection and cannot establish an exhaustive industry total.
- `total`, `count`, `byYear`, `firstYear`, `lastYear`, source references, node/edge membership and public-money overlays in money.json are unchanged for released readers. The two files owned by the Ask lane, `portal/src/voice-money.ts` and `portal/src/ask-money-industry.ts`, were not edited here.

Reproduce the independent check without fetching:

```sh
uv run python scripts/reconcile_aec_receipts.py --db staging/receipt-types/review.sqlite --legacy-graph staging/receipt-types/fix1-legacy-money.json --out staging/receipt-types/fix1-reconciliation.json
```

### Fix round 1 gates and self-review

Implementation commit: `0288bdd7f` (new commit; no amendments to the reviewed commits).

| Gate | Result |
| --- | --- |
| Lane and related Python tests | 43 passed, 32 subtests passed |
| `npm run build:graph` | Pass; map, explainer and shared chunks regenerated |
| `npx wrangler types` | Pass |
| `npm run build:release` | Pass |
| `npx tsc --noEmit` | Pass |
| `nice -n 10 npm test` with Node 24.21.0 and repository Python on PATH | 4,737 passed, zero failed or skipped |
| Focused map, fallback and research gold tests | 26 passed |
| Independent CSV/Decimal reconciliation | 866 receipt edges and all typed year/count cells match; uncapped and map gambling/finance totals and top-five rankings match |
| Legacy graph invariant | Removing only additive fields reproduces the original 1,860,309-byte released graph exactly |
| Changed-file source guard and final diff whitespace check | Pass |
| Ask ownership boundary | Both Ask-owned files are byte-for-byte unchanged |

| Acceptance item | Done, implementation and proof |
| --- | --- |
| 1. One selection rule | Done: both production paths call ReceiptSelection.exclusion. The six-row alias regression asserts equal exclusions, $1,135,207 all types / $175,000 donations removed, and equal uncapped/map values before the cap. |
| 2. Map reader | Done: windowFigures/receiptGraphView project typed fields for geometry, industry amounts, cards, year filters and the 2D fallback. Actual map conversion asserts the review's four-party gambling ranks and $2,468,918 / $8,668,512; mounted controls assert measure switching and year filtering. |
| 3. Regeneration and reconciliation | Done: money.json, report, fixture fingerprint and map bundles regenerated. The independent standard-library verifier checks gambling and finance and every typed receipt edge; the legacy-byte invariant proves released fields are untouched. |
| 4. Ask handoff | Done: exact field names, shapes, availability, missing-cell semantics and financial-year/event handling are listed immediately above. The Ask-owned files were not edited. |

| Regenerated artifact | Reviewed bytes | Fix round 1 bytes |
| --- | ---: | ---: |
| money.json | 2,411,061 | 2,410,933 |
| numerical report JSON | 47,303 | 47,217 |
| independent reconciliation JSON | new | 4,731 |
| money-map.js | 144,360 | 147,703 |
| explain.js | 58,132 | 58,132 |
| three shared graph chunks, combined | 700,514 | 706,827 |
| research follow-up fixture | 23,137 | 23,313 |

The graph chunk manifest and importer cache stamps were refreshed with the map bundle. Unrelated release-build outputs were restored; map importers retain only their map-related stamp changes and the required downstream stamps. No new source fetch, push, deployment or production write was performed. Local logs are under ignored staging/receipt-types/fix1-* files. Integration with the Ask-owned reader changes remains the orchestrator's separate lane dependency before publication.
