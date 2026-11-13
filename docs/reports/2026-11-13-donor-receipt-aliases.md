# Receipt donor spelling coverage after review

This rebuild merges `origin/main` at de66531cc (#355) into the donor-alias lane. Row 137 (`im/ldp-money`) is not included. Counts come from the current cached AEC receipt backfill and the merged exporter, not either branch's previous pins. The before path uses the former entity/raw donor lookup on those same inputs; the after path adds the reviewed spelling fallbacks. No production requests were made.

`donor-disclosure.js` `receiptGraph` reads typed cells. `export_money_graph.py` attaches them through `aec_receipt_types.attach_receipt_types`. Case, punctuation, spacing and HTML encodings use the existing exact normaliser. Bracket fallbacks require one existing node and do not merge or create nodes or edges. The original individual example still gains four rows worth $65,000: $826,049 over 19 receipts becomes $891,049 over 23.

## Corrected effect

| Measure | Before | After |
| --- | ---: | ---: |
| Eligible rows reaching no donor node | 39,059 | 38,913 |
| Dollars reaching no donor node | $509,950,604 | $507,747,630 |
| Displayed donor receipt rows, excluding Public Funding | 16,063 | 16,209 |
| Displayed donor receipt dollars, excluding Public Funding | $708,654,117 | $710,857,091 |
| Raw exported typed rows, including the separate Public Funding cell | 16,064 | 16,210 |
| Raw exported typed dollars | $709,723,890 | $711,926,864 |

The corrected recovery is **146 rows, $2,202,974, across 30 donors**. Removing the annotated restatement alone gives 148 rows and $2,239,934. The state rule then removes two Multiplex NSW rows worth $36,960. No previously matched row moves or is lost. The 43 normalised matches recover $993,924; the 103 bracket matches recover $1,209,050.

The shared selection routes one annotated row worth $190,322 through `flagged_review`. Of the remaining eligible unmatched rows, six worth $23,050 are ambiguous, two worth $36,960 fail state compatibility, and 38,905 worth $507,687,620 have no spelling candidate. The current inputs have 154 rows worth $2,262,984 differing only by case, punctuation, spacing or brackets, including the two state conflicts. Of these, 152 worth $2,226,024 are permitted spelling candidates before removing the six ambiguous rows.

## Annotation review

The Liberal 2021-22 `Detailed Receipts.csv` line 25857, Transcendent Australia (please see annotation note page 18), restates $190,322 already itemised on line 25856. Lines 25855 and 25856 are $42,222 and $190,322; the donor's own return has those two gifts. The annotation is not an alias. Its donor keeps $740,646 over eight typed receipts, instead of the incorrect $930,968 over nine.

Complete bracketed text containing the words see, note, page or annotation (case-insensitive, including plurals) is routed to `flagged_review` before matching, and has no bracket alias key. The matcher itself also refuses it. Legitimate bracketed middle names and branches remain eligible. This changes donor matching and the uncapped comparison's shared selection; the separate party-return aggregate policy is unchanged.

## State brackets and judgement calls

State brackets must match each other exactly after case/punctuation normalisation. A unique stripped node must have an alias with either identical state-bracket content or no state bracket. This preserves existing group/branch modelling through an unqualified alias. State compatibility never selects one node from an ambiguous stripped key.

The reviewed judgement calls are explicit:

- Australian Capital Equity (Management) Pty Ltd, $10,000: retained under the existing unique group-node alias rule. Removing Management is a grouping judgement, not evidence that the companies are legally identical.
- Multiplex Developments (NSW), $36,960 across two rows: now unmatched. The only supporting alias is Multiplex Developments (QLD) Pty Ltd, so stripping both states is not allowed.
- AMWU (Tim Ayres), $20,000: retained under the existing union-node model. The brackets name a person, not another union node; the source wording is not a new entity merge.
- Woolworths Ltd (Patersons), $9,000: retained under the unique-node alias rule. The bracketed qualifier is a judgement call, not proof of legal equivalence.

Union branches continue to follow the existing modelling. The Deloitte Touche Tohmatsu (VIC), (SA) and (WA) spellings remain six ambiguous rows worth $23,050 because both the general node and a separate NSW node share the stripped base. State filtering does not choose between them. The released metadata identifies the exception key by SHA-256; no private disclosure spelling is added to the report or tests.

## Ten largest donor gains

Amounts only, ranked by recovered dollars. Donor identities are omitted.

| Before | Gain | After |
| ---: | ---: | ---: |
| $33,749,112 | $468,976 | $34,218,088 |
| $11,532,388 | $259,899 | $11,792,287 |
| $14,441,409 | $215,130 | $14,656,539 |
| $22,365,193 | $203,033 | $22,568,226 |
| $4,144,973 | $172,000 | $4,316,973 |
| $4,280,998 | $162,080 | $4,443,078 |
| $3,247,355 | $109,718 | $3,357,073 |
| $6,415,526 | $90,226 | $6,505,752 |
| $553,057 | $75,000 | $628,057 |
| $4,509,342 | $67,787 | $4,577,129 |

Only Katter's Australian Party's capped typed total changes by more than 1%: $2,115,536 to $2,190,536, a $75,000 gain (3.545201%). The full party-return totals, legacy totals, node identities, labels, aliases and edges are preserved.

## Inputs and independent check

The current release backfill reproduces every released party-return cell. Its cached annual CSV has 124,286 rows, whereas the older local archive used in the initial lane had 124,237. Rebuilding includes one additional exact-name Electrical Trades Union receipt of $98,471 to Labor, separate from the 146-row alias recovery. The recomputed before baseline already includes that row. No Liberal Democrat recipient mapping or row-137 code is included.

The independent stdlib CSV/Decimal verifier checks all 866 receipt edges, every type/year/amount/count cell and all 16,210 raw exported rows, as well as preservation of every legacy and party-return field. The cached Detailed Receipts CSV was repacked locally for this check; the companion reconciliation JSON records both the archive hash and the CSV hash. Public Funding stays in its own typed cell and is excluded from displayed figures under #355. The `donor:nsw efa` assertion is retained.

Reproduce the coverage report from a DB containing the complete current cached backfill:

```sh
python -m scripts.audit_donor_receipt_aliases --db /path/to/cached.sqlite \
  --out docs/reports/2026-11-13-donor-receipt-aliases.json
```

## Acceptance checks

- `tests/test_receipt_donor_match.py` uses invented names to cover annotation rejection/review, valid bracketed branches, matching state brackets, NSW/QLD mismatch, ambiguity, existing distinct nodes, case, spacing and malformed brackets.
- `tests/test_aec_receipt_types.py` checks an invented annotated restatement is excluded once through `flagged_review`, including its audit count and an independent raw CSV calculation.
- `portal/test/donor-receipt-aliases.test.mjs` is pinned from this build. It checks annotation review, state mismatches, the unchanged Deloitte exception, Public Funding separation and `nsw efa`, the reviewed donor's non-duplicated total, and the recovered individual through the donor projection, map, register and Ask.
- #355's assertions are retained. Dollar/count pins, the follow-up snapshot, money graph, report summaries and search manifest are regenerated from the merged code.

## Validation

| Gate | Result |
| --- | --- |
| Python receipt matcher/types, money sources/associated entities, donor disclosure and merged picture-credit suites | 84 passed, plus 41 subtests |
| Focused money, donor, register and receipt Node suites, concurrency 4 | 598 passed |
| Released donor-alias checks | 4 passed |
| Follow-up snapshot checked against the merged tool | 9 passed; only numbers changed, with all #355 wording and membership retained |
| TypeScript `tsc --noEmit` | Passed |
| `stamp_assets --check` | Passed; stamps current |
| Full `npm test`, `.venv/bin` on PATH, four workers | 4,846 passed, 11 skipped, zero failures; 4,857 total |
| Independent CSV/Decimal reconciliation | 866 receipt edges and 16,210 raw rows; all legacy and party-return fields unchanged |
| Cached search rebuild | Passed; manifest regenerated from this graph |

The final full npm run started with load5 at 39.14. A local ignored npm shell put `--test-concurrency=4` before the file list; appending it after the list did not constrain Node, so that initial attempt was stopped. The repository's npm script is unchanged. An earlier completed full run hit the supplier directory's 15-second wait under rising host load; its isolated suite then passed 11/11, and the final full run passed. No directory code or timeout was changed.

The first focused run exposed nine stale figure pins after merging #355. These were recomputed from the rebuilt graph and the focused run passed all 598 tests. No production calls were made and nothing was pushed.
