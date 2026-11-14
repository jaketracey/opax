# Nightly chamber coverage watchdog, 14 November 2026

Implemented on `im/coverage-watchdog`, based on `9fc487882`. No production,
knowledge-box or D1 changes were made. No SSH, APH or ParlInfo requests were
made. Only read-only site GETs were used for the sanity check; branch publication
uses the requested Git push. No `.ops/` files form part of this change.

## Behaviour and alert delivery

`scripts/coverage_watchdog.py` performs one aggregate, read-only SQLite census
of plenary speeches. It reports held speech-days, rows and longest zero runs per
chamber and year. The committed 2026 federal calendar and optional already-cached
historical/NSW inventories supply expected dates. It does not infer sitting days
from weekdays or acquire calendars. Unknown expected counts are null. Committee
rows cannot fill plenary gaps.

It pages for a new empty chamber-year with expected dates, losses to zero,
strictly greater than 50% losses of rows or speech-days in a chamber or year,
and new or longer runs of five zero expected dates. Unchanged runs remain in
reports. The fraction is configurable with
`--drop-fraction`. Positive days strictly below 10% of the whole chamber's median
are reported only. Expected-date adjacency crosses weekends and recesses, as in
the audit at `origin/im/hansard-gaps`, commit `7a93ad1d0`.

The first night only records a baseline. The next run compares the previous
successful night's `coverage-snapshot-v1.json`; skipped intervening snapshots
are reported. A same-day retry retains the prior-night baseline. Unresolved
regressions retain recovery floors, preventing the next stable empty night from
clearing the alert. A clock moving behind the baseline produces a check failure
without replacing that baseline. All normal runs end at the previous completed
Australia/Sydney date, including AEDT/UTC and year boundaries.

The existing alert path is:

`daily_refresh.sh` after normal refresh -> local coverage receipt ->
`nightly.sh` separate `COVERAGE_FAILURES` / existing `WARNINGS` ->
`coverage_alerts` / `warnings` in `nightly-status/status.json` ->
`scripts/refresh_watchdog.py` -> `.github/workflows/refresh-watchdog.yml` failed
scheduled run -> existing GitHub email. Warnings also reach its annotations and
job summary. No new alert channel or workflow was introduced.

Coverage exit status is deliberately separate from daily refresh failed steps.
The nightly records an alert and continues its normal exports and publication.
Its status stays the refresh's own outcome: coverage alerts are published in
`coverage_alerts`, which the refresh watchdog pages on. Census errors, missing
index, timeout, stale or malformed receipts, and a missing receipt once a
baseline exists also take this path. The status reader's exit code is checked
so a crash alerts too. The first night, with no receipt and no baseline, is a
warning only. Coverage failures
do not gate completion of successful weekly, monthly or FRL publication.
A standalone daily run logs and stores findings; the nightly remains the status
publisher. The integration test executes the actual daily check and nightly
receipt-consumer shell blocks against a synthetic database, proving that a loss
to zero allows `REFRESH_COMPLETED` and still produces an alert.

Runtime files live under `~/.cache/autoresearch/pipeline/`, outside git:

- `coverage-snapshot-v1.json`: current and previous annual/chamber totals,
  resolved known-hole IDs, open regression recovery floors, observed zero runs
  and consumed accepted-regression IDs.
- `coverage-report-v1.json`: findings, annual view, thin dates and query timing.
- `coverage_watchdog.log`: command output.

## Reviewed allowlist

Every entry has bounded dates, a reason and repository evidence in
[`coverage_allowlist.json`](../../scripts/coverage_allowlist.json). These are
the eight entries after review:

| Entry | Chambers | Inclusive dates | Reason and treatment |
| --- | --- | --- | --- |
| `federal-2025-election` | House, Senate | 2025-03-28 to 2025-07-21 | Prorogation and election recess before the 48th Parliament first sat on 22 July. Repository lapse fixture and `PARL_STARTS` establish the bounds. Remove these dates from expectations. |
| `nsw-2019-election-recess` | NSW Assembly, Council | 2018-11-23 to 2019-05-06 | November-to-May election recess identified in the audit, not a missing-sitting claim. Remove these dates from expectations. |
| `wa-not-held` | WA Assembly, Council | 1901-01-01 to 2027-01-31 | No held WA plenary series in the audit/main manifest. Corpus boundary, not a claim that Parliament did not sit. Report now; page for review after expiry. |
| `tas-not-held` | Tasmanian Assembly, Council | 1901-01-01 to 2027-01-31 | No held Tasmanian plenary series. Same bounded review treatment. |
| `nt-not-held` | NT Assembly | 1974-01-01 to 2027-01-31 | No held NT plenary series. Same bounded review treatment. |
| `senate-2014-apr2019` | Senate | 2014-01-01 to 2019-04-03 | Known, being filled. Acquisition hole; lane `im/senate-backfill`. Review by 2026-12-14; unresolved findings page afterwards. |
| `nsw-assembly-2023-nov2024` | NSW Assembly | 2023-01-01 to 2024-11-21 | Known, being filled. Acquisition hole; lane `im/nsw-hansard-gap`. Review by 2026-12-14. |
| `nsw-council-2023-2025` | NSW Council | 2023-01-01 to 2025-02-10 | Known, being filled. Acquisition hole; lane `im/nsw-hansard-gap`. Review by 2026-12-14. |

Repair tags name the filling lanes. Known-hole warnings retire automatically
when every affected chamber-year has cached expected evidence and every such
date has held rows. Without evidence for a year, completion stays unverified and
the warning remains. Resolved IDs persist, so a later hole is no longer exempt.
These exceptions never hide loss of already-held rows or speech-days. Not-held
exceptions stop applying as soon as the chamber has a held series. Existing
source-access holds remain in the normal refresh status separately.

The nightly now reads the filling lanes' optional `coverage-sitting-days/senate.json`
(2014-2019) and `nsw.json` (both chambers, 2023-2025) from its state directory.
The [manifest and acknowledgement contract](../operations/coverage-watchdog.md)
defines the complete year/date inventories, provenance and validation. It also
defines `accepted_regression` entries with one chamber/year, explicit resulting
counts, reason, owner lane and expiry. A matching entry acknowledges that loss
once; later losses cannot reuse the ID, even before expiry. No unmeasured live
acknowledgement was added.

## Runtime and query plan

The watchdog requires the covering index
`idx_speeches_coverage(chamber,date,hearing_type)`. The normal existing
`OPAX_ENSURE_INDEXES=1` setup provisions it once. The watchdog itself never
creates an index or falls back to a body-table scan. One-off index provisioning
is separate from census timing: existing refresh documentation estimates about
four minutes for a full 29 GB scan plus sort on gp3; this was not measured here.

**Recommend building the covering index by hand on the box before merging.**
The independent review confirmed about four minutes once and idempotent
provisioning. The hub should arrange that work. No remote command or index build
was performed from this Mac.

[`benchmark.json`](2026-11-14-coverage-watchdog/benchmark.json) records three
complete runs on **1,500,000 synthetic rows**, exceeding the audit snapshot's
1,316,517 rows. Each body has 1,024 bytes of padding, yielding a 2,095,394,816-byte
SQLite database and a **42,229,760-byte covering index**. There are 15,000 occupied
chamber-days spanning 1901 onward. The small two-snapshot manifest is 284,629 bytes.

SQLite's plan is exactly:

```text
SEARCH speeches USING COVERING INDEX idx_speeches_coverage (chamber=? AND date<?)
```

Full measured wall times: **0.2359, 0.2047, 0.2086 seconds** on this Mac.
Aggregate query times: **0.1371, 0.1062, 0.1129 seconds**. These are local timings,
not a cold EBS measurement. A full index read at a conservative 125 MiB/s is
`42,229,760 / (125 * 1,048,576) = 0.322 seconds`, plus aggregate and analysis CPU.
The plan reads neither the body table nor speech text, so the real corpus's
28.9 GB body-table size does not turn this into a 28.9 GB scan. A conservative
nightly estimate is **under 10 seconds** at this cardinality, well under a minute.
SQLite aborts after its 40-second progress budget; the shell caps the entire
check at 50 seconds plus a two-second kill grace and reports any failure.

Reproduce offline:

```sh
python3 scripts/audit/benchmark_coverage_watchdog.py --out /tmp/coverage-benchmark.json
python3 -m unittest discover -s tests -p test_coverage_watchdog.py
python3 -m unittest scripts.test_refresh_watchdog
python3 -m unittest scripts.vm.test_periodic_state
python3 -m unittest discover -s tests -p test_sitting_days.py
bash -n scripts/daily_refresh.sh
bash -n scripts/vm/nightly.sh
git diff --check
```

## Live sanity check before review

The Mac has no `parli.db`. The module's view below is recomputed from the audit's
committed `speech-days.csv` and `expected-days.csv` at `7a93ad1d0`, through
13 November, not presented as a fresh production database census. These are
stored plenary rows before public sync filters and deduplication. Live results
can differ because the audit snapshot predates newer acquisition and publication.

All requests were GETs to `opax.com.au`, serially spaced by at least 1.05 seconds,
with UA `opax-improve-audit`, no redirects and no retries. Every response was
HTTP 200. The API requires a query, so the requested chamber/year paths also
include `q=government&mode=keyword&top_k=5`. `total` is a bounded retrieval count,
not a corpus total. A zero corroborates this probe, not the absence of all
possible searchable terms. The positive control years demonstrate working
chamber filters. Exact URLs, dates and annual module fields are in
[`sanity-check.json`](2026-11-14-coverage-watchdog/sanity-check.json).

| Chamber | Year | Module held days | Module stored rows | Live search results, max 5 | Module classification |
| --- | ---: | ---: | ---: | ---: | --- |
| representatives | 2014 | 76 | 22,201 | 5 | Control |
| representatives | 2018 | 65 | 16,685 | 5 | Control |
| representatives | 2024 | 1 | 82 | 5 | Control |
| representatives | 2026 | 56 | 5,028 | 5 | Control |
| senate | 2013 | 37 | 2,323 | 5 | Control |
| senate | 2014 | 0 | 0 | 0 | Known, being filled |
| senate | 2015 | 0 | 0 | 0 | Known, being filled |
| senate | 2016 | 0 | 0 | 0 | Known, being filled |
| senate | 2017 | 0 | 0 | 0 | Known, being filled |
| senate | 2018 | 0 | 0 | 0 | Known, being filled |
| senate | 2026 | 45 | 2,961 | 1 | Control |
| nsw_la | 2022 | 36 | 7,885 | 5 | Control |
| nsw_la | 2023 | 0 | 0 | 0 | Known, being filled |
| nsw_la | 2024 | 1 | 174 | 5 | Known, being filled; November tail only |
| nsw_la | 2026 | 36 | 10,019 | 5 | Control |
| nsw_lc | 2022 | 33 | 4,549 | 5 | Control |
| nsw_lc | 2023 | 0 | 0 | 0 | Known, being filled |
| nsw_lc | 2024 | 0 | 0 | 0 | Known, being filled |
| nsw_lc | 2026 | 33 | 5,408 | 5 | Control |

All five Senate years are classified as known holes. Both NSW 2023 years and
both 2024 views retain the known-hole flag. NSW Assembly's 2024 row is a
**22 November tail**, outside the January-October repair interval; the five live
hits are also all 22 November. An additional [January-October 2024 Assembly
probe](https://opax.com.au/api/search?chamber=nsw_la&from=2024&to=2024&since=2024-01-01&until=2024-10-31&q=government&mode=keyword&top_k=5)
returned **0**, while the whole-year probe returned 5. The larger House 2024
live result reflects the audit's documented snapshot/live mismatch and is not
treated as a watchdog failure or an exact number of new rows.

The JSON sanity receipt and benchmark retain the original pre-review observations;
this revision made no new site requests. Current repair owners and expanded
allowlist intervals are specified above.

## Gates

- 35 offline coverage tests passed, including actual shell-block execution,
  zero regressions, recesses, known-hole reporting/resolution/reopening, initial
  baseline, same-day retries, thin days, corrupt/future state and AEDT/UTC dates.
- 11 existing refresh-watchdog tests passed.
- 17 existing sitting-calendar tests passed.
- 16 existing periodic-state tests passed.
- Eight isolated regressions were introduced into temporary fixture copies;
  all eight were caught: periodic retry contamination, same-day self-comparison,
  unchanged zero-run paging, ignored status crash, ignored repair manifests,
  reused acceptance, ignored acceptance expiry and ignored known-hole review.
- `bash -n` passed separately for both changed shell scripts.
- `git diff --check` passed.
- Portal files were not touched, so portal TypeScript/npm gates do not apply.

This change is prepared for branch review. No nightly execution, deployment,
production indexing or email delivery was triggered from this Mac.

## Review changes

- P1: separate `COVERAGE_FAILURES` reaches final failed status and email while
  successful weekly, monthly and FRL completion clears its durable debt.
- P2.1: exact-count, one-use accepted-regression entries acknowledge deliberate
  removals and cannot hide a later drop or apply after expiry.
- P2.2: optional filling-lane sitting-day manifests are read by the nightly;
  unresolved known holes alert after their 14 December review deadline.
- P2.3: owner lanes are `im/senate-backfill` and `im/nsw-hansard-gap`.
- P3 bounds: Senate ends 2019-04-03, NSW Assembly 2024-11-21, NSW Council 2025-02-10.
- P3 zero runs: only new or longer runs page; unchanged runs remain reported.
- P3 status reader: a non-zero exit produces a coverage alert.
- P3 retry: a healthy first run changes rows from 300 to 200 without creating a
  recovery floor; a same-day retry at 120 must compare with 300 and alert. The
  mutant comparing with 200 incorrectly clears that alert and is caught.
- Delta review: new and longer zero-run alerts compare with the previous night
  and survive same-day reruns. The added fixture reproduced both downgrades
  before the fix and fails if the comparison is reverted to the latest snapshot.
- Delta review dates: each known hole retains 2026-12-14 while held for a spend
  decision. Both stages merge switched off. The owning lane records each hole's
  ETA and sets its review date to ETA plus 14 days when Jake enables the stage;
  scheduled fills stay report-only through that date.
