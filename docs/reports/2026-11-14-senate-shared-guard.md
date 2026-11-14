# Shared backfill guard alignment, 14 November 2026

This update rebases Senate onto `origin/main` at `ca800951e` and uses
NSW's `d92c41831` guard and shared tests as the canonical starting point.
Both files were adopted byte-for-byte before applying the common additions
below. Senate-specific stage regressions now live in
`tests/test_senate_backfill.py`; the shared tests import no Senate stage.

The final shared files are handed off in
`/home/jake/opax-work/scratch/backfill_guard/`: `backfill_guard.py` and
`test_backfill_guard.py`, with `SHA256SUMS`. That directory also contains
the shared `arag.py` response observer and `write_status.sh` receipt-writer
function, plus exact integration instructions for NSW. NSW should adopt
those identical files and the writer function before merge. No other
branch was changed or pushed from this lane.

## Changes from NSW's canonical guard

The ledger remains **version 1**, with the same baseline, last sample,
positive cumulative deltas, nightly totals, stage progress and observations.
The state directory, `backfill-ledger.json`, lock and `backfill.STOP` paths
are unchanged. Both lanes use **`origin/backfill-2026-11`** and the shared
US$30 Worker enrichment budget. There is no ledger migration.

The diff is deliberately nonempty to retain the later shared safeguards:

* A stop remains latched in memory if its file cannot be written, and is
  returned as a repair hold rather than a fatal ordinary-refresh error.
* Quota/resource/usage/storage limits, HTTP 507 and HTTP 200 error envelopes
  trigger the same shared stop. The existing response observer supplies
  successful response bodies to this check too.
* Optional `acquisition_days_remaining` uses NSW's existing
  `progress(**details)` API. Queued publication remains visible while its
  acquisition count is zero. Senate's coverage step supplies these counts;
  the shared guard contains no Senate-specific coverage-file reader.
* Projections use NSW's actual `OPAX_BACKFILL_NSW_CAP` setting and disappear
  for unresolved stage holds, errors or refusals.
* `nightly_fields()` supplies one receipt schema for `backfill`,
  `backfill_failures` and growth warnings. The nightly writer retains NSW's
  positional interface. The existing watchdog growth-stop alert is shared.

Corresponding common tests accompany those additions. Senate's existing
publisher now uses NSW's stage-specific publication-budget environment
selection. NSW's four-day ceiling is unchanged. The P1 fix remains:
repair errors, timeouts and growth stops stay outside fatal daily/nightly
failures, so weekly, monthly and FRL completion can be recorded.

An offline compatibility tree built from NSW's canonical code passed
**45 shared tests** with its unchanged publisher and only the final shared
guard, tests, client and receipt-writer function overlaid. This exercises
the actual NSW budget API, stop handling, ten-day publication checks,
receipt fields and watchdog alert path without NSW acquisition or network.

## Senate pace

The retained ten-day rehearsal measured **0.4436 seconds/day local work**
(0.8231 peak). A fresh source probe measured **1.1836 seconds**, including
the one-request/second pacing. The retained September bulk receipt measured
**8.936 speech acknowledgements/second at ten workers**; reservations round
down to 8.9. These are acknowledgements, including existing-slug responses,
not indexing or enrichment completion measurements. See the
[timing evidence](2026-11-14-senate-sync-evidence.json).

The sample averaged 255.6 publishable documents/day. The budget conservatively
reserves 264.1 long XML turns/day before final exclusions. That gives
`264.1 / 8.9 + 1.1836 + 0.4436 = 31.30 seconds/day`, plus 120 seconds
of sync preparation and a 60-second commit margin per run:

| Cap | Modelled run | Nights for 284 days | Last insertion | Following normal sync |
| --- | ---: | ---: | --- | --- |
| Default 10/day | 493 seconds, 8.2 minutes | 29 | 13 December 2026 | 14 December 2026 |
| Supervised 40/day, nominal | 1,432 seconds, 23.9 minutes | 8 | 22 November 2026 | 23 November 2026 |
| Supervised 40/day, budget-limited sample mix | About 32 days within 1,200 seconds | 9 | 23 November 2026 | 24 November 2026 |

Dates assume merge on 14 November and the first acquisition night on
15 November. **Forty is a configured cap, not an exemption from the
1,200-second guard.** The retained slower bulk rate does not support forty
average sample days inside that budget. The stage stops before admitting
another day's publication reserve; the 21-minute outer timeout and counters
every ten chamber-days remain in force. Peak sample days can limit a run
further. Preparation and timing variation, identity holds, source refusals,
growth stops and missed nights can extend all dates. Normal sync's own
backfill budget remains 1,200 seconds; enrichment proceeds independently.

If the newer owner DB already holds the five possible early-2019 residue
days, 279 days take 28 nights at ten, publishing on **13 December**.
Nominal forty takes seven nights, publishing on **22 November**; the
sample-mix budget estimate still takes nine, publishing on **24 November**.
The owner rechecks occupied days before inserting. Desktop data cannot
certify the newer owner's remaining count.

The public line remains **"Senate Hansard for 2014 to 2018 is not yet
held."** Each year clears automatically when its manifest days and
eligible publication queue are filled. It makes no completion promise.

## Validation

The original real-source rehearsal is retained: **3,535 inserts, 2,556
publishable documents, zero on repeat**, 98.81% office identity resolution
and 96.58% accepted after holds. Independent review matched 30/30 sampled
turns to identity, dated membership and party. No new real source days or
Hansard or KB requests were used for this update. Production DB, KB and D1
were not written, and no SSH was used.

Final Python, full portal, nightly sandbox and stamp results are recorded
below after the branch gates complete.
