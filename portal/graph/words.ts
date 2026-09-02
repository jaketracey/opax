// ---------------------------------------------------------------------------
// OPAX Money Map - the words layer.
//
// The map shows where the money went; this layer puts the WORDS beside it.
// Every AEC donor industry that maps onto an enrichment topic gets its
// debate read off /api/matrix (each party's share of the topic's labelled
// speeches so far): on a donor's card as "In parliament", on a party's card
// as "What they talk about" (the debates its funders' industries map onto),
// and, when the reader turns the halo on, in the scene itself as bronze
// rings on the parties and bronze leaning into the industry's flows.
//
// Honesty rules, shared with wordsdollars.js: the labelling pass is still
// running, so every count is "so far" and shares are row-normalised over
// the topic's own filtered total (never a facet sum); party colours are
// identity only (dot + text), bronze intensity carries share; nothing from
// the network reaches the DOM except through textContent. The matrix loads
// once, lazily; if it fails the map keeps working exactly as before.
// ---------------------------------------------------------------------------

import type { MoneyEdge, MoneyGraph, MoneyNode } from './index.ts'
import type { KnowledgeMapEngine } from './map3d-engine.ts'
import { formatMoney } from './map-types.ts'

/** /api/matrix - party share of each debate's labelled speeches. */
export type Matrix = {
  labelled: number
  /** Major party columns in rank order; the long tail is folded as 'Other'. */
  parties: string[]
  cells: Record<string, Record<string, number>>
  /** Filtered totals per topic - the honest denominator (multi-label speeches count once). */
  totals: Record<string, number>
}

/**
 * Mirror of wordsdollars.js PAIRINGS, keyed by money.json donor `industry`.
 * Only industries with an honest debate counterpart appear; individuals,
 * other, legal, retail, tobacco, lobbying, tech, telecom, health, pharmacy
 * and defence are left out, not shoehorned.
 */
export const INDUSTRY_TOPIC: Readonly<Record<string, string>> = {
  gambling: 'gambling',
  finance: 'financial-services',
  mining: 'mining-energy',
  fossil_fuels: 'mining-energy',
  property: 'property-construction',
  media: 'media-communications',
  hospitality: 'hospitality-alcohol',
  alcohol: 'hospitality-alcohol',
  agriculture: 'agriculture',
  unions: 'unions-workplace',
}

/** Mirror of app.js TOPICS for the slugs above. */
const TOPIC_NAMES: Readonly<Record<string, string>> = {
  'gambling': 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'property-construction': 'Property & construction',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'agriculture': 'Agriculture',
  'unions-workplace': 'Unions & workplace',
}

/** How a topic reads as a search seed (mirror of app.js topicPhrase). */
const topicPhrase = (slug: string) =>
  (TOPIC_NAMES[slug] ?? slug).toLowerCase().replace(/ & /g, ' and ')

/** A topic this thinly labelled is flagged as still settling. */
const FEW_LABELS = 200

const MATRIX_URL = '/api/matrix'
const RETRY_AFTER_MS = 60_000

let matrixPromise: Promise<Matrix | null> | null = null
let matrixFailedAt = 0

/**
 * Fetch the matrix once and share it across every mount. A failure resolves
 * to null (the layer stays silent) and is retried no sooner than a minute
 * later, so a flaky moment does not switch the words off for the session.
 */
export function loadMatrix(): Promise<Matrix | null> {
  if (matrixPromise) return matrixPromise
  if (Date.now() - matrixFailedAt < RETRY_AFTER_MS) return Promise.resolve(null)
  matrixPromise = fetch(MATRIX_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => validMatrix(body))
    .catch(() => null)
    .then((matrix) => {
      if (!matrix) {
        matrixPromise = null
        matrixFailedAt = Date.now()
      }
      return matrix
    })
  return matrixPromise
}

function validMatrix(body: unknown): Matrix | null {
  if (!body || typeof body !== 'object') return null
  const m = body as Partial<Matrix>
  if (!Array.isArray(m.parties) || !m.cells || typeof m.cells !== 'object') return null
  if (!m.totals || typeof m.totals !== 'object') return null
  const cells: Record<string, Record<string, number>> = {}
  for (const [slug, row] of Object.entries(m.cells)) {
    if (!row || typeof row !== 'object') continue
    const clean: Record<string, number> = {}
    for (const [party, n] of Object.entries(row as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) clean[party] = n
    }
    cells[slug] = clean
  }
  const totals: Record<string, number> = {}
  for (const [slug, n] of Object.entries(m.totals)) {
    if (typeof n === 'number' && Number.isFinite(n)) totals[slug] = n
  }
  return {
    labelled: typeof m.labelled === 'number' ? m.labelled : 0,
    parties: m.parties.filter((p): p is string => typeof p === 'string'),
    cells,
    totals,
  }
}

export type TopicShare = { party: string; count: number; share: number }

/**
 * One debate, row-normalised: each major party's labelled speeches over the
 * topic's filtered total. The folded 'Other' column is not a party and never
 * becomes a row.
 */
export function topicShares(matrix: Matrix, slug: string): { total: number; rows: TopicShare[] } {
  const cells = matrix.cells[slug] ?? {}
  const total = matrix.totals[slug] ?? 0
  const rows = matrix.parties
    .filter((party) => party !== 'Other')
    .map((party) => {
      const count = cells[party] ?? 0
      return { party, count, share: total > 0 ? count / total : 0 }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.share - a.share || a.party.localeCompare(b.party, 'en'))
  return { total, rows }
}

function pctText(share: number): string {
  const pct = Math.round(share * 100)
  return pct === 0 && share > 0 ? '<1%' : `${pct}%`
}

// ---------------------------------------------------------------------------
// Styles - the mm-words-* names, injected once beside the map's own.
// ---------------------------------------------------------------------------

const STYLE_ID = 'money-map-words-styles'

const CSS = `
.mm-words { margin-top: 12px; }
.mm-words-lead { margin: 0 0 4px; font-size: 12.5px; line-height: 1.4; color: #4a4942; }
.mm-words-lead a { color: #26251f; font-weight: 600; text-decoration: none; }
.mm-words-lead a:hover { text-decoration: underline; text-decoration-color: var(--bronze, #A0761B); }
.mm-words-lead b { color: #26251f; font-weight: 600; font-variant-numeric: tabular-nums; }
.mm-words-few { color: #8a8578; }
.mm-words-rows { list-style: none; margin: 0; padding: 0; }
.mm-words-row { display: grid; align-items: center; gap: 8px; padding: 4px 6px; margin: 0 -6px;
  border-radius: 7px; font-size: 12.5px; color: #33322e; text-decoration: none; }
.mm-words-row-party { grid-template-columns: 10px minmax(0, 1fr) 64px 38px; }
.mm-words-row-topic { grid-template-columns: minmax(0, 1fr) 48px 38px auto; }
.mm-words-row:hover { background: rgba(0, 0, 0, 0.05); }
.mm-words-row:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: -2px; }
.mm-words-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-words-track { height: 3px; background: rgba(0, 0, 0, 0.06); border-radius: 2px; overflow: hidden; }
.mm-words-track i { display: block; height: 100%; background: var(--bronze, #A0761B); }
.mm-words-pct { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right;
  white-space: nowrap; }
.mm-words-money { font-size: 11px; color: #8a8578; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mm-words-fine { margin: 6px 0 0; font-size: 11px; line-height: 1.45; color: #8a8578; }
.mm-words-fine a { color: #57503c; text-decoration-color: var(--bronze, #A0761B); }
/* The halo toggle: last chip in the legend, ruled off from the industries. */
.mm-words-toggle { order: 1; margin-top: 4px; padding-top: 7px; border-top: 1px solid #e4e1d8;
  border-radius: 0 0 7px 7px; }
.mm-chip.mm-words-toggle[aria-pressed='true'] { background: var(--bronze-wash, rgba(160, 118, 27, 0.16));
  color: #26251f; }
.mm-words-glyph { width: 10px; height: 10px; border-radius: 50%; flex: none; box-sizing: border-box;
  border: 1.5px solid var(--bronze, #A0761B); }
.mm-words-toggle[aria-pressed='true'] .mm-words-glyph {
  box-shadow: 0 0 0 2px var(--bronze-wash, rgba(160, 118, 27, 0.16)); }
@media (max-width: 720px) {
  /* The legend is a horizontal scroller here: the toggle leads the row so it
     is never hidden past the end of the industries. */
  .mm-words-toggle { order: -1; margin: 0 4px 0 0; padding: 3px 11px 3px 8px; border-top: 0;
    border-right: 1px solid #e4e1d8; border-radius: 7px 0 0 7px; }
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

export type WordsLayerContext = {
  engine: KnowledgeMapEngine
  raw: MoneyGraph
  /** The legend the halo toggle joins; null in mini chrome (halo stays off). */
  legend: HTMLElement | null
  /** '' inside the SPA, '/' on a standalone page - the adapter's route base. */
  routeBase: string
}

/**
 * The map's year window as the words block sees it: the flows re-summed for
 * the window (the dollars beside each debate), and the window's name when
 * the thumbs are off the ends, so the caption can say which years the
 * dollars cover. The speech shares themselves are not windowed.
 */
export type WordsView = { edges: MoneyEdge[]; span: string | null }

export type WordsLayer = {
  /**
   * A node was selected (or the selection cleared). With a node and its
   * freshly rendered card, the words block joins the card; the halo follows.
   */
  select(node: MoneyNode | null, card: HTMLElement, view: WordsView): void
  /** A flow was selected (or cleared) - the halo reads the donor's industry. */
  selectEdge(edge: { source: string; target: string } | null): void
  /** The legend isolated an industry cluster (or released it). */
  isolate(group: string | null): void
}

export function mountWordsLayer(ctx: WordsLayerContext): WordsLayer {
  injectStyles()
  const { engine, raw, routeBase } = ctx
  const byId = new Map(raw.nodes.map((n) => [n.id, n]))

  let haloOn = false
  let selected: MoneyNode | null = null
  let selectedEdgeDonor: MoneyNode | null = null
  let isolatedGroup: string | null = null
  let matrix: Matrix | null = null

  const topicUrl = (slug: string) => `${routeBase}#/subject/topic/${slug}`
  const searchUrl = (slug: string, party?: string) => {
    const p = new URLSearchParams()
    p.set('q', topicPhrase(slug))
    p.set('topic', slug)
    if (party) p.set('party', party)
    return `${routeBase}#/search?${p.toString()}`
  }
  const partyColour = (party: string) => byId.get(`party:${party}`)?.colour ?? '#79706E'

  /** The debate an isolated cluster stands for: its industries' topic with the most money behind it. */
  const groupTopic = (group: string): string | null => {
    const weight = new Map<string, number>()
    for (const n of raw.nodes) {
      if (n.kind !== 'donor' || n.group !== group) continue
      const slug = INDUSTRY_TOPIC[n.industry]
      if (slug) weight.set(slug, (weight.get(slug) ?? 0) + n.total)
    }
    let best: string | null = null
    let bestWeight = -1
    for (const [slug, w] of weight) {
      if (w > bestWeight) {
        bestWeight = w
        best = slug
      }
    }
    return best
  }

  /** The industry the halo reads: a selected donor or flow first, then an isolated cluster. */
  const currentTopic = (): string | null => {
    const donor = selectedEdgeDonor ?? (selected?.kind === 'donor' ? selected : null)
    if (donor) return INDUSTRY_TOPIC[donor.industry] ?? null
    return isolatedGroup ? groupTopic(isolatedGroup) : null
  }

  const applyHalo = () => {
    const slug = haloOn && matrix ? currentTopic() : null
    if (!slug || !matrix) {
      engine.setWordsOverlay(null)
      return
    }
    // Intensities are relative to the leading party on the map, as the card's
    // bars are: absolute shares run to about a tenth (many labelled speeches
    // carry no party label), which would leave every ring a whisper. The
    // printed numbers stay absolute; the bronze carries the proportions.
    const shares = topicShares(matrix, slug).rows.filter((row) => byId.has(`party:${row.party}`))
    const top = shares[0]?.share ?? 0
    const rings = new Map<string, number>()
    for (const row of shares) {
      if (top > 0) rings.set(`party:${row.party}`, row.share / top)
    }
    const edgeTint = new Map<string, number>()
    for (const e of raw.edges) {
      const donor = byId.get(e.source)
      if (!donor || INDUSTRY_TOPIC[donor.industry] !== slug) continue
      const share = rings.get(e.target)
      if (share) edgeTint.set(`${e.source}|${e.target}`, share)
    }
    engine.setWordsOverlay({ rings, edgeTint })
  }

  const withMatrix = (then: (m: Matrix) => void) => {
    if (matrix) {
      then(matrix)
      return
    }
    loadMatrix().then((m) => {
      if (!m) return
      matrix = m
      then(m)
    })
  }

  // --- The halo toggle --------------------------------------------------
  if (ctx.legend) {
    const toggle = el('button', 'mm-chip mm-words-toggle', ctx.legend)
    toggle.type = 'button'
    toggle.setAttribute('aria-pressed', 'false')
    toggle.title = 'Ring each party in bronze by its share of the selected industry\'s debate'
    el('span', 'mm-words-glyph', toggle).setAttribute('aria-hidden', 'true')
    const name = el('span', '', toggle)
    name.textContent = 'words halo'
    toggle.addEventListener('click', () => {
      haloOn = !haloOn
      toggle.setAttribute('aria-pressed', String(haloOn))
      if (haloOn) withMatrix(applyHalo)
      else applyHalo()
    })
  }

  // --- Card blocks -----------------------------------------------------

  const partyRow = (
    list: HTMLElement,
    row: TopicShare,
    maxShare: number,
    slug: string,
  ) => {
    const item = el('li', '', list)
    const a = el('a', 'mm-words-row mm-words-row-party', item)
    a.href = searchUrl(slug, row.party)
    a.title = `${row.party}: ${row.count.toLocaleString('en-AU')} labelled ${topicPhrase(slug)} ` +
      'speeches so far. Opens the filtered search.'
    const dot = el('span', 'mm-dot', a)
    dot.style.background = partyColour(row.party)
    const name = el('span', 'mm-words-name', a)
    name.textContent = row.party
    const track = el('span', 'mm-words-track', a)
    track.setAttribute('aria-hidden', 'true')
    const fill = el('i', '', track)
    const rel = maxShare > 0 ? row.share / maxShare : 0
    fill.style.width = `${Math.max(rel * 100, 1.5)}%`
    fill.style.opacity = String(0.35 + 0.65 * rel)
    const pct = el('span', 'mm-words-pct', a)
    pct.textContent = pctText(row.share)
  }

  /** "In parliament": the donor's industry debate, party by party. */
  const renderDonorBlock = (host: HTMLElement, donor: MoneyNode, m: Matrix) => {
    const slug = INDUSTRY_TOPIC[donor.industry]
    if (!slug) return
    const { total, rows } = topicShares(m, slug)
    if (total <= 0 || rows.length === 0) return

    const title = el('div', 'mm-legend-title', host)
    title.textContent = 'In parliament'
    const lead = el('p', 'mm-words-lead', host)
    const topicLink = el('a', '', lead)
    topicLink.href = topicUrl(slug)
    topicLink.textContent = TOPIC_NAMES[slug] ?? slug
    lead.append(': ')
    const n = el('b', '', lead)
    n.textContent = total.toLocaleString('en-AU')
    lead.append(' labelled speeches so far')
    if (total < FEW_LABELS) {
      const few = el('span', 'mm-words-few', lead)
      few.textContent = ' · few labels yet, shares will move'
    }
    const list = el('ul', 'mm-words-rows', host)
    const maxShare = rows[0]?.share ?? 0
    for (const row of rows) partyRow(list, row, maxShare, slug)
    const fine = el('p', 'mm-words-fine', host)
    fine.append('Each party\'s share of the speeches labelled with this topic. ')
    const all = el('a', '', fine)
    all.href = topicUrl(slug)
    all.textContent = `All ${topicPhrase(slug)} speeches`
  }

  /** "What they talk about": the debates the party's funders' industries map onto. */
  const renderPartyBlock = (host: HTMLElement, party: MoneyNode, m: Matrix, view: WordsView) => {
    const name = party.label
    if (!m.parties.includes(name)) return
    // Join: flows into this party -> donor industries -> topics, with the
    // dollars from each topic's industries kept beside the share. The flows
    // are the window's, so the dollars follow the scrub; the shares do not.
    const money = new Map<string, number>()
    for (const e of view.edges) {
      if (e.target !== party.id) continue
      const donor = byId.get(e.source)
      const slug = donor ? INDUSTRY_TOPIC[donor.industry] : undefined
      if (slug) money.set(slug, (money.get(slug) ?? 0) + e.total)
    }
    const rows = [...money.entries()]
      .map(([slug, dollars]) => {
        const total = m.totals[slug] ?? 0
        const count = m.cells[slug]?.[name] ?? 0
        return { slug, dollars, count, share: total > 0 ? count / total : 0 }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.share - a.share || b.dollars - a.dollars)
      .slice(0, 5)
    if (rows.length === 0) return

    const title = el('div', 'mm-legend-title', host)
    title.textContent = 'What they talk about'
    const list = el('ul', 'mm-words-rows', host)
    const maxShare = rows[0]?.share ?? 0
    for (const row of rows) {
      const item = el('li', '', list)
      const a = el('a', 'mm-words-row mm-words-row-topic', item)
      a.href = topicUrl(row.slug)
      a.title = `${name}: ${row.count.toLocaleString('en-AU')} of ` +
        `${(m.totals[row.slug] ?? 0).toLocaleString('en-AU')} labelled ${topicPhrase(row.slug)} ` +
        `speeches so far; ${formatMoney(row.dollars)} disclosed from the matching donors` +
        `${view.span ? ` in ${view.span}` : ''}. Opens the topic page.`
      const label = el('span', 'mm-words-name', a)
      label.textContent = TOPIC_NAMES[row.slug] ?? row.slug
      const track = el('span', 'mm-words-track', a)
      track.setAttribute('aria-hidden', 'true')
      const fill = el('i', '', track)
      const rel = maxShare > 0 ? row.share / maxShare : 0
      fill.style.width = `${Math.max(rel * 100, 1.5)}%`
      fill.style.opacity = String(0.35 + 0.65 * rel)
      const pct = el('span', 'mm-words-pct', a)
      pct.textContent = pctText(row.share)
      const dollars = el('span', 'mm-words-money', a)
      dollars.textContent = formatMoney(row.dollars)
    }
    const fine = el('p', 'mm-words-fine', host)
    fine.textContent = view.span
      ? `${name}'s share of each debate's labelled speeches so far, across all years, beside ` +
        `what it received from donors in the matching industry in ${view.span}. Shown ` +
        'together for comparison, not as cause.'
      : `${name}'s share of each debate's labelled speeches so far, beside what ` +
        'it received from donors in the matching industry. Shown together for comparison, ' +
        'not as cause.'
  }

  const renderInto = (card: HTMLElement, node: MoneyNode, view: WordsView) => {
    // The block lands between the flows list and the card's triggers, so the
    // card reads money, then words, then what to ask next.
    const host = document.createElement('div')
    host.className = 'mm-words'
    host.hidden = true
    const firstTrigger = card.querySelector('.mm-ask')
    if (firstTrigger) card.insertBefore(host, firstTrigger)
    else card.appendChild(host)
    withMatrix((m) => {
      // A later selection has already replaced the card's contents.
      if (!host.isConnected) return
      if (node.kind === 'donor') renderDonorBlock(host, node, m)
      else renderPartyBlock(host, node, m, view)
      host.hidden = host.childElementCount === 0
    })
  }

  return {
    select(node, card, view) {
      selected = node
      selectedEdgeDonor = null
      if (node) renderInto(card, node, view)
      if (haloOn) withMatrix(applyHalo)
    },
    selectEdge(edge) {
      selected = null
      selectedEdgeDonor = edge ? byId.get(edge.source) ?? null : null
      if (haloOn) withMatrix(applyHalo)
    },
    isolate(group) {
      isolatedGroup = group
      if (haloOn) withMatrix(applyHalo)
    },
  }
}
