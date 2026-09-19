# Homepage implementation and design record

Homepage: `/`. The review copy shares `home.css` and `home.js`; it and the UI workbench are excluded from deployment. See [UI_DESIGN_LANGUAGE.md](UI_DESIGN_LANGUAGE.md) for the component contract and local review command. `/ask` is now a dedicated research workspace; `/ask?view=search` opens its Search tab. Legacy `/search` URLs redirect with their query and filters intact. Revised 19 September 2026 after the user's review of the opening.

## Purpose and hierarchy

The opening explains what OPAX stands for and what it connects. Headings have no trailing full stops. On desktop that explanation sits beside one research entry, with Ask and Search modes. The free-form question is the primary entry. Four compact sample-question links sit above the native “Build a question” disclosure. The disclosure retains the established sentence builder, subject labels and special underlined fields. Both panels remain mounted so drafts survive mode changes.

This deliberately replaces the rejected sequence of heading, introduction, mode switch, helper text, subject switch, sentence form, separator, second question form and examples all displayed together. The earlier attempt to restore the original stacked header was also rejected for preserving its complexity.

Major homepage boundaries use `--divider-default` (#B8B4A8); subheading rules, row separators and column rules use `--divider-subtle`. Desktop sections have 48px vertical padding, while the opening retains 68px top padding and has 80px below. Mobile spacing is unchanged. The shared divider roles and standalone rule are demonstrated in the local UI workbench.

Below the opening:

1. The working money map occupies the main column. The adjacent browse directory describes parliamentarian, electorate and party profiles, then groups parliamentary records, funding records and jurisdiction routes. On narrow screens the directory remains fully visible immediately before the map, without an accordion.
2. All 21 topics and all seven reports form a complete subject-browsing section. Both collections are alphabetical. Reports retain descriptions explaining their scope. Topic filtering has a count and empty-state recovery.
3. Recent bills and register declarations are parallel, date-ordered streams. Newly indexed records follow separately, labelled by indexing date rather than event date. Horizontal entries use spacing without individual top rules, and the subsection heading has no extra divider; subtle separators appear only between stacked entries on mobile.
4. From the record uses a mixed card shell for parliamentarians, donors, grants and programs. Speech-topic count blurbs and the parliamentarian-only directory link are removed. The row loads eight parliamentarian previews, a donor and a source-backed grant/program pair through a deterministic daily shuffle. The row has native scrolling and previous/next controls.
5. Collection coverage restores documents, searchable passages, collected speeches and classified donations. Source information accompanies direct access to the Time machine, The tide and record quiz.

The homepage restores the previous Money & words content immediately after Explore by subject as **Spotlight on: Gambling**, at the user’s request. It includes the speech/speaker and donation totals, both yearly charts and their notes, the original top-three speaker and donor rankings, all three suggested questions, and a topic-page link in the heading. `home-spotlight.js` defaults to Gambling and uses an inline, underlined serif heading select to switch among Gambling, Housing and Climate. Each selection loads its report export and updates figures, charts, rankings, questions and destination links together. Reports without donation data show only their parliamentary content and a short coverage note. Questions use compact text links beneath “Ask about [subject]”. A right-aligned “Learn more about [subject]” link in the heading opens the selected subject’s topic page; the bottom report/topic link row is removed. The old daily-rotation caption is omitted because readers choose the topic. There is no editorial ranking of the other homepage collections. The restored encyclopedia previews use the existing automatic daily selection rather than hand-picked profiles. Guided money-map explorations remain available. The map is above recent records, while research remains the primary opening task.

## Comparator synthesis

Both reference homepages were visually inspected in Safari on 19 September 2026:

- [OpenSecrets](https://www.opensecrets.org/): clear political-finance purpose and search entry; task descriptions explain what research routes provide; reporting is distinct from reports/datasets. OPAX adopts the descriptive routes and separation of content types, not its oversized promotional hero, carousel or editorial selection.
- [Our World in Data](https://ourworldindata.org/): a clear purpose/search area, explicit collection types, contextualised visualisations, data explorers and topic browsing. OPAX applies distinct roles for the map, directories and updates, without importing an editorial homepage model.

The criteria are task clarity, predictable destinations, proximity of related content, progressive disclosure and readable density. These are design decisions to review, not claims of measured usability improvement.

## Existing functionality reused

- Navigation uses the application's `OpaxNavigation.sections`, with native disclosure menus.
- `home.js` is a standalone adapter. Its five question shapes, variants, parties and industry vocabulary mirror `app.js`; person and bill suggestions use existing datasets. Production adoption should extract a shared builder rather than maintain copies.
- Question and record-search forms open `/ask?q=...` and `/ask?view=search&q=...`. This prototype does not implement the full application's advanced query options.
- The map coverage note sits immediately below the map, above Filter by industry. Guided exploration remains below the filters without an extra divider. The map reuses `money-map.js` with mini chrome, overview and page-scroll behaviour and `graph/money.json`. All 15 native industry-filter buttons update the embedded map. Reset restores the overview; the full-map URL preserves filters, focus and year window. Failure provides retry and record browsing.
- Controls use `ui-controls.css`. The sentence builder remains the expressly requested exception.

## Content sources and limits

`home-data.js` refreshes bills, declarations, reports and counts from the existing exports and `/api/stats`; newly indexed records come from `/api/recent`. Missing feeds get an unavailable state and collection link rather than an invented zero. The HTML is a source-backed initial fallback; successful requests replace it in the same approved layout.

`From the record` hydrates as it approaches the viewport. Melbourne calendar-day seeded sampling selects eight official-portrait-backed voting profiles, one donor from the published money graph, and one federal grant program with a linked source award when available. Selection is stable for a given day and source pool and independent of source-file ordering. Amount labels distinguish donor disclosures, award values and program aggregates. This replaces the prototype's frozen September sample, without introducing editorial selection. The card shell can support additional record types later.

The homepage retains the shared analytics scripts. The map's native category buttons, suggestions and question forms reuse existing data and routes. `home.css` preserves the accepted 40px desktop heading, 68px section padding, 28px research-column top inset and the shared site gutters.

## Verification

JavaScript syntax, asset stamps, whitespace, unique HTML IDs, label targets and complete report/topic counts pass. The eight existing map overview and scrolling checks pass. Browser review covered desktop opening, expanded builder, map/directory, collections, long bill titles, declarations and draft preservation when switching Ask/Search. Narrow layout checks use browser zoom/reflow rather than a physical mobile device.

The homepage uses the shared `.wrap` gutters. Main app pages use the same compact logo/OPAX navigation treatment. `quick-search.js` shares the suggestion keyboard behaviour and search disclosure between the homepage and app.

Run `node scripts/stamp_assets.mjs` after changing homepage assets. The UI workbench links to the prototype.
