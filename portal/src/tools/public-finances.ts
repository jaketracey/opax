/** Source cells and published register rows, with the site's existing clearance checks. */
import { clearedAggregates } from '../budget'
import { clearedSABudget } from '../sa-budget'
import { saGrantsRows } from '../sa-grants'
import { clearedGiftRegisters } from '../vic-gifts'
import { clearedTaxExpenditures } from '../tax-expenditures'
import { clearedGovernmentFinance } from '../government-finance'
import { clearedGovernmentFunctions } from '../government-finance-functions'
import { clearedAdvertising } from '../gov-advertising'
import { clip, fold, siteUrl } from './record-common'
import { ASK_CHAMBERS } from '../ask-chamber'
import { boundedValue, fiscalYearValid, object, publishedResult, records, sourceUrl, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolDefinition } from './types'

const DATASETS = ['federal_budget', 'sa_budget', 'tax_expenditures', 'government_finance', 'advertising', 'sa_grants', 'vic_gifts'] as const
const PATHS = { federal_budget: 'budget', sa_budget: 'sa-budget', tax_expenditures: 'tax-expenditures', government_finance: 'government-finance', advertising: 'gov-advertising', sa_grants: 'sa-grants', vic_gifts: 'vic-gifts' }
type Dataset = typeof DATASETS[number]
const NOTES: Record<Dataset, string[]> = {
  federal_budget: ['Headline aggregates and cleared document links only. Individual budget measure lines are not in the public export. Keep release vintage, fiscal year, unit and actual/estimate/projection distinct; never sum releases.'],
  sa_budget: ['Historical 2015-16 Budget vintage only, not current SA budget coverage. Held cells with unverified scales are excluded.'],
  tax_expenditures: ['Treasury revenue forgone estimates, not spending or revenue that would necessarily be collected if a concession ended. Markers and nulls are not zero; items and totals overlap and must not be summed.'],
  government_finance: ['ABS published cells. Keep level of government, jurisdiction, sector, consolidation and function hierarchy distinct; overlapping cells must not be summed.'],
  advertising: ['Published advertising categories, totals, media, advertiser and campaign rows can overlap. Keep GST and reporting basis; do not sum these rows into a total.'],
  sa_grants: ['Grants SA 2016-17 and 2017-18 only, not all SA grants or current coverage. Award announcements are not proof of payment. Unavailable and held files are excluded.'],
  vic_gifts: ['Victorian ministerial and parliamentary secretary register periods only. Dates and estimated values are often not published; null is not zero. A gift does not establish a conflict or influence.'],
}
const yearOf = (r: RecordRow) => r.fiscal_year ?? r.measure_year ?? r.reference_year ?? r.financial_year ?? r.year
const fields = ['title', 'metric', 'measure', 'measure_as_published', 'function_as_published', 'division', 'group', 'category', 'item_id', 'campaign', 'entity', 'recipient', 'project_title', 'project_description', 'programme', 'region', 'office_holder', 'portfolio', 'description', 'giver', 'period', 'record_kind', 'level_of_government', 'jurisdiction', 'sector', 'consolidation', 'vintage', 'paper', 'release', 'table_id', 'basis', 'source_value', 'source_marker']

function cleared(dataset: Dataset, raw: unknown): RecordRow[] {
  switch (dataset) {
    case 'federal_budget': return clearedAggregates(raw as Parameters<typeof clearedAggregates>[0]) as unknown as RecordRow[]
    case 'sa_budget': return clearedSABudget(raw as Parameters<typeof clearedSABudget>[0])
    case 'sa_grants': return saGrantsRows(raw as Parameters<typeof saGrantsRows>[0])
    case 'vic_gifts': return clearedGiftRegisters(raw as Parameters<typeof clearedGiftRegisters>[0]).flatMap(register => register.rows as unknown as RecordRow[])
    case 'tax_expenditures': return clearedTaxExpenditures(raw as Parameters<typeof clearedTaxExpenditures>[0]) as unknown as RecordRow[]
    case 'government_finance': return [...clearedGovernmentFinance(raw as Parameters<typeof clearedGovernmentFinance>[0]), ...clearedGovernmentFunctions(raw as Parameters<typeof clearedGovernmentFunctions>[0])] as unknown as RecordRow[]
    case 'advertising': return clearedAdvertising(raw as Parameters<typeof clearedAdvertising>[0]) as unknown as RecordRow[]
  }
}
function summary(r: RecordRow): string {
  const label = r.title ?? r.project_title ?? r.campaign ?? r.description ?? r.measure ?? r.metric ?? r.category ?? r.record_kind ?? 'Published record'
  const amount = r.value ?? r.amount ?? r.estimated_value
  const money = typeof r.total_cents === 'number' ? `${r.total_cents / 100} AUD` : typeof amount === 'number' ? `${amount} ${r.unit ?? r.units ?? 'AUD'}` : `no numeric value published${r.source_value != null || r.source_marker != null ? ' (' + (r.source_value ?? r.source_marker) + ')' : ''}`
  const dimensions = [r.office_holder, r.giver, r.recipient, r.entity, r.level_of_government, r.jurisdiction, r.sector, r.function_as_published, yearOf(r), r.period, r.vintage, r.release, r.status ?? r.estimate_or_actual ?? r.estimate_status, r.basis].filter(v => v != null && v !== '')
  const locator = r.source_locator ?? r.locator ?? (r.sheet && r.cell ? `${r.sheet}!${r.cell}` : r.pdf_page ? `PDF page ${r.pdf_page}, ${r.table_id}` : '')
  return clip(`${String(label).replace(/_/g, ' ')}: ${money}. ${dimensions.join('; ')}${locator ? '. Source: ' + locator : ''}.`, 1200)
}

export const tool: ToolDefinition = {
  name: 'public_finances',
  description: 'Search and open published federal budget aggregates and papers, historical SA budget cells, Treasury tax expenditures, ABS government finances and spending by function, government advertising (all row kinds), historical SA grants, and Victorian ministerial gifts (chamber and since/until filters apply only to these gifts). Choose dataset, then query words and optional financial_year, release or entity. Returns original units, source cells, dated snapshot and row citations. Follow a row with dataset + record_id for detail; use offset to page. For federal budget papers use view=documents. Measure-level federal budget lines are not exported. Nulls and suppression markers are not zero. Use each published non-overlapping measure with its release vintage and hierarchy level.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    dataset: { type: 'string', enum: [...DATASETS] },
    query: { type: 'string', minLength: 2, maxLength: 200 },
    record_id: { type: 'string', pattern: '^v[0-9]{8,14}-[0-9]{1,6}$', description: 'Copy from a row. Identifies a row in this export snapshot.' },
    financial_year: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
    release: { type: 'string', minLength: 2, maxLength: 80, description: 'Exact publication vintage/release, separate from the measured financial year.' },
    entity: { type: 'string', minLength: 2, maxLength: 160, description: 'Words in recipient, office holder, giver, advertiser or government jurisdiction.' },
    chamber: { type: 'string', enum: ASK_CHAMBERS },
    since: { type: 'string', format: 'date' },
    until: { type: 'string', format: 'date' },
    view: { type: 'string', enum: ['rows', 'documents'], description: 'Default rows; documents lists cleared federal budget source papers.' },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['dataset'], examples: [{ dataset: 'sa_grants', query: 'Aboriginal Legal Rights' }, { dataset: 'federal_budget', query: 'net debt', financial_year: '2025-26' }, { dataset: 'vic_gifts', entity: 'Jacinta Allan' }] },
  validate: args => fiscalYearValid(args.financial_year) && (!args.view || args.view === 'rows' || args.dataset === 'federal_budget') &&
    (args.dataset === 'vic_gifts' || !['chamber','since','until'].some(k => args[k] !== undefined)) && (!args.since || !args.until || String(args.since) <= String(args.until)) &&
    (!args.record_id || !['query', 'entity', 'financial_year', 'release'].some(k => args[k] !== undefined)),
  stepLabel: args => ({ label: 'Reading public finances', arg: clip(args.dataset, 40) }),
  async handler(env, args) {
    const dataset = args.dataset as Dataset, raw = await readToolAsset(env, '/' + PATHS[dataset] + '/data.json'), data = object(raw)
    if (!Object.keys(data).length) throw new Error('Register unavailable')
    const documents = args.view === 'documents'
    const all = documents ? records(data.documents).filter(d => d.status === 'cleared' && object(d.licence).status === 'open' && sourceUrl(d.url)) : cleared(dataset, raw)
    const roster = dataset === 'vic_gifts' && args.chamber ? records(object(await readToolAsset(env, '/parliamentarians.json')).people) : []
    if (dataset === 'vic_gifts' && args.chamber && !roster.length) throw new Error('Parliamentary chamber roster unavailable')
    const chamberFor = (r: RecordRow) => {
      const name = fold(object(r.official).name ?? r.office_holder).replace(/^hon(?:ourable)?\.?\s+/, '')
      const chambers = roster.filter(p => fold(p.name) === name).flatMap(p => Array.isArray(p.chambers) ? p.chambers.map(String) : [])
      return chambers.find(c => c === args.chamber || args.chamber === 'legislative_council' && c === 'vic_lc' || args.chamber === 'legislative_assembly' && c === 'vic_la')
    }
    const inPeriod = (r: RecordRow) => {
      if (dataset !== 'vic_gifts' || !(args.since || args.until)) return true
      const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
      const period = /vic-gifts-(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/.exec(String(r.register_id ?? ''))
      const since = date ?? period?.[1], until = date ?? period?.[2]
      return !!since && !!until && (!args.since || since >= String(args.since)) && (!args.until || until <= String(args.until))
    }
    const version = 'v' + String(data.generated_at ?? '').replace(/\D/g, '').slice(0, 14)
    if (!/^v\d{8,14}$/.test(version)) throw new Error('Register snapshot unavailable')
    const matched = all.map((r, index) => ({ r, record_id: `${version}-${index}` })).filter(({ r, record_id }) =>
      (!args.chamber || !!chamberFor(r)) && inPeriod(r) && (!args.record_id || args.record_id === record_id) && (!args.financial_year || yearOf(r) === args.financial_year) &&
      (!args.release || [r.release, r.vintage, r.statement].includes(args.release)) &&
      (!args.entity || wordsMatch(args.entity, [r.recipient, r.office_holder, r.giver, r.entity, r.jurisdiction, r.level_of_government])) &&
      (!args.query || wordsMatch(args.query, fields.map(k => r[k]))))
    const offset = Number(args.offset) || 0, limit = Number(args.limit) || 5
    const rows = matched.slice(offset, offset + limit).map(({ r, record_id }) => {
      const url = sourceUrl(r.source_url ?? r.url)!
      const safe = Object.fromEntries(Object.entries(r).filter(([key, v]) => v == null || typeof v !== 'object' || ['official', 'last_action'].includes(key)))
      return { ...boundedValue(safe, args.record_id ? 1400 : 350) as RecordRow, ...(args.chamber ? { chamber: chamberFor(r) } : {}), record_id, dataset, view: args.view ?? 'rows',
        summary: documents ? clip(r.title, 300) : summary(r), source_url: url,
        full_record_url: url, follow_up: { dataset, record_id, ...(documents ? { view: 'documents' } : {}) } }
    })
    const citations = rows.map(row => ({ kind: 'record' as const, url: row.source_url, text: String(row.summary) }))
    if (!rows.length && args.chamber) citations.push({ kind: 'record', url: siteUrl(env, '/' + PATHS[dataset] + '/data.json'), text: `The published Victorian ministerial gifts preview has no matching rows for ${args.chamber}${args.since || args.until ? ` from ${args.since ?? 'the start of the record'} to ${args.until ?? 'the present'}` : ''}. These register previews do not establish that no gifts were declared.` })
    return publishedResult(rows, citations, {
      notes: [...NOTES[dataset], ...(matched.length ? [] : ['No published row matches these filters. This does not establish a zero amount.']), 'Record identifiers are scoped to this export snapshot; repeat the search after a refresh.'],
      total: matched.length, offset, next_offset: offset + rows.length < matched.length ? offset + rows.length : null,
      truncated: offset + rows.length < matched.length, snapshot: data.generated_at,
      ...(dataset === 'vic_gifts' && (args.since || args.until) ? { coverage: { since: args.since ?? null, until: args.until ?? null, as_of: null, note: 'Gift dates where recorded, otherwise the explicitly declared register period; register periods crossing a requested boundary are excluded.' } } : {}),
    })
  },
}
