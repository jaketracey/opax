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

## Review fixes

The review round restores contained-fragment removal without requiring a programme fragment to name every entity in the full sentence. Non-contained statements require ordered shared content words and ordered body, role and person mentions. The short quotation still gives way to the fuller narrative, with its citation restricted to the shared finding.

Transferred citations cover a shared run of content words rather than the fuller sentence's additional subjects. The Cabinet lead rewrite also preserves those partial anchors. Negative findings do not supply an accountable subject. The no-named-subject sentence is uncited, and recovered speech findings lose a trailing member attribution before the speaker, chamber and date wrapper is added.

| Review item | Result | Test that fails with an isolated source revert |
| --- | --- | --- |
| 1. Grant fragments | Done | Existing `MN-GRNT-014: repeated trailing programme and category fragments are omitted` |
| 2. Reversed actors | Done | Four `reversed actors retain separate claims and their own citations` cases: Department/Ombudsman, minister/secretary, findings about those roles, and roles mentioned before the reversed action |
| 3. Cleared or negative findings | Done | Five `a negative finding never becomes the who-lead` cases covering `no adverse findings`, `was not`, `were not`, `no longer` and `did not` in both answer text and recovered source text |
| 4. Citation scope | Done | `a contained finding transfers its citation only to the shared words, excluding the added person` |
| 5. Absence lead citation | Done | `the no-named-subject lead is uncited and leaves each source on its recorded claim` |
| 6. Member attribution | Done | `a recovered speech finding removes trailing member attribution before its speaker wrapper` |

Each fix was reverted independently in an esbuild source override without editing the checkout. All 13 selected assertions failed as expected: 1 grant, 4 reversed-actor, 5 negative-finding and 1 for each remaining review item.

The saved robodebt fixture still has 7 paragraphs, 13 citation IDs, 13 citation spans and 10 source cards in their original order. The answer above is unchanged. All original citation IDs survive, with transferred anchors narrowed to the shared wording. The quote punctuation assertions, number/date/person safeguards, Unicode checks, named-subject recovery and liability note remain covered.

## Gates

No simulator, Android, SSH, live Ask or model endpoint was used. Tests use offline fixtures and mocks. Focused Node test commands run at concurrency 4. Portal `npm test` uses the supplied Mac slot wrapper and concurrency 4.

| Gate | Review-round result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Focused near-repeat, grant-guard and dedupe files | PASS: 88 tests |
| All `ask-*` and `research-*` tests, including `ask-replay` | PASS: 1,911 tests, no failures or skips |
| Isolated review-fix reverts | PASS: all 13 selected regression assertions fail on revert |
| `node ../scripts/stamp_assets.mjs --check` | PASS; tracked public files are unchanged |
| `git diff --check` | PASS |
| Full portal suite through `jest-slot.sh npm test` | Queued behind the shared Mac reservation; not yet a final-tree pass |

Earlier full runs exposed missing ignored build products in this fresh worktree. They were restored or built locally from matching published inputs. An earlier full run passed 4,931 tests before the final guard additions; this does not establish the review-round full gate. Logs and replay outputs are retained under the ignored `portal/private/ask-near-repeats-gates/` path.

### Local commits

- `9e51f1717`: initial near-repeat merging, citation retention, supported who-leads, quote punctuation and replay regressions.
- `879c15d52`: preserve person mention order so unchanged figures cannot be reassigned during a merge.
- `62fd3d91f`: cover the doubled closing-quote form and an extra outer full stop.
- `648e7b42a`: initial replay evidence and reservation status.
- Base: `3bde3a0eb`.

The matching remains conservative: less similar paraphrases can remain separate, different speakers retain separate attributions, and an unmappable partial citation prevents a merge.
