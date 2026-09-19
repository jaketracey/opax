# OPAX component language

This is the implemented UI reference as of 19 September 2026. Use it with [control recipes](UI_CONTROLS.md). [UI_COMPONENT_AUDIT.md](UI_COMPONENT_AUDIT.md) is the remaining consolidation backlog, not a claim that every component has migrated.

## Visual foundations

The visual foundation is paper, dark ink, institutional navy and bronze. Reuse the tokens in `portal/public/style.css`; do not introduce near-duplicate feature colours.

| Role | Token / treatment |
| --- | --- |
| Page / raised / subdued surface | `--paper` #FAF9F6 / `--paper-raised` #FFFFFF / `--paper-sunken` #F1EFE8 |
| Primary / secondary text | `--ink` #23271F / `--ink-soft` #575C52 |
| Structure and primary actions | `--navy` #142A43; white foreground |
| Record links and highlights | `--bronze-ink` #8A5A12; `--bronze` #A0761B for rules |
| Rules | `--line` #DFDCD2; `--line-strong` #8D897B |
| Display and section headings | Merriweather, via `--serif` and heading tokens |
| Body, metadata and controls | Public Sans, via `--sans` |
| Party identity | Coloured dot plus readable party label; never colour alone |

Page content, header and footer use `.wrap`: 1440px maximum width and `clamp(1.25rem, 4vw, 4.5rem)` horizontal padding. Feature content may have readable-width constraints inside this container. Do not add a separate homepage outer gutter.

The common spacing scale is `--space-1` through `--space-7` (4, 6, 10, 16, 26, 42 and 67px approximately). Hairline rules separate content groups. Avoid using a card or filled box merely to create a section boundary.

## Choosing a control

| Intent | Component |
| --- | --- |
| Primary action | `.ui-button[data-variant="primary"]` |
| Secondary action / navigation action | `.ui-button` on a native button / anchor |
| Low-emphasis action / destructive action | `data-variant="quiet"` / `data-variant="danger"` |
| Form entry | `.ui-field`, labelled `.ui-input`, optional `.ui-hint` / `.ui-error` |
| One selection among peer values | `.ui-segmented` with `.ui-button[aria-pressed]` |
| Applied filter that can be removed | `.ui-filter-chip`, key/value and a decorative close icon |
| Map category filter | `.ui-filter-chip.ui-map-filter`, colour dot, label and plain count |
| Topic metadata, including a navigable topic | `.ui-tag`; bronze wash and hash marker, no button outline |
| Ordinary navigation or sample question | Text link with a real destination |
| Change between Ask and Search views | Underlined research mode navigation, not a row of pills |

Buttons, fields and complete segmented controls share compact/default/large sizes: 40/48/56px. Compact grows to at least 44px on touch layouts. The default segmented control's **entire outside height** is 48px, including padding and borders. Use minimum heights so text can wrap at zoom. Standard control radius is 4px. Do not reintroduce capsule-shaped chips or oversized close icons.

The sentence-style question builder is a deliberate exception: serif sentence text and underlined inline fields, with its original submit treatment. Its subject selection uses the shared segmented control and retains the labels **a person**, **a party**, **money**, **pay**, **a bill**. On small screens the subject choice becomes a labelled select.

## Navigation and search

The gold Australia mark and pale stars sit beside the white **OPAX** wordmark. `navigation.js` owns destinations for both homepage and app headers. Desktop dropdowns retain the descriptive two-column layout and report pictograms. Main app pages use the compact homepage treatment; Community retains its separate account/discussion navigation.

A search icon opens a small **light** search panel. `.ui-input-wrap` vertically centres its icon. The shared `quick-search.js` owns suggestion keyboard behaviour and disclosure dismissal; data providers stay with the page. Retain direct search, speaker, electorate, topic, party, donor and report suggestions. Focus, Escape, outside click, long names and narrow screens must remain usable.

The homepage is `/`. Research is `/ask`; Search is `/ask?view=search`. Search `mode=keyword|hybrid` is a separate retrieval setting, never the page-view flag. Preserve query, filters, sorting and pagination in links. Older `/search` links redirect to the Search view. Home links leave the application shell to load the homepage document.

## Homepage compositions and copy

The purpose statement and research entry share the opening. On desktop the heading is 40px, the section has 68px vertical padding, and the Ask/Search column has **28px top padding**. At smaller widths these stack using the existing responsive rules.

Use the exact name **Open Parliamentary Accountability Exchange**. The purpose paragraph begins “The Open Parliamentary Accountability Exchange brings together”. Do not style the X separately. Headings have no full stops; avoid em dashes and redundant instructions.

The opening shows a free-text field, four compact sample-question links and a closed **Build a question** disclosure. It has no “Try a question” label or “Answers link to the records…” helper line. Do not restore the full guided builder above the fold.

The money map comes before recent records. Topic and report collections have short descriptions without “All X, A–Z” suffixes. Recent declarations use linked names only. **From the record** accepts different entity/record types, with optional portrait, party, amount, facts, voting history and source link; no topic speech-count blurbs or parliamentarian-only directory action. **Collection & coverage** shows all four numeric summaries. Its secondary links are headed **Other ways to explore**.

Do not add editorial spotlights or manually ranked stories. Recent streams are date-ordered. Record previews use a reproducible daily selection from available source exports, with clear distinctions between political receipts, grant award values and program totals.

## Ownership and release

- `style.css`: foundations, site layout and shared header styling.
- `ui-controls.css`: control appearance, sizes and states. Feature CSS owns placement.
- `home.css`: homepage compositions and responsive layout.
- `home.js`: homepage interactions, forms, map and carousel.
- `home-data.js`: current collection feeds and automatic record selection.
- `quick-search.js`: suggestion interaction and header disclosure.
- `navigation.js`: shared navigation destinations.

The workbench is committed as a contributor reference but **must not be deployed**. `portal/public/.assetsignore` excludes `ui-workbench.*` and the review-only `home-prototype.html`. Shared production styles and scripts remain included. To inspect the workbench locally without Wrangler's deployment exclusions:

```sh
python3 -m http.server 8790 --directory portal/public
# http://localhost:8790/ui-workbench.html
```

Run `node scripts/stamp_assets.mjs`, `npm run check` and `npm test` from the documented directories. Deploy through `npm run deploy` in `portal/`, which rebuilds the search catalog and generated bundles before stamping. Generated search shards are build output; the manifest stays versioned. Verify `/`, both research views, a representative entity page, legacy redirects and a 404 for workbench/prototype URLs after release.
