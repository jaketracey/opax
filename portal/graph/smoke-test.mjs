// Headless smoke test for the built money-map bundle: exercises the pure
// data/layout layer (graph building, cluster centres, the force simulation)
// without a DOM or WebGL. Run from portal/:  node graph/smoke-test.mjs
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const bundle = await import('../public/money-map.js')
const { buildGraph, clusterCentres3D, ForceSim3D, formatMoney, radiusFor } = bundle
assert.ok(typeof bundle.mountMoneyMap === 'function', 'mountMoneyMap exported')

const raw = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url)))
assert.ok(raw.meta.donor_nodes >= 200, 'export holds 200+ donors')
assert.ok(raw.meta.party_nodes >= 10, 'export holds the canonical parties')
assert.equal(raw.nodes.length, raw.meta.donor_nodes + raw.meta.party_nodes)
assert.equal(raw.edges.length, raw.meta.edge_count)

const graph = buildGraph(raw)
assert.equal(graph.nodes.length, raw.nodes.length)
assert.equal(graph.edges.length, raw.edges.length)
const ids = new Set(graph.nodes.map((n) => n.id))
for (const edge of graph.edges) {
  assert.ok(ids.has(edge.source) && ids.has(edge.target), `edge endpoints exist: ${edge.source}`)
}
for (const node of graph.nodes) {
  assert.ok(graph.groupStyles.has(node.group), `group styled: ${node.group}`)
  const r = radiusFor('resources', node.weight)
  assert.ok(r >= 7 && r <= 26, `radius in range for ${node.id}`)
}

// Cluster centres: parties pinned to the origin, industries ringed clear of it.
const counts = new Map()
for (const node of graph.nodes) counts.set(node.group, (counts.get(node.group) ?? 0) + 1)
const ordered = new Map([...counts.entries()].sort((a, b) => b[1] - a[1]))
const centres = clusterCentres3D(ordered, 1.5, 'parties')
const parties = centres.get('parties')
assert.ok(parties && parties.x === 0 && parties.y === 0 && parties.z === 0, 'parties central')
for (const [group, centre] of centres) {
  if (group === 'parties') continue
  const dist = Math.hypot(centre.x, centre.y, centre.z)
  assert.ok(dist > parties.r, `${group} ring sits outside the party blob (${dist.toFixed(0)})`)
}

// The force simulation settles to finite, spread-out positions.
const sim = new ForceSim3D({
  nodes: graph.nodes.map((n) => ({
    id: n.id,
    group: n.group,
    radius: radiusFor('resources', n.weight),
  })),
  links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
  layout: 'grouped',
  centres,
})
sim.tick(300)
let spread = 0
for (const node of sim.nodes) {
  assert.ok(
    Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z),
    `finite position for ${node.id}`,
  )
  spread = Math.max(spread, Math.hypot(node.x, node.y, node.z))
}
assert.ok(spread > 200, `layout spread out (max radius ${spread.toFixed(0)})`)
assert.equal(formatMoney(1_234_567), '$1.2m')
assert.equal(formatMoney(45_600), '$46k')

console.log(
  `smoke test OK — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
    `${centres.size} clusters, layout radius ${spread.toFixed(0)}`,
)

// State files (scripts/export_state_money.py) share the node/edge shape but
// are smaller and carry a jurisdiction block; they must build on the same
// engine and never be merged with the federal file.
for (const jur of ['qld', 'vic']) {
  const state = JSON.parse(
    await readFile(new URL(`../public/graph/money.${jur}.json`, import.meta.url)),
  )
  assert.equal(state.meta.jurisdiction, jur, `${jur}: meta.jurisdiction`)
  for (const key of ['jurisdictionLabel', 'commission', 'sourceShort', 'licence', 'coverage', 'threshold', 'not_summed']) {
    assert.ok(typeof state.meta[key] === 'string' && state.meta[key], `${jur}: meta.${key}`)
  }
  assert.ok(state.meta.donor_nodes >= 50, `${jur}: holds 50+ donors`)
  assert.ok(state.meta.party_nodes >= 3, `${jur}: holds the main parties`)
  assert.equal(state.nodes.length, state.meta.donor_nodes + state.meta.party_nodes)
  assert.equal(state.edges.length, state.meta.edge_count)
  const stateGraph = buildGraph(state)
  const stateIds = new Set(stateGraph.nodes.map((n) => n.id))
  assert.equal(stateIds.size, stateGraph.nodes.length, `${jur}: node ids unique`)
  for (const edge of stateGraph.edges) {
    assert.ok(stateIds.has(edge.source) && stateIds.has(edge.target), `${jur}: edge endpoints exist`)
  }
  for (const node of stateGraph.nodes) {
    assert.ok(stateGraph.groupStyles.has(node.group), `${jur}: group styled: ${node.group}`)
  }
  const stateCounts = new Map()
  for (const node of stateGraph.nodes) stateCounts.set(node.group, (stateCounts.get(node.group) ?? 0) + 1)
  const stateCentres = clusterCentres3D(
    new Map([...stateCounts.entries()].sort((a, b) => b[1] - a[1])), 1.5, 'parties')
  assert.ok(stateCentres.get('parties'), `${jur}: parties central`)
  console.log(
    `smoke test OK, ${jur}: ${stateGraph.nodes.length} nodes, ${stateGraph.edges.length} edges, ` +
      `${stateCentres.size} clusters (${state.meta.sourceShort}, ${state.meta.coverage})`,
  )
}
