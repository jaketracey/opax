/**
 * OPAX Ledger — an analyst-grade table over the donor→party money flows.
 *
 * The 3D money map shows the shape of the network; the Ledger is the
 * reference-desk view: every disclosed flow as a row you can filter, sort
 * and take away as CSV. Plain browser ES module, no dependencies.
 *
 *   import { mountLedger } from '/ledger.js'
 *   const lg = mountLedger(container)   // renders into container
 *   mountLedger(container, { jurisdiction: 'qld' })  // open on a state file
 *   lg.destroy()                        // removes DOM + aborts loads
 *
 * Data source (same-origin): GET /graph/money.json, or one state file per
 * jurisdiction (/graph/money.qld.json, .vic, .tas) in the same shape
 *   nodes: donors + parties (label, industry, colour, lifetime totals)
 *   edges: aggregated donor→party flows (total, count, firstYear, lastYear)
 *   meta:  state files carry jurisdiction, commission, licence, threshold
 * The jurisdiction switch loads ONE file at a time. State and federal returns
 * are never summed: AEC returns already include state branch receipts.
 *
 * Two views over the same filtered set of flows:
 *   Flows    — one row per donor→party edge (573 rows max)
 *   By donor — one row per donor, aggregated over the flows that pass the
 *              current filters, so "party = Labor, sort by Total" reads as
 *              "the biggest disclosed funders of Labor", not "big donors
 *              who ever gave Labor anything".
 *
 * Honesty rule: AEC returns only capture donations above the disclosure
 * threshold, so every total here is a floor, not a ceiling. The fineprint
 * and the CSV header both carry that caveat.
 */

const JURISDICTIONS = {
  federal: { label: 'Federal', file: '/graph/money.json' },
  qld: { label: 'Queensland', file: '/graph/money.qld.json' },
  vic: { label: 'Victoria', file: '/graph/money.vic.json' },
  tas: { label: 'Tasmania', file: '/graph/money.tas.json' },
}
const NOT_SUMMED =
  'State and federal returns are not summed: AEC returns already include state branch receipts.'
const YEAR_MIN = 1998
const YEAR_MAX = 2026
const STYLE_ID = 'lg-styles'

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
})
const NUM = new Intl.NumberFormat('en-AU')

/** 'fossil_fuels' → 'Fossil fuels' */
export function industryLabel (industry) {
  const s = String(industry || 'other').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The money map's cluster hues (mirror of graph/palette.ts — donor nodes in
 * money.json carry a `group` but no colour; party nodes carry their own).
 */
const GROUP_COLOURS = new Map([
  ['parties', '#9AA0A8'],
  ['unions', '#E15759'],
  ['finance', '#4E79A7'],
  ['individuals', '#79706E'],
  ['property', '#F28E2B'],
  ['mining & energy', '#9C755F'],
  ['hospitality', '#EDC948'],
  ['media & tech', '#76B7B2'],
  ['health & pharma', '#59A14F'],
  ['gambling', '#B07AA1'],
  ['legal & lobbying', '#6A51A3'],
  ['defence & security', '#37474F'],
  ['agriculture', '#6B8E23'],
  ['retail', '#FF9DA7'],
  ['tobacco & alcohol', '#A65628'],
  ['other', '#999966'],
])

export function groupColour (group) {
  return GROUP_COLOURS.get(group) || '#999966'
}

// ---------------------------------------------------------------------------
// Pure data layer (node-testable: nothing here touches the DOM)
// ---------------------------------------------------------------------------

/** Join edges to their donor/party nodes → flat flow rows. */
export function buildFlows (data) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  return data.edges.map((e) => {
    const donor = byId.get(e.source) || {}
    const party = byId.get(e.target) || {}
    return {
      donorId: e.source,
      donor: donor.label || e.source.replace(/^donor:/, ''),
      industry: donor.industry || 'other',
      colour: donor.colour || groupColour(donor.group),
      party: party.label || e.target.replace(/^party:/, ''),
      partyColour: party.colour || '#8D897B',
      total: e.total,
      count: e.count,
      firstYear: e.firstYear,
      lastYear: e.lastYear,
    }
  })
}

/** One row per donor, aggregated over the given (already filtered) flows. */
export function aggregateDonors (flows) {
  const byDonor = new Map()
  for (const f of flows) {
    let d = byDonor.get(f.donorId)
    if (!d) {
      d = {
        donorId: f.donorId,
        donor: f.donor,
        industry: f.industry,
        colour: f.colour,
        total: 0,
        count: 0,
        parties: 0,
        firstYear: Infinity,
        lastYear: -Infinity,
        byParty: new Map(),
      }
      byDonor.set(f.donorId, d)
    }
    d.total += f.total
    d.count += f.count
    d.firstYear = Math.min(d.firstYear, f.firstYear)
    d.lastYear = Math.max(d.lastYear, f.lastYear)
    const p = d.byParty.get(f.party) || { total: 0, colour: f.partyColour }
    p.total += f.total
    d.byParty.set(f.party, p)
  }
  const out = []
  for (const d of byDonor.values()) {
    let topName = ''
    let top = null
    for (const [name, p] of d.byParty) {
      if (!top || p.total > top.total) { top = p; topName = name }
    }
    d.parties = d.byParty.size
    d.topParty = topName
    d.topPartyColour = top ? top.colour : '#8D897B'
    d.topShare = d.total > 0 && top ? top.total / d.total : 0
    delete d.byParty
    out.push(d)
  }
  return out
}

/**
 * Flow-level filters (text, industry, party, year overlap). The min-total
 * cut is applied by the caller — per flow in the Flows view, per aggregated
 * donor in the By-donor view.
 */
export function filterFlows (flows, f) {
  const q = (f.q || '').trim().toLowerCase()
  return flows.filter((r) => {
    if (q &&
        !r.donor.toLowerCase().includes(q) &&
        !r.party.toLowerCase().includes(q) &&
        !industryLabel(r.industry).toLowerCase().includes(q)) return false
    if (f.industry && r.industry !== f.industry) return false
    if (f.party && r.party !== f.party) return false
    if (f.yearFrom != null && r.lastYear < f.yearFrom) return false
    if (f.yearTo != null && r.firstYear > f.yearTo) return false
    return true
  })
}

const TEXT_KEYS = new Set(['donor', 'industry', 'party', 'topParty'])

export function sortRows (rows, key, dir) {
  const mul = dir === 'asc' ? 1 : -1
  const byName = (a, b) => a.donor.localeCompare(b.donor, 'en')
  const sorted = rows.slice()
  if (key === 'years') {
    sorted.sort((a, b) =>
      mul * ((a.firstYear - b.firstYear) || (a.lastYear - b.lastYear)) ||
      byName(a, b))
  } else if (TEXT_KEYS.has(key)) {
    sorted.sort((a, b) =>
      mul * String(a[key]).localeCompare(String(b[key]), 'en') ||
      (b.total - a.total))
  } else {
    sorted.sort((a, b) => mul * (a[key] - b[key]) || byName(a, b))
  }
  return sorted
}

function csvCell (v) {
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/**
 * CSV of the current view. Totals go out as raw integers (analysable),
 * the year range as two columns, and the comment header carries the
 * active filters plus the floor-not-ceiling caveat.
 */
export function buildCSV (view, rows, commentLines) {
  const lines = commentLines.map((l) => '# ' + l)
  if (view === 'flows') {
    lines.push(['Donor', 'Industry', 'Party', 'Total (AUD)', 'Donations',
      'First year', 'Last year'].join(','))
    for (const r of rows) {
      lines.push([
        csvCell(r.donor), csvCell(industryLabel(r.industry)), csvCell(r.party),
        r.total, r.count, r.firstYear, r.lastYear,
      ].join(','))
    }
  } else {
    lines.push(['Donor', 'Industry', 'Total (AUD)', 'Parties funded',
      'Donations', 'First year', 'Last year', 'Top recipient',
      'Top recipient share (%)'].join(','))
    for (const r of rows) {
      lines.push([
        csvCell(r.donor), csvCell(industryLabel(r.industry)),
        r.total, r.parties, r.count, r.firstYear, r.lastYear,
        csvCell(r.topParty), Math.round(r.topShare * 100),
      ].join(','))
    }
  }
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Column models (shared by the table header and aria-sort handling)
// ---------------------------------------------------------------------------

const COLUMNS = {
  flows: [
    { key: 'donor', label: 'Donor', numeric: false },
    { key: 'industry', label: 'Industry', numeric: false },
    { key: 'party', label: 'Party', numeric: false },
    { key: 'total', label: 'Total', numeric: true },
    { key: 'count', label: 'Donations', numeric: true },
    { key: 'years', label: 'Years', numeric: true },
  ],
  donors: [
    { key: 'donor', label: 'Donor', numeric: false },
    { key: 'industry', label: 'Industry', numeric: false },
    { key: 'total', label: 'Total', numeric: true },
    { key: 'parties', label: 'Parties', numeric: true },
    { key: 'years', label: 'Years', numeric: true },
    { key: 'topParty', label: 'Top recipient', numeric: false },
  ],
}

// ---------------------------------------------------------------------------
// Styles — .lg- prefix, site tokens with fallbacks, light-only
// ---------------------------------------------------------------------------

const CSS = `
.lg-root {
  font-family: var(--sans, 'Public Sans', -apple-system, 'Segoe UI', Roboto, sans-serif);
  color: var(--ink, #23271F);
}
.lg-root :focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }

.lg-toolbar {
  display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end;
  margin-bottom: 0.75rem;
}
.lg-field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.lg-label {
  font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-faint, #6F7468);
}
.lg-input, .lg-select {
  font: inherit; font-size: 0.875rem; color: var(--ink, #23271F);
  background: var(--paper-raised, #FFFFFF);
  border: 1px solid var(--line-strong, #8D897B); border-radius: 2px;
  padding: 0.375rem 0.5rem; min-height: 2.125rem;
}
.lg-search { width: 15rem; max-width: 100%; }
.lg-year { width: 4.5rem; font-variant-numeric: tabular-nums; }
.lg-yearrow { display: flex; align-items: center; gap: 0.35rem; }
.lg-yearrow span { color: var(--ink-faint, #6F7468); }

.lg-views { display: flex; }
.lg-view, .lg-jur {
  font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  padding: 0.4rem 0.85rem; min-height: 2.125rem;
  background: var(--paper-raised, #FFFFFF); color: var(--ink-soft, #575C52);
  border: 1px solid var(--line-strong, #8D897B);
}
.lg-view + .lg-view, .lg-jur + .lg-jur { border-left: 0; }
.lg-view:first-child, .lg-jur:first-child { border-radius: 2px 0 0 2px; }
.lg-view:last-child, .lg-jur:last-child { border-radius: 0 2px 2px 0; }
.lg-view[aria-pressed="true"], .lg-jur[aria-pressed="true"] {
  background: var(--navy, #142A43); border-color: var(--navy, #142A43); color: #FFFFFF;
}

.lg-actions { display: flex; gap: 0.5rem; margin-left: auto; align-items: flex-end; }
.lg-btn {
  font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  padding: 0.4rem 0.8rem; min-height: 2.125rem; border-radius: 2px;
  background: none; border: 1px solid var(--line-strong, #8D897B);
  color: var(--ink-soft, #575C52);
}
.lg-btn:hover { background: var(--paper-sunken, #F1EFE8); }
.lg-export { border-color: var(--bronze-ink, #8A5A12); color: var(--bronze-ink, #8A5A12); }
.lg-export:hover { background: var(--bronze-wash, rgba(160, 118, 27, 0.16)); }

.lg-summary {
  margin: 0 0 0.5rem; font-size: 0.8125rem; color: var(--ink-soft, #575C52);
  font-variant-numeric: tabular-nums;
}
.lg-summary b { font-weight: 700; color: var(--ink, #23271F); }

.lg-tablewrap {
  overflow: auto; max-height: min(65vh, 850px);
  border: 1px solid var(--line-strong, #8D897B);
  background: var(--paper-raised, #FFFFFF);
}
.lg-table {
  border-collapse: collapse; width: 100%; min-width: 760px;
  font-size: 0.875rem; line-height: 1.4;
}
.lg-table thead th {
  position: sticky; top: 0; z-index: 2; padding: 0;
  background: var(--paper-sunken, #F1EFE8);
  border-bottom: 1px solid var(--line-strong, #8D897B);
  text-align: left; white-space: nowrap;
}
.lg-sort {
  font: inherit; font-size: 0.8125rem; font-weight: 700; cursor: pointer;
  color: var(--ink-soft, #575C52); background: none; border: 0;
  width: 100%; text-align: inherit; padding: 0.5rem 0.625rem;
  display: flex; gap: 0.3rem; align-items: baseline;
}
.lg-sort:hover { color: var(--ink, #23271F); }
th[aria-sort] .lg-sort { color: var(--ink, #23271F); }
.lg-arrow { font-size: 0.625rem; color: var(--bronze-ink, #8A5A12); }
.lg-th-num { text-align: right; }
.lg-th-num .lg-sort { justify-content: flex-end; }

.lg-table td {
  padding: 0.45rem 0.625rem; border-bottom: 1px solid var(--line, #DFDCD2);
  vertical-align: baseline;
}
.lg-table tbody tr:hover td { background: var(--paper-sunken, #F1EFE8); }
.lg-num {
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.lg-cell-label { display: inline-flex; align-items: baseline; gap: 0.4rem; }
.lg-dot {
  flex: none; width: 0.55rem; height: 0.55rem; border-radius: 50%;
  align-self: center; border: 1px solid rgba(0, 0, 0, 0.25);
}
.lg-table a {
  color: inherit; text-decoration: underline;
  text-decoration-color: var(--bronze, #A0761B); text-underline-offset: 2px;
}
.lg-table a:hover { color: var(--bronze-ink, #8A5A12); }
.lg-share { color: var(--ink-faint, #6F7468); }
.lg-empty { padding: 1.5rem 0.75rem; text-align: center; color: var(--ink-faint, #6F7468); }
.lg-status { padding: 1.5rem 0.75rem; font-size: 0.875rem; color: var(--ink-soft, #575C52); }
.lg-status .lg-btn { margin-left: 0.5rem; }

.lg-fineprint {
  margin: 0.6rem 0 0; font-size: 0.75rem; line-height: 1.55;
  color: var(--ink-faint, #6F7468);
}
.lg-fineprint a { color: var(--bronze-ink, #8A5A12); }

.lg-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

@media (max-width: 640px) {
  .lg-search { width: 100%; }
  .lg-field-search { flex: 1 1 100%; }
  .lg-actions { margin-left: 0; }
}
`

function injectStyles () {
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ---------------------------------------------------------------------------
// DOM helpers (all row data goes through textContent — never innerHTML)
// ---------------------------------------------------------------------------

function el (tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function dotLabel (colour, node) {
  const wrap = el('span', 'lg-cell-label')
  const dot = el('span', 'lg-dot')
  dot.style.background = colour
  wrap.append(dot, node)
  return wrap
}

function subjectLink (kind, label) {
  const a = el('a', null, label)
  a.href = `#/subject/${kind}/${encodeURIComponent(label)}`
  return a
}

function yearsText (r) {
  return r.firstYear === r.lastYear ? String(r.firstYear) : `${r.firstYear}–${r.lastYear}`
}

// ---------------------------------------------------------------------------
// mountLedger
// ---------------------------------------------------------------------------

export function mountLedger (container, opts = {}) {
  injectStyles()

  const state = {
    jur: JURISDICTIONS[opts.jurisdiction] ? opts.jurisdiction : 'federal',
    view: 'flows',                 // 'flows' | 'donors'
    q: '',
    industry: '',
    party: '',
    yearFrom: null,
    yearTo: null,
    min: 0,
    sort: {                        // remembered per view
      flows: { key: 'total', dir: 'desc' },
      donors: { key: 'total', dir: 'desc' },
    },
  }

  let flows = []                   // joined edge rows, set once data lands
  let meta = {}                    // the loaded file's meta block (state files describe themselves)
  let currentRows = []             // what the table shows now (for export)
  let loadSeq = 0                  // a switch mid-load must not let the old file land
  const cache = new Map()          // jurisdiction -> parsed export
  const aborter = new AbortController()

  // ---- static chrome (no data passes through this template) ---------------
  const root = el('section', 'lg-root')
  root.setAttribute('aria-label', 'The Ledger: disclosed donations, donor by donor')
  root.innerHTML = `
    <div class="lg-toolbar" role="group" aria-label="Ledger filters">
      <div class="lg-field" role="group" aria-label="Jurisdiction">
        <span class="lg-label" aria-hidden="true">Jurisdiction</span>
        <div class="lg-views">
          ${Object.entries(JURISDICTIONS).map(([k, j]) =>
            `<button type="button" class="lg-jur" data-jur="${k}" aria-pressed="${k === state.jur ? 'true' : 'false'}">${j.label}</button>`).join('')}
        </div>
      </div>
      <div class="lg-field" role="group" aria-label="View">
        <span class="lg-label" aria-hidden="true">View</span>
        <div class="lg-views">
          <button type="button" class="lg-view" data-view="flows" aria-pressed="true">Flows</button>
          <button type="button" class="lg-view" data-view="donors" aria-pressed="false">By donor</button>
        </div>
      </div>
      <div class="lg-field lg-field-search">
        <label class="lg-label" for="lg-q">Filter donor or party</label>
        <input class="lg-input lg-search" id="lg-q" type="search" autocomplete="off"
               placeholder="e.g. Mineralogy, Labor" />
      </div>
      <div class="lg-field">
        <label class="lg-label" for="lg-industry">Industry</label>
        <select class="lg-select" id="lg-industry"><option value="">All industries</option></select>
      </div>
      <div class="lg-field">
        <label class="lg-label" for="lg-party">Party</label>
        <select class="lg-select" id="lg-party"><option value="">All parties</option></select>
      </div>
      <div class="lg-field">
        <span class="lg-label" id="lg-years-label">Active between</span>
        <div class="lg-yearrow" role="group" aria-labelledby="lg-years-label">
          <input class="lg-input lg-year" id="lg-year-from" type="number" inputmode="numeric"
                 min="${YEAR_MIN}" max="${YEAR_MAX}" placeholder="${YEAR_MIN}" aria-label="From year" />
          <span aria-hidden="true">–</span>
          <input class="lg-input lg-year" id="lg-year-to" type="number" inputmode="numeric"
                 min="${YEAR_MIN}" max="${YEAR_MAX}" placeholder="${YEAR_MAX}" aria-label="To year" />
        </div>
      </div>
      <div class="lg-field">
        <label class="lg-label" for="lg-min">Min total</label>
        <select class="lg-select" id="lg-min">
          <option value="0">Any amount</option>
          <option value="100000">$100K+</option>
          <option value="1000000">$1M+</option>
          <option value="10000000">$10M+</option>
        </select>
      </div>
      <div class="lg-actions">
        <button type="button" class="lg-btn" id="lg-clear" hidden>Clear filters</button>
        <button type="button" class="lg-btn lg-export" id="lg-export">Export CSV</button>
      </div>
    </div>

    <p class="lg-summary" aria-live="polite" aria-atomic="true"></p>

    <div class="lg-tablewrap" role="region" tabindex="0" aria-label="Donations table (scrollable)">
      <div class="lg-status">Loading the ledger…</div>
      <table class="lg-table" hidden>
        <caption class="lg-visually-hidden"></caption>
        <thead><tr></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <p class="lg-fineprint"></p>
  `

  const $ = (sel) => root.querySelector(sel)
  const fineEl = $('.lg-fineprint')
  const searchEl = $('#lg-q')
  const industryEl = $('#lg-industry')
  const partyEl = $('#lg-party')
  const yearFromEl = $('#lg-year-from')
  const yearToEl = $('#lg-year-to')
  const minEl = $('#lg-min')
  const clearBtn = $('#lg-clear')
  const exportBtn = $('#lg-export')
  const summaryEl = $('.lg-summary')
  const statusEl = $('.lg-status')
  const tableEl = $('.lg-table')
  const captionEl = $('caption')
  const headRow = $('thead tr')
  const bodyEl = $('tbody')

  // ---- filters → rows -----------------------------------------------------

  const hasFilters = () =>
    state.q.trim() !== '' || state.industry !== '' || state.party !== '' ||
    state.yearFrom != null || state.yearTo != null || state.min > 0

  function computeRows () {
    const passing = filterFlows(flows, state)
    const rows = state.view === 'flows'
      ? passing.filter((r) => r.total >= state.min)
      : aggregateDonors(passing).filter((d) => d.total >= state.min)
    const sort = state.sort[state.view]
    return { flowCount: passing.length, rows: sortRows(rows, sort.key, sort.dir) }
  }

  // ---- table header -------------------------------------------------------

  function renderHead () {
    headRow.textContent = ''
    for (const col of COLUMNS[state.view]) {
      const th = el('th', col.numeric ? 'lg-th-num' : null)
      th.scope = 'col'
      const btn = el('button', 'lg-sort')
      btn.type = 'button'
      btn.dataset.key = col.key
      btn.append(el('span', null, col.label), el('span', 'lg-arrow'))
      btn.querySelector('.lg-arrow').setAttribute('aria-hidden', 'true')
      th.appendChild(btn)
      headRow.appendChild(th)
    }
    syncSortMarkers()
  }

  function syncSortMarkers () {
    const sort = state.sort[state.view]
    for (const th of headRow.children) {
      const btn = th.querySelector('.lg-sort')
      const arrow = th.querySelector('.lg-arrow')
      if (btn.dataset.key === sort.key) {
        th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending')
        arrow.textContent = sort.dir === 'asc' ? '▲' : '▼'
      } else {
        th.removeAttribute('aria-sort')
        arrow.textContent = ''
      }
    }
  }

  // ---- table body ---------------------------------------------------------

  function renderCellsFlows (tr, r) {
    tr.appendChild(el('td')).appendChild(subjectLink('donor', r.donor))
    tr.appendChild(el('td'))
      .appendChild(dotLabel(r.colour, document.createTextNode(industryLabel(r.industry))))
    tr.appendChild(el('td'))
      .appendChild(dotLabel(r.partyColour, subjectLink('party', r.party)))
    tr.appendChild(el('td', 'lg-num', AUD.format(r.total)))
    tr.appendChild(el('td', 'lg-num', NUM.format(r.count)))
    tr.appendChild(el('td', 'lg-num', yearsText(r)))
  }

  function renderCellsDonors (tr, r) {
    tr.appendChild(el('td')).appendChild(subjectLink('donor', r.donor))
    tr.appendChild(el('td'))
      .appendChild(dotLabel(r.colour, document.createTextNode(industryLabel(r.industry))))
    tr.appendChild(el('td', 'lg-num', AUD.format(r.total)))
    tr.appendChild(el('td', 'lg-num', NUM.format(r.parties)))
    tr.appendChild(el('td', 'lg-num', yearsText(r)))
    const cell = tr.appendChild(el('td'))
    const wrap = dotLabel(r.topPartyColour, subjectLink('party', r.topParty))
    wrap.appendChild(el('span', 'lg-share', ` · ${Math.round(r.topShare * 100)}%`))
    cell.appendChild(wrap)
  }

  function render () {
    const { flowCount, rows } = computeRows()
    currentRows = rows

    const frag = document.createDocumentFragment()
    const renderCells = state.view === 'flows' ? renderCellsFlows : renderCellsDonors
    for (const r of rows) {
      const tr = document.createElement('tr')
      renderCells(tr, r)
      frag.appendChild(tr)
    }
    if (rows.length === 0) {
      const tr = document.createElement('tr')
      const td = el('td', 'lg-empty', 'Nothing matches these filters.')
      td.colSpan = COLUMNS[state.view].length
      tr.appendChild(td)
      frag.appendChild(tr)
    }
    bodyEl.textContent = ''
    bodyEl.appendChild(frag)

    const shown = rows.reduce((sum, r) => sum + r.total, 0)
    summaryEl.textContent = ''
    const b = el('b', null, state.view === 'flows'
      ? `${NUM.format(rows.length)} flows · ${AUD.format(shown)}`
      : `${NUM.format(rows.length)} donors · ${AUD.format(shown)}`)
    summaryEl.appendChild(b)
    summaryEl.appendChild(document.createTextNode(state.view === 'flows'
      ? ' total shown'
      : ` total shown, aggregated from ${NUM.format(flowCount)} flows`))

    captionEl.textContent = state.view === 'flows'
      ? 'Disclosed donor to party flows matching the current filters'
      : 'Donors aggregated over the flows matching the current filters'

    clearBtn.hidden = !hasFilters()
  }

  // ---- CSV export ---------------------------------------------------------

  function describeFilters () {
    const parts = []
    if (state.q.trim()) parts.push(`text ~ "${state.q.trim()}"`)
    if (state.industry) parts.push(`industry = ${industryLabel(state.industry)}`)
    if (state.party) parts.push(`party = ${state.party}`)
    if (state.yearFrom != null || state.yearTo != null) {
      parts.push(`active between ${state.yearFrom ?? YEAR_MIN}–${state.yearTo ?? YEAR_MAX}`)
    }
    if (state.min > 0) parts.push(`min total ${AUD.format(state.min)}`)
    return parts.length ? parts.join('; ') : 'none'
  }

  function exportCSV () {
    const sort = state.sort[state.view]
    const file = JURISDICTIONS[state.jur].file
    const comments = [
      state.view === 'flows'
        ? 'OPAX — The Ledger: disclosed donor→party flows'
        : 'OPAX — The Ledger: donors aggregated over the filtered flows',
      meta.jurisdiction
        ? `Source: ${meta.commission} disclosures (${meta.sourceShort}), ${meta.coverage}, top disclosed donors, via opax.com.au${file}`
        : `Source: AEC donation disclosure returns ${YEAR_MIN}–${YEAR_MAX} (top 250 disclosed donors), via opax.com.au${file}`,
      `Exported ${new Date().toISOString().slice(0, 10)} · ${currentRows.length} rows · filters: ${describeFilters()} · sorted by ${sort.key} ${sort.dir}`,
      meta.jurisdiction
        ? `Caveat: ${meta.threshold} Totals are a floor, not a ceiling.`
        : 'Caveat: donations under the AEC disclosure threshold are not reported: totals are a floor, not a ceiling.',
      meta.jurisdiction
        ? 'Excluded: gifts to candidates and committees, public funding and internal party transfers.'
        : 'Excluded: public electoral funding and internal party transfers.',
      meta.not_summed || NOT_SUMMED,
    ]
    if (meta.licence) comments.push(`Licence: ${meta.licence}`)
    const csv = buildCSV(state.view, currentRows, comments)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `opax-ledger-${state.jur}-${state.view}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Safari fetches the blob URL asynchronously after the click.
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  // ---- events -------------------------------------------------------------

  searchEl.addEventListener('input', () => { state.q = searchEl.value; render() })
  industryEl.addEventListener('change', () => { state.industry = industryEl.value; render() })
  partyEl.addEventListener('change', () => { state.party = partyEl.value; render() })
  minEl.addEventListener('change', () => { state.min = Number(minEl.value) || 0; render() })

  const readYear = (input) => {
    const n = Number.parseInt(input.value, 10)
    return Number.isFinite(n) ? Math.min(YEAR_MAX, Math.max(YEAR_MIN, n)) : null
  }
  yearFromEl.addEventListener('input', () => { state.yearFrom = readYear(yearFromEl); render() })
  yearToEl.addEventListener('input', () => { state.yearTo = readYear(yearToEl); render() })

  clearBtn.addEventListener('click', () => {
    state.q = ''; searchEl.value = ''
    state.industry = ''; industryEl.value = ''
    state.party = ''; partyEl.value = ''
    state.yearFrom = null; yearFromEl.value = ''
    state.yearTo = null; yearToEl.value = ''
    state.min = 0; minEl.value = '0'
    render()
    searchEl.focus()
  })

  exportBtn.addEventListener('click', exportCSV)

  for (const btn of root.querySelectorAll('.lg-jur')) {
    btn.addEventListener('click', () => {
      if (state.jur === btn.dataset.jur) return
      load(btn.dataset.jur)
    })
  }

  for (const btn of root.querySelectorAll('.lg-view')) {
    btn.addEventListener('click', () => {
      if (state.view === btn.dataset.view) return
      state.view = btn.dataset.view
      for (const b of root.querySelectorAll('.lg-view')) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')
      }
      renderHead()
      render()
    })
  }

  headRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.lg-sort')
    if (!btn) return
    const sort = state.sort[state.view]
    const col = COLUMNS[state.view].find((c) => c.key === btn.dataset.key)
    if (sort.key === col.key) {
      sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
    } else {
      sort.key = col.key
      sort.dir = col.numeric ? 'desc' : 'asc' // numbers biggest-first, text A–Z
    }
    syncSortMarkers()
    render()
  })

  // ---- data ---------------------------------------------------------------

  function populateSelects (data) {
    industryEl.length = 1 // keep "All industries"; the rest belong to the previous file
    partyEl.length = 1
    const industries = [...new Set(
      data.nodes.filter((n) => n.kind === 'donor').map((n) => n.industry || 'other'),
    )].sort((a, b) => a.localeCompare(b, 'en'))
    for (const ind of industries) {
      const opt = el('option', null, industryLabel(ind))
      opt.value = ind
      industryEl.appendChild(opt)
    }
    const parties = data.nodes
      .filter((n) => n.kind === 'party')
      .map((n) => n.label)
      .sort((a, b) => a.localeCompare(b, 'en'))
    for (const party of parties) {
      const opt = el('option', null, party)
      opt.value = party
      partyEl.appendChild(opt)
    }
    // A filter survives a jurisdiction switch only if the new file offers it.
    if (![...industryEl.options].some((o) => o.value === state.industry)) state.industry = ''
    industryEl.value = state.industry
    if (![...partyEl.options].some((o) => o.value === state.party)) state.party = ''
    partyEl.value = state.party
  }

  /** Fineprint from the file itself: state exports name their commission,
   *  threshold and licence in meta; the federal file predates those fields. */
  function renderFineprint (data) {
    const m = data.meta || {}
    const donors = data.nodes.filter((n) => n.kind === 'donor').length
    fineEl.textContent = m.jurisdiction
      ? `${m.commission} (${m.sourceShort}), ${m.coverage}, top ${NUM.format(donors)} disclosed donors. ` +
        `${m.threshold} Totals are a floor, not a ceiling. Gifts to candidates and committees, ` +
        `public funding and internal party transfers excluded. ${m.not_summed || NOT_SUMMED} ` +
        `Licence: ${m.licence}. `
      : `AEC disclosures ${YEAR_MIN}–${YEAR_MAX}, top ${NUM.format(donors)} disclosed donors. Donations under ` +
        'the disclosure threshold are not reported: totals are a floor, not a ceiling. ' +
        `Public electoral funding and internal party transfers excluded. ${NOT_SUMMED} `
    const methods = el('a', null, 'Methodology')
    methods.href = '#/methods'
    const rawLink = el('a', null, 'Raw data')
    rawLink.href = JURISDICTIONS[state.jur].file
    fineEl.append(methods, ' · ', rawLink)
  }

  async function fetchData (jur) {
    if (cache.has(jur)) return cache.get(jur)
    const url = JURISDICTIONS[jur].file
    const res = await fetch(url, { signal: aborter.signal })
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    const data = await res.json()
    cache.set(jur, data)
    return data
  }

  async function load (jur = state.jur) {
    state.jur = JURISDICTIONS[jur] ? jur : 'federal'
    for (const b of root.querySelectorAll('.lg-jur')) {
      b.setAttribute('aria-pressed', b.dataset.jur === state.jur ? 'true' : 'false')
    }
    const token = ++loadSeq
    statusEl.hidden = false
    statusEl.textContent = 'Loading the ledger…'
    tableEl.hidden = true
    try {
      const data = await fetchData(state.jur)
      if (token !== loadSeq) return
      meta = data.meta || {}
      flows = buildFlows(data)
      populateSelects(data)
      renderFineprint(data)
      statusEl.hidden = true
      tableEl.hidden = false
      renderHead()
      render()
    } catch (err) {
      if (aborter.signal.aborted || token !== loadSeq) return
      statusEl.hidden = false
      statusEl.textContent = 'The ledger could not be loaded.'
      const retry = el('button', 'lg-btn', 'Try again')
      retry.type = 'button'
      retry.addEventListener('click', () => load(state.jur))
      statusEl.appendChild(retry)
    }
  }

  container.appendChild(root)
  load(state.jur)

  let destroyed = false
  return {
    destroy () {
      if (destroyed) return
      destroyed = true
      aborter.abort()
      root.remove()
    },
  }
}
