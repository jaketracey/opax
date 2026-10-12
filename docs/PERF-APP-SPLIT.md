# Splitting app.js by route (plan, not implemented)

Status: proposal from the web-perf-cache lane, 12 October 2026. This should wait
until web-design-system and web-nav-refactor have merged, because both rewrite
renderer markup inside `app.js`.

## Why

`public/app.js` is 792 KB (240 KB br), a classic deferred script. Every app
route parses and runs all of it before `route()` draws anything. In Lighthouse
mobile runs on live opax.com.au (12 Oct), `app.js` cost 230–246 ms of main thread
on the person, bill and search pages (`bootup-time`: 128 ms of script, about 45 ms
parse/compile). It was the largest single script on every app route.

A deep link needs a small part of it. A bill page uses routing, the shared
labels and helpers, and the bill renderer. It doesn't need the campaigner
(85 KB), voting-record (59 KB), reports (45 KB), directory (37 KB), topic (35 KB),
document (32 KB) or ask (31 KB) code.

## Where the bytes are (decoded, by section marker, at 7bdb4951c)

| Section | KB | Belongs to |
|---|---|---|
| campaigners and third parties | 85 | /subject/campaigner, /subject/donor |
| voting record on person pages | 59 | /subject/person |
| reports, plus report money map | 45 + 21 | /reports/* |
| portraits & monograms | 44 | person and people lists (shared) |
| encyclopedia indexes (directories) | 37 | /subject/<kind> lists |
| topic entries | 35 | /subject/topic/* |
| document page, plus empty record | 32 + 18 | /doc/* |
| ask, answer follow-through, chat, question builder, docked assistant | 31 + 30 + 12 + 15 + 6 | /ask, the chat dock |
| active filters, search/workbench | 26 + 9 | /ask?view=search |
| the front page, plus home maps | 23 + 4 | **dead code**: `renderFrontPage()` has no caller (home moved to home.html) |
| wombat (loading companion) | 17 | the loaders (lazy-loadable) |
| connections, discovery, money map glue | 17 + 16 + 16 | /connections, /discover, /money |
| debts, expenses, pay, access | 15 + 10 + 9 + 6 + 7 | person and party pages |
| stats, explore | 13 + 12 | /stats, /explore |
| routing, panels, crumbs, masthead, quick search, labels, helpers | about 50 | **core** |

## Module boundaries

1. **core** (always loaded, about 150–200 KB decoded): helpers, `$`/`esc`/`api`,
   panels and routing (`route`, `showPanel`, `setCrumbs`), the masthead and quick
   search, the labels/source-line glue, boot meta, `donorViewReady` and the
   loaders that several routes share (`loadParliamentarians`, `loadPhotoMap`,
   `loadMoneyData`, `loadBillsIndex`).
2. **route chunks**, one per panel family, each exporting `render(params, ctx)`:
   - `person`: voting record, pay, expenses, access, interests, debts, portraits
   - `party-and-donor`: campaigners, party money, debts
   - `bill`: bill page and bill text glue
   - `directories`: encyclopedia indexes and topics
   - `doc`: document page and empty record
   - `reports`: reports and the report money map
   - `ask`: ask, answer follow-through, chat, question builder, docked assistant
   - `search`: active filters and the workbench
   - `money`: connections, discovery, money-map glue
   - `misc`: stats, explore, about, methods, privacy, support
3. **lazy leaves**, imported on first use: the wombat, citation/export formats,
   the account mirror.

## Loader

- Author the app as ES modules under `portal/app/` and bundle them with esbuild
  (`format: 'esm'`, `splitting: true`, `entryNames`/`chunkNames` with `[hash]`)
  into `public/app/`. The money map already builds `public/chunks/` this way.
  Hashed names get the existing immutable `/chunks/*`-style rule, so the
  route chunks need no `?v=` stamps or `MODULE_STAMPS` edges.
- `index.html` loads one `<script type="module" src="/app/entry-[hash].js">`.
  A `<link rel="modulepreload">` for the entry's route chunk would need the
  Worker to pick it per path. That's an optional second step:
  `serveSeoPage` already knows `route.kind`.
- `route()` keeps its shape. Each branch becomes
  `const view = await routeModule('person'); view.render(segs, params, ctx)`,
  where `routeModule` memoises the `import()`. A navigation that lands while
  a chunk loads keeps the existing `currentSubjectKey`/generation guards.
- Keep the first-render gate (`Promise.allSettled([... donorViewReady])`) and
  start the route chunk's `import()` alongside it, so the chunk download
  overlaps the index fetch.

## Order of work (each step ships on its own)

1. **Delete dead code**: `renderFrontPage` and the home-maps block (about 27 KB).
   No behaviour change; tests that pin those functions go with them.
2. **Module bundle with no split**: move `app.js` into `portal/app/*.js` as one
   module and build it to `public/app.js`. Then repoint the 41 test files that
   read `public/app.js` source text (they regex function bodies) at the source
   modules.
3. **Lazy leaves**: wombat, formats, account mirror, stats/explore.
4. **Route chunks**, largest first: campaigners, person, reports, directories
   and topics, doc, ask/chat.
5. Optional: per-route `modulepreload` from the Worker.

## Expected saving

On a deep link to a bill, search or party page: about 790 KB → about 200 KB
(core) + 30–60 KB (route) decoded, and 240 KB → about 75–90 KB br. Scaling
Lighthouse's `bootup-time` for `app.js` (≈230 ms mobile) by bytes gives
about 70–90 ms, so roughly 150 ms sooner to the first route on a mid-range
phone, plus about 150 KB less on the wire. Person pages save less (their chunk
is the largest, about 150 KB). Repeat visits gain because a release that
touches one route no longer invalidates the whole 240 KB bundle.

## Risks

- `app.js` is one scope today: renderers call each other freely. Moving a
  section out needs its free variables made explicit (`ctx` or core exports).
  esbuild's bundle analysis and `tsc --checkJs` on the modules will show the
  missing imports.
- Analytics: `opax:route` dispatch must stay in core so page views are counted
  once.
- Privacy: every route chunk that names donors must keep using
  `donorRows`/`donorNameWithheld` from `donor-views.js`. That's an import, so the
  donor-privacy tests keep working against the sources.
