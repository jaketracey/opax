# Guided money map journeys

`/money` offers opt-in 3D journeys. Choose a lens and then a subject from its alphabetical dropdown; no subject is preselected. Step manually or start seven-second playback. `/money?journey=public-money&step=0` opens the recipient picker; adding `focus` preserves the selected subject and `step` in shared links; `jur=qld`, `vic`, or `tas` selects a jurisdiction. Shared links never start playback automatically.

`portal/public/money-journeys-data.js` derives four lenses from the selected published graph:

- Public awards and party receipts: an actual grantor-to-company edge and that company's party edges. Award and receipt totals remain separate.
- Multiple parties: one eligible company and its largest recorded party connections.
- Industry: up to three companies sharing an industry label, with their largest party links. A common label does not imply coordination.
- Time: equal-length windows calculated from actual `byYear` cells. Only dated receipts in each window contribute; this is not a comparison of spending or influence.

Dropdowns offer eligible recipients, organisations or industries from the current graph. Public-money choices represent aggregate contract or grant recipients, not individual contract notices. Changing a choice pauses playback and restarts at step one; opening the searchable picker also pauses playback. Pickers use short names, with Contracts or Grants badges only when needed to distinguish the same recipient. Industry names use title case. Search filters locally; arrows, Enter and Escape support keyboard selection and dismissal. Invalid selections return to the neutral picker. Candidates are deterministic. Broken references, nonfinite values, duplicate endpoint pairs and missing prerequisites are excluded. Jurisdictions without an eligible public-money relationship omit that lens. These are views of the map's selected records, not complete supplier or industry coverage.

`money-journeys.js` owns narratives, manual controls, timers and URL steps. `MoneyMapHandle.presentScene` receives exact node IDs and observed endpoint pairs, sets the time window, resets inflation adjustment to nominal amounts and frames those connections. Guided steps ease directly from the current camera pose over 1.2 seconds, without the opening reveal close-up. The multiple-party comparison shows a bar and amount for every displayed party edge. Unrelated nodes remain as quiet spatial context. The normal map controls return when the journey ends.

`pauseScene` stops the camera in place. Map interaction pauses playback; continuing returns to the current step. Hiding the tab, leaving the map off screen or changing to reduced motion pauses without automatic resumption. Reduced motion disables playback and makes manual scene changes immediate. Timed steps do not steal focus. Route departure destroys listeners and timers; a generation guard rejects late map mounts. Map URL synchronization is limited to `/money` and `/map`, protecting destination filters during teardown.

Validation commands:

- `node --test portal/test/money-journeys*.test.mjs`
- `npm --prefix portal run build:graph`
- `npm --prefix portal run check`

Browser checks cover desktop/mobile layout, lens selection, animation, interruption, year changes and shared URLs. The map and journey module URLs carry release revisions in `app.js`; update them with subsequent module releases. Deploy through `npm run deploy` from `portal/` to refresh stamped assets.

## Generated stories

Selecting a subject requests `/api/journey-story` with only the jurisdiction, lens and focus ID. The Worker rebuilds the journey from its own published graph assets and supplies scene-specific facts, exact amounts, displayed-link shares and dated windows to the existing knowledge-box `openai-compatible` model. This uses the same `@preset/opax` DeepSeek V4 Flash configuration as main requests (verified as `deepseek/deepseek-v4-flash-0731`). No client-supplied amounts or prose enter the prompt.

One request writes the whole sequence; the model only supplies titles and body text. Graph scenes, amounts, links and charts remain deterministic. Output must have the expected step count, valid evidence IDs for each scene, bounded plain text and numbers present in the supplied context. These checks constrain output but do not independently prove every qualitative interpretation. A rejected draft gets one repair attempt with the same model. Failures keep the factual guide and show an unavailable status. Requests use the existing follow-up rate limiter; valid stories cache for seven days with keys covering the evidence and prompt version. Selecting another subject or leaving the journey aborts the browser request, and late responses cannot replace the current subject's story. A small AI-written label distinguishes generated text from the record.
