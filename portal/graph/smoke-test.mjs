// Headless smoke test for the built money-map bundle: exercises the pure
// data/layout layer (graph building, cluster centres, the force simulation)
// without a DOM or WebGL. Run from portal/:  node graph/smoke-test.mjs
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const bundle = await import('../public/money-map.js')
const {
  buildGraph,
  clusterCentres3D,
  CPI_FINANCIAL_YEAR_INDEX,
  cpiMultiplier,
  ForceSim3D,
  formatMoney,
  radiusFor,
  windowFigures,
} = bundle
assert.ok(typeof bundle.mountMoneyMap === 'function', 'mountMoneyMap exported')

const raw = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url)))
assert.ok(raw.meta.donor_nodes >= 200, 'export holds 200+ donors')
assert.ok(raw.meta.party_nodes >= 10, 'export holds the canonical parties')
assert.equal(raw.nodes.length, raw.meta.donor_nodes + raw.meta.party_nodes + (raw.meta.grantor_nodes ?? 0))
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

// Per-year cells (scripts/export_money_graph.py byYear): every node and flow
// re-sums to its lifetime figures, the span is the cells' extent, and the
// window re-sum the scrub runs picks out exactly the years asked for.
const checkCells = (items, label) => {
  for (const x of items) {
    const id = x.id ?? `${x.source}->${x.target}`
    assert.ok(x.byYear && typeof x.byYear === 'object', `${label}: byYear on ${id}`)
    const years = Object.keys(x.byYear).map(Number)
    let dollars = x.undated?.[0] ?? 0
    let count = x.undated?.[1] ?? 0
    for (const [d, c] of Object.values(x.byYear)) {
      dollars += d
      count += c
    }
    assert.equal(count, x.count, `${label}: cells count ${id}`)
    assert.ok(Math.abs(dollars - x.total) <= years.length + 1, `${label}: cells sum ${id}`)
    if (years.length) {
      assert.equal(Math.min(...years), x.firstYear, `${label}: firstYear ${id}`)
      assert.equal(Math.max(...years), x.lastYear, `${label}: lastYear ${id}`)
    }
  }
}
checkCells(raw.nodes, 'money')
checkCells(raw.edges, 'money')
{
  const flow = raw.edges.find((e) => Object.keys(e.byYear).length > 2 && !e.undated)
  const years = Object.keys(flow.byYear).map(Number).sort((a, b) => a - b)
  const year = years[1]
  const one = windowFigures(flow, year, year)
  assert.deepEqual(
    [one.total, one.count, one.firstYear, one.lastYear],
    [...flow.byYear[year], year, year],
    'one-year window keeps that year',
  )
  const adjusted = windowFigures(flow, year, year, true)
  assert.equal(adjusted.count, one.count, 'CPI adjustment leaves disclosure counts alone')
  assert.ok(
    Math.abs(adjusted.total - one.total * cpiMultiplier(year)) < 0.001,
    'CPI adjustment scales the selected financial-year cell before summing',
  )
  assert.ok(
    Math.abs(adjusted.byYear[year][0] - flow.byYear[year][0] * cpiMultiplier(year)) < 0.001,
    'adjusted per-year cells stay available to card breakdowns and peak calculations',
  )
  const none = windowFigures(flow, 1900, 1901)
  assert.deepEqual([none.total, none.count, none.firstYear, none.lastYear], [0, 0, null, null])
  const all = windowFigures(flow, years[0], years[years.length - 1])
  assert.equal(all.count, flow.count, 'full window keeps the count')
  assert.equal(all.firstYear, flow.firstYear)
  const dated = raw.edges.find((e) => e.undated)
  if (dated) {
    const off = windowFigures(dated, 1900, 1901)
    assert.equal(off.count, dated.undated[1], 'undated rows survive any window')
  }
  const legacy = { total: 5, count: 1, firstYear: 2001, lastYear: 2001 }
  assert.equal(windowFigures(legacy, 1900, 1901), legacy, 'no cells: figures untouched')
}

assert.equal(Object.keys(CPI_FINANCIAL_YEAR_INDEX).length, 29, 'CPI covers 1997-98 to 2025-26')
assert.equal(cpiMultiplier(2025), 1, '2025-26 is the CPI reference year')
assert.equal(cpiMultiplier(1900), cpiMultiplier(1997), 'older cells use nearest CPI year')
assert.equal(cpiMultiplier(2100), 1, 'newer cells use nearest CPI year')

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

// The grants layer: a grantor at the centre, grant flows out to donors that the
// grant register resolves to the same entity, each donor carrying its own
// grants block that re-sums like every other figure.
{
  const grantors = raw.nodes.filter((n) => n.kind === 'grantor')
  assert.equal(grantors.length, raw.meta.grantor_nodes ?? 0, 'grantor nodes match meta')
  const grantEdges = raw.edges.filter((e) => e.grant)
  assert.equal(grantEdges.length, raw.meta.donors_with_grants ?? 0, 'one grant flow per donor with grants')
  for (const g of grantors) {
    assert.equal(g.group, 'parties', 'grantor sits at the centre')
    assert.ok(g.colour, 'grantor carries its colour')
  }
  const donorIds = new Set(raw.nodes.filter((n) => n.kind === 'donor').map((n) => n.id))
  let sum = 0
  for (const e of grantEdges) {
    assert.ok(e.source.startsWith('grantor:') && donorIds.has(e.target), `grant flow endpoints ${e.source} -> ${e.target}`)
    const donor = raw.nodes.find((n) => n.id === e.target)
    assert.ok(donor.grants && donor.grants.total === e.total, `grants block on ${e.target} matches its flow`)
    sum += e.total
  }
  if (grantors.length) {
    assert.ok(Math.abs(sum - grantors[0].total) <= grantEdges.length, 'grantor total is the flows summed')
    checkCells(raw.nodes.filter((n) => n.grants).map((n) => ({ ...n.grants, id: `grants:${n.id}` })), 'grants blocks')
  }
}

console.log(
  `smoke test OK — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
    `${centres.size} clusters, layout radius ${spread.toFixed(0)}`,
)

// State files (scripts/export_state_money.py) share the node/edge shape but
// are smaller and carry a jurisdiction block; they must build on the same
// engine and never be merged with the federal file.
for (const jur of ['qld', 'vic', 'tas']) {
  const state = JSON.parse(
    await readFile(new URL(`../public/graph/money.${jur}.json`, import.meta.url)),
  )
  assert.equal(state.meta.jurisdiction, jur, `${jur}: meta.jurisdiction`)
  for (const key of ['jurisdictionLabel', 'commission', 'sourceShort', 'licence', 'coverage', 'threshold', 'not_summed']) {
    assert.ok(typeof state.meta[key] === 'string' && state.meta[key], `${jur}: meta.${key}`)
  }
  assert.ok(state.meta.donor_nodes >= 50, `${jur}: holds 50+ donors`)
  assert.ok(state.meta.party_nodes >= 3, `${jur}: holds the main parties`)
  assert.equal(state.nodes.length, state.meta.donor_nodes + state.meta.party_nodes + (state.meta.grantor_nodes ?? 0))
  assert.equal(state.edges.length, state.meta.edge_count)
  checkCells(state.nodes, jur)
  checkCells(state.edges, jur)
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
