/** Government grants from the published table and complete recipient summaries. */
import { aud, clip, fold, siteUrl, tableRows } from './record-common'
import { receiptYearWindow } from '../receipt-period'
import { readToolAsset, type StructuredToolResult, type ToolArgs, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt']
const PRIVATE_KINDS = new Set(['person', 'individual', 'sole trader'])
type GrantJurisdiction = 'federal' | 'qld'
interface GrantRecipient { id: string; sh: number; n: string; k: string }
interface GrantIndex { meta: { years: string[]; generated?: string }; recipients: GrantRecipient[] }
interface RecipientSummary { id: string; n: string; k: string; t: number; c: number; by: Record<string, [number, number]> }
const fyLabel = (year: number) => `${year}-${String(year + 1).slice(-2)}`
const fyStart = (label: unknown) => {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}$/.test(label)) return undefined
  const start = Number(label.slice(0, 4))
  return fyLabel(start) === label ? start : undefined
}
const recipientName = (name: string) => fold(name).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const fileKey = (id: string) => {
  const colon = id.indexOf(':'), kind = colon < 0 ? 'x' : id.slice(0, colon)
  return kind + '-' + (id.slice(colon < 0 ? 0 : colon + 1).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x')
}
/** The complete recipient summaries include awards omitted from the largest-grant listing. */
async function recipientTotal(env: ToolEnv, args: ToolArgs): Promise<StructuredToolResult> {
  const jurisdiction = (args.jurisdiction ?? 'federal') as GrantJurisdiction
  const index = await readToolAsset(env, `/graph/grants.${jurisdiction}.json`) as GrantIndex | null
  if (!index?.meta?.years?.length || !Array.isArray(index.recipients)) throw new Error('Grant recipient index unavailable.')
  const publicRecipients = index.recipients.filter(r => !PRIVATE_KINDS.has(r.k) && !['aggregate', 'undisclosed'].includes(r.k) && !r.id.startsWith('person:'))
  const input = String(args.recipient).trim(), normalized = recipientName(input)
  let matches = publicRecipients.filter(r => r.id === input || recipientName(r.n) === normalized)
  if (!matches.length && normalized) matches = publicRecipients.filter(r => recipientName(r.n).includes(normalized))
  if (!matches.length) return { rows: [], citations: [], notes: ['No public recipient in the published grant recipient index matches that name or ID. The index lists selected recipients, so this does not establish a zero grant total.'] }
  if (matches.length > 1) return { rows: [], citations: [], candidates: matches.slice(0, 10).map(r => ({ recipient: r.n, recipient_id: r.id, jurisdiction })),
    notes: ['Several public grant recipients match. Choose an exact recipient name or ID before requesting its total.'] }
  const entry = matches[0]
  if (!Number.isInteger(entry.sh) || entry.sh < 0 || entry.sh >= 40) throw new Error('Grant recipient shard unavailable.')
  const shard = await readToolAsset(env, `/grants/${jurisdiction}/shard-${String(entry.sh).padStart(2, '0')}.json`) as Record<string, RecipientSummary> | null
  const detail = shard?.[fileKey(entry.id)]
  if (!detail || detail.id !== entry.id || !Number.isFinite(detail.t) || !Number.isSafeInteger(detail.c) || !detail.by) throw new Error('Grant recipient summary unavailable.')
  const url = siteUrl(env, `/money/grants/${jurisdiction}/recipient/${encodeURIComponent(entry.id)}`)
  const years = index.meta.years.map(fyStart).filter((year): year is number => year !== undefined).sort((a, b) => a - b)
  if (!years.length) throw new Error('Grant financial-year coverage unavailable.')
  const availableFrom = years[0], availableTo = years[years.length - 1], asOf = index.meta.generated?.slice(0, 10) ?? null
  const available = `Published grant data covers financial years ${fyLabel(availableFrom)} to ${fyLabel(availableTo)}.`
  const limitation = (message: string): StructuredToolResult => ({ rows: [], coverage_only: true,
    coverage: { since: `${availableFrom}-07-01`, until: `${availableTo + 1}-06-30`, as_of: asOf, matched: false, note: message },
    citations: [{ kind: 'record', text: message, url }], notes: [available] })
  const dated = typeof args.since === 'string' || typeof args.until === 'string'
  const window = dated ? receiptYearWindow(args.since as string | undefined, args.until as string | undefined) : undefined
  if (window?.error) return limitation('Grant recipient summaries are grouped by financial year (1 July to 30 June), so they cannot establish a total for the requested partial or calendar-year period.')
  const labelYear = fyStart(args.financial_year)
  // Exact dates from the Ask constraints take precedence over its generic calendar-year arguments.
  const from = dated ? window?.from_year : labelYear ?? (args.from_year as number | undefined)
  const to = dated ? window?.to_year : labelYear ?? (args.to_year as number | undefined)
  const bounded = from !== undefined || to !== undefined, first = from ?? availableFrom, last = to ?? availableTo
  if (bounded && (first < availableFrom || last > availableTo || first > last)) return limitation(`${available} It cannot establish a complete total for the requested financial-year range.`)
  if (bounded) for (let year = first; year <= last; year++) if (!years.includes(year)) return limitation(`The published grant data has no financial-year bucket for ${fyLabel(year)}, so it cannot establish the requested total.`)
  let total = detail.t, count = detail.c
  if (bounded) {
    total = 0; count = 0
    for (const [year, cell] of Object.entries(detail.by)) {
      const start = fyStart(year)
      if (start === undefined || start < first || start > last) continue
      if (!Array.isArray(cell) || !Number.isFinite(cell[0]) || !Number.isSafeInteger(cell[1]) || cell[1] < 0) throw new Error('Grant financial-year summary unavailable.')
      total += cell[0]; count += cell[1]
    }
  }
  const recordedYears = Object.keys(detail.by).map(fyStart).filter((year): year is number => year !== undefined).sort((a, b) => a - b)
  const periodFrom = bounded ? first : recordedYears[0] ?? availableFrom, periodTo = bounded ? last : recordedYears[recordedYears.length - 1] ?? availableTo
  const period = bounded && first === last ? `financial year ${fyLabel(first)}` : `${bounded ? 'financial years' : 'all published years, financial years'} ${fyLabel(periodFrom)} to ${fyLabel(periodTo)}`
  const basis = jurisdiction === 'qld' ? 'Queensland Government grant and assistance expenditure' : 'federal grant award values'
  const recordKind = `${jurisdiction === 'qld' ? 'expenditure row' : 'award record'}${count === 1 ? '' : 's'}`
  const notes = [jurisdiction === 'qld' ? 'Queensland values are annual expenditure lines for grants, service agreements and other assistance; counts are expenditure rows, not distinct awards.' : 'Federal values are published grant award values, not payments received; varied awards use their current published value.',
    'The total uses the complete published recipient summary, including records omitted from its largest-grant list.']
  if (!bounded && detail.c > Object.values(detail.by).reduce((sum, cell) => sum + Number(cell[1]), 0)) notes.push('The all-years total also includes records with no financial year recorded.')
  return { rows: [{ recipient: detail.n, recipient_id: detail.id, jurisdiction, total_aud: total, records: count, period }],
    recipient: detail.n, jurisdiction, total_aud: total, records: count, period,
    coverage: { since: `${periodFrom}-07-01`, until: `${periodTo + 1}-06-30`, as_of: asOf, note: 'Complete published recipient summary, grouped by financial year.' },
    citations: [{ kind: 'record', value: total, url, text: `${detail.n} received ${aud(total)} in published ${basis}, ${period} (${count.toLocaleString('en-AU')} ${recordKind}; ${periodFrom}-07-01 to ${periodTo + 1}-06-30).` }], notes }
}
/** Federal electorates (current and abolished) in one state, as the grants table records them. */
async function stateSeats(env: ToolEnv, state: string): Promise<string[]> {
  const manifest = await readToolAsset(env, '/electorates/manifest.json') as { index_url?: string } | null
  if (!manifest?.index_url || !/^\/electorates\/releases\/[a-f0-9]+\/index\.json$/.test(manifest.index_url)) throw new Error('Electorate index unavailable.')
  const index = await readToolAsset(env, manifest.index_url) as { electorates?: { name: string; jurisdiction: string; state_code?: string }[] } | null
  return [...new Set((index?.electorates ?? []).filter(e => e.jurisdiction === 'federal' && e.state_code === state).map(e => e.name))]
}
const grantCite = (env: ToolEnv, r: Record<string, unknown>): ToolCitation => {
  const individual = PRIVATE_KINDS.has(String(r.recipientKind)) || String(r.id).startsWith('aggregate:')
  const who = individual ? 'An individual recipient' : String(r.recipient || 'Recipient not recorded')
  const page = !individual && r.recipientAvailable && typeof r.recipientId === 'string' ? siteUrl(env, `/money/grants/${r.jurisdiction}/recipient/${encodeURIComponent(r.recipientId)}`) : null
  return { kind: 'record', value: Number(r.amount), url: page ?? (typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : siteUrl(env, '/money/grants')),
    text: `${who}: ${aud(r.amount)} grant "${clip(r.title, 90)}" from ${r.agency || 'agency not recorded'} (${r.year ?? 'year not recorded'}${r.electorate ? `, ${r.electorate}` : ''}${r.jurisdiction === 'qld' ? ', Queensland' : ''})` }
}

export const tool: ToolDefinition = {
  name: 'grants',
  description: 'Government grants: use recipient with aggregation total for a recipient\'s summed grant award value over all published years, a financial year or an FY range. Totals use complete published recipient summaries, including awards omitted from grant lists; federal is the default source. Otherwise lists the biggest matching grants, one largest grant per recipient by default, filtered by words, state or electorate. Federal award values are not payments received; Queensland values are annual expenditure lines.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 160, description: 'Words in the grant title, program, recipient, agency or description.' },
    recipient: { type: 'string', minLength: 2, maxLength: 500, description: 'Exact published recipient name or ID, or a unique name fragment. Requests its complete summed total; do not combine with query, state or electorate.' },
    aggregation: { type: 'string', enum: ['total'], description: 'Sum all published records for recipient, optionally by financial-year range. Requires recipient.' },
    financial_year: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'One financial year, YYYY-YY, e.g. 2017-18. Recipient totals only.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Requested recipient total start. Only complete financial years, starting 1 July, are held; other dates return a limitation.' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Requested recipient total end. Only complete financial years, ending 30 June, are held; other dates return a limitation.' },
    state: { type: 'string', enum: STATES, description: 'Grants recorded against federal electorates in this state (wa = Western Australia).' },
    electorate: { type: 'string', minLength: 2, maxLength: 80, description: 'One federal electorate, e.g. "Perth".' },
    jurisdiction: { type: 'string', enum: ['federal', 'qld'], description: 'Grant source: federal (default for state or electorate filters) or Queensland government.' },
    from_year: { type: 'integer', minimum: 2000, maximum: 2030, description: 'For recipient totals: first FY starting year (2017 means 2017-18). For largest-grant lists: first award calendar year.' },
    to_year: { type: 'integer', minimum: 2000, maximum: 2030, description: 'For recipient totals: last FY starting year, inclusive. For largest-grant lists: last award calendar year.' },
    each: { type: 'string', enum: ['recipient', 'grant'], description: 'recipient (default): one row per recipient, its largest matching grant; grant: every grant, so one recipient can fill the list.' },
    limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Rows (default 5), largest first.' },
  }, examples: [{ recipient: 'University of Queensland', aggregation: 'total', financial_year: '2017-18' }, { recipient: 'University of Queensland', aggregation: 'total', from_year: 2017, to_year: 2019 }, { state: 'wa' }, { state: 'wa', each: 'grant', limit: 10 }, { query: 'community health', electorate: 'Perth' }, { query: 'University of Queensland', jurisdiction: 'qld' }] },
  validate: args => !(Number(args.from_year) > Number(args.to_year)) &&
    (!(args.aggregation || args.financial_year || args.since || args.until) || !!args.recipient) &&
    (typeof args.recipient !== 'string' || !!args.recipient.trim()) &&
    (!args.recipient || !(args.query || args.state || args.electorate)) &&
    (args.financial_year === undefined || fyStart(args.financial_year) !== undefined &&
      (!!(args.since || args.until) || (args.from_year === undefined || args.from_year === fyStart(args.financial_year)) && (args.to_year === undefined || args.to_year === fyStart(args.financial_year)))),
  stepLabel: args => ({ label: 'Checking grants', arg: clip(args.recipient ?? args.query ?? args.electorate ?? args.state ?? '', 40) }),
  async handler(env, args) {
    if (args.recipient) return recipientTotal(env, args)
    const limit = Number(args.limit) || 5, perRecipient = args.each !== 'grant'
    const seats = typeof args.electorate === 'string' ? [args.electorate.trim()] : typeof args.state === 'string' ? await stateSeats(env, args.state) : null
    if (seats && !seats.length) return { rows: [], citations: [], notes: ['No federal electorates are recorded for that state.'] }
    const jurisdiction = typeof args.jurisdiction === 'string' ? args.jurisdiction : seats ? 'federal' : undefined
    const years = args.from_year || args.to_year ? JSON.stringify({ ...(args.from_year ? { min: args.from_year } : {}), ...(args.to_year ? { max: args.to_year } : {}) }) : undefined
    const page = await tableRows(env, 'grants', { q: typeof args.query === 'string' ? args.query : undefined, ...(seats ? { 'f.electorate': JSON.stringify(seats) } : {}),
      ...(jurisdiction ? { 'f.jurisdiction': JSON.stringify([jurisdiction]) } : {}), ...(years ? { 'f.year': years } : {}), sort: 'amount:desc', pageSize: String(perRecipient ? 200 : limit) })
    const seen = new Set<string>()
    const picked = page.rows.filter(r => { const key = String(r.recipientId || r.recipient || r.id); if (perRecipient && seen.has(key)) return false; seen.add(key); return true }).slice(0, limit)
    const citations = picked.map(r => grantCite(env, r))
    const rows = picked.map((r, i) => ({ recipient: citations[i].text.split(':')[0], amount_aud: r.amount, title: clip(r.title, 90), agency: r.agency, year: r.year, electorate: r.electorate || null, jurisdiction: r.jurisdiction }))
    const notes = ['Grant values are published award values (Queensland: annual expenditure lines), not payments received.']
    if (perRecipient) notes.push('One row per recipient: its largest matching grant, not its total.')
    if (seats && args.state) notes.push(`Located by the federal electorate recorded on each grant in ${String(args.state).toUpperCase()}; grants with no electorate are not included.`)
    if (!rows.length) notes.unshift('No published grant matches.')
    return { rows, total: page.total, citations, notes }
  },
}
