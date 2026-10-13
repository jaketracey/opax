# Web uplift, Phase 1: route ranking, merged components and mocks

Lane `web/design-system`, 12 Oct 2026. **Checkpoint:** analysis and mocks only; nothing here changes what ships. The token census and the proposed scale are in [TOKENS-PROPOSAL.md](TOKENS-PROPOSAL.md). The mock stylesheets are in [mock/](mock/).

## Summary

- **The tokens exist; most of the CSS doesn't use them.** In the four stylesheets this lane owns, 54% of the declarations are hard-coded, and only 33% sit on the current scale once the 617 uses of deprecated names are counted. Colour is done (pass 4G). Spacing (65% hard-coded), type (78%), radius (72%), motion (86%) and rules (74%) are not.
- **The biggest gaps are the pages no pass has reached:** the topic page, the donor page and the directories with their filter stacks. The top screens from passes 3E and 3F (home, person, bill, ask) rank near the bottom.
- **Proposal:**
  - a 4/8 spacing scale whose section step grows to 48 / 64 / 80;
  - six type sizes plus the title;
  - shape-by-role (D1) enforced on the 14 radii drawn today;
  - one rule per section;
  - three durations.
  - All of these are web overrides, so the app's tokens don't move.
- **Merged component set:** about 25 shared components. Allowing for overlap between the three family audits, they replace roughly 4,000 of the web's 11,528 declarations; about 700 of those never apply today.
- **Mocks:** the three largest-gap routes, before and after at 390, 820 and 1440. Each is a CSS-only overlay of the proposed tokens and components over today's markup:
  - type sizes drawn fall from 12 to 8 (topic), 11 to 9 (donor) and 7 to 5 (directory);
  - text off the role sizes falls from 59 to 7 (topic) and 170 to 4 (directory);
  - the donor map no longer hides its own year control.

## 1. How the routes were ranked

Each of 39 routes was shot full-page and first-screen at 390, 820 and 1440 against the local Worker on this branch (`main` at 7bdb4951c). The topic routes replay their live `/api` reads, recorded once with read-only GETs, because a local Worker has no D1 or ARAG. The gap score combines three measures:

- **What styles the page (45%):** Chrome's CSS rule-usage coverage at 390 and 1440. This is the share of declarations in the rules that actually match the page that are hard-coded or use a deprecated name, with the masthead and footer subtracted (34 declarations every page shares).
- **What it draws (20%):**
  - distinct type sizes beyond six;
  - spacing values off the 4px grid;
  - radii outside 4 / 12 / pill / round;
  - elements with a rule, per 1,000px.
- **What the shots show (35%):** a 0–3 visual score with a one-line reason, below.

| # | Route | Gap score | Off-system share of the CSS that styles it | Type sizes drawn | Off-grid spacing values | What the shots show |
|---:|---|---:|---:|---:|---:|---|
| 1 | topic (`/subject/topic/gambling`) | 85 | 84% | 12 | 11 | Never went through the design passes. Three bronze-filled buttons (Ask, Newest/Oldest, Show 30 more), a boxed list, a boxed sidebar, a 4px textarea beside a square button, 9,000px of speech cards. |
| 2 | donor (`/subject/donor/<organisation>`) | 70 | 61% | 11 | 10 | Six section dialects; map chip overlaps a clipped label; the same source line twice under an orphan link; a one-item 'On this page' rail; tiny balance bars across 900px. |
| 3 | dir-donors (`/subject/donor`) | 64 | 56% | 7 | 10 | At 390, four 'Donors not named' disclosure lines, then six selects and two checkboxes before the first donor. |
| 4 | topics (`/subject/topic`) | 60 | 69% | 9 | 8 | A good ledger. A square black-filled segmented control (D1 says a pill track); a 19px serif lede off the role sizes. |
| 5 | money (`/money`) | 56 | 31% | 5 | 7 | No visible title (the H1 is visually hidden); tabs clipped at 390; five control shapes in one toolbar; a boxed key and a boxed slider; the map squeezed into the lower third at 390 and two-thirds width at 1440. |
| 6 | declared (`/declared`) | 54 | 63% | 7 | 9 | A labelled form above the feed; Previous/Next pills; fine at desktop. |
| 7 | dir-people (`/subject/person`) | 53 | 59% | 7 | 10 | At 390, a search box, four selects and two checkboxes before the first person. |
| 8 | connections (`/connections`) | 52 | 50% | 3 | 3 | Money hub tab: tabs clipped at 390, no title. |
| 9 | report (`/reports/housing`) | 51 | 61% | 15 | 10 | Long machine-written essay; reads well. |
| 10 | dir-electorates (`/subject/electorate`) | 51 | 44% | 5 | 7 | At 390, five selects and a checkbox before the first electorate. |
| 11 | bills (`/bills`) | 49 | 51% | 6 | 9 | At 390, four full-width selects and a checkbox before the first bill. |
| 12 | receipts (`/money/receipts`) | 49 | 27% | 5 | 7 | No title; filters in a boxed panel; selects at 4px beside pills; dense table with its own header style. |
| 13 | grants (`/money/grants`) | 48 | 26% | 6 | 7 | No title; four figure sizes in the stat strip; chart labels clipped at 390; three segmented-control styles in one row. |
| 14 | search (`/ask?view=search&q=housing%20affordability`) | 48 | 63% | 7 | 9 | Pass 3F landed (local search shows its unavailable state). |
| 15 | expenses (`/expenses`) | 48 | 59% | 7 | 4 | A kicker above the title; a long serif lede; reference text in mixed sizes. |
| 16 | person (`/subject/person/<person>`) | 47 | 56% | 9 | 10 | Pass 3F landed. Pay and expense tables draw a hairline per row; dense below the fold. |
| 17 | bill (`/bill/au-federal-r7520`) | 47 | 60% | 9 | 9 | Pass 3F landed; reads well. |
| 18 | party (`/subject/party/labor`) | 44 | 52% | 8 | 10 | On the block system. At 390 the ⋯ wraps onto a row of its own; a boxed map card above the first section. |
| 19 | division (`/doc/division-federal-senate-10701`) | 43 | 55% | 7 | 8 | Bills listed as serif underlined links under the title; otherwise on the system. |
| 20 | agency (`/subject/agency/a-03eafa685fa589f6a081`) | 43 | 52% | 7 | 10 | Figures and the 3D map; on the system. |
| 21 | supplier (`/subject/supplier/s-7beabf1d435fa3f04dbd`) | 42 | 53% | 7 | 10 | Figures and ranked bars on the system. |
| 22 | privacy (`/privacy`) | 42 | 59% | 7 | 8 | A kicker above the title; a serif lede at a non-role size. |
| 23 | stats (`/stats`) | 41 | 43% | 5 | 9 | A kicker above the figures; "…" placeholders and Live labels when the live index is unavailable; figure sizes vary. |
| 24 | electorate (`/subject/electorate/federal-representatives-nsw-grayndler`) | 40 | 34% | 7 | 7 | Desktop unbalanced: a lone ⋯ under the meta line, an empty column beside the representation; an older left-rule history list; a bulleted Related list. |
| 25 | audit (`/audit`) | 40 | 19% | 5 | 8 | Same filter stack as instruments; a summary line of raw counts. |
| 26 | ask (`/ask`) | 39 | 63% | 2 | 7 | Pass 3F landed. |
| 27 | support (`/support`) | 39 | 52% | 7 | 7 | A kicker above the title; a serif lede at a non-role size. |
| 28 | instruments (`/instruments`) | 38 | 18% | 5 | 8 | At 390 the whole first screen is five native selects (unstyled chevrons, a different field style from Bills); a Filter pill and a Reset link. |
| 29 | explore (`/explore`) | 29 | 29% | 4 | 5 | Its own card dialect: centred text, icon circles, link-style actions. |
| 30 | home (`/`) | 27 | 29% | 7 | 7 | Pass 3E landed. A 4px field beside the pill button; report cards have their own padding. |
| 31 | methods (`/methods`) | 26 | 41% | 4 | 6 | Long prose; on the system. |
| 32 | vic-election (`/vic-election-2026`) | 24 | 7% | 5 | 6 | Bronze-wash pills as in-page links (heavier than the label rules allow); an orphan count line; a long single-column link list. |
| 33 | sitting (`/sitting`) | 23 | 11% | 4 | 6 | On the system; at 1440 a narrow column with status labels pushed to the far right. |
| 34 | reports (`/reports`) | 22 | 27% | 4 | 6 | Cards with icon tiles; consistent. |
| 35 | about (`/about`) | 22 | 31% | 5 | 4 | Long prose; on the system. |
| 36 | community (`/community`) | 22 | 8% | 7 | 4 | Tabs above the title; on the system. |
| 37 | audit-report (`/audit/qao-2025-26-16`) | 21 | 13% | 5 | 7 | A bulleted entities list; tags fine. |
| 38 | estimates (`/estimates/2026-10`) | 20 | 8% | 6 | 6 | On the system; group headings repeat the 'On this page' list. |
| 39 | instrument (`/instrument/F2023L00298`) | 14 | 9% | 4 | 7 | Short and on the system. |

**Where the money hub sits.** The money hub (`/money`, `/money/receipts`, `/money/grants`, `/connections`) scores 3 or 2.5 on sight: no visible title, a tab row clipped at 390, five control shapes in one toolbar, and a boxed key and slider. It still ranks 5th, 8th, 12th and 13th, because its own CSS is fairly tokenised (26–31% off-system). Its tab row is drawn by `navigation.js` (nav lane), and the map is WebGL. It is the next target after the directories, and it needs the nav lane for the area tabs.

## 2. Merged component set

The three family audits (cards, rows and heads; labels, buttons, filters and sheets; sources, tables, states and figures) map every class in the web stylesheets onto the components below. Full reports with file:line evidence are in the lane's private folder (see the report). "New" means no shared class exists today.

| Family | Canonical component | Absorbs | ≈ declarations |
|---|---|---|---:|
| Structure | `ui-page-head` + `ui-page-meta` (new) | about 50 head classes: `subject-head`, `doc-head`, `bill-head`, `hero-intro`, `dir-head`, `reports-head`, … (7 title-font overrides never apply) | 110 |
| | `ui-section` + `ui-section-head` + one section title (new; renamed from home's `hp-*`, which is already on tokens) | 12 section containers (3 copies of the accent mark), 13 head wrappers, `subject-section-title`'s 19 overrides in 5 sizes | 190 |
| | `ui-lede`, `ui-toc` (new) | 22 lede/note classes; 13 "On this page" rails | 115 |
| | `ui-card` (radius 12, raised, hairline, no shadow) and `ui-plate` (map frames) | 16 card classes, 5 plates; boxed defaults inverted on `.chart`, `.ui-toolbar`, `.empty-state`, `.tile`, `.infobox` | 185 |
| Rows | `ui-list` + `ui-row` (three densities) with `ui-row-title/-meta/-text/-figure` | 26 list containers with about 15 row paddings; row titles in 13 faces | 300 |
| | `ui-byline` (44 portrait, name, party label, place · date) | 31 classes across 11 families; 7 portrait sizes | 170 |
| | `ui-option` (selectable row) | 7 patterns | 60 |
| Actions | `ui-button` (existing), `ui-icon-button`, `ui-link` (new), `ui-actions` (new) | 15 off-system buttons (incl. the topic page's bronze fills), 9 state overrides, 8 text buttons, 24 action rows | 400 |
| | Suggested questions: one link list | drawn four ways today | 110 |
| Controls | `ui-input` / `ui-field` (existing) | 13 field patterns at radius 2, 3 and 6; raw SSR filters on instruments and audit | 150 |
| | **`ui-filter-bar`** (new: search field, compact pill selects, toggle chips, applied filter chips) | the filter stacks on Bills, directories, Declared, Instruments, Audit, receipts and grants | in the rows above |
| | `ui-segmented` (existing, fixed), `ui-tabs` (new), `ui-range` (new), **`ui-disclosure`** (new) | 6 segmented patterns, 3 tab styles, 37 hand-drawn `<details>` chevrons | 385 |
| Overlays | `ui-pop` + `ui-sheet` (existing), `ui-dialog` (renamed `.game-dialog`) | 9 floating surfaces with raw radii and shadows | 210 |
| Labels | the five labels (existing) + `ui-count`, `ui-label` text roles (new) | 16 retired-alias uses in `app.js`, about 20 count classes, 15 label-text classes | 125 |
| Provenance | `ui-source` (existing) + `ui-source-link` (new), one `.fineprint` | 28 legacy provenance blocks; 9 per-row source links; fine print drawn at 6 sizes from 12 to 15px | 285 |
| Data | `ui-stat`, `ui-bar`, `ui-legend`, `ui-spark`, `ui-ruler`, `ui-split`, `ui-kv` (new) | 29 figure classes (13 looks, 16–35px); about 25 bar tracks (3–15px, 8 radii); 13 key-value lists | 630 |
| | One table look: the DataTable's (`.dt` + a static `ui-table`) | 11 visible table looks | 210 |
| States | `ui-empty`, `ui-skeleton`, `ui-status-line`, one loader slot and one spinner (new) | 29 empty/error classes, 15 skeletons, 12 status lines, 3 spinners | 270 |
| Dead | delete | the old home modules (`renderFrontPage()`, `app.js:9518`, has no caller; ≈370 declarations, `index.html:425-512`, `app.js:9187-9604`) and about 110 unused selectors | ≈700 |

**Fixes to the existing shared components:**

- `ui-segmented` segments draw 34–38px; on touch they need 44.
- `ui-button` and `ui-segmented` should also key on `aria-selected` and `aria-expanded`, which removes five overrides.
- `ui-toolbar` draws a box that all 8 uses strip off, so it should be unboxed by default.
- `ui-sheet`, `ui-more` and the chips still carry raw padding and type.
- The global focus ring (2px, offset 2) disagrees with ui-* (offset 3), and 14 scoped rules restate it.

## 3. The mocks

**How they are built:** one overlay stylesheet per route, injected after the page's own CSS over today's markup ([mock/tokens.css](mock/tokens.css) plus [topic.css](mock/topic.css), [donor.css](mock/donor.css) or [directory.css](mock/directory.css)). It shows what tokens and shared components alone achieve. Phase 2 also needs renderer changes, listed per route.

### Topic (`/subject/topic/<slug>`)

**Changes:**
- Ask is one 48px field (radius 12) plus a navy pill, replacing a 4px textarea beside a square bronze button.
- No box around the party column or the donor list; each section takes one top rule and the section step.
- Newest/Oldest is the sunken pill segmented control, no longer bronze.
- "Show 30 more" and "Explain this flow" become secondary pills (the explainer's markup is untouched).
- Speech passages use the record role; machine-written briefs are set in sans (principle 7).
- Every row keeps a 44px hit area.

**Renderer work for Phase 2:**
- The page has no source line at all (21 topic pages); it needs a `ui-source`.
- Give the Ask row and toggles `ui-*` classes.
- Delete `style.css` lines 2992–3153.

### Donor (`/subject/donor/<organisation>`)

**Changes:**
- **Fixed:** the "Donors not named" chip covered the year scrubber on every donor map. Both were absolutely positioned at bottom-left, so the year range and inflation control were hidden.
- "Their supplier records" is a link under the map, not a ruled section, and the second copy of the head's source line goes.
- The balance chart drops its rule at every election and its 10px labels.
- Display figures use the display role.
- Register rows use the 44 portrait and the row rhythm.
- A one-entry "On this page" rail is hidden on phones.

**Renderer work for Phase 2:**
- Fix the chip's inline position in `graph/index.ts` (a bundle rebuild).
- Merge the two source sheets.
- List every donor section in the rail.

### Donors directory (`/subject/donor`; the same bar serves Bills, Parliamentarians, Electorates, Declared, Instruments and Audit)

**Changes:**
- The filter bar is the search field, then each filter as a compact pill select and each toggle as a chip. At 390 that is about 200px, replacing 408px of full-width selects.
- Pills size to the chosen option (`field-sizing: content`); without support they keep today's one-per-row layout.
- The four withheld-donor aggregates move under the count line as compact rows; they stay visible.
- Rows use the type roles, with figures inline on phones.

**Renderer work for Phase 2:**
- Add a `ui-filter-bar` wrapper.
- The industry is drawn with the party-label class (`.party.party-oth`); it should be a plain word.

### Numbers (rendered, from the shots)

| route · width | type sizes drawn | type styles (size/weight/face) | text off the role sizes | off-grid spacing values (top 14) | elements with a rule | targets under 44px | page height |
|---|---|---|---|---|---|---|---|
| topic · 390 | 12 → 8 | 18 → 13 | 59 → 7 | 10 → 7 | 91 → 80 | 60 → 47 | 11460 → 12513 |
| topic · 820 | 12 → 8 | 18 → 13 | 59 → 7 | 11 → 8 | 91 → 80 | 62 → 49 | 10089 → 10785 |
| topic · 1440 | 12 → 8 | 17 → 13 | 59 → 8 | 11 → 8 | 91 → 80 | 62 → 49 | 8985 → 9747 |
| donor · 390 | 10 → 7 | 18 → 13 | 63 → 22 | 10 → 9 | 113 → 89 | 144 → 144 | 8529 → 9041 |
| donor · 820 | 11 → 10 | 22 → 17 | 66 → 26 | 10 → 9 | 124 → 100 | 161 → 161 | 8314 → 8534 |
| donor · 1440 | 11 → 9 | 21 → 16 | 50 → 10 | 10 → 9 | 127 → 104 | 154 → 153 | 7769 → 8104 |
| dir-donors · 390 | 7 → 5 | 10 → 7 | 170 → 4 | 9 → 7 | 126 → 126 | 78 → 78 | 12620 → 10828 |
| dir-donors · 820 | 7 → 5 | 10 → 7 | 170 → 4 | 10 → 8 | 126 → 126 | 85 → 77 | 6628 → 7206 |
| dir-donors · 1440 | 7 → 6 | 10 → 8 | 170 → 5 | 10 → 8 | 126 → 126 | 90 → 90 | 5671 → 5791 |

**Notes on the numbers:**
- "Text off the role sizes" measures against today's roles, so the new 24 and 32 count against the "after" column; it is an upper bound.
- On the directory at 1440, targets under 44px stay level at 90: the pill selects draw at the compact 40, which the tokens allow on a fine pointer and raise to 44 on touch.
- Record pages grow 3–9%: that is the extra air.
- The directory at 390 is 14% shorter.

## 4. Phase 2 (after Jake's OK)

**Order:**
1. Delete the dead code.
2. Write the tokens into `design-tokens.json` as web overrides, and point the deprecated names at the scale.
3. Build the shared components into the files this lane owns.
4. Migrate routes in gap order: topic and topics, donor, the directories and index filter bar, then the money hub (with the nav lane for the area tabs), Declared, reports and the rest.

**Rules for Phase 2:**
- `nav.css` and the header markup stay untouched.
- **Ratchet:** `test/design-tokens.test.mjs` gains per-file counters for raw spacing, radius, shadow, motion and rule values, using this census's classifier, beside the existing hex, type and deprecated-name counters. Each counter may only go down.
