# Ask fix round 3, 13 October 2026

Reviewed baseline: `9672233b7f456c3c1fa1bef04004faafe3dc44fe`. Main `608b824b3bee3f8bb01d7e1872d51db4f12571c9` is merged first. Merge conflicts retain both main's isolated native D1 test storage and this branch's IPv6 fixture SQL adapter; the combined app is content stamped.

Scope resolution now precedes planning, numerical tools and agentic cache lookup. It matches full roster names before contained names and unique surnames, recognizes person grammar and possessives without requiring capitals, and declines unresolved name-like spans. The actual JSON/SSE route falls back through its existing shared deadline and stream relay. Unresolved scopes neither read nor fill the agentic cache. Cache identity includes sorted, deduplicated people, parties and bill keys, as well as all previous dimensions. Prompt/tools versions advance to `agentic-ask-4` and `agentic-tools-4`, invalidating earlier entries.

Facts carry entity identities taken from tool filters and rows. Selection budgets eight facts per requested entity and checks that every requested entity has bound facts before reporting success. Peak-year selection also runs per requested entity. The dormant composition verifier now rejects English cardinal/ordinal number words and compounds, as well as numeric characters. Answer figures continue to come entirely from deterministic templates.

All regressions are in `portal/test/agentic-fix3.test.mjs`:

| Finding | Fixture proof |
| --- | --- |
| P1 lowercase unresolved speaker | Lowercase/capitalized Morgan Fiction, possessives, single names, by/from grammar and partially resolved comparisons decline before planner or count |
| P1 cache entity identity | Changing resolved people, parties or bill keys changes the key; set order/duplicates do not; unresolved scope cannot form a key |
| P1 lowercase then capitalized cache order | Real Worker JSON and SSE both use normal Ask; no agentic cache read/write, planner, count or tool-step event; a poisoned entry is ignored |
| P1 lowercase real MP | User-requested public roster identity Penny Wong resolves without also matching the separate Wong entry; all model/count responses are synthetic and every count constrains Penny Wong |
| P2 requested-entity truncation | Taylor/Pat yearly query produces 24 supported facts and renders eight for each, in either tool order; missing requested-entity facts cannot report success |
| P3 written-out figures | Hyphenated/spaced eighty-seven, aye/no words, dollar amounts, spelled calendar years, ordinals and fractions are rejected |

Copied unchanged into isolated source restored from the reviewed baseline, all six regressions fail: **6 tests, 0 passes, 6 failures**. The fixed targeted suite passes **58 tests, 0 failures, 0 skips**, including existing cancellation, deadline, metric-binding, citations, migration, renderer and operator tests.

The ordinary fixture corpus now has 48 questions. The real `origin/main` Worker and this branch produce **48 JSON + 48 SSE bodies, all 96 byte-identical**, with zero planner calls. All network-dependent tests use offline hosts and stubbed providers; no production Ask, generation, voice or auth call is permitted.

Gate commands: push only `gate/agentic-fix3`, create its isolated desktop worktree, run `OPAX_TEST_HOST=::1 ~/opax-work/web-tests-desktop.sh <worktree>`. On the Mac, run `npm run check` and `npx wrangler deploy --dry-run`. Full suite counts and the tested SHA are reported at completion; the desktop worktree retains `.gate-test.log`.

`portal/public/votes.json` remains byte-identical to main, SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`. Migration and deploy flags are unchanged. No main push, deployment or remote migration is performed.
