# NSW Hansard gap repair, 14 November 2026

**Superseded:** see [the review changes and spend hold](2026-11-14-nsw-hansard-gap-note-2.md) for the corrected parser, 2023 lower bound, held/publication tracking and default-off switches. The acquisition measurements below are historical evidence, not the current operating defaults or a completion commitment.

Branch: `im/nsw-hansard-gap`. This implements the bounded nightly repair and its coverage warning. It does not change production data from this desktop. The final handoff names the pushed commit.

## Calendar and confirmed missing days

The source is exclusively the existing `parli.ingest.nsw_hansard` adapter and `https://api.parliament.nsw.gov.au/api/hansard/search`. Its `get_sitting_days` acquired all four year responses for **1 October 2022 to 28 February 2025**, at one request per second, identifying every request as `opax-improve-audit`. TOCs and fragments use the same transport. No PDF, alternate source, APH, ParlInfo or SSH was used. There were no acquisition refusals or failed source responses.

[The calendar CSV](2026-11-14-nsw-hansard-calendar.csv) retains every sitting date, chamber, TOC ID, PDF ID supplied by discovery, and local row count. Counts include any source in that chamber on the date. An occupied day is held rather than appended to.

| Chamber | Calendar 2022 / 2023 / 2024 / 2025 | Local zero-row days 2022 / 2023 / 2024 / 2025 | Missing total |
| --- | --- | --- | --- |
| NSW Assembly | 13 / 39 / 51 / 6 | 6 / 39 / 50 / 0 | 95 |
| NSW Council | 13 / 39 / 46 / 6 | 8 / 39 / 46 / 0 | 93 |
| Both | 26 / 78 / 97 / 12 | 14 / 78 / 96 / 0 | **188** |

The calendar has **213 chamber sitting days**, with **25 occupied** in the local snapshot. The 2022 and 2025 columns cover only the reviewed portions of those years. The first missing local sitting is Council on 19 October 2022. All reviewed February 2025 sittings have rows locally.

The local database is the older 10 November snapshot, opened only with `file:/home/jake/.cache/autoresearch/parli.db?mode=ro`. Its bounded occupancy scan took **58.669 seconds**. It is not an owner-database measurement. The owner's supplied 14 November 11:10 live observation confirms **161 missing chamber days**: all 78 in 2023, plus Assembly's 43 and Council's 40 sittings through October 2024. November 2024 is present live. Other owner-database gaps are deliberately left to runtime discovery.

## Rehearsal

Five confirmed missing chamber days were selected from the acquired calendar, spanning both chambers and the three missing local years. Writes went exclusively to `/tmp/im-nsw-hansard-gap/stage.sqlite`; a separate final replay used `/tmp/im-nsw-hansard-gap/stage-final.sqlite`. Both stages were seeded with member metadata read from the read-only snapshot. The rehearsal reused the acquired calendar, so discovery could not expand its five-day scope.

| Date | Chamber | Fragments | Parsed turns | Source-ID resolved | Inserted | Held | Fresh seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2022-10-19 | Council | 73 | 307 | 200 (65.15%) | 200 | 107 | 81.330 |
| 2023-05-09 | Assembly | 124 | 143 | 102 (71.33%) | 102 | 41 | 155.893 |
| 2023-05-09 | Council | 32 | 83 | 55 (66.27%) | 55 | 28 | 34.403 |
| 2024-02-06 | Assembly | 230 | 388 | 273 (70.36%) | 271 | 115 | 263.721 |
| 2024-02-06 | Council | 105 | 238 | 84 (35.29%) | 84 | 154 | 113.462 |
| Total | | **564** | **1,159** | **714 (61.61%)** | **712** | **445** | **648.846** |

Two duplicate turns in the 2024 Assembly day were suppressed. All held bylines were blank or procedural offices, including Clerk, Speaker and President. No held turn was inserted into `speeches`. Of 122 source personal IDs resolved, 60 reused uniquely matching existing members; 62 received an identity in the `nsw_hansard_<source-id>` namespace, directly from the source's personal ID and full byline. This does not assert a guessed canonical-directory match. Existing members are reused only on a full-name, own-chamber and dated match. Historical party stays null.

The second run inserted **0** in **0.002 seconds**, without further fragment requests. A fresh stage replayed all retained fragments through the final implementation with network calls disabled: **712 inserted, 445 held, two duplicates**, followed by **0 inserted** on its second run. The replay also checked NSW state on new identities and null speech parties.

[The rehearsal CSV](2026-11-14-nsw-hansard-rehearsal.csv) contains per-day figures and a SHA-256 of each retained fragment-ID/hash inventory. Raw XML, personal source IDs, fragment IDs and turn positions remain in the isolated SQLite. Speech IDs link inserted turns to their exact source fragments. No raw speech corpus is committed.

## Nightly window and completion estimate

The stage runs from `scripts/vm/nsw_hansard_backfill.sh`, immediately after normal refresh in `scripts/vm/nightly.sh`, under `nice -n 10`. It performs no KB or D1 writes. New speech IDs enter the following normal refresh's existing publication path. The coverage receipt describes the pre-backfill view, after normal refresh, so a new row does not clear a public warning before that publication opportunity.

Defaults:

- `OPAX_BACKFILL_NSW_CAP=4`: at most four chamber sitting days per night.
- `OPAX_BACKFILL_NSW_BUDGET_S=1200`: total stage budget, including discovery and occupancy scanning.
- `OPAX_BACKFILL_NSW=0` disables the stage; publication-only and daily-skip rehearsals also skip it.

Fresh per-day cost averaged **129.762 seconds**, ranging from **34.403 to 263.721 seconds**, including TOC/fragment acquisition, parsing, identity and SQLite writes. The final cached replay took 0.493 seconds across the same five days. Their 584 inserted texts at least 200 characters long receive a conservative **292-second future publication allowance**, at two documents per second, plus **120 seconds** for normal-sync preparation. These are planning allowances, not a measured production sync: no publication was performed.

Using the five-day averages, four days cost approximately **935 seconds**, including the measured local scan, calendar pacing, future publication and preparation allowances. The runtime checks the remaining budget before requests, between streaming response reads, and before committing each complete day, charges its actual publication allowance, and can complete fewer than four heavier days. Successfully downloaded fragments survive a budget or load stop; partial days never enter `speeches`. Load5 at or above 40 defers the stage. Observed load5 stayed below 40 during this lane.

If merged on 14 November and the first night is **15 November 2026**:

- Live-confirmed scope: `ceil(161 / 4) = 41 nights`, expected **25 December 2026**.
- Older local-snapshot scope: `ceil(188 / 4) = 47 nights`, expected **31 December 2026**.

These are cap-based projections. The owner database decides the actual missing count each night; budget stops, source refusals, or identity holds can extend them. Normal publication follows the insertion night. The nightly JSON records days completed, rows added, missing days left, holds, budget use and the current projection.

Checkpoints are stored in `nsw_backfill_days` and `nsw_backfill_fragments`; `nsw_backfill_turns` retains provenance and holds, `nsw_backfill_identity` retains source-ID resolution, and `nsw_backfill_errors` appends discovery/day errors. A refused source persists in `nsw_backfill_state`, preventing further acquisition on later stage runs until reviewed. HTTP 401/403, challenges and redirects stop immediately; other HTTP failures or transport errors receive at most one retry. Failed or empty year discovery raises and preserves the previous coverage receipt.

The CLI requires an explicit, existing SQLite `OPAX_DB`, rejects `DATABASE_URL`, and has a database-specific process lock. Its reviewed bounds are hard limits. Legacy global progress files are not used by this repair, and a stale completed checkpoint cannot override a now-empty owner-database day.

## Coverage line and watchdog hook

The shipped NSW Parliament coverage row now says:

> NSW Assembly 2023: speeches missing on 39 sitting days. NSW Assembly 2024: speeches missing on 43 sitting days. NSW Council 2023: speeches missing on 39 sitting days. NSW Council 2024: speeches missing on 40 sitting days.

`portal/public/nsw-hansard-coverage.json` is the small, standalone watchdog input, also published at `/nsw-hansard-coverage.json`. Its chamber/year entries contain `expected_days`, `missing_dates` and `status: "known, being filled"`. It has schema 1, a successful-discovery marker, checked timestamp and reviewed bounds. It initially reflects the supplied live observation and the acquired source calendar. The nightly regenerates it from the owner DB and commits it with the corpus data group.

The offline Python hook is **`parli.ingest.nsw_backfill.known_gaps(calendar, counts)`**, where `counts` maps `(chamber_code, ISO date)` to all-source row counts. **`guard_coverage`** rejects a receipt that omits a known chamber-year gap. The nightly logs a coverage guard warning while days remain. The page renderer independently rejects missing, failed or malformed receipts and automatically omits a chamber-year note only when its missing-date entry clears. Coverage tests use fixed gap fixtures and compare the shipped page against the current receipt, so clearing a year does not break the nightly gate. No coverage-watchdog branch import is required.

## Senate coordination

`origin/im/senate-backfill` was absent at the initial remote check. Its source-specific staged work was read without modification. When it was pushed during this lane, commit **7a72eccd7e019eda72677511dd4783f7d0329930** was fetched and checked. It contains an OpenAustralia-specific runner, rather than a reusable source-neutral runner. NSW therefore stays self-contained and uses the requested `OPAX_BACKFILL_<SOURCE>_CAP` / `_BUDGET_S` pattern, durable refusal stops, and the same conservative publication/preparation allowance convention. No Senate-specific files were edited.

Both branches append a source-specific note on the same line of `scripts/build_coverage.mjs`. On integration, retain both note selectors and regenerate the shared `index.html`/`spa-shell.js` stamps. NSW schedules in `scripts/vm/nightly.sh`; Senate schedules in `scripts/daily_refresh.sh`.

## Validation

- Python ingest/identity: **239 passed, 51 subtests passed** across NSW, ingest guards, speaker names, sitting calendars, OPAX_DB isolation, speech hygiene/repair and roster identity/period/state/fold suites. The NSW suite has **20 passing tests** covering both bounds, cap, budget and load stops, mid-day resume, future publication charging, idempotence, stale checkpoints, identity holds, discovery failure, refusal and repeat-run pause, request identity/pacing/retry limits, coverage and its guard.
- `bash -n` passed for all five changed/new shell files. The dedicated offline nightly integration test passed, checking ordering, environment forwarding, skip paths, guard warnings and refusal/error handling.
- `cd portal && npx tsc --noEmit` passed after local Worker type generation.
- Portal `npm test` at concurrency four: **4,949 passed, 11 skipped, zero failed** (4,960 total, 324.729 seconds), with `.venv/bin` on PATH. The temporary test-command override placed `--test-concurrency=4` before test paths and was restored afterwards.
- A final focused coverage/About rerun passed **7 tests**, including every intermediate state as the four gap entries clear.
- `node scripts/stamp_assets.mjs --check` and `git diff --check` passed.

Supplementary source-HTTP testing found existing failures outside this change: the repository identity scan flags older acquisition receipts/browser QA scripts; the direct-fetch scan flags ten unchanged call sites; and one shared-transport test expects an injected challenge-platform script alone to count as a challenge, while unchanged main deliberately ignores that script without challenge UI. The baseline shared transport reproduces that result. These are not repaired by this NSW-only lane. The remaining transport and source-guard fixtures pass: **84 passed, three deselected**. No NSW path was added to a guard exemption.

No `.ops/`, raw XML, stage database, generated test fixtures, Worker types, dependencies or credentials are included in the commit.
