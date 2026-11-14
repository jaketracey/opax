# Senate bounded spend approval, 14 November 2026

Jake approved the bounded backfills at 13:10. This branch includes the
note-2 P1 fix before enabling the stage and is rebased onto `origin/main`
at `fb921dec9`. That base does not yet contain either backfill lane or the
coverage-watchdog lane. Deployment still requires merge; no main, refresh
owner, production DB, KB or D1 writes were made from this worktree.

## Approved settings

Senate defaults on at **10 chamber-days/night**, with
`OPAX_SENATE_BACKFILL=0` holding acquisition and queued publication. The cap
is configurable with `OPAX_SENATE_BACKFILL_DAYS`; larger supervised values
still face the **1,200-second** local/publication-reservation budget, a
**21-minute** acquisition timeout, and counters every ten chamber-days.
Normal sync separately limits its backfill publication to 1,200 seconds.
NSW acquisition and its four-day cap remain owned by the NSW lane; this
branch supplies the common guard and normal-publisher integration contract.
The first acquisition night establishes the baseline and queues rows after
normal sync. Senate's first nonzero KB-growth sample therefore arrives with
the following normal sync. A supervised cap increase should use that sample
over at least 500 added resources, rather than the initial zero-growth night.

The retained measured rate is **8.936 speech acknowledgements/second at
10 workers**, rounded down to 8.9 for reservations. Local per-day work was
0.444 seconds mean, 0.823 maximum; the retained fresh fetch took 1.184
seconds including pacing. Ten peak days reserve about 890 seconds including
120 seconds of sync preparation and a minute for commit/receipts, leaving
about five minutes for counters and variation. These are retained pilot
and September sync receipts, not new paid publication measurements.

The 284 manifest days take `ceil(284 / 10) = 29` nights. With a first night
of 15 November, insertion projects to **13 December 2026**, publication via
the following normal sync to **14 December**. If the newer owner DB already
holds the five possible early-2019 residue days, 279 days take 28 nights,
giving **12 December** and **13 December**. Merge timing, missed nights,
identity holds, a growth stop or slower sync move these dates. Status
recalculates from the current night, cap and remaining days; a disabled or
stopped stage has no projected finish date. Public coverage promises no date.

## Shared guard

`parli.ingest.backfill_guard` stores one locked, atomically replaced
`backfill-ledger.json` under `OPAX_BACKFILL_STATE_DIR`, normally the refresh
pipeline state directory. Both stages use that path and `backfill.STOP`.
The first counters sample establishes the baseline. Subsequent positive
whole-KB deltas accumulate across both repairs, including ordinary growth.
Index shrinkage never refunds the allowance. This is a conservative KB-wide
growth measure, not a claim that every byte came from backfilled speeches.

The guard reads the existing authenticated KB `/counters` before acquisition,
before queued publication, after every ten chamber-days even with a larger
cap, and after the final shorter group. It retains `index_size`, `resources`
and timestamps, the fields exposed by the
[service's counters API](https://docs.rag.progress.cloud/docs/api/).
It writes the shared stop file on:

* More than **5,500,000,000 cumulative bytes**.
* More than **59,280 bytes per added resource**, averaged over at least
  **500 added resources**. That is 1.2 times 49.4 decimal KB, or 59.3 KB rounded.
* Any guarded Progress 429, quota or billing error, before retry handling.
  Ordinary Progress refusals also close the repair gate while retaining
  ordinary refresh's existing error policy.

Counters or ledger failure holds repairs closed too. Guarded requests have
a 20-second socket timeout and no retries. Stop checks precede each queued
resource creation and each acquisition day; up to ten already in-flight
requests may complete. Committed days remain intact. Stop-file removal does
not reset cumulative usage and requires an operator's usage review.

The normal publisher keeps blocked IDs in its existing retry outbox and
releases them on a later unblocked run, including IDs behind its checkpoint.
No second publisher is introduced. The shared runner recognises both
Senate and NSW stage names for stop-file holds. The
[runbook](../operations/nightly-refresh.md#senate-2014-to-2018-repair-approved-bounded-catch-up)
gives the NSW acquisition hooks; its unmerged acquisition code is not copied
into this lane.

## Enrichment, visibility and status

Every managed Senate resource and NSW resource marked `nsw_backfill` carries
**`origin/backfill-2026-11`** as a classification. Both map to the same
Worker `enrichment_budget.run_id=backfill-2026-11`, `max_usd=30`, so the
existing reserve-before-call machinery bounds their combined enrichment
spend, including retries and escalations. The Worker discovers by catalogue
cursor; sync never waits for enrichment readiness. Existing topic-label
merging retains all non-topic classifications, including the origin tag.
The immutable local
insertion ownership registry is retained, including its earlier US$40
configuration; it does not determine the new published Worker budget.

The earlier 72.6k-document estimate was US$22 to US$24 in model work and
about US$14/month of list-price index overage. The user supplied a Workers
AI planning rate of about US$0.29/1k, about US$21 for 72.6k or US$29 for
100k; the shared US$30 admission cap is the actual enrichment guard.
The [spend review](2026-11-14-senate-sync.md) retains the contract/quota
uncertainties; no new price or account-balance assumptions change behaviour.

The coverage line remains **"Senate Hansard for 2014 to 2018 is not yet
held."** Enablement never changes that wording. A year leaves the line only
when its manifest days are occupied and eligible owned rows are published.
The zero-Senate-year warning remains active throughout.

`status.json.backfill` adds nightly and cumulative bytes/resources, the
5.5 GB ceiling and remaining bytes, average bytes/resource, per-stage and
total days remaining, and projected publication finish dates. Growth stops
also appear in `backfill_failures` and `warnings`, reaching the existing
watchdog alert path. They never enter fatal periodic-group failures.
The note-2 error/timeout regressions remain, with an additional real stop-file
nightly sandbox case proving weekly, monthly and FRL complete and stay done.

## Rehearsal and verification

The independent review's retained ten-day rehearsal is unchanged: **3,535
inserts, 2,556 publishable documents, zero on repeat**, 98.81% office identity
resolution and 96.58% accepted after all identity holds; 30/30 sampled turns
matched identity, dated membership and party. Citations remained unique,
occupied days untouched and interruption recovery safe. No new real source
days, source requests, KB writes or D1 writes were used for note-3.
Larger-cap regressions use invented XML fixtures only.

All required gates passed on runtime commit
`573fd400c71540bd689b12f87d8535099d62887d` in the
[final Gates run](https://github.com/jaketracey/opax/actions/runs/43548085149):

* **304 ingest, identity, guard and coverage tests plus 26 subtests**;
  **12 focused source-transport checks**. The final desktop run also passed
  all 316 selected tests and 26 subtests with `nice -n 10`.
* **403 nightly sandbox checks, zero failures**, including shared stop-file
  skips, warning status/usage metrics, and all periodic groups completing
  without being rescheduled. Targeted shell tests also cover Senate and
  both NSW stage names with return codes 1, 124 and 137.
* **5,043 portal tests, zero failures**, over four shards, each at concurrency
  4 with `.venv/bin` on PATH. `npx tsc --noEmit` and asset stamps passed in
  every shard; TypeScript and stamps passed on the desktop too.
* **724 data-script tests and 14,540 subtests**. Shell syntax and diff checks
  passed. No `.ops/` files are committed.

The first nightly CI attempt exposed a missing directory in the new stop-file
fixture; creating the fixture's state directory fixed it. The full rerun
passed every assertion. Shared desktop load approached 40, so the heavier
gates ran on CI without production, KB or D1 credentials. The final report
commit changes documentation only; runtime code is exactly the tested commit.
