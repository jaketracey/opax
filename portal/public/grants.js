import {subjectUrl} from './canonical-urls.js?v=225d5915ea';
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
 *   GET /grants/<jur>/shard-NN.json    recipient files, bundled by shard: each
 *                                      one's grants, ABR record, donor-register
 *                                      entity and its donations
 *   GET /grants/<jur>/programs/<key>.json  one grant program: its grants with
 *                                      the seat, holder, bloc and margin at the
 *                                      grant date, selection processes, seat
 *                                      split, election timing, top recipients
 *   GET /grants/program-notes.json     optional: selection-process definitions,
 *                                      per-program summaries and audit findings
 * Each index carries: meta (source, licence, caveats, counts, the government of
 * the day by date, party blocs, election dates), agencies[] and categories[]
 * (referenced by index), recipients[] (the largest by dollars plus every donor
 * among them), programs[] (with key, cnc/selk and, federally, gov/elk/marg),
 * electorates[], years{}, kinds{}.
 *
 * Four views over one filtered set:
 *   Recipients  — one row per recipient; a row opens the recipient's file in place
 *   Programs    — one row per grant program / opportunity, with the share of its
 *                 dollars that went to recipients found in the donor registers,
 *                 the closed non-competitive share and the share to government-
 *                 held seats; a row opens the program's file in place
 *   Program     — the opened program file: tiles, seat split, by-year chart,
 *                 margins, election timing, top recipients, electorates, grants
 *   Electorates — one row per federal division, with the members who held it and
 *                 the seat's margin, for the pork-barrel question
 * Deep links: ?open=<recipient id> and ?program=<program id>, with ?jur=.
 *
 * Honesty rules: a recipient is "a donor" only when its ABN or a unique
 * organisation name matches the donor register (people are never matched by
 * name); AEC and state-register money are shown side by side and never
 * summed; a donor receiving a grant is a fact, not a finding, and the
 * selection process is shown wherever the source records it. Bars are
 * bronze/ink; party identity is only ever a dot plus text. Every live string
 * reaches the DOM through textContent.
 */

import { shortDate, shortMoney as fmtMoney } from './format.js'

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
/** A party's name (or the code a register writes), lowercased, to [its dot's
 *  colour class, the short name a dense cell shows]. Sentence case: a code
 *  stays only where it is the name people use (LNP, CLP, KAP, UAP). */
const PARTY_MAP = {
  labor: ['alp', 'Labor'], 'australian labor party': ['alp', 'Labor'], alp: ['alp', 'Labor'], 'a.l.p.': ['alp', 'Labor'],
  liberal: ['lib', 'Liberal'], 'liberal party': ['lib', 'Liberal'], lp: ['lib', 'Liberal'], lib: ['lib', 'Liberal'],
  nationals: ['nat', 'Nationals'], 'national party': ['nat', 'Nationals'], 'the nationals': ['nat', 'Nationals'], nat: ['nat', 'Nationals'], nats: ['nat', 'Nationals'],
  lnp: ['lnp', 'LNP'], 'liberal national party': ['lnp', 'LNP'], 'country liberal party': ['nat', 'CLP'], clp: ['nat', 'CLP'],
  greens: ['grn', 'Greens'], 'australian greens': ['grn', 'Greens'], 'the greens': ['grn', 'Greens'], 'queensland greens': ['grn', 'Greens'],
  'one nation': ['onp', 'One Nation'], "pauline hanson's one nation": ['onp', 'One Nation'],
  independent: ['ind', 'Independent'], 'centre alliance': ['oth', 'Centre Alliance'], "katter's australian party": ['oth', 'KAP'], kap: ['oth', 'KAP'],
  'united australia party': ['oth', 'UAP'], uap: ['oth', 'UAP'], 'family first': ['oth', 'Family First'], 'animal justice party': ['oth', 'Animal Justice'],
  'legalise cannabis': ['oth', 'Legalise Cannabis'], coalition: ['lib', 'Coalition'],
}

/** The shared short form (format.js), under the name the grants modules use. */
export { fmtMoney }

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

export function grantRecipientUrl (jurisdiction, id) {
  if (![jurisdiction, id].every(value => typeof value === 'string' && value.trim() && !/^(null|undefined)$/i.test(value.trim()))) return null
  return `/money/grants/${encodeURIComponent(jurisdiction)}/recipient/${encodeURIComponent(id)}`
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

/** Mirror of export_grants.py program key: 'GO3141' -> 'go3141', 'activity:Some title' -> 'activity-some-title'. */
export function programKey (id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '')
}

/** num/den, or null when the denominator is nothing (so the UI can say "not recorded" rather than 0%). */
export function shareOf (num, den) {
  return den > 0 ? (num || 0) / den : null
}

/**
 * The closed non-competitive share of recorded dollars and, federally, the
 * share of the dollars in seats with a member on the grant date that went to
 * government-held seats. A vacant seat is nobody's, so its dollars leave the
 * denominator like unmapped dollars (`held`, since 30 Sep 2026; an older index
 * without it falls back to `elk`); a program with no held-seat dollars has no
 * share at all, never 0%.
 */
export function programShares (row) {
  const held = row.held != null ? row.held : row.elk
  return {
    cnc: shareOf(row.cnc, row.selk),
    gov: row.gov == null || held == null ? null : shareOf(row.gov, held),
  }
}

/** Dollars in seats with a member on the grant date, from a program file's seat split. */
export function heldDollars (seats) {
  if (!seats) return 0
  return ['gov', 'opp', 'cross'].reduce((sum, k) => sum + ((seats[k] || [0])[0] || 0), 0)
}

/** Index programs[] rows by name, for the recipient file's program list; only rows with a file (a key) count. */
export function programByName (programs) {
  const out = new Map()
  for (const p of programs || []) if (p.key && !out.has(p.n)) out.set(p.n, p)
  return out
}

/**
 * The program row an address asks for. Links carry the id as the register
 * prints it (GO6047), the file key (go6047) or any other casing, so an exact
 * match wins and otherwise the program key decides; null when none matches.
 */
export function resolveProgramId (programs, id) {
  if (!id) return null
  const rows = programs || []
  if (rows.some((p) => p.id === id)) return id
  const key = programKey(id)
  const hit = rows.find((p) => (p.key || programKey(p.id)) === key)
  return hit ? hit.id : null
}

/** The grant date the program file's seat, holder and timing fields were computed on. */
export function grantDate (g) {
  return g.s || g.a || ''
}

export function grantConnectUrl (guid) {
  return guid ? `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(guid)}` : null
}

// Fixed orderings for the program file's [dollars, count] buckets; the labels are the UI text.
export const SEAT_BLOCS = [
  ['gov', 'Government-held seats'], ['opp', 'Opposition-held seats'], ['cross', 'Crossbench seats'], ['vacant', 'Vacant seat'], ['unknown', 'Seat unknown'],
]
export const MARGIN_BUCKETS = [
  ['marginal', 'Marginal (under 6%)'], ['fairly_safe', 'Fairly safe (6 to 10%)'], ['safe', 'Safe (over 10%)'], ['unknown', 'Margin unknown'],
]
export const TIMING_BUCKETS = [
  ['0_3', 'Within 3 months of an election'], ['3_6', '3 to 6 months before'], ['6_12', '6 to 12 months before'],
  ['12_24', '12 to 24 months before'], ['over_24', 'More than 2 years before'], ['unknown', 'No later election on record'],
]
export const APPROVAL_BUCKETS = [
  ['before_approval', 'Started before approval'], ['0_30', 'Within 30 days of approval'], ['31_90', '31 to 90 days'],
  ['91_365', '91 days to a year'], ['over_365', 'More than a year'],
]

/**
 * A program as the daily edition tells it (/social/programs.json): the program
 * file with `told` attached for the "By the party holding the seat" block. The
 * file's own seat figures stand (the export reads each member's party on the
 * grant date); `told` adds the three-group split and the House baseline. The
 * program file unchanged when the program was not told by seat.
 */
export function withToldSeats (p, told) {
  if (!p || !told || !told.mapped || !(told.mapped[0] > 0) || !Array.isArray(told.split)) return p
  return { ...p, told }
}

/**
 * A {key: [dollars, count]} map as ordered rows with shares of the map's own
 * total. Buckets missing from the map are skipped; empty ones are kept so the
 * reader sees the zero.
 */
export function bucketRows (map, order) {
  if (!map) return []
  const total = order.reduce((s, [k]) => s + ((map[k] || [0, 0])[0] || 0), 0)
  return order.filter(([k]) => map[k]).map(([k, label]) => {
    const [d, c] = map[k]
    return { key: k, label, d: d || 0, c: c || 0, share: total > 0 ? (d || 0) / total : 0 }
  })
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
  }).map((r) => {
    const s = programShares(r)
    return { ...r, share: r.t > 0 ? r.dt / r.t : 0, cncS: s.cnc, govS: s.gov }
  })
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
      case 'cnc': return r.cncS ?? -1   // a program with no selection process recorded sorts below 0%
      case 'gov': return r.govS ?? -1
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
    lines.push(['Program', 'Program id', 'Agency', 'Awarded (AUD)', 'Grants', 'Recipients', 'To recipients in the donor registers (AUD)',
      'Share (%)', 'Ad hoc or one-off (AUD)', 'Closed non-competitive (AUD)', 'Selection process recorded (AUD)',
      'Closed non-competitive share (%)', 'To government-held seats (AUD)', 'Electorate mapped (AUD)',
      'To government-held seats share (%)', 'First year', 'Last year'].join(','))
    for (const r of rows) {
      const s = programShares(r)
      lines.push([csvCell(r.n), csvCell(r.id || ''), csvCell(ctx.agencies[r.ag] || ''), r.t, r.c, r.r, r.dt, Math.round(r.share * 100),
        r.adhoc, r.cnc ?? '', r.selk ?? '', s.cnc == null ? '' : Math.round(s.cnc * 100),
        r.gov ?? '', r.elk ?? '', s.gov == null ? '' : Math.round(s.gov * 100),
        csvCell(r.y0 || ''), csvCell(r.y1 || '')].join(','))
    }
  } else if (view === 'program') {
    // rows are the program file's grants[]
    lines.push(['Grant id', 'Title', 'Recipient', 'Recipient id', 'Recipient kind', 'Value (AUD)', 'Financial year', 'Start date',
      'Approval date', 'Selection process', 'Electorate', 'State', 'Seat holder', 'Holder party', 'Seat bloc', 'Seat margin',
      'Ad hoc or one-off', 'GrantConnect'].join(','))
    for (const g of rows) {
      lines.push([csvCell(g.id), csvCell(g.n || ''), csvCell(g.rn || ''), csvCell(g.rid || ''), csvCell(kindLabel(g.k)), Math.round(g.v || 0),
        csvCell(g.fy || ''), csvCell(g.s || ''), csvCell(g.a || ''), csvCell(g.sel || ''), csvCell(g.el || ''),
        csvCell((g.elst || '').toUpperCase()), csvCell(g.holder ? g.holder[0] : ''), csvCell(g.holder ? g.holder[1] : ''),
        csvCell(g.bloc || ''), csvCell(g.mt || ''), g.adhoc ? 1 : 0, csvCell(grantConnectUrl(g.guid) || '')].join(','))
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
    { key: 'cnc', label: 'Closed non-competitive', numeric: true },
    { key: 'gov', label: 'To govt seats', numeric: true, federal: true },
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

/** The columns a view shows in a jurisdiction: seat columns are federal only (QLD money is mapped to federal divisions). */
export function viewColumns (view, jur) {
  return (COLUMNS[view] || []).filter((c) => !c.federal || jur === 'federal')
}

// ---------------------------------------------------------------------------
// Styles — .gr- prefix, site tokens (no fallbacks: every host page loads
// tokens.css or style.css), light-only. Buttons, chips, fields, the segmented
// controls and the labels are the shared ui-* classes (ui-controls.css); this
// block only lays them out.
// ---------------------------------------------------------------------------

const CSS = `
.gr-root { font-family: var(--sans); color: var(--ink); }
.gr-root [hidden] { display: none !important; }
.gr-root :focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: 3px; }
/* Table text never steps below the six sizes. */
.gr-root small { font-size: inherit; }
.gr-title { font: var(--type-heading); margin: 0 0 var(--space-line); }
.gr-deck { margin: 0 0 var(--space-heading); max-width: var(--size-readable); font: var(--type-metadata); color: var(--ink-soft); }

/* The bar: shared controls at the compact size (44px on touch). */
.gr-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-tight); align-items: center; margin-bottom: var(--space-row); }
.gr-field { display: flex; flex-direction: column; gap: var(--space-line); min-width: 0; }
.gr-label { font: var(--type-label); color: var(--ink-soft); }
.gr-root .gr-search { width: 12rem; max-width: 100%; }
.gr-root .gr-year { width: 6rem; font-variant-numeric: tabular-nums; }
.gr-yearrow { display: flex; align-items: center; gap: var(--space-line); }
.gr-yearrow span { color: var(--ink-faint); }
.gr-choice { display: inline-flex; flex-wrap: wrap; gap: var(--space-line); }
.gr-root .gr-export { margin-left: auto; }

/* The secondary filters live behind one disclosure so the bar stays one line.
   A summary cannot take .ui-button, so it draws the secondary pill itself. */
.gr-more { position: relative; }
.gr-more-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-tight);
  min-height: var(--ui-height); padding: 0 var(--ui-pad); border-radius: var(--radius-pill);
  background: var(--ui-wash); color: var(--navy); font: 600 var(--ui-font)/1.4 var(--sans);
  white-space: nowrap; list-style: none; cursor: pointer; transition: background-color var(--ui-motion);
}
.gr-more-btn::-webkit-details-marker { display: none; }
.gr-more-btn::after { content: ''; width: 0.4rem; height: 0.4rem; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: translateY(-2px) rotate(45deg); }
.gr-more-btn:hover, .gr-more[open] .gr-more-btn { background: var(--ui-wash-pressed); }
.gr-more[open] .gr-more-btn::after { transform: translateY(1px) rotate(-135deg); }
.gr-count { font-variant-numeric: tabular-nums; }
.gr-pop {
  position: absolute; z-index: 6; top: calc(100% + var(--space-tight)); left: 0; width: min(34rem, calc(100vw - 3rem));
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-row) var(--space-block);
  padding: var(--space-block); background: var(--paper-raised); border: var(--border-hairline) solid var(--divider-subtle);
  border-radius: var(--radius-md); box-shadow: var(--shadow-overlay);
}
.gr-pop.gr-pop-right { left: auto; right: 0; }
.gr-pop-foot { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: var(--space-tight); }

/* Figures: the one number each tile is about, a hairline above. */
.gr-tiles { display: flex; flex-wrap: wrap; gap: var(--space-tight) var(--space-group); margin: 0 0 var(--space-row); }
.gr-tile { flex: 1 1 120px; min-width: 110px; max-width: 220px; padding-top: var(--space-tight); border-top: var(--border-hairline) solid var(--divider-default); }
/* In the hub the tiles open the tab, right under its strip: no rule of their own. */
.gr-embedded .gr-tile { border-top: 0; padding-top: 0; }
.gr-tile b { display: block; font: var(--type-heading); font-variant-numeric: tabular-nums; }
.gr-tile span { display: block; margin-top: var(--space-line); font: var(--type-fine); color: var(--ink-soft); }

.gr-chart { margin: 0 0 var(--space-row); }
.gr-chart svg { width: 100%; height: auto; max-height: 150px; display: block; }
.gr-bar { fill: color-mix(in srgb, var(--chart-mark) 16%, transparent); stroke: var(--chart-mark); stroke-width: 1; }
.gr-bar-donor { fill: var(--chart-mark); }
.gr-axis { font: var(--type-label); fill: var(--ink-faint); }
.gr-val { font: var(--type-fine); fill: var(--ink-soft); }
.gr-year-col { cursor: pointer; outline: none; }
.gr-hit { fill: transparent; }
.gr-year-col:hover .gr-bar, .gr-year-col:focus-visible .gr-bar { stroke-width: 2; }
.gr-year-col:focus-visible .gr-hit { fill: color-mix(in srgb, var(--chart-mark) 16%, transparent); }
.gr-windowed .gr-dim .gr-bar { fill: transparent; stroke: var(--line-control); stroke-dasharray: 2 2; }
.gr-windowed .gr-dim .gr-bar-donor { fill: var(--chart-baseline); }
.gr-windowed .gr-dim .gr-val, .gr-windowed .gr-dim .gr-axis { fill: var(--line-control); }
.gr-windowed .gr-sel .gr-axis { fill: var(--bronze-ink); }
.gr-hint { font-style: italic; }
.gr-gov { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-line) var(--space-block); margin: var(--space-line) 0 0; font: var(--type-fine); color: var(--ink-soft); }
.gr-legend { display: inline-flex; align-items: center; gap: var(--space-tight); }
.gr-legend i { display: inline-block; width: 12px; height: 9px; border: var(--border-hairline) solid var(--chart-mark); background: color-mix(in srgb, var(--chart-mark) 16%, transparent); }
.gr-legend i.gr-solid { background: var(--chart-mark); }

/* The table: no box, a rule above and below; the open file lifts to raised. */
.gr-summary { margin: 0 0 var(--space-tight); font: var(--type-metadata); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.gr-summary b { font-weight: 600; color: var(--ink); }
.gr-tablewrap { overflow: auto; max-height: min(72vh, 900px); border-block: var(--border-hairline) solid var(--divider-default); }
.gr-table { border-collapse: collapse; width: 100%; min-width: 800px; font: var(--type-metadata); }
.gr-table thead th { position: sticky; top: 0; z-index: 2; padding: 0; background: var(--paper); border-bottom: var(--border-hairline) solid var(--divider-default); text-align: left; white-space: nowrap; }
.gr-sort { display: flex; gap: var(--space-line); align-items: baseline; width: 100%; padding: var(--space-tight) var(--space-row); border: 0; background: none; color: var(--ink-soft); font: var(--type-label); text-align: inherit; cursor: pointer; }
.gr-sort:hover, th[aria-sort] .gr-sort { color: var(--ink); }
.gr-arrow { color: var(--bronze-ink); }
.gr-th-num { text-align: right; }
.gr-th-num .gr-sort { justify-content: flex-end; }
.gr-table td { padding: var(--space-tight) var(--space-row); border-bottom: var(--border-hairline) solid var(--divider-subtle); vertical-align: baseline; }
.gr-table tbody tr.gr-row:hover td { background: var(--paper-sunken); }
.gr-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gr-muted { color: var(--ink-faint); }
/* Record links in the table and in the phone panel; :where keeps them at one class. */
:where(.gr-table, .gr-panel) a:not(.ui-button), .gr-open { color: inherit; text-decoration: underline; text-decoration-color: var(--bronze-rule); text-underline-offset: 2px; }
:where(.gr-table, .gr-panel) a:not(.ui-button):hover, .gr-open:hover { color: var(--bronze-ink); }
.gr-open { font: inherit; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; }
.gr-open[aria-expanded="true"] { font-weight: 600; text-decoration: none; }
.gr-share { color: var(--ink-faint); }
.gr-bar-cell { display: inline-block; height: 8px; background: var(--chart-mark); vertical-align: middle; margin-right: var(--space-tight); }
.gr-empty { padding: var(--space-group) var(--space-row); text-align: center; color: var(--ink-soft); }
.gr-status { padding: var(--space-group) var(--space-row); font: var(--type-body); color: var(--ink-soft); }
.gr-root .gr-status .ui-button { margin-left: var(--space-tight); }
.gr-mps { display: flex; flex-wrap: wrap; gap: var(--space-line) var(--space-row); }
.gr-donor-cell { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-line) var(--space-tight); justify-content: flex-end; }

.gr-detail td { background: var(--paper-raised); padding: var(--space-block); border-bottom: var(--border-hairline) solid var(--divider-default); }
.gr-detail-head { display: flex; flex-wrap: wrap; gap: var(--space-line) var(--space-block); align-items: baseline; margin-bottom: var(--space-tight); }
.gr-detail-head h3 { font: var(--type-subheading); margin: 0; }
.gr-detail-meta { font: var(--type-metadata); color: var(--ink-soft); margin: 0 0 var(--space-row); }
.gr-detail-meta b { color: var(--ink); }
.gr-cols { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-block) var(--space-group); }
.gr-kicker { font: var(--type-label); color: var(--ink); margin: var(--space-row) 0 var(--space-tight); }
.gr-grants { border-collapse: collapse; width: 100%; font: var(--type-fine); }
.gr-grants td { padding: var(--space-line) var(--space-tight) var(--space-line) 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); vertical-align: top; }
.gr-grants td:last-child { padding-right: 0; }
.gr-grants small { display: block; color: var(--ink-faint); }
.gr-donor p { margin: var(--space-line) 0; font: var(--type-metadata); }
.gr-partylist { list-style: none; margin: var(--space-line) 0 var(--space-tight); padding: 0; font: var(--type-metadata); }
.gr-partylist li { display: flex; justify-content: space-between; gap: var(--space-block); padding: var(--space-line) 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); }
.gr-note { font: var(--type-fine); color: var(--ink-soft); margin: var(--space-tight) 0 0; }
.gr-links { display: flex; flex-wrap: wrap; gap: var(--space-tight); margin-top: var(--space-heading); }

/* Phones: the open file is a card above the table. */
.gr-panel { position: relative; margin: 0 0 var(--space-row); padding: var(--space-block); background: var(--paper-raised); border: var(--border-hairline) solid var(--divider-subtle); border-radius: var(--radius-md); }
.gr-root .gr-panel-close { position: absolute; top: var(--space-row); right: var(--space-row); }
.gr-panel .gr-detail-head { padding-right: 5rem; }
.gr-fineprint { margin: var(--space-row) 0 0; max-width: var(--size-readable); font: var(--type-fine); color: var(--ink-soft); }
.gr-fineprint p { margin: 0; }
.gr-fineprint a, .gr-fine-notes summary { color: var(--bronze-ink); }
.gr-fine-notes summary { cursor: pointer; padding: var(--space-line) 0; }
.gr-fine-notes p { margin-top: var(--space-line); }
.gr-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }

/* Program file: stacked hairline bars (bronze weights, never party colours), bucket lists, notes. */
.gr-table-programs { min-width: 1040px; }
.gr-detail-head .gr-id { font: var(--type-fine); color: var(--ink-faint); }
.gr-split { display: flex; height: 12px; margin: var(--space-line) 0 var(--space-tight); border: var(--border-hairline) solid var(--chart-mark); overflow: hidden; background: var(--paper-raised); }
.gr-split i { display: block; height: 100%; min-width: 0; }
.gr-split i + i { border-left: var(--border-hairline) solid var(--paper-raised); }
.gr-seg-0 { background: var(--chart-mark); }
.gr-seg-1 { background: color-mix(in srgb, var(--chart-mark) 16%, transparent); }
.gr-seg-2 { background: repeating-linear-gradient(135deg, var(--chart-mark) 0 1px, transparent 1px 4px); }
.gr-seg-3 { background: var(--chart-baseline); }
.gr-seg-4 { background: repeating-linear-gradient(45deg, var(--chart-contrast) 0 1px, transparent 1px 5px); }
.gr-seg-5 { background: var(--paper-sunken); }
.gr-splitkey { list-style: none; margin: 0 0 var(--space-row); padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-line) var(--space-block); font: var(--type-fine); color: var(--ink-soft); }
.gr-splitkey li { display: inline-flex; align-items: center; gap: var(--space-line); }
.gr-splitkey i { display: inline-block; width: 12px; height: 9px; border: var(--border-hairline) solid var(--chart-mark); }
.gr-splitkey b { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.gr-buckets { list-style: none; margin: var(--space-line) 0 var(--space-row); padding: 0; font: var(--type-fine); }
.gr-buckets li { display: grid; grid-template-columns: minmax(0, 1fr) 6rem 5.5rem; gap: 0 var(--space-row); align-items: center; padding: var(--space-line) 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); }
.gr-buckets .gr-bar-cell { margin: 0; }
.gr-buckets .gr-num { color: var(--ink-soft); }
.gr-caption { font: var(--type-fine); color: var(--ink-soft); margin: var(--space-line) 0 var(--space-tight); }
.gr-toplist { list-style: none; margin: var(--space-line) 0 var(--space-row); padding: 0; font: var(--type-fine); }
.gr-toplist li { display: flex; justify-content: space-between; gap: var(--space-row); align-items: baseline; padding: var(--space-line) 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); }
.gr-toplist .gr-num { white-space: nowrap; }
.gr-root .gr-jump { margin: var(--space-row) 0 var(--space-line); }
.gr-jump::after { content: ''; width: 0.45em; height: 0.45em; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: translateY(-0.15em) rotate(45deg); }
.gr-electorates-kicker { scroll-margin-top: 5rem; }
.gr-electorates-kicker:focus { outline: none; }
.gr-notes { margin: var(--space-tight) 0; font: var(--type-fine); color: var(--ink-soft); }
.gr-notes summary { cursor: pointer; padding: var(--space-line) 0; font: var(--type-label); color: var(--ink); }
.gr-notes dl { margin: var(--space-line) 0 0; }
.gr-notes dt { font-weight: 600; color: var(--ink); margin-top: var(--space-tight); }
.gr-notes dd { margin: var(--space-line) 0 0; }
.gr-notes a, .gr-audits a { color: var(--bronze-ink); }
.gr-summary-note { margin: var(--space-line) 0 var(--space-row); font: var(--type-metadata); }
.gr-summary-note p { margin: var(--space-line) 0; }
.gr-audits { list-style: none; margin: var(--space-line) 0 var(--space-tight); padding: 0; font: var(--type-fine); }
.gr-audits li { padding: var(--space-line) 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); }
.gr-audits b { font-weight: 600; color: var(--ink); }
.gr-grantswrap { overflow: auto; max-height: min(60vh, 720px); margin: var(--space-line) 0 var(--space-tight); border-block: var(--border-hairline) solid var(--divider-subtle); }
.gr-pgrants { border-collapse: collapse; width: 100%; min-width: 860px; font: var(--type-fine); }
.gr-pgrants th { position: sticky; top: 0; background: var(--paper-raised); font: var(--type-label); color: var(--ink-soft); text-align: left; padding: var(--space-tight); border-bottom: var(--border-hairline) solid var(--divider-default); white-space: nowrap; }
.gr-pgrants th.gr-num { text-align: right; }
.gr-pgrants td { padding: var(--space-line) var(--space-tight); border-bottom: var(--border-hairline) solid var(--divider-subtle); vertical-align: top; }
.gr-pgrants small { display: block; color: var(--ink-faint); }
.gr-scroll { overflow: auto; }
.gr-electorates { border-collapse: collapse; width: 100%; font: var(--type-fine); }
.gr-electorates td { padding: var(--space-line) var(--space-tight) var(--space-line) 0; border-bottom: var(--border-hairline) solid var(--divider-subtle); vertical-align: top; }
.gr-electorates td:last-child { padding-right: 0; }
.gr-root .gr-more-rows { margin: var(--space-tight) 0 0; }

@media (prefers-reduced-motion: reduce) {
  .gr-more-btn { transition: none; }
}

/* Tablet: the bar wraps to two lines, the popover hugs the button's edge. */
@media (max-width: 1000px) {
  .gr-root .gr-search { width: 11rem; }
  .gr-table { min-width: 760px; }
  .gr-table-programs { min-width: 980px; }
}
/* Phone: each segmented control fills a line, the search and the popover go full width. */
@media (max-width: 640px) {
  .gr-deck { margin-bottom: var(--space-row); }
  .gr-views { flex: 1 1 100%; }
  .gr-root .gr-views > .ui-button { flex: 1 1 0; padding-inline: var(--space-tight); }
  .gr-root .gr-search { flex: 1 1 100%; width: auto; }
  .gr-more { flex: 1 1 auto; position: static; }
  .gr-more-btn { width: 100%; }
  .gr-root .gr-export { flex: 0 0 auto; margin-left: 0; }
  .gr-pop { position: static; width: 100%; grid-template-columns: 1fr; margin-top: var(--space-tight); box-shadow: none; }
  .gr-tiles { gap: var(--space-tight) var(--space-heading); }
  .gr-tile { flex: 1 1 40%; max-width: none; min-width: 0; }
  .gr-chart svg { max-height: 120px; }
  .gr-val, .gr-axis-odd { display: none; }
  .gr-table { min-width: 720px; }
  .gr-table-programs { min-width: 920px; }
  .gr-cols { grid-template-columns: 1fr; }
  .gr-buckets li { grid-template-columns: minmax(0, 1fr) 4.5rem 4.5rem; }
  .gr-grantswrap { max-height: none; }
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

/** The platform's CSS.escape (the module's own CSS constant shadows the global name). */
function cssEscape (s) {
  const g = globalThis.CSS
  return g && typeof g.escape === 'function' ? g.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&')
}

/** PartyLabel (ui-controls.css): the party's dot beside its name, never colour alone. */
function partyChip (party, { full = true } = {}) {
  const name = String(party || '')
  const hit = PARTY_MAP[name.toLowerCase()]
  const span = el('span', `ui-party party party-${hit ? hit[0] : 'oth'}`)
  const dot = el('i')
  dot.setAttribute('aria-hidden', 'true')
  const shown = full ? name : (hit ? hit[1] : name.slice(0, 12))
  if (shown !== name) span.title = name
  span.append(dot, document.createTextNode(shown))
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
  if (!href) return el('span', className, text)
  const a = el('a', className, text)
  a.href = href
  return a
}

/** Smooth scrolling, unless the reader asked for less motion. */
function scrollBehavior () {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** A file's way onward as a shared button: primary (navy, one per file) or
 *  quiet (a link out). A link with nowhere to go stays plain text. */
function action (node, variant) {
  if (node.tagName === 'A') {
    node.classList.add('ui-button')
    node.dataset.variant = variant
  }
  return node
}

/** The row of a file's actions, at the compact size. */
function actionRow () {
  const row = el('div', 'gr-links')
  row.dataset.uiSize = 'compact'
  return row
}

// ---------------------------------------------------------------------------
// mountGrants
// ---------------------------------------------------------------------------

export function mountGrants (container, opts = {}) {
  injectStyles()
  const subjectHash = opts.subjectHash || ((kind, label) => typeof label === 'string' && label.trim() && !/^(null|undefined)$/i.test(label.trim()) ? subjectUrl(kind,label) : null)
  const searchHash = opts.searchHash || ((q) => `/ask?view=search&q=${encodeURIComponent(q)}`)

  const state = {
    jur: JURISDICTIONS[opts.jurisdiction] ? opts.jurisdiction : 'federal',
    view: opts.program ? 'programs' : 'recipients',
    q: '', kind: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0,
    sort: {
      recipients: { key: 't', dir: 'desc' },
      programs: { key: 't', dir: 'desc' },
      electorates: { key: 't', dir: 'desc' },
    },
    open: null,                    // recipient id whose file is open in the table
    program: opts.program || null, // program id whose file is open in the Programs view
  }

  let data = null                  // the loaded index
  let currentRows = []
  let loadSeq = 0
  const cache = new Map()          // jurisdiction -> index
  const detailCache = new Map()    // shard -> bundle of recipient files
  const programCache = new Map()   // jur/key -> program file
  let notesPromise = null          // /grants/program-notes.json, fetched once, null when absent
  const aborter = new AbortController()

  /**
   * Tells the host (opts.onParamsChange) which file is open so the address bar
   * can carry ?jur=&open= or ?jur=&program=. Only user actions publish; the
   * open()/openProgram() entry points come from the URL already.
   */
  function publishParams (replace = false) {
    if (typeof opts.onParamsChange !== 'function') return false
    const params = new URLSearchParams()
    params.set('jur', state.jur)
    if (state.open) params.set('open', state.open)
    if (state.program) params.set('program', state.program)
    return opts.onParamsChange(params, { replace }) === true
  }
  const cols = () => viewColumns(state.view, state.jur)

  const root = el('section', 'gr-root')
  // Embedded in the money hub (no heading of its own) the tiles sit directly
  // under the hub's tab strip, so they drop their top rule there.
  if (opts.showHeading === false) root.classList.add('gr-embedded')
  root.setAttribute('aria-label', 'Who gets the grants: grant recipients checked against the donor registers')
  root.innerHTML = `
    ${opts.showHeading === false ? '' : `<h2 class="gr-title">Who gets the grants</h2>
    <p class="gr-deck">Every published grant award, resolved to the organisations that receive it and
      checked against the donor registers: who gets public money, from which programs, in which seats,
      and which of them also fund parties.</p>`}

    <div class="gr-tiles" aria-label="Headline figures"></div>
    <div class="gr-chart" aria-label="Awarded by financial year"></div>

    <div class="gr-toolbar" role="group" aria-label="Grant filters" data-ui-size="compact">
      <div class="gr-views ui-segmented" role="group" aria-label="Jurisdiction">
        ${Object.entries(JURISDICTIONS).map(([k, j]) =>
          `<button type="button" class="ui-button gr-jur" data-jur="${k}" aria-pressed="${k === state.jur ? 'true' : 'false'}">${j.label}</button>`).join('')}
      </div>
      <div class="gr-views ui-segmented" role="group" aria-label="View">
        <button type="button" class="ui-button gr-view" data-view="recipients" aria-pressed="${state.view === 'recipients' ? 'true' : 'false'}">Recipients</button>
        <button type="button" class="ui-button gr-view" data-view="programs" aria-pressed="${state.view === 'programs' ? 'true' : 'false'}">Programs</button>
        <button type="button" class="ui-button gr-view" data-view="electorates" aria-pressed="false">Electorates</button>
      </div>
      <div class="gr-choice" role="group" aria-label="Donor filter">
        <button type="button" class="ui-chip gr-donors" data-donors="0" aria-pressed="true">Everyone</button>
        <button type="button" class="ui-chip gr-donors" data-donors="1" aria-pressed="false">Donors only</button>
      </div>
      <label class="gr-visually-hidden" for="gr-q">Filter by name</label>
      <input class="ui-input gr-search" id="gr-q" type="search" autocomplete="off" placeholder="Filter by name…" />
      <details class="gr-more">
        <summary class="gr-more-btn" aria-label="More filters"><span>Filters</span><b class="ui-status gr-count" data-tone="active" hidden></b></summary>
        <div class="gr-pop">
          <div class="gr-field gr-field-kind">
            <label class="gr-label" for="gr-kind">Kind</label>
            <select class="ui-input" id="gr-kind"><option value="">All kinds</option></select>
          </div>
          <div class="gr-field gr-field-agency">
            <label class="gr-label" for="gr-agency">Agency</label>
            <select class="ui-input" id="gr-agency"><option value="">All agencies</option></select>
          </div>
          <div class="gr-field">
            <span class="gr-label" id="gr-years-label">Financial years starting</span>
            <div class="gr-yearrow" role="group" aria-labelledby="gr-years-label">
              <input class="ui-input gr-year" id="gr-year-from" type="number" inputmode="numeric" placeholder="2017" aria-label="From financial year starting" />
              <span aria-hidden="true">–</span>
              <input class="ui-input gr-year" id="gr-year-to" type="number" inputmode="numeric" placeholder="2026" aria-label="To financial year starting" />
            </div>
          </div>
          <div class="gr-field">
            <label class="gr-label" for="gr-min">Minimum awarded</label>
            <select class="ui-input" id="gr-min">
              <option value="0">Any amount</option>
              <option value="100000">$100K+</option>
              <option value="1000000">$1M+</option>
              <option value="10000000">$10M+</option>
              <option value="100000000">$100M+</option>
            </select>
          </div>
          <div class="gr-pop-foot">
            <button type="button" class="ui-button" data-variant="quiet" id="gr-clear" hidden>Clear all filters</button>
            <button type="button" class="ui-button gr-done" data-variant="primary">Done</button>
          </div>
        </div>
      </details>
      <button type="button" class="ui-button gr-export" id="gr-export"><svg class="gr-export-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 2.5v8"/><path d="M4.75 7.25 8 10.5l3.25-3.25"/><path d="M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11"/></svg>Export CSV</button>
    </div>

    <p class="gr-summary" aria-live="polite" aria-atomic="true"></p>

    <div class="gr-tablewrap" role="region" tabindex="0" aria-label="Grants table (scrollable)">
      <div class="gr-status">Opening the grants…</div>
      <table class="gr-table" hidden>
        <caption class="gr-visually-hidden"></caption>
        <thead><tr></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="gr-fineprint"></div>
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

  const moreEl = $('.gr-more')
  const countEl = $('.gr-count')
  /** How many of the popover's filters are set: shown on its button when closed. */
  function syncFilterCount () {
    const n = (state.kind ? 1 : 0) + (state.agency !== '' ? 1 : 0) +
      ((state.yearFrom != null || state.yearTo != null) ? 1 : 0) + (state.min > 0 ? 1 : 0)
    countEl.hidden = n === 0
    countEl.textContent = String(n)
  }

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
    tableEl.classList.toggle('gr-table-programs', state.view === 'programs')
    for (const col of cols()) {
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

  let chartSvg = null
  /** Marks the year columns inside the current window (all of them when no window is set). */
  function syncChartSelection () {
    if (!chartSvg) return
    const windowed = state.yearFrom != null || state.yearTo != null
    chartSvg.classList.toggle('gr-windowed', windowed)
    for (const col of chartSvg.querySelectorAll('.gr-year-col')) {
      const y = fyStart(col.dataset.fy)
      const inside = !windowed || ((state.yearFrom == null || y >= state.yearFrom) && (state.yearTo == null || y <= state.yearTo))
      col.classList.toggle('gr-sel', windowed && inside)
      col.classList.toggle('gr-dim', windowed && !inside)
      col.setAttribute('aria-pressed', windowed && inside ? 'true' : 'false')
    }
  }

  /**
   * The by-year bars: one column per financial year, the whole bar in bronze
   * wash, the donor share (when any) solid. `cell(fy)` -> { t, c, dt }.
   * Interactive columns are buttons (the index chart filters the table);
   * the program file's chart is a plain picture.
   */
  function yearChartSvg (years, cell, { width, interactive, label, noun }) {
    // Up to 1000 units wide, so 13px value labels clear their neighbours on a desktop.
    const W = Math.max(340, Math.min(1000, width || 720))
    const H = W < 480 ? 118 : 136
    const padL = 4
    const padB = 20
    const padT = 14
    const gap = 5
    const bw = (W - padL * 2 - gap * (years.length - 1)) / years.length
    const max = Math.max(...years.map((fy) => cell(fy).t)) || 1
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', label)
    years.forEach((fy, i) => {
      const y = cell(fy)
      const x = padL + i * (bw + gap)
      const h = (H - padB - padT) * (y.t / max)
      // One group per year, a button: click (or Enter) narrows the table to that
      // financial year, click again to clear. The whole column is the target.
      const g = document.createElementNS(svgNS, 'g')
      g.setAttribute('class', 'gr-year-col')
      g.dataset.fy = fy
      const donorText = y.dt > 0 ? `; ${AUD_FULL.format(y.dt)} to recipients in the donor registers` : ''
      if (interactive) {
        g.setAttribute('role', 'button')
        g.setAttribute('tabindex', '0')
        g.setAttribute('aria-label', `${fy}: ${AUD_FULL.format(y.t)} in ${NUM.format(y.c)} ${noun}${donorText}. Filter to this year`)
        const hit = document.createElementNS(svgNS, 'rect')
        hit.setAttribute('class', 'gr-hit')
        hit.setAttribute('x', x - gap / 2); hit.setAttribute('y', 0)
        hit.setAttribute('width', bw + gap); hit.setAttribute('height', H)
        g.appendChild(hit)
      }
      const bar = document.createElementNS(svgNS, 'rect')
      bar.setAttribute('class', 'gr-bar')
      bar.setAttribute('x', x); bar.setAttribute('y', H - padB - h)
      bar.setAttribute('width', bw); bar.setAttribute('height', Math.max(h, 0.5))
      const t = document.createElementNS(svgNS, 'title')
      t.textContent = `${fy}: ${AUD_FULL.format(y.t)} in ${NUM.format(y.c)} ${noun}${donorText}.${interactive ? ' Click to filter to this year.' : ''}`
      g.appendChild(t)
      g.appendChild(bar)
      const dh = (H - padB - padT) * ((y.dt || 0) / max)
      if (dh > 0) {
        const d = document.createElementNS(svgNS, 'rect')
        d.setAttribute('class', 'gr-bar-donor')
        d.setAttribute('x', x); d.setAttribute('y', H - padB - dh)
        d.setAttribute('width', bw); d.setAttribute('height', dh)
        g.appendChild(d)
      }
      svg.appendChild(g)
      const val = document.createElementNS(svgNS, 'text')
      val.setAttribute('class', 'gr-val')
      val.setAttribute('x', x + bw / 2); val.setAttribute('y', H - padB - h - 4)
      val.setAttribute('text-anchor', 'middle')
      val.textContent = fmtMoney(y.t)
      g.appendChild(val)
      const lab = document.createElementNS(svgNS, 'text')
      lab.setAttribute('class', i % 2 ? 'gr-axis gr-axis-odd' : 'gr-axis')
      lab.setAttribute('x', x + bw / 2); lab.setAttribute('y', H - 6)
      lab.setAttribute('text-anchor', 'middle')
      lab.textContent = fyShort(fy)
      g.appendChild(lab)
    })
    return svg
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
    const svg = yearChartSvg(years, (fy) => data.years[fy], {
      width: chartEl.clientWidth, interactive: true, noun: 'grants',
      label: 'Dollars awarded by financial year, with the share that went to recipients found in the donor registers',
    })
    const toggleYear = (fy) => {
      const y = fyStart(fy)
      if (y == null) return
      const same = state.yearFrom === y && state.yearTo === y
      state.yearFrom = same ? null : y
      state.yearTo = same ? null : y
      yearFromEl.value = same ? '' : String(y)
      yearToEl.value = same ? '' : String(y)
      render()
    }
    svg.addEventListener('click', (e) => {
      const col = e.target.closest('.gr-year-col')
      if (col) toggleYear(col.dataset.fy)
    })
    svg.addEventListener('keydown', (e) => {
      const col = e.target.closest('.gr-year-col')
      if (col && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleYear(col.dataset.fy) }
    })
    chartEl.appendChild(svg)
    chartSvg = svg
    syncChartSelection()

    // the government of the day, as a legend line rather than a colour on the bars
    const gov = el('div', 'gr-gov')
    const leg1 = el('span', 'gr-legend')
    leg1.append(el('i'), document.createTextNode('awarded'))
    const leg2 = el('span', 'gr-legend')
    leg2.append(el('i', 'gr-solid'), document.createTextNode('to recipients in the donor registers'))
    gov.append(leg1, leg2, el('span', 'gr-hint', 'Click a year to filter'))
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
    const btn = link(grantRecipientUrl(state.jur, r.id), r.n, 'gr-open')
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

  /** A bar plus "$X NN%" for a share cell; an em dash when the base is not recorded. */
  function shareCell (td, dollars, share) {
    if (share == null) { td.appendChild(el('span', 'gr-muted', '—')); return }
    const bar = el('span', 'gr-bar-cell')
    bar.style.width = `${Math.max(2, Math.round(share * 60))}px`
    td.append(bar, document.createTextNode(`${fmtMoney(dollars)} `), el('span', 'gr-share', `${Math.round(share * 100)}%`))
  }

  function renderProgramRow (tr, r) {
    const nameTd = tr.appendChild(el('td'))
    const btn = el('button', 'gr-open', r.n)
    btn.type = 'button'
    btn.dataset.program = r.id
    btn.setAttribute('aria-expanded', state.program === r.id ? 'true' : 'false')
    nameTd.appendChild(btn)
    tr.appendChild(el('td', null, agencyName(r.ag)))
    tr.appendChild(moneyCell(r.t))
    tr.appendChild(el('td', 'gr-num', NUM.format(r.c)))
    tr.appendChild(el('td', 'gr-num', NUM.format(r.r)))
    shareCell(tr.appendChild(el('td', 'gr-num')), r.dt, r.dt > 0 ? r.share : null)
    shareCell(tr.appendChild(el('td', 'gr-num')), r.cnc, r.cncS)
    if (state.jur === 'federal') shareCell(tr.appendChild(el('td', 'gr-num')), r.gov, r.govS)
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
    const phone = window.matchMedia('(max-width: 640px)').matches
    let openRow = null
    for (const r of rows) {
      const tr = el('tr', 'gr-row')
      renderCells(tr, r)
      frag.appendChild(tr)
      if (state.view === 'recipients' && state.open === r.id) {
        openRow = { kind: 'recipient', row: r }
        if (!phone) frag.appendChild(detailRow(r))
      } else if (state.view === 'programs' && state.program === r.id) {
        openRow = { kind: 'program', row: r }
        if (!phone) frag.appendChild(programDetailRow(r))
      }
    }
    renderPanel(phone && openRow ? openRow : null)
    if (rows.length === 0) {
      const tr = el('tr')
      const td = el('td', 'gr-empty', state.view === 'electorates' && !data.electorates.length
        ? 'No electorates yet: the award records that carry a location are still being fetched.'
        : 'Nothing matches these filters.')
      td.colSpan = cols().length
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
    syncFilterCount()
    syncChartSelection()
  }

  // ---- recipient / program file: a panel above the table on phones ---------

  const panelEl = el('section', 'gr-panel')
  panelEl.hidden = true
  panelEl.setAttribute('aria-label', 'Recipient file')
  $('.gr-tablewrap').before(panelEl)
  let panelFor = null
  function renderPanel (opened) {
    if (!opened) { panelEl.hidden = true; panelEl.textContent = ''; panelFor = null; return }
    const { kind, row: r } = opened
    const id = `${kind}:${r.id}`
    if (panelFor === id && !panelEl.hidden) return
    panelFor = id
    panelEl.hidden = false
    panelEl.setAttribute('aria-label', kind === 'program' ? 'Program file' : 'Recipient file')
    panelEl.textContent = ''
    const close = el('button', 'ui-button gr-panel-close', 'Close')
    close.type = 'button'
    close.dataset.uiSize = 'compact'
    close.addEventListener('click', () => {
      if (kind === 'program') state.program = null
      else state.open = null
      publishParams()
      render()
    })
    panelEl.appendChild(close)
    const body = el('div')
    panelEl.appendChild(body)
    const fill = () => {
      body.replaceChildren(el('div', 'gr-status', 'Opening the file…'))
      const loading = kind === 'program' ? loadProgram(r) : loadDetail(r)
      loading.then((d) => {
        if (panelFor !== id) return
        body.textContent = ''
        if (kind === 'program') renderProgramDetail(body, r, d)
        else renderDetail(body, r, d)
        panelEl.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
      }).catch(() => {
        if (panelFor !== id) return
        body.replaceChildren(failedStatus('The file could not be opened.', fill))
      })
    }
    fill()
  }

  /** A plain sentence and a way to try again: a failed file never shows a raw error. */
  function failedStatus (sentence, retry) {
    const box = el('div', 'gr-status', sentence)
    const again = el('button', 'ui-button', 'Try again')
    again.type = 'button'
    again.dataset.uiSize = 'compact'
    again.addEventListener('click', retry)
    box.appendChild(again)
    return box
  }

  // ---- recipient file (detail row) -----------------------------------------

  function detailRow (r) {
    const tr = el('tr', 'gr-detail')
    const td = el('td')
    td.colSpan = COLUMNS.recipients.length
    tr.appendChild(td)
    const fill = () => {
      td.replaceChildren(el('div', 'gr-status', 'Opening the file…'))
      loadDetail(r).then((d) => {
        if (state.open !== r.id || !tr.isConnected) return
        td.textContent = ''
        renderDetail(td, r, d)
      }).catch(() => {
        if (!tr.isConnected) return
        td.replaceChildren(failedStatus('The file could not be opened.', fill))
      })
    }
    fill()
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
      // One award's own value: to the dollar, not abbreviated.
      row.appendChild(el('td', 'gr-num', AUD_FULL.format(g.v || 0)))
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
    // Each program with a file of its own opens in the Programs view.
    const byName = programByName(data.programs)
    if (d.programs && (d.programs.length > 1 || (d.programs.length === 1 && byName.has(d.programs[0][0])))) {
      left.appendChild(el('p', 'gr-kicker', 'By program'))
      const ul = el('ul', 'gr-partylist')
      for (const [p, v] of d.programs.slice(0, 6)) {
        const li = el('li')
        const hit = byName.get(p)
        if (hit) {
          const b = el('button', 'gr-open', p)
          b.type = 'button'
          b.dataset.program = hit.id
          b.title = 'Open the program file'
          li.appendChild(b)
        } else li.appendChild(el('span', null, p))
        li.appendChild(el('span', 'gr-num', fmtMoney(v)))
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
      const b = link(grantRecipientUrl(d.other.jur, r.id), `Open its ${JURISDICTIONS[d.other.jur].label} file`, 'gr-open')
      o.appendChild(b)
      right.appendChild(o)
    }
    const links = actionRow()
    links.appendChild(action(link(searchHash(`"${d.n}"`, {}), 'Search the record for them'), 'primary'))
    if (d.d) links.appendChild(action(link(subjectHash('donor', d.d.n), 'Donor entry'), 'quiet'))
    const src = action(link(data.meta.source_url, state.jur === 'qld' ? 'Source: data.qld.gov.au' : 'Source: GrantConnect'), 'quiet')
    src.target = '_blank'
    src.rel = 'noopener'
    links.appendChild(src)
    right.appendChild(links)
    cols.appendChild(right)
    td.appendChild(cols)
  }

  // ---- program file --------------------------------------------------------

  function programDetailRow (r) {
    const tr = el('tr', 'gr-detail')
    const td = el('td')
    td.colSpan = cols().length
    tr.appendChild(td)
    const fill = () => {
      td.replaceChildren(el('div', 'gr-status', 'Opening the program…'))
      loadProgram(r).then((p) => {
        if (state.program !== r.id || !tr.isConnected) return
        td.textContent = ''
        renderProgramDetail(td, r, p)
      }).catch(() => {
        if (!tr.isConnected) return
        td.replaceChildren(failedStatus('The program file could not be opened.', fill))
      })
    }
    fill()
    return tr
  }

  /** The program file plus the notes file (optional: a 404 there is not an error). */
  async function loadProgram (r) {
    const key = r.key || programKey(r.id)
    const id = `${state.jur}/${key}`
    let p = programCache.get(id)
    if (!p) {
      const res = await fetch(`${JURISDICTIONS[state.jur].dir}programs/${encodeURIComponent(key)}.json`, { signal: aborter.signal })
      if (!res.ok) throw new Error(`${res.status}`)
      p = await res.json()
      if (state.jur === 'federal') p = withToldSeats(p, await loadTold(key))
      programCache.set(id, p)
    }
    p.notes = await loadNotes()
    return p
  }

  let toldPromise = null
  /** The programs the daily edition tells by seat (/social/programs.json), fetched once; null when absent. */
  function loadToldFile () {
    if (!toldPromise) {
      toldPromise = fetch('/social/programs.json', { signal: aborter.signal })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    }
    return toldPromise
  }
  /** The told program for `key`, or null. */
  async function loadTold (key) {
    const data = await loadToldFile()
    return (data && Array.isArray(data.programs) ? data.programs.find((t) => t.key === key) : null) || null
  }

  function loadNotes () {
    if (!notesPromise) {
      notesPromise = fetch('/grants/program-notes.json', { signal: aborter.signal })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    }
    return notesPromise
  }

  const tile = (big, small) => { const t = el('div', 'gr-tile'); t.append(el('b', null, big), el('span', null, small)); return t }
  const pct = (share) => `${Math.round(share * 100)}%`

  /** A stacked hairline bar with a text key: rows from bucketRows(), segment i in weight class i. */
  function splitBar (rows, ariaLabel) {
    const wrap = el('div')
    const bar = el('div', 'gr-split')
    bar.setAttribute('role', 'img')
    bar.setAttribute('aria-label', `${ariaLabel}: ${rows.map((b) => `${b.label} ${pct(b.share)}`).join(', ')}`)
    const key = el('ul', 'gr-splitkey')
    rows.forEach((b, i) => {
      if (b.share > 0) {
        const seg = el('i', `gr-seg-${i % 6}`)
        seg.style.width = `${b.share * 100}%`
        bar.appendChild(seg)
      }
      const li = el('li')
      const sw = el('i', `gr-seg-${i % 6}`)
      sw.setAttribute('aria-hidden', 'true')
      li.append(sw, document.createTextNode(`${b.label} `), el('b', null, `${pct(b.share)}`),
        el('span', 'gr-share', ` ${fmtMoney(b.d)}, ${NUM.format(b.c)}`))
      key.appendChild(li)
    })
    wrap.append(bar, key)
    return wrap
  }

  /** One line per bucket: label, bar, dollars and count. */
  function bucketList (rows) {
    const ul = el('ul', 'gr-buckets')
    for (const b of rows) {
      const li = el('li')
      const bar = el('span', 'gr-bar-cell')
      bar.style.width = `${Math.max(b.d > 0 ? 2 : 0, Math.round(b.share * 90))}px`
      const num = el('span', 'gr-num')
      num.append(document.createTextNode(`${fmtMoney(b.d)} `), el('span', 'gr-share', pct(b.share)))
      li.append(el('span', null, b.label), bar, num)
      li.title = `${b.label}: ${AUD_FULL.format(b.d)} in ${NUM.format(b.c)} grants`
      ul.appendChild(li)
    }
    return ul
  }

  /** A holder as a party dot plus the member's name, linked to their page. */
  function holderChip (name, party) {
    const chip = partyChip(party || 'Independent')
    chip.textContent = ''
    const dot = el('i'); dot.setAttribute('aria-hidden', 'true')
    chip.append(dot, link(subjectHash('person', name), name))
    if (party) chip.append(el('span', 'gr-share', ` ${party}`))
    return chip
  }

  /** A recipient name: a button that opens its file when the index lists it, plain text otherwise. */
  function recipientRef (rid, name) {
    const listed = rid && recipientIndex().has(rid)
    if (!listed) return el('span', null, name)
    return link(grantRecipientUrl(state.jur, rid), name, 'gr-open')
  }
  let recipientIds = null
  function recipientIndex () {
    if (!recipientIds || recipientIds.jur !== state.jur) {
      recipientIds = new Set(data.recipients.map((x) => x.id))
      recipientIds.jur = state.jur
    }
    return recipientIds
  }

  function renderProgramDetail (td, r, p) {
    const notes = p.notes || null
    const progNotes = notes && notes.programs && notes.programs[state.jur] ? notes.programs[state.jur][p.id] : null
    const qld = state.jur === 'qld'
    const noun = qld ? 'funding lines' : 'grants'

    const head = el('div', 'gr-detail-head')
    const h3 = el('h3', null, p.n)
    h3.tabIndex = -1
    head.append(h3, el('span', 'gr-muted', p.ag || agencyName(r.ag)))
    if (p.id && p.id !== p.n && !/^activity:/.test(p.id)) head.append(el('span', 'gr-id', p.id))
    td.appendChild(head)

    const meta = el('p', 'gr-detail-meta')
    const bits = []
    if (p.y0 || p.y1) bits.push(`financial years ${yearsText(p.y0, p.y1)}`)
    if ((p.agencies || []).length > 1) bits.push(`also awarded through ${p.agencies.slice(1, 3).map((a) => a[0]).join('; ')}${p.agencies.length > 3 ? ` and ${p.agencies.length - 3} more` : ''}`)
    if ((p.cats || []).length) bits.push(`categories: ${p.cats.slice(0, 3).map((c) => c[0]).join(', ')}`)
    if ((p.pbs || []).length) bits.push(`budget line: ${p.pbs[0][0]}`)
    meta.textContent = bits.join(' · ')
    if (bits.length) td.appendChild(meta)

    // tiles
    const selKnown = p.sel_known ? p.sel_known[0] : 0
    const cncD = p.sel && p.sel['Closed Non-Competitive'] ? p.sel['Closed Non-Competitive'][0] : 0
    const cncShare = shareOf(cncD, selKnown)
    const elKnown = p.el_known ? p.el_known[0] : 0
    const govShareOfMapped = p.seats ? shareOf(p.seats.gov ? p.seats.gov[0] : 0, heldDollars(p.seats)) : null
    const tiles = el('div', 'gr-tiles')
    tiles.append(
      tile(fmtMoney(p.t), `awarded in ${NUM.format(p.c)} ${noun}`),
      tile(NUM.format(p.r), 'recipients'),
    )
    if (p.dt > 0) tiles.append(tile(pct(shareOf(p.dt, p.t) || 0), `to recipients in the donor registers (${fmtMoney(p.dt)})`))
    if (cncShare != null) tiles.append(tile(pct(cncShare), `closed non-competitive, of the ${pct(shareOf(selKnown, p.t) || 0)} with a selection process recorded`))
    if (govShareOfMapped != null) tiles.append(tile(pct(govShareOfMapped), 'to seats held by the government of the day, of the dollars in seats with a member on the grant date'))
    if (p.t > 0) tiles.append(tile(pct(shareOf(elKnown, p.t) || 0), 'of the dollars are mapped to an electorate'))
    td.appendChild(tiles)
    // A reader arriving from a local story wants their seat, which sits below
    // the charts; one button takes them there (the router drops #hash links).
    if ((p.electorates || []).length) {
      const jump = el('button', 'ui-button gr-jump', `Jump to the ${NUM.format(p.electorates.length)} electorates`)
      jump.type = 'button'
      jump.dataset.uiSize = 'compact'
      jump.addEventListener('click', () => {
        const target = td.querySelector('.gr-electorates-kicker')
        if (!target) return
        target.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
        target.focus({ preventScroll: true })
      })
      td.appendChild(jump)
    }

    // selection process definitions from the notes file, under the tiles
    if (notes && notes.selection && p.sel) {
      const present = Object.keys(p.sel).filter((k) => notes.selection[k])
      if (present.length) {
        const det = el('details', 'gr-notes')
        det.appendChild(el('summary', null, 'How to read the selection process'))
        const dl = el('dl')
        for (const k of present) {
          const s = notes.selection[k]
          dl.appendChild(el('dt', null, k))
          const dd = el('dd', null, `${s.short ? s.short + ' ' : ''}${s.long || ''} `)
          if (s.source) { const a = link(s.source, 'Source'); a.target = '_blank'; a.rel = 'noopener'; dd.appendChild(a) }
          dl.appendChild(dd)
        }
        det.appendChild(dl)
        td.appendChild(det)
      }
    }

    const grid = el('div', 'gr-cols')
    const left = el('div')
    const right = el('div')

    // by year
    const years = Object.keys(p.by || {}).filter((fy) => p.by[fy] && p.by[fy][0] > 0).sort((a, b) => (fyStart(a) ?? 0) - (fyStart(b) ?? 0))
    if (years.length) {
      left.appendChild(el('p', 'gr-kicker', 'Awarded by financial year'))
      const chart = el('div', 'gr-chart')
      chart.appendChild(yearChartSvg(years, (fy) => ({ t: p.by[fy][0], c: p.by[fy][1], dt: 0 }), {
        width: Math.min(560, td.clientWidth || 560), interactive: false, noun,
        label: `${p.n}: dollars awarded by financial year`,
      }))
      left.appendChild(chart)
    }

    // selection process split
    if (p.sel && Object.keys(p.sel).length) {
      left.appendChild(el('p', 'gr-kicker', 'Selection process, where recorded'))
      const order = Object.entries(p.sel).sort((a, b) => b[1][0] - a[1][0]).map(([k]) => [k, k])
      left.appendChild(splitBar(bucketRows(p.sel, order), 'Selection process'))
      if (p.t > selKnown) left.appendChild(el('p', 'gr-caption', `${fmtMoney(p.t - selKnown)} of the ${noun} carry no selection process.`))
    }

    // seats and margins (federal only: QLD money is mapped to federal divisions, so the split would mislead)
    if (p.seats) {
      left.appendChild(el('p', 'gr-kicker', 'Who held the seat on the grant date'))
      left.appendChild(splitBar(bucketRows(p.seats, SEAT_BLOCS), 'Seat held by'))
      left.appendChild(el('p', 'gr-caption', 'Government, opposition and crossbench are read at the grant date, not today, from the member\'s party that day. A seat vacant on the grant date (between a resignation or death and the by-election) is nobody\'s and is left out of the government share.'))
    }
    // The figures the daily edition posts: the party holding each seat on the grant date against the House on those dates.
    if (p.told) {
      const t = p.told
      left.appendChild(el('p', 'gr-kicker', 'By the party holding the seat'))
      const rows = t.split.map((r) => ({ key: r.group, label: `${r.group}-held seats`, d: r.d, c: r.c, share: r.pct / 100 }))
      left.appendChild(splitBar(rows, 'By the party holding the seat on the grant date'))
      left.appendChild(el('p', 'gr-caption', `Share of House seats on the grant dates, weighted by value: ${t.split.map((r) => `${r.group} ${r.seatPct}%`).join(', ')}. ` +
        `${fmtMoney(t.mapped[0])} (${pct(shareOf(t.mapped[0], p.t) || 0)} of the dollars) is mapped to a seat with a member on the grant date. The party is the member's that day, from parliamentary service records with dated party changes; ` +
        'Labor and the Coalition as blocs, every other party and independent as the crossbench. Seats come from award postcodes and are approximate near boundaries.'))
    }
    if (p.margins) {
      left.appendChild(el('p', 'gr-kicker', 'Seat margin at the latest prior election'))
      left.appendChild(splitBar(bucketRows(p.margins, MARGIN_BUCKETS), 'Seat margin'))
      left.appendChild(el('p', 'gr-caption', '2019 and 2022 election results only; earlier grants unknown'))
    }

    // timing
    const mte = p.timing && p.timing.months_to_election
    if (mte) {
      right.appendChild(el('p', 'gr-kicker', qld ? 'Time to the next Queensland election' : 'Time to the next federal election'))
      right.appendChild(bucketList(bucketRows(mte, TIMING_BUCKETS)))
    }
    const a2s = p.timing && p.timing.approval_to_start_days
    if (a2s) {
      right.appendChild(el('p', 'gr-kicker', 'Approval to start'))
      right.appendChild(bucketList(bucketRows(a2s, APPROVAL_BUCKETS)))
      if (p.timing.approval_known && p.timing.approval_known[0] < p.t) {
        right.appendChild(el('p', 'gr-caption', `${fmtMoney(p.t - p.timing.approval_known[0])} carry no approval date.`))
      }
    }

    // top recipients
    if ((p.recipients || []).length) {
      right.appendChild(el('p', 'gr-kicker', p.recipients.length < p.r ? `Largest ${NUM.format(p.recipients.length)} of ${NUM.format(p.r)} recipients` : 'Recipients, largest first'))
      const ul = el('ul', 'gr-toplist')
      for (const [rid, name, kind, dollars, count, donor] of p.recipients.slice(0, 15)) {
        const li = el('li')
        const who = el('span')
        who.append(recipientRef(rid, name), el('small', 'gr-muted', ` ${kindLabel(kind)}`))
        if (donor) who.append(document.createTextNode(' '), el('span', 'ui-tag', 'in the donor registers'))
        const num = el('span', 'gr-num')
        num.append(document.createTextNode(`${fmtMoney(dollars)} `), el('span', 'gr-share', `${NUM.format(count)}`))
        li.append(who, num)
        ul.appendChild(li)
      }
      right.appendChild(ul)
    }
    grid.append(left, right)
    td.appendChild(grid)

    // notes: summary and audits
    if (progNotes && (progNotes.summary || (progNotes.audits || []).length)) {
      td.appendChild(el('p', 'gr-kicker', 'What the record says'))
      const box = el('div', 'gr-summary-note')
      if (progNotes.summary) box.appendChild(el('p', null, progNotes.summary))
      if ((progNotes.audits || []).length) {
        const ul = el('ul', 'gr-audits')
        for (const a of progNotes.audits) {
          const li = el('li')
          const title = a.url ? link(a.url, a.title) : el('b', null, a.title)
          if (a.url) { title.target = '_blank'; title.rel = 'noopener' }
          li.append(el('b', null, a.year ? `${a.year}: ` : ''), title)
          if (a.finding) li.append(document.createTextNode(` ${a.finding}`))
          ul.appendChild(li)
        }
        box.appendChild(ul)
      }
      td.appendChild(box)
    }

    // electorates
    if ((p.electorates || []).length) {
      const elKicker = el('p', 'gr-kicker gr-electorates-kicker', `Electorates (${NUM.format(p.electorates.length)})`)
      elKicker.tabIndex = -1
      td.appendChild(elKicker)
      const table = el('table', 'gr-electorates')
      const tb = el('tbody')
      const show = 24
      const addElectorateRows = (from, to) => {
        for (const e of p.electorates.slice(from, to)) {
          const row = el('tr')
          const n = el('td')
          n.append(el('span', null, e.n), document.createTextNode(' '), el('span', 'gr-muted', (e.st || '').toUpperCase()))
          row.appendChild(n)
          const v = el('td', 'gr-num', fmtMoney(e.t))
          v.title = AUD_FULL.format(e.t || 0)
          row.appendChild(v)
          row.appendChild(el('td', 'gr-num', NUM.format(e.c)))
          const split = el('td', 'gr-num')
          if (e.gov != null) {
            const parts = []
            if (e.gov > 0) parts.push(`govt ${fmtMoney(e.gov)}`)
            if (e.opp > 0) parts.push(`opp ${fmtMoney(e.opp)}`)
            if (e.cross > 0) parts.push(`cross ${fmtMoney(e.cross)}`)
            if (e.vacant > 0) parts.push(`vacant ${fmtMoney(e.vacant)}`)
            split.appendChild(el('span', 'gr-share', parts.join(' · ')))
          }
          row.appendChild(split)
          const held = el('td')
          const mps = el('span', 'gr-mps')
          for (const [name, party, dollars] of (e.holders || []).slice(0, 3)) {
            const chip = holderChip(name, party)
            if ((e.holders || []).length > 1) chip.append(el('span', 'gr-share', ` ${fmtMoney(dollars)}`))
            mps.appendChild(chip)
          }
          if (!(e.holders || []).length) mps.appendChild(el('span', 'gr-muted', '—'))
          held.appendChild(mps)
          row.appendChild(held)
          tb.appendChild(row)
        }
      }
      addElectorateRows(0, show)
      table.appendChild(tb)
      const scroll = el('div', 'gr-scroll')
      scroll.appendChild(table)
      td.appendChild(scroll)
      if (p.electorates.length > show) {
        const more = el('button', 'ui-button gr-more-rows', `Show all ${NUM.format(p.electorates.length)} electorates`)
        more.type = 'button'
        more.dataset.uiSize = 'compact'
        more.addEventListener('click', () => { addElectorateRows(show, p.electorates.length); more.remove() })
        td.appendChild(more)
      }
    }

    // grants table
    const grants = p.grants || []
    if (grants.length) {
      td.appendChild(el('p', 'gr-kicker', p.grants_total > grants.length
        ? `Largest ${NUM.format(grants.length)} of ${NUM.format(p.grants_total)} ${noun}`
        : `${noun.charAt(0).toUpperCase() + noun.slice(1)}, largest first`))
      const wrap = el('div', 'gr-grantswrap')
      wrap.setAttribute('role', 'region')
      wrap.tabIndex = 0
      wrap.setAttribute('aria-label', `${p.n}: grants (scrollable)`)
      const table = el('table', 'gr-pgrants')
      const thead = el('thead')
      const hr = el('tr')
      const heads = [['Grant', false], ['Recipient', false], ['Value', true], ['Date', true], ['Selection', false], ['Electorate', false]]
      if (!qld) heads.push(['Seat held by', false])
      for (const [label, num] of heads) {
        const th = el('th', num ? 'gr-num' : null, label)
        th.scope = 'col'
        hr.appendChild(th)
      }
      thead.appendChild(hr)
      table.appendChild(thead)
      const tb = el('tbody')
      const page = 200
      const addGrantRows = (from, to) => {
        for (const g of grants.slice(from, to)) {
          const row = el('tr')
          const what = el('td')
          const url = qld ? null : grantConnectUrl(g.guid)
          const title = g.n || g.id
          if (url) {
            const a = link(url, title)
            a.target = '_blank'
            a.rel = 'noopener'
            what.appendChild(a)
          } else what.appendChild(el('span', null, title))
          const sub = []
          if (!qld && g.id) sub.push(g.id)
          if (g.adhoc) sub.push('ad hoc / one-off')
          if (g.desc) sub.push(g.desc)
          if (sub.length) what.appendChild(el('small', null, sub.join(' · ')))
          row.appendChild(what)
          const who = el('td')
          who.appendChild(recipientRef(g.rid, g.rn || g.rid || '—'))
          if (g.k) who.appendChild(el('small', null, kindLabel(g.k)))
          row.appendChild(who)
          row.appendChild(el('td', 'gr-num', AUD_FULL.format(g.v || 0)))
          const when = el('td', 'gr-num', grantDate(g) || (g.fy ? fyShort(g.fy) : '—'))
          if (g.a && g.s && g.a !== g.s) when.title = `approved ${g.a}, started ${g.s}`
          row.appendChild(when)
          row.appendChild(el('td', g.sel ? null : 'gr-muted', g.sel || '—'))
          const where = el('td')
          if (g.el) where.append(el('span', null, g.el), document.createTextNode(' '), el('span', 'gr-muted', (g.elst || '').toUpperCase()))
          else where.appendChild(el('span', 'gr-muted', '—'))
          row.appendChild(where)
          if (!qld) {
            const holder = el('td')
            if (g.holder) {
              holder.appendChild(holderChip(g.holder[0], g.holder[1]))
              const flags = []
              if (g.bloc && g.bloc !== 'unknown') flags.push(g.bloc === 'gov' ? 'government' : g.bloc === 'opp' ? 'opposition' : 'crossbench')
              if (g.mt) flags.push(g.mt.replace(/_/g, ' '))
              if (flags.length) holder.appendChild(el('small', null, flags.join(' · ')))
            } else holder.appendChild(el('span', 'gr-muted', g.bloc === 'vacant' ? 'Vacant seat' : '—'))
            row.appendChild(holder)
          }
          tb.appendChild(row)
        }
      }
      addGrantRows(0, page)
      table.appendChild(tb)
      wrap.appendChild(table)
      td.appendChild(wrap)
      if (grants.length > page) {
        const more = el('button', 'ui-button gr-more-rows', `Show all ${NUM.format(grants.length)} ${noun}`)
        more.type = 'button'
        more.dataset.uiSize = 'compact'
        more.addEventListener('click', () => { addGrantRows(page, grants.length); more.remove() })
        td.appendChild(more)
      }
    }

    // links: one primary, one secondary, the rest are quiet links out
    const links = actionRow()
    links.appendChild(action(link(searchHash(progNotes && progNotes.hansard ? progNotes.hansard : p.n, {}), 'Search Hansard'), 'primary'))
    const csv = el('button', 'ui-button', 'Download these grants (CSV)')
    csv.type = 'button'
    csv.addEventListener('click', () => exportProgramCSV(p))
    links.appendChild(csv)
    const src = action(link(data.meta.source_url, qld ? 'Source: data.qld.gov.au' : 'Source: GrantConnect'), 'quiet')
    src.target = '_blank'
    src.rel = 'noopener'
    links.appendChild(src)
    links.appendChild(action(link(`${JURISDICTIONS[state.jur].dir}programs/${encodeURIComponent(r.key || programKey(r.id))}.json`, 'Raw file'), 'quiet'))
    td.appendChild(links)
    if (p.generated) td.appendChild(el('p', 'gr-caption', `Program file generated ${String(p.generated).slice(0, 10)}.`))
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
    downloadCSV(csv, `opax-grants-${state.jur}-${state.view}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  /** The open program's grants, one row each, with the seat and timing fields the file computed. */
  function exportProgramCSV (p) {
    const m = data.meta
    const comments = [
      `OPAX, Who gets the grants: program ${p.id} (${p.n})`,
      `Source: ${m.source} (${m.coverage}), via opax.com.au${JURISDICTIONS[state.jur].dir}programs/${p.key || programKey(p.id)}.json`,
      `Exported ${new Date().toISOString().slice(0, 10)} · ${(p.grants || []).length} of ${p.grants_total ?? (p.grants || []).length} grants, largest first`,
      'Seat holder, bloc and margin are read at the grant date (start date, else approval date); margins use the 2019 and 2022 election results only.',
      ...m.caveats,
      `Licence: ${m.licence}`,
    ]
    const csv = buildCSV('program', p.grants || [], { agencies: data.agencies }, comments)
    downloadCSV(csv, `opax-grants-${state.jur}-program-${p.key || programKey(p.id)}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function downloadCSV (csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
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
  $('.gr-done').addEventListener('click', () => { moreEl.open = false; $('.gr-more-btn').focus() })
  // The panel hangs off the button's left edge unless that would run off the
  // viewport (the button has wrapped to a second line), then off its right.
  moreEl.addEventListener('toggle', () => {
    if (!moreEl.open) return
    const pop = $('.gr-pop')
    pop.classList.remove('gr-pop-right')
    const r = pop.getBoundingClientRect()
    if (r.right > window.innerWidth - 8) pop.classList.add('gr-pop-right')
    const r2 = pop.getBoundingClientRect()
    if (r2.left < 8) pop.classList.remove('gr-pop-right')
  })
  const onDocClick = (e) => { if (moreEl.open && !moreEl.contains(e.target)) moreEl.open = false }
  const onKey = (e) => { if (e.key === 'Escape' && moreEl.open) { e.stopPropagation(); moreEl.open = false } }
  document.addEventListener('click', onDocClick)
  moreEl.addEventListener('keydown', onKey)
  for (const btn of root.querySelectorAll('.gr-jur')) {
    btn.addEventListener('click', () => {
      if (state.jur === btn.dataset.jur) return
      // program ids belong to one jurisdiction; a recipient may have a file in both
      state.program = null
      load(btn.dataset.jur).then(() => publishParams())
    })
  }
  /** Switches the view's segmented control and the filters that only some views carry. */
  function showView (view) {
    state.view = view
    for (const b of root.querySelectorAll('.gr-view')) b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false')
    // kind and agency filters only mean something on the views that carry them
    root.querySelector('.gr-field-kind').hidden = view !== 'recipients'
    root.querySelector('.gr-field-agency').hidden = view === 'electorates'
  }
  for (const btn of root.querySelectorAll('.gr-view')) {
    btn.addEventListener('click', () => {
      if (state.view === btn.dataset.view) return
      showView(btn.dataset.view)
      renderHead()
      render()
    })
  }
  /** Scrolls to and focuses the row button of an open file (the panel itself takes focus on phones). */
  function focusOpened (selector) {
    const btn = bodyEl.querySelector(selector)
    if (btn) {
      btn.scrollIntoView({ block: 'center' })
      btn.focus({ preventScroll: true })
    }
  }
  /** Opens a recipient's file in the Recipients view with the text filters cleared so its row is on the page. */
  function openRecipient (rid) {
    state.program = null
    state.open = rid
    state.q = ''
    searchEl.value = ''
    state.donors = false
    for (const b of root.querySelectorAll('.gr-donors')) b.setAttribute('aria-pressed', b.dataset.donors === '0' ? 'true' : 'false')
    if (state.view !== 'recipients') { showView('recipients'); renderHead() }
    publishParams()
    render()
    focusOpened(`.gr-open[data-id="${cssEscape(rid)}"]`)
  }
  /** Opens a program's file in the Programs view, likewise. */
  function openProgram (id) {
    state.open = null
    state.program = (data && resolveProgramId(data.programs, id)) || id
    state.q = ''
    searchEl.value = ''
    state.donors = false
    for (const b of root.querySelectorAll('.gr-donors')) b.setAttribute('aria-pressed', b.dataset.donors === '0' ? 'true' : 'false')
    if (state.view !== 'programs') { showView('programs'); renderHead() }
    publishParams()
    render()
    focusOpened(`.gr-open[data-program="${cssEscape(id)}"]`)
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
    const col = cols().find((c) => c.key === btn.dataset.key)
    if (!col) return
    if (sort.key === col.key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
    else { sort.key = col.key; sort.dir = col.numeric ? 'desc' : 'asc' }
    syncSortMarkers()
    render()
  })
  // One listener for every in-place opener: a recipient row (data-id), a
  // program row (data-program, also inside a recipient file's program list) and
  // a recipient named inside a program file (data-rid). Files can sit in the
  // table or in the phone panel, so the listener is on the root.
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.gr-open[data-id], .gr-open[data-program], .gr-open[data-rid]')
    if (!btn || !data) return
    if (btn.dataset.rid) { openRecipient(btn.dataset.rid); return }
    if (btn.dataset.program) {
      const id = btn.dataset.program
      if (state.view === 'programs' && state.program === id) {
        state.program = null
        publishParams()
        render()
        bodyEl.querySelector(`.gr-open[data-program="${cssEscape(id)}"]`)?.focus()
      } else openProgram(id)
      return
    }
    const id = btn.dataset.id
    state.open = state.open === id ? null : id
    publishParams()
    render()
    if (state.open) bodyEl.querySelector(`.gr-open[data-id="${cssEscape(id)}"]`)?.focus()
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

  /** One short source line (date, source, coverage, the ways in); the
   *  threshold, caveats and licence keep every word one tap below it. */
  function renderFineprint () {
    const m = data.meta
    const line = el('p', 'gr-fine-line', [
      m.generated ? `Updated ${shortDate(m.generated)}` : '', `${m.sourceShort || m.source}, ${m.coverage}`,
    ].filter(Boolean).join(' · ') + ' · ')
    line.append(link('/methods', 'Methodology'), ' · ', link(JURISDICTIONS[state.jur].file, 'Raw data'))
    const notes = el('details', 'gr-fine-notes')
    notes.append(el('summary', null, 'Notes, caveats and licence'),
      el('p', null, `${m.source}. ${m.threshold} ${m.caveats.join(' ')} Licence: ${m.licence}.`))
    fineEl.replaceChildren(line, notes)
  }

  /** The index, cached as a promise so a deep link that mounts and opens a file at once fetches it only once. */
  function fetchIndex (jur) {
    if (cache.has(jur)) return cache.get(jur)
    const url = JURISDICTIONS[jur].file
    const p = fetch(url, { signal: aborter.signal }).then((res) => {
      if (!res.ok) throw new Error(`${url} → ${res.status}`)
      return res.json()
    })
    p.catch(() => cache.delete(jur))
    cache.set(jur, p)
    return p
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
      if (state.program) state.program = resolveProgramId(data.programs, state.program) || state.program
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
      const retry = el('button', 'ui-button', 'Try again')
      retry.type = 'button'
      retry.dataset.uiSize = 'compact'
      retry.addEventListener('click', () => load(state.jur))
      statusEl.appendChild(retry)
    }
  }

  container.appendChild(root)
  load(state.jur)

  let destroyed = false
  return {
    /**
     * Open on a jurisdiction and, when given, one recipient's file
     * (`/explore?game=grants&jur=federal&open=abn:...`, the money map's link).
     */
    async open (rid, jur) {
      if (destroyed) return
      if (state.view !== 'recipients') showView('recipients')
      if (rid) {
        state.open = rid
        state.program = null
        state.q = ''
        searchEl.value = ''
        state.donors = false
        for (const b of root.querySelectorAll('.gr-donors')) b.setAttribute('aria-pressed', b.dataset.donors === '0' ? 'true' : 'false')
      }
      const target = JURISDICTIONS[jur] ? jur : state.jur
      if (target !== state.jur || !data) await load(target)
      else { renderHead(); render() }
      if (rid) focusOpened(`.gr-open[data-id="${cssEscape(rid)}"]`)
    },
    /**
     * Open on a jurisdiction and one program's file in the Programs view
     * (`/money/grants?jur=federal&program=GO3141`, the search catalog's link).
     */
    async openProgram (id, jur) {
      if (destroyed) return
      if (state.view !== 'programs') showView('programs')
      if (id) {
        state.program = (data && resolveProgramId(data.programs, id)) || id
        state.open = null
        state.q = ''
        searchEl.value = ''
        state.donors = false
        for (const b of root.querySelectorAll('.gr-donors')) b.setAttribute('aria-pressed', b.dataset.donors === '0' ? 'true' : 'false')
      }
      const target = JURISDICTIONS[jur] ? jur : state.jur
      if (target !== state.jur || !data) await load(target)
      else { renderHead(); render() }
      if (id) focusOpened(`.gr-open[data-program="${cssEscape(state.program)}"]`)
    },
    destroy () {
      if (destroyed) return
      destroyed = true
      aborter.abort()
      document.removeEventListener('click', onDocClick)
      root.remove()
    },
  }
}
