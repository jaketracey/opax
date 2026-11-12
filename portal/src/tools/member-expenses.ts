/** IPEA expenses grouped by reporting quarter, rather than the transaction date. */
import { personUrl } from '../../public/party-page.js'
import { aud, clip, fold, readableRange, siteUrl } from './record-common'
import { readToolAsset, type ToolArgs, type ToolDefinition } from './types'

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

export const tool: ToolDefinition = {
  name: 'member_expenses',
  description: 'Federal member or senator parliamentary expenses reported by IPEA for a calendar year or Australian financial year. Always pass the requested year, e.g. 2025 or "2024-25", or exact January to December / July to June since and until dates. Returns that year’s reported expenditure, including adjustments, with complete or partial reporting-quarter coverage. Uses the requested reporting year and expense measure. Includes former members where held.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'Federal parliamentarian’s name; resolve spelling with find_people when needed.' },
    year: { anyOf: [{ type: 'integer', minimum: 1900, maximum: 2100 }, { type: 'string', pattern: '^\\d{4}(?:[-–−](?:\\d{2}|\\d{4}))?$' }], description: 'Calendar year (2025) or Australian financial year ("2024-25" or "2024-2025").' },
    since: { type: 'string', format: 'date', description: 'First day of a calendar or financial year; use with until.' },
    until: { type: 'string', format: 'date', description: 'Last day of the same calendar or financial year; use with since.' },
  }, required: ['person'], examples: [{ person: 'Penny Wong', year: 2025 }, { person: 'Penny Wong', year: '2024-25' }] },
  identifierFields: ['person'],
  validate: args => period(args) !== null,
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
    if (!amounts) return unavailable(requested.financial
      ? `OPAX's expense export does not hold financial-year totals for ${person.name}. The IPEA ingest retains reporting quarters in ext_expenses; export sums of the July to June reporting quarters to answer ${requested.label}. Calendar-year or career totals cannot establish this amount.`
      : `OPAX's expense export does not hold calendar-year totals for ${person.name}. Export sums by reporting quarter's calendar year from ext_expenses; a career total cannot establish ${requested.label}.`)
    const amount = amounts.find(([year]) => year === requested.key)?.[1]
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return unavailable(`OPAX has no reported IPEA expense total for ${person.name} for ${requested.label}. This does not mean expenditure was zero.`)
    if (!selected.length) return unavailable(`OPAX cannot establish reporting-quarter coverage for ${requested.label}; the available aggregate is not established as a full-year total.`)
    const complete = selected.length === 4
    if (!complete) notes.push(`Partial coverage: missing reporting quarters ${requested.quarters.filter(id => !held.has(id)).join(', ')}. The amount is a reported subtotal, not a complete annual total.`)
    if (expenses.meta.attribution) notes.push(expenses.meta.attribution)
    return { rows: [{ name: person.name, person_id: candidates[0], year: requested.key, period: requested.label, amount_aud: amount, complete, reporting_quarters: selected }],
      coverage: { ...coverage, matched: complete },
      citations: [{ kind: 'record', url: href, value: amount, text: `${person.name}: ${aud(amount)} in IPEA-reported parliamentary expenses for ${requested.label}${complete ? '' : ` (partial reported subtotal${readableRange(first?.since, last?.until) ? ', ' + readableRange(first?.since, last?.until) : ''})`}.` }], notes }
  },
}
