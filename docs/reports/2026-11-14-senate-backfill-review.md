# Senate repair review fixes, 14 November 2026

Rebased onto `origin/main` at `2445af686`. The coverage-watchdog lane is not
on that base, so repair findings use their own warning list, independent of
both fatal publication failures and the sibling lane's `COVERAGE_FAILURES`.

## Periodic completion

The shared step runner records `senate_backfill` and `federal_coverage`
failures in `BACKFILL_FAILURES`. Daily refresh logs the list and exits
successfully if its ordinary work succeeded. Nightly publishes those
findings in `status.json` as `backfill_failures` and `warnings`, and the
refresh watchdog repeats them as warning annotations. They never enter
fatal `FAILURES`, which remains the publication gate for
`periodic_refresh_complete`.

Regressions exercise errors and outer-timeout return codes 1, 124 and 137,
and a failed coverage reader. The nightly sandbox forces weekly, monthly
and FRL publication alongside a repair failure, checks that all three
complete, and checks that a persistent repair warning does not reschedule
the monthly and FRL acquisitions. Ordinary fatal failures retain their
existing retry semantics.

## Spend hold

`OPAX_SENATE_BACKFILL` defaults to `0`, with an explicit `1` required to
enable the shell stage and its CLI. Normal KB sync also refuses resource
creation for the repair's immutable run ID while disabled. Those IDs remain
in its existing retry outbox; ordinary new speeches may advance the normal
checkpoint. After enablement, that same publisher and 10-worker pool release
only the spending holds, including old IDs behind the checkpoint, under
the normal per-run sync limit. There is no second publisher. A second sync
creates nothing further.

The public manifest records `refresh.senate_backfill_enabled` from the
current operator setting even when the retained coverage receipt is old.
Disabled or absent means **"Senate Hansard for 2014 to 2018 is not yet held."**
Enabled means **"Senate Hansard for 2014 to 2018 is being added."** Years
still disappear automatically as every manifest day fills. Excluded short
or procedural turns cannot clear a day while its publishable turns are
held. The source-day/identity/citation rules and two-day/1,200-second
enabled defaults are retained.

[Enablement instructions](../operations/nightly-refresh.md#senate-2014-to-2018-repair-spending-hold)
require Jake's spend approval first. The estimate remains about US$22 to
US$24 in model work plus about US$14/month list-price index overage for
about 72.6k documents; Progress processing and contract overage remain
unpriced. No enablement, production DB, KB or D1 writes occurred here.
No SSH or source requests were made. Gates use invented fixtures and
scratch outputs, with `nice -n 10` and load guards.

## Gates

Desktop checks passed: **259 ingest/identity/coverage tests and 26 subtests**,
**12 focused HTTP tests**, TypeScript, asset stamps, shell syntax and diff
checks. External work held load5 near or above 40, so the full desktop npm
and nightly suites were paused before that ceiling. They are being moved
to the existing read-only GitHub Gates workflow: portal shards explicitly
use concurrency 4 with the locked Python environment on PATH, and the data
job now runs the Senate gate and the nightly shell regressions. This
workflow has no production deploy, KB or D1 credentials. Final CI receipts
will be recorded after completion.
