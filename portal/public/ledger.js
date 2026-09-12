import { filterMoneyEdges } from "./money-records.js?v=ia-ux-20260908-2";
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
  return filterMoneyEdges(data, { type: "receipts" }).map((e) => {
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
      byYear: e.byYear,
      undated: e.undated,
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

/** Recalculate a flow from dated cells; lifetime totals are only for all years. */
export function windowFlow (row, yearFrom, yearTo) {
  if (yearFrom == null && yearTo == null) return row
  let total = 0, count = 0, firstYear = Infinity, lastYear = -Infinity
  for (const [key, cell] of Object.entries(row.byYear || {})) {
    if (!/^\d{4}$/.test(key) || !Array.isArray(cell) || cell.length < 2) continue
    const year = Number(key), [amount, records] = cell
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(records) || records < 0) continue
    if (yearFrom != null && year < yearFrom || yearTo != null && year > yearTo) continue
    if (amount === 0 && records === 0) continue
    total += amount
    count += records
    firstYear = Math.min(firstYear, year)
    lastYear = Math.max(lastYear, year)
  }
  // Missing yearly data cannot establish a selected-period amount.
  return firstYear === Infinity ? null : { ...row, total, count, firstYear, lastYear }
}

/**
 * Filter and window flows before sorting, donor aggregation or minimum amounts.
 * The caller applies the minimum per flow or per aggregated donor.
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
    if (f.focusDonorId && r.donorId !== f.focusDonorId) return false
    return true
  }).map((r) => windowFlow(r, f.yearFrom, f.yearTo)).filter(Boolean)
}

/** Parse a shareable receipts URL against the loaded graph using exact IDs. */
export function parseLedgerParams (params, data) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params || '')
  const supported = new Set(['jur', 'type', 'focus', 'party', 'industry', 'from', 'to', 'q', 'min'])
  for (const key of p.keys()) {
    if (!supported.has(key)) return { ok: false, error: 'This link uses an unsupported filter. Clear filters to choose a new selection.' }
    if (p.getAll(key).length > 1) return { ok: false, error: 'This link contains more than one selection for the same filter. Clear filters to choose a new selection.' }
  }
  const jur = p.get('jur') || 'federal'
  if (!Object.hasOwn(JURISDICTIONS, jur)) return { ok: false, error: 'Unknown jurisdiction. Clear filters, then choose Federal, Queensland, Victoria or Tasmania.' }
  const type = p.get('type')
  if (type && type !== 'receipts') return { ok: false, error: 'This link requests an unsupported record type. This list shows political receipts. Clear filters to start again.' }
  const readYear = (key) => {
    const raw = p.get(key)
    if (raw == null || raw === '') return null
    if (!/^\d{4}$/.test(raw) || Number(raw) < YEAR_MIN || Number(raw) > YEAR_MAX) return { error: `The ${key} year must be between ${YEAR_MIN} and ${YEAR_MAX}.` }
    return Number(raw)
  }
  const yearFrom = readYear('from'); if (yearFrom?.error) return { ok: false, error: yearFrom.error }
  const yearTo = readYear('to'); if (yearTo?.error) return { ok: false, error: yearTo.error }
  if (yearFrom != null && yearTo != null && yearFrom > yearTo) return { ok: false, error: 'The start year must be the same as or earlier than the end year.' }
  const minRaw = p.get('min')
  const allowedMin = new Set([0, 100000, 1000000, 10000000])
  const min = minRaw == null || minRaw === '' ? 0 : Number(minRaw)
  if (!Number.isInteger(min) || !allowedMin.has(min)) return { ok: false, error: 'This minimum amount is not supported. Choose Any amount, $100K+, $1M+ or $10M+.' }
  if (!data) return { ok: true, jurisdiction: jur, filters: { q: p.get('q') || '', yearFrom, yearTo, min, partyId: p.get('party') || '', industryId: p.get('industry') || '', focusDonorId: p.get('focus') || '' } }
  const nodes = new Map((data.nodes || []).map((n) => [n.id, n]))
  const exact = (key, kind, label) => {
    const id = p.get(key)
    if (!id) return { id: '', label: '' }
    const node = nodes.get(id)
    if (!node || node.kind !== kind) return { error: `This link names an unknown ${label}. Clear filters to choose a new selection.` }
    return { id, label: node.label }
  }
  const party = exact('party', 'party', 'party')
  if (party.error) return { ok: false, error: party.error }
  const focus = exact('focus', 'donor', 'donor')
  if (focus.error) return { ok: false, error: focus.error }
  const industryId = p.get('industry') || ''
  if (industryId && !nodesExistsIndustry(data, industryId)) return { ok: false, error: 'This link names an unknown industry. Clear filters to choose a new selection.' }
  return { ok: true, jurisdiction: jur, filters: { q: p.get('q') || '', industry: industryId, industryId, party: party.label, partyId: party.id, focusDonorId: focus.id, focusDonor: focus.label, yearFrom, yearTo, min } }
}

function nodesExistsIndustry (data, industry) {
  return (data.nodes || []).some((n) => n.kind === 'donor' && (n.industry || 'other') === industry)
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
    lines.push(['Donor', 'Industry', 'Party', 'Total (AUD)', 'Records',
      'First year', 'Last year'].join(','))
    for (const r of rows) {
      lines.push([
        csvCell(r.donor), csvCell(industryLabel(r.industry)), csvCell(r.party),
        r.total, r.count, r.firstYear, r.lastYear,
      ].join(','))
    }
  } else {
    lines.push(['Donor', 'Industry', 'Total (AUD)', 'Parties funded',
      'Records', 'First year', 'Last year', 'Top recipient',
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
    { key: 'count', label: 'Records', numeric: true },
    { key: 'years', label: 'Return years', numeric: true },
  ],
  donors: [
    { key: 'donor', label: 'Donor', numeric: false },
    { key: 'industry', label: 'Industry', numeric: false },
    { key: 'total', label: 'Total', numeric: true },
    { key: 'parties', label: 'Parties', numeric: true },
    { key: 'years', label: 'Return years', numeric: true },
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
.lg-select {
  appearance: none; -webkit-appearance: none; padding-right: 2rem;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23142A43' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right .6rem center;
}
.lg-search { width: 15rem; max-width: 100%; }
.lg-year { width: 6rem; font-variant-numeric: tabular-nums; }
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
.lg-scope-chip { display: inline-flex; align-items: center; max-width: 100%; gap: .5rem; margin: 0 0 .6rem; padding: .3rem .55rem; border: 1px solid var(--bronze-ink, #8A5A12); background: var(--bronze-wash, rgba(160,118,27,.12)); font-size: .8125rem; }
.lg-scope-chip > span { min-width: 0; overflow-wrap: anywhere; }
.lg-chip-remove { font: inherit; flex: none; min-height: 44px; border: 0; background: transparent; color: var(--bronze-ink, #8A5A12); text-decoration: underline; cursor: pointer; padding: .1rem .3rem; }

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

.lg-fineprint, .lg-year-help {
  margin: 0.6rem 0 0; font-size: 0.75rem; line-height: 1.55;
  color: var(--ink-faint, #6F7468);
}
.lg-year-help { margin: 0 0 0.75rem; }
.lg-period { display: block; margin-top: 0.25rem; }
.lg-fineprint a { color: var(--bronze-ink, #8A5A12); }

.lg-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

.lg-cards, .lg-compact-sort { display: none; }
@media (max-width: 960px) {
  .lg-table { display: none; }
  .lg-tablewrap { overflow-x: hidden; }
  .lg-compact-sort {
    display: flex; align-items: flex-end; gap: 0.5rem; margin: 0.75rem 0;
  }
  .lg-compact-sort .lg-field { flex: 1; }
  .lg-compact-sort .lg-select, .lg-compact-sort .lg-btn { min-height: 2.75rem; font-size: 1rem; }
  .lg-compact-sort .lg-btn { min-width: 7.5rem; }
  .lg-cards:not([hidden]) { display: block; list-style: none; margin: 0; padding: 0; }
  .lg-card { padding: 1rem; border-bottom: 1px solid var(--line, #DFDCD2); }
  .lg-card:last-child { border-bottom: 0; }
  .lg-card-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem 1rem; align-items: start; }
  .lg-card-label { display: block; color: var(--ink-soft, #575C52); font-size: 0.75rem; line-height: 1.5; }
  .lg-card a { color: var(--navy, #142A43); text-decoration-color: var(--bronze, #A0761B); text-underline-offset: 3px; }
  .lg-card-donor { display: inline-flex; align-items: center; min-height: 2.75rem; font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; }
  .lg-card-value { text-align: right; }
  .lg-card-value strong { display: block; padding-top: 0.375rem; font-size: 1.25rem; line-height: 1.4; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .lg-card-recipient { margin-top: 0.75rem; }
  .lg-card-recipient .lg-cell-label { display: flex; align-items: center; min-width: 0; }
  .lg-card-recipient a { display: inline-flex; align-items: center; min-height: 2.75rem; font-weight: 600; overflow-wrap: anywhere; }
  .lg-card-share { display: block; font-size: 0.8125rem; color: var(--ink-soft, #575C52); }
  .lg-card-meta { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin-top: 0.5rem; font-size: 0.8125rem; line-height: 1.55; color: var(--ink-soft, #575C52); }
}

@media (max-width: 640px) {
  .lg-input, .lg-select { font-size: 1rem; min-height: 2.75rem; }
  .lg-btn, .lg-view, .lg-jur { min-height: 2.75rem; }
  .lg-year { width: 5.5rem; }
  .lg-field[aria-label="Jurisdiction"] { flex: 1 1 100%; }
  .lg-field[aria-label="Jurisdiction"] .lg-views { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.375rem; }
  .lg-field[aria-label="Jurisdiction"] .lg-jur { border: 1px solid var(--line-strong, #8D897B); border-radius: 2px; }
  .lg-field:has(> #lg-industry), .lg-field:has(> #lg-party) { flex: 1 1 calc(50% - 0.5rem); }
  .lg-select { max-width: 100%; }
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
  if (!Number.isFinite(r.firstYear) || !Number.isFinite(r.lastYear)) return 'Undated'
  return r.firstYear === r.lastYear ? String(r.firstYear) : `${r.firstYear}–${r.lastYear}`
}

// ---------------------------------------------------------------------------
// mountLedger
// ---------------------------------------------------------------------------

export function mountLedger (container, opts = {}) {
  injectStyles()

  const routeParams = opts.params instanceof URLSearchParams ? opts.params : new URLSearchParams(opts.params || '')
  const routeJur = routeParams.get('jur')

  const state = {
    jur: Object.hasOwn(JURISDICTIONS, routeJur) ? routeJur : (Object.hasOwn(JURISDICTIONS, opts.jurisdiction) ? opts.jurisdiction : 'federal'),
    view: 'flows',                 // 'flows' | 'donors'
    q: '',
    industry: '',
    party: '',
    focusDonorId: '',
    focusDonor: '',
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
  let loading = true
  let loadError = false
  let paramError = ''
  let initialParamsApplied = false
  let loadSeq = 0                  // a switch mid-load must not let the old file land
  const cache = new Map()          // jurisdiction -> parsed export
  const aborter = new AbortController()

  // ---- static chrome (no data passes through this template) ---------------
  const root = el('section', 'lg-root')
  root.setAttribute('aria-label', 'Political receipts: disclosed records, payer by payer')
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
        <span class="lg-label" id="lg-years-label">Return years</span>
        <div class="lg-yearrow" role="group" aria-labelledby="lg-years-label">
          <input class="lg-input lg-year" id="lg-year-from" type="number" inputmode="numeric"
                 min="${YEAR_MIN}" max="${YEAR_MAX}" placeholder="${YEAR_MIN}" aria-label="From return year" aria-describedby="lg-year-help" />
          <span aria-hidden="true">–</span>
          <input class="lg-input lg-year" id="lg-year-to" type="number" inputmode="numeric"
                 min="${YEAR_MIN}" max="${YEAR_MAX}" placeholder="${YEAR_MAX}" aria-label="To return year" aria-describedby="lg-year-help" />
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

    <p class="lg-year-help" id="lg-year-help">Use the first year of a financial year (2020 for 2020–21), or the polling year for election returns.</p>
    <div class="lg-scope-chip" id="lg-scope-chip" hidden></div>
    <p class="lg-summary" aria-live="polite" aria-atomic="true"></p>

    <div class="lg-compact-sort">
      <div class="lg-field">
        <label class="lg-label" for="lg-compact-sort">Sort by</label>
        <select class="lg-select" id="lg-compact-sort" disabled></select>
      </div>
      <button type="button" class="lg-btn" id="lg-sort-direction" disabled>High to low</button>
    </div>
    <div class="lg-tablewrap" role="region" tabindex="0" aria-label="Political receipts (scrollable)">
      <div class="lg-status" role="status">Loading the ledger…</div>
      <ul class="lg-cards" hidden></ul>
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
  const scopeEl = $('#lg-scope-chip')
  const statusEl = $('.lg-status')
  const tableEl = $('.lg-table')
  const captionEl = $('caption')
  const headRow = $('thead tr')
  const bodyEl = $('tbody')
  const cardsEl = $('.lg-cards')
  const compactSortEl = $('#lg-compact-sort')
  const directionBtn = $('#lg-sort-direction')

  // ---- filters → rows -----------------------------------------------------

  const hasFilters = () =>
    state.q.trim() !== '' || state.industry !== '' || state.party !== '' ||
    state.focusDonorId !== '' || state.yearFrom != null || state.yearTo != null || state.min > 0

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
    compactSortEl.textContent = ''
    for (const col of COLUMNS[state.view]) {
      const option = el('option', null, col.label)
      option.value = col.key
      compactSortEl.appendChild(option)
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
    compactSortEl.value = sort.key
    const col = COLUMNS[state.view].find((c) => c.key === sort.key)
    const labels = col.key === 'years' ? ['Oldest first', 'Newest first']
      : col.numeric ? ['Low to high', 'High to low'] : ['A to Z', 'Z to A']
    directionBtn.textContent = labels[sort.dir === 'asc' ? 0 : 1]
    directionBtn.setAttribute('aria-label', `${col.label}: ${directionBtn.textContent}. Change to ${labels[sort.dir === 'asc' ? 1 : 0]}.`)
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

  // The compact list uses the same calculated rows as the table and export.
  // CSS exposes one presentation at a time, including to assistive technology.
  function renderCard (r) {
    const card = el('li', 'lg-card')
    const top = el('div', 'lg-card-top')
    const payer = el('div')
    payer.appendChild(el('span', 'lg-card-label', 'From'))
    const donor = subjectLink('donor', r.donor)
    donor.className = 'lg-card-donor'
    payer.appendChild(donor)
    const amount = el('div', 'lg-card-value')
    amount.append(el('span', 'lg-card-label', state.view === 'flows' ? 'Disclosed receipts' : 'Total shown'), el('strong', null, AUD.format(r.total)))
    top.append(payer, amount)
    const recipient = el('div', 'lg-card-recipient')
    recipient.append(el('span', 'lg-card-label', state.view === 'flows' ? 'Received by' : 'Largest recipient'),
      dotLabel(state.view === 'flows' ? r.partyColour : r.topPartyColour,
        subjectLink('party', state.view === 'flows' ? r.party : r.topParty)))
    if (state.view === 'donors') recipient.appendChild(el('span', 'lg-card-share', `${Math.round(r.topShare * 100)}% of the shown total · ${NUM.format(r.parties)} ${r.parties === 1 ? 'party' : 'parties'}`))
    const details = el('div', 'lg-card-meta')
    details.append(el('span', null, `Return years: ${yearsText(r)}`),
      el('span', null, `${NUM.format(r.count)} ${r.count === 1 ? 'record' : 'records'}`),
      el('span', null, industryLabel(r.industry)))
    card.append(top, recipient, details)
    return card
  }

  function render () {
    if (loading || loadError || paramError) {
      exportBtn.disabled = true
      compactSortEl.disabled = directionBtn.disabled = true
      tableEl.hidden = true
      cardsEl.hidden = true
      scopeEl.hidden = true
      currentRows = []
      if (paramError) {
        statusEl.hidden = false
        statusEl.textContent = paramError
        clearBtn.hidden = false
      }
      return
    }
    const invalidFrom = !yearFromEl.validity.valid
    const invalidTo = !yearToEl.validity.valid
    const reversed = state.yearFrom != null && state.yearTo != null && state.yearFrom > state.yearTo
    yearFromEl.setAttribute('aria-invalid', String(invalidFrom || reversed))
    yearToEl.setAttribute('aria-invalid', String(invalidTo || reversed))
    const error = invalidFrom || invalidTo ? `Enter a return year between ${YEAR_MIN} and ${YEAR_MAX}.`
      : reversed ? 'The start year must be the same as or earlier than the end year.' : ''
    exportBtn.disabled = !!error
    statusEl.hidden = !error
    tableEl.hidden = !!error
    cardsEl.hidden = !!error
    compactSortEl.disabled = directionBtn.disabled = !!error
    if (error) {
      currentRows = []
      summaryEl.textContent = error
      statusEl.textContent = 'Update the years to see matching receipts.'
      clearBtn.hidden = false
      return
    }
    const { flowCount, rows } = computeRows()
    currentRows = rows

    const frag = document.createDocumentFragment()
    const cards = document.createDocumentFragment()
    const renderCells = state.view === 'flows' ? renderCellsFlows : renderCellsDonors
    for (const r of rows) {
      const tr = document.createElement('tr')
      renderCells(tr, r)
      frag.appendChild(tr)
      cards.appendChild(renderCard(r))
    }
    if (rows.length === 0) {
      const tr = document.createElement('tr')
      const td = el('td', 'lg-empty', 'Nothing matches these filters.')
      td.colSpan = COLUMNS[state.view].length
      tr.appendChild(td)
      frag.appendChild(tr)
      cards.appendChild(el('li', 'lg-empty', 'Nothing matches these filters.'))
    }
    bodyEl.textContent = ''
    bodyEl.appendChild(frag)
    cardsEl.replaceChildren(cards)

    const shown = rows.reduce((sum, r) => sum + r.total, 0)
    summaryEl.textContent = ''
    const b = el('b', null, state.view === 'flows'
      ? `${NUM.format(rows.length)} ${rows.length === 1 ? 'flow' : 'flows'} · ${AUD.format(shown)}`
      : `${NUM.format(rows.length)} ${rows.length === 1 ? 'donor' : 'donors'} · ${AUD.format(shown)}`)
    summaryEl.appendChild(b)
    summaryEl.appendChild(document.createTextNode(state.view === 'flows'
      ? ' total shown'
      : ` total shown, aggregated from ${NUM.format(flowCount)} ${flowCount === 1 ? 'flow' : 'flows'}`))

    const hasYearFilter = state.yearFrom != null || state.yearTo != null
    const period = state.yearFrom != null && state.yearTo != null
      ? `Return years ${yearsText({ firstYear: state.yearFrom, lastYear: state.yearTo })}`
      : state.yearFrom != null ? `Return years from ${state.yearFrom}`
      : state.yearTo != null ? `Return years up to ${state.yearTo}` : 'All recorded years'
    summaryEl.appendChild(el('span', 'lg-period', hasYearFilter
      ? `${period} · Only records with yearly amounts are included.`
      : `${period} · Includes undated records where available.`))

    captionEl.textContent = state.view === 'flows'
      ? 'Disclosed donor to party flows matching the current filters'
      : 'Donors aggregated over the flows matching the current filters'
    cardsEl.setAttribute('aria-label', captionEl.textContent)

    clearBtn.hidden = !hasFilters()
    scopeEl.hidden = !state.focusDonorId
    scopeEl.replaceChildren()
    if (state.focusDonorId) {
      scopeEl.append(el('span', null, `Exact donor: ${state.focusDonor}`))
      const remove = el('button', 'lg-chip-remove', 'Remove')
      remove.type = 'button'; remove.setAttribute('aria-label', `Remove donor filter: ${state.focusDonor}`)
      remove.addEventListener('click', () => { state.focusDonorId = ''; state.focusDonor = ''; paramError = ''; render(); searchEl.focus() })
      scopeEl.appendChild(remove)
    }
  }

  // ---- CSV export ---------------------------------------------------------

  function describeFilters () {
    const parts = []
    if (state.q.trim()) parts.push(`text ~ "${state.q.trim()}"`)
    if (state.industry) parts.push(`industry = ${industryLabel(state.industry)}`)
    if (state.party) parts.push(`party = ${state.party}`)
    if (state.focusDonorId) parts.push(`donor = ${state.focusDonor}`)
    if (state.yearFrom != null || state.yearTo != null) {
      parts.push(`return years ${state.yearFrom ?? "any"}–${state.yearTo ?? "any"}; only dated amounts`)
    }
    if (state.min > 0) parts.push(`min total ${AUD.format(state.min)}`)
    return parts.length ? parts.join('; ') : 'none'
  }

  function exportCSV () {
    const sort = state.sort[state.view]
    const file = JURISDICTIONS[state.jur].file
    const comments = [
      state.view === 'flows'
        ? 'OPAX — Political receipts: disclosed donor→party flows'
        : 'OPAX — Political receipts: donors aggregated over the filtered flows',
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
      'Year columns use the first year of each financial year; election returns may use the polling year. Year filters sum only dated yearly amounts and exclude undated records.',
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
    if (!input.value.trim()) return null
    const n = Number(input.value)
    return Number.isFinite(n) ? n : null
  }
  yearFromEl.addEventListener('input', () => { state.yearFrom = readYear(yearFromEl); render() })
  yearToEl.addEventListener('input', () => { state.yearTo = readYear(yearToEl); render() })

  clearBtn.addEventListener('click', () => {
    state.q = ''; searchEl.value = ''
    state.industry = ''; industryEl.value = ''
    state.party = ''; partyEl.value = ''
    state.focusDonorId = ''; state.focusDonor = ''
    state.yearFrom = null; yearFromEl.value = ''
    state.yearTo = null; yearToEl.value = ''
    state.min = 0; minEl.value = '0'
    paramError = ''
    render()
    searchEl.focus()
  })

  exportBtn.addEventListener('click', exportCSV)
  compactSortEl.addEventListener('change', () => {
    const col = COLUMNS[state.view].find((c) => c.key === compactSortEl.value)
    state.sort[state.view] = { key: col.key, dir: col.numeric ? 'desc' : 'asc' }
    syncSortMarkers()
    render()
  })
  directionBtn.addEventListener('click', () => {
    const sort = state.sort[state.view]
    sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
    syncSortMarkers()
    render()
  })

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
    const previousJur = state.jur
    state.jur = Object.hasOwn(JURISDICTIONS, jur) ? jur : 'federal'
    const switchedJurisdiction = previousJur !== state.jur
    for (const b of root.querySelectorAll('.lg-jur')) {
      b.setAttribute('aria-pressed', b.dataset.jur === state.jur ? 'true' : 'false')
    }
    const token = ++loadSeq
    loading = true
    loadError = false
    // A deliberate jurisdiction switch must never leave an exact donor from the old file.
    if (switchedJurisdiction) {
      state.focusDonorId = ''; state.focusDonor = ''; paramError = ''
      // A newer explicit selection wins even if the first file is pending.
      initialParamsApplied = true
    }
    scopeEl.hidden = true
    exportBtn.disabled = true
    compactSortEl.disabled = directionBtn.disabled = true
    cardsEl.hidden = true
    cardsEl.replaceChildren()
    currentRows = []
    summaryEl.textContent = ''
    fineEl.textContent = ''
    statusEl.hidden = false
    statusEl.textContent = 'Loading the ledger…'
    tableEl.hidden = true
    try {
      const data = await fetchData(state.jur)
      if (token !== loadSeq) return
      loading = false
      meta = data.meta || {}
      flows = buildFlows(data)
      if (!initialParamsApplied && routeParams.toString()) {
        const parsed = parseLedgerParams(routeParams, data)
        initialParamsApplied = true
        if (!parsed.ok) {
          paramError = parsed.error
        } else {
          paramError = ''
          state.q = parsed.filters.q
          state.industry = parsed.filters.industry
          state.party = parsed.filters.party
          state.focusDonorId = parsed.filters.focusDonorId
          state.focusDonor = parsed.filters.focusDonor
          state.yearFrom = parsed.filters.yearFrom
          state.yearTo = parsed.filters.yearTo
          state.min = parsed.filters.min
          searchEl.value = state.q
          yearFromEl.value = state.yearFrom ?? ''
          yearToEl.value = state.yearTo ?? ''
          minEl.value = String(state.min)
        }
      }
      populateSelects(data)
      renderFineprint(data)
      statusEl.hidden = true
      tableEl.hidden = false
      renderHead()
      render()
    } catch (err) {
      if (aborter.signal.aborted || token !== loadSeq) return
      loading = false
      loadError = true
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
