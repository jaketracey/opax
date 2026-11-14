# Ask who-lead: review 4

This round starts at `80af9ec5e0042eba121bb29b0cb80bd04cceac76` on `im/ask-near-repeats-2`. The offline differential uses actual main source pinned at `ca800951eb3d906bd0e8d9bbdb8bd3d36918ea12`. No live Ask request, real model call, simulator, Android run or SSH was used.

The round-3 subject-negation additions are removed. Positive `not only` findings and unrelated denied-claims clauses remain eligible. The parenthetical guard now checks the matched proposition, including a clearance immediately attached to its member role, rather than scanning unrelated earlier text. Existing role/conduct handling from main remains.

Source kind now precedes finding words in both existing-answer ordering and source-copy ordering. A record-supported candidate outranks a speech-only candidate; finding language and named subjects break ties within the same kind. Existing supported member statements stay eligible. The source-copy finding restriction remains, and unsuitable source prose is not copied into a new lead. When that prose does name an actor, the full answer stays intact without adding a false statement that no cited source names anyone. This reuses the existing actor extraction and adds no new vocabulary or answer-blocking check.

| Review item | Regression evidence | Isolated revert |
| --- | --- | --- |
| P1: remove broad negation | Four full-boundary cases in `ask-near-repeats.test.mjs`: `not only`, two unrelated denied-claims clauses, and scoped parenthetical wording. | Restoring the round-3 negation code fails all four. |
| P2: source kind before wording | Both orders of the ANAO criticism versus Cabinet record case, plus saved row 182, in `ask-who-differential.test.mjs`. | Restoring the previous score fails all three. |
| Differential non-regression | 99 cases from all review rounds, including five ordinary controls, through actual main and branch `withAnswerLanguage`. | The ordering revert fails three cases; removing the false no-name repair fails the two titled-source cases. |

## Differential method and case table

Main was fetched once and its tracked source archived into a private snapshot. The main and branch lockfile blob is identical (`30d1d15c3361c70404df751feef59fa02b709f9e`). Both implementations were bundled with the same installed dependencies and run through `withAnswerLanguage` with network fetch forbidden. The actual main answers and citation ranges are saved in `portal/test/fixtures/ask-who-differential/main.json`; the case inputs and retention assertions are in `cases.mjs` beside it. The ordinary test run needs neither Git history nor network access.

All 99 cases pass: zero added no-name lines absent on main, zero lost distinct input statements, zero lost citation IDs, valid citation ranges, and zero speech-only displacements of a record finding that led on main. The five ordinary answers are byte-identical. Retention normally pins each complete original paragraph. The two saved robodebt inputs instead pin their distinct facts and dated tails, allowing the explicitly requested duplicate-claim merge. Source copies added by main are not original answer statements and may be omitted where they are political attacks or duplicate an existing sentence.

The table shows the source kind of the first substantive sentence, excluding the uncited no-name line. A change from record metadata to a speech carrying a supported finding is allowed; a record finding already first on main may not be displaced by a speech-only lead. Every row also checks statement and citation retention.

| Case | Coverage | Main lead | Branch lead | Result |
| --- | --- | --- | --- | --- |
| `r1-source-names` | Source recovery | record | record | PASS |
| `r1-no-subject` | No responsible subjects | record | record | PASS |
| `r1-unicode-move` | Named finding and Unicode | record | record | PASS |
| `r1-partial-name-support` | Partial name support | record | record | PASS |
| `r1-negative-role-0` | Original role negation | record | record | PASS |
| `r1-negative-role-1` | Original role negation | record | record | PASS |
| `r1-negative-role-2` | Original role negation | record | record | PASS |
| `r1-negative-role-3` | Original role negation | record | record | PASS |
| `r1-negative-role-4` | Original role negation | record | record | PASS |
| `r1-speech-recovery` | Attributed source recovery | speech | speech | PASS |
| `r2-colon-attack-0` | Source assertions and colon attack | speech | speech | PASS |
| `r2-colon-attack-1` | Source assertions and colon attack | speech | speech | PASS |
| `r2-parenthetical-0` | Parenthetical negation | record | record | PASS |
| `r2-parenthetical-source-0` | Parenthetical source negation | record | record | PASS |
| `r2-parenthetical-1` | Parenthetical negation | record | record | PASS |
| `r2-parenthetical-source-1` | Parenthetical source negation | record | record | PASS |
| `r2-parenthetical-2` | Parenthetical negation | record | record | PASS |
| `r2-parenthetical-source-2` | Parenthetical source negation | record | record | PASS |
| `r2-parenthetical-3` | Parenthetical negation | record | record | PASS |
| `r2-parenthetical-source-3` | Parenthetical source negation | record | record | PASS |
| `r2-shared-Fadden` | Shared surname | record | record | PASS |
| `r2-shared-Bennelong` | Shared surname | record | record | PASS |
| `r2-authority-fallback` | Unnamed authority fallback | record | record | PASS |
| `r2-near-tail-it` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-it` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-It` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-It` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-they` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-they` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-They` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-They` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-he` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-he` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-He` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-He` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-she` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-she` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-She` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-She` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-this` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-this` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-This` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-This` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-these` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-these` | Exact-opening pronoun tails | record | record | PASS |
| `r2-near-tail-These` | Near-repeat pronoun tails | record | record | PASS |
| `r3-exact-tail-These` | Exact-opening pronoun tails | record | record | PASS |
| `r3-mckenzie-anao` | McKenzie and ANAO | speech | speech | PASS |
| `r3-body-0` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-0` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-1` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-1` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-2` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-2` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-3` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-3` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-4` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-4` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-5` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-5` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-6` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-6` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-7` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-7` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-8` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-8` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-9` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-9` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-10` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-10` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-11` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-11` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-12` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-12` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-13` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-13` | Finding-body source recovery | speech | speech | PASS |
| `r3-body-14` | Finding-body relay | speech | speech | PASS |
| `r3-body-source-14` | Finding-body source recovery | speech | speech | PASS |
| `r3-existing-statement-0` | Existing member statements | speech | speech | PASS |
| `r3-existing-statement-1` | Existing member statements | speech | speech | PASS |
| `r3-surname-duplicate` | Existing surname sentence | record | speech | PASS |
| `r3-that-negation-0` | Round-3 negation rollback | record | record | PASS |
| `r3-that-negation-1` | Round-3 negation rollback | record | record | PASS |
| `r3-that-negation-2` | Round-3 negation rollback | record | record | PASS |
| `r3-titled-colon` | Titled colon attack | speech | speech | PASS |
| `r3-lowercase-tail` | Lowercase semicolon tail | record | record | PASS |
| `r4-positive-0` | Not only and unrelated clauses | record | record | PASS |
| `r4-positive-1` | Not only and unrelated clauses | record | record | PASS |
| `r4-positive-2` | Not only and unrelated clauses | record | record | PASS |
| `r4-positive-3` | Not only and unrelated clauses | record | record | PASS |
| `r4-criticism-false` | ANAO criticism versus record | speech | record | PASS |
| `r4-criticism-true` | ANAO criticism versus record | speech | record | PASS |
| `robodebt-original` | Saved original robodebt | record | record | PASS |
| `robodebt-182` | Saved robodebt 182 | record | record | PASS |
| `ordinary-date` | Ordinary controls | record | record | PASS |
| `ordinary-count` | Ordinary controls | record | record | PASS |
| `ordinary-cost` | Ordinary controls | record | record | PASS |
| `ordinary-committee` | Ordinary controls | record | record | PASS |
| `ordinary-division` | Ordinary controls | record | record | PASS |

## Saved robodebt answers

| Measure | Original saved answer | Current answer |
| --- | ---: | ---: |
| Original robodebt paragraphs | 11 | 7 |
| Original robodebt citation IDs / spans | 13 / 13 | 13 / 13 |
| Row 182 characters | 2,126 | 1,997 |
| Row 182 paragraphs | 10 | 10 |
| Row 182 citation IDs / spans | 12 / 12 | 12 / 13 |
| Row 182 cited source cards | 11 | 11 |

All 16 existing replay answer strings are byte-identical to `80af9ec5e`. The dedupe and pronoun implementation is unchanged in this round. Row 182 still has one Holmes reference, all ten repaired paragraphs byte-for-byte, identical source cards in the same order, and identical literal text under every citation compared with `80af9ec5e`.

The requested record-first rule conflicts with the requested row-182 whole-answer identity gate: the Cabinet sentence is record-backed, while the Morrison sentence is cited only to Shorten's speech. Applying record-first therefore puts the Cabinet finding first and retains the attributed Morrison finding below. This follows the explicit ranking change and the differential requirement against main. The whole answer and rebased ranges are consequently not byte-identical to `80af9ec5e`; no case-specific exception was added. The answer SHA-256 changes from `9feab51ba9b760964b2cc6dd1829ee41e49c553cd6ede4d8e8ba868bddb775c3` to `ee943dc7ec41082e46e73c53baec5d25780e598ac25828b3f21b874cfec57028`.

Before, the first paragraph was:

> Bill Shorten told the House on 31 July 2023 that the commission went to the role of the member for Cook (Scott Morrison), who as social services minister first took robodebt to cabinet in 2015, and that Commissioner Holmes found he 'allowed Cabinet to be misled' and 'failed to meet his ministerial responsibility to ensure that Cabinet was properly informed'.

After, the first paragraph is:

> The commission found the Scheme was approved by Cabinet and proceeded without the legislative change to support income averaging that DSS had said was needed.

Both paragraphs remain exactly as written, with their original citations. The sorted-paragraph digest is pinned in the regression test, so another wording or omission change cannot masquerade as reordering.

## Gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Focused near-repeat, differential, grant guard and dedupe suites, including MN-GRNT-014 | PASS: 266 tests |
| All `ask-*` and `research-*` suites, including `ask-replay` | PASS: 2,098 tests, no failures or skips |
| Differential against pinned current main | PASS: 99 cases plus table-completeness test |
| Existing replay answer comparison | PASS: 16/16 byte-identical to `80af9ec5e` |
| Row 182 whole-payload identity | CHANGED: record-first ordering; paragraphs, literal citation text and source order retained |
| Isolated source reverts | PASS: four P1 failures, three P2 failures and two false no-name failures on isolated reverts |
| Full portal `npm test`, Mac slot wrapper, concurrency 4 | PASS: 5,195 tests, no failures or skips |
| Asset stamp check and `git diff --check` | PASS |

Tracked public files are unchanged. Private snapshots, logs and complete before/after payloads remain under `portal/private/ask-near-repeats-2/review-4/`.
