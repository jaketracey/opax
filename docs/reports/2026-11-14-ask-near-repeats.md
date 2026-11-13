# Ask near-repeat and who-lead regression, 14 November 2026

Offline replay of the saved 07:31 answer after #363. No live Ask request or model call was made. The fixture retains the saved answer, source text, citations and coverage, without the usage and research telemetry.

| Measure | Before | After |
| --- | ---: | ---: |
| Paragraphs | 11 | 7 |
| Citation IDs | 13 | 13 |
| Citation spans | 13 | 13 |
| Cited source cards | 10 | 10 |

The costly-failure finding, the establishment and report dates, the Cabinet approval and the Ombudsman finding each appear once. All original citation IDs and spans survive. The shorter quotation gives way to the fuller narrative; its citation covers only the shared costly-failure phrase. The liability coverage note is retained.

#363 required almost identical word sets and therefore missed these paraphrases. The former authority rule only replaced a speech or inquiry-metadata opening. This answer already opened with a commission finding, so that rule never checked whether it answered who.

The saved cited evidence names Cabinet as approving the scheme. It does not identify the individual ministers referred to in the motion; the person mentioned as cleared is not promoted as responsible. The repaired lead names Cabinet in the approval role recorded by the commission. Separate invented-person fixtures recover names omitted by the writer and require a cited source for every name.

## Before

The Royal Commission into the Robodebt Scheme found that the scheme was a costly failure of public administration, approved by Cabinet and proceeded without the legislative change the Department of Social Services had said was needed to support income averaging.

Bill Shorten moved in the House of Representatives on 10 August 2023 that the House accept the royal commission's findings regarding the former ministers involved in the design and implementation of the scheme, and apologise to victims and frontline Centrelink staff.

The Royal Commission was established by Letters Patent on 18 August 2022, with Catherine Holmes AC SC as Royal Commissioner, and reported on 7 July 2023.

In its report, the commission concluded that the Ombudsman was deliberately misled, which gave the government further opportunity to resist scrutiny by using his report as a shield.

The Royal Commission's report made 57 recommendations, of which 56 were numbered; the Australian Government's response referred to 56 recommendations, and no government response or implementation document is held.

The commission described the scheme in its own words as "a costly failure of public administration, in both human and economic terms.".

The Royal Commission into the Robodebt Scheme was established by Letters Patent on 18 August 2022, with Catherine Holmes AC SC as Royal Commissioner, and reported on 7 July 2023.

The commission found the scheme was a costly failure of public administration and that it was approved by Cabinet and proceeded without the legislative change DSS said was needed to support income averaging.

The commission concluded that the Ombudsman was deliberately misled, giving the government further opportunity to resist scrutiny.

Zali Steggall told the House on 11 March 2026 that the National Anti-Corruption Commission's investigation into the robodebt referrals found two public officials engaged in serious corrupt conduct and cleared four others, including former prime minister Scott Morrison.

Mary Doyle told the House on 1 August 2023 that the royal commission led by Commissioner Catherine Holmes had delivered answers for the more than 500,000 victims of the former Liberal government's unlawful robodebt scheme.

## After

Cabinet approved the scheme, which proceeded without the legislative change the Department of Social Services had said was needed to support income averaging; the Royal Commission into the Robodebt Scheme found it was a costly failure of public administration.

Bill Shorten moved in the House of Representatives on 10 August 2023 that the House accept the royal commission's findings regarding the former ministers involved in the design and implementation of the scheme, and apologise to victims and frontline Centrelink staff.

In its report, the commission concluded that the Ombudsman was deliberately misled, which gave the government further opportunity to resist scrutiny by using his report as a shield.

The Royal Commission's report made 57 recommendations, of which 56 were numbered; the Australian Government's response referred to 56 recommendations, and no government response or implementation document is held.

The Royal Commission into the Robodebt Scheme was established by Letters Patent on 18 August 2022, with Catherine Holmes AC SC as Royal Commissioner, and reported on 7 July 2023.

Zali Steggall told the House on 11 March 2026 that the National Anti-Corruption Commission's investigation into the robodebt referrals found two public officials engaged in serious corrupt conduct and cleared four others, including former prime minister Scott Morrison.

Mary Doyle told the House on 1 August 2023 that the royal commission led by Commissioner Catherine Holmes had delivered answers for the more than 500,000 victims of the former Liberal government's unlawful robodebt scheme.

## Regression checks

- `ask-near-repeats.test.mjs`: saved answer, JSON and SSE equivalence, repeated normalisation, quote punctuation, fuller narrative with quote citation, changed numbers, dates and people, surname additions, named and unnamed who answers, attributed speech findings, cleared-person exclusion and support for every named subject.
- `research-dedupe.test.mjs`: existing changed-category, signed-figure, same-figure reassignment, Unicode and partial-citation protections.
- Four replay fixtures now require the explicit no-named-subject opening because their cited passages do not identify an individual or a specific office; their original findings and speech attributions remain asserted.

## Gates

All test commands used the supplied Mac Jest slot wrapper and concurrency 4. No simulator, Android, SSH, live Ask or model endpoint was used.

| Acceptance item | Result | Regression evidence |
| --- | --- | --- |
| Merge near repeats and retain every citation | Done: 11 paragraphs become 7; all 13 citation IDs and spans survive | Saved-answer fixture, cross-record paraphrases, Unicode and partial-anchor tests |
| Keep distinct numbers, dates, people and qualifications | Done | Changed number, changed month, changed and added names, surname, negation and existing signed-figure/category tests |
| Remove surplus punctuation after closing quotes | Done for straight, curly and single quotes | Four closing-quote cases and the JSON/SSE saved-answer replay |
| Lead accountability who-questions with supported subjects | Done: Cabinet in the saved evidence; named ministers in the invented-person fixtures; explicit absence when no cited source identifies subjects | Named-subject recovery, per-name source support, cleared-person exclusion and no-name/no-source fixtures |
| Preserve attribution and the liability coverage note | Done | Attributed speech fixture, saved-answer coverage assertion and existing replay cases |

Isolated source reverts ran the unchanged new regression assertions without editing the checkout. Reverting near-repeat handling caused 4 failures, disabling quote punctuation caused 4, and disabling the who-lead repair caused 7. The other 48 assertions passed across these three runs. These are expected failures proving the regressions detect each reverted feature.

The new matching is deliberately conservative. It requires matching figures, date words, people and qualifications, plus content-word containment and high overlap after stemming. Less similar paraphrases can remain separate. Different speakers remain separate attributions. A partial citation whose words cannot be mapped safely prevents that merge.

Earlier full runs exposed missing ignored build products in this fresh worktree: search shards, worker declarations, hubs, crawl files, report records and growth slices. They were restored or built locally from the matching published inputs. The two bootstrap full runs returned 67 and 14 failures respectively; final gate results follow below. Tracked public files remain unchanged.

### Local commits

- `9e51f1717`: near-repeat merging, citation retention, supported who-leads, quote punctuation and replay regressions.
- `879c15d52`: preserve person mention order so unchanged figures cannot be reassigned during a merge.
- `62fd3d91f`: cover the exact doubled closing-quote form as well as an extra outer full stop.
- Base: `3bde3a0eb`.

### Verification status

Final-commit verification is pending. Both Mac Jest slots are reserved by the shared `jest-slot-hold.sh` process. The commands below remain queued through the supplied wrapper at concurrency 4. No shared locks were changed.

| Gate | Observed result |
| --- | --- |
| `npx tsc --noEmit` | PASS on `62fd3d91f` |
| `node ../scripts/stamp_assets.mjs --check` | PASS; tracked public files are unchanged |
| Full portal suite through `jest-slot.sh npm test` | Last completed run: 4,931 passed, zero failures or skips, before the final guard extensions. Final-commit rerun is queued. |
| All `ask-*` and `research-*` tests, including `ask-replay` | Last completed run: 1,894 passed. Final-commit rerun is queued. |
| Isolated feature reverts | Last completed run: 15 expected failures and 48 passing controls. The updated 26-case regression file is queued against each revert. |
| `git diff --check` | PASS |

The queued full-suite, affected-suite and revert logs are retained locally under `portal/private/ask-near-repeats-gates/`. Remaining work: read those results when the reservation releases, resolve any failures, and record the final-commit gate results before integration. The mutation scratch directory is retained while its queued process still needs it.
