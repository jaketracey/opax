# Row 173 merge-forward: receipt identity conflict

Historical stop report, superseded by the orchestrator ruling and [the completed bracket-recovery report](2026-11-14-ask-money-merge-forward.md). The reviewed receipt pin is retained.

Stopped under the instruction to report a capped figure pinned as truth rather than re-pin it. No merge commit or push. HEAD remains `b9ffbd025bcf213a9254551ab032503d5e1d2538`; fetched main is `fdba7591835bd9937da77d6417a29dd27879f312`.

## Row 169

The saved donor fixture answered only `/graph/money.json`, while the factual router now reads `/graph/money-receipts.json`. Pointing that same fixture at the uncapped path and marking its scope uncapped makes **all nine tests pass**, preserving every existing amount, status, wording, period, follow-up and zero-model assertion. The donor-total renderer already works with the full typed source; no assertion was weakened.

## Row 160: the stop condition

The recovered-individual assertion identifies its source by the published **$891,049 / 23 receipts**, without embedding a private name. The uncapped source contains two resolved entities for those receipts:

| Measure | Map's pinned donor | Uncapped donor entity | Four receipts under another resolved entity |
| --- | ---: | ---: | ---: |
| All receipt types | $891,049 / 23 | $826,049 / 19 | $65,000 / 4 |
| Donation Received | $881,049 / 22 | $816,049 / 18 | $65,000 / 4 |
| Other Receipt | $10,000 / 1 | $10,000 / 1 | $0 / 0 |

The four rows have a different, non-null `ReceiptSelection.entity()` from the pinned donor. This was verified against `/tmp/ldp/scratch.db` opened read-only; that corpus reproduces every current main drawing edge's typed amount/year cells exactly. The original committed uncapped asset also has $826,049 / 19 for the pinned donor.

`aec_receipt_types.attach_receipt_types` builds `ReceiptDonorMatcher` over the drawing's nodes. With the other resolved entity absent from that capped node set, those four rows reach the displayed donor via `brackets`. With both identities available, the reviewed matcher's earlier `entity` tier instead selects the other entity. Thus the map pin reflects cap-dependent identity matching, rather than four missing receipts in the uncapped selection. Adding the four rows to the displayed donor while retaining them under their original entity would double-count them; moving them requires an explicit identity reassignment.

The existing row-160 numeric assertions remain **$891,049 / 23**, unchanged. The test asset wiring now uses the full source and forbids reading the drawing asset for Ask; the named receipt tool retains its all-types default, with donations explicitly requested. The attempted full-catalogue matcher implementation and its generated data changes were removed after confirming this identity conflict. No donor entities or source sheets were merged or edited.

## Merge and checks

- Conflict resolutions retain this branch's money-explain/quiz imports, uncapped browser parse and re-pins, plus main's h2 headings and added off-map heading test.
- Asset stamps and spa-shell regenerated; stamp check passes.
- `cd portal && npx tsc --noEmit`: passed.
- Row 169: nine passed; row 160's $891,049 assertion remains unresolved.
- Full npm and ask-replay were not run after reaching the explicit stop condition. No green full-suite claim, no new SHA, no push.

The merge remains pending for review of the receipt-to-entity assignment. All investigation was local/offline apart from the requested Git fetch; no production, model or SSH calls.
