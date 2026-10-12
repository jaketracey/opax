# Ask fix round 2, 13 October 2026

Reviewed baseline: `ac07b719dfd90b171458823dc9424601ba05d82e`. Main baseline: `c41740e8e52128b7b761a2499a186277387f93b3`.

All calls use invented fixture people and counts, stubbed models, and offline Worker hosts. No production Ask or generation call is permitted.

The answer is now entirely templated from tool rows. The only model call is the planner. Each rendered figure stays beside its tool-row entity and metric: speech counts, party/year counts, labelled-speech denominators and percentages, aye/no summaries and dollar amounts. The defensive composition verifier rejects all model-authored numeric characters, including supported figures, years and citation ids. There is no placeholder protocol or connective-model call to bypass this boundary. Prompt and tools cache versions advance to `agentic-ask-3` and `agentic-tools-3`.

People and parties are matched against the roster, with standard party aliases and unique surnames; ambiguous surnames decline. Bill keys and titles are matched against the bill list. Every matched person or party must constrain the applicable plan lookups before they run. Resolving a person without constraining the numerical lookup cannot authorize an overall count. Missing or unsupported named scope produces `answered:false` with `reason:declined`, and the actual `/api/ask` route falls back within its existing deadline. Bill-scoped speech counts and person-to-party donation joins remain on normal Ask until tools can enforce those constraints.

| Finding | Regression file | Proof |
| --- | --- | --- |
| Aye/no swaps | `portal/test/agentic-fix2.test.mjs` | Tool totals aye 2/no 1 remain unchanged; swapped prose is rejected and no composer executes |
| Party/year swaps | `portal/test/agentic-fix2.test.mjs` | Labor and Greens retain their separate 2024/2025 tool rows; only one model call |
| Model digits | `portal/test/agentic-fix2.test.mjs` | Counts, years, dollars, percentages, citation ids and Unicode numeric characters are rejected |
| Dropped speaker | `portal/test/agentic-fix2.test.mjs` | Unscoped Taylor plan declines before counting; constrained plan returns 87; real JSON and SSE use normal Ask fallback |
| Other named scope | `portal/test/agentic-fix2.test.mjs` | Dropped party, partially scoped people, ambiguous surname and named bill decline |
| Citation scope | `portal/test/agentic-citations.test.mjs` | Exact dates and venue survive citation URLs, client hydration, pagination, request serialization and the actual search filter |

Both new test files were copied unchanged into an isolated temporary source tree restored from the reviewed baseline. The baseline produced **9 tests, 0 passes, 9 failures**. The fixed targeted suite passes **49 tests, 0 failures**.

The ordinary fixture corpus now includes the reviewer's additional ten questions, for **38** questions. The parity test imports the real `origin/main` Worker and compares response bytes: **38 JSON plus 38 SSE bodies, all 76 identical**, with zero planner calls.

Desktop gate command: `OPAX_TEST_HOST=::1 ~/opax-work/web-tests-desktop.sh <worktree>`, after pushing only `gate/agentic-fix2`. Mac gates are `npm run check` and `npx wrangler deploy --dry-run` from `portal`. Full gate counts are reported with the tested SHA in the completion report and retained in the desktop worktree's `.gate-test.log`.

`portal/public/votes.json` remains byte-identical to main, SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`. Migration `0016_agentic_shadow.sql` and deploy flags are unchanged. No main push, deploy or remote migration is performed.
