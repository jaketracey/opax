/** Anti-corruption and integrity commission reports (public/integrity-reports). */
import { clip, fold, siteUrl } from './record-common'
import { inWindow, object, publishedResult, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const VIEWS = ['reports', 'report', 'findings', 'recommendations', 'bodies'] as const
const REPORT_TYPES = ['investigation_report', 'special_report', 'public_inquiry_report', 'prevention_research_report', 'statement', 'other'] as const
const FINDING_KINDS = ['finding', 'opinion', 'no_finding', 'prosecution_statement', 'other'] as const
const PARTS = ['findings', 'recommendations', 'responses', 'documents'] as const
const JURISDICTIONS = ['Cth', 'NSW', 'Vic', 'Qld', 'WA', 'SA', 'Tas', 'ACT', 'NT'] as const
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
  return { meta, bodies, reports, byCode: new Map(bodies.map(b => [String(b.code), b])) }
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
  let pool = jurisdiction ? ix.bodies.filter(b => b.jurisdiction === jurisdiction) : ix.bodies
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
    follow_up: { view: 'report', record_id: r.id } }
}

function reportCite(row: RecordRow): ToolCitation {
  const counts = object(row.counts)
  const listed = (n: unknown, status: unknown, what: string) => status === 'extracted' ? `${n} ${what}` : status === 'stated_none' ? `no ${what} (as the report states)` : `${what} not extracted`
  return { kind: 'record', url: String(row.pdf_url ?? row.page_url ?? row.full_record_url), text: clip(`${row.body}, ${TYPE_LABEL[String(row.report_type)] ?? 'report'}${row.date ? ` ${row.date_basis ?? 'dated'} ${row.date}` : ''}: "${row.title}"${row.operation ? ` (${row.operation})` : ''}. ${listed(counts.findings, row.findings_status, 'findings or opinions')}; ${listed(counts.recommendations, row.recommendations_status, 'recommendations')}.`, 600) }
}

function itemRow(ix: Index, r: RecordRow, part: 'findings' | 'recommendations' | 'responses' | 'documents', item: RecordRow, i: number): RecordRow {
  const b = ix.byCode.get(String(r.body)) ?? {}, c = object(item.cite)
  const base: RecordRow = { record_id: r.id, body: b.short ?? r.body, jurisdiction: r.jurisdiction, report: r.title, operation: r.operation ?? null, date: r.date ?? null, ...(r.acquisition ? { acquisition: r.acquisition } : {}) }
  if (part === 'findings') return { ...base, n: item.n ?? i + 1, label: item.label, kind: item.kind, text: clip(item.text, 900), source: where(c), source_url: pageUrl(c), follow_up: { view: 'report', record_id: r.id, part: 'findings' } }
  if (part === 'recommendations') return { ...base, number: item.number ?? null, text: clip(item.text, 900), source: where(c), source_url: pageUrl(c), follow_up: { view: 'report', record_id: r.id, part: 'recommendations' } }
  if (part === 'responses') return { ...base, kind: item.kind, title: item.title ?? null, date: item.date ?? null, recommendation: item.recommendation ?? null, status_as_published: item.status_as_published ?? null, text: item.text ? clip(item.text, 600) : null, source_url: sourceUrl(item.url) ?? pageUrl(c) }
  return { ...base, role: item.role, title: item.title ?? null, url: sourceUrl(item.url), pages: item.pages ?? null, status: item.status ?? null }
}

function itemCite(row: RecordRow, part: string): ToolCitation {
  const url = String(row.source_url ?? row.url ?? '')
  if (part === 'findings') return { kind: 'record', url, text: clip(`${row.body}, "${row.report}"${row.date ? ` (${row.date})` : ''}, ${row.source}: ${row.label} [${row.kind}]: "${row.text}"`, 900) }
  if (part === 'recommendations') return { kind: 'record', url, text: clip(`${row.body}, "${row.report}"${row.date ? ` (${row.date})` : ''}, ${row.source}: Recommendation ${row.number ?? ''}: "${row.text}"`, 900) }
  if (part === 'responses') return { kind: 'record', url, text: clip(`${row.body} published ${String(row.kind).replace(/_/g, ' ')} "${row.title ?? 'untitled'}"${row.date ? ` dated ${row.date}` : ''} for "${row.report}"${row.status_as_published ? `; status as published: ${row.status_as_published}` : ''}.`, 600) }
  return { kind: 'record', url, text: clip(`${row.body}, "${row.report}": ${row.role} document "${row.title ?? ''}"${row.pages ? `, ${row.pages} pages` : ''}.`, 400) }
}

function reportMatches(ix: Index, r: RecordRow, args: Record<string, unknown>, codes: Set<string>): boolean {
  if (!codes.has(String(r.body))) return false
  if (args.report_type && r.report_type !== args.report_type) return false
  if (!inWindow(r.date, args)) return false
  if (args.operation && !wordsMatch(args.operation, [r.operation, r.title])) return false
  if (args.subject && !wordsMatch(args.subject, records(r.subjects).map(s => s.name))) return false
  if (args.query && !wordsMatch(args.query, [r.title, r.operation, r.type_as_published, ...records(r.subjects).map(s => s.name)])) return false
  return true
}

export const tool: ToolDefinition = {
  name: 'integrity_reports',
  description: 'Reports of Australian anti-corruption and integrity commissions (NSW, Vic IBAC from tabled copies, Qld, WA, SA and ACT; NACC, Tas and NT partly): investigation, special, inquiry and prevention reports and statements, with findings or opinions quoted in each commission\'s own words and labels, numbered recommendations and agency responses, each cited to the report page. Views: reports, report (record_id, part), findings, recommendations, bodies (coverage and gaps). Allegations are not findings; a corrupt conduct finding is not a criminal conviction; statutory terms differ, so do not compare counts across commissions.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    view: { type: 'string', enum: [...VIEWS] },
    body: { type: 'string', minLength: 2, maxLength: 120, description: 'Commission, e.g. "NSW ICAC".' },
    jurisdiction: { type: 'string', enum: [...JURISDICTIONS] },
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
    (args.view === 'report' ? !!args.record_id && ['body', 'jurisdiction', 'query', 'operation', 'subject', 'report_type', 'finding_kind', 'since', 'until'].every(k => args[k] === undefined) : !args.record_id && !args.part) &&
    (args.view === 'findings' || !args.finding_kind) &&
    (args.view !== 'bodies' || ['query', 'operation', 'subject', 'report_type', 'since', 'until'].every(k => args[k] === undefined)),
  stepLabel: args => ({ label: 'Checking integrity commission reports', arg: clip(args.operation ?? args.query ?? args.subject ?? args.body ?? args.view, 40) }),
  async handler(env, args) {
    const ix = await index(env)
    const offset = Number(args.offset) || 0, limit = Number(args.limit) || 5
    const snapshot = ix.meta.snapshot_at, indexUrl = siteUrl(env, '/integrity-reports/index.json')
    const notes = [NOTE]
    const gaps = ix.bodies.filter(b => b.status === 'gap')
    const gapNote = gaps.length ? [`Not loaded because of a source gap: ${gaps.map(b => b.short).join(', ')} (view=bodies gives the reason).`] : []

    if (args.view === 'bodies') {
      const bodies = matchBodies(ix, args.body, args.jurisdiction)
      const rows = bodies.slice(offset, offset + limit).map(b => ({ code: b.code, body: b.short, commission: b.name, jurisdiction: b.jurisdiction, status: b.status, counts: b.counts, earliest: b.earliest ?? null, latest: b.latest ?? null, licence: b.licence, gaps: Array.isArray(b.gaps) ? b.gaps.map(g => clip(g, 300)) : [], site: b.site, snapshot_at: b.snapshot_at }))
      const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `${ix.bodies.length} commissions in the OPAX integrity report projection: ${ix.bodies.filter(b => b.status === 'loaded').length} loaded, ${gaps.length} not loaded because of a source gap (snapshot ${snapshot}).` },
        ...rows.map(b => ({ kind: 'record' as const, url: String(sourceUrl(b.site) ?? indexUrl), text: clip(b.status === 'loaded' ? `${b.body} (${b.jurisdiction}): ${object(b.counts).records} reports and statements${b.earliest ? ` from ${b.earliest} to ${b.latest}` : ''}, ${object(b.counts).findings} findings or opinions, ${object(b.counts).recommendations} recommendations, ${object(b.counts).responses} response or implementation documents.` : `${b.body} (${b.jurisdiction}): not loaded. ${b.gaps[0] ?? ''}`, 600) }))]
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

    const bodies = matchBodies(ix, args.body, args.jurisdiction), codes = new Set(bodies.map(b => String(b.code)))
    if ((args.body || args.jurisdiction) && !bodies.length) return { rows: [], citations: [{ kind: 'export', url: indexUrl, text: `The projection covers ${ix.bodies.map(b => b.short).join(', ')}; none matches "${clip(args.body ?? args.jurisdiction, 80)}".` }], notes: ['No commission in this projection matches. view=bodies gives coverage by commission; royal commissions are not part of this dataset.'], total: 0, snapshot }
    const gapHit = bodies.filter(b => b.status === 'gap')
    if (gapHit.length && gapHit.length === bodies.length) return { rows: [], citations: [{ kind: 'export', url: String(sourceUrl(gapHit[0].site) ?? indexUrl), text: clip(`${gapHit.map(b => b.short).join(', ')}: not loaded. ${Array.isArray(gapHit[0].gaps) ? gapHit[0].gaps.join(' ') : ''}`, 700) }], notes: ['This commission is listed with a documented source gap, so OPAX holds none of its reports. An empty result does not mean it has published none.'], total: 0, snapshot }

    if (args.view === 'reports') {
      const matched = ix.reports.filter(r => reportMatches(ix, r, args, codes))
      const rows = matched.slice(offset, offset + limit).map(r => reportRow(env, ix, r))
      const scope = ['body', 'jurisdiction', 'query', 'operation', 'subject', 'report_type', 'since', 'until'].filter(k => args[k] !== undefined).map(k => `${k} ${args[k]}`).join(', ') || 'all commissions'
      const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `${matched.length} integrity commission reports and statements match ${scope} in the OPAX projection (snapshot ${snapshot}), newest first.` }, ...rows.map(reportCite)]
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
    const scope = ['body', 'jurisdiction', 'query', 'operation', 'subject', 'report_type', 'finding_kind', 'since', 'until'].filter(k => args[k] !== undefined).map(k => `${k} ${args[k]}`).join(', ') || 'all commissions'
    const what = part === 'findings' ? 'findings, opinions and statements' : 'recommendations'
    const cites: ToolCitation[] = [{ kind: 'count', url: indexUrl, text: `${matches.length} ${what} match ${scope} in ${candidates.size - unknown} reports whose ${part} OPAX extracted (snapshot ${snapshot}), newest first.` }, ...rows.map(r => itemCite(r, part))]
    if (rows.some(r => r.acquisition)) notes.push(MANUAL_NOTE)
    if (unknown) notes.push(`${unknown} matching reports have ${part} that OPAX did not extract; their ${part} are unknown, not absent, and are not counted here.`)
    if (part === 'findings') notes.push('Labels are each commission\'s own statutory terms (for example serious corrupt conduct, or an opinion of serious misconduct). Do not treat counts as comparable across commissions. Names appear only as the report prints them.')
    return publishedResult(rows, cites, { view: args.view, total: matches.length, offset, next_offset: offset + rows.length < matches.length ? offset + rows.length : null, snapshot, notes: [...notes, ...gapNote] })
  },
}
