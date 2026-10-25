# Ask receipts: Round 3 review

Reviewed baseline `e234e96f144d99605baca2d4ca5b8ac6e9f00437` on `web/ask-loans-receipts`. This is an interim wording correction. The importer, classifications, export cells and money amounts are unchanged. Nothing was pushed or deployed; no production requests or paid model calls were made.

## Findings, fixes and tests

| Finding | Fix | Verification |
| --- | --- | --- |
| P1: findings were only annotations | `withReceiptWording` now rewrites complete receipt sentences, checks the result again, and drops any remaining unsafe sentence. Uncited extra assertions are checked too. `withAnswerLanguage` applies this boundary even without a question string, across JSON, SSE, cached responses and fallbacks. Stream deltas are withheld until the final payload is checked. | Parameterised boundary tests include “has given Labor $90,000,000” and “is donating $90,000,000”, cached JSON/SSE, both question/no-question wrappers, citation bounds, and an unknown sentence that must be dropped while its safe lead survives. All 158 replay outputs have zero receipt-wording findings. |
| P1: superlatives and synonyms | The shared guard and writer rule cover donor/superlative framing, donations, gave/given/giving, donate forms, fund/funder/funding, bankroll, backer, contributor/contribution, gifts and sponsor. Overview and research verifiers reject these claims; the final boundary repairs or removes them. Literal evidence names and requests to give a person's full name are preserved. | `receipt-framing.json` supplies 28 variants and a follow-up. Every variant is rejected by overview/writer checks and enforced across response formats. A separate follow-up fixture exercises the final boundary. |
| P2: donor profile labels | “Given (disclosed)” becomes “Received by parties (disclosed)”; “Donations counted” becomes “Receipts counted”. Other labels over these totals were corrected in the directory, topic cards, reports, quiz, receipt ledger, words-per-dollar view and grant cross-references. Amount expressions, layout, sort keys and table data schemas remain unchanged. | Profile/directory wording guard, existing browser/directory tests, and a grep of public JS/HTML. Remaining `giving` occurrences are internal journey variable names; remaining “given to” occurrences are comments. Classified itemised-donation series and source-coverage explanations retain their proper labels. |
| P2: garbled migrations | Removed the generic verb-sized substitutions. Recognised sentences use whole predicate templates; amount units stay attached. Unknown syntax is dropped. Old cached “receipts to the most money to …” and split “$90 … million” forms have explicit repairs. Receipt source direction, dangling continuations and doubled commas are repaired. | Unit tests cover amount units, superlatives, unknown syntax and the old cached defects. The replay checks number tokens and complete currency literals, and checks all original 46 after-answers for the reported grammar defects. All 46 were reviewed; all sentences and citations are in the full local report. |
| P2: voice lending | Federal receipt tool answers include the exact mixed-receipts sentence. Lending/loan/debt questions return an honest limitation with a separate AEC debt-record citation: balances owed at 30 June, not new lending, and only the latest year's named largest creditors. They do not return a mixed-receipt amount as lending. | Voice fixtures exercise both `search_records` and `find_connections`, including the exact Westpac lending question and the bank-loan control. A receipt control still returns $55,227,183 with the mixed-receipts sentence. |

Tests are in `portal/test/receipt-wording.test.mjs`, `voice-money.test.mjs` and `fixtures/receipt-framing.json`. Existing wording assertions were updated in `ask-money.test.mjs` and the coherence review/structural tests; their scope, preservation and figure assertions remain intact.

## Before and after

The direct Labor receipt lead and its $55,227,183 / 500-record values remain unchanged from Round 2. The saved follow-up `r4/FOLLOW-D07-T3` changes from:

> Westpac Banking Corporation was the source of disclosed receipts to the most money to Labor in this published selection.

To:

> Westpac Banking Corporation was the source of the largest disclosed receipts to Labor in this published selection. These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.

The saved Hanson follow-up `r4/FOLLOW-D01-T1` changes from:

> Westpac Banking Corporation received the most disclosed receipts in 1998–99 to 2024–25, with $161,787. These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.

To:

> Westpac Banking Corporation was the source of the largest disclosed receipts in 1998–99 to 2024–25, with $161,787. These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.

The profile example changes from “Given (disclosed) $105.8m / Donations counted 1,091” to “Received by parties (disclosed) $105.8m / Receipts counted 1,091”. The same expressions calculate and render both figures.

The exact voice lending question now says:

> The published records cannot establish how much was lent. Federal debt records report balances owed at 30 June, not new lending, and name only the latest year’s largest creditors. Mixed receipt totals cannot establish loan amounts.

Its citation is `/graph/aec-extras.json`, labelled “AEC debt records: balance owed at 30 June; latest year only”.

## Replay and local probes

Against `e234e96f1`, **28 of 158 answers change**. All changes are receipt wording, grammar or citation offsets. There are **zero** numeric changes, currency-unit changes, non-money changes, unsafe receipt claims or repeat-pass differences. The original 46-answer set is separately checked: **46/46 pass** the grammar checks. This round's 28 differences overlap that original set; they are not 28 additional answers to add to 46.

Every difference and its one-line reason is in [replay-differences.md](replay-differences.md); machine results are in [replay-summary.json](replay-summary.json). All original 46 after-answers, every changed before/after answer, remapped citations, the five full eval answers and voice outputs are in the local [full report](../../../portal/private/ask-receipts-round3/report-full.md).

The full report retains identities already present in the saved payloads. It is excluded from commits to honour the constraint against naming private individuals in commits, tests or fixtures. The committed evidence contains case IDs and aggregate checks.

The five offline research-harness probes pass: the exact Labor “gives” question, Labor “donates”, Liberal “funds”, the Hanson question and the bank-loan question. These run the calculated research tool, fallback writer and final boundary with local assets and network disabled. They are fixture/harness evaluations, not fresh provider generations. See [eval-summary.json](eval-summary.json) and the full local report for complete answers and citations.

Reproduce with:

```sh
node scripts/ask_receipts_replay.mjs /path/to/saved/replay.json portal/private/ask-receipts-round3
node scripts/ask_receipts_eval.mjs --offline portal/private/ask-receipts-round3
```

## Public wording audit

Corrected receipt labels were found in these views:

- `/subject/donor/:name`: disclosed amount, record count and rank label.
- `/subject/donor`: receipt counts, receipt-count sort and recipient filter.
- `/subject/topic/:slug`: federal receipt totals and source ranking.
- `/reports/:slug`: money-map description and monetary corpus-stat label.
- `/explore?game=quiz` and `/explore?game=wd`: receipt totals, questions and explanatory labels.
- `/money/receipts`: recipient-party CSV header and AEC source label.
- `/money/grants` and `/money/grants/:jurisdiction/recipient/:id`: receipt CSV labels and government-timing cross-references.
- The explore card in `index.html` and its generated SPA shell.

`public/` grep found no remaining user-facing “Given (disclosed)”, “Donations counted”, “Most donations”, “Party given to”, “Parties funded” or “disclosed donations” label over these unclassified totals. Journey implementation variable names, personal-name parsing and source statements about disclosure thresholds are not monetary gift claims.

## Gates and integrity

- `npm ci`: passed.
- `npm run build:search`: passed before the full suite.
- Full portal suite: **3,708 passed, zero failures**.
- `npm run check`: passed.
- Standalone `tsc --noEmit`: passed.
- `wrangler deploy --dry-run`: passed; no deployment.
- `git diff --check`: passed.
- `votes.json`, `pay.json`, all four receipt graphs, the debt export and both donor indexes: byte-identical to the reviewed baseline. Hashes: [data-integrity.json](data-integrity.json).

The generated search manifest, statute-title source count and party-members build churn were restored after verification, before committing. Necessary asset stamps and the SPA shell accompany the wording changes.

Model spend: **US$0.000000 of US$0.50**. Zero provider calls, zero production requests. See [spend.json](spend.json). The source gift/loan classification remains unavailable in the current graph; no classification or importer work was started.
