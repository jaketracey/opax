# OPAX mobile design

Import shared components from `design/primitives`. Feature-specific modules use direct imports. The barrel uses explicit named exports so shared re-exports cannot hide a name clash.

## Type and rhythm

The eighteen roles are `largeTitle`, `inlineTitle`, `pageTitle`, `recordTitle`, `recordHeading`, `sectionTitle`, `subsectionTitle`, `groupHeader`, `name`, `rowRecord`, `recordText`, `body`, `strong`, `secondary`, `footnote`, `capsule`, `figure` and `tileFigure`. OPAX's words use the platform interface face. Record titles and verbatim passages use Merriweather; figures use tabular interface digits. `Heading` supplies the header trait and title anchoring. `wordSafe` retains whole words at large text sizes.

Use `rhythm`: line 4, tight and heading 8, row 11, block 16, group 24, section 36 and screen 20. Screen margins are 16 below 414 points and 20 above. Regular-width columns use `rhythmRegular`. There is no spacing scale or legacy text-role surface.

`npm run tokens` builds the mobile target through `scripts/build-design-tokens.mjs`. Shared values come from `../docs/design/design-tokens.json`. Mobile omits the shared source's transitional web aliases and supplies photograph ground and scrim roles. The generation check compares the complete generated output.

## Surfaces and rows

`Screen` supplies a readable or wide column, automatic native insets, pull to refresh, a page state scope and an optional title revealed by scrolling. `Screen grouped` uses sunken ground with raised cards and inset groups. Its navigation background follows the same ground. `KeyboardStableScreen` retains keyboard clearance and the same refresh boundary.

`Section` uses a heading and an 8 point content gap. `InsetGroup` owns separators. `LinkRow`, `ValueRow`, `PersonRow`, `BillRow`, `RecordRow`, `DivisionRow` and `MoneyRow` provide the shared row anatomy and at least 44 point targets. `RowLink` owns navigation previews, context menus and accessibility actions. `Card` supports a menu with or without a navigation destination. Tiles retain their trailing chevron.

Use `FigureBlock` for a subject figure and `StatTile` or `StatStrip` for related values. Figure and chart provenance is passed as `citation`; `source` is reserved for images. A containing sourced section may omit a figure's own citation. Charts use `VoteSplit`, `StageTimeline` and `BarSeries`, with a table alternative for drawn bars.

## Sources and sheets

Every block has one dated `SourceLine`. It opens the `/source` route through `navigation/sheets`, with originals, plain notes, the selection rule and a Sources and licences link. Licence text belongs in the Licence sheet. Use `MachinePill` and `/machine-note` for machine-written text. Methodology opens `/rule`; there are no in-place source or info modals.

Sheets use a native bar, plain Done and the shared detents. Account, Licence and Ask retain their own sunken ground. On iOS 26 a supported `headerBackground` draws that ground while the native header remains transparent, preserving large titles. The hard top scroll edge retains legibility over scrolled text. Earlier iOS versions use the opaque bar appearance.

## State and controls

`Skeleton` mirrors final content. `InlineError` is a quiet sentence plus a separate retry action. `ContentUnavailable` is reserved for whole screens and centres its action below accessibility sizes. `OfflineLine` appears once per page. `StatePageProvider` deduplicates the page announcement and resets it on pull to refresh; list roots have the same scope.

`Button` uses primary, secondary, plain or destructive treatment. `FollowButton` owns the follow-store calls, limit handling and saved-state feedback. iOS choices use native segmented or pop-up controls; Android retains chips. Fields keep one visible label. `MonthPager`, `Composer` and the shared keyboard helpers retain accessible controls at large sizes.

## Navigation and checks

The shared route folder is `app/(tabs)/(today,your-mp,bills,search,ask)/`. Route builders live in `navigation/routes/`; stack registrations live in `navigation/stack/`. Keep route titles for named back buttons. On iOS, `useTitleOnScroll` measures the heading in window coordinates on scroll and reveals the inline title when the heading's midpoint passes under the native bar. It does not combine native measurements with JS scroll offsets. `Screen.barTitle` uses the same hook through `TitleAnchor`; wrap headings inside custom components explicitly. Measurement wrappers must have `collapsable={false}`. Large-title lists keep `title` for the large title and reveal a capped `BarTitle` through `useTitleOnScroll` on a measured first header block once the large title has collapsed, never a plain-string `headerTitle`. `BarTitle` keeps its text laid out at a constrained width from its first layout, even at rest, and hides it with opacity. Width reserves the named back pill and trailing controls. If the room left is under 60 pt, or too narrow for the first whole word and an ellipsis (scaled with Dynamic Type), the title stays hidden, including from accessibility. Never replace a hidden title with empty text or zero width. Android keeps its content-coordinate scroll threshold.

Use one navy tint. Category inks belong to subject figures and hierarchical symbols. Party colour is a dot beside a name. Corners use purpose-named radii and continuous curves. Menus use native row or bar menus on iOS, with destructive confirmation and Android fallbacks in `design/menu`.

Deprecated recipe baselines are empty and all design rules are errors. Before committing, run `npm run typecheck`, `npm run lint` and `npm test`. Device captures, large-title rendering, colour matching, AX5 layout and iPad behaviour are checked by the orchestrator; unit tests do not establish those visual outcomes.

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
