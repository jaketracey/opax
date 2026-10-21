# Ask written answers B

Baseline: `6b021dc84`, branch `web/ask-written-answers-b`. Read the live r4 review and the excluded fix-5 scope report. Changes are confined to the selected-evidence audit and its regression tests. No production requests, Ask requests, model calls, push or deployment. Spend: **US$0**.

## Fixes

1. **Roster identity and speaker ownership.** `personName()` uses public roster names and canonical slugs from the existing generated `person-paths.js` index, plus selected speaker/recipient fields. All 1,618 names in `parliamentarians.json` are present in that index. Removed the word-based person/title exclusions and the Bill/Act/Fund word-based title exemption. Selected titles and record identities establish document subjects. Personal quotations require the source speaker, including when a person is also the figure recipient. Existing attribution checks for unresolved reporting subjects remain enabled.
2. **Budget versus payment.** Budget, allocation and appropriation figures have a distinct `budget` metric. Payment/receipt predicates cannot turn that metric into a payment or receipt, including on structured records. Supported budget ownership remains attached to the amount, restoring the unlabelled office-budget statement that r4 deleted.

`portal/test/research-written-answers-b.test.mjs`: **44 tests, 344 response-boundary checks**, covering JSON/SSE × ordinary/fallback metadata × cache/miss. Name checks cover the exact Bill Shorten substitution, his own speech, canonical speaker slug, selected Bill/Act/Report titles and an explicit recipient who is not the speaker. Budget checks cover paid/received/secured/got/given against all three labels, on speech and structured-record evidence, plus supported labelled and unlabelled budgets. The focused set with existing audit and r3 preservation tests passes **93/93**.

## Saved-payload replay

The reviewed r4 population is retained in `acceptance-r3/comparison-final.json`: its 40/5/5 correctness and 0/530 audit reconcile with the r4 review. `acceptance-r4/comparison-final.json` has since been overwritten by the excluded prototype run (`a68321df...`, 32/8/10 correctness). It is replayed separately as a supplemental control and does not define the acceptance bar.

Inputs were copied read-only into `portal/private/ask-written-answers-b/`. The private `replay.mjs` bundles baseline source directly from `git show 6b021dc84` and B source in memory. It passes each identical saved payload through both final guards and the unchanged `research_eval_grade.mjs` grader. Network fetch is disabled in the replay. Full payloads, per-case audit atoms, citation maps, changed-sentence lists and grades are in `replay.json`; input paths and SHA-256 hashes are in `inputs.json`.

| Population | Payloads | Citation keys lost/gained, r4 → B | Changed sentences, r4 → B | Axis differences |
|---|---:|---:|---:|---:|
| Reviewed r4 finals (`acceptance-r3`) | 50 | 0/0 | 0 | 0 |
| Reviewer r2 inputs (`acceptance/comparison-final.json`) | 50 | 0/0 | 0 | 0 |
| Excluded prototype finals (`acceptance-r4`), supplemental | 50 | 0/0 | 0 | 0 |

**Complete replay difference list: none.** GOLD-M03 retains five citation keys and RESEARCH-H01 retains two on the reviewer r2 inputs. No saved answer was regenerated.

| Recomputed metric, reviewed 50 | r4 | B |
|---|---:|---:|
| Correctness pass/partial/fail | 40/5/5 | 40/5/5 |
| Citations pass/partial/fail; n/a | 39/0/1; 10 | 39/0/1; 10 |
| Date/constraint pass/partial/fail; n/a | 23/0/0; 27 | 23/0/0; 27 |
| Correct decline decision | 49/50 | 49/50 |
| Audit findings/atoms | 0/530 | 0/530 |
| Saved p95 latency | 19.121 s | 19.121 s |
| Saved mean cost | US$0.00277353 | US$0.00277353 |

For the r2 inputs, both guards produce correctness **39/5/6**, citations **38/0/1 + 11 n/a**, dates **23/0/0 + 27 n/a**, declines **48/50** and audit **0/523**. These are the older population's grades, not the reviewed-r4 acceptance bar. The supplemental prototype population also has identical r4/B grades and **0/207** audit findings.

Latency and cost are unchanged by construction: all request timings and model usage are saved values. This replay measures no new end-to-end latency and invokes no model. Zero findings on the saved population is separate from the new targeted reproductions.

The targeted r4/B controls in `targeted-differences.json` show exactly the requested changes:

| Control | r4 | B |
|---|---|---|
| Avery speaking; Bill Shorten named in snippet; answer `Bill Shorten said "I support the bill".` | False quote and `selected/t/body/0` retained | Unsupported clause and citation removed |
| `Avery Example: $100,000 office budget.` → `Avery Example was paid $100,000.` | False payment and `selected/t/body/0` retained | Unsupported clause and citation removed |
| Snippet and answer `Avery Example has a $100,000 office budget.` | Supported statement and citation deleted | Statement and `selected/t/body/0` retained |

## Optional organisation-name cleanup

Deferred. The saved mining finals do not contain the reported live CFMEU sentence, and a local supported control containing `from the Construction, Forestry, Mining and (CFMEU).` survives final cleanup intact. The exact truncation was not isolated to clause/punctuation cleanup within this lane. No cleanup change was made.

## Gates

- `npm ci` in `portal/`: pass.
- Full portal suite, `node --test --test-concurrency=4 test/*.test.mjs`: **2,575/2,575 pass**, no skips.
- `tsc --noEmit`: pass.
- `npm run check`: pass.
- `wrangler deploy --dry-run --outdir private/ask-written-answers-b/worker-dry-run`, metrics disabled: pass; no upload.
- `git diff --check`: pass.
- `votes.json` and `pay.json`: byte-identical to `6b021dc84`; full hashes are retained in private `bytes.json`.

The fresh worktree initially lacked generated search/crawl/hub assets. Prepared them locally using `build_search_catalog.mjs`, `build_hubs.mjs`, `build_vic_election.mjs`, then `build_crawl_catalog.mjs` after the hubs existed. The final complete suite runs against those generated assets. Restored the generated search manifest to its original bytes after testing; no generated public changes are committed. Logs and exit-code receipts are in private `gates.json` and the adjacent log files.

Elapsed before committing: **7.8 minutes**. New model calls: **0**. Spend: **US$0**. No production requests, push or deployment.

## B fix 1 — preserve payments near budget references

Reviewed `review-ask-written-answers-b.last.md` against B baseline `3379a8c92`. The four new speech/record reproductions first failed on that baseline. Figure classification now limits relationship lookup to the containing sentence/clause and the text since the preceding figure. It uses the governing financial/budget predicate or an attached amount label, with the same rules for evidence and answer text. Removed the evidence-wide budget override.

**Decision:** `Avery Example was paid $100,000 from the office budget.` establishes a payment of $100,000. The budget is its funding source. The supported payment and citation survive, as they do when a separate sentence describes a $200,000 office budget. Budget-only evidence continues to reject paid/received/secured/got/given claims and to retain genuine budget statements.

Four added tests cover both reviewer snippets on speech and structured-record sources across JSON/SSE × fallback/ordinary metadata × cache/miss: **32 boundary checks**. The focused audit, r3 preservation, acceptance and B suites pass **106/106**. Existing budget-negative and supported-budget controls remain enabled and pass.

Replayed **50 reviewed r4 payloads from acceptance-r3 and 50 reviewer r2 payloads** through baseline r4 (`6b021dc84`) and the corrected guard, with network fetch disabled. **Zero changed sentences, zero citation-key differences, zero full-grade-object differences**. The reviewed-r4 metrics remain correctness **40/5/5**, citations **39/0/1 + 10 n/a**, dates **23 pass + 27 n/a**, declines **49/50**, audit **0/530**. Saved p95 **19.121 s** and mean cost **US$0.00277353** are unchanged; there are no model calls or new performance measurements. Per-case payloads, audit atoms and full grades are in `portal/private/ask-written-answers-b/fix1/replay.json`.

Fix-1 gates: `npm run build:search` **passes**, followed by the **full portal suite: 2,579/2,579 pass**, zero failures/skips (`node --test --test-concurrency=4 test/*.test.mjs`). `tsc --noEmit`, `npm run check`, the Worker dry run and `git diff --check` pass. `votes.json` and `pay.json` remain byte-identical to `3379a8c92` and the live-code baseline. Logs, exact commands, exit-code receipts, replay details and byte hashes are retained in `portal/private/ask-written-answers-b/fix1/`.

The search build regenerated the tracked search manifest and party-member index as local test inputs. Restored those two generated files to their original bytes after testing; the commit contains only the audit fix, four regression tests and this report update. To reproduce the complete suite, run `npm run build:search` first. No production requests, model calls, push or deployment.

## B fix 2 — retain budget scope across intervening figures

Reviewed `review-ask-written-answers-b-r2.last.md` against `ce0e1e0dd`. The two requested snippets (`office budget for 2 staff of $100,000` and `office budgets of $50,000, $100,000 and $200,000`) first fail their added tests on that baseline. Budget relationships now carry across earlier figures in the same sentence/clause when no new predicate governs the current amount. Explicit financial predicates retain precedence. This changes only the budget-scope fallback; the previous payment-preservation and name-attribution rules remain enabled.

Four new speech/record tests exercise the two snippets across JSON/SSE × fallback/ordinary metadata × cache/miss: **32 boundary checks**. Both false payments and their citations are removed. The focused audit, r3, acceptance and B suites pass **110/110**.

Re-ran the existing reviewers' r1/r2 controls, both earlier payment reproductions, Bill Shorten/Bill Tilley/Michaelia Cash speaker/possessive/title controls, and only the two new snippets: **74 controls / 592 B boundary checks**, also compared with live r4, original B and fix 1 (**2,368 engine/path checks**). All **70 earlier controls** retain their expected result. The only changes from fix 1 are the two new snippets on speech and record sources.

| Control class | Live r4 | Final B |
|---|---:|---:|
| Unsupported controls rejected | 2/40 | 40/40 |
| Supported controls retain exact answer and citation | 33/34 | 34/34 |

Both existing r4 rejections remain rejected. B additionally rejects 38 unsupported controls and restores the previously documented supported unlabelled office-budget statement. No supported control loses text or a citation. Full inputs, outcomes and comparison results are in private `fix2/review-controls.json`.

Replayed **50 reviewed r4 payloads (`acceptance-r3`) and 50 reviewer r2 payloads**, in memory through live r4 (`6b021dc84`) and final B, with network fetch disabled: **zero changed sentences, zero citation-key differences, zero full-grade-object differences**. Audits remain **0/530** and **0/523**, respectively. Reviewed-r4 correctness remains **40/5/5**, citations **39/0/1 + 10 n/a**, dates **23 pass + 27 n/a**, and declines **49/50**. Saved p95 **19.121 s** and mean cost **US$0.00277353** remain unchanged by construction. Receipts are in private `fix2/replay.json`.

Fix-2 gates: `npm run build:search` **passes**, followed by the **full portal suite: 2,583/2,583 pass**, zero failures/skips. `tsc --noEmit`, `npm run check`, the Worker dry run and `git diff --check` pass. `votes.json` and `pay.json` are byte-identical to `ce0e1e0dd` and live r4. Restored the two generated tracked assets after the complete suite; no generated public-data changes are committed. Reproducing the suite requires `npm run build:search` first.

Logs, per-case control comparisons, replay payloads/grades, byte hashes and exit-code receipts are retained in `portal/private/ask-written-answers-b/fix2/`. Elapsed before committing: **3.5 minutes**, within the 20-minute limit. No production requests, model calls, push or deployment. Further budget wording variants remain in lane C.
