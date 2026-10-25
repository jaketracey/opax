# Round 8: exact family matching

Parent: `cac58cd74`. No model/provider calls, production requests, push or deployment. Model spend: **US$0.00**. Wrangler was run with `--dry-run` and metrics disabled.

## Change

Removed the edit-distance function, keyword corrections, fuzzy party spans, ambiguity scoring and their distance tests/export. Party names and aliases now match exact normalised text; longest complete aliases take precedence over nested names (for example Liberal National Party before Liberal). Verbs are matched only by the existing conjugation grammar.

Kept case/whitespace and apostrophe normalisation, plural possessives, the two expansions of “who's”/“whos”, and “who've”. The only spelling corrections are the fixed six-entry map: `teh`/`hte` → `the`, `waht` → `what`, `moeny` → `money`, `donatoins` → `donations`, `dontes` → `donates`.

A family clarification requires an exact party, an exact most/top/biggest/largest cue, and an exact financial cue. It also requires a bounded incomplete financial-question grammar: unknown vocabulary takes the ordinary route. The generic calculator now declines bill/policy titles, advice and naming questions too, preventing a bill title rejected by the family router from being caught by the older money fallback. Model sentences are untouched.

## Tests

- All **612** original generated grammar checks and **216** retained Round 7 checks reach the existing full receipts calculator, with table, party-specific source links and citations.
- **36** fuzzy-only generated positives are removed and tested as ordinary-route controls: 24 keyword/ranking/verb cases and 12 party-name cases. Every wording appears in [removed-fuzzy-cases.md](removed-fuzzy-cases.md). Four fuzzy clarification fixtures also become ordinary-route controls.
- **15** fixed-spelling checks exercise the authorised map across three parties.
- **68** primary negative checks: the original 24 plus 44 near misses (including all 10 previous long-tail negatives). Founding, Liberty, Nationalism, advice, names, bill titles, policies, the ABC and priorities do not enter the family route.
- All five previous exact reproduction fixtures remain calculated. Their JSON/SSE checks plus five valid incomplete-grammar clarification fixtures produce **20** responses without reading poisoned answer caches or calling a model.
- The six review regressions are checked on JSON and SSE (**12** responses). Liberty and Nationalism retain the existing general money calculator’s honest unmatched-source question, with no substituted party or figure. The founding, naming, advice and bill-title questions reach the ordinary Ask cache path. These are offline route assertions, not generated answers.
- Agentic, research-loop, follow-up and voice checks retain the same shared decision. Clarifications carry no invented amounts or citations. The voice uncertain fixture now uses exact incomplete grammar rather than a misspelled verb.

All **95** focused tests and all **3,746** portal tests pass. Search was built before the full suite. TypeScript, check and the deploy dry run pass; see [gates.json](gates.json). Build churn was restored. All nine protected data files, including votes/pay, remain byte-identical; [hash evidence](data-integrity.json).

## Replay

**158** saved payloads replayed locally against `origin/main` (`7b5a0e471`). **112 non-family payloads are identical to main**. The existing **46 family payloads** comprise 42 calculated tables (200 table rows) and four explicit evidence gaps, with zero damaged answers. **All 158 payloads are byte-identical to the reviewed Round 7 replay: zero incremental changes**. [All differences from main](replay-differences.md) and [machine-readable summary](replay-summary.json).

[Coverage and removed cases](coverage.json), [changed files](files.txt), [spend](spend.json). Raw saved payloads and detailed logs remain ignored under `portal/private/ask-receipts-round8/`.

The accepted residual risk is unchanged: free-form questions outside the closed family can word receipt inputs loosely. This round does not add model-prose enforcement or broaden party identities.
