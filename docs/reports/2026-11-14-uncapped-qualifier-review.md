# Row 173 qualifier correction

Supersedes the broad folding policy in `6d5aa1457`. The shared `ReceiptDonorMatcher.bracket_folds` now recovers only an individual's interior middle-name form, with one plain base and the same known kind. Transaction qualifiers, state branches and separately resolved organisation descriptors remain separate. A conflicting business industry tag also prevents an accidental resolver person-kind from turning a company descriptor into a middle name. Acronyms and business descriptors alone do not prove that two resolved organisations are the same legal donor. This conservative rule is independent of map membership or its cap; no second matcher is introduced.

## Census and the complete 89-fold review

| Prior fold qualifier category | Count | Decision now |
| --- | ---: | --- |
| Personal middle name | 1 | Fold into unique individual base |
| Transaction: Donation Returned; Loan | 2 | Keep qualified identity |
| Australian state / branch | 30 | Keep branch identity |
| Legal entity, numbered company, trading name or trustee | 6 | Keep separate entity |
| Organisation descriptor, acronym, locality or business unit | 50 | Keep resolved organisation |
| **Total reviewed** | **89** | **1 fold; 88 retained** |

The whole uncapped selection still has **459 bracket-bearing entities**, **116 with a base/other variant**, **12 ambiguous cases** and **15 kind mismatches/unavailable kinds**. There are **343 with no base**. The old state lookup rejected zero *explicitly conflicting state aliases*, because an unqualified national base was allowed. It did not protect national bodies from state-branch merges. The new policy separately preserves all 30 previously folded state branches, including the four Deloitte branches. Deloitte's NSW node is present in both map and uncapped receipts at **$745,200 / 16 receipts**, with identical typed cells.

The [audit JSON](2026-11-14-uncapped-qualifier-review.json) lists all 459 decisions, all 89 previous folds with their new decisions and each distinct qualifier form, and five samples checked by eye. Personal middle names, representatives and trustee names are redacted in this audit; source hashes identify those rows. The five checks cover the valid middle name, the returned donation, the loan notation, Deloitte NSW and the subsidiary marked P/L. Their amounts and retained or merged identities were checked against the same-corpus pre-fold export.

## Every transaction qualifier form found

| Bracket form | Entities in full selection | Previously folded | Current handling |
| --- | ---: | ---: | --- |
| Donation Returned | 1 | 1 | Separate; exclude from donations |
| Loan | 1 | 1 | Separate; retain Other Receipt, never infer a new AEC type |
| Refunded | 1 | 0 | Separate; exclude from donations |
| funds returned | 1 | 0 | Separate; retain Other Receipt |
| In Kind | 2 | 0 | Separate; retain Donation Received as an in-kind gift |

Transaction guards also cover spelling variants of refund, return, repayment, reimbursement, reversal, cancellation, duplicates and non-cash/in-kind qualifiers. Invented-name fixtures reproduce the two reported live cases, including the eight loan-labelled rows. Explicitly returned/refunded Donation Received entries retain their original AEC receipt types and all-receipt figures, but carry typed `donation_exclusions` so Ask, Explain, quiz, gold and industry/party donation exports cannot count them as giving. This removes **$25,000 / 2 entries** from donation measures only. No source sheet or `scripts/aec_*` selection rule changes.

## Before and after the reported cases

| Source hash prefix | Base in 6d5aa1457 | Corrected base | Separate qualified record |
| --- | ---: | ---: | ---: |
| `baeaf63c772b` (Donation Returned) | $25,000 / 2 donations | **$5,000 / 1 donation** | $20,000 / 1 receipt; original Donation Received type, excluded from giving |
| `be1fd9c7a97d` (Loan) | $575,000 / 15 receipts | **$385,000 / 7 receipts** | $190,000 / 8 Other Receipts; Loan stays in its disclosed name |

The reviewed middle-name pin stays **$891,049 / 23 receipts**, including **$881,049 / 22 donations**. Row 160's numeric assertions and all nine row-169 behaviours remain unchanged. All all-type party amounts and receipt counts are conserved.

## Re-pins and scope

- Retail **$7,532,586 → $7,525,586**: the separate $7,000 organisation descriptor no longer takes its plain base's industry. Each donor still has one canonical industry. The independent pre-fold source recount again matches each audited industry.
- Liberal party table **7,827 → 7,855 sources**; Labor **9,811 → 9,866 sources**: 88 qualified identities are preserved rather than merged. Amounts remain **$403,316,945** and **$579,163,899**, respectively; the four factual outputs agree.
- Fossil-fuel donations remain **Liberal $1,961,350; Labor $981,002**. Gambling, tobacco and gold's money amounts are unchanged.
- The old census fixture is replaced by the complete qualifier review; the reviewed $891,049 / 23 pin is unchanged.

## Merge and gates

Qualifier-fix gates, before the required merge-forward:

- Python money, matcher and disclosure suites: **134 passed, 608 subtests passed**.
- Full portal `PATH="$PWD/.venv/bin:$PATH" npm --prefix portal test -- --test-concurrency=4`: **4,971 tests, 4,960 passed, 11 skipped, zero failures**, 381.6 seconds. The first run had one directory-person helper timeout at 15 seconds; that test passed unchanged in isolation and the full rerun passed. The green full run includes the three qualifier regressions, every unchanged row-160 numeric assertion and all nine row-169 tests.
- `cd portal && npx tsc --noEmit`: **passed**.
- Offline Ask replay: **17 passed, zero failures**, using fixture models only.
- Stamps, spa-shell and donor-index freshness: **passed**. Growth, hub, report, crawl and search caches were rebuilt; unrelated supplier-growth data was restored.
- All three drawing/index/disclosure datasets (`money.json`, `donor-index.json`, `donor-disclosures.json`) remain identical to current main. The NSW branch's typed cells agree exactly with the uncapped export.
- Load5 was checked before gates and runs waited while it exceeded 40. The final full run started at **36.82**; `.venv/bin` was on PATH and concurrency was 4.
- Private case names are absent from changed code, tests and report text. Invented fixtures reproduce both live cases. Public datasets keep disclosed spellings.

**Merge-forward dependency:** origin/main is `fb921dec921da92d487e2767c0e402bfb7045691` and still does not contain row 171 (`13880d779`), including its `partyMapScope` helper. The qualifier fix is committed and pushed independently for review. The requested merge-forward and removal of “on the map” from the uncapped party-table scope, with the `money-copy.test.mjs` update and post-merge gates, remain pending row 171 landing first. This report does not claim that merge is complete.

No production, model/provider or SSH calls. Network access was limited to authorised Git fetch/push.
