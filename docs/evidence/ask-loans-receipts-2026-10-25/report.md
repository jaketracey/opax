# Ask receipts: classification blocked by the saved federal data

Audit of branch `web/ask-loans-receipts`, based on `12ce00e22814398b3c10ff4599f89f0dbe0fbde5`, on 25 October 2026. Local assets and previously saved payloads only. No push, deployment, production request or model-provider call.

**The misstatement mechanism is confirmed, but a gifts-only ranking cannot be calculated from the available federal data. Implementation stopped under the requested condition: “If the data has no field that separates loans, stop and report what would be needed rather than guessing by donor name.”** Application code, test fixtures, eval golds and web pages are unchanged. This commit records the investigation and a reproducible local data audit; it does not fix the live answer.

## What the data establishes

Run `node scripts/audit_ask_receipts.mjs` from the repository root to reproduce [data-audit.json](data-audit.json). This reads local files and compares protected assets with the requested baseline; it makes no network requests.

| Saved graph | Donor-to-party receipt edges | Economic classification carried by these edges |
| --- | ---: | --- |
| `money.json` | 866 | None |
| `money.qld.json` | 375 | None per edge; aggregate source flags are retained in metadata |
| `money.vic.json` | 302 | None per edge; metadata declares loan exclusion |
| `money.tas.json` | 178 | None per edge; metadata records one excluded loan |

Federal receipt edges contain `source`, `target`, `total`, `count`, `firstYear`, `lastYear`, `byYear` and sometimes `undated`. `byYear` contains `[amount, count]` cells. There is no receipt type, return type, gift flag, loan flag, debt flag or classification breakdown on an edge. Node `kind=donor` describes a graph role, and `industry=finance` describes an industry; neither classifies a transaction. `grant` and `flow` identify separate public-money flows, not loans. Metadata uses donation terminology but supplies no gift/loan split.

Donor nodes and `donor-index.json` / `donor-disclosures.json` carry `returnReferences[].return_type`. Observed values in the federal graph are `AEC annual return`, `AEC election return`, `ECQ direct` and `icacpls`. They are donor-level references without an amount-to-party receipt join or receipt-type field. A reference saying “AEC annual return” cannot classify an aggregate as gifts. Some references concern other jurisdictions; they are not proof of the composition of a federal donor-to-party total.

The federal ingestion code documents the raw `Detailed Receipts.csv` columns `Financial Year`, `Return Type`, `Recipient Name`, `Received From`, `Receipt Type`, `Value`, but [load_annual_detailed_receipts](../../../parli/ingest/donations.py) only forwards name, recipient, amount, year and `source='aec_annual'`. `_insert_donation` stores no receipt type, original return type, original source file or raw row identifier. Several annual CSV loaders share that same source value. The [schema](../../../parli/schema.py) gives `donation_type` a default of `direct`; this default is not evidence of a gift.

The separate [AEC extras importer](../../../parli/ingest/money_aec_extras.py) recognises `Donation Received`, `Other Receipt`, `Subscription`, `Public Funding` and `Unspecified`, and retains their sums at **return** level as `itemised_*` fields. These are code-supported source labels, not an enumeration verified against raw federal CSV rows in this audit: the local AEC ZIP, donation cache and `parli.db` are absent. The actual published `aec-extras.json` contains party-year `itemised_donations`, `itemised_other_receipts` and `itemised_public_funding`, but no donor-level amounts for these categories. Consequently, these totals cannot identify the leading donor by gifts.

State data has more classification upstream. `ext_donations.disclosure_type` and `is_political_donation` are selected by [export_state_money.py](../../../scripts/export_state_money.py). The saved Tasmanian metadata records `rows_dropped_by_disclosure_type={"loan":1}`; Victoria declares loan exclusion and records no excluded loan rows. Queensland metadata counts 2,500 political-donation, 5,229 gift-not-political-donation and 15,130 unflagged source rows. The local Queensland CSV has `Gift value` and `Political donation` columns. These source-level facts must not be generalised into a missing federal classification or used to label an individual federal edge.

## Where the misstatement enters the answer

| Path | Current calculation or wording |
| --- | --- |
| [Federal export](../../../scripts/export_money_graph.py), `main()` | Selects positive amounts assigned to canonical parties, excludes `donation_type='flagged_review'`, then applies public-funding/internal-party/entity exclusions. It does not filter gifts. It aggregates amounts and counts by canonical donor, party and year, losing source-row classification. |
| [voice-money.ts](../../../portal/src/voice-money.ts), `receiptAnswer` | Sums every matching donor-to-party `edge.total` / `edge.count`, or the selected `byYear` cells. It excludes grants and other public-money flows but cannot exclude loans or other non-gifts. |
| [ask-money.ts](../../../portal/src/ask-money.ts), `rankedMoneyAnswer` | Routes gives/donates/funding/superlative money questions to those totals, sorts donors and returns the largest disclosed total. “Donates” gets a caveat, but the same mixed ranking still answers the donation question. `moneyFacts` passes these amounts to the overview writer. |
| [ask-money-followup.ts](../../../portal/src/ask-money-followup.ts), `fundingScopeQuestion` | Canonicalises a party/donor ranking as “Who donates the most …”, even though its underlying selection is mixed receipts. Follow-ups retain the mixed selection. |
| [ask-money-overview.ts](../../../portal/src/ask-money-overview.ts) | Receives names, amounts, counts, differences and limits, without transaction classifications. It instructs the writer to name the leader; `verifiedOverview` checks numbers, shape and influence overreach, not whether an amount is a gift or a loan. |
| [agentic-tools.ts](../../../portal/src/agentic-tools.ts), `partyDonations` | Sums matching totals/year cells from the same federal graph and sorts descending. The tool is named `party_donations` and its citation labels say donations; its data is unclassified receipts. Local calls reproduced the Westpac totals below. |
| [agentic-ask.ts](../../../portal/src/agentic-ask.ts), result-to-fact conversion | Serialises party-tool rows as “[donor] gave [party] $X (federal disclosures …)”. This converts an unclassified receipt into giving before the final writer sees it. |
| [research-calculated.ts](../../../portal/src/research-calculated.ts) / [research-loop.ts](../../../portal/src/research-loop.ts) | The `ranked_money` research tool also wraps the deterministic answer, exposing its mixed-receipt ranking to the research path. |
| [research-ranking-repair.mjs](../../../portal/src/research-ranking-repair.mjs) / [research-coherence.mjs](../../../portal/src/research-coherence.mjs) | Validate question grammar, party, period, jurisdiction and entity scope, but carry no gift/loan classification. Native “Disclosed receipts” tables and “gave” export facts can become donor ranking rows. |
| [research-writing.ts](../../../portal/src/research-writing.ts) | Extracts `receipts` claim atoms from “gave” facts. `proseFallback` repairs the leader to “provided the most disclosed funding” and can describe donor totals as “gave”. Its general “include more than gifts” caveat does not make that gift/funding claim valid. |

## Labor and the Hanson question: before and after

| Question / path | Reproduced before | Corrected after |
| --- | --- | --- |
| “Who gives the most money to Labor?” — local deterministic answer and local agentic tool | Westpac Banking Corporation, **$55,227,183**, 500 records | **Unavailable:** no donor-level gift/loan split. The next organisation in the mixed ranking is not established as the top gift donor either. |
| “Who does Pauline Hanson's party take the most money from?” — saved research answer through current grounding | Westpac Banking Corporation, **$161,787**, four records to One Nation | **Unavailable:** none of those four records can be classified as gift or loan from this graph. |

The One Nation Westpac edge has precisely three year cells: `1998: [7183,1]`, `2022: [104604,2]`, `2024: [50000,1]`. These sum to $161,787 and four records. There are no receipt-type attributes on those cells. The named-person phrasing is handled by the saved research path; the deterministic function alone requests scope for that exact question. It was not silently replaced by a different question.

The saved [AEC extras](../../../portal/public/graph/aec-extras.json) debt records provide separate evidence: in 2024–25, `parties.Labor.debts.top` lists **Westpac Banking Corporation, $33,680, type Financial**; `parties["One Nation"].debts.top` lists **Westpac, $100,000, type Financial**. The metadata explicitly defines these as **balances owed at 30 June**, including trade creditors and tax liabilities alongside bank loans. The published export only retains the latest year's named top creditors and historical aggregate debt totals.

Thus there is evidence of debt to Westpac for both parties. **It does not prove that any particular portion of the $55,227,183 or $161,787 receipt totals was a loan.** There is no transaction/receipt join, and the differing dates and stock-versus-flow basis prevent subtraction. No claim that the $50,000 One Nation receipt is a loan is made here. No outstanding-debt balance is described as new lending or a gift.

See [baseline-answers.md](baseline-answers.md) for every local question probe in full with its citation inventory, and [baseline-answers.json](baseline-answers.json) for the exact answer text, citation ranges and source snippets. These are unchanged baseline results, not passing corrected eval answers.

## Evaluation and replay

The requested exact question and four controls were probed locally without a provider call:

| Question | Baseline local result |
| --- | --- |
| Who gives the most money to Labor? | Calculated mixed-receipt answer; Westpac $55,227,183. |
| Who donates the most to Labor? | Same mixed ranking with an explicit not-donations-only caveat. |
| Who funds the Liberal Party? | Not routed by `rankedMoneyAnswer`; local `partyDonations({party:'Liberal'})` leads with Westpac $40,608,922 in unclassified receipts. This tool output is not a complete research answer. |
| Who does Pauline Hanson's party take the most money from? | Deterministic scope request; saved research payload replays to Westpac $161,787. |
| Which banks lent money to Labor? | Not routed by `rankedMoneyAnswer`. Separate saved debt records can establish the Westpac balance described above, but not an exhaustive history of new bank lending. |

No model-driven research eval was run, and no gold answer was added: a gold leading with the top donor by gifts would be invented without the missing data. Classification/wording unit tests and a loan-over-gifts ranking fixture are deferred with implementation under the explicit stop condition. Synthetic labels alone would not validate classification of the actual saved federal amounts.

All **158 saved payloads** were replayed locally: 79 in each of the `r4` and `B` arms from the existing `ask-post-deploy-r3/replay.json`. For the same saved input and question, `groundAnswerPayload` at the requested baseline was compared with the current checkout for both answer text and citations. **Changed answers: none; changed citations: none.** This is expected because application code is unchanged; it is not evidence that the loan defect is repaired. [Replay summary](replay-summary.json) records input provenance and the exact comparison. Network requests, model calls and replay cost were all zero.

## Web pages to scope separately — unchanged

These paths consume the same unclassified federal receipt totals. Their contents were inspected locally; no claim is made that a particular loan amount was verified within a page total.

| Page / surface | Finding |
| --- | --- |
| `/money` and donor/party/flow cards, including Westpac focus | [portal/graph/index.ts](../../../portal/graph/index.ts) uses node/edge totals and counts, with “Given across … donations” and “Across … donations” labels. The same shape supplies the map's largest donors and flow rankings. |
| `/money/explain` and scoped flows such as `?jur=federal&from=donor%3Awestpac+banking+corporation&to=party%3ALabor` | [money-explain.js](../../../portal/public/money-explain.js) sums graph year cells, describes “disclosed giving”, and compares other organisations “giving to” the party. Its receipt-vs-gift explanation does not supply a donor-level split. |
| `/subject/party/labor`, `/subject/party/liberal`, `/subject/party/one-nation`, and other party money sections | [partyMoneyData / partyMoneyTableConfig](../../../portal/public/register-tables.js) sums all matching non-grant/non-flow edges, sorts descending, captions the table “Disclosed donations”, and labels the total “Given”. `/api/register/party-money` shares these totals. |
| `/subject/person/<member>` party-money section | [seo-content.ts](../../../portal/src/seo-content.ts) embeds the same party table under “Donors to their party”. This is another placement of the party-money issue. |
| `/subject/donor/Westpac%20Banking%20Corporation` and other donor profiles | The donor profile/export data contains unclassified node/connection totals. [moneySubjectMeta](../../../portal/src/index.ts) describes the node total as receipts but appends “Which parties it funded”. [donorRows](../../../portal/public/donor-views.js) orders amounts without a classification filter; connected party totals inherit the same problem. Source identity confidence does not classify the receipts. |
| `/money/receipts` and money-journey comparisons reached from the map | [money-journeys-data.js](../../../portal/public/money-journeys-data.js) calls donor-to-party edges `giving`, aggregates their totals and ranks the outgoing flows without a gift/loan split. The ledger needs scope review alongside these surfaces even where its visible labels correctly say receipts. |

## Data needed before a correct fix

1. Supply a local, provenance-preserving AEC source bundle or transaction extract covering every included receipt, including the 500 Westpac-to-Labor and four Westpac-to-One-Nation records. Keep `Receipt Type`, `Return Type`, source file, source row/return identifier, donor, recipient, year and amount. Preserve whether a row came from Detailed Receipts, Donations Made, an election return or another stream; `aec_annual` alone loses that distinction.
2. Inspect the **actual** type values and source definitions to identify gifts. An `Other Receipt` label may still be insufficient to distinguish a loan from another non-gift: retain a verified loan/borrowing category or an exact join to the relevant borrowing disclosure where the source supports one. Preserve unknown amounts as unknown rather than inferring from the lender's name. Do not join by name and subtract annual debt balances.
3. Export separate gift, loan/borrowing, other-non-gift and unclassified amount/count/year cells, with source references tied to each classified amount. Keep reconciliation to the current mixed total. Rank gifts only and explicitly disclose excluded loans/unknown receipts; the loan question must use the lending evidence with its own citation and basis.
4. Apply the distinction to the deterministic calculator, canonical follow-ups, overview facts and verifier, agentic tool/fact conversion, calculated research tool, scope/repair rows and prose fallback. Then add the requested golds, classifier/wording tests, bank-loan fixture and model-driven local evals, and rerun the 158 payload comparison, explaining only verified loan-affected differences.

## Baseline gates and spend

`npm ci` was the first shell command and completed successfully. The following checks passed on this baseline application code:

| Gate | Result |
| --- | --- |
| `npm run build:search`, before the portal suite | Passed |
| Full `npm test` | **3,662 passed, zero failed/skipped** |
| `npx --no-install tsc --noEmit`, after Wrangler generated runtime types | Passed |
| `WRANGLER_SEND_METRICS=false npm run check` | Passed |
| `WRANGLER_SEND_METRICS=false npx --no-install wrangler deploy --dry-run --outdir /tmp/ask-loans-worker-dry-run` | Passed; dry-run exited without uploading |
| `votes.json` and `pay.json` versus `12ce00e22` | Byte-identical; SHA-256 values are in `data-audit.json` |

The initial standalone TypeScript invocation preceded runtime-type generation and failed on missing Worker globals. The repository `check` command generated the types and passed, and the standalone TypeScript command then passed. No TypeScript code fix was needed. Generated search-build changes were removed from the working tree before commit.

Logs are local at `/tmp/ask-loans-{build-search,portal-tests,tsc,check,dry-run}.log`. Added evidence and audit scripts are offline only. **External model/eval spend: US$0.00; model calls: zero.** Coding-session model billing is not exposed by the available tools, so no total provider invoice is asserted. Work remained within the 90-minute time box.
