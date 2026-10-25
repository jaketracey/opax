# Interim wording for unclassified political receipts

Baseline: `3ed331fdf87ea81735296a75ea47d012c9eff36d`, branch `web/ask-loans-receipts`. Work performed locally on 25 October 2026. No push, deployment or production request.

**Federal receipt totals are now described as disclosed receipts, with an explicit statement that they mix donations with other receipts such as loans and are not a donation ranking.** No receipt has been reclassified, excluded or subtracted. Importers, database schemas and classified export cells are outside this change.

## Changes

- Deterministic rankings retain the same amounts and record counts. The lead names the source of the largest receipts and includes the mixed-receipts limitation. Canonical follow-up questions use receipts wording. The exact Hanson wording and the direct “Who funds the Liberal Party?” wording reach the matching receipts calculation.
- Overview instructions require neutral receipt language; the verifier rejects giving/donating/funding claims and reversed receiver/source wording. Cached overview paragraphs are reverified, and the overview cache version changes.
- The exposed tool is `party_receipts`. Its description, citation labels, progress labels, constraints and planner vocabulary use receipts. The exported `partyDonations` function remains available to existing imports. Facts now read “[party] disclosed $X in receipts from [source]”.
- Calculated research results, receipt atoms, the prose fallback, scope/repair rows and the writer use the same rule. Simple money-ranking tool calls retain the complete calculation so selecting a runner-up cannot substitute for the leading source. The writer retains the required receipt leader and rejects receiver/source inversions.
- The final JSON/SSE/cache boundary migrates old wording and moves citation spans with the edited text. Historical evidence remains available to the claim verifier while its displayed snippet is neutralised. An internal legacy-proof mode retains the previous figure-selection checks before the final wording migration; it is not a second user-facing answer path. This is what keeps the saved replay's numbers unchanged.
- State aggregates also use receipts wording because the published edges do not retain a classification for each amount. No state aggregate is newly described as gifts.
- Party tables, map cards, map/explanation prompts, `/money/explain`, donor profiles and money journeys use receipts wording. Amounts, layout code, table keys, sorting and the existing CSV schema remain intact. Generated map bundles and dependent asset stamps are included.

See [files.txt](files.txt) for the full implementation/test/asset file list. The primary changes are in `ask-money*`, `voice-money.ts`, `agentic-tools.ts`, `agentic-ask.ts`, `ask-constraints.ts`, `ask-party-subject.ts`, `receipt-language.mjs`, `research-receipts.ts`, `research-calculated.ts`, `research-writing.ts`, `research-writer.ts`, `research-grounding.ts`, the ranking/coherence/claim-audit modules, and the existing web renderers. `scripts/research_eval.mjs` gains an optional bounded-request reservation while preserving its existing default; unknown-cost failures remain charged to the cap.

## Before and after

The complete pre-change Labor and Hanson answers and their citation inventories are in the [Round 1 baseline evidence](../ask-loans-receipts-2026-10-25/baseline-answers.md). The following are the opening paragraphs; the figures are unchanged.

**Labor, before**

> **Westpac Banking Corporation** has the largest disclosed total to Labor in this published selection: **$55,227,183**.

**Labor, after**

> The largest disclosed receipts to Labor in this published selection are from **Westpac Banking Corporation: $55,227,183** across 500 records. These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.

**Hanson research answer, before**

> Across disclosed returns from 1998-99 to 2025-26 in OPAX’s published selection, Westpac Banking Corporation provided the most disclosed funding to One Nation: $161,787.

**Exact Hanson question, after**

> The largest disclosed receipts to One Nation in this published selection are from **Westpac Banking Corporation: $161,787** across 4 records. These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.

The research fallback uses the equivalent source-first wording: “Westpac Banking Corporation was the source of the largest disclosed receipts to One Nation: $161,787”, alongside the financial-year range and the same limitation.

**Party money page, before → after**

`/subject/party/labor`: table caption **Disclosed donations → Disclosed receipts**; amount-column label **Given → Received**. The Westpac row remains **$55,227,183**, **500** records, with the same first/last years and source link. Column keys remain `label`, `industry`, `total`, `count`, `firstYear`, `lastYear`.

## Five local eval questions

The exact Labor question is added to `portal/test/fixtures/research-evals.json`. All five questions are in `portal/test/fixtures/ask-receipts-probes.json`. Expected shape: receipts lead, explicit mixed-receipts sentence, cited existing figures, no gift claim. The lending control expects the debt-record limitation rather than a donation/receipt ranking.

| ID | Question | Final local result |
| --- | --- | --- |
| RC01 | Who gives the most money to Labor? | Pass: Westpac $55,227,183, receipts lead and mixed-receipts sentence. |
| RC02 | Who donates the most to Labor? | Pass: same total and limitation. |
| RC03 | Who funds the Liberal Party? | Pass: Westpac $40,608,922, receipts lead and limitation. |
| RC04 | Who does Pauline Hanson's party take the most money from? | Pass: Westpac $161,787, receipts lead and limitation. |
| RC05 | Which banks lent money to Labor? | Pass: cannot establish a complete bank-lending history; debt balances are owed at 30 June and only the latest year's largest creditors are named. Cites `aec-extras.json`. |

Run the final offline harness with `node scripts/ask_receipts_eval.mjs --offline`. It uses local assets, `calculatedLookup`, fact conversion, writing facts, the research prose fallback and final answer grounding, then the existing research eval grader. Outbound fetches are forbidden. **5/5 pass**, including the separate wording/basis checks. [eval-summary.json](eval-summary.json) contains the results and exact opening text.

**Every final answer is retained in full, with inline citation markers and its source inventory, in `portal/private/ask-receipts-round2/answers.md`; `results.json` retains the exact payloads and citation spans.** These local artifacts are deliberately not committed because a complete Liberal source list includes a private individual. The fixtures and committed report do not introduce private individuals' names.

Provider-backed local runs were also attempted, using `--local-data` to block production/remote data access. They exposed and helped fix runner-up selection, receiver/source reversal and misuse of receipt records for lending questions. The final provider attempt passed RC01/RC02, then returned HTTP 503 for RC03; admission stopped before RC04/RC05 under the spend cap. Consequently **the final 5/5 is an offline research-tool/fallback/grounding evaluation, not a claim of five final successful provider generations**. Earlier provider attempts exercised all five questions. No production verification is claimed.

The lending answer states, with its own debt-basis citation:

> The published debt records cannot establish a complete list of banks that lent money to Labor. They report balances owed at 30 June, rather than amounts newly lent, and name only the latest year’s largest creditors.

## Saved replay

Run `node scripts/ask_receipts_replay.mjs <existing-158-payload-replay.json>`. The input is the same saved `ask-post-deploy-r3/replay.json` used in Round 1, with 79 `r4` and 79 `B` payloads. Original questions, source data and constraints are retained. The comparator runs baseline and current grounding on the same saved input, checks answer text and citations, compares every numeric token, and checks repeat application of the wording boundary.

**158 replayed; 46 changed answers/citation maps; zero changed numbers; zero changes outside money answers; zero unsafe receipt claims; zero repeat-application differences.** No network or model calls. [replay-summary.json](replay-summary.json) contains every changed ID and its one-line reason. [replay-differences.md](replay-differences.md) lists the same 46 changes for review. Full before/after replay payloads remain local in `portal/private/ask-receipts-round2/replay.json`.

Statements in genuine speech evidence are not relabelled as unclassified receipt calculations; for example, a cited speaker's claim about donations remains their claim. The wording guard acts on statements bound to receipt evidence.

## Gates and data integrity

- Search built before the full suite; map bundles rebuilt and asset stamps checked.
- **Full portal suite: 3,672 passed, zero failed/skipped.** This includes the five local probes, synthetic bank-sized mixed receipts, writer/overview guards, direction checks, JSON/SSE/cache replay, scope/repair controls, and web table schema/value checks.
- Standalone TypeScript: passed. `npm run check`: passed. Deploy dry run: passed without uploading.
- `votes.json`, `pay.json`, the four money graphs, AEC extras and both donor indexes are **byte-identical** to `3ed331fdf`. SHA-256 evidence is in [data-integrity.json](data-integrity.json).
- The search build's unrelated statute-title source-count, party-members and search-manifest refreshes were excluded from the commit, as in Round 1. Gate checks ran after the required search build. No money dataset was regenerated or edited.

Logs are local under `/tmp/ask-receipts-*`, including `suite-pass.log`, `tsc-final.log`, `check-final.log`, `dry-run-final.log`, `replay-gate.log` and `eval-final-offline.log`. The temporary local Worker was stopped and the temporary credential symlink removed.

## Spend and limits

[spend.json](spend.json) records **US$0.031710336** in reported successful provider usage and **US$0.95** retained for two unknown-cost HTTP 503 requests (US$0.75 and US$0.20). **Conservative total: US$0.981710336, below the US$1.00 cap.** The last local Worker run had a 20,000-token ceiling and used the existing conservative US$10/million-token reservation rule. No further provider calls followed that run. Final offline evals and the 158-payload replay cost zero.

Coding-session billing is not exposed by the tools; the figures above are the tracked model-provider evaluations. The work remained within the 90-minute box. No push or deployment was performed.
