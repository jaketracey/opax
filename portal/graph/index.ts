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
  /** Observe selections (for the host page). */
  onSelect?: (node: MoneyNode | null) => void
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
.mm-ask:hover { background: #1d3a5c; }
.mm-zoom { position: absolute; right: 12px; bottom: 12px; display: flex;
  flex-direction: column; gap: 4px; }
.mm-zoom button { width: 34px; height: 34px; border: 1px solid #e4e1d8;
  border-radius: 9px; background: rgba(250, 249, 246, 0.92); font-size: 16px;
  color: #4a4942; cursor: pointer; }
.mm-zoom button:hover { background: #fff; }
.mm-hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  margin: 0; font-size: 11.5px; color: #8a8578; pointer-events: none;
  white-space: nowrap; }
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
  .mm-hint { display: none; }
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
  const askUrl = opts.askUrl ??
    ((industry: string) =>
      `/?ask=${encodeURIComponent(`What has parliament said about ${industry}?`)}`)

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

  const legend = el('div', 'mm-legend', container)
  const legendTitle = el('div', 'mm-legend-title', legend)
  legendTitle.textContent = 'Industries · click to isolate'

  const card = el('div', 'mm-card', container)
  card.tabIndex = -1
  card.setAttribute('role', 'region')
  card.setAttribute('aria-label', 'Details for the selected node')
  card.hidden = true

  const zoom = el('div', 'mm-zoom', container)
  const zoomButton = (label: string, title: string, onClick: () => void) => {
    const button = el('button', '', zoom)
    button.type = 'button'
    button.textContent = label
    button.setAttribute('aria-label', title)
    button.title = title
    button.addEventListener('click', onClick)
    return button
  }
  zoomButton('+', 'Zoom in', () => engine.zoomBy(1.3))
  zoomButton('−', 'Zoom out', () => engine.zoomBy(1 / 1.3))
  zoomButton('⤢', 'Fit the whole map to view', () => engine.fit(true))

  const hint = el('p', 'mm-hint', container)
  hint.textContent = `Drag to orbit · scroll to zoom · click a node — AEC returns ${
    raw.meta?.coverage ?? '1998–2026'
  }`

  // --- Engine ----------------------------------------------------------
  let selectedId: string | null = null
  let activeGroup: string | null = null

  const engine = new KnowledgeMapEngine(
    canvas,
    labels,
    (id) => setSelection(id),
    () => {
      // A lost WebGL context leaves a frozen canvas with no way back.
      canvas.replaceWith(Object.assign(document.createElement('div'), {
        className: 'mm-fallback',
        textContent: 'The 3D view lost its graphics context. Reload the page to restart it.',
      }))
    },
  )

  const aspectBucket = () => {
    const rect = container.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return 1.5
    const aspect = rect.width / rect.height
    return aspect < 1 ? 0.8 : aspect < 1.45 ? 1.2 : 1.9
  }

  let fitSig = ''
  const pushData = () => {
    const visibleNodes = activeGroup === null
      ? graph.nodes
      : graph.nodes.filter((n) => n.group === activeGroup || n.group === 'parties')
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    const visibleEdges = graph.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    )
    const data: EngineData = {
      nodes: visibleNodes,
      edges: visibleEdges,
      groupStyles: graph.groupStyles,
      degrees: graph.degrees,
      measure: 'resources',
      layout: 'grouped',
      aspect: aspectBucket(),
      centralGroup: 'parties',
    }
    engine.setData(data)
    const sig = `${data.aspect}|${activeGroup ?? '*'}`
    if (sig !== fitSig) {
      const firstFit = fitSig === ''
      fitSig = sig
      engine.fit(!firstFit)
    }
    if (selectedId && !visibleIds.has(selectedId)) setSelection(null)
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

  const renderCard = (node: MoneyNode) => {
    card.innerHTML = ''
    const close = el('button', 'mm-card-close', card)
    close.type = 'button'
    close.textContent = '✕'
    close.setAttribute('aria-label', 'Close details')
    close.addEventListener('click', () => setSelection(null))

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
          () => setSelection(party.id),
        )
      }
      const ask = el('a', 'mm-ask', card)
      ask.href = askUrl(node.industry.replace(/_/g, ' '))
      ask.textContent = 'What did parliament say about this industry?'
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
          () => setSelection(donor.id),
        )
      }
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

  function setSelection(id: string | null) {
    selectedId = id
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
    opts.onSelect?.(node)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selectedId) {
      setSelection(null)
      canvas.focus({ preventScroll: true })
      event.stopPropagation()
    }
  }
  container.addEventListener('keydown', onKeyDown)

  pushData()

  return {
    select: (id) => setSelection(id),
    destroy: () => {
      container.removeEventListener('keydown', onKeyDown)
      resizeObserver.disconnect()
      engine.dispose()
      for (const child of [canvas, labels, legend, card, zoom, hint]) child.remove()
      container.classList.remove('mm-root')
    },
  }
}
