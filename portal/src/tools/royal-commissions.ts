/** Royal commissions: reports, numbered recommendations, official status and government responses (public/royal-commissions). */
import { clip, fold, siteUrl } from './record-common'
import { object, publishedResult, records, sourceUrl, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'
import { dayWords, pageHits, spanWords, textIndex, textMatches, type TextHits } from './transcript-text'

const VIEWS = ['list', 'profile', 'recommendations', 'transcripts'] as const
const TRANSCRIPT_LABEL = 'Hearing transcript: evidence, not findings'
const JURISDICTIONS = ['Cth', 'NSW', 'Vic', 'Qld', 'WA', 'SA', 'Tas', 'ACT', 'NT'] as const
// The house codes other tools use (federal, nsw, vic ...) are accepted beside the dataset's own codes, so a
// planner that writes "vic" is not refused as malformed.
const HOUSE_JURISDICTIONS: Record<string, string> = { federal: 'Cth', cth: 'Cth', nsw: 'NSW', vic: 'Vic', qld: 'Qld', wa: 'WA', sa: 'SA', tas: 'Tas', act: 'ACT', nt: 'NT' }
const jurisdictionCode = (v: unknown): string | undefined => v == null || v === '' ? undefined : HOUSE_JURISDICTIONS[String(v).toLowerCase()] ?? String(v)
const ID = /^[a-z0-9]+(?:-[a-z0-9]+){1,8}$/
const NOTE = 'Recommendations are the commission\'s own words with the report page each was read from. A status appears only where a government publishes one for that recommendation, in its own words; otherwise the status is unknown, not unimplemented. Findings and recommendations of a royal commission or inquiry are not findings of criminal or civil liability. Hearing transcripts are evidence, not findings.'
const TYPES: Record<string, string> = { royal_commission: 'royal commission', commission_of_inquiry: 'commission of inquiry', board_of_inquiry: 'board of inquiry' }
const BASIS: Record<string, string> = { tabled_vic: 'tabled in the Parliament of Victoria', stated: 'dated', updated: 'page updated', published: 'published' }

async function index(env: ToolEnv) {
  const data = object(await readToolAsset(env, '/royal-commissions/index.json')), meta = object(data.meta)
  const commissions = records(data.commissions)
  if (!commissions.length || typeof meta.snapshot_at !== 'string') throw new Error('Royal commissions projection unavailable')
  return { meta, commissions, url: siteUrl(env, '/royal-commissions/index.json') }
}
type Index = Awaited<ReturnType<typeof index>>

/** Commissions matching an id or words in the name; an exact id or name wins. */
function match(ix: Index, query: unknown, jurisdiction: unknown): RecordRow[] {
  const code = jurisdictionCode(jurisdiction)
  const pool = ix.commissions.filter(c => !code || c.jurisdiction === code)
  if (!query) return pool
  const q = fold(query).replace(/^the\s+/, '')
  const exact = pool.filter(c => c.id === query || fold(c.name).replace(/^the\s+/, '') === q)
  return exact.length ? exact : pool.filter(c => wordsMatch(query, [c.name, c.id]))
}

async function full(env: ToolEnv, row: RecordRow): Promise<RecordRow> {
  const file = String(row.file ?? '')
  if (!/^\/royal-commissions\/commission-[a-z0-9-]+\.json$/.test(file)) throw new Error('Royal commission file unavailable')
  const c = object(object(await readToolAsset(env, file)).commission)
  if (c.id !== row.id) throw new Error('Royal commission file unavailable')
  return c
}

const people = (c: RecordRow) => records(c.commissioners).map(x => `${x.name} (${x.role})`).join('; ')
const dated = (label: string, v: unknown) => v ? `${label} ${dayWords(v)}` : null

function summaryOut(c: RecordRow): RecordRow {
  return { id: c.id, name: c.name, inquiry_type: TYPES[String(c.inquiry_type)] ?? c.inquiry_type, jurisdiction: c.jurisdiction_name, established: c.established ?? null, commissioners: c.commissioners,
    interim_report_date: c.interim_report_date ?? null, final_report_date: c.final_report_date ?? null, counts: c.counts,
    status_as_published: c.status_as_published, recommendations_status: c.recommendations_status, follow_up: { view: 'profile', commission: c.id } }
}

function summaryCite(env: ToolEnv, c: RecordRow): ToolCitation {
  const counts = object(c.counts)
  const parts = [dated('established', c.established), dated('interim report', c.interim_report_date), dated('final report', c.final_report_date)].filter(Boolean)
  // Worded as the public record reads ("its reports make 57 recommendations"), never as OPAX stored it: a writer that
  // copied "57 recommendations loaded; 0 … documents listed" produced "The report loaded 57 recommendations, with 0 …".
  const loaded = counts.recommendations ? `Its reports make ${counts.recommendations} recommendations${counts.with_status ? `, ${counts.with_status} with a government-published status` : ''}` : c.recommendations_status === 'no_report' ? 'OPAX holds no published report' : 'OPAX does not hold its recommendations'
  return { kind: 'record', url: siteUrl(env, String(c.file)), text: clip(`${c.name} (${TYPES[String(c.inquiry_type)] ?? 'inquiry'}, ${c.jurisdiction_name})${parts.length ? ': ' + parts.join(', ') : ''}. ${loaded}; ${counts.responses ? `${counts.responses} government response or implementation documents are held` : 'no government response or implementation document is held'}${counts.transcripts ? `; ${counts.transcripts} hearing transcripts are held (evidence, not findings)` : ''}${counts.court_context ? '; a court has ruled on parts of a report (see the profile\'s court_context)' : ''}.`, 600) }
}

const courtFor = (c: RecordRow, key: unknown) => records(c.court_context).filter(x => x.applies_to === key).map(x => ({ text: x.text, source_url: sourceUrl(object(x.cite).url) }))

// newest first, ties by key, so an offset names the same row on every call
const byDate = (ds: RecordRow[]) => [...ds].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(a.key).localeCompare(String(b.key)))
const latest = (c: RecordRow) => byDate(records(c.transcripts))

/** A profile carries the count, date range and newest few; view=transcripts pages through the rest. */
function transcriptSummary(c: RecordRow): RecordRow {
  const all = latest(c), dates = all.map(d => d.date).filter(Boolean).map(String).sort()
  return { label: TRANSCRIPT_LABEL, count: all.length, first_date: dates[0] ?? null, last_date: dates.at(-1) ?? null,
    newest: all.slice(0, 3).map(d => ({ key: d.key, title: d.title, date: d.date ?? null, page_url: sourceUrl(d.page_url), pdf_url: sourceUrl(object(records(d.files)[0]).url) })),
    ...(all.length ? { follow_up: { view: 'transcripts', commission: c.id } } : {}) }
}

function transcriptOut(env: ToolEnv, c: RecordRow, d: RecordRow): RecordRow {
  const file = object(records(d.files)[0])
  return { commission: c.name, commission_id: c.id, label: TRANSCRIPT_LABEL, key: d.key, title: d.title, date: d.date ?? null, date_basis: BASIS[String(d.date_basis)] ?? d.date_basis ?? null,
    hearing: d.hearing ?? null, page_url: sourceUrl(d.page_url), pdf_url: sourceUrl(file.url), pages: file.pages ?? null, rights: d.rights ?? null,
    publisher_redacted: /redact/i.test(`${file.url ?? ''} ${d.title ?? ''}`), ...(orderNotes(c).length ? { order_notes: orderNotes(c) } : {}),
    ...(d.full_text ? { text_url: siteUrl(env, String(object(d.full_text).url)), quote_policy: object(d.full_text).quote_policy } : {}) }
}
/** The commission's own notes about non-publication or suppression orders travel with each transcript. */
const orderNotes = (c: RecordRow) => (Array.isArray(c.notes) ? c.notes as unknown[] : []).map(String).filter(n => /non-publication|suppression|publication order/i.test(n)).map(n => clip(n, 300))

/** "the Royal Commission into ...", as the integrity tool's count line reads ("OPAX lists N ... from the IBAC"). */
const fromThe = (name: string) => /^the\s/i.test(name) ? name : `the ${name}`

function transcriptCite(t: RecordRow): ToolCitation {
  const text = t.text_matches as TextHits | undefined
  if (text?.hits.length) {
    const where = (h: TextHits['hits'][number]) => `transcript page ${h.transcript_page ?? '?'} (PDF page ${h.pdf_page})`
    // A speaker's label leaves the quoted words; the hearing turn names who spoke.
    const body = text.quote_policy === 'quote'
      ? text.hits.map(h => `${where(h)}, hearing turn${h.speaker ? ` by ${h.speaker}` : ''}: "${h.excerpt}"`).join(' ')
      : `the words appear on ${text.hits.map(where).join(' and ')}. Not quoted: the publisher's transcript records a non-publication order, a direction not to publish or a pseudonymous witness; read the publisher's edition.`
    return { kind: 'record', url: text.hits[0].url, text: `${clip(`${t.commission}, ${t.title}${t.date ? ` (${dayWords(t.date)})` : ''}, ${body}`, 900)} ${TRANSCRIPT_LABEL}. ${text.attribution}.` }
  }
  return { kind: 'record', url: String(t.pdf_url ?? t.page_url), text: clip(`${t.commission}, ${t.title}${t.date ? ` (${dayWords(t.date)})` : ''}${t.pages ? `, ${t.pages} pages` : ''}. ${TRANSCRIPT_LABEL}.`, 400) }
}

/** The report's findings in its own words: the quotes the report record holds ("In the body's own words", checked
 * verbatim against the cited page by scripts/report_summaries/gate.py and built into /report-records/). One fact per
 * quote, cited to its page, so an accountability question can lead with what the commission found rather than with
 * its dates and counts. Empty when the record or its quotes are not built. */
async function findingCites(env: ToolEnv, c: RecordRow): Promise<ToolCitation[]> {
  if (!ID.test(String(c.id))) return []
  const record = object(await readToolAsset(env, `/report-records/royal-commission-${c.id}.json`).catch(() => null))
  return records(object(object(record.summary).quotes).items).slice(0, 4).flatMap(q => {
    const cite = object(q.cite), url = sourceUrl(cite.url), quote = String(q.quote ?? '').trim()
    if (!url || !quote) return []
    const page = Number.isInteger(cite.page) ? Number(cite.page) : null
    return [{ kind: 'record' as const, url: page ? `${url}#page=${page}` : url,
      text: clip(`${c.name}, ${cite.document || 'report'}${page ? `, page ${page}` : ''} [${q.kind === 'conclusion' ? 'conclusion' : 'finding'}], in the commission's own words: "${quote}"`, 700) }]
  })
}

function recOut(c: RecordRow, r: RecordRow, reports: Map<string, RecordRow>): RecordRow {
  const report = reports.get(String(r.report)) ?? {}, cite = object(r.cite), status = r.status ? object(r.status) : null
  const court = courtFor(c, r.report)
  return { commission: c.name, commission_id: c.id, number: r.number ?? null, ...(r.number == null && r.label ? { label: r.label } : {}), report: report.title ?? r.report, report_kind: report.kind ?? null, report_date: report.date ?? null,
    ...(court.length ? { court_context: court } : {}),
    text: r.text, source_url: sourceUrl(cite.url), page: cite.page ?? null,
    status: status ? { as_published: status.as_published, lead: status.lead ?? null, updated: status.updated ?? null, source_url: sourceUrl(object(status.cite).url) } : null,
    follow_up: { view: 'recommendations', commission: c.id, ...(r.number != null ? { number: r.number } : {}), report: r.report } }
}

function recCite(r: RecordRow): ToolCitation {
  const status = object(r.status)
  const court = records(r.court_context).map(x => x.text).join(' ')
  return { kind: 'record', url: String(r.source_url), text: clip(`${r.commission}, ${r.report}, ${r.number != null ? `recommendation ${r.number}` : `unnumbered recommendation "${r.label}"`} (page ${r.page}): "${r.text}"${r.status ? ` Government-published status: ${status.as_published}${status.updated ? ' (updated ' + status.updated + ')' : ''}.` : ''}${court ? ` Court context: ${court}` : ''}`, court ? 1600 : 900) }
}

export const tool: ToolDefinition = {
  name: 'royal_commissions',
  description: 'Royal commissions and similar public inquiries in every jurisdiction: establishment date, commissioners, report dates and links, recommendations in the commission\'s own words with the report page (numbered as the report numbers them), official implementation status where a government publishes one (Victoria\'s Family Violence tracker), government responses, hearing transcripts (evidence, not findings), and court rulings on parts of a report. view=list lists commissions (jurisdiction or name words); view=profile gives one commission\'s reports, responses, transcript count, court context and facts; view=transcripts pages one commission\'s transcripts newest first (words match title, date or text for Robodebt, Antisemitism, NSW Healthcare); view=recommendations searches recommendation text (words, number, status, report) in one commission or all. Status is unknown unless a government publishes it.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    view: { type: 'string', enum: [...VIEWS] },
    commission: { type: 'string', minLength: 2, maxLength: 160, description: 'Commission id from a row or words in its name, e.g. "family violence", "disability".' },
    jurisdiction: { type: 'string', enum: [...Object.keys(HOUSE_JURISDICTIONS), ...JURISDICTIONS] },
    words: { type: 'string', minLength: 2, maxLength: 160, description: 'Words that must all appear (recommendation or transcript).' },
    number: { type: 'string', pattern: '^\\d{1,3}(?:\\.\\d{1,3})?$', description: 'Recommendation number as the report numbers it, e.g. "12" or "4.1".' },
    report: { type: 'string', pattern: '^[a-z0-9-]{2,40}$', description: 'Report key from a profile row (for commissions with several reports).' },
    status: { type: 'string', minLength: 2, maxLength: 60, description: 'Words in the published status, e.g. "Implemented".' },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 5000 },
  }, required: ['view'], examples: [{ view: 'list' }, { view: 'profile', commission: 'family violence' }, { view: 'recommendations', commission: 'family violence', words: 'information sharing' }, { view: 'recommendations', words: 'National Disability Insurance Scheme', jurisdiction: 'Cth' }, { view: 'recommendations', commission: 'robodebt', number: '23.1' }, { view: 'transcripts', commission: 'robodebt', words: '2023-03' }] },
  identifierFields: ['commission'],
  validate: args => (args.view === 'profile' ? !!args.commission && !args.words && !args.number && !args.status : true) &&
    (args.view === 'transcripts' ? !!args.commission && !args.number && !args.status && !args.report : true) &&
    (args.view === 'list' ? !args.words && !args.number && !args.status && !args.report : true) &&
    (!args.number || !!args.commission) && (!args.report || !!args.commission) && (!args.commission || ID.test(String(args.commission)) || /\p{L}/u.test(String(args.commission))),
  stepLabel: args => ({ label: 'Checking royal commissions', arg: clip(args.words ?? args.commission ?? args.jurisdiction ?? args.view, 40) }),
  async handler(env, args) {
    const ix = await index(env), snapshot = ix.meta.snapshot_at
    const offset = Number(args.offset) || 0, limit = Number(args.limit) || 5
    const matched = match(ix, args.commission, args.jurisdiction)
    const coverage = `${ix.commissions.length} royal commissions are in the published projection (${Object.entries(object(object(ix.meta.counts).by_jurisdiction)).map(([j, v]) => `${j} ${object(v).commissions}`).join(', ')}).`
    if (!matched.length) return { rows: [], citations: [{ kind: 'export', url: ix.url, text: coverage }], notes: ['No royal commission or inquiry in this projection matches. Coverage is mainly Commonwealth and Victorian commissions whose reports an official source served to OPAX, plus inquiries in the other states and territories, several listed by their hearing transcripts only.'], total: 0, snapshot }
    const several = args.commission && matched.length > 1 ? [`"${clip(args.commission, 60)}" matches ${matched.length} commissions: ${matched.slice(0, 5).map(c => c.name).join('; ')}. Use the id to narrow.`] : []

    if (args.view === 'list') {
      const rows = matched.slice(offset, offset + limit).map(summaryOut)
      // One commission named: its findings travel with its line, so a list call alone can answer what it found.
      const findings = args.commission && matched.length === 1 ? await findingCites(env, matched[0]) : []
      return publishedResult(rows, [{ kind: 'count', url: ix.url, text: coverage }, ...matched.slice(offset, offset + limit).map(c => summaryCite(env, c)), ...findings],
        { view: 'list', total: matched.length, offset, next_offset: offset + rows.length < matched.length ? offset + rows.length : null, snapshot, notes: [NOTE] })
    }
    if (args.view === 'profile') {
      const c = await full(env, matched[0])
      const doc = (d: RecordRow) => ({ key: d.key, kind: d.kind, title: d.title, date: d.date ?? null, date_basis: BASIS[String(d.date_basis)] ?? d.date_basis ?? null, page_url: sourceUrl(d.page_url),
        pdf_urls: records(d.files).map(f => sourceUrl(f.url)).filter(Boolean), acquisition: d.acquisition ?? null, ...(d.hearing ? { hearing: d.hearing } : {}),
        ...(d.kind === 'hearing_transcript' ? {} : { recommendations: d.recommendations ?? null, recommendations_status: d.recommendations_status ?? null }),
        ...(courtFor(c, d.key).length ? { court_context: courtFor(c, d.key) } : {}) })
      const est = c.established ? object(c.established) : null
      const row: RecordRow = { id: c.id, name: c.name, inquiry_type: TYPES[String(c.inquiry_type)] ?? c.inquiry_type, jurisdiction: c.jurisdiction_name, site: c.site ?? null,
        established: est ? { date: est.date, instrument: est.instrument, quote: est.quote, source_url: sourceUrl(object(est.cite).url), page: object(est.cite).page ?? null } : null,
        commissioners: records(c.commissioners).map(x => ({ name: x.name, role: x.role, source_url: sourceUrl(object(x.cite).url), page: object(x.cite).page ?? null })),
        reports: records(c.reports).map(doc), responses: records(c.responses).map(doc), transcripts: transcriptSummary(c),
        reference_pages: records(c.reference_pages).map(x => ({ title: x.title, url: sourceUrl(x.url) })), status_source: c.status_source ?? null,
        recommendations: records(c.recommendations).length, notes: c.notes, gaps: c.gaps, follow_up: { view: 'recommendations', commission: c.id } }
      const citations: ToolCitation[] = [summaryCite(env, matched[0]), ...await findingCites(env, c)]
      // The record's own notes (whether it has reported, how its recommendations are counted, publication orders)
      // travel as facts, so a sitting commission is described as sitting rather than inferred from other sources.
      for (const n of (Array.isArray(c.notes) ? c.notes as unknown[] : []).map(String).slice(0, 3)) citations.push({ kind: 'record', url: siteUrl(env, String(matched[0].file)), text: clip(`${c.name} (OPAX note): ${n}`, 600) })
      if (est) citations.push({ kind: 'record', url: String(object(est.cite).url), text: clip(`${c.name}: "${est.quote}" (${object(est.cite).document}, page ${object(est.cite).page}).`, 600) })
      for (const x of records(c.court_context)) citations.push({ kind: 'record', url: String(object(x.cite).url), text: clip(`Court context for ${c.name}, as ${object(x.cite).document} states it: "${x.text}"`, 900) })
      if (records(c.commissioners).length) citations.push({ kind: 'record', url: String(object(records(c.commissioners)[0].cite).url), text: clip(`${c.name} commissioners as ${object(records(c.commissioners)[0].cite).document ?? 'the cited document'} names them: ${people(c)}.`, 600) })
      for (const d of [...records(c.reports), ...records(c.responses), ...latest(c).slice(0, 2)].slice(0, 6)) citations.push({ kind: 'record', url: String(sourceUrl(d.page_url) ?? ix.url), text: clip(`${d.title}${d.date ? ` (${BASIS[String(d.date_basis)] ?? 'dated'} ${dayWords(d.date)})` : ''}${d.kind === 'hearing_transcript' ? `. ${TRANSCRIPT_LABEL}` : ''}.`, 400) })
      const span = transcriptSummary(c)
      if (span.count) citations.push({ kind: 'count', url: siteUrl(env, String(matched[0].file)), text: `OPAX lists ${span.count} hearing transcript${span.count === 1 ? '' : 's'} from ${fromThe(String(c.name))}, dated ${spanWords(span.first_date, span.last_date)}. ${TRANSCRIPT_LABEL}.` })
      return publishedResult([row], citations, { view: 'profile', total: 1, offset: 0, next_offset: null, snapshot, notes: [...several, NOTE, ...(span.count ? ['view=transcripts lists the hearing transcripts, newest first.'] : [])] })
    }

    if (args.view === 'transcripts') {
      const c = await full(env, matched[0])
      const all = byDate(records(c.transcripts))
      const ix = args.words ? await textIndex(env).catch(() => null) : null
      const found = ix && args.words ? await textMatches(env, ix, String(c.id), String(args.words)) : null
      const hits = all.filter(d => (!args.words || wordsMatch(args.words, [d.title, d.hearing, d.date]) || !!found?.keys.has(String(d.key))))
      const picked = await Promise.all(hits.slice(offset, offset + limit).map(async d => {
        const row = transcriptOut(env, c, d)
        const text = ix && found?.keys.has(String(d.key)) ? await pageHits(env, ix, String(d.key), found.terms) : null
        return text ? { ...row, text_matches: text } : row
      }))
      const span = transcriptSummary(c), range = span.first_date ? `, dated ${spanWords(span.first_date, span.last_date)}` : ''
      const count = `OPAX lists ${all.length} hearing transcript${all.length === 1 ? '' : 's'} from ${fromThe(String(c.name))}${range}${hits.length !== all.length ? `; ${hits.length} match` : ''} (OPAX projection, snapshot ${snapshot}). ${TRANSCRIPT_LABEL}.`
      return publishedResult(picked, [{ kind: 'count', url: siteUrl(env, String(matched[0].file)), text: count }, ...picked.map(transcriptCite)],
        { view: 'transcripts', total: hits.length, offset, next_offset: offset + picked.length < hits.length ? offset + picked.length : null, snapshot,
          notes: [...several, NOTE, 'Transcripts are listed newest first with the publisher\'s page and PDF. What a witness or counsel says in a hearing is evidence or submission, not a finding of the commission.', ...(found ? [`Words are matched in the title, date and, for this commission, the transcript text (CC BY 4.0). Excerpts are the publisher's words; a transcript recording a non-publication order or a pseudonymous witness is pointed to by page, not quoted.`] : []),
            ...(ix && args.words && !found && object(ix.commissions[String(c.id)]).name ? ['Those words are too common to search the transcript text; add a more specific word.'] : []),
            ...(hits.length ? [] : ['No listed transcript matches. Try fewer words.'])] })
    }

    // recommendations
    const pool = args.commission ? matched.slice(0, args.number || args.report ? 1 : matched.length) : matched
    const hits: RecordRow[] = []
    let single: RecordRow | null = null
    for (const row of pool) {
      if (!object(row.counts).recommendations) continue
      const c = await full(env, row), reports = new Map(records(c.reports).map(r => [String(r.key), r]))
      for (const r of records(c.recommendations)) {
        if (args.number && r.number !== args.number) continue
        if (args.report && r.report !== args.report) continue
        if (args.words && !wordsMatch(args.words, [r.text])) continue
        if (args.status && !(r.status && wordsMatch(args.status, [object(r.status).as_published]))) continue
        hits.push(recOut(c, r, reports))
      }
      if (pool.length === 1) single = c
    }
    const picked = hits.slice(offset, offset + limit)
    const scope = ['commission', 'jurisdiction', 'words', 'number', 'report', 'status'].filter(k => args[k] !== undefined).map(k => `${k} ${args[k]}`).join(', ') || 'all commissions'
    const notes = [...several, NOTE]
    const withoutRecs = pool.filter(c => !object(c.counts).recommendations)
    if (withoutRecs.length) notes.push(`Recommendations are not loaded for ${withoutRecs.length} matching commission${withoutRecs.length > 1 ? 's' : ''} (${withoutRecs.slice(0, 4).map(c => c.name).join('; ')}); no match there does not mean no such recommendation.`)
    if (!hits.length) notes.push('No loaded recommendation matches. Try fewer words, or view=profile for the commission\'s reports.')
    // For one commission the count states its loaded total, so "how many recommendations" is answered by the
    // commission's own numbering, not by the number of rows a filter matched.
    const loaded = single ? records(single.recommendations).length : 0
    const unnumbered = single ? records(single.recommendations).filter(r => r.number == null).length : 0
    const filtered = ['words', 'number', 'report', 'status'].some(k => args[k] !== undefined)
    const countText = single
      ? `${single.name}: ${unnumbered ? `${loaded} recommendations (${loaded - unnumbered} numbered, ${unnumbered} printed without a number)` : `${loaded} numbered recommendations`} loaded from its published report${records(single.reports).length > 1 ? 's' : ''}${filtered ? `; ${hits.length} match ${scope}` : ''} (OPAX projection, snapshot ${snapshot}).`
      : `${hits.length} recommendations match ${scope} in the published royal commissions projection (snapshot ${snapshot}).`
    const countNotes = single && Array.isArray(single.notes) ? (single.notes as unknown[]).map(String).filter(n => /\brecommendations?\b/i.test(String(n))).slice(0, 2) : []
    return publishedResult(picked, [{ kind: 'count', url: single ? siteUrl(env, String(pool[0].file)) : ix.url, text: countText },
      ...countNotes.map(n => ({ kind: 'record' as const, url: siteUrl(env, String(pool[0].file)), text: clip(`${single!.name} (OPAX note): ${n}`, 600) })), ...picked.map(recCite)],
      { view: 'recommendations', total: hits.length, offset, next_offset: offset + picked.length < hits.length ? offset + picked.length : null, snapshot, notes })
  },
}
