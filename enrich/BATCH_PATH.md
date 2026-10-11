# Historic enrichment through Haiku Message Batches

T1 briefs use this path following the 11 October decision. T2/T3 can use the same
path. The live worker retains its qwen3 primary, escalation, retry and terminal
rules. This branch incorporates desktop `web/enrich-hold` at `4bcf50235`, including
per-resource deferral when source classification fails. The original paid tests
called Anthropic only; the review fixes used recorded fixtures with no API or
production calls, push, deploy or KB writes.

## Validator-failure analysis

These IDs are the original bake-off request indices, not resource slugs. No source
text, speaker metadata or private names are included. The original 188/200 and
192/200 counts measure the post-cleanup summary/topic validators; the frozen name
screen was reported separately. Both models had the same raw and cleaned pass
counts. None of these failures concerns length, JSON formatting or topic lists.
Empty topics remain a legitimate verdict.

| Model / request | Failed validator | Evidence and interpretation | Follow-up after one correction |
| --- | --- | --- | --- |
| Haiku unit-008 | Copied opening | First 60 brief characters occur in the source's first 240 characters. A paraphrase rule, not evidence of a false fact. | Still copied; release |
| Haiku unit-066 | Figure provenance | `4,665,600` consolidates source digits separated by spaces. Numerically faithful formatting, but the unchanged parser recognises separate figures. | Pass |
| Haiku unit-068 | Speaker and figure provenance | Speaker inference and figures `4`, `1993` came from metadata; source numeric evidence is only a time. | Pass |
| Haiku unit-069 | Copied opening and figure provenance | Shortened financial year ends in `94,`; source has full `1994`. The parser removes commas, so this is year contraction rather than a trailing-comma false positive. | Still copied; figure repaired; release |
| Haiku unit-111 | Figure provenance | `1997,` comes from the title; the unit text supplies no `1997`. Removing the comma would still fail. | Pass |
| Haiku unit-125 | Copied opening | Same 60-character opening test. | Pass |
| Haiku unit-136 | Figure provenance; separate frozen guard hit | `2000` comes from metadata. The frozen guard hit was independently reviewed as a non-person facility reference. | Pass under current guard |
| Haiku unit-145 | Copied opening | Same opening test. | Pass |
| Haiku unit-159 | Figure provenance | Bill number `1` and year `2002` come from metadata; source has no numeric tokens. | Pass |
| Haiku unit-168 | Copied opening | Same opening test. | Pass |
| Haiku unit-179 | Copied opening | Same opening test. | Pass |
| Haiku unit-198 | Copied opening | Same opening test. | Pass |
| qwen3 unit-016 | Brief is not a string | Null/missing persisted brief. Export has no underlying rejection/refusal/attempt reason. | Haiku pass |
| qwen3 unit-066 | Brief is not a string | Same missing-output limitation. | Haiku pass |
| qwen3 unit-079 | Brief is not a string | Same missing-output limitation. | Haiku pass |
| qwen3 unit-145 | Brief is not a string | Same missing-output limitation. | Haiku pass |
| qwen3 unit-147 | Brief is not a string | Same missing-output limitation. | Haiku pass |
| qwen3 unit-163 | Brief is not a string | Same missing-output limitation. | Haiku pass |
| qwen3 unit-168 | Brief is not a string | Same missing-output limitation. | Haiku pass |
| qwen3 unit-194 | Brief is not a string | Same missing-output limitation. | Haiku pass |

Haiku totals: seven copied openings, six figure failures, one speaker-inference
failure. One record overlaps copy/figure failures. The original frozen guard
flagged four Haiku outputs and one qwen3 output, all reviewed as non-person
references; its delivery gates would admit 185 and 191 respectively. That is
different from the 12/8 summary-validator failures above.

The copied-opening and digit-grouping rules can reject factually sound prose.
They predate qwen3: the worker ports the Codex runners' validation rules. There
is no evidence that these rules were tuned to favour qwen3. Metadata-derived
figures and speaker inference are substantive provenance problems. Missing
qwen3 exports cannot be diagnosed more precisely without its rejection logs.

The batch prompt imports `buildSystemPrompt`/`buildUserPrompt`, enables the
historic section, and adds reminders about paraphrasing, length and exact numeric
notation. Title and slug are omitted from model input; the original title remains
in the validation record. Schema requires the outstanding keys and constrains
topics to the worker enum. Corrections include the previous rejected brief and
the worker's transient unsupported terms; accepted topics are retained. No
validator, vocabulary exemption, cleanup function or name guard was loosened.

## Paid follow-up

The union of the 12 Haiku failures and eight missing qwen3 units has 17 records.
The current worker's broader novelty guard added 18 further records, giving 35.
This deliberately goes beyond the bake-off's frozen screening guard.

| Measurement | Result |
| --- | ---: |
| Fresh calls using amended prompt | 35 |
| First-pass acceptance under current historic validators | 18/35 |
| Corrective summary-only calls | 17 |
| Final acceptance | 32/35 |
| Original Haiku failures repaired | 10/12 |
| Missing qwen3 units with accepted Haiku output | 8/8 |
| Remaining failures | 2 copied openings; 1 unsupported capitalised term |
| Billed total | US$0.00967154 |
| Follow-up cap / lane test cap | US$0.50 / US$3 |

All 52 API calls succeeded without refusal. The first batch completed in about
100 seconds and the corrective batch in about 54 seconds. Those small batches
do not predict throughput for a 1,000-unit batch. This follow-up tests validator
repair on difficult records; it is not a new independent factual-quality review
or a population estimate. The three remaining candidates would be released to
the live worker, never written by this path. No KB or production D1 call was made.

Private receipts and request data are under
`/home/jake/opax-staging/federation/enrich-batch-path/rerun/`. Reproduce with
`node enrich/scripts/batch-rerun.ts prepare|submit|poll|retry|poll-retry`;
preparation/submission refuse to overwrite existing plans or submit twice.
Only numeric evidence is committed in `batch-path-measurements.json`.

## Delivery and recovery

| Authenticated route | Purpose |
| --- | --- |
| `GET /backfill/batch?limit=20&after=RID` | Read held historic rows and full source snapshots; no mutation. Cursor advances past ineligible rows. |
| `GET /backfill/batch/reservations?run_id=RUN&limit=200&after=RID` | Read this run's authoritative ownership, including completed/canceled jobs; no KB read or mutation. |
| `POST /backfill/batch/reserve` | `{run_id,rid,source_hash}` reserves an eligible held unit after re-reading source. Retries for the same run/unit/hash return its current state, including concurrent insert retries. |
| `POST /backfill/batch/result` | `{run_id,rid,source_hash,result:{summary,topics}}` validates and delivers the DB-owned tasks. |
| `POST /backfill/batch/cancel` | `{run_id,rid}` abandons ownership before live release; an active writer lease blocks cancellation. Missing ownership is acknowledged as `unreserved`; another run's ownership as `unowned`, without altering it. |
| `POST /backfill/release` | Existing `{slugs:[...]}` route releases remaining holds at priority zero. Active batch ownership blocks release. |

Ownership lives in `batch_items`, with one row per resource. The queue remains
`done/historic-held` during Anthropic processing; claims and stale-claim sweeps
cannot take it. Forced rows are excluded. The server accepts only the held tasks
it reserved, checks current historic labels and source hash, and imports both
`validate.ts` and its novelty guard. Caller validation flags have no effect.

Accepted values go through `writeItem`, exactly as a tick does: a fresh existing
brief check, fresh classification merge, preservation of non-topic labels,
read-back repair, and the historic short/name checks. Partial delivery is recorded
per task; retries preserve earlier completed tasks. A 15-minute writer lease
prevents overlapping delivery and live release. Backpressure retains paid results
for another write attempt. Active writer contention returns **423** with
`lease_until`; the controller saves `retry_at`, retains the paid result, and retries
the same delivery after expiry. It also defers cancellation until that lease
expires. **409** remains a permanent ownership/source/queue conflict and takes
the cancellation/release path. Refusals, failed corrections and definite write refusals
cancel batch ownership and use `/backfill/release`; batch attempts do not consume
the live worker's attempts or change its names-rejection/terminal rules.

Short units are never submitted. The client releases them so the live worker can
apply its existing short-unit terminal rule without a model call. Dry worker mode
validates results and retains their holds; delivery after switching live revalidates
and re-reads. Replaying the same result is idempotent; a different result for a
completed job is rejected.

The Node 24 client uses one durable private spool. A SQLite controller lock
serialises commands and releases on crash; JSON updates use atomic rename and
fsync. Selection is saved before the worker reserve request. Every resumed
`step`, `cancel` and `adopt` first reads all server reservations for its run ID.
Thus a crash after reserve succeeds but before the local `reserved` save recovers
the owner, and cancellation calls the worker before marking the unit released.
The same reconciliation repairs old locally released units whose server
reservation remains active. If cancellation succeeded but live release failed,
resume finishes `/backfill/release` before saving local completion. A different
owner is acknowledged server-side and left alone. Failed/incomplete ownership
reads stop the command before batch API calls or writes.

The spend reservation is saved before the Anthropic POST. An ambiguous POST blocks resubmission.
Locate its remote ID through Anthropic's batch list, then use `adopt`; adoption
waits for an ended batch and verifies every saved custom ID before recording it.
Do not create a second submission while resolving an ambiguous one.

Receipts account for ordinary input, one-hour/five-minute cache writes, cache
reads, output, and the long-context tier. The hard cap uses conservative UTF-8
input bounds and full output caps before every submission. Outstanding bounds
carry across UTC days; settled receipts count on both their submission and
completion days. Canceled batches remain reserved until their final receipts
arrive, and late results cannot deliver into released rows. The client caps
Anthropic spend; fallback qwen3 spend remains subject to the worker's neuron cap.

Use one controller host and one permanent spool shared by every run. Back up and
move the entire spool when moving hosts; retain old run files because they are
the lifetime ledger. No multi-host spend coordination is claimed. Default daily
and lifetime caps are both US$3; raising either requires the orchestrator's run
configuration. API keys and admin tokens are never stored in the spool.

## Projection and run plan

The reference generation cost is the complete bake-off's US$0.099287225 per
1,000 units, including its retries. The qwen3 fallback reference is the measured
pilot-route US$0.5061375 per 1,000. Current
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and
[batch pricing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
confirm US$0.05/M ordinary input and US$0.25/M output for this model below 100k
prompt tokens, with the batch discount also applying to caching.

| Volume | Batch generation reference | With 1% live fallback | With 3% live fallback | With 6% live fallback |
| --- | ---: | ---: | ---: | ---: |
| T1: 170,982 non-short units | US$16.98 | US$17.84 | US$19.57 | US$22.17 |
| T2: approximately 741,000 units | US$73.57 | US$77.32 | US$84.82 | US$96.07 |
| T3: approximately 321,000 units | US$31.87 | US$33.50 | US$36.75 | US$41.62 |
| T2 + T3: approximately 1.062M | US$105.44 | US$110.82 | US$121.57 | US$137.69 |

Formula: `units * (0.099287225 + fallback_fraction * 0.5061375) / 1000`.
T1 excludes the manifest's 8,810 short units from 179,792. T2/T3 counts are rough
volumes before their short-unit exclusions. Fallback fractions are scenarios,
not measured forecasts. Added prompt text, cache hit variation and different
historic source lengths may increase generation cost. The difficult follow-up's
US$0.27633/1k is not a representative population price. T1's US$17–20 target is
plausible at roughly 1–3% fallback with modest cache/prompt overhead, but not
guaranteed. Monitor both ledgers. At zero fallback, T2/T3 save about US$432
against the pilot qwen3 reference; at 3% fallback, about US$416.

Start with 1,000 eligible units per batch, two Anthropic batches in flight, and
one controller. This means roughly 171 T1 initial batches, plus corrective batches
only for rejected tasks. Poll/step every five minutes. For planning, allow
30–60 minutes per initial/corrective batch and additional serial KB delivery time:
roughly 4–8 days for T1; 16–32 days for T2 at the same settings. These are workload
assumptions, not a measured SLA. Measure the first 1,000 units before increasing
batch size or concurrency; the client supports up to 5,000 units and four active
batches, within the 250 MB conservative request limit and spend reservations.

[Anthropic's batch documentation](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
says most batches finish within an hour, with a 24-hour processing limit; results
are retained for 29 days. A slow queue leaves rows held, preserves the spend bound,
and allows later steps to poll. Alert after two hours; do not automatically switch
to full-price synchronous Anthropic calls or submit duplicates. An expired/error
result gets at most one corrective batch, then live release. For an urgent manual
fallback, `cancel RUN` cancels the remote batch and releases ownership through the
worker. Continue `step RUN` afterward to collect its final charge; late successes
are discarded. If the POST is ambiguous, reconcile/adopt first.

## Orchestrator deployment

1. Merge this commit, including the hold dependency. Apply D1 migrations through
   `0004_batch_path.sql` before deploying code that queries batch ownership.
2. Deploy **opax-enrich only**, retaining its existing KB/admin secrets and qwen3
   models, with `HISTORIC_HOLD=true`. `WRITE_MODE=dry` retains held results for
   review; `live` enables the authenticated delivery route. No portal deployment
   or Anthropic Worker secret is required.
   Deploy the reservation-read route and 423 lease response before updating the
   controller; no migration beyond the existing additive `0004` is needed for
   these review fixes. Run `check_historic_hold.ts` before the next historic push
   and reconcile its recorded slugs.
3. Install/run the Node 24 client on the desktop controller. It reads only
   `ANTHROPIC_API_KEY` from `/home/jake/opax/.env`. Supply `OPAX_ENRICH_URL` and
   the existing `ENRICH_ADMIN_TOKEN` in the controller environment.
4. Use a permanent `OPAX_BATCH_STATE_DIR`, `OPAX_BATCH_UNITS=1000`, and
   `OPAX_BATCH_CONCURRENCY=2`. For the approved T1 run, configure an Anthropic
   lifetime cap of US$20 and a daily cap such as US$10, then monitor qwen3 fallback
   separately. The lane's test defaults remain US$3. Subsequent tranches need an
   explicitly configured cumulative lifetime allowance; preserve the ledger.
5. Run `node enrich/scripts/batch-path.ts prepare`; save the returned run ID.
   Schedule `node enrich/scripts/batch-path.ts step RUN_ID` until its stages are
   done/released and its pending-batch count is zero. Prepare the next run when
   capacity permits. `status` prints only aggregate counts, run IDs and costs.

Offline gates: 247 worker tests, `npx tsc --noEmit`, Wrangler deploy dry-run,
and 0/143 non-historic differences against `5bb21959`. The differential includes
original queue fields, model requests, KB requests/resource hashes, spend, and
tick counters, excluding added historic/batch metadata/counters and the hold
dependency's 39 leading classification reads before saved-result flushes. Every
original request/write and its order remains compared. Regression fixtures cover
the reserve/save crash (both rows become claimable), concurrent idempotent reserve,
interrupted release, old orphaned local cancellation, paginated ownership reads,
lease-delayed delivery/cancellation, and permanent conflicts. Validators, prompts,
the guarded write path and migration `0004` remain unchanged. Every changed file
is under `enrich/`; portal gates are therefore unnecessary. No push or deploy was
performed and no KB or production D1 writes were made.
