import {partyUrl} from '../public/canonical-urls.js'
// ---------------------------------------------------------------------------
// OPAX Money Map - public entry.
//
// Rebuild the committed bundle (from portal/):
//
//   npx esbuild graph/index.ts --bundle --minify --format=esm \
//     --target=es2022 --outfile=public/money-map.js
//
// This is the vanilla adapter that replaces corpuskit's React shell
// (KnowledgeMap3D.tsx): it fetches the exported graph JSON, builds the
// engine's data, and owns every piece of DOM around the canvas - the legend
// (which doubles as an industry filter, and ends in the how-to-move note),
// the info card and the zoom buttons. The engine itself (map3d-engine.ts) is the ported corpuskit
// engine, driven exactly the way the React shell drove it.
// ---------------------------------------------------------------------------

import {
  buildDegrees,
  formatMoney,
  type GroupStyle,
  type Insets,
  type MapEdge,
  type MapNode,
} from './map-types.ts'
import { type EngineData, KnowledgeMapEngine, webglAvailable } from './map3d-engine.ts'
import { CLUSTER_COLOURS, clusterColour, CONTRACTOR_COLOUR, GRANTOR_COLOUR, partyDot, PUBLIC_MONEY } from './palette.ts'
import { type Reveal, runReveal } from './reveal.ts'
import { mountWordsLayer } from './words.ts'
import { cpiMultiplier } from './cpi.ts'
import { mountConnectionFallback } from './connection-fallback.ts'
import { filterMoneyEdges, readMoneyFilters, type MoneyFilters } from '../public/money-records.js'

// Re-exported so a Node smoke test can exercise the pure layout/data layer
// without a DOM or a WebGL context.
export { clusterCentres3D, ForceSim3D } from './force3d.ts'
export { buildDegrees, formatMoney, radiusFor, shortLabel } from './map-types.ts'
export { CPI_FINANCIAL_YEAR_INDEX, CPI_REFERENCE_YEAR, cpiIndexForYear, cpiMultiplier } from './cpi.ts'
// The cluster palette, so a host can draw its own industry chips in the map's colours.
export { CLUSTER_COLOURS, clusterColour } from './palette.ts'
export { webglAvailable }

/**
 * One year's slice of a node or flow: [dollars, donations]. `byYear` keys it
 * by the first year of the financial year (2023 for 2023-24; election returns
 * by their polling year); `undated` is the remainder with no year at all.
 * The cells sum to `total` and `count`, so a year window re-sums the lot.
 */
export type YearCell = [dollars: number, count: number]

/** One node of the exported money.json graph. */
/**
 * Public money a donor on the map received, from the grant register
 * (scripts/export_money_graph.py, grants_layer): totals by year like every
 * other figure, the largest programs, and the recipient's file in the
 * explorer ("Who gets the grants": shard `sh`, id `rid`).
 */
export type GrantsBlock = {
  total: number
  count: number
  firstYear: number | null
  lastYear: number | null
  byYear?: Record<string, YearCell>
  undated?: YearCell
  top?: [string, number][]
  rid?: string
  sh?: number
  jur?: string
}

export type MoneyNode = {
  id: string
  label: string
  /** 'grantor' is the central node public money flows out of. */
  kind: 'donor' | 'party' | 'grantor' | 'agency' | 'supplier'
  profileUrl?: string
  industry: string
  group: string
  colour?: string
  total: number
  count: number
  firstYear: number | null
  lastYear: number | null
  byYear?: Record<string, YearCell>
  undated?: YearCell
  grants?: GrantsBlock
  /** Commonwealth contracts the donor holds, the same shape as grants. */
  contracts?: GrantsBlock
  /** Grantor nodes: donors on this map they awarded to. */
  recipients?: number
  /** Grantor nodes: the explorer jurisdiction ('federal' | 'qld'), or 'contracts'. */
  explorer?: string
  /** Hub nodes: 'contracts' for the contracts hub; absent on the grants hub. */
  flow?: string
  /** 'public_money' when the donor is on the map for what it holds, not what it gave. */
  via?: string
  /** Contracts and grants dollars that brought a `via` donor onto the map. */
  publicMoney?: number
}

export type MoneyEdge = {
  source: string
  target: string
  total: number
  count: number
  firstYear: number | null
  lastYear: number | null
  byYear?: Record<string, YearCell>
  undated?: YearCell
  /** A grant flow: grantor -> donor, public money going the other way. */
  grant?: boolean
  /** 'contracts' on a flow from the contracts hub. */
  flow?: string
}

const isGrantEdge = (e: { source: string }) => e.source.startsWith('grantor:')

export type MoneyGraph = {
  meta: Record<string, unknown> & { coverage?: string; generated?: string }
  nodes: MoneyNode[]
  edges: MoneyEdge[]
}

export type MoneyScene = {
  focusId: string
  withIds?: string[]
  edges?: { source: string; target: string }[]
  from?: number
  to?: number
}

export type MoneyMapOptions = {
  filters?: MoneyFilters
  onViewChange?: (view: MoneyGraph, filters: MoneyFilters, years: { from: number; to: number; cpi: boolean }) => void
  /** Reader input in the map or controls; scene presentation stays silent. */
  onInteract?: () => void
  /** Builds the parliament ask-link for a donor's industry. */
  askUrl?: (industry: string) => string
  /**
   * Observe USER-initiated selections only - programmatic ones (the `focus`
   * seed, `handle.select`, a selection dropped by a filter) stay silent.
   */
  onSelect?: (node: MoneyNode | null) => void
  /** Node id to mount already-selected with the camera on it. */
  focus?: string
  /** 'full' (default): legend (with its note), find, time scrub, zoom. 'mini': bare scene + cards. */
  chrome?: 'full' | 'mini'
  /** A quiet, fitted industry overview; groups open only when chosen. */
  overview?: boolean
  /** Embedded homepage: wheel and touch gestures belong to the page. */
  pageScroll?: boolean
  /**
   * The year scrub, on its own. Defaults to `chrome === 'full'`; set it true
   * to give mini chrome the two thumbs - one compact row docked bottom left,
   * top left on a phone - without the rest of the full chrome, or false to
   * drop the scrub from the full map.
   */
  scrub?: boolean
  /**
   * The opening reveal: with a `focus`, the map opens close on that entity,
   * holds a beat, then eases out and around to frame it with the parties it
   * gave the most to (or, for a party, its largest donors), the rest of the
   * map dimmed behind them. Defaults to on for a focused mini map - a subject
   * page's embed, which is about one entity - and off everywhere else: the
   * full map and the front page open on the whole scene, which is their point.
   * The reader's first touch ends it; reduced motion opens on the landing.
   */
  reveal?: boolean
  /**
   * Whether a silent selection (the `focus` seed, `handle.select`) opens the
   * detail card. Defaults to true. A subject page on a phone passes false: the
   * card docks over most of the plate there and would hide the reveal, so the
   * node is lit and framed and the card waits for the reader's own tap.
   */
  openCard?: boolean
  /**
   * The node this page is ABOUT (a subject page's embed). Its card drops the
   * "Full profile" link, which would only reload the page the reader is on;
   * every other card keeps it.
   */
  subject?: string
}

export type MoneyMapHandle = {
  setFilters(filters: MoneyFilters, route?: URLSearchParams): void
  presentScene(scene: MoneyScene): boolean
  /** Restore the full nominal, unfiltered overview. */
  clearScene(): void
  /** Freeze camera choreography at its current frame, retaining the evidence. */
  pauseScene(): void
  select(id: string | null): void
  /** Isolate one industry cluster (null shows everything); the legend follows. Silent. */
  isolate(group: string | null): void
  /** Frame the whole visible graph. */
  fit(animate?: boolean): void
  /** Stop/restart rendering - for an embed that is off screen or display:none. */
  setPaused(paused: boolean): void
  destroy(): void
}

/** Dollars -> the engine's size weight: $10k ~ 1, so log sizing spans well. */
const WEIGHT_SCALE = 10_000

function yearSpan(first: number | null, last: number | null): string {
  if (!first) return ''
  return first === last ? `${first}` : `${first}–${last}`
}

/**
 * The two public-money hubs are drawn in the token inks (grants in the money
 * ink, contracts in the bills teal) whatever colour the export carries.
 */
const hubColour = (n: { flow?: string }) => (n.flow === 'contracts' ? CONTRACTOR_COLOUR : GRANTOR_COLOUR)

/** A node's mark colour: its own (a party's dot, a hub's ink), else its cluster's hue. */
const markColour = (n: MoneyNode): string =>
  n.kind === 'grantor' ? hubColour(n) : n.colour ?? (n.kind === 'party' ? partyDot(n.label) : clusterColour(n.group).colour)

/** Sentence case for a lower-case data key shown as a label ("mining & energy"). */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const toMapNode = (n: MoneyNode): MapNode => ({
  id: n.id,
  label: n.label,
  group: n.kind === 'grantor' ? 'public money' : n.group,
  weight: n.total / WEIGHT_SCALE,
  kind: n.kind,
  industry: n.industry,
  total: n.total,
  count: n.count,
  firstYear: n.firstYear,
  lastYear: n.lastYear,
  ...(n.colour || n.kind === 'party' || n.kind === 'grantor' ? { colour: markColour(n) } : {}),
})

const toMapEdge = (e: MoneyEdge): MapEdge => ({
  source: e.source,
  target: e.target,
  label: formatMoney(e.total),
  weight: e.total / WEIGHT_SCALE,
  total: e.total,
  count: e.count,
  firstYear: e.firstYear,
  lastYear: e.lastYear,
})

type YearFigures = {
  total: number
  count: number
  firstYear: number | null
  lastYear: number | null
  byYear?: Record<string, YearCell>
  undated?: YearCell
}

/**
 * A node's or flow's figures inside a year window: its per-year cells in
 * [lo, hi] re-summed, plus the undated remainder, which no window hides. The
 * span narrows to the years that actually carry something. An older export
 * without cells keeps its lifetime figures untouched. Pure, for the smoke test.
 */
export function windowFigures<T extends YearFigures>(
  x: T,
  lo: number,
  hi: number,
  adjustForInflation = false,
): T {
  if (!x.byYear) return x
  let total = x.undated?.[0] ?? 0
  let count = x.undated?.[1] ?? 0
  let firstYear: number | null = null
  let lastYear: number | null = null
  const byYear: Record<string, YearCell> | undefined = adjustForInflation ? {} : undefined
  for (const [key, [dollars, n]] of Object.entries(x.byYear)) {
    const year = Number(key)
    const scaledDollars = adjustForInflation ? dollars * cpiMultiplier(year) : dollars
    if (byYear) byYear[key] = [scaledDollars, n]
    if (year < lo || year > hi) continue
    total += scaledDollars
    count += n
    if (firstYear === null || year < firstYear) firstYear = year
    if (lastYear === null || year > lastYear) lastYear = year
  }
  return { ...x, total, count, firstYear, lastYear, ...(byYear ? { byYear } : {}) }
}

/**
 * The exported graph -> the engine's shape. Pure, so the smoke test can run
 * it (and the force sim on its output) in Node.
 */
export function buildGraph(raw: MoneyGraph): {
  nodes: MapNode[]
  edges: MapEdge[]
  groupStyles: Map<string, GroupStyle>
  degrees: Map<string, number>
} {
  const slots = new Map<string, number>()
  let slot = 0
  for (const group of CLUSTER_COLOURS.keys()) slots.set(group, slot++)

  const nodes = raw.nodes.map(toMapNode)
  const counts = new Map<string, number>()
  for (const node of nodes) counts.set(node.group, (counts.get(node.group) ?? 0) + 1)

  const groupStyles = new Map<string, GroupStyle>()
  for (const [group, count] of counts) {
    const style = group === 'public money' ? PUBLIC_MONEY : clusterColour(group)
    groupStyles.set(group, {
      slot: slots.get(group) ?? (slots.get('other') ?? 0),
      colour: style.colour,
      ink: style.ink,
      hollow: false,
      count,
    })
  }

  const edges = raw.edges.map(toMapEdge)
  return { nodes, edges, groupStyles, degrees: buildDegrees(edges) }
}

// ---------------------------------------------------------------------------
// Styles - injected once. The rp-map3d-* names are the engine's own label
// classes; the mm-* names are the adapter's chrome.
// ---------------------------------------------------------------------------

const STYLE_ID = 'money-map-styles'

const CSS = `
.mm-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.mm-root ::-webkit-scrollbar-track { background: transparent; }
.mm-root ::-webkit-scrollbar-thumb { background: var(--divider-default); border-radius: var(--radius-pill); }
.mm-root ::-webkit-scrollbar-thumb:hover { background: var(--bronze); }
.mm-root * { scrollbar-width: thin; scrollbar-color: var(--divider-default) transparent; }
.mm-root { position: relative; overflow: hidden; background: var(--paper);
  font: var(--type-fine); color: var(--ink);
  transition: height var(--duration-gentle) var(--ease-standard); }
@media (prefers-reduced-motion: reduce) { .mm-root { transition: none; } }
/* A host grown to hold its card (see fitHostToCard): the card may use the
   room, short of whatever gap fitHostToCard reserved above it for chrome
   (a phone's scrub bar, relocated to the top) and a floor of visible map. */
.mm-root.mm-grown .mm-card { max-height: calc(100% - var(--mm-grown-gap, 64px)); }
.mm-connections { position: absolute; inset: 0; overflow: auto; padding: var(--space-block); overscroll-behavior: contain; }
.mm-connections-title { margin: 0 0 var(--space-line); font: var(--type-strong); }
.mm-connections-note { margin: 0 0 var(--space-block); font: var(--type-fine); color: var(--ink-soft); }
.mm-connections ul { list-style: none; padding: 0; margin: 0; }
.mm-connections li { margin: 0 0 var(--space-group); }
.mm-connections li > strong { font: var(--type-strong); font-variant-numeric: tabular-nums; }
.mm-connection-names { display: flex; align-items: center; gap: var(--space-tight); margin-bottom: var(--space-line); }
.mm-connection-names button, .mm-connection-names a { flex: 1; min-width: 0; min-height: var(--size-target); display: flex; gap: var(--space-tight); align-items: center; background: none; border: none; padding: var(--space-line) 0; font: var(--type-metadata); color: var(--ink); text-align: left; cursor: pointer; overflow-wrap: anywhere; text-decoration: none; }
.mm-connection-names a span { text-decoration: underline; text-decoration-color: var(--bronze-rule); text-underline-offset: 3px; }
.mm-connection-names button:focus-visible, .mm-connection-names a:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: 2px; }
.mm-connection-names i { width: var(--size-party-dot); height: var(--size-party-dot); border-radius: var(--radius-round); flex: none; background: var(--ink-faint); }
.mm-connection-bar { height: 6px; background: var(--chart-baseline); border-radius: var(--radius-sm); overflow: hidden; margin-top: var(--space-line); }
.mm-connection-bar span { display: block; height: 100%; background: var(--chart-mark); }
.mm-recovery { position: absolute; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-heading); padding: var(--space-group); background: var(--paper); font: var(--type-body); }
.mm-canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; outline-offset: -3px; }
.mm-canvas:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); }
.mm-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
/* Names in the scene sit on its own marks and flows, so they keep a paper
   halo: legibility, not elevation. */
.rp-map3d-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font: var(--type-fine); color: var(--ink-soft); will-change: transform;
  text-shadow: 0 0 4px var(--paper), 0 0 8px var(--paper); }
/* A party is always named, its dot beside the name (.ui-party): with a
   shared dot for the minor parties, the colour alone says nothing. */
.rp-map3d-label.ui-party { font: var(--type-label); color: var(--ink-soft); }
.rp-map3d-label[data-emphasised] { font: var(--type-label); color: var(--ink); }
.rp-map3d-label[data-selected] { font-size: 0.9375rem; }
/* The hairline from a called-out party name back to its sphere. */
.rp-map3d-leader { position: absolute; top: 0; left: 0; height: 0; transform-origin: 0 0;
  border-top: var(--border-hairline) solid var(--line-control); will-change: transform; }
.rp-map3d-territory { position: absolute; top: 0; left: 0; white-space: nowrap;
  font: var(--type-label); text-shadow: 0 0 4px var(--paper);
  transition: opacity var(--duration-standard) var(--ease-standard); }
.rp-map3d-edge-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font: var(--type-label); color: var(--ink-soft); font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--paper) 85%, transparent); padding: 0 var(--space-line); border-radius: var(--radius-sm); }
/* The hover card - scouting information beside the node under the pointer.
   It floats, so it takes the one overlay shadow; inert to the pointer, gone
   cleanly. The node's dot sits beside its name. */
.rp-map3d-popup { position: absolute; left: 0; top: 0; width: max-content;
  max-width: 15rem; padding: var(--space-tight) var(--space-heading); border: var(--border-hairline) solid var(--divider-subtle);
  border-radius: var(--radius-md); background: color-mix(in srgb, var(--paper) 88%, transparent);
  box-shadow: var(--shadow-overlay);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  will-change: transform; }
.rp-map3d-popup-name { display: flex; align-items: center; gap: var(--space-tight); font: var(--type-label); color: var(--ink); }
.rp-map3d-popup-meta { margin-top: var(--space-line); font: var(--type-fine); color: var(--ink-soft); }
.rp-map3d-popup-dot { width: var(--size-party-dot); height: var(--size-party-dot); border-radius: var(--radius-round);
  flex-shrink: 0; }
.rp-map3d-popup-counts { margin-top: var(--space-line); font: var(--type-fine); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.rp-map3d-popup-hint { margin-top: var(--space-tight); font: var(--type-fine); color: var(--ink-faint); }
/* Floating panels sit light over the scene: translucent paper with a
   blurred backdrop so the map glows through, hairlines kept, no shadow. */
.mm-legend, .mm-card {
  background: color-mix(in srgb, var(--paper) 78%, transparent);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mm-legend, .mm-card, .rp-map3d-popup { background: color-mix(in srgb, var(--paper) 96%, transparent); }
}
.mm-legend { position: absolute; top: var(--space-heading); left: var(--space-heading); display: flex;
  flex-direction: column; gap: var(--space-line); max-height: calc(100% - 70px); overflow: auto;
  border: var(--border-hairline) solid var(--divider-subtle); border-radius: var(--radius-md); padding: var(--space-tight); }
/* The full map docks the year scrub under the legend, in the same column: the
   legend stops above it (its height is measured into --mm-scrub-h) and scrolls
   inside itself rather than running on beneath the scrub. */
.mm-root[data-mm-chrome='full'] .mm-legend { max-height: calc(100% - 36px - var(--mm-scrub-h, 0px)); }
.mm-legend-title { font: var(--type-label); color: var(--ink-soft); padding: 0 var(--space-tight) var(--space-line); }
/* A section of the card ("Where it went", "In parliament"): a label under a
   hairline, flush with the card's text edge. Not the legend title, whose side
   padding exists to line it up with the chips. */
.mm-card-section { margin: var(--space-block) 0 var(--space-tight); padding: var(--space-tight) 0 0;
  border-top: var(--border-hairline) solid var(--divider-subtle); font: var(--type-label); color: var(--ink-soft); }
/* Legend entries are choice chips at the legend's density: a pill you press,
   the cluster's dot, navy when chosen. */
.mm-chip { display: flex; align-items: center; gap: var(--space-tight); border: 0;
  background: none; font: var(--type-fine); color: var(--ink);
  padding: var(--space-line) var(--space-tight); border-radius: var(--radius-pill); cursor: pointer; text-align: left;
  transition: background-color var(--duration-quick) var(--ease-standard), color var(--duration-quick) var(--ease-standard); }
.mm-chip:hover { background: var(--navy-wash); }
.mm-chip:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: 2px; }
.mm-chip[aria-pressed='true'] { background: var(--navy); color: var(--on-navy); }
.mm-chip[data-dimmed] { opacity: 0.4; }
.mm-chip-count { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.mm-chip[aria-pressed='true'] .mm-chip-count { color: inherit; }
.mm-chip.mm-grants-toggle { margin-top: var(--space-tight); }
.mm-chip.mm-grants-toggle[aria-pressed='true'] { background: none; color: var(--ink); } /* the pressed-chip rule paints navy; this one keeps the legend's ink */
.mm-chip.mm-grants-toggle[aria-pressed='true']:hover { background: var(--navy-wash); }
.mm-chip.mm-grants-toggle[aria-pressed='true'] .mm-chip-count { color: var(--ink-soft); }
.mm-chip.mm-grants-toggle[aria-pressed='false'] { opacity: 0.5; }
.mm-chip.mm-grants-toggle[aria-pressed='false'] .mm-dot { background: var(--divider-default) !important; }
.mm-row-note { padding: var(--space-line) 0 var(--space-tight); font: var(--type-fine); color: var(--ink-soft); }
.mm-dot { width: var(--size-party-dot); height: var(--size-party-dot); border-radius: var(--radius-round); flex: none; }
.mm-card { position: absolute; top: var(--space-heading); right: var(--space-heading); width: 330px;
  max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow: auto;
  border: var(--border-hairline) solid var(--divider-subtle); border-radius: var(--radius-md); padding: var(--space-block);
  outline: none; }
.mm-card:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); }
/* The card's title is the node's name with its colour as a dot beside it, so
   a party's colour always arrives with its name. */
.mm-card h2 { margin: 0 var(--size-target) var(--space-line) 0; font: var(--type-subheading); color: var(--ink); }
.mm-title-dot { display: inline-block; position: relative; top: -0.1em; margin-right: var(--space-tight); vertical-align: middle; }
.mm-card-tag { margin-bottom: var(--space-tight); }
.mm-card-total { font: var(--type-heading); font-variant-numeric: tabular-nums; color: var(--ink); }
.mm-card-sub { margin: 0 0 var(--space-row); font: var(--type-fine); color: var(--ink-soft); }
.mm-card-fine { margin: 0 0 var(--space-row); font: var(--type-fine); color: var(--ink-soft); }
.mm-card > .mm-card-close { position: absolute; top: var(--space-line); right: var(--space-line); }
.mm-rows { margin: 0; padding: 0; list-style: none; }
.mm-row { display: flex; align-items: baseline; gap: var(--space-tight); width: 100%;
  padding: var(--space-line) var(--space-tight); margin: 0 calc(-1 * var(--space-tight)); border: 0; background: none;
  font: var(--type-metadata); color: var(--ink); border-radius: var(--radius-sm); cursor: pointer; text-align: left; }
.mm-row:hover { background: var(--paper-sunken); }
.mm-row:disabled { cursor: default; }
.mm-row:disabled:hover { background: none; }
.mm-row:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: -2px; }
.mm-row .mm-dot { align-self: center; }
.mm-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.mm-row-amt { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mm-row-years { font: var(--type-fine); color: var(--ink-soft); white-space: nowrap; font-variant-numeric: tabular-nums; }
/* Public money, by record category: the hub's dot beside its name, the
   largest projects listed under it. */
.mm-award-group { margin: var(--space-heading) 0 0; }
.mm-award-group + .mm-award-group { margin-top: var(--space-block); }
.mm-award-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-heading); }
.mm-card .mm-award-title { display: flex; align-items: center; gap: var(--space-tight); margin: 0; font: var(--type-strong); min-width: 0; }
.mm-award-category { display: inline-flex; align-items: center; gap: var(--space-line); min-height: 0; padding: var(--space-tight) 0; margin: calc(-1 * var(--space-tight)) 0;
  border: 0; background: none; text-align: left; font: inherit; color: var(--navy); cursor: pointer; }
.mm-award-category:hover .mm-award-label { text-decoration: underline; text-decoration-color: var(--bronze-rule); text-underline-offset: 3px; }
.mm-award-category:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: 3px; }
.mm-award-arrow { color: var(--bronze-ink); font-size: 1.125rem; }
.mm-award-total { flex: none; font: var(--type-strong); color: var(--ink); font-variant-numeric: tabular-nums; }
.mm-award-meta { margin: 0 0 var(--space-row); font: var(--type-fine); color: var(--ink-soft); }
.mm-award-projects { list-style: none; margin: 0; padding: 0; }
.mm-award-project { display: flex; align-items: baseline; gap: var(--space-heading); padding: var(--space-tight) 0;
  border-top: var(--border-hairline) solid var(--divider-subtle); font: var(--type-fine); color: var(--ink); }
.mm-award-project-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mm-award-project-amount { flex: none; font-weight: 600; font-variant-numeric: tabular-nums; }
/* The card's one primary action, the subject's profile, is the shared navy
   button. Every other way onward sits in the quiet row beneath. */
.mm-root .mm-card .mm-ask { display: flex; box-sizing: border-box; width: 100%; margin-top: var(--space-heading); }
/* The quiet row: short verb-first text actions in the bronze register, each
   a 44px target through its padding, wrapping at narrow widths. A dot
   trails every item but the last, so a wrapped line ends on a dot rather
   than starting with one. */
.mm-actions { display: flex; flex-wrap: wrap; align-items: center; margin: var(--space-line) calc(-1 * var(--space-line)) 0; }
.mm-action { display: inline-flex; align-items: center; box-sizing: border-box; min-height: var(--size-target); margin: 0;
  padding: 0 var(--space-line); border: 0; border-radius: var(--radius-sm); background: none; font: var(--type-label);
  color: var(--bronze-ink); text-decoration: none; white-space: nowrap; cursor: pointer; }
.mm-action:hover { color: var(--ink); }
.mm-action:hover .mm-action-label { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--bronze); }
.mm-action:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: -2px; }
.mm-action:disabled { color: var(--ink-soft); cursor: progress; }
.mm-action:disabled .mm-action-label { text-decoration: none; }
.mm-action:not(:last-child)::after { content: '·'; margin-left: var(--space-tight); color: var(--divider-default); font-weight: 400; }
.mm-action-chevron { display: inline-flex; flex: none; width: var(--size-icon-sm); height: var(--size-icon-sm); margin-left: var(--space-line);
  color: currentColor; transition: transform var(--duration-standard) var(--ease-standard); }
.mm-action[aria-expanded='true'] .mm-action-chevron { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .mm-action-chevron, .mm-chip { transition: none; } }
/* The source-record excerpts the Sources disclosure opens under the row. */
.mm-evidence { margin: var(--space-line) 0 0; padding-top: var(--space-tight); border-top: var(--border-hairline) solid var(--divider-subtle); font: var(--type-fine); }
.mm-evidence-note { margin: 0; font: var(--type-fine); color: var(--ink-soft); }
/* Zoom: the shared icon buttons (.ui-button.ui-icon-button), compact. */
.mm-zoom { position: absolute; right: var(--space-heading); bottom: var(--space-heading); display: flex;
  flex-direction: column; gap: var(--space-line); }
.mm-legend-note { max-width: 15rem; margin: var(--space-line) 0 0; padding: var(--space-tight) var(--space-tight) 0;
  border-top: var(--border-hairline) solid var(--divider-subtle); font: var(--type-fine); color: var(--ink-soft); }
/* Find: the shared field (.ui-input), compact, over a floating result menu. */
.mm-find { position: absolute; top: var(--space-heading); right: var(--space-heading); width: 240px; }
.mm-find-list { list-style: none; margin: var(--space-line) 0 0; padding: var(--space-line);
  background: var(--paper-raised); border: var(--border-hairline) solid var(--divider-subtle);
  border-radius: var(--radius-md); box-shadow: var(--shadow-overlay); max-height: 260px; overflow: auto; }
.mm-find-list:empty { display: none; }
.mm-find-list button { display: flex; align-items: center; gap: var(--space-tight); width: 100%;
  border: 0; background: none; font: var(--type-metadata); color: var(--ink);
  padding: var(--space-tight); border-radius: var(--radius-sm); cursor: pointer; text-align: left; }
.mm-find-list button:hover, .mm-find-list button:focus-visible { background: var(--paper-sunken); }
.mm-root[data-mm-chrome='full'] .mm-card { top: 58px; max-height: calc(100% - 70px); }
.mm-scrub { position: absolute; left: var(--space-heading); bottom: var(--space-heading); width: 270px;
  background: color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter: blur(6px);
  border: var(--border-hairline) solid var(--divider-subtle); border-radius: var(--radius-md); padding: var(--space-tight) var(--space-heading); }
.mm-scrub-label { display: flex; justify-content: space-between; font: var(--type-label); color: var(--ink-soft); }
.mm-scrub-years { font-variant-numeric: tabular-nums; color: var(--ink); }
.mm-scrub-rail { position: relative; width: 100%; height: 28px; }
.mm-scrub-track { position: absolute; left: 8px; right: 8px; top: 50%; height: 2px;
  margin-top: -1px; background: var(--chart-baseline); }
.mm-scrub-fill { position: absolute; top: 0; bottom: 0; background: var(--chart-mark); }
/* Only the thumbs take the pointer, so the two stacked inputs do not mask
   each other and a drag that starts off a thumb still reaches the canvas. */
.mm-scrub input[type='range'] { position: absolute; inset: 0; width: 100%; height: 28px;
  margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
.mm-scrub input[type='range']:focus-visible { outline: var(--border-focus) solid var(--bronze-ink);
  outline-offset: 1px; border-radius: var(--radius-sm); }
.mm-scrub input[type='range']::-webkit-slider-runnable-track { height: 28px; background: none; }
.mm-scrub input[type='range']::-moz-range-track { height: 28px; background: none; }
.mm-scrub input[type='range']::-webkit-slider-thumb { -webkit-appearance: none;
  pointer-events: auto; width: 16px; height: 16px; margin-top: 6px; border-radius: var(--radius-round);
  border: var(--border-hairline) solid var(--bronze-ink); background: var(--paper-raised); box-sizing: border-box; cursor: ew-resize; }
.mm-scrub input[type='range']::-moz-range-thumb { pointer-events: auto;
  width: 16px; height: 16px; border-radius: var(--radius-round); border: var(--border-hairline) solid var(--bronze-ink);
  background: var(--paper-raised); box-sizing: border-box; cursor: ew-resize; }
.mm-cpi { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center;
  column-gap: var(--space-tight); min-height: var(--size-target); margin-top: var(--space-line); padding-top: var(--space-line);
  border-top: var(--border-hairline) solid var(--divider-subtle); cursor: pointer; }
.mm-cpi input { width: 18px; height: 18px; margin: 0; accent-color: var(--navy); cursor: pointer; }
.mm-cpi-copy { display: block; min-width: 0; }
.mm-cpi-name { display: block; font: var(--type-label); color: var(--ink); }
.mm-cpi-short { display: none; }
.mm-cpi-note { display: block; font: var(--type-fine); color: var(--ink-soft); }
/* On the compact strip the note lives behind a small i: a 44px target drawing
   a 22px ring, and a paper popover beneath the strip. Hidden on the full plate,
   where the note sits under the label. */
.mm-cpi-info { display: none; flex: none; width: var(--size-target); height: var(--size-target); margin: 0 -8px 0 -6px; padding: 0;
  border: 0; background: none; cursor: pointer; color: var(--bronze-ink); align-items: center; justify-content: center; }
.mm-cpi-info:focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: -4px; }
.mm-cpi-info span { display: grid; place-items: center; box-sizing: border-box; width: 22px; height: 22px; border-radius: var(--radius-round);
  border: var(--border-hairline) solid currentColor; font: italic 700 0.8125rem/1 var(--serif); }
.mm-cpi-info[aria-expanded='true'] span { background: var(--bronze-ink); color: var(--paper); }
.mm-cpi-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 6; width: min(300px, 100%);
  padding: var(--space-tight) var(--space-row); background: var(--paper-raised); border: var(--border-hairline) solid var(--divider-subtle);
  border-radius: var(--radius-md); box-shadow: var(--shadow-overlay); font: var(--type-fine); color: var(--ink); }
.mm-cpi-pop[hidden] { display: none; }
/* Inside a page's map plate the host clips overflow, so the note opens upward from the icon, anchored to its right. */
.mm-scrub-mini .mm-cpi-pop { top: auto; bottom: calc(100% + 6px); left: auto; right: 0; z-index: 9; }
/* The same control on a small plate: one row, the window years as its label,
   the two thumbs and inflation switch sharing one compact strip. */
.mm-scrub-mini { width: auto; max-width: calc(100% - 24px); padding: var(--space-line) var(--space-row);
  display: flex; align-items: center; gap: var(--space-tight); }
.mm-scrub-mini .mm-scrub-label { display: block; margin: 0; flex: none; }
.mm-scrub-mini .mm-scrub-caption { display: none; }
.mm-scrub-mini .mm-scrub-rail { flex: none; width: 104px; height: 44px; }
.mm-scrub-mini input[type='range'] { height: 44px; }
.mm-scrub-mini input[type='range']::-webkit-slider-runnable-track { height: 44px; }
.mm-scrub-mini input[type='range']::-moz-range-track { height: 44px; }
.mm-scrub-mini input[type='range']::-webkit-slider-thumb { width: 14px; height: 14px; margin-top: 15px; }
.mm-scrub-mini input[type='range']::-moz-range-thumb { width: 14px; height: 14px; }
.mm-scrub-mini .mm-cpi { flex: none; width: auto; margin: 0; padding: 0 0 0 var(--space-tight);
  border-top: 0; border-left: var(--border-hairline) solid var(--divider-subtle); }
.mm-scrub-mini .mm-cpi-name { white-space: nowrap; }
.mm-scrub-mini .mm-cpi-long { display: none; }
.mm-scrub-mini .mm-cpi-short { display: inline; }
.mm-scrub-mini .mm-cpi-info { margin: 0 -6px 0 -4px; }
.mm-scrub-mini .mm-cpi-note { display: none; }
.mm-scrub-mini .mm-cpi-info { display: flex; }
.mm-fallback { display: flex; align-items: center; justify-content: center;
  height: 100%; padding: var(--space-group); text-align: center; font: var(--type-body); color: var(--ink-soft); }
@media (prefers-reduced-motion: reduce) {
  .rp-map3d-territory { transition: none; }
}
/* Tablets need the graph width more than they need desktop side rails. Keep
   the controls as light overlays above the scene and open details as a sheet,
   leaving one wide, coherent camera viewport. */
@media (min-width: 721px) and (max-width: 1024px) {
  .mm-legend { flex-direction: row; flex-wrap: nowrap; overflow-x: auto;
    right: var(--space-heading); max-width: none; max-height: none; align-items: center;
    padding: var(--space-line) var(--space-tight); }
  .mm-root[data-mm-chrome='full'] .mm-legend { max-height: none; }
  .mm-legend-title { display: none; }
  .mm-chip { white-space: nowrap; flex: none; }
  .mm-chip.mm-grants-toggle { margin-top: 0; }
  .mm-find, .mm-legend-note { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-scrub {
    top: 60px; bottom: auto; width: 270px;
  }
  .mm-card, .mm-root[data-mm-chrome='full'] .mm-card {
    top: auto; right: var(--space-heading); left: var(--space-heading);
    bottom: max(var(--space-heading), env(safe-area-inset-bottom));
    width: auto; max-height: 48%;
  }
}
@media (pointer: coarse) {
  .rp-map3d-label[data-emphasised] {
    padding: 0 var(--space-line); border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--paper) 82%, transparent);
    font-size: 0.9375rem; text-shadow: none;
  }
  .rp-map3d-label[data-selected] { font-size: 1rem; }
  .rp-map3d-edge-label { background: color-mix(in srgb, var(--paper) 92%, transparent); }
}
@media (max-width: 720px) {
  .mm-legend { flex-direction: row; flex-wrap: nowrap; overflow-x: auto;
    max-width: calc(100% - 24px); max-height: none; align-items: center;
    padding: var(--space-line) var(--space-tight); }
  .mm-legend-title { display: none; }
  .mm-chip { white-space: nowrap; flex: none; }
  .mm-chip.mm-grants-toggle { margin-top: 0; }
  .mm-card { top: auto; right: var(--space-tight); left: var(--space-tight);
    bottom: max(var(--space-tight), env(safe-area-inset-bottom)); width: auto;
    max-height: 55%; }
  .mm-root[data-mm-chrome='full'] .mm-card { top: auto; max-height: 55%; }
  .mm-legend-note, .mm-find { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-scrub { display: flex; align-items: center; gap: var(--space-tight);
    top: 60px; right: var(--space-tight); bottom: auto; left: var(--space-tight); width: auto; padding: var(--space-line) var(--space-tight); overflow: visible; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-label { display: block; flex: none; margin: 0; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-caption { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-rail { flex: 1 1 88px; min-width: 60px; height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range'] { height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-webkit-slider-runnable-track { height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-moz-range-track { height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-webkit-slider-thumb {
    width: 14px; height: 14px; margin-top: 15px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-moz-range-thumb {
    width: 14px; height: 14px; }
  .mm-root[data-mm-chrome='full'] .mm-cpi { flex: none; width: auto; margin: 0;
    padding: 0 0 0 var(--space-tight); border-top: 0; border-left: var(--border-hairline) solid var(--divider-subtle); }
  .mm-root[data-mm-chrome='full'] .mm-cpi-name { white-space: nowrap; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-long { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-short { display: inline; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-info { margin: 0 -6px 0 -4px; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-note { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-info { display: flex; }
  /* The compact scrub is small enough to keep on a phone; it moves to the
     top left, which mini chrome leaves empty, clear of the card's sheet. */
  .mm-scrub-mini { display: flex; top: max(var(--space-tight), env(safe-area-inset-top)); left: var(--space-tight); bottom: auto; }
}
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  parent.appendChild(node)
  return node
}

// ---------------------------------------------------------------------------
// Card actions.
// ---------------------------------------------------------------------------

/** Company-suffix-free name for question copy ("Pratt Holdings", not "…Pty Ltd"). */
export const shortName = (label: string) =>
  label.replace(/\s+(Pty\.?\s*)?(Ltd|Limited|Incorporated|Inc)\.?$/i, '')

export type CardActionId = 'ask' | 'search' | 'explain' | 'sources' | 'grants' | 'suppliers' | 'discover'

/** One entry in a card's quiet row. Links carry an href; explain and sources are behaviours the renderer wires. */
export type CardAction = {
  id: CardActionId
  /** Short and verb-first, one to three words: what the reader sees. */
  label: string
  /** The full sentence the label stands for; the accessible name and tooltip. */
  name: string
  href?: string
}

export type CardActions = {
  /** The one filled action, the entity's profile; null when the card is the page's own subject or there is no profile. */
  primary: { label: string; href: string } | null
  actions: CardAction[]
}

export type CardActionContext = {
  /** The page's own subject; its card promotes nothing. */
  subject?: string
  /** A state file's jurisdiction; undefined for the federal file. */
  jurisdiction?: string
  /** Whether the public-money layer is showing (its links go with it). */
  grantsOn: boolean
  routeBase: string
  askUrl: (industry: string) => string
  /** For a party: the industry that gave it the most, or null. */
  topIndustry?: string | null
}

/**
 * What a node's card offers beyond its figures: at most one filled primary
 * (the profile) and a quiet row of short actions. Pure, so the shape of every
 * card can be checked without a DOM; the renderer only maps ids to behaviour.
 */
export function planCardActions(node: MoneyNode, ctx: CardActionContext): CardActions {
  const own = node.id === ctx.subject
  const profile = (kind: 'donor' | 'party') =>
    own ? null : { label: 'View profile', href: kind==='party' ? partyUrl(node.label) : `/subject/donor/${encodeURIComponent(node.label)}` }
  if (node.kind === 'agency' || node.kind === 'supplier') {
    const hasProfile = !!node.profileUrl && /^\/subject\/(agency|supplier)\//.test(node.profileUrl)
    return { primary: hasProfile && !own ? { label: 'View profile', href: node.profileUrl! } : null, actions: [] }
  }
  if (node.kind === 'grantor') {
    const actions: CardAction[] = []
    if (node.flow === 'contracts') {
      // The Discover page follows Commonwealth contracts; a state hub has no page of its own yet.
      if (!ctx.jurisdiction) {
        actions.push({ id: 'discover', label: 'Follow contracts', name: 'Follow the big contracts', href: `${ctx.routeBase}/discover` })
        actions.push({ id: 'suppliers', label: 'Browse suppliers', name: 'Browse supplier profiles', href: `${ctx.routeBase}/subject/supplier` })
      }
    } else {
      actions.push({
        id: 'grants', label: 'Explore grants', name: 'Explore Who gets the grants',
        href: `${ctx.routeBase}/explore?game=grants&jur=${encodeURIComponent(node.explorer ?? 'federal')}`,
      })
    }
    return { primary: null, actions }
  }
  if (node.kind === 'party') {
    const actions: CardAction[] = []
    if (ctx.topIndustry) {
      const question = `What has ${node.label} said about ${ctx.topIndustry}?`
      actions.push({ id: 'ask', label: 'Ask', name: `Ask ${question.charAt(0).toLowerCase()}${question.slice(1)}`, href: `/ask?q=${encodeURIComponent(question)}` })
    }
    actions.push({ id: 'explain', label: 'Explain', name: 'Explain this flow' })
    return { primary: profile('party'), actions }
  }
  // A donor: the industry question is the specific ask; the quoted-name search
  // is what parliament said about the donor itself. Quote the suffix-stripped
  // name: MPs say "Philip Morris", never "Philip Morris Limited".
  const actions: CardAction[] = []
  const industry = node.industry.replace(/_/g, ' ')
  if (!['individual', 'other', ''].includes(node.industry.toLowerCase())) {
    actions.push({ id: 'ask', label: 'Ask', name: `Ask what parliament said about ${industry}`, href: ctx.askUrl(industry) })
  }
  const short = shortName(node.label)
  actions.push({ id: 'search', label: 'Search', name: `Search what was said about ${short}`, href: `/search?q=${encodeURIComponent(`"${short}"`)}` })
  actions.push({ id: 'explain', label: 'Explain', name: 'Explain this flow' })
  actions.push({ id: 'sources', label: 'Sources', name: 'Sources: mentions in the source records' })
  if (ctx.grantsOn) {
    if (node.grants?.rid && !/^(null|undefined)$/i.test(node.grants.rid)) {
      actions.push({
        id: 'grants', label: 'Open grants file', name: 'Open their grants file',
        href: `${ctx.routeBase}/explore?game=grants&jur=${encodeURIComponent(node.grants.jur ?? 'federal')}&open=${encodeURIComponent(node.grants.rid)}`,
      })
    }
    if (node.contracts && !ctx.jurisdiction) {
      actions.push({
        id: 'suppliers', label: 'Open supplier records', name: 'Open their supplier records',
        href: `${ctx.routeBase}/subject/supplier?donor=${encodeURIComponent(node.id)}`,
      })
    }
  }
  return { primary: profile('donor'), actions }
}

// ---------------------------------------------------------------------------
// Mount.
// ---------------------------------------------------------------------------

export async function mountMoneyMap(
  container: HTMLElement,
  dataUrl: string | MoneyGraph,
  opts: MoneyMapOptions = {},
): Promise<MoneyMapHandle> {
  injectStyles()
  container.classList.add('mm-root')

  let raw: MoneyGraph
  if (typeof dataUrl === 'string') {
    const response = await fetch(dataUrl)
    if (!response.ok) throw new Error(`money map data: HTTP ${response.status} for ${dataUrl}`)
    raw = await response.json() as MoneyGraph
  } else raw = dataUrl

  if (!webglAvailable()) return mountConnectionFallback(container, raw, opts)

  const graph = buildGraph(raw)
  const byId = new Map(raw.nodes.map((n) => [n.id, n]))
  const chrome = opts.chrome ?? 'full'
  const full = chrome === 'full'
  // A focused mini map is a subject page's embed - it is about one entity, so
  // it opens on that entity. The full map and the front page are about the
  // whole scene and open on it, as before.
  const revealWanted = opts.reveal ?? (opts.focus !== undefined && chrome === 'mini')
  container.dataset.mmChrome = chrome
  // The app serves real paths, so map links are plain paths too. They were
  // hash routes from before that change, which sent "Full profile" on /money to
  // /#/subject/donor/... and landed nowhere.
  const routeBase = ''
  const askUrl = opts.askUrl ??
    ((industry: string) =>
      `/ask?q=${encodeURIComponent(`What has parliament said about ${industry}?`)}`)

  // Observed year extent of the flows, for the time scrub.
  let yearMin = 2026
  let yearMax = 1998
  for (const e of raw.edges) {
    if (e.firstYear) yearMin = Math.min(yearMin, e.firstYear)
    if (e.lastYear) yearMax = Math.max(yearMax, e.lastYear)
  }
  let yearLo = yearMin
  let yearHi = yearMax
  let adjustForInflation = false
  let yearsInUrl = false
  let syncScrubControls = () => {}
  let scrubPending = 0
  let destroyed = false
  let researchFilters: MoneyFilters = opts.filters ?? (full && typeof location !== 'undefined' ? readMoneyFilters(new URLSearchParams(location.search)) : {})

  // Full maps own these three query parameters. Mini maps are embedded in
  // donor/party/front-page routes, so their scrub remains local to the embed.
  if (full && typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search)
    const readYear = (name: string): number | null => {
      const rawYear = params.get(name)
      if (!rawYear || !/^\d{4}$/.test(rawYear)) return null
      return Math.max(yearMin, Math.min(yearMax, Number(rawYear)))
    }
    const from = readYear('from')
    const to = readYear('to')
    yearsInUrl = from !== null || to !== null
    if (from !== null || to !== null) {
      const a = from ?? yearMin
      const b = to ?? yearMax
      yearLo = Math.min(a, b)
      yearHi = Math.max(a, b)
    }
    adjustForInflation = params.get('cpi') === '1'
  }

  const syncUrlState = () => {
    if (!full || typeof location === 'undefined' || typeof history === 'undefined') return
    const url = new URL(location.href)
    // Teardown can run after the host has navigated to another route.
    if (!/^\/(?:money|map)\/?$/.test(url.pathname)) return
    if (yearsInUrl) {
      url.searchParams.set('from', String(yearLo))
      url.searchParams.set('to', String(yearHi))
    } else {
      url.searchParams.delete('from')
      url.searchParams.delete('to')
    }
    for (const [key, value] of Object.entries({ type: researchFilters.type === 'all' ? '' : researchFilters.type, party: researchFilters.party, min: researchFilters.min || '', q: researchFilters.query, industry: activeGroup })) {
      if (value) url.searchParams.set(key, String(value)); else url.searchParams.delete(key)
    }
    if (adjustForInflation) url.searchParams.set('cpi', '1')
    else url.searchParams.delete('cpi')
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  /**
   * The year window's reading of the file. Everything the reader can see -
   * the scene, the cards, the words block - comes from here, so a scrub
   * step re-sums every figure instead of only hiding whole flows. With the
   * thumbs at the ends it is the file itself; `span` names the window
   * otherwise, for copy that has to say which years a figure covers.
   */
  type WindowView = {
    nodes: Map<string, MoneyNode>
    edges: MoneyEdge[]
    span: string | null
    /** Each donor's grants block, re-summed for the window. */
    grants: Map<string, GrantsBlock>
    /** Each donor's contracts block, re-summed the same way. */
    contracts: Map<string, GrantsBlock>
  }
  let view: WindowView = { nodes: byId, edges: raw.edges, span: null, grants: new Map(), contracts: new Map() }

  // --- DOM scaffolding -------------------------------------------------
  const canvas = el('canvas', 'mm-canvas', container)
  canvas.tabIndex = 0
  if (opts.pageScroll) canvas.style.touchAction = 'auto'
  canvas.setAttribute('role', 'application')
  canvas.setAttribute(
    'aria-label',
    (opts.pageScroll
      ? 'Money map - scroll to move the page, drag with a mouse to orbit, or use the zoom buttons. Tap a node for details. '
      : 'Money map - drag to orbit, pinch or scroll to zoom, click a node for details. ') +
      'With the keyboard: arrows orbit, plus and minus zoom, Enter selects the node ' +
      'nearest the middle, Escape clears the selection.',
  )
  const labels = el('div', 'mm-labels', container)
  labels.setAttribute('aria-hidden', 'true')

  const legend = full ? el('div', 'mm-legend', container) : null
  if (legend) {
    const legendTitle = el('div', 'mm-legend-title', legend)
    legendTitle.textContent = 'Industries · click to isolate'
  }

  const card = el('div', 'mm-card', container)
  // A short host (the front page's box, any phone) is shorter than the card,
  // which then clips or scrolls. While a card is up the host grows to hold it
  // with a band of map above, and gives the height back when it closes; the
  // engine's ResizeObserver refits the view either way.
  //
  // "Above" is real chrome plus a floor of visible map, not an assumed
  // constant: on a narrow phone the card becomes a bottom sheet and the
  // scrub relocates to the top-left to stay clear of it (chromeInsets()
  // already measures exactly that). A fixed band sized for a scrub-free top
  // left nothing for the map once the scrub also claimed that space - the
  // grown plate matched the card's own height but not what had to share it.
  const MAP_BAND_MIN = 56
  /** The narrow card's own `bottom: 8px` anchor (see the max-width: 720px rule). */
  const CARD_BOTTOM_GAP = 8
  /** Headroom so a sub-pixel rounding never forces an avoidable internal scroll. */
  const CARD_SLACK = 8
  /**
   * The engine floors a framing box shorter than a fifth of the plate to a
   * fifth anyway, rather than fail on a sliver (freeBox/frameOn in
   * map3d-engine.ts) - so growing only enough for MAP_BAND_MIN's flat band
   * quietly asks it to fit a subject into far less room than its own math
   * assumes it has, and the subject ends up half under the card. Growing
   * enough to keep the real share close to that same fifth keeps the two
   * honest with each other.
   */
  const MIN_MAP_SHARE = 0.2
  let hostBase: { style: string; px: number } | null = null
  // The seeded focus reads the card's geometry synchronously, one line below
  // this one (startReveal's setInsets), with no frame to spare for the
  // host's own height transition to settle. Every later open is a
  // reader-visible change worth smoothing, and its insets are re-measured
  // a frame later anyway (the rAF in setSelection) - only this first one
  // needs to land instantly.
  let grownOnce = false
  const releaseHost = () => {
    if (!hostBase) return
    container.style.height = hostBase.style
    container.style.removeProperty('--mm-grown-gap')
    hostBase = null
    container.classList.remove('mm-grown')
  }
  const fitHostToCard = () => {
    if (card.hidden) { releaseHost(); return }
    const prevMax = card.style.maxHeight
    card.style.maxHeight = 'none'
    const natural = card.scrollHeight
    card.style.maxHeight = prevMax
    const hostRect = container.getBoundingClientRect()
    // The same test measureInsets() uses: a bottom sheet on narrow screens,
    // a right panel otherwise. A right panel costs the map nothing
    // vertically - the scrub stays wherever it already sits, at the bottom -
    // so it only needs enough room that the card does not scroll internally.
    // The sheet competes with whatever chrome now sits above it for the very
    // room it is growing into, and that only measured-before-growth (an
    // absolutely-positioned top scrub doesn't move when the host does).
    const isSheet = card.getBoundingClientRect().width >= hostRect.width - 40
    let want: number
    let topGap = 0
    if (isSheet) {
      const topChrome = chromeInsets().top
      topGap = Math.round(topChrome + MAP_BAND_MIN + CARD_BOTTOM_GAP)
      const bottomReserve = natural + CARD_BOTTOM_GAP
      want = Math.round(Math.max(
        natural + topGap + CARD_SLACK,
        (topChrome + bottomReserve) / (1 - MIN_MAP_SHARE),
      ))
    } else {
      want = natural + 16 + 56
    }
    const base = hostBase ? hostBase.px : hostRect.height
    if (want <= base) { releaseHost(); return }
    if (!hostBase) hostBase = { style: container.style.height, px: hostRect.height }
    container.classList.add('mm-grown')
    if (isSheet) container.style.setProperty('--mm-grown-gap', `${topGap}px`)
    else container.style.removeProperty('--mm-grown-gap')
    const grown = Math.round(Math.min(want, window.innerHeight * 0.85))
    if (!grownOnce) {
      const prevTransition = container.style.transition
      container.style.transition = 'none'
      container.style.height = `${grown}px`
      container.getBoundingClientRect() // flush layout before transitions resume
      container.style.transition = prevTransition
    } else {
      container.style.height = `${grown}px`
    }
    grownOnce = true
  }
  card.tabIndex = -1
  card.setAttribute('role', 'region')
  card.setAttribute('aria-label', 'Details for the selected node')
  card.hidden = true

  const zoom = full || opts.pageScroll ? el('div', 'mm-zoom', container) : null
  if (zoom) {
    zoom.dataset.uiSize = 'compact'
    const zoomButton = (path: string, title: string, onClick: () => void) => {
      const button = el('button', 'ui-button ui-icon-button', zoom)
      button.type = 'button'
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`
      button.setAttribute('aria-label', title)
      button.title = title
      button.addEventListener('click', onClick)
    }
    zoomButton('M12 5v14M5 12h14', 'Zoom in', () => engine.zoomBy(1.3))
    zoomButton('M5 12h14', 'Zoom out', () => engine.zoomBy(1 / 1.3))
    zoomButton('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', 'Fit the whole map to view', () => engine.fit(true))
  }

  // How to move the map, and whose returns it draws: the key's last line, not a
  // caption floating over the scene (it ran under the year scrub at 1280).
  const hint = legend ? el('p', 'mm-legend-note', legend) : null
  if (hint) {
    // State files name their commission in meta.sourceShort; the federal
    // export predates the field and stays "AEC returns".
    const sourceShort = typeof raw.meta?.sourceShort === 'string' ? raw.meta.sourceShort : 'AEC returns'
    hint.textContent = `Drag to orbit · scroll to zoom · click a cluster to open it · ` +
      `click a node or a flow · ${sourceShort} ${raw.meta?.coverage ?? '1998–2026'}`
  }

  // --- Engine ----------------------------------------------------------
  let selectedId: string | null = null
  let selectedEdge: MapEdge | null = null
  let activeGroup: string | null = researchFilters.industry || null

  let recoveryNotice: HTMLDivElement | null = null
  let engine: KnowledgeMapEngine
  try {
    engine = new KnowledgeMapEngine(
      canvas,
      labels,
      (id) => setSelection(id, { user: true }),
      () => {
        if (recoveryNotice) return
        recoveryNotice = el('div', 'mm-recovery', container)
        recoveryNotice.setAttribute('role', 'status')
        recoveryNotice.append('Reconnecting the map… ')
        const retry = el('button', 'ui-button', recoveryNotice)
        retry.type = 'button'
        retry.textContent = 'Reload map'
        retry.addEventListener('click', () => location.reload())
      },
      () => {
        recoveryNotice?.remove()
        recoveryNotice = null
      },
      opts.pageScroll === true,
    )
  } catch {
    container.replaceChildren()
    return mountConnectionFallback(container, raw, opts)
  }
  engine.setOverviewMode(opts.overview === true)
  engine.onEdgePick = (edge) => setEdgeSelection(edge)
  const words = mountWordsLayer({ engine, raw, legend, routeBase })

  // --- The opening reveal ----------------------------------------------
  // Only its emphasis reaches the scene, and only while it runs: the flows
  // it is lighting, restored to the plain selection before the camera stops.
  let reveal: Reveal | null = null
  let spotlightEdges: MapEdge[] | null = null
  let spotlightFor: string | null = null
  let guidedScene = false
  const applyEmphasis = () => {
    engine.setEmphasis({
      selectedId,
      pathEdges: spotlightEdges,
      pathFrom: spotlightEdges ? selectedId : null,
      strictPath: guidedScene && spotlightEdges !== null,
    })
  }
  // The lit landing outlives the camera move, so something has to hand it
  // back when the reader does nothing more decisive than move the pointer
  // across the map. Armed only once the choreography has settled: a pointer
  // drifting over the plate on the way to the card must not cut the shot.
  let armedRelease: ((event: PointerEvent) => void) | null = null
  const disarmRelease = () => {
    if (!armedRelease) return
    container.removeEventListener('pointermove', armedRelease)
    armedRelease = null
  }
  const cancelReveal = () => {
    guidedScene = false
    disarmRelease()
    const running = reveal
    reveal = null
    running?.cancel()
    if (spotlightEdges !== null) {
      engine.stopViewMove()
      spotlightEdges = null
      spotlightFor = null
      applyEmphasis()
    }
  }
  // The reader's first press, drag, wheel notch or arrow key ends it.
  engine.onViewClaimed = () => cancelReveal()
  const onReaderInput = (event: Event) => {
    if (!event.isTrusted || destroyed) return
    cancelReveal()
    opts.onInteract?.()
  }
  const readerEvents = ['pointerdown', 'wheel', 'keydown', 'input', 'change', 'click'] as const
  for (const type of readerEvents) container.addEventListener(type, onReaderInput, { capture: true, passive: true })

  const aspectBucket = () => {
    const rect = container.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return 1.5
    const aspect = rect.width / rect.height
    return aspect < 1 ? 0.8 : aspect < 1.45 ? 1.2 : 1.9
  }

  let fitSig = ''
  // The grants layer: the grantor node and its flows, shown unless the reader
  // switches them off in the legend. Absent when the file has none.
  const hasGrants = raw.nodes.some((n) => n.kind === 'grantor')
  let grantsOn = hasGrants
  let visibleSceneIds = new Set<string>()
  let visibleSceneEdges: MapEdge[] = []
  const overviewScale = () => !opts.overview && container.getBoundingClientRect().width <= 540 ? 1.3 : 1
  const pushData = ({ keepFocus = false } = {}) => {
    // A scrub step, a filter or a re-layout is the reader driving: the
    // choreography gives way rather than animating over the top of it.
    cancelReveal()
    // Time scrub: every node and flow is re-summed from its per-year cells
    // for [lo, hi], so the scene, the cards and the words block all read the
    // same years the scrub shows. A flow with nothing in the window drops
    // out; a donor stays visible only while at least one of its flows does.
    // Parties always anchor the centre. Undated flows never disappear, and an
    // older file without cells falls back to the lifetime span overlapping
    // the window.
    const scrubbed = yearLo > yearMin || yearHi < yearMax
    const inWindow = (e: MoneyEdge) =>
      !scrubbed ||
      (e.byYear
        ? e.total > 0
        : (e.firstYear ?? yearMin) <= yearHi && (e.lastYear ?? yearMax) >= yearLo)
    const recalculated = scrubbed || adjustForInflation
    const windowNodes = recalculated
      ? raw.nodes.map((n) => windowFigures(n, yearLo, yearHi, adjustForInflation))
      : raw.nodes
    const windowEdges = filterMoneyEdges({ ...raw, edges: (recalculated
      ? raw.edges.map((e) => windowFigures(e, yearLo, yearHi, adjustForInflation))
      : raw.edges)
      .filter(inWindow)
      .filter((e) => grantsOn || !isGrantEdge(e)) }, { ...researchFilters, industry: activeGroup || undefined })
    const grantsByNode = new Map<string, GrantsBlock>()
    const contractsByNode = new Map<string, GrantsBlock>()
    for (const n of raw.nodes) {
      if (n.grants) grantsByNode.set(n.id, recalculated ? windowFigures(n.grants, yearLo, yearHi, adjustForInflation) : n.grants)
      if (n.contracts) contractsByNode.set(n.id, recalculated ? windowFigures(n.contracts, yearLo, yearHi, adjustForInflation) : n.contracts)
    }
    view = {
      nodes: recalculated ? new Map(windowNodes.map((n) => [n.id, n])) : byId,
      edges: windowEdges,
      span: scrubbed ? yearSpan(yearLo, yearHi) : null,
      grants: grantsByNode,
      contracts: contractsByNode,
    }
    const activeDonors = new Set(windowEdges.flatMap((e) => [e.source, e.target]))
    const visibleNodes = windowNodes.filter((n) => {
      if (n.kind === 'grantor') return grantsOn && activeDonors.has(n.id)
      if (n.group === 'parties') return windowEdges.length > 0 && (researchFilters.party ? n.id === researchFilters.party : activeDonors.has(n.id))
      if (activeGroup !== null && n.group !== activeGroup && n.industry !== activeGroup) return false
      return activeDonors.has(n.id)
    })
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    const visibleEdges = windowEdges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map(toMapEdge)
    const data: EngineData = {
      nodes: visibleNodes.map(toMapNode),
      edges: visibleEdges,
      groupStyles: graph.groupStyles,
      degrees: buildDegrees(visibleEdges),
      measure: 'resources',
      layout: 'grouped',
      aspect: aspectBucket(),
      centralGroup: raw.meta.procurement ? 'agencies' : 'parties',
      collapseGroups: !raw.meta.procurement,
    }
    visibleSceneIds = visibleIds
    visibleSceneEdges = visibleEdges
    engine.setData(data)
    syncUrlState()
    opts.onViewChange?.({ ...raw, nodes: visibleNodes, edges: windowEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)) }, { ...researchFilters, industry: activeGroup || '' }, { from: yearLo, to: yearHi, cpi: adjustForInflation })
    // The fit signature deliberately excludes the year window: refitting the
    // camera on every scrub step would turn the timeline into a fairground
    // ride. Filters and resizes refit; the scrub holds the view still.
    const sig = `${data.aspect}|${activeGroup ?? '*'}|${JSON.stringify(researchFilters)}`
    if (sig !== fitSig) {
      const firstFit = fitSig === ''
      fitSig = sig
      // The fit lands in the space the chrome (and an open card) leaves free.
      engine.setInsets(measureInsets())
      // A phone starts one zoom-button step closer while the view remains
      // automatic. Calling zoomBy here claimed the camera before its opening
      // layout had settled, which could leave the scene outside the viewport.
      engine.fit(!firstFit, overviewScale())
    }
    // The open card follows the window: re-drawn in place with the figures
    // the scene now shows, or closed when its subject left the window. The
    // engine's flow objects are rebuilt each push, so a held flow is found
    // again by its ends; a folded cluster's flow is the engine's own and is
    // released, as before.
    if (selectedId) {
      if (visibleIds.has(selectedId)) refreshCard()
      else setSelection(null)
    } else if (selectedEdge) {
      const held = selectedEdge
      const again = held.hub
        ? undefined
        : visibleEdges.find((e) => e.source === held.source && e.target === held.target)
      if (again) {
        selectedEdge = again
        refreshCard()
      } else {
        setEdgeSelection(null)
      }
    }
    // The layout re-settles around whatever survived the window, so the node
    // the reader is holding can drift out of frame - on an entry page's small
    // map, that is the whole subject walking off. Hold it, without refitting:
    // focusOn is a nudge that does nothing while the node is comfortably in
    // view, so a scrub that barely moves anything moves the camera not at all.
    if (keepFocus && selectedId && visibleIds.has(selectedId) && !reveal?.running) {
      engine.setInsets(measureInsets())
      engine.focusOn(selectedId, null)
    }
  }

  let lastBucket = aspectBucket()
  const resizeObserver = new ResizeObserver(() => {
    // A hidden host (display:none while an ask runs, or behind another panel)
    // measures 0x0; that is not a new aspect, and re-laying out for it would
    // scatter the graph twice per round trip. Keep the layout for its return.
    const rect = container.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    reserveScrubRoom()
    // The chrome reflows with the host (the legend becomes a top row on
    // narrow screens), so the free area is re-measured on every resize; a
    // view the reader has not taken is refitted into it.
    engine.setInsets(measureInsets())
    // A host grown to hold its card (fitHostToCard) changes aspect for the
    // card's sake, not the reader's: re-laying out for it would rebuild the
    // scene and drop the very selection the card is showing. Hold the layout
    // until the card closes and the host is its own size again.
    if (hostBase) return
    if (reveal?.running) { reveal.remeasure(); return }
    const bucket = aspectBucket()
    if (bucket !== lastBucket) {
      lastBucket = bucket
      pushData()
    } else if (!engine.viewOwned) {
      engine.fit(false, overviewScale())
    }
  })
  resizeObserver.observe(container)
  /** How much of the left column the docked scrub takes, for the legend's max-height. */
  function reserveScrubRoom() {
    const docked = scrub && !compactScrub ? scrub.offsetHeight : 0
    container.style.setProperty('--mm-scrub-h', `${docked}px`)
  }

  // --- Legend / filter -------------------------------------------------
  const chips = new Map<string, HTMLButtonElement>()
  const applyIsolate = (group: string | null) => {
    activeGroup = group !== null && group !== 'parties' && group !== 'public money' && (graph.groupStyles.has(group) || raw.nodes.some(n => n.kind === 'donor' && n.industry === group)) ? group : null
    for (const [g, c] of chips) {
      c.setAttribute('aria-pressed', String(g === activeGroup))
      if (activeGroup !== null && g !== activeGroup) c.setAttribute('data-dimmed', '')
      else c.removeAttribute('data-dimmed')
    }
    pushData()
    words.isolate(activeGroup)
  }
  if (legend) {
    const legendGroups = [...CLUSTER_COLOURS.keys()].filter(
      (group) => group !== 'parties' && group !== 'public money' && graph.groupStyles.has(group),
    )
    for (const group of legendGroups) {
      const chip = el('button', 'mm-chip', legend)
      chip.type = 'button'
      chip.setAttribute('aria-pressed', 'false')
      const dot = el('span', 'mm-dot', chip)
      dot.style.background = clusterColour(group).colour
      // The keys are lower case because they are data; the legend is a list of
      // names a reader reads, so it takes sentence case like every other label.
      el('span', '', chip).textContent = sentence(group)
      chip.append(' ') // so the name and count read as two words, not "Unions31"
      el('span', 'mm-chip-count', chip).textContent = String(graph.groupStyles.get(group)?.count ?? 0)
      chip.addEventListener('click', () => applyIsolate(activeGroup === group ? null : group))
      chips.set(group, chip)
    }
    if (hasGrants) {
      const grantor = raw.nodes.find((n) => n.kind === 'grantor' && n.flow !== 'contracts') ?? raw.nodes.find((n) => n.kind === 'grantor')
      const toggle = el('button', 'mm-chip mm-grants-toggle', legend)
      toggle.type = 'button'
      toggle.setAttribute('aria-pressed', String(grantsOn))
      toggle.title = 'Public money the donors on this map received, grants and contracts, drawn as flows out from the hubs'
      const dot = el('span', 'mm-dot', toggle)
      dot.style.background = grantor ? hubColour(grantor) : GRANTOR_COLOUR
      el('span', '', toggle).textContent = 'Public money'
      toggle.append(' ')
      // Donors with either kind of public money, counted once.
      const n = raw.nodes.filter((d) => d.kind === 'donor' && (d.grants || d.contracts)).length
      el('span', 'mm-chip-count', toggle).textContent = String(n)
      toggle.addEventListener('click', () => {
        grantsOn = !grantsOn
        toggle.setAttribute('aria-pressed', String(grantsOn))
        if (!grantsOn && selectedId?.startsWith('grantor:')) setSelection(null)
        if (!grantsOn && selectedEdge && isGrantEdge(selectedEdge)) setEdgeSelection(null)
        pushData()
      })
    }
    if (hint) legend.append(hint) // after the chips
  }

  // --- Find-in-map ------------------------------------------------------
  const find = full ? el('div', 'mm-find', container) : null
  if (find) {
    find.dataset.uiSize = 'compact'
    const input = el('input', 'ui-input', find)
    input.type = 'search'
    input.placeholder = 'Find a donor or party…'
    input.setAttribute('aria-label', 'Find a donor or party by name')
    const list = el('ul', 'mm-find-list', find)
    const runFind = () => {
      const q = input.value.trim().toLowerCase()
      list.replaceChildren()
      if (q.length < 2) return
      const scored = graph.nodes
        .map((n) => {
          const label = n.label.toLowerCase()
          const at = label.indexOf(q)
          // Prefix beats word-start beats anywhere; misses drop out.
          const score = at === 0 ? 0 : label.includes(` ${q}`) ? 1 : at > 0 ? 2 : -1
          return { n, score, at }
        })
        .filter((s) => s.score >= 0)
        .sort((a, b) => a.score - b.score || a.n.label.length - b.n.label.length)
        .slice(0, 8)
      for (const { n } of scored) {
        const li = el('li', '', list)
        const b = el('button', '', li)
        b.type = 'button'
        const dot = el('span', 'mm-dot', b)
        dot.style.background = n.colour ?? clusterColour(n.group).colour
        const name = el('span', 'mm-row-name', b)
        name.textContent = n.label
        b.addEventListener('click', () => {
          input.value = ''
          list.replaceChildren()
          setSelection(n.id, { user: true })
        })
      }
    }
    input.addEventListener('input', runFind)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') list.querySelector('button')?.click()
      if (e.key === 'Escape') {
        input.value = ''
        list.replaceChildren()
        e.stopPropagation()
      }
    })
  }

  // --- Time scrub -------------------------------------------------------
  // One control in two dresses. Full chrome gets the labelled plate bottom
  // left; mini chrome (and full chrome on a phone) gets the same two thumbs
  // and CPI switch on one compact row. Both run the identical view logic.
  const compactScrub = !full
  const scrub = (opts.scrub ?? full) && yearMax > yearMin
    ? el('div', compactScrub ? 'mm-scrub mm-scrub-mini' : 'mm-scrub', container)
    : null
  if (scrub) {
    // Ahead of the card in the DOM, so Tab reaches the thumbs before the
    // twenty-odd rows of an open card rather than after them. Everything here
    // is absolutely positioned, so nothing moves on screen.
    container.insertBefore(scrub, card)
    // The thumbs read by the first year of each financial year, as the
    // returns are filed and as every card's span reads.
    scrub.title = 'Financial years, by the year each begins: 2024 is 2024–25'
    const label = el('div', 'mm-scrub-label', scrub)
    if (!compactScrub) {
      const caption = el('span', 'mm-scrub-caption', label)
      caption.textContent = 'Financial years'
    }
    const years = el('span', 'mm-scrub-years', label)
    const rail = el('div', 'mm-scrub-rail', scrub)
    const fill = el('div', 'mm-scrub-fill', el('div', 'mm-scrub-track', rail))
    const lo = el('input', '', rail)
    const hi = el('input', '', rail)
    for (const [input, name] of [[lo, 'from'], [hi, 'to']] as const) {
      input.type = 'range'
      input.min = String(yearMin)
      input.max = String(yearMax)
      input.setAttribute('aria-label', `Show flows ${name} year`)
    }
    lo.value = String(yearLo)
    hi.value = String(yearHi)
    const showYears = () => {
      years.textContent = yearLo === yearHi ? `${yearLo}` : `${yearLo} – ${yearHi}`
      const span = Math.max(1, yearMax - yearMin)
      fill.style.left = `${((yearLo - yearMin) / span) * 100}%`
      fill.style.right = `${((yearMax - yearHi) / span) * 100}%`
    }
    showYears()

    const cpi = el('label', 'mm-cpi', scrub)
    const cpiInput = el('input', '', cpi)
    cpiInput.type = 'checkbox'
    cpiInput.checked = adjustForInflation
    // The label's long and short names are swapped by CSS; the control keeps one name of its own.
    cpiInput.setAttribute('aria-label', 'Adjust for inflation')
    const cpiCopy = el('span', 'mm-cpi-copy', cpi)
    const cpiName = el('span', 'mm-cpi-name', cpiCopy)
    el('span', 'mm-cpi-long', cpiName).textContent = 'Adjust for inflation'
    el('span', 'mm-cpi-short', cpiName).textContent = 'Inflation'  // the phone strip's one-word name
    const cpiNote = el('span', 'mm-cpi-note', cpiCopy)
    cpiNote.textContent = 'in 2025–26 dollars, ABS CPI'
    // The compact strip has no room for the note: a small i opens it as a
    // popover beneath the strip (outside the label, so a tap never toggles
    // the switch by accident).
    const cpiInfo = el('button', 'mm-cpi-info', scrub)
    cpiInfo.type = 'button'
    cpiInfo.setAttribute('aria-label', 'About the inflation adjustment')
    cpiInfo.setAttribute('aria-expanded', 'false')
    el('span', '', cpiInfo).textContent = 'i'
    const cpiPop = el('div', 'mm-cpi-pop', scrub)
    cpiPop.hidden = true
    cpiPop.setAttribute('role', 'note')
    cpiPop.textContent = 'Adjusted to 2025–26 dollars with the ABS Consumer Price Index (all groups, Australia, financial-year average). Nominal figures are on the returns.'
    const closePop = () => { cpiPop.hidden = true; cpiInfo.setAttribute('aria-expanded', 'false') }
    cpiInfo.addEventListener('click', (event) => {
      event.stopPropagation()
      const open = cpiPop.hidden
      cpiPop.hidden = !open
      cpiInfo.setAttribute('aria-expanded', String(open))
    })
    document.addEventListener('pointerdown', (event) => {
      if (!cpiPop.hidden && !cpiPop.contains(event.target as Node) && event.target !== cpiInfo && !cpiInfo.contains(event.target as Node)) closePop()
    })
    scrub.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !cpiPop.hidden) { closePop(); cpiInfo.focus() } })

    syncScrubControls = () => {
      if (scrubPending) cancelAnimationFrame(scrubPending)
      scrubPending = 0
      lo.value = String(yearLo)
      hi.value = String(yearHi)
      cpiInput.checked = adjustForInflation
      showYears()
    }
    const applyScrub = () => {
      // The two thumbs may cross; the window is always the ordered pair.
      const a = Number(lo.value)
      const b = Number(hi.value)
      yearLo = Math.min(a, b)
      yearHi = Math.max(a, b)
      yearsInUrl = true
      showYears()
      syncUrlState()
      if (scrubPending) return
      scrubPending = requestAnimationFrame(() => {
        scrubPending = 0
        if (destroyed) return
        pushData({ keepFocus: true })
      })
    }
    lo.addEventListener('input', applyScrub)
    hi.addEventListener('input', applyScrub)
    cpiInput.addEventListener('change', () => {
      adjustForInflation = cpiInput.checked
      syncUrlState()
      pushData({ keepFocus: true })
    })
  }

  // --- Info card -------------------------------------------------------
  const row = (
    parent: HTMLElement,
    colour: string | null,
    name: string,
    amount: number,
    years: string,
    onClick: (() => void) | null,
  ) => {
    const item = el('li', '', parent)
    const body = el('button', 'mm-row', item)
    body.type = 'button'
    // The row's pieces run together as one string otherwise ("Westpac$55.2m1998–2024").
    body.setAttribute('aria-label', [name, formatMoney(amount), years].filter(Boolean).join(', '))
    if (!onClick) body.disabled = true
    else body.addEventListener('click', onClick)
    if (colour) {
      const dot = el('span', 'mm-dot', body)
      dot.style.background = colour
    }
    const label = el('span', 'mm-row-name', body)
    label.textContent = name
    const amt = el('span', 'mm-row-amt', body)
    amt.textContent = formatMoney(amount)
    if (years) {
      const span = el('span', 'mm-row-years', body)
      span.textContent = years
    }
  }

  /** Public funding is grouped by record category, with projects nested below. */
  const awardGroup = (parent: HTMLElement, label: string, colour: string, block: GrantsBlock,
    noun: string, onClick: (() => void) | null) => {
    const group = el('section', 'mm-award-group', parent)
    const heading = el('div', 'mm-award-heading', group)
    const title = el('h3', 'mm-award-title', heading)
    const dot = el('span', 'mm-dot', title)
    dot.style.background = colour
    dot.setAttribute('aria-hidden', 'true')
    if (onClick) {
      const button = el('button', 'mm-award-category', title)
      button.type = 'button'
      el('span', 'mm-award-label', button).textContent = label
      button.title = `Explore ${label.toLowerCase()} on the map`
      button.addEventListener('click', onClick)
      const arrow = el('span', 'mm-award-arrow', button)
      arrow.textContent = '›'
      arrow.setAttribute('aria-hidden', 'true')
    } else title.append(label)
    el('strong', 'mm-award-total', heading).textContent = formatMoney(block.total)
    el('p', 'mm-award-meta', group).textContent = `${block.count.toLocaleString()} ${noun}${block.count === 1 ? '' : 's'} · ${yearSpan(block.firstYear, block.lastYear)}`
    const entries = (block.top ?? []).slice(0, 3)
    if (entries.length) {
      const projects = el('ul', 'mm-award-projects', group)
      for (const [name, amount] of entries) {
        const item = el('li', 'mm-award-project', projects)
        el('span', 'mm-award-project-name', item).textContent = name
        // A single project already shares the category total directly above it.
        if (entries.length > 1 || amount !== block.total) {
          el('span', 'mm-award-project-amount', item).textContent = formatMoney(amount)
        }
      }
    }
  }

  /** The card's one primary action: the shared navy button. */
  const primary = (parent: HTMLElement, href: string, label: string) => {
    const a = el('a', 'mm-ask ui-button', parent)
    a.dataset.variant = 'primary'
    a.href = href
    a.textContent = label
  }
  /** The quiet row under a card's figures; the actions go in with `action`. */
  const actionRow = (parent: HTMLElement) => {
    const row = el('div', 'mm-actions', parent)
    row.setAttribute('role', 'group')
    row.setAttribute('aria-label', 'More about this')
    return row
  }
  /**
   * One short action in the row: a real link when it has an href, a button
   * when it does something here. `name` is the full sentence the short label
   * stands for, so the accessible name still begins with the visible words.
   */
  const action = (row: HTMLElement, label: string, opts: { name?: string; href?: string; onClick?: () => void }) => {
    const node = opts.href ? el('a', 'mm-action', row) : el('button', 'mm-action', row)
    if (node instanceof HTMLAnchorElement) node.href = opts.href!
    else node.type = 'button'
    // The label is its own span so the hover underline stops short of the
    // trailing dot and the Sources chevron.
    el('span', 'mm-action-label', node).textContent = label
    if (opts.name && opts.name !== label) {
      node.setAttribute('aria-label', opts.name)
      node.title = opts.name
    }
    if (opts.onClick) node.addEventListener('click', opts.onClick)
    return node
  }
  const jurisdiction = typeof raw.meta?.jurisdiction === 'string'
    ? raw.meta.jurisdiction
    : 'federal'
  const inflationFineprint = (parent: HTMLElement) => {
    if (!adjustForInflation) return
    const note = el('p', 'mm-card-fine', parent)
    note.textContent = 'Adjusted to 2025–26 dollars with the ABS Consumer Price Index ' +
      '(all groups, Australia, financial-year average). Nominal figures are on the returns.'
  }
  /** Keep the map independent of the page shell: it only describes the held flow. */
  const explainAction = (row: HTMLElement, detail: Record<string, string>) =>
    action(row, 'Explain', {
      name: 'Explain this flow',
      onClick: () => {
        container.dispatchEvent(new CustomEvent('opax:explain', {
          bubbles: true,
          detail: { ...detail, jurisdiction },
        }))
      },
    })
  /**
   * The Sources disclosure: verified excerpts from the source records, loaded
   * on first open into a slot under the row and toggled after that. Loading,
   * nothing-found and failure each read as a note in the slot; a failure
   * leaves the button armed so the next press tries again.
   */
  let evidenceSeq = 0
  const sourcesAction = (row: HTMLElement, card: HTMLElement, node: MoneyNode) => {
    const button = action(row, 'Sources', { name: 'Sources: mentions in the source records' }) as HTMLButtonElement
    const chevron = el('span', 'mm-action-chevron', button)
    chevron.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" focusable="false"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    chevron.setAttribute('aria-hidden', 'true')
    const slot = el('section', 'mm-evidence', card)
    slot.id = `mm-evidence-${++evidenceSeq}`
    slot.hidden = true
    slot.setAttribute('aria-label', 'Source records')
    slot.setAttribute('aria-live', 'polite')
    button.setAttribute('aria-controls', slot.id)
    button.setAttribute('aria-expanded', 'false')
    const setOpen = (open: boolean) => {
      slot.hidden = !open
      button.setAttribute('aria-expanded', String(open))
    }
    const note = (text: string) => {
      slot.replaceChildren()
      el('p', 'mm-evidence-note', slot).textContent = text
      setOpen(true)
    }
    const alive = () => !destroyed && selectedId === node.id && slot.isConnected
    let loaded: boolean | null = null // null until a load settles; then whether excerpts were found
    button.addEventListener('click', async () => {
      if (loaded !== null) { setOpen(slot.hidden); return }
      button.disabled = true
      button.setAttribute('aria-busy', 'true')
      note('Finding source excerpts…')
      try {
        const { mountEvidence } = await import('../public/evidence.js')
        const found = await mountEvidence(slot, { name: node.label }, { compact: true, alive })
        if (!alive()) return
        loaded = found
        if (found) setOpen(true)
        else note('No verified excerpts available yet.')
      } catch {
        if (slot.isConnected) note('The source excerpts could not be loaded. Press Sources to try again.')
      } finally {
        if (slot.isConnected) {
          button.disabled = false
          button.removeAttribute('aria-busy')
        }
      }
    })
  }
  /** Lays a node card's planned actions out: the filled primary, then the quiet row, then the Sources slot. */
  const renderActions = (card: HTMLElement, node: MoneyNode, plan: CardActions, explainDetail: Record<string, string>) => {
    if (plan.primary) primary(card, plan.primary.href, plan.primary.label)
    if (!plan.actions.length) return
    const row = actionRow(card)
    for (const item of plan.actions) {
      if (item.id === 'explain') explainAction(row, explainDetail)
      else if (item.id === 'sources') sourcesAction(row, card, node)
      else action(row, item.label, { name: item.name, href: item.href })
    }
  }

  /** The industry that gave a party the most, for its ask-trigger. */
  const topIndustryOf = (partyId: string): string | null => {
    const sums = new Map<string, number>()
    for (const e of view.edges) {
      if (e.target !== partyId) continue
      const donor = view.nodes.get(e.source)
      if (!donor || donor.industry === 'other') continue
      const industry = donor.industry.replace(/_/g, ' ')
      sums.set(industry, (sums.get(industry) ?? 0) + e.total)
    }
    let best: string | null = null
    let bestTotal = 0
    for (const [industry, total] of sums) {
      if (total > bestTotal) {
        bestTotal = total
        best = industry
      }
    }
    return best
  }

  /** The card's close control: the shared quiet icon button. */
  const closeButton = (onClose: () => void) => {
    const close = el('button', 'mm-card-close ui-button ui-icon-button', card)
    close.type = 'button'
    close.dataset.variant = 'quiet'
    close.dataset.uiSize = 'compact'
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>'
    close.setAttribute('aria-label', 'Close details')
    close.addEventListener('click', onClose)
  }
  /** The card's title: the name, with the node's colour as a dot beside it. */
  const cardTitle = (text: string, colour?: string) => {
    const title = el('h2', '', card)
    if (colour) {
      const dot = el('span', 'mm-dot mm-title-dot', title)
      dot.style.background = colour
      dot.setAttribute('aria-hidden', 'true')
    }
    title.append(text)
  }
  /** What the card is about, as a status label in sentence case. */
  const cardTag = (text: string) => {
    el('span', 'mm-card-tag ui-status', card).textContent = text
  }

  const renderCard = (node: MoneyNode) => {
    card.innerHTML = ''
    closeButton(() => setSelection(null, { user: true }))
    const plan = planCardActions(node, {
      subject: opts.subject,
      jurisdiction: typeof raw.meta.jurisdiction === 'string' && raw.meta.jurisdiction ? raw.meta.jurisdiction : undefined,
      grantsOn,
      routeBase,
      askUrl,
      topIndustry: node.kind === 'party' ? topIndustryOf(node.id) : null,
    })

    if (node.kind === 'agency' || node.kind === 'supplier') {
      cardTitle(node.label, markColour(node))
      cardTag(node.kind === 'agency' ? 'Government agency' : 'Government supplier')
      el('div', 'mm-card-total', card).textContent = formatMoney(node.total)
      el('p', 'mm-card-sub', card).textContent = `${node.count.toLocaleString()} recorded contracts${node.id === opts.subject ? '' : ' in this relationship'}`
      el('div', 'mm-card-section', card).textContent = node.kind === 'agency' ? 'Contracts awarded to' : 'Contracts awarded by'
      const list = el('ul', 'mm-rows', card)
      for (const edge of view.edges.filter(e => e.source === node.id || e.target === node.id).sort((a, b) => b.total - a.total)) {
        const other = view.nodes.get(edge.source === node.id ? edge.target : edge.source)
        if (other) row(list, other.colour ?? null, other.label, edge.total, `${edge.count.toLocaleString()} contracts`, () => setSelection(other.id, { user: true }))
      }
      renderActions(card, node, plan, {})
      el('p', 'mm-card-fine', card).textContent = 'Recorded contract commitments, not verified payments. The map shows the largest relationships; the profile lists all available records.'
      return
    }
    cardTitle(node.label, markColour(node))
    cardTag(node.kind === 'party'
      ? 'Political party'
      : node.kind === 'grantor' ? 'Public money' : sentence(node.industry.replace(/_/g, ' ')))

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(node.total)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(node.firstYear, node.lastYear)
    // Inside a year window the figures are the window's, and the span is
    // the years within it that carry anything; a subject with nothing there
    // says so rather than showing an empty zero.
    sub.textContent = node.count === 0 && view.span
      ? (node.kind === 'grantor' ? `Nothing awarded in ${view.span}` : `Nothing disclosed in ${view.span}`)
      : node.kind === 'party'
        ? `Received across ${node.count.toLocaleString()} receipts · ${span}`
        : node.kind === 'grantor'
          ? (node.flow === 'contracts'
            ? `Held by donors on this map across ${node.count.toLocaleString()} contracts · ${span}`
            : `Awarded to donors on this map across ${node.count.toLocaleString()} grants · ${span}`)
          : `Given across ${node.count.toLocaleString()} donations · ${span}`
    inflationFineprint(card)

    const listTitle = el('div', 'mm-card-section', card)
    const list = el('ul', 'mm-rows', card)
    if (node.kind === 'donor') {
      listTitle.textContent = 'Where it went'
      const out = view.edges
        .filter((e) => e.source === node.id)
        .sort((a, b) => b.total - a.total)
      for (const edge of out) {
        const party = view.nodes.get(edge.target)
        if (!party) continue
        row(
          list,
          markColour(party),
          party.label,
          edge.total,
          yearSpan(edge.firstYear, edge.lastYear),
          () => setSelection(party.id, { user: true }),
        )
      }
      if ((node.grants || node.contracts) && grantsOn) {
        // Public money going the other way: shown beside the donations, never
        // summed with them. The figures follow the year window like the rest.
        const grantsTitle = el('div', 'mm-card-section', card)
        grantsTitle.textContent = 'Public money received'
        const glist = el('div', 'mm-award-groups', card)
        const grantor = raw.nodes.find((n) => n.kind === 'grantor' && n.flow !== 'contracts')
        const contractor = raw.nodes.find((n) => n.kind === 'grantor' && n.flow === 'contracts')
        if (node.grants) {
          const g = view.grants.get(node.id) ?? node.grants
          if (g.count > 0) {
            awardGroup(glist, grantor?.label ?? 'Grants', GRANTOR_COLOUR, g, 'grant',
              grantor ? () => setSelection(grantor.id, { user: true }) : null)
          } else {
            const none = el('p', 'mm-row-note', glist)
            none.textContent = view.span ? `No grants started in ${view.span}` : 'No grants'
          }
        }
        if (node.contracts) {
          const c = view.contracts.get(node.id) ?? node.contracts
          if (c.count > 0) {
            awardGroup(glist, contractor?.label ?? 'Contracts', CONTRACTOR_COLOUR, c, 'contract',
              contractor ? () => setSelection(contractor.id, { user: true }) : null)
          } else {
            const none = el('p', 'mm-row-note', glist)
            none.textContent = view.span ? `No contracts started in ${view.span}` : 'No contracts'
          }
        }
        if (node.via === 'public_money') {
          const why = el('p', 'mm-card-fine', card)
          why.textContent = 'On the map for the public money it holds, not for the size of its donations.'
        }
      }
      renderActions(card, node, plan, { kind: 'donor', from: node.label })
    } else if (node.kind === 'grantor') {
      const contracts = node.flow === 'contracts'
      listTitle.textContent = contracts
        ? 'Largest contractors among the donors on this map'
        : 'Largest recipients among the donors on this map'
      const outgoing = view.edges
        .filter((e) => e.source === node.id)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
      for (const edge of outgoing) {
        const donor = view.nodes.get(edge.target)
        if (!donor) continue
        row(
          list,
          clusterColour(donor.group).colour,
          donor.label,
          edge.total,
          yearSpan(edge.firstYear, edge.lastYear),
          () => setSelection(donor.id, { user: true }),
        )
      }
      const fine = el('p', 'mm-card-fine', card)
      const source = contracts ? raw.meta.contracts_source : raw.meta.grants_source
      const coverage = contracts && typeof raw.meta.contracts_coverage === 'string' && raw.meta.contracts_coverage
        ? ` ${raw.meta.contracts_coverage}.` : ''
      fine.textContent = typeof source === 'string'
        ? `${source}.${coverage} Public money is drawn the other way from donations and never summed with them; a donor ${contracts ? 'holding a contract' : 'receiving a grant'} is a fact, not a finding.`
        : 'Public money is drawn the other way from donations and never summed with them.'
      renderActions(card, node, plan, {})
    } else {
      listTitle.textContent = 'Top donors shown on the map'
      const incoming = view.edges
        .filter((e) => e.target === node.id)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
      for (const edge of incoming) {
        const donor = view.nodes.get(edge.source)
        if (!donor) continue
        row(
          list,
          clusterColour(donor.group).colour,
          donor.label,
          edge.total,
          yearSpan(edge.firstYear, edge.lastYear),
          () => setSelection(donor.id, { user: true }),
        )
      }
      renderActions(card, node, plan, { kind: 'party', to: node.label })
    }
  }

  /**
   * The card for an aggregated flow - a folded cluster's summed giving to
   * one party. The engine synthesises these while the cluster is a hub; the
   * source is `hub:<group>`, so the detail comes from the raw edges here.
   */
  const renderHubFlowCard = (edge: MapEdge, group: string) => {
    const party = view.nodes.get(edge.target)
    if (!party) return
    card.innerHTML = ''
    closeButton(() => setEdgeSelection(null))

    const style = clusterColour(group)
    const groupName = sentence(group)
    cardTitle(`${groupName} → ${party.label}`)
    cardTag('Industry flow')

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(edge.total ?? 0)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(edge.firstYear ?? null, edge.lastYear ?? null)
    const donors = edge.count ?? 0
    sub.textContent = `From ${donors === 1 ? '1 donor' : `${donors.toLocaleString()} donors`} shown` +
      `${span ? ` · ${span}` : ''}`
    inflationFineprint(card)

    const listTitle = el('div', 'mm-card-section', card)
    listTitle.textContent = 'Largest donors in this flow'
    const list = el('ul', 'mm-rows', card)
    const flows = view.edges
      .filter((e) => e.target === party.id && view.nodes.get(e.source)?.group === group)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
    for (const flow of flows) {
      const donor = view.nodes.get(flow.source)
      if (!donor) continue
      row(list, style.colour, donor.label, flow.total, yearSpan(flow.firstYear, flow.lastYear),
        () => setSelection(donor.id, { user: true }))
    }
    const actions = actionRow(card)
    if (!['individuals', 'other'].includes(group)) {
      action(actions, 'Ask', { name: `Ask what parliament has said about ${group}`, href: askUrl(group) })
    }
    explainAction(actions, { kind: 'industry', from: groupName, to: party.label })
    action(actions, `Show only ${group}`, {
      name: `Show only ${group} on the map`,
      onClick: () => {
        setEdgeSelection(null)
        applyIsolate(group)
      },
    })
  }

  /** A grant flow: the grantor's public money to one donor on the map. */
  const renderGrantFlowCard = (edge: MapEdge, grantor: MoneyNode) => {
    const donor = view.nodes.get(edge.target)
    if (!donor) return
    card.innerHTML = ''
    closeButton(() => setEdgeSelection(null))
    cardTitle(`${grantor.label} → ${donor.label}`)
    cardTag('Public money')
    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(edge.total ?? 0)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(edge.firstYear ?? null, edge.lastYear ?? null)
    sub.textContent = `Across ${(edge.count ?? 0).toLocaleString()} grants${span ? ` · ${span}` : ''}`
    inflationFineprint(card)
    const list = el('ul', 'mm-rows', card)
    row(list, hubColour(grantor), grantor.label, grantor.total, '',
      () => setSelection(grantor.id, { user: true }))
    row(list, markColour(donor), donor.label, donor.total, 'given to parties',
      () => setSelection(donor.id, { user: true }))
    for (const [program, dollars] of (donor.grants?.top ?? []).slice(0, 3)) {
      row(list, null, program, dollars, '', null)
    }
    const fine = el('p', 'mm-card-fine', card)
    fine.textContent = 'Public money going the other way; not summed with the donations. A donor receiving a grant is a fact, not a finding.'
    if (donor.grants?.rid && !/^(null|undefined)$/i.test(donor.grants.rid)) {
      action(actionRow(card), 'Open grants file', {
        name: 'Open their grants file',
        href: `${routeBase}/explore?game=grants&jur=${encodeURIComponent(donor.grants.jur ?? 'federal')}&open=${encodeURIComponent(donor.grants.rid)}`,
      })
    }
  }

  const renderEdgeCard = (edge: MapEdge) => {
    if (edge.hub) {
      renderHubFlowCard(edge, edge.hub)
      return
    }
    const from = view.nodes.get(edge.source)
    if (from?.kind === 'agency') {
      const to = view.nodes.get(edge.target)
      if (!to) return
      card.replaceChildren()
      closeButton(() => setEdgeSelection(null))
      cardTitle(`${from.label} → ${to.label}`)
      cardTag('Contracts awarded')
      el('div', 'mm-card-total', card).textContent = formatMoney(edge.total ?? 0)
      el('p', 'mm-card-sub', card).textContent = `${(edge.count ?? 0).toLocaleString()} recorded contracts`
      const list = el('ul', 'mm-rows', card)
      for (const node of [from, to]) row(list, node.colour ?? null, node.label, edge.total ?? 0, '', () => setSelection(node.id, { user: true }))
      el('p', 'mm-card-fine', card).textContent = 'Contract commitments, not verified payments. Open either profile for the source records.'
      return
    }
    if (from?.kind === 'grantor') {
      renderGrantFlowCard(edge, from)
      return
    }
    const donor = view.nodes.get(edge.source)
    const party = view.nodes.get(edge.target)
    if (!donor || !party) return
    card.innerHTML = ''
    closeButton(() => setEdgeSelection(null))

    cardTitle(`${donor.label} → ${party.label}`)
    cardTag(`${sentence(donor.industry.replace(/_/g, ' '))} money`)

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(edge.total ?? 0)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(edge.firstYear ?? null, edge.lastYear ?? null)
    sub.textContent =
      `Across ${(edge.count ?? 0).toLocaleString()} donations${span ? ` · ${span}` : ''}`
    inflationFineprint(card)

    const list = el('ul', 'mm-rows', card)
    row(list, markColour(donor), donor.label,
      donor.total, '', () => setSelection(donor.id, { user: true }))
    row(list, markColour(party), party.label,
      party.total, '', () => setSelection(party.id, { user: true }))

    const actions = actionRow(card)
    if (edge.firstYear && edge.lastYear) {
      const industry = donor.industry.replace(/_/g, ' ')
      action(actions, 'Search', {
        name: `Search what was said about ${industry} in ${span}`,
        href: `/search?q=${encodeURIComponent(industry)}` +
          `&from=${edge.firstYear}&to=${edge.lastYear}`,
      })
    }
    explainAction(actions, { kind: 'donor', from: donor.label, to: party.label })
  }

  /**
   * The canvas the floating chrome covers, so the fit and every focus move
   * centre the scene in the unobstructed area: the legend (a left column, or
   * a top row on narrow screens), the find box along the top, the zoom
   * buttons on the right, the scrub along the bottom. Measured
   * rather than assumed, so a host that restyles the chrome keeps a clear
   * fit; each side is capped so a strange layout cannot squeeze the scene
   * away.
   */
  const chromeInsets = (): Insets => {
    const insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 }
    const host = container.getBoundingClientRect()
    if (host.width < 1 || host.height < 1) return insets
    const gap = 10
    const cover = (element: HTMLElement | null, edge: keyof Insets) => {
      if (!element) return
      const rect = element.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      // A panel along the top or bottom that already sits inside the left
      // or right strip (the scrub under the legend's column) costs nothing
      // more; a full-width band for it would only squeeze the scene.
      if (edge === 'top' || edge === 'bottom') {
        const beyondLeft = rect.right - host.left - insets.left
        const beyondRight = host.right - rect.left - insets.right
        if (beyondLeft <= 24 || beyondRight <= 24) return
      }
      const extent = edge === 'left'
        ? rect.right - host.left
        : edge === 'right'
        ? host.right - rect.left
        : edge === 'top'
        ? rect.bottom - host.top
        : host.bottom - rect.top
      const cap = edge === 'left' || edge === 'right' ? host.width * 0.4 : host.height * 0.4
      insets[edge] = Math.max(insets[edge], Math.min(extent + gap, cap))
    }
    // Columns first, so the bands along the top and bottom can defer to them.
    const legendAsRow = legend !== null && legend.getBoundingClientRect().width > host.width * 0.5
    if (legend && !legendAsRow) cover(legend, 'left')
    cover(zoom, 'right')
    if (legend && legendAsRow) cover(legend, 'top')
    cover(find, 'top')
    // The scrub is normally the bottom-left plate, but the compact one moves
    // to the top on narrow screens; ask the layout which edge it took.
    if (scrub) {
      const rect = scrub.getBoundingClientRect()
      const onTop = rect.top + rect.height / 2 < host.top + host.height / 2
      cover(scrub, onTop ? 'top' : 'bottom')
    }
    return insets
  }

  /** The chrome insets plus the info card while it is open. */
  const measureInsets = (): Insets => {
    const insets = chromeInsets()
    if (card.hidden) return insets
    const rect = card.getBoundingClientRect()
    const host = container.getBoundingClientRect()
    // The card is a bottom sheet on narrow screens, a right panel otherwise.
    if (rect.width >= host.width - 40) insets.bottom = Math.max(insets.bottom, rect.height + 16)
    else insets.right = Math.max(insets.right, rect.width + 24)
    return insets
  }

  /**
   * A phone selection should show the connection it reveals, not merely prove
   * that the tapped dot remains somewhere in frame. Desktop keeps the gentler
   * focus nudge; coarse, narrow screens frame the subject with its strongest
   * visible neighbours in the space above the detail sheet.
   */
  const focusSelection = (id: string) => {
    const phone = window.matchMedia('(pointer: coarse)').matches &&
      container.getBoundingClientRect().width <= 720
    if (!phone) return engine.focusOn(id, null)
    const neighbours = visibleSceneEdges
      .filter((edge) => edge.source === id || edge.target === id)
      .sort((a, b) => (b.total ?? b.weight) - (a.total ?? a.weight))
      .map((edge) => edge.source === id ? edge.target : edge.source)
      .filter((other, index, all) => other !== id && all.indexOf(other) === index)
      .slice(0, 4)
    return engine.frameOn([id, ...neighbours], {
      fill: neighbours.length ? 0.88 : 0.58,
      padPx: 24,
      duration: engine.reducedMotion ? 0 : 700,
      ease: t => t * t * (3 - 2 * t),
    })
  }

  /**
   * Re-draw the open card from the current window, in place: the figures the
   * scene now shows, the reader's scroll position kept, and no focus change,
   * since a scrub step lands mid-drag on a thumb. A held flow is re-lit too,
   * as the engine keys emphasis by the flow's label and the label just moved.
   */
  const refreshCard = () => {
    const scrollTop = card.scrollTop
    if (selectedId) {
      const node = view.nodes.get(selectedId)
      if (!node) return
      renderCard(node)
      words.select(node, card, view)
    } else if (selectedEdge) {
      engine.setEmphasis({ selectedId: null, pathEdges: [selectedEdge], pathFrom: null })
      renderEdgeCard(selectedEdge)
    }
    card.scrollTop = scrollTop
    fitHostToCard()
    requestAnimationFrame(() => {
      if (!card.hidden) engine.setInsets(measureInsets())
    })
  }

  /**
   * Select a node. `user: true` marks a reader-initiated selection (a click,
   * Enter, the find box, a card row) - only those reach opts.onSelect; the
   * focus seed, handle.select and filter-driven clears stay silent.
   */
  function setSelection(id: string | null, { user = false } = {}) {
    if (user) cancelReveal()
    selectedId = id
    selectedEdge = null
    const node = id ? view.nodes.get(id) ?? null : null
    // A re-select of the very node the reveal is lighting (the host echoing
    // its own seed) keeps the spotlight; anything else drops it.
    if (id !== spotlightFor) spotlightEdges = null
    applyEmphasis()
    if (node && !user && opts.openCard === false) {
      // Selected without the card: lit and framed, the plate left clear.
      card.hidden = true
      card.innerHTML = ''
      releaseHost()
      engine.setInsets(chromeInsets())
      requestAnimationFrame(() => {
        if (reveal?.running) reveal.remeasure()
        else if (selectedId) focusSelection(selectedId)
      })
    } else if (node) {
      renderCard(node)
      card.hidden = false
      fitHostToCard()
      // Measure after layout, then move the view into the space the card
      // leaves free - the same insets protocol the React shell ran.
      requestAnimationFrame(() => {
        if (card.hidden) return
        engine.setInsets(measureInsets())
        // The reveal owns the camera while it runs; it only wants the
        // measured insets, which its close-up is re-solved against.
        if (reveal?.running) reveal.remeasure()
        else if (selectedId) focusSelection(selectedId)
      })
      card.focus({ preventScroll: true })
    } else {
      card.hidden = true
      card.innerHTML = ''
      releaseHost()
      engine.setInsets(chromeInsets())
    }
    words.select(node, card, view)
    if (user) opts.onSelect?.(node)
  }

  /** Select a flow (edge). Reuses the engine's path emphasis to light it up. */
  function setEdgeSelection(edge: MapEdge | null) {
    cancelReveal()
    spotlightEdges = null
    selectedEdge = edge
    selectedId = null
    engine.setEmphasis({
      selectedId: null,
      pathEdges: edge ? [edge] : null,
      pathFrom: null,
    })
    if (edge) {
      renderEdgeCard(edge)
      card.hidden = false
      fitHostToCard()
      requestAnimationFrame(() => {
        if (!card.hidden) engine.setInsets(measureInsets())
      })
      card.focus({ preventScroll: true })
    } else {
      card.hidden = true
      card.innerHTML = ''
      releaseHost()
      engine.setInsets(chromeInsets())
    }
    words.selectEdge(edge)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (selectedId || selectedEdge)) {
      if (selectedEdge) setEdgeSelection(null)
      else setSelection(null, { user: true })
      canvas.focus({ preventScroll: true })
      event.stopPropagation()
    }
  }
  container.addEventListener('keydown', onKeyDown)

  /**
   * Where the money runs, largest first: the parties a donor gave the most
   * to, or the donors a party took the most from. The same ranking the card's
   * rows use, cut to the few the eye can follow in one frame.
   */
  const strongestFlows = (id: string) => {
    const node = view.nodes.get(id)
    if (!node) return null
    const incoming = node.kind === 'party' || node.kind === 'supplier'
    const flows = view.edges
      .filter((e) => (incoming ? e.target : e.source) === id)
      .sort((a, b) => b.total - a.total)
      .slice(0, incoming ? 5 : 4)
      .filter((e) => view.nodes.has(incoming ? e.source : e.target))
    if (flows.length === 0) return null
    return {
      ids: flows.map((e) => (incoming ? e.source : e.target)),
      edges: flows.map(toMapEdge),
    }
  }

  /**
   * Open on the subject, then pull out to the money. The card is already laid
   * out by here (setSelection opened it synchronously), so the free area is
   * known before the first frame is painted and the close-up is what the
   * reader sees the map open on - no fitted frame flashes behind it.
   */
  const startReveal = (focusId: string) => {
    const strongest = strongestFlows(focusId)
    if (!strongest) return
    engine.setInsets(measureInsets())
    reveal = runReveal(engine, { focusId, withIds: strongest.ids, edges: strongest.edges }, {
      spotlight: (on) => {
        spotlightEdges = on ? strongest.edges : null
        spotlightFor = on ? focusId : null
        applyEmphasis()
      },
      settled: () => {
        armedRelease = () => cancelReveal()
        container.addEventListener('pointermove', armedRelease)
      },
    })
  }

  /** Present only existing ids and observed endpoint pairs from the visible data. */
  const resetSceneWindow = (scene?: MoneyScene) => {
    cancelReveal()
    researchFilters = {}
    selectedId = null
    selectedEdge = null
    card.hidden = true
    card.innerHTML = ''
    releaseHost()
    const year = (value: number | undefined, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.max(yearMin, Math.min(yearMax, Math.trunc(value))) : fallback
    const from = year(scene?.from, yearMin)
    const to = year(scene?.to, yearMax)
    yearLo = Math.min(from, to)
    yearHi = Math.max(from, to)
    yearsInUrl = scene?.from !== undefined || scene?.to !== undefined
    adjustForInflation = false
    grantsOn = hasGrants
    legend?.querySelector('.mm-grants-toggle')?.setAttribute('aria-pressed', String(grantsOn))
    syncScrubControls()
    syncUrlState()
    applyIsolate(null)
    engine.setInsets(chromeInsets())
    words.select(null, card, view)
    applyEmphasis()
  }

  const presentScene = (scene: MoneyScene): boolean => {
    if (destroyed || !scene || !byId.has(scene.focusId)) return false
    resetSceneWindow(scene)
    if (!visibleSceneIds.has(scene.focusId)) return false
    const requested = new Set((scene.edges ?? []).map((edge) => JSON.stringify([edge.source, edge.target])))
    const edges = visibleSceneEdges.filter((edge) => requested.has(JSON.stringify([edge.source, edge.target])))
    const withIds = [...new Set(scene.withIds ?? [])].filter((id) => id !== scene.focusId && visibleSceneIds.has(id))
    selectedId = scene.focusId
    guidedScene = true
    spotlightFor = scene.focusId
    // Empty paths are deliberate: co-present nodes do not imply a connection.
    spotlightEdges = edges
    applyEmphasis()
    // Guided steps travel from the current camera pose. The opening reveal
    // deliberately snaps to a close-up, so it must not be reused here.
    engine.frameOn([scene.focusId, ...withIds], {
      fill: withIds.length ? 0.9 : 0.4,
      theta: withIds.length ? engine.swingTheta(scene.focusId, withIds, engine.viewAngles.phi) ?? undefined : undefined,
      padPx: 36,
      duration: engine.reducedMotion ? 0 : 1200,
      ease: t => t * t * (3 - 2 * t),
    })
    return true
  }

  const pauseScene = () => {
    if (destroyed) return
    const edges = spotlightEdges
    const focus = spotlightFor
    const strict = guidedScene
    cancelReveal()
    engine.stopViewMove()
    spotlightEdges = edges
    spotlightFor = focus
    guidedScene = strict
    applyEmphasis()
  }

  const clearScene = () => {
    if (destroyed) return
    resetSceneWindow()
    engine.fit(!engine.reducedMotion)
  }

  pushData()

  // The embed seed: mount already-selected with the camera on the node.
  // Deliberately silent - the host asked for it, so it is not an event.
  if (opts.focus && byId.has(opts.focus)) {
    setSelection(opts.focus)
    if (revealWanted) startReveal(opts.focus)
  }

  return {
    setFilters: (filters, route) => {
      if (destroyed) return
      cancelReveal()
      guidedScene = false
      selectedId = null
      selectedEdge = null
      card.hidden = true
      releaseHost()
      if (route) {
        const read = (key: string, fallback: number) => /^\d{4}$/.test(route.get(key) || '') ? Math.max(yearMin, Math.min(yearMax, Number(route.get(key)))) : fallback
        const from = read('from', yearMin), to = read('to', yearMax)
        yearLo = Math.min(from, to); yearHi = Math.max(from, to)
        yearsInUrl = route.has('from') || route.has('to')
        adjustForInflation = route.get('cpi') === '1'
        syncScrubControls()
      }
      researchFilters = { ...filters }
      applyIsolate(filters.industry || null)
    },
    presentScene,
    clearScene,
    pauseScene,
    select: (id) => setSelection(id),
    isolate: (group) => applyIsolate(group),
    fit: (animate = true) => engine.fit(animate),
    setPaused: (paused) => engine.setPaused(paused),
    destroy: () => {
      destroyed = true
      if (scrubPending) cancelAnimationFrame(scrubPending)
      for (const type of readerEvents) container.removeEventListener(type, onReaderInput, true)
      cancelReveal()
      container.removeEventListener('keydown', onKeyDown)
      resizeObserver.disconnect()
      engine.dispose()
      recoveryNotice?.remove()
      for (const child of [canvas, labels, legend, card, zoom, hint, find, scrub]) {
        child?.remove()
      }
      container.classList.remove('mm-root')
      delete container.dataset.mmChrome
    },
  }
}
