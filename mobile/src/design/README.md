# OPAX mobile design

Import shared components from `design/primitives`. Feature-specific modules use direct imports. The barrel uses explicit named exports so shared re-exports cannot hide a name clash.

## Type and rhythm

The eighteen roles are `largeTitle`, `inlineTitle`, `pageTitle`, `recordTitle`, `recordHeading`, `sectionTitle`, `subsectionTitle`, `groupHeader`, `name`, `rowRecord`, `recordText`, `body`, `strong`, `secondary`, `footnote`, `capsule`, `figure` and `tileFigure`. OPAX's words use the platform interface face. Record titles and verbatim passages use Merriweather; figures use tabular interface digits. `Heading` supplies the header trait and title anchoring. `wordSafe` retains whole words at large text sizes.

Text fitting updates font size, line height and the iOS rounding floor in place. Keep native text and chart accessibility elements mounted across content, width and Dynamic Type changes so VoiceOver and TalkBack retain focus. Fabric dispatches queued layout events to current props, so callback identities cannot prove a measurement is fresh. Fitting validates the expected role ramp (including title and caller ceilings) and pairs lines with a current frame. A committed native measurement covers changes that suppress `onLayout`. Chart probes may still re-key for new font metrics because their entire container is hidden from accessibility on both platforms.

Use `rhythm`: line 4, tight and heading 8, row 11, block 16, group 24, section 36 and screen 20. Screen margins are 16 below 414 points and 20 above. Regular-width columns use `rhythmRegular`. There is no spacing scale or legacy text-role surface.

`npm run tokens` builds the mobile target through `scripts/build-design-tokens.mjs`. Shared values come from `../docs/design/design-tokens.json`. Mobile omits the shared source's transitional web aliases and supplies photograph ground and scrim roles. The generation check compares the complete generated output.

## Surfaces and rows

`Screen` supplies a readable or wide column, automatic native insets, pull to refresh, a page state scope and an optional title revealed by scrolling. `Screen grouped` uses sunken ground with raised cards and inset groups. Its navigation background follows the same ground. `KeyboardStableScreen` retains keyboard clearance and the same refresh boundary.

`Section` uses a heading and an 8 point content gap. `InsetGroup` owns separators. `LinkRow`, `ValueRow`, `PersonRow`, `BillRow`, `RecordRow`, `DivisionRow` and `MoneyRow` provide the shared row anatomy and at least 44 point targets. `RowLink` owns navigation previews, context menus and accessibility actions. `Card` supports a menu with or without a navigation destination. Tiles retain their trailing chevron.

Use `FigureBlock` for a subject figure and `StatTile` or `StatStrip` for related values. Figure and chart provenance is passed as `citation`; `source` is reserved for images. A containing sourced section may omit a figure's own citation. Charts use `VoteSplit`, `StageTimeline` and `BarSeries`, with a table alternative for drawn bars.

## Sources and sheets

Every block has one dated `SourceLine`. It opens the `/source` route through `navigation/sheets`, with originals, plain notes, the selection rule and a Sources and licences link. Licence text belongs in the Licence sheet. Use `MachinePill` and `/machine-note` for machine-written text. Methodology opens `/rule`; there are no in-place source or info modals.

Form sheets use a native paper bar over sunken content, plain Done and the shared detents. On iOS 26 and later, the five tab roots and explicit large-title lists use transparent native appearances with the system's soft scroll edge. No background or divider follows a JS scroll threshold. Reduce Transparency or Increase Contrast selects a constant solid backing below a large-title bar, preserving its title. The settings are read asynchronously using the shared accessibility store. Record and inline screens retain a non-translucent bar and hard edge for legibility over serif record text, as decided after the wave 2 captures. Earlier iOS versions and Android keep their bar behaviour.

## State and controls

`Skeleton` mirrors final content. `InlineError` is a quiet sentence plus a separate retry action. `ContentUnavailable` is reserved for whole screens and centres its action below accessibility sizes. `OfflineLine` appears once per page. `StatePageProvider` deduplicates the page announcement and resets it on pull to refresh; list roots have the same scope.

`Button` uses primary, secondary, plain or destructive treatment. `FollowButton` owns the follow-store calls, limit handling and saved-state feedback. iOS choices use native segmented or pop-up controls; Android retains chips. Fields keep one visible label. On iOS, `Field` puts its fill, radius and resting, focus and error borders on the input itself, including on grouped screens. A single field must not add an `InsetGroup` surface outside that boundary. `MonthPager`, `Composer` and the shared keyboard helpers retain accessible controls at large sizes.

## Navigation and checks

The shared route folder is `app/(tabs)/(today,your-mp,bills,search,ask)/`. Route builders live in `navigation/routes/`; stack registrations live in `navigation/stack/`. Keep route titles for named back buttons. On iOS, `useTitleOnScroll` measures the heading in window coordinates on scroll and reveals the inline title when the heading's midpoint passes under the native bar. It does not combine native measurements with JS scroll offsets. `Screen.barTitle` uses the same hook through `TitleAnchor`; wrap headings inside custom components explicitly. Measurement wrappers must have `collapsable={false}`. Large-title lists keep `title` for the large title and reveal a capped `BarTitle` through `useTitleOnScroll` on a measured first header block once the large title has collapsed, never a plain-string `headerTitle`. `BarTitle` keeps its text laid out at a constrained width from its first layout, even at rest, and hides it with opacity. Width reserves the named back pill and trailing controls. If the room left is under 60 pt, or too narrow for the first whole word and an ellipsis (scaled with Dynamic Type), the title stays hidden, including from accessibility. Never replace a hidden title with empty text or zero width. Android keeps its content-coordinate scroll threshold.

Use one navy tint. Category inks belong to subject figures and hierarchical symbols. Party colour is a dot beside a name. Corners use purpose-named radii and continuous curves. Menus use native row or bar menus on iOS, with destructive confirmation and Android fallbacks in `design/menu`.

Deprecated recipe baselines are empty and all design rules are errors. Before committing, run `npm run typecheck`, `npm run lint` and `npm test`. Device captures, large-title rendering, colour matching, AX5 layout and iPad behaviour are checked by the orchestrator; unit tests do not establish those visual outcomes.

`npm run qa-static` also runs the accessibility rules in `scripts/a11y-static.ts` over every `.tsx` in `src`: each pressable has a role and a label or readable text, each image is labelled or hidden, no raw `fontSize` outside `design/`, fixed-size targets meet `minimumTarget` on both platforms, and labels and hints carry no em dash. Cases the source cannot settle are skipped, not guessed. A deliberate exception takes an inline `a11y-ok(<rule>): <reason>` comment on or directly above the element or style property; a marker that excuses nothing fails the check. A new exported component here that renders a pressable must be added to `designPressables` in that script, saying whether it names itself or its call sites must.

## iPhone Duo

`useLayout()` adds `rule: 'pad' | 'phone-regular' | 'phone'`. iPad regions remain regular from 700pt. An iPhone region is regular from 560pt only while its key window has regular width and regular height traits. Other phone windows stay compact, including Pro Max landscape. `wide` is iPad-only. Pass the rule to `sizeClassFor(width, rule)`, `gridColumns(width, { rule })`, `readableInset(width, max, margin, rule)` and `columnBreakout(width, column, rule)` when measuring a region. Regular phone grids cap at two even columns, with one column when the minimum card width or accessibility text needs it. `PadGrid` and `PadReading` follow the layout rule; `SidebarSafe` remains iPad-only.

**Two panes from 700pt, on every device.** `breakpoints.split` is 700pt. `splitAllowed(width, rule)` (and `useLayout().split`) is true when the region is regular and at least 700pt wide, on iPad and on a regular phone alike. `SplitLayout` (Bills, Search, the directories), Ask's docked sources pane and Today's two columns all draw two panes only from there; below it they draw one column. A regular phone between 560 and 699pt (iPhone Duo unfolded in portrait, about 669pt with the floating tab bar at the bottom) keeps regular spacing and two-column grids but one pane: build 61 split it into a 281pt list whose header labels broke mid-word. Text size does not move the breakpoint: at accessibility sizes the narrow pane widens to 45% (`splitPaneWidth`) and `wordSafe` steps labels down. Today's spread is even on a regular phone; iPad keeps its 3:2 spread from 900pt.

**Labels never break inside a word.** Headings, row and picker labels ("Showing"), pill and capsule text keep whole words at every width and text size. A label that sits beside something else on one line never takes `flex: 1` or `flexShrink: 1`: it keeps its own width (`flexGrow: 1, flexShrink: 0, maxWidth: '100%'`) in a row with `flexWrap: 'wrap'`, and what sits beside it (a link, a pop-up button, an accessory) moves under it when the two do not fit. `SectionHeader` (with an action or accessory) and `PopUpButton row` already do this; use them rather than a one-off row. Draw fixed labels with `wordSafe` so they also step down at accessibility sizes. `tests/word-safe-labels.test.tsx` lays these rows out at about 300pt and fails if a short label splits.

`useWindowTraits(): WindowTraits | null` reads the live key window, with a synchronous native snapshot for first render and `{ horizontal, vertical, foldable }` updates. `useAdaptiveDevice()` replaces `isPad` at whole-screen view-tree forks: it is true on iPad and stays true for a phone session after any division is detected or regular/regular traits appear. This keeps the same tree mounted across display changes. Keep `isPad` for iPad-only keyboard shortcuts, pointer effects, URL drags, sidebar labels and `phoneCopy`. The root subscribes for the whole session. Tests use `setWindowTraitsOverride(traits)`; `undefined` restores native traits, `null` simulates no bridge. `resetAdaptiveDeviceForTests()` resets session detection between tests only.

`ReservedRegionArea` is a plain container with `style`, `testID` and optional `onChange(regions)`. `useReservedRegions()` supplies `{ divisions, occlusions }` in that area's own points; each region is `{ x, y, width, height, active }`, with margins already included. `ReservedRegionsProvider value={regions}` supplies a local manual override or test seam. Nested native areas measure their own geometry. Off iOS or without the module, an area renders a plain View and regions are empty unless explicitly overridden.

Pure helpers live in `fold.ts`: `activeVerticalFold(divisions)` and `activeHorizontalFold(divisions)` return an active region or null. `sidesOf(fold, bounds)` returns `{ leading, trailing }` or `{ top, bottom }` rectangles with the whole fold strip excluded. `placeClear(rect, regions, bounds)` retains a fixed element's size, prefers the larger side of a straddled division (trailing or bottom on a tie), then moves the least distance outside active camera occlusions. Clear elements stay put; if no free rectangle can fit, it returns a bounds-clamped position without resizing. `evenColumns(count)` rounds multi-column counts down to an even count and retains a usable single column. Move fixed controls and focal points; scrolling prose and lists continue across folds.

`modules/opax-duo` loads on both iPhone and iPad. Its reserved-region code is compiled only when the podspec detects an iOS SDK of 27.1 or later, then guarded at runtime for iOS 27.1. Duo full-screen behaviour and reserved regions need that SDK. On the 27.0 SDK the view is a plain container that emits nothing and `foldable` is false; window traits still work.

## Android controls

Android design pressables use `design/pressable`: bounded foreground ripples on
rows, cards and chips, borderless feedback on icon buttons, and minimum 48 dp
targets. State layers have paper, filled-surface and high-contrast tokens. The
iOS branch forwards its original props. Keep feature pressables on these shared
controls so their targets, labels and feedback remain consistent.

`Button` keeps its existing props and variants; Android also accepts `filled`,
`tonal`, `outlined` and `text`. Existing `primary`, `secondary`, `plain` and
`destructive` calls retain their meanings. Controls grow with wrapping text.
`SwitchRow` draws the shell's Material 3 switch. `ChoiceChip` exposes a checked
filter with a visible check; segments expose selected tabs. `Field` supplies the
Android focus boundary, selection colour and labelled clear action. A field
with `returnKeyType="search"` also draws a decorative search icon.

`showMenu` and `confirmAction` keep their existing arguments. Android can also
receive a `{ x, y, width, height }` window-coordinate anchor as the third
argument and an optional dismissal callback as the fifth. Design touch surfaces
record their measured anchor for existing callers; `PopUpButton` measures its
own trigger. Android menus support Back, outside tap, scrolling and menu-item
semantics. iOS retains its native action sheet and numeric iPad anchors.

`Stepper` and `Slider` are additive Android controls with a required label,
value, finite min/max, positive step and `onValueChange`. They expose adjustable
increment/decrement actions and numeric bounds. They render nothing on iOS;
existing iOS screens continue to use their native pickers. The slider and switch
load Compose only inside Android branches, using the existing shell modules.
