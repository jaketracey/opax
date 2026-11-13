# Receipt donor spelling coverage

Offline audit of the released federal graph at c8f6b3b50, using the three cached AEC archives and a read-only copy of the local donor mappings. The recipient-side cells reproduce the released baseline exactly: 16,063 rows, $709,625,419. No production requests were made.

`donor-disclosure.js` `receiptGraph` reads the typed cells; it does not match raw receipt names. `export_money_graph.py` calls `aec_receipt_types.attach_receipt_types`, whose old donor lookup used resolver entities and literal node labels/aliases. Receipt spellings absent from those lookups lost their typed cells. The fix adds a unique normalised spelling fallback followed by a unique bracketless spelling fallback. It uses the existing exact-tier case, punctuation, whitespace and HTML-entity normaliser. Complete round or square brackets may be removed; unbracketed tokens and malformed/nested brackets remain. Matching never uses the recipient to break an identity tie.

| Eligible receipt measure | Before | After |
| --- | ---: | ---: |
| Rows reaching no donor node | 39,066 | 38,917 |
| Dollars reaching no donor node | $510,308,740 | $507,878,484 |
| Exported receipt rows | 16,063 | 16,212 |
| Exported receipt dollars | $709,625,419 | $712,055,675 |

Of the unmatched rows, 155 worth $2,453,306 had a spelling-only candidate: 43 worth $993,924 differed by case, punctuation, spacing or HTML encoding; 112 worth $1,459,382 had bracketless candidates. Of these, 149 rows worth $2,430,256 now reach 32 donors. The bracket fallback recovers 106 rows worth $1,436,332. The reported individual gains four rows worth $65,000: $826,049 over 19 receipts becomes $891,049 over 23. No previously matched row changes node. There are no newly matched rows blocked by a missing edge in this release.

## Ambiguous exceptions

Six rows worth $23,050 remain unmatched. All have the stripped key `deloitte touche tohmatsu`: the source spellings are Deloitte Touche Tohmatsu (VIC), (SA) and (WA). Both Deloitte Touche Tohmatsu and Deloitte Touche Tohmatsu (NSW) already exist as distinct nodes. Neither is chosen. The released metadata records the key's SHA-256, row count, dollars and candidate count, without publishing private disclosure spellings. The released-data test permits only this exception key and requires zero ambiguous case/punctuation-only matches. The remaining 38,911 unmatched rows worth $507,855,434 have no spelling-only candidate among map donors.

## Ten largest donor gains

Amounts only, ranked by recovered dollars. Donor identities are deliberately omitted.

| Before | Gain | After |
| ---: | ---: | ---: |
| $33,749,112 | $468,976 | $34,218,088 |
| $11,532,388 | $259,899 | $11,792,287 |
| $14,441,409 | $215,130 | $14,656,539 |
| $22,365,193 | $203,033 | $22,568,226 |
| $740,646 | $190,322 | $930,968 |
| $4,144,973 | $172,000 | $4,316,973 |
| $4,280,998 | $162,080 | $4,443,078 |
| $3,247,355 | $109,718 | $3,357,073 |
| $6,415,526 | $90,226 | $6,505,752 |
| $553,057 | $75,000 | $628,057 |

## Party effect and preserved fields

The capped typed total for Katter's Australian Party rises $75,000, from $2,115,536 to $2,190,536 (3.545201%). No other party's capped typed total changes by more than 1%. The full party-return totals (`return_by_type` and `return_by_type_year`) and legacy totals do not change. All node ids, labels, aliases, resolver identities, edges and non-receipt money fields remain as released. Only typed receipt cells and their matching audit metadata are refreshed.

The machine-readable companion report contains the counts, dollar figures and all six party changes. Reproduce it against a DB containing the complete cached receipt backfill:

```sh
python -m scripts.audit_donor_receipt_aliases --db /path/to/cached.sqlite \
  --out docs/reports/2026-11-13-donor-receipt-aliases.json
```

The source snapshot used here predates later party-return corrections, so those unrelated released fields were preserved during this focused refresh. The normal nightly exporter applies the new matcher when it attaches typed receipts.

The companion `2026-11-13-donor-receipt-aliases-reconciliation.json` independently recalculates all 866 receipt edges and 16,212 rows directly from the cached annual CSV using Decimal, with no production receipt modules imported. It checks every amount/type/year/count cell, the finance and gambling rankings, and preservation of all legacy fields. Existing portal assertions were updated only for totals affected by the recovered rows.

## Acceptance checks

- Matcher traced from `donor-disclosure.js` `receiptGraph` to `export_money_graph.py` and `aec_receipt_types.attach_receipt_types`. Baseline and refreshed coverage are recorded above and in the JSON audit.
- Conservative case, punctuation, whitespace and bracket matching: `tests/test_receipt_donor_match.py` uses invented names. It covers both bracket forms, capitals, ambiguous stripped keys, distinct existing nodes, resolver collisions, malformed brackets and unbracketed near names. Existing entities and node/edge membership remain authoritative.
- Export coverage and counting: `tests/test_aec_receipt_types.py` checks totals, row counts, ambiguity diagnostics, unchanged legacy cells and the edge cap against invented receipts. Its independent CSV reconciliation imports no production matching module.
- Released-data check: `portal/test/donor-receipt-aliases.test.mjs` permits only the documented six ambiguous branch rows, requires zero unmatched case/punctuation-only exceptions, reconciles the released totals to the audit, and checks the recovered individual figure through the donor projection, map, party register and Ask. It embeds no private name.
- Existing release assertions and one follow-up snapshot turn were refreshed for the measured figures. Snapshot names and membership are unchanged. Climate and gambling report summaries and the search manifest were rebuilt from the updated graph.

## Gates

All final gates passed on the desktop with Node 24.21.0. Generated local Worker types and release assets were prepared first; no production services were called.

- `npx tsc --noEmit`: passed after `npx wrangler types`.
- `node scripts/stamp_assets.mjs --check`: passed, stamps current.
- `.venv/bin/python -m pytest -q tests/test_receipt_donor_match.py tests/test_aec_receipt_types.py tests/test_money_sources.py tests/test_money_associated_entities.py scripts/test_donor_disclosure.py`: 65 passed, plus 32 subtests.
- `node --test --test-concurrency=4` over the 42 money, donor, register and receipt suite files (including money-explain): 583 passed, zero failures.
- `npm test -- --test-concurrency=4`, with `.venv/bin` on PATH: 4,827 passed, 11 skipped, zero failures (4,838 tests).
- Local setup `OPAX_TABLE_METADATA_ONLY=1 npm run build:search`: passed. The independent CSV audit checked all 866 receipt edges, 16,212 rows and preservation of every legacy graph field.
