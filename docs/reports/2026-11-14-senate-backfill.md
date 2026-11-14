# Senate Hansard catch-up, 14 November 2026

This implements plan A from the Hansard gaps audit for Senate sittings from
1 January 2014 to 30 June 2019. The main site has no Senate search results for
2014 to 2018 in the supplied live checks. The desktop database is an older
snapshot and cannot certify gaps on the refresh owner's newer database.

## Scope and scheduling

The versioned [source-day manifest](../../data/manifests/senate-backfill-2014-2019.json)
comes from the retained OpenAustralia Senate directory index, cached on
10 October 2026. Its index hash, exact day URLs and chamber are retained.
It lists 63 days in 2014, 60 in 2015, 42 in 2016, 56 in 2017, 58 in 2018 and
five in January to June 2019: 279 confirmed-gap days plus five possible
residual days. All 284 dates have zero Senate rows in this desktop snapshot.
The nightly rechecks the owner's database across all sources, so occupied
2019 dates and any previously repaired dates remain untouched.

The separate `senate_backfill` daily-refresh stage runs after normal refresh
and KB sync. Defaults:

* `OPAX_SENATE_BACKFILL_DAYS=2`, configurable from 1 to 10. The spending
  default is retained under note-1 because ingestion has paid components.
  Measured sync throughput supports 10 days on time alone. See the
  [sync and spend review](2026-11-14-senate-sync.md) before raising it.
* `OPAX_SENATE_BACKFILL_BUDGET_SECONDS=1200`, configurable downwards.
* `OPAX_SENATE_BACKFILL=0` disables acquisition without disabling coverage.

The budget covers discovery, membership setup, source acquisition, parsing,
identity/party checks, insertion and durable local receipts. It also charges
a reservation at **8.9 documents per second** for the next normal KB sync,
including long XML turns later excluded from publication. This replaces the
original unmeasured two-document allowance. The slower retained bulk normal
sync acknowledged 76,905 speeches in 8,606 seconds at 10 workers; the newer
retained non-empty nightly acknowledged 2,066 in 111 seconds. These are
September receipts, not a measurement of November indexing completion.
The [evidence receipt](2026-11-14-senate-sync-evidence.json) preserves counts,
timings, worker-pool evidence and excluded recent runs. A further
120 seconds per non-empty invocation reserves normal sync preparation,
rounded above the complete measured 112.83-second preparation cost. A day
starts only with a minute left for commit/receipts in addition to the
publication allowance. HTTP pacing, retry waits and SQLite work observe the
deadline; day commits survive a clean stop. A 21-minute outer timeout is a
last-resort process guard.

New speech IDs are the existing normal speech-sync outbox. There is no
second KB publisher or D1 patch operation. The following normal refresh
publishes through its checkpoint, mapper, exclusions and worker pool.
The shared backfill ownership tables retain a single US$40 enrichment run
ceiling. Unresolved identities are held; all-zero attempted days retain a
review receipt instead of occupying the first nightly slot indefinitely.
A source refusal stops the stage immediately and leaves a persistent
`refused.json`; later nights remain paused pending source-access review.

Because paid enrichment and unquantified Progress processing/index overage
trigger note-1's conservative-default condition, the cap remains two days.
If merged on 14 November and the first catch-up night is 15 November 2026,
`ceil(284 / 2) = 142` nights gives **5 April 2027** for local insertion and
the following normal sync gives 6 April for publication. If the owner's
database already holds the five early-2019 days, `ceil(279 / 2) = 140`
nights gives 3 April for insertion and 4 April for publication. These are
capacity estimates assuming every night runs and every day fits its budget;
refusals, identity holds, missed nights and slower publication extend them.
The site makes no date promise.

The time-only setting of 10 days would take `ceil(284 / 10) = 29` nights:
13 December 2026 for insertion and 14 December for the following sync.
For 279 days, those dates would be 12 and 13 December. This faster setting
is supported by the timing evidence but is not the default pending the
spend decision. No new spending approval or production action was inferred.

## Identity and citations

OpenAustralia office/person membership must cover the speech date and
chamber, and the existing `roster_identity.verify` and speech reconciliation
guards must accept the printed name and person ID. This checkout has
`scripts/roster_identity.py` and `scripts/person_identity.json`, rather than
the `speaker_identity.py` filename named in the brief. No namesake or
current-roster party is guessed.

The dated party adapter reuses `vote_parties.load_evidence` and its resolver,
including Handbook periods, roster service, accepted corrections, holds,
observed-through limits and the 10 April 2018 NXT/Centre Alliance rename.
Dated OpenAustralia office terms supply the source label where no contrary
dated evidence or reviewed hold applies. Source party and resolution basis
are retained in SQLite and mapped metadata. A missing party does not invent
an identity. Chair roles remain roles.

Discovery requires zero rows on the whole chamber-day across every source.
The loader rechecks under its write transaction, preserves all occupied-day
citations and uses the existing immutable GID and normalised-body
reconciliation. Parsed XML, identity holds, insertion ownership and day
receipts remain durable in the stage/database for review and resumption.

## Visible coverage

The read-only `federal_coverage` step counts Senate rows for every expected
public federal sitting year from 1993 through the current year. It emits a
warning for each empty year. The manifest retains those observations and the
watchdog repeats the alerts even after a successful recent refresh.
Newly owned rows awaiting the normal sync checkpoint, or held in its failed
queue, do not clear the published-coverage notice.

The OpenAustralia row on the site's coverage page currently reads:
**“Senate Hansard for 2014 to 2018 is being added.”** A year drops out when
every source-manifest day in that year has rows acknowledged by normal
sync. Publishing the first sitting does not clear a still-incomplete year.
Other empty or incomplete years remain listed; early-2019 residue is listed
if the owner's source-day check finds it.
The initial checked-in notice uses the supplied live findings, rather than
overwriting public coverage from the older desktop database.

## Rehearsal and validation

The source database was opened with `mode=ro` and backed up to
`/home/jake/opax-work/scratch/im-senate-backfill/rehearsal.sqlite`.
Only that separate copy received inserts. Copying took 952.76 seconds,
including time paused for external machine load. Preparing the modern
loader's schema and indexes on this older snapshot took 114.83 seconds.
Those are separate rehearsal preparation costs, not recurring nightly
backfill work: the normal modern loader already prepares that schema.

Ten dates were rehearsed, the first sitting and the largest cached XML day
in each year. Each invocation used the real two-day cap; five capped
invocations completed the first pass. A second pass over the same ten-date
scope added **zero** rows. No additional date's XML was parsed.

| Sitting day | XML turns | Office identities resolved | Accepted after reconciliation holds | Inserted rows | Local day seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2014-02-11 | 238 | 229 | 227 | 204 | 0.376 |
| 2014-07-17 | 431 | 427 | 418 | 363 | 0.475 |
| 2015-02-09 | 359 | 351 | 343 | 295 | 0.334 |
| 2015-03-25 | 550 | 546 | 533 | 455 | 0.457 |
| 2016-02-02 | 268 | 268 | 259 | 219 | 0.304 |
| 2016-03-17 | 1,005 | 991 | 965 | 807 | 0.823 |
| 2017-02-07 | 257 | 255 | 255 | 223 | 0.299 |
| 2017-06-22 | 532 | 527 | 505 | 420 | 0.549 |
| 2018-02-05 | 258 | 254 | 254 | 218 | 0.399 |
| 2018-11-15 | 404 | 403 | 396 | 331 | 0.418 |
| Total | 4,302 | 4,251 | 4,155 | **3,535** | 4.436 |

The office identity resolution rate is **98.81%** (4,251 / 4,302).
Another 96 turns were held by the existing batch identity conflict guard,
giving **96.58%** accepted after all reconciliation holds. The 51 unresolved
turns and 96 conflict holds were recorded rather than guessed. Accepted
turns still pass the existing length and duplicate exclusions before insert.

The per-day mean and maximum costs in seconds were: cache read 0.0055 /
0.0118; XML parsing excluding identity 0.0513 / 0.1079; dated identity and
party resolution 0.0407 / 0.0905; insertion and the normal-sync outbox
0.3460 / 0.6130; whole local day 0.4436 / 0.8231. Whole capped invocations,
including setup, took 1.25 to 1.70 seconds for two days. The repeat took
0.02 seconds.

One of the same ten dates, 5 February 2018, was freshly fetched from
OpenAustralia to measure transport: **1.184 seconds** including robots.txt,
696,304 XML bytes, agent `opax-improve-audit`, minimum one-second request
spacing. It was retained in the scratch archive for the rehearsal. The
other XML inputs and membership files came from the existing cache. No
refusal occurred. There were no production, KB or D1 writes, SSH, APH or
ParlInfo requests. Heavy commands ran with `nice -n 10`; when external
work pushed load5 above 40, this lane's copy/build/tests were stopped and
resumed only after load fell. The steady rehearsal ran with load5 below 32.

The original rehearsal's CSV retains its old two-document planning
allowances as historical receipt fields. Repricing the same long-turn counts
at the measured 8.9-document rate gives a mean of 29.67 seconds per day and
a peak of 68.99 seconds. Combining the observed peak with a fresh fetch
(1.184 seconds), peak local work (0.823 seconds), 120 seconds for preparation
and 60 seconds for commits gives **322 seconds for two days** or
**890 seconds for ten days**, about 5.4 or 14.8 minutes. Ten days matching
the actual rehearsal mix model about 8.2 minutes. The 1,200-second budget
remains the guard and the maximum remains ten days. The two-day default now
reflects the user's spending condition, not a claimed timing limit. This
does not certify that the whole existing nightly fits six hours or bound
future KB backpressure.

The real normal sync selection, dedupe preparation and payload mapping were
rehearsed locally, producing **2,556 eligible documents**, 10,078,521 serialised
payload bytes, in **112.83 seconds** across the ten-day set. This includes
the existing whole-database Zenodo-date discovery on the older scratch
copy, which lacks the nightly's source/date index; it is a conservative
whole-preparation allowance rather than a claim of added publication time
per day. No KB or D1 client was called. The final budget deducts the two-minute
preparation reserve before setup and deducts publication reserves from both
the HTTP and SQLite deadlines before inserting a day.

The [CSV timing receipt](2026-11-14-senate-backfill-days.csv) retains each
day's costs, counts and XML hash. Full local receipts, parsed XML and the
scratch database remain outside the public repository. No `.ops/` is committed.

Initial validation: the ingest/identity/coverage gate passed **253 tests and 23
subtests**; **12 focused HTTP tests** passed. `cd portal && npx tsc --noEmit`
passed after generating local Wrangler types, and
`node scripts/stamp_assets.mjs --check` passed. `npm test -- --test-concurrency=4`
passed **4,957 tests** with this worktree's `.venv/bin` on `PATH`, after the
local `build:search` prerequisites were generated. `git diff --check` and
shell syntax checks passed.

The note-1 [sync and spend review](2026-11-14-senate-sync.md) reran the
ingest/identity/coverage gate with its two additional regressions:
**255 tests and 23 subtests** passed, along with the 12 HTTP checks,
TypeScript, stamps, shell syntax and diff checks. Portal files are unchanged
by that follow-up.

An additional broad source-policy test run exposed three existing failures
outside this lane: the repository source-access scan reports existing
acquisition ledgers/browser helpers; its raw-client scan reports existing
scripts, including the unchanged watchdog fetch implementation; and an
existing test expects a detection-only Cloudflare script to be treated as a
challenge, contrary to the current shared detector. The detector code is
unchanged here. The focused transport checks cover the federal robots,
redirect and refusal behaviour changed by this lane.
