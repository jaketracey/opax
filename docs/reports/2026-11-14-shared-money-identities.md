# Row 173 review 4: shared receipt identities

This supersedes the identity policy in `49b3c6edd`. Both `aec_receipt_types.attach_receipt_types` and the uncapped exporter resolve the **actual receipt spelling** through `ReceiptDonorMatcher.match`. The source is the explicit, reviewed [identity asset](../../portal/public/graph/money-identity-aliases.json), seeded with main's 400 published donor identities and their aliases (`ca800951e`). It contains no amounts and is separate from runtime drawing membership. A new cap cannot silently add or remove reviewed identity decisions. Source sheets and AEC selection rules are unchanged.

## P2: one identity decision

**29 donor mismatches → 0**, comparing every drawn donor's `by_type` against the uncapped file. The test lists the 19 older exceptions by public organisation ID, and now requires equality for those too. All **1,911** original non-transaction label/alias spellings still resolve to their original donor.

Existing reviewed aliases are retained. This recovers, among others, the $32,500 spelling variation under Philip Morris, the MUA branch, LHMU NSW, and AMWU's $215,130. Newly inferred legal entities and unreviewed state branches remain separate in both projections. A transaction qualifier never disappears into a plain identity. In particular, the $1,450,000 NAB `(Loan)` Other Receipt remains under its own spelling, rather than the bank's plain identity.

The drawing keeps its existing donor IDs, edges and cap; typed cells reflect the shared identity decisions. The one original transaction-qualified alias, NAB `(Loan)`, is removed from the plain bank’s aliases in the map, uncapped file and rebuilt donor index. Its $1.45m Other Receipt retains its separate qualified identity. No non-transaction alias is removed. Its all-type donor total changes **$711,000,854 / 16,211 receipts → $709,352,870 / 16,178 receipts**. The $1,647,984 / 33 difference is retained in the uncapped file under separate identities:

| Drawing parent | Preserved receipt spellings | Amount / receipts removed from that parent |
| --- | --- | ---: |
| National Australia Bank | `(Loan)` | $1,450,000 / 1 Other Receipt |
| CEPU | `(Tas)` | $16,604 / 4 |
| Tabcorp | `(QLD)` | $6,600 / 1 Other Receipt |
| PricewaterhouseCoopers | `(NSW)` | $6,450 / 2 |
| CPSU | `(NSW)` | $162,080 / 23 |
| Hawker Britton | `(Victoria)`, `(QLD)` | $6,250 / 2 Other Receipts |

Those branch spellings were fuzzy additions, not literal reviewed aliases. The shared guard preserves them. Main's reviewed literal aliases stay intact. [The audit](2026-11-14-shared-money-identities.json) records each before/after typed vector, all mismatched public IDs, current spelling coverage and the counterfactual check.

A full same-corpus rebuild with **every drawing donor and edge removed** gives identical eligible factual donor IDs and typed totals, and an identical industry summary. Public-funding-only drawing context is excluded from that comparison because it contributes to no factual donation/receipt total. Reserving reviewed IDs also fixes the construction-donor collision exposed by this check. A fixture tests the same property alongside a reviewed branch, subsidiary, refund and Loan suffix.

## P3: qualifier forms and copy

- Brackets now recognise `(Refund)`, `(donation return)` and `(returned donation)`; unbracketed `- Donation Returned` and `- Refund` suffixes also preserve their own identities and are excluded from giving. Invented-name fixtures cover each form.
- `receiptTypeLine` retains the disclosed AEC type and adds: “The AEC records $20,000 as returned or refunded; OPAX leaves it out of donations.” The returned record's page therefore explains why Donation Received does not enter giving figures.
- Subscriptions and untyped receipts retain “which the AEC doesn't class as donations”, even alongside returned money. The returned-money explanation is a separate sentence, so it does not misstate the AEC type.
- The earlier report now uses **authorised**.

The reviewed returned case remains **$5,000 / 1 donation**, with its returned $20,000 separate. The separate `(Loan)` case remains **$190,000 / 8 Other Receipts**. Deloitte NSW remains **$745,200 / 16** in both files. The individual receipt pin remains **$891,049 / 23**, comprising **$881,049 / 22 donations** and **$10,000 / 1 Other Receipt**.

## Policy call: AEC-typed Donation Received with Loan wording

Counting is unchanged, as instructed. Every party-table receipt row retains the Loan wording in the disclosed donor name; tests cover all destination parties.

| Disclosed name | Donation Received retained |
| --- | ---: |
| Comscrv (No. 2092) Pty Ltd - Loan | $899,628 |
| National Building Foundation - Loan | $75,000 |
| Supporters Foundation - Loan | $48,440 |

These remain classified as the AEC typed them, pending the requested policy call. No loan amount is inferred from an Other Receipt or from the name.

## Re-pins

- Factual party sources: Liberal **7,855 → 7,853**; Labor **9,866 → 9,832**. Reviewed aliases consolidate sources while the newly preserved qualifiers remain distinct. All-type amounts stay **$403,316,945** and **$579,163,899**; browser, SSR, API and CSV must agree.
- Canonical industry movement: Labor unions **$74,594,600 → $74,821,446**. Reviewed aliases move **$226,846** from the former “other” entities to their canonical union identities. A further **$58,207** moves from “other” to its existing canonical individual classification. The $285,053 total movement conserves donations; no classification rule or source tag was changed. Retail stays **$7,525,586**, and fossil-fuel donations stay **Liberal $1,961,350; Labor $981,002**. Gambling, tobacco and gold money fixtures are unchanged.
- Drawing/replay fixture pins (these tests deliberately supply `money.json`, rather than asserting uncapped factual totals): gambling all types **$8,675,112 → $8,668,512**, Labor **$4,706,193 → $4,699,593**, preserving Tabcorp QLD’s $6,600 separately. Finance donations **$24,789,585 → $24,788,085**, Liberal **$14,414,067 → $14,412,567**, preserving PwC NSW’s $1,500; finance all types **$169,671,431 → $168,214,981**, also preserving the $1.45m NAB Loan and PwC NSW’s remaining $4,950. Finance all-types leaders become Labor **$82,300,904** and Liberal **$62,662,300**. The bank replay’s donation-source all-types subtotal becomes **$59,445,834**. Labor’s drawing union donations **$68,031,075 → $68,022,075**, all types **$183,707,129 → $183,528,445**, preserving CEPU Tas and CPSU NSW cells. Liberal’s drawing donation total **$100,378,375 → $100,376,875** and its difference from LNP **$96,440,827 → $96,439,327** follow the same $1,500 PwC correction. These explicit pins retain their assertions; the independent uncapped ranking tests retain their separate full-selection figures.
- Generated topic-report source: Tabcorp **$2,090,412 → $2,083,812** in `reports/gambling.json`, the same preserved $6,600 QLD Other Receipt. The existing source builder changes only the report’s source fields; its other statistics are unchanged.
- Follow-up gold: the typed-source fingerprint changes from `18b9bab3…` to `e47960fe…` for the shared matcher metadata, typed drawing cells and removed NAB Loan alias. **Every numeric conversation remains identical**, and the test compares each one with the real tool. The fixture’s documented immutable legacy source revision/hash are retained; the guard text records this typed-projection review.
- The active bracket census falls from 459 to **431**, because reviewed spellings resolve before new entities are built; there are **10** remaining ambiguous bracket cases. The reviewed middle-name case also resolves at that shared stage; no subsequent entity fold is needed.
- The row-160 current map audit is regenerated with the new guard: bracket matches **103 / $1,209,050 → 71 / $1,011,066**; protected branches **34 / $234,944**, including the two previously classified state mismatches; protected Loan **1 / $1,450,000**. Its net gain over the old entity/raw lookup is now **$554,990 / 113**, across **27** donors gaining. The historical row-160 JSON and its original **$2,202,974 / 146**, **30**-donor and zero-changed-existing-match assertions are preserved separately. Every $891,049 / 23 assertion and all nine row-169 behaviours remain unchanged.

## Gates and merge

Pending final gates and the conditional main merge after row 171 lands. The git-ignored `portal/public/growth/division-bills.json` is present and will be rebuilt with growth assets before the full suite. No production requests, model/provider calls or SSH. Network access is limited to authorised Git fetch/push.
