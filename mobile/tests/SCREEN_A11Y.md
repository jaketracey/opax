# Rendered screen accessibility audit

13 November 2026. App code and Jest only. No simulator, device, native build,
screen reader or audio service was used.

`renderer-cleanup.js` audits committed trees before update and unmount, including
Testing Library renders. `screen-a11y-inventory.cjs` discovers route exports and
their implementations without loading native modules. The full Jest reporter
fails if an implementation or a named screen export has no rendered audit. This includes the workbench
and voice bridge test screen, whose voice boundary is mocked.

The audit checks roles and readable action labels, content/decorative images,
heading traits, checked/selected/disabled/expanded state, visible and spoken money amounts,
grouped targets, loading live regions and fixed target dimensions plus hitSlop.
Native SwiftUI buttons supply their own role; their labels are checked. Native
navigation titles are checked as configuration, not as rendered native traits.

## Original audit findings

Baseline app source: `d41a99caf`, including row 153 (`27e0905ea`). The before and
after runs use the same audit rules and screen fixtures. Counts are unique
`(screen file, rule, element identifier or label, detail)` findings across test
states. They are not counts of source defects: a shared chart produces many
different labels.

| Rule                      | Before |         After fixes |
| ------------------------- | -----: | ------------------: |
| Touchable role            |      1 |                   0 |
| Touchable label           |      1 |                   0 |
| Image label or decoration |      0 |                   0 |
| Heading role              |     14 |                   0 |
| Screen title              |      1 |                   0 |
| State                     |      1 |                   0 |
| Spoken figures            |    299 |                   0 |
| Grouping                  |      3 |                   0 |
| Loading live region       |     41 |                   0 |
| Measurable target size    |      5 | 3 design exceptions |
| Total                     |    366 | 3 design exceptions |

The baseline covers all 91 discovered screen implementation files, including developer
screens, with 1,815 rendered states. The reporter also records routing wrappers.
The full-run guard now requires all 105 screen exports in those files.
Run summaries and per-suite evidence are written to the ignored
`node_modules/.cache/screen-a11y/` directory, cleared at each run.

## Fixes

- Shared Text, Pressable, preview-link hosts, value rows and chart bars reuse
  `spokenFigures`. Drawn text remains intact; compact
  labels such as `$2.4m` become `2.4 million dollars`.
  The map legend's grouped scale labels use `moneyAccessibilityLabel` as well.
- Shared heading Text variants acquire the header trait. Explicit roles still
  override it. The voice test screen's native Text titles also have header roles.
- `LoadingStatus` keeps the original native View and styles while adding Android
  live regions and a cancellable iOS announcement, once per page load when a
  screen reader is active. Shared and local placeholder shapes use it. Hearing
  transcript pagination also announces loading. Unavailable states announce
  their content; action errors retain focus and expose an assertive live region.
- The money-map handle exposes expanded state. Its target size remains a design
  exception, as corrected below.
- The About label specimen and gallery's inner photo targets are hidden from
  accessibility, leaving their containing element as the focus target.
- Victorian election candidate rows retain their party link's visual design and
  expose an Open party accessibility action on the grouped row.
- Community tests now render the real design components. Citation formats and
  the licence router gained render cases. Unit tests cover every audit rule,
  discovery and coverage failures, spoken labels, announcement cancellation and
  both platform announcement paths. Existing screen regressions check the
  grouping fixes and expanded handle state.
  Four iOS control snapshots originally gained the header trait; the review fix
  removes it from those non-headings. Their visual output is unchanged.

## Independent review fix round

14 November 2026, from `312580b53`. The original counts above predate the
stronger spoken-amount comparison and the handle correction. They are retained
as historical audit evidence, not counts for this fix round.

| Review finding                                   | Status and regression evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2, repeated no-result announcements             | Done. Bills and Division history supply a fixed `No results` announcement per mounted empty-result episode on both platforms. Their changing title is outside a live region. `design-p5-C-bills.test.tsx`, `division-history-pagination.test.tsx` and `accessibility-fixes.test.tsx` type four successive queries, expect one announcement and verify a new episode announces again.                                                                                     |
| P2, exact spoken amount under a rounded MoneyRow | Done. The spoken amount uses the same compact flag and ten-million threshold as the visible formatter. `rows.test.tsx` covers `$28.7bn`, negative amounts, threshold boundaries and explicit compact rows. `screen-a11y.test.tsx` rejects a grouped or standalone figure whose spoken amount, unit or sign differs from the visible rounding. The audit reads drawn descendants independently of accessibility labels, including descendants hidden from accessibility.  |
| P3, heading traits on non-headings               | Done. MonthPager labels, quiz grades, election row titles and tile titles explicitly use the text role. Four `android-design-ios` snapshots cover MonthPager and Tile at font scales 1 and 2; quiz and electorate render tests check their native Text roles. The heading audit accepts explicit text overrides.                                                                                                                                                         |
| P3, clipped money-map handle target              | Not done. Removed the ineffective extra hitSlop and recorded precise iOS and Android target-size exceptions. The 20-point strip sits at the top of an overflow-hidden panel. Reserving 44/48 points moves its content; overlapping that content takes taps from the title link or Legend. The existing panel layout needs an interaction design decision. `money-map-screen.test.tsx` retains expanded-state coverage and checks that the ineffective hitSlop is absent. |
| P3, money ranges read as negatives               | Done. A JS-only lookbehind restricts minus signs to the start of a monetary token. `format.test.ts` covers `$1m-$2m`, the Unicode minus range separator and genuinely negative amounts.                                                                                                                                                                                                                                                                                  |

The stronger audit also caught the same rounding mismatch in `PartyMoneyRow`
and party receipt totals at accessibility text sizes. Both now speak the visible
rounding. Existing `money-record.test.tsx` and `party-ui.test.tsx` regressions
check those labels, including exact figures at default size and compact figures
at AX3 and AX5; `people.test.tsx` compares the party total with its drawn figure.

No simulator, emulator, device, native build, screen reader or audio service was
used in this round. Native follow-up: verify one TalkBack announcement while
typing through an empty-result episode, heading navigation skips the four
non-heading types, and an eventual handle redesign gives a reachable 48-dp
target without stealing adjacent taps. Check the equivalent VoiceOver behaviour
and 44-point target on iOS when device QA is available.

## Design calls and limits

- `split-divider` is 17 points wide inside a one-point layout slot. It appears in
  Search, Bills and Directory tests. Increasing hitSlop cannot extend beyond its
  parent. Choosing a 44-point iOS / 48-dp Android interaction region affects taps
  in the neighbouring panes, so its visual and interaction design is unchanged.
  `screen-a11y-exceptions.cjs` retains those three precise findings; new
  screens and different dimensions still fail.
- `money-map-handle` retains its 20-point strip and clipped parent. The exception
  records that fixed height with zero extra hitSlop, separately for iOS and
  Android. It is not counted as fixed.
- Unnamed detail placeholders intentionally reserve the real title's space.
  The title check defers while that subject is loading. Requiring a generic
  title at that point is a design decision, covered by the existing
  `detail-loading-titles.test.tsx` contract.
- A minimum height alone is not a measured height. Flex, wrapped text, native
  control frames, parent-clipped hitSlop and real focus/announcement behaviour
  need native inspection. Jest does not claim to verify them.

The existing `qa-static` source audit remains in place for the entire source
tree, including rules that cannot be settled by the currently rendered states.
