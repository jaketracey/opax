# Discovery review pass 18 — match each party, not a substring

## Reproduced weaknesses

“Who gets more money, Labor or LNP in Queensland?” could not answer because mentioning LNP discarded Labor from the selection. A global LNP shortcut was intended to avoid matching Liberal inside “Liberal National Party”, but also removed separately named parties.

“Who donates the most to Country Liberal Party?” also fell through: the matcher selected Liberal as well as Country Liberal Party, making an ordinary single-party ranking look like an unsupported multiple-party request.

## Changes and independent challenge

Party matching now resolves complete names and established aliases at each occurrence. A longer party name suppresses only names nested inside that occurrence. A separate Liberal, Labor or National Party mention remains a separate recipient. The calculator and whole-question validation share the same party alias vocabulary. Explicit party controls retain precedence. A shared alias or an unavailable compound party identity asks for clarification rather than combining records or substituting another party.

Independent review confirmed the Queensland and Country Liberal Party failures against the previous source and challenged the replacement. It caught an unavailable-party check treating “LNP” inside a resolved donor's company name as a recipient. Exact donor-name occurrences are now masked before resolving recipients; a separate recipient mention remains visible. Regression tests cover full and suffix-shortened company names.

No receipt data, industry labels, financial-year semantics, generated-answer prompts or presentation styles changed. The work starts from current main, including the concurrent grants-title and catalogue corrections.

## Evidence and validation

Independent graph-edge sums for Queensland FY2020–21 are Labor $2,183,276 across 585 records and LNP $1,998,033 across 421: a difference of $185,243. FY2021–22 is Labor $2,854,647 across 585 and LNP $1,264,068 across 196: a difference of $1,590,579. The 2021 gambling selection is Labor $47,563 and LNP $12,792. These are selected disclosed party receipts, not every donor, a gifts-only total, personal payments or proof of influence.

Focused tests check both party identities, exact amounts and counts, distinct citation destinations, donor and industry scope, period follow-ups, canonical history, explicit filters, missing identities and ambiguous aliases. Final test/type/build results, independent review and local/production browser evidence are archived in `/Users/jake/.cache/opax/discovery-reviews/pass-18-20260913/`.

Chromium and WebKit checks use real deterministic Ask responses at 390, 768 and 1440px, with unrelated generation routes intercepted. They exercise the Queensland comparison, financial-year changes, all-years reset and the Country Liberal Party ranking. These checks do not measure newly generated politician answers or replace testing on a physical iPhone. No paid external model calls were made.

After a verified release, passes 19–20 remain. Enrichment/source monitoring continues separately; the explicit summary-worker stop marker remains intact. Five additional source candidates were researched and left for independent publication review, not treated as new awards or payments.
