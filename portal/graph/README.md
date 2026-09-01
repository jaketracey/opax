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
    // optional:
    askUrl: (industry) => `/?ask=${encodeURIComponent(`What has parliament said about ${industry}?`)}`,
    onSelect: (node) => { /* node: MoneyNode | null */ },
  },
)
// handle.select('party:Labor') — drive the selection from outside
// handle.destroy() — full teardown (WebGL context, listeners, DOM)
```

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
