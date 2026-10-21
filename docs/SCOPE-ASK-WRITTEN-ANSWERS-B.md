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
