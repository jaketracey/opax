# Ask bill lifecycle fields

The bill lane enriches the existing `find_records` tool. Ask and the public MCP use the same registry handler, so both receive the lifecycle fields and source facts without a new tool.

## Data path and changes

`scripts/bills_registry/bills_fetch.py` parses the ParlInfo billhome progress table into `bills_v2` and `bill_events`. `scripts/export_bills.py` projects those tables into `portal/public/bills/index.json` and `/bills/<key>.json`. The legacy projection reads `bills` and `bill_progress`. `scripts/build_search_catalog.mjs` indexes bill titles and summaries but does not carry their complete lifecycles.

`find_records` now reads the matched bill detail through its validated bill key. Results include `introduced`, `originating_house`, every recorded `key_dates` stage with date and house, `passed_both_houses`, `passed_both_houses_date`, `royal_assent`, `act_number`, linked `acts`, sponsor fields, portfolio and status. `lifecycle_available` distinguishes a missing detail from a valid record with unknown fields. Missing or conflicting lifecycle facts remain null. Status timestamps and a single chamber's third reading never supply missing dates or passage through both houses.

The writer receives facts from `citations[].text`, rather than the structured rows alone. Introduction and assent facts therefore contain the actual date first, using Australian date formatting. A compact chronology carries the remaining recorded stages. Sponsor names are readable while their source text remains available. Explicit private-member `(s)` sponsor notation is treated as sponsorship, including co-sponsors, rather than a department portfolio.

Assent rows can inherit the last parliamentary table heading. Structured stages preserve that recorded context; citation prose does not claim a chamber performed royal assent. The response retains complete bill lifecycles and drops whole trailing matches when needed to fit the shared Ask result budget. Its total, truncation flag and narrowing note disclose omitted matches.

The exporter now retains `event_raw` and emits explicit passage, assent and labelled Act-number fields in the detail and index. It only reads an Act number from labelled assent-event text. It does not decode an FRL identifier or infer a number from a year. The ingest no longer substitutes the earliest unrelated event for a missing introduction date.

## Rebuild requirements

Existing checked-in bill details already contain introduction, progress and linked-Act assent dates. The tool fix can use those immediately, without a data rebuild. Act-number text was retained in SQLite `bill_events.event_raw` but dropped from the static projection. Rebuild that projection with the updated exporter on the data box, where the existing registry database is available:

```sh
OPAX_DB="$HOME/.cache/autoresearch/parli.db" python3 scripts/export_bills.py --out /tmp/opax-bills-lifecycle
```

Retrieve the projection through the existing data workflow and review the resulting assets before release:

```sh
rsync -a desktop:/tmp/opax-bills-lifecycle/ portal/public/bills/
```

Use the existing publish workflow if the separate knowledge-box bill resources also need refreshing. The Ask/MCP handler reads the static detail directly, so it does not require a knowledge-box rebuild. No database migration is required. A missing original source field needs a source refresh before re-exporting; the updated ingest can also reprocess an available cached billhome response. ParlInfo acquisition remains paused by the existing HTTP policy, so this lane did not fetch new source pages or manufacture missing fields. No projection rebuild or publication was performed here.

## Baseline and validation

The supplied production baseline was inspected, without running new evaluations:

| Family | Pass | Partial | Fail |
| --- | ---: | ---: | ---: |
| bill.introduced | 0 | 23 | 2 |
| bill.royal_assent | 0 | 19 | 1 |
| bill.status | 20 | 8 | 2 |
| bill.sponsor | 13 | 7 | 0 |
| date.bills_on_day | 5 | 15 | 5 |

Exact date counts belong to the counts lane. This lane does not add date counting, change the shared writer, questions or grader, or claim a measured after score. Date-first citation facts and the tool description guide the writer; model prose ordering remains subject to the shared writing stage.

Focused portal tests verify lifecycle hydration, source preservation, unknown values, invalid dates, readable sponsors, result limits and identical Ask/MCP wire results. Focused Python tests verify registry and legacy projection, explicit Act-number extraction, conflict handling and removal of guessed introduction dates.

The repository has no `npm run typecheck` script. The equivalent check is `npx --no-install tsc --noEmit`, after generating the ignored local runtime declarations with `npx --no-install wrangler types`. No Wrangler dev server, local harness, evaluation, production request or deployment was started.

Final gate results:

- TypeScript: `npx --no-install tsc --noEmit` passed after local type generation. The requested `npm run typecheck` command was attempted but that npm script is absent.
- Bill tool tests: 15 passed, including authenticated MCP and Ask fact-sheet parity.
- Related portal record-tool, record-limit and bill tests: 12 passed.
- New Python lifecycle ingest/export tests: 8 passed. Existing sponsor, division and registry-refresh tests also passed.
- `npm test` ran once: 3,917 tests, 3,847 passed, 67 failed, 3 skipped. The scoped bill tests pass in this run. Other failures include absent ignored `search-catalog/05e52d2e22fdf327/`, `hubs/` and `crawl/sitemaps/` outputs, mismatched generated counts, dependent navigation/rendering checks, and two assertions in the unchanged `model-budget.test.mjs`. These failures were not repaired in this lane. No broad asset rebuild or second full run was attempted.
- `git diff --check` passed. No evals were run, as requested.

Local validation logs are retained under `portal/private/ask-v1/ask-p1-bills/` and excluded from the commit.
