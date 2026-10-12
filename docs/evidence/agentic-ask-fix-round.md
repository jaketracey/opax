# Ask fix-round evidence, 13 October 2026

Reviewed baseline: `d10c64865d331782680ebccdc79b7853b98b07a0`, after merging the UI lane. `origin/main` baseline: `c41740e8e52128b7b761a2499a186277387f93b3`.

All reproduction calls use invented fixture people, fixture counts and stubbed models. Outbound service hosts must start with `offline.`. No production Ask or generation is called.

The new regressions were copied unchanged into a temporary source tree with the three reviewed Worker modules restored from the baseline. Running `node --test --test-name-pattern=P1` over `agentic-fix`, `agentic-deadline` and `agentic-route` produced **8 tests, 0 passes, 8 failures**:

| Blocker | Regression | Baseline failure |
| --- | --- | --- |
| Misrouting | `agentic-fix.test.mjs`: classifier | Ordinary question routed instead of Ask |
| Entity/count swaps | `agentic-fix.test.mjs`: entity figures | Swapped 87 and 60 accepted, rather than two dropped claims |
| Unknown subjects | `agentic-fix.test.mjs`: unknown subject | Quantum dragons answered instead of declined |
| Planner junk | `agentic-fix.test.mjs`: planner junk | Malformed plans answered instead of declined |
| Reader cancellation | `agentic-route.test.mjs`: reader.cancel | Tool continued after reader cancellation |
| Single deadline | `agentic-deadline.test.mjs` | Request exceeded the single deadline |
| Shape/cache collision | `agentic-fix.test.mjs`: cache | Over-time classified as ranking rather than trend |
| Fallback integration | `agentic-route.test.mjs`: junk and unknown subjects | Agentic payload returned instead of normal Ask |

The deadline test accelerates the clock and explicit timeout timers by 40 times. Both JSON and SSE start an abort-aware stalled lookup, then reach stalled normal Ask fallback. The new implementation terminates both within 40 seconds of simulated request time and aborts the actual fallback fetch. The old implementation exceeds the watchdog. The cancellation test consumes progress frames until the tool starts, then calls the actual response reader's `cancel()`; it does not substitute a request AbortController for reader cancellation.

The must-not-route corpus contains the reviewer's eight ordinary questions and twenty additional questions in `portal/test/fixtures/agentic-ordinary.mjs`. `agentic-parity.test.mjs` loads the real Worker from `origin/main` and compares exact response body bytes with the routed Worker: **28 JSON and 28 SSE bodies, all 56 identical**, with zero planner calls.

The targeted fixture suite passes **48 tests, 0 failures**, including those new regressions, the existing renderer compatibility check, local SQLite migration validation, monitoring privacy, donor rules and step-loader tests. The source is also checked by `npm run check` and Wrangler's deploy dry-run.

P2 scoped other-period follow-ups and stale delayed step imports are fixed and tested. Exact date/venue citation filters remain deferred: the search route and its client currently accept years and do not preserve venue. Changing the citation URL alone would silently widen the linked search.

Jake's gambling fixture SSE and plain answer remain at `agentic-ask-route-fixture.sse` and `agentic-ask-route-fixture.txt`. The figures are synthetic; the answer uses the existing renderer.

`portal/public/votes.json` remains byte-identical to `origin/main`: SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Desktop gate setup: export `OPAX_TEST_HOST=::1` when calling `web-tests-desktop.sh`. IPv4 loopback times out on this desktop; a direct HTTP probe succeeds on IPv6. `local-miniflare.mjs` selects this host for fixture Workers and uses asynchronous fixture-only SQL requests to native D1, avoiding Miniflare's blocking binding proxy on IPv6. The application Worker, native SQLite constraints, atomic batches, scheduled expiry and voice assertions remain exercised. No test is skipped. The MCP test already supports the same host variable. The operator security sweep now covers the bearer-protected gold route too, and the module stamp sweep follows literal URL constants used by dynamic imports.
