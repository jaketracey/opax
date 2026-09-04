# OPAX money-map and flow-explanation report

## What shipped

### Part 1 — engraved money-map links

Commit `14eb052cdb1f79c6c27fe911746b8d30fecb1f79` replaces the per-link cylinder and cone meshes with one indexed, camera-facing link mesh and one shader material. The result is one draw call for all link lines, with:

- thinner, lower-alpha industry-coloured lines at rest;
- logarithmic width and brightness that keep larger disclosed flows legible without making small flows black;
- stronger selected links and much fainter unrelated links;
- a faint source-to-party dash with a seven-second traversal and deterministic phase offsets;
- a static direction gradient and arrowhead under `prefers-reduced-motion`;
- a 24 fps ceiling for the map's animated render loop; and
- explicit geometry and shader disposal.

The committed `portal/public/money-map.js` was rebuilt from the source with the command documented in `portal/graph/index.ts`. Commit `f219032` adds `PART1-DONE` with the Part 1 commit hash so it can be reviewed or merged independently.

### Part 2 — Explain this flow

Commit `d87dcfc` adds the lazy `portal/graph/explain.ts` module and committed `portal/public/explain.js` bundle. The shared `openExplain(detail)` path now accepts:

- bubbling `opax:explain` events from donor, party, individual-flow and industry-flow cards in the money map;
- “Explain this money” on donor entries;
- “Explain where the money comes from” on party entries; and
- “Explain this flow” in topic money sections.

The modal follows the shared Explore dialog behaviour for close buttons, Escape, backdrop clicks and breadcrumbs. Its five keyboard-accessible steps use the already-loaded or cached jurisdiction graph, access register data and FITS data. The scene uses one point-sprite draw for its moving money marks, responds to the active year, resizes with the dialog, stops under reduced motion, pauses when the document is hidden and disposes every three.js resource on close.

The fourth step makes one deterministic streamed ask only when opened, keeps streamed text when moving between steps, and lists cited records as direct `/doc/<slug>` links with speaker, party and date metadata. The final step repeats the relevant threshold, exclusion, non-causation and state/federal non-summing caveats.

## Verification

The following completed successfully from `portal/` unless shown otherwise:

- `npx wrangler types`
- `npx tsc --noEmit`
- `npx esbuild graph/index.ts --bundle --minify --format=esm --target=es2022 --outfile=public/money-map.js`
- `npx esbuild graph/explain.ts --bundle --minify --format=esm --target=es2022 --outfile=public/explain.js`
- `node --check public/app.js`
- `node --check public/money-map.js`
- `node --check public/explain.js`
- `node graph/smoke-test.mjs` — federal, Queensland, Victoria and Tasmania passed
- `node scripts/stamp_assets.mjs` from the worktree root
- `git diff --check`

Headless Chrome ran with ANGLE/SwiftShader against `wrangler dev`. WebGL was available. At exact 390×844 and 1280×900 viewports the donor, party and money-map-card modal paths had no horizontal overflow, no visible modal control below 44×44px, no failed HTTP response, no console error and no page exception. Reduced-motion emulation held the year and particle scene static at 2025 while leaving the direction arrow visible. A modal link was also verified to close the dialog, navigate in place and leave the correct destination breadcrumb.

Part 1 captures:

- `scratchpad/part1-money-map-links-390.png`
- `scratchpad/part1-money-map-links-1280.png`

Part 2 captures:

- `scratchpad/explain-donor-westpac-390.png`
- `scratchpad/explain-donor-westpac-1280.png`
- `scratchpad/explain-party-liberal-390.png`
- `scratchpad/explain-party-liberal-1280.png`
- `scratchpad/explain-money-map-card-390.png`
- `scratchpad/explain-money-map-card-1280.png`

The topic hook was separately exercised on `/subject/topic/gambling`; it opened the industry explanation with no errors.

## Paid asks

One paid `/api/ask?stream=1` request was made in total. It asked: “What has parliament said about donations from Westpac Banking Corporation to Australian political parties?” The stream completed without retry or synchronous fallback and returned a written answer plus six working `/doc/...` citations.

## Skipped and live checks

Deployment and production checks were intentionally skipped as requested. `CACHE_EPOCH`, `portal/wrangler.jsonc` and knowledge-box configuration were not changed.

On the live site, check the map on one physical low-end phone as well as desktop: the faintest unselected flows should remain discoverable against the actual display, the selected flow should be stronger without turning heavy, and the seven-second drift should read donor → party without looking busy. Also check one complete streamed explanation on mobile for real-network loading, narrative scrolling, direct citation navigation and the five-step keyboard path.

## Commit summary

- `14eb052` — render money flows as animated engraved hairlines.
- `f219032` — record the Part 1 review checkpoint in `PART1-DONE`.
- `d87dcfc` — add grounded, animated money-flow explanations and every requested trigger.
