# Data cleanup sweep, wave 1 (10 Nov 2026)

Nine read-only sweepers looked for provable defects across the published data, one per dataset family. An independent verifier then tried to refute each finding against the original public source. Of 129 findings, 77 were confirmed, 48 partly confirmed (real, but the count, cause or fix needed correcting) and 4 refuted; none were left unproven. About 30 duplicate a finding in another family, so there are roughly 95 distinct defects. The full discovery and verification files, with record ids and source evidence, are kept outside the repo in `opax-ios-wt/_data-cleanup-20261110-findings/`.

Wave 1 fixes root causes in code (scrapers, normalisers, exporters, build scripts, portal templates and Ask tool templates). The generated files in `portal/public` were not edited by hand: the refresh VM regenerates them on its next run of each group. One-off rows go through a new reviewed corrections mechanism.

## Reviewed corrections (`scripts/corrections/`)

`scripts/corrections/<dataset>.json` holds one-off corrections: record id, field, `from`, `to`, the original source URL, what the source says, the finding id and the review date. `apply.py` (and `apply.mjs` for the Node builders) changes a field only while it still holds `from`; any other value, a missing record or a record that already holds `to` stops the export with a message naming the entry. A fixed source or a changed record therefore forces a review instead of a silent overwrite. The evidence rules are in `scripts/corrections/README.md`. Wave 1 entries: divisions (39), bill links and assent dates, ACT bills, contracts (CN3290712 held out of totals), Senate video dates, OpenAustralia people ids, member ids.

## What changed, by family

| Family | Fixed in wave 1 | Group(s) that regenerate |
|---|---|---|
| Divisions and votes | 16 reversed outcomes and the NSW Terrorism bill third reading corrected from Hansard; 28 TVFY-marked duplicate divisions flagged and left out of member counts; presiding-officer codes no longer published as a party; One Nation and JLN labels; 279 placeholder questions; NSW and VIC Hansard parser fixes | divisions (nightly), votes |
| Bills | sponsor party only when it is a known party (else the dated party or nothing); entities decoded; new `negatived` status for bills whose final event is a negatived question (84 bills); negatived stages flagged with the register's wording; co-sponsors kept; three duplicate ALRC records suppressed with redirects; six wrong-bill vote links moved; two assent dates | bills, divisions, people |
| Money | federal map, donor totals and party totals read AEC returns only (the icacpls copy and ECQ rows were double counting); electoral commissions no longer donors; canonical rollup labels; name cleaning; duplicate node ids | money (weekly), grants |
| Contracts and grants | contracts whose notices are all cancelled at source are withheld from totals (2,317, $5.65bn); CN3290712 ($9.626bn amendment signed after the contract ended) held out of totals by reviewed entry, row kept; per-notice AusTender links; placeholder dates read as not recorded; four MYEFO figures corrected and the parser fixed; $0 grants; QLD placeholder titles; no-ABN supplier spellings joined to their ABN only on the supplier's own reported spelling | suppliers, grants, money, budget hub, search |
| Members and electorates | one non-person rule for roster and speakers; Kathy Sullivan and Con Sciacca pay names; APH ids read as text (Vanstone 7E4); Senate state codes; AEC surname casing; Vanessa Bleyer's id; six state spelling twins; party pages no longer count merged speech labels; full-name person addresses; Stephen Kamper | people, pay, speakers, access, interests |
| Search | 96 dead access-register results; readable dates in the Ask tool citations (no ISO-only or "(null to null)" ranges) | search catalogue build, deploy |
| Interests and expenses | nil "No" and "." answers dropped; hyphen line-break joins; QLD share fragments kept with their item; diary dates the diary contradicts set aside (never rewritten); separate `net_adjustments` and neutral wording for repayment-only totals; FITS activity dates beside an inverted register interval; seven Victorian gifts rows linked | interests, access, expenses, fits, vic-gifts hub |
| Speeches and press | exact-twin committee turns counted once; PM transcript title entities decoded; first-speech and Question Time video dates; NSW twin releases rejected at sync; four Victorian Premier statements attributed, Ben Carroll added to the Victorian government table; linker fix for new rows (given name no longer read as the surname) | speakers (weekly), video (nightly), deploy |
| State datasets | ACT bill sponsor swap from a title collision; ACT wrong links, split and doubled events; Tasmanian same-day stage order; coalition roster labels map to no party | bills-act and bills-tas hubs, people |

New `validate_data.py` checks guard each class against regression.

## Not in wave 1 (wave 2: needs a VM DB re-ingest or relink)

- Division headline tallies from the OpenAustralia count (3,675 divisions) and dated party labels on historical votes.
- AEC receipt type and return side at ingest, then party-side and donor-side de-duplication, donations shown separately from other receipts, and a logged rule replacing the untracked `flagged_review` state.
- Speech relinking for 3,512 rows under the wrong person id, apostrophe-variant stubs and the Victorian "By X" stubs; deleting the exact-twin committee rows.
- Roster fold for federal duplicate pages, namesake splits, electorate linking, the 18 former senators with no roster row, and the state jurisdiction grouping key.
- Contract supplier and recipient person/organisation typing, the AusTender date one day early (UTC truncation), and re-reading cancellations beyond the three-day window.
- The Nicolette Boele alteration parser and the missing spouse block.

## Decisions for Jake

- money-donations-010: party-internal and associated entities shown as donors to their own party.
- Whether "Removed from Notice Paper" and "Discharged" bills get their own status.
- The 18 late bill-vote links listed for review in `bills/index.json`.
- The roster changes the overlay holds for review (state codes, six twin folds), and the 18 former senators.
- Budget, vic-gifts, bills-act and bills-tas review files were re-digested by the fix lanes for the reviewed diffs listed above.
