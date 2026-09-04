# Search page — three improvement loops

Implemented on `page-search` in this worktree. Not deployed.

## Delivered

1. **Loop 1 — phone filters and controls** (`95fdb53`): a modal bottom sheet with scrolling fields, pinned Reset/Apply, transactional drafts, cancellation and removable active-filter chips. Larger controls and a phone pager/results bar that fit. Fixed fast-summary fold measurement.
2. **Loop 2 — results and retrieval content** (`c87acdd`): serif titles and reading text, quiet speaker/party/parliament/date metadata, topic links, hairline separators, expandable passage previews and clear brief fallbacks. A labelled histogram with readable scale and safe year-band targets. Shorter phone counts and useful empty-state exits.
3. **Loop 3 — polish and accessibility** (commit titled `loop 3: polish search rhythm reflow and accessibility`): full-width phone query, tighter summary spacing, reversible disclosures, native exact-year selects, focus containment/restoration, history and stale-state repairs, visible errors, reduced motion and 200% text reflow.

Each loop has its own critique in `LOOP1.md`, `LOOP2.md` and `LOOP3.md`; the worst findings were corrected before committing.

## Small endpoint change

`portal/src/index.ts` adds optional `topics` to `/api/search` results. It deduplicates topic classifications from resource user metadata and computed field classifications already present in `show: basic`. It makes no additional retrieval requests. Search-only cache schema keys change so new payloads can include labels; global `CACHE_EPOCH`, answer caches and knowledge-box configuration are untouched. The client remains compatible with older results lacking labels.

## Evidence and limits

- Captured and visually reviewed 360×780, 390×844, 430×932 and 1280×900, including the filter sheet, results, year chart, pager, passages/briefs and disclosures. Requested queries were exercised at 390px: housing affordability, Westpac, hospitality filtered to 1998–2006, and zero results.
- Captures: 33 in loop 1, 40 in loop 2, 49 in loop 3. The final loop includes selected-year, short-sheet, 200% text and retrieval-error states.
- `node --check portal/public/app.js`, `git diff --check`, and `cd portal && npx tsc --noEmit -p .` pass. Missing ignored Worker declarations were generated using dummy environment values; no real secrets or configuration were changed.
- Browser checks pass for modal drafting/focus/Escape, Apply, history, pagination, disclosures, resize, year-band selection, empty-state recovery and first search. The four-size matrix has no horizontal page overflow or JavaScript errors. The 390px target audit passes 44×44px. Short-screen and 200% text checks pass.
- A mocked Worker test verifies topic union/deduplication, missing classifications, preserved party metadata and exactly one `/find` call.
- Static assets were served directly from this worktree at `http://127.0.0.1:18769`. Retrieval used free live API reads cached locally. Every `/api/ask` request was intercepted with an explicitly identified local summary layout fixture; no paid generation or `nocache` request occurred. This verifies summary layout, not generated-answer quality.
- The deployed search payload does not yet include the new labels. Capture tooling joins real labels from the free resource endpoint for visual QA; the Worker transformation is checked separately. These captures do not demonstrate a deployed endpoint.
- Existing CSS was preserved byte for byte and all overrides appended under one Search banner. HTML changes stay inside `#panel-search`; JavaScript changes stay in the permitted Search functions/handlers and adjacent helpers. No deployment, graph, shared configuration, static data or unrelated page edits. Pre-existing untracked logs and `portal/node_modules` were left alone.

Artifacts and reproduction harnesses are in:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

Screenshots follow `page-search-loop<N>-<state>-<width>.png`. Harnesses are `page-search-capture.cjs`, `page-search-interactions.cjs`, `page-search-stress.cjs` and `page-search-worker-check.cjs`. They use the local Playwright/Chrome installation and local API cache; start the static server above before running browser checks.

## Deliberate tradeoffs and real-phone checks

- Annual histogram bars are grouped into seven labelled year-band tap targets to preserve 44px width. Choose precise individual years with From year/To year in the sheet.
- Official long titles and source metadata can wrap; reading text and controls retain their size. No invented shortened titles or additional nested cards.
- On iOS Safari and Android Chrome, check native year pickers, opening the speaker keyboard, scrolling fields while Apply stays visible, bottom safe-area padding, chip removal and returning from a source page.
- Check VoiceOver/TalkBack announcements and focus order, device text enlargement, and reduced-motion settings. Desktop headless Chrome checks cannot establish native mobile behaviour.
