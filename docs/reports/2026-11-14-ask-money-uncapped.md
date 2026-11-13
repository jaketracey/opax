# Ask money rankings independent of the map cap — 14 November 2026

Branch `im/ask-money-uncapped`, based on `origin/main` at `d15bd2706`.

## Source inventory

“Capped” describes donor/edge membership, not an amount truncated within an edge. Federal donation facts now read `graph/money-receipts.json`, generated alongside the drawing graph. `graph/money-industry-totals.json` is the small public industry/party donation summary (about 4 KB). The calculation export retains donor identities and year/type cells because Ask also answers donor and dated follow-ups.

| Surface and figures | Before | After |
| --- | --- | --- |
| Ask deterministic rankings, industry answers, party/donor comparisons, annual changes, shares, counts and contextual source lists (`ask-money*`, `voice-money`) | Capped `money.json` typed edges; all receipt types only as separately labelled context | Uncapped typed recipient selection; Donation Received ranks; explicit all-type receipts remain separately labelled |
| Ask `money_totals`: donor/flow/industry amounts and ranks | Capped edges and donor typed nodes | Uncapped typed recipient cells; default donation ranks, explicit all-types receipts available |
| Ask `money_totals`: party totals/ranks and annual series | Uncapped **legacy** party nodes (wider all-record set including transfers, rather than the typed recipient selection) | Uncapped party typed cells from ReceiptSelection, same donation measure as flows |
| Ask browser industry panel: total, source count, source and party bar rankings | Capped typed all-type graph | Uncapped donation-only view; explicit donation scope |
| Factual donor/party profile lookup and browser money lists | Capped graph plus off-map disclosure index | Uncapped receipt graph; actual mini-map mounts still use the capped drawing file |
| Ask research `party_receipts` / `partyDonations`: donor ranks, industry-to-party ranks, annual totals, counts and other-receipt lines | Capped typed edges | Uncapped typed edges; donations for giving/funding, labelled all-types for receipt questions |
| Ask entity-profile receipt section | Capped typed edges for linked donor IDs | Uncapped typed edges for those linked identities |
| Explain industry/party totals, yearly peaks, source/recipient ranks, comparisons and industry breakdowns | Capped typed receipt edges, all types | Uncapped donation cells for industry and party summaries; named-donor explanations retain labelled all-type receipt totals |
| Explain recipient-share denominator | Uncapped party own-return cells / AEC return aggregates, separate from the capped numerator | Same own-return denominator, full-selection numerator |
| Quiz industry-most, industry-magnitude and party-from-industry | Capped donor/edge all-type receipts | Uncapped Donation Received totals, labelled donations |
| Quiz donor figure, order, higher/lower and report's top source | Capped typed donor all-type totals (report supplies only industry membership) | Uncapped typed all-type donor receipts, still labelled receipts |
| Quiz party peak year and its amount | Uncapped legacy party `byYear` | Uncapped recipient Donation Received year cells |
| Explicit donor-declaration-only fallback; public-funding payer context | Raw capped-map declarations/public-funding cells, labelled separately and excluded from receipt/donation ranks | Retained labelled context only; never added to donation rankings |
| Public funding and declared debts from AEC extras | Full return aggregates, separate from gifts; debts are balances, not matched loans | Unchanged |
| State Ask/Explain figures | State graphs' selected map edges, without federal typed receipt semantics | Same state map selection; scope says the map shows only the largest donors |
| Actual map, map cards, map Connections, journeys, homepage map fallback and map crawl summary | Capped drawing graph | Same cap and amounts; totals carry “on the map, which shows only the largest donors” |

Other quiz templates use report speech counts/timelines, roster/portraits and published corpus/year summaries, rather than money edges. Ask's grants, contracts, expenses and pay tools read their own published records; this change does not substitute receipt totals for those measures.

## Selection and audit

The new exporter calls `aec_receipt_selection.ReceiptSelection.exclusion` for every recipient row, including `receipt_type`, and applies **no map membership test**. Donation ranks use only `donation_received`: public funding, loans and Other Receipt are never donations. Donor-side declarations are cross-checks, never additions. The canonical industry algorithm is the existing audit's algorithm. Source sheets and `scripts/aec_*` selection code are unchanged.

All six industries in `2026-11-12-aec-receipt-types.json` match exactly: gambling, mining, property, unions, tobacco and finance, including their full totals and top-five recipient amounts. That report's displayed list omits fossil fuels. The companion JSON runs its unchanged algorithm with `fossil_fuels` added to the displayed sectors; it records both the capped map and uncapped results.

## Re-pins

### Fossil-fuel regression (lifetime, 1998–99 to 2024–25)

Every change below restores eligible recipient receipts from sources outside the drawing cap, including Linc Energy. Industry tags follow the audit's canonical classification. No source record changed.

| Recipient | Capped donations | Uncapped donations | Capped all-type context | Uncapped all-type context |
| --- | ---: | ---: | ---: | ---: |
| Liberal | $807,000 | $1,961,350 | $2,773,580 | $5,409,009 |
| Labor | $249,975 | $981,002 | $3,708,132 | $6,776,642 |
| LNP | $0 | $218,399 | $27,375 | $578,774 |
| Nationals | $25,000 | $184,999 | $90,610 | $340,812 |
| Katter's Australian Party | $0 | $150,000 | $0 | $150,000 |
| Greens | $0 | $1,500 | $0 | $1,500 |
| Country Liberal Party | $0 | $0 | $0 | $0 |
| Libertarian Party | $0 | $0 | $0 | $0 |
| Total | $1,081,975 | $3,497,250 | $6,599,697 | $13,256,737 |

Liberal's share changes from 75% to 56%; Labor's from 23% to 28%, because the denominator now includes the full selection. The retained all-type contextual column is labelled “mostly other receipts”, never inferred loans.

### Gold M01, M02 and M04: Liberal source ranks

All three cases ask who donated/gave most. Their old October snapshot ranked legacy all-record totals; the new fixture ranks uncapped recipient Donation Received cells. Their speech counts and vote facts are preserved, and the new `--money-only` refresh runs before credentials/network setup.

| Place | Previous source and figure | Re-pinned source and figure | Reason |
| --- | --- | --- | --- |
| 1 | Westpac Banking Corporation: $40,608,922, 433 records, [1998, 2024] | Pratt Holdings Pty Ltd: $10,034,400, 60 records, [1998, 2024] | Donation-only recipient receipts replace legacy all-record receipts; uncapped membership |
| 2 | Vapold Pty Ltd: $33,999,963, 43 records, [1999, 2024] | The 500 Club: $7,148,196, 70 records, [1999, 2021] | Donation-only recipient receipts replace legacy all-record receipts; uncapped membership |
| 3 | National Australia Bank: $20,896,422, 182 records, [1998, 2024] | Vapold Pty Ltd: $6,969,513, 17 records, [1999, 2017] | Donation-only recipient receipts replace legacy all-record receipts; uncapped membership |

The legacy `donors_not_named` bucket (58 donors / $59,159,890) is removed: the current disclosure contract retains source names, and a withheld-name legacy bucket is neither a donation rank nor a compatible measure.

### Gold M03: Gambling recipient ranking

Every changed figure replaces a legacy capped all-record sum with uncapped recipient Donation Received. Zero-donation recipients no longer occupy a rank.

| Recipient | Previous | Re-pinned |
| --- | ---: | ---: |
| Liberal | $9,024,407 | $2,044,652 |
| Labor | $10,763,834 | $1,686,287 |
| Nationals | $1,558,802 | $371,500 |
| LNP | $530,324 | $50,000 |
| One Nation | $3,000 | $0 |

### Gold M05: Mining recipient ranking

Every changed figure replaces a legacy capped all-record sum with uncapped recipient Donation Received. Zero-donation recipients no longer occupy a rank.

| Recipient | Previous | Re-pinned |
| --- | ---: | ---: |
| United Australia Party | $155,465,435 | $61,988,301 |
| Liberal | $17,280,120 | $9,870,697 |
| Labor | $7,611,596 | $2,812,030 |
| LNP | $4,091,841 | $2,411,248 |
| Nationals | $4,589,204 | $2,108,525 |
| Libertarian Party | $0 | $250,000 |
| Katter's Australian Party | $201,000 | $170,000 |
| Family First | $300,000 | $100,000 |
| One Nation | $30,000 | $2,000 |

M03's recipient leader changes from Labor to Liberal; its first two `amounts` are the new top two rows above. Its separate speech leader remains Liberal. M05's mining leader remains United Australia Party, so the stored four-speech fact remains valid for the same party.

### Money period and quiz assertions

- The fossil-fuel “since 2023” / last-three-years / last-year tests now rank donations instead of asserting their absence: smaller donors were absent from the old cap. Their independent oracle reads the uncapped asset; named Santos donation-free behavior remains covered.
- Labor gambling changes over the recent-years window are re-pinned to $15,000 / 1 donation in 2022–23 and $34,000 / 3 in 2024–25, a $19,000 increase. The old capped test asserted $0 at both endpoints.
- On the retained drawing snapshot used by the cross-surface unit fixture, quiz finance industry totals change from $169,602,626 all-type receipts to $24,731,335 donations. Donor receipt questions retain their original all-type amounts. Industry scope assertions now say Donation Received; the production quiz reads the full export.
- The model-budget routing pin changes from Liberal gambling donations of $1,093,352 to $2,044,652 because its Worker reads the full export.
- The invented associated-entity industry test includes the $9,999 flagged source instead of excluding it, so mining becomes $10,179 and ranks ahead of property $400; association flags describe a source rather than removing its money, matching the map and audit rules.
- Most primitive money tests deliberately inject the previous capped snapshot as a fixture under the new asset path. Their numeric pins stay unchanged; `money-uncapped.test.mjs` separately tests the full production export, audit reconciliation, tool party/industry totals, Explain, quiz, gold and the original date-reading regression.
- `subject-figures.test.mjs` moved from `portal/src/` to `portal/test/`, with imports fixed. No `*.test.*` file remains anywhere under `portal/src/`.

### Fossil-fuel period readings

These five period-reading cases share two windows. The old capped register held no donations in either window and ranked Other Receipt instead. The full selection restores actual Donation Received rows. The two columns deliberately name their different measures.

| Financial years | Recipient | Previous capped Other Receipt | Uncapped donations |
| --- | --- | ---: | ---: |
| 2022–23 to 2024–25 | Labor | $642,190 | $59,535 |
| 2022–23 to 2024–25 | LNP | $0 | $33,000 |
| 2022–23 to 2024–25 | Liberal | $189,400 | $22,000 |
| 2024–25 to 2024–25 | Labor | $189,200 | $55,865 |
| 2024–25 to 2024–25 | LNP | $0 | $33,000 |
| 2024–25 to 2024–25 | Liberal | $91,900 | $22,000 |

## Gates

- Python money tests: 69 passed plus 605 subtests.
- Money, Ask, quiz and moved subject-figure Node suites: 1,510 passed. A further 28 directory, discovery and uncapped-export tests passed, including the new capped-map loader regression.
- TypeScript (`npm run typecheck`): passed, after generating local Wrangler types.
- Graph build, `stamp_assets --check`, staged stamp-file tracking and `git diff --check`: passed.
- Existing money build CLI: wrote both companion exports; all industry/party donation totals match the committed summary.
- Full `npm test` at concurrency 4 with `.venv/bin` on PATH: **4,862 passed, 11 skipped, zero failures** (4,873 total; 295.3 seconds).

Fresh-worktree test prerequisites were generated locally: hubs, Victorian election, search catalogue, growth modules, report catalogue and crawl catalogue. A timing-only person-verification failure passed in isolation; a parliamentarians directory timeout passed in isolation and in the final full run after load settled. No unrelated timing assertion was relaxed. Full runs checked `/proc/loadavg`; no full run was started with load5 above 40.

Reproduce the companion exports through the existing build (read-only local database):

```sh
PYTHONPATH=. OPAX_DB=<local-db> .venv/bin/python scripts/export_money_graph.py \
  --receipts-out <uncapped-receipts.json> --industry-totals-out <industry-totals.json> > <drawing-map.json>
node scripts/agentic_ask_gold.mjs --money-only
```

All commands are local; no provider/model, production, SSH, push or deployment calls.
