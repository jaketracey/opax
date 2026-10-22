# Ask: post-deploy party subject and plain coverage fix

**Round 2 supersedes the surname and temporal-affiliation policy below:** [strict party resolution](SCOPE-ASK-POST-DEPLOY-R2.md).

Base: `8ea0bddb843db52885758c6550807c6d316373ea`. Local-only work; no push, deployment or production OPAX/KB requests. Claim-plan C is unchanged. Financial audit and roster quote ownership code are byte-identical to the release.

The production Hanson answer carried `people: ["Pauline Hanson"]` and no party, so the fail-closed ranking repair correctly refused to turn One Nation evidence into a person-scoped answer.

## Changes and tests

- Resolve `<person>’s party` and `the party of <person>` before extracting subjects, using only the public roster’s `party_now`. Unique surnames work; full names win over nested surname matches. Person ownership becomes a party scope, and the canonical question reaches research, constraints and ranking repair. One Nation/PHON/official party title aliases agree. Official party titles do not add their founder as a person filter. The allowlist remains token-complete and all existing scope checks remain.
- Missing or ambiguous current affiliations return a typed party clarification before any tool/model call. Adam Bandt has no `party_now` in this roster, so his party question clarifies rather than guessing from his historical Greens label. Unknown people, ambiguous surnames and conflicting roster entries also clarify. The calculated “party of the MP who made the most speeches” question retains its original research path.
- Known federal donation coverage produces one sentence for the 1990 question. It deduplicates the repeated limit, omits unknown endpoints, uses grammatical copy, preserves the source’s financial-year spelling and cites the coverage plus requested-period evidence when needed. Unrelated scope refusals, moderation, answered:false and clarifications keep their decision and text.
- `portal/test/ask-party-subject.test.mjs`: 36 new tests, including JSON/SSE × fallback × cache, exact production question, Bandt, Albanese, unknown/former/ambiguous owners, official party aliases, calculated subjects, protected decisions, and plain coverage with a clean audit. Existing scope/allowlist, legacy parity and plain-language tests also pass.
- Writing cache version advanced to `written-answer-9`, preventing old completed answers from sharing the new cache key.
- Local harness adds `--local-data`: all D1/KV bindings local, remote AI/services removed, fetch restricted to localhost and the OpenRouter model host. No secrets printed or committed. Follow-up requests use `clientConversationRequest` and `recordConversationTurn` from `scripts/research_followups.mjs`.

## Offline replay

158 saved final payloads: original 50 + six donor questions + 23 follow-up turns, on each saved arm. Both boundaries graded with the same current grader. No model calls or network requests.

| Saved arm | Payloads | Sentence/citation differences | Grade differences | Audit findings |
| --- | ---: | ---: | ---: | ---: |
| r4 | 79 | 0 | 0 | 0 |
| B | 79 | 0 | 0 | 0 |

Difference list: **none**. Citation keys and ranges, full grade objects and second-boundary idempotence also agree.

## Five local probes

The Hanson calculator selected matching receipts from 1998–99 through 2024–25; this is the selected facts’ period, not the overall collection coverage through 2025–26. Amounts below are from the selected local tool data. Citation numbers below render the returned anchors; source URLs are not fetched.

### P1-HANSON: Who does Pauline Hanson's party take the most money from?

Decision: `answer`; 3853 ms.

Across disclosed returns from 1998–99 to 2024–25 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding: $161,787. [1](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Awestpac+banking+corporation)

- Australian Hotels Association (NSW) provided disclosed funding: $126,996. [2](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Aaustralian+hotels+association)

- Sporting Shooters Association of Australia (Queensland) Inc provided disclosed funding: $43,057. [3](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Asporting+shooters+association+of+australia)

- Adani Mining Pty Ltd provided disclosed funding: $30,000. [4](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Aadani+mining)

- National Australia Bank provided disclosed funding: $19,715. [5](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Anational+australia+bank)

These disclosed party receipts include more than gifts and cover only the published selection; undisclosed receipts below the disclosure threshold make totals a lower bound, rather than an exhaustive industry total or personal payments, and a donation is not evidence that it influenced a vote or speech. [1](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Awestpac+banking+corporation) [6](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation)


### P2-FOLLOWUP: Did that buy their votes?

Decision: `refusal`; 530 ms.

Public donation and voting records do not establish that money caused a vote. I can help compare the disclosed records without making that allegation.


### P3-MOSTYEARS: Did Westpac give money to One Nation in most years?

Decision: `limitation`; 3815 ms.

The selected evidence does not establish the requested answer for this scope.

This selection covers only receipts in the published map, not every donor, and the amounts are party receipts rather than personal payments to politicians. [1](https://opax.com.au/money?jur=federal&type=receipts&party=party%3AOne+Nation&focus=donor%3Awestpac+banking+corporation)


### P4-1990: Who gave the most money to One Nation in 1990?

Decision: `limitation`; 1950 ms.

OPAX's federal donation records start in 1998-99, so they can't show who gave the most money to One Nation in 1990. [1](https://opax.com.au/money/party/One%20Nation)


### P5-SMITH: Which Smith gave the most money to One Nation?

Decision: `clarification`; 24 ms.

Please give the full name of the person you mean so I can distinguish their records.


## Spend and gates

All reported model charges: **US$0.0095943**. Accounted total: **US$0.1095943** of the US$0.50 cap, including a US$0.10 reserve for one local HTTP 503 (“Worker restarted mid-request”) without reported usage. That restart followed the initial search build; its case was re-run. One additional 1990 recheck after preserving the source’s financial-year spelling is included in the charges. No further model calls.

All five final answers pass coherence and have zero audit findings. Offline verification confirms they remain unchanged through the final boundary.

Final gates: **3,409/3,409 full portal tests** after `npm run build:search`; `npx tsc --noEmit`; `npm run check`; and `WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run` all pass. `votes.json`, `pay.json` and `research-claim-audit.mjs` remain byte-identical to `8ea0bddb8`. Test command: `node --test --test-reporter=tap --test-concurrency=4 test/*.test.mjs`.

Local evidence and complete logs: `portal/private/ask-post-deploy/` (git-ignored).
