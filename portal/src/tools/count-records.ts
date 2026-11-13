/** Exact counts over the full published page exports, never ranked search hits. */
import { readToolAsset, type ToolArgs, type ToolCitation, type ToolDefinition } from './types'
import { fold, siteUrl } from './record-common'
import { recordCount } from '../research-record-answer'

type Row = Record<string, unknown>
type Window = { since?: string; until?: string; label: string }
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CHAMBERS: Record<string, { jurisdiction: string; prefix: string; label: string }> = {
  representatives: { jurisdiction: 'federal', prefix: 'federal-representatives-', label: 'House of Representatives' },
  senate: { jurisdiction: 'federal', prefix: 'federal-senate-', label: 'Senate' },
  nsw_la: { jurisdiction: 'nsw', prefix: 'nsw-la-', label: 'NSW Legislative Assembly' },
  nsw_lc: { jurisdiction: 'nsw', prefix: 'nsw-lc-', label: 'NSW Legislative Council' },
  vic_la: { jurisdiction: 'vic', prefix: 'vic-la-', label: 'Victorian Legislative Assembly' },
  vic_lc: { jurisdiction: 'vic', prefix: 'vic-lc-', label: 'Victorian Legislative Council' },
  qld_la: { jurisdiction: 'qld', prefix: 'qld-la-', label: 'Queensland Legislative Assembly' },
}
// First sittings, shared with the bill export's PARLIAMENT_STARTS (39th to 48th).
// Bills use their explicit parliament field, rather than inferring a term from a date.
const STARTS = ['1998-11-10', '2002-02-12', '2004-11-16', '2008-02-12', '2010-09-28', '2013-11-12', '2016-08-30', '2019-07-02', '2022-07-26', '2025-07-22']
// Match the shared Ask TERMS dissolution bounds for its named recent terms.
const DISSOLVED: Record<string, string> = { '46th': '2022-04-11', '47th': '2025-03-28' }
const terms = STARTS.map((_, i) => `${i + 39}${i === 2 ? 'st' : i === 3 ? 'nd' : i === 4 ? 'rd' : 'th'}`)
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const day = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const endMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
const previousDay = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
const fyStart = (value: string) => Number(value.slice(0, 4))
function windowFor(args: ToolArgs): Window {
  if (args.date) return { since: String(args.date), until: String(args.date), label: `on ${args.date}` }
  if (args.month) {
    const [year, month] = String(args.month).split('-').map(Number)
    return { since: `${args.month}-01`, until: endMonth(year, month), label: `in ${args.month}` }
  }
  if (args.year) return { since: `${args.year}-01-01`, until: `${args.year}-12-31`, label: `in ${args.year}` }
  if (args.financial_year) {
    const year = fyStart(String(args.financial_year))
    return { since: `${year}-07-01`, until: `${year + 1}-06-30`, label: `in financial year ${year}-${String(year + 1).slice(-2)}` }
  }
  if (args.term) {
    const i = terms.indexOf(String(args.term))
    const until = DISSOLVED[String(args.term)] ?? (STARTS[i + 1] ? previousDay(STARTS[i + 1]) : undefined)
    return { since: STARTS[i], ...(until ? { until } : {}), label: `in the ${args.term} Parliament` }
  }
  const since = args.since as string | undefined, until = args.until as string | undefined
  return { since, until, label: since && until ? `from ${since} to ${until} inclusive` : since ? `since ${since} (inclusive, to the published snapshot)` : until ? `up to ${until} inclusive` : 'in the published snapshot' }
}
function valid(args: ToolArgs): boolean {
  const selectors = ['date', 'month', 'year', 'financial_year', 'term'].filter(key => args[key] !== undefined)
  if (selectors.length > 1 || selectors.length && (args.since !== undefined || args.until !== undefined)) return false
  for (const key of ['date', 'since', 'until']) if (args[key] !== undefined && !day(args[key])) return false
  if (args.since && args.until && String(args.since) > String(args.until)) return false
  if (args.month && !day(`${args.month}-01`)) return false
  if (args.financial_year) {
    const value = String(args.financial_year), end = value.split('-')[1], year = fyStart(value)
    if (Number(end) !== (end.length === 2 ? (year + 1) % 100 : year + 1)) return false
  }
  const chamber = CHAMBERS[String(args.chamber)], jurisdiction = args.jurisdiction ?? chamber?.jurisdiction ?? 'federal'
  if (chamber && chamber.jurisdiction !== jurisdiction) return false
  if (args.term && jurisdiction !== 'federal') return false
  if (args.record_type === 'divisions' && (args.status !== undefined || args.include_records !== undefined)) return false
  if (args.record_type === 'bills' && (jurisdiction !== 'federal' || args.bill !== undefined)) return false
  return true
}
function catalog(value: unknown, field: string): Row[] {
  if (!object(value) || !Array.isArray(value[field]) || !value[field].every(object)) throw new Error('Published index is unavailable.')
  const rows = value[field] as Row[]
  if (rows.some(row => typeof row.key !== 'string' || !row.key) || new Set(rows.map(row => row.key)).size !== rows.length) throw new Error('Invalid published record keys.')
  // Never present an incomplete export as an exact zero or a complete count.
  if (typeof value.count === 'number' && value.count !== rows.length) throw new Error('Incomplete published index.')
  return rows
}
const inWindow = (date: unknown, window: Window) => day(date) && (!window.since || date >= window.since) && (!window.until || date <= window.until)
function dateRange(rows: Row[], field: string) {
  const dates = rows.map(row => row[field]).filter(day).sort()
  return { first_record_date: dates[0] ?? null, last_record_date: dates.at(-1) ?? null, undated_records: rows.length - dates.length }
}
function groups(rows: Row[], field: string, by: string, window: Window, range: ReturnType<typeof dateRange>) {
  const size = by === 'month' ? 7 : 4, counts = new Map<string, number>()
  for (const row of rows) if (day(row[field])) {
    const period = row[field].slice(0, size)
    counts.set(period, (counts.get(period) ?? 0) + 1)
  }
  // Include quiet months and years, so a trend does not silently omit zero counts.
  const start = window.since ?? range.first_record_date, end = window.until ?? range.last_record_date
  if (start && end && start <= end) {
    let cursor = start.slice(0, size), last = end.slice(0, size)
    while (cursor <= last) {
      if (!counts.has(cursor)) counts.set(cursor, 0)
      const year = Number(cursor.slice(0, 4)), month = Number(cursor.slice(5, 7))
      cursor = by === 'year' ? String(year + 1) : month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }))
}

export const tool: ToolDefinition = {
  name: 'count_records',
  description: 'Exact counts of all published divisions or bills, filtered by jurisdiction, chamber and period. Use for any "how many", "number of", "more or fewer than", bill pass rate, division or bill trend question. Use the complete scoped index for counts. group_by year/month returns every period including zero counts. Bills use introduction date and originating chamber; status is the snapshot status of that introduction cohort, not the date a bill passed. term uses the bill parliament field. bill counts all divisions linked on that bill page. include_records lists the matching bill titles. Returns snapshot/build date, latest record date and coverage limits. State the number first, with the requested chamber and period. For exact speech counts use count_speeches, or speech_trend for periods; the bill page speech list is capped.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    record_type: { type: 'string', enum: ['divisions', 'bills'] },
    jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'vic', 'qld'], description: 'Default federal; inferred from a named state chamber when omitted. Bills cover federal parliament only.' },
    chamber: { type: 'string', enum: Object.keys(CHAMBERS), description: 'Bills: originating chamber. Divisions: chamber in which the vote occurred.' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'One calendar day, YYYY-MM-DD. Use one period selector, or since/until.' },
    month: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'One calendar month, YYYY-MM.' },
    year: { type: 'integer', minimum: 1900, maximum: 2199 },
    financial_year: { type: 'string', pattern: '^(?:19|20|21)\\d{2}-\\d{2}(?:\\d{2})?$', description: 'Australian financial year, e.g. 2024-25 or 2024-2025, July to June.' },
    term: { type: 'string', enum: terms, description: 'Federal parliament ordinal. Bills use registry parliament. Divisions use first sitting boundaries, with dissolution bounds for the 46th/47th as in Ask. Current/last term: 48th/47th.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Inclusive start, YYYY-MM-DD. Since a year means YYYY-01-01.' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Inclusive end, YYYY-MM-DD. Omit for counts through the published snapshot.' },
    group_by: { type: 'string', enum: ['year', 'month'] },
    status: { type: 'string', enum: ['before_parliament', 'passed', 'lapsed', 'negatived', 'exposure_draft'], description: 'Bills only. negatived: defeated on its final recorded question; lapsed excludes those. Returns count, denominator and share_percent within the same cohort.' },
    bill: { type: 'string', minLength: 2, maxLength: 500, description: 'Divisions only: exact published bill key or full title. Count the exact bill page links.' },
    include_records: { type: 'boolean', description: 'Bills only: include up to 50 matching bill titles/links; total always counts every matching record.' },
  }, required: ['record_type'], examples: [
    { record_type: 'divisions', chamber: 'senate', date: '2025-07-31' },
    { record_type: 'bills', month: '2015-08' },
    { record_type: 'divisions', chamber: 'nsw_lc', since: '2025-01-01', group_by: 'month' },
    { record_type: 'bills', term: '47th', status: 'passed' },
  ] },
  validate: valid,
  stepLabel: args => ({ label: `Counting ${args.record_type}`, arg: String(args.date ?? args.month ?? args.year ?? args.term ?? args.since ?? '') }),
  async handler(env, args) {
    const kind = String(args.record_type), chamber = CHAMBERS[String(args.chamber)]
    const jurisdiction = String(args.jurisdiction ?? chamber?.jurisdiction ?? 'federal'), window = windowFor(args)
    const path = `/${kind}/index.json`, raw = await readToolAsset(env, path), all = catalog(raw, kind)
    const index = raw as Row
    let rows = all, bill: Row | undefined
    const field = kind === 'bills' ? 'introduced' : 'date'
    if (kind === 'divisions' && args.bill) {
      const bills = catalog(await readToolAsset(env, '/bills/index.json'), 'bills'), name = fold(args.bill)
      const matches = bills.filter(row => row.key === args.bill || fold(row.title) === name || fold(row.short_title) === name)
      if (matches.length !== 1) return { rows: [], citations: [], notes: [matches.length ? 'Several bill records have that title. Use the exact bill key.' : 'No published bill matches that exact title or key.'], error: matches.length ? 'Ambiguous bill.' : 'Bill not found.' }
      bill = matches[0]
      const detail = await readToolAsset(env, `/bills/${bill.key}.json`)
      rows = catalog(detail, 'divisions')
      if (!object(detail) || detail.key !== bill.key || typeof bill.divisions === 'number' && bill.divisions !== rows.length) throw new Error('Incomplete bill division links.')
    }
    rows = rows.filter(row => kind === 'bills'
      ? (row.jurisdiction === jurisdiction || row.jurisdiction === undefined && jurisdiction === 'federal') && (!chamber || row.originating_house === args.chamber)
      : String(row.key).startsWith(chamber?.prefix ?? `${jurisdiction}-`))
    const range = dateRange(rows, field), scopedCount = rows.length
    const termNumber = args.term ? Number.parseInt(String(args.term)) : undefined
    const dateFiltered = Boolean(args.date || args.month || args.year || args.financial_year || args.since || args.until || args.term && kind === 'divisions')
    const cohort = rows.filter(row => (!termNumber || kind !== 'bills' || row.parliament === termNumber) && (!dateFiltered || inWindow(row[field], window)))
    const selected = cohort.filter(row => !args.status || row.status === args.status), total = selected.length
    const snapshot = { generated_at: typeof index.generated_at === 'string' ? index.generated_at : null, latest_record_date: dateRange(all, field).last_record_date }
    const where = chamber ? `in the ${chamber.label}` : `in ${jurisdiction === 'federal' ? 'federal parliament' : jurisdiction.toUpperCase()}`
    const metric = kind === 'divisions' ? `recorded divisions${bill ? ` linked to ${bill.title}` : ''}` : `${args.status ? String(args.status).replace(/_/g, ' ') + ' ' : ''}bill records by introduction date`
    const url = siteUrl(env, bill ? `/bill/${bill.key}` : `/${kind}`)
    const coverage = { ...range, indexed_records: scopedCount, jurisdiction, chamber: args.chamber ?? null, completeness: 'published-records-only',
      // These are the exact query selection, separate from observed record coverage above.
      since: window.since ?? null, until: window.until ?? null, as_of: snapshot.generated_at?.slice(0, 10) ?? null,
      ...(window.since ? { requested_since: window.since } : {}), ...(window.until ? { requested_until: window.until } : {}),
      note: `Full published-index selection ${window.label}; ${kind === 'bills' && args.term ? 'bill parliament metadata defines the cohort; ' : ''}observed indexed dates ${range.first_record_date ?? 'unavailable'} to ${range.last_record_date ?? 'unavailable'}. Query bounds do not establish complete historical coverage.`,
      ...(object(index.coverage) ? { source_coverage: index.coverage } : {}) }
    const outside = dateFiltered && !!(window.until && range.first_record_date && window.until < range.first_record_date || window.since && range.last_record_date && window.since > range.last_record_date)
    if (outside) return { rows: [], total: null, coverage: { ...coverage, matched: false }, citations: [{ kind: 'record', url,
      text: `The published ${kind} index covers ${range.first_record_date} to ${range.last_record_date}; it does not establish a count ${window.label}. No zero has been inferred for an uncovered period.` }],
      notes: ['The requested period is outside the dated index. Search original corpus records for historical debates; do not treat an uncovered year as an absence.'], filter: args, query: { method: 'full-published-index', path, window } }
    const notes = [
      `Exact count of the full published ${bill ? 'bill division links' : `${kind} index`}; not a ranked sample. Coverage ${where}: ${range.first_record_date ?? 'no dated records'} to ${range.last_record_date ?? 'no dated records'}. This describes indexed records, not proof of complete parliamentary history.`,
      snapshot.generated_at ? `Published snapshot build date: ${snapshot.generated_at}. This is a build stamp, not a live data currency guarantee. Latest indexed ${field} date: ${snapshot.latest_record_date ?? 'not recorded'}.` : `Snapshot build date is not published. Latest indexed ${field} date: ${snapshot.latest_record_date ?? 'not recorded'}; this is not a generation timestamp.`,
    ]
    if ((dateFiltered || args.group_by) && range.undated_records) notes.push(`${range.undated_records} records in this chamber/jurisdiction have no usable ${field} date and cannot be assigned to a date window or year/month group.`)
    if (kind === 'bills') {
      notes.push('Dates are introduction dates and chambers are originating chambers. A status filter gives the snapshot status of that cohort, not bills passing on those dates.')
      const drafts = selected.filter(row => row.status === 'exposure_draft').length
      if (drafts) notes.push(`${drafts} of these registry records are exposure drafts; their introduced field is a release date, not parliamentary introduction.`)
    }
    if ((window.since && range.first_record_date && window.since < range.first_record_date) || (window.until && range.last_record_date && window.until > range.last_record_date)) notes.push('The requested window extends beyond the dated records in this published selection; counts cover indexed records only, including any zero periods.')
    const aggregate = args.group_by ? groups(selected, field, String(args.group_by), window, range) : [{ period: window.label, count: total }]
    const countText = (row: { period: string; count: number }) => {
      const period = args.group_by ? `in ${row.period}` : window.label
      // Exposure drafts have release dates, so retain the registry wording for mixed cohorts.
      if (kind !== 'bills' || args.status || !args.date || args.group_by || selected.some(row => row.status === 'exposure_draft')) return `${row.count} ${metric} ${where} ${period}`
      const datedPeriod = period.replace(/\d{4}-\d{2}-\d{2}/g, date => new Date(date + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
      return `${recordCount(row.count)} ${row.count === 1 ? 'bill was' : 'bills were'} introduced ${where} ${datedPeriod}.`
    }
    const citations: ToolCitation[] = []
    if (args.group_by && aggregate.length > 24) {
      // Compact long series so Ask can select every group within its fact budget.
      // Canonical rows still contain each individual period and its exact count.
      for (let offset = 0; offset < aggregate.length; offset += 20) {
        const chunk = aggregate.slice(offset, offset + 20), count = chunk.reduce((sum, row) => sum + row.count, 0)
        citations.push({ kind: 'count', text: `${count} ${metric} ${where} across ${chunk[0].period} to ${chunk.at(-1)!.period}, within the selection ${window.label}; by ${args.group_by}: ${chunk.map(row => `${row.count} in ${row.period}`).join('; ')}`, value: count, url })
      }
    } else citations.push(...aggregate.map(row => ({ kind: 'count' as const, text: countText(row), value: row.count, url })))
    if (args.group_by) citations.push({ kind: 'count', text: `${total} ${metric} ${where} ${window.label}`, value: total, url })
    if (!aggregate.length) citations.push({ kind: 'count', text: `${total} ${metric} ${where} ${window.label}`, value: total, url })
    const share = cohort.length ? Math.round(total / cohort.length * 10000) / 100 : null
    if (args.status) citations.push({ kind: 'count', text: `${cohort.length} bill records in the introduction cohort ${where} ${window.label}; ${total} have snapshot status ${args.status}${share === null ? '; a share cannot be calculated for an empty cohort' : ` (${share}%)`}`, value: cohort.length, url })
    const records = args.include_records ? selected.slice(0, 50).map(row => ({ key: row.key, title: row.title, introduced: row.introduced, chamber: row.originating_house, status: row.status, url: siteUrl(env, `/bill/${row.key}`) })) : undefined
    if (records) {
      citations.push(...records.map(row => ({ kind: 'record' as const, text: `${row.title}: ${row.status === 'exposure_draft' ? 'exposure draft released' : 'introduced'} ${row.introduced ?? 'date not recorded'}${row.chamber ? ` in the ${CHAMBERS[String(row.chamber)]?.label ?? row.chamber}` : ''}`, url: row.url })))
      if (selected.length > records.length) notes.push(`Showing ${records.length} of ${total} matching bill titles; the count includes them all.`)
    }
    return { total, rows: aggregate, ...(args.group_by ? { ungrouped_records: selected.filter(row => !day(row[field])).length } : {}), ...(args.status ? { denominator: cohort.length, share_percent: share } : {}), ...(records ? { records } : {}), snapshot, coverage,
      citations, notes, filter: args, query: { method: bill ? 'published-bill-division-links' : 'full-published-index', path, date_field: field, window, ...(bill ? { bill_key: bill.key } : {}) } }
  },
}
