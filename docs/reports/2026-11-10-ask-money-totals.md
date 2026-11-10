# Ask money totals, 10 November 2026

This lane adds `money_totals` to the shared Ask and public MCP registry. It sums disclosed receipts for a party, donor or donor-to-party connection over one financial year or an inclusive range, ranks parties or donors by total, and returns chronological annual totals. Grant recipient totals are also available through `grants` using `recipient` and `aggregation: total`. Expenses and state register amounts moved to the separate `ask-p1-expenses` lane and were not changed here.

## Receipt sources and calculation

The source is `portal/public/graph/money.json`, generated on 18 October 2026, covering financial years 1998-99 to 2025-26. A `byYear` cell is `[AUD, receipt count]`, keyed by the financial year's starting year. Period sums exclude undated rows; lifetime totals use the published `total` and `count` and disclose any undated records.

Party totals use party nodes, which cover the full cleaned party receipt set. Adding displayed donor edges would undercount parties because those edges cover the graph's selected donors and exclude internal transfers. Donor totals across parties use donor nodes; donor-to-party totals and rankings within a party use donor edges. Grant and contract edges are never counted as political receipts.

| Party and FY | Full party node | Displayed donor edges |
|---|---:|---:|
| Labor, 2003-04 | $38,631,230 | $14,443,211 |
| Country Liberal Party, 2017-18 | $136,000 | $0 |
| Nationals, 2009-10 | $2,345,784 | $1,089,741 |

All 90 money-graph ground-truth references used by the receipt families matched the current assets during source inspection. This is a data reconciliation, not an answer evaluation.

Party nodes include internal party transfers and exclude public funding identified by reported donor name. Donor nodes and flows exclude internal party transfers, public funding and the other exclusions documented in the graph metadata. Donor rankings cover the published selection of 250 largest lifetime donors plus qualifying recipients of public money. Election returns can use polling or event year rather than a normal annual financial year. Independently rounded node and edge amounts can differ by a dollar.

## Grant sources

Recipient lookup uses `/graph/grants.federal.json` or `/graph/grants.qld.json`, followed by the indexed `/grants/<jurisdiction>/shard-XX.json`. A recipient's `t` and `c` are complete totals; `by` holds financial-year amount and count cells. Totals never sum the truncated list of largest awards.

The new recipient path preserves existing grant-list behaviour. It rejects unsupported query, state and electorate filters rather than dropping them. An ambiguous recipient produces choices; an absent recipient does not imply zero funding. Private recipients are excluded. Commonwealth values are grant award values, not payments; Queensland values are annual grant and assistance expenditure lines. Calendar or partial-year requests return a financial-year coverage limitation.

## Ask integration

The registry supplies identical tool schemas and aggregate JSON to Ask and MCP. Tool descriptions route receipt sums and total rankings to `money_totals`. Each citation starts with the named subject and headline amount, and includes its financial-year label and exact period boundaries so the writer can retain the figure's owner and dates.

The shared constraint adapter converts receipt FY end dates to their starting-year keys. Calculated coverage describes the selected period, with full source coverage retained separately. Grant recipient names containing a state no longer acquire an unintended location filter; dated largest-grant lists retain their existing calendar-year filters.

## Validation

The updated shared plan prohibits local harness and `research_eval` runs. Neither was run, no Wrangler dev server was started, and no request was made to production.

The repository has no `npm run typecheck` script. After `npm run types` generated the ignored Worker declarations, its equivalent `npx tsc --noEmit` passed. Focused tests for the new tools, Ask routing constraints and existing record-tool behaviour passed, 66 of 66. The money tool tests verify actual in-process MCP calls and writer claim ownership and period retention.

The single portal-wide `npm test` run completed with 3,858 passed, 70 failed and three skipped (3,931 tests, 169 seconds). Three failures were static public MCP tool-list expectations needing `money_totals`; those assertions were updated and checked individually. The other failures include missing generated search shards, crawl/sitemap files and hub data, stale statute-title metadata, and two model-budget assertions. These were not rebuilt or changed in this lane. Full output is in `/tmp/ask-p1-money-npm-test.log`; TypeScript output is in `/tmp/ask-p1-money-typecheck.log`. The full suite was not run again.

The existing production baseline is provided for the lead's later evaluation:

| Family | Pass | Partial | Fail |
|---|---:|---:|---:|
| date.financial_year | 0 | 11 | 14 |
| trend.party_receipts | 0 | 1 | 14 |
| money.top_donor | 8 | 0 | 7 |
| money.grants | 8 | 10 | 7 |
| trend.donor_rank | 7 | 0 | 3 |

After-change answer grades and the regression spread remain for the lead's final evaluation once the lanes are combined. This lane makes no measured pass-rate claim.

The lead's local harness also needs to expose `/grants/<jurisdiction>/shard-XX.json` during that evaluation. Its current slim asset directory excludes `grants`, while its bulk asset fallback only serves bills and divisions. Production and the in-process unit fixtures use the normal published shard paths. No harness changes or runs were made in this lane.

## Writer handoff

The writer lane owns `research-writing.ts`. Its existing coverage renderer collapses receipt caveats into selected-donor boilerplate even for full party-node totals. The new tool's structured notes distinguish these scopes, and monetary claim atoms retain the owner and complete period; the writer should retain that distinction when its shared wording changes are combined.
