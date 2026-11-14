# Row 173 merge-forward and uncapped bracket recovery

Merges main `fdba7591835bd9937da77d6417a29dd27879f312` into `im/ask-money-uncapped`. The orchestrator ruling supersedes the earlier stop report: the reviewed $891,049 / 23-receipt pin is retained. No private individual name is hard-coded in this report, code or tests.

## Fix and scope

`ReceiptDonorMatcher` now supplies an explicit uncapped `bracket_folds` operation using its existing bracket normalisation, candidate indexes and state guard. Its default drawing lookup is unchanged. The full receipt exporter folds a bracket-bearing canonical label into exactly one plain base of the same known resolver kind (individual versus organisation; the existing industry tag is the fallback when resolver kind is unavailable). Kind cannot break a base tie. Multiple bracket-only identities without a plain anchor also remain ambiguous. All eligible recipient identities participate before factual totals are published; map membership does not choose a base.

Folded aliases, each typed receipt/year cell and party flows move to the base once. Canonical base industry supplies the one factual industry; declarations, loans and public funding never become donations. The drawing data and source/identity tables are unchanged. The export supports `recover_brackets=False` for a same-corpus audit baseline; the money build always uses the default enabled recovery.

Row 169 failed because its saved fixture served only the drawing path. It now serves the same typed fixture from the uncapped path, retaining all nine status, total/split, declaration, Other Receipt/loan, wording, shortened-name, period and zero-model assertions. Named-source `money_totals` lookups retain their live all-receipt default; explicit donation requests and party/industry rankings use donations.

## Whole-source census

| Category | Entities |
| --- | ---: |
| Bracket-bearing recipient entities | 459 |
| Bracket-split entities with another base/variant | 116 |
| Folded | 89 |
| Ambiguous; retained and listed | 12 |
| Different or unavailable kind; retained | 15 |
| State mismatch | 0 |
| No other base; retained | 343 |

The 89 folds move **$8,152,511 / 261 typed receipts** between source identities. Every party `by_type` and `by_type_year` cell is identical before and after recovery: no gift is added, removed or counted twice. The [complete audit JSON](2026-11-14-uncapped-bracket-folds.json) lists every decision (including all 12 ambiguous entities and candidate hashes), the fold ledger, the independent pre-fold SQL industry recount and all post-fold industry/party values. Hashes identify private samples instead of names.

## Five checks by eye

The source/base spellings were inspected locally. Each differs only by complete bracketed text; remaining tokens match its unique plain base and recorded kinds agree. The first sample is the reviewed individual; the other four are organisations. No unbracketed middle token, company suffix or branch word was removed. Dates and amounts remain exactly as disclosed.

| Source hash prefix | Kind | Source amount / receipts | Base before | Base after all its folds |
| --- | --- | ---: | ---: | ---: |
| `67f7398ce741` | individual | $65,000 / 4 | $826,049 / 19 | $891,049 / 23 |
| `58924f826f87` | organisation | $3,783,325 / 2 | $1,415,322 / 16 | $5,198,647 / 18 |
| `b1bace8d3b69` | organisation | $445,000 / 8 | $265,000 / 6 | $710,000 / 14 |
| `370ff949fe76` | organisation | $350,000 / 3 | $200,000 / 1 | $550,000 / 4 |
| `d6378c128950` | organisation | $304,196 / 13 | $75,000 / 1 | $427,646 / 18 |

The individual’s four recovered receipts cover FY starts 2013, 2014 and 2016. Its result is **$891,049 / 23 all-type receipts**, comprising **$881,049 / 22 donations** and **$10,000 / 1 Other Receipt**. All existing row-160 numeric assertions are unchanged; additional assertions check the donation split.

## Reconciliation and re-pins

The refreshed export uses the read-only local main corpus `/tmp/ldp/scratch.db`, which reproduces every current main drawing edge’s typed amount/year cells. The pre-fold independent SQL audit (`report_aec_receipt_types.report`) reconciles all six audited industries exactly. A separate fold ledger accounts for every subsequent canonical-industry movement. The historical 12 November audit is preserved; the uncapped regression now reads this current, reconciled audit.

- Gold M05: Labor mining donations $2,812,030 → **$2,792,030**. The refreshed cached recipient cells type the $20,000 difference as **Other Receipt**, rather than Donation Received; its all-type receipt remains. Gold is refreshed offline with `--money-only`; the other four gold money cases and speech facts do not change.
- Retail donations $7,525,586 → **$7,532,586**: a $7,000 bracket-source flow moves to its base’s canonical retail industry; the ledger records the complete equal-and-opposite industry movement. Wesfarmers still counts once under agriculture.
- Factual party-table source pins: Liberal **7,827** and Labor **9,811**. On the same current corpus, before folding they are 7,855 and 9,865; recovering aliases consolidates 28 and 54 source rows respectively. Counts of receipts and all party amounts are unchanged by folding.
- Current factual all-types totals: Liberal **$403,316,945 / 16,038 receipts**; Labor **$579,163,899 / 33,220 receipts**. These replace the earlier branch snapshot, $403,545,081 / 16,043 and $579,045,428 / 33,218. This is a current-main recipient-cell refresh, separate from alias folding. Main’s newly shared annotation exclusion removes one $190,322 Liberal Donation Received restatement; current cached type cells and the full independent recount account for the remaining changes.
- Fossil-fuel donations remain **Liberal $1,961,350; Labor $981,002**. Gambling and tobacco donation pins remain unchanged.

Browser, SSR, register API, person-profile buckets/fallback and actual D1-backed CSV must agree on the new factual rows and all-type scope. Separate assertions retain the drawing cap. Main’s h2 headings and extra off-map heading test are preserved; stamps, spa-shell, search and growth caches are rebuilt.

## Gates

- `cd portal && npx tsc --noEmit`: **passed**.
- Affected money, donor, party table and row-169 suites: **540 passed, zero failures**, including every unchanged row-160 numeric assertion and all nine row-169 tests.
- Python money, matcher and disclosure suites: **107 passed, 608 subtests passed**. Tests cover a separately resolved bracket individual, kind mismatch, unknown kind, two-base ambiguity, bracket-only ties and identical exported receipt cells with or without drawing membership.
- Ask replay (offline fixture models): **17 passed, zero failures**; no provider requests.
- Full `PATH="$PWD/.venv/bin:$PATH" npm --prefix portal test -- --test-concurrency=4`: **4,968 tests; 4,957 passed, 11 skipped, zero failures**, 375.7 seconds. Both live/reviewed regression suites also passed in this full run.
- Stamps, spa-shell, donor-index freshness, staged diff checks and private-name check: **passed**. The private-name check covers 92 changed code, test and report files; public receipt datasets retain their source-published names.
- Load5 was checked before test gates. The full run waited while load5 exceeded 40, then started at **39.83**. No additional test suite was launched while it exceeded 40.

No production, provider/model or SSH calls. The only network operations are the requested Git fetch/push.
