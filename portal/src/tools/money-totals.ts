/** Receipt aggregates from the published money graph, preserving its distinct party and donor scopes. */
import { donorDisclosure, type DonorDisclosureRecord } from '../../public/donor-disclosure.js'
import { receiptYearWindow } from '../receipt-period'
import { aud, clip, fold, siteUrl } from './record-common'
import { readToolAsset, type StructuredToolResult, type ToolArgs, type ToolDefinition, type ToolEnv } from './types'

type Amount = [number, number]
interface ReceiptSeries { total: number; count: number; byYear?: Record<string, Amount>; undated?: Amount }
type MoneyNode = DonorDisclosureRecord & ReceiptSeries & { id: string; label: string; kind: string }
interface MoneyEdge extends ReceiptSeries { source: string; target: string }
interface MoneyGraph { nodes: MoneyNode[]; edges: MoneyEdge[]; meta?: { generated?: string; coverage?: string } }
interface TotalRow { party?: string; donor?: string; year?: number; total_aud: number; receipts: number; period: string }
const fy = (year: number) => `${year}-${String(year + 1).slice(-2)}`
const span = (from: number, to: number) => from === to ? fy(from) : `${fy(from)} to ${fy(to)}`
const key = (value: unknown) => fold(value).replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '')
const PARTY_ALIASES: Record<string, string[]> = {
  Labor: ['ALP', 'Australian Labor Party', 'Labour'], Liberal: ['Liberals', 'Liberal Party', 'Liberal Party of Australia', 'Libs'],
  Nationals: ['National Party', 'National Party of Australia', 'The Nationals'], Greens: ['The Greens', 'Australian Greens'],
  LNP: ['Liberal National Party', 'Liberal National Party of Queensland'], 'Country Liberal Party': ['CLP', 'Country Liberals'],
  'One Nation': ["Pauline Hanson's One Nation", 'PHON'], 'United Australia Party': ['UAP'],
}
function resolve(nodes: MoneyNode[], name: string, kind: string): MoneyNode[] {
  const wanted = key(name)
  return nodes.filter(node => node.kind === kind && [node.id, node.id.replace(/^[^:]+:/, ''), node.label, node.source_name,
    ...node.aliases ?? [], ...node.lookup_names ?? [], ...kind === 'party' ? PARTY_ALIASES[node.label] ?? [] : []].some(label => label && key(label) === wanted))
}
function financialYearStart(value: unknown): number | undefined {
  if (typeof value !== 'string') return
  const match = /^(\d{4})[-–/](\d{2}|\d{4})$/.exec(value)
  if (!match) return
  const start = Number(match[1]), end = Number(match[2])
  return (match[2].length === 2 ? (start + 1) % 100 === end : start + 1 === end) ? start : undefined
}
function bounds(args: ToolArgs) {
  const one = financialYearStart(args.financial_year), dates = receiptYearWindow(args.since as string | undefined, args.until as string | undefined)
  const starts = [one, args.from_year, dates.from_year].filter((y): y is number => typeof y === 'number')
  const ends = [one, args.to_year, dates.to_year].filter((y): y is number => typeof y === 'number')
  return { from: starts[0], to: ends[0], dated: starts.length > 0 || ends.length > 0 || !!(args.since || args.until), error: dates.error,
    valid: (args.financial_year === undefined || one !== undefined) && new Set(starts).size <= 1 && new Set(ends).size <= 1 && !(starts[0] > ends[0]) }
}
/** Never use selected donor edges to reconstruct a party total: party nodes have the complete cleaned set. */
function amount(series: ReceiptSeries, from: number, to: number, dated: boolean): Amount | undefined {
  if (!dated) return Number.isFinite(series.total) && Number.isInteger(series.count) ? [series.total, series.count] : undefined
  const cells = Object.entries(series.byYear ?? {}).filter(([year]) => Number(year) >= from && Number(year) <= to).map(([, cell]) => cell)
  if (!cells.length) return
  return cells.reduce<Amount>((sum, cell) => [sum[0] + cell[0], sum[1] + cell[1]], [0, 0])
}
const limitations = (env: ToolEnv, text: string, notes: string[] = []): StructuredToolResult => ({ rows: [], coverage_only: true,
  citations: [{ kind: 'record', text, url: siteUrl(env, '/money?jur=federal&type=receipts') }], notes: [text, ...notes] })

export const tool: ToolDefinition = {
  name: 'money_totals',
  description: 'Sum federal disclosed receipts for a party or donor, rank parties or donors by total, or show annual totals. Party totals use the full published party aggregates, not the selected donor flows. Use group_by=donor with party for its biggest receipt sources; group_by=party ranks recipient parties; group_by=year gives a chronological FY series. financial_year accepts 2017-18; from_year/to_year are inclusive FY starting years. With no period, use lifetime totals. These are mixed disclosed receipts, not just gifts. State the total first with its financial year or range; each citation binds its amount to that period. For grants use grants; for expenses use the expenses tool.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    party: { type: 'string', minLength: 2, maxLength: 200, description: 'Recipient party name, e.g. Labor, Liberal Party, Nationals, LNP or Country Liberal Party.' },
    donor: { type: 'string', minLength: 2, maxLength: 200, description: 'Disclosed donor name, published alias or graph ID. Without party, totals across all recipient parties.' },
    financial_year: { type: 'string', pattern: '^(19|20)[0-9]{2}[-–/]([0-9]{2}|(19|20)[0-9]{2})$', description: 'One complete financial year, e.g. 2017-18 or 2017-2018.' },
    from_year: { type: 'integer', minimum: 1900, maximum: 2099, description: 'First FY starting year, inclusive (2017 means 2017-18).' },
    to_year: { type: 'integer', minimum: 1900, maximum: 2099, description: 'Last FY starting year, inclusive.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional first complete FY boundary, YYYY-07-01. Other boundaries return a coverage limitation.' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional last complete FY boundary, YYYY-06-30. Other boundaries return a coverage limitation.' },
    group_by: { type: 'string', enum: ['party', 'donor', 'year'], description: 'Default: one total for a named party/donor, otherwise rank parties. year returns every observed FY in chronological order.' },
    limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum ranked entities, default 5. Year series retain all observed years.' },
  }, examples: [{ party: 'Nationals', financial_year: '2017-18' }, { group_by: 'party', from_year: 2022, to_year: 2022 },
    { party: 'Labor', group_by: 'donor', limit: 3 }, { donor: 'Mineralogy Pty Ltd', group_by: 'year', from_year: 2018, to_year: 2022 }] },
  validate: args => bounds(args).valid && ['party', 'donor'].every(field => args[field] === undefined ||
    typeof args[field] === 'string' && !!args[field].trim() && !/[<>{}\r\n]/.test(args[field])),
  stepLabel: args => ({ label: 'Adding disclosed receipts', arg: clip(args.party ?? args.donor ?? args.financial_year ?? '', 40) }),
  async handler(env, args) {
    const graph = await readToolAsset(env, '/graph/money.json') as MoneyGraph | null
    if (!graph?.nodes?.length || !Array.isArray(graph.edges)) throw new Error('Published money graph unavailable.')
    const allYears = graph.nodes.filter(node => node.kind === 'party' || node.kind === 'donor')
      .flatMap(node => Object.keys(node.byYear ?? {}).map(Number)).filter(year => Number.isInteger(year) && year >= 1900 && year <= 2099)
    if (!allYears.length) throw new Error('Published receipt years unavailable.')
    const first = Math.min(...allYears), last = Math.max(...allYears), requested = bounds(args)
    const from = requested.from ?? first, to = requested.to ?? last
    const period = span(from, to)
    const coverage = { since: `${from}-07-01`, until: `${to + 1}-06-30`, as_of: graph.meta?.generated ?? null,
      requested_since: `${from}-07-01`, requested_until: `${to + 1}-06-30`, available_since: `${first}-07-01`, available_until: `${last + 1}-06-30` }
    if (requested.error) return { ...limitations(env, requested.error), coverage: { ...coverage, since: null, until: null, matched: false, note: requested.error } }
    if (from < first || to > last || from > to) return { ...limitations(env, `OPAX's published federal receipts cover financial years ${span(first, last)}; a total for ${period} is not available.`), coverage: { ...coverage, since: `${first}-07-01`, until: `${last + 1}-06-30`, matched: false } }
    const parties = typeof args.party === 'string' ? resolve(graph.nodes, args.party, 'party') : []
    const donors = typeof args.donor === 'string' ? resolve(graph.nodes, args.donor, 'donor') : []
    for (const [field, matches] of [['party', parties], ['donor', donors]] as const) {
      if (args[field] && matches.length !== 1) return limitations(env, matches.length ? `The disclosed ${field} name ${args[field]} is ambiguous; use its published graph ID.` : `OPAX has no published ${field} receipt aggregate matching ${args[field]}.`)
    }
    const party = parties[0], donor = donors[0], group = String(args.group_by ?? (donor ? 'donor' : 'party'))
    const notes = ['Disclosed receipts include more than gifts and are not personal payments to politicians or evidence of influence.',
      'Financial-year keys are the starting year; election returns can be assigned to their polling or event year.']
    const edgeScope = !!(party && (donor || group === 'donor')) || !!(donor && group === 'party')
    if (!edgeScope && !donor && group !== 'donor') notes.push('Party aggregates cover all cleaned rows assigned to each party, including internal party transfers; identified public electoral funding is excluded.')
    else notes.push('Donor aggregates and flows exclude internal party transfers and public funding. Rankings cover the published donor selection (250 largest lifetime donors plus qualifying public-money recipients), not every disclosed donor.')
    const rows: TotalRow[] = [], links = new Map<TotalRow, MoneyNode | undefined>()
    const nodes = new Map(graph.nodes.map(node => [node.id, node]))
    const sources: { series: ReceiptSeries; party?: MoneyNode; donor?: MoneyNode }[] = edgeScope
      ? graph.edges.filter(edge => nodes.get(edge.source)?.kind === 'donor' && nodes.get(edge.target)?.kind === 'party' && (!party || edge.target === party.id) && (!donor || edge.source === donor.id))
        .map(edge => ({ series: edge, party: nodes.get(edge.target), donor: nodes.get(edge.source) }))
      : (donor ? [donor] : party ? [party] : graph.nodes.filter(node => node.kind === (group === 'donor' ? 'donor' : 'party')))
        .map(node => ({ series: node, ...(node.kind === 'party' ? { party: node } : { donor: node }) }))
    const buckets = new Map<string, { row: TotalRow; node?: MoneyNode }>()
    for (const source of sources) {
      const years = group === 'year' ? Object.keys(source.series.byYear ?? {}).map(Number).filter(year => year >= from && year <= to) : [undefined]
      for (const year of years) {
        const sized = amount(source.series, year ?? from, year ?? to, year !== undefined || requested.dated)
        if (!sized) continue
        const node = group === 'donor' ? source.donor : source.party
        const bucket = year !== undefined ? String(year) : node?.id ?? `${source.donor?.id}:${source.party?.id}`
        let entry = buckets.get(bucket)
        if (!entry) {
          entry = { row: { ...(source.party && (group !== 'year' || party) ? { party: source.party.label } : {}),
            ...(source.donor && (group !== 'year' || donor) ? { donor: donorDisclosure(source.donor).name } : {}),
            ...(year !== undefined ? { year } : {}), total_aud: 0, receipts: 0, period: year !== undefined ? fy(year) : period }, node: source.donor }
          buckets.set(bucket, entry)
        }
        entry.row.total_aud += sized[0]; entry.row.receipts += sized[1]
      }
    }
    for (const entry of buckets.values()) { rows.push(entry.row); links.set(entry.row, entry.node) }
    rows.sort(group === 'year' ? (a, b) => a.year! - b.year! : (a, b) => b.total_aud - a.total_aud || String(a.party ?? a.donor).localeCompare(String(b.party ?? b.donor)))
    const picked = group === 'year' ? rows : rows.slice(0, Number(args.limit) || 5)
    if (!picked.length) return { ...limitations(env, `OPAX has no dated disclosed receipt total recorded${party ? ' for ' + party.label : ''}${donor ? ' from ' + donorDisclosure(donor).name : ''} in financial years ${period}.`, notes), coverage }
    const undated = !requested.dated && sources.some(source => (source.series.undated?.[1] ?? 0) > 0)
    if (undated) notes.push('Lifetime totals include undated receipts; annual totals exclude them.')
    const citations = picked.map(row => {
      const params = new URLSearchParams({ jur: 'federal', type: 'receipts' })
      if (requested.dated || row.year !== undefined) { params.set('from', String(row.year ?? from)); params.set('to', String(row.year ?? to)) }
      const p = graph.nodes.find(node => node.kind === 'party' && node.label === row.party)
      if (p) params.set('party', p.id)
      const d = links.get(row)
      if (d) params.set('focus', d.id)
      const who = row.donor ? `${row.donor}: ${aud(row.total_aud)} in federal disclosed receipts to ${row.party ?? 'all recipient parties'}`
        : `${row.party ?? 'Federal parties'}: ${aud(row.total_aud)} in federal disclosed receipts`
      const dates = `(${row.year ?? from}-07-01 to ${(row.year ?? to) + 1}-06-30)`
      const text = `${who} across ${row.receipts.toLocaleString('en-AU')} receipt${row.receipts === 1 ? '' : 's'} in financial years ${row.period} ${dates}${undated && row.year === undefined ? ', including undated receipts' : ''}.`
      return { kind: 'export' as const, text, value: row.total_aud, url: siteUrl(env, '/money?' + params) }
    })
    return { rows: picked, citations, notes, period, group_by: group, ...(party ? { party: party.label } : {}), ...(donor ? { donor: donorDisclosure(donor).name } : {}),
      coverage, matched: rows.length, truncated: picked.length < rows.length, query: { file: '/graph/money.json', from_year: from, to_year: to, lifetime: !requested.dated } }
  },
}
