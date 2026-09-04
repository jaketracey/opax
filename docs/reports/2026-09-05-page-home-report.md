# Home page — three improvement loops

Completed on `page-home`, entirely in `/Users/jake/Projects/opax/.claude/worktrees/page-home`. Nothing was deployed.

## Delivered

**Loop 1 — rhythm and maps.** Serif section titles; consistent 2.5rem section gaps; wrapping suggested-question controls; readable state coverage and donation chips; a 320px phone money plate with a proportional 48px opening button. Improved the existing state popover and money-card close target without changing either graph module.

**Loop 2 — content.** News stories now keep headline, source/age and a single record-search chip together. Six show initially, with the rest behind More/Fewer. Explicit housing/tobacco terms now outrank incidental party names in the home-only topic mapping. Six declarations have date running heads, crisp portraits, full-width phone quotes and separate source links. Six report promos have short descriptions, a horizontal phone strip and a desktop grid, and load independently of the daily feature's statistics.

**Loop 3 — polish and access.** The declaration caveat remains visible, with full provenance in a native disclosure. Larger money-card rows and annotations, wrapping party names, 44px controls, scoped focus treatment, clearer report-strip continuation and reduced-motion overrides. Review caught and corrected doubled spacing, small targets, awkward source wrapping, misleading pivots and a report description that wrapped on desktop. Detailed critiques are in `LOOP1.md`, `LOOP2.md` and `LOOP3.md`.

## Verification

- Passed `node --check portal/public/app.js` and `git diff --check` in each loop and after corrections.
- Captured and visually reviewed all page sections at 360×780, 390×844, 430×932 and 1280×900, including expanded news, state popover, selected money card and its bottom actions, open provenance, report-strip end and keyboard focus.
- Used a static server of this worktree's `portal/public`, live read-only API responses, and Chromium headless with ANGLE/SwiftShader. The proxy blocks all `/api/ask` requests and `nocache`; there were no paid generation calls.
- At every requested width: no page horizontal overflow; news expands 6 → 12 → 6; six reports and six declarations remain; four date heads for the current data; six loaded 200px portraits displayed at 48px with alt attributes; selected money card contained by its grown host; no undersized controls in the scoped target audit after fixes.
- Reduced-motion map screenshots taken 700ms apart are pixel-identical at all four widths. Normal-motion map captures were checked separately. Keyboard focus brings the last report fully into view.
- No Worker endpoint changed, so Worker type-checking was not applicable. The original CSS is unchanged before the single appended `page-home` banner. No changes to `CACHE_EPOCH`, knowledge-box configuration, graph sources/bundles, other named modules, or static data.

Evidence is in `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`, named `page-home-loop<N>-<what>-<width>.png`. Correction captures include `loop2-fixed`, `loop3-fixed-*` and `loop3-reports-final-focus-*`. Initial invalid installed-Chrome loop-1 captures were discarded and replaced with the headless-shell run. Existing untracked log files and the node_modules link were left alone.

## Boundaries and remaining limitations

- The shared suggested-question renderer truncates labels beyond 60 characters. Its implementation was outside the permitted functions; the home styling now wraps and sizes the resulting buttons correctly.
- The miniature money map can still have crowded labels in some orientations. Layout belongs to the excluded graph engine; readable industry chips and the full-map link remain available.
- Long money cards scroll internally. All content is reachable, but the close button stays at the top of the card, so closing from its bottom requires scrolling back up.
- No generated-answer journey or physical-device browser was exercised. The implemented news pivots use free retrieval, and no answer generation was required for this task.

## Check on a real phone

1. Scroll with Safari/Chrome browser bars expanded and collapsed; inspect the map-to-news handoff and the grown money card's internal scroll.
2. Swipe the report and industry rows both ways, then check keyboard/VoiceOver focus and the last report tile.
3. Expand and collapse news and declaration sources; check focus and the position where reading resumes.
4. Check portraits and long quotes at DPR 2–3 and with larger text. Turn Reduce Motion on mid-session and confirm the map stops drifting.
5. Read the state caption and open several state popovers; confirm their links and counts remain clear.
