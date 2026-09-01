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
import { ACCENT, CLUSTER_COLOURS, clusterColour, SURFACE } from './palette.ts'

// Re-exported so a Node smoke test can exercise the pure layout/data layer
// without a DOM or a WebGL context.
export { clusterCentres3D, ForceSim3D } from './force3d.ts'
export { buildDegrees, formatMoney, radiusFor, shortLabel } from './map-types.ts'
export { webglAvailable }

/** One node of the exported money.json graph. */
export type MoneyNode = {
  id: string
  label: string
  kind: 'donor' | 'party'
  industry: string
  group: string
  colour?: string
  total: number
  count: number
  firstYear: number | null
  lastYear: number | null
}

export type MoneyEdge = {
  source: string
  target: string
  total: number
  count: number
  firstYear: number | null
  lastYear: number | null
}

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
}

export type MoneyMapHandle = {
  select(id: string | null): void
  destroy(): void
}

/** Dollars -> the engine's size weight: $10k ~ 1, so log sizing spans well. */
const WEIGHT_SCALE = 10_000

function yearSpan(first: number | null, last: number | null): string {
  if (!first) return ''
  return first === last ? `${first}` : `${first}–${last}`
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

  const nodes: MapNode[] = raw.nodes.map((n) => ({
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
  }))

  const edges: MapEdge[] = raw.edges.map((e) => ({
    source: e.source,
    target: e.target,
    label: formatMoney(e.total),
    weight: e.total / WEIGHT_SCALE,
    total: e.total,
    count: e.count,
    firstYear: e.firstYear,
    lastYear: e.lastYear,
  }))

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
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #33322e; }
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
.mm-legend-title { font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: #8a8578; text-transform: uppercase; padding: 0 6px 4px; }
.mm-chip { display: flex; align-items: center; gap: 7px; border: 0;
  background: none; font: inherit; font-size: 12px; color: #4a4942;
  padding: 3px 8px; border-radius: 7px; cursor: pointer; text-align: left; }
.mm-chip:hover { background: rgba(0, 0, 0, 0.05); }
.mm-chip[aria-pressed='true'] { background: #142a43; color: #ffffff; }
.mm-chip[data-dimmed] { opacity: 0.4; }
.mm-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.mm-card { position: absolute; top: 12px; right: 12px; width: 330px;
  max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow: auto;
  border: 1px solid #e4e1d8; border-radius: 12px; padding: 14px 16px;
  outline: none; }
.mm-card:focus-visible { outline: 2px solid ${ACCENT}; }
.mm-card h2 { margin: 0 24px 2px 0; font-size: 16px; line-height: 1.25; }
.mm-card-tag { display: inline-block; font-size: 11px; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }
.mm-card-total { font-size: 22px; font-weight: 700; color: #26251f; }
.mm-card-sub { font-size: 12px; color: #8a8578; margin-bottom: 10px; }
.mm-card-close { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  border: 0; border-radius: 8px; background: none; font-size: 16px; line-height: 1;
  color: #8a8578; cursor: pointer; }
.mm-card-close:hover { background: rgba(0, 0, 0, 0.06); color: #33322e; }
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
.mm-ask { display: block; margin-top: 12px; padding: 8px 12px; border-radius: 9px;
  background: #142a43; color: #ffffff; font-size: 13px; font-weight: 600;
  text-decoration: none; text-align: center; }
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
.mm-scrub { position: absolute; left: 12px; bottom: 12px; width: 250px;
  background: rgba(250, 249, 246, 0.88); backdrop-filter: blur(6px);
  border: 1px solid #e4e1d8; border-radius: 10px; padding: 8px 12px 10px; }
.mm-scrub-label { display: flex; justify-content: space-between; font-size: 11px;
  font-weight: 700; letter-spacing: 0.06em; color: #8a8578; margin-bottom: 2px; }
.mm-scrub-years { font-variant-numeric: tabular-nums; color: #33322e; }
.mm-scrub input[type='range'] { width: 100%; margin: 2px 0; accent-color: ${ACCENT}; }
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
  .mm-hint, .mm-find, .mm-scrub { display: none; }
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
    return { select: () => undefined, destroy: () => fallback.remove() }
  }

  const graph = buildGraph(raw)
  const byId = new Map(raw.nodes.map((n) => [n.id, n]))
  const chrome = opts.chrome ?? 'full'
  container.dataset.mmChrome = chrome
  // Route links: inside the SPA (served at /) a bare "#/..." href routes in
  // place with no reload; on a standalone page (/map.html) the same route
  // needs the leading slash to land on the app first.
  const routeBase = location.pathname === '/' ? '' : '/'
  const askUrl = opts.askUrl ??
    ((industry: string) =>
      `${routeBase}#/ask?q=${encodeURIComponent(`What has parliament said about ${industry}?`)}`)

  // Observed year extent of the flows, for the time scrub.
  let yearMin = 2026
  let yearMax = 1998
  for (const e of raw.edges) {
    if (e.firstYear) yearMin = Math.min(yearMin, e.firstYear)
    if (e.lastYear) yearMax = Math.max(yearMax, e.lastYear)
  }
  let yearLo = yearMin
  let yearHi = yearMax

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

  const full = chrome === 'full'
  const legend = full ? el('div', 'mm-legend', container) : null
  if (legend) {
    const legendTitle = el('div', 'mm-legend-title', legend)
    legendTitle.textContent = 'Industries · click to isolate'
  }

  const card = el('div', 'mm-card', container)
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
    hint.textContent = `Drag to orbit · scroll to zoom · click a node or a flow · AEC returns ${
      raw.meta?.coverage ?? '1998–2026'
    }`
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

  const aspectBucket = () => {
    const rect = container.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return 1.5
    const aspect = rect.width / rect.height
    return aspect < 1 ? 0.8 : aspect < 1.45 ? 1.2 : 1.9
  }

  let fitSig = ''
  const pushData = () => {
    // Time scrub: an edge is in the window when its span overlaps [lo, hi];
    // a donor stays visible only while at least one of its flows does.
    // Parties always anchor the centre. Undated flows never disappear.
    const scrubbed = yearLo > yearMin || yearHi < yearMax
    const inWindow = (e: MapEdge) =>
      !scrubbed ||
      ((e.firstYear ?? yearMin) <= yearHi && (e.lastYear ?? yearMax) >= yearLo)
    const windowEdges = graph.edges.filter(inWindow)
    const activeDonors = new Set(windowEdges.map((e) => e.source))
    const visibleNodes = graph.nodes.filter((n) => {
      if (n.group === 'parties') return true
      if (activeGroup !== null && n.group !== activeGroup) return false
      return !scrubbed || activeDonors.has(n.id)
    })
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    const visibleEdges = windowEdges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    )
    const data: EngineData = {
      nodes: visibleNodes,
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
      engine.fit(!firstFit)
    }
    if (selectedId && !visibleIds.has(selectedId)) setSelection(null)
    if (selectedEdge && !visibleEdges.includes(selectedEdge)) setEdgeSelection(null)
  }

  let lastBucket = aspectBucket()
  const resizeObserver = new ResizeObserver(() => {
    const bucket = aspectBucket()
    if (bucket !== lastBucket) {
      lastBucket = bucket
      pushData()
    }
  })
  resizeObserver.observe(container)

  // --- Legend / filter -------------------------------------------------
  const chips = new Map<string, HTMLButtonElement>()
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
      name.textContent = `${group} · ${graph.groupStyles.get(group)?.count ?? 0}`
      chip.addEventListener('click', () => {
        activeGroup = activeGroup === group ? null : group
        for (const [g, c] of chips) {
          c.setAttribute('aria-pressed', String(g === activeGroup))
          if (activeGroup !== null && g !== activeGroup) c.setAttribute('data-dimmed', '')
          else c.removeAttribute('data-dimmed')
        }
        pushData()
      })
      chips.set(group, chip)
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
  const scrub = full && yearMax > yearMin ? el('div', 'mm-scrub', container) : null
  if (scrub) {
    const label = el('div', 'mm-scrub-label', scrub)
    const caption = el('span', '', label)
    caption.textContent = 'YEARS'
    const years = el('span', 'mm-scrub-years', label)
    const lo = el('input', '', scrub)
    const hi = el('input', '', scrub)
    for (const [input, name] of [[lo, 'from'], [hi, 'to']] as const) {
      input.type = 'range'
      input.min = String(yearMin)
      input.max = String(yearMax)
      input.setAttribute('aria-label', `Show flows ${name} year`)
    }
    lo.value = String(yearMin)
    hi.value = String(yearMax)
    const showYears = () => {
      years.textContent = yearLo === yearHi ? `${yearLo}` : `${yearLo} – ${yearHi}`
    }
    showYears()
    let pending = 0
    const applyScrub = () => {
      // The two thumbs may cross; the window is always the ordered pair.
      const a = Number(lo.value)
      const b = Number(hi.value)
      yearLo = Math.min(a, b)
      yearHi = Math.max(a, b)
      showYears()
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        pushData()
      })
    }
    lo.addEventListener('input', applyScrub)
    hi.addEventListener('input', applyScrub)
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
  const trigger = (parent: HTMLElement, href: string, label: string, quiet = false) => {
    const a = el('a', quiet ? 'mm-ask mm-ask-quiet' : 'mm-ask', parent)
    a.href = href
    a.textContent = label
  }

  const subjectUrl = (kind: 'donor' | 'party', label: string) =>
    `${routeBase}#/subject/${kind}/${encodeURIComponent(label)}`

  /** The industry that gave a party the most, for its ask-trigger. */
  const topIndustryOf = (partyId: string): string | null => {
    const sums = new Map<string, number>()
    for (const e of raw.edges) {
      if (e.target !== partyId) continue
      const donor = byId.get(e.source)
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
    tag.style.color = node.kind === 'party' ? (node.colour ?? style.ink) : style.ink
    tag.textContent = node.kind === 'party'
      ? 'political party'
      : node.industry.replace(/_/g, ' ')

    const total = el('div', 'mm-card-total', card)
    total.textContent = formatMoney(node.total)
    const sub = el('div', 'mm-card-sub', card)
    const span = yearSpan(node.firstYear, node.lastYear)
    sub.textContent = node.kind === 'party'
      ? `received across ${node.count.toLocaleString()} receipts · ${span}`
      : `given across ${node.count.toLocaleString()} donations · ${span}`

    const listTitle = el('div', 'mm-legend-title', card)
    const list = el('ul', 'mm-rows', card)
    if (node.kind === 'donor') {
      listTitle.textContent = 'Where it went'
      const out = raw.edges
        .filter((e) => e.source === node.id)
        .sort((a, b) => b.total - a.total)
      for (const edge of out) {
        const party = byId.get(edge.target)
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
      trigger(card, askUrl(node.industry.replace(/_/g, ' ')),
        'What did parliament say about this industry?')
      // Quote the suffix-stripped name: MPs say "Philip Morris", never
      // "Philip Morris Limited" - the full label finds nothing.
      trigger(card,
        `${routeBase}#/search?q=${encodeURIComponent(`"${shortName(node.label)}"`)}`,
        `What was said about ${shortName(node.label)}?`, true)
      trigger(card, subjectUrl('donor', node.label), 'Full profile', true)
    } else {
      listTitle.textContent = 'Top donors shown on the map'
      const incoming = raw.edges
        .filter((e) => e.target === node.id)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
      for (const edge of incoming) {
        const donor = byId.get(edge.source)
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
          `${routeBase}#/ask?q=${
            encodeURIComponent(`What has ${node.label} said about ${industry}?`)
          }`,
          `Ask what ${node.label} said about ${industry}`)
      }
      trigger(card, subjectUrl('party', node.label), 'Full profile', true)
    }
  }

  /** Company-suffix-free name for question copy ("Pratt Holdings", not "…Pty Ltd"). */
  const shortName = (label: string) =>
    label.replace(/\s+(Pty\.?\s*)?(Ltd|Limited|Incorporated|Inc)\.?$/i, '')

  const renderEdgeCard = (edge: MapEdge) => {
    const donor = byId.get(edge.source)
    const party = byId.get(edge.target)
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

    const list = el('ul', 'mm-rows', card)
    row(list, donor.colour ?? clusterColour(donor.group).colour, donor.label,
      donor.total, '', () => setSelection(donor.id, { user: true }))
    row(list, party.colour ?? '#9AA0A8', party.label,
      party.total, '', () => setSelection(party.id, { user: true }))

    if (edge.firstYear && edge.lastYear) {
      const industry = donor.industry.replace(/_/g, ' ')
      trigger(card,
        `${routeBase}#/search?q=${encodeURIComponent(industry)}` +
          `&from=${edge.firstYear}&to=${edge.lastYear}`,
        `What was said about ${industry} in ${span}?`)
    }
  }

  const measureInsets = (): Insets => {
    if (card.hidden) return { left: 0, right: 0, bottom: 0 }
    const rect = card.getBoundingClientRect()
    const host = container.getBoundingClientRect()
    // The card is a bottom sheet on narrow screens, a right panel otherwise.
    return rect.width >= host.width - 40
      ? { left: 0, right: 0, bottom: rect.height + 16 }
      : { left: 0, right: rect.width + 24, bottom: 0 }
  }

  /**
   * Select a node. `user: true` marks a reader-initiated selection (a click,
   * Enter, the find box, a card row) - only those reach opts.onSelect; the
   * focus seed, handle.select and filter-driven clears stay silent.
   */
  function setSelection(id: string | null, { user = false } = {}) {
    selectedId = id
    selectedEdge = null
    const node = id ? byId.get(id) ?? null : null
    engine.setEmphasis({ selectedId: id, pathEdges: null, pathFrom: null })
    if (node) {
      renderCard(node)
      card.hidden = false
      // Measure after layout, then move the view into the space the card
      // leaves free - the same insets protocol the React shell ran.
      requestAnimationFrame(() => {
        if (card.hidden) return
        engine.setInsets(measureInsets())
        if (selectedId) engine.focusOn(selectedId, null)
      })
      card.focus({ preventScroll: true })
    } else {
      card.hidden = true
      card.innerHTML = ''
      engine.setInsets({ left: 0, right: 0, bottom: 0 })
    }
    if (user) opts.onSelect?.(node)
  }

  /** Select a flow (edge). Reuses the engine's path emphasis to light it up. */
  function setEdgeSelection(edge: MapEdge | null) {
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
      requestAnimationFrame(() => {
        if (!card.hidden) engine.setInsets(measureInsets())
      })
      card.focus({ preventScroll: true })
    } else {
      card.hidden = true
      card.innerHTML = ''
      engine.setInsets({ left: 0, right: 0, bottom: 0 })
    }
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

  pushData()

  // The embed seed: mount already-selected with the camera on the node.
  // Deliberately silent - the host asked for it, so it is not an event.
  if (opts.focus && byId.has(opts.focus)) setSelection(opts.focus)

  return {
    select: (id) => setSelection(id),
    destroy: () => {
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
