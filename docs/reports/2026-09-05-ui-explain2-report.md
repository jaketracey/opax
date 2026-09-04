# Explain this flow — three-loop report

## Outcome

The five-step `FlowScene` is now an evidence-bearing money diagram rather than a sparse arc. It keeps the existing narrative structure, paper/bronze engraving register, industry and party accents, one continuous camera, restrained motion, a 30 fps narrow-screen cap, reduced-motion end states, and explicit resource disposal.

## Loop 1 — receipts and time

- Built the giver view: a hatched source medallion, a year-clock receipt cloud, weighted recipient rings and a party-route view made from ranked donor-industry medallions.
- Built the 1998–2025 run: amount-proportional travelling points, an accumulating annual histogram, federal-election ticks and labels, peak-year annotation, and a low-rate end-state drift.
- Fixed the first capture's clipped Westpac cloud and small-party label knot.

## Loop 2 — destinations, record and limits

- Split the route into share-width destination ribbons with batched arrowheads, destination rings and a receiver gauge showing the represented share of party receipts.
- Added the 1993–2026 parliamentary timeline and streamed citation cards, including party-coloured edges and source-list hover/focus highlighting.
- Added the dimmed limitations plate: a taller hatched unreported band, disclosure-floor label, and a faint crossed state/federal arc.
- Fixed the first capture's compressed gauge copy and directionless ribbons.

## Loop 3 — polish and performance

- Reworked ring-heavy views into instanced rings and batched hatch/arc geometry, preserving the scene's density with only a handful of draw calls.
- Preserved receipt granularity more faithfully: one point per disclosed receipt, positioned by year and log-sized from each donor→party→year cell's average amount. Undated receipts sit inside the medallion because they cannot truthfully occupy the year clock.
- Added exact citation-date placement and six collision-aware lanes, one-line/top-seven label rules, quieter limitation hatching, slower particle travel, a smaller/dimmed phone year key, horizontal-overflow guards and stable mobile re-framing.
- Fixed the final capture's sticky-stage heading loss and the remaining seed-cloud edge contact.

## Final critique

The stage now says the shape of the evidence before the prose supplies the figures: individual receipt density, temporal lumpiness, destination share, dated record correspondence, and the disclosure floor are distinct visual states. The Westpac and Liberal routes also prove that the grammar reverses correctly for a donor and a party.

The remaining compromises are honest ones. Only seven small destinations can be labelled on a phone; the public graph contains receipt counts and dollars at edge/year granularity rather than individual receipt amounts, so receipt size uses the cell average; dense minor ribbons converge at the receiver; full citation titles remain in the narrative rather than colliding on the stage; and the unreported band's height is explicitly rhetorical, not a guessed quantity. No remaining issue from the final capture blocks the scene.

## Verification and evidence

- Rebuilt `portal/public/explain.js` from `portal/graph/explain.ts`.
- Passed `npx tsc --noEmit -p .`.
- Passed a direct TypeScript check of `graph/explain.ts` with DOM/ES2022 libraries.
- Passed `node --check portal/public/explain.js` and `git diff --check`.
- Confirmed `portal/wrangler.jsonc` has no diff; `CACHE_EPOCH` was not touched.
- Captured all five steps on both the Westpac donor page and Liberal party page at 390×844 and 1280×900 in every loop: 60 standard WebGL screenshots in `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`, using the requested `explain2-loop<N>-<page>-step<K>-<width>.png` names.
- The final 20-capture run reported no console errors, request failures, shell overflow or viewport overflow.
- Verified five additional 390×844 reduced-motion screenshots as pixel-stable end states; the year sequence resolves immediately to 2025.

## Paid asks

Zero. The screenshot harness intercepted `/api/ask` and returned a deterministic local streamed answer. No request reached the paid endpoint.

## Check by eye on a real phone

- Scroll through all five steps in portrait and landscape, especially the sticky-stage handoff and the bottom controls on a short viewport.
- Watch the full seven-second year run once: confirm the pace feels deliberate, peak-year traffic is distinct, and the terminal low-rate drift is calm.
- Check the densest Westpac receipt cloud and Liberal seven-ribbon landing on a device with a narrow physical screen and normal font scaling.
- Let step 4 use one real answer and verify real citation counts, same-year clustering, link focus, and touch scrolling; the automated run intentionally used local citations and spent no ask.
- Enable the operating system's Reduce Motion setting and confirm each step appears immediately as the same informative end state.
- On a lower-end phone, watch for thermal stutter despite the 30 fps cap and instanced/batched geometry.
