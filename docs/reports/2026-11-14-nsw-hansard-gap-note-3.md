# NSW Hansard approved bounded repair, 14 November 2026

This supersedes the spend hold in [note-2](2026-11-14-nsw-hansard-gap-note-2.md).
Jake approved the spend at 13:10 Sydney time. The complete branch includes both
P1 corrections before the default-on change and is rebased onto `origin/main`
`fb921dec9`. Activation is through merging the complete reviewed branch; no
production process was started from this desktop. No production, KB or D1
writes, SSH, APH or ParlInfo access occurred. Tests use local fixtures and mocked
KB clients. No additional source fetch was needed.

## Items

1. **P1s first and default on:** the speaker-boundary/source-ID corrections and
   periodic warning isolation remain in the branch ancestry. Acquisition,
   queued publication and retries now share `OPAX_NSW_BACKFILL=0` as the single
   off switch, otherwise defaulting on. Both use shared `backfill.STOP`.
2. **Shared growth guard:** reused the Senate lane's in-progress
   `parli/ingest/backfill_guard.py` interface and ledger format, without editing
   Senate files. One `backfill-ledger.json` in `OPAX_BACKFILL_STATE_DIR` (default
   refresh pipeline state directory) records read-only KB counters, positive
   cumulative growth across both sources and per-night totals. Thresholds are
   strictly more than **5.5 decimal GB**, or **59,280 bytes/resource** averaged
   over at least **500 added resources**. A Progress **429**, quota or billing
   refusal stops before retries, including a response from ordinary refresh.
   Unavailable counters or corrupt ledger hold closed. Stops persist a reason,
   enter nightly status/warnings and trigger the existing refresh watchdog
   alert, without populating periodic `FAILURES`.
3. **Pace:** default and maximum **four NSW chamber-days/night**, configurable
   downwards with `OPAX_BACKFILL_NSW_CAP`; budget **1,200 seconds**, configurable
   downwards with `OPAX_BACKFILL_NSW_BUDGET_S`. Outer timeout is budget plus
   **60 seconds**, with **60 seconds** kill grace. Acquisition checks before
   the run and every ten days; four is the hard maximum. Publication checks
   before writes, at ten-day boundaries and at the end. Its worker queue also
   stops launching requests after its budget, and outage recovery releases at
   most four NSW chamber-days per run while leaving later days pending. Measured API acquisition averages
   **141.870 seconds/day** over the four retained in-scope rehearsal days. The
   four-day planning allowance including discovery/scan, preparation and future
   publication is about **1,013 seconds**, below the 1,200-second window.
4. **Enrichment and origin:** every repair resource receives classification
   **`origin/backfill-2026-11`**, its source stage and shared enrichment metadata
   `{run_id: "backfill-2026-11", max_usd: 30}`. Sync neither waits for enrichment
   readiness nor starts tasks. The separate opax-enrich Worker uses its catalog
   cursor and Workers AI budget.
5. **Coverage:** each chamber-year keeps the hole wording below and clears
   automatically only when zero-row days, held turns and publication backlog or
   failures are gone. The public independent watchdog hook remains
   **`portal/public/nsw-hansard-coverage.json`**, schema 1. Its machine status is
   `known, incomplete`, with the enabled flags true and no fill promise. The
   offline hook is `nsw_backfill.known_gaps`, passing `nsw_publication.progress`.
6. **Reporting:** `status.json.backfill` adds tonight's and cumulative
   bytes/resources, the **5,500,000,000-byte** ceiling and remaining headroom,
   per-stage days done/remaining, held/publication counts and conditional
   projected finish dates. Positive whole-KB growth includes normal ingestion
   conservatively; shrinkage does not restore headroom. No token or error body
   is saved.

The current coverage line is unchanged:

> NSW Assembly 2023: speeches missing on 39 sitting days. NSW Assembly 2024: speeches missing on 43 sitting days. NSW Council 2023: speeches missing on 39 sitting days. NSW Council 2024: speeches missing on 40 sitting days.

The live-confirmed 161 missing chamber-days need **41 acquisition nights** at
four/night. If the complete branch merges for the **15 November** night, the
cap-based acquisition target is **25 December 2026**, with publication following
by **26 December**. The older local snapshot has **174** zero-row chamber-days,
or **44 nights**, giving **28 December** acquisition and **29 December**
publication on that assumption. Runtime uses the owner's DB and calendar, not
these snapshot counts. Budget stops and unresolved speaker turns can extend
full coverage beyond the acquisition target.

## Rehearsal retained from note-2

All 564 retained API fragments were scanned for heading forms. Comparison
resolution is **927/1,248 = 74.3%**, up from 61.6%, with the 2022 comparison
material read only. The new insertion bounds exclude all of 2022. Four in-scope
chamber-days contain 491 fragments and 904 parsed turns: **655/904 = 72.5%**
resolved, **651 inserted**, **249 held**, **four duplicate turns suppressed**,
and **528 normally publishable documents**. A second run inserts **zero**.
Unknown speakers remain held, and party stays NULL. The John Graham/Bob Nanva
review fixture and all eight cached heading forms remain regression tests.

An additional [offline publication rehearsal](2026-11-14-nsw-backfill-publication-rehearsal.json)
acknowledged all **528** eligible documents with the stable origin tag, made
**two mocked counters reads**, then acknowledged **zero** documents on repeat.
All **249 held turns** still keep their **four days incomplete**. The 21,120,000
bytes in that receipt are simulated test growth, not observed KB usage.

## Gates

- Final expanded Python ingest/identity/watchdog gate: **313 passed, 68 subtests passed**.
- The three final NSW/shared-guard suites comprise **83 tests**, including all spend triggers, ten-day checks, default-on/off, stop-file refusal, per-resource deadline checks, publication idempotence, held-day reporting on budget exits and actual status/watchdog alert integration.
- Shell syntax checks and the offline NSW wrapper suite passed. The actual nightly Python-environment sandbox passed **four checks**, including successful publication and periodic completion with the new status module.
- `cd portal && npx tsc --noEmit` passed with `.venv/bin` on PATH.
- Local `npm run build:search` passed; its unrelated generated supplier-file change was reverted.
- Full portal `npm test`, concurrency four and project Python on PATH: **5,036 passed, 11 skipped, zero failed** (5,047 total), **391.028 seconds**.
- `node scripts/stamp_assets.mjs --check` and `git diff --check` passed.

The new NSW and shared-guard tests are also wired into the existing Gates workflow.
The portal run uses the documented desktop `OPAX_TEST_HOST=::1` setting; the
temporary concurrency override is restored before committing. All gates and
rehearsals run at `nice -n 10`; new portal test files are deferred if load5
reaches 39.8, allowing active tests to finish.
