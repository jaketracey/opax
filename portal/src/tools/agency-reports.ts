/** Figures read from Commonwealth, state and territory agency annual report PDFs (public/agency-reports). */
import { clip, fold, siteUrl } from './record-common'
import { object, publishedResult, records, sourceUrl, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const VIEWS = ['coverage', 'documents', 'facts'] as const
const JURISDICTIONS = ['Cth', 'NSW', 'Vic', 'Qld', 'WA', 'SA', 'Tas', 'ACT', 'NT'] as const
const HOUSE: Record<string, string> = { federal: 'Cth', cth: 'Cth', commonwealth: 'Cth', nsw: 'NSW', vic: 'Vic', victoria: 'Vic', qld: 'Qld', queensland: 'Qld', wa: 'WA', sa: 'SA', tas: 'Tas', tasmania: 'Tas', act: 'ACT', nt: 'NT' }
const jurisdictionCode = (v: unknown): string | undefined => v == null || v === '' ? undefined : HOUSE[String(v).toLowerCase()] ?? String(v)
// pay, then workforce, then money, then operations; single consultancies last
const METRICS = ['head_remuneration', 'named_remuneration', 'executive_count', 'executive_band', 'executive_remuneration_total', 'executive_average_remuneration',
  'staff_headcount', 'staff_fte', 'total_expenses', 'total_income', 'employee_expenses', 'net_result', 'consultancy_total',
  'matters_received', 'investigations_commenced', 'investigations_finalised', 'public_hearings', 'referrals_to_prosecution', 'recommendations_made', 'operational_other', 'consultancy'] as const
const GROUPS: Record<string, readonly string[]> = {
  pay: ['head_remuneration', 'named_remuneration', 'executive_count', 'executive_band', 'executive_remuneration_total', 'executive_average_remuneration'],
  staff: ['staff_headcount', 'staff_fte'],
  finance: ['total_expenses', 'total_income', 'employee_expenses', 'net_result', 'consultancy_total', 'consultancy'],
  operations: ['matters_received', 'investigations_commenced', 'investigations_finalised', 'public_hearings', 'referrals_to_prosecution', 'recommendations_made', 'operational_other'],
}
const UNIT: Record<string, string> = { dollars: 'dollars', thousands_of_dollars: "$'000", millions_of_dollars: '$ million', people: 'people', fte: 'full-time equivalent', count: 'count', percent: 'per cent', days: 'days' }
const EDITION: Record<string, string> = { current: 'current edition', current_corrected: 'current edition, corrected copy', prior_edition: 'earlier edition (latest verified)', statutory_companion: 'statutory companion document', statutory_return: 'statutory return' }
const NOTE = 'Each figure is quoted from the report with its page; units, labels and definitions differ between reports, so check the unit and label before comparing agencies. Nothing here is an allegation or a finding about any person.'
const STOP = new Set(['of', 'and', 'the', 'for', 'nsw', 'new', 'south', 'wales'])

const norm = (v: unknown) => fold(v).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** "Independent Broad-based Anti-corruption Commission" -> "ibac" */
const acronym = (name: unknown) => norm(String(name).replace(/-/g, ' ')).split(' ').filter(w => w && !STOP.has(w)).map(w => w[0]).join('')

async function index(env: ToolEnv) {
  const data = object(await readToolAsset(env, '/agency-reports/index.json')), meta = object(data.meta)
  const documents = records(data.documents)
  if (!documents.length || typeof meta.snapshot_at !== 'string') throw new Error('Agency report projection unavailable')
  return { meta, documents }
}
type Index = Awaited<ReturnType<typeof index>>

async function factsFor(env: ToolEnv, jur: string): Promise<RecordRow[]> {
  if (!(JURISDICTIONS as readonly string[]).includes(jur)) return []
  const data = object(await readToolAsset(env, `/agency-reports/facts-${jur.toLowerCase()}.json`))
  if (data.jurisdiction !== jur) throw new Error('Agency report facts unavailable')
  return records(data.facts)
}

/** Documents for an agency name or acronym ("NSW ICAC", "DPC"), a jurisdiction, a year and a report id. */
function matchDocuments(ix: Index, args: Record<string, unknown>): RecordRow[] {
  let jur = jurisdictionCode(args.jurisdiction)
  let q = args.agency ? String(args.agency) : ''
  const lead = /^(cth|commonwealth|federal|nsw|vic|victoria|qld|queensland|wa|sa|tas|tasmania|act|nt)\b\s*/i.exec(q)
  if (lead && q.length > lead[0].length) { jur = jur ?? jurisdictionCode(lead[1]); q = q.slice(lead[0].length) }
  let pool = ix.documents.filter(d => (!jur || d.jurisdiction === jur) && (!args.year || d.reporting_year === args.year) && (!args.report_id || d.id === args.report_id))
  if (q) {
    const n = norm(q)
    const exact = pool.filter(d => norm(d.agency) === n || acronym(d.agency) === n.replace(/ /g, ''))
    pool = exact.length ? exact : pool.filter(d => wordsMatch(q, [d.agency]))
  }
  return pool
}

const docTitle = (d: RecordRow) => `${d.agency} (${d.jurisdiction}) ${d.reporting_year} ${d.kind}`
function docRow(env: ToolEnv, d: RecordRow): RecordRow {
  return { report_id: d.id, agency: d.agency, jurisdiction: d.jurisdiction, reporting_year: d.reporting_year, kind: d.kind, edition: d.edition, edition_label: EDITION[String(d.edition)] ?? d.edition,
    ...(d.edition_note ? { edition_note: d.edition_note } : {}), status: d.status, facts: d.facts, not_found: d.not_found, pages: d.pages,
    source_url: sourceUrl(d.source_url), catalogue_url: sourceUrl(d.catalogue_url), ...(d.text_source ? { text_source: d.text_source } : {}),
    ...(d.companion_of ? { companion_of: d.companion_of } : {}), ...(Array.isArray(d.companions) && d.companions.length ? { companions: d.companions } : {}),
    ...(d.integrity_record ? { integrity_record: d.integrity_record, integrity_follow_up: { tool: 'integrity_reports', view: 'report', record_id: object(d.integrity_record).record_id } } : {}),
    ...(d.portal_body_id ? { portal_body_id: d.portal_body_id, portal_follow_up: { tool: 'annual_reports', body: d.portal_body_id } } : {}),
    ...(d.rights_note ? { rights_note: clip(d.rights_note, 400) } : {}),
    full_record_url: siteUrl(env, '/agency-reports/index.json'),
    ...(Number(d.facts) ? { follow_up: { view: 'facts', report_id: d.id } } : {}) }
}
function docCite(d: RecordRow): ToolCitation {
  const read = d.status === 'read'
    ? `OPAX read ${d.facts} ${Number(d.facts) === 1 ? 'figure' : 'figures'} from it, each quoted with its page.`
    : d.status === 'not_read_no_text' ? 'The file is a scan without a text layer, so OPAX has not read figures from it.' : 'OPAX has not read figures from it.'
  const scan = d.text_source === 'ocr' ? ' The file is a scan: its text was read by on-device OCR and each figure was checked against the page image.' : ''
  const links = [d.integrity_record ? 'Its findings and recommendations, if any, are in the integrity reports dataset.' : '',
    d.portal_body_id ? 'Its pay, staffing and finance figures are in the Transparency Portal annual reports dataset.' : ''].filter(Boolean).join(' ')
  return { kind: 'record', url: String(sourceUrl(d.source_url)), text: clip(`The ${docTitle(d)}, ${EDITION[String(d.edition)] ?? d.edition}${d.edition_note ? ` (${d.edition_note.toString().replace(/\.$/, '')})` : ''}, ${d.pages} pages. ${read}${scan} ${links}`, 600) }
}

const extras = (f: RecordRow) => [f.name ? `${f.name}${f.position ? `, ${f.position}` : ''}` : '', f.band ? `band ${f.band}` : '', f.counterparty ? `${f.counterparty}${f.purpose ? ` (${clip(f.purpose, 120)})` : ''}` : ''].filter(Boolean).join('; ')
function factRow(f: RecordRow): RecordRow {
  return { fact_id: f.id, report_id: f.report_id, agency: f.agency, jurisdiction: f.jurisdiction, reporting_year: f.reporting_year, edition: f.edition, metric: f.metric,
    label: f.label, column: f.column ?? null, value: f.value ?? null, value_as_published: f.value_as_published, unit: f.unit, period: f.period ?? null,
    ...Object.fromEntries(['name', 'position', 'band', 'counterparty', 'purpose', 'note'].filter(k => f[k]).map(k => [k, clip(f[k], 300)])),
    page: f.page, quote: f.quote, ...(f.extraction ? { extraction: f.extraction } : {}), source_url: sourceUrl(f.source_url) }
}
/** One plain sentence: who, which report and page, then the quote that holds the figure. */
function factCite(f: RecordRow): ToolCitation {
  const what = [extras(f), f.column ? `column "${f.column}"` : '', f.period ? String(f.period) : ''].filter(Boolean).join(', ')
  const scan = f.extraction ? ' (a scanned page, read by on-device OCR and checked against the page image)' : ''
  return { kind: 'record', url: String(f.source_url), text: clip(`The ${f.agency} (${f.jurisdiction}) ${f.reporting_year} report, page ${f.page}${scan}, prints ${f.value_as_published} (${UNIT[String(f.unit)] ?? f.unit}) under "${clip(f.label, 140)}"${what ? `, ${what}` : ''}: "${f.quote}"`, 800) }
}

export const tool: ToolDefinition = {
  name: 'agency_reports',
  description: 'Figures quoted, with their PDF page, from state and territory agency annual reports (mostly Vic and NSW; some Cth): agency head and executive pay, executive bands, staff, expenses, consultancies, and oversight counts. Views: coverage, documents, facts. Cth entity pay tables: annual_reports; integrity findings: integrity_reports.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    view: { type: 'string', enum: [...VIEWS] },
    agency: { type: 'string', minLength: 2, maxLength: 160, description: 'Name or acronym, e.g. "NSW Ombudsman".' },
    jurisdiction: { type: 'string', enum: [...Object.keys(HOUSE), ...JURISDICTIONS] },
    year: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
    metric: { type: 'string', enum: [...METRICS] },
    group: { type: 'string', enum: Object.keys(GROUPS) },
    query: { type: 'string', minLength: 2, maxLength: 160 },
    report_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,200}$' },
    limit: { type: 'integer', minimum: 1, maximum: 10 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['view'], examples: [{ view: 'facts', agency: 'Department of Premier and Cabinet', group: 'pay' }, { view: 'facts', jurisdiction: 'NSW', metric: 'head_remuneration' }, { view: 'documents', jurisdiction: 'Vic' }] },
  // MCP only for now: Ask's per-question spend reservation has no headroom for another tool (see docs/DATA-AGENCY-REPORTS.md).
  mcpOnly: true,
  validate: args => args.view === 'facts' || ['metric', 'group', 'query'].every(k => args[k] === undefined),
  stepLabel: args => ({ label: 'Checking agency annual reports', arg: clip(args.agency ?? args.metric ?? args.group ?? args.jurisdiction ?? args.view, 40) }),
  async handler(env, args) {
    const ix = await index(env)
    const offset = Number(args.offset) || 0, limit = Number(args.limit) || 6
    const snapshot = ix.meta.snapshot_at, indexUrl = siteUrl(env, '/agency-reports/index.json')
    const counts = object(ix.meta.counts)

    if (args.view === 'coverage') {
      const by = object(counts.by_jurisdiction)
      const rows = Object.entries(by).map(([jur, c]) => ({ jurisdiction: jur, documents: Number(object(c).documents), agencies: Number(object(c).agencies), facts: Number(object(c).facts), agencies_list: [...new Set(ix.documents.filter(d => d.jurisdiction === jur).map(d => String(d.agency)))] }))
      const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `OPAX holds ${counts.documents} agency annual report documents from ${counts.agencies} agencies and has read ${counts.facts} figures from ${counts.documents_read} of them, each quoted with its page (intake as at ${snapshot}).` },
        ...rows.map(r => ({ kind: 'count' as const, url: indexUrl, text: clip(`${r.jurisdiction}: ${r.documents} ${r.documents === 1 ? 'document' : 'documents'} from ${r.agencies} ${r.agencies === 1 ? 'agency' : 'agencies'} (${r.agencies_list.join('; ')}), ${r.facts} figures.`, 900) }))]
      return publishedResult(rows, cites, { view: 'coverage', total: rows.length, offset: 0, snapshot, notes: ['Coverage is the documents in OPAX\'s intake so far, not every agency in each jurisdiction. Commonwealth entities on the Transparency Portal are covered by annual_reports.'] })
    }

    const docs = matchDocuments(ix, args)
    const cthHint = 'Commonwealth entities and companies are covered in full by annual_reports (Transparency Portal); this dataset holds only a few Commonwealth PDFs.'
    if (!docs.length) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `OPAX holds annual report documents from ${counts.agencies} agencies; none matches${args.agency ? ` "${clip(args.agency, 80)}"` : ''}${args.jurisdiction ? ` in ${jurisdictionCode(args.jurisdiction)}` : ''}${args.year ? ` for ${args.year}` : ''}.` }], notes: ['No matching document. This does not mean the agency publishes no annual report: OPAX holds a growing set (view=coverage lists it).', ...(jurisdictionCode(args.jurisdiction) === 'Cth' || !args.jurisdiction ? [cthHint] : [])], total: 0, snapshot }

    if (args.view === 'documents') {
      const rows = docs.slice(offset, offset + limit).map(d => docRow(env, d))
      const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `OPAX holds ${docs.length} matching agency annual report ${docs.length === 1 ? 'document' : 'documents'} (intake as at ${snapshot}).` }, ...docs.slice(offset, offset + limit).map(docCite)]
      const notes = [NOTE]
      if (docs.some(d => d.edition !== 'current')) notes.push('Editions are labelled: an earlier edition is the latest one verified when the current year\'s report was not yet available; companion documents and statutory returns are separate documents.')
      if (docs.some(d => d.portal_body_id)) notes.push(cthHint)
      return publishedResult(rows, cites, { view: 'documents', total: docs.length, offset, next_offset: offset + rows.length < docs.length ? offset + rows.length : null, snapshot, notes })
    }

    // facts
    const ids = new Set(docs.map(d => String(d.id)))
    const wanted = args.metric ? [String(args.metric)] : args.group ? GROUPS[String(args.group)] : null
    const all: RecordRow[] = []
    for (const jur of [...new Set(docs.map(d => String(d.jurisdiction)))]) for (const f of await factsFor(env, jur)) {
      if (!ids.has(String(f.report_id))) continue
      if (wanted && !wanted.includes(String(f.metric))) continue
      if (args.query && !wordsMatch(args.query, [f.label, f.column, f.band, f.name, f.position, f.counterparty, f.purpose, f.note])) continue
      all.push({ ...f, jurisdiction: jur })
    }
    const order = (m: unknown) => (METRICS as readonly string[]).indexOf(String(m))
    all.sort((a, b) => order(a.metric) - order(b.metric) || String(a.agency).localeCompare(String(b.agency)) || Number(a.page) - Number(b.page))
    const picked = all.slice(offset, offset + limit)
    const rows = picked.map(factRow)
    const notFound = docs.filter(d => d.status === 'read' && wanted && wanted.some(m => (d.not_found as unknown[] ?? []).includes(m)))
    const noun = args.metric ? String(args.metric).replace(/_/g, ' ') : args.group ? `${args.group} figures` : 'figures'
    const scope = docs.length === 1 ? `the ${docTitle(docs[0])}` : `${docs.length} matching documents`
    const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `OPAX holds ${all.length} ${noun}${args.query ? ` matching "${clip(args.query, 60)}"` : ''} read from ${scope} (intake as at ${snapshot}).` }, ...picked.map(factCite)]
    const notes = [NOTE]
    if (notFound.length) notes.push(clip(`Looked for and not found: ${notFound.slice(0, 6).map(d => `${d.agency} (${d.reporting_year}): ${(d.not_found as string[]).filter(m => wanted!.includes(m)).join(', ').replace(/_/g, ' ')}`).join('; ')}. A figure may be published elsewhere, such as a separate table on the agency's website.`, 700))
    const unread = docs.filter(d => d.status !== 'read')
    if (unread.length) notes.push(clip(`Not read (no text layer or not yet read): ${unread.map(d => docTitle(d)).join('; ')}.`, 500))
    if (docs.some(d => d.portal_body_id)) notes.push(`${cthHint} For a linked Commonwealth body only operational figures are here.`)
    if (docs.some(d => d.integrity_body)) notes.push('Integrity commission figures here are operational counts in each commission\'s own terms; their findings and recommendations are in integrity_reports.')
    if (rows.some(r => r.extraction)) notes.push('Figures marked extraction come from a scanned report with no text layer: the quote is the OCR reading of the page, checked against the page image. Quote the figure as the report\'s and say it is from a scan.')
    if (rows.some(r => r.value === null)) notes.push('value is null where the report prints a band, a range or a word; value_as_published holds the text.')
    if (!all.length) notes.push('No figure matched. Try view=documents for what was read and not found in each report.')
    return publishedResult(rows, cites, { view: 'facts', total: all.length, offset, next_offset: offset + rows.length < all.length ? offset + rows.length : null, snapshot, notes })
  },
}
