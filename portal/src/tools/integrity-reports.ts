/** Anti-corruption and integrity commission reports (public/integrity-reports). */
import { clip, fold, siteUrl } from './record-common'
import { inWindow, object, publishedResult, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'
import { spanWords } from './transcript-text'

const VIEWS = ['reports', 'report', 'findings', 'recommendations', 'bodies', 'transcripts'] as const
const TRANSCRIPT_LABEL = 'Hearing transcript: evidence, not findings'
const REPORT_TYPES = ['investigation_report', 'special_report', 'public_inquiry_report', 'prevention_research_report', 'statement', 'other'] as const
const FINDING_KINDS = ['finding', 'opinion', 'no_finding', 'prosecution_statement', 'other'] as const
const PARTS = ['findings', 'recommendations', 'responses', 'documents'] as const
const JURISDICTIONS = ['Cth', 'NSW', 'Vic', 'Qld', 'WA', 'SA', 'Tas', 'ACT', 'NT'] as const
// The house codes other tools use (federal, nsw, vic ...) are accepted beside the dataset's own codes, so a
// planner that writes "vic" is not refused as malformed.
const HOUSE_JURISDICTIONS: Record<string, string> = { federal: 'Cth', cth: 'Cth', nsw: 'NSW', vic: 'Vic', qld: 'Qld', wa: 'WA', sa: 'SA', tas: 'Tas', act: 'ACT', nt: 'NT' }
const jurisdictionCode = (v: unknown): string | undefined => v == null || v === '' ? undefined : HOUSE_JURISDICTIONS[String(v).toLowerCase()] ?? String(v)
const RECORD_ID = /^[a-z0-9][a-z0-9-]{2,200}$/
const MANUAL_NOTE = 'Rows marked with an acquisition come from publisher PDFs that the OPAX maintainer downloaded by hand, because the commission\'s site does not answer OPAX\'s automated agent. They cite the publisher\'s own URL, and coverage for that commission is partial (view=bodies gives the gaps).'
const NOTE = 'Quoted in each commission\'s own words, with the report\'s own labels. Allegations are not findings, and a finding or opinion of corrupt conduct or misconduct is not a finding of criminal guilt.'
const TYPE_LABEL: Record<string, string> = { investigation_report: 'investigation report', special_report: 'special report', public_inquiry_report: 'public inquiry report', prevention_research_report: 'prevention or research report', statement: 'statement', other: 'report' }

const norm = (v: unknown) => fold(v).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const fileFor = (code: string) => `/integrity-reports/reports-${code.replace(/_/g, '-')}.json`
const pageUrl = (c: RecordRow) => { const u = sourceUrl(c.url); if (!u) return null; return typeof c.page === 'number' && /\.pdf(?:\.aspx)?(?:$|\?)/i.test(u) && !u.includes('#') ? `${u}#page=${c.page}` : u }
const where = (c: RecordRow) => [c.document, typeof c.page === 'number' ? `page ${c.page}` : null, c.section].filter(Boolean).join(', ')

async function index(env: ToolEnv) {
  const data = object(await readToolAsset(env, '/integrity-reports/index.json')), meta = object(data.meta)
  const bodies = records(data.bodies), reports = records(data.reports)
  if (!bodies.length || typeof meta.snapshot_at !== 'string') throw new Error('Integrity report projection unavailable')
  return { meta, bodies, reports, byCode: new Map(bodies.map(b => [String(b.code), b])), transcripts: object(data.transcripts) }
}
type Index = Awaited<ReturnType<typeof index>>

async function bodyFile(env: ToolEnv, ix: Index, code: string): Promise<RecordRow[]> {
  const b = ix.byCode.get(code)
  if (!b || b.status !== 'loaded') return []
  const data = object(await readToolAsset(env, fileFor(code)))
  if (data.body !== code) throw new Error('Integrity report body file unavailable')
  return records(data.records)
}

/** Bodies matching the words or code: exact code, short name or name wins over a words match. */
function matchBodies(ix: Index, query: unknown, jurisdiction: unknown): RecordRow[] {
  const code = jurisdictionCode(jurisdiction)
  let pool = code ? ix.bodies.filter(b => b.jurisdiction === code) : ix.bodies
  if (!query) return pool
  const q = norm(query)
  const exact = pool.filter(b => b.code === query || norm(b.code) === q || norm(b.short) === q || norm(b.name) === q)
  pool = exact.length ? exact : pool.filter(b => wordsMatch(query, [b.name, b.short, b.jurisdiction, String(b.code).replace(/_/g, ' ')]))
  return pool
}

function reportRow(env: ToolEnv, ix: Index, r: RecordRow): RecordRow {
  const b = ix.byCode.get(String(r.body)) ?? {}
  return { record_id: r.id, body: b.short ?? r.body, commission: b.name ?? null, jurisdiction: r.jurisdiction, title: r.title, operation: r.operation ?? null,
    report_type: r.report_type, type_as_published: r.type_as_published ?? null, date: r.date ?? null, date_basis: r.date_basis ?? null,
    subjects: records(r.subjects).map(s => `${s.name} (${s.kind === 'body' ? 'body' : 'public role'})`),
    counts: r.counts ?? { findings: records(r.findings).length, recommendations: records(r.recommendations).length, responses: records(r.responses).length },
    findings_status: r.findings_status, recommendations_status: r.recommendations_status, responses_status: r.responses_status,
    page_url: sourceUrl(r.page_url), pdf_url: sourceUrl(r.pdf_url), full_record_url: sourceUrl(r.page_url) ?? siteUrl(env, '/integrity-reports/index.json'),
    ...(r.acquisition ? { acquisition: r.acquisition } : {}),
    ...(!r.date && r.period ? { period: r.period } : {}),
    ...(r.transcripts ? { transcripts: { label: TRANSCRIPT_LABEL, case: object(r.transcripts).case, count: object(r.transcripts).count, first_date: object(r.transcripts).first_date, last_date: object(r.transcripts).last_date, follow_up: { view: 'transcripts', body: b.short ?? r.body, operation: object(r.transcripts).case } } } : {}),
    follow_up: { view: 'report', record_id: r.id } }
}

/** Bodies with hearing transcripts, from the index (a body can have transcripts and no loaded reports). */
function transcriptBodies(ix: Index, query: unknown, jurisdiction: unknown): RecordRow[] {
  const code = jurisdictionCode(jurisdiction), files = object(ix.transcripts.files)
  const pool: RecordRow[] = Object.entries(object(ix.transcripts.bodies)).map(([c, b]): RecordRow => ({ ...object(b), code: c, file: files[c] })).filter(b => !code || b.jurisdiction === code)
  if (!query) return pool
  const q = norm(query), exact = pool.filter(b => b.code === query || norm(b.code) === q || norm(b.short) === q || norm(b.name) === q)
  return exact.length ? exact : pool.filter(b => wordsMatch(query, [b.name, b.short, b.jurisdiction, String(b.code).replace(/_/g, ' ')]))
}

function transcriptRow(b: RecordRow, t: RecordRow): RecordRow {
  return { label: TRANSCRIPT_LABEL, body: b.short, commission: b.name, jurisdiction: t.jurisdiction, case: t.case, title: t.title, hearing_date: t.hearing_date,
    ...(t.session_time ? { session_time: t.session_time } : {}), ...(t.transcript_pages ? { transcript_pages: t.transcript_pages } : {}),
    pages: t.pages ?? null, pdf_url: sourceUrl(t.url), page_url: sourceUrl(t.page_url), publisher_redacted: !!t.publisher_redacted,
    ...(Array.isArray(t.orders) && t.orders.length ? { orders: t.orders.map(sourceUrl).filter(Boolean) } : {}), rights: clip(t.rights, 300) }
}

const transcriptCite = (r: RecordRow): ToolCitation => ({ kind: 'record', url: String(r.pdf_url ?? r.page_url), text: clip(`${r.commission} (${r.body}), ${r.title}${r.pages ? `, ${r.pages} pages` : ''}${r.publisher_redacted ? ', as redacted by the publisher' : ''}. ${TRANSCRIPT_LABEL}.`, 400) })

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** An undated report whose source gives only a month or year matches a window that overlaps that month or year. */
function inPeriod(r: RecordRow, args: Record<string, unknown>): boolean {
  if (r.date || !(args.since || args.until)) return inWindow(r.date, args)
  const p = String(object(r.period).value ?? '')
  if (!/^\d{4}(-\d{2})?$/.test(p)) return false
  const from = p.length === 4 ? `${p}-01-01` : `${p}-01`, to = p.length === 4 ? `${p}-12-31` : `${p}-31`
  return (!args.since || to >= String(args.since)) && (!args.until || from <= String(args.until))
}
const periodText = (p: unknown) => { const v = String(object(p).value ?? ''); return v.length === 7 ? `${MONTHS[Number(v.slice(5)) - 1]} ${v.slice(0, 4)}` : v }
/** The count line in plain words: no tool syntax, no clock time, no label-and-number shape. */
function countSentence(n: number, noun: [string, string], args: Record<string, unknown>, bodies: RecordRow[], snapshot: unknown, extra = ''): string {
  const parts: string[] = []
  if ((args.body || args.jurisdiction) && bodies.length) parts.push(bodies.length === 1 ? `from the ${bodies[0].name} (${bodies[0].short})` : `from ${bodies.map(b => b.short).join(', ')}`)
  for (const k of ['operation', 'query', 'subject'] as const) if (args[k]) parts.push(`matching "${clip(args[k], 80)}"`)
  if (args.report_type) parts.push(`of the type ${TYPE_LABEL[String(args.report_type)] ?? args.report_type}`)
  if (args.finding_kind) parts.push(`of the kind ${String(args.finding_kind).replace(/_/g, ' ')}`)
  if (args.since && args.until) parts.push(`dated ${args.since} to ${args.until}`); else if (args.since) parts.push(`dated from ${args.since}`); else if (args.until) parts.push(`dated up to ${args.until}`)
  return `OPAX holds ${n} ${n === 1 ? noun[0] : noun[1]}${parts.length ? ' ' + parts.join(', ') : ''}${extra}${n > 1 ? ', newest first' : ''} (records as at ${String(snapshot ?? '').slice(0, 10)}).`
}

// a commission with this many reports or fewer is named report by report in an overview
const NAMED_MAX = 8
const reportWhen = (r: RecordRow) => r.date ? String(r.date) : r.period ? `${periodText(r.period)}, no day given` : 'no date given'
/** "Operation Pentecost (2026-05-13), ... and Operation Myrtleford (March 2026, no day given)" */
function namedReports(rows: RecordRow[]): string {
  const names = rows.map(r => `${r.operation ? String(r.operation) : `"${clip(r.title, 120)}"`} (${reportWhen(r)})`)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('')
}

// the commission's full name beside its short form, so an answer may use either
const who = (row: RecordRow) => row.commission && row.commission !== row.body ? `${row.commission} (${row.body})` : String(row.body)

/** One plain sentence per report, then what OPAX holds of it; no label-and-number shape. */
function reportCite(row: RecordRow): ToolCitation {
  const counts = object(row.counts)
  const n = (v: unknown, one: string, many: string) => `${v} ${Number(v) === 1 ? one : many}`
  const parts: [unknown, unknown, string, string][] = [[counts.findings, row.findings_status, 'finding or opinion', 'findings or opinions'], [counts.recommendations, row.recommendations_status, 'recommendation', 'recommendations']]
  const held = parts.filter(p => p[1] === 'extracted').map(p => n(p[0], p[2], p[3]))
  const tail = [held.length ? `OPAX holds ${held.join(' and ')} from it.` : '',
    ...parts.filter(p => p[1] === 'stated_none').map(p => `The report says it makes no ${p[3]}.`),
    ...(parts.some(p => p[1] !== 'extracted' && p[1] !== 'stated_none') ? [`Its ${parts.filter(p => p[1] !== 'extracted' && p[1] !== 'stated_none').map(p => p[3]).join(' and ')} were not extracted by OPAX.`] : [])].filter(Boolean).join(' ')
  const verb = row.date_basis === 'tabled' ? 'tabled' : row.date_basis === 'dated' ? 'issued' : 'published'
  const when = row.date ? ` on ${row.date}` : row.period ? ` in ${periodText(row.period)} (${/file path/i.test(String(object(row.period).basis)) ? 'month taken from the publisher\'s file path' : 'no day given'})` : ''
  const type = TYPE_LABEL[String(row.report_type)] ?? 'report'
  return { kind: 'record', url: String(row.pdf_url ?? row.page_url ?? row.full_record_url), text: clip(`${who(row)} ${row.date || row.period ? verb : 'published'} ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}${when}, "${row.title}"${row.operation ? ` (${row.operation})` : ''}. ${tail}`, 600) }
}

function itemRow(ix: Index, r: RecordRow, part: 'findings' | 'recommendations' | 'responses' | 'documents', item: RecordRow, i: number): RecordRow {
  const b = ix.byCode.get(String(r.body)) ?? {}, c = object(item.cite)
  const base: RecordRow = { record_id: r.id, body: b.short ?? r.body, commission: b.name ?? null, jurisdiction: r.jurisdiction, report: r.title, operation: r.operation ?? null, date: r.date ?? null, ...(r.acquisition ? { acquisition: r.acquisition } : {}) }
  if (part === 'findings') return { ...base, n: item.n ?? i + 1, label: item.label, kind: item.kind, text: clip(item.text, 900), source: where(c), source_url: pageUrl(c), follow_up: { view: 'report', record_id: r.id, part: 'findings' } }
  if (part === 'recommendations') return { ...base, number: item.number ?? null, text: clip(item.text, 900), source: where(c), source_url: pageUrl(c), follow_up: { view: 'report', record_id: r.id, part: 'recommendations' } }
  if (part === 'responses') return { ...base, kind: item.kind, title: item.title ?? null, date: item.date ?? null, ...(item.publisher ? { publisher: item.publisher } : {}), ...(item.tabled_in ? { tabled_in: item.tabled_in } : {}), ...(item.acquisition ? { acquisition: item.acquisition } : {}), ...(item.note ? { note: clip(item.note, 300) } : {}), recommendation: item.recommendation ?? null, status_as_published: item.status_as_published ?? null, text: item.text ? clip(item.text, 600) : null, source_url: sourceUrl(item.url) ?? pageUrl(c) }
  return { ...base, role: item.role, title: item.title ?? null, url: sourceUrl(item.url), pages: item.pages ?? null, status: item.status ?? null }
}

function itemCite(row: RecordRow, part: string): ToolCitation {
  const url = String(row.source_url ?? row.url ?? '')
  if (part === 'findings') return { kind: 'record', url, text: clip(`${who(row)}, "${row.report}"${row.date ? ` (${row.date})` : ''}, ${row.source}: ${row.label} [${row.kind}]: "${row.text}"`, 900) }
  if (part === 'recommendations') return { kind: 'record', url, text: clip(`${who(row)}, "${row.report}"${row.date ? ` (${row.date})` : ''}, ${row.source}: Recommendation ${row.number ?? ''}: "${row.text}"`, 900) }
  if (part === 'responses') return { kind: 'record', url, text: clip(`${row.publisher ? `${row.publisher} published` : row.tabled_in ? `Tabled in the ${row.tabled_in}:` : `${who(row)} published`} ${String(row.kind).replace(/_/g, ' ')} "${row.title ?? 'untitled'}"${row.date ? ` dated ${row.date}` : ''} for ${row.body}'s "${row.report}"${row.status_as_published ? `; status as published: ${row.status_as_published}` : ''}.`, 600) }
  return { kind: 'record', url, text: clip(`${row.body}, "${row.report}": ${row.role} document "${row.title ?? ''}"${row.pages ? `, ${row.pages} pages` : ''}.`, 400) }
}

function reportMatches(ix: Index, r: RecordRow, args: Record<string, unknown>, codes: Set<string>): boolean {
  if (!codes.has(String(r.body))) return false
  if (args.report_type && r.report_type !== args.report_type) return false
  if (!inPeriod(r, args)) return false
  if (args.operation && !wordsMatch(args.operation, [r.operation, r.title])) return false
  if (args.subject && !wordsMatch(args.subject, records(r.subjects).map(s => s.name))) return false
  if (args.query && !wordsMatch(args.query, [r.title, r.operation, r.type_as_published, ...records(r.subjects).map(s => s.name)])) return false
  return true
}

export const tool: ToolDefinition = {
  name: 'integrity_reports',
  description: 'Australian anti-corruption and integrity commission reports (NSW, Vic, Qld, WA, SA, ACT; NACC, Tas, NT partly) and statements: findings or opinions in each commission\'s own words and labels, numbered recommendations and agency responses, cited to the report page. Views: reports, report (record_id, part), findings, recommendations, bodies (coverage, gaps), transcripts (hearing transcripts by body, operation, since/until; evidence, not findings). Allegations are not findings; a corrupt conduct finding is not a criminal conviction; statutory terms differ, so keep each commission’s findings and counts in its own statutory context.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    view: { type: 'string', enum: [...VIEWS] },
    body: { type: 'string', minLength: 2, maxLength: 120, description: 'Commission, e.g. "NSW ICAC".' },
    jurisdiction: { type: 'string', enum: [...Object.keys(HOUSE_JURISDICTIONS), ...JURISDICTIONS] },
    query: { type: 'string', minLength: 2, maxLength: 200, description: 'Words in titles, or in finding or recommendation text.' },
    operation: { type: 'string', minLength: 2, maxLength: 120, description: 'e.g. "Operation Keppel".' },
    subject: { type: 'string', minLength: 2, maxLength: 160, description: 'Body or public role named, e.g. "council".' },
    report_type: { type: 'string', enum: [...REPORT_TYPES] },
    finding_kind: { type: 'string', enum: [...FINDING_KINDS] },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    record_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,200}$', description: 'Copy from a row.' },
    part: { type: 'string', enum: [...PARTS] },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['view'], examples: [{ view: 'reports', body: 'NSW ICAC', since: '2023-01-01' }, { view: 'reports', subject: 'council', jurisdiction: 'WA' }, { view: 'findings', body: 'NSW ICAC', operation: 'Operation Keppel' }] },
  identifierFields: ['body'],
  validate: args => validWindow(args) &&
    (args.record_id ? ['report', 'findings', 'recommendations'].includes(String(args.view)) : args.view !== 'report' && !args.part) &&
    (args.view === 'findings' || !!args.record_id || !args.finding_kind) &&
    (args.view !== 'bodies' || ['query', 'operation', 'subject', 'report_type', 'since', 'until'].every(k => args[k] === undefined)) &&
    (args.view !== 'transcripts' || ['subject', 'report_type', 'finding_kind'].every(k => args[k] === undefined)),
  stepLabel: args => ({ label: 'Checking integrity commission reports', arg: clip(args.operation ?? args.query ?? args.subject ?? args.body ?? args.view, 40) }),
  async handler(env, args) {
    const ix = await index(env)
    // a record_id with view=findings or recommendations opens that report's list
    if (args.record_id && args.view !== 'report') args = { view: 'report', record_id: args.record_id, part: args.part ?? args.view, offset: args.offset, limit: args.limit }
    const offset = Number(args.offset) || 0, limit = Number(args.limit) || 5
    const snapshot = ix.meta.snapshot_at, indexUrl = siteUrl(env, '/integrity-reports/index.json')
    const notes = [NOTE]
    const gaps = ix.bodies.filter(b => b.status === 'gap')
    const gapNote = gaps.length ? [`Not loaded because of a source gap: ${gaps.map(b => b.short).join(', ')} (view=bodies gives the reason).`] : []

    if (args.view === 'bodies') {
      const bodies = matchBodies(ix, args.body, args.jurisdiction)
      const held = (b: RecordRow) => ix.reports.filter(r => r.body === b.code)
      const rows = bodies.slice(offset, offset + limit).map(b => ({ code: b.code, body: b.short, commission: b.name, jurisdiction: b.jurisdiction, status: b.status, counts: b.counts, earliest: b.earliest ?? null, latest: b.latest ?? null, licence: b.licence, gaps: Array.isArray(b.gaps) ? b.gaps.map(g => clip(g, 300)) : [], site: b.site, snapshot_at: b.snapshot_at,
        ...(b.status === 'loaded' && held(b).length <= NAMED_MAX ? { reports: held(b).map(r => ({ record_id: r.id, title: r.title, operation: r.operation ?? null, date: r.date ?? null, ...(r.date ? {} : { period: r.period ?? null }) })) } : {}) }))
      // plain sentences with the commission's full name; a small commission's reports are named
      const bodySentence = (b: RecordRow) => {
        const c = object(b.counts), list = Array.isArray(b.reports) ? b.reports as RecordRow[] : []
        const n = (v: unknown, one: string, many: string) => `${v} ${Number(v) === 1 ? one : many}`
        const head = `OPAX holds ${n(c.records, 'report or statement', 'reports and statements')} from the ${b.commission} (${b.body})${b.earliest ? `, dated ${b.earliest === b.latest ? b.earliest : `${b.earliest} to ${b.latest}`}` : ''}, with ${n(c.findings, 'finding or opinion', 'findings or opinions')}, ${n(c.recommendations, 'recommendation', 'recommendations')} and ${n(c.responses, 'response or implementation document', 'response or implementation documents')}.`
        return clip(list.length ? `${head} ${list.length === 1 ? 'It is' : 'They are'} ${namedReports(list)}.` : head, 1400)
      }
      const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `OPAX holds reports from ${ix.bodies.length} integrity commissions; ${ix.bodies.filter(b => b.status === 'loaded').length} are loaded and ${gaps.length} ${gaps.length === 1 ? 'is' : 'are'} not loaded because of a source gap (records as at ${String(snapshot ?? '').slice(0, 10)}).` },
        ...rows.map(b => ({ kind: 'record' as const, url: String(sourceUrl(b.site) ?? indexUrl), text: b.status === 'loaded' ? bodySentence(b) : clip(`${b.body} (${b.jurisdiction}): not loaded. ${b.gaps[0] ?? ''}`, 600) }))]
      return publishedResult(rows, cites, { view: 'bodies', total: bodies.length, offset, next_offset: offset + rows.length < bodies.length ? offset + rows.length : null, snapshot, notes: ['Counts are what OPAX extracted, not the number each commission has published in total; see each body\'s gaps and the not_extracted statuses.'] })
    }

    if (args.view === 'report') {
      const summary = ix.reports.find(r => r.id === args.record_id)
      if (!summary) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `No integrity report has the id ${clip(args.record_id, 80)} in the current snapshot (${snapshot}).` }], notes: ['Record ids can change when a commission retitles or redates a report. Search with view=reports; coverage differs by commission (view=bodies).'], total: 0, snapshot }
      const full = (await bodyFile(env, ix, String(summary.body))).find(r => r.id === args.record_id)
      if (!full) throw new Error('Integrity report record unavailable')
      const head = reportRow(env, ix, { ...full, counts: summary.counts })
      const part = (args.part ?? 'findings') as typeof PARTS[number]
      const items = records(full[part])
      const pageItems = items.slice(offset, offset + (Number(args.limit) || 6)).map((it, i) => itemRow(ix, full, part, it, offset + i))
      const row: RecordRow = { ...head, summary: full.summary ? clip(full.summary, 800) : null, notes: Array.isArray(full.notes) ? full.notes : [],
        part, [part]: pageItems, part_total: items.length, part_next_offset: offset + pageItems.length < items.length ? offset + pageItems.length : null,
        documents_count: records(full.documents).length }
      const status = part === 'documents' ? 'listed' : String(full[`${part}_status`])
      if (part !== 'documents' && status !== 'extracted' && status !== 'published') notes.push(status === 'stated_none' ? `The report states it has no ${part}.` : status === 'none_found' ? 'The commission\'s page for this report lists no response or implementation documents.' : status === 'not_checked' ? 'Responses were not checked for this report.' : `The ${part} of this report were not extracted by OPAX; they are unknown, not absent. Read the report itself.`)
      if (full.acquisition) notes.push(MANUAL_NOTE)
      return publishedResult([row], [reportCite(head), ...pageItems.map(it => itemCite(it, part))], { view: 'report', total: 1, offset, part, snapshot, notes })
    }

    if (args.view === 'transcripts') {
      const tb = transcriptBodies(ix, args.body, args.jurisdiction)
      const all: RecordRow[] = []
      for (const b of tb) {
        if (!/^\/integrity-reports\/transcripts-[a-z-]+\.json$/.test(String(b.file))) continue
        const data = object(await readToolAsset(env, String(b.file)))
        if (data.body !== b.code) throw new Error('Integrity transcripts file unavailable')
        for (const t of records(data.transcripts)) {
          if (args.operation && !wordsMatch(args.operation, [t.case])) continue
          if (args.query && !wordsMatch(args.query, [t.case, t.title, t.hearing_date])) continue
          if (!inWindow(t.hearing_date, args)) continue
          all.push(transcriptRow(b, t))
        }
      }
      all.sort((a, b) => String(b.hearing_date).localeCompare(String(a.hearing_date)) || String(a.title).localeCompare(String(b.title)))
      const rows = all.slice(offset, offset + limit), cases = new Set(all.map(r => `${r.body}: ${r.case}`))
      const count = `OPAX lists ${all.length} public hearing transcript${all.length === 1 ? '' : 's'}${tb.length === 1 ? ` from the ${tb[0].name} (${tb[0].short})` : ''}${args.operation || args.query ? ` matching "${clip(args.operation ?? args.query, 80)}"` : ''}, from ${cases.size} case${cases.size === 1 ? '' : 's'}${all.length ? `, dated ${spanWords(all.at(-1)!.hearing_date, all[0].hearing_date)}` : ''}, newest first. ${TRANSCRIPT_LABEL}.`
      return publishedResult(rows, [{ kind: 'count', url: indexUrl, text: count }, ...rows.map(transcriptCite)], { view: 'transcripts', total: all.length, offset, next_offset: offset + rows.length < all.length ? offset + rows.length : null, snapshot,
        notes: [NOTE, 'Transcripts are listed as each commission published them, with its redactions and orders; OPAX links the publisher\'s copy. What a witness or counsel says is evidence or submission, never a finding; only a report states findings.', ...(all.length ? [] : ['No listed transcript matches. Coverage is the transcripts supplied so far, not every hearing.'])] })
    }

    const bodies = matchBodies(ix, args.body, args.jurisdiction), codes = new Set(bodies.map(b => String(b.code)))
    if ((args.body || args.jurisdiction) && !bodies.length) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `The projection covers ${ix.bodies.map(b => b.short).join(', ')}; none matches "${clip(args.body ?? args.jurisdiction, 80)}".` }], notes: ['No commission in this projection matches. view=bodies gives coverage by commission; royal commissions are not part of this dataset.'], total: 0, snapshot }
    const gapHit = bodies.filter(b => b.status === 'gap')
    if (gapHit.length && gapHit.length === bodies.length) return { rows: [], citations: [{ kind: 'export', url: String(sourceUrl(gapHit[0].site) ?? indexUrl), text: clip(`${gapHit.map(b => b.short).join(', ')}: not loaded. ${Array.isArray(gapHit[0].gaps) ? gapHit[0].gaps.join(' ') : ''}`, 700) }], notes: ['This commission is listed with a documented source gap, so OPAX holds none of its reports. An empty result does not mean it has published none.'], total: 0, snapshot }

    if (args.view === 'reports') {
      const matched = ix.reports.filter(r => reportMatches(ix, r, args, codes))
      const rows = matched.slice(offset, offset + limit).map(r => reportRow(env, ix, r))
      const named = matched.length > 1 && matched.length <= NAMED_MAX ? ` They are ${namedReports(matched)}.` : ''
      const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: countSentence(matched.length, ['integrity commission report or statement', 'integrity commission reports and statements'], args, bodies.length < ix.bodies.length ? bodies : [], snapshot) + named }, ...rows.map(reportCite)]
      if ((args.since || args.until) && matched.some(r => !r.date)) notes.push('Some reports matched by the month or year their commission says they were made public; the source gives no day (see period).')
      if (matched.length && matched.length <= 2) {
        // a named report: carry its findings and recommendations so one call answers "what did it find"
        for (const row of rows) {
          const full = (await bodyFile(env, ix, String(matched.find(m => m.id === row.record_id)?.body))).find(r => r.id === row.record_id)
          if (!full) continue
          const fs = records(full.findings).slice(0, 6).map((it, i) => itemRow(ix, full, 'findings', it, i))
          const rs = records(full.recommendations).slice(0, 4).map((it, i) => itemRow(ix, full, 'recommendations', it, i))
          const ps = records(full.responses).slice(0, 3).map((it, i) => itemRow(ix, full, 'responses', it, i))
          // long verbatim items: drop whole items (responses, then recommendations, then findings), never cut their text
          const size = () => new TextEncoder().encode(JSON.stringify({ rows, cites, fs, rs, ps, c: [...fs.map(it => itemCite(it, 'findings')), ...rs.map(it => itemCite(it, 'recommendations')), ...ps.map(it => itemCite(it, 'responses'))] })).length
          while (size() > 11_000 && (ps.length || rs.length || fs.length > 1)) (ps.length ? ps : rs.length ? rs : fs).pop()
          Object.assign(row, { findings: fs, recommendations: rs, responses: ps })
          cites.push(...fs.map(it => itemCite(it, 'findings')), ...rs.map(it => itemCite(it, 'recommendations')), ...ps.map(it => itemCite(it, 'responses')))
          if (records(full.findings).length > fs.length || records(full.recommendations).length > rs.length || records(full.responses).length > ps.length) notes.push(`More items: view=report, record_id ${row.record_id}, part=findings, recommendations or responses.`)
        }
      }
      if (rows.some(r => r.acquisition)) notes.push(MANUAL_NOTE)
      if (!matched.length) notes.push('No matching report. This does not establish that none exists: coverage differs by commission (see view=bodies), and titles use each commission\'s own wording.')
      return publishedResult(rows, cites, { view: 'reports', total: matched.length, offset, next_offset: offset + rows.length < matched.length ? offset + rows.length : null, snapshot, notes: [...notes, ...gapNote] })
    }

    // findings / recommendations across bodies
    const part = args.view === 'findings' ? 'findings' : 'recommendations'
    const reportArgs = { ...args, query: undefined }
    const candidates = new Set(ix.reports.filter(r => reportMatches(ix, r, reportArgs, codes)).map(r => String(r.id)))
    const matches: RecordRow[] = []
    let unknown = 0
    for (const code of [...codes]) {
      for (const r of await bodyFile(env, ix, code)) {
        if (!candidates.has(String(r.id))) continue
        if (r[`${part}_status`] === 'not_extracted') { unknown++; continue }
        records(r[part]).forEach((it, i) => {
          if (args.finding_kind && it.kind !== args.finding_kind) return
          if (args.query && !wordsMatch(args.query, [it.text, it.label])) return
          matches.push(itemRow(ix, r, part, it, i))
        })
      }
    }
    matches.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(a.record_id).localeCompare(String(b.record_id)))
    const rows = matches.slice(offset, offset + limit)
    const what = part === 'findings' ? 'findings, opinions and statements' : 'recommendations'
    const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: countSentence(matches.length, part === 'findings' ? ['finding, opinion or statement', 'findings, opinions and statements'] : ['recommendation', 'recommendations'], args, bodies.length < ix.bodies.length ? bodies : [], snapshot, `, in ${candidates.size - unknown} reports whose ${part} OPAX extracted`) }, ...rows.map(r => itemCite(r, part))]
    if (rows.some(r => r.acquisition)) notes.push(MANUAL_NOTE)
    if (unknown) notes.push(`${unknown} matching reports have ${part} that OPAX did not extract; their ${part} are unknown, not absent, and are not counted here.`)
    if (part === 'findings') notes.push('Labels are each commission\'s own statutory terms (for example serious corrupt conduct, or an opinion of serious misconduct). Do not treat counts as comparable across commissions. Names appear only as the report prints them.')
    return publishedResult(rows, cites, { view: args.view, total: matches.length, offset, next_offset: offset + rows.length < matches.length ? offset + rows.length : null, snapshot, notes: [...notes, ...gapNote] })
  },
}
