# Victorian election app: after polling

This change is local to `ad/vic-app-after-poll`, based on `ce9be90ee`. Portal reference: `origin/im/vic-after-poll`, `ea103ad2787e8c2d861465f2476061384953c1a0`, read with `git show`. No device, simulator, native build or Maestro run was used. Native frames remain to be captured.

The live overview and Albert Park endpoints both returned HTTP 200 on 14 November 2026 and omitted `state`. Before changing production code, a Jest render audit exercised those live payloads, then the same payloads with additive states and synthetic partial/final results. It rendered Hub, Albert Park and the eligible Today card on both iOS and Android. The baseline contained 52 cases across 13 time/data combinations, two platforms and two API shapes. Text was identical across platforms and across the two API shapes because the old decoders discarded the new fields. Today was absent on 15 December, as intended by its existing 6 December retirement.

| State | Before | After |
| --- | --- | --- |
| `pre_poll` | Countdown and dated key dates; no distinct phase copy. No incorrect string observed. | Countdown retained; “Before voting”; early voting begins Wednesday 18 November. |
| `early_voting` | Countdown until Melbourne midnight. After early voting closed, Hub and district still presented the “Early voting” schedule without a closed label. At 07:59 AEDT Saturday, Hub and Today already described polls as open. | Early voting hours; from 18:00 AEDT Friday, heading “Early voting closed” and Saturday's 8 am to 6 pm AEDT hours. Phase remains `early_voting` until midnight AEDT Saturday. No zero-day countdown. |
| `election_day` | “Polls are open from 8 am to 6 pm” from midnight, including before opening. Early voting deadline remained unswitched. | “Election day is today” once, from midnight; before 8 am, “Voting runs from 8 am to 6 pm AEDT.” From 8 am, “Voting is open until 6 pm AEDT.” Early voting is labelled closed. Both API and fallback states match the portal. |
| `polls_closed` | Voting closed; historical-results explanation; upcoming dates hidden. No future-tense Saturday claim was observed after close. | Closed at 6 pm AEDT on Saturday 28 November; count under way; VEC count updates. No results section without current data. District history remains explicitly labelled as predating 2026. |
| `results` | Additive current results discarded. Hub still directed readers elsewhere for 2026 results; district showed history alone. Today gave only closed/date status. | Published lower house results, count of districts published, date, preferences and margins through the existing district rows. Districts without a published result say so and have no empty results section. Today indicates results while its card remains eligible. |
| `results_final` | Same as closed; final data discarded. | Final lower house results only with supporting data. A final overview requires all district results. Historical rows and records remain separate. Today remains retired on 15 December. |

The complete incorrect or stale baseline wording was:

- “Polls are open from 8 am to 6 pm” on Hub (with a full stop) and Today at `2026-11-27T20:59:00Z`, before opening.
- “Early voting” beside “18–27 November 2026, 9 am to 6 pm. Closed Sunday 22 November” on Hub and district after early voting had closed. This occurred at Friday 19:00 AEDT and at every tested Saturday instant before polling close.
- “OPAX shows results from 2022 and by-elections since. For 2026 results, go to the VEC.” on Hub when the API payload included 2026 partial or final results. The district and Today omissions were missing information, rather than false statements.

No post-close “Victorians vote on Saturday” occurrence was observed in the baseline. The tests now explicitly prohibit that claim, voting-open copy, countdowns and upcoming dates after polling close.

The fallback boundaries use explicit offsets: early voting `2026-11-18T09:00:00+11:00`, early voting close `2026-11-27T18:00:00+11:00`, election-day start `2026-11-28T00:00:00+11:00`, polling open `2026-11-28T08:00:00+11:00`, polling close `2026-11-28T18:00:00+11:00`. The review corrected the original brief's 08:00 state boundary: the app now follows the portal's `VIC_ELECTION_DAY_START` at local midnight. The separate 08:00 wording switch remains.

Known API states take precedence, subject to their validity at the current instant and supporting data. An ageing pre-close state expires at the next clock phase, so a cached response cannot keep voting open after 6 pm. Unknown states fall back without losing the page. Results labels without results downgrade to closed; partial data cannot acquire a final label. Current results are checked for district membership, duplicates, dates, VEC source URLs, preference totals and margin consistency. A malformed results batch becomes `undefined`; the overview's other fields remain available, with no results section. Required overview fields still fail validation when malformed. Legacy responses remain supported.

Android has no different election-state logic or copy. Its existing accessibility-size toolbar abbreviation, “Vic election”, remains; iOS and the page heading retain the full name. Large/AX5 checks here exercise the component's normal and accessibility structure, not native text metrics or clipping.

Capture the following frames later on **both iOS and Android**, for **Hub and Albert Park**, at **Large and AX5**: 6 states × 2 screens × 2 sizes × 2 platforms = **48 required frames**. Use an eligible saved Victorian seat when checking Today on a device set to Perth time.

| State | Pinned instant | Fixture data |
| --- | --- | --- |
| `pre_poll` | `2026-11-17T21:59:00Z` | No current results |
| `early_voting` | `2026-11-20T01:00:00Z` | No current results |
| `election_day` | `2026-11-27T13:00:00Z` | No current results; also capture the wording change at `2026-11-27T21:00:00Z` |
| `polls_closed` | `2026-11-28T07:00:00Z` | No current results |
| `results` | `2026-11-29T01:00:00Z` | Synthetic partial results including Albert Park |
| `results_final` | `2026-12-15T01:00:00Z` | Synthetic complete results |

Also capture Friday evening after early voting closes, Saturday 07:59 AEDT, one unpublished district during partial results, and Today immediately before/after polling close. Repeat the key boundary frames on a Perth-time device. Supply the corresponding fixture response and pinned time; the existing `ahead`/`today`/`closed` launch flags alone do not cover all six exact moments. Check wrapping, row alignment, complete AEDT wording, VoiceOver/TalkBack order and external VEC result actions. Synthetic results must stay confined to test/capture fixtures.

Initial validation for commit `193e31569` used Node **24.21.0**. `python3 scripts/apply-privacy-patches.py` ran once before any Jest invocation and passed. Every Jest invocation used `/Users/jake/Projects/opax-ios/.ops/tools/jest-slot.sh`; affected suites preceded the full suite, with four workers throughout. Review follow-up results are recorded below.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; three existing warnings in unchanged `api.test.ts`, `money-filter-navigation.test.tsx` and `record-link-hermes.test.ts` |
| `npm run qa:static` | Passed. Added an alias to the existing `qa-static` script so the requested command is available. |
| `TZ=UTC … npm test -- --testPathPattern=vic-election --maxWorkers=4 --silent` | 15 suites, 249 tests passed |
| `TZ=Australia/Perth … npm test -- --testPathPattern=vic-election --maxWorkers=4 --silent` | 15 suites, 249 tests passed |
| Revert check | Temporarily restored the original tracked implementation files, ran the six existing-component state sentinels, then restored all fixes. All six failed on the expected rendered text, with no missing-import failure. |
| Full suite, `TZ=UTC`, `--maxWorkers=4` | 455 suites passed, one failed, one skipped; 10,346 tests passed, one failed, four skipped; 74 snapshots passed. The failure is the unchanged local-day test described below. |
| Full suite, `TZ=Australia/Melbourne`, `--maxWorkers=4` | Passed: 456 suites, 10,347 tests and 74 snapshots; one suite and four tests skipped. |

The regression matrix covers each requested boundary at minus one minute, exactly, and plus one minute; early voting opening and Friday evening closure; 29 November and 15 December; both API shapes; both platforms; normal and accessibility structures. Real fake timers also verify an already-open page changes at the exact instants, including with an ageing API state. Additional checks cover empty/absent results, an unpublished district, a region's subset, offline overview with a current seat result, API precedence, unknown states, pre-close result hiding, malformed results and inconsistent final labels.

The full UTC run exposed an unrelated existing assumption at `tests/recent-record-races.test.tsx:170`: “records are grouped by the reader’s own day added” expects “Added 11 November 2026” for `2026-11-10T20:00:00.000Z`, but receives “Added 10 November 2026” in UTC. It sets `process.env.TZ` to Sydney inside Jest, which does not change that worker's native local date behaviour. The unchanged six-test suite reproduces the one failure alone in UTC and passes all six when the worker starts with `TZ=Australia/Melbourne`. No record-grouping production code or unrelated test was changed.

Review note 1 aligns the midnight boundary, removes the repeated election-day sentence, closes Friday's heading, preserves the overview when results are malformed, adds “Opens the VEC website.” to external result rows, and uses “Find your district and its candidates” in Search. The neutral Search wording is suitable both before and after polling close.

| Victorian time on 28 November | Portal and app state, with or without API `state` | Hub, district and Today heading | Body |
| --- | --- | --- | --- |
| 00:00 | `election_day` | Election day is today | Voting runs from 8 am to 6 pm AEDT. |
| 00:01 through 07:58 | `election_day` | Election day is today | Voting runs from 8 am to 6 pm AEDT. |
| 07:59 | `election_day` | Election day is today | Voting runs from 8 am to 6 pm AEDT. |
| 08:00 | `election_day` | Election day is today | Voting is open until 6 pm AEDT. |

The tests render 00:00, 00:01 and 07:59 without an API state on iOS and Android, and retain the API-state matrix. Real timer checks cover both midnight and 08:00, including an ageing API state. Each of the six review fixes has a named regression check.

Review follow-up validation, Node **24.21.0**:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed, with the same three warnings in unchanged tests |
| `npm run qa-static` | Passed |
| Election suites, `TZ=UTC`, `--maxWorkers=4` | 15 suites, 270 tests passed |
| Election suites, `TZ=Australia/Perth`, `--maxWorkers=4` | 15 suites, 270 tests passed |
| Revert check | Restoring the five changed implementation files to `193e31569` made all 20 named review regressions fail, covering each of the six review items on iOS and Android. The fixes were then restored and verified byte for byte. |
| Full suite, `TZ=Australia/Melbourne`, `--maxWorkers=4` | Passed: 456 suites, 10,368 tests and 74 snapshots; one suite and four tests skipped. |
