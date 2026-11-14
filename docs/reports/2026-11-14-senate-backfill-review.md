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

All required gates passed:

* **259 ingest/identity/coverage tests and 26 subtests**, plus **12 focused
  HTTP tests**, locally and in the [focused CI run](https://github.com/jaketracey/opax/actions/runs/43544038230).
* **399 nightly sandbox checks, zero failures**, in that focused run.
  The daily rc 1/124/137 and periodic rc 1/124 regressions all passed.
* **5,018 portal tests**, zero failures, across four CI shards at
  concurrency 4 with `.venv/bin` on PATH. All four TypeScript checks also
  passed in the [portal run](https://github.com/jaketracey/opax/actions/runs/43541087812).
* The existing data-script suite passed **710 tests and 14,537 subtests**
  in the portal run. Asset stamps, shell syntax and diff checks passed on
  the desktop.

External work held desktop load5 near or above 40. The full desktop npm
and nightly continuations were cancelled while paused; CI completed the
verification on separate runners. The workflows have no production deploy,
KB or D1 credentials. CI tested runtime code at `6df80dcf4`; the final
documentation commit only records these receipts. Portal runtime code and
tests are unchanged from its successful run at `5d9ddc22f`.

The first CI nightly run exposed an interpreter-fixture issue: placing a
symlink inside the sandbox's `.venv` dropped the caller's `pyvenv.cfg` and
dependencies. The launcher now executes the original interpreter at its own
path and checks that the prefix and `requests` import are preserved. The
nightly/Senate gate has its own CI job, with a `senate_only` manual option
for focused reruns. Ordinary Gates runs retain their other jobs. The
corrected fixture passed every nightly assertion, including the Python
environment regression.
