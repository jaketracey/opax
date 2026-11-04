/**
 * Senate estimates: the index of rounds (/estimates) and each round's page
 * (/estimates/<id>), with the round's hearing transcripts by committee and day.
 *
 * Two sources, each doing what it can do honestly:
 *  - The round calendar (scripts/hubs/estimates-rounds.json, published as
 *    /hubs/estimates-rounds.json by build:hubs): each round's name, dates and
 *    scheduled hearing days. It is what the sitemap and IndexNow list, so it
 *    is known at build time.
 *  - The transcripts themselves, read from the knowledge box when the page is
 *    served (cached by the Worker; see estimatesRecord in index.ts). Committee
 *    turns carry no hearing id in the knowledge box, only their chamber label,
 *    their date and a title "<speaker> — <topic> — <date>" whose topic starts
 *    "<Committee> - … Estimates". So one count read per committee per hearing
 *    day finds the transcripts, and a title check confirms each one: a turn
 *    that merely mentions a committee by name is not its hearing.
 *
 * No person is named here: the officials who gave evidence are named only in
 * their own hearing records, which these pages link to.
 */
import { sourceLineHTML, statusLabelHTML } from '../public/labels.js'
import { shortDate } from '../public/format.js'
import { escapeHtml as esc, safeHref, type ReadAsset } from './seo-content'
import { trail } from './nav-model.mjs'
import { hubShell, renderEstimatesMoney, type Estimates, type HubFooterConfig } from './hubs'

export interface EstimatesCommittee { id: string; name: string; full: string }
export interface EstimatesRound {
  id: string; type: 'budget' | 'supplementary' | 'additional'; name: string
  start: string; end: string; days: string[]; note?: string
  /** A round held in separate blocks of days (2025–26 Supplementary: October and December). */
  blocks?: { start: string; end: string }[]
}
export interface EstimatesRounds { updated: string; source_url: string; committees: EstimatesCommittee[]; rounds: EstimatesRound[] }
/** One committee's hearing on one day, as the record holds it. */
export interface EstimatesTranscript { committee: string; day: string; source_url?: string; revision?: 'Proof' | 'Official' }
/** What the record holds for a round. `incomplete`: some reads failed, so a
 *  committee or day may be missing (the page says so; the Worker does not keep it). */
export interface EstimatesRecord { id: string; checked: string; transcripts: EstimatesTranscript[]; incomplete?: boolean }

const ORIGIN = 'https://opax.com.au'
export const ROUND_ID = /^\d{4}-\d{2}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const range = (a: string, b: string) => a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`
/** A round's dates as they were held: its blocks when it had more than one. */
const roundDates = (r: EstimatesRound) => r.blocks?.length ? r.blocks.map(b => range(b.start, b.end)).join(' and ') : range(r.start, r.end)
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekday = (day: string) => WEEKDAYS[new Date(day + 'T00:00:00Z').getUTCDay()]
const link = (href: string, text: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text)
const external = (href: string, text: string) => `<a href="${esc(href)}" rel="noopener" target="_blank">${esc(text)} ↗︎</a>`

// --- reading the record -----------------------------------------------------

const BODY = { prop: 'field', type: 'text', name: 'body' }
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The KB /search body that finds one committee's turns on one day: the committee's name as a phrase, in the
 *  body text (every committee turn opens with "[<topic>] "), Senate committees only, that day only. */
export function transcriptQuery(committee: EstimatesCommittee, day: string) {
  return {
    query: `"${committee.full}"`, features: ['fulltext'], top_k: 10, show: ['basic', 'extra'],
    filter_expression: { field: { and: [
      { prop: 'label', labelset: 'chamber', label: 'senate_committee' },
      { prop: 'created', since: `${day}T00:00:00Z`, until: `${day}T23:59:59Z` },
      BODY,
    ] } },
  }
}
interface SearchResource { slug?: string; title?: string; extra?: { metadata?: Record<string, unknown> } }
interface SearchResponse { resources?: Record<string, SearchResource>; fulltext?: { total?: number; results?: { rid?: string }[] } }
/** The ParlInfo address of the hearing, when the record carries one (the 2026 local-PDF rows do). */
function parlinfo(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const url = new URL(raw)
    if (!/^https?:$/.test(url.protocol) || url.hostname !== 'parlinfo.aph.gov.au') return undefined
    url.protocol = 'https:'
    return url.href
  } catch { return undefined }
}
/** The committee's estimates hearing on `day`, if one of the returned turns is from it; null if none is. */
export function transcriptFrom(committee: EstimatesCommittee, day: string, data: SearchResponse): EstimatesTranscript | null {
  if (!((data.fulltext?.total ?? 0) > 0)) return null
  // "<Committee> - <Committee> 04/06/2026 Estimates TREASURY …" (ParlInfo) and
  // "<Committee> - Estimates - TREASURY …" (Proof PDFs) both start the topic so.
  const topic = new RegExp(`(?:^| — )${escapeRe(committee.full)} - (?:[^—]*\\s)?Estimates\\b`)
  const own = Object.values(data.resources ?? {}).filter(r => {
    const title = r.title ?? ''
    const date = typeof r.extra?.metadata?.date === 'string' ? r.extra.metadata.date.slice(0, 10) : title.match(/ — (\d{4}-\d{2}-\d{2})$/)?.[1]
    return date === day && topic.test(title)
  })
  if (!own.length) return null
  const url = own.map(r => parlinfo(r.extra?.metadata?.source_url)).find(Boolean)
  const attribution = own.map(r => r.extra?.metadata?.source_attribution).find(a => typeof a === 'string') as string | undefined
  const revision = /^(Proof|Official) Committee Hansard\b/.exec(attribution ?? '')?.[1] as EstimatesTranscript['revision'] | undefined
  return { committee: committee.id, day, ...(url ? { source_url: url } : {}), ...(revision ? { revision } : {}) }
}
/** Every committee on every scheduled day, four reads at a time. A failed read marks the record incomplete. */
export async function readEstimatesRecord(round: EstimatesRound, committees: EstimatesCommittee[],
  search: (body: Record<string, unknown>) => Promise<SearchResponse>, now = new Date()): Promise<EstimatesRecord> {
  const today = now.toISOString().slice(0, 10)
  const reads = round.days.filter(d => DAY.test(d) && d <= today).flatMap(day => committees.map(committee => ({ committee, day })))
  const transcripts: EstimatesTranscript[] = []
  let failed = 0
  for (let i = 0; i < reads.length; i += 4) {
    const batch = await Promise.allSettled(reads.slice(i, i + 4).map(async ({ committee, day }) => transcriptFrom(committee, day, await search(transcriptQuery(committee, day)))))
    for (const r of batch) {
      if (r.status === 'rejected') failed++
      else if (r.value) transcripts.push(r.value)
    }
  }
  if (reads.length && failed === reads.length) throw new Error('estimates transcripts unavailable')
  transcripts.sort((a, b) => a.day.localeCompare(b.day) || a.committee.localeCompare(b.committee))
  return { id: round.id, checked: now.toISOString(), transcripts, ...(failed ? { incomplete: true } : {}) }
}

// --- links -------------------------------------------------------------------

/** Search over this committee's Senate committee records on these dates: the committee's name as a phrase
 *  (every turn of its hearings opens with it), keyword mode. Search has no committee filter of its own. */
export function committeeSearchHref(committee: EstimatesCommittee, since: string, until: string): string {
  const p = new URLSearchParams({ view: 'search', q: `"${committee.full}"`, kind: 'speech', mode: 'keyword', chamber: 'senate_committee', since, until })
  return `/ask?${p}`
}

// --- the index ---------------------------------------------------------------

const TYPE_NOTE = 'Senate committees question ministers and officials on government spending in three rounds a year: Budget estimates (May–June), Supplementary Budget estimates (October–November) and Additional estimates (February–March).'

export function renderEstimatesIndex(data: EstimatesRounds, records: Map<string, EstimatesRecord>, today: string, footer: HubFooterConfig = {}) {
  const title = 'Senate estimates'
  const description = 'Every round of Senate estimates hearings in the record, with each committee\'s hearing transcripts by day.'
  const rounds = [...data.rounds].filter(r => ROUND_ID.test(r.id)).sort((a, b) => b.start.localeCompare(a.start))
  const rows = rounds.map(r => {
    const state = today < r.start ? 'Upcoming' : today <= r.end ? 'Current' : 'Past'
    const record = records.get(r.id)
    const committees = record ? new Set(record.transcripts.map(t => t.committee)).size : 0
    const held = record?.transcripts.length ? ` · ${plural(record.transcripts.length, 'transcript')} from ${plural(committees, 'committee')}` : ''
    return `<li><div><h2 class="ui-row-title">${link(`/estimates/${r.id}`, r.name)}</h2><p class="ui-row-meta">${esc(roundDates(r))}${esc(held)}</p></div>${statusLabelHTML(state, state === 'Current' ? 'active' : 'ended')}</li>`
  }).join('')
  const head = `<div class="ui-page-head"><h1>${esc(title)}</h1><p class="ui-lede">${esc(TYPE_NOTE)}</p>${sourceLineHTML({ updated: data.updated, dateLabel: 'Checked', source: 'APH Senate estimates',
    originals: [{ href: data.source_url, label: 'Senate estimates on aph.gov.au' }],
    notes: [esc('Each round lists the hearing transcripts in the record, by committee and day. Transcripts come from Committee Hansard; a Proof transcript can be corrected before the official version.')] })}</div>`
  const html = hubShell(head + `<ul class="ui-list hub-weeks" role="list">${rows}</ul>`, footer, trail('/estimates'))
  const jsonLd = { '@graph': [{ '@type': 'ItemList', '@id': ORIGIN + '/estimates#records', numberOfItems: rounds.length,
    itemListElement: rounds.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.name, url: `${ORIGIN}/estimates/${r.id}` })) }] }
  return { title, description, html, jsonLd }
}

// --- a round -------------------------------------------------------------------

export function renderEstimatesRound(data: EstimatesRounds, round: EstimatesRound, record: EstimatesRecord | null, today: string,
  money: Estimates | null = null, footer: HubFooterConfig = {}) {
  const path = `/estimates/${round.id}`
  const title = `Senate ${round.name}: ${roundDates(round)}`
  const transcripts = record?.transcripts ?? []
  const byCommittee = data.committees.map(c => ({ c, rows: transcripts.filter(t => t.committee === c.id) })).filter(x => x.rows.length)
    .sort((a, b) => a.rows[0].day.localeCompare(b.rows[0].day) || a.c.name.localeCompare(b.c.name, 'en'))
  const description = transcripts.length
    ? `${plural(transcripts.length, 'hearing transcript')} from ${plural(byCommittee.length, 'committee')}, by committee and day.`
    : 'The round\'s hearing dates and committees.'
  // The meta line says what the record holds, never a program's status.
  const meta = !record ? 'Transcripts could not be loaded.'
    : transcripts.length ? `${plural(transcripts.length, 'transcript')} from ${plural(byCommittee.length, 'committee')}`
    : today < round.start ? `Hearings from ${shortDate(round.start)}.` : 'No transcripts on record yet.'
  const proof = transcripts.some(t => t.revision === 'Proof')
  const notes = [
    ...(round.note ? [esc(round.note)] : []),
    esc('Each transcript is one committee\'s hearing on one day. Its records are the turns of that hearing: the senators\' questions and the evidence given in answer, each under the name of the person speaking.'),
    ...(proof ? [esc('Proof transcripts can be corrected before the official version is published.')] : []),
    ...(record?.incomplete ? [esc('Some hearings could not be checked just now, so this list may be missing a committee or a day.')] : []),
  ]
  const head = `<div class="ui-page-head"><h1>${esc(title)}</h1><p class="ui-page-meta">${esc(meta)}</p>${sourceLineHTML({
    updated: record?.checked.slice(0, 10) || '', dateLabel: 'Checked', source: 'Committee Hansard',
    originals: [{ href: data.source_url, label: 'Senate estimates on aph.gov.au' }], notes })}</div>`
  const sections: { id: string; label: string }[] = []
  let body = ''
  // An empty round shows no Transcripts heading: the meta line already says what the record holds.
  if (byCommittee.length) {
    sections.push({ id: 'transcripts', label: 'Transcripts' })
    body += `<section class="ui-section hub-section" id="transcripts"><h2 class="ui-section-title">Transcripts <span class="hub-count">${transcripts.length}</span></h2>`
    body += '<ul class="ui-list hub-records" role="list">' + byCommittee.map(({ c, rows }) => {
      const days = rows.map(t => {
        const original = t.source_url ? ` · ${external(t.source_url, `${t.revision ? t.revision + ' transcript' : 'Transcript'} on ParlInfo`)}` : ''
        return `<li>${link(committeeSearchHref(c, t.day, t.day), `${weekday(t.day)} ${shortDate(t.day)}`)}${original}</li>`
      }).join('')
      const first = rows[0].day, last = rows.at(-1)!.day
      return `<li id="committee-${esc(c.id)}"><h3 class="ui-row-title">${esc(c.name)}</h3><ul class="hub-hearing-days" role="list">${days}</ul>`
        + `<p class="ui-row-meta">${link(committeeSearchHref(c, first, last), `Search this committee's records, ${range(first, last)}`)}</p></li>`
    }).join('') + '</ul></section>'
  }
  if (money && money.id === round.id) {
    const block = renderEstimatesMoney(money)
    sections.push(...block.groups.map(g => ({ id: `group-${g.id}`, label: `Group ${g.id} agencies` })))
    body += block.html
  }
  const toc = sections.length > 1 ? `<nav class="hub-toc" aria-labelledby="hub-toc-head"><p class="ui-toc-head" id="hub-toc-head">On this page</p><ul class="ui-toc-list" role="list">${sections.map(s => `<li><a href="#${esc(s.id)}"><span>${esc(s.label)}</span></a></li>`).join('')}</ul></nav>` : ''
  const html = hubShell(head + toc + body, footer, trail(path, round.name))
  const event = { '@type': 'Event', '@id': ORIGIN + path + '#event', url: ORIGIN + path, name: title, startDate: round.start, endDate: round.end,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: 'Australian Parliament House', address: 'Canberra ACT, Australia' },
    organizer: { '@type': 'GovernmentOrganization', name: 'Parliament of Australia', url: 'https://www.aph.gov.au/' }, sameAs: data.source_url }
  const items = byCommittee.map(({ c }) => ({ href: `${path}#committee-${c.id}`, name: c.name }))
  return { title, description, html, jsonLd: { '@graph': [event, { '@type': 'ItemList', '@id': ORIGIN + path + '#records', numberOfItems: items.length,
    itemListElement: items.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.name, url: ORIGIN + r.href })) }] } }
}

/** /estimates and /estimates/<id>. `record(round)` reads (or returns the cached) transcripts; `cached(round)`
 *  returns only what is already cached, so the index never waits on the knowledge box. */
export async function estimatesPage(id: string | null, read: ReadAsset, today: string,
  record: (round: EstimatesRound, committees: EstimatesCommittee[]) => Promise<EstimatesRecord | null>,
  cached: (round: EstimatesRound) => Promise<EstimatesRecord | null>, footer: HubFooterConfig = {}) {
  const missing = { title: 'Round not found', description: 'This round is not in the published estimates calendar.',
    html: hubShell(`<div class="ui-page-head"><h1>Round not found</h1><p class="ui-lede">${link('/estimates', 'Browse every round of Senate estimates.')}</p></div>`, footer),
    jsonLd: null, status: 404 }
  if (id !== null && !ROUND_ID.test(id)) return missing
  const data = await read<EstimatesRounds>('/hubs/estimates-rounds.json')
  if (id === null) {
    const records = new Map<string, EstimatesRecord>()
    await Promise.all(data.rounds.map(async r => { const hit = await cached(r).catch(() => null); if (hit) records.set(r.id, hit) }))
    return { ...renderEstimatesIndex(data, records, today, footer), status: 200 }
  }
  const round = data.rounds.find(r => r.id === id)
  if (!round) return missing
  const [held, money] = await Promise.all([
    record(round, data.committees).catch(() => null),
    read<Estimates>(`/hubs/estimates-${id}.json`).catch(() => null),
  ])
  return { ...renderEstimatesRound(data, round, held, today, money, footer), status: 200 }
}
