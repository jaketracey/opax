/** Receipt aggregates from the published money graph, preserving its distinct party and donor scopes. */
import { donorAssociatedTo, donorDisclosure, hasPartyReceipts, otherReceiptsLine, partyReturns, publicFundingOnly, receiptFigures, receiptGraph, receiptGraphScope, receiptSplit, type DonorDisclosureRecord } from '../../public/donor-disclosure.js'
import { partyNameForPeriod } from '../../public/party-page.js'
import { receiptYearWindow } from '../receipt-period'
import { aud, clip, fold, siteUrl } from './record-common'
import { lendingLines } from './declared-debts'
import { readToolAsset, type StructuredToolResult, type ToolArgs, type ToolDefinition, type ToolEnv } from './types'

type Amount = [number, number]
interface ReceiptSeries { by_type?: Record<string, number>; by_type_year?: Record<string, Record<string, Amount>>; total: number; count: number; byYear?: Record<string, Amount>; undated?: Amount; typeCells?: Record<string, Record<string, Amount>> | null }
type MoneyNode = DonorDisclosureRecord & ReceiptSeries & { id: string; label: string; kind: string; industry?: string }
interface MoneyEdge extends ReceiptSeries { source: string; target: string; grant?: boolean; flow?: string; by_type?: Record<string, number>; firstYear?: number | null; lastYear?: number | null }
interface MoneyGraph { nodes: MoneyNode[]; edges: MoneyEdge[]; meta?: { generated?: string; coverage?: string; uncapped?: boolean } }
interface TotalRow { party?: string; donor?: string; associated_entity?: string; year?: number; total_aud: number; receipts: number; period: string }
const fy = (year: number) => `${year}-${String(year + 1).slice(-2)}`
const span = (from: number, to: number) => from === to ? fy(from) : `${fy(from)} to ${fy(to)}`
const key = (value: unknown) => fold(value).replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '')
const PARTY_ALIASES: Record<string, string[]> = {
  Labor: ['ALP', 'Australian Labor Party', 'Labour'], Liberal: ['Liberals', 'Liberal Party', 'Liberal Party of Australia', 'Libs'],
  Nationals: ['National Party', 'National Party of Australia', 'The Nationals'], Greens: ['The Greens', 'Australian Greens'],
  LNP: ['Liberal National Party', 'Liberal National Party of Queensland'], 'Country Liberal Party': ['CLP', 'Country Liberals'],
  'One Nation': ["Pauline Hanson's One Nation", 'PHON'], 'United Australia Party': ['UAP'],
}
const RECIPIENT_NAMES: Record<string, string> = {
  Labor: 'the Australian Labor Party', Liberal: 'the Liberal Party', Nationals: 'the National Party of Australia',
  Greens: 'the Australian Greens', LNP: 'the Liberal National Party of Queensland',
  'Country Liberal Party': 'the Country Liberal Party', 'One Nation': "Pauline Hanson's One Nation",
  'United Australia Party': 'the United Australia Party', 'Family First': 'the Family First Party',
  "Katter's Australian Party": "Katter's Australian Party", 'Centre Alliance': 'Centre Alliance',
  'Libertarian Party': 'the Libertarian Party',
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
/**
 * What a donor figure counts: "donations" (AEC Donation Received only, for who gives, donates
 * or funds) or "all_types" (every receipt type, for money from, receipts or paid). Public Funding
 * is in neither. A series without typed cells (a party node, a state graph) has no split and keeps
 * its all-types figure. Undefined when the window holds nothing of the measure.
 */
type Measure = 'donations' | 'all_types'
function measured(series: ReceiptSeries, from: number, to: number, dated: boolean, measure: Measure): Amount | undefined {
  if ('by_type' in series && series.by_type) {
    const figures = receiptFigures(series)
    series = { ...series, total: figures.total, count: figures.count, byYear: figures.cells, typeCells: figures.typeCells }
  }
  if (measure === 'donations' && series.typeCells) {
    const split = receiptSplit(series, dated ? from : null, dated ? to : null)
    return split && (split.donations[0] || split.donations[1]) ? split.donations : undefined
  }
  return amount(series, from, to, dated)
}
const limitations = (env: ToolEnv, text: string, notes: string[] = []): StructuredToolResult => ({ rows: [], coverage_only: true,
  citations: [{ kind: 'record', text, url: siteUrl(env, '/money?jur=federal&type=receipts') }], notes: [text, ...notes] })

// party is the name the gifts were made to (PR 344): a renamed party's flow that ends before
// the new name was registered keeps its former name, and party_now gives the current one.
interface DeclaredRow { party: string; party_now?: string; donor_declared_aud: number; records: number; period: string }
/** "Labor", or "the Liberal Democratic Party (now the Libertarian Party)" for a row under a former name. */
const declaredParty = (row: DeclaredRow) => row.party_now ? `the ${row.party} (now the ${row.party_now})` : row.party
/**
 * A donor's flows that only its own donor return declares (hasPartyReceipts is false).
 * receiptGraph leaves them out of the each-gift-once figures, but OPAX holds the
 * declaration, so an answer says what it is rather than that nothing is recorded. The
 * amounts are the record figures of a flow the parties never reported: the donor's own
 * declaration, labelled as that and never as a receipt.
 */
function declaredOnly(raw: MoneyGraph, donor: MoneyNode, party: MoneyNode | undefined, from: number, to: number, dated: boolean): DeclaredRow[] {
  const parties = new Map(raw.nodes.filter(node => node.kind === 'party').map(node => [node.id, node]))
  const rows: DeclaredRow[] = []
  for (const edge of raw.edges) {
    // Public Funding alone is not a donor's declaration: it is the party's own line, and never a donor flow.
    if (edge.source !== donor.id || edge.grant || edge.flow || !parties.has(edge.target) || party && edge.target !== party.id || hasPartyReceipts(edge) || publicFundingOnly(edge)) continue
    const sized = amount(edge, from, to, dated)
    if (!sized || sized[0] <= 0) continue
    const years = !dated && edge.firstYear != null && edge.lastYear != null ? span(edge.firstYear, edge.lastYear) : span(from, to)
    const inRange = Object.keys(edge.byYear ?? {}).map(Number).filter(year => !dated || year >= from && year <= to)
    const lastYear = inRange.length ? Math.max(...inRange) : dated ? to : edge.lastYear ?? undefined
    const recorded = partyNameForPeriod(parties.get(edge.target)!.label, lastYear)
    rows.push({ party: recorded.name, ...(recorded.now ? { party_now: recorded.now } : {}), donor_declared_aud: sized[0], records: sized[1], period: years })
  }
  return rows.sort((a, b) => b.donor_declared_aud - a.donor_declared_aud || a.party.localeCompare(b.party))
}
const records = (n: number) => `${n.toLocaleString('en-AU')} record${n === 1 ? '' : 's'}`
/** The sentence for flows only the donor declared: what OPAX holds, and why it is not counted. */
function declaredText(name: string, rows: DeclaredRow[]): string {
  const total = rows.reduce((sum, row) => sum + row.donor_declared_aud, 0), count = rows.reduce((sum, row) => sum + row.records, 0)
  const one = rows.length === 1 ? rows[0] : null
  // A former name's returns were lodged under that name: "The Liberal Democratic Party's own returns".
  const owner = one ? `${one.party_now ? 'The ' : ''}${one.party}'s` : "The parties'"
  return `${name}'s own donor return${count === 1 ? '' : 's'} declare${count === 1 ? 's' : ''} ${aud(total)} to ${one ? declaredParty(one) : 'federal parties'} across ${records(count)}`
    + `${one ? ` (${one.period})` : `: ${rows.map(row => `${declaredParty(row)} ${aud(row.donor_declared_aud)} (${row.period})`).join('; ')}`}. `
    + `${owner} own returns list no receipt from ${name}, so OPAX's figures, which count each gift once from the party's own return, do not include ${rows.length === 1 && count === 1 ? 'it' : 'them'}. `
    + (rows.length === 1 && count === 1 ? "The amount is the donor's declaration, not a receipt a party reported." : "The amounts are the donor's declarations, not receipts a party reported.")
}

export const tool: ToolDefinition = {
  name: 'money_totals',
  description: 'Sum federal disclosed receipts for a party or donor, rank parties or donors by total, or show annual totals. Totals and rankings use the uncapped recipient selection. Use group_by=donor with party for its biggest receipt sources; group_by=party ranks recipient parties; group_by=year gives a chronological FY series. financial_year accepts 2017-18; from_year/to_year are inclusive FY starting years. With no period, use lifetime totals. measure=donations counts only AEC Donation Received in donor figures, for who gives, donates, funds or is a donor; other receipt types come back as separate labelled lines. measure=all_types (for explicitly requested receipts) counts every receipt type, for money from, receipts or paid: mixed disclosed receipts, not just gifts. Public funding is listed apart from donors. Party figures use the same selected measure; uncapped rankings default to donations. State the total first with its financial year or range; each citation binds its amount to that period. For grants use grants; for expenses use the expenses tool.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    party: { type: 'string', minLength: 2, maxLength: 200, description: 'Recipient party name, e.g. Labor, Liberal Party, Nationals, LNP or Country Liberal Party.' },
    donor: { type: 'string', minLength: 2, maxLength: 200, description: 'Disclosed donor name, published alias or graph ID. Without party, totals across all recipient parties.' },
    financial_year: { type: 'string', pattern: '^(19|20)[0-9]{2}[-–/]([0-9]{2}|(19|20)[0-9]{2})$', description: 'One complete financial year, e.g. 2017-18 or 2017-2018.' },
    from_year: { type: 'integer', minimum: 1900, maximum: 2099, description: 'First FY starting year, inclusive (2017 means 2017-18).' },
    to_year: { type: 'integer', minimum: 1900, maximum: 2099, description: 'Last FY starting year, inclusive.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional first complete FY boundary, YYYY-07-01. Other boundaries return a coverage limitation.' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional last complete FY boundary, YYYY-06-30. Other boundaries return a coverage limitation.' },
    measure: { type: 'string', enum: ['donations', 'all_types'], description: 'Donor figures: donations (AEC Donation Received only) or all_types (every receipt type). Party figures use the same selected measure; uncapped rankings default to donations.' },
    lending: { type: 'boolean', description: "Set true for a question about loans, lending, borrowing or debts: the answer adds what the party's own returns declare as debts, beside the receipts." },
    group_by: { type: 'string', enum: ['party', 'donor', 'year', 'industry'], description: 'Default: one total for a named party/donor, otherwise rank parties. industry sums every selected donor flow by its industry, excluding individuals, unclassified sources; use for which industries gave most. year returns every observed FY in chronological order.' },
    limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum ranked entities, default 5. Year series retain all observed years.' },
  }, examples: [{ party: 'Nationals', financial_year: '2017-18' }, { group_by: 'party', from_year: 2022, to_year: 2022 },
    { party: 'Labor', group_by: 'donor', limit: 3 }, { donor: 'Mineralogy Pty Ltd', group_by: 'year', from_year: 2018, to_year: 2022 }] },
  validate: args => bounds(args).valid && ['party', 'donor'].every(field => args[field] === undefined ||
    typeof args[field] === 'string' && !!args[field].trim() && !/[<>{}\r\n]/.test(args[field])),
  stepLabel: args => ({ label: 'Adding disclosed receipts', arg: clip(args.party ?? args.donor ?? args.financial_year ?? '', 40) }),
  async handler(env, args) {
    // Donor nodes and donor-to-party flows read the typed cells (each receipt once, from the
    // party's own return), so a figure here matches the donor, party and Explain pages it links.
    // Party nodes keep their own received totals, which include transfers.
    const raw = await readToolAsset(env, '/graph/money-receipts.json') as MoneyGraph | null
    const graph = receiptGraph(raw)
    if (!raw || !graph?.nodes?.length || !Array.isArray(graph.edges)) throw new Error('Published money graph unavailable.')
    const scope = receiptGraphScope(graph)
    const scopeNote: string[] = []
    const allYears = graph.nodes.filter(node => node.kind === 'party' || node.kind === 'donor')
      .flatMap(node => Object.keys(raw.meta?.uncapped && node.by_type ? receiptFigures(node).cells : node.byYear ?? {}).map(Number)).filter(year => Number.isInteger(year) && year >= 1900 && year <= 2099)
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
    // Uncapped rankings default to donations. A named source's receipt lookup
    // retains its all-types contract unless the caller requests donations.
    // A graph without typed cells cannot split a figure, so it never calls one donations.
    const selectedPartyMeasure = raw.meta?.uncapped || donor || group === 'donor' || group === 'industry'
    const measure: Measure = selectedPartyMeasure && (args.measure === 'donations' || raw.meta?.uncapped && !donor && args.measure !== 'all_types') && graph.edges.some(edge => edge.typeCells) ? 'donations' : 'all_types'
    if (scope) scopeNote.push(`Selected figures: ${measure === 'donations' ? scope.replace(/^All receipt types/, 'Donations only') : scope}. Each receipt is counted once.`)
    const word = measure === 'donations' ? 'federal disclosed donations' : 'federal disclosed receipts'
    const measureNote = measure === 'donations'
      ? "Figures count donations only: receipts the party's return types as Donation Received. Other receipt types (other receipts, subscriptions and receipts with no type) are given separately and are not donations. OPAX does not match receipts to the debts a return declares, so none is called a loan. Public funding is never a donor."
      : 'Figures count every receipt type: donations, other receipts, subscriptions and receipts with no type. Only Donation Received is a donation. Public funding is never a donor.'

    if (group === 'industry') {
      if (donor) return limitations(env, 'An industry ranking cannot be restricted to one donor.')
      const nodes = new Map(graph.nodes.map(n => [n.id, n])), sums = new Map<string, Amount>()
      let excluded = 0
      for (const edge of graph.edges) {
        const source = nodes.get(edge.source), recipient = nodes.get(edge.target)
        if (source?.kind !== 'donor' || recipient?.kind !== 'party' || party && edge.target !== party.id) continue
        const sized = measured(edge, from, to, requested.dated, measure)
        if (!sized || sized[0] <= 0) continue
        const industry = source.industry
        if (!industry || ['other', 'individual'].includes(industry)) { excluded += sized[0]; continue }
        const held = sums.get(industry) ?? [0, 0]
        sums.set(industry, [held[0] + sized[0], held[1] + sized[1]])
      }
      const ranked = [...sums].map(([industry, [total_aud, receipts]]) => ({ industry, total_aud, receipts, period, ...(party ? { party: party.label } : {}) }))
        .sort((a, b) => b.total_aud - a.total_aud || a.industry.localeCompare(b.industry))
      const rows = ranked.slice(0, Number(args.limit) || 5)
      const notes = ['Industry totals cover classified sources within the uncapped published donor selection of eligible recipient returns. They exclude individuals, unclassified sources. Industry labels are OPAX classifications, not AEC categories.',
        measure === 'donations' ? 'These are donations (AEC Donation Received); they do not establish influence or personal payments to politicians.' : 'These are mixed disclosed receipts, including more than gifts; they do not establish influence or personal payments to politicians.', measureNote, ...scopeNote]
      if (!rows.length) return { ...limitations(env, `No classified industry receipts are available for ${party?.label ?? 'federal parties'} in ${period}.`, notes), coverage }
      const citations = rows.map((row, i) => {
        const label = row.industry.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
        const params = new URLSearchParams({ jur: 'federal', type: 'receipts', industry: row.industry, from: String(from), to: String(to) })
        if (party) params.set('party', party.id)
        return { kind: 'export' as const, value: row.total_aud, url: siteUrl(env, '/money?' + params),
          text: `${label} ${i === 0 ? 'led the classified industry ranking' : 'recorded the next ranked industry total'}, with ${aud(row.total_aud)} in ${word}${party ? ' to ' + (RECIPIENT_NAMES[party.label] ?? party.label) : ''} in financial year${from === to ? '' : 's'} ${period} (1 July ${from} to 30 June ${to + 1}), across ${row.receipts.toLocaleString('en-AU')} receipt${row.receipts === 1 ? '' : 's'} in the published donor selection.` }
      })
      return { rows, citations, notes, coverage, period, group_by: group, matched: ranked.length, truncated: rows.length < ranked.length,
        excluded_non_industry_aud: excluded, measure, query: { file: '/graph/money-receipts.json', from_year: from, to_year: to, party: party?.label, measure } }
    }
    const notes = [measure === 'donations' ? 'Donations count only AEC Donation Received and are not personal payments to politicians or evidence of influence.' : 'Disclosed receipts include more than gifts and are not personal payments to politicians or evidence of influence.',
      'Financial-year keys are the starting year; election returns can be assigned to their polling or event year.']
    const edgeScope = !!(party && (donor || group === 'donor')) || !!(donor && group === 'party')
    if (!edgeScope && !donor && group !== 'donor') notes.push('Party aggregates cover the uncapped eligible recipient selection; public funding and internal transfers are excluded.')
    else notes.push('Donor aggregates and flows exclude internal party transfers and public funding. Rankings cover the uncapped published donor selection from recipient returns.', measureNote, ...scopeNote)
    if (!notes.includes(measureNote)) notes.push(measureNote, ...scopeNote)
    const rows: TotalRow[] = [], links = new Map<TotalRow, MoneyNode | undefined>()
    const nodes = new Map(graph.nodes.map(node => [node.id, node]))
    const sources: { series: ReceiptSeries; party?: MoneyNode; donor?: MoneyNode }[] = edgeScope
      ? graph.edges.filter(edge => nodes.get(edge.source)?.kind === 'donor' && nodes.get(edge.target)?.kind === 'party' && (!party || edge.target === party.id) && (!donor || edge.source === donor.id))
        .map(edge => ({ series: edge, party: nodes.get(edge.target), donor: nodes.get(edge.source) }))
      : (donor ? [donor] : party ? [party] : graph.nodes.filter(node => node.kind === (group === 'donor' ? 'donor' : 'party')))
        // A donor the parties' returns list nothing from has no each-gift-once figure: never a $0 row.
        .filter(node => node.kind !== 'donor' || hasPartyReceipts(node))
        .map(node => ({ series: node, ...(node.kind === 'party' ? { party: node } : { donor: node }) }))
    const buckets = new Map<string, { row: TotalRow; node?: MoneyNode }>()
    for (const source of sources) {
      const years = group === 'year' ? Object.keys(raw.meta?.uncapped && source.series.by_type ? receiptFigures(source.series).cells : source.series.byYear ?? {}).map(Number).filter(year => year >= from && year <= to) : [undefined]
      for (const year of years) {
        // Uncapped party nodes carry the same selected receipt types as their flows.
        const sized = source.donor || raw.meta?.uncapped ? measured(source.series, year ?? from, year ?? to, year !== undefined || requested.dated, measure)
          : amount(source.series, year ?? from, year ?? to, year !== undefined || requested.dated)
        if (!sized) continue
        const node = group === 'donor' ? source.donor : source.party
        const bucket = year !== undefined ? String(year) : node?.id ?? `${source.donor?.id}:${source.party?.id}`
        let entry = buckets.get(bucket)
        if (!entry) {
          entry = { row: { ...(source.party && (group !== 'year' || party) ? { party: source.party.label } : {}),
            ...(source.donor && (group !== 'year' || donor) ? { donor: donorDisclosure(source.donor).name } : {}),
            // An AEC associated entity of the recipient party carries the register's line (export rule 9).
            ...(source.donor && source.party && (group !== 'year' || donor) && donorAssociatedTo(source.donor, source.party.label) ? { associated_entity: donorAssociatedTo(source.donor, source.party.label) } : {}),
            ...(year !== undefined ? { year } : {}), total_aud: 0, receipts: 0, period: year !== undefined ? fy(year) : period }, node: source.donor }
          buckets.set(bucket, entry)
        }
        entry.row.total_aud += sized[0]; entry.row.receipts += sized[1]
      }
    }
    for (const entry of buckets.values()) { rows.push(entry.row); links.set(entry.row, entry.node) }
    rows.sort(group === 'year' ? (a, b) => a.year! - b.year! : (a, b) => b.total_aud - a.total_aud || String(a.party ?? a.donor).localeCompare(String(b.party ?? b.donor)))
    const picked = group === 'year' ? rows : rows.slice(0, Number(args.limit) || 5)
    // Flows only the named donor's own return declares: said as that, never as nothing or $0.
    const declared = donor ? declaredOnly(raw, donor, party, from, to, requested.dated) : []
    if (!picked.length && declared.length) {
      const text = declaredText(donorDisclosure(donor).name, declared)
      const params = new URLSearchParams({ jur: 'federal', type: 'receipts', focus: donor.id })
      return { rows: [], coverage_only: true, donor_declared: declared, notes: [text, ...notes], coverage,
        citations: [{ kind: 'record', text, url: siteUrl(env, '/money?' + params) }], ...(party ? { party: party.label } : {}), donor: donorDisclosure(donor).name }
    }
    if (declared.length) notes.push(`Not counted above: ${declaredText(donorDisclosure(donor).name, declared)}`)
    // Donations measure: the sources an all-types figure would have shown, with what they gave
    // that the AEC does not class as donations, each as its own labelled line (never a donation, never a loan).
    const limit = Number(args.limit) || 5
    const others = measure !== 'donations' || group === 'year' ? [] : sources.filter(source => source.donor).flatMap(source => {
      const split = receiptSplit(source.series, requested.dated ? from : null, requested.dated ? to : null)
      return split && split.all[0] > 0 ? [{ source, split }] : []
    }).sort((a, b) => b.split.all[0] - a.split.all[0]).slice(0, limit).filter(({ split }) => split.all[0] - split.donations[0] > 0).map(({ source, split }) => {
      const name = donorDisclosure(source.donor!).name, recipient = source.party?.label ?? 'federal parties'
      const listed = picked.some(row => row.donor === name && (!source.party || row.party === recipient))
      const params = new URLSearchParams({ jur: 'federal', type: 'receipts', focus: source.donor!.id })
      if (source.party) params.set('party', source.party.id)
      if (requested.dated) { params.set('from', String(from)); params.set('to', String(to)) }
      const years = !requested.dated && split.otherYears[0] != null ? span(split.otherYears[0], split.otherYears[1]!) : period
      const text = otherReceiptsLine(name, recipient, split, { also: listed, period: `financial year${years.includes(' to ') ? 's' : ''} ${years}` })
      return { row: { donor: name, party: recipient, other_receipts_aud: split.other[0], subscriptions_aud: split.subscriptions[0], untyped_aud: split.untyped[0],
        receipts: split.other[1] + split.subscriptions[1] + split.untyped[1], period }, citation: { kind: 'export' as const, text, value: split.all[0] - split.donations[0], url: siteUrl(env, '/money?' + params) } }
    })
    if (!picked.length && others.length) {
      const who = donor ? donorDisclosure(donor).name : 'any source in the published selection'
      const text = `${party ? partyReturns(party.label) : "The parties' returns"} list no donations from ${who} in financial year${period.includes(' to ') ? 's' : ''} ${period}.`
      // An answer, not a coverage gap: the returns name no donations, and these are what they do list.
      return { rows: [], other_receipts: others.map(o => o.row), notes: [text, ...others.map(o => o.citation.text), ...notes], coverage, measure,
        citations: [{ kind: 'record', text, url: others[0].citation.url }, ...others.map(o => o.citation)], ...(party ? { party: party.label } : {}), ...(donor ? { donor: donorDisclosure(donor).name } : {}) }
    }
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
      const who = row.donor ? `${row.donor}${row.associated_entity ? ` (${row.associated_entity})` : ''}: ${aud(row.total_aud)} in ${word} to ${row.party ?? 'all recipient parties'}`
        : `${row.party ?? 'Federal parties'}: ${aud(row.total_aud)} in ${word}`
      // Human-readable dates survive clients that remove ISO dates from source titles.
      // ISO boundaries remain in coverage; the basis travels with each selected citation.
      const dates = `(1 July ${row.year ?? from} to 30 June ${(row.year ?? to) + 1})`
      const basis = raw.meta?.uncapped || edgeScope || donor || group === 'donor' ? 'Donor aggregates and flows exclude internal party transfers and public funding.'
        : 'Party aggregates include internal party transfers and exclude identified public electoral funding.'
      const text = `${who} across ${row.receipts.toLocaleString('en-AU')} ${measure === 'donations' ? 'donation' : 'receipt'}${row.receipts === 1 ? '' : 's'} in financial years ${row.period} ${dates}${undated && row.year === undefined ? ', including undated receipts' : ''}. ${basis}`
      return { kind: 'export' as const, text, value: row.total_aud, url: siteUrl(env, '/money?' + params) }
    })
    // A lending question: no receipt is a loan; the party's declared debts follow as their own lines.
    const lending = args.lending === true && party ? (await lendingLines(path => readToolAsset(env, path), party.label, env.origin ?? 'https://opax.com.au')).map(l => ({ kind: 'record' as const, text: l.label, ...(l.value ? { value: l.value } : {}), url: l.url })) : []
    return { rows: picked, citations: [...citations, ...others.map(o => o.citation), ...lending], notes, period, group_by: group, measure, ...(others.length ? { other_receipts: others.map(o => o.row) } : {}), ...(declared.length ? { donor_declared: declared } : {}), ...(party ? { party: party.label } : {}), ...(donor ? { donor: donorDisclosure(donor).name } : {}),
      coverage, matched: rows.length, truncated: picked.length < rows.length, query: { file: '/graph/money-receipts.json', from_year: from, to_year: to, lifetime: !requested.dated, measure } }
  },
}
