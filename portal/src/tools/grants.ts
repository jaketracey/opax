/** Government grants from complete published aggregates and the individual-award table. */
import { aud, clip, fold, readableRange, siteUrl, tableRows } from './record-common'
import { receiptYearWindow } from '../receipt-period'
import { readToolAsset, type StructuredToolResult, type ToolArgs, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'
import { grantTotals } from './grant-totals'

const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt']
const PRIVATE_KINDS = new Set(['person', 'individual', 'sole trader'])
const financialYear = (year: unknown) => year ? `${year}-${String(Number(year) + 1).slice(-2)}` : null
type GrantJurisdiction = 'federal' | 'qld'
interface GrantRecipient { id: string; sh: number; n: string; k: string }
interface GrantIndex { meta: { years: string[]; generated?: string }; recipients: GrantRecipient[] }
interface RecipientSummary { id: string; n: string; k: string; t: number; c: number; by: Record<string, [number, number]>; grants?: { id: string; v: number; n?: string; pr?: string; ag?: string; fy?: string }[] }
const fyLabel = (year: number) => `${year}-${String(year + 1).slice(-2)}`
const fyStart = (label: unknown) => {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}$/.test(label)) return undefined
  const start = Number(label.slice(0, 4))
  return fyLabel(start) === label ? start : undefined
}
const COMMON_NAME_WORDS = new Set(['trustee', 'trust', 'limited', 'incorporated', 'association', 'australia', 'australian', 'council', 'university', 'foundation', 'society', 'corporation', 'company', 'group', 'services', 'national', 'community', 'department', 'government', 'state', 'city', 'shire', 'with', 'from'])
const recipientName = (name: string) => fold(name).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const fileKey = (id: string) => {
  const colon = id.indexOf(':'), kind = colon < 0 ? 'x' : id.slice(0, colon)
  return kind + '-' + (id.slice(colon < 0 ? 0 : colon + 1).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x')
}
/** The complete recipient summaries include awards omitted from the largest-grant listing. */
export async function recipientTotal(env: ToolEnv, args: ToolArgs): Promise<StructuredToolResult> {
  const jurisdiction = (args.jurisdiction ?? 'federal') as GrantJurisdiction
  const index = await readToolAsset(env, `/graph/grants.${jurisdiction}.json`) as GrantIndex | null
  if (!index?.meta?.years?.length || !Array.isArray(index.recipients)) throw new Error('Grant recipient index unavailable.')
  const publicRecipients = index.recipients.filter(r => !PRIVATE_KINDS.has(r.k) && !['aggregate', 'undisclosed'].includes(r.k) && !r.id.startsWith('person:'))
  const input = String(args.recipient).trim(), normalized = recipientName(input)
  let matches = publicRecipients.filter(r => r.id === input || recipientName(r.n) === normalized)
  if (!matches.length && normalized) matches = publicRecipients.filter(r => recipientName(r.n).includes(normalized))
  if (!matches.length) {
    // Grants are recorded under legal names ("The Trustee for ..."), which often differ from the name people use.
    // Offer the recipients that share the name's distinctive words; never pick one.
    const words = [...new Set(normalized.split(' ').filter(word => word.length >= 4 && !COMMON_NAME_WORDS.has(word)))]
    const names = publicRecipients.map(r => ({ r, words: recipientName(r.n).split(' ') }))
    const holders = new Map(words.map(word => [word, names.filter(n => n.words.some(held => held === word || word.length >= 6 && held.startsWith(word.slice(0, 5)))).length]))
    const near = names.map(n => ({ r: n.r, score: words.reduce((sum, word) => sum + (n.words.includes(word) ? (holders.get(word)! <= 40 ? 2 : 1) : word.length >= 6 && n.words.some(held => held.startsWith(word.slice(0, 5))) ? 0.5 : 0), 0) }))
      .filter(c => c.score >= 2).sort((a, b) => b.score - a.score || a.r.n.localeCompare(b.r.n)).slice(0, 8)
    return { rows: [], citations: [], ...(near.length ? { candidates: near.map(c => ({ recipient: c.r.n, recipient_id: c.r.id, jurisdiction })) } : {}),
      notes: ['No public recipient in the published grant recipient index matches that name or ID. The index lists selected recipients, so this does not establish a zero grant total.',
        ...(near.length ? ['Grants are recorded under legal names, which can differ from a trading or common name. candidates share words with the name given: confirm one, then ask again with its recipient_id.'] : [])] }
  }
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
  const notable = (detail.grants ?? []).filter(g => Number.isFinite(g.v) && (g.n || g.pr) && (!bounded || g.fy && Number(g.fy.slice(0, 4)) >= first && Number(g.fy.slice(0, 4)) <= last))
    .sort((a, b) => b.v - a.v).slice(0, Math.min(3, Number(args.limit) || 3))
  return { rows: [{ recipient: detail.n, recipient_id: detail.id, jurisdiction, total_aud: total, records: count, record_count: count, count_unit: jurisdiction === 'qld' ? 'expenditure lines' : 'grant awards', period, from_financial_year: fyLabel(periodFrom), to_financial_year: fyLabel(periodTo), by_year: Object.fromEntries(Object.entries(detail.by).filter(([year]) => Number(year.slice(0, 4)) >= periodFrom && Number(year.slice(0, 4)) <= periodTo)), complete: true }],
    recipient: detail.n, jurisdiction, total_aud: total, records: count, period,
    coverage: { since: `${periodFrom}-07-01`, until: `${periodTo + 1}-06-30`, as_of: asOf, note: 'Complete published recipient summary, grouped by financial year.' },
    notable_grants: notable,
    citations: [{ kind: 'record', value: total, url, text: `${detail.n} received ${aud(total)} in published ${basis}, ${period} (${count.toLocaleString('en-AU')} ${recordKind}; ${readableRange(`${periodFrom}-07-01`, `${periodTo + 1}-06-30`)}).` },
      ...notable.map(g => ({ kind: 'record' as const, value: g.v, url, text: `${detail.n} was awarded ${aud(g.v)} for ${g.n || g.pr}${g.ag ? ' from ' + g.ag : ''}${g.fy ? ' in financial year ' + g.fy : ''} (${jurisdiction === 'qld' ? 'Queensland Government expenditure line' : 'federal grant award'}).` }))], notes }
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
    text: `${who}: ${aud(r.amount)} grant "${clip(r.title, 90)}" from ${r.agency || 'agency not recorded'} (${r.program ? `program: ${r.program}, ` : ''}${financialYear(r.year) ?? 'financial year not recorded'}${r.electorate ? `, ${r.electorate}` : ''}${r.jurisdiction === 'qld' ? ', Queensland' : ''})` }
}

export const tool: ToolDefinition = {
  name: 'grants',
  description: 'Government grants: complete published totals by recipient, program or financial year, or the largest individual grants. For "how much" or "total" pass operation: totals and recipient (full name or ID), program, or group_by: year. Totals use complete published aggregates, including awards omitted from detail lists. For totals, from_year/to_year are financial-year start years. Recipient totals also accept aggregation: total, financial_year: YYYY-YY or complete since/until financial-year boundaries. Largest-award lists retain their calendar-year filters. For a biggest single grant use operation: largest and query. Federal award values are not payments received; Queensland records are annual expenditure lines.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    operation: { type: 'string', enum: ['totals', 'largest'], description: 'totals: complete aggregates; largest: individual awards (default unless recipient, program or group_by is supplied).' },
    recipient: { type: 'string', minLength: 2, maxLength: 400, description: 'Full published recipient name or ID for a complete total. Use recipient for a named recipient total.' },
    program: { type: 'string', minLength: 2, maxLength: 400, description: 'Published program name or catalogue ID for a complete program total.' },
    group_by: { type: 'string', enum: ['recipient', 'program', 'year'], description: 'Dimension for totals. Default recipient, or program when program is supplied. year returns financial years.' },
    query: { type: 'string', minLength: 2, maxLength: 400, description: 'Words in individual grant records. In totals mode, filters names in the selected recipient or program directory.' },
    aggregation: { type: 'string', enum: ['total'], description: 'Sum all published records for recipient, optionally by financial-year range. Requires recipient.' },
    financial_year: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'One financial year, YYYY-YY, e.g. 2017-18. Recipient totals only.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Requested recipient total start. Only complete financial years, starting 1 July, are held; other dates return a limitation.' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Requested recipient total end. Only complete financial years, ending 30 June, are held; other dates return a limitation.' },
    state: { type: 'string', enum: STATES, description: 'Grants recorded against federal electorates in this state (wa = Western Australia).' },
    electorate: { type: 'string', minLength: 2, maxLength: 80, description: 'One federal electorate, e.g. "Perth".' },
    jurisdiction: { type: 'string', enum: ['federal', 'qld'], description: 'Grant source: federal (default for state or electorate filters) or Queensland government.' },
    from_year: { type: 'integer', minimum: 2000, maximum: 2030 }, to_year: { type: 'integer', minimum: 2000, maximum: 2030 },
    each: { type: 'string', enum: ['recipient', 'grant'], description: 'Largest mode only. recipient (default): largest matching grant per recipient; grant: every grant, including repeated recipients.' },
    limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Displayed rows (default 5). Totals are independent of this limit. Year breakdowns are chronological; rankings are largest first.' },
  }, examples: [{ operation: 'totals', recipient: 'Board Of The Queensland Museum', jurisdiction: 'qld' }, { operation: 'totals', program: 'GO6821', group_by: 'year' }, { state: 'wa' }, { operation: 'largest', query: 'University of Queensland', jurisdiction: 'qld' }] },
  validate: args => !(Number(args.from_year) > Number(args.to_year)) &&
    (!args.aggregation || !!args.recipient) &&
    (!(args.financial_year || args.since || args.until) || !!(args.recipient || args.program || args.group_by || args.operation === 'totals')) &&
    (typeof args.recipient !== 'string' || !!args.recipient.trim()) &&
    (!args.recipient || !(args.query || args.state || args.electorate)) &&
    (args.financial_year === undefined || fyStart(args.financial_year) !== undefined &&
      (!!(args.since || args.until) || (args.from_year === undefined || args.from_year === fyStart(args.financial_year)) && (args.to_year === undefined || args.to_year === fyStart(args.financial_year)))) &&
    !((args.operation === 'totals' || args.operation !== 'largest' && (args.recipient || args.program || args.group_by)) && args.each) &&
    !(args.operation === 'largest' && (args.group_by || args.aggregation || args.financial_year || args.since || args.until)),
  stepLabel: args => ({ label: 'Checking grants', arg: clip(args.recipient ?? args.program ?? args.query ?? args.electorate ?? args.state ?? '', 40) }),
  async handler(env, args) {
    if (args.operation !== 'largest' && args.recipient && !args.program && (!args.group_by || args.group_by === 'recipient')) return recipientTotal(env, args)
    if (args.operation === 'totals' || args.operation !== 'largest' && (args.recipient || args.program || args.group_by)) return grantTotals(env, args)
    const limit = Number(args.limit) || 5, perRecipient = args.each !== 'grant'
    const seats = typeof args.electorate === 'string' ? [args.electorate.trim()] : typeof args.state === 'string' ? await stateSeats(env, args.state) : null
    if (seats && !seats.length) return { rows: [], citations: [], notes: ['No federal electorates are recorded for that state.'] }
    const jurisdiction = typeof args.jurisdiction === 'string' ? args.jurisdiction : seats ? 'federal' : undefined
    const years = args.from_year || args.to_year ? JSON.stringify({ ...(args.from_year ? { min: args.from_year } : {}), ...(args.to_year ? { max: args.to_year } : {}) }) : undefined
    const page = await tableRows(env, 'grants', { q: typeof args.query === 'string' ? args.query : undefined, ...(typeof args.recipient === 'string' ? { 'f.recipient': JSON.stringify([args.recipient]) } : {}), ...(typeof args.program === 'string' ? { 'f.program': JSON.stringify([args.program]) } : {}), ...(seats ? { 'f.electorate': JSON.stringify(seats) } : {}),
      ...(jurisdiction ? { 'f.jurisdiction': JSON.stringify([jurisdiction]) } : {}), ...(years ? { 'f.year': years } : {}), sort: 'amount:desc', pageSize: String(perRecipient ? 200 : limit) })
    const seen = new Set<string>()
    const picked = page.rows.filter(r => { const key = String(r.recipientId || r.recipient || r.id); if (perRecipient && seen.has(key)) return false; seen.add(key); return true }).slice(0, limit)
    const citations = picked.map(r => grantCite(env, r))
    const rows = picked.map((r, i) => ({ recipient: citations[i].text.split(':')[0], amount_aud: r.amount, id: PRIVATE_KINDS.has(String(r.recipientKind)) ? null : r.id, title: clip(r.title, 90), program: r.program ?? null, agency: r.agency, year: r.year, financial_year: financialYear(r.year), electorate: r.electorate || null, jurisdiction: r.jurisdiction }))
    const notes = ['Grant values are published award values (Queensland: annual expenditure lines), not payments received.']
    if (perRecipient) notes.push('One row per recipient: its largest matching grant, not its total.')
    if (seats && args.state) notes.push(`Located by the federal electorate recorded on each grant in ${String(args.state).toUpperCase()}; grants with no electorate are not included.`)
    if (!rows.length) notes.unshift('No published grant matches.')
    return { rows, total: page.total, citations, notes }
  },
}
