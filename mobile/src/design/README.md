# OPAX iOS design system

The web's broadsheet language in native form: paper, ink, navy and bronze;
Merriweather for display and section headings, Public Sans for everything
else; hairline rules instead of boxes; 44pt targets; 4pt corners. Sources:
`docs/IOS-UX.md` sections 4 to 7, `docs/UI_DESIGN_LANGUAGE.md`,
`docs/UI_CONTROLS.md`.

Import everything from one place:

```tsx
import { Screen, Section, PersonRow, AsAtLine } from '../design/primitives';
```

Open the workbench (development and e2e builds: Account and about, then
Design workbench) to see every component and state at the current text size.

## UI sweep (Oct 2026): rhythm, colour, licences

- **One vertical rhythm** (`rhythm` in `tokens.ts`): `line` 4 (a line bound
  to the one above), `tight` 8 (inside a row or group), `heading` 12 (a
  section heading to its first block), `block` 16 (between blocks),
  `group` 24 (a second list inside a section), `section` 36 (between
  sections), `screen` 20 (margin). `spacing` and `layout` keep working;
  `layout` now reads from `rhythm`. In a `RowList`, control rows (`LinkRow`,
  `Disclosure`, `PersonRow`, `RecordRow`, `OpaxWebLink`) own their 44pt and
  sit 2pt from each hairline (48pt for one line); content rows keep 10pt.
- **Category accents** (`accents` in `tokens.ts`, roles in `palette.ts`):
  `money` (`moneyInk` #2B6447 / `moneyWash` #E5EAE5), `votes` (`votesInk`
  #3A4C96 / `votesWash`), `interests` (`interestsInk` #7B3A63 /
  `interestsWash`), `bills` (`billsInk` #1F5F6B / `billsWash`), `people`
  and `places` (`navy` / `navyWash`), `leads` (`bronzeInk` / `bronzeWash`).
  Inks are AA text on paper, raised, sunken and their wash; ink and inkSoft
  are AA on every wash. One accent per block, never rainbow.
- **Party washes** (`partyWashes`, `partyWash(party)`): each party colour at
  12% over paper, for `PartyChip` and party headers; ink and inkSoft stay AA
  (`partyWashPairs` in `contrast.ts`).
- **Type roles added:** `display` (Merriweather Bold 34, the number a block
  is about, via `BigFigure`), `caption` (12pt, the one "Updated 4 Oct 2026"
  line per block), `chip` (13pt semibold, party chips and small tinted
  labels).
- **Licences and sources live on one screen** (`/account/sources`, from
  About and the Account sheet). Screens show no licence text, credits,
  "Source:" lines or source rows. `AsAtLine` draws only "Updated [date]"
  (VoiceOver still hears the full as-at sentence with its sources);
  `SourceLink` is a small "View original" link for a record's own document
  (full column width at accessibility sizes, so word-safe text never chases
  a frame that follows its own size);
  `ViewOriginal` gives a block one such link, or a menu when it has several.
- **Long notes go behind ⓘ:** `Section info={{ title, notes }}` (or
  `InfoButton`) opens a page sheet with the methodology and caveats in full.
  Keep at most one short caveat line on screen where a number would mislead.
- **Controls:** `Disclosure` (label, trailing value, turning chevron,
  animated with Reduce Motion respected) replaces bordered Show/Hide
  buttons; `LinkRow` (optional `IconTile`, title, detail, value, chevron or
  Safari symbol) replaces full-width text links; `Section` takes `accent`
  and `info`. `haptic('success' | 'selection' | 'light')` on
  Follow and Share only.

## TestFlight polish (8 Oct 2026)

- **Section headings carry no icon tile** (too busy). A section's `accent`
  draws a short 2pt mark in its ink over the start of the top rule. Icons
  stay on rows and links (`LinkRow`, cards), where they help scanning.
- **`MachineWritten`**: the machine-written label is only the pill (a
  sparkle and "Machine-written", "Machine summary" or "Machine brief"),
  never a pill plus an attribution paragraph. Tapping it opens a sheet with
  the text's own attribution and `MACHINE_GUIDANCE`; VoiceOver hears the
  whole disclosure on the pill ("Machine-written. Written by a model from
  the explanatory memorandum; not the record."). Bills, the record reader,
  Today's edition card (its own tinted face via `children`), reports and
  Ask all use it.
- **`Composer`**: one rounded raised surface with the send circle inline
  (navy with text, drawn disabled until then, a spinner while working). The
  screen title names the task, so the input's label is spoken, not drawn.
  Ask's question and follow-up use it; Options and Your conversations sit
  below as plain rows. Its multiline input scrolls after reaching 40% of
  the live window height above the software keyboard, keeping Send and the
  conversation visible on both iPhone and iPad.
- **`StepButtons`**: previous and next on one row ("‹ June", "August ›"),
  each with a full spoken name; a disabled end stays drawn disabled. They
  stack full width at accessibility sizes.
- **Portraits load quietly**: while the lookup runs or the image decodes,
  a veil over the blank circle breathes between sunken and the hairline
  colour (one shared beat, colour only, no opacity); the photo then fades
  in as the veil clears. Under Reduce Motion the veil is still and clears
  at once. Nothing changes size.

## iPad (Oct 2026): designed for the larger screen

TestFlight builds from `ios/app` run natively on iPad (`supportsTablet`,
all four iPad orientations, Split View, Slide Over and Stage Manager
windows). The App Store 1.0 build (`ios/release-1.0`) stays iPhone-only.
**The iPhone never changes:** every adaptive decision below is `compact` on
an iPhone in any orientation, and the iPad-only wrappers (`Hoverable`, the
Bills `LayoutRegion`) render nothing extra there.

### Size classes: `useLayout()`

- `useLayout()` returns `{ size, regular, wide, width, height, window,
landscape }`. `size` is `regular` from **700pt** (`breakpoints.regular`)
  on an iPad, else `compact`; `wide` is regular and at least 1100pt (three
  columns). It follows the live window, not the device: rotation, a 1/3
  Split View window and a Stage Manager resize all re-render.
- Inside a measured region it reads that region instead of the window: a
  `Screen` gives its children the width of its content column, and each
  `SplitLayout` pane gives its own width, so a screen drawn in the 480pt
  detail pane lays out as compact. Wrap anything else that must know its
  real width (a full-screen FlatList) in `LayoutRegion`.
- Decide per block, never per device: `const { regular } = useLayout()`.
  Don't read `Dimensions`, `Platform.isPad` or the orientation for layout;
  `isPad` exists only for iPad-only wrappers that must not touch the
  iPhone's view tree.

### Columns: `Screen`, `ReadableColumn`

- `Screen` and `KeyboardStableScreen` centre their content on regular
  width: `column="readable"` (default, 700pt, for long text and every
  existing screen) or `column="wide"` (1180pt, front pages and grids).
  Nothing else is needed: every screen built on `Screen` already stops
  stretching edge to edge on iPad. Compact keeps the 20pt margin.
- FlatList screens use the same column through `useScreenColumn()`:
  `onLayout` on the list, `content` in `contentContainerStyle`, `inner` in a
  `RegionProvider` around the header, and `bar` first in the header (the
  reader's `ReaderList` is the example).
- `ReadableColumn` centres long text outside a `Screen` (a sheet's body).

### The sidebar's inset: `SidebarSafe`

- On iPadOS 26 the sidebar floats over the content and reports itself as a
  leading safe-area inset. The navigation bar follows it; scroll content
  does not. `Screen`, `KeyboardStableScreen`, the reader and the Bills split
  wrap themselves in `SidebarSafe` (a native safe-area view, leading and
  trailing edges, iPad only); wrap any other full-screen FlatList in it.
  Nested ones defer to the outermost (the native view pads by its screen's
  insets, not its own overlap). In portrait the sidebar overlays the
  content while open, as UIKit intends.

### Grids: `Grid`

- `<Grid columns={{ regular: 2, wide: 3 }} minItemWidth={280}>` lays card
  fronts in columns from its own measured width: `compact` (default 1),
  `regular` (2) and `wide` (3), never narrower than `minItemWidth` times the
  text scale (capped at 2x), so at accessibility sizes it steps down to
  fewer, wider cards. Cells in a row share the row's height; give a card
  `flexGrow: 1` (Today's bill cards use `fill`) to fill its cell.
- Sections can be grid items: their top rules then read as a broadsheet's
  column rules (Today's "ways in" and reports rows).
- `PadGrid` is a `Grid` on iPad only: on iPhone and Android its children
  stay the siblings they were (no wrapping view, no new gap), so a phone
  screen that gains columns on iPad does not move by a pixel. Person and
  party pages (`column="wide"`) put consecutive blocks in pairs with it
  (`features/split/grid.ts`); pair only neighbours, never reorder, and
  never pair a block that can render nothing (an empty cell).

### Two panes: `SplitLayout`

- `SplitLayout<T>` draws a list pane (360pt, dragged between 300 and 440pt
  on the hairline divider; at accessibility sizes it starts at 45% of the
  region and drags up to half, so rows keep whole words, which VoiceOver adjusts in 40pt steps and which
  thickens in bronze under the pointer) beside a detail pane, on regular
  width. On compact it renders the list alone: the screen then pushes its
  detail route exactly as before, so check `useLayout().regular` in the row's
  `onPress`.
- **Selection lives in the route** (`router.setParams({ bill: key })` on the
  root screen, read back with `useLocalSearchParams`): it survives tab
  switches, rotation through compact and back, and a link such as
  `/bills?bill=<key>` opens the item in the pane.
- **The detail pane has its own small stack.** `renderDetail(entry)` draws
  an entry; screens inside call `useSplitPane()` and `pane.push(entry)` to
  open a follow-on page in the pane ("Read the bill text"), with a Back to
  the entry below drawn first in the pane's content (`entryTitle` names it).
  `pane.select(entry)` makes another item the selection (a related bill). A
  new selection starts the stack again. Outside a pane `useSplitPane()` is
  null; wrap the decision in a feature hook (`useBillNavigation()`:
  `openText`, `openBill`) so the same screen pushes routes when it is pushed.
- Links that leave the item (a sponsor's profile, Ask about this) keep
  pushing or switching tabs; Back returns to the split with its selection.
- Detail screens render `embedded` (no `Stack.Screen` title or bar items);
  the pane bar carries `detailActions` (Share).
- `empty` is a `SplitEmpty`: a symbol on its category wash, one serif line
  and, at most, one sentence. No instructions.
- Rows in the list take a `selected` state: the category wash with a 3pt ink
  mark, no chevron (the pane is the destination), `accessibilityState
selected`. `LinkRow`, `PersonRow`, `RecordRow` and the party directory
  row take `selected` (undefined everywhere outside a split, so the phone's
  rows are unchanged) and `highlighted` (the keyboard cursor, drawn as the
  hover tint); `design/selection.tsx` has the shared wash and mark, and
  `contrast.ts` lists the pairs.
- **Records in a pane** (`features/split`): `RecordEntry` (`person`,
  `party`, `electorate`, `bill`, `text`, `doc`, and `person-name` /
  `search-person`, which the pane resolves exactly as the phone does before
  opening a profile), `encodeEntry`/`decodeEntry` for the route's `open`
  parameter, `entryForRoute` and `entryForWebPath` (dated, sectioned and
  versioned routes keep pushing), `RecordDetail` (the native screen,
  `embedded`) and `RecordShare`. Search and the directories use them; a
  pane never leaves the app on its own (an embedded party page shows its
  web link rather than opening it).
- A pane outside `SplitLayout` (Ask's sources pane) uses `PaneHost` (gives
  screens inside `useSplitPane()`) and `PaneBar` (Back and actions, drawn
  first by `Screen`).

### Navigation

- The tabs are UIKit's sidebar-adaptable tab bar on iPad (`NativeTabs
sidebarAdaptable`): a sidebar, or the top tab bar the reader expands into
  one, on regular width; the bottom bar in a compact window; no change on
  iPhone. Talk and Account stay in each root's navigation bar. Sidebar
  labels use UIKit's word-wrapped item configuration, fitting a long word
  down only as far as the default body size at accessibility sizes.
  Incoming `opax://directory` links select Search's shared directory route.
- Root screens with two panes turn their large title off on regular width
  (Bills); large titles over two scroll views collapse with whichever
  scrolls first.

### Sheets

- `shortSheet` (`src/navigation/chrome.ts`) for a short single-screen sheet
  (filters, a glossary): a centred form sheet on iPad, a bottom sheet in a
  compact window, unchanged on iPhone. Sheets with their own stack
  (Account, directory filters) and Talk stay `modal`, which iPadOS draws as
  a centred page sheet.
- The share sheet's iPad popover points up at the bar's trailing buttons
  (`anchorPopover` in `modules/opax-share`). Action sheets
  (`showMenu`, `ActionSheetIOS`) present as centred popovers; pass an anchor
  when a lane adds one beside its control.

### Keyboard, pointer, focus

- **Shortcuts** (`src/design/keyboard.ts`, installed by
  `src/navigation/KeyboardShortcuts.tsx`, registered with UIKit by
  `modules/opax-ipad` and listed in the Cmd-hold overlay): Cmd-F Search
  (field focused), Cmd-N a new Ask question (composer focused; nothing is
  sent, and a question being answered keeps running), Cmd-1…5 the five
  sections. Add one by giving it an id and spec in `keyCommandSpecs`, then
  `useKeyCommand(id, handler, enabled)` where it applies: the newest
  registered handler runs, so a screen can take a key while it is shown.
- **Focus requests:** `requestFocus('search' | 'ask')` before navigating;
  the target screen calls `useFocusRequest(target, inputRef)`, which waits
  for the screen to mount and the transition to settle. `Field` and
  `Composer` take `inputRef`.
- **Split list keys:** a `SplitLayout` with `keys` and `entryForKey` takes Up
  and Down (select the previous or next row, scrolled into view), Return
  (select the first row when nothing is selected) and Escape (back within
  the pane, then clear) while its screen is focused. A focused text field
  keeps its own arrows and Return; Escape closes the active sheet.
- **Cursor mode** (`onOpenKey`, Search): for lists whose rows load or may
  leave the app when opened, Up and Down move a highlight
  (`useSplitCursor()`, `features/split/cursor.tsx` scrolls it into view)
  without opening anything; Return opens the highlighted row, Escape clears
  the pane, then the cursor.
- **Pointer:** `Hoverable` gives a control the system pointer effect:
  `highlight` (buttons; `Button` and `IconButton` already have it), `lift`
  (cards: Today's bill, Leads and money map cards), `hover` (rows), or
  `none` with `onHover` for a drawn hover state (`useHover()`: `LinkRow` and
  bill rows tint `sunken`, the same colour as pressed). Give the wrapper the
  child's own `alignSelf`. Hover is never the only way to see or reach
  anything.

### Testing on iPad (journeys 52 and 53)

- Journey 53 drives the Search, Ask and directory splits and rotation; it
  reaches screens by `opax://` links, which also checks the route-kept
  selection. `support/ipad-full-screen-apps.yaml` and
  `support/ipad-windowed-apps.yaml` set and restore the multitasking mode.
- Settings is not drivable at AX5 (its rows reflow out of reach): set
  Full-Screen Apps in a standard-size run, run the AX5 flow, then restore
  Windowed Apps in another standard-size run.

- Use only the OPAX QA iPad 13 simulator. iPadOS 26 opens apps in movable
  windows (Windowed Apps); in that mode Maestro's taps land beside their
  targets (a tap on "Bills" opened Ask, a Settings row tapped the one
  above), though `assertVisible` still works. Journey 52 therefore sets
  Settings > Multitasking & Gestures > Full-Screen Apps first, then returns
  to Windowed Apps for its last step and drags the window's corner grabber
  to about a third of the screen (iPadOS stops at about 375pt).
- The top tab bar's sidebar button is "Toggle sidebar". `hideKeyboard`
  does not work on the iPad keyboard; dismiss it from the app (choosing a
  bill does) or submit the field.
- Settings' rows move during its launch animation: wait for the row to be
  visible and let the tap settle (`waitToSettleTimeoutMs`).
- Hardware-keyboard shortcuts and pointer effects cannot be driven by
  Maestro; `tests/ipad-layout.test.tsx` covers the command handlers, and
  they are checked by hand on a device with a keyboard and trackpad.

### Search, Ask and the directories (lane 2)

- **Search** is a split on regular width: results left, the chosen person,
  bill, party, electorate or record in the pane, the selection and query in
  the route (`/search?q=…&open=bill:…`; the route keeps Search mounted when
  either changes on iPad, and applies a new `q`). Topics and reports keep
  pushing.
- **Ask**: the conversation with the composer docked under it (lifted by
  its measured overlap with the keyboard; the column starts below the bar,
  so `KeyboardAvoidingView` under-lifts it), and a sources pane on the
  right (`features/ask/SourcesPane.tsx`): the answer being read (it follows
  the scroll), its citations numbered as in the answer, then what was
  retrieved but not cited. Up/Down move a highlight through both groups;
  Return opens that source in the pane. Source-record search results use
  the same cursor behavior. A citation in the answer marks its source in the
  pane; a source, a citation row or a person opens in the pane with Back to
  the sources. The answer's own "Retrieved records" list is not drawn there.
- **Parliamentarians, Parties, Electorates**: splits as Bills (`open` in
  the route, Up/Down/Return/Escape).

### Copy

- `phoneCopy()` says "iPad" on an iPad ("saved on this iPad"). Wrap any new
  string that names the device in it.

## Rules that apply everywhere

- **Colour through roles only.** Use `colors.<role>` from `tokens.ts`, never a
  hex value in a screen. Roles resolve Increase Contrast natively (faint steps
  to soft, soft to ink, onNavySoft to onNavy, subtle rules to default, and the
  category inks and bronzeInk to 7:1 on their wash and every surface).
  Derived hexes (Today's tints in `features/today/tint.ts`) read
  `useIncreaseContrast()` and strengthen through `strongOn`/`strongAccent`. A dark palette is added in
  `palette.ts` and wired in `tokens.ts`; components do not change.
- **Text tones.** `inkFaint` is for paper and raised surfaces only. On sunken
  surfaces, tags and chips use `inkSoft`. `bronze` is never text.
- **States are opaque.** Pressed, selected, focused, error, disabled and
  loading states change role colours, never opacity, so what is drawn is what
  `contrast.ts` lists. Every state of every control has a row in
  `componentPairs`; `tests/contrast.test.ts` checks each ratio and
  `tests/states.test.tsx` renders the controls' pressed and disabled states
  and fails if a drawn pair is missing from the table. Add a row whenever a
  component draws a new foreground on a new surface.
- **Dynamic Type to AX5.** Every text role scales with its ramp. Never pass
  `numberOfLines`, fixed heights or `adjustsFontSizeToFit` for names, bill
  titles, figures, labels or caveats. Side-by-side layouts stack at
  accessibility sizes: use `useAccessibilitySize()` for your own. React
  Native has no hyphenation on iOS. Headings, control labels and shared
  components use `wordSafe` (below), including body, metadata and fine text
  in PersonRow, PartyLabel, AsAtLine, source links and state messages.
  This is the shared AX5 behaviour across every screen, including Bills
  and Search; keep it in the components rather than overriding it in screens.
  The build-2 device gate reviews every screen at AX5.
- **No raw IDs.** Chamber and jurisdiction IDs go through `parliament.ts`:
  `chamberName('vic_la')` is "Victorian Legislative Assembly",
  `chamberName('representatives')` "House of Representatives",
  `jurisdictionName('vic')` "Victoria". Both return null for an unknown ID;
  say "Chamber not recorded" (`CHAMBER_NOT_RECORDED`), never print the ID.
  `tests/people-data.test.ts` checks every ID in the pinned data has a name.
- **Meaning never depends on colour.** Party by label, outcomes by word,
  errors by text and icon.
- **Numbers and dates** come from `format.ts`: `formatMoney` ("$4,537,500"),
  `formatMoneyCompact` ("$4.2m", "$1.1bn", charts and tight figures only),
  `formatMoneyWords` ("$4.7 million", running text), `formatCount`,
  `formatPercent` (one decimal), `largestRemainder` (sets that add to 100),
  `formatDate` ("17 September 2026"; `'short'` gives "17 Sep 2026"),
  `formatFinancialYear` ("2024–25"), `formatYearRange` ("1998 to 2026").
  Date-only strings are calendar dates; timestamps use the device's zone.
- **Copy.** No full stops in headings, no em dashes, no helper hints. Machine
  text is labelled. Patterns are leads, never findings.
- **Native pages for roster parliamentarians only** (decision 3). Donors,
  witnesses, suppliers and other private individuals are plain text: no
  `PersonRow`, portrait, chevron or profile link.

## Text

- `Text`: all content text. `variant`: `title` (in-content page title, such
  as a profile's name), `heading`, `subheading`, `record` (Merriweather reading
  text), `body`, `strong` (names in rows), `lede`, `metadata` (ink-soft),
  `fine` (source and as-at lines), `figure` and `figureInline` (tabular),
  `tag`, `kicker`, `control`, `countdown`. `tone` overrides the role colour.
  Bold Text steps the bundled fonts up a weight. Tagged `en-AU` for VoiceOver.
  `wordSafe` stops a word splitting across lines: when a laid-out line ends
  inside a word, the text lowers its own Dynamic Type cap in 10% steps until
  the word fits, never below the reader's default size, and starts again from
  full size when the text size, window width, role, Bold Text or text (nested
  text included) changes, or when its column widens. Each cap is drawn by its
  own native Text (a React key per generation), so every layout event names
  the instance that measured it and late events from earlier instances are
  ignored. A capped instance draws one font and one text, so its frame
  widening means the column widened: it starts again from full size and steps
  down afresh. Across a step, it restarts only when its widest line scaled to
  full size fits a frame wider than the one full size broke in. The cap only
  steps down within a generation, and never at or below the reader's default
  size. Frames and lines that change nothing drawn never render.
  The cap scales the role's font size and line height, never
  `maxFontSizeMultiplier`: React Native's text measure cache ignores that prop,
  so a cap passed through it keeps the full-size layout and drawing.
  Every role's line height carries a 1/997pt nudge (`LINE_HEIGHT_NUDGE`):
  it keeps RN's ceiled text measurement off exact pixel boundaries. Yoga can
  still round the final frame below that measurement, so every content Text
  reserves a stable `ceil(naturalHeight) + 1pt` floor, including plain text.
  The nudge protects measurement; the floor protects drawing. Don't set your
  own `lineHeight` on `Text`; pick a role. The floor is never a height or line
  cap, and resets on text size, content and actual container-width changes.
  A width change removes the old floor and reads the committed native frame,
  even when its dimensions stay unchanged and no new layout event fires.
  At standard size this adds 1–1.67pt and one settling render. Repeated layouts
  dispatch no state updates, and plain text needs no native line measurement:
  an initial empty line event is suppressed by RN, so relying on it would miss
  completely vanished text. E2E representative names
  expose `drawn-complete-<lineCount>` only when all native line text and bounds
  fit the final frame. Metro substitutes a no-op hook and empty prop factory
  in production and blocks the e2e implementation, so its diagnostic code
  and strings do not ship; production names retain their original IDs.
- `Heading`: a VoiceOver header. `level` 1 (page), 2 (section), 3 (subsection).
  Always word-safe, so "representation" never breaks at AX5. Root screens take
  their title from the native large title instead.

## Controls

- `Button`: `variant`: `primary` (navy; one per view), `default` (a navy-wash
  capsule with no outline, as Follow and `ChoiceChips` draw), `quiet`,
  `danger` (destructive, outlined). Every variant is a capsule; at
  accessibility sizes a button takes its column's full width (a fixed frame
  for its word-safe label) with 14pt corners and reads from the leading edge.
  A quiet button pulls out by its padding, so its label lines up with the
  text column. `size`: `compact` 44, `default` 48, `large` 56 (minimum
  heights; text wraps, word-safe). Use a `LinkRow`, not a button, for an
  action that opens another screen ("Read full bill text"). `loading` keeps the
  label, width and accessible name and reports busy; `disabled` is announced
  and drawn in ink-soft on sunken (5.97:1), not faded. Pressed states darken
  the fill (`buttonStates` in `controls.tsx`). `icon` adds a leading SF
  Symbol. There is no bronze or gold button. Use a link or row for
  navigation, not a button.
- `IconButton`: icon only; `accessibilityLabel` is required by its type.
  44 by 44 minimum.
- `Tag`: topic metadata: bronze wash, decorative `#`, read as "Topic: Housing".
  With `onPress` it is a link with a 44pt hit area around its 28pt visual;
  pressed keeps its 4.67:1 label and adds an outline and underline. Never a
  filter or a submit button.
- `FilterChip`: an applied filter; the whole chip removes it and reads
  "Remove the kind filter, Declared interests". A navy-wash capsule with a
  close symbol (40pt drawn, 44pt to touch); full width at accessibility sizes.
- `SegmentedControl`: one choice among peers. 48pt outside height; every
  segment is a real 44 by 44pt target (the selected highlight is inset 3pt
  inside it), labels wrap, and segments stack at accessibility sizes.
  `stacked` stacks them at every size, for labels whose longest word would
  not fit an equal share of the row (the Leads and declarations filters). Each
  segment reports selected and "2 of 3". It is a group of buttons, not tabs.
- `Field`: label (always visible, word-safe), optional `hint`, `error` and
  `required`. The input carries the label, required state, error and hint for
  VoiceOver; the error also shows an icon and danger text. Focus and error
  draw a 2pt boundary (navy, danger); `editable={false}` draws sunken. Pass
  `TextInput` props through. React Native does not scale placeholders with
  Dynamic Type, so the visible label always names the field.
- `Divider`: `default` between major sections, `subtle` between rows and
  subheadings, `accent` (bronze) only for intentional emphasis. Decorative;
  the layout owns the spacing.
- `Icon`: an SF Symbol, decorative unless given `accessibilityLabel`; grows
  with text size.

## Layout

- `Screen`: the scrolling page on paper under the native bar. Put it first
  in the screen so large titles collapse. `refreshControl` for pull to refresh.
- `Section`: a default rule, an optional serif `title` and an optional
  trailing `action` (an "All bills" link); no icon tile. No cards for boundaries. At
  accessibility sizes the title takes its own line and the action and ⓘ sit
  on the line below, so a large "See all" never squeezes the heading.
- `EdgeFade`: a decorative fade from paper to clear over the top edge of a
  scrolling panel (Talk's captions), shown once lines have scrolled above.
- `SubSection`: a second list within a section: subtle rule, level 3 heading.
- `Group`: vertical spacing (16pt default).
- `RowList`: rows with subtle hairlines, 8pt either side.
- `KeyValueList`: facts as label and value, one VoiceOver element per row
  ("Base salary, $239,270"); `accessibilityLabel` per item when the value
  needs words. Stacks at accessibility sizes.
- `StatRow`: figure tiles that wrap, one per line at accessibility sizes;
  each reads "value, label" (`valueLabel` for money in words).

## People

- `PartyLabel`: 10pt dot plus the party exactly as the data names it, never
  without its status. `status` (`PartyStatus` from
  `src/api/party-transforms.ts`) is required and has three values:
  - `"current"` (a current dated seat, or a current APH roster row with
    `party_now`) reads "Labor";
  - `"former"` (the dated release says the last seat ended, or the roster
    says the person is not current) reads "Formerly Labor";
  - `"unknown"` (no dated seat and no roster status: most state members)
    reads "Labor", plainly, as the web does. It never says "Formerly", and
    never "sitting"; where a status word is needed, the neutral one is
    "Parliamentarian".

  `formerly="Nationals"` on a current or undated party reads "One Nation ·
  formerly Nationals" (the web's wording). VoiceOver hears the same words in
  every state. `dense` shows the web's short label (ALP, LIB, GRN) and still
  reads the full name. A missing party reads "Party not recorded", with no
  dot. The profile adapter (`personPartyFor`) supplies `partyStatus` and
  `rosterParty`; compare names with `samePartyLabel` (the web's).

- `PersonRow`: portrait (top-aligned with the name), then the name, the
  party chip on its own line, the place, an optional detail, and a chevron. A
  `party` must come with `partyStatus` (the type enforces it). One VoiceOver
  element: "Anthony Albanese, Labor, Member for Grayndler · NSW". Pass
  `onPress` only for roster parliamentarians with a native page.
- `Portrait`: the unchanged website 200×200 WebP, scaled into the circle,
  or the blank fallback; never initials. `localURI` is a file in the current
  API origin's portrait cache. Native images call `localImageURI`; remote
  images are refused by the transport gate. `CachedPortrait` resolves through
  `person-identity.ts`, the slug map and roster, uses full names or a resolved
  person_id, refuses surname/initials-only matches and conflicting face owners
  (including reviewed byte-identical files under different keys),
  and loads through the byte API client (three concurrent reads, one per key).
  A portrait beside its name is hidden from VoiceOver; otherwise pass
  `nameBeside={false}` and `name`, with `official` for APH. Both the circle and
  image preserve `accessibilityIgnoresInvertColors`.
  Credits are not shown beside portraits: Sources and licences lists every
  verified portrait (`PeoplePortraits.list`) with "Official portrait", CC
  BY-NC-ND 4.0, or the web's "Photo" artist, per-file licence and Commons
  source link, searchable. Decision 13 in IOS-APP.md remains open for app
  distribution and caching.

## The record

Citation props are named `citation`, never `source`: `source` is reserved for
image sources, which the transport gate checks.

- `AsAtLine`: one quiet caption under every data block: "Updated 17 Sep
  2026". `asOf` and `citation` (the source names; one string or several),
  with optional `licence`, `detail` (shown) and `savedAt` (a stale copy adds
  "Saved [date]"). The visible line carries no source names; its VoiceOver
  label is the full "As at 17 September 2026 · Source: …" sentence. Use the
  source file's own date (`meta.as_of`, `generated_at`). The votes variant
  takes the W12 `_meta` from `votes.json` plus the record's `jurisdiction`:
  "Updated 3 Oct 2026 · Divisions to 25 Sep 2026"; with no `_meta` it says
  "Record date not published" rather than borrowing a date.
- `SourceLink`: a small link to the original record, opened in
  `SFSafariViewController`: an arrow symbol and "View original" (or a short
  `label`, such as "Act text"). `citation` names who holds it ("They Vote
  For You") for VoiceOver ("View original, They Vote For You, division, 19
  Aug 2026") and the destination title. `kind="record"` for a stable page
  for this record; `kind="register"` for a register's home or search page,
  with the ID in `record`. E2E builds show the destination in a scrollable
  local view instead of opening a browser.
- `OpaxWebLink`: a web-only OPAX page (community, the money map, Methods),
  opened in Safari: a compact row with the Safari symbol; VoiceOver hears
  "Opens on opax.com.au". `canonicalUrl` checks
  the path raw, parses it and requires the configured origin and the same
  path back: foreign hosts, protocol-relative and backslash paths, dot
  segments, encoded slashes or dots, user information, and every route
  `forbiddenOpaxRoute` names are refused. That list comes from the Worker and
  the web app (`portal/src/page-entry.ts`, `portal/src/index.ts`,
  `portal/public/app.js`): `/api`, `/og`, `/mcp`, `/ask`, `/chat`, `/search`
  (redirects to Ask's search), `/today` (a redirect chosen at request time),
  the root with `q` or `ask` (redirects to Ask), `ask` on any page (the web
  app's legacy Ask entry) and route-shaped fragments such as `#/ask`. Path
  segments are decoded before checking. A route-shaped fragment (`#/…`) must
  name a content view (`subject`, `bill`, `money`, `reports` and the other
  views `route()` draws itself), exactly as written, with one leading slash
  and no empty, dot or escaped segment. The web app reads such a fragment
  three ways (its router drops empty segments, its startup fold and the
  homepage parse it as a URL, and `route()` shows the Ask panel for any view
  it does not know), and that shape is the one they all agree on. Fragments
  are also read loosely (decoded, case- and width-folded) and refused when
  they hold `q`, `ask` or a credential key (`token`, `code`, `key`, `session`
  and others; Community signs a reader in with a fragment token); queries are
  refused for a credential key too. Plain anchors such as `#person-pay` pass.
  Source links go through `sourceUrl` (HTTPS, default port, no user
  information; on any OPAX host, including a trailing dot or subdomain, the
  same rules after normalisation). `tests/worker-redirects.test.ts` runs the
  Worker's entry redirects and checks every address they send to Ask is
  refused; `tests/web-router.test.ts` checks the guard against
  `tests/web-oracle.mjs`, which runs the Worker's redirects, `home.js`,
  `app.js` startup and `route()`, and `community.js` to find where the web
  app really takes an address.
- `MoneyFigure`: money with tabular figures, read in words ("4,537,500
  dollars, Contract value"). `compact` only in charts and tight figures.
- `Figure`: a count or a percentage (`format="percent"`), tabular.

## States

Copy is in `stateCopy` (IOS-UX section 4, "States, everywhere").

- `LoadingState`: layout-stable placeholders in the block's final shape
  (`rows`, `people`, `figures`, `text`); no spinner over content already
  shown, no shimmer. (A portrait's own breathing veil is the one exception:
  it marks a photo still on its way, inside the circle it will fill.) `label` is what VoiceOver announces.
- `EmptyState`: says what is absent, in the web's words where it has them.
  Often a block with nothing for this person is better left out.
- `ErrorState`: a plain sentence plus Try again; VoiceOver focus moves to the
  message. One failed block never blanks the screen. For an `ApiError`,
  `errorMessage(error, 'search')` gives the sentence, including the search
  "busy" and "unavailable" wording.
- `OfflineBanner`: cached content stays readable ("Offline. Records saved on
  this iPhone stay readable."); `cached={false}` gives "This record is not
  saved on this iPhone yet. It will load when you are back online."
- `StaleNotice`: "Saved 3 October 2026. It may be out of date.", with
  `refreshing` while a newer copy is checked. Never mix stale and fresh data
  silently.

## Leads

- `LeadCard`: one `/discovery.json` signal (P1). The kicker reads "Lead ·
  [category]". Title, summary, metric labels and every caveat are shown
  verbatim and in full; never shorten, reorder or reword them. Reading order:
  title, each metric as "label, value", the caveats, then the example records.
  Each record (`LeadEvidenceLink`) is one link: amount, payer → payee, detail,
  then the register and its own ID ("AusTender register · record CN3407266"),
  read from the export's label by `leadEvidenceFor`
  (`src/features/leads/model.ts`), which never shows OPAX's local row number.
  With a `testID`, parts carry `-title`, `-metric-N`, `-caveat-N`,
  `-evidence-N` and `-as-at`.

Person rows keep their `-name` testID after layout. RepresentativeRows opts
into `testDrawnName` for journeys 07 and 09, which require the e2e-only
`-drawn-complete-N` diagnostic ID. Other callers, including Search, retain the
stable name ID; production excludes the probe implementation in both cases.

## Navigation chrome (`src/navigation/`)

- Each tab owns a native stack (`src/app/(tabs)/(…)/`): root screens show a
  Merriweather large title sized for the reader's text setting
  (`useStackChrome`), and the Talk and Account and about bar buttons
  (`rootHeaderItems`). Detail routes go in
  `src/app/(tabs)/(today,your-mp,bills,search)/` so they push within the
  current tab; set their title and buttons with `<Stack.Screen options>`
  inside the screen. Back buttons are native.
- `talk.tsx` and `account.tsx` are full-height sheets with a Done button.
  The voice and account lanes replace the placeholder content.
- Sharing: `shareRecord({ path, title, anchor? })` or `shareHeaderItem(…)` for
  the bar. It shares the canonical URL (`canonicalUrl`: no query, no UTM, no
  `/og/*`) with link metadata built on the device by the local
  `modules/opax-share` Swift module, so the share sheet never fetches the
  page or its share image. The origin comes from the build configuration
  (`extra.webOrigin`); e2e builds use `https://opax.invalid` and show the link
  in an alert instead.

### Remaining iPad screens (lane 3)

- Use `column="wide"` on hubs and card collections. `PadGrid` applies `Grid`
  to regular iPad windows and returns the original children on compact;
  `RowList grid` does the same for row collections. `PadReading` keeps prose
  inside a wide report at a readable measure. All three preserve the phone
  view tree. Public-money lists and declarations use `useScreenColumn` and
  `SidebarSafe`; the record reader retains its readable column.
- Cmd-[ goes Back, including a bill reader's pane stack. Cmd-R runs the
  visible screen's Refresh when available and idle. Return opens a focused
  native row. Escape closes notes, machine-written explanations, sources,
  popovers and route sheets, or clears the split selection. The shortcuts
  have UIKit discoverability titles in the Cmd-hold overlay.
- `Hoverable` accepts `onActivate` for native keyboard focus and
  `drag={{ path, title }}` for a copy-only outbound drag. `LinkRow.dragPath`
  and `RecordRow.path` carry a canonical public path. Person rows derive it
  from their explicitly identified portrait slug, or accept `dragPath`.
  Bills and report rows carry their own paths. Unknown identities are never
  guessed from a name. The drag supplies `public.url` plus title and URL as
  plain text; it makes no request and installs no drop target. iPad only.
  Release builds use `opax.com.au`; fixture builds use the reserved
  `opax.invalid` origin so a QA drag cannot point at production.
- Pass a native node handle as `showMenu`'s third argument to anchor a
  popover to its control. Original-record menus and declaration menus do so.
