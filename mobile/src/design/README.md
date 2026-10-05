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

## Rules that apply everywhere

- **Colour through roles only.** Use `colors.<role>` from `tokens.ts`, never a
  hex value in a screen. Roles resolve Increase Contrast natively (faint steps
  to soft, soft to ink, subtle rules to default). A dark palette is added in
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
  full size when the text size, width or text (nested text included) changes.
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

- `Button`: `variant`: `primary` (navy; one per view), `default` (outlined),
  `quiet`, `danger` (destructive). `size`: `compact` 44, `default` 48,
  `large` 56 (minimum heights; text wraps, word-safe). `loading` keeps the
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
  "Remove the kind filter, Declared interests". 4pt radius, not a capsule.
- `SegmentedControl`: one choice among peers. 48pt outside height; every
  segment is a real 44 by 44pt target (the selected highlight is inset 3pt
  inside it), labels wrap, and segments stack at accessibility sizes. Each
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
  trailing `action` (an "All bills" link). No cards for boundaries.
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

- `PersonRow`: portrait, name, party, place, optional detail and chevron. A
  `party` must come with `partyStatus` (the type enforces it). One VoiceOver
  element: "Anthony Albanese, Labor, Member for Grayndler · NSW". Pass
  `onPress` only for roster parliamentarians with a native page.
- `Portrait`: **always the blank circle for now**, never initials. The
  harness allow-list has no portrait path, and `<Image>` with a remote URI
  would be transport outside the API client. **Profiles lane:** add the
  portrait map (`/photos/people.json`) and a reviewed image route to
  `src/api/policy.ts` with tests, fetch bytes through the client into the
  cache, and pass a local file URI to a new `Portrait` prop; show the credit
  ("Official portrait", CC BY-NC-ND for APH) on the profile, hide the image
  from VoiceOver when the name is beside it (otherwise "Official portrait of
  [name]"), and keep `accessibilityIgnoresInvertColors`. The rights review
  (IOS-APP.md decision 13) decides whether APH portraits can be cached.

## The record

Citation props are named `citation`, never `source`: `source` is reserved for
image sources, which the transport gate checks.

- `AsAtLine`: under every data block: "As at 17 September 2026 · Source:
  Remuneration Tribunal; Parliamentary Handbook". `asOf` and `citation` (the
  source names; one string or several), with optional `licence`, `detail` and
  `savedAt` (a stale copy adds "Saved [date]"). Use the source
  file's own date (`meta.as_of`, `generated_at`). The votes variant takes the
  W12 `_meta` from `votes.json` plus the record's `jurisdiction`: "Record last
  changed 3 October 2026 · Divisions through 25 September 2026"; with no
  `_meta` it says "Record date not published" rather than borrowing a date.
- `SourceLink`: the original record or register, opened in
  `SFSafariViewController`. `citation` names who holds it ("They Vote For
  You"). `kind="record"` for a stable page for this record;
  `kind="register"` for a register's home or search page, with the ID in
  `record` ("AusTender register · record CN3407266"). E2E builds show the
  destination in a scrollable local view instead of opening a browser.
- `OpaxWebLink`: a web-only OPAX page (community, the money map, Methods),
  opened in Safari with the "Opens on opax.com.au" cue. `canonicalUrl` checks
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
  shown, no shimmer. `label` is what VoiceOver announces.
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
