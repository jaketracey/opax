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
// (which doubles as an industry filter), the info card, the zoom buttons and
// the hint. The engine itself (map3d-engine.ts) is the ported corpuskit
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
import { ACCENT, CLUSTER_COLOURS, clusterColour, GRANTOR_COLOUR, SURFACE } from './palette.ts'
import { type Reveal, runReveal } from './reveal.ts'
import { mountWordsLayer } from './words.ts'
import { cpiMultiplier } from './cpi.ts'

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
  kind: 'donor' | 'party' | 'grantor'
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
  /** Grantor nodes: donors on this map they awarded to. */
  recipients?: number
  /** Grantor nodes: the explorer jurisdiction ('federal' | 'qld'). */
  explorer?: string
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
}

const isGrantEdge = (e: { source: string }) => e.source.startsWith('grantor:')

export type MoneyGraph = {
  meta: Record<string, unknown> & { coverage?: string; generated?: string }
  nodes: MoneyNode[]
  edges: MoneyEdge[]
}

export type MoneyMapOptions = {
  /** Builds the parliament ask-link for a donor's industry. */
  askUrl?: (industry: string) => string
  /**
   * Observe USER-initiated selections only - programmatic ones (the `focus`
   * seed, `handle.select`, a selection dropped by a filter) stay silent.
   */
  onSelect?: (node: MoneyNode | null) => void
  /** Node id to mount already-selected with the camera on it. */
  focus?: string
  /** 'full' (default): legend, find, time scrub, zoom, hint. 'mini': bare scene + cards. */
  chrome?: 'full' | 'mini'
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

const toMapNode = (n: MoneyNode): MapNode => ({
  id: n.id,
  label: n.label,
  group: n.group,
  weight: n.total / WEIGHT_SCALE,
  kind: n.kind,
  industry: n.industry,
  total: n.total,
  count: n.count,
  firstYear: n.firstYear,
  lastYear: n.lastYear,
  ...(n.colour ? { colour: n.colour } : {}),
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

  const counts = new Map<string, number>()
  for (const node of raw.nodes) counts.set(node.group, (counts.get(node.group) ?? 0) + 1)

  const groupStyles = new Map<string, GroupStyle>()
  for (const [group, count] of counts) {
    const style = clusterColour(group)
    groupStyles.set(group, {
      slot: slots.get(group) ?? (slots.get('other') ?? 0),
      colour: style.colour,
      ink: style.ink,
      hollow: false,
      count,
    })
  }

  const nodes = raw.nodes.map(toMapNode)
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
.mm-root ::-webkit-scrollbar-thumb { background: #cfc9ba; border-radius: 4px; }
.mm-root ::-webkit-scrollbar-thumb:hover { background: #a0761b; }
.mm-root * { scrollbar-width: thin; scrollbar-color: #cfc9ba transparent; }
.mm-root { position: relative; overflow: hidden; background: ${SURFACE};
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #33322e;
  transition: height 360ms cubic-bezier(0.22, 0.7, 0.3, 1); }
@media (prefers-reduced-motion: reduce) { .mm-root { transition: none; } }
/* A host grown to hold its card (see fitHostToCard): the card may use the
   room, short of whatever gap fitHostToCard reserved above it for chrome
   (a phone's scrub bar, relocated to the top) and a floor of visible map. */
.mm-root.mm-grown .mm-card { max-height: calc(100% - var(--mm-grown-gap, 64px)); }
.mm-canvas { display: block; width: 100%; height: 100%; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; outline-offset: -3px; }
.mm-canvas:focus-visible { outline: 2px solid ${ACCENT}; }
.mm-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.rp-map3d-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 11px; color: #4a4942; will-change: transform;
  text-shadow: 0 0 4px ${SURFACE}, 0 0 8px ${SURFACE}; }
.rp-map3d-label[data-emphasised] { font-size: 12px; font-weight: 600; color: #26251f; }
.rp-map3d-label[data-selected] { font-size: 13px; }
.rp-map3d-territory { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-shadow: 0 0 4px ${SURFACE}; transition: opacity 160ms; }
/* A folded cluster's caption is its only name on the map: a step larger. */
.rp-map3d-territory[data-hub] { font-size: 11px; letter-spacing: 0.1em; }
.rp-map3d-edge-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 10.5px; font-weight: 600; color: #57503c;
  background: rgba(250, 249, 246, 0.85); padding: 1px 5px; border-radius: 4px; }
/* The hover card - scouting information beside the node under the pointer.
   Same translucent idiom as the panels, inert to the pointer, gone cleanly. */
.rp-map3d-popup { position: absolute; left: 0; top: 0; width: max-content;
  max-width: 15rem; padding: 10px 12px; border: 1px solid #e4e1d8;
  border-radius: 10px; background: rgba(250, 249, 246, 0.88);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  will-change: transform; }
.rp-map3d-popup-name { font-size: 13px; font-weight: 600; line-height: 1.3;
  color: #26251f; }
.rp-map3d-popup-meta { display: flex; align-items: center; gap: 6px;
  margin-top: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; }
.rp-map3d-popup-dot { width: 8px; height: 8px; border-radius: 9999px;
  flex-shrink: 0; }
.rp-map3d-popup-counts { margin-top: 4px; font-size: 12px; color: #57544a; }
.rp-map3d-popup-hint { margin-top: 6px; font-size: 11px; color: #8a8578; }
/* Floating panels sit light over the scene: translucent surface with a
   blurred backdrop so the map glows through, borders kept, no shadow. */
.mm-legend, .mm-card {
  background: rgba(250, 249, 246, 0.78);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mm-legend, .mm-card, .rp-map3d-popup { background: rgba(250, 249, 246, 0.96); }
}
.mm-legend { position: absolute; top: 12px; left: 12px; display: flex;
  flex-direction: column; gap: 2px; max-height: calc(100% - 70px); overflow: auto;
  border: 1px solid #e4e1d8; border-radius: 10px; padding: 8px; }
/* The full map docks the year scrub under the legend, in the same column: the
   legend stops above it (its height is measured into --mm-scrub-h) and scrolls
   inside itself rather than running on beneath the scrub. */
.mm-root[data-mm-chrome='full'] .mm-legend { max-height: calc(100% - 36px - var(--mm-scrub-h, 0px)); }
.mm-legend-title { font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: #8a8578; text-transform: uppercase; padding: 0 6px 4px; }
/* A section of the card ("Where it went", "In parliament"): a kicker under a
   hairline, flush with the card's text edge. Not the legend title, whose side
   padding exists to line it up with the chips. */
.mm-card-section { margin: 14px 0 6px; padding: 9px 0 0; border-top: 1px solid #e4e1d8;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; line-height: 1.3;
  color: #8a5a12; text-transform: uppercase; }
.mm-chip { display: flex; align-items: center; gap: 7px; border: 0;
  background: none; font: inherit; font-size: 12px; color: #4a4942;
  padding: 3px 8px; border-radius: 7px; cursor: pointer; text-align: left; }
.mm-chip:hover { background: rgba(0, 0, 0, 0.05); }
.mm-chip[aria-pressed='true'] { background: #142a43; color: #ffffff; }
.mm-chip[data-dimmed] { opacity: 0.4; }
.mm-chip.mm-grants-toggle { margin-top: 6px; padding-top: 8px; border-top: 1px solid #e4e1d8; border-radius: 0; }
.mm-chip.mm-grants-toggle[aria-pressed='true'] { background: none; color: #4a4942; } /* the pressed-chip rule paints white text; this one keeps the legend's ink */
.mm-chip.mm-grants-toggle[aria-pressed='false'] { opacity: 0.5; }
.mm-chip.mm-grants-toggle[aria-pressed='false'] .mm-dot { background: #b7b3a8 !important; }
.mm-row-note { padding: 4px 0 6px; font-size: 12px; color: #8a8578; }
.mm-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.mm-card { position: absolute; top: 12px; right: 12px; width: 330px;
  max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow: auto;
  border: 1px solid #e4e1d8; border-radius: 12px; padding: 14px 16px;
  outline: none; }
.mm-card:focus-visible { outline: 2px solid ${ACCENT}; }
.mm-card h2 { margin: 0 44px 2px 0; font-size: 16px; line-height: 1.25; }
.mm-card-tag { display: inline-block; font-size: 11px; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }
.mm-card-total { font-size: 22px; font-weight: 700; color: #26251f; }
.mm-card-sub { font-size: 12px; color: #8a8578; margin-bottom: 10px; }
.mm-card-fine { margin: -4px 0 10px; font-size: 10.5px; line-height: 1.42; color: #8a8578; }
.mm-card-close { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px;
  border: 0; border-radius: 50%; background: rgba(160, 118, 27, 0.14); font-size: 20px; line-height: 1;
  color: #8a5a12; cursor: pointer; display: grid; place-items: center; }
.mm-card-close:hover { background: rgba(160, 118, 27, 0.26); color: #33322e; }
.mm-rows { margin: 0; padding: 0; list-style: none; }
.mm-row { display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 5px 6px; margin: 0 -6px; border: 0; background: none; font: inherit;
  font-size: 13px; color: #33322e; border-radius: 7px; cursor: pointer; text-align: left; }
.mm-row:hover { background: rgba(0, 0, 0, 0.05); }
.mm-row .mm-dot { align-self: center; }
.mm-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.mm-row-amt { font-weight: 600; white-space: nowrap; }
.mm-row-years { font-size: 11px; color: #8a8578; white-space: nowrap; }
.mm-ask { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%; min-height: 44px;
  margin-top: 12px; padding: 8px 12px; border: 0; border-radius: 9px;
  background: #142a43; color: #ffffff; font-size: 13px; font-weight: 600;
  font-family: inherit; line-height: 1.35; text-decoration: none; text-align: center;
  cursor: pointer; }
.mm-ask:hover { background: #1d3a5c; color: #ffffff; }
.mm-ask-quiet { background: none; color: #33322e !important; border: 1px solid #d5d1c4;
  margin-top: 8px; }
.mm-ask-quiet:hover { background: rgba(0, 0, 0, 0.05); color: #26251f !important; }
.mm-zoom { position: absolute; right: 12px; bottom: 12px; display: flex;
  flex-direction: column; gap: 4px; }
.mm-zoom button { width: 34px; height: 34px; border: 1px solid #e4e1d8;
  border-radius: 9px; background: rgba(250, 249, 246, 0.92); font-size: 16px;
  color: #4a4942; cursor: pointer; }
.mm-zoom button:hover { background: #fff; }
.mm-hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  margin: 0; font-size: 11.5px; color: #8a8578; pointer-events: none;
  white-space: nowrap; }
.mm-find { position: absolute; top: 12px; right: 12px; width: 240px; }
.mm-find input { width: 100%; border: 1px solid #e4e1d8; border-radius: 9px;
  background: rgba(250, 249, 246, 0.92); backdrop-filter: blur(6px);
  font: inherit; font-size: 13px; color: #33322e; padding: 7px 10px; }
.mm-find input:focus-visible { outline: 2px solid ${ACCENT}; }
.mm-find-list { list-style: none; margin: 4px 0 0; padding: 4px;
  background: rgba(250, 249, 246, 0.96); border: 1px solid #e4e1d8;
  border-radius: 9px; max-height: 260px; overflow: auto; }
.mm-find-list:empty { display: none; }
.mm-find-list button { display: flex; align-items: center; gap: 7px; width: 100%;
  border: 0; background: none; font: inherit; font-size: 12.5px; color: #33322e;
  padding: 5px 8px; border-radius: 6px; cursor: pointer; text-align: left; }
.mm-find-list button:hover, .mm-find-list button:focus-visible { background: rgba(0,0,0,0.06); }
.mm-root[data-mm-chrome='full'] .mm-card { top: 58px; max-height: calc(100% - 70px); }
.mm-scrub { position: absolute; left: 12px; bottom: 12px; width: 270px;
  background: rgba(250, 249, 246, 0.88); backdrop-filter: blur(6px);
  border: 1px solid #e4e1d8; border-radius: 10px; padding: 8px 12px; }
.mm-scrub-label { display: flex; justify-content: space-between; font-size: 11px;
  font-weight: 700; letter-spacing: 0.06em; color: #8a8578; margin-bottom: 2px; }
.mm-scrub-years { font-variant-numeric: tabular-nums; color: #33322e; }
.mm-scrub-rail { position: relative; width: 100%; height: 28px; }
.mm-scrub-track { position: absolute; left: 8px; right: 8px; top: 50%; height: 2px;
  margin-top: -1px; background: #d9d4c6; border-radius: 1px; }
.mm-scrub-fill { position: absolute; top: 0; bottom: 0; background: ${ACCENT}; border-radius: 1px; }
/* Only the thumbs take the pointer, so the two stacked inputs do not mask
   each other and a drag that starts off a thumb still reaches the canvas. */
.mm-scrub input[type='range'] { position: absolute; inset: 0; width: 100%; height: 28px;
  margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
.mm-scrub input[type='range']:focus-visible { outline: 2px solid ${ACCENT};
  outline-offset: 1px; border-radius: 8px; }
.mm-scrub input[type='range']::-webkit-slider-runnable-track { height: 28px; background: none; }
.mm-scrub input[type='range']::-moz-range-track { height: 28px; background: none; }
.mm-scrub input[type='range']::-webkit-slider-thumb { -webkit-appearance: none;
  pointer-events: auto; width: 16px; height: 16px; margin-top: 6px; border-radius: 50%;
  border: 1px solid #8a6a10; background: ${SURFACE}; box-sizing: border-box; cursor: ew-resize; }
.mm-scrub input[type='range']::-moz-range-thumb { pointer-events: auto;
  width: 16px; height: 16px; border-radius: 50%; border: 1px solid #8a6a10;
  background: ${SURFACE}; box-sizing: border-box; cursor: ew-resize; }
.mm-cpi { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center;
  column-gap: 8px; min-height: 44px; margin-top: 3px; padding-top: 4px;
  border-top: 1px solid #e4e1d8; cursor: pointer; }
.mm-cpi input { width: 18px; height: 18px; margin: 0; accent-color: ${ACCENT}; cursor: pointer; }
.mm-cpi-copy { display: block; min-width: 0; }
.mm-cpi-name { display: block; font-size: 12px; font-weight: 600; color: #33322e; }
.mm-cpi-short { display: none; }
.mm-cpi-note { display: block; font-size: 10px; line-height: 1.25; color: #8a8578; }
/* On the compact strip the note lives behind a small i: a 44px target drawing
   a 22px ring, and a paper popover beneath the strip. Hidden on the full plate,
   where the note sits under the label. */
.mm-cpi-info { display: none; flex: none; width: 44px; height: 44px; margin: 0 -8px 0 -6px; padding: 0;
  border: 0; background: none; cursor: pointer; color: #8a6a10; align-items: center; justify-content: center; }
.mm-cpi-info span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px currentColor; font: italic 700 13px/1 Georgia, 'Times New Roman', serif; }
.mm-cpi-info[aria-expanded='true'] span { background: #8a6a10; color: ${SURFACE}; }
.mm-cpi-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 6; width: min(300px, 100%);
  padding: 9px 11px; background: ${SURFACE}; border: 1px solid #d5d1c4; border-radius: 6px;
  box-shadow: 0 10px 24px rgba(30, 26, 18, 0.16); font-size: 12px; line-height: 1.45; color: #33322e; }
.mm-cpi-pop[hidden] { display: none; }
/* Inside a page's map plate the host clips overflow, so the note opens upward from the icon, anchored to its right. */
.mm-scrub-mini .mm-cpi-pop { top: auto; bottom: calc(100% + 6px); left: auto; right: 0; z-index: 9; }
/* The same control on a small plate: one row, the window years as its label,
   the two thumbs and inflation switch sharing one compact strip. */
.mm-scrub-mini { width: auto; max-width: calc(100% - 24px); padding: 5px 10px;
  display: flex; align-items: center; gap: 9px; }
.mm-scrub-mini .mm-scrub-label { display: block; margin: 0; flex: none; }
.mm-scrub-mini .mm-scrub-caption { display: none; }
.mm-scrub-mini .mm-scrub-years { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }
.mm-scrub-mini .mm-scrub-rail { flex: none; width: 104px; height: 44px; }
.mm-scrub-mini input[type='range'] { height: 44px; }
.mm-scrub-mini input[type='range']::-webkit-slider-runnable-track { height: 44px; }
.mm-scrub-mini input[type='range']::-moz-range-track { height: 44px; }
.mm-scrub-mini input[type='range']::-webkit-slider-thumb { width: 14px; height: 14px; margin-top: 15px; }
.mm-scrub-mini input[type='range']::-moz-range-thumb { width: 14px; height: 14px; }
.mm-scrub-mini .mm-cpi { flex: none; width: auto; margin: 0; padding: 0 0 0 9px;
  border-top: 0; border-left: 1px solid #e4e1d8; }
.mm-scrub-mini .mm-cpi-name { font-size: 11px; white-space: nowrap; }
.mm-scrub-mini .mm-cpi-long { display: none; }
.mm-scrub-mini .mm-cpi-short { display: inline; }
.mm-scrub-mini .mm-cpi-info { margin: 0 -6px 0 -4px; }
.mm-scrub-mini .mm-cpi-note { display: none; }
.mm-scrub-mini .mm-cpi-info { display: flex; }
.mm-fallback { display: flex; align-items: center; justify-content: center;
  height: 100%; padding: 24px; text-align: center; color: #57544a; }
@media (prefers-reduced-motion: reduce) {
  .rp-map3d-territory { transition: none; }
}
@media (max-width: 720px) {
  .mm-legend { flex-direction: row; flex-wrap: nowrap; overflow-x: auto;
    max-width: calc(100% - 24px); max-height: none; align-items: center; }
  .mm-legend-title { display: none; }
  .mm-chip { white-space: nowrap; flex: none; }
  .mm-card { top: auto; right: 8px; left: 8px; bottom: 8px; width: auto;
    max-height: 55%; }
  .mm-root[data-mm-chrome='full'] .mm-card { top: auto; max-height: 55%; }
  .mm-hint, .mm-find { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-scrub { display: flex; align-items: center; gap: 8px;
    top: 60px; right: 8px; bottom: auto; left: 8px; width: auto; padding: 4px 8px; overflow: visible; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-label { display: block; flex: none; margin: 0; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-caption { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-years { font-size: 11px; letter-spacing: 0.02em; }
  .mm-root[data-mm-chrome='full'] .mm-scrub-rail { flex: 1 1 88px; min-width: 60px; height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range'] { height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-webkit-slider-runnable-track { height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-moz-range-track { height: 44px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-webkit-slider-thumb {
    width: 14px; height: 14px; margin-top: 15px; }
  .mm-root[data-mm-chrome='full'] .mm-scrub input[type='range']::-moz-range-thumb {
    width: 14px; height: 14px; }
  .mm-root[data-mm-chrome='full'] .mm-cpi { flex: none; width: auto; margin: 0;
    padding: 0 0 0 8px; border-top: 0; border-left: 1px solid #e4e1d8; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-name { font-size: 11px; white-space: nowrap; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-long { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-short { display: inline; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-info { margin: 0 -6px 0 -4px; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-note { display: none; }
  .mm-root[data-mm-chrome='full'] .mm-cpi-info { display: flex; }
  /* The compact scrub is small enough to keep on a phone; it moves to the
     top left, which mini chrome leaves empty, clear of the card's sheet. */
  .mm-scrub-mini { display: flex; top: 8px; left: 8px; bottom: auto; }
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
// Mount.
// ---------------------------------------------------------------------------

export async function mountMoneyMap(
  container: HTMLElement,
  dataUrl: string,
  opts: MoneyMapOptions = {},
): Promise<MoneyMapHandle> {
  injectStyles()
  container.classList.add('mm-root')

  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error(`money map data: HTTP ${response.status} for ${dataUrl}`)
  const raw = (await response.json()) as MoneyGraph

  if (!webglAvailable()) {
    const fallback = el('div', 'mm-fallback', container)
    fallback.textContent = 'The 3D money map needs WebGL, which this browser does not offer. ' +
      'The underlying data is available as JSON at ' + dataUrl
    const noop = () => undefined
    return { select: noop, isolate: noop, fit: noop, setPaused: noop, destroy: () => fallback.remove() }
  }

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
    if (yearsInUrl) {
      url.searchParams.set('from', String(yearLo))
      url.searchParams.set('to', String(yearHi))
    } else {
      url.searchParams.delete('from')
      url.searchParams.delete('to')
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
  }
  let view: WindowView = { nodes: byId, edges: raw.edges, span: null, grants: new Map() }

  // --- DOM scaffolding -------------------------------------------------
  const canvas = el('canvas', 'mm-canvas', container)
  canvas.tabIndex = 0
  canvas.setAttribute('role', 'application')
  canvas.setAttribute(
    'aria-label',
    'Money map - drag to orbit, pinch or scroll to zoom, click a node for details. ' +
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
  // host's own 360ms height transition to settle. Every later open is a
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

  const zoom = full ? el('div', 'mm-zoom', container) : null
  if (zoom) {
    const zoomButton = (label: string, title: string, onClick: () => void) => {
      const button = el('button', '', zoom)
      button.type = 'button'
      button.textContent = label
      button.setAttribute('aria-label', title)
      button.title = title
      button.addEventListener('click', onClick)
    }
    zoomButton('+', 'Zoom in', () => engine.zoomBy(1.3))
    zoomButton('−', 'Zoom out', () => engine.zoomBy(1 / 1.3))
    zoomButton('⤢', 'Fit the whole map to view', () => engine.fit(true))
  }

  const hint = full ? el('p', 'mm-hint', container) : null
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
  let activeGroup: string | null = null

  const engine = new KnowledgeMapEngine(
    canvas,
    labels,
    (id) => setSelection(id, { user: true }),
    () => {
      // A lost WebGL context leaves a frozen canvas with no way back.
      canvas.replaceWith(Object.assign(document.createElement('div'), {
        className: 'mm-fallback',
        textContent: 'The 3D view lost its graphics context. Reload the page to restart it.',
      }))
    },
  )
  engine.onEdgePick = (edge) => setEdgeSelection(edge)
  const words = mountWordsLayer({ engine, raw, legend, routeBase })

  // --- The opening reveal ----------------------------------------------
  // Only its emphasis reaches the scene, and only while it runs: the flows
  // it is lighting, restored to the plain selection before the camera stops.
  let reveal: Reveal | null = null
  let spotlightEdges: MapEdge[] | null = null
  let spotlightFor: string | null = null
  const applyEmphasis = () => {
    engine.setEmphasis({
      selectedId,
      pathEdges: spotlightEdges,
      pathFrom: spotlightEdges ? selectedId : null,
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
    disarmRelease()
    const running = reveal
    reveal = null
    running?.cancel()
  }
  // The reader's first press, drag, wheel notch or arrow key ends it.
  engine.onViewClaimed = () => cancelReveal()

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
    const windowEdges = (recalculated
      ? raw.edges.map((e) => windowFigures(e, yearLo, yearHi, adjustForInflation))
      : raw.edges)
      .filter(inWindow)
      .filter((e) => grantsOn || !isGrantEdge(e))
    const grantsByNode = new Map<string, GrantsBlock>()
    for (const n of raw.nodes) {
      if (!n.grants) continue
      grantsByNode.set(n.id, recalculated ? windowFigures(n.grants, yearLo, yearHi, adjustForInflation) : n.grants)
    }
    view = {
      nodes: recalculated ? new Map(windowNodes.map((n) => [n.id, n])) : byId,
      edges: windowEdges,
      span: scrubbed ? yearSpan(yearLo, yearHi) : null,
      grants: grantsByNode,
    }
    const activeDonors = new Set(windowEdges.map((e) => e.source))
    const visibleNodes = windowNodes.filter((n) => {
      if (n.kind === 'grantor') return grantsOn
      if (n.group === 'parties') return true
      if (activeGroup !== null && n.group !== activeGroup) return false
      return !scrubbed || activeDonors.has(n.id)
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
      centralGroup: 'parties',
    }
    engine.setData(data)
    // The fit signature deliberately excludes the year window: refitting the
    // camera on every scrub step would turn the timeline into a fairground
    // ride. Filters and resizes refit; the scrub holds the view still.
    const sig = `${data.aspect}|${activeGroup ?? '*'}`
    if (sig !== fitSig) {
      const firstFit = fitSig === ''
      fitSig = sig
      // The fit lands in the space the chrome (and an open card) leaves free.
      engine.setInsets(measureInsets())
      engine.fit(!firstFit)
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
    const bucket = aspectBucket()
    if (bucket !== lastBucket) {
      lastBucket = bucket
      pushData()
    } else if (!engine.viewOwned) {
      engine.fit(false)
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
    activeGroup = group !== null && group !== 'parties' && graph.groupStyles.has(group) ? group : null
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
      (group) => group !== 'parties' && graph.groupStyles.has(group),
    )
    for (const group of legendGroups) {
      const chip = el('button', 'mm-chip', legend)
      chip.type = 'button'
      chip.setAttribute('aria-pressed', 'false')
      const dot = el('span', 'mm-dot', chip)
      dot.style.background = clusterColour(group).colour
      const name = el('span', '', chip)
      // The keys are lower case because they are data; the legend is a list of
      // names a reader reads, so it takes sentence case like every other label.
      name.textContent = `${group.charAt(0).toUpperCase()}${group.slice(1)} · ${graph.groupStyles.get(group)?.count ?? 0}`
      chip.addEventListener('click', () => applyIsolate(activeGroup === group ? null : group))
      chips.set(group, chip)
    }
    if (hasGrants) {
      const grantor = raw.nodes.find((n) => n.kind === 'grantor')
      const toggle = el('button', 'mm-chip mm-grants-toggle', legend)
      toggle.type = 'button'
      toggle.setAttribute('aria-pressed', String(grantsOn))
      toggle.title = 'Public money the donors on this map received, drawn as flows out from the grantor'
      const dot = el('span', 'mm-dot', toggle)
      dot.style.background = grantor?.colour ?? GRANTOR_COLOUR
      const name = el('span', '', toggle)
      const n = typeof raw.meta.donors_with_grants === 'number' ? raw.meta.donors_with_grants : (grantor?.recipients ?? 0)
      name.textContent = `Public money · ${n}`
      toggle.addEventListener('click', () => {
        grantsOn = !grantsOn
        toggle.setAttribute('aria-pressed', String(grantsOn))
        if (!grantsOn && selectedId?.startsWith('grantor:')) setSelection(null)
        if (!grantsOn && selectedEdge && isGrantEdge(selectedEdge)) setEdgeSelection(null)
        pushData()
      })
    }
  }

  // --- Find-in-map ------------------------------------------------------
  const find = full ? el('div', 'mm-find', container) : null
  if (find) {
    const input = el('input', '', find)
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
      caption.textContent = 'FINANCIAL YEARS'
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
      const span = yearMax - yearMin
      fill.style.left = `${((yearLo - yearMin) / span) * 100}%`
      fill.style.right = `${((yearMax - yearHi) / span) * 100}%`
    }
    showYears()

    const cpi = el('label', 'mm-cpi', scrub)
    const cpiInput = el('input', '', cpi)
    cpiInput.type = 'checkbox'
    cpiInput.checked = adjustForInflation
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

    let pending = 0
    const applyScrub = () => {
      // The two thumbs may cross; the window is always the ordered pair.
      const a = Number(lo.value)
      const b = Number(hi.value)
      yearLo = Math.min(a, b)
      yearHi = Math.max(a, b)
      yearsInUrl = true
      showYears()
      syncUrlState()
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
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

  /** A question-trigger or profile link on a card. */
  const trigger = (parent: HTMLElement, href: string, label: string, quiet = false, external = false) => {
    const a = el('a', quiet ? 'mm-ask mm-ask-quiet' : 'mm-ask', parent)
    a.href = href
    a.textContent = label
    if (external) { a.target = '_blank'; a.rel = 'noopener' }
  }
  const subjectUrl = (kind: 'donor' | 'party', label: string) =>
    `/subject/${kind}/${encodeURIComponent(label)}`
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
  const explain = (parent: HTMLElement, detail: Record<string, string>) => {
    const button = el('button', 'mm-ask', parent)
    button.type = 'button'
    button.textContent = 'Explain this flow'
    button.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('opax:explain', {
        bubbles: true,
        detail: { ...detail, jurisdiction },
      }))
    })
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

  const renderCard = (node: MoneyNode) => {
    card.innerHTML = ''
    const close = el('button', 'mm-card-close', card)
    close.type = 'button'
    close.textContent = '✕'
    close.setAttribute('aria-label', 'Close details')
    close.addEventListener('click', () => setSelection(null, { user: true }))

    const title = el('h2', '', card)
    title.textContent = node.label
    const tag = el('span', 'mm-card-tag', card)
    const style = clusterColour(node.group)
    tag.style.color = node.kind === 'party' || node.kind === 'grantor' ? (node.colour ?? style.ink) : style.ink
    tag.textContent = node.kind === 'party'
      ? 'political party'
      : node.kind === 'grantor' ? 'public money' : node.industry.replace(/_/g, ' ')

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(node.total)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(node.firstYear, node.lastYear)
    // Inside a year window the figures are the window's, and the span is
    // the years within it that carry anything; a subject with nothing there
    // says so rather than showing an empty zero.
    sub.textContent = node.count === 0 && view.span
      ? (node.kind === 'grantor' ? `nothing awarded in ${view.span}` : `nothing disclosed in ${view.span}`)
      : node.kind === 'party'
        ? `received across ${node.count.toLocaleString()} receipts · ${span}`
        : node.kind === 'grantor'
          ? `awarded to donors on this map across ${node.count.toLocaleString()} grants · ${span}`
          : `given across ${node.count.toLocaleString()} donations · ${span}`
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
          party.colour ?? '#9AA0A8',
          party.label,
          edge.total,
          yearSpan(edge.firstYear, edge.lastYear),
          () => setSelection(party.id, { user: true }),
        )
      }
      if (node.grants && grantsOn) {
        // Public money going the other way: shown beside the donations, never
        // summed with them. The figures follow the year window like the rest.
        const g = view.grants.get(node.id) ?? node.grants
        const grantsTitle = el('div', 'mm-card-section', card)
        grantsTitle.textContent = 'Public money received'
        const glist = el('ul', 'mm-rows', card)
        const grantor = raw.nodes.find((n) => n.kind === 'grantor')
        if (g.count > 0) {
          row(glist, grantor?.colour ?? GRANTOR_COLOUR, grantor?.label ?? 'Grants', g.total,
            `${g.count.toLocaleString()} grant${g.count === 1 ? '' : 's'} · ${yearSpan(g.firstYear, g.lastYear)}`,
            grantor ? () => setSelection(grantor.id, { user: true }) : null)
          for (const [program, dollars] of (g.top ?? []).slice(0, 3)) {
            row(glist, null, program, dollars, '', null)
          }
        } else {
          const none = el('li', 'mm-row-note', glist)
          none.textContent = view.span ? `no grants started in ${view.span}` : 'no grants'
        }
        if (node.grants.rid) {
          trigger(card,
            `${routeBase}/explore?game=grants&jur=${encodeURIComponent(node.grants.jur ?? 'federal')}&open=${encodeURIComponent(node.grants.rid)}`,
            'Open their grants file', true)
        }
      }
      if (!['individual', 'other', ''].includes(node.industry.toLowerCase())) {
        trigger(card, askUrl(node.industry.replace(/_/g, ' ')),
          'What did parliament say about this industry?')
      }
      // Quote the suffix-stripped name: MPs say "Philip Morris", never
      // "Philip Morris Limited" - the full label finds nothing.
      trigger(card,
        `/search?q=${encodeURIComponent(`"${shortName(node.label)}"`)}`,
        `What was said about ${shortName(node.label)}?`, true)
      if (node.id !== opts.subject) trigger(card, subjectUrl('donor', node.label), 'Full profile', true)
      explain(card, { kind: 'donor', from: node.label })
    } else if (node.kind === 'grantor') {
      listTitle.textContent = 'Largest recipients among the donors on this map'
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
      fine.textContent = typeof raw.meta.grants_source === 'string'
        ? `${raw.meta.grants_source}. Public money is drawn the other way from donations and never summed with them; a donor receiving a grant is a fact, not a finding.`
        : 'Public money is drawn the other way from donations and never summed with them.'
      trigger(card, `${routeBase}/explore?game=grants&jur=${encodeURIComponent(node.explorer ?? 'federal')}`,
        'Open Who gets the grants', false)
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
      const industry = topIndustryOf(node.id)
      if (industry) {
        trigger(card,
          `/ask?q=${
            encodeURIComponent(`What has ${node.label} said about ${industry}?`)
          }`,
          `Ask what ${node.label} said about ${industry}`)
      }
      if (node.id !== opts.subject) trigger(card, subjectUrl('party', node.label), 'Full profile', true)
      explain(card, { kind: 'party', to: node.label })
    }
  }

  /** Company-suffix-free name for question copy ("Pratt Holdings", not "…Pty Ltd"). */
  const shortName = (label: string) =>
    label.replace(/\s+(Pty\.?\s*)?(Ltd|Limited|Incorporated|Inc)\.?$/i, '')

  /**
   * The card for an aggregated flow - a folded cluster's summed giving to
   * one party. The engine synthesises these while the cluster is a hub; the
   * source is `hub:<group>`, so the detail comes from the raw edges here.
   */
  const renderHubFlowCard = (edge: MapEdge, group: string) => {
    const party = view.nodes.get(edge.target)
    if (!party) return
    card.innerHTML = ''
    const close = el('button', 'mm-card-close', card)
    close.type = 'button'
    close.textContent = '✕'
    close.setAttribute('aria-label', 'Close details')
    close.addEventListener('click', () => setEdgeSelection(null))

    const style = clusterColour(group)
    const groupName = group.charAt(0).toUpperCase() + group.slice(1)
    const title = el('h2', '', card)
    title.textContent = `${groupName} → ${party.label}`
    const tag = el('span', 'mm-card-tag', card)
    tag.style.color = style.ink
    tag.textContent = 'industry flow'

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(edge.total ?? 0)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(edge.firstYear ?? null, edge.lastYear ?? null)
    const donors = edge.count ?? 0
    sub.textContent = `from ${donors === 1 ? '1 donor' : `${donors.toLocaleString()} donors`} shown` +
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
    if (!['individuals', 'other'].includes(group)) {
      trigger(card, askUrl(group), `What has parliament said about ${group}?`)
    }
    explain(card, { kind: 'industry', from: groupName, to: party.label })
    const open = el('button', 'mm-ask mm-ask-quiet', card)
    open.type = 'button'
    open.textContent = `Show only ${group} on the map`
    open.addEventListener('click', () => {
      setEdgeSelection(null)
      applyIsolate(group)
    })
  }

  /** A grant flow: the grantor's public money to one donor on the map. */
  const renderGrantFlowCard = (edge: MapEdge, grantor: MoneyNode) => {
    const donor = view.nodes.get(edge.target)
    if (!donor) return
    card.innerHTML = ''
    const close = el('button', 'mm-card-close', card)
    close.type = 'button'
    close.textContent = '✕'
    close.setAttribute('aria-label', 'Close details')
    close.addEventListener('click', () => setEdgeSelection(null))
    const title = el('h2', '', card)
    title.textContent = `${grantor.label} → ${donor.label}`
    const tag = el('span', 'mm-card-tag', card)
    tag.style.color = '#1f5f58'
    tag.textContent = 'public money'
    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(edge.total ?? 0)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(edge.firstYear ?? null, edge.lastYear ?? null)
    sub.textContent = `across ${(edge.count ?? 0).toLocaleString()} grants${span ? ` · ${span}` : ''}`
    inflationFineprint(card)
    const list = el('ul', 'mm-rows', card)
    row(list, grantor.colour ?? GRANTOR_COLOUR, grantor.label, grantor.total, '',
      () => setSelection(grantor.id, { user: true }))
    row(list, donor.colour ?? clusterColour(donor.group).colour, donor.label, donor.total, 'given to parties',
      () => setSelection(donor.id, { user: true }))
    for (const [program, dollars] of (donor.grants?.top ?? []).slice(0, 3)) {
      row(list, null, program, dollars, '', null)
    }
    const fine = el('p', 'mm-card-fine', card)
    fine.textContent = 'Public money going the other way; not summed with the donations. A donor receiving a grant is a fact, not a finding.'
    if (donor.grants?.rid) {
      trigger(card,
        `${routeBase}/explore?game=grants&jur=${encodeURIComponent(donor.grants.jur ?? 'federal')}&open=${encodeURIComponent(donor.grants.rid)}`,
        'Open their grants file', true)
    }
  }

  const renderEdgeCard = (edge: MapEdge) => {
    if (edge.hub) {
      renderHubFlowCard(edge, edge.hub)
      return
    }
    const from = view.nodes.get(edge.source)
    if (from?.kind === 'grantor') {
      renderGrantFlowCard(edge, from)
      return
    }
    const donor = view.nodes.get(edge.source)
    const party = view.nodes.get(edge.target)
    if (!donor || !party) return
    card.innerHTML = ''
    const close = el('button', 'mm-card-close', card)
    close.type = 'button'
    close.textContent = '✕'
    close.setAttribute('aria-label', 'Close details')
    close.addEventListener('click', () => setEdgeSelection(null))

    const title = el('h2', '', card)
    title.textContent = `${donor.label} → ${party.label}`
    const tag = el('span', 'mm-card-tag', card)
    tag.style.color = clusterColour(donor.group).ink
    tag.textContent = `${donor.industry.replace(/_/g, ' ')} money`

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(edge.total ?? 0)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(edge.firstYear ?? null, edge.lastYear ?? null)
    sub.textContent =
      `across ${(edge.count ?? 0).toLocaleString()} donations${span ? ` · ${span}` : ''}`
    inflationFineprint(card)

    const list = el('ul', 'mm-rows', card)
    row(list, donor.colour ?? clusterColour(donor.group).colour, donor.label,
      donor.total, '', () => setSelection(donor.id, { user: true }))
    row(list, party.colour ?? '#9AA0A8', party.label,
      party.total, '', () => setSelection(party.id, { user: true }))

    if (edge.firstYear && edge.lastYear) {
      const industry = donor.industry.replace(/_/g, ' ')
      trigger(card,
        `/search?q=${encodeURIComponent(industry)}` +
          `&from=${edge.firstYear}&to=${edge.lastYear}`,
        `What was said about ${industry} in ${span}?`)
    }
    explain(card, { kind: 'donor', from: donor.label, to: party.label })
  }

  /**
   * The canvas the floating chrome covers, so the fit and every focus move
   * centre the scene in the unobstructed area: the legend (a left column, or
   * a top row on narrow screens), the find box along the top, the zoom
   * buttons on the right, the scrub and the hint along the bottom. Measured
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
    cover(hint, 'bottom')
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
        else if (selectedId) engine.focusOn(selectedId, null)
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
        else if (selectedId) engine.focusOn(selectedId, null)
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
    const incoming = node.kind === 'party'
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

  pushData()

  // The embed seed: mount already-selected with the camera on the node.
  // Deliberately silent - the host asked for it, so it is not an event.
  if (opts.focus && byId.has(opts.focus)) {
    setSelection(opts.focus)
    if (revealWanted) startReveal(opts.focus)
  }

  return {
    select: (id) => setSelection(id),
    isolate: (group) => applyIsolate(group),
    fit: (animate = true) => engine.fit(animate),
    setPaused: (paused) => engine.setPaused(paused),
    destroy: () => {
      cancelReveal()
      container.removeEventListener('keydown', onKeyDown)
      resizeObserver.disconnect()
      engine.dispose()
      for (const child of [canvas, labels, legend, card, zoom, hint, find, scrub]) {
        child?.remove()
      }
      container.classList.remove('mm-root')
      delete container.dataset.mmChrome
    },
  }
}
