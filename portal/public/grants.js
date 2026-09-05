/**
 * OPAX Who gets the grants — every published grant award, resolved to the
 * organisations that receive them and checked against the donor registers.
 *
 * The ledger answers "who gives"; this answers "who gets", and lays the two
 * side by side. Plain browser ES module, no dependencies.
 *
 *   import { mountGrants } from '/grants.js'
 *   const g = mountGrants(container)                    // renders into container
 *   mountGrants(container, { jurisdiction: 'qld' })     // open on the Queensland file
 *   g.destroy()                                         // removes DOM + aborts loads
 *
 * Data (same-origin, static, written by scripts/export_grants.py):
 *   GET /graph/grants.federal.json     GrantConnect awards (Commonwealth)
 *   GET /graph/grants.qld.json         Queensland Government Investment Portal
 *   GET /grants/<jur>/<file-key>.json  one recipient: its grants, ABR record,
 *                                      donor-register entity and its donations
 * Each index carries: meta (source, licence, caveats, counts, the government of
 * the day by date, party blocs), agencies[] and categories[] (referenced by
 * index), recipients[] (the largest by dollars plus every donor among them),
 * programs[], electorates[], years{}, kinds{}.
 *
 * Three views over one filtered set:
 *   Recipients  — one row per recipient; a row opens the recipient's file in place
 *   Programs    — one row per grant program / opportunity, with the share of its
 *                 dollars that went to recipients found in the donor registers
 *   Electorates — one row per federal division, with the members who held it and
 *                 the seat's margin, for the pork-barrel question
 *
 * Honesty rules: a recipient is "a donor" only when its ABN or a unique
 * organisation name matches the donor register (people are never matched by
 * name); AEC and state-register money are shown side by side and never
 * summed; a donor receiving a grant is a fact, not a finding, and the
 * selection process is shown wherever the source records it. Bars are
 * bronze/ink; party identity is only ever a dot plus text. Every live string
 * reaches the DOM through textContent.
 */

const JURISDICTIONS = {
  federal: { label: 'Commonwealth', file: '/graph/grants.federal.json', dir: '/grants/federal/' },
  qld: { label: 'Queensland', file: '/graph/grants.qld.json', dir: '/grants/qld/' },
}
const STYLE_ID = 'gr-styles'
const NUM = new Intl.NumberFormat('en-AU')
const AUD_FULL = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

const KIND_LABELS = {
  company: 'Company', association: 'Association / not-for-profit', trust: 'Trust',
  partnership: 'Partnership', 'co-operative': 'Co-operative', council: 'Local council',
  government: 'Government body', university: 'University / TAFE', 'health service': 'Health service',
  'super fund': 'Super fund', union: 'Union', individual: 'Individual', undisclosed: 'Not disclosed',
  other: 'Other',
}
const STATE_REGISTERS = { qld: 'ECQ (Queensland)', vic: 'VEC (Victoria)', tas: 'TEC (Tasmania)' }
const PARTY_MAP = {
  labor: ['alp', 'ALP'], 'australian labor party': ['alp', 'ALP'], liberal: ['lib', 'LIB'], 'liberal party': ['lib', 'LIB'],
  nationals: ['nat', 'NAT'], 'national party': ['nat', 'NAT'], 'the nationals': ['nat', 'NAT'],
  lnp: ['lnp', 'LNP'], 'liberal national party': ['lnp', 'LNP'], 'country liberal party': ['nat', 'CLP'],
  greens: ['grn', 'GRN'], 'australian greens': ['grn', 'GRN'], 'the greens': ['grn', 'GRN'], 'queensland greens': ['grn', 'GRN'],
  'one nation': ['onp', 'ONP'], "pauline hanson's one nation": ['onp', 'ONP'],
  independent: ['ind', 'IND'], 'centre alliance': ['oth', 'CA'], "katter's australian party": ['oth', 'KAP'],
  'united australia party': ['oth', 'UAP'], 'family first': ['oth', 'FF'], 'animal justice party': ['oth', 'AJP'],
  'legalise cannabis': ['oth', 'LC'], coalition: ['lib', 'COALITION'],
}

/** Mirror of app.js fmtMoney. */
export function fmtMoney (n) {
  n = Number(n) || 0
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

export function kindLabel (k) {
  return KIND_LABELS[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Other')
}

export function fyStart (fy) {
  const n = Number.parseInt(String(fy || '').slice(0, 4), 10)
  return Number.isFinite(n) ? n : null
}

export function fyShort (fy) {
  const s = fyStart(fy)
  return s == null ? String(fy || '') : `${String(s).slice(2)}–${String(s + 1).slice(2)}`
}

/** Mirror of export_grants.py file_key(): 'abn:123' -> 'abn-123', 'name:foo bar' -> 'name-foo-bar'. */
export function fileKey (rid) {
  const i = String(rid).indexOf(':')
  const kind = i < 0 ? 'x' : rid.slice(0, i)
  const rest = i < 0 ? rid : rid.slice(i + 1)
  const slug = rest.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
  return `${kind}-${slug}`
}

/** First and last financial year present in the aligned year cells. */
export function yearSpan (by, years) {
  let y0 = null
  let y1 = null
  ;(by || []).forEach((cell, i) => {
    if (!cell) return
    if (y0 == null) y0 = years[i]
    y1 = years[i]
  })
  return { y0, y1 }
}

export function formatABN (abn) {
  const d = String(abn || '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : d
}

// ---------------------------------------------------------------------------
// Pure data layer (node-testable: nothing here touches the DOM)
// ---------------------------------------------------------------------------

/**
 * A recipient's totals inside a financial-year window, re-summed from `by`:
 * cells aligned to `years` (meta.years), each [dollars, count] or 0.
 */
export function windowTotals (rec, from, to, years) {
  if (from == null && to == null) {
    const span = yearSpan(rec.by, years || [])
    return { t: rec.t, c: rec.c, y0: rec.y0 ?? span.y0, y1: rec.y1 ?? span.y1 }
  }
  let t = 0
  let c = 0
  let y0 = null
  let y1 = null
  ;(rec.by || []).forEach((cell, i) => {
    if (!cell) return
    const y = fyStart(years[i])
    if (y == null) return
    if (from != null && y < from) return
    if (to != null && y > to) return
    t += cell[0]
    c += cell[1]
    if (y0 == null || y < y0) y0 = y
    if (y1 == null || y > y1) y1 = y
  })
  return { t, c, y0: y0 == null ? null : `${y0}-${String(y0 + 1).slice(2)}`, y1: y1 == null ? null : `${y1}-${String(y1 + 1).slice(2)}` }
}

/** Donor money summary for a row: AEC total, top party, state total. */
export function donorSummary (d) {
  if (!d) return null
  let topParty = ''
  let top = 0
  for (const [p, v] of Object.entries(d.p || {})) if (v > top) { top = v; topParty = p }
  const state = Object.values(d.st || {}).reduce((s, x) => s + (x.t || 0), 0)
  const aec = d.aec || 0
  return { aec, state, topParty, topShare: aec > 0 ? top / aec : 0, name: d.n, entity: d.e, method: d.m }
}

export function filterRecipients (rows, f, ctx) {
  const q = (f.q || '').trim().toLowerCase()
  const out = []
  for (const r of rows) {
    if (f.donors && !r.d) continue
    if (f.kind && r.k !== f.kind) continue
    if (f.agency !== '' && f.agency != null && !(r.ag || []).includes(Number(f.agency))) continue
    if (q) {
      const hay = `${r.n} ${r.d ? r.d.n : ''} ${(r.ag || []).map((i) => ctx.agencies[i] || '').join(' ')}`.toLowerCase()
      if (!hay.includes(q)) continue
    }
    const w = windowTotals(r, f.yearFrom, f.yearTo, ctx.years || [])
    if (w.c === 0) continue
    if (w.t < (f.min || 0)) continue
    out.push({ ...r, f: r.f || fileKey(r.id), wt: w.t, wc: w.c, wy0: w.y0, wy1: w.y1, ds: donorSummary(r.d) })
  }
  return out
}

function overlaps (r, f) {
  const a = fyStart(r.y0)
  const b = fyStart(r.y1)
  if (f.yearFrom != null && b != null && b < f.yearFrom) return false
  if (f.yearTo != null && a != null && a > f.yearTo) return false
  return true
}

export function filterPrograms (rows, f, ctx) {
  const q = (f.q || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (f.donors && !(r.dt > 0)) return false
    if (f.agency !== '' && f.agency != null && r.ag !== Number(f.agency)) return false
    if (q && !`${r.n} ${ctx.agencies[r.ag] || ''}`.toLowerCase().includes(q)) return false
    if (!overlaps(r, f)) return false
    if (r.t < (f.min || 0)) return false
    return true
  }).map((r) => ({ ...r, share: r.t > 0 ? r.dt / r.t : 0 }))
}

export function filterElectorates (rows, f) {
  const q = (f.q || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (f.donors && !(r.dt > 0)) return false
    if (q && !`${r.n} ${r.st || ''} ${(r.mps || []).map((m) => `${m[0]} ${m[1] || ''}`).join(' ')}`.toLowerCase().includes(q)) return false
    if (r.t < (f.min || 0)) return false
    return true
  }).map((r) => ({ ...r, share: r.t > 0 ? r.dt / r.t : 0, marginLatest: latestMargin(r.margin) }))
}

export function latestMargin (margin) {
  const years = Object.keys(margin || {}).sort()
  if (!years.length) return null
  const y = years[years.length - 1]
  const [pct, party, type] = margin[y]
  return { year: y, pct, party, type }
}

const TEXT_KEYS = new Set(['n', 'k', 'agency', 'st', 'topParty', 'held'])

export function sortRows (rows, key, dir) {
  const mul = dir === 'asc' ? 1 : -1
  const byName = (a, b) => String(a.n).localeCompare(String(b.n), 'en')
  const val = (r) => {
    switch (key) {
      case 'years': return fyStart(r.wy0 ?? r.y0) ?? -1
      case 'donor': return r.ds ? r.ds.aec + r.ds.state : -1
      case 'margin': return r.marginLatest ? r.marginLatest.pct : 999
      case 't': return r.wt ?? r.t
      case 'c': return r.wc ?? r.c
      case 'k': return kindLabel(r.k)
      default: return r[key]
    }
  }
  const sorted = rows.slice()
  sorted.sort((a, b) => {
    const va = val(a)
    const vb = val(b)
    if (TEXT_KEYS.has(key)) return mul * String(va ?? '').localeCompare(String(vb ?? ''), 'en') || ((b.wt ?? b.t) - (a.wt ?? a.t))
    return mul * ((va ?? 0) - (vb ?? 0)) || byName(a, b)
  })
  return sorted
}

/** The bloc in government on an ISO date, from meta.government. */
export function govBlocAt (government, iso) {
  if (!iso) return null
  for (const [from, to, bloc] of government || []) {
    if (iso >= from && (to == null || iso < to)) return bloc
  }
  return null
}

/** The blocs a donor has given to (AEC + exposed state registers), with totals. */
export function donorBlocs (d, blocs) {
  const out = new Map()
  const add = (party, v) => {
    const b = blocs[party] || party
    out.set(b, (out.get(b) || 0) + v)
  }
  for (const [p, v] of Object.entries(d?.p || {})) add(p, v)
  for (const st of Object.values(d?.st || {})) for (const [p, v] of Object.entries(st.p || {})) add(p, v)
  return out
}

/**
 * Of a recipient's grant dollars, how many were awarded while a bloc the
 * recipient has given to was in government. Timing-neutral on purpose: it
 * says "a party it has funded", not "before" or "after".
 */
export function govShare (grants, government, blocSet) {
  let dollars = 0
  let total = 0
  const byBloc = new Map()
  for (const g of grants || []) {
    total += g.v || 0
    const bloc = govBlocAt(government, g.s || g.fy && `${fyStart(g.fy)}-07-01`)
    if (bloc && blocSet.has(bloc)) {
      dollars += g.v || 0
      byBloc.set(bloc, (byBloc.get(bloc) || 0) + (g.v || 0))
    }
  }
  return { dollars, total, share: total > 0 ? dollars / total : 0, byBloc }
}

function csvCell (v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function buildCSV (view, rows, ctx, commentLines) {
  const lines = commentLines.map((l) => '# ' + l)
  if (view === 'recipients') {
    lines.push(['Recipient', 'Kind', 'Recipient id', 'Awarded (AUD)', 'Grants', 'First year', 'Last year', 'Top agency',
      'Ad hoc or one-off (AUD)', 'Donor register entity', 'AEC donations (AUD)', 'AEC top party',
      'State register donations (AUD)'].join(','))
    for (const r of rows) {
      lines.push([csvCell(r.n), csvCell(kindLabel(r.k)), csvCell(r.id || ''), Math.round(r.wt ?? r.t), r.wc ?? r.c,
        csvCell(r.wy0 ?? r.y0 ?? ''), csvCell(r.wy1 ?? r.y1 ?? ''), csvCell(ctx.agencies[(r.ag || [])[0]] || ''),
        Math.round(r.adhoc || 0), csvCell(r.ds ? r.ds.name : ''), r.ds ? Math.round(r.ds.aec) : '',
        csvCell(r.ds ? r.ds.topParty : ''), r.ds ? Math.round(r.ds.state) : ''].join(','))
    }
  } else if (view === 'programs') {
    lines.push(['Program', 'Agency', 'Awarded (AUD)', 'Grants', 'Recipients', 'To recipients in the donor registers (AUD)',
      'Share (%)', 'Ad hoc or one-off (AUD)', 'First year', 'Last year'].join(','))
    for (const r of rows) {
      lines.push([csvCell(r.n), csvCell(ctx.agencies[r.ag] || ''), r.t, r.c, r.r, r.dt, Math.round(r.share * 100),
        r.adhoc, csvCell(r.y0 || ''), csvCell(r.y1 || '')].join(','))
    }
  } else {
    lines.push(['Division', 'State', 'Awarded (AUD)', 'Grants', 'Recipients', 'To recipients in the donor registers (AUD)',
      'Share (%)', 'Ad hoc or one-off (AUD)', 'Held by', 'Margin (%)', 'Margin party', 'Margin election'].join(','))
    for (const r of rows) {
      const m = r.marginLatest
      lines.push([csvCell(r.n), csvCell((r.st || '').toUpperCase()), r.t, r.c, r.r, r.dt, Math.round(r.share * 100), r.adhoc,
        csvCell((r.mps || []).map((x) => `${x[0]} (${x[1] || '?'}${x[2] ? ', ' + x[2].slice(0, 4) : ''}${x[3] ? '–' + x[3].slice(0, 4) : '–'})`).join('; ')),
        m ? m.pct : '', csvCell(m ? m.party : ''), m ? m.year : ''].join(','))
    }
  }
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Column models
// ---------------------------------------------------------------------------

const COLUMNS = {
  recipients: [
    { key: 'n', label: 'Recipient', numeric: false },
    { key: 'k', label: 'Kind', numeric: false },
    { key: 't', label: 'Awarded', numeric: true },
    { key: 'c', label: 'Grants', numeric: true },
    { key: 'years', label: 'Years', numeric: true },
    { key: 'agency', label: 'Main agency', numeric: false },
    { key: 'donor', label: 'In the donor registers', numeric: true },
  ],
  programs: [
    { key: 'n', label: 'Program', numeric: false },
    { key: 'agency', label: 'Agency', numeric: false },
    { key: 't', label: 'Awarded', numeric: true },
    { key: 'c', label: 'Grants', numeric: true },
    { key: 'r', label: 'Recipients', numeric: true },
    { key: 'share', label: 'To donors', numeric: true },
    { key: 'adhoc', label: 'Ad hoc', numeric: true },
  ],
  electorates: [
    { key: 'n', label: 'Division', numeric: false },
    { key: 't', label: 'Awarded', numeric: true },
    { key: 'c', label: 'Grants', numeric: true },
    { key: 'share', label: 'To donors', numeric: true },
    { key: 'adhoc', label: 'Ad hoc', numeric: true },
    { key: 'held', label: 'Held by', numeric: false },
    { key: 'margin', label: 'Margin', numeric: true },
  ],
}

// ---------------------------------------------------------------------------
// Styles — .gr- prefix, site tokens with fallbacks, light-only
// ---------------------------------------------------------------------------

const CSS = `
.gr-root { font-family: var(--sans, 'Public Sans', -apple-system, 'Segoe UI', Roboto, sans-serif); color: var(--ink, #23271F); }
.gr-root :focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }
.gr-title { font: 700 clamp(1.6rem, 3vw, 2.25rem)/1.15 var(--serif, Merriweather, Georgia, serif); margin: 0 0 0.35rem; }
.gr-deck { margin: 0 0 1.1rem; max-width: 70ch; color: var(--ink-soft, #575C52); font-size: 0.9375rem; line-height: 1.55; }

.gr-toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end; margin-bottom: 0.75rem; }
.gr-field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.gr-label { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint, #6F7468); }
.gr-input, .gr-select {
  font: inherit; font-size: 0.875rem; color: var(--ink, #23271F); background: var(--paper-raised, #FFFFFF);
  border: 1px solid var(--line-strong, #8D897B); border-radius: 2px; padding: 0.375rem 0.5rem; min-height: 2.125rem;
}
.gr-search { width: 15rem; max-width: 100%; }
.gr-year { width: 5.75rem; font-variant-numeric: tabular-nums; }
.gr-yearrow { display: flex; align-items: center; gap: 0.35rem; }
.gr-yearrow span { color: var(--ink-faint, #6F7468); }
.gr-views { display: flex; }
.gr-seg {
  font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; padding: 0.4rem 0.85rem; min-height: 2.125rem;
  background: var(--paper-raised, #FFFFFF); color: var(--ink-soft, #575C52); border: 1px solid var(--line-strong, #8D897B);
}
.gr-seg + .gr-seg { border-left: 0; }
.gr-seg:first-child { border-radius: 2px 0 0 2px; }
.gr-seg:last-child { border-radius: 0 2px 2px 0; }
.gr-seg[aria-pressed="true"] { background: var(--navy, #142A43); border-color: var(--navy, #142A43); color: #FFFFFF; }
.gr-actions { display: flex; gap: 0.5rem; margin-left: auto; align-items: flex-end; }
.gr-btn {
  font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; padding: 0.4rem 0.8rem; min-height: 2.125rem;
  border-radius: 2px; background: none; border: 1px solid var(--line-strong, #8D897B); color: var(--ink-soft, #575C52);
}
.gr-btn:hover { background: var(--paper-sunken, #F1EFE8); }
.gr-export { border-color: var(--bronze-ink, #8A5A12); color: var(--bronze-ink, #8A5A12); }
.gr-export:hover { background: var(--bronze-wash, rgba(160, 118, 27, 0.16)); }

.gr-tiles { display: flex; flex-wrap: wrap; gap: 0.9rem 1.6rem; margin: 0.4rem 0 0.9rem; }
.gr-tile { padding: 0.6rem 0 0.2rem; min-width: 130px; flex: 1 1 140px; max-width: 260px; border-top: 2px solid var(--bronze, #A0761B); }
.gr-tile b { display: block; font: 700 1.55rem/1.1 var(--serif, Merriweather, Georgia, serif); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.gr-tile span { display: block; margin-top: 0.35rem; color: var(--ink-soft, #575C52); font-size: 0.8125rem; line-height: 1.4; }

.gr-chart { margin: 0 0 1rem; }
.gr-chart svg { width: 100%; height: auto; display: block; }
.gr-bar { fill: var(--bronze-wash, rgba(160, 118, 27, 0.16)); stroke: var(--bronze, #A0761B); stroke-width: 1; }
.gr-bar-donor { fill: var(--bronze, #A0761B); }
.gr-axis { font: 600 10px/1 var(--sans, sans-serif); fill: var(--ink-faint, #6F7468); }
.gr-val { font: 600 10px/1 var(--sans, sans-serif); fill: var(--ink-soft, #575C52); }
.gr-gov { display: flex; flex-wrap: wrap; gap: 0.3rem 1.2rem; margin: 0.35rem 0 0; font-size: 0.75rem; color: var(--ink-faint, #6F7468); }
.gr-gov .party { text-transform: none; letter-spacing: 0; font-weight: 600; }
.gr-legend { display: inline-flex; align-items: center; gap: 0.35rem; }
.gr-legend i { display: inline-block; width: 12px; height: 9px; border: 1px solid var(--bronze, #A0761B); background: var(--bronze-wash, rgba(160,118,27,.16)); }
.gr-legend i.gr-solid { background: var(--bronze, #A0761B); }

.gr-summary { margin: 0 0 0.5rem; font-size: 0.8125rem; color: var(--ink-soft, #575C52); font-variant-numeric: tabular-nums; }
.gr-summary b { font-weight: 700; color: var(--ink, #23271F); }
.gr-tablewrap { overflow: auto; max-height: min(70vh, 900px); border: 1px solid var(--line-strong, #8D897B); background: var(--paper-raised, #FFFFFF); }
.gr-table { border-collapse: collapse; width: 100%; min-width: 820px; font-size: 0.875rem; line-height: 1.4; }
.gr-table thead th { position: sticky; top: 0; z-index: 2; padding: 0; background: var(--paper-sunken, #F1EFE8); border-bottom: 1px solid var(--line-strong, #8D897B); text-align: left; white-space: nowrap; }
.gr-sort { font: inherit; font-size: 0.8125rem; font-weight: 700; cursor: pointer; color: var(--ink-soft, #575C52); background: none; border: 0; width: 100%; text-align: inherit; padding: 0.5rem 0.625rem; display: flex; gap: 0.3rem; align-items: baseline; }
.gr-sort:hover { color: var(--ink, #23271F); }
th[aria-sort] .gr-sort { color: var(--ink, #23271F); }
.gr-arrow { font-size: 0.625rem; color: var(--bronze-ink, #8A5A12); }
.gr-th-num { text-align: right; }
.gr-th-num .gr-sort { justify-content: flex-end; }
.gr-table td { padding: 0.45rem 0.625rem; border-bottom: 1px solid var(--line, #DFDCD2); vertical-align: baseline; }
.gr-table tbody tr.gr-row:hover td { background: var(--paper-sunken, #F1EFE8); }
.gr-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gr-muted { color: var(--ink-faint, #6F7468); }
.gr-table a { color: inherit; text-decoration: underline; text-decoration-color: var(--bronze, #A0761B); text-underline-offset: 2px; }
.gr-table a:hover { color: var(--bronze-ink, #8A5A12); }
.gr-open { font: inherit; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; text-decoration: underline; text-decoration-color: var(--bronze, #A0761B); text-underline-offset: 2px; }
.gr-open:hover { color: var(--bronze-ink, #8A5A12); }
.gr-open[aria-expanded="true"] { font-weight: 700; text-decoration: none; }
.gr-share { color: var(--ink-faint, #6F7468); }
.gr-bar-cell { display: inline-block; height: 8px; background: var(--bronze, #A0761B); vertical-align: middle; margin-right: 0.4rem; border-radius: 1px; }
.gr-empty { padding: 1.5rem 0.75rem; text-align: center; color: var(--ink-faint, #6F7468); }
.gr-status { padding: 1.5rem 0.75rem; font-size: 0.875rem; color: var(--ink-soft, #575C52); }
.gr-status .gr-btn { margin-left: 0.5rem; }
.gr-mps { display: flex; flex-wrap: wrap; gap: 0.15rem 0.7rem; }
.gr-mps .party { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 0.8125rem; }
.gr-donor-cell { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.45rem; justify-content: flex-end; }

.gr-detail td { background: var(--paper, #FAF9F6); padding: 1rem 1.1rem 1.2rem; border-bottom: 2px solid var(--line-strong, #8D897B); }
.gr-detail-head { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; align-items: baseline; margin-bottom: 0.4rem; }
.gr-detail-head h3 { font: 700 1.2rem/1.2 var(--serif, Merriweather, Georgia, serif); margin: 0; }
.gr-detail-meta { font-size: 0.8125rem; color: var(--ink-soft, #575C52); line-height: 1.5; margin: 0 0 0.6rem; }
.gr-detail-meta b { color: var(--ink, #23271F); }
.gr-cols { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 1rem 2rem; }
.gr-kicker { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint, #6F7468); margin: 0.6rem 0 0.35rem; }
.gr-grants { border-collapse: collapse; width: 100%; font-size: 0.8125rem; }
.gr-grants td { padding: 0.3rem 0.5rem 0.3rem 0; border-bottom: 1px solid var(--line, #DFDCD2); vertical-align: top; }
.gr-grants td:last-child { padding-right: 0; }
.gr-grants .gr-num { white-space: nowrap; }
.gr-grants small { display: block; color: var(--ink-faint, #6F7468); }
.gr-donor { border-left: 3px solid var(--bronze, #A0761B); padding: 0.1rem 0 0.1rem 0.8rem; }
.gr-donor p { margin: 0.3rem 0; font-size: 0.875rem; line-height: 1.5; }
.gr-partylist { list-style: none; margin: 0.2rem 0 0.5rem; padding: 0; font-size: 0.875rem; }
.gr-partylist li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.15rem 0; border-bottom: 1px dotted var(--line, #DFDCD2); }
.gr-partylist .party { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 0.875rem; }
.gr-note { font-size: 0.8125rem; color: var(--ink-soft, #575C52); line-height: 1.5; margin: 0.4rem 0 0; }
.gr-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.8rem; }
.gr-links a, .gr-links button { font: 600 0.8125rem/1 var(--sans, sans-serif); padding: 0.45rem 0.8rem; border-radius: 2px; border: 1px solid var(--line-strong, #8D897B); color: var(--ink-soft, #575C52); text-decoration: none; background: none; cursor: pointer; }
.gr-links a:hover, .gr-links button:hover { background: var(--paper-sunken, #F1EFE8); color: var(--ink, #23271F); }
.gr-links .gr-primary { background: var(--navy, #142A43); border-color: var(--navy, #142A43); color: #FFFFFF; }
.gr-links .gr-primary:hover { background: var(--navy-raised, #1D3A5C); color: #FFFFFF; }

.gr-fineprint { margin: 0.6rem 0 0; font-size: 0.75rem; line-height: 1.55; color: var(--ink-faint, #6F7468); }
.gr-fineprint a { color: var(--bronze-ink, #8A5A12); }
.gr-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }

@media (max-width: 760px) {
  .gr-search { width: 100%; }
  .gr-field-search { flex: 1 1 100%; }
  .gr-actions { margin-left: 0; }
  .gr-cols { grid-template-columns: 1fr; }
  .gr-table { min-width: 720px; }
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

function partyChip (party, { full = true } = {}) {
  const hit = PARTY_MAP[String(party || '').toLowerCase()]
  const span = el('span', `party party-${hit ? hit[0] : 'oth'}`)
  const dot = el('i')
  dot.setAttribute('aria-hidden', 'true')
  span.append(dot, document.createTextNode(full ? String(party || '') : (hit ? hit[1] : String(party || '').slice(0, 12))))
  return span
}

function yearsText (y0, y1) {
  if (!y0 && !y1) return '—'
  if (!y1 || y0 === y1) return fyShort(y0 || y1)
  return `${fyShort(y0)} to ${fyShort(y1)}`
}

function moneyCell (v) {
  const td = el('td', 'gr-num', fmtMoney(v))
  td.title = AUD_FULL.format(v || 0)
  return td
}

function link (href, text, className) {
  const a = el('a', className, text)
  a.href = href
  return a
}

// ---------------------------------------------------------------------------
// mountGrants
// ---------------------------------------------------------------------------

export function mountGrants (container, opts = {}) {
  injectStyles()
  const subjectHash = opts.subjectHash || ((kind, label) => `/subject/${kind}/${encodeURIComponent(label)}`)
  const searchHash = opts.searchHash || ((q) => `/search?q=${encodeURIComponent(q)}`)

  const state = {
    jur: JURISDICTIONS[opts.jurisdiction] ? opts.jurisdiction : 'federal',
    view: 'recipients',
    q: '', kind: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0,
    sort: {
      recipients: { key: 't', dir: 'desc' },
      programs: { key: 't', dir: 'desc' },
      electorates: { key: 't', dir: 'desc' },
    },
    open: null,                    // recipient id whose file is open in the table
  }

  let data = null                  // the loaded index
  let currentRows = []
  let loadSeq = 0
  const cache = new Map()          // jurisdiction -> index
  const detailCache = new Map()    // file key -> detail
  const aborter = new AbortController()

  const root = el('section', 'gr-root')
  root.setAttribute('aria-label', 'Who gets the grants: grant recipients checked against the donor registers')
  root.innerHTML = `
    <h2 class="gr-title">Who gets the grants</h2>
    <p class="gr-deck">Every published grant award, resolved to the organisations that receive it and
      checked against the donor registers. Who gets public money, from which programs, in which seats,
      and which of them also fund parties.</p>

    <div class="gr-toolbar" role="group" aria-label="Grant filters">
      <div class="gr-field" role="group" aria-label="Jurisdiction">
        <span class="gr-label" aria-hidden="true">Jurisdiction</span>
        <div class="gr-views">
          ${Object.entries(JURISDICTIONS).map(([k, j]) =>
            `<button type="button" class="gr-seg gr-jur" data-jur="${k}" aria-pressed="${k === state.jur ? 'true' : 'false'}">${j.label}</button>`).join('')}
        </div>
      </div>
      <div class="gr-field" role="group" aria-label="View">
        <span class="gr-label" aria-hidden="true">View</span>
        <div class="gr-views">
          <button type="button" class="gr-seg gr-view" data-view="recipients" aria-pressed="true">Recipients</button>
          <button type="button" class="gr-seg gr-view" data-view="programs" aria-pressed="false">Programs</button>
          <button type="button" class="gr-seg gr-view" data-view="electorates" aria-pressed="false">Electorates</button>
        </div>
      </div>
      <div class="gr-field" role="group" aria-label="Donor filter">
        <span class="gr-label" aria-hidden="true">Show</span>
        <div class="gr-views">
          <button type="button" class="gr-seg gr-donors" data-donors="0" aria-pressed="true">Everyone</button>
          <button type="button" class="gr-seg gr-donors" data-donors="1" aria-pressed="false">Donors only</button>
        </div>
      </div>
      <div class="gr-field gr-field-search">
        <label class="gr-label" for="gr-q">Filter by name</label>
        <input class="gr-input gr-search" id="gr-q" type="search" autocomplete="off" placeholder="e.g. council, Anglicare, mining" />
      </div>
      <div class="gr-field gr-field-kind">
        <label class="gr-label" for="gr-kind">Kind</label>
        <select class="gr-select" id="gr-kind"><option value="">All kinds</option></select>
      </div>
      <div class="gr-field gr-field-agency">
        <label class="gr-label" for="gr-agency">Agency</label>
        <select class="gr-select" id="gr-agency"><option value="">All agencies</option></select>
      </div>
      <div class="gr-field">
        <span class="gr-label" id="gr-years-label">Financial years</span>
        <div class="gr-yearrow" role="group" aria-labelledby="gr-years-label">
          <input class="gr-input gr-year" id="gr-year-from" type="number" inputmode="numeric" placeholder="2017" aria-label="From financial year starting" />
          <span aria-hidden="true">–</span>
          <input class="gr-input gr-year" id="gr-year-to" type="number" inputmode="numeric" placeholder="2026" aria-label="To financial year starting" />
        </div>
      </div>
      <div class="gr-field">
        <label class="gr-label" for="gr-min">Min awarded</label>
        <select class="gr-select" id="gr-min">
          <option value="0">Any amount</option>
          <option value="100000">$100K+</option>
          <option value="1000000">$1M+</option>
          <option value="10000000">$10M+</option>
          <option value="100000000">$100M+</option>
        </select>
      </div>
      <div class="gr-actions">
        <button type="button" class="gr-btn" id="gr-clear" hidden>Clear filters</button>
        <button type="button" class="gr-btn gr-export" id="gr-export">Export CSV</button>
      </div>
    </div>

    <div class="gr-tiles" aria-label="Headline figures"></div>
    <div class="gr-chart" aria-label="Awarded by financial year"></div>

    <p class="gr-summary" aria-live="polite" aria-atomic="true"></p>

    <div class="gr-tablewrap" role="region" tabindex="0" aria-label="Grants table (scrollable)">
      <div class="gr-status">Opening the grants…</div>
      <table class="gr-table" hidden>
        <caption class="gr-visually-hidden"></caption>
        <thead><tr></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <p class="gr-fineprint"></p>
  `

  const $ = (sel) => root.querySelector(sel)
  const searchEl = $('#gr-q')
  const kindEl = $('#gr-kind')
  const agencyEl = $('#gr-agency')
  const yearFromEl = $('#gr-year-from')
  const yearToEl = $('#gr-year-to')
  const minEl = $('#gr-min')
  const clearBtn = $('#gr-clear')
  const exportBtn = $('#gr-export')
  const tilesEl = $('.gr-tiles')
  const chartEl = $('.gr-chart')
  const summaryEl = $('.gr-summary')
  const statusEl = $('.gr-status')
  const tableEl = $('.gr-table')
  const captionEl = $('caption')
  const headRow = $('thead tr')
  const bodyEl = $('tbody')
  const fineEl = $('.gr-fineprint')

  const hasFilters = () =>
    state.q.trim() !== '' || state.kind !== '' || state.agency !== '' || state.donors ||
    state.yearFrom != null || state.yearTo != null || state.min > 0

  // ---- rows ----------------------------------------------------------------

  function computeRows () {
    const ctx = { agencies: data.agencies, years: data.meta.years }
    let rows
    if (state.view === 'recipients') rows = filterRecipients(data.recipients, state, ctx)
    else if (state.view === 'programs') rows = filterPrograms(data.programs, state, ctx)
    else rows = filterElectorates(data.electorates, state)
    const sort = state.sort[state.view]
    return sortRows(rows, sort.key, sort.dir)
  }

  // ---- header --------------------------------------------------------------

  function renderHead () {
    headRow.textContent = ''
    for (const col of COLUMNS[state.view]) {
      const th = el('th', col.numeric ? 'gr-th-num' : null)
      th.scope = 'col'
      const btn = el('button', 'gr-sort')
      btn.type = 'button'
      btn.dataset.key = col.key
      btn.append(el('span', null, col.label), el('span', 'gr-arrow'))
      btn.querySelector('.gr-arrow').setAttribute('aria-hidden', 'true')
      th.appendChild(btn)
      headRow.appendChild(th)
    }
    syncSortMarkers()
  }

  function syncSortMarkers () {
    const sort = state.sort[state.view]
    for (const th of headRow.children) {
      const btn = th.querySelector('.gr-sort')
      const arrow = th.querySelector('.gr-arrow')
      if (btn.dataset.key === sort.key) {
        th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending')
        arrow.textContent = sort.dir === 'asc' ? '▲' : '▼'
      } else {
        th.removeAttribute('aria-sort')
        arrow.textContent = ''
      }
    }
  }

  // ---- tiles + chart -------------------------------------------------------

  function renderTiles () {
    const c = data.meta.counts
    tilesEl.textContent = ''
    const tiles = [
      [fmtMoney(c.dollars), `awarded in ${NUM.format(c.grants)} grants`],
      [NUM.format(c.recipients), 'recipients resolved to entities'],
      [NUM.format(c.donor_recipients), 'of them appear in the donor registers'],
      [`${(c.donor_share * 100).toFixed(1)}%`, `of the money, ${fmtMoney(c.donor_dollars)}, went to those donors`],
    ]
    if (state.jur === 'federal') {
      tiles.push([`${Math.round(c.abn_known_share * 100)}%`, 'of the dollars carry a recipient ABN from the award record'])
    }
    for (const [big, small] of tiles) {
      const t = el('div', 'gr-tile')
      t.append(el('b', null, big), el('span', null, small))
      tilesEl.appendChild(t)
    }
  }

  function renderChart () {
    chartEl.textContent = ''
    // Awards published later can carry start dates years earlier (and agreements
    // run years ahead), so the chart shows the years that carry the money:
    // meta.chart_years, else any year with at least 1% of the biggest one.
    const maxAll = Math.max(...data.meta.years.map((fy) => (data.years[fy] || {}).t || 0)) || 1
    const years = (data.meta.chart_years || data.meta.years.filter((fy) => ((data.years[fy] || {}).t || 0) >= maxAll * 0.01))
      .filter((fy) => data.years[fy])
    if (!years.length) return
    const W = 720
    const H = 150
    const padL = 6
    const padB = 22
    const padT = 16
    const gap = 6
    const bw = (W - padL * 2 - gap * (years.length - 1)) / years.length
    const max = Math.max(...years.map((fy) => data.years[fy].t)) || 1
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', 'Dollars awarded by financial year, with the share that went to recipients found in the donor registers')
    years.forEach((fy, i) => {
      const y = data.years[fy]
      const x = padL + i * (bw + gap)
      const h = (H - padB - padT) * (y.t / max)
      const bar = document.createElementNS(svgNS, 'rect')
      bar.setAttribute('class', 'gr-bar')
      bar.setAttribute('x', x); bar.setAttribute('y', H - padB - h)
      bar.setAttribute('width', bw); bar.setAttribute('height', Math.max(h, 0.5))
      const t = document.createElementNS(svgNS, 'title')
      t.textContent = `${fy}: ${AUD_FULL.format(y.t)} in ${NUM.format(y.c)} grants; ${AUD_FULL.format(y.dt)} to recipients in the donor registers`
      bar.appendChild(t)
      svg.appendChild(bar)
      const dh = (H - padB - padT) * (y.dt / max)
      if (dh > 0) {
        const d = document.createElementNS(svgNS, 'rect')
        d.setAttribute('class', 'gr-bar-donor')
        d.setAttribute('x', x); d.setAttribute('y', H - padB - dh)
        d.setAttribute('width', bw); d.setAttribute('height', dh)
        svg.appendChild(d)
      }
      const val = document.createElementNS(svgNS, 'text')
      val.setAttribute('class', 'gr-val')
      val.setAttribute('x', x + bw / 2); val.setAttribute('y', H - padB - h - 4)
      val.setAttribute('text-anchor', 'middle')
      val.textContent = fmtMoney(y.t)
      svg.appendChild(val)
      const lab = document.createElementNS(svgNS, 'text')
      lab.setAttribute('class', 'gr-axis')
      lab.setAttribute('x', x + bw / 2); lab.setAttribute('y', H - 6)
      lab.setAttribute('text-anchor', 'middle')
      lab.textContent = fyShort(fy)
      svg.appendChild(lab)
    })
    chartEl.appendChild(svg)

    // the government of the day, as a legend line rather than a colour on the bars
    const gov = el('div', 'gr-gov')
    const leg1 = el('span', 'gr-legend')
    leg1.append(el('i'), document.createTextNode('awarded'))
    const leg2 = el('span', 'gr-legend')
    leg2.append(el('i', 'gr-solid'), document.createTextNode('to recipients in the donor registers'))
    gov.append(leg1, leg2)
    const govLine = el('span', null, 'In government: ')
    for (const [from, to, bloc] of data.meta.government || []) {
      govLine.append(partyChip(bloc), document.createTextNode(` ${from.slice(0, 7)} to ${to ? to.slice(0, 7) : 'now'}  `))
    }
    gov.appendChild(govLine)
    chartEl.appendChild(gov)
  }

  // ---- body ----------------------------------------------------------------

  function agencyName (i) {
    return data.agencies[i] || 'Agency not recorded'
  }

  function renderRecipientRow (tr, r) {
    const nameTd = tr.appendChild(el('td'))
    const btn = el('button', 'gr-open', r.n)
    btn.type = 'button'
    btn.dataset.id = r.id
    btn.setAttribute('aria-expanded', state.open === r.id ? 'true' : 'false')
    nameTd.appendChild(btn)
    tr.appendChild(el('td', null, kindLabel(r.k)))
    tr.appendChild(moneyCell(r.wt))
    tr.appendChild(el('td', 'gr-num', NUM.format(r.wc)))
    tr.appendChild(el('td', 'gr-num', yearsText(r.wy0, r.wy1)))
    tr.appendChild(el('td', null, agencyName((r.ag || [])[0])))
    const dTd = tr.appendChild(el('td', 'gr-num'))
    if (r.ds) {
      const wrap = el('span', 'gr-donor-cell')
      if (r.ds.aec > 0) {
        wrap.append(el('span', null, `AEC ${fmtMoney(r.ds.aec)}`))
        if (r.ds.topParty) {
          wrap.append(partyChip(r.ds.topParty, { full: false }))
          wrap.append(el('span', 'gr-share', `${Math.round(r.ds.topShare * 100)}%`))
        }
      }
      if (r.ds.state > 0) wrap.append(el('span', r.ds.aec > 0 ? 'gr-share' : null, `state ${fmtMoney(r.ds.state)}`))
      if (r.ds.aec === 0 && r.ds.state === 0) wrap.append(el('span', 'gr-share', 'in register, no party gifts'))
      dTd.appendChild(wrap)
    } else {
      dTd.appendChild(el('span', 'gr-muted', '—'))
    }
  }

  function renderProgramRow (tr, r) {
    tr.appendChild(el('td', null, r.n))
    tr.appendChild(el('td', null, agencyName(r.ag)))
    tr.appendChild(moneyCell(r.t))
    tr.appendChild(el('td', 'gr-num', NUM.format(r.c)))
    tr.appendChild(el('td', 'gr-num', NUM.format(r.r)))
    const s = tr.appendChild(el('td', 'gr-num'))
    if (r.dt > 0) {
      const bar = el('span', 'gr-bar-cell')
      bar.style.width = `${Math.max(2, Math.round(r.share * 60))}px`
      s.append(bar, document.createTextNode(`${fmtMoney(r.dt)} `), el('span', 'gr-share', `${Math.round(r.share * 100)}%`))
    } else s.appendChild(el('span', 'gr-muted', '—'))
    tr.appendChild(moneyCell(r.adhoc))
  }

  function renderElectorateRow (tr, r) {
    const n = tr.appendChild(el('td'))
    n.append(el('span', null, r.n), document.createTextNode(' '), el('span', 'gr-muted', (r.st || '').toUpperCase()))
    tr.appendChild(moneyCell(r.t))
    tr.appendChild(el('td', 'gr-num', NUM.format(r.c)))
    const s = tr.appendChild(el('td', 'gr-num'))
    if (r.dt > 0) {
      const bar = el('span', 'gr-bar-cell')
      bar.style.width = `${Math.max(2, Math.round(r.share * 60))}px`
      s.append(bar, document.createTextNode(`${fmtMoney(r.dt)} `), el('span', 'gr-share', `${Math.round(r.share * 100)}%`))
    } else s.appendChild(el('span', 'gr-muted', '—'))
    tr.appendChild(moneyCell(r.adhoc))
    const held = tr.appendChild(el('td'))
    const mps = el('span', 'gr-mps')
    for (const m of (r.mps || []).slice(-3)) {
      const chip = partyChip(m[1] || 'Independent')
      chip.textContent = ''
      const dot = el('i'); dot.setAttribute('aria-hidden', 'true')
      chip.append(dot, link(subjectHash('person', m[0]), m[0]))
      if (m[2] || m[3]) chip.append(el('span', 'gr-share', ` ${m[2] ? m[2].slice(0, 4) : ''}–${m[3] ? m[3].slice(0, 4) : ''}`))
      mps.appendChild(chip)
    }
    if (!(r.mps || []).length) mps.appendChild(el('span', 'gr-muted', '—'))
    held.appendChild(mps)
    const mg = tr.appendChild(el('td', 'gr-num'))
    if (r.marginLatest) {
      mg.append(el('span', null, `${r.marginLatest.pct}% `), partyChip(r.marginLatest.party, { full: false }),
        el('span', 'gr-share', ` ${String(r.marginLatest.type || '').replace(/_/g, ' ')} · ${r.marginLatest.year}`))
    } else mg.appendChild(el('span', 'gr-muted', '—'))
  }

  function render () {
    const rows = computeRows()
    currentRows = rows
    const frag = document.createDocumentFragment()
    const renderCells = state.view === 'recipients' ? renderRecipientRow
      : state.view === 'programs' ? renderProgramRow : renderElectorateRow
    for (const r of rows) {
      const tr = el('tr', 'gr-row')
      renderCells(tr, r)
      frag.appendChild(tr)
      if (state.view === 'recipients' && state.open === r.id) frag.appendChild(detailRow(r))
    }
    if (rows.length === 0) {
      const tr = el('tr')
      const td = el('td', 'gr-empty', state.view === 'electorates' && !data.electorates.length
        ? 'No electorates yet: the award records that carry a location are still being fetched.'
        : 'Nothing matches these filters.')
      td.colSpan = COLUMNS[state.view].length
      tr.appendChild(td)
      frag.appendChild(tr)
    }
    bodyEl.textContent = ''
    bodyEl.appendChild(frag)

    const shown = rows.reduce((s, r) => s + (r.wt ?? r.t), 0)
    const donorShown = rows.reduce((s, r) => s + (state.view === 'recipients' ? (r.ds ? (r.wt ?? r.t) : 0) : (r.dt || 0)), 0)
    summaryEl.textContent = ''
    const noun = state.view === 'recipients' ? 'recipients' : state.view === 'programs' ? 'programs' : 'divisions'
    summaryEl.appendChild(el('b', null, `${NUM.format(rows.length)} ${noun} · ${fmtMoney(shown)}`))
    summaryEl.appendChild(document.createTextNode(
      shown > 0 ? ` shown, of which ${fmtMoney(donorShown)} (${Math.round(donorShown / shown * 100)}%) went to recipients in the donor registers` : ' shown'))
    if (state.view === 'recipients') {
      const c = data.meta.counts
      summaryEl.appendChild(document.createTextNode(
        ` · the ${NUM.format(c.top_listed)} largest recipients and every donor among them are listed, out of ${NUM.format(c.recipients)}`))
    }
    captionEl.textContent = state.view === 'recipients'
      ? 'Grant recipients matching the current filters'
      : state.view === 'programs' ? 'Grant programs matching the current filters' : 'Electorates matching the current filters'
    clearBtn.hidden = !hasFilters()
  }

  // ---- recipient file (detail row) -----------------------------------------

  function detailRow (r) {
    const tr = el('tr', 'gr-detail')
    const td = el('td')
    td.colSpan = COLUMNS.recipients.length
    td.appendChild(el('div', 'gr-status', 'Opening the file…'))
    tr.appendChild(td)
    loadDetail(r).then((d) => {
      if (state.open !== r.id || !tr.isConnected) return
      td.textContent = ''
      renderDetail(td, r, d)
    }).catch(() => {
      if (!tr.isConnected) return
      td.textContent = ''
      td.appendChild(el('div', 'gr-status', 'The file could not be opened.'))
    })
    return tr
  }

  async function loadDetail (r) {
    const shard = `${state.jur}/shard-${String(r.sh).padStart(2, '0')}`
    let bundle = detailCache.get(shard)
    if (!bundle) {
      const res = await fetch(`${JURISDICTIONS[state.jur].dir}shard-${String(r.sh).padStart(2, '0')}.json`, { signal: aborter.signal })
      if (!res.ok) throw new Error(`${res.status}`)
      bundle = await res.json()
      detailCache.set(shard, bundle)
    }
    const d = bundle[r.f]
    if (!d) throw new Error('missing')
    return d
  }

  function renderDetail (td, r, d) {
    const head = el('div', 'gr-detail-head')
    head.append(el('h3', null, d.n), el('span', 'gr-muted', kindLabel(d.k)))
    td.appendChild(head)

    const meta = el('p', 'gr-detail-meta')
    const bits = []
    if (d.abn) bits.push(`ABN ${formatABN(d.abn)}`)
    if (d.abr && d.abr.name && d.abr.name.toLowerCase() !== d.n.toLowerCase()) bits.push(`registered as ${d.abr.name}`)
    if (d.abr && d.abr.status && d.abr.status !== 'ACT') bits.push('ABN cancelled')
    if (d.abr && d.abr.state) bits.push(`${d.abr.state}${d.abr.postcode ? ' ' + d.abr.postcode : ''}`)
    if (d.aliases && d.aliases.length) bits.push(`also recorded as ${d.aliases.slice(0, 4).join('; ')}${d.aliases.length > 4 ? ` and ${d.aliases.length - 4} more` : ''}`)
    meta.textContent = bits.join(' · ')
    if (bits.length) td.appendChild(meta)

    const tiles = el('div', 'gr-tiles')
    const tile = (big, small) => { const t = el('div', 'gr-tile'); t.append(el('b', null, big), el('span', null, small)); return t }
    tiles.append(
      tile(fmtMoney(d.t), `awarded in ${NUM.format(d.c)} ${state.jur === 'qld' ? 'funding lines' : 'grants'}`),
      tile(yearsText(d.y0, d.y1), 'financial years'),
      tile(d.t > 0 ? `${Math.round((d.adhoc || 0) / d.t * 100)}%` : '—', 'ad hoc or one-off'),
    )
    if (d.sel) {
      const top = Object.entries(d.sel).sort((a, b) => b[1] - a[1])[0]
      if (top) tiles.append(tile(`${Math.round(top[1] / d.t * 100)}%`, `${top[0].toLowerCase()} (selection process where recorded)`))
    }
    td.appendChild(tiles)

    const cols = el('div', 'gr-cols')
    // left: grants
    const left = el('div')
    left.appendChild(el('p', 'gr-kicker', d.more > 0 ? `Largest ${NUM.format(d.grants.length)} of ${NUM.format(d.c)} grants` : 'Grants, largest first'))
    const table = el('table', 'gr-grants')
    const tb = el('tbody')
    for (const g of d.grants) {
      const row = el('tr')
      const v = el('td', 'gr-num', fmtMoney(g.v))
      v.title = AUD_FULL.format(g.v || 0)
      row.appendChild(v)
      const what = el('td')
      const url = state.jur === 'federal'
        ? (g.guid ? `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(g.guid)}`
          : `https://www.grants.gov.au/Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId=${encodeURIComponent(g.id)}`)
        : null
      if (url) {
        const a = link(url, g.n || g.pr || g.id)
        a.target = '_blank'
        a.rel = 'noopener'
        what.appendChild(a)
      } else what.appendChild(el('span', null, g.n || g.pr || g.id))
      if (g.desc) what.appendChild(el('small', null, g.desc))
      const sub = []
      if (g.pr && g.pr !== g.n) sub.push(g.pr)
      if (g.ag) sub.push(g.ag)
      if (g.cat) sub.push(g.cat)
      const flags = []
      if (g.sel) flags.push(g.sel)
      if (g.adhoc) flags.push('ad hoc / one-off')
      if (g.el) flags.push(`${g.el} electorate`)
      if (sub.length) what.appendChild(el('small', null, sub.join(' · ')))
      if (flags.length) what.appendChild(el('small', null, flags.join(' · ')))
      row.appendChild(what)
      row.appendChild(el('td', 'gr-num', g.fy ? fyShort(g.fy) : (g.s || '').slice(0, 4)))
      tb.appendChild(row)
    }
    table.appendChild(tb)
    left.appendChild(table)
    if (d.programs && d.programs.length > 1) {
      left.appendChild(el('p', 'gr-kicker', 'By program'))
      const ul = el('ul', 'gr-partylist')
      for (const [p, v] of d.programs.slice(0, 6)) {
        const li = el('li')
        li.append(el('span', null, p), el('span', 'gr-num', fmtMoney(v)))
        ul.appendChild(li)
      }
      left.appendChild(ul)
    }
    cols.appendChild(left)

    // right: the donor side
    const right = el('div')
    right.appendChild(el('p', 'gr-kicker', 'In the donor registers'))
    const box = el('div', 'gr-donor')
    if (d.d) {
      const p = el('p')
      p.append(document.createTextNode('Listed as '), link(subjectHash('donor', d.d.n), d.d.n))
      p.append(document.createTextNode(d.d.m === 'abn' ? ' (matched by ABN).' : d.d.m === 'abr_name' ? ' (matched through a registered business name).' : ' (matched by name).'))
      box.appendChild(p)
      const blocs = donorBlocs(d.d, data.meta.blocs)
      if (d.d.aec > 0) {
        box.appendChild(el('p', null, `AEC returns: ${fmtMoney(d.d.aec)} disclosed${d.d.y0 ? `, ${d.d.y0}–${d.d.y1 || d.d.y0}` : ''}`))
        const ul = el('ul', 'gr-partylist')
        for (const [party, v] of Object.entries(d.d.p || {}).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
          const li = el('li')
          li.append(partyChip(party), el('span', 'gr-num', fmtMoney(v)))
          ul.appendChild(li)
        }
        box.appendChild(ul)
      }
      for (const [jur, st] of Object.entries(d.d.st || {})) {
        box.appendChild(el('p', null, `${STATE_REGISTERS[jur] || jur}: ${fmtMoney(st.t)} in ${NUM.format(st.c)} gifts`))
        const ul = el('ul', 'gr-partylist')
        for (const [party, v] of Object.entries(st.p || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
          const li = el('li')
          li.append(partyChip(party), el('span', 'gr-num', fmtMoney(v)))
          ul.appendChild(li)
        }
        box.appendChild(ul)
      }
      if (!(d.d.aec > 0) && !Object.keys(d.d.st || {}).length) {
        box.appendChild(el('p', null, 'In the register, but with no gifts to a party in the exposed returns (a third party, an associated entity, or gifts below the thresholds).'))
      }
      if (blocs.size) {
        const gs = govShare(d.grants, data.meta.government, new Set(blocs.keys()))
        const note = el('p', 'gr-note')
        const blocNames = [...blocs.keys()]
        note.textContent = `${Math.round(gs.share * 100)}% of the grant dollars shown here (${fmtMoney(gs.dollars)}) were awarded while a party it has given to (${blocNames.join(', ')}) was in ${state.jur === 'qld' ? 'government in Queensland' : 'government federally'}. That is a fact about timing, not a finding: most programs are open and competitive.`
        box.appendChild(note)
      }
      if (Object.keys(d.d.st || {}).length && d.d.aec > 0) {
        box.appendChild(el('p', 'gr-note', 'AEC and state figures are not summed: AEC returns already include state branch receipts.'))
      }
    } else {
      box.appendChild(el('p', null, d.k === 'individual'
        ? 'People are never matched to the donor registers by name.'
        : d.k === 'government' || d.k === 'council' || d.k === 'university'
          ? 'Public bodies are not matched to the donor registers.'
          : 'Not found in the donor registers under this name or ABN. Donations under the disclosure thresholds are never reported, so absence here is not proof of none.'))
    }
    right.appendChild(box)
    if (d.other) {
      const o = el('p', 'gr-note')
      o.textContent = `Also received ${fmtMoney(d.other.t)} in ${NUM.format(d.other.c)} ${d.other.jur === 'qld' ? 'Queensland funding lines' : 'Commonwealth grants'}. `
      const b = el('button', 'gr-open', `Open its ${JURISDICTIONS[d.other.jur].label} file`)
      b.type = 'button'
      b.addEventListener('click', () => { state.open = r.id; state.q = d.n; searchEl.value = d.n; load(d.other.jur) })
      o.appendChild(b)
      right.appendChild(o)
    }
    const links = el('div', 'gr-links')
    links.appendChild(link(searchHash(`"${d.n}"`, {}), 'Search the record for them', 'gr-primary'))
    if (d.d) links.appendChild(link(subjectHash('donor', d.d.n), 'Donor entry'))
    const src = link(data.meta.source_url, state.jur === 'qld' ? 'Source: data.qld.gov.au' : 'Source: GrantConnect')
    src.target = '_blank'
    src.rel = 'noopener'
    links.appendChild(src)
    right.appendChild(links)
    cols.appendChild(right)
    td.appendChild(cols)
  }

  // ---- CSV -----------------------------------------------------------------

  function describeFilters () {
    const parts = []
    if (state.q.trim()) parts.push(`text ~ "${state.q.trim()}"`)
    if (state.kind) parts.push(`kind = ${kindLabel(state.kind)}`)
    if (state.agency !== '') parts.push(`agency = ${agencyName(Number(state.agency))}`)
    if (state.donors) parts.push('donors only')
    if (state.yearFrom != null || state.yearTo != null) parts.push(`financial years starting ${state.yearFrom ?? '…'}–${state.yearTo ?? '…'}`)
    if (state.min > 0) parts.push(`min awarded ${AUD_FULL.format(state.min)}`)
    return parts.length ? parts.join('; ') : 'none'
  }

  function exportCSV () {
    const m = data.meta
    const sort = state.sort[state.view]
    const comments = [
      `OPAX — Who gets the grants: ${state.view}`,
      `Source: ${m.source} (${m.coverage}), via opax.com.au${JURISDICTIONS[state.jur].file}`,
      `Exported ${new Date().toISOString().slice(0, 10)} · ${currentRows.length} rows · filters: ${describeFilters()} · sorted by ${sort.key} ${sort.dir}`,
      ...m.caveats,
      `Licence: ${m.licence}`,
    ]
    const csv = buildCSV(state.view, currentRows, { agencies: data.agencies }, comments)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `opax-grants-${state.jur}-${state.view}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  // ---- events --------------------------------------------------------------

  searchEl.addEventListener('input', () => { state.q = searchEl.value; render() })
  kindEl.addEventListener('change', () => { state.kind = kindEl.value; render() })
  agencyEl.addEventListener('change', () => { state.agency = agencyEl.value; render() })
  minEl.addEventListener('change', () => { state.min = Number(minEl.value) || 0; render() })
  const readYear = (input) => {
    const n = Number.parseInt(input.value, 10)
    return Number.isFinite(n) ? n : null
  }
  yearFromEl.addEventListener('input', () => { state.yearFrom = readYear(yearFromEl); render() })
  yearToEl.addEventListener('input', () => { state.yearTo = readYear(yearToEl); render() })
  clearBtn.addEventListener('click', () => {
    state.q = ''; searchEl.value = ''
    state.kind = ''; kindEl.value = ''
    state.agency = ''; agencyEl.value = ''
    state.donors = false
    for (const b of root.querySelectorAll('.gr-donors')) b.setAttribute('aria-pressed', b.dataset.donors === '0' ? 'true' : 'false')
    state.yearFrom = null; yearFromEl.value = ''
    state.yearTo = null; yearToEl.value = ''
    state.min = 0; minEl.value = '0'
    render()
    searchEl.focus()
  })
  exportBtn.addEventListener('click', exportCSV)
  for (const btn of root.querySelectorAll('.gr-jur')) {
    btn.addEventListener('click', () => { if (state.jur !== btn.dataset.jur) load(btn.dataset.jur) })
  }
  for (const btn of root.querySelectorAll('.gr-view')) {
    btn.addEventListener('click', () => {
      if (state.view === btn.dataset.view) return
      state.view = btn.dataset.view
      for (const b of root.querySelectorAll('.gr-view')) b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')
      // kind and agency filters only mean something on the views that carry them
      root.querySelector('.gr-field-kind').hidden = state.view !== 'recipients'
      root.querySelector('.gr-field-agency').hidden = state.view === 'electorates'
      renderHead()
      render()
    })
  }
  for (const btn of root.querySelectorAll('.gr-donors')) {
    btn.addEventListener('click', () => {
      state.donors = btn.dataset.donors === '1'
      for (const b of root.querySelectorAll('.gr-donors')) b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')
      render()
    })
  }
  headRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.gr-sort')
    if (!btn) return
    const sort = state.sort[state.view]
    const col = COLUMNS[state.view].find((c) => c.key === btn.dataset.key)
    if (sort.key === col.key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
    else { sort.key = col.key; sort.dir = col.numeric ? 'desc' : 'asc' }
    syncSortMarkers()
    render()
  })
  bodyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.gr-open[data-id]')
    if (!btn) return
    const id = btn.dataset.id
    state.open = state.open === id ? null : id
    render()
    if (state.open) {
      const opened = bodyEl.querySelector(`.gr-open[data-id="${CSS.escape(id)}"]`)
      opened?.focus()
    }
  })

  // ---- data ----------------------------------------------------------------

  function populateSelects () {
    kindEl.length = 1
    agencyEl.length = 1
    for (const [k, v] of Object.entries(data.kinds || {})) {
      if (k === 'undisclosed') continue
      const opt = el('option', null, `${kindLabel(k)} (${NUM.format(v.r)})`)
      opt.value = k
      kindEl.appendChild(opt)
    }
    data.agencies.slice(0, 60).forEach((a, i) => {
      const opt = el('option', null, a)
      opt.value = String(i)
      agencyEl.appendChild(opt)
    })
    if (![...kindEl.options].some((o) => o.value === state.kind)) state.kind = ''
    kindEl.value = state.kind
    if (![...agencyEl.options].some((o) => o.value === state.agency)) state.agency = ''
    agencyEl.value = state.agency
    const ys = data.meta.years.map(fyStart).filter((y) => y != null)
    if (ys.length) {
      yearFromEl.placeholder = String(Math.min(...ys))
      yearToEl.placeholder = String(Math.max(...ys))
      yearFromEl.min = yearToEl.min = String(Math.min(...ys))
      yearFromEl.max = yearToEl.max = String(Math.max(...ys))
    }
  }

  function renderFineprint () {
    const m = data.meta
    fineEl.textContent = `${m.source}, ${m.coverage}. ${m.threshold} ${m.caveats.join(' ')} Licence: ${m.licence}. `
    const methods = link('/methods', 'Methodology')
    const raw = link(JURISDICTIONS[state.jur].file, 'Raw data')
    fineEl.append(methods, ' · ', raw)
  }

  async function fetchIndex (jur) {
    if (cache.has(jur)) return cache.get(jur)
    const url = JURISDICTIONS[jur].file
    const res = await fetch(url, { signal: aborter.signal })
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    const d = await res.json()
    cache.set(jur, d)
    return d
  }

  async function load (jur = state.jur) {
    state.jur = JURISDICTIONS[jur] ? jur : 'federal'
    for (const b of root.querySelectorAll('.gr-jur')) b.setAttribute('aria-pressed', b.dataset.jur === state.jur ? 'true' : 'false')
    const token = ++loadSeq
    statusEl.hidden = false
    statusEl.textContent = 'Opening the grants…'
    tableEl.hidden = true
    try {
      const d = await fetchIndex(state.jur)
      if (token !== loadSeq) return
      data = d
      populateSelects()
      renderTiles()
      renderChart()
      renderFineprint()
      statusEl.hidden = true
      tableEl.hidden = false
      root.querySelector('.gr-field-kind').hidden = state.view !== 'recipients'
      root.querySelector('.gr-field-agency').hidden = state.view === 'electorates'
      renderHead()
      render()
    } catch (err) {
      if (aborter.signal.aborted || token !== loadSeq) return
      statusEl.hidden = false
      statusEl.textContent = 'The grants could not be loaded.'
      const retry = el('button', 'gr-btn', 'Try again')
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
