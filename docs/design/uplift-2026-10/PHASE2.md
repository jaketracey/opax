# Web uplift, Phase 2: what was built

Lane `web/design-system`, 12 Oct 2026. Phase 1 (the census, the ranking, the proposal and the mocks) is in [PROPOSAL.md](PROPOSAL.md) and [TOKENS-PROPOSAL.md](TOKENS-PROPOSAL.md); the how-to every lane follows is [MIGRATION.md](MIGRATION.md).

## The foundation

| Commit | What |
|---|---|
| Tokens | The approved scale as `web` overrides in `docs/design/design-tokens.json`; the app's generated tokens do not move. Space roles on a 4/8 scale (row 12, heading 16, block 24, group 32, section 48 / 64 at 701px / 80 at 1101px; the generator learns the 1101px step). Type on six sizes plus the title (heading 24, subheading 17 with the record, display 32 at 600, title 32–48). Web primitives for component internals: `--sp-2…80`, `--text-13…32`, `--weight-*`, `--leading-*`, `--ring-*`. The deprecated names alias the scale. The row hairline lightens one step. |
| Codemod | 2,592 declarations in `style.css`, `ui-controls.css`, `ui-source.css` and `voice.css` moved onto the tokens, skipping the rules other lanes own (masthead, nav, drawer, breadcrumbs, footer, page actions, the map overlay). |
| Ratchet | `test/design-tokens.test.mjs`: per file, the share of hard-coded declarations may only go down; the deprecated-name and raw-type counts likewise. Classifier in `test/helpers/css-census.mjs`. |
| Dead code | The old in-app front page never rendered (`renderFrontPage()` had no caller; `/` is `home.html`): its markup (87 lines of `index.html`), renderers (496 lines of `app.js`) and 197 CSS rules (490 declarations) are gone, with every rule whose selectors name nothing any renderer, module, bundle or test draws. |
| Components | The shared set (MIGRATION.md has the table): page head, section and section head, on-this-page, card and plate, list and row, byline, stats, bar and legend, key/value, empty, skeleton, status line, dot label; controls: filter bar, tabs, disclosure, link button, actions; a row's own source link. Charts, figure tiles, the side column and the empty state lost their boxes by default. Text fields are 12px. |

## Routes migrated by this lane

| Group | Routes | What changed |
|---|---|---|
| Topics | `/subject/topic/<slug>`, `/subject/topic` | Ask as one field and the navy pill; every block a section with one rule; the side column a column, not a card; ranked rows on the 4px track, stacked on phones; Newest/Oldest, the index sort and the person era switch as segmented controls (no bronze fills); links, not buttons, for "Read the speech" and the jump; machine-written briefs in sans; one CSS layer instead of two. |
| Entries | `/subject/donor/<name>`, `/subject/party/<name>`, `/subject/person/<name>` | One source line on a donor (the second, word-for-word line merged into the head's sheet); "On this page" lists every donor block; the balance chart without a rule at every election; 44px portraits and the record role for register text; inline source links keep their line height. |
| Index pages | `/subject/donor`, `/subject/person`, `/subject/electorate` (and every other directory), `/bills`, `/declared`, `/instruments`, `/audit` | One filter bar: the search field, pill selects that name themselves, toggle chips; the first record on the first screen at 390px; the withheld-donor aggregates under the count (still shown); an industry is a dot label, not a party label. |

## Ratchet

Hard-coded share of each owned stylesheet (spacing, type, colour, radius, shadow, motion, rules), before the uplift and now:

| File | Before | Now |
|---|---:|---:|
| `style.css` | 54%* | RATCHET_STYLE |
| `ui-controls.css` | | RATCHET_CONTROLS |
| `ui-source.css` | | RATCHET_SOURCE |
| `voice.css` | | RATCHET_VOICE |

\* The four files together: 2,424 of 4,524 declarations (Phase 1 census). Deprecated token names: 640 → DEPRECATED_NOW. Raw type values (repo-wide counter): 799 → RAWTYPE_NOW.
