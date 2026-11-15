# Ask money review fixes — 14 November 2026

Note 1 is `c8c96ca3e6cb193ffd12bf6f2522d3955ad1e48b`. Before starting the P2 work, split and pushed only `im/offmap-donor-hotfix` at `f88e590f34ba20236e6ce529b207cdf509730bed`, then merged it into `im/ask-money-uncapped` in `741d377ec`. The hotfix selects recipient records directly with ReceiptSelection, independently of the ranking asset. Its [report and complete impact ledger](2026-11-14-offmap-donor-hotfix.md) give the cause, 512 changed donor pages, $17,913,193.63 gross removed / $17,807,993.63 net removed, and the five largest corrections. No Ask branch push or deployment.

## Sources after review

The complete before/after inventory for Ask, Explain, quiz and map figures is in the [original source table](2026-11-14-ask-money-uncapped.md#source-inventory). These review corrections complete the factual party-table migration:

| Figure or output | Current source and measure | Cap |
| --- | --- | --- |
| Ask money rankings, tools, industry panels, research money answers; Explain industry/party figures; quiz industry/party donation questions | `money-receipts.json`, selected recipient Donation Received cells | Uncapped |
| Explicit all-type receipt questions, named-donor Explain and quiz receipt questions | Same graph, all selected receipt types, labelled receipts | Uncapped |
| Public industry/party donation summary | `money-industry-totals.json`, canonical industry and Donation Received | Uncapped |
| Party browser table, server-rendered table, `/api/register/party-money` | `money-receipts.json` through `partyMoneyData`; all receipt types | Uncapped |
| Person profile's factual party table | Growth buckets built from `money-receipts.json`, or the same full graph as fallback; all receipt types | Uncapped |
| Party table CSV, `/api/table/party-money` | D1 rows built from `money-receipts.json`; all receipt types, with the table's scope stored in metadata and printed in the filtered CSV | Uncapped |
| Retained off-map donor export, index and browser/server page | Recipient-side `aec_receipt_records` through ReceiptSelection; all included receipt types named | Uncapped |
| Party own-return headline and Explain recipient-share denominator | Separate party own-return cells / AEC return aggregates | Uncapped |
| Actual map, cards and Connections drawing list | Existing `money.json` | Capped; total scope names the map and largest-donor limit |
| State figures | Existing jurisdiction graphs and their existing scope | Existing map selection |

Donation rankings count only Donation Received: Other Receipt, Loan and Public Funding never become donations. Donor declarations are never added to recipient totals. The source sheets, `scripts/aec_*` selection rules, drawing graph and small industry-summary amounts are unchanged.

## Four fixes and tests

1. **Canonical industry.** Remove the drawing-only `group` from donor nodes in the factual export; factual industry membership and breakdowns use `industry`. Preserve drawing groups in `money.json`. The Python export regression gives a donor a conflicting drawing group, asserts a single canonical industry and verifies the input graph remains unchanged. `money-review-fixes.test.mjs` tests a synthetic two-group donor in Explain, comparisons and the Ask panel, then reconciles real retail/other/agriculture with the independent summary. Wesfarmers counts under agriculture once.
2. **Party output agreement.** Switch SSR, register API, D1 table build/CSV and person-profile buckets/fallback to the full recipient selection already used by the browser. Connections still reads the drawing graph. Store the all-type scope in table metadata and carry it through the real CSV endpoint/client; amount/count headings read Received/Receipts. The new integration test compares every source amount/count for Liberal and Labor across browser hydration, actual Worker SSR (with a poisoned capped asset), register API and actual SQL-backed CSV, plus person bucket/fallback tables. It separately asserts that Connections retains its cap. Existing table and party-bucket parity tests now use the factual source.
3. **Tool citation measure.** Party/year citations say donations or receipts according to the selected measure, including the count unit; notes and scope carry the same measure. The new test covers two parties, both measures and party/year groupings. Legacy party fixtures without a selected typed party series keep their supported all-types measure.
4. **Explain scope.** Pass donation-only to the primary scope label for donation figures. The new DOM regression checks both industry-to-party and party explanations; a named Linc explanation remains explicitly all types at $357,799.

## Figure pins and reasons

| Pin | Previous | Corrected | Reason |
| --- | ---: | ---: | --- |
| Explain retail donations | $8,658,686 | $7,525,586 | Remove $1,133,100 from the duplicate drawing-group classification; Wesfarmers belongs to canonical agriculture |
| Explain other-industry donations | $88,495,319 | $74,095,001 | Canonical membership removes $14,400,318 assigned to a different factual industry; matches the unchanged summary |
| Liberal factual table / CSV | 250 sources; $201,548,942; 3,354 receipts | 7,856 sources; $403,545,081; 16,043 receipts | Restore eligible recipient receipts outside the drawing cap; all-types measure unchanged |
| Labor factual table / CSV | 300 sources; $359,997,697; 11,312 receipts | 9,866 sources; $579,045,428; 33,218 receipts | Same uncapped recipient selection as the browser; all-types measure unchanged |

The original gold and donation-ranking re-pins remain as [documented with each reason](2026-11-14-ask-money-uncapped.md#re-pins). Fossil-fuel donations still reconcile exactly with the audit algorithm: Liberal **$1,961,350** and Labor **$981,002**, versus capped **$807,000** and **$249,975**. Linc remains **$357,799 / 9 selected receipts**, including **$294,999 / 5 Donation Received** and **$62,800 / 4 Other Receipt**; Nimrod remains **$500,000 / 1 Donation Received**. No new receipt accounts for those off-map corrections.

## Gates

- Python money and donor suites: **76 passed, 608 subtests passed**.
- TypeScript: **passed**.
- Asset stamps and donor-index freshness: **passed**.
- Both uncapped public exports reproduce exactly from the read-only cached receipt corpus. `money.json` and `scripts/aec_*` match main; no drawing group remains in the factual donor export.
- Affected money, Ask, donor, party/person table, growth, CSV and subject-figure Node suites: **1,666 passed, zero failures**.
- Follow-up party-bills, party receipt totals, register tables, sponsor summaries and new review regressions: **39 passed, zero failures**; TypeScript passed again after the merge-note restoration.
- Full `PATH="$PWD/.venv/bin:$PATH" npm --prefix portal test -- --test-concurrency=4`: **4,895 tests; 4,884 passed, 11 skipped, zero failures**, 209.4 seconds.
- `/proc/loadavg` checked before the affected and full runs; load5 was **11.63** before the initial full run and **15.43** before the clean final run, below the required 40 threshold.

The initial full run exposed one merge regression (the existing sponsor-only party page's missing-roster note) and four outdated fixture/pin assertions: two register-API fixtures still required the capped asset path, the D1 test still pinned capped party row counts, and the sponsor growth fixture omitted the newly required full receipt graph. Restored main's roster note and updated those source fixtures and counts, retaining separate assertions for the capped Connections list. No assertion or timeout was loosened.

All data/build/test operations are local. The normal release table build/reload must publish the new party-money rows and scope metadata together; no production database writes or requests were made. No model or SSH calls. `subject-figures.test.mjs` remains under `portal/test/`; no `*.test.*` file remains under `portal/src/`.
