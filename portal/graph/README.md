# Money Map — 3D donations graph

A 3D force-graph of Australian political donations (AEC returns 1998–2026):
the top 250 donors by lifetime total, ringed by industry around the parties
they gave to. Ported from corpuskit's knowledge-map 3D engine
(`apps/web/src/components/map3d-engine.ts` + `lib/force3d.ts`), with the React
shell replaced by a vanilla adapter.

## Files

| file | role |
| --- | --- |
| `index.ts` | Entry: `mountMoneyMap(container, dataUrl, opts)` + the vanilla adapter (legend/filter, info card, zoom, insets, Escape) |
| `map3d-engine.ts` | The ported engine: three.js scene, camera, orbit/pan/pinch gestures, DOM label overlay, selection dimming, fog, reduced motion |
| `force3d.ts` | Dependency-free 3D force simulation (d3-force semantics, one more axis); extended with a `centralGroup` so the parties sit at the origin |
| `map-types.ts` | The types/helpers the engine needs (extracted from corpuskit's `KnowledgeMap.tsx`; the 2D map was not ported) |
| `palette.ts` | Self-contained industry palette (replaces the tenant `--rp-cat-*` CSS tokens the source engine resolved at runtime) |
| `words.ts` | The words layer: `/api/matrix` (lazy, cached, silent on failure) joined to donor industries; "In parliament" / "What they talk about" card blocks and the bronze halo toggle |
| `smoke-test.mjs` | Node test: imports the built bundle, builds the graph from `money.json`, runs the force sim headlessly |

## Rebuild the bundle

From `portal/`:

```sh
npx esbuild graph/index.ts --bundle --minify --format=esm \
  --target=es2022 --outfile=public/money-map.js
```

The bundle (`public/money-map.js`, three.js included, ~563 KB / ~146 KB gz) is
committed as a static asset — there is no runtime build step. Load it lazily:

```js
const { mountMoneyMap } = await import('/money-map.js')
const handle = await mountMoneyMap(
  document.getElementById('map'),   // any block container; becomes position:relative
  '/graph/money.json',
  {
    // all optional:
    askUrl: (industry) => `#/ask?q=${encodeURIComponent(`What has parliament said about ${industry}?`)}`,
    onSelect: (node) => { /* node: MoneyNode | null — USER selections only */ },
    focus: 'party:Labor',     // mount already-selected, camera on the node (silent)
    chrome: 'mini',           // 'full' (default) | 'mini' = bare scene + cards
  },
)
// handle.select('party:Labor') — programmatic selection (does NOT fire onSelect)
// handle.destroy() — full teardown (WebGL context, listeners, DOM)
```

Embed notes for subject pages:
- `onSelect` fires only for user-initiated selections (click, Enter, find box,
  card rows); the `focus` seed, `handle.select` and filter-driven clears are
  silent by contract.
- `chrome: 'mini'` drops the legend, find box, time scrub, zoom buttons and
  hint; the info/flow cards, gestures and keyboard access remain.
- Card triggers route via `#/ask?q=`, `#/search?q=[&from=&to=]` and
  `#/subject/{donor|party}/{label}`; on a non-SPA page (map.html) the same
  routes are emitted with a leading `/`.
- Interactions in full chrome: click a node (info card), click a flow line
  (edge card with a year-scoped search trigger), find-in-map (prefix-fuzzy),
  and a year-range scrub that filters flows by [firstYear, lastYear] overlap
  without moving the camera.
- Test bed: `/map.html?focus=party:Labor&chrome=mini`.

## Semantic zoom

Each industry cluster folds into a single hub mark when the camera is too far
out to tell its donors apart, and unfolds again on the way in
(`map3d-engine.ts`, "Semantic zoom"):

- The rule is per cluster and in screen pixels: a cluster whose spread would
  draw narrower than `COLLAPSE_PX` (68) folds; a folded one unfolds past
  `EXPAND_PX` (86). The gap is the hysteresis, so a wheel notch at the
  boundary never flickers. The decision uses the camera's GOAL distance, so
  the fold starts as the wheel turns rather than after the dolly catches up.
  The same rule gives the 740x380 front-page embed an all-hubs view and the
  full page a mixed one at its fitted distance (the seven largest clusters
  open, measured at 73 to 93px on a 1440px window; the embed's largest draws
  at 63px); the smallest clusters fold first as the reader zooms out, and a
  smaller window folds more.
- A hub is one sphere in the cluster's hue, radius from the donor count
  (`hubRadius`), a hairline ring in the cluster's ink, and the cluster's
  caption ("UNIONS · 49") moved onto it. Its flows to each party are summed
  into one tube per party (`MapEdge.hub` marks them; `source` is
  `hub:<group>`, `count` is the donor count). Party nodes never fold.
- The fold is a 420ms cubic in-out tween (`LOD_MS`): dots drift to the
  centroid, thin and fade as the hub grows in; unfolding is the reverse.
  Reduced motion snaps. A rebuild (scrub, filter) carries fold state over.
- Clicking (or pressing Enter on) a hub flies the camera to frame the cluster
  (`diveInto`, 560ms) and unfolds it; the dive holds the cluster open until
  the reader zooms or fits again. Clicking empty space with nothing selected
  while zoomed in fits the whole map, and the clusters refold on the way.
  Hovering a hub shows its name, total, donor and party counts. Hubs never
  reach `onSelect`; only real nodes do.
- A cluster holding the selection, or a selected flow's endpoints, never
  folds.

Labels never overlap: captions claim space first (largest cluster first,
above the mark, else below, then each again shifted sideways to stay inside
the plate, else the name without its count, else hidden - the plate edge is
hard, a caption is never drawn cut off), then the emphasised few, then the
rest by size within a zoom-dependent budget, each new name fading in. Widths
are measured (`measureLabels`) with the labels' computed fonts, so a host
that restyles them stays collision-free. With a focus, only the
neighbourhood is named.

The fit (`fitDistance`) accounts for the captions in pixels (closed form, so
a caption at the ring's edge has room inside the plate) and frames the
scene's balance point rather than its centroid: a first pass measures each
side's binding quantity (extent plus tan times depth), the second re-solves
about the point that equalises them, so both sides of the plate bind. The
idle motion is a slow sway of +-0.22 rad about the landing azimuth
(`IDLE_SWAY`, 48s per swing) rather than an endless spin: the ring is an
ellipse up to 3.4:1, and a full turn would walk clusters off the plate or
need a fit two to four times further out. The sway re-fits the view every
frame it moves (a few percent over a swing), so the framing stays tight;
once the reader holds the view, the sway stops and fits are to the current
orientation. The adapter measures the chrome (`chromeInsets`: legend, find
box, zoom buttons, scrub, hint; a bottom or top panel already inside a side
strip, like the scrub under the legend, adds nothing) plus the open card
into `Insets` (now with `top`), so the fitted scene sits in the unobstructed
area and is refitted on resize while the view is not owned.

## The words layer

`words.ts` puts the words beside the money. `INDUSTRY_TOPIC` mirrors the
pairing in `public/wordsdollars.js` (money.json donor `industry` → enrichment
topic slug); industries with no honest debate counterpart (individuals, other,
legal, retail, tobacco, …) show nothing. `/api/matrix` is fetched once, lazily,
on the first selection; a failure resolves to null and the map behaves exactly
as before (retried no sooner than a minute later).

- Donor card, "In parliament": the industry's topic, its labelled-so-far
  total, one hairline bronze bar per major party (row-normalised over the
  topic's filtered total, never a facet sum); rows link to the party × topic
  search, the topic name to `#/subject/topic/{slug}`.
- Party card, "What they talk about": top 5 topics by share among the topics
  that map to the industries funding the party, each with the dollars that
  industry gave the party. Parties folded into the matrix's "Other" column
  show nothing rather than a wrong number.
- "words halo" chip (full chrome only, default off): party nodes gain a bronze
  ring and the industry's flows lean to bronze, both scaled relative to the
  leading party's share of the debate for the selected donor or flow, or for
  the isolated legend cluster; nothing selected means no rings. The engine
  exposes this as `setWordsOverlay({ rings, edgeTint } | null)` and knows only
  intensities. Rings ease with the engine's fades, so reduced motion makes
  them instant.

## Checks

```sh
npx tsc --noEmit -p graph/tsconfig.json   # types
node graph/smoke-test.mjs                 # data + layout, headless
```

## Regenerate the data

`public/graph/money.json` is exported from parli.db (see
`../../scripts/export_money_graph.py` for the methodology and exclusion
rules — public funding, internal party transfers etc.):

```sh
ssh desktop python3 - < ../scripts/export_money_graph.py > public/graph/money.json
```

State commission files share the shape and load through the same
`mountMoneyMap(container, dataUrl)`; the portal switches between them
(`#/money?jur=qld`, `/map.html?jur=vic`) and never merges them with the federal
file (AEC returns already include state branch receipts). Their `meta` block
adds `jurisdiction`, `commission`, `sourceShort` (shown in the hint in place of
"AEC returns"), `licence`, `coverage`, `threshold`, `not_summed`:

```sh
ssh desktop python3 - qld < ../scripts/export_state_money.py > public/graph/money.qld.json
ssh desktop python3 - vic < ../scripts/export_state_money.py > public/graph/money.vic.json
```

Western Australia is loaded in parli.db but not shipped (WAEC Crown copyright,
no open licence); the script refuses `wa` without `--gated`. The smoke test
checks the state files too (shape, unique ids, meta fields, cluster build).
