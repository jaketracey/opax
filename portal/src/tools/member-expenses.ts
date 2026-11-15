/** IPEA expenses grouped by reporting quarter, rather than the transaction date. */
import { personUrl } from '../../public/party-page.js'
import { yearCoverage } from '../../public/expense-coverage.js'
import { aud, clip, fold, readableRange, siteUrl } from './record-common'
import { readToolAsset, readToolMedia, type ToolArgs, type ToolCitation, type ToolDefinition, type ToolEnv, type ToolInputSchema } from './types'

interface Expenses {
  meta: { from: string; to: string; quarters: number; reporting_periods?: string[]; attribution?: string }
  names: Record<string, string>
  people: Record<string, { name: string; by_year?: [number, number][]; by_financial_year?: [string, number][] }>
}
interface Period { label: string; key: number | string; financial: boolean; since: string; until: string; quarters: string[] }
const quarter = (year: number, q: number) => `${year}Q0${q}`
function period(args: ToolArgs): Period | null {
  const value = String(args.year ?? '').replace(/[–−]/g, '-')
  const match = /^(\d{4})(?:-(\d{2}|\d{4}))?$/.exec(value)
  let year: number, financial: boolean
  if (match) {
    year = Number(match[1]); financial = !!match[2]
    if (financial && Number(match[2]) !== (match[2].length === 2 ? (year + 1) % 100 : year + 1)) return null
  } else if (args.year === undefined && typeof args.since === 'string' && typeof args.until === 'string') {
    year = Number(args.since.slice(0, 4)); financial = args.since.endsWith('-07-01')
  } else return null
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null
  const since = `${year}-${financial ? '07-01' : '01-01'}`, until = `${financial ? year + 1 : year}-${financial ? '06-30' : '12-31'}`
  if (args.since !== undefined && args.since !== since || args.until !== undefined && args.until !== until) return null
  const key = financial ? `${year}-${String((year + 1) % 100).padStart(2, '0')}` : year
  return { label: `${financial ? 'financial' : 'calendar'} year ${key}`, key, financial, since, until,
    quarters: financial ? [quarter(year, 3), quarter(year, 4), quarter(year + 1, 1), quarter(year + 1, 2)] : [1, 2, 3, 4].map(q => quarter(year, q)) }
}
const quarterBounds = (id: string) => {
  const match = /^(\d{4})Q0([1-4])$/.exec(id)
  if (!match) return null
  const year = match[1], q = Number(match[2])
  return { since: `${year}-${['01-01', '04-01', '07-01', '10-01'][q - 1]}`, until: `${year}-${['03-31', '06-30', '09-30', '12-31'][q - 1]}` }
}
function reportingPeriods(meta: Expenses['meta']): Set<string> {
  if (meta.reporting_periods) return new Set(meta.reporting_periods)
  // Older exports have endpoints and a count. Only infer continuity when all quarters reconcile.
  if (!quarterBounds(meta.from) || !quarterBounds(meta.to) || meta.from > meta.to) return new Set()
  const ids: string[] = []
  for (let year = Number(meta.from.slice(0, 4)); year <= Number(meta.to.slice(0, 4)); year++) {
    for (let q = 1; q <= 4; q++) { const id = quarter(year, q); if (id >= meta.from && id <= meta.to) ids.push(id) }
  }
  return new Set(ids.length === meta.quarters ? ids : [])
}

// ---- partial years ----------------------------------------------------------------------------------------------
// A figure for a year IPEA has not finished publishing says what it covers, e.g. "January to June 2026 (two quarters
// published)", worked out from the quarters held (public/expense-coverage.js), never from today's date. A finished
// year says nothing extra. Ask states it now. The public MCP output keeps its earlier wording while its directory
// reviews are pending: to switch MCP on, make this return true (the citation text and the row's `covers` then
// change for MCP exactly as they have for Ask; the tool list, names and schemas do not change).
const statesCoverage = (env: ToolEnv) => env.ask === true

// ---- itemised lines -------------------------------------------------------------------------------------------
// Every IPEA line per person and reporting year, exported by scripts/export_expenses_itemised.py to the media
// bucket. The export writes who travelled as a role only; nothing here reads or returns a traveller's name.
interface Itemised { meta?: { name?: string; quarters?: { id: string; label?: string; source_url?: string }[] }; columns?: string[]; lines?: unknown[][] }
interface Line { quarter: string; from_date: string | null; to_date: string | null; category_high: string | null; category_major: string | null; category_minor: string | null
  description: string | null; from_location: string | null; to_location: string | null; nights: number | null; nightly_rate: number | null; amount: number
  reason: string | null; notes: string | null; traveller: string | null }
const GROUPS = ['fares', 'allowance', 'car', 'unscheduled', 'overseas', 'family', 'staff', 'office', 'other'] as const
type Group = typeof GROUPS[number]
const GROUP_LABEL: Record<Group, string> = { fares: 'scheduled fares', allowance: 'travel allowance', car: 'car costs', unscheduled: 'unscheduled transport and charter',
  overseas: 'overseas travel', family: 'family travel', staff: 'staff travel and employee costs', office: 'office, printing and telecommunications', other: 'other' }
/** The group of a line, from IPEA's own category tree (its names changed over the years). */
export function expenseGroup(high: string | null, major: string | null): Group {
  const h = (high ?? '').toLowerCase(), m = (major ?? '').toLowerCase()
  if (h.includes('family')) return 'family'
  if (h.includes('employee')) return 'staff'
  if (h.includes('office') || h.includes('telecommunication')) return 'office'
  if (h.includes('overseas') || h.includes('international')) return 'overseas'
  if (h.includes('allowance')) return 'allowance'
  if (h.includes('unscheduled') || h.includes('charter')) return 'unscheduled'
  if (h.includes('scheduled') || m === 'fares') return 'fares'
  if (h.includes('car')) return 'car'
  return 'other'
}
const CATEGORIES = ['travel', ...GROUPS.filter(g => g !== 'other'), 'all'] as const
const inCategory = (group: Group, category: string) => category === 'all' || (category === 'travel' ? group !== 'office' && group !== 'other' : group === category)
const CATEGORY_LABEL = (category: string) => category === 'all' ? 'expense' : category === 'travel' ? 'travel' : GROUP_LABEL[category as Group]
const cents = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const LINE_PAGE = 100, LINE_BYTES = 9_000
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
function readLines(file: Itemised | null): Line[] {
  if (!file || !Array.isArray(file.columns) || !Array.isArray(file.lines)) return []
  const at = (name: string) => file.columns!.indexOf(name)
  const col = { quarter: at('quarter'), from_date: at('from_date'), to_date: at('to_date'), high: at('category_high'), major: at('category_major'), minor: at('category_minor'),
    description: at('description'), from: at('from_location'), to: at('to_location'), nights: at('nights'), rate: at('nightly_rate'), amount: at('amount'), reason: at('reason'), notes: at('notes'), traveller: at('traveller') }
  if (col.quarter < 0 || col.amount < 0) return []
  return file.lines.flatMap(raw => {
    const amount = num(raw[col.amount]), quarter = text(raw[col.quarter])
    return amount === null || !quarter ? [] : [{ quarter, from_date: text(raw[col.from_date]), to_date: text(raw[col.to_date]), category_high: text(raw[col.high]), category_major: text(raw[col.major]),
      category_minor: text(raw[col.minor]), description: text(raw[col.description]), from_location: text(raw[col.from]), to_location: text(raw[col.to]), nights: num(raw[col.nights]),
      nightly_rate: num(raw[col.rate]), amount, reason: text(raw[col.reason]), notes: text(raw[col.notes]), traveller: text(raw[col.traveller]) }]
  })
}
/** Who travelled, as a role only. The export writes Member, Family member or Staff; any other value is never
 *  repeated (it could be a name) and reads as another traveller. The member's own lines say nothing. */
const TRAVELLER_ROLES: Record<string, string> = { member: '', 'family member': 'family member', staff: 'staff' }
const travellerRole = (value: string | null) => value === null ? '' : TRAVELLER_ROLES[value.trim().toLowerCase()] ?? 'another traveller'
/** One line as IPEA published it, in a sentence a reader can follow. */
function lineText(line: Line, quarterLabel: string): string {
  const kind = [line.category_major ?? line.category_high, line.category_minor].filter(Boolean).join(', ')
  const parts = [clip(line.description, 90)]
  const route = [line.from_location, line.to_location].filter(Boolean).join(' to ')
  if (route && !(line.description ?? '').includes(line.to_location ?? route)) parts.push(route)
  const dates = readableRange(line.from_date, line.to_date)
  if (dates) parts.push(dates)
  if (line.nights) parts.push(`${line.nights} night${Math.abs(line.nights) === 1 ? '' : 's'}${line.nightly_rate ? ' at ' + cents(line.nightly_rate) : ''}`)
  if (line.reason) parts.push(clip(line.reason, 80))
  if (line.notes) parts.push(clip(line.notes, 60))
  const role = travellerRole(line.traveller)
  if (role) parts.push(role)
  return `${quarterLabel}, ${kind || 'expense'}: ${parts.filter(Boolean).join('; ')}: ${cents(line.amount)}`
}
async function itemised(env: ToolEnv, args: ToolArgs, requested: Period, person: { name: string }, pid: string, href: string, yearTotal: number | undefined, totalCovers: string, attribution?: string) {
  const category = String(args.category ?? 'travel'), offset = Number(args.offset ?? 0)
  const years = [...new Set(requested.quarters.map(id => id.slice(0, 4)))]
  const files = await Promise.all(years.map(year => readToolMedia(env, `expenses/v1/${pid}/${year}.json`) as Promise<Itemised | null>))
  const wanted = new Set(requested.quarters)
  const quarters = new Map<string, { label: string; url: string }>()
  for (const file of files) for (const q of file?.meta?.quarters ?? []) if (wanted.has(q.id)) quarters.set(q.id, { label: q.label ?? q.id, url: q.source_url ?? 'https://data.gov.au/data/organization/ipea' })
  const held = [...quarters.keys()].sort()
  const all = files.flatMap(readLines).filter(line => quarters.has(line.quarter))
  const lines = all.filter(line => inCategory(expenseGroup(line.category_high, line.category_major), category)).sort((a, b) => a.quarter < b.quarter ? -1 : a.quarter > b.quarter ? 1 : 0)
  const first = held.length ? quarterBounds(held[0]) : null, last = held.length ? quarterBounds(held.at(-1)!) : null
  const coverage = { since: first?.since ?? null, until: last?.until ?? null, requested_since: requested.since, requested_until: requested.until, matched: held.length === requested.quarters.length }
  const notes = ['Each line is as IPEA published it, grouped by IPEA\'s reporting quarter, which can differ from the date of travel. Negative lines are IPEA adjustments and repayments. Who travelled is given as a role: member, family member or staff.']
  if (attribution) notes.push(attribution)
  // What the lines cover, in words: the whole year when all four quarters are held, else the months held and how many quarters.
  const covers = yearCoverage(held, requested.key, { financial: requested.financial })
  const span = covers.complete ? requested.label : covers.quarters.length ? covers.text : '', label = CATEGORY_LABEL(category)
  const only = (text: string, value?: number) => ({ rows: [], coverage, citations: [{ kind: 'record' as const, url: href, text, ...(value === undefined ? {} : { value }) }], notes })
  if (!files.some(Boolean)) {
    // No file for the year: either IPEA reported nothing for this person then (no total either), or the total is held and its lines are yet to be loaded.
    return yearTotal === undefined
      ? only(`OPAX has no reported IPEA expense lines for ${person.name} for ${requested.label}. This does not mean expenditure was zero.`)
      : only(`${person.name}'s IPEA-reported expenses for ${totalCovers || requested.label} total ${aud(yearTotal)}${totalCovers ? `, a partial subtotal of ${requested.label}` : ''}; the itemised lines for that year are not loaded yet.`, yearTotal)
  }
  if (!lines.length) return only(all.length
    ? `${person.name}'s IPEA-published lines${span ? ', ' + span : ''}: ${all.length} in other categories and none under ${label}.`
    : `IPEA published no expense lines for ${person.name}${span ? ', ' + span : ` in ${requested.label}`}.`)
  const sum = (rows: Line[]) => Math.round(rows.reduce((n, r) => n + r.amount, 0) * 100) / 100
  const total = sum(lines)
  const groups = GROUPS.map(group => ({ group, rows: lines.filter(line => expenseGroup(line.category_high, line.category_major) === group) })).filter(g => g.rows.length)
    .map(g => ({ group: g.group, label: GROUP_LABEL[g.group], lines: g.rows.length, amount_aud: sum(g.rows), nights: g.rows.reduce((n, r) => n + (r.nights ?? 0), 0) }))
  const citations: ToolCitation[] = [{ kind: 'record', url: href, value: total, text: `${person.name}'s IPEA-reported ${label} lines${span ? ', ' + span : ''}: ${lines.length} lines totalling ${cents(total)}${covers.complete ? '' : `, a partial subtotal of ${requested.label}`}.` }]
  if (groups.length > 1) for (const g of groups) citations.push({ kind: 'record', url: href, value: g.amount_aud, text: `${person.name}, ${g.label}${span ? ', ' + span : ''}: ${g.lines} lines, ${cents(g.amount_aud)}${g.group === 'allowance' && g.nights ? `, ${g.nights} nights` : ''}.` })
  let used = 0, shown = 0
  for (const line of lines.slice(offset, offset + LINE_PAGE)) {
    const q = quarters.get(line.quarter)!, label = lineText(line, q.label)
    used += label.length + 24
    if (shown && used > LINE_BYTES) break
    citations.push({ kind: 'record', url: q.url, value: line.amount, text: label })
    shown++
  }
  const next = offset + shown < lines.length ? offset + shown : null
  if (next !== null) notes.push(`Lines ${offset + 1} to ${offset + shown} of ${lines.length} are listed. Call again with offset ${next} for the next lines, or with a narrower category.`)
  if (!coverage.matched) notes.push(`Reporting quarters not held for ${requested.label}: ${requested.quarters.filter(id => !quarters.has(id)).join(', ')}.`)
  return { rows: [{ name: person.name, person_id: pid, year: requested.key, period: requested.label, ...(covers.text ? { covers: covers.text } : {}), detail: 'itemised', category, reporting_quarters: held, lines: lines.length, amount_aud: total, groups, offset, lines_listed: shown, next_offset: next }],
    coverage, citations, notes }
}
const ITEMISED_PROPERTIES: NonNullable<ToolInputSchema['properties']> = {
  detail: { type: 'string', enum: ['totals', 'itemised'], description: 'itemised lists IPEA\'s individual published lines (each fare, allowance claim, car cost and so on) with subtotals; totals (the default) gives the year\'s total.' },
  category: { type: 'string', enum: [...CATEGORIES], description: 'With detail itemised: which lines. travel (the default) is every travel line: fares, allowance, car, unscheduled, overseas, family and staff. all adds office costs.' },
  offset: { type: 'integer', minimum: 0, maximum: 100000, description: 'With detail itemised: the next_offset of the previous result, for more lines.' },
}

const withItemised = (schema: ToolInputSchema): ToolInputSchema => ({ ...schema, properties: { ...schema.properties, ...ITEMISED_PROPERTIES },
  examples: [...schema.examples, { person: 'Penny Wong', year: 2026, detail: 'itemised' }, { person: 'Penny Wong', year: 2026, detail: 'itemised', category: 'fares' }] })
const PUBLIC_SCHEMA: ToolInputSchema = { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'Federal parliamentarian’s name; resolve spelling with find_people when needed.' },
    year: { anyOf: [{ type: 'integer', minimum: 1900, maximum: 2100 }, { type: 'string', pattern: '^\\d{4}(?:[-–−](?:\\d{2}|\\d{4}))?$' }], description: 'Calendar year (2025) or Australian financial year ("2024-25" or "2024-2025").' },
    since: { type: 'string', format: 'date', description: 'First day of a calendar or financial year; use with until.' },
    until: { type: 'string', format: 'date', description: 'Last day of the same calendar or financial year; use with since.' },
  }, required: ['person'], examples: [{ person: 'Penny Wong', year: 2025 }, { person: 'Penny Wong', year: '2024-25' }] }
const ASK_SCHEMA = withItemised(PUBLIC_SCHEMA)

export const tool: ToolDefinition = {
  name: 'member_expenses',
  description: 'Federal member or senator parliamentary expenses reported by IPEA for a calendar year or Australian financial year: the year\'s total, or with detail itemised the individual published lines (each fare with its route and date, travel allowance nights and place, car costs, overseas, family and staff travel) and their subtotals. Use detail itemised for itemised, travel, flights, trips or what the money was spent on. Always pass the requested year, e.g. 2026 or "2024-25", or exact January to December / July to June since and until dates. Includes adjustments, complete or partial reporting-quarter coverage, and former members where held.',
  inputSchema: PUBLIC_SCHEMA,
  askInputSchema: ASK_SCHEMA,
  identifierFields: ['person'],
  validate: args => period(args) !== null && (args.detail === 'itemised' || args.category === undefined && args.offset === undefined),
  stepLabel: args => ({ label: 'Checking parliamentary expenses', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const requested = period(args)!
    const expenses = await readToolAsset(env, '/expenses.json') as Expenses | null
    if (!expenses?.meta || !expenses.people || !expenses.names) return { rows: [], citations: [], notes: [], error: 'IPEA parliamentary expense records are unavailable.' }
    const key = fold(args.person), words = key.split(' ')
    const exact = expenses.names[key]
    const candidates = exact ? [exact] : [...new Set(Object.entries(expenses.names).filter(([name]) => words.every(word => fold(name).split(' ').includes(word))).map(([, id]) => id))]
    const person = candidates.length === 1 ? expenses.people[candidates[0]] : undefined
    const held = reportingPeriods(expenses.meta), selected = requested.quarters.filter(id => held.has(id))
    const first = selected.length ? quarterBounds(selected[0]) : null, last = selected.length ? quarterBounds(selected.at(-1)!) : null
    const coverage = { since: first?.since ?? null, until: last?.until ?? null,
      available_since: quarterBounds(expenses.meta.from)?.since ?? null, available_until: quarterBounds(expenses.meta.to)?.until ?? null,
      requested_since: requested.since, requested_until: requested.until, matched: false }
    const notes = ['IPEA expenditure is grouped by the reporting quarter, not the date of travel or a personal reimbursement. Totals include negative adjustments and repayments and are rounded to whole Australian dollars. Salary is separate.']
    const href = person ? siteUrl(env, `${personUrl(person.name)}#person-expenses`) : 'https://data.gov.au/data/organization/ipea'
    const unavailable = (text: string) => ({ rows: [], coverage, citations: [{ kind: 'record' as const, url: href, text }], notes })
    if (!person) return unavailable(candidates.length > 1 ? `The name "${clip(args.person, 60)}" matches several IPEA expense records. Please give the full name.` : `OPAX has no IPEA expense record for "${clip(args.person, 60)}".`)
    const amounts = requested.financial ? person.by_financial_year : person.by_year
    const covers = yearCoverage(held, requested.key, { financial: requested.financial }), stated = statesCoverage(env)
    if (args.detail === 'itemised') {
      const held = amounts?.find(([year]) => year === requested.key)?.[1]
      return itemised(env, args, requested, person, candidates[0], href, typeof held === 'number' && Number.isFinite(held) ? held : undefined, covers.text === 'no quarters published' ? '' : covers.text, expenses.meta.attribution)
    }
    if (!amounts) return unavailable(requested.financial
      ? `OPAX's expense export does not hold financial-year totals for ${person.name}. The IPEA ingest retains reporting quarters in ext_expenses; export sums of the July to June reporting quarters to answer ${requested.label}. Calendar-year or career totals cannot establish this amount.`
      : `OPAX's expense export does not hold calendar-year totals for ${person.name}. Export sums by reporting quarter's calendar year from ext_expenses; a career total cannot establish ${requested.label}.`)
    const amount = amounts.find(([year]) => year === requested.key)?.[1]
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return unavailable(`OPAX has no reported IPEA expense total for ${person.name} for ${requested.label}. This does not mean expenditure was zero.${stated && held.size && !selected.length ? ` IPEA has published no quarters of ${requested.label} yet.` : ''}`)
    if (!selected.length) return unavailable(`OPAX cannot establish reporting-quarter coverage for ${requested.label}; the available aggregate is not established as a full-year total.`)
    const complete = selected.length === 4
    if (!complete) notes.push(`Partial coverage: missing reporting quarters ${requested.quarters.filter(id => !held.has(id)).join(', ')}. The amount is a reported subtotal, not a complete annual total.`)
    if (expenses.meta.attribution) notes.push(expenses.meta.attribution)
    const partial = stated && !complete && covers.text
    return { rows: [{ name: person.name, person_id: candidates[0], year: requested.key, period: requested.label, ...(partial ? { covers: partial } : {}), amount_aud: amount, complete, reporting_quarters: selected }],
      coverage: { ...coverage, matched: complete },
      citations: [{ kind: 'record', url: href, value: amount, text: partial
        ? `${person.name}: ${aud(amount)} in IPEA-reported parliamentary expenses for ${partial}, a partial reported subtotal of ${requested.label}.`
        : `${person.name}: ${aud(amount)} in IPEA-reported parliamentary expenses for ${requested.label}${complete ? '' : ` (partial reported subtotal${readableRange(first?.since, last?.until) ? ', ' + readableRange(first?.since, last?.until) : ''})`}.` }], notes }
  },
}
