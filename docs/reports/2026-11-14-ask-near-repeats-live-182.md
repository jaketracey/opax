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

The actor extractor missed the parenthetical full name followed by a relative clause in the answer, and the honorific/surname plus `allowed` predicate in the speech. It now recognises those forms. An honorific/surname is expanded through the existing public person index only when the answer names that person's parliamentary seat and the cited source explicitly holds the same member role. Each candidate still needs support from its cited source. The who shape chooses the named finding before the authority fallback, so repeated normalisation preserves the same order.

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

The initial fix added ten cases in `ask-near-repeats.test.mjs` covering the saved merge and who lead, JSON/SSE equivalence, repeated normalisation, both sentence orders, source support, changed figures/dates/commissioners and retention of fuller wording with a dependent tail. Isolated source reverts reproduce four merge failures, two who-lead failures and one repeated-ordering failure; the other 20 selected assertions pass across those runs.

## Review corrections after `e36243aad`

The review round adds 39 regression cases to the existing near-repeat test file. The changes remain in the existing dedupe and ordering steps; the original answer is retained underneath an uncited no-subject lead when only assertions are available.

| Item | Change and regression test | Targeted revert result |
| --- | --- | --- |
| P1: subject loss | Opening-clause removal requires a capitalised standalone tail and excludes pronouns. `a near-repeat opening keeps the subject of its pronoun tail` and `an identical opening keeps the subject of its pronoun tail` cover six pronouns in both cases; name and noun-phrase tails still merge. | Removing the standalone-tail condition fails 24 cases. |
| P2: political assertion fallback | Colon actor forms corroborate existing answer text only. Copied speech leads require a finding, and assertions cannot displace a finding even when they also carry an unrelated record citation. Tests: `a speech assertion is not copied`, `a colon finding supports an existing sentence without being copied`, and `a commission finding leads ahead of a member assertion`. | Three isolated reverts each fail one test; the source-assertion probe also retains one passing control. |
| P3: negated parenthetical subjects | Apply the existing negation exclusions before the parenthetical name and through its relative clause. `a negated parenthetical subject is not promoted or recovered` covers not, cleared and no. | Removing the exclusion fails all four cases. |
| P3: shared surnames | Do not expand an honorific/surname to an MP without the same explicit member role in answer and source. `an official sharing an MP surname does not support that MP as the who-lead` covers Robert and Howard, including mismatched seats. The saved Cook/Morrison finding still leads. | Restoring unqualified surname expansion fails both cases. |
| P3: previously untested quote boundary | `quoted clause boundaries cannot be removed as identical openings` covers straight and curly quotations whose capitalised tail would otherwise look independent. | Removing quotation-span protection fails both cases. |
| P3: previously untested authority fallback | `the no-subject fallback orders the actual finding before a member assertion and report metadata` pins the uncited prefix, finding order and original citation text. | Removing `leadWithAuthority` from that fallback fails the case. |

All eight isolated source-revert probes produce the intended assertion failures: 36 expected failures and one passing control. These probes inject the reverted source only into the offline bundle and never change the checkout.

The 16 existing end-to-end replay answer strings are byte-identical before and after the review corrections. Row 182 retains the repaired text and counts above. The older robodebt fixture still changes from 11 paragraphs to 7 while preserving all 13 citation IDs and 13 spans. Source-card order and citation IDs remain intact in both fixtures.

## Gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Focused near-repeat, grant-guard and dedupe tests, including MN-GRNT-014 | PASS: 137 tests |
| All `ask-*` and `research-*` tests, including `ask-replay` | PASS: 1,969 tests, no failures or skips |
| Full portal `npm test` through the Mac slot wrapper at concurrency 4 | PASS: 5,066 tests, no failures or skips |
| Isolated source reverts | PASS: eight probes, 36 expected assertion failures and one passing control |
| Before/after comparison of existing replay answers | PASS: all 16 byte-identical |
| Asset stamp check and `git diff --check` | PASS |

Generated assets and logs stay local; tracked public files are unchanged. No live Ask request, real model call, simulator run, Android work or SSH was used.
