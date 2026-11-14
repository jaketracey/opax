# Ask row 182: shared clauses and the named finding

Base: `2445af686` on `origin/main`, including #372. The fixture is a minimal projection of the saved 14 November live answer: answer, citation ranges, cited source fields, scope and a compact research trail. No live Ask request or model call was made for this change.

## 1. Near-repeat merge

The old merge compared whole sentences. The speech date and report date differed, the first sentence carried a second clause attributed to Thwaites, and the provenance restriction separated speech and record sources. The shared opening also used different commissioner appositions, `examined`/`investigated`, and the scheme's short name.

The existing dedupe step now compares shared opening clauses as well. It normalises those equivalent appositions and the named scheme's short reference before applying the existing overlap, entity, figure, qualification and word-order rules. It retains the distinct dated tails and transfers the citation onto wording the cited speech actually holds. An opening attached to an inherited-subject tail remains in place if removing it would leave a fragment; the fuller wording is retained.

Before, the two openings were:

> The Royal Commission into the Robodebt Scheme (Commissioner Catherine Holmes AC SC) examined who was responsible for the scheme; Kate Thwaites told the House of Representatives on 7 August 2023 ...

> The Royal Commission into the Robodebt Scheme, whose Royal Commissioner was Catherine Holmes AC SC, investigated who was responsible for robodebt and delivered its final report on 7 July 2023.

After, Thwaites's dated statement and quotation remain. The commission/commissioner investigation claim appears once, in the fuller second sentence. The speech citation also anchors `Royal Commission into the Robodebt Scheme` there, alongside the original record citations.

## 2. Who lead

The saved trail shows `speech-1551171` read in round 7 before `answer` in round 8. This was not a retrieval miss. The saved pre-writer sources contain record facts; the speech points are appended after the record writer. The final shape therefore has to order the assembled answer.

The actor extractor missed the parenthetical full name followed by a relative clause in the answer, and the honorific/surname plus `allowed` predicate in the speech. It now recognises those forms and joins an unambiguous honorific/surname to the existing public person index. Each candidate still needs support from its cited source. The who shape chooses the named finding before the authority fallback, so repeated normalisation preserves the same order.

The first sentence now begins `Bill Shorten told the House on 31 July 2023` and includes Scott Morrison, the source's `allowed Cabinet to be misled` finding and ministerial responsibility. The existing sentence is moved intact, with its speech citation and attribution. No liability claim is added. The cache version advances to `written-answer-30-clause-who`.

## Offline replay

| Measure | Saved | Repaired |
| --- | ---: | ---: |
| Characters | 2,126 | 1,997 |
| Paragraphs | 10 | 10 |
| Citation IDs | 12 | 12 |
| Citation spans | 12 | 13 |
| Cited source cards | 11 | 11 |

The extra span keeps the speech's original attributed statement separate from its citation on the merged clause. Source order is unchanged. These are tidying and ordering changes in the existing steps; no answer-blocking check was added.

Ten new cases in `ask-near-repeats.test.mjs` cover the saved merge and who lead, JSON/SSE equivalence, repeated normalisation, both sentence orders, source support, changed figures/dates/commissioners and retention of fuller wording with a dependent tail. Isolated source reverts reproduce four merge failures, two who-lead failures and one repeated-ordering failure; the other 20 selected assertions pass across those runs.

## Gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Focused near-repeat, grant-guard and dedupe tests | PASS: 98 tests |
| All `ask-*` and `research-*` tests, including `ask-replay` | PASS: 1,930 tests, no failures or skips |
| Full portal `npm test` through the Mac slot wrapper at concurrency 4 | PASS: 5,027 tests, no failures or skips |
| Isolated source reverts | PASS: seven expected assertion failures and 20 passing controls |
| Asset stamp check and `git diff --check` | PASS |

The initial worktree bootstrap exposed missing search shards and stale generated money buckets. Rebuilding those from the current tracked inputs restored the corresponding tests. A clean full run passed 5,026 tests before the final grammar-preservation case; the final 5,027-test run above verifies the completed source and tests. Generated assets and logs stay local; tracked public files are unchanged.
