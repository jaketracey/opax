# Enrich discovery D1 statement limits — round 2

Branch: `data/enrich-discovery-timeout`. Base: `ee95dca7ae45ddc28b22ea10b0da3fe5205ebf23`, which the orchestrator reported deploying as `opax-enrich` version `fbbdf312`. The final handoff supplies this fix's SHA. Nothing was deployed here.

## Offending query and actual limits

`enqueue()` in `enrich/src/db.ts` built an `INSERT OR IGNORE INTO queue ... SELECT ... UNION ALL SELECT ...` statement with up to ten task rows. Discovery's four-resource chunk expands four speeches into eight task rows, so its queue insert has eight compound terms and up to 80 bound parameters. That already exceeds the runtime's compound limit and fails before discovery reaches federal run admission.

Cloudflare's current runtime source sets `SQLITE_LIMIT_COMPOUND_SELECT` to **5** and `SQLITE_LIMIT_VARIABLE_NUMBER` to **100**: [workerd SQLite security configuration](https://github.com/cloudflare/workerd/blob/main/src/workerd/util/sqlite.c%2B%2B). D1 also documents the 100-parameter ceiling: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). The fix uses single-row statements, so it works within the actual five-term ceiling as well as the requested 50-term test ceiling.

The earlier suite's stock SQLite shim did not enforce these runtime restrictions. The revised shim reproduces the exact reported `D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR` for the old eight-term query and now defaults to five terms and 100 parameters across the entire enrich suite.

| Query or operation | Before | Fixed or verified bound |
| --- | --- | --- |
| `enqueue` unbounded/held task insert | Up to 10 `UNION ALL` terms, up to 100 parameters | One task per statement: one SELECT term, 9 held / 10 unbounded parameters. At most 49 inserts plus one historic-hold update in each 50-statement transaction |
| `holdHistoricStatement` resource `IN` list | Input size plus one timestamp parameter | `holdHistoricStatements` chunks at 50 resource IDs: at most 51 parameters. Singular helper rejects oversized callers |
| `claimRids` resource `IN` list | Input size plus three parameters; normal configuration capped this at 93, but a bulk caller could exceed 100 | Chunks at 50 IDs: at most 53 parameters; statement batches at most 50 |
| `finishRows` updates | One update per row, 16 parameters, potentially an unbounded statement batch | Same 16-parameter updates, dispatched in batches of at most 50 |
| Discovery cursor/window/partial checkpoints | Separate single-row UPSERT statements in an atomic batch | Already safe: each has three parameters, and the transaction has two or three statements. Unchanged |
| `ownedBudget` / run ownership lookups | One resource per query | Already safe: one parameter; no page-wide compound or parameter list. Unchanged |
| Queue dedup and race protection | `INSERT OR IGNORE` plus `WHERE NOT EXISTS` on resource ownership | Preserved in every single-row task insert; the resource guard is included in the ten-parameter bound |
| Run admission | Fixed per-resource transaction, normally six statements for a speech, at most nine parameters per statement | Already safe; transaction and ownership/cap checks unchanged |
| Historic reconcile inserts | Fixed two-row VALUES statement, 12 parameters | Already safe and unchanged; existing statement dispatch is chunked at 50 |

No other production compound SELECT builder was found in `enrich/src`. Other run call/reservation queries use fixed SQL and at most 11 parameters. The global strict shim covers them in the existing suite.

## Exact admission and recovery

`ownedBudget`, `assertBudgetOwnership`, `admissionBudget`, `admit`, model reservations, the US$40 ceiling and daily guards retain their existing behavior. `run-budget.ts` was not modified. The per-resource admission transaction remains atomic and is not split by the general statement batching helper.

Queue inserts still check ownership within the insertion statement, so a budget appearing after the initial ownership lookup cannot create uncapped work. Historic terminal states, explicit releases and task deduplication are preserved. Discovery's window/page/row checkpoints and its rule that the cursor advances only after durable queue/admission work are unchanged. Existing live checkpoints can resume without a migration, rewind or manual queue write.

## Verification

Six new tests cover:

- A fake D1 rejecting 51 compound terms and 101 parameters, with positive tests at exactly 50 and 100.
- Reproduction of the old eight-term queue failure at the actual five-term limit, followed by successful single-row enqueue.
- Bulk enqueue/dedup, historic holds, claim and completion for 513 resources (1,026 tasks), checking statement parameter counts and batches.
- A mixed catalog with 1,027 rows in two seconds, including 1,024 timestamp ties, fractional timestamps and window edges. Both five-term and 50-term backends make durable progress across ticks, queue exactly 2,054 unique tasks, advance each completed window exactly, preserve overlap dedup and reserve the federal run's credits exactly.
- 513 resources in an exhausted US$40 federal run: all retain waiting ownership; no uncapped queue rows, model calls or extra credits appear; the cursor still reaches the completed window end.

The existing enqueue-failure test now injects its error at the ninth task statement, after one four-resource chunk has been safely queued, preserving its original failure/replay scenario.

Gates all passed:

- Enrich suite: **291 passed, 1 existing skipped, 0 failed** (292 tests).
- `npm --prefix enrich run check`: **passed**, `tsc --noEmit`.
- `npx wrangler deploy --dry-run` from `enrich/`: **passed**, Wrangler 4.142.0; 936.46 KiB bundle / 247.30 KiB gzip.
- `git diff --check`: **passed**.

No live D1 writes, KB writes, model calls or deployment occurred. Tests use in-memory SQLite and fake KB/AI. An optional local read-only Miniflare limit probe stalled during startup and was stopped; it is not counted as verification. Runtime limit evidence comes from Cloudflare's source and the strict regression tests. No live recovery claim is made before the orchestrator deploys this fix.

## Orchestrator deploy command

After selecting the handoff SHA in the reviewed worktree:

```sh
cd /Users/jake/Projects/opax-ios-wt/enrich-discovery/enrich
npx wrangler deploy --config wrangler.jsonc
```

This command was not executed. After deployment, read `/status` to verify that the compound SELECT error clears, the speech cursor advances and run `9a73f94c…` appears with its exact US$40 cap.
