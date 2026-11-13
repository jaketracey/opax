# Victorian election after-poll audit, 14 November 2026

This lane changes portal state and copy, using existing hub classes and layout.
No CSS, simulator, native build or production write is involved. The base is
`c951c4004`; work is on `im/vic-after-poll`. No 2026 result page was fetched.

## Before and after, rendered offline

Before the change there was no lifecycle function and no API `state` field.
Only enrolment, nominations and postal deadlines switched. Caretaker wording
incorrectly switched at 8 pm on 3 November instead of its displayed 6 pm start.
The polling constants already contained the correct `+11:00` offset, but no
rendering logic used them to close voting copy.

At every requested clock the headline was **Victorian election 2026**. On
27 November and every later requested date, the lede remained **Victorians vote
on Saturday 28 November. Enrolment closed at 8 pm on Tuesday 3 November.**
The early-voting row always said **Early voting: 18–27 November 2026, 9 am to
6 pm. Closed Sunday 22 November**, followed by **Where and how to vote**.
The election row always said **Election day: Saturday 28 November 2026, 8 am to
6 pm**. There were no dedicated how/where-to-vote blocks. The finder always said
**Which seat am I in? / Find my seat**. API state was absent throughout.
No literal `upcoming`, `will be held` or `early voting is open` was present in
the hub, but the unchanged future-tense lede and actionable early-voting link
became stale. Navigation also kept saying **Votes on 28 November**.

Times below are in AEDT. Results are absent unless explicitly stated.

| Offline clock | Before state/headline/lede | After API and HTML state | After headline and lede |
| --- | --- | --- | --- |
| 1 Nov, 10 am, pre-poll control | No state; original headline; enrol/update lede | `pre_poll` | Victorian election 2026. Victorians vote on Saturday 28 November. Enrol or update your details by 8 pm on Tuesday 3 November. |
| 27 Nov, 10 am | No state; original headline and future-tense lede | `early_voting` | Victorian election 2026. Victorians vote on Saturday 28 November. Enrolment closed at 8 pm on Tuesday 3 November. |
| 28 Nov, 8 am | Same original headline and lede | `election_day` | Victorian election 2026. Election day is today. Voting is open until 6 pm AEDT. |
| 28 Nov, 6:01 pm | Same original headline and lede | `polls_closed` | Victorian election 2026: polls closed. Voting closed at 6 pm AEDT on Saturday 28 November. Check the VEC for count updates. |
| 29 Nov, 10 am | Same original headline and lede | `polls_closed` | Same closed headline and lede. |
| 15 Dec, 10 am, no results | Same original headline and lede | `polls_closed` | Same closed headline and lede. The date does not imply finality. |
| After close, validated partial fixture | No current-results path | `results` | Victorian election 2026: results. Voting closed at 6 pm AEDT on Saturday 28 November. Published lower house district results are available. |
| 15 Dec, validated final fixture | No current-results path | `results_final` | Victorian election 2026: final lower house results. Voting closed at 6 pm AEDT on Saturday 28 November. Final lower house district results are available. |

| Offline state | Key dates after the fix | How/where block after the fix | Finder after the fix |
| --- | --- | --- | --- |
| Pre-poll control | Existing enrolment, caretaker, nomination and postal rows, with separate correct instants. Early voting dates unchanged; election hours include AEDT. | How and where to vote. Early voting runs 18–27 November, 9 am to 6 pm, except Sunday 22 November. Check locations and hours with the VEC. Links to VEC voting options and locations. | Which seat am I in? / Find my seat |
| 27 Nov, 10 am | Enrolment closed; caretaker began; nominations closed; postal applications closed. Early voting dates and voting link remain. Election day is 28 November, 8 am to 6 pm AEDT. | Same dated early-voting information and VEC link. | Same voting finder |
| 28 Nov, 8 am | Early voting closed: 6 pm Friday 27 November 2026. Election day: Saturday 28 November 2026, 8 am to 6 pm AEDT. | How and where to vote. Election day voting is from 8 am to 6 pm AEDT. Check voting locations with the VEC. | Same voting finder |
| 28 Nov, 6:01 pm | Early voting closed, with its historical end date and no voting link. Voting closed: 6 pm AEDT on Saturday 28 November 2026. | After voting. Voting has closed. Check the VEC for postal vote requirements and count updates. Links to VEC election information and state results. | Find a seat and its records / Find seat records |
| 29 Nov | Same closed date rows | Same After voting block | Same records finder |
| 15 Dec, absent/partial/final results | Same closed date rows | Same After voting block; results link uses the bundle's VEC index when supplied | Same records finder |

All six key-date labels, values and links come from the same function as the
API. The state, lede, voting text and finder labels are shared too. District and
region pages receive the same lede and date state. After close, member listings
are explicitly dated published rosters; a returned result does not silently
replace a roster member. Navigation and press copy use evergreen wording.

The UTC boundaries are tested at the second before and at the transition:
early voting starts 17 November at 22:00 UTC, early voting ends 27 November at
07:00 UTC, election-day midnight is 27 November at 13:00 UTC, polling starts
27 November at 21:00 UTC and closes 28 November at 07:00 UTC. Caretaker's
6 pm start is tested separately from the 8 pm enrolment deadline. During the
early-voting period the hub states dates and hours rather than claiming a
location is open at night or on Sunday.

HTML and app responses require revalidation with
`public, max-age=0, must-revalidate`; ETags change at the close even when the
underlying asset is unchanged. This prevents a fresh five-minute API response
from retaining voting instructions past 6 pm on a subsequent request. A page
already left open does not refresh itself.

## Results data path and rehearsal

`build_vic_election.mjs` optionally reads `scripts/hubs/vic-results-2026.json`.
It projects an allowlist into `current_results`, separately from the held
2022/by-election margins. There is no such input committed in this lane.
Absent input produces null and no section. Present input must identify the
2026 election, a VEC year-specific index, a fetched date on/after the election,
known unique districts, completed two-candidate shares totalling 100 and a
margin equal to winning share minus 50. `final` additionally requires all 88
districts. Validation finishes before either deployable asset is written.

After polls close, a nonempty `partial` bundle enables `results`; `final` enables
`results_final`. Only districts actually present render a result. Region pages
show results for their constituent districts, with upper house results linked
to VEC. Party shares and winning margins are records, with no forecasts or
candidate identity matching. API outputs retain explicit allowlists.

The dry run uses the held `vic-results-2022.json` through the actual optional
source-file read, validator, asset builder, HTML renderer and API. It changes
the election date only in a disposable build config to the true 2022 source
date, never relabelling a 2022 result as a 2026 result. All 88 districts and
97 rendered pages pass: 56 Labor, 19 Liberal, 9 Nationals and 4 Greens. Each
region has 11 result rows; each district has one. Narracan retains its
28 January 2023 supplementary election. Bendigo East retains its 10.91-point
margin from the fallback two-candidate count. No rehearsal data is published.

Repeat the offline rehearsal from `portal/`:

```sh
nice -n 10 /Users/jake/Projects/opax-ios/.ops/tools/jest-slot.sh node --test --test-concurrency=4 --test-name-pattern='results dry run' test/vic-election-states.test.mjs
```

The fetcher is parameterised for 2026 now, so loading a completed count needs no
new code. It requires an elected member and completed two-candidate count,
fails if fewer than 88 district results are available, and writes atomically.
It is deliberately not a live tally feed. A reviewed subset can use the same
file contract with `status: "partial"`; absent districts remain absent.

The header and `docs/HUBS.md` record the parser traps: Narracan's supplementary
poll replaces its failed 2022 poll; later by-elections must not enter 2026
results; a preference distribution can finish with more than two candidates;
the true two-candidate count may be inline or on a linked page with different
column ordering; margin is share above 50, not the gap between two shares.
Existing cached HTML is reused, so each new acquisition needs a fresh cache.
The parser/CLI test covers both fallback paths, all 88 cached 2026 district
pages, no old by-elections, a missing cache page and a simulated first refusal.

After the VEC publishes the completed 2026 district counts, run these exact
commands from the repository root, reviewing the resulting source diff before
the normal release process:

```sh
nice -n 10 python3 -I scripts/fetch_vec_results.py --year 2026 --election-day 2026-11-28 --cache "$(mktemp -d /tmp/opax-vec-2026.XXXXXX)" --out scripts/hubs/vic-results-2026.json
nice -n 10 node scripts/build_vic_election.mjs
nice -n 10 node scripts/stamp_assets.mjs
```

The acquisition makes serial requests at intervals of at least 1.05 seconds,
with UA `opax-improve-audit`, no retries, automatic redirects or proxies, and
stops on refusal. Changed page markup fails validation and preserves the
previous source/output. The 2026 URL and live markup have not been verified in
this pre-election lane. Publication still requires the usual checked release;
these commands alone do not deploy.

## Gates

- `cd portal && nice -n 10 npx tsc --noEmit`: passed, after local Wrangler type generation.
- Focused election, parser, catalogue and model-budget checks: **105 passed**. This includes **71 election/hub/parser tests** across the five focused election files.
- `cd portal && OX_PORTAL_TEST_CONCURRENCY=4 nice -n 10 /Users/jake/Projects/opax-ios/.ops/tools/jest-slot.sh npm test`: **4,947 passed, 0 failed, 0 skipped**, 187.5 seconds.
- `nice -n 10 node scripts/stamp_assets.mjs`: passed; `--check`: current. The SPA shell generator ran and its output remains byte-identical.
- `git diff --check`: passed. No CSS changes and no added em dashes.

All portal test invocations used the prescribed Mac slot wrapper, concurrency 4
and `nice -n 10`. The first full run found 55 failures from missing generated
search, report and growth outputs in this fresh worktree. Rebuilding those
outputs offline resolved them without changing unrelated application logic.
The search manifest was refreshed to match its rebuilt shards, retaining
333,036 records and identical kind counts. An unrelated regenerated agency
summary was restored. Local hub/crawl outputs and Wrangler types remain ignored.
`.ops/` is excluded. No production, native or device action was performed.
