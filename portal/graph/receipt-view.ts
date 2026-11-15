import {cpiMultiplier} from './cpi.ts'
import {financialYear} from '../public/money-scope.js'
type YearCell = [number, number]
type ReceiptMeasure = 'all_types' | 'donation_only'
type YearFigures = {
  by_type?: Record<string, number>
  by_type_year?: Record<string, Record<string, YearCell>>
  total?: number
  count?: number
  firstYear?: number | null
  lastYear?: number | null
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
  receiptMeasure: ReceiptMeasure = 'all_types',
): T {
  if (x.by_type) return typedReceiptFigures(x, lo, hi, adjustForInflation, receiptMeasure)
  if (lo === -Infinity && hi === Infinity && !adjustForInflation) return x
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

const RECEIPT_EVENT_YEARS: Record<string, number> = { 'braddon by-election': 2018, 'wentworth by-election': 2018, 'eden-monaro by-election': 2020, 'fadden by-election': 2023 }

function typedReceiptFigures<T extends YearFigures>(x: T, lo: number, hi: number, cpi: boolean, measure: ReceiptMeasure): T {
  // Public Funding is election funding, never a donor's money, under either measure (A35).
  const wanted = (kind: string) => kind !== 'public_funding' && (measure === 'all_types' || kind === 'donation_received')
  const bounded = Number.isFinite(lo) || Number.isFinite(hi)
  let total = 0, count = 0
  let firstYear: number | null = null, lastYear: number | null = null
  const byYear: Record<string, YearCell> = {}
  for (const [period, types] of Object.entries(x.by_type_year || {})) {
    // Annual keys are financial years; event keys use polling year. Named
    // by-elections follow the exporter's documented polling-year fallback.
    const year = Number(period.match(/\b(?:19|20)\d{2}\b/)?.[0]) || RECEIPT_EVENT_YEARS[period.toLowerCase()]
    if (bounded && (!year || year < lo || year > hi)) continue
    let dollars = 0, n = 0
    for (const [kind, cell] of Object.entries(types)) {
      if (!wanted(kind)) continue
      dollars += cell[0]; n += cell[1]
    }
    const amount = cpi && year ? dollars * cpiMultiplier(year) : dollars
    total += amount; count += n
    if (year && n > 0) {
      const cell = byYear[String(year)] ||= [0, 0]
      cell[0] += amount; cell[1] += n
      firstYear = firstYear === null ? year : Math.min(firstYear, year)
      lastYear = lastYear === null ? year : Math.max(lastYear, year)
    }
  }
  // Lifetime amounts use the authoritative by_type cells. Never substitute
  // legacy total/byYear, including for an empty typed object or missing year.
  if (!bounded && !cpi) total = Object.entries(x.by_type!).reduce((sum, [kind, amount]) => sum + (wanted(kind) ? amount : 0), 0)
  return { ...x, total, count, firstYear, lastYear, byYear, undated: undefined }
}

/** A party's own-return figures in a window, or null for a node or file without them. */
export function partyReturnWindow(n: YearFigures & {kind: string; return_by_type?: Record<string, number>; return_by_type_year?: Record<string, Record<string, YearCell>>}, lo = -Infinity, hi = Infinity, cpi = false, measure: ReceiptMeasure = 'all_types') {
  if (n.kind !== 'party' || !n.return_by_type || !Object.keys(n.return_by_type).length) return null
  const { total, count, firstYear, lastYear } = typedReceiptFigures({ total: 0, count: 0, firstYear: null, lastYear: null,
    by_type: n.return_by_type, by_type_year: n.return_by_type_year ?? {} }, lo, hi, cpi, measure)
  return { total, count, firstYear, lastYear }
}

/** What a party's headline counts and leaves out: the party page's words (register-tables.js, partyReturnScopeLabel). */
export function partyReturnScope(first: number | null, last: number | null): string {
  const fy = financialYear
  const span = first == null ? '' : first === last || last == null ? `, ${fy(first)}` : `, ${fy(first)} to ${fy(last)}`
  return `Itemised receipts in the party's own federal returns${span}, each counted once. `
    + "Public funding, tax refunds and other government payments, transfers between the party's own branches and amounts under the disclosure threshold are not included."
}

export function receiptMeasureLabel(measure: ReceiptMeasure): string {
  return measure === 'donation_only' ? 'Donation-only' : 'All receipt types'
}

export function moneyYearBounds(raw: {edges: (YearFigures & {flow?: string; grant?: boolean})[]}) {
  const receiptEdges = raw.edges.filter(e => !e.flow && !e.grant)
  const years = receiptEdges.flatMap(e => e.by_type_year
    ? Object.keys(e.by_type_year).filter(key => /^\d{4}-\d{2}$/.test(key)).map(key => Number(key.slice(0, 4)))
    : [e.firstYear, e.lastYear].filter((y): y is number => y != null))
  return {min: years.length ? Math.min(...years) : 1998, max: years.length ? Math.max(...years) : 1998}
}

/** One projection for map geometry, industry rankings, cards and the 2D fallback. */
export function receiptGraphView<T extends {nodes: (YearFigures & {kind: string})[]; edges: YearFigures[]}>(raw: T, measure: ReceiptMeasure = 'all_types', from = -Infinity, to = Infinity, cpi = false): T {
  return { ...raw, nodes: raw.nodes.map(n => {
    const shown = windowFigures(n, from, to, cpi, measure)
    // A party's headline is its whole return; its by_type cells (and so its
    // geometry) only sum the donors drawn on the map.
    const own = partyReturnWindow(n, from, to, cpi, measure)
    return own ? { ...shown, partyReturn: own } : shown
  }),
    edges: raw.edges.map(e => windowFigures(e, from, to, cpi, measure)) } as T
}

