# Enrich discovery timeout recovery — 13 October 2026

Implementation is on `data/enrich-discovery-timeout` in `/Users/jake/Projects/opax-ios-wt/enrich-discovery`, based on `4db5d03897088b111dbe37a817347a612d80cb62`. The final handoff supplies the commit SHA. Nothing has been deployed.

## Cause and live read-only measurements

Discovery repeats an open-ended, ascending-created speech catalog query after each timeout. The federal ingestion makes that range expensive. Reducing the response page size alone does not resolve the timeout. A narrow created range resolves it.

The probes used the production `Kb` client, service-account header and configured Sydney zone. `enrich/.dev.vars`, the checkout `.env` and the main checkout `.env` were absent; the local ARAG credentials were found in `/Users/jake/Projects/opax-ios-wt/web-agentic-ask/portal/.dev.vars`. The expected federal run and cap were verified in returned metadata. Equality with the deployed Worker's secret values could not independently be checked; no secret or full KB ID was printed.

| Since (UTC) | Until (UTC) | Page size | Elapsed | Result |
| --- | --- | ---: | ---: | --- |
| Oct 12 08:41:11 | Open-ended | 200 | 20,004 ms | Client timeout |
| Oct 12 08:41:11 | Open-ended | 50 | 20,003 ms | Client timeout |
| Oct 12 08:41:11 | Oct 12 09:41:11 | 200 | 182 ms | 5 overlap rows; complete |
| Oct 12 08:41:11 | Oct 12 08:46:11 | 50 | 122 ms | 5 overlap rows; complete |
| Oct 13 00:05:00 | Oct 13 01:05:00 | 50 | 11,856 ms | 50 rows; another page |
| Oct 13 00:05:00 | Oct 13 00:10:00 | 50 | 69 ms | Empty; complete |
| Oct 13 00:11:00 | Oct 13 00:12:00 | 50 | 819 ms | 50 rows; another page |
| Oct 13 00:11:34 | Oct 13 00:11:44 | 50 | 368 ms | 50 rows; another page |
| Oct 13 00:11:34 | Oct 13 00:11:35 | 50 | 133 ms | 10 rows; complete |

These bounds retain the Worker's whole-second lower-bound formatting. The first backfill sample had run `9a73f94c…` and `max_usd: 40`; basic and full reads took 110 ms and 83 ms. Ten full reads from the one-second backfill window produced initial reservations of 153–216 neurons, mean 173.7, using the existing admission calculation without invoking a model.

Inference: matching/sorting the large open-ended range dominates catalog latency before page-size truncation. The probes establish a range-size problem; there was no KB server tracing to identify a particular index or execution plan.

The documented filter is `{ prop: 'created', since: ISO, until: ISO }` within the existing resource expression. Progress documents created date ranges and supports them on `/catalog`: [search filters](https://docs.rag.progress.cloud/docs/rag/advanced/search-filters/). Context7 MCP was not exposed in this session, so official web documentation was used.

## Design and exactness

- Start with a one-hour created window, a page size of 50 and an inclusive lower/upper bound. Windows halve on timeout, a response slower than one second, or a full first page with more results. Shrinking survives the tick boundary. Windows align to whole seconds and shrink to one second; sparse windows grow back up to one hour.
- Persist `discovery-window:<kind>` with bounds, span, page, page size and row offset. Queue chunks of at most four resources, then checkpoint the row offset. Persist the next page only after its rows have been queued. Timestamp ties spanning many pages can therefore finish across ticks without starting the same first page forever.
- Advance `cursor:<kind>` to a window's end only after all of its rows have been queued or registered through exact budget admission. Successfully read empty windows advance too. Cursor, window and partial state are checkpointed atomically after enqueue. A failed checkpoint safely replays queued resources.
- Completed walks retain the 120-second overlap; partial walks resume their saved position. Adjacent windows re-read inclusive edges. Existing queue/resource ownership rules prevent duplicate tasks or credits. Cursor progress stays monotonic.
- Keep the configured `maxPages` per kind and shared `maxMs` for the pass. Failed/discarded catalog attempts count toward `maxPages`. Catalog and metadata reads use at most five seconds or the remaining time. No new chunk starts after time expires; a started chunk may finish its enqueue/checkpoint beyond the soft deadline.
- Count catalog, basic, full-resource and D1 statements, including every statement in a batch. Discovery has an 800-unit shared ceiling and control headroom. A tick subtracts processing's D1 queries from the 1,000-query allowance and leaves 30 for logging/cleanup. Tick stats expose `discoveryRequests`. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Preserve `ownedBudget`, both `assertBudgetOwnership` checks and `admissionBudget`. Federal rows go through `enqueue` and its existing run admission transaction. Cap exhaustion creates durable waiting ownership instead of uncapped queue work. `run-budget.ts`, run pricing, model reservations and the daily guards are unchanged. Historic hold behavior is preserved.

No schema migration, cursor reset or live queue seeding is required. Response-body timeouts are now classified as KB backpressure too. The read-only probe is `enrich/scripts/measure_catalog.mjs`; run it with Node's `--env-file` and `--since=ISO`, optionally `--metadata`.

## Gates

- Enrich suite: **285 passed, 1 existing skipped, 0 failed** (286 tests).
- `npm --prefix enrich run check`: **passed**, `tsc --noEmit`.
- `npx wrangler deploy --dry-run`, from `enrich/`: **passed**, Wrangler 4.142.0; 935.84 KiB bundle, 247.26 KiB gzip.
- `git diff --check`: **passed**.

Seventeen new tests cover bounded-query recovery, durable shrink, page/time limits, empty-window progress, inclusive and fractional timestamp edges, ties across pages, overlap visibility, metadata chunk resumption, request accounting, queue/checkpoint failure replay, response-body timeout, 429 handling, exact federal ownership/reservations/waiting admission, conflicting budgets and whole-tick D1 headroom. Existing cursor expectations were updated to window-end progress and fixtures were bounded around their test dates.

All live calls were read-only catalog/basic/resource reads. Tests used an in-memory SQLite database and fake KB/AI. No real model calls, KB writes, canary requests or live queue writes occurred. No development server or port was needed.

## Admission time

The configured cron is once per minute. With six catalog attempts and the conservative request ceiling, a 2,000-resource in-memory fixture at 12 resources/second took 35 ticks: one adaptation tick, then about 59 new run-owned resources per tick. Its average extrapolates to **1,311 minutes (21 h 51 min)** for 74,880 resources. Plan approximately **22–24 hours to discover/register the whole run** under similar density and healthy KB/D1 latency. Processing shares the query allowance and the 20-second discovery time box can reduce this rate. This is a local projection, not a measured production admission rate.

Funded queue admission is separate: US$40 is 3,636,363 neurons, and the sampled 173.7-neuron initial reservation supports roughly 20,934 simultaneous funded units. Other discovered resources remain waiting under the same run. Given the reported idle live queue, new federal work at priority 100 uses the configured 150,000-neuron steady daily guard; this is inferred from the supplied status and repository configuration, not a fresh `/status` read.

Using the repository's planning average of 26 actual neurons per completed speech, approximately 63,442 completions would free enough credit for all 74,880 resources to have been admitted. That requires about **11 UTC daily budget allowances**; completing all enrichment would require about 13. These are estimates using ten reservation samples and a historical planning average. Actual text lengths, usage and retry costs determine funded admission timing and whether the run's remaining cap funds every resource. The hard cap remains exact throughout.

## Orchestrator deployment

From the reviewed worktree, after selecting the handoff commit:

```sh
cd /Users/jake/Projects/opax-ios-wt/enrich-discovery/enrich
npx wrangler deploy --config wrangler.jsonc
```

This command targets `opax-enrich` with the existing production configuration and secrets. The deploy is for the orchestrator; it was not executed here. After deployment, read `/status` to confirm bounded cursor progress and the `9a73f94c…` US$40 ledger. Live recovery remains unverified until then.
