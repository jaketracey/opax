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

The actor extractor missed the parenthetical full name followed by a relative clause in the answer, and the honorific/surname plus `allowed` predicate in the speech. It now recognises those forms. An honorific/surname is expanded through the existing public person index only when the answer names that person's parliamentary seat and the cited source explicitly holds the same member role. Each candidate still needs support from its cited source. The who shape ranks findings above other supported answer sentences, then prefers named subjects and the body's own record. Existing member statements stay eligible. The authority fallback handles answers without identified actors, so repeated normalisation preserves the same order.

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

## Review 3 corrections after `85e8822f7`

The finding rule now applies only when copying new speech text from a cited source. Sentences already in the answer remain eligible whenever their actors have citation support. Findings rank above other member statements; named subjects and primary records break ties. Auditor-General, ANAO, committee, NACC, ICAC, IBAC, CCC and CMC references join the existing finding vocabulary, with spelled-out state commissions covered as well. Colon forms can support existing text but cannot nominate a copied source lead, including when the name has a ministerial title.

Both sides use the same role-qualified surname expansion. A full name attached to a member role elsewhere in the answer can therefore support moving its existing surname sentence. The cited source must still hold the same parliamentary role before its surname is expanded. The existing sentence moves intact; the fallback does not add a second version.

The exact-clause normaliser runs before final dedupe. It now shares the standalone-tail rule with dedupe, preserving an opening when its semicolon tail starts with a pronoun or lowercase noun phrase. Rejected claims and findings of no evidence also retain their negation when matching a named subject.

The round adds 25 cases and extends the 12 existing exact-opening pronoun cases through `withAnswerLanguage`. It also tests the existing finding-versus-assertion ranking through that boundary and corrects the prior assertion-only expectation: an already written supported statement stays eligible.

| Item | Regression test | Isolated revert result |
| --- | --- | --- |
| P1: speech-backed answer stays eligible | `ANAO McKenzie finding relayed in the House leads through the full answer boundary`; `an existing attributed member statement remains eligible` covers ordinary and colon forms. | Restoring the answer-side finding filter fails the ordinary statement case, retaining the colon-finding control. The ANAO/McKenzie case also failed on the original `85e8822f7` source. |
| P1: findings rank above assertions | `a commission finding leads ahead of a member assertion about a named minister`, including mixed citations and the full boundary. | Removing the finding rank fails the test. |
| P1: finding bodies | `a relayed finding stays eligible and can supply an omitted source lead` covers 15 body names and acronyms, each as existing prose and as a source-only recovery. | Removing the added vocabulary fails eight cases and retains seven spelled-out commission controls. |
| P2: exact opening in the real path | `an identical opening keeps the subject of its pronoun tail` tests six pronouns in both cases through `withAnswerLanguage`. | Removing the normaliser's tail guard fails all 12 cases, plus the lowercase-tail case. |
| P2: surname duplicate | `a supported surname sentence already in the answer moves first without a copied duplicate` pins the complete answer, both original citation spans and repeated normalisation. | Removing answer-side surname expansion fails the case. |
| P3: no evidence and rejected claims | `a rejected that-name claim is not promoted through the answer boundary` tests both sentence orders, including a ministerial title. | Removing the subject negation guard fails three cases. Removing the rejected-claim wording fails two, retaining the no-evidence control. |
| P3: titled colon attack | `a titled colon attack cannot supply a copied lead even beside a finding` tests a source containing a finding and a titled political attack. | Removing the titled-colon exclusion from source-copy selection fails the case. |
| P3: lowercase tail | `a lowercase semicolon tail keeps its opening through the answer boundary` tests both dedupe and the full boundary. | Removing the normaliser's tail guard fails the case. |

All eight isolated revert probes produce the intended assertion failures: 30 expected failures and nine passing controls. The probes inject source into offline bundles without changing the checkout.

The 16 existing end-to-end replay answer strings are byte-identical to `85e8822f7`. The complete normalised row 182 payload is also identical, including its citation ranges, source cards and coverage. Its answer SHA-256 is `9feab51ba9b760964b2cc6dd1829ee41e49c553cd6ede4d8e8ba868bddb775c3`; it retains the Morrison lead, one Holmes reference, 10 paragraphs, 12 citation IDs and 13 spans. The older robodebt fixture still repairs 11 paragraphs to 7 with all 13 citation IDs and 13 spans.

## Gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Focused near-repeat, grant-guard and dedupe tests, including MN-GRNT-014 | PASS: 162 tests |
| All `ask-*` and `research-*` tests, including `ask-replay` | PASS: 1,994 tests, no failures or skips |
| Full portal `npm test` through the Mac slot wrapper at concurrency 4 | PASS: 5,091 tests, no failures or skips |
| Isolated source reverts | PASS: eight probes, 30 expected assertion failures and nine passing controls |
| Before/after comparison of existing replay answers | PASS: all 16 byte-identical |
| Before/after comparison of normalised row 182 | PASS: entire payload identical |
| Asset stamp check and `git diff --check` | PASS |

The first full run stalled with idle Node and esbuild descendants and no reported assertion failure. Only its recorded process tree was stopped; the separate final full run passed through the same slot wrapper at concurrency 4.

These remain tidying and ordering changes in existing steps. No answer-blocking check was added. Generated assets and logs stay local; tracked public files are unchanged. No live Ask request, real model call, simulator run, Android work or SSH was used.
