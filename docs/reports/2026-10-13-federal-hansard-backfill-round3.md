# Federal backfill cap repair, round 3 — 13 October 2026

The waiting-resource cap bypass is fixed. This round performed fixture tests, source GETs and a fresh staging dry run only. No production DB/KB/D1 writes, real model calls, enrichment queueing, deployment or push occurred. The local commit SHA is provided in the handoff.

## Durable ownership before admission

`ownedBudget()` reads the resource's durable `enrichment_units` ownership whether `admitted` is zero or one, including its original first-call reservation size. Discovery uses that ownership even when the KB retains its other metadata but drops `enrichment_budget`. A present budget must agree with the saved run and ceiling. Unfunded waiting resources remain outside the pending model queue.

The shared `enqueue()` entry point also resolves durable ownership, so a manual/admin caller that omits budget metadata still passes through bounded admission. Ordinary pending-row insertion checks for ownership in the insertion statement itself, preventing ownership created after the earlier lookup from slipping into the ordinary queue. Historic terminal holds retain their existing behavior.

Processing independently resolves ownership before generation. Every attempt for an owned resource must obtain `reserveCall()` under both the existing daily neuron guard and the immutable run ceiling. An unadmitted waiting resource cannot obtain that reservation or call the model. Missing KB metadata never converts owned work into ordinary spending. This uses the existing migration `0005`; no additional migration or configuration change is required.

Four new regressions cover exhausted-run rediscovery, processing a legacy queued waiting resource, a caller omitting the budget at enqueue, and funded waiting work resuming with its original ownership. The first three failed before the fix. With an exhausted **US$40** run and a later KB response dropping only the budget field, they now produce **zero model calls, zero new call reservations and zero additional spend**; the run ledger remains unchanged. When headroom returns, waiting work resumes and books its call to that same run.

## Fresh dry-run counts

Staging: `/home/jake/opax-staging/federal-backfill-round3-20261013/staging.sqlite`, copied from `parli.db` opened read-only. Every year/chamber count and exclusion equals the preceding rehearsal:

| Year | Chamber | Missing days | Inserted rows | KB documents | Length excluded | Procedural excluded | Duplicates | Identity conflicts |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2019 | House | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2019 | Senate | 40 | 10,602 | 7,168 | 5,354 | 514 | 22 | 581 |
| 2020 | House | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2020 | Senate | 46 | 12,310 | 8,713 | 5,753 | 465 | 33 | 611 |
| 2021 | House | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2021 | Senate | 52 | 13,503 | 8,990 | 6,336 | 603 | 62 | 282 |
| 2022 | House | 20 | 5,028 | 3,730 | 1,753 | 200 | 19 | 158 |
| 2022 | Senate | 34 | 9,220 | 6,133 | 4,734 | 324 | 24 | 122 |
| 2023 | House | 44 | 11,075 | 8,011 | 3,912 | 574 | 34 | 350 |
| 2023 | Senate | 47 | 14,876 | 9,961 | 7,651 | 497 | 44 | 173 |
| 2024 | House | 62 | 15,500 | 11,275 | 5,333 | 968 | 37 | 534 |
| 2024 | Senate | 52 | 14,558 | 9,854 | 7,396 | 607 | 53 | 187 |
| 2025 | House | 3 | 671 | 486 | 209 | 48 | 0 | 6 |
| 2025 | Senate | 3 | 830 | 559 | 399 | 44 | 0 | 4 |
| **Total** | | **403** | **108,173** | **74,880** | **48,830** | **4,844** | **328** | **3,008** |

Parser identity failures remain zero. All 304 occupied days are held, with the partial-day inventory identical. All **74,880 payloads** and **20 samples** match after normalizing only the fresh run UUID. The normalized payload SHA-256 is `f6c8b18db4038415d679a6d15c1dc0b40231dbc00e677572e1d79f6324e4c6d4` for both runs. `previous-counts-comparison.json` and `payload-comparison.json` retain those checks.

Full-row SHA-256 verification confirms all **1,316,517 original speeches** retain every original field and citation ID in both source and staging: `6e6140feb0455611abbe132644bec10eb7183c20ca7c3f23afb1fb8b54ad948d`. The staging directory retains the verification, source/loader receipts, samples, complete partial-day inventory, forecasts and artifact checksum manifest.

The write size remains **303,356,332 bytes**, with **4.16 hours** planned at 5 documents/second. **74,880 summaries and 74,880 topic-label assignments** are needed. The existing `opax-enrich` forecast is unchanged: **US$23.26** first pass, **US$25.30** with the planning retry/escalation scenario, and **US$108.10** without the hard ceiling in the maximum-primary-output scenario. The enforced run ceiling remains **US$40**, combined with the existing daily neuron guard. No enrichment was queued.

## Gates

- Full Python suite: **1,347 passed**, with **15,364 passing subtests** and no skips. The standalone backfill suite also records **27 passed**.
- Full enrichment Worker suite: **269 passed**, including all four new cap regressions. Enrichment TypeScript checking passes.
- Portal Worker suite: **1,490 passes** in the full run. Its **17 failures** were missing generated hub/election assets; after building those locally, all affected checks passed in a **75-test** hub/render/crawl recheck plus the **one** affected privacy check. The initially unimportable election test module also executes successfully. `worker-gate-verification.json` verifies every initial failure is resolved; no failures or skipped tests remain unverified. Portal TypeScript checking passes.
- `git diff --check` passes.

Logs and the dry-run comparison are retained in the staging directory. This runner cannot reach IPv4 loopback: an offline HTTP probe times out, while IPv6 succeeds. The portal's Miniflare bind default was temporarily changed to IPv6 in the installed dependency for local D1 tests, with `OPAX_TEST_HOST=::1`; the original dependency was restored afterward. Generated tracked snapshots remain byte-identical. No portal source, test logic or configuration was changed.

The exact go command remains the [round-2 command](2026-10-13-federal-hansard-backfill-fix.md#updated-go-command), including `--enrichment-max-usd 40`. The reviewed Worker must include this fix before the orchestrator enables loading. This round does not change the loader, owner locks, accepted-row ownership, citation IDs, KB slot or nightly configuration.
