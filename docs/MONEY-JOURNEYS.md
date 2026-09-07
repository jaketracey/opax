# Guided money map journeys

`/money` offers opt-in 3D journeys. Choose a lens, step manually or start seven-second playback. `/money?journey=public-money&step=0` opens a particular step; `jur=qld`, `vic`, or `tas` selects a jurisdiction. Shared links never start playback automatically.

`portal/public/money-journeys-data.js` derives four lenses from the selected published graph:

- Public awards and party receipts: an actual grantor-to-company edge and that company's party edges. Award and receipt totals remain separate.
- Multiple parties: one eligible company and its largest recorded party connections.
- Industry: up to three companies sharing an industry label, with their largest party links. A common label does not imply coordination.
- Time: equal-length windows calculated from actual `byYear` cells. Only dated receipts in each window contribute; this is not a comparison of spending or influence.

Candidates are deterministic. Broken references, nonfinite values, duplicate endpoint pairs and missing prerequisites are excluded. Jurisdictions without an eligible public-money relationship omit that lens. These are views of the map's selected records, not complete supplier or industry coverage.

`money-journeys.js` owns narratives, manual controls, timers and URL steps. `MoneyMapHandle.presentScene` receives exact node IDs and observed endpoint pairs, sets the time window, resets inflation adjustment to nominal amounts and frames those connections. Unrelated nodes remain as quiet spatial context. The normal map controls return when the journey ends.

`pauseScene` stops the camera in place. Map interaction pauses playback; continuing returns to the current step. Hiding the tab, leaving the map off screen or changing to reduced motion pauses without automatic resumption. Reduced motion disables playback and makes manual scene changes immediate. Timed steps do not steal focus. Route departure destroys listeners and timers; a generation guard rejects late map mounts. Map URL synchronization is limited to `/money` and `/map`, protecting destination filters during teardown.

Validation commands:

- `node --test portal/test/money-journeys*.test.mjs`
- `npm --prefix portal run build:graph`
- `npm --prefix portal run check`

Browser checks cover desktop/mobile layout, lens selection, animation, interruption, year changes and shared URLs. The map and journey module URLs carry release revisions in `app.js`; update them with subsequent module releases. Deploy through `npm run deploy` from `portal/` to refresh stamped assets.
