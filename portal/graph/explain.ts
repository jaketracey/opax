// ---------------------------------------------------------------------------
// OPAX "Explain this flow" — one disclosed-money story and its record check.
//
// Rebuild the committed bundle (from portal/):
//
//   npx esbuild graph/explain.ts --bundle --minify --format=esm \
//     --target=es2022 --outfile=public/explain.js
//
// The portal shell supplies its route, title, answer-rendering and cached-data
// helpers. This module owns only the explanation UI and its three.js scene.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { clusterColour } from './palette.ts'

type ExplainKind = 'industry' | 'donor' | 'party'
type ExplainDetail = {
  kind: ExplainKind
  from?: string
  to?: string
  jurisdiction?: string
}
type YearCell = [number, number]
type MoneyNode = {
  id: string
  label: string
  kind: 'donor' | 'party'
  industry?: string
  group?: string
  colour?: string
  total?: number
  count?: number
  firstYear?: number | null
  lastYear?: number | null
  byYear?: Record<string, YearCell>
  undated?: YearCell
}
type MoneyEdge = {
  source: string
  target: string
  total?: number
  count?: number
  firstYear?: number | null
  lastYear?: number | null
  byYear?: Record<string, YearCell>
  undated?: YearCell
}
type MoneyGraph = {
  meta?: Record<string, unknown>
  nodes: MoneyNode[]
  edges: MoneyEdge[]
}
type AskSource = {
  slug?: string
  resource?: string
  title?: string
  speaker?: string
  party?: string
  date?: string
  cited?: boolean
}
type ExplainHelpers = {
  displayTitle: (record: AskSource) => string
  searchHash: (query: string, filters: Record<string, string>) => string
  askHash: (query: string) => string
  subjectHash: (kind: string, label: string) => string
  partyChipHTML: (party: string) => string
  fmtMoney: (amount: number) => string
  money?: MoneyGraph | null
  loadMoney: (jurisdiction: string) => Promise<MoneyGraph | null>
  loadAccess?: () => Promise<Record<string, unknown> | null>
  loadFits?: () => Promise<Record<string, unknown> | null>
  askRecord: (
    body: string,
    signal: AbortSignal,
    handlers?: { delta?: (text: string) => void; retry?: () => void; status?: (status: unknown) => void },
  ) => Promise<{ answer?: string; citations?: Record<string, unknown>; sources?: AskSource[] }>
  renderAnswer: (container: HTMLElement, answer: string) => void
  normName?: (name: string) => string
  industryLabel?: (industry: string) => string
  electionYears?: number[]
  aecNote?: string
  stateNotSummed?: string
}

type ResolvedFlow = {
  graph: MoneyGraph
  jurisdiction: string
  donor: MoneyNode | null
  party: MoneyNode | null
  industry: string | null
  donors: MoneyNode[]
  edges: MoneyEdge[]
  contextEdges: MoneyEdge[]
  years: Map<number, YearCell>
  total: number
  count: number
  undated: YearCell
  firstYear: number | null
  lastYear: number | null
  peakYear: number | null
  peakAmount: number
  donorRank: number | null
  otherParties: MoneyNode[]
  topDonors: Array<{ node: MoneyNode; total: number }>
  partyShares: Array<{ node: MoneyNode; total: number }>
  access: Record<string, unknown> | null
  fits: Record<string, unknown> | null
}

type SceneLabel = {
  text: string
  position: THREE.Vector3
  className?: string
  align?: 'start' | 'middle' | 'end'
  offsetX?: number
  offsetY?: number
}

type SceneRow = {
  label: string
  total: number
  colour: string
}

const STYLE_ID = 'opax-explain-style'
const FIRST_YEAR = 1998
const LAST_YEAR = 2025
const STEP_NAMES = [
  'Who gives',
  'How much, and when',
  'Where it lands',
  'What parliament said',
  'What this cannot prove',
] as const

const normFallback = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const importRuntime = (path: string): Promise<unknown> => import(path)
const importWombat = () => importRuntime('/wombat.js') as Promise<{
  mountWombat: (host: HTMLElement, options: { label: string }) => { destroy?: () => void }
}>

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.explain-dialog { width:min(1180px,calc(100vw - 1rem)); max-height:calc(100dvh - 1rem); }
.explain-dialog .game-dialog-head { border-bottom:1px solid var(--line); }
.explain-dialog-body { padding:0!important; }
.explain-shell { height:min(760px,calc(100dvh - 4.5rem)); min-height:580px;
  display:grid; grid-template-columns:minmax(0,55fr) minmax(360px,45fr); overflow:hidden; }
.explain-stage { position:relative; min-width:0; overflow:hidden; background:
  radial-gradient(ellipse at 48% 42%,rgba(160,118,27,.09),transparent 58%),var(--paper-sunken);
  border-right:1px solid var(--line); }
.explain-canvas { display:block; width:100%; height:100%; }
.explain-stage::after { content:""; position:absolute; inset:14px; pointer-events:none;
  border:1px solid rgba(160,118,27,.24); box-shadow:inset 0 0 0 5px rgba(250,249,246,.16); }
.explain-stage-label { position:absolute; z-index:2; top:1rem; max-width:42%; margin:0;
  color:var(--ink-soft); font:700 clamp(.78rem,1.4vw,.95rem)/1.35 var(--serif); }
.explain-stage-label.from { left:1.6rem; text-align:left; }
.explain-stage-label.to { right:1.6rem; text-align:right; }
.explain-stage-year { position:absolute; z-index:4; left:50%; top:3.35rem; bottom:auto; transform:translateX(-50%);
  margin:0; color:var(--bronze-ink); font:700 clamp(2.2rem,7vw,4.8rem)/1 var(--serif);
  font-variant-numeric:tabular-nums; text-shadow:0 1px var(--paper); }
.explain-stage-year small { display:block; margin-top:.35rem; color:var(--ink-soft);
  font:600 .75rem/1.3 var(--sans); text-align:center; }
.explain-stage-overlay { position:absolute; inset:0; z-index:3; overflow:hidden; pointer-events:none; }
.explain-scene-label { position:absolute; max-width:10.5rem; padding:.08rem .22rem;
  color:var(--ink-soft); background:color-mix(in srgb,var(--paper) 86%,transparent);
  font:700 clamp(.58rem,1vw,.72rem)/1.2 var(--serif); letter-spacing:-.005em;
  text-wrap:balance; text-shadow:0 1px var(--paper); white-space:nowrap; }
.explain-scene-label.destination { max-width:8.5rem; white-space:normal; }
.explain-scene-label.clock { color:var(--bronze-ink); font-size:.62rem; }
.explain-scene-label.election { padding:0; color:var(--bronze-ink); background:transparent;
  font-size:clamp(.5rem,.78vw,.61rem); font-weight:600; }
.explain-scene-label.peak { color:var(--bronze-ink); border-bottom:1px solid var(--bronze-rule);
  font-size:clamp(.6rem,.9vw,.7rem); }
.explain-narrative { min-width:0; overflow:auto; padding:clamp(1.1rem,3vw,2.2rem); }
.explain-title { margin:0; font:700 clamp(1.7rem,3.2vw,2.45rem)/1.12 var(--serif); letter-spacing:-.018em; }
.explain-deck { margin:.55rem 0 1.25rem; color:var(--ink-soft); font:400 .93rem/1.55 var(--serif); }
.explain-steps { display:flex; gap:.25rem; overflow:auto; margin:0 0 1.35rem; padding:0 0 .45rem;
  list-style:none; border-bottom:1px solid var(--bronze-rule); scrollbar-width:thin; }
.explain-step { min-width:44px; min-height:44px; display:grid; place-items:center; border:1px solid transparent;
  border-radius:999px; background:transparent; color:var(--ink-soft); cursor:pointer; font:600 .8rem/1 var(--sans); }
.explain-step:hover { border-color:var(--bronze-rule); }
.explain-step[aria-current="step"] { color:var(--paper-raised); background:var(--navy); border-color:var(--navy); }
.explain-step-copy { animation:explain-in .3s ease-out both; }
.explain-step-copy h2 { margin:0 0 .7rem; font:700 clamp(1.25rem,2vw,1.55rem)/1.2 var(--serif); }
.explain-step-copy p { margin:.65rem 0; font:400 .97rem/1.65 var(--serif); }
.explain-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1px;
  margin:1rem 0; border:1px solid var(--line); background:var(--line); }
.explain-fact { min-width:0; padding:.75rem; background:var(--paper); }
.explain-fact b { display:block; color:var(--bronze-ink); font:700 1.12rem/1.2 var(--serif); }
.explain-fact span { display:block; margin-top:.2rem; color:var(--ink-soft); font:500 .76rem/1.35 var(--sans); }
.explain-access { margin:.9rem 0; padding:.8rem .9rem; border-left:2px solid var(--bronze);
  background:var(--bronze-wash); color:var(--ink-soft); font:500 .82rem/1.55 var(--sans); }
.explain-parties,.explain-sources { margin:.7rem 0 0; padding:0; list-style:none; }
.explain-parties li,.explain-sources li { padding:.55rem 0; border-top:1px solid var(--line);
  display:flex; justify-content:space-between; gap:.8rem; align-items:baseline; }
.explain-parties a,.explain-sources a { color:var(--ink); text-decoration-color:var(--bronze-rule); }
.explain-parties b { white-space:nowrap; font-size:.85rem; }
.explain-source-copy { min-width:0; }
.explain-source-copy a { display:block; font:700 .9rem/1.35 var(--serif); }
.explain-source-copy small { display:block; margin-top:.2rem; color:var(--ink-soft); font:.76rem/1.4 var(--sans); }
.explain-answer { min-height:6rem; }
.explain-answer p,.explain-answer li { font-size:.93rem; }
.explain-record-link { display:inline-flex; align-items:center; min-height:44px; margin-top:.75rem;
  padding:.45rem .75rem; border:1px solid var(--line-strong); border-radius:4px; color:var(--ink);
  font:600 .82rem/1.3 var(--sans); text-decoration:none; }
.explain-record-link:hover { border-color:var(--ink); }
.explain-caveats { margin:.4rem 0 0; padding:0; list-style:none; }
.explain-caveats li { padding:.75rem 0 .75rem 1.1rem; border-top:1px solid var(--line);
  position:relative; font:400 .92rem/1.55 var(--serif); }
.explain-caveats li::before { content:""; position:absolute; left:0; top:1.35rem; width:6px;
  border-top:1px solid var(--bronze); }
.explain-controls { display:flex; justify-content:space-between; gap:.6rem; margin-top:1.25rem; }
.explain-controls button { min-height:44px; border:1px solid var(--line-strong); border-radius:4px;
  padding:.55rem .9rem; background:transparent; color:var(--ink); cursor:pointer; font:600 .84rem/1.2 var(--sans); }
.explain-controls button:last-child { margin-left:auto; background:var(--navy); border-color:var(--navy); color:var(--on-navy); }
.explain-controls button:disabled { opacity:.38; cursor:default; }
.explain-status { color:var(--ink-soft); font:.85rem/1.5 var(--sans); }
.explain-error { max-width:60ch; margin:2rem auto; padding:1rem; }
@keyframes explain-in { from { opacity:0; transform:translateY(5px); } }
@media (max-width:700px) {
  .explain-dialog { width:calc(100vw - .5rem); max-height:calc(100dvh - .5rem); }
  .explain-shell { display:block; height:auto; min-height:0; overflow:visible; }
  .explain-stage { position:sticky; top:44px; z-index:1; height:42vh; min-height:260px; max-height:390px;
    border-right:0; border-bottom:1px solid var(--line); }
  .explain-narrative { overflow:visible; padding:1.1rem; }
  .explain-stage-label { max-width:39%; font-size:.76rem; }
  .explain-stage-label.from { left:1rem; }.explain-stage-label.to { right:1rem; }
  .explain-stage-year { top:3rem; bottom:auto; font-size:2.2rem; }
  .explain-scene-label { max-width:6.7rem; font-size:.58rem; }
  .explain-scene-label.destination { max-width:5.8rem; }
  .explain-title { font-size:1.65rem; }
  .explain-facts { grid-template-columns:1fr 1fr; }
}
@media (prefers-reduced-motion:reduce) { .explain-step-copy { animation:none; } }
`
  document.head.appendChild(style)
}

function sumEdges(edges: MoneyEdge[]): { total: number; count: number; years: Map<number, YearCell>; undated: YearCell } {
  const years = new Map<number, YearCell>()
  let total = 0
  let count = 0
  const undated: YearCell = [0, 0]
  for (const edge of edges) {
    total += Number(edge.total) || 0
    count += Number(edge.count) || 0
    for (const [key, cell] of Object.entries(edge.byYear || {})) {
      const year = Number(key)
      if (!Number.isFinite(year)) continue
      const old = years.get(year) || [0, 0]
      years.set(year, [old[0] + (Number(cell?.[0]) || 0), old[1] + (Number(cell?.[1]) || 0)])
    }
    undated[0] += Number(edge.undated?.[0]) || 0
    undated[1] += Number(edge.undated?.[1]) || 0
  }
  return { total, count, years, undated }
}

function exactNode(nodes: MoneyNode[], kind: MoneyNode['kind'], label: string | undefined, norm: (s: string) => string) {
  if (!label) return null
  const key = norm(label)
  return nodes.find((node) => node.kind === kind && norm(node.label) === key) || null
}

async function resolveFlow(detail: ExplainDetail, helpers: ExplainHelpers): Promise<ResolvedFlow> {
  const jurisdiction = detail.jurisdiction || 'federal'
  const graph = helpers.money || await helpers.loadMoney(jurisdiction)
  if (!graph?.nodes?.length || !graph?.edges?.length) throw new Error('The disclosed-money data is unavailable')
  const norm = helpers.normName || normFallback
  let donor = detail.kind === 'donor' ? exactNode(graph.nodes, 'donor', detail.from, norm) : null
  let party = exactNode(graph.nodes, 'party', detail.to || (detail.kind === 'party' ? detail.from : ''), norm)
  const industry = detail.kind === 'industry' ? String(detail.from || '').trim() : donor?.group || donor?.industry || null

  let donors: MoneyNode[] = []
  let contextEdges: MoneyEdge[] = []
  if (detail.kind === 'donor') {
    if (!donor) throw new Error(`No disclosed donor named ${detail.from || 'that name'} was found`)
    donors = [donor]
    contextEdges = graph.edges.filter((edge) => edge.source === donor!.id)
  } else if (detail.kind === 'party') {
    if (!party) throw new Error(`No disclosed party named ${detail.to || detail.from || 'that name'} was found`)
    contextEdges = graph.edges.filter((edge) => edge.target === party!.id)
    const ids = new Set(contextEdges.map((edge) => edge.source))
    donors = graph.nodes.filter((node) => node.kind === 'donor' && ids.has(node.id))
  } else {
    const industryKey = norm(industry || '')
    donors = graph.nodes.filter((node) => node.kind === 'donor' &&
      [node.group, node.industry].some((value) => norm(String(value || '').replace(/_/g, ' ')) === industryKey))
    if (!donors.length) throw new Error(`No disclosed ${detail.from || 'industry'} donors were found`)
    const ids = new Set(donors.map((node) => node.id))
    contextEdges = graph.edges.filter((edge) => ids.has(edge.source))
  }

  let edges = contextEdges
  if (party) edges = edges.filter((edge) => edge.target === party!.id)
  if (!edges.length) throw new Error('No disclosed flow matches these two sides')
  if (!party) {
    const byTarget = new Map<string, number>()
    for (const edge of edges) byTarget.set(edge.target, (byTarget.get(edge.target) || 0) + (Number(edge.total) || 0))
    const target = [...byTarget].sort((a, b) => b[1] - a[1])[0]?.[0]
    party = graph.nodes.find((node) => node.id === target && node.kind === 'party') || null
  }

  const aggregate = sumEdges(edges)
  const nonzeroYears = [...aggregate.years].filter(([, cell]) => cell[0] > 0).sort((a, b) => a[0] - b[0])
  const peak = [...nonzeroYears].sort((a, b) => b[1][0] - a[1][0])[0]
  const rankedDonors = graph.nodes.filter((node) => node.kind === 'donor')
    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
  const donorRank = donor ? rankedDonors.findIndex((node) => node.id === donor!.id) + 1 : null

  const partyTotals = new Map<string, number>()
  for (const edge of contextEdges) partyTotals.set(edge.target, (partyTotals.get(edge.target) || 0) + (Number(edge.total) || 0))
  const partyShares = [...partyTotals].map(([id, total]) => ({
    node: graph.nodes.find((node) => node.id === id && node.kind === 'party')!, total,
  })).filter((row) => row.node).sort((a, b) => b.total - a.total)
  const otherParties = partyShares.filter((row) => row.node.id !== party?.id).map((row) => row.node)

  const donorTotals = new Map<string, number>()
  for (const edge of edges) donorTotals.set(edge.source, (donorTotals.get(edge.source) || 0) + (Number(edge.total) || 0))
  const topDonors = [...donorTotals].map(([id, total]) => ({
    node: graph.nodes.find((node) => node.id === id && node.kind === 'donor')!, total,
  })).filter((row) => row.node).sort((a, b) => b.total - a.total)

  const [access, fits] = await Promise.all([
    helpers.loadAccess?.().catch(() => null) || Promise.resolve(null),
    helpers.loadFits?.().catch(() => null) || Promise.resolve(null),
  ])
  return {
    graph, jurisdiction, donor, party, industry, donors, edges, contextEdges,
    years: aggregate.years, total: aggregate.total, count: aggregate.count, undated: aggregate.undated,
    firstYear: nonzeroYears[0]?.[0] ?? null,
    lastYear: nonzeroYears[nonzeroYears.length - 1]?.[0] ?? null,
    peakYear: peak?.[0] ?? null, peakAmount: peak?.[1]?.[0] ?? 0,
    donorRank: donorRank && donorRank > 0 ? donorRank : null,
    otherParties, topDonors, partyShares,
    access: access as Record<string, unknown> | null,
    fits: fits as Record<string, unknown> | null,
  }
}

function labelForIndustry(value: string | null, helpers: ExplainHelpers) {
  if (!value) return 'Disclosed donors'
  return helpers.industryLabel ? helpers.industryLabel(value) : value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function stageShortLabel(value: string) {
  const known: Record<string, string> = {
    "Katter's Australian Party": "Katter's",
    'United Australia Party': 'United Australia',
    'Country Liberal Party': 'Country Liberal',
  }
  return known[value] || (value.length > 24 ? `${value.slice(0, 22).trim()}…` : value)
}

function titleFor(flow: ResolvedFlow, detail: ExplainDetail, helpers: ExplainHelpers) {
  if (detail.kind === 'party') return `Where ${flow.party?.label || detail.to || 'the party'}’s money comes from`
  const from = flow.donor?.label || labelForIndustry(flow.industry, helpers)
  return detail.to && flow.party ? `${from} → ${flow.party.label}` : `Where ${from}’s money went`
}

function describeAccess(flow: ResolvedFlow, helpers: ExplainHelpers): string {
  const accessDonors = (flow.access?.donors || {}) as Record<string, {
    meetings_total?: number
    meetings?: unknown[]
    lobbyists_total?: number
    lobbyists?: unknown[]
  }>
  let meetings = 0
  let lobbyists = 0
  let fits = 0
  let donorsWithMeetings = 0
  let donorsWithLobbyists = 0
  let donorsWithFits = 0
  for (const donor of flow.donors) {
    const access = accessDonors[donor.label]
    const donorMeetings = Number(access?.meetings_total) || access?.meetings?.length || 0
    const donorLobbyists = Number(access?.lobbyists_total) || access?.lobbyists?.length || 0
    const key = (helpers.normName || normFallback)(donor.label)
    const donorFits = ((flow.fits?.by_entity as Record<string, unknown[]> | undefined)?.[key] || []).length
    meetings += donorMeetings
    lobbyists += donorLobbyists
    fits += donorFits
    if (donorMeetings) donorsWithMeetings++
    if (donorLobbyists) donorsWithLobbyists++
    if (donorFits) donorsWithFits++
  }
  const parts = []
  const many = flow.donors.length > 1
  if (meetings) parts.push(many
    ? `${donorsWithMeetings.toLocaleString()} shown donor${donorsWithMeetings === 1 ? '' : 's'} match ministerial diaries`
    : `${meetings.toLocaleString()} disclosed ministerial meeting${meetings === 1 ? '' : 's'}`)
  if (lobbyists) parts.push(many
    ? `${donorsWithLobbyists.toLocaleString()} shown donor${donorsWithLobbyists === 1 ? '' : 's'} match lobbying registers`
    : `${lobbyists.toLocaleString()} registered lobbying firm${lobbyists === 1 ? '' : 's'}`)
  if (fits) parts.push(many
    ? `${donorsWithFits.toLocaleString()} shown donor${donorsWithFits === 1 ? '' : 's'} match the Foreign Influence Transparency Scheme register`
    : `${fits.toLocaleString()} Foreign Influence Transparency Scheme registration${fits === 1 ? '' : 's'}`)
  return parts.length ? `${parts.join(' · ')}. These are register matches, not evidence that a donation bought access.` : ''
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function facts(rows: Array<[string, string]>) {
  const box = el('div', 'explain-facts')
  for (const [value, label] of rows) {
    const item = el('div', 'explain-fact')
    item.append(el('b', '', value), el('span', '', label))
    box.append(item)
  }
  return box
}

function partyList(rows: Array<{ node: MoneyNode; total: number }>, flow: ResolvedFlow, helpers: ExplainHelpers) {
  const list = el('ul', 'explain-parties')
  for (const row of rows.slice(0, 5)) {
    const li = el('li')
    const a = el('a')
    a.href = helpers.subjectHash(row.node.kind, row.node.label)
    a.textContent = row.node.label
    const amount = el('b', '', helpers.fmtMoney(row.total))
    li.append(a, amount)
    list.append(li)
  }
  return list
}

function questionFor(flow: ResolvedFlow, detail: ExplainDetail, helpers: ExplainHelpers) {
  const party = flow.party?.label
  if (detail.kind === 'party') return `What has parliament said about donations to ${party}?`
  const giver = flow.donor?.label || labelForIndustry(flow.industry, helpers)
  return party && detail.to
    ? `What has parliament said about donations from ${giver} to ${party}?`
    : `What has parliament said about donations from ${giver} to Australian political parties?`
}

function sourceList(data: { citations?: Record<string, unknown>; sources?: AskSource[] }, helpers: ExplainHelpers) {
  const sources = data.sources || []
  const fallback = new Set(Object.keys(data.citations || {}).map((key) => key.split('/')[0]))
  const cited = sources.filter((source) => source.cited ?? (source.resource ? fallback.has(source.resource) : false))
  const shown = (cited.length ? cited : sources).filter((source) => source.slug).slice(0, 6)
  const list = el('ol', 'explain-sources')
  for (const source of shown) {
    const li = el('li')
    const copy = el('span', 'explain-source-copy')
    const link = el('a')
    link.href = `/doc/${encodeURIComponent(String(source.slug))}`
    link.textContent = helpers.displayTitle(source)
    copy.append(link)
    if (source.party || source.speaker || source.date) {
      const meta = el('small')
      if (source.party) {
        const chip = el('span')
        chip.innerHTML = helpers.partyChipHTML(source.party)
        meta.append(chip)
      }
      const words = [source.speaker, source.date].filter(Boolean).join(' · ')
      if (words) meta.append(document.createTextNode(`${source.party ? ' · ' : ''}${words}`))
      copy.append(meta)
    }
    li.append(copy)
    list.append(li)
  }
  return list
}

class FlowScene {
  readonly canvas: HTMLCanvasElement
  private readonly host: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(34, 1, .1, 100)
  private readonly root = new THREE.Group()
  private readonly baseGroup = new THREE.Group()
  private readonly whoGroup = new THREE.Group()
  private readonly historyGroup = new THREE.Group()
  private readonly giverGroup: THREE.Group
  private readonly receiverGroup: THREE.Group
  private readonly mainArc: THREE.Line
  private readonly mainArrow: THREE.Mesh
  private readonly arcMaterial: THREE.LineBasicMaterial
  private readonly travellingMaterial: THREE.ShaderMaterial
  private readonly travellingGeometry: THREE.BufferGeometry
  private readonly travelling: THREE.Points
  private readonly historyGeometry: THREE.BufferGeometry
  private readonly historyPositions: Float32Array
  private readonly historyTargets = new Float32Array(LAST_YEAR - FIRST_YEAR + 1)
  private readonly labelLayer: HTMLDivElement
  private readonly resizeObserver: ResizeObserver
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)')
  private readonly travellingPositions = new Float32Array(72 * 3)
  private readonly flow: ResolvedFlow
  private readonly detail: ExplainDetail
  private readonly helpers: ExplainHelpers
  private readonly giverColour: string
  private readonly partyColour: string
  private readonly giverPoint = new THREE.Vector3(-3.5, -.62, 0)
  private readonly whoGiverPoint = new THREE.Vector3(-3.0, -.62, 0)
  private readonly receiverPoint = new THREE.Vector3(3.5, -.62, 0)
  private labels: Array<SceneLabel & { element: HTMLSpanElement }> = []
  private step = 0
  private year = LAST_YEAR
  private yearAmount = 0
  private maxYearAmount = 1
  private baseTargetZ = 11.8
  private targetZ = 11.8
  private currentZ = 11.8
  private targetCameraX = 0
  private targetCameraY = .16
  private currentCameraX = 0
  private currentCameraY = .16
  private aspect = 1
  private narrow = false
  private raf = 0
  private start = performance.now()
  private lastPaint = 0
  private destroyed = false
  private visible = true
  onYear: ((year: number, amount: number) => void) | null = null

  constructor(
    host: HTMLElement,
    flow: ResolvedFlow,
    detail: ExplainDetail,
    giverColour: string,
    partyColour: string,
    helpers: ExplainHelpers,
  ) {
    this.host = host
    this.flow = flow
    this.detail = detail
    this.helpers = helpers
    this.giverColour = giverColour
    this.partyColour = partyColour
    this.canvas = el('canvas', 'explain-canvas')
    this.canvas.setAttribute('aria-hidden', 'true')
    host.prepend(this.canvas)
    this.labelLayer = el('div', 'explain-stage-overlay')
    this.labelLayer.setAttribute('aria-hidden', 'true')
    host.append(this.labelLayer)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
    this.scene.add(this.root)
    this.root.add(this.baseGroup, this.whoGroup, this.historyGroup)
    this.camera.position.set(0, .16, this.currentZ)

    const arcPoints = Array.from({ length: 73 }, (_, index) => this.pointAt(index / 72))
    this.arcMaterial = new THREE.LineBasicMaterial({ color: giverColour, transparent: true, opacity: .42 })
    this.mainArc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPoints), this.arcMaterial)
    this.baseGroup.add(this.mainArc)
    this.giverGroup = this.makeHatchedMedallion(giverColour, .48)
    this.giverGroup.position.copy(this.giverPoint)
    this.receiverGroup = this.makeHatchedMedallion(partyColour, .48, false)
    this.receiverGroup.position.copy(this.receiverPoint)
    this.baseGroup.add(this.giverGroup, this.receiverGroup)

    const arrowAt = this.pointAt(.84)
    const tangent = this.pointAt(.846).sub(this.pointAt(.834)).normalize()
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0)
    const arrowGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      arrowAt.x + tangent.x * .16, arrowAt.y + tangent.y * .16, .04,
      arrowAt.x - tangent.x * .11 + normal.x * .11, arrowAt.y - tangent.y * .11 + normal.y * .11, .04,
      arrowAt.x - tangent.x * .11 - normal.x * .11, arrowAt.y - tangent.y * .11 - normal.y * .11, .04,
    ], 3))
    this.mainArrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({
      color: giverColour, transparent: true, opacity: .58, side: THREE.DoubleSide,
    }))
    this.baseGroup.add(this.mainArrow)

    this.buildWhoGives()
    const history = this.buildHistory()
    this.historyGeometry = history.geometry
    this.historyPositions = history.positions

    this.travellingGeometry = new THREE.BufferGeometry()
    this.travellingGeometry.setAttribute('position', new THREE.BufferAttribute(this.travellingPositions, 3))
    this.travellingGeometry.setDrawRange(0, 0)
    this.travellingMaterial = this.makePointMaterial(giverColour, .52, true)
    this.travelling = new THREE.Points(this.travellingGeometry, this.travellingMaterial)
    this.travelling.frustumCulled = false
    this.baseGroup.add(this.travelling)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.motion.addEventListener('change', this.motionChanged)
    document.addEventListener('visibilitychange', this.visibilityChanged)
    this.resize()
    this.draw(performance.now())
  }

  private seeded(index: number, salt = 0) {
    const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
    return value - Math.floor(value)
  }

  private makePointMaterial(colour: string, alpha: number, sized = false) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColour: { value: new THREE.Color(colour) }, uAlpha: { value: alpha } },
      vertexShader: `${sized ? 'attribute float aSize;' : ''}
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=${sized ? 'aSize' : '3.0'}*(9.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 uColour;uniform float uAlpha;
        void main(){float d=length(gl_PointCoord-vec2(.5));float a=1.0-smoothstep(.2,.5,d);
        if(a<=.01)discard;gl_FragColor=vec4(uColour,uAlpha*a);}`,
    })
  }

  private makeHatchedMedallion(colour: string, radius: number, hatch = true) {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(
      new THREE.CircleGeometry(radius * .84, 48),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .055, side: THREE.DoubleSide }),
    ))
    group.add(new THREE.Mesh(
      new THREE.RingGeometry(radius * .84, radius, 56),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .9, side: THREE.DoubleSide }),
    ))
    if (hatch) {
      const vertices: number[] = []
      for (let y = -radius * .66; y <= radius * .66; y += radius * .19) {
        const half = Math.sqrt(Math.max(0, radius * radius * .7 - y * y))
        vertices.push(-half, y, .025, half, y, .025)
      }
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)),
        new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .38 }),
      )
      lines.rotation.z = -.34
      group.add(lines)
    }
    return group
  }

  private pointAt(t: number, from = this.giverPoint, to = this.receiverPoint, lift = 2.9) {
    return new THREE.Vector3(
      THREE.MathUtils.lerp(from.x, to.x, t),
      THREE.MathUtils.lerp(from.y, to.y, t) + Math.sin(Math.PI * t) * lift,
      THREE.MathUtils.lerp(from.z, to.z, t),
    )
  }

  private partyRows(): SceneRow[] {
    return this.flow.partyShares.map((row) => ({
      label: row.node.label,
      total: row.total,
      colour: row.node.colour || this.partyColour,
    }))
  }

  private industryRows(): SceneRow[] {
    const donors = new Map(this.flow.graph.nodes.filter((node) => node.kind === 'donor').map((node) => [node.id, node]))
    const totals = new Map<string, number>()
    for (const edge of this.flow.contextEdges) {
      const donor = donors.get(edge.source)
      const group = donor?.group || donor?.industry || 'other'
      totals.set(group, (totals.get(group) || 0) + (Number(edge.total) || 0))
    }
    return [...totals].map(([group, total]) => ({
      label: labelForIndustry(group, this.helpers), total, colour: clusterColour(group).colour,
    })).sort((a, b) => b.total - a.total)
  }

  private buildWhoGives() {
    if (this.detail.kind === 'party') {
      const rows = this.industryRows().slice(0, 7)
      const max = Math.max(...rows.map((row) => row.total), 1)
      const vertices: number[] = []
      rows.forEach((row, index) => {
        const y = rows.length === 1 ? -.55 : 1.45 - index * (2.95 / Math.max(1, rows.length - 1))
        const position = new THREE.Vector3(-3.42 + (index % 2) * .22, y, 0)
        const scale = .48 + .46 * Math.sqrt(row.total / max)
        const medallion = this.makeHatchedMedallion(row.colour, .34)
        medallion.position.copy(position)
        medallion.scale.setScalar(scale)
        this.whoGroup.add(medallion)
        for (let point = 0; point < 18; point++) {
          const curve = this.pointAt(point / 17, position, this.receiverPoint, 1.05 + index * .08)
          vertices.push(curve.x, curve.y, -.03)
          if (point > 0 && point < 17) vertices.push(curve.x, curve.y, -.03)
        }
      })
      if (vertices.length) this.whoGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)),
        new THREE.LineBasicMaterial({ color: 0x8a5a12, transparent: true, opacity: .18 }),
      ))
      return
    }

    const aggregate = sumEdges(this.flow.contextEdges)
    const receiptCount = [...aggregate.years.values()].reduce((sum, cell) => sum + Math.max(0, Math.round(cell[1])), 0)
    const positions = new Float32Array(receiptCount * 3)
    const sizes = new Float32Array(receiptCount)
    let cursor = 0
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
      const cell = aggregate.years.get(year) || [0, 0]
      const count = Math.max(0, Math.round(cell[1]))
      const average = count ? cell[0] / count : 0
      const yearAngle = Math.PI / 2 - ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR + 1)) * Math.PI * 2
      for (let index = 0; index < count; index++) {
        const radial = .62 + this.seeded(cursor, 1) * .58
        const angle = yearAngle + (this.seeded(cursor, 2) - .5) * .17
        positions[cursor * 3] = this.whoGiverPoint.x + Math.cos(angle) * radial
        positions[cursor * 3 + 1] = this.whoGiverPoint.y + Math.sin(angle) * radial
        positions[cursor * 3 + 2] = -.04 + this.seeded(cursor, 3) * .07
        sizes[cursor] = THREE.MathUtils.clamp(1.7 + Math.log10(average + 1) * .68, 2.2, 5.7)
        cursor++
      }
    }
    const seedGeometry = new THREE.BufferGeometry()
    seedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    seedGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    const seedPoints = new THREE.Points(seedGeometry, this.makePointMaterial(this.giverColour, .32, true))
    seedPoints.frustumCulled = false
    this.whoGroup.add(seedPoints)

    const clockVertices: number[] = []
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
      const angle = Math.PI / 2 - ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR + 1)) * Math.PI * 2
      const inner = year === FIRST_YEAR || year === LAST_YEAR ? 1.27 : 1.23
      clockVertices.push(
        this.whoGiverPoint.x + Math.cos(angle) * inner, this.whoGiverPoint.y + Math.sin(angle) * inner, -.08,
        this.whoGiverPoint.x + Math.cos(angle) * 1.32, this.whoGiverPoint.y + Math.sin(angle) * 1.32, -.08,
      )
    }
    this.whoGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(clockVertices, 3)),
      new THREE.LineBasicMaterial({ color: 0x8a5a12, transparent: true, opacity: .28 }),
    ))

    const rows = this.partyRows().slice(0, 7)
    const max = Math.max(...rows.map((row) => row.total), 1)
    const branchVertices: number[] = []
    rows.forEach((row, index) => {
      const y = rows.length === 1 ? -.62 : 1.42 - index * (2.9 / Math.max(1, rows.length - 1))
      const position = new THREE.Vector3(3.46 - (index % 2) * .18, y, 0)
      const scale = .54 + .78 * Math.sqrt(row.total / max)
      const medallion = this.makeHatchedMedallion(row.colour, .34, false)
      medallion.position.copy(position)
      medallion.scale.setScalar(scale)
      this.whoGroup.add(medallion)
      for (let point = 0; point < 18; point++) {
        const curve = this.pointAt(point / 17, this.whoGiverPoint, position, 1.45 + index * .07)
        branchVertices.push(curve.x, curve.y, -.06)
        if (point > 0 && point < 17) branchVertices.push(curve.x, curve.y, -.06)
      }
    })
    if (branchVertices.length) this.whoGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(branchVertices, 3)),
      new THREE.LineBasicMaterial({ color: this.giverColour, transparent: true, opacity: .14 }),
    ))
  }

  private buildHistory() {
    const years = LAST_YEAR - FIRST_YEAR + 1
    const elections = new Set(this.helpers.electionYears || [])
    const staticSegments = 1 + years + elections.size
    const positions = new Float32Array(staticSegments * 2 * 3)
    const baselineY = -2.16
    const xAt = (year: number) => -3.5 + ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 7
    const max = Math.max(...[...this.flow.years.values()].map((cell) => cell[0]), 1)
    let offset = 0
    for (let index = 0; index < years; index++) {
      const year = FIRST_YEAR + index
      this.historyTargets[index] = Math.sqrt((this.flow.years.get(year)?.[0] || 0) / max) * 1.08
      positions[offset++] = xAt(year)
      positions[offset++] = baselineY
      positions[offset++] = 0
      positions[offset++] = xAt(year)
      positions[offset++] = baselineY
      positions[offset++] = 0
    }
    positions[offset++] = -3.56
    positions[offset++] = baselineY
    positions[offset++] = -.02
    positions[offset++] = 3.56
    positions[offset++] = baselineY
    positions[offset++] = -.02
    for (const year of elections) {
      if (year < FIRST_YEAR || year > LAST_YEAR) continue
      positions[offset++] = xAt(year)
      positions[offset++] = baselineY - .05
      positions[offset++] = .02
      positions[offset++] = xAt(year)
      positions[offset++] = baselineY + .17
      positions[offset++] = .02
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.historyGroup.add(new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x8a5a12, transparent: true, opacity: .54 }),
    ))
    return { geometry, positions }
  }

  private updateHistory(cutoff: number) {
    const baselineY = -2.16
    for (let index = 0; index < this.historyTargets.length; index++) {
      const year = FIRST_YEAR + index
      this.historyPositions[index * 6 + 4] = baselineY + (year <= cutoff ? this.historyTargets[index] : 0)
    }
    ;(this.historyGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  private setLabels(labels: SceneLabel[]) {
    this.labelLayer.replaceChildren()
    this.labels = labels.map((label) => {
      const element = el('span', `explain-scene-label ${label.className || ''}`.trim(), label.text)
      this.labelLayer.append(element)
      return { ...label, element }
    })
    this.updateLabels()
  }

  private labelsForStep(step: number): SceneLabel[] {
    if (step === 0) {
      if (this.detail.kind === 'party') {
        const rows = this.industryRows().slice(0, 7)
        return rows.map((row, index) => ({
          text: row.label,
          position: new THREE.Vector3(-3.0 + (index % 2) * .2, rows.length === 1 ? -.55 : 1.45 - index * (2.95 / Math.max(1, rows.length - 1)), .08),
          className: 'destination', align: 'start', offsetX: 5,
        }))
      }
      const rows = this.partyRows().slice(0, 7)
      return [
        { text: '1998', position: new THREE.Vector3(this.whoGiverPoint.x, this.whoGiverPoint.y + 1.43, .08), className: 'clock', align: 'middle' },
        ...rows.map((row, index) => ({
          text: stageShortLabel(row.label),
          position: new THREE.Vector3(3.02 - (index % 2) * .18, rows.length === 1 ? -.62 : 1.42 - index * (2.9 / Math.max(1, rows.length - 1)), .08),
          className: 'destination', align: 'end' as const, offsetX: -5,
        })),
      ]
    }
    if (step === 1) {
      const xAt = (year: number) => -3.5 + ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 7
      const elections = (this.helpers.electionYears || []).filter((year) => year >= FIRST_YEAR && year <= LAST_YEAR)
      const peakHeight = this.flow.peakYear
        ? this.historyTargets[this.flow.peakYear - FIRST_YEAR] || 0
        : 0
      return [
        ...elections.map((year) => ({
          text: String(year), position: new THREE.Vector3(xAt(year), -2.34, .05),
          className: 'election', align: 'middle' as const,
        })),
        ...(this.flow.peakYear ? [{
          text: `${this.flow.peakYear} · ${this.helpers.fmtMoney(this.flow.peakAmount)}`,
          position: new THREE.Vector3(xAt(this.flow.peakYear), -2.16 + peakHeight + .18, .06),
          className: 'peak', align: 'middle' as const,
        }] : []),
      ]
    }
    return []
  }

  private updateLabels() {
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (!width || !height) return
    this.camera.updateMatrixWorld()
    for (const label of this.labels) {
      const projected = label.position.clone().project(this.camera)
      const x = (projected.x * .5 + .5) * width + (label.offsetX || 0)
      const y = (-projected.y * .5 + .5) * height + (label.offsetY || 0)
      const translateX = label.align === 'start' ? '0%' : label.align === 'end' ? '-100%' : '-50%'
      label.element.style.left = `${x.toFixed(1)}px`
      label.element.style.top = `${y.toFixed(1)}px`
      label.element.style.transform = `translate(${translateX},-50%)`
      label.element.hidden = projected.z < -1 || projected.z > 1
    }
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(width, height, false)
    this.aspect = width / height
    this.narrow = width <= 700
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
    this.targetZ = this.baseTargetZ * Math.max(1, 1.26 / this.aspect)
    this.draw(performance.now())
  }

  private motionChanged = () => {
    this.start = performance.now()
    if (this.motion.matches) {
      this.year = LAST_YEAR
      this.yearAmount = this.flow.years.get(this.year)?.[0] || 0
      this.updateHistory(LAST_YEAR)
      this.onYear?.(this.year, this.yearAmount)
    }
    this.ensureLoop()
  }

  private visibilityChanged = () => {
    this.visible = !document.hidden
    if (!this.visible && this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.visible) this.ensureLoop()
  }

  setStep(step: number) {
    this.step = step
    this.host.dataset.explainStep = String(step)
    this.baseTargetZ = [11.45, 10.65, 11.1, 11.9, 12.3][step] || 11.8
    this.targetCameraX = [0, 0, .08, -.08, 0][step] || 0
    this.targetCameraY = [.12, .02, .13, .2, .16][step] || .16
    this.targetZ = this.baseTargetZ * Math.max(1, 1.26 / this.aspect)
    this.maxYearAmount = Math.max(...[...this.flow.years.values()].map((cell) => cell[0]), 1)
    this.start = performance.now()
    this.whoGroup.visible = step === 0
    this.mainArc.visible = step !== 0
    this.mainArrow.visible = step !== 0
    this.historyGroup.visible = step === 1
    this.travelling.visible = step === 1 || step === 3 || step === 4
    this.giverGroup.visible = step !== 0 || this.detail.kind !== 'party'
    this.giverGroup.position.x = step === 0 && this.detail.kind !== 'party' ? this.whoGiverPoint.x : this.giverPoint.x
    this.receiverGroup.visible = step !== 0 || this.detail.kind === 'party'
    this.arcMaterial.opacity = step === 4 ? .16 : step === 3 ? .27 : step === 0 ? .26 : .46
    this.travellingMaterial.uniforms.uAlpha.value = step === 1 ? .58 : .22
    if (step === 1) {
      this.year = this.motion.matches ? LAST_YEAR : FIRST_YEAR
      this.yearAmount = this.flow.years.get(this.year)?.[0] || 0
      this.updateHistory(this.year)
      this.onYear?.(this.year, this.yearAmount)
    } else {
      this.year = LAST_YEAR
      this.yearAmount = this.flow.years.get(LAST_YEAR)?.[0] || 0
      this.updateHistory(LAST_YEAR)
      this.onYear?.(this.year, this.yearAmount)
    }
    this.setLabels(this.labelsForStep(step))
    this.ensureLoop()
  }

  private ensureLoop() {
    if (this.destroyed || !this.visible) return
    if (this.motion.matches) {
      this.draw(performance.now())
      return
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (this.destroyed || !this.visible) return
    if (!this.narrow || now - this.lastPaint >= 32) this.draw(now)
    this.raf = requestAnimationFrame(this.frame)
  }

  private draw(now: number) {
    if (this.destroyed) return
    this.lastPaint = now
    const still = this.motion.matches
    const ease = still ? 1 : .065
    this.currentZ += (this.targetZ - this.currentZ) * ease
    this.currentCameraX += (this.targetCameraX - this.currentCameraX) * ease
    this.currentCameraY += (this.targetCameraY - this.currentCameraY) * ease
    const elapsed = (now - this.start) / 1000
    const drift = still ? 0 : Math.sin(now * .00012) * .035
    this.camera.position.set(this.currentCameraX + drift, this.currentCameraY, this.currentZ)

    let historyComplete = still
    if (this.step === 1 && !still) {
      const progress = Math.min(1, elapsed / 7.2)
      historyComplete = progress >= 1
      const nextYear = Math.min(LAST_YEAR, FIRST_YEAR + Math.floor(progress * (LAST_YEAR - FIRST_YEAR + 1)))
      if (nextYear !== this.year) {
        this.year = nextYear
        this.yearAmount = this.flow.years.get(this.year)?.[0] || 0
        this.updateHistory(this.year)
        this.onYear?.(this.year, this.yearAmount)
      }
    }

    const ratio = Math.max(0, this.yearAmount) / this.maxYearAmount
    const desired = this.step === 1
      ? historyComplete ? 10 : Math.max(1, Math.round(2 + 58 * ratio))
      : this.step === 4 ? 4 : this.step === 3 ? 10 : 0
    const count = Math.min(72, desired)
    const flowT = still ? .82 : (elapsed % (historyComplete ? 9 : 2.8)) / (historyComplete ? 9 : 2.8)
    for (let index = 0; index < count; index++) {
      const t = still ? Math.min(.88, .13 + index * .07) : (flowT + index / Math.max(count, 1)) % 1
      const point = this.pointAt(t)
      this.travellingPositions[index * 3] = point.x
      this.travellingPositions[index * 3 + 1] = point.y
      this.travellingPositions[index * 3 + 2] = .07
    }
    ;(this.travellingGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    this.travellingGeometry.setDrawRange(0, count)
    this.updateLabels()
    this.renderer.render(this.scene, this.camera)
  }

  updateYearAmount(amount: number) {
    this.yearAmount = amount
  }

  destroy() {
    this.destroyed = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.motion.removeEventListener('change', this.motionChanged)
    document.removeEventListener('visibilitychange', this.visibilityChanged)
    this.scene.traverse((object) => {
      const drawable = object as THREE.Mesh
      drawable.geometry?.dispose?.()
      const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material]
      for (const material of materials) {
        const map = (material as THREE.Material & { map?: THREE.Texture }).map
        map?.dispose()
        material?.dispose?.()
      }
    })
    this.renderer.dispose()
    this.labelLayer.remove()
    this.canvas.remove()
  }
}

export function mountExplain(container: HTMLElement, detail: ExplainDetail, helpers: ExplainHelpers): { destroy(): void } {
  injectStyles()
  let destroyed = false
  let scene: FlowScene | null = null
  let askAbort: AbortController | null = null
  let askStarted = false
  let askPending = false
  let askText = ''
  let askResult: { answer?: string; citations?: Record<string, unknown>; sources?: AskSource[] } | null = null
  let askFailure = ''
  let step = 0
  let flow: ResolvedFlow | null = null
  let copy: HTMLElement | null = null
  let stepButtons: HTMLButtonElement[] = []
  let prev: HTMLButtonElement | null = null
  let next: HTMLButtonElement | null = null
  let yearLabel: HTMLElement | null = null

  container.replaceChildren()
  const loading = el('div', 'explain-error')
  container.append(loading)
  let waitHandle: { destroy?: () => void } | null = null
  importWombat().then((mod) => {
    if (!destroyed && loading.isConnected) waitHandle = mod.mountWombat(loading, { label: 'Reading the money map.' })
  }).catch(() => { if (!destroyed) loading.append(el('p', 'explain-status', 'Reading the money map.')) })

  const renderStep = () => {
    if (!flow || !copy || !scene) return
    waitHandle?.destroy?.()
    waitHandle = null
    copy.replaceChildren()
    copy.classList.remove('explain-step-copy')
    void copy.offsetWidth
    copy.classList.add('explain-step-copy')
    stepButtons.forEach((button, index) => {
      if (index === step) button.setAttribute('aria-current', 'step')
      else button.removeAttribute('aria-current')
    })
    if (prev) prev.disabled = step === 0
    if (next) {
      next.disabled = step === STEP_NAMES.length - 1
      next.textContent = step === STEP_NAMES.length - 2 ? 'Read the limits' : 'Next'
    }
    scene?.setStep(step)
    if (yearLabel) yearLabel.hidden = step !== 1

    const heading = el('h2', '', STEP_NAMES[step])
    copy.append(heading)
    const yearsActive = flow.firstYear && flow.lastYear
      ? (flow.firstYear === flow.lastYear ? `${flow.firstYear}` : `${flow.firstYear}–${flow.lastYear}`)
      : 'No dated receipts'
    if (step === 0) {
      let text = ''
      if (detail.kind === 'donor' && flow.donor) {
        text = `${flow.donor.label} is grouped with ${labelForIndustry(flow.donor.industry || flow.donor.group || '', helpers).toLowerCase()} donors. ` +
          `The map holds ${helpers.fmtMoney(Number(flow.donor.total) || 0)} across ${(Number(flow.donor.count) || 0).toLocaleString()} disclosed receipts from ${yearsActive}. ` +
          `${flow.donorRank ? `That places it ${flow.donorRank === 1 ? 'first' : `at number ${flow.donorRank}`} among the ${flow.graph.nodes.filter((node) => node.kind === 'donor').length} leading donors shown.` : ''}`
      } else if (detail.kind === 'party' && flow.party) {
        text = `${flow.party.label} received money from ${flow.donors.length.toLocaleString()} leading donors shown on this map. ` +
          `Together, these flows account for ${helpers.fmtMoney(flow.total)} across ${flow.count.toLocaleString()} disclosed receipts from ${yearsActive}.`
      } else {
        text = `${labelForIndustry(flow.industry, helpers)} contains ${flow.donors.length.toLocaleString()} leading donors shown on this map. ` +
          `Their matching disclosed flows total ${helpers.fmtMoney(flow.total)} across ${flow.count.toLocaleString()} receipts from ${yearsActive}.`
      }
      copy.append(el('p', '', text))
      copy.append(facts([
        [helpers.fmtMoney(flow.total), flow.party && detail.to ? `disclosed to ${flow.party.label}` : 'disclosed in this view'],
        [flow.count.toLocaleString(), 'receipts in the flow'],
        [yearsActive, 'dated activity'],
        [(detail.kind === 'party' ? flow.topDonors.length : flow.otherParties.length).toLocaleString(), detail.kind === 'party' ? 'leading donors shown' : 'other recipient parties'],
      ]))
      const access = describeAccess(flow, helpers)
      if (access) copy.append(el('p', 'explain-access', access))
      if (detail.kind !== 'party' && flow.partyShares.length > 1) {
        copy.append(el('p', '', 'It also gave to these parties:'))
        const primaryPartyId = flow.party?.id
        copy.append(partyList(flow.partyShares.filter((row) => row.node.id !== primaryPartyId), flow, helpers))
      }
    } else if (step === 1) {
      const peak = flow.peakYear
        ? `The high point was ${flow.peakYear}, when ${helpers.fmtMoney(flow.peakAmount)} was disclosed.`
        : 'No dated peak can be calculated.'
      copy.append(el('p', '', `The counter follows every financial-year key from ${FIRST_YEAR} to ${LAST_YEAR}. More marks travel in years with more disclosed money. ${peak}`))
      copy.append(facts([
        [flow.peakYear ? String(flow.peakYear) : '—', 'peak year'],
        [helpers.fmtMoney(flow.peakAmount), 'disclosed at the peak'],
        [helpers.fmtMoney(flow.undated[0]), 'not assigned to a year'],
        [flow.undated[1].toLocaleString(), 'undated receipts'],
      ]))
      const firstYear = flow.firstYear || FIRST_YEAR
      const lastYear = flow.lastYear || LAST_YEAR
      const elections = (helpers.electionYears || []).filter((year) => year >= firstYear && year <= lastYear)
      copy.append(el('p', 'explain-status', elections.length
        ? `Federal election years in this span: ${elections.join(', ')}.`
        : 'No federal election year falls inside this dated span.'))
    } else if (step === 2) {
      const destinationTotal = flow.party ? flow.edges.reduce((sum, edge) => sum + (Number(edge.total) || 0), 0) : flow.total
      const contextTotal = flow.contextEdges.reduce((sum, edge) => sum + (Number(edge.total) || 0), 0)
      const share = contextTotal ? destinationTotal / contextTotal : 0
      if (detail.kind === 'party') {
        copy.append(el('p', '', `${flow.party?.label} is the destination. The list below shows which of the map’s leading donors account for the largest disclosed flows into it.`))
        copy.append(partyList(flow.topDonors.map((row) => ({ node: row.node, total: row.total })), flow, helpers))
      } else if (detail.to && flow.party) {
        copy.append(el('p', '', `${helpers.fmtMoney(destinationTotal)} landed with ${flow.party.label}. ` +
          `That is ${(share * 100).toFixed(1)}% of this giver’s disclosed money represented by the map; ` +
          'it is a share of the disclosed total, not a measure of influence.'))
        copy.append(partyList(flow.partyShares, flow, helpers))
      } else {
        copy.append(el('p', '', 'The disclosed money is spread across the recipient parties below.'))
        copy.append(partyList(flow.partyShares, flow, helpers))
      }
    } else if (step === 3) {
      const question = questionFor(flow, detail, helpers)
      copy.append(el('p', '', `One grounded search now asks the parliamentary record a fixed question: “${question}”`))
      const answer = el('div', 'explain-answer')
      const sources = el('div')
      copy.append(answer, sources)
      const showStoredAnswer = () => {
        if (askResult) {
          const text = String(askResult.answer || '').trim()
          if (text) helpers.renderAnswer(answer, text)
          else answer.replaceChildren(el('p', 'explain-status', 'The record returned sources but no written answer this time.'))
          const list = sourceList(askResult, helpers)
          if (list.childElementCount) sources.replaceChildren(el('h3', '', 'Sources from the record'), list)
        } else if (askFailure) {
          const p = el('p', 'explain-status', askFailure)
          const link = el('a', 'explain-record-link', 'Ask on the full page')
          link.href = helpers.askHash(question)
          answer.replaceChildren(p, link)
        } else if (askText) {
          helpers.renderAnswer(answer, askText)
        } else if (askPending) {
          importWombat().then((mod) => {
            if (destroyed || !answer.isConnected || answer.childElementCount) return
            waitHandle = mod.mountWombat(answer, { label: 'Reading the parliamentary record.' })
          }).catch(() => answer.append(el('p', 'explain-status', 'Reading the parliamentary record.')))
        }
      }
      if (!askStarted) {
        askStarted = true
        askPending = true
        askAbort = new AbortController()
        const timeout = window.setTimeout(() => askAbort?.abort(), 55_000)
        importWombat().then((mod) => {
          if (destroyed || !answer.isConnected || answer.childElementCount) return
          waitHandle = mod.mountWombat(answer, { label: 'Reading the parliamentary record.' })
        }).catch(() => answer.append(el('p', 'explain-status', 'Reading the parliamentary record.')))
        helpers.askRecord(JSON.stringify({ question }), askAbort.signal, {
          delta(text) {
            if (destroyed) return
            askText += text
            if (!answer.isConnected) return
            waitHandle?.destroy?.()
            helpers.renderAnswer(answer, askText)
          },
          retry() {
            askText = ''
            if (answer.isConnected) answer.replaceChildren(el('p', 'explain-status', 'Reading the parliamentary record again.'))
          },
        }).then((data) => {
          window.clearTimeout(timeout)
          askPending = false
          askResult = data
          if (destroyed || !answer.isConnected) return
          waitHandle?.destroy?.()
          const text = String(data.answer || '').trim()
          if (text) helpers.renderAnswer(answer, text)
          else answer.replaceChildren(el('p', 'explain-status', 'The record returned sources but no written answer this time.'))
          const list = sourceList(data, helpers)
          if (list.childElementCount) {
            sources.replaceChildren(el('h3', '', 'Sources from the record'), list)
          }
        }).catch((error) => {
          window.clearTimeout(timeout)
          askPending = false
          askFailure = error?.name === 'AbortError'
            ? 'The record took too long to answer. The prepared question is still available.'
            : 'The record could not answer this time. The prepared question is still available.'
          if (destroyed || !answer.isConnected) return
          waitHandle?.destroy?.()
          const p = el('p', 'explain-status', askFailure)
          const link = el('a', 'explain-record-link', 'Ask on the full page')
          link.href = helpers.askHash(question)
          answer.replaceChildren(p, link)
        })
      } else {
        showStoredAnswer()
      }
    } else {
      const meta = flow.graph.meta || {}
      const threshold = typeof meta.threshold === 'string' ? meta.threshold : helpers.aecNote ||
        'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.'
      const excluded = Array.isArray(meta.exclusions)
        ? `The export excludes ${meta.exclusions.slice(0, 3).join('; ')}.`
        : 'Public electoral funding, internal party transfers and government entities are excluded from the federal map.'
      const noCausation = 'A disclosed donation and a parliamentary statement can be placed beside each other, but this does not prove access, influence, agreement or a causal link.'
      const stateRule = flow.jurisdiction === 'federal'
        ? helpers.stateNotSummed || 'State and federal returns are not summed: AEC returns already include state branch receipts.'
        : typeof meta.not_summed === 'string' ? meta.not_summed : helpers.stateNotSummed || ''
      const list = el('ul', 'explain-caveats')
      for (const sentence of [threshold, excluded, noCausation, stateRule].filter(Boolean)) list.append(el('li', '', String(sentence)))
      copy.append(list)
      const search = el('a', 'explain-record-link', 'Search the underlying record')
      search.href = helpers.searchHash(flow.donor?.label || flow.party?.label || labelForIndustry(flow.industry, helpers), {})
      copy.append(search)
    }
  }

  resolveFlow(detail, helpers).then((resolved) => {
    if (destroyed) return
    flow = resolved
    waitHandle?.destroy?.()
    container.replaceChildren()
    const shell = el('div', 'explain-shell')
    const stage = el('div', 'explain-stage')
    const narrative = el('div', 'explain-narrative')
    const from = resolved.donor?.label || (detail.kind === 'party' ? 'Disclosed donors' : labelForIndustry(resolved.industry, helpers))
    const to = detail.kind === 'party' || detail.to
      ? resolved.party?.label || 'Political party'
      : 'Political parties'
    stage.append(el('p', 'explain-stage-label from', from), el('p', 'explain-stage-label to', to))
    yearLabel = el('p', 'explain-stage-year')
    yearLabel.append(document.createTextNode(String(LAST_YEAR)), el('small', '', 'financial-year key'))
    stage.append(yearLabel)
    const giverColour = clusterColour(resolved.donor?.group || resolved.industry || 'other').colour
    const partyColour = resolved.party?.colour || '#8A5A12'
    // No WebGL (a locked-down browser, a failed context): the stage stays a
    // paper panel and the figures and the record below still tell the story.
    try {
      scene = new FlowScene(stage, resolved, detail, giverColour, partyColour, helpers)
    } catch {
      scene = null
      stage.querySelector('canvas.explain-canvas')?.remove()
      stage.classList.add('explain-stage-static')
      stage.append(el('p', 'explain-status', 'The animated flow needs WebGL, which this browser does not offer; the figures and the record are below.'))
    }
    if (scene) scene.onYear = (year) => {
      if (!flow || !yearLabel) return
      const amount = flow.years.get(year)?.[0] || 0
      scene?.updateYearAmount(amount)
      yearLabel.replaceChildren(document.createTextNode(String(year)), el('small', '', `${helpers.fmtMoney(amount)} disclosed`))
    }

    narrative.append(el('h1', 'explain-title', titleFor(resolved, detail, helpers)))
    const deck = resolved.graph.meta?.jurisdictionLabel
      ? `${resolved.graph.meta.jurisdictionLabel} disclosed-money data, read beside the parliamentary record.`
      : 'Federal disclosed-money data, read beside the parliamentary record.'
    narrative.append(el('p', 'explain-deck', String(deck)))
    const steps = el('ol', 'explain-steps')
    stepButtons = STEP_NAMES.map((name, index) => {
      const li = el('li')
      const button = el('button', 'explain-step', String(index + 1))
      button.type = 'button'
      button.title = name
      button.setAttribute('aria-label', `${index + 1}. ${name}`)
      button.addEventListener('click', () => { step = index; renderStep() })
      li.append(button)
      steps.append(li)
      return button
    })
    narrative.append(steps)
    copy = el('section', 'explain-step-copy')
    copy.tabIndex = -1
    narrative.append(copy)
    const controls = el('div', 'explain-controls')
    prev = el('button', '', 'Previous')
    next = el('button', '', 'Next')
    prev.type = next.type = 'button'
    prev.addEventListener('click', () => { if (step > 0) { step--; renderStep(); copy?.focus({ preventScroll: true }) } })
    next.addEventListener('click', () => { if (step < STEP_NAMES.length - 1) { step++; renderStep(); copy?.focus({ preventScroll: true }) } })
    controls.append(prev, next)
    narrative.append(controls)
    shell.append(stage, narrative)
    container.append(shell)
    shell.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if ((event.target as HTMLElement).matches('a,input,textarea,select')) return
      const delta = event.key === 'ArrowLeft' ? -1 : 1
      const target = Math.max(0, Math.min(STEP_NAMES.length - 1, step + delta))
      if (target === step) return
      event.preventDefault()
      step = target
      renderStep()
    })
    renderStep()
  }).catch((error) => {
    waitHandle?.destroy?.()
    if (destroyed) return
    loading.replaceChildren(
      el('h2', '', 'This flow could not be explained'),
      el('p', 'explain-status', `${String(error?.message || error)}. The money map remains available underneath.`),
    )
  })

  return {
    destroy() {
      destroyed = true
      waitHandle?.destroy?.()
      askAbort?.abort()
      scene?.destroy()
      container.replaceChildren()
    },
  }
}
