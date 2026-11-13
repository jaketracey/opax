/** Commonwealth annual report disclosures from the Transparency Portal (public/annual-reports). */
import { clip, fold, siteUrl } from './record-common'
import { fiscalYearValid, object, publishedResult, records, sourceUrl, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'
import { isAgencyHead, remunerationName } from '../ask-remuneration'

const VIEWS = ['remuneration', 'agency_heads', 'bands', 'profile', 'compare', 'suppliers', 'kmp_counts', 'top_by_year'] as const
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
const fromTo = (ys: string[]) => ys.length > 1 ? `${ys[0]} to ${ys[ys.length - 1]}` : ys[0] ?? 'no years'
const plural = (n: unknown, one: string, many: string) => `${n} ${Number(n) === 1 ? one : many}`
const list = (items: string[]) => items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items.join('')
const apiUrl = (codename: unknown) => typeof codename === 'string' && /^[a-z0-9_]+$/.test(codename) ? `${API}?system.codename=${codename}&depth=1` : null

async function index(env: ToolEnv) {
  const data = object(await readToolAsset(env, '/annual-reports/index.json')), meta = object(data.meta)
  const bodies = records(data.bodies), headline = records(data.headline), years = Array.isArray(object(meta.counts).years) ? (object(meta.counts).years as unknown[]).filter((y): y is string => typeof y === 'string') : []
  if (!bodies.length || !years.length || typeof meta.snapshot_at !== 'string') throw new Error('Annual report projection unavailable')
  const cov = object(object(meta.counts).coverage)
  const span = (k: string) => { const v = Array.isArray(cov[k]) ? (cov[k] as unknown[]).filter((y): y is string => typeof y === 'string') : []; return v.length ? v : years }
  const coverage = { remuneration: span('remuneration'), bands: span('bands'), suppliers: span('suppliers'), headline: span('headline') }
  return { meta, bodies, headline, years, coverage, byId: new Map(bodies.map(b => [String(b.id), b])) }
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
  const source = sourceUrl(t.source_url) ?? apiUrl(t.codename)
  const base: RecordRow = { record_id: r.record_id, kind: r.kind, body: t.body ?? body.name, body_type: t.body_type ?? body.type, year: file.year, table: t.title,
    report_url: reportUrl(body, file.year), source_url: source, licence: t.licence, follow_up: { view: r.kind === 'kmp' ? 'remuneration' : r.kind === 'consultancy' || r.kind === 'non_consultancy' ? 'suppliers' : 'bands', record_id: r.record_id } }
  if (r.kind === 'kmp') Object.assign(base, { name: remunerationName(r.name), ...(r.name_as_published != null || remunerationName(r.name) !== r.name ? { name_as_published: r.name_as_published ?? r.name } : {}), position: r.position, ...Object.fromEntries(COMPONENTS.map(c => [c, r[c] ?? null])), unit: 'dollars' })
  else if (r.kind === 'consultancy' || r.kind === 'non_consultancy') Object.assign(base, { organisation: r.organisation, abn: r.abn ?? null,
    ...('expenditure_dollars' in r ? { expenditure_dollars: r.expenditure_dollars ?? null, unit: 'dollars GST inclusive' } : { expenditure_thousands: r.expenditure_thousands ?? null, unit: "$'000 GST inclusive" }) })
  else Object.assign(base, { band: r.band, count: r.count ?? null, averages: detail ? r.averages : { total: object(r.averages).total ?? null, base_salary: object(r.averages).base_salary ?? null }, unit: 'dollars (averages per person in the band)' })
  if (Array.isArray(r.checks) && r.checks.length) base.checks = r.checks.map(c => c === 'components_do_not_sum_to_total' ? 'The published components do not add up to the published total; both are shown as published.' : String(c))
  if (r.as_published || r.count_as_published || r.expenditure_as_published) base.as_published = r.as_published ?? r.count_as_published ?? r.expenditure_as_published
  if (t.source_file) Object.assign(base, { source_file: t.source_file, source_row: r.source_row ?? null, ...(r.source_column ? { source_column: r.source_column } : {}), ...(t.entity_as_published !== base.body ? { entity_as_published: t.entity_as_published } : {}) })
  if (detail) Object.assign(base, { ...(t.source_file ? { source_page: t.source_page } : { source_table_last_modified: t.last_modified }), row_order: r.order, caveats: Array.isArray(ix.meta.caveats) ? ix.meta.caveats : [] })
  if (r.organisation_as_published) base.organisation_as_published = r.organisation_as_published
  base.full_record_url = base.report_url ?? source ?? siteUrl(env, `/annual-reports/remuneration-${file.year}.json`)
  return base
}

function citeRow(r: RecordRow): ToolCitation {
  const url = String(r.report_url ?? r.source_url ?? r.full_record_url)
  const where = r.source_file ? `${r.body}, ${r.year} annual report data (Transparency Portal data file "${r.source_file}", row ${r.source_row})` : `${r.body}, ${r.year} annual report on the Transparency Portal`
  if (r.kind === 'kmp') {
    const components = Object.fromEntries(COMPONENTS.filter(c => c !== 'total').map(c => [c, num(r[c])]))
    const checks = Array.isArray(r.checks) ? r.checks.map(String) : []
    const ranking = r.rank ? ` Ranked ${r.rank} among the published agency-head rows for ${r.year}.${r.latest_complete ? ' This is the latest largely tabled reporting year in this snapshot.' : ''}` : ''
    return { kind: 'record', url, remuneration: {record_id:String(r.record_id),name:String(r.name ?? 'Unnamed'),body:String(r.body),position:String(r.position ?? 'position not published'),year:String(r.year),total:num(r.total),components,checks,...(r.ranking_year ? {ranking_year:String(r.ranking_year),historical:r.historical===true,latest_complete:r.latest_complete===true,...(r.rank ? {rank:Number(r.rank)} : {})} : {})}, value: num(r.total) ?? undefined,
      text: `${r.name ?? 'Unnamed'} (${r.position ?? 'position not published'}), ${where}: total remuneration ${money(r.total)} (base salary ${money(r.base_salary)}, bonuses ${money(r.bonuses)}, other benefits ${money(r.other_benefits)}, superannuation ${money(r.superannuation)}, long service leave ${money(r.long_service_leave)}, other long-term benefits ${money(r.other_long_term)}, termination ${money(r.termination)}). Reported for the period the person held the role.${ranking}${checks.length ? ' ' + checks.join(' ') : ''}` }
  }
  if (r.kind === 'consultancy' || r.kind === 'non_consultancy') return { kind: 'record', url, text: clip(`${r.organisation}${r.abn ? ' (ABN ' + r.abn + ')' : ''} received ${'expenditure_dollars' in r ? (num(r.expenditure_dollars) == null ? 'an amount not published as a number' : '$' + Number(r.expenditure_dollars).toLocaleString('en-AU')) : num(r.expenditure_thousands) == null ? 'an amount not published as a number' : '$' + Number(r.expenditure_thousands).toLocaleString('en-AU') + ",000"} (GST inclusive) of ${r.kind === 'consultancy' ? 'reportable consultancy' : 'reportable non-consultancy'} contract expenditure, ${where}.`, 600) }
  return { kind: 'record', url, text: clip(`${r.kind === 'senior_executive_band' ? 'Senior executives' : 'Other highly paid staff'} in the ${r.band} band, ${where}: ${r.count == null ? 'count not published' : plural(r.count, 'person', 'people')}, average total remuneration ${money(object(r.averages).total)}.`, 600) }
}

async function yearFile(env: ToolEnv, kind: 'remuneration' | 'suppliers', year: string): Promise<RecordRow> {
  const data = object(await readToolAsset(env, `/annual-reports/${kind}-${year}.json`))
  if (data.year !== year || !Array.isArray(data.rows)) throw new Error('Annual report year file unavailable')
  return data
}

export const tool: ToolDefinition = {
  name: 'annual_reports',
  description: 'Commonwealth entity and company annual report disclosures from the Transparency Portal (Department of Finance): key management personnel and remuneration bands from 2018-19 reports, organisations paid from 2020-21, headline figures from 2022-23. Covers key management personnel remuneration by name and position (base salary, bonuses, super, long service leave, termination, total), senior executive and other highly paid staff remuneration bands, staff headcounts, reportable consultancy and non-consultancy contract spend (with the organisations paid, by ABN), and departmental total expenses. view=remuneration finds named people (filter body, person, position, year, min_total); view=bands lists bands for a body; view=profile gives one body\'s headline figures by year; view=compare ranks bodies by a metric in one year; view=suppliers lists organisations paid (filter organisation, abn, body); view=kmp_counts ranks bodies by how many key management personnel rows each published in one year (for "which agencies reported the most key management personnel"; counts are published disclosure rows, not distinct people); view=top_by_year gives one body\'s largest key management personnel total remuneration row in each year, oldest first (for "how has the highest paid executive\'s pay changed", optional position, first_year, last_year; each year retains its recorded person and total separately). Follow record_id from any row for its full detail. Amounts are as published: remuneration in dollars for the period each person held the role (part-year amounts are not annual salaries); spend and expenses in each row\'s stated unit (thousands of dollars, except 2020-21 supplier rows in dollars). Keep each body, table, band and year’s published measure separate.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    view: { type: 'string', enum: [...VIEWS] },
    body: { type: 'string', minLength: 2, maxLength: 160, description: 'Entity or company name or acronym, e.g. "Department of Finance", "CSIRO", "NBN Co".' },
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in a key management person\'s published name.' },
    position: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in the published position title, e.g. "Secretary", "Chief Executive".' },
    year: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'Reporting year. agency_heads ranks heads in the latest settled year by default, compare and kmp_counts likewise; remuneration searches all years.' },
    first_year: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'top_by_year only: first reporting year to include.' },
    last_year: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'top_by_year only: last reporting year to include.' },
    metric: { type: 'string', enum: [...METRICS] },
    organisation: { type: 'string', minLength: 2, maxLength: 200 },
    abn: { type: 'string', pattern: '^\\d{11}$' },
    min_total: { type: 'integer', minimum: 0, maximum: 100000000 },
    band_kind: { type: 'string', enum: ['senior_executives', 'highly_paid', 'all'] },
    record_id: { type: 'string', pattern: '^tp-(?:\\d{4}-\\d{2}-[0-9a-f]{32}|[a-z0-9_]{2,160}-\\d{4}-\\d{2})$', description: 'Copy from a row.' },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['view'], examples: [{ view: 'remuneration', body: 'Department of Finance', year: '2024-25' }, { view: 'remuneration', position: 'Chief Executive', year: '2024-25', min_total: 1000000 }, { view: 'compare', metric: 'consultancy_spend', year: '2024-25' }, { view: 'profile', body: 'CSIRO' }, { view: 'suppliers', organisation: 'Deloitte', year: '2024-25' }, { view: 'kmp_counts', year: '2018-19' }, { view: 'top_by_year', body: 'Department of Health', first_year: '2018-19', last_year: '2024-25' }] },
  identifierFields: ['body'],
  validate: args => fiscalYearValid(args.year) && fiscalYearValid(args.first_year) && fiscalYearValid(args.last_year) &&
    (args.view === 'top_by_year' ? !!args.body && !args.year && !args.record_id && (!args.first_year || !args.last_year || String(args.first_year) <= String(args.last_year)) : !args.first_year && !args.last_year) &&
    (args.view !== 'kmp_counts' || !args.record_id && !args.person && !args.position) &&
    (args.view === 'compare' ? !!args.metric && !args.person && !args.position && !args.organisation && !args.abn : !args.metric) &&
    (args.view === 'profile' ? !!args.body || !!args.record_id : true) &&
    (['remuneration', 'bands'].includes(String(args.view)) || !args.person && (!args.position || args.view === 'top_by_year') && args.min_total === undefined) &&
    (args.view !== 'agency_heads' || !args.record_id) &&
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
      return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `The published annual report projection covers reporting years ${ix.years.join(', ')}.` }], notes: [`No ${args.year} reports are in this projection. Coverage is ${fromTo(ix.years)}; the Portal holds no annual report data before 2018-19.`], total: 0, snapshot }
    }
    const bodies = matchBodies(ix, args.body), bodyIds = new Set(bodies.map(b => String(b.id)))
    if (args.body && !bodies.length) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `${ix.bodies.length} Commonwealth entities and companies are in the published Transparency Portal projection; none matches "${clip(args.body, 80)}".` }], notes: ['No Commonwealth entity or company on the Transparency Portal matches that name. State and territory agencies are not covered by this tool; some of their annual report figures are in the agency_reports dataset.'], total: 0, snapshot }
    const bodyNote = args.body && bodies.length > 1 ? [`"${clip(args.body, 60)}" matches ${bodies.length} bodies: ${bodies.slice(0, 6).map(b => b.name).join('; ')}${bodies.length > 6 ? '…' : ''}. Use the exact name to narrow.`] : []
    const settled = ix.years.length > 1 ? ix.years[ix.years.length - 2] : latest

    // How many key management personnel rows each body published in one year, most first.
    if (args.view === 'kmp_counts') {
      const year = String(args.year ?? settled), file = await yearFile(env, 'remuneration', year), tables = object(file.tables)
      const by = new Map<string, { body: string; body_type: unknown; rows: number; source: string | null; file?: unknown }>()
      for (const r of records(file.rows)) {
        if (r.kind !== 'kmp') continue
        const t = object(tables[String(r.table_id)]), id = String(t.body_id)
        if (args.body && !bodyIds.has(id)) continue
        const b = ix.byId.get(id) ?? {}, entry = by.get(id) ?? { body: String(t.body ?? b.name), body_type: t.body_type ?? b.type, rows: 0, source: sourceUrl(t.source_url) ?? apiUrl(t.codename), file: t.source_file }
        entry.rows++; by.set(id, entry)
      }
      const ranked = [...by.entries()].sort((a, b) => b[1].rows - a[1].rows || a[1].body.localeCompare(b[1].body))
      const rankOf = (n: number) => 1 + ranked.filter(([, e]) => e.rows > n).length, tied = (n: number) => ranked.filter(([, e]) => e.rows === n).length > 1
      const picked = ranked.slice(offset, offset + limit).map(([id, e]) => {
        const body = ix.byId.get(id) ?? {}
        return { rank: rankOf(e.rows), tied: tied(e.rows), body: e.body, body_type: e.body_type ?? null, year, kmp_rows: e.rows, unit: 'published key management personnel rows',
          report_url: reportUrl(body, year), source_url: e.source, ...(e.file ? { source_file: e.file } : {}), full_record_url: reportUrl(body, year) ?? e.source ?? siteUrl(env, `/annual-reports/remuneration-${year}.json`),
          follow_up: { view: 'remuneration', body: e.body, year } } as RecordRow
      })
      const lead = `This ranks the ${ranked.length} ${ranked.length === 1 ? 'body' : 'bodies'} that published key management personnel rows for ${year} by the number of rows each published, most first. A row is one published disclosure, not necessarily a distinct person: someone who acted in or changed roles can have more than one row, and bodies differ in whom they list (some include board members).`
      const citations: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: lead }, ...picked.map(r => ({ kind: 'count' as const, url: String(r.full_record_url),
        text: `${r.body}: ${plural(r.kmp_rows, 'key management personnel disclosure row', 'key management personnel disclosure rows')} published for ${year} (rank ${r.rank} of ${ranked.length} bodies${r.tied ? ', tied' : ''}).` }))]
      notes.push('Counts of published key management personnel rows per body, not counts of people. Table total lines and lines that name no one are not counted. Follow a row\'s follow_up for the named rows.')
      if (!args.year) notes.push(`Defaulted to ${year}, the latest reporting year whose reports have largely been tabled; ${latest} reports are still being tabled.`)
      if (!ix.coverage.remuneration.includes(year)) notes.push(`Key management personnel are covered for ${fromTo(ix.coverage.remuneration)}.`)
      if (!picked.length) notes.push('No matching body published key management personnel rows for this year in this projection. This does not establish that it had none.')
      return publishedResult(picked, citations, { view: args.view, total: ranked.length, offset, next_offset: offset + picked.length < ranked.length ? offset + picked.length : null, years: [year], snapshot, notes: [...bodyNote, ...notes] })
    }

    // One body's largest key management personnel total in each year: a comparison, never a sum.
    if (args.view === 'top_by_year') {
      const exact = bodies.filter(b => norm(b.name) === norm(args.body) || String(b.acronyms ?? '').split(/[,;/]/).some(a => norm(a) === norm(args.body)))
      if (bodies.length !== 1 && exact.length !== 1) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `"${clip(args.body, 80)}" matches ${bodies.length} bodies in the published Transparency Portal projection, so no single body's yearly comparison is shown.` }], notes: [...bodyNote], total: 0, snapshot }
      const base = exact.length === 1 ? exact[0] : bodies[0]
      // Bodies whose names extend this one ("Department of Health and Aged Care") fill years it has no rows for, never years it has.
      const longer = ix.bodies.filter(b => b.id !== base.id && norm(b.name).startsWith(norm(base.name) + ' '))
      const span = ix.coverage.remuneration.filter(y => (!args.first_year || y >= String(args.first_year)) && (!args.last_year || y <= String(args.last_year)))
      const top = new Map<string, Map<string, { file: RecordRow; row: RecordRow }>>()
      for (const year of span) {
        const file = await yearFile(env, 'remuneration', year), tables = object(file.tables), ids = new Set([base, ...longer].map(b => String(b.id)))
        for (const r of records(file.rows)) {
          const id = String(object(tables[String(r.table_id)]).body_id)
          if (r.kind !== 'kmp' || !ids.has(id) || num(r.total) == null || args.position && !wordsMatch(args.position, [r.position])) continue
          const byBody = top.get(id) ?? new Map(), held = byBody.get(year)
          if (!held || Number(r.total) > Number(held.row.total)) byBody.set(year, { file, row: r })
          top.set(id, byBody)
        }
      }
      const included = [base], held = new Set(top.get(String(base.id))?.keys() ?? [])
      for (const b of longer.sort((x, y) => String([...(top.get(String(x.id))?.keys() ?? [])].sort()[0] ?? '9').localeCompare(String([...(top.get(String(y.id))?.keys() ?? [])].sort()[0] ?? '9')))) {
        const ys = [...(top.get(String(b.id))?.keys() ?? [])]
        if (ys.length && ys.every(y => !held.has(y))) { included.push(b); ys.forEach(y => held.add(y)) }
      }
      const picks = span.flatMap(year => included.flatMap(b => { const hit = top.get(String(b.id))?.get(year); return hit ? [hit] : [] }))
      const rows = picks.map(m => rowOut(env, ix, m.file, m.row, false))
      const yearsOf = (b: RecordRow) => span.filter(y => top.get(String(b.id))?.has(y))
      const label = included.length === 1 ? String(base.name) : list(included.map(b => `${b.name} (${fromTo(yearsOf(b))})`))
      const role = args.position ? ` for positions matching "${clip(args.position, 40)}"` : ''
      // One citation: a lead, then one "Name (Position), Body, year annual report: $N total remuneration." sentence per year,
      // so a written answer reads it as a side-by-side comparison and each figure keeps its own person, body and year.
      const yearly = rows.map(r => `${r.name ?? 'Name not published'} (${r.position ?? 'position not published'}), ${r.body}, ${r.year} annual report: ${money(r.total)} total remuneration.`)
      const summary = rows.length ? `Largest key management personnel total remuneration row in each year's table${role}, ${label}, ${fromTo(rows.map(r => String(r.year)))}, shown year by year and never added. ${yearly.join(' ')} Each is the largest single row that year, for the period that person held the role, so the rows can be different people and part-year amounts rather than one person's pay history.` : ''
      const links = rows.flatMap(r => { const url = r.report_url ?? r.source_url; return url ? [{ label: `${r.body}, ${r.year} annual report`, url: String(url) }] : [] })
      if (included.length > 1) notes.push(`${list(included.slice(1).map(b => String(b.name)))} ${included.length > 2 ? 'are' : 'is a'} separate Portal ${included.length > 2 ? 'entities' : 'entity'} whose name extends "${base.name}" and whose rows fill years "${base.name}" has none for. The Portal lists them separately; this comparison does not establish that one body succeeded the other.`)
      notes.push('One row per year: the largest published total remuneration among the body\'s key management personnel rows. Table total lines are excluded. Compare years side by side; never add them.')
      if (span.includes(latest)) notes.push(`${latest} reports are still being tabled.`)
      const missing = span.filter(y => !rows.some(r => r.year === y))
      if (missing.length && rows.length) notes.push(`No key management personnel row with a numeric total for ${missing.join(', ')} in this projection. This does not establish that the body published none.`)
      if (!rows.length) notes.push('No matching key management personnel row in this projection. This does not establish that none was published.')
      const citations: ToolCitation[] = summary ? [{ kind: 'record', url: links[links.length - 1]?.url ?? indexUrl, text: clip(summary, 2400), related: links }] : [{ kind: 'export', url: indexUrl, text: `No key management personnel row with a numeric total matches ${base.name}${role} in ${fromTo(span)}.` }]
      return publishedResult(rows, citations, { view: args.view, total: rows.length, offset: 0, next_offset: null, years: span, snapshot, notes: [...bodyNote, ...notes] })
    }

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
        const metric = METRIC[args.metric as Metric], year = String(args.year ?? settled)
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
      if (args.year && !ix.coverage.headline.includes(String(args.year))) notes.push(`Headline figures (expenses, staff numbers, contract spend) are loaded for ${fromTo(ix.coverage.headline)} only; earlier years were published as wide data files that are not yet loaded.`)
      if (!picked.length) notes.push(`No matching record. This does not establish that the entity published no such figure: headline coverage is ${fromTo(ix.coverage.headline)} and some reports are still being tabled.`)
      return publishedResult(picked, citations, { view: args.view, total, offset, next_offset: offset + picked.length < total ? offset + picked.length : null, snapshot, notes: [...bodyNote, ...notes] })
    }

    // Row files (remuneration / bands / suppliers)
    const kind = args.view === 'suppliers' ? 'suppliers' : 'remuneration'
    const headRanking = args.view === 'agency_heads', headYear = String(args.year ?? settled)
    let years: string[]
    if (args.record_id) { const m = ROW_ID.exec(String(args.record_id)); years = m && ix.years.includes(m[1]) ? [m[1]] : [] }
    else years = args.year ? [String(args.year)] : [...ix.years].reverse().filter(y => !headRanking || y <= headYear)
    const matches: { file: RecordRow; row: RecordRow }[] = []
    for (const year of years) {
      const file = await yearFile(env, kind, year), tables = object(file.tables)
      for (const r of records(file.rows)) {
        if (args.record_id) { if (r.record_id === args.record_id) matches.push({ file, row: r }); continue }
        const t = object(tables[String(r.table_id)])
        if (args.body && !bodyIds.has(String(t.body_id))) continue
        if (args.view === 'remuneration' || headRanking) {
          if (r.kind !== 'kmp') continue
          if (headRanking && (!isAgencyHead(r.position) || num(r.total) == null)) continue
          if (args.person && !norm(args.person).split(' ').every(word => norm(remunerationName(r.name)).split(' ').includes(word))) continue
          if (args.position && !wordsMatch(args.position, [r.position])) continue
          if (args.min_total !== undefined && !(num(r.total) != null && Number(r.total) >= Number(args.min_total))) continue
        } else if (args.view === 'bands') {
          if (!String(r.kind).endsWith('_band') || args.band_kind === 'senior_executives' && r.kind !== 'senior_executive_band' || args.band_kind === 'highly_paid' && r.kind !== 'highly_paid_band') continue
        } else {
          if (args.organisation && !wordsMatch(args.organisation, [r.organisation])) continue
          if (args.abn && r.abn !== args.abn) continue
        }
        matches.push({ file, row: r })
      }
    }
    if ((args.view === 'remuneration' || headRanking) && !args.record_id) matches.sort((a, b) =>
      (args.person ? String(b.file.year).localeCompare(String(a.file.year)) : 0) || (num(b.row.total) ?? -1) - (num(a.row.total) ?? -1))
    // Ordering only: each row is still shown in its own published unit.
    const dollars = (r: RecordRow) => num(r.expenditure_dollars) ?? (num(r.expenditure_thousands) == null ? -1 : Number(r.expenditure_thousands) * 1000)
    if (args.view === 'suppliers' && !args.record_id && !args.body) matches.sort((a, b) => dollars(b.row) - dollars(a.row))
    const ranked = headRanking ? matches.filter(m => m.file.year === headYear) : matches
    const picked = ranked.slice(offset, offset + limit).map((m,i) => ({...rowOut(env, ix, m.file, m.row, !!args.record_id), ...(headRanking ? {rank:offset+i+1,ranking_year:headYear,historical:false,latest_complete:!args.year} : {})}))
    if (headRanking && !args.year && offset === 0 && ranked.length) {
      // A historical outlier is context, never a competitor in the current-year ranking.
      const older = matches.find(m => String(m.file.year) < headYear && Number(m.row.total) > Number(ranked[0].row.total) * 1.25)
      if (older) picked.push({...rowOut(env, ix, older.file, older.row, false),ranking_year:headYear,historical:true})
    }
    const scope = ['body', 'person', 'position', 'year', 'organisation', 'abn', 'min_total', 'band_kind'].filter(k => args[k] !== undefined).map(k => `${k} ${args[k]}`).join(', ') || 'all bodies'
    const what = args.view === 'remuneration' ? 'key management personnel rows' : args.view === 'bands' ? 'remuneration band rows' : 'supplier rows'
    const count: ToolCitation = { kind: 'count', url: indexUrl, text: `${matches.length} ${what} match ${scope} in reporting years ${years.join(', ') || 'none'} of the published Transparency Portal projection (snapshot ${snapshot}).` }
    if (headRanking) {
      count.text = `${ranked.length} published agency-head remuneration rows for ${headYear}, ranked by total remuneration, highest first.${!args.year ? ` This is the latest reporting year whose reports have largely been tabled in this snapshot; ${latest} reports are still being tabled.` : ''}`
      notes.push('Agency heads only, excluding deputies, assistants and functional chiefs. Published total remuneration for the period in the role, not necessarily an annual salary. Any materially larger older row is labelled separately with its year and published component caveats.')
    }
    if (args.view === 'remuneration') notes.push(`One row per person per reporting year as the entity published it; a person who held a role for part of the year shows the part-year amount, and a person can appear for more than one body or year. Sorted ${args.person ? 'by reporting year, latest first, then total remuneration' : 'by total remuneration, highest first'}.`)
    if (args.view === 'bands') notes.push('Each band row is a count of people and their average remuneration components. The averages are per person in that band.')
    if (args.view === 'suppliers') notes.push('Organisations receiving a share of reportable contract expenditure, GST inclusive, in each row\'s stated unit (2020-21 rows are in dollars, later years in thousands of dollars), as each entity listed them (entities list their largest recipients, not all of them). A row does not show what the work was. Never add amounts across rows with different units.')
    const span = args.view === 'suppliers' ? ix.coverage.suppliers : args.view === 'bands' ? ix.coverage.bands : ix.coverage.remuneration
    if (args.year && !span.includes(String(args.year))) notes.push(`${args.view === 'suppliers' ? 'Organisations paid' : args.view === 'bands' ? 'Remuneration bands' : 'Key management personnel'} are covered for ${fromTo(span)}; the Portal published no such table for ${args.year}.`)
    if (!matches.length) notes.push(`No matching row in this projection. This does not establish that no such person, band or payment exists: coverage is ${fromTo(span)}, the latest year's reports are still being tabled, and an entity that did not publish a table is not listed.`)
    return publishedResult(picked, [count, ...picked.map(citeRow)], { view: args.view, total: ranked.length, offset,
      next_offset: offset + Math.min(limit,ranked.length-offset) < ranked.length ? offset + limit : null, years: headRanking ? [headYear] : years, snapshot, notes: [...bodyNote, ...notes] })
  },
}
