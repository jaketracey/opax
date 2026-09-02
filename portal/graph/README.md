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
