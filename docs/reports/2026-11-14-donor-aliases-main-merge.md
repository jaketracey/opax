# Donor aliases after the row 137 merge

This rebuild merges main at `6a6182e89` (#357) into `c1a785831`. All figures below are recomputed on the merged code. No production calls were made.

## Inputs and guarantees

The frozen input is #357's released legacy topology, identity/classification fields, public-money layers and off-map disclosure catalog. Every `by_type`, `by_type_year`, `return_by_type`, `return_by_type_year` and `return_by_name` cell is removed and regenerated from the complete cached receipt backfill. The donor index, topic-report source figures, search manifest and asset stamps are rebuilt. This is the same legacy/receipt split used by the preceding lane report.

A trial full export from the desktop corpus exposed an older contract snapshot (coverage ending 21 September rather than 10 November), unrelated public-money membership changes, different classifications and missing published off-map records. Those source changes are excluded. The released catalog remains the retention seed; older corpus data cannot remove published pages. The source snapshot is an input to the receipt rebuild, not an accepted set of old typed figures.

The before/after alias audit uses one fixed merged node/edge universe: zero existing matches move or are lost. The independent CSV/Decimal verifier checks all 878 receipt edges and 16,212 raw rows and confirms that every non-receipt legacy field and every released party-return field matches #357. The verifier now independently implements the renamed-party mapping, with an invented-party regression test.

Annotation review remains one row worth $190,322 through `flagged_review`. The two state-mismatched rows worth $36,960 and the six ambiguous rows worth $23,050 remain unmatched. Public Funding remains one separate $1,069,773 typed cell and contributes to no displayed donor or receipt figure. The `nsw efa` assertions are retained.

Alias recovery is unchanged: **146 rows, $2,202,974, 30 donors**. The changed map totals below come from row 137 and its cap effects, not a broader matcher. The already-reviewed $98,471 exact-name Electrical Trades Union receipt from the newer cached backfill is also retained from c1a785831. It is not a new alias gain or a new change in this merge; against incoming main, the displayed delta is $2,301,445 ($2,202,974 aliases plus that $98,471 receipt).

## Re-pins compared with c1a785831

Each row is one reason for a moved figure; repeated assertions share the same row.

| Pin / measure | Before | After | Delta and reason |
| --- | ---: | ---: | --- |
| Displayed federal receipts | $710,857,091 / 16,209 rows | $711,000,854 / 16,211 rows | +$143,763 / +2: row 137 adds $501,562 / 11, while Linc Energy leaves the cap at $357,799 / 9. |
| Raw typed cells | $711,926,864 / 16,210 rows | $712,070,627 / 16,212 rows | Same +$143,763 / +2; the separate Public Funding cell is unchanged. |
| Old-matcher displayed baseline | $708,654,117 / 16,063 rows | $708,797,880 / 16,065 rows | Same row-137/cap net; the alias recovery remains $2,202,974 / 146. |
| Old-matcher raw baseline | $709,723,890 / 16,064 rows | $709,867,653 / 16,066 rows | Same row-137/cap net, including the separate Public Funding cell. |
| Eligible rows before the map cap | $1,219,674,494 / 55,123 rows | $1,221,834,188 / 55,166 rows | +$2,159,694 / +43: the renamed-party recipient mapping admits these rows. |
| Unmatched before alias fallback | $509,950,604 / 39,059 rows | $511,966,535 / 39,100 rows | +$2,015,931 / +41: 43 newly eligible rows less the net 2 newly exported rows. |
| Unmatched after alias fallback | $507,747,630 / 38,913 rows | $509,763,561 / 38,954 rows | Same +$2,015,931 / +41; the fixed-topology alias gain is unchanged. |
| Finance, all receipt types | $169,655,725 | $169,671,431 | +$15,706: Westpac's Other Receipt under St George Bank reaches the Libertarian node. |
| Fossil fuels, Liberal donations / share | $957,000 / 70% | $807,000 / 75% | -$150,000 / +5 percentage points: Linc Energy leaves the map cap. |
| Fossil fuels, Liberal all types | $3,009,080 | $2,801,080 | -$208,000: only the Linc Energy cap exit. |
| Fossil fuels, Labor donations / share | $269,975 / 20% | $249,975 / 23% | -$20,000 / +3 percentage points: only the Linc Energy cap exit. |
| Fossil fuels, Labor all types | $3,735,682 | $3,710,882 | -$24,800: only the Linc Energy cap exit. |
| Fossil fuels, LNP donations / all types | $124,999 / $152,374 | $0 / $27,375 | -$124,999 in both measures: only the Linc Energy cap exit; LNP no longer ranks by donations. |
| All-industry Liberal donations | $100,528,375 | $100,378,375 | -$150,000: only the Linc Energy cap exit. |
| All-industry LNP donations | $4,062,547 | $3,937,548 | -$124,999: only the Linc Energy cap exit. |
| Liberal minus LNP donation comparison | $96,465,828 | $96,440,827 | -$25,001: $150,000 less $124,999 lost through the Linc Energy cap exit. |
| Flows omitted from receiptGraph / D1 tables | 131 | 140 | +9 donor-declared-only Libertarian flows; 139 are donor-declared-only and one is Public Funding. |
| Donors with declarations but no party receipt | 10 | 11 | +1: IT Alliance enters through row 137; its $1,000 declaration has no matching party receipt. |
| Climate report: Mineralogy source total | $59,251,342 | $59,501,342 | +$250,000: row 137 adds its receipt to the Libertarian node. |
| Ninth-largest alias gainer, before fallback | $553,057 / 10 rows | $568,913 / 11 rows | +$15,856 / +1: SSAA's Libertarian receipt enters the baseline. |
| Ninth-largest alias gainer, after fallback | $628,057 / 11 rows | $643,913 / 12 rows | Same +$15,856 / +1; its $75,000 alias recovery is unchanged. |
| Federal graph nodes / edges | 413 / 1,158 | 414 / 1,171 | +1 party; +15 Libertarian flows, -3 Linc flows and +1 IT Alliance contract flow. |
| Receipt edges independently checked | 866 | 878 | +12: 15 Libertarian edges less the three Linc cap exits. |
| Libertarian typed federal receipts | No node | $501,562 / 11 rows | New row-137 node: $485,856 Donation Received and $15,706 Other Receipt. |
| Libertarian full party-return receipts | No node | $2,184,694 | New row-137 node: $1,914,346 Donation Received and $270,348 Other Receipt, uncapped. |
| QLD Libertarian record total | No node | $112,382 / 49 rows | Inherited row-137 current/former-name mapping; no QLD donor leaves the cap. |
| VIC Libertarian record total | No node | $56,875 / 20 rows | Inherited row-137 current/former-name mapping; two VIC cap exits are listed below. |
| Search total records | 333,050 | 333,036 | -14: inherited #357 changes (-22 party, +3 donor, +3 receipt, +1 contract) plus one alias-recovered receipt. |
| Search receipt records | 1,590 | 1,594 | +4: three inherited #357 records and one alias-recovered positive flow. |
| Search donor records | 2,435 | 2,438 | +3 inherited #357 records; published past-cap pages are retained. |

## Alias pins retained against the incoming main figures

These values do not change from c1a785831, but the conflicts must keep their recomputed alias contributions rather than main's old numbers.

| Pin | Incoming main | Rebuilt | One-line reason |
| --- | ---: | ---: | --- |
| Finance Donation Received total | $24,731,335 | $24,789,585 | +$58,250 from the conservative alias fallbacks. |
| Finance Liberal donations / all types | $14,402,567 / $64,102,300 | $14,414,067 / $64,113,800 | +$11,500 in each measure from aliases. |
| Finance Labor donations / all types | $8,694,783 / $82,267,799 | $8,722,283 / $82,305,854 | +$27,500 donations and +$38,055 all types from aliases. |
| Finance LNP donations / all types | $270,000 / $10,209,821 | $289,250 / $10,229,071 | +$19,250 in each measure from aliases. |
| Finance all-types total | $169,602,626 | $169,671,431 | +$68,805 aliases; both sides already include the $15,706 Libertarian receipt. |
| Fossil Liberal all types | $2,773,580 | $2,801,080 | +$27,500 aliases retained after the shared cap loss. |
| Fossil Labor all types | $3,708,132 | $3,710,882 | +$2,750 aliases retained after the shared cap loss. |
| Omitted flows | 141 | 140 | One former empty flow now has an alias-matched receipt; Public Funding remains excluded. |
| Gambling all-types total | $8,668,512 | $8,675,112 | +$6,600 aliases; unchanged from c1a785831. |
| Gambling Labor all types | $4,699,593 | $4,706,193 | Same $6,600 alias recovery; unchanged from c1a785831. |

## BACKLOG 3q: cap-only losses inherited from row 137

No cap policy is changed in this lane. These losses are outside the fixed-node-universe matcher guarantee. Individual donor keys are hashed so no private names are added to repo text.

| Jurisdiction / donor | Amount and rows removed from the bounded map | Cause |
| --- | ---: | --- |
| Federal: Linc Energy | $357,799 / 9 | NIOA's newly included LDP gifts raise it into the top 250; Linc falls to 251. Liberal loses $208,000 / 4, LNP $124,999 / 2, and Labor $24,800 / 3. |
| Federal: Linc Energy donor page | $357,799 / 9 typed receipts becomes $671,498 / 18 source records | Cap-only measure change to the retained off-map record total: +$313,699 / +9 displayed records, with no new receipt. This is also BACKLOG 3q. |
| VIC donor key `f615f4ab29d5` | $5,190 / 1, to Liberal | A row-137 donor enters the fixed top-250 list; this donor falls out. |
| VIC donor key `7dea6248e1cc` | $5,190 / 1, to Liberal | A second row-137 donor enters the fixed top-250 list; this donor falls out. |

NIOA was already visible through public money, so crossing into the top 250 does not itself remove its page or old flows. IT Alliance becomes a donor through the new recipient mapping and enters the public-money tier. The two VIC incoming donors have $25,000 / 1 and $5,820 / 2 in Libertarian records. The retained disclosure catalog and donor-index fixture keep the past-cap donor pages reachable.

## Gold, manifest and side files

The follow-up gold has zero changed numeric arrays and no changed names or membership. Only its donation-layer fingerprint changes, `1cb773519dee14865b5bb3ea107eebd008299f72518a8afbbbc6d4eba711952f` to `18b9bab3e4408be67a8aa384c548eb32cb6e821f20f4477f7956bdc90299f5fc`, for the merged nodes, flows, return-name fields and rebuilt receipt metadata. The manifest is rebuilt to `e01592ef2f528dff` (incoming main: `e9c99f16f9879f0d`; c1a785831: `85eaaa76fde28462`).

`build:release` completed offline. Its `voice.js`, `grants-map-LICENSE.txt` and `agency-top-suppliers.json` side files were restored. The newly created voice SDK chunk was removed, then stamps were regenerated and checked. The unrelated social grant refresh was also restored.

## Validation

| Gate | Result |
| --- | --- |
| Python money source/associated-entity, receipt matcher/types, donor disclosure and picture-credit suites | 89 passed, plus 41 subtests |
| Focused money, donor, register, receipt and party-rename Node suites, concurrency 4 | 616 passed, zero failures |
| `tsc --noEmit` | Passed |
| `stamp_assets --check` | Passed; stamps current after restoring the side files |
| Full `npm test`, `.venv/bin` on PATH, concurrency 4 | 4,854 passed, 11 skipped, zero failures; 4,865 total |
| Independent CSV/Decimal reconciliation | 878 receipt edges, 16,212 raw rows; all released non-receipt legacy and party-return fields preserved |
| `build:release`, cached search rebuild, donor-index/report-source checks | Passed |

The full npm run started with load5 at 37.35. The local ignored npm shell places `--test-concurrency=4` before the file list; the repository's npm script is unchanged. All requested checks passed on the merged code. The final changes after that run are report text only. No production calls were made and nothing was pushed.
