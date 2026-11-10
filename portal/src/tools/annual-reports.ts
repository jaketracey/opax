/** Commonwealth annual report disclosures from the Transparency Portal (public/annual-reports). */
import { clip, fold, siteUrl } from './record-common'
import { fiscalYearValid, object, publishedResult, records, sourceUrl, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const VIEWS = ['remuneration', 'bands', 'profile', 'compare', 'suppliers'] as const
const METRICS = ['total_expenses', 'employee_benefits', 'suppliers_expense', 'consultancy_spend', 'non_consultancy_spend', 'consultancy_contracts', 'ongoing_staff', 'non_ongoing_staff'] as const
type Metric = typeof METRICS[number]
const METRIC: Record<Metric, { label: string; unit: string; get: (h: RecordRow) => unknown }> = {
  total_expenses: { label: 'departmental total expenses', unit: "$'000", get: h => object(h.income_statement).total_expenses },
  employee_benefits: { label: 'departmental employee benefits expense', unit: "$'000", get: h => object(h.income_statement).employee_benefits },
  suppliers_expense: { label: 'departmental suppliers expense', unit: "$'000", get: h => object(h.income_statement).suppliers },
  consultancy_spend: { label: 'reportable consultancy contract expenditure', unit: "$'000 GST inclusive", get: h => object(h.consultancy).expenditure_thousands },
  non_consultancy_spend: { label: 'reportable non-consultancy contract expenditure', unit: "$'000 GST inclusive", get: h => object(h.non_consultancy).expenditure_thousands },
  consultancy_contracts: { label: 'number of reportable consultancy contracts', unit: 'contracts', get: h => object(h.consultancy).contracts },
  ongoing_staff: { label: 'ongoing employees (headcount)', unit: 'people', get: h => object(h.ongoing_staff).headcount },
  non_ongoing_staff: { label: 'non-ongoing employees (headcount)', unit: 'people', get: h => object(h.non_ongoing_staff).headcount },
}
const COMPONENTS = ['base_salary', 'bonuses', 'other_benefits', 'superannuation', 'long_service_leave', 'other_long_term', 'termination', 'total'] as const
const ROW_ID = /^tp-(\d{4}-\d{2})-[0-9a-f]{32}$/
const HEADLINE_ID = /^tp-([a-z0-9_]{2,160})-(\d{4}-\d{2})$/
const API = 'https://previewapi.transparency.gov.au/delivery/items'
const NOTE = 'As published by each entity on the Transparency Portal (Department of Finance) under the PGPA Rule; OPAX does not audit or adjust them. Never add totals across tables, bands, bodies or years, and never multiply band averages by counts.'

const norm = (v: unknown) => fold(v).replace(/&/g, ' and ').replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
const money = (v: unknown) => num(v) == null ? 'not published as a number' : '$' + Math.round(Number(v)).toLocaleString('en-AU')
const apiUrl = (codename: unknown) => typeof codename === 'string' && /^[a-z0-9_]+$/.test(codename) ? `${API}?system.codename=${codename}&depth=1` : null

async function index(env: ToolEnv) {
  const data = object(await readToolAsset(env, '/annual-reports/index.json')), meta = object(data.meta)
  const bodies = records(data.bodies), headline = records(data.headline), years = Array.isArray(object(meta.counts).years) ? (object(meta.counts).years as unknown[]).filter((y): y is string => typeof y === 'string') : []
  if (!bodies.length || !years.length || typeof meta.snapshot_at !== 'string') throw new Error('Annual report projection unavailable')
  return { meta, bodies, headline, years, byId: new Map(bodies.map(b => [String(b.id), b])) }
}
type Index = Awaited<ReturnType<typeof index>>

/** Bodies matching the words: an exact name or acronym wins over a words match. */
function matchBodies(ix: Index, query: unknown): RecordRow[] {
  if (!query) return ix.bodies
  const q = norm(query)
  const exact = ix.bodies.filter(b => norm(b.name) === q || String(b.acronyms ?? '').split(/[,;/]/).some(a => norm(a) === q) || b.id === query)
  return exact.length ? exact : ix.bodies.filter(b => wordsMatch(query, [b.name, b.acronyms]))
}

function reportUrl(body: RecordRow, year: unknown): string | null {
  return sourceUrl(object(object(body.reports)[String(year)]).url)
}

function rowOut(env: ToolEnv, ix: Index, file: RecordRow, r: RecordRow, detail: boolean): RecordRow {
  const t = object(object(file.tables)[String(r.table_id)]), body = ix.byId.get(String(t.body_id)) ?? {}
  const source = apiUrl(t.codename)
  const base: RecordRow = { record_id: r.record_id, kind: r.kind, body: t.body ?? body.name, body_type: t.body_type ?? body.type, year: file.year, table: t.title,
    report_url: reportUrl(body, file.year), source_url: source, licence: t.licence, follow_up: { view: r.kind === 'kmp' ? 'remuneration' : r.kind === 'consultancy' || r.kind === 'non_consultancy' ? 'suppliers' : 'bands', record_id: r.record_id } }
  if (r.kind === 'kmp') Object.assign(base, { name: r.name, position: r.position, ...Object.fromEntries(COMPONENTS.map(c => [c, r[c] ?? null])), unit: 'dollars' })
  else if (r.kind === 'consultancy' || r.kind === 'non_consultancy') Object.assign(base, { organisation: r.organisation, abn: r.abn ?? null, expenditure_thousands: r.expenditure_thousands ?? null, unit: "$'000 GST inclusive" })
  else Object.assign(base, { band: r.band, count: r.count ?? null, averages: detail ? r.averages : { total: object(r.averages).total ?? null, base_salary: object(r.averages).base_salary ?? null }, unit: 'dollars (averages per person in the band)' })
  if (Array.isArray(r.checks) && r.checks.length) base.checks = r.checks.map(c => c === 'components_do_not_sum_to_total' ? 'The published components do not add up to the published total; both are shown as published.' : String(c))
  if (r.as_published || r.count_as_published || r.expenditure_as_published) base.as_published = r.as_published ?? r.count_as_published ?? r.expenditure_as_published
  if (detail) Object.assign(base, { source_table_last_modified: t.last_modified, row_order: r.order, caveats: Array.isArray(ix.meta.caveats) ? ix.meta.caveats : [] })
  base.full_record_url = base.report_url ?? source ?? siteUrl(env, `/annual-reports/remuneration-${file.year}.json`)
  return base
}

function citeRow(r: RecordRow): ToolCitation {
  const url = String(r.report_url ?? r.source_url ?? r.full_record_url)
  const where = `${r.body}, ${r.year} annual report on the Transparency Portal`
  if (r.kind === 'kmp') return { kind: 'record', url, value: num(r.total) ?? undefined, text: clip(`${r.name ?? 'Unnamed'} (${r.position ?? 'position not published'}), ${where}: total remuneration ${money(r.total)} (base salary ${money(r.base_salary)}, bonuses ${money(r.bonuses)}, superannuation ${money(r.superannuation)}, termination ${money(r.termination)}). Reported for the period the person held the role.`, 600) }
  if (r.kind === 'consultancy' || r.kind === 'non_consultancy') return { kind: 'record', url, text: clip(`${r.organisation}${r.abn ? ' (ABN ' + r.abn + ')' : ''} received ${num(r.expenditure_thousands) == null ? 'an amount not published as a number' : '$' + Number(r.expenditure_thousands).toLocaleString('en-AU') + ",000"} (GST inclusive) of ${r.kind === 'consultancy' ? 'reportable consultancy' : 'reportable non-consultancy'} contract expenditure, ${where}.`, 600) }
  return { kind: 'record', url, text: clip(`${r.kind === 'senior_executive_band' ? 'Senior executives' : 'Other highly paid staff'} in the ${r.band} band, ${where}: ${r.count ?? 'count not published'} people, average total remuneration ${money(object(r.averages).total)}.`, 600) }
}

async function yearFile(env: ToolEnv, kind: 'remuneration' | 'suppliers', year: string): Promise<RecordRow> {
  const data = object(await readToolAsset(env, `/annual-reports/${kind}-${year}.json`))
  if (data.year !== year || !Array.isArray(data.rows)) throw new Error('Annual report year file unavailable')
  return data
}

export const tool: ToolDefinition = {
  name: 'annual_reports',
  description: 'Commonwealth entity and company annual report disclosures from the Transparency Portal (Department of Finance), 2022-23 reports onward: key management personnel remuneration by name and position (base salary, bonuses, super, long service leave, termination, total), senior executive and other highly paid staff remuneration bands, staff headcounts, reportable consultancy and non-consultancy contract spend (with the organisations paid, by ABN), and departmental total expenses. view=remuneration finds named people (filter body, person, position, year, min_total); view=bands lists bands for a body; view=profile gives one body\'s headline figures by year; view=compare ranks bodies by a metric in one year; view=suppliers lists organisations paid (filter organisation, abn, body). Follow record_id from any row for its full detail. Amounts are as published: remuneration in dollars for the period each person held the role (part-year amounts are not annual salaries); spend and expenses in thousands of dollars. Never add totals across bodies, tables, bands or years.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    view: { type: 'string', enum: [...VIEWS] },
    body: { type: 'string', minLength: 2, maxLength: 160, description: 'Entity or company name or acronym, e.g. "Department of Finance", "CSIRO", "NBN Co".' },
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in a key management person\'s published name.' },
    position: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in the published position title, e.g. "Secretary", "Chief Executive".' },
    year: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Reporting year, e.g. 2024-25. Defaults: all years for remuneration searches, the latest complete year for compare.' },
    metric: { type: 'string', enum: [...METRICS] },
    organisation: { type: 'string', minLength: 2, maxLength: 200 },
    abn: { type: 'string', pattern: '^\\d{11}$' },
    min_total: { type: 'integer', minimum: 0, maximum: 100000000 },
    band_kind: { type: 'string', enum: ['senior_executives', 'highly_paid', 'all'] },
    record_id: { type: 'string', pattern: '^tp-(?:\\d{4}-\\d{2}-[0-9a-f]{32}|[a-z0-9_]{2,160}-\\d{4}-\\d{2})$', description: 'Copy from a row.' },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['view'], examples: [{ view: 'remuneration', body: 'Department of Finance', year: '2024-25' }, { view: 'remuneration', position: 'Chief Executive', year: '2024-25', min_total: 1000000 }, { view: 'compare', metric: 'consultancy_spend', year: '2024-25' }, { view: 'profile', body: 'CSIRO' }, { view: 'suppliers', organisation: 'Deloitte', year: '2024-25' }] },
  identifierFields: ['body'],
  validate: args => fiscalYearValid(args.year) &&
    (args.view === 'compare' ? !!args.metric && !args.person && !args.position && !args.organisation && !args.abn : !args.metric) &&
    (args.view === 'profile' ? !!args.body || !!args.record_id : true) &&
    (['remuneration', 'bands'].includes(String(args.view)) || !args.person && !args.position && args.min_total === undefined) &&
    (args.view === 'bands' || !args.band_kind) && (args.view === 'suppliers' || !args.organisation && !args.abn) &&
    (!args.record_id || ['body', 'person', 'position', 'metric', 'organisation', 'abn', 'min_total', 'offset', 'band_kind'].every(k => args[k] === undefined)),
  stepLabel: args => ({ label: 'Checking annual reports', arg: clip(args.person ?? args.body ?? args.organisation ?? args.metric ?? args.view, 40) }),
  async handler(env, args) {
    const ix = await index(env)
    const offset = Number(args.offset) || 0, limit = args.record_id ? 1 : Number(args.limit) || 5
    const notes = [NOTE]
    const snapshot = ix.meta.snapshot_at, indexUrl = siteUrl(env, '/annual-reports/index.json')
    const latest = ix.years[ix.years.length - 1]
    if (args.year && !ix.years.includes(String(args.year))) {
      return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `The published annual report projection covers reporting years ${ix.years.join(', ')}.` }], notes: [`No ${args.year} reports are in this projection. Coverage is ${ix.years.join(', ')}; earlier years were published on the Portal only as files and are not yet loaded.`], total: 0, snapshot }
    }
    const bodies = matchBodies(ix, args.body), bodyIds = new Set(bodies.map(b => String(b.id)))
    if (args.body && !bodies.length) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `${ix.bodies.length} Commonwealth entities and companies are in the published Transparency Portal projection; none matches "${clip(args.body, 80)}".` }], notes: ['No Commonwealth entity or company on the Transparency Portal matches that name. State and territory agencies are not covered here.'], total: 0, snapshot }
    const bodyNote = args.body && bodies.length > 1 ? [`"${clip(args.body, 60)}" matches ${bodies.length} bodies: ${bodies.slice(0, 6).map(b => b.name).join('; ')}${bodies.length > 6 ? '…' : ''}. Use the exact name to narrow.`] : []

    // Headline rows (profile / compare)
    if (args.view === 'profile' || args.view === 'compare' || (args.record_id && HEADLINE_ID.test(String(args.record_id)))) {
      const headlineOut = (h: RecordRow): RecordRow => {
        const body = ix.byId.get(String(h.body_id)) ?? {}
        const pick = (part: unknown) => { const o = object(part); return Object.keys(o).length ? Object.fromEntries(Object.entries(o).filter(([k]) => !['source_item_id', 'codename', 'source_last_modified'].includes(k))) : null }
        const sources = ['income_statement', 'consultancy', 'non_consultancy', 'ongoing_staff', 'non_ongoing_staff'].map(k => apiUrl(object(h[k]).codename)).filter(Boolean)
        return { record_id: h.record_id, body: body.name, body_type: body.type, portfolio: object(object(body.reports)[String(h.year)]).portfolio ?? body.portfolio ?? null, year: h.year,
          income_statement: pick(h.income_statement), consultancy: pick(h.consultancy), non_consultancy: pick(h.non_consultancy),
          ongoing_staff: object(h.ongoing_staff).headcount ?? null, non_ongoing_staff: object(h.non_ongoing_staff).headcount ?? null,
          austender_agency_id: body.austender_agency_id ?? null, report_url: reportUrl(body, h.year), source_urls: sources,
          full_record_url: reportUrl(body, h.year) ?? sources[0] ?? indexUrl, follow_up: { view: 'profile', record_id: h.record_id } }
      }
      let picked: RecordRow[], total: number, countText: string
      if (args.record_id) {
        const h = ix.headline.find(r => r.record_id === args.record_id)
        picked = h ? [headlineOut(h)] : []; total = picked.length; countText = h ? 'One body-year record.' : 'No body-year record has this id in the current snapshot.'
      } else if (args.view === 'profile') {
        const rows = ix.headline.filter(h => bodyIds.has(String(h.body_id)) && (!args.year || h.year === args.year)).sort((a, b) => String(b.year).localeCompare(String(a.year)))
        total = rows.length; picked = rows.slice(offset, offset + (Number(args.limit) || 4)).map(headlineOut)
        countText = `${rows.length} body-year headline records for ${bodies.length === 1 ? bodies[0].name : bodies.length + ' matching bodies'}${args.year ? ' in ' + args.year : ''}.`
      } else {
        const metric = METRIC[args.metric as Metric], year = String(args.year ?? (ix.years.length > 1 ? ix.years[ix.years.length - 2] : latest))
        const part = (h: RecordRow) => object(args.metric === 'consultancy_spend' || args.metric === 'consultancy_contracts' ? h.consultancy : args.metric === 'non_consultancy_spend' ? h.non_consultancy : {})
        const candidates = ix.headline.filter(h => h.year === year && (!args.body || bodyIds.has(String(h.body_id))) && num(metric.get(h)) != null)
        const flagged = candidates.filter(h => part(h).scale_check)
        const ranked = candidates.filter(h => !part(h).scale_check).sort((a, b) => Number(metric.get(b)) - Number(metric.get(a)))
        if (flagged.length) notes.push(`Left out of this ranking because the published figure looks like dollars entered in a thousands-of-dollars field (shown as published in each body's profile): ${flagged.map(h => `${ix.byId.get(String(h.body_id))?.name} (${metric.get(h)})`).join('; ')}.`)
        total = ranked.length
        picked = ranked.slice(offset, offset + limit).map((h, i) => ({ rank: offset + i + 1, metric: args.metric, value: metric.get(h), unit: metric.unit, ...headlineOut(h) }))
        countText = `${ranked.length} bodies published ${metric.label} for ${year}; ranked highest first.`
        if (!args.year) notes.push(`Defaulted to ${year}, the latest reporting year whose reports have largely been tabled; ${latest} reports are still being tabled.`)
        if (args.metric === 'total_expenses' || args.metric === 'employee_benefits' || args.metric === 'suppliers_expense') notes.push('Departmental statement of comprehensive income only; administered expenses (grants, benefits and other payments an entity administers for the government) are excluded.')
      }
      const citations: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: countText }, ...picked.map(r => ({ kind: 'record' as const, url: String(r.full_record_url),
        text: clip(r.metric ? `${r.body}, ${r.year}: ${METRIC[r.metric as Metric].label} ${r.value} (${r.unit}), as published in its annual report.` : `${r.body}, ${r.year} annual report: departmental total expenses ${object(r.income_statement).total_expenses ?? 'not published'} ($'000); ongoing staff ${r.ongoing_staff ?? 'not published'}, non-ongoing ${r.non_ongoing_staff ?? 'not published'} (headcount); consultancy spend ${object(r.consultancy).expenditure_thousands ?? 'not published'} ($'000 GST inc).`, 600) }))]
      if (!picked.length) notes.push('No matching record. This does not establish that the entity published no such figure: coverage starts with 2022-23 reports and some reports are still being tabled.')
      return publishedResult(picked, citations, { view: args.view, total, offset, next_offset: offset + picked.length < total ? offset + picked.length : null, snapshot, notes: [...bodyNote, ...notes] })
    }

    // Row files (remuneration / bands / suppliers)
    const kind = args.view === 'suppliers' ? 'suppliers' : 'remuneration'
    let years: string[]
    if (args.record_id) { const m = ROW_ID.exec(String(args.record_id)); years = m && ix.years.includes(m[1]) ? [m[1]] : [] }
    else years = args.year ? [String(args.year)] : [...ix.years].reverse()
    const matches: { file: RecordRow; row: RecordRow }[] = []
    for (const year of years) {
      const file = await yearFile(env, kind, year), tables = object(file.tables)
      for (const r of records(file.rows)) {
        if (args.record_id) { if (r.record_id === args.record_id) matches.push({ file, row: r }); continue }
        const t = object(tables[String(r.table_id)])
        if (args.body && !bodyIds.has(String(t.body_id))) continue
        if (args.view === 'remuneration') {
          if (r.kind !== 'kmp') continue
          if (args.person && !wordsMatch(args.person, [r.name])) continue
          if (args.position && !wordsMatch(args.position, [r.position])) continue
          if (args.min_total !== undefined && !(num(r.total) != null && Number(r.total) >= Number(args.min_total))) continue
        } else if (args.view === 'bands') {
          if (r.kind === 'kmp' || args.band_kind === 'senior_executives' && r.kind !== 'senior_executive_band' || args.band_kind === 'highly_paid' && r.kind !== 'highly_paid_band') continue
        } else {
          if (args.organisation && !wordsMatch(args.organisation, [r.organisation])) continue
          if (args.abn && r.abn !== args.abn) continue
        }
        matches.push({ file, row: r })
      }
    }
    if (args.view === 'remuneration' && !args.record_id) matches.sort((a, b) => (num(b.row.total) ?? -1) - (num(a.row.total) ?? -1))
    if (args.view === 'suppliers' && !args.record_id && !args.body) matches.sort((a, b) => (num(b.row.expenditure_thousands) ?? -1) - (num(a.row.expenditure_thousands) ?? -1))
    const picked = matches.slice(offset, offset + limit).map(m => rowOut(env, ix, m.file, m.row, !!args.record_id))
    const scope = ['body', 'person', 'position', 'year', 'organisation', 'abn', 'min_total', 'band_kind'].filter(k => args[k] !== undefined).map(k => `${k} ${args[k]}`).join(', ') || 'all bodies'
    const what = args.view === 'remuneration' ? 'key management personnel rows' : args.view === 'bands' ? 'remuneration band rows' : 'supplier rows'
    const count: ToolCitation = { kind: 'count', url: indexUrl, text: `${matches.length} ${what} match ${scope} in reporting years ${years.join(', ') || 'none'} of the published Transparency Portal projection (snapshot ${snapshot}).` }
    if (args.view === 'remuneration') notes.push('One row per person per reporting year as the entity published it; a person who held a role for part of the year shows the part-year amount, and a person can appear for more than one body or year. Sorted by total remuneration, highest first.')
    if (args.view === 'bands') notes.push('Each band row is a count of people and their average remuneration components. The averages are per person in that band.')
    if (args.view === 'suppliers') notes.push('Organisations receiving a share of reportable contract expenditure, in thousands of dollars GST inclusive, as each entity listed them (entities list their largest recipients, not all of them). A row does not show what the work was.')
    if (!matches.length) notes.push('No matching row in this projection. This does not establish that no such person, band or payment exists: coverage starts with 2022-23 reports, 2025-26 reports are still being tabled, and earlier years are not yet loaded.')
    return publishedResult(picked, [count, ...picked.map(citeRow)], { view: args.view, total: matches.length, offset,
      next_offset: offset + picked.length < matches.length ? offset + picked.length : null, years, snapshot, notes: [...bodyNote, ...notes] })
  },
}
