# Web uplift, Phase 2: what was built

Lane `web/design-system`, 12–13 Oct 2026. Phase 1 (the census, the ranking, the proposal and the mocks) is in [PROPOSAL.md](PROPOSAL.md) and [TOKENS-PROPOSAL.md](TOKENS-PROPOSAL.md). [MIGRATION.md](MIGRATION.md) is the how-to every lane follows. The branch head's SHA is in the lane report (`web-design-system.last.md`).

Not pushed, merged or deployed. The branch has `origin/main` merged in up to `fd33720e9`, which includes the money-map overlay removal.

## The foundation

| Commit | What |
|---|---|
| `6f689361b` tokens | The approved scale as `web` overrides in `docs/design/design-tokens.json`; the app's generated tokens do not move. Space roles sit on a 4/8 scale: row 12, heading 16, block 24, group 32, and section 48, then 64 from 701px and 80 from 1101px (the generator learns the 1101px step). Type uses six sizes plus the title: heading 24, subheading 17 to match the record, display 32 at 600, and the title from 32 to 48. Radii are set by role. Three durations. Web primitives for component internals: `--sp-2…80`, `--text-13…32`, `--weight-*`, `--leading-*` (with `--leading-none` since `42702214e`) and `--ring-*`. The deprecated names alias the scale. The row hairline is one step lighter. |
| `ecd95b3e1` codemod | 2,592 declarations in `style.css`, `ui-controls.css`, `ui-source.css` and `voice.css` moved onto the tokens. Rules other lanes own were skipped: masthead, nav, drawer, breadcrumbs, footer, page actions and the map overlay. |
| `6c6711cc8` ratchet | `test/design-tokens.test.mjs`: per file, the share of hard-coded declarations may only go down, and so may the deprecated-name and raw-type counts. The classifier is in `test/helpers/css-census.mjs`. |
| `d96c6c339`, `349f0889e` dead code | The old in-app front page never rendered: `renderFrontPage()` had no caller, and `/` is `home.html`. Its markup (87 lines of `index.html`), its renderers (496 lines of `app.js`) and the `statemap.js` stamp entry are gone. So are 197 rules (490 declarations) whose selectors name nothing any renderer, module, bundle or test draws. The route lanes then deleted the rules their components replaced. A fresh scan finds no owned class or id that nothing draws, apart from names built at runtime (`party-<code>`, the voice turn roles) and the drawer's (nav lane). |
| `5e602dddd`, `007aebbd1` components | The shared set (MIGRATION.md has the table): page head; section and section head; on-this-page; card and plate; list and row; byline; stats; bar and legend; key/value (with a phone stack variant); empty; skeleton; status line; dot label; table (`.ui-table`, from the money lane). Controls: filter bar, segmented, tabs, disclosure, link button, actions, and a row's own source link. Charts, figure tiles, the side column and the empty state lost their boxes by default. Text fields are 12px. |
| `c6933af0b` follow-ups | One page-head rule for h1 or h2 titles, and a filter bar directly under any page head opens on the head's step. `ui-kv[data-stack="phone"]`. The tide's switches moved to `ui-segmented`, so `quiet-toggle` is drawn nowhere and its CSS is gone. |

## Routes migrated

In gap order. Four lanes worked from this branch: this one, and three helpers on `web/design-system-rest`, `-money` and `-pages`, each merged back here. Before and after shots exist for every route below.

| Group | Routes | What changed |
|---|---|---|
| Topic (`4ac1f6ed0`) | `/subject/topic/<slug>`, `/subject/topic` | Ask is one field with the navy pill. Every block is a section with one rule. The side column is a column, not a card. Ranked rows sit on the 4px track and stack on phones. Newest/Oldest, the index sort and the person era switch are segmented controls (no bronze fills). "Read the speech" and the jump are links, not buttons. Machine-written briefs are in the sans. One CSS layer instead of two. |
| Donor and entries (`4949336dd`, `53ebbe90e`) | `/subject/donor/<name>`, `/subject/party/<name>`, `/subject/person/<name>` | A donor has one source line: the second, word-for-word line merged into the head's sheet. "On this page" lists every donor block. The balance chart no longer draws a rule at every election. Portraits are 44px, and register text uses the record role. Bill rows on a person's record open as the shared disclosure. |
| Directories and filter stacks (`2900cb2cc`) | `/subject/donor`, `/subject/person`, `/subject/electorate` and every other directory; `/bills`, `/declared`, `/instruments`, `/audit` | One filter bar: the search field, pill selects that name themselves ("Party: all"), and toggle chips. The first record is on the first screen at 390px. The withheld-donor aggregates sit under the count and are still shown. An industry is a dot label, not a party label. The SSR forms for instruments and audit use the same classes. |
| Topics index | `/subject/topic` | The same sort control and rows as the topic page. |
| Declared | `/declared` | The filter bar, with "Category: all" and "Party: all". |
| Money hub content (`0b6e5fa7f`, `638f04a85`) | `/money`, journeys, `/connections` | A visible page head under the tab row (the nav lane's tab row is untouched). One row of compact pills. The map sits in the shared plate. The list uses the shared table. Journeys are option rows with a ui-stat figure. Connections uses the filter bar, list rows and an unboxed open column. |
| Receipts and grants (`ead260b3f`) | `/money/receipts`, `/money/grants` | **Visible titles** ("Political receipts", "Government grants") with one meta line. Every filter is on the bar (the "Change filters" sheet and the Filters popover are gone). One segmented view control, and the block's actions at the row end. Figures are ui-stats, tables use `.ui-table`, and both pages carry the shared source line. |
| Report (`ff4999d73`) | `/reports`, `/reports/<slug>` | The index is a page head over a card grid. A report's head is the page head plus the machine label. Parts are sections. Figures are stats, sources are bylines, and every fold is a disclosure. Machine prose is in the sans and retrieved passages in the serif. |
| Expenses, stats and reference pages (`a8baf8979`) | `/expenses`, `/stats`, `/privacy`, `/support`, `/about`, `/methods` | **No kicker above any title**, so each page opens with one page head. `/expenses` has a real h1 with a meta line, and `/stats` has a visible title. Each h2 opens a section with one rule. A live figure still loading holds a still skeleton. |
| Electorate (`60f160b76`) | `/subject/electorate/<slug>` | A page head with ⋯ on the title's row (the menu itself is untouched). Representation and boundary sit side by side. Members and history are byline lists with 44px portraits. The census is a stat plus a key/value list. |
| The rest (`d4b925436`, `8d73977db`, `1178d45b3`, `de0f55885`, `6d770cd6b`, `baa1f9470`) | `/bill/<id>`, `/doc/division-…`, `/ask`, `/ask?view=search`, `/` (tokens only), `/sitting`, `/estimates/<month>`, `/vic-election-2026`, `/subject/supplier/<id>`, `/subject/agency/<id>`, `/explore` (and the tide), `/community` (tabs), `/audit/<report>`, `/instrument/<id>` | Page heads, sections with category accents, list rows, bars with one legend, disclosures, tabs for page modes, and stats. The search pager is compact buttons. Sheets and popovers take the sheet radius and the one overlay shadow. `home.css`, `community.css`, `hubs.css`, `grants.js` and `ledger.js` have no raw type values left. |

Not migrated, left to other lanes or for later:
- `/money/explain` (explainer lane): once it merges, its sections can take the shared components.
- The header, nav, drawer, footer and breadcrumbs (nav lane): their rules hold the last 5 deprecated names and most of `style.css`'s remaining literals.
- The page-actions menu.
- The docked assistant panel and `voice.css`: tokens only.
- The explore tools' insides (time machine, quiz, then-vs-now, words-per-dollar, matrix) and the ballot tool: raw type remains in their own files.

## Ratchet

Hard-coded share of each owned stylesheet (spacing, type, colour, radius, shadow, motion, rules), at the Phase 1 commit `9d589da78` and now. The same classifier was used for both, and `style.css` is measured without its generated token region.

| File | Before | Now |
|---|---:|---:|
| `style.css` | 54.3% (2,289 of 4,214) | 4.6% (159 of 3,475) |
| `ui-controls.css` | 29.2% (40 of 137) | 3.2% (6 of 188) |
| `ui-source.css` | 16.9% (10 of 59) | 6.5% (4 of 62) |
| `voice.css` | 74.6% (85 of 114) | 3.5% (4 of 113) |
| the four together | 53.6% (2,424 of 4,524) | 4.5% (173 of 3,838) |

- **Deprecated token names:** 617 → 5 (counted with the uplift's deprecated list at both commits). The 5 left are in the drawer and footer rules the nav lane owns, and their aliases stay.
- **Raw type values:** the test's counter went from 799 → 76 repo-wide, and in `style.css` from 652 → 18.
- **Declarations in the four files:** 9,833 → 8,593.

Of the `style.css` literals left, 90 sit in other lanes' rules. Most of the rest are em-relative nudges inside text (citation marks, the ask builder's slots), loop animations and percentage skeleton geometry.

## Coordination

- **Nav lane:** the role tokens changed value as approved. Space: row 10→12, heading 12→16, block 16→24, group 24→32, section 36/56→48/64/80. Type: heading 22→24, subheading 18→17, display 34/700→32/600, title clamp 30–44→32–48 at 1.15. The hairline (`--divider-subtle`, `--line`) went #DFDCD2→#E7E4DD. Wherever `nav.css` reads a role it will shift when it rebases. The masthead, nav, drawer, crumb and footer rules in `style.css` are as they were. The one exception is the money hub's `.area-nav`: it lost its `.entry-modes` half when Ask/Search moved to `ui-tabs`, and its current-tab underline is now `var(--border-focus)`, still 2px. A page head is a `div`, never a `header`, because the masthead owns the bare `header` rule.
- **Page-actions lane:** `.page-actions`, `.entry-actions` and `.ui-more` were untouched. The electorate head places ⋯ on the title row through layout only.
- **Explainer lane:** the shared components are ready for `/money/explain`. Its full-width primary button should be the navy `ui-button` pill.
- **Money-map overlay lane:** merged from main with no conflict in the owned CSS. No overlay rules remain.
- `statemap.js` is no longer stamped: nothing imports it.
- `test/daily-encyclopedia.test.mjs` was removed with the dead front page it tested.
- `test/seo-render.test.mjs` now allows the hub's section class on its h2.

## Shots

All shots are in `portal/private/web-design-system/` (private, not committed):

- `before-live/`: live opax.com.au, read-only GETs, at 390, 820 and 1440. Each route has a full page (`<route>-<width>.png`) and a first screen (`-first.png`).
- `after/`: the branch on a local Worker, replaying the recorded live API responses in `fixtures/live`, with the same names.
- `compare/`: before | after pairs, first screen at 1:1 and the full page scaled (`<route>-<width>-first.png`, `-full.png`).
- `after/audit/` and `before-live/audit/`: a DOM audit per shot.

Across the 122 shots (41 routes × 3 widths) that have a live counterpart:
- No horizontal overflow, before or after.
- Text drawn below 13px fell from 1,590 elements to 21.
- Distinct type sizes, summed per shot, fell from 815 to 648.
- No uppercase or letter-spaced text.

Known differences that come from the local Worker, not the branch:
- The report's words-per-dollar block shows its failure state because `/api/matrix` answers 502 locally (it answers live).
- Search shows "Document search is temporarily unavailable", as live did at the time of the before shots.
