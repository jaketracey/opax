import type { RecordRow } from './tools/published-records'

const object = (value: unknown): RecordRow => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordRow : {}
const records = (value: unknown): RecordRow[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) : []

export type ReportType = 'royal_commission' | 'integrity_report' | 'annual_report' | 'agency_report'
export interface ReportCitation { url: string; document: string; page?: number; section?: string }
/** GET /api/report/:slug, schema 1. Null date means no published/tabled day is
 * held, never the snapshot date. `record` is the original commission, integrity
 * report, body-year report metadata, or agency document, selected by report_type.
 * Findings/recommendations keep their labels, numbers, kinds and cite objects in
 * record. Annual tables keep original rows and units; agency facts keep quotes,
 * pages and source_url. Page and API consume this same offline projection. */
export interface ReportDetail {
  schema: 1; kind: 'report'; report_type: ReportType; slug: string; title: string; body: string; jurisdiction: string
  date: string | null; date_basis: string | null; year: string | null; snippet: string; citation: ReportCitation
  snapshot_at: string; caveats: string[]; publisher: RecordRow; record: RecordRow
  facts: RecordRow[]; tables: RecordRow[]; headline: RecordRow | null
  /** Present only for reports with a checked generated summary (scripts/build_report_catalog.mjs). */
  summary?: ReportSummary
}
/** A generated summary: every sentence cites the report pages it rests on, and the quotes are the body's own words,
 * verbatim. `quotes.items` is empty where the record already reproduces findings or the quotes are held. */
export interface ReportSummary {
  own_summary: { label: string; heading: string; url: string; first_page?: number; last_page?: number } | null
  generated: { label: string; model: string; checked_at: string | null; sentences: { text: string; cites: ReportCitation[]; section?: string }[] }
  quotes: { label: string; items: { quote: string; kind: string; cite: ReportCitation }[] }
}
export const REPORT_SLUG = /^(?:royal-commission|integrity-report|annual-report|agency-report)-[a-z0-9]+(?:-[a-z0-9]+)*$/
export async function readReport(assets: Fetcher, slug: string): Promise<ReportDetail | null> {
  if (slug.length > 260 || !REPORT_SLUG.test(slug)) return null
  const response = await assets.fetch(new Request(`https://opax.com.au/report-records/${slug}.json`))
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Report record unavailable')
  const data = await response.json<ReportDetail>()
  if (data.schema !== 1 || data.kind !== 'report' || data.slug !== slug) throw new Error('Invalid report record')
  return data
}

// ---- formatting. Everything here is presentation of values the record holds;
// nothing is fetched or parsed beyond the one record already in hand.
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const url = (value: unknown) => typeof value === 'string' && /^https:\/\//.test(value) ? value : null
const host = (href: string) => (/^https:\/\/(?:www\.)?([^/?#]+)/.exec(href) || [])[1] || ''
const isPdf = (href: string) => /\.pdf\b/i.test(href)
const human = (value: unknown) => { const s = String(value ?? '').replace(/_/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : '' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** 2023-07-07, 20231107 or an ISO time as "7 July 2023"; anything else as held. */
function day(value: unknown): string {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:$|T)/.exec(String(value ?? ''))
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : String(value ?? '')
}
const isoDay = (value: unknown) => { const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(value ?? '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : '' }
const time = (value: unknown) => isoDay(value) ? `<time datetime="${isoDay(value)}">${esc(day(value))}</time>` : esc(value)
/** Keep the source's precision: a month or year does not establish a day. */
function reportPeriod(value: unknown): string {
  if (!value || typeof value !== 'object') return esc(value)
  const period = object(value)
  const raw = typeof period.value === 'string' ? period.value : ''
  const month = /^(\d{4})-(\d{2})$/.exec(raw)
  const label = period.precision === 'month' && month && +month[2] >= 1 && +month[2] <= 12
    ? `${MONTHS[+month[2] - 1]} ${month[1]}`
    : period.precision === 'day' ? day(raw) : raw
  return [esc(label), typeof period.basis === 'string' ? esc(period.basis) : ''].filter(Boolean).join('. ')
}
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
function figure(n: number): string { const [i, f] = String(Math.abs(n)).split('.'); return (n < 0 ? '-' : '') + group(i) + (f ? '.' + f : '') }
/** A dollar amount in words a reader can say: $50.39 billion, $136.3 million, $880,211. */
function dollars(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2).replace(/\.?0+$/, '')} billion`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1).replace(/\.0$/, '')} million`
  return `${sign}$${figure(Math.round(a))}`
}
const bytes = (n: unknown) => finite(n) && n > 0 ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : ''
const plural = (n: number, one: string, many = one + 's') => `${figure(n)} ${n === 1 ? one : many}`
const anchor = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const JURISDICTION: Record<string, string> = { Cth: 'Commonwealth', NSW: 'New South Wales', Vic: 'Victoria', Qld: 'Queensland', WA: 'Western Australia', SA: 'South Australia', Tas: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory' }
const DATE_BASIS: Record<string, string> = { publisher_listing: 'Listed by the publisher for', tabled: 'Tabled', tabled_vic: 'Tabled in the Parliament of Victoria', published: 'Published', stated: 'Dated', dated: 'Dated', updated: 'Page updated', released: 'Released' }
const dated = (basis: unknown, value: unknown) => `${esc(DATE_BASIS[String(basis)] || 'Dated')} ${time(value)}`

// ---- links and citations
const link = (href: unknown, label: unknown, cls = '') => url(href) ? `<a href="${esc(href)}"${cls ? ` class="${cls}"` : ''} rel="noopener">${esc(label || href)}</a>` : ''
function pageTarget(href: string, page: unknown) {
  return page != null && isPdf(href) && !href.includes('#') ? `${href}#page=${page}` : href
}
/** A cite object as one link whose text says where it goes. Where it points at the
 *  page's own main document the name shortens to "Report"; the page and section
 *  stay in the link text either way. */
/** Same name, ignoring case and outer space ("investigation report" / "Investigation Report"). */
const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
function citeLink(raw: unknown, mainDocument = ''): string {
  const c = object(raw), href = url(c.url)
  if (!href) return ''
  const doc = c.document && !same(c.document, mainDocument) ? String(c.document) : mainDocument ? 'Report' : 'Official source'
  const label = `${doc}${c.page == null ? '' : `, page ${c.page}`}${c.section ? `, ${c.section}` : ''}`
  return `<a class="rr-cite" href="${esc(pageTarget(href, c.page))}" rel="noopener">${esc(label)}</a>`
}
const citeLine = (raw: unknown, mainDocument = '') => { const a = citeLink(raw, mainDocument); return a ? `<p class="rr-cite-line">${a}</p>` : '' }
const text = (value: unknown, cls = 'rr-record-text') => `<p class="${cls}">${esc(value)}</p>`
/** A body's words with its inline list runs (" • item", " ◦ sub-item") set one to a
 *  line. Every character stays: the spans only break the line, so the text with the
 *  tags removed is the source text exactly. */
function prose(value: unknown, cls: string): string {
  const s = String(value ?? ''), runs = s.split(/(?= [•◦▪●] )/)
  if (runs.length < 2) return `<p class="${cls}">${esc(s)}</p>`
  return `<p class="${cls}">${esc(runs[0])}${runs.slice(1).map(x => `<span class="rr-line${/^ [◦▪]/.test(x) ? ' rr-line-sub' : ''}">${esc(x)}</span>`).join('')}</p>`
}
const notes = (values: unknown) => Array.isArray(values) && values.length ? `<ul class="rr-notes" role="list">${values.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : ''
/** Key and value rows for the fields a record holds, keys in words. */
function kv(pairs: [string, string][]): string {
  const kept = pairs.filter(([, v]) => v)
  return kept.length ? `<dl class="ui-kv rr-kv" data-stack="phone">${kept.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''
}
function fields(row: RecordRow, keys: string[]): string {
  return kv(keys.filter(k => row[k] !== undefined && row[k] !== null && row[k] !== '').map(k => {
    const v = row[k]
    return [human(k), typeof v === 'object' && !Array.isArray(v) ? fields(object(v), Object.keys(object(v))) : esc(Array.isArray(v) ? v.join('; ') : v)]
  }))
}

interface Part { id: string; title: string; count?: number; html: string }
const sectionHTML = (p: Part) => `<section class="ui-section rr-section" id="${p.id}" aria-labelledby="${p.id}-title"><h2 class="ui-section-title" id="${p.id}-title">${esc(p.title)}${p.count != null ? ` <span class="rr-count">${figure(p.count)}</span>` : ''}</h2>${p.html}</section>`
interface Stat { label: string; value: string; note?: string }
const glance = (stats: Stat[]) => stats.length ? `<dl class="ui-stats rr-glance">${stats.map(s => `<div class="ui-stat" data-size="compact"><dt class="ui-stat-label">${esc(s.label)}</dt><dd class="ui-stat-value">${s.value}</dd>${s.note ? `<dd class="rr-stat-note">${s.note}</dd>` : ''}</div>`).join('')}</dl>` : ''

// ---- the official document: one card, the link first
interface SourceDoc { href: string; label: string; pages?: unknown; size?: unknown }
function sourceCard(main: SourceDoc | null, more: { href: unknown; label: string }[]): string {
  const seen = new Set(main ? [main.href] : [])
  const extra = more.filter(m => { const h = url(m.href); if (!h || seen.has(h)) return false; seen.add(h); return true })
  if (!main && !extra.length) return ''
  const facts = main ? [isPdf(main.href) ? 'PDF' : '', finite(main.pages) ? plural(main.pages, 'page') : '', bytes(main.size), host(main.href)].filter(Boolean).join(' · ') : ''
  return `<div class="rr-source"><p class="rr-source-kicker">Official source</p>` +
    (main ? `<p class="rr-source-title"><a href="${esc(main.href)}" rel="noopener">${esc(main.label)}</a></p><p class="rr-source-meta">${esc(facts)}</p>` : '') +
    (extra.length ? `<ul class="rr-source-more" role="list">${extra.map(m => `<li>${link(m.href, m.label)}</li>`).join('')}</ul>` : '') + `</div>`
}

// ---- recommendations and findings: the body's own words, labels and citations
function statusMeta(status: RecordRow): string {
  const bits = [status.lead ? `Lead: ${esc(status.lead)}` : '', status.updated ? `Updated ${time(status.updated)}` : ''].filter(Boolean)
  return bits.length ? `<p class="rr-status-meta">${bits.join(' · ')}</p>` : ''
}
/** "Findings" when every item is a finding (or "Opinions"), else the mixed title. */
function findingsTitle(held: RecordRow[]): string {
  const kinds = new Set(held.map(x => x.kind))
  const only = kinds.size === 1 ? { finding: 'Findings', opinion: 'Opinions' }[String([...kinds][0])] : undefined
  return only || 'Findings, opinions and statements'
}
function items(part: 'findings' | 'recommendations', r: ReportDetail, mainDocument: string): Part {
  const c = r.record, held = records(c[part]), state = c[part + '_status']
  const reports = records(c.reports)
  const id = part
  const title = part === 'findings' ? findingsTitle(held) : 'Recommendations'
  // An unextracted list is unknown, not a report that made no findings.
  const empty = state === 'stated_none' ? `The report states that it makes no ${part}.`
    : state === 'no_report' ? 'No report is held for this inquiry, so no recommendations are reproduced.'
    : `No ${part} are reproduced in this record. This does not establish that the report contains none.`
  const partial = state === 'partial' ? `<p class="ui-section-note">Only some of the ${part} are reproduced here, from the official copies OPAX could read.</p>` : ''
  // The record's own caveat for this list leads it: allegations for an integrity
  // body's findings, liability for a commission's recommendations.
  const allegation = part === 'findings' ? r.caveats.find(x => /^Allegations are not findings/.test(x))
    : r.report_type === 'royal_commission' && held.length ? r.caveats.find(x => /not findings of criminal or civil liability/.test(x)) : undefined
  const note = allegation ? `<p class="ui-section-note rr-caveat-inline">${esc(allegation)}</p>` : ''
  const statuses = held.map(i => object(i.status).as_published).filter(Boolean)
  const list = held.length ? `<ol class="rr-items" role="list">${held.map((item, i) => {
    const label = item.label ?? (part === 'recommendations' ? `Recommendation${item.number == null ? '' : ' ' + item.number}` : human(item.kind))
    const status = item.status ? object(item.status) : null
    const from = reports.length > 1 ? reports.find(d => d.key === item.report && !same(d.title, object(item.cite).document)) : null
    const itemId = part === 'recommendations' && item.number != null ? `recommendation-${anchor(item.number)}` : `${part}-${i + 1}`
    const kind = part === 'findings' && item.kind ? `<span class="ui-status rr-kind">${esc(human(item.kind))}</span>` : ''
    return `<li class="rr-item" id="${esc(itemId)}"><div class="rr-item-head"><h3 class="rr-item-label">${esc(label)}</h3>${kind}</div>${from ? `<p class="rr-item-meta">${esc(from.title)}</p>` : ''}` +
      `${prose(item.text, 'rr-item-text')}${citeLine(item.cite, mainDocument)}` +
      (status ? `<div class="rr-status"><p class="rr-status-line"><span class="rr-status-title">Government-published status</span> <span class="ui-status">${esc(status.as_published)}</span></p>` +
        `${statusMeta(status)}${citeLine(status.cite)}</div>` : '') + `</li>`
  }).join('')}</ol>` : text(empty)
  // Recommendation numbers as a quiet index; a very long index starts folded so the
  // first recommendation is not a phone-screen of numbers away.
  // An item the report prints without a number (its own heading is the label) is not in the index.
  const numbered = held.filter(x => x.number != null)
  const numbers = part === 'recommendations' && numbered.length > 12 && held.every(x => x.number != null || x.label)
    ? `<ul role="list">${numbered.map(x => `<li><a href="#recommendation-${esc(anchor(x.number))}">${esc(x.number)}</a></li>`).join('')}</ul>` : ''
  const jump = !numbers ? '' : numbered.length > 60
    ? `<nav class="rr-jump" aria-label="Recommendation numbers"><details class="ui-disclosure rr-jump-fold"><summary>Go to a recommendation (${esc(numbered[0].number)} to ${esc(numbered[numbered.length - 1].number)})</summary>${numbers}</details></nav>`
    : `<nav class="rr-jump" aria-label="Recommendation numbers">${numbers}</nav>`
  // How many carry each status, counted in the government's own words, in the order
  // they first appear: a count of labels, not a judgement of them.
  const tally = new Map<string, number>()
  for (const x of statuses) tally.set(String(x), (tally.get(String(x)) || 0) + 1)
  const statusNote = statuses.length ? `<p class="ui-section-note">${plural(statuses.length, 'recommendation has', 'recommendations have')} a status published by government, shown in the government's own words.</p>` +
    `<ul class="rr-tally" role="list" aria-label="Government-published statuses">${[...tally].map(([label, n]) => `<li><span class="ui-status">${esc(label)}</span> <span class="rr-tally-count">${figure(n)}</span></li>`).join('')}</ul>` : ''
  return { id, title, count: held.length || undefined, html: note + partial + statusNote + jump + list }
}

// ---- generated summary: the report's own summary first, then the generated sentences under their label, each with
// the pages it rests on, then the body's own words.
const pages = (a?: number, b?: number) => a == null ? '' : b != null && b !== a ? `pages ${a} to ${b}` : `page ${a}`
function summaryPart(r: ReportDetail, mainDocument: string): Part | null {
  const s = r.summary, lines = s?.generated?.sentences || []
  if (!s || !lines.length) return null
  const own = s.own_summary && url(s.own_summary.url) ? `<p class="rr-record-text rr-own-summary">${esc(s.own_summary.label)}: ${link(s.own_summary.url,
    [s.own_summary.heading, pages(s.own_summary.first_page, s.own_summary.last_page)].filter(Boolean).join(', '))}</p>` : ''
  const generated = `<div class="rr-generated"><p class="ui-section-note rr-generated-label">${esc(s.generated.label)}</p><ul class="rr-summary-lines" role="list">` +
    lines.map(x => `<li><p class="rr-record-text">${esc(x.text)}</p><p class="rr-cite-line">${x.cites.map(c => citeLink(c, mainDocument)).filter(Boolean).join(' · ')}</p></li>`).join('') + `</ul></div>`
  const quotes = s.quotes.items.length ? `<h3 class="ui-subsection-title">${esc(s.quotes.label)}</h3><ol class="rr-items" role="list">` +
    s.quotes.items.map(q => `<li class="rr-item"><div class="rr-item-head"><span class="ui-status rr-kind">${esc(human(q.kind))}</span></div><blockquote class="rr-quote">${prose(q.quote, 'rr-item-text')}</blockquote>${citeLine(q.cite, mainDocument)}</li>`).join('') + `</ol>` : ''
  return { id: 'summary', title: 'Summary', html: own + generated + quotes }
}

// ---- documents (commission reports, responses, transcripts; integrity documents)
function documentRow(d: RecordRow, mainDocument: string, extra = '', flag = true): string {
  const page = url(d.page_url) || url(d.url)
  const title = d.title || human(d.key || d.kind || d.role) || 'Document'
  const kind = human(d.document_kind || d.kind || d.role)
  const files = records(d.files)
  // One file: the title opens it, and pages, type and size follow, as on transcript rows. The record's own page
  // (often a parliament's tabled-document listing) closes the meta line when it is not the file itself.
  const lone = files.length === 1 ? object(files[0]) : null, file = lone ? url(lone.url) : ''
  const href = file || page
  const pages = d.pages ?? lone?.pages
  const fileMeta = lone ? `${file && isPdf(file) ? 'PDF' : 'File'}${bytes(lone.bytes) ? `, ${esc(bytes(lone.bytes))}` : ''}` : ''
  const pageLink = file && page && page !== file ? link(page, `Page on ${host(page)}`).replace('</a>', `<span class="visually-hidden">: ${esc(title)}</span></a>`) : ''
  const meta = [kind && kind !== title ? esc(kind) : '', d.date ? dated(d.date_basis, d.date) : '', finite(pages) ? plural(pages, 'page') : '', fileMeta, pageLink].filter(Boolean).join(' · ')
  const detail = kv([
    ['Recommendations', d.recommendations != null ? esc(d.recommendations) : ''],
    ['Recommendations status', d.recommendations_status ? esc(human(d.recommendations_status)) : ''],
    ['Status', d.status && d.status !== 'ready' ? esc(human(d.status)) : ''],
    ['Role', d.role && !d.kind ? esc(human(d.role)) : ''],
    ['Date as printed', d.date_quote ? esc(d.date_quote) + ' ' + citeLink(d.date_cite, mainDocument) : ''],
    ['How OPAX got it', d.acquisition ? esc(d.acquisition) : ''],
    ['Rights', d.rights ? esc(typeof d.rights === 'object' ? Object.values(object(d.rights)).join(' ') : d.rights) : ''],
    ['Note', d.note ? esc(d.note) : ''],
  ])
  return `<li class="rr-doc"><h3 class="rr-doc-title">${href ? link(href, title) : esc(title)}</h3>` +
    (flag && d.kind === 'hearing_transcript' ? text('Hearing transcript: evidence, not findings.', 'rr-doc-flag') : '') +
    (meta ? `<p class="rr-doc-meta">${meta}</p>` : '') +
    (files.length > 1 ? `<ul class="rr-doc-files" role="list">${files.map((f, i) => `<li>${link(f.url, `${isPdf(String(f.url)) ? 'PDF' : 'File'} ${i + 1} of ${files.length}`)}${[finite(f.pages) ? plural(f.pages, 'page') : '', bytes(f.bytes)].filter(Boolean).map(x => ` · ${esc(x)}`).join('')}</li>`).join('')}</ul>` : '') +
    (d.text ? text(d.text) : '') + (d.cite && ![href, page].includes(url(object(d.cite).url)) ? citeLine(d.cite, mainDocument) : '') +
    extra + (detail ? `<details class="ui-disclosure rr-doc-detail"><summary>Document details</summary><div class="ui-disclosure-body">${detail}</div></details>` : '') + `</li>`
}
const documentList = (docs: RecordRow[], mainDocument: string) => `<ul class="rr-docs" role="list">${docs.map(d => documentRow(d, mainDocument)).join('')}</ul>`

// ---- hearing transcripts: evidence, not findings. One line per transcript, grouped by month, newest first.
export const TRANSCRIPTS_TITLE = 'Hearing transcripts: evidence, not findings'
/** A report's hearing transcripts, newest first (ties by key), each with `date` set to its hearing date. The page
 * and /api/report/<slug>/transcripts read the same list, so an offset names the same row in both. */
export function reportTranscripts(r: Pick<ReportDetail, 'report_type' | 'record'>): RecordRow[] {
  const c = r.record
  const raw = r.report_type === 'royal_commission' ? records(c.transcripts) : r.report_type === 'integrity_report' ? records(object(c.transcripts).items) : []
  return raw.map(t => ({ ...t, key: t.key ?? t.id, kind: 'hearing_transcript', date: t.date ?? t.hearing_date ?? null }))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(a.key).localeCompare(String(b.key)))
}
const ORDER_NOTE = /non-publication|suppression|publication order/i
/** One transcript in the app's envelope: the publisher's PDF as `url`, the hearing date, notes (including any
 * publication restrictions the publisher or commission records) and order links. */
export function transcriptItem(r: Pick<ReportDetail, 'record'>, t: RecordRow): RecordRow {
  const file = object(records(t.files)[0])
  const pdf = url(t.url) || url(file.url) || url(t.page_url)
  const own = Array.isArray(t.notes) ? t.notes.map(String) : []
  const orderNotes = (Array.isArray(r.record.notes) ? r.record.notes : []).map(String).filter(n => t.files && ORDER_NOTE.test(n))
  const restricted = object(t.full_text).quote_policy === 'no_quotes' ? ['The publisher\'s transcript records a non-publication or suppression order, a direction not to publish, or a pseudonymous witness. OPAX does not quote it.'] : []
  return { id: String(t.key ?? t.id), hearing_date: String(t.date), ...(t.title ? { title: String(t.title) } : {}), ...(t.case ? { case: String(t.case) } : {}),
    ...(finite(t.pages) ? { pages: t.pages } : finite(file.pages) ? { pages: file.pages } : {}), url: pdf,
    ...(url(t.page_url) && url(t.page_url) !== pdf ? { page_url: t.page_url } : {}),
    publisher_redacted: typeof t.publisher_redacted === 'boolean' ? t.publisher_redacted : /redact/i.test(`${file.url ?? ''} ${t.title ?? ''}`),
    notes: [...own, ...orderNotes, ...restricted], orders: (Array.isArray(t.orders) ? t.orders : []).map(String).filter(o => url(o)) }
}
/** The transcripts envelope shared by the top-level `transcripts` field of GET /api/report/<slug> (first page) and
 * GET /api/report/<slug>/transcripts?offset=&limit=: newest first, ties by id, so an offset names the same row on
 * every call. */
export function reportTranscriptEnvelope(r: Pick<ReportDetail, 'report_type' | 'record'>, offset = 0, limit = 20) {
  const all = reportTranscripts(r), dates = all.map(t => String(t.date)).sort()
  const items = all.slice(offset, offset + limit).map(t => transcriptItem(r, t))
  return { label: 'Hearing transcript: evidence, not findings', count: all.length, first_date: dates[0] ?? null, last_date: dates.at(-1) ?? null,
    offset, items, next_offset: offset + items.length < all.length ? offset + items.length : null }
}
/** GET /api/report/<slug>/transcripts?offset=&limit=, limit 1 to 100 (default 20). */
export function reportTranscriptPage(r: ReportDetail, params: URLSearchParams) {
  const num = (k: string, fallback: number) => { const v = params.get(k); return v === null || v === '' ? fallback : /^\d{1,5}$/.test(v) ? Number(v) : NaN }
  const offset = num('offset', 0), limit = num('limit', 20)
  if (!Number.isFinite(offset) || !Number.isFinite(limit) || limit < 1 || limit > 100) return { error: 'offset must be a whole number and limit 1 to 100' }
  return reportTranscriptEnvelope(r, offset, limit)
}
/** GET /api/report/<slug>: the schema 1 record plus, when it has hearing transcripts, the first page of them. */
export function reportApiBody(r: ReportDetail) {
  const env = reportTranscriptEnvelope(r)
  return env.count ? { ...r, transcripts: env } : r
}
/** What every transcript in the list holds alike (the case, its hearings page, how OPAX got them, the rights), said
 * once above the list instead of in each row. */
type Shared = { case?: string; page?: string; kind?: string; acquisition?: string; rights?: string }
function transcriptRow(t: RecordRow, shared: Shared): string {
  const file = object(records(t.files)[0])
  // Integrity transcripts hold the PDF as `url`; commission transcripts hold it in `files` and their day page as `page_url`.
  const pdf = url(file.url) || url(t.url), page = url(t.page_url)
  let title = String(t.title || 'Hearing transcript')
  if (shared.case && title.toLowerCase().startsWith(shared.case.toLowerCase()) && title.length > shared.case.length) {
    const rest = title.slice(shared.case.length).trim()
    title = rest[0].toUpperCase() + rest.slice(1)
  }
  const pages = t.pages ?? file.pages, size = t.bytes ?? file.bytes
  const kind = shared.kind ? '' : human(t.document_kind || t.document_type)
  const when = t.date && !title.includes(day(t.date)) ? time(t.date) : ''
  // The day's own hearing page, where the list has one per day, ends the meta line; its hidden words name the day.
  const dayPage = page && page !== pdf && page !== shared.page ? link(page, 'Hearing page').replace('</a>', `<span class="visually-hidden">: ${esc(title)}</span></a>`) : ''
  const meta = [kind && !same(kind, 'hearing transcript') ? esc(kind) : '', when, finite(pages) ? esc(plural(pages, 'page')) : '',
    pdf && isPdf(pdf) ? `PDF${bytes(size) ? `, ${esc(bytes(size))}` : ''}` : esc(bytes(size)), dayPage].filter(Boolean).join(' · ')
  const notes = [t.publisher_redacted ? 'The publisher\'s copy is redacted.' : '', ...(Array.isArray(t.orders) ? t.orders : []).filter(o => !url(o)).map(String), ...(Array.isArray(t.notes) ? t.notes : []).map(String),
    t.note ? String(t.note) : '', t.transcript_pages ? `Transcript pages ${t.transcript_pages}.` : '', t.session_time ? `Session: ${t.session_time}.` : ''].filter(Boolean)
  const orders = (Array.isArray(t.orders) ? t.orders : []).filter(o => url(o)).map((o, i, all) => link(o, `Publication order${all.length > 1 ? ` ${i + 1}` : ''} on ${host(String(o))}`))
  const detail = kv([['How OPAX got it', !shared.acquisition && t.acquisition ? esc(t.acquisition) : ''],
    ['Rights', !shared.rights && t.rights ? esc(typeof t.rights === 'object' ? Object.values(object(t.rights)).join(' ') : t.rights) : '']])
  return `<li class="rr-doc"><h3 class="rr-doc-title">${link(pdf || page, title) || esc(title)}</h3>` +
    (meta ? `<p class="rr-doc-meta">${meta}</p>` : '') +
    (notes.length ? `<p class="rr-doc-note">${esc(notes.join(' '))}</p>` : '') +
    (orders.length ? `<p class="rr-doc-meta">${orders.join(' · ')}</p>` : '') +
    (detail ? `<details class="ui-disclosure rr-doc-detail"><summary>Document details</summary><div class="ui-disclosure-body">${detail}</div></details>` : '') + `</li>`
}
function transcriptsPart(r: ReportDetail): Part | null {
  const items = reportTranscripts(r)
  if (!items.length) return null
  const alike = (k: string) => { const v = items[0][k]; return v != null && v !== '' && typeof v !== 'object' && items.every(t => t[k] === v) ? String(v) : undefined }
  const shared: Shared = { case: alike('case'), page: url(alike('page_url')) || undefined, kind: alike('document_kind') || alike('document_type'), acquisition: alike('acquisition'), rights: alike('rights') }
  // Within a month, a day's parts read in order ("part 1 of 6" before "part 2 of 6"); the API's order is unchanged.
  const natural = (a: RecordRow, b: RecordRow) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(a.title ?? '').localeCompare(String(b.title ?? ''), 'en', { numeric: true })
  const months = new Map<string, RecordRow[]>()
  for (const t of items) {
    const m = /^(\d{4})-(\d{2})/.exec(String(t.date ?? ''))
    const label = m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : 'Date not stated'
    months.set(label, [...(months.get(label) ?? []), t])
  }
  const folds = [...months].map(([label, ts], i) => `<details class="ui-disclosure rr-month"${i === 0 ? ' open' : ''}><summary><span>${esc(label)}<span class="rr-summary-meta">${esc(plural(ts.length, 'transcript'))}</span></span></summary>` +
    `<div class="ui-disclosure-body"><ul class="rr-docs rr-transcripts" role="list">${[...ts].sort(natural).map(t => transcriptRow(t, shared)).join('')}</ul></div></details>`).join('')
  const copies = kv([['Kind', esc(human(shared.kind))], ['How OPAX got them', esc(shared.acquisition)], ['Rights', esc(shared.rights)]])
  const common = kv([['Case', esc(shared.case)], ['Hearings page', shared.page ? link(shared.page, `Hearings page on ${host(shared.page)}`) : '']]) +
    (copies ? `<details class="ui-disclosure rr-doc-detail rr-copies"><summary>About these copies</summary><div class="ui-disclosure-body">${copies}</div></details>` : '')
  return { id: 'transcripts', title: TRANSCRIPTS_TITLE, count: items.length,
    html: `<p class="ui-section-note">What a witness or counsel says at a hearing is evidence or submission, not a finding. Transcripts are the publisher's copies, including its redactions, listed newest first by month.</p>${common}${folds}` }
}

// ---- annual reports (Transparency Portal body-years)
const TABLE_KIND: Record<string, string> = { kmp: 'Key management personnel', senior_executive_band: 'Senior executives', highly_paid_band: 'Other highly paid staff', consultancy: 'Consultancy contracts', non_consultancy: 'Non-consultancy contracts' }
const LICENCE: Record<string, string> = { 'cc-by-4.0': 'CC BY 4.0', 'cc-by-3.0-au': 'CC BY 3.0 AU' }
const PAY = ['base_salary', 'bonuses', 'other_benefits', 'superannuation', 'long_service_leave', 'other_long_term', 'termination', 'total']
const CHECKS: Record<string, string> = { components_do_not_sum_to_total: 'As published, the parts do not add up to the total.' }
function cell(row: RecordRow, key: string, numeric = true): string {
  const shown = object(row.as_published)[key]
  const v = row[key]
  if (shown !== undefined && shown !== null) return `<td${numeric ? ' class="ui-num"' : ''}>${esc(shown)}</td>`
  if (v === null || v === undefined || v === '') return `<td class="ui-num rr-blank">Not stated</td>`
  return `<td${numeric ? ' class="ui-num"' : ''}>${finite(v) ? figure(v) : esc(v)}</td>`
}
function annualTable(t: RecordRow): string {
  const rows = records(t.rows)
  if (!rows.length) return text('This table is empty as published.')
  const kinds = new Set(rows.map(x => x.kind))
  const rowRef = rows.some(x => x.source_row != null)
  const ref = (x: RecordRow) => rowRef ? `<td class="ui-num">${x.source_row == null ? '' : esc(x.source_row)}${x.source_column != null ? `, col ${esc(x.source_column)}` : ''}</td>` : ''
  const refHead = rowRef ? '<th scope="col" class="ui-num">Data file row</th>' : ''
  let head = '', body = ''
  if (kinds.has('kmp') || kinds.has('kmp_total') || kinds.has('kmp_other')) {
    head = `<tr><th scope="col">Name</th><th scope="col">Position</th>${PAY.map(k => `<th scope="col" class="ui-num">${human(k)}</th>`).join('')}${refHead}</tr>`
    body = rows.map(x => {
      const checks = Array.isArray(x.checks) ? x.checks.map(k => CHECKS[k] || human(k)) : []
      const name = esc(object(x.as_published).name ?? x.name) + (x.name_as_published && x.name_as_published !== x.name ? `<span class="rr-cell-note">As published: ${esc(x.name_as_published)}</span>` : '')
      return `<tr${x.kind !== 'kmp' ? ' class="rr-row-total"' : ''}><th scope="row">${name}${checks.map(c => `<span class="rr-cell-note">${esc(c)}</span>`).join('')}</th>${cell(x, 'position', false)}${PAY.map(k => cell(x, k)).join('')}${ref(x)}</tr>`
    }).join('')
  } else if (kinds.has('senior_executive_band') || kinds.has('highly_paid_band')) {
    head = `<tr><th scope="col">Pay band</th><th scope="col" class="ui-num">People</th>${PAY.map(k => `<th scope="col" class="ui-num">Average ${human(k).toLowerCase()}</th>`).join('')}${refHead}</tr>`
    body = rows.map(x => `<tr><th scope="row">${esc(x.band)}</th>${cell(x, 'count')}${PAY.map(k => cell({ ...object(x.averages), as_published: object(object(x.as_published).averages) }, k)).join('')}${ref(x)}</tr>`).join('')
  } else {
    const amount = rows.some(x => x.expenditure_thousands != null) ? 'expenditure_thousands' : 'expenditure_dollars'
    head = `<tr><th scope="col">Organisation</th><th scope="col" class="ui-num">Expenditure${t.unit ? `<span class="rr-cell-note">${esc(t.unit)}</span>` : ''}</th>${refHead}</tr>`
    body = rows.map(x => `<tr><th scope="row">${esc(x.organisation)}${x.organisation_as_published && x.organisation_as_published !== x.organisation ? `<span class="rr-cell-note">As published: ${esc(x.organisation_as_published)}</span>` : ''}${x.abn ? `<span class="rr-cell-note">ABN ${esc(x.abn)}</span>` : ''}</th>${x.expenditure_as_published != null ? `<td class="ui-num">${esc(x.expenditure_as_published)}</td>` : cell(x, amount)}${ref(x)}</tr>`).join('')
  }
  return `<div class="rr-table-scroll" role="region" aria-label="${esc(t.title)}" tabindex="0"><table class="ui-table rr-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`
}
function annual(r: ReportDetail, parts: Part[]): Stat[] {
  const h = object(r.headline), stats: Stat[] = []
  // The record's own caveat, verbatim, beside the figures it qualifies (the record keeps them all in its caveats).
  const caveat = (re: RegExp) => { const x = r.caveats.find(c => re.test(c)); return x ? `<p class="rr-figure-note">${esc(x)}</p>` : '' }
  // Each link names its table, so a list of links still says where each one goes.
  const tableLink = (v: RecordRow, what: string) => v.codename ? `<p class="rr-cite-line">${link(`https://previewapi.transparency.gov.au/delivery/items?system.codename=${encodeURIComponent(String(v.codename))}&depth=1`, `${what} table on the Transparency Portal (JSON)`, 'rr-cite')}</p>` : ''
  const thousands = (n: unknown) => finite(n) ? `${dollars(n * 1000)}` : ''
  const blocks: string[] = []
  const inc = object(h.income_statement)
  if (Object.keys(inc).length) {
    const unit = String(inc.unit || '')
    const k = (n: unknown) => !finite(n) ? '' : unit === "$'000" ? `${esc(thousands(n))} <span class="rr-as-published">(${figure(n)} in $'000)</span>` : `${figure(n)} <span class="rr-as-published">(${esc(unit || 'unit not stated')})</span>`
    if (finite(inc.total_expenses)) stats.push({ label: 'Total expenses', value: esc(unit === "$'000" ? thousands(inc.total_expenses) : figure(inc.total_expenses)) })
    blocks.push(`<div class="rr-figure-group"><h3 class="ui-subsection-title">Income statement extract</h3>${kv([
      ['Total expenses', k(inc.total_expenses)], ['Employee benefits', k(inc.employee_benefits)], ['Suppliers', k(inc.suppliers)],
      ['Revenue from government', k(inc.revenue_from_government)], ['Own-source income', k(inc.own_source_income)]])}` +
      (inc.unit_basis ? `<p class="rr-figure-note">Unit: ${esc(inc.unit_basis)}.</p>` : '') + `${tableLink(inc, 'Income statement')}</div>`)
  }
  const staff = [['Ongoing staff', object(h.ongoing_staff)], ['Non-ongoing staff', object(h.non_ongoing_staff)]] as const
  if (staff.some(([, v]) => finite(v.headcount))) {
    for (const [label, v] of staff) if (finite(v.headcount)) stats.push({ label, value: figure(v.headcount) })
    blocks.push(`<div class="rr-figure-group"><h3 class="ui-subsection-title">Staff</h3>${kv(staff.filter(([, v]) => finite(v.headcount)).map(([label, v]) => [label, `${figure(v.headcount as number)} people${tableLink(v, label)}`]))}${caveat(/^Staff numbers are headcounts/)}</div>`)
  }
  for (const [key, label] of [['consultancy', 'Consultancy contracts'], ['non_consultancy', 'Non-consultancy contracts']] as const) {
    const v = object(h[key])
    if (!Object.keys(v).length) continue
    if (finite(v.expenditure_thousands)) stats.push({ label: `${label}`, value: esc(thousands(v.expenditure_thousands)), note: finite(v.contracts) ? esc(plural(v.contracts, 'contract')) : '' })
    blocks.push(`<div class="rr-figure-group"><h3 class="ui-subsection-title">${label}</h3>${kv([
      ['Expenditure', finite(v.expenditure_thousands) ? `${esc(thousands(v.expenditure_thousands))} <span class="rr-as-published">(${figure(v.expenditure_thousands)} in $'000)</span>` : ''],
      ['Contracts', finite(v.contracts) ? figure(v.contracts) : ''], ['New contracts', finite(v.new_contracts) ? figure(v.new_contracts) : ''], ['Ongoing contracts', finite(v.ongoing_contracts) ? figure(v.ongoing_contracts) : '']])}${tableLink(v, label)}</div>`)
  }
  if (blocks.length) parts.push({ id: 'figures', title: 'Published headline figures', html: blocks.join('') })
  const tables = r.tables
  parts.push({ id: 'tables', title: 'Published disclosure tables', count: tables.length || undefined, html: tables.length ? tables.map(t => {
    const rows = records(t.rows)
    const meta = [plural(rows.length, 'row'), t.unit ? `Unit: ${t.unit}` : ''].filter(Boolean).join(' · ')
    const kinds = new Set(rows.map(x => String(x.kind)))
    const note = kinds.has('kmp') ? caveat(/^Key management personnel remuneration is reported on an accrual basis/)
      : kinds.has('senior_executive_band') || kinds.has('highly_paid_band') ? caveat(/^Senior executive and other highly paid staff rows are bands/) : ''
    return `<details class="ui-disclosure rr-table-block"${rows.length <= 8 ? ' open' : ''}><summary><span>${esc(t.title)}<span class="rr-summary-meta">${esc(meta)}</span></span></summary><div class="ui-disclosure-body">` +
      `<p class="rr-cite-line rr-table-source">${t.source_file ? link(t.source_url, `Data file: ${t.source_file}`, 'rr-cite')
        : link(t.source_url, 'Source table on the Transparency Portal', 'rr-cite').replace('</a>', `<span class="visually-hidden">: ${esc(t.title)}</span></a>`)}` +
      `${t.licence ? `<span class="rr-licence"> · Licence ${esc(LICENCE[String(t.licence)] || t.licence)}</span>` : ''}</p>` +
      kv([['Entity as published', t.entity_as_published && t.entity_as_published !== r.body ? esc(t.entity_as_published) : ''], ['Data file page', t.source_page ? link(t.source_page, host(String(t.source_page))) : '']]) +
      note + annualTable(t) + `</div></details>`
  }).join('') : text('No disclosure tables are loaded for this body and year.') })
  return stats
}

// ---- agency reports (state and territory documents): figures quoted with their page
// OPAX's own record states, said in words (these are OPAX's labels, not the report's).
// Edition words as the agency report tool (src/tools/agency-reports.ts) says them; this
// module stays free of runtime imports so the tests can load it directly.
const EDITION: Record<string, string> = { current: 'current edition', current_corrected: 'current edition, corrected copy', prior_edition: 'earlier edition (latest verified)', statutory_companion: 'statutory companion document', statutory_return: 'statutory return' }
const READING: Record<string, string> = { read: 'Read by OPAX', not_read: 'Not read by OPAX', not_read_no_text: 'Not read: the file is a scan without a text layer' }
const FAMILIES: [string, string, string[]][] = [
  ['finances', 'Finances', ['total_income', 'total_expenses', 'employee_expenses', 'net_result']],
  ['staff', 'Staff', ['staff_headcount', 'staff_fte']],
  ['executives', 'Executives and remuneration', ['head_remuneration', 'named_remuneration', 'executive_count', 'executive_band', 'executive_remuneration_total', 'executive_average_remuneration']],
  ['consultancies', 'Consultancies', ['consultancy_total', 'consultancy']],
  ['activity', 'Complaints and investigations', ['matters_received', 'investigations_commenced', 'investigations_finalised', 'referrals_to_prosecution', 'recommendations_made', 'public_hearings']],
]
const UNIT: Record<string, (v: string) => string> = {
  millions_of_dollars: v => `${/^\$/.test(v) ? v : '$' + v} million`, thousands_of_dollars: v => `${/^\$/.test(v) ? v : '$' + v} thousand`,
  dollars: v => /^\$/.test(v) || /\$/.test(v) ? v : '$' + v, percent: v => /%$/.test(v) ? v : v + '%', fte: v => `${v} FTE`, people: v => `${v} people`, days: v => `${v} days`, count: v => v,
}
const factValue = (f: RecordRow) => { const v = String(f.value_as_published ?? (finite(f.value) ? figure(f.value) : '')); return (UNIT[String(f.unit)] || (x => `${x} ${human(f.unit).toLowerCase()}`))(v) }
function factRow(f: RecordRow, doc: string): string {
  const title = f.counterparty || f.name || f.label
  const meta = [f.position, f.purpose, f.column && f.column !== f.period ? `Column: ${f.column}` : '', f.period, f.band && f.band !== f.label ? `Band: ${f.band}` : ''].filter(Boolean).map(esc)
  return `<li class="rr-fact"><div class="rr-fact-head"><p class="rr-fact-label">${esc(title)}</p><p class="rr-fact-value">${esc(factValue(f))}</p></div>` +
    (title !== f.label ? `<p class="rr-fact-meta">${esc(f.label)}</p>` : '') + (meta.length ? `<p class="rr-fact-meta">${meta.join(' · ')}</p>` : '') +
    (f.note ? text(f.note, 'rr-fact-meta') : '') +
    `<p class="rr-fact-quote"><span class="rr-quote-label">Printed as</span> <q>${esc(f.quote)}</q></p>${citeLine({ url: f.source_url, document: doc, page: f.page }, doc)}</li>`
}
function agency(r: ReportDetail, parts: Part[], mainDocument: string): Stat[] {
  const facts = r.facts, used = new Set<RecordRow>(), stats: Stat[] = []
  for (const metric of ['total_expenses', 'total_income', 'staff_headcount', 'staff_fte']) {
    const f = facts.find(x => x.metric === metric)
    if (!f) continue
    const scale = f.unit === 'millions_of_dollars' ? 1e6 : f.unit === 'thousands_of_dollars' ? 1e3 : 0
    const readable = scale && finite(f.value) ? dollars(f.value * scale) : factValue(f)
    stats.push({ label: String(f.label), value: esc(readable), note: (readable !== factValue(f) ? `Printed as ${esc(factValue(f))} · ` : '') + citeLink({ url: f.source_url, document: mainDocument, page: f.page }, mainDocument) })
  }
  for (const [id, title, metrics] of FAMILIES) {
    const rows = facts.filter(f => metrics.includes(String(f.metric)))
    rows.forEach(f => used.add(f))
    if (rows.length) parts.push({ id, title, count: rows.length, html: `<ul class="rr-facts" role="list">${rows.map(f => factRow(f, mainDocument)).join('')}</ul>` })
  }
  const rest = facts.filter(f => !used.has(f))
  if (rest.length) parts.push({ id: 'other-figures', title: 'Other figures', count: rest.length, html: `<ul class="rr-facts" role="list">${rest.map(f => factRow(f, mainDocument)).join('')}</ul>` })
  // Same words as the agency report tool uses for an unread file.
  const unread = r.record.status === 'not_read_no_text' ? 'The file is a scan without a text layer, so OPAX has not read figures from it. ' : ''
  if (!facts.length) parts.push({ id: 'figures', title: 'Figures as published', html: text(`${unread}No figures are reproduced in this record. This does not establish that the report contains none.`) })
  const c = r.record
  const about = kv([['Edition', esc(human(EDITION[String(c.edition)] || c.edition))], ['Edition note', esc(c.edition_note)], ['Reading status', esc(READING[String(c.status)] || human(c.status))], ['Pages', finite(c.pages) ? figure(c.pages) : ''],
    ['Figures not found in the report', Array.isArray(c.not_found) && c.not_found.length ? esc(c.not_found.map(human).join('; ')) : ''],
    ['Rights', esc(c.rights_note)], ['Attribution', esc(c.attribution)], ['File note', esc(c.file_note)]])
  if (about) parts.push({ id: 'document', title: 'About the document', html: about })
  return stats
}

// ---- the page
export function renderReport(r: ReportDetail) {
  const c = r.record, type = r.report_type, parts: Part[] = []
  const mainDocument = r.citation?.document || ''
  const jurisdiction = String(r.publisher.jurisdiction_name || JURISDICTION[r.jurisdiction] || r.jurisdiction || '')
  let stats: Stat[] = [], main: SourceDoc | null = null, court: RecordRow[] = []
  const citeHref = url(r.citation?.url)
  const more: { href: unknown; label: string }[] = []

  // The one meta line: what kind of record, who published it, when.
  const kindLabel = type === 'royal_commission' ? human(c.inquiry_type || 'royal_commission')
    : type === 'integrity_report' ? String(c.type_as_published || human(c.report_type) || 'Integrity report')
    : type === 'annual_report' ? `Annual report${r.year ? ' ' + r.year : ''}`
    : `${human(c.kind || 'report')}${r.year ? ' ' + r.year : ''}`
  const who = type === 'integrity_report' && r.publisher.short && r.publisher.short !== r.body ? `${r.body} (${r.publisher.short})` : r.body
  // A title that already names the body and kind (most annual and agency reports) is not
  // repeated: the line says what the title does not.
  const titled = (type === 'annual_report' || type === 'agency_report') && !!r.body && r.title.toLowerCase().includes(String(r.body).toLowerCase())
  const named = titled || same(r.body, r.title)
  const metaBits = [titled && r.publisher.type_as_published ? esc(r.publisher.type_as_published) : esc(kindLabel), r.body && !named ? esc(who) : '', esc(jurisdiction),
    r.date ? dated(r.date_basis, r.date) : 'No report date recorded'].filter(Boolean)

  if (type === 'royal_commission') {
    const reports = records(c.reports), final = reports.find(d => d.kind === 'final_report') || reports[0]
    const file = records(final?.files).find(f => f.url === citeHref) || records(final?.files)[0]
    if (citeHref) main = { href: citeHref, label: mainDocument || 'Report', pages: file?.pages, size: file?.bytes }
    for (const d of reports) if (url(d.page_url) && d.page_url !== citeHref) more.push({ href: d.page_url, label: String(d.title || human(d.kind)) })
    if (c.site) more.push({ href: c.site, label: `Inquiry website (${host(String(c.site))})` })
    const recs = records(c.recommendations)
    if (recs.length) stats.push({ label: c.recommendations_status === 'partial' ? 'Recommendations reproduced' : 'Recommendations', value: figure(recs.length) })
    // The meta line already carries the report's date; the glance adds what it does not.
    if (c.final_report_date && c.final_report_date !== r.date) stats.push({ label: 'Final report', value: time(c.final_report_date) })
    else if (!c.final_report_date && c.interim_report_date && c.interim_report_date !== r.date) stats.push({ label: 'Interim report', value: time(c.interim_report_date) })
    const est = object(c.established)
    if (est.date) stats.push({ label: 'Established', value: time(est.date) })
    if (finite(file?.pages)) stats.push({ label: 'Report length', value: esc(plural(file!.pages as number, 'page')) })
    court = records(c.court_context)
    // With no report held, there is no list to show: say so once, with the inquiry, not as an empty section.
    const noReport = c.recommendations_status === 'no_report' && !recs.length
    if (!noReport) parts.push(items('recommendations', r, mainDocument))
    const commission = kv([
      ['Report', noReport ? 'No report is held for this inquiry, so no recommendations are reproduced.' : ''],
      ['Established', est.quote ? `${esc(est.quote)} ${citeLink(est.cite, mainDocument)}` : est.date ? time(est.date) : ''],
      ...records(c.commissioners).map(p => [human(p.role) || 'Commissioner', `${esc(p.quote || p.name)} ${citeLink(p.cite, mainDocument)}`] as [string, string]),
      ['Interim report', c.interim_report_date ? time(c.interim_report_date) : ''],
      ['Final report', c.final_report_date ? time(c.final_report_date) : ''],
      ['Status as published', esc(c.status_as_published)],
    ])
    if (commission) parts.push({ id: 'commission', title: 'About the inquiry', html: commission })
    const docs = [...reports, ...records(c.responses)]
    if (docs.length) parts.push({ id: 'documents', title: 'Official documents', count: docs.length, html: documentList(docs, mainDocument) })
    const heard = transcriptsPart(r)
    if (heard) parts.push(heard)
    const status = object(c.status_source)
    if (status.url) parts.push({ id: 'status-source', title: 'Where the status comes from', html: `<p class="rr-record-text">${link(status.url, status.name || 'Government status pages')}${finite(status.pages) ? ` (${esc(plural(status.pages, 'page'))})` : ''}</p>` })
  } else if (type === 'integrity_report') {
    const docs = records(c.documents)
    const doc = docs.find(d => d.url === citeHref) || docs.find(d => d.role === 'report' || d.role === 'tabled_paper')
    if (citeHref) main = { href: citeHref, label: mainDocument || 'Report', pages: doc?.pages, size: doc?.bytes }
    more.push({ href: c.page_url, label: isPdf(String(c.page_url)) ? 'Report PDF' : `Report page on ${host(String(c.page_url))}` }, { href: c.pdf_url, label: 'Report PDF' })
    const findings = records(c.findings), recs = records(c.recommendations), responses = records(c.responses)
    if (findings.length) stats.push({ label: findingsTitle(findings), value: figure(findings.length) })
    if (recs.length) stats.push({ label: 'Recommendations', value: figure(recs.length) })
    if (responses.length) stats.push({ label: 'Published responses', value: figure(responses.length) })
    if (finite(doc?.pages)) stats.push({ label: 'Report length', value: esc(plural(doc!.pages as number, 'page')) })
    const unread = (k: string) => !records(c[k]).length && c[k + '_status'] !== 'stated_none'
    if (unread('findings') && unread('recommendations')) {
      // Nothing extracted: one plain statement, not two empty sections.
      const allegation = r.caveats.find(x => /^Allegations are not findings/.test(x))
      parts.push({ id: 'findings', title: 'Findings and recommendations', html: (allegation ? `<p class="ui-section-note rr-caveat-inline">${esc(allegation)}</p>` : '') +
        text('No findings or recommendations are reproduced in this record. This does not establish that the report contains none.') +
        (citeHref ? `<p class="rr-record-text">${link(citeHref, `Read the report${finite(doc?.pages) ? ` (${isPdf(citeHref) ? 'PDF, ' : ''}${plural(doc!.pages as number, 'page')})` : ''}`)}</p>` : '') })
    } else parts.push(items('findings', r, mainDocument), items('recommendations', r, mainDocument))
    const responseNote = c.responses_status === 'none_found' ? 'No published response was found.' : c.responses_status === 'not_checked' ? 'Responses to this report have not been checked.' : ''
    if (responses.length || responseNote) parts.push({ id: 'responses', title: 'Published responses', count: responses.length || undefined, html: responses.length ? `<ul class="rr-docs" role="list">${responses.map(x => documentRow(x, mainDocument, kv([['Publisher', esc(x.publisher)], ['Tabled in', esc(x.tabled_in)], ['Recommendation', esc(x.recommendation)], ['Status as published', esc(x.status_as_published)]]))).join('')}</ul>` : text(responseNote) })
    // A lone document that is the source card's own, with nothing more to say, is not listed twice.
    const lone = docs.length === 1 && docs[0].url === citeHref && !docs[0].acquisition && !docs[0].note && !docs[0].rights
    if (docs.length && !lone) parts.push({ id: 'documents', title: 'Official documents', count: docs.length, html: documentList(docs, mainDocument) })
    const heard = transcriptsPart(r)
    if (heard) parts.push(heard)
    const about = kv([['Period', reportPeriod(c.period)], ['How OPAX got it', esc(c.acquisition)], ['Rights', esc(typeof c.rights === 'object' ? object(c.rights).statement : c.rights)]])
    if (about) parts.push({ id: 'about', title: 'About the report', html: about })
  } else if (type === 'annual_report') {
    // The Portal's delivery API is the citable source the record holds; say plainly that it is data.
    if (citeHref) main = { href: citeHref, label: 'Transparency Portal data for this report (JSON)' }
    more.push({ href: c.url, label: 'Annual report' })
    stats = annual(r, parts)
  } else {
    if (citeHref) main = { href: url(c.source_url) || citeHref, label: mainDocument || 'Report', pages: c.pages, size: c.bytes }
    more.push({ href: c.catalogue_url, label: `Tabled document record on ${host(String(c.catalogue_url))}` }, { href: c.corrigendum_url, label: 'Corrigendum' }, { href: c.reuse_terms_url, label: 'Reuse terms' })
    stats = agency(r, parts, mainDocument)
  }

  const summary = summaryPart(r, mainDocument)
  if (summary) parts.unshift(summary)
  const recordNotes = Array.isArray(c.notes) && c.notes.length ? notes(c.notes) : ''
  if (recordNotes) parts.push({ id: 'notes', title: 'Notes on this record', html: recordNotes })
  const gaps = [...(Array.isArray(c.gaps) ? c.gaps : []), ...(Array.isArray(r.publisher.gaps) ? r.publisher.gaps : [])]
  const refs = records(c.reference_pages)
  if (gaps.length || refs.length) parts.push({ id: 'coverage', title: 'Coverage', html: (Array.isArray(c.gaps) && c.gaps.length ? `<h3 class="ui-subsection-title">This record</h3>${notes(c.gaps)}` : '') +
    (Array.isArray(r.publisher.gaps) && r.publisher.gaps.length ? `<h3 class="ui-subsection-title">This publisher</h3>${notes(r.publisher.gaps)}` : '') +
    (refs.length ? `<h3 class="ui-subsection-title">Official reference pages</h3><ul class="rr-notes" role="list">${refs.map(x => `<li>${link(x.url, x.title)}</li>`).join('')}</ul>` : '') })

  const head = `<section id="prerender" class="wrap rr-head"><div class="ui-page-head"><h1>${esc(r.title)}</h1><p class="ui-page-meta">${metaBits.join(' · ')}</p></div></section>`
  const toc = parts.length > 1 ? `<nav class="rr-toc" aria-labelledby="rr-toc-title"><p class="ui-toc-head" id="rr-toc-title">On this page</p><ul class="ui-toc-list" role="list">${parts.map(p => `<li><a href="#${p.id}"><span>${esc(p.title)}</span>${p.count != null ? `<span class="rr-toc-count">${figure(p.count)}</span>` : ''}</a></li>`).join('')}</ul></nav>` : ''
  const footer = `<p class="rr-footer">Record snapshot: ${time(r.snapshot_at)} · <a href="/api/report/${esc(r.slug)}">This record as JSON</a></p>`
  const courtNote = court.length ? `<section class="rr-court" aria-labelledby="rr-court-title"><h2 id="rr-court-title" class="rr-court-title">A court has ruled on parts of this report</h2>${court.map(x => `${text(x.text)}${citeLine(x.cite)}`).join('')}</section>` : ''
  return head + `<div class="wrap rr-record"><div class="rr-layout"><div class="rr-summary">${glance(stats)}${courtNote}${sourceCard(main, more)}</div>${toc}<div class="rr-body">${parts.map(sectionHTML).join('')}${footer}</div></div></div>`
}
