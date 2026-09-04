# WORDS, TOPICS and TIME implementation report

## Shipped

1. **Where a debate lives** — `bf7c379`
   - Topic pages now compare the topic's share of each parliament's labelled record, with speech counts and the years held.
   - `/api/topic` adds the topic-by-state facet and matching labelled-record denominators in two catalogue calls.
   - The source note follows the approved AEC/register-style fine-print treatment used by the site.

2. **Date rulers** — `8098f5b`
   - Ask answers place retrieved sources on a 1993–2026 hairline ruler. Sources cited in the answer use full ticks; retrieved-only sources use half ticks; every tick opens its speech.
   - Search responses include a cached-window `years` map. Search pages draw that window as a histogram and allow a year to be applied as a filter.

3. **The arc of a debate** — `f042e2d`
   - Topic pages now retrieve up to the 200 newest matching speeches, then request machine briefs in batches of 24.
   - The chronological spine can be reversed between newest and oldest.
   - Speeches without a brief retain their opening text and are identified as `Passage · no brief yet`.

4. **The tide and the coverage rule** — `2651491`
   - Added cached `/api/tide`, using topic facets and labelled-speech denominators for four decades. Catalogue requests are issued in batches of five.
   - Topic pages show a four-decade strip of the topic's share of labelled speeches.
   - Explore now includes **The tide**, covering all 21 topics with Rising, Fading and Biggest now orderings and Federal/All five scopes.
   - Added the reusable engraved coverage rule below time-based figures that describe labelled coverage so far.

5. **What they talk about** — `7252283`
   - Added cached `/api/person-topics`, using the canonical person name with one topic-facet call for all indexed years and one for each recent era.
   - Person pages show the leading eight topics with All, Then and Now controls, plus a quiet comparison mark for the whole labelled record.
   - The simpler era split from the approved reference was retained: Then is the 2010s and Now is 2020–26.

6. **Search results in brief** — `3838bb9`
   - Search pages offer Passages and Briefs views, remembering the choice for the browser session.
   - Each visible page makes one batched `/api/brief` request. Missing briefs retain the matching passage under the no-brief tag.
   - The owner's automatic search summary remains unchanged.

7. **Remove redundant result meters** — `9b01a51`
   - Removed the per-result relevance percentage bars and their dead tooltip styling while retaining relevance ordering.
   - The former topic-page “Newest in the index” block was already replaced by the chronological arc in proposal 3.

## Skipped

Nothing in the approved seven-proposal scope was skipped. “The same debate, different words” was explicitly left untouched, as requested.

## Data regeneration

No static export or SQLite data was changed, so there is no desktop-host export to regenerate. The two new aggregates are read-only Worker endpoints over the existing ARAG catalogue and use the existing ten-minute JSON cache. `parli.db` was not opened or modified.

## Verification

- `node --check portal/public/app.js`
- `node --check portal/public/tide.js`
- `cd portal && npx tsc --noEmit -p .`
- `node scripts/stamp_assets.mjs --check`
- `git diff --check`
- Mocked local browser pass at desktop and 390 px, covering a topic page, Tide dialog, person profile and era switch, search histogram/Briefs mode, and Ask source ruler. No horizontal overflow or browser console errors were found.

The browser pass used local mock endpoints only. It did not call the paid `/api/ask` service.

## Live visual checks

- Confirm the parliament shares and topic tide on a topic with real, uneven catalogue coverage.
- Open several source ticks on Ask and tap a populated search year to confirm routing and filtering against production URLs.
- Check a long topic arc for scanning rhythm, brief fallbacks, and newest/oldest reversal.
- Open **The tide** on desktop and a 390 px phone; compare all three orderings and both parliament scopes.
- Check a person with a long name and sparse topic history, then switch All/Then/Now.
- Toggle Passages/Briefs on the final search page, where fewer than 20 results may be present.
- Reconfirm every money/interest source line elsewhere is visually unchanged.

## Delivery boundaries

No deployment was performed. `CACHE_EPOCH`, knowledge-box configuration and enrichment tasks were not touched.
