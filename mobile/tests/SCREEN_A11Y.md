# Rendered screen accessibility audit

13 November 2026. App code and Jest only. No simulator, device, native build,
screen reader or audio service was used.

`renderer-cleanup.js` audits committed trees before update and unmount, including
Testing Library renders. `screen-a11y-inventory.cjs` discovers route exports and
their implementations without loading native modules. The full Jest reporter
fails if an implementation or a named screen export has no rendered audit. This includes the workbench
and voice bridge test screen, whose voice boundary is mocked.

The audit checks roles and readable action labels, content/decorative images,
heading traits, checked/selected/disabled/expanded state, compact money labels,
grouped targets, loading live regions and fixed target dimensions plus hitSlop.
Native SwiftUI buttons supply their own role; their labels are checked. Native
navigation titles are checked as configuration, not as rendered native traits.

## Findings

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
  `spokenFigures`. Drawn text and exact supplied amounts remain intact; compact
  labels such as `$2.4m` become `2.4 million dollars`.
  The map legend's grouped scale labels use `moneyAccessibilityLabel` as well.
- Shared heading Text variants acquire the header trait. Explicit roles still
  override it. The voice test screen's native Text titles also have header roles.
- `LoadingStatus` keeps the original native View and styles while adding Android
  live regions and a cancellable iOS announcement, once per page load when a
  screen reader is active. Shared and local placeholder shapes use it. Hearing
  transcript pagination also announces loading. Unavailable states announce
  their content; action errors retain focus and expose an assertive live region.
- The money-map handle exposes expanded state and gains invisible hitSlop for a
  44-point iOS or 48-dp Android target.
- The About label specimen and gallery's inner photo targets are hidden from
  accessibility, leaving their containing element as the focus target.
- Victorian election candidate rows retain their party link's visual design and
  expose an Open party accessibility action on the grouped row.
- Community tests now render the real design components. Citation formats and
  the licence router gained render cases. Unit tests cover every audit rule,
  discovery and coverage failures, spoken labels, announcement cancellation and
  both platform announcement paths. Existing screen regressions check the
  grouping fixes and expanded handle state.
  Four iOS control snapshots gained only the header trait; their visual output is unchanged.

## Design calls and limits

- `split-divider` is 17 points wide inside a one-point layout slot. It appears in
  Search, Bills and Directory tests. Increasing hitSlop cannot extend beyond its
  parent. Choosing a 44-point iOS / 48-dp Android interaction region affects taps
  in the neighbouring panes, so its visual and interaction design is unchanged.
  `screen-a11y-exceptions.cjs` retains only those three precise findings; new
  screens and different dimensions still fail.
- Unnamed detail placeholders intentionally reserve the real title's space.
  The title check defers while that subject is loading. Requiring a generic
  title at that point is a design decision, covered by the existing
  `detail-loading-titles.test.tsx` contract.
- A minimum height alone is not a measured height. Flex, wrapped text, native
  control frames, parent-clipped hitSlop and real focus/announcement behaviour
  need native inspection. Jest does not claim to verify them.

The existing `qa-static` source audit remains in place for the entire source
tree, including rules that cannot be settled by the currently rendered states.
