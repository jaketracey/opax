/**
 * GET /api/app/v1/widget/today: the one public file the Parliament today
 * home-screen widget reads (widgets spec 2.3). The same bytes for every
 * reader: it reads no query string, cookie or client header beyond
 * If-None-Match, and sets no cookie. Composed from the journal record behind
 * /api/app/v1/edition/latest, /divisions/recent.json and
 * /parliament/sitting-days.json, already reduced to the words the app shows,
 * so the widget only lays out strings. Each part is null on its own.
 *
 * The edition and vote rules are ports of the app's TypeScript (mobile/src
 * on ios/apple-design): editionFor/editionTitles (api/selectors.ts), plateLine
 * and editionPerson (features/edition/model.ts, Plate.tsx), and
 * recentReadingVotes (features/today/votes.ts, features/bills/divisions.ts).
 * test/app-widget-today.test.mjs pins their output against the app's.
 * Runtime imports must stay pure.
 */
import {appJson, appRead, melbourneDay, readOnly, validDate} from './app-http'
import {storedEdition, type EditionRow} from './app-edition'
import type {DailyPost} from './daily-post'
import {divisionOutcome} from '../public/division-outcome.js'

type WidgetEnv = Pick<Env, 'COMMUNITY_DB' | 'ASSETS'>
type Json = Record<string, unknown>

export const WIDGET_CACHE = 'public, max-age=900'
export const WIDGET_MAX_BYTES = 4096
export const SITTING_WINDOW_DAYS = 60
export const DIVISIONS_PATH = '/divisions/recent.json'
export const SITTING_PATH = '/parliament/sitting-days.json'

export interface WidgetEdition {date: string; kind: DailyPost['kind']; kind_short: string; card_title: string; line: string | null; path: string}
export interface WidgetVote {date: string; chamber: string | null; stage: string | null; title: string; outcome: 'Agreed' | 'Not agreed'; ayes: number; noes: number; path: string}
export interface WidgetSitting {
  until: string; until_reason: 'window' | 'coverage_end' | 'expired'
  calendars: {year: number; source: string | null; as_at: string | null}[]
  next_year: {year: number; status: string} | null
  days: {date: string; house: boolean; senate: boolean}[]
}
export interface WidgetToday {version: 1; generated: string | null; edition: WidgetEdition | null; vote: WidgetVote | null; sitting: WidgetSitting | null}

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
/** The app's `date` decoder: an ISO day, optionally with a time, that is a real day. */
const isDate = (v: unknown): v is string => nonempty(v) && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v.slice(0,10)

// ---------------------------------------------------------------- edition --

// The composer's own words for each kind, as the plate prints them (editionFor kindShort).
const KIND_SHORT: Record<DailyPost['kind'], string> = {
  politician:'Parliamentarian', bill:'Bill', grant:'Grant', topic:'Topic', program:'Grant program', largest:'Largest grants',
}
const SLIDE_TYPES = ['cover','number','picture','bars','ledger','timeline','division','list','source']
// The app's link rule (decodeEdition editionLink): reports are retired there, so an edition linking one is not drawn.
const APP_EDITION_PAGE = /^\/(?:subject\/person\/|bill\/|money\/grants(?:\/|$))/

/** What the app's edition decoder would refuse, so the widget never draws an edition Today hides. */
function appReadable(post: DailyPost): boolean {
  let link: URL
  try { link = new URL(post.url) } catch { return false }
  if (link.protocol !== 'https:' || link.hostname !== 'opax.com.au' || link.port || link.username || link.password
    || !APP_EDITION_PAGE.test(link.pathname)) return false
  if (![post.subject, post.title, post.text].every(nonempty)) return false
  if (post.caption !== undefined && typeof post.caption !== 'string') return false
  if (post.slides === undefined) return true
  const slides = post.slides as unknown[]
  if (!Array.isArray(slides) || slides.length < 3 || slides.length > 10) return false
  return slides.every((s, i) => isObject(s) && SLIDE_TYPES.includes(s.type as string)
    && [s.kicker, s.title, s.alt].every(v => typeof v === 'string')
    && (i !== 0 || s.type === 'cover') && (i !== slides.length - 1 || s.type === 'source')
    && (s.type !== 'source' || (Array.isArray(s.rows) && s.rows.every(r => typeof r === 'string')))
    && (s.type !== 'list' || s.note === undefined || s.note === null || typeof s.note === 'string'))
}

/** editionTitles: the bill's short title when it has one, cut at a clause or word to 80 characters. */
export function cardTitle(title: string, shortTitle: string | null): string {
  const t = shortTitle ?? title
  const clause = t.indexOf(' (')
  const boundary = t.lastIndexOf(' ', 80)
  return t.length <= 80 ? t : `${t.slice(0, clause > 0 && clause <= 80 ? clause : boundary > 0 ? boundary : 80).trimEnd()}…`
}

/** The bill key an edition's path names, as editionTitles reads it. */
export function editionBillKey(kind: string, path: string): string | null {
  return kind === 'bill' ? /^\/bill\/([^/?]+)\/?(?:\?|$)/.exec(path)?.[1] ?? null : null
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)

/** model.ts plateLine: the detail line, less any sentence shown below it; a bill with a stage rail uses its portfolio. */
export function plateLine(line: string | null, shownBelow: readonly string[] = [], edition?: {kind: string; facts: {kicker: string | null; events: unknown[]}}): string | null {
  if (edition?.kind === 'bill' && edition.facts.events.length)
    return edition.facts.kicker?.split('·').slice(1).join('·').trim().replace(/\.$/, '') || null
  if (!line?.trim()) return null
  const below = new Set(shownBelow.flatMap(sentences))
  const rest = sentences(line).filter(s => !below.has(s))
  return rest.length ? rest.join(' ').replace(/\.$/, '') : null
}

/** model.ts editionPerson: a member's party and seat, from the cover's line and kicker. */
export function editionPerson(facts: {kicker: string | null; line: string | null}) {
  const first = facts.line?.split(' · ')[0]?.trim()
  const party = first && !/^(?:House of Representatives|Senate|records\b)/i.test(first) ? first : null
  const place = facts.kicker?.split(' · ').slice(1).join(' · ') || null
  return {party, place}
}

/**
 * The edition reduced to the plate's words, as Today's card draws it: the kind,
 * the card title, and the line under the title (a member's party and seat, or
 * plateLine with the card's first paragraph below it). Null when the app would
 * refuse the record.
 */
export function widgetEdition(post: DailyPost, shortTitle: string | null = null): WidgetEdition | null {
  if (!appReadable(post)) return null
  const link = new URL(post.url)
  const path = `${link.pathname}${link.search}`
  const paragraphs = post.text.split(/\n{2,}/).map(p => p.trim()).filter(p => p && p !== post.url
    && !(p.endsWith('…') && p.length > 1 && post.title.startsWith(p.slice(0, -1).trimEnd())))
  const slides = (post.slides ?? []) as unknown as Json[]
  const cover = slides.find(s => s.type === 'cover')
  // The app's lenient fields: an unreadable cover line or event list is left out, never refused.
  const coverLine = cover && nonempty(cover.line) ? cover.line.trim() : null
  const eventsOf = (s: Json) => Array.isArray(s.events) && s.events.every(e => isObject(e) && nonempty(e.date) && nonempty(e.text)) ? s.events : []
  const timeline = slides.find(s => s.type === 'timeline' && eventsOf(s).length)
  const facts = {kicker: typeof cover?.kicker === 'string' ? cover.kicker.trim() || null : null, line: coverLine, events: timeline ? eventsOf(timeline) : []}
  const person = post.kind === 'politician' ? editionPerson(facts) : null
  const line = person && (person.party || person.place)
    ? [person.party, person.place].filter(Boolean).join(' · ')
    : plateLine(facts.line, paragraphs.slice(0, 1), {kind: post.kind, facts})
  return {date: post.date, kind: post.kind, kind_short: KIND_SHORT[post.kind], card_title: cardTitle(post.title, shortTitle), line, path}
}

// ------------------------------------------------------------------- vote --

const READING = /\b(second|third) reading\b/i
const AMENDMENT = /amendment/i
const PROCEDURAL = [/limitation of debate/i, /\bclosure\b/i, /suspension of standing orders/i, /suspend standing orders/i, /\badjournment\b/i]
type Division = {bill_key: string; title: string; short_title?: string; division_key: string; stage?: string; question_type?: string; chamber?: string; date: string; outcome?: string; ayes: number; noes: number}

const isProcedural = (stage: string | null | undefined) => {
  const s = String(stage ?? '').replace(/_/g, ' ')
  return !!s.trim() && PROCEDURAL.some(rule => rule.test(s))
}
/** votes.ts isReadingVote: second and third readings; procedure and amendments are out. */
export function isReadingVote(row: {stage?: string | null; question_type?: string | null}): boolean {
  const stage = String(row.stage ?? '').replace(/_/g, ' ')
  if (row.question_type === 'procedural' || row.question_type === 'amendment') return false
  return READING.test(stage) && !AMENDMENT.test(stage) && !isProcedural(stage)
}
export function chamberWord(chamber: string | null | undefined): string | null {
  const c = String(chamber ?? '').toLowerCase()
  if (/senate/.test(c)) return 'Senate'
  if (/house|representatives|reps/.test(c)) return 'House of Representatives'
  return null
}
export function stageWords(stage: string | null | undefined): string | null {
  const match = READING.exec(String(stage ?? '').replace(/_/g, ' '))
  return match ? `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1).toLowerCase()} reading` : null
}
/** divisions.ts outcomeWord, and the site's one wording (public/division-outcome.js): "Agreed" or
 *  "Not agreed", never "Negatived"; an unnamed outcome reads from its counts. */
export function outcomeWord(outcome: string | null | undefined, counts?: {ayes: number; noes: number}): 'Agreed' | 'Not agreed' {
  return divisionOutcome(outcome, counts) === 'Agreed' ? 'Agreed' : 'Not agreed'
}

const optionalText = (v: unknown) => v === undefined || v === null || typeof v === 'string'
function division(v: unknown): Division | null {
  if (!isObject(v)) return null
  if (!nonempty(v.bill_key) || !nonempty(v.title) || !nonempty(v.division_key) || !isDate(v.date) || !isCount(v.ayes) || !isCount(v.noes)
    || ![v.short_title, v.stage, v.question_type, v.chamber, v.outcome].every(optionalText)) return null
  const text = (x: unknown) => typeof x === 'string' ? x : undefined
  return {bill_key:v.bill_key, title:v.title, short_title:text(v.short_title), division_key:v.division_key, stage:text(v.stage),
    question_type:text(v.question_type), chamber:text(v.chamber), date:v.date, outcome:text(v.outcome), ayes:v.ayes, noes:v.noes}
}

/**
 * decodeRecentDivisions: rows it cannot read are dropped, up to the app's
 * allowance (1%, at least one row); past that, or with no readable row, the
 * app refuses the file, and so does this.
 */
export function readDivisions(file: unknown): {generated_at: string; divisions: Division[]} | null {
  if (!isObject(file) || !isDate(file.generated_at) || !Array.isArray(file.divisions)) return null
  const rows = file.divisions.map(division)
  const kept = rows.filter((r): r is Division => !!r)
  const dropped = rows.length - kept.length
  if (dropped && (dropped === rows.length || dropped > Math.max(1, Math.floor(rows.length / 100)))) return null
  return {generated_at:file.generated_at, divisions:kept}
}

/** votes.ts recentReadingVotes: reading votes, newest first, one per bill per day. */
export function recentReadingVotes(divisions: Division[], limit = 3): Division[] {
  return divisions.filter(isReadingVote)
    .sort((a, b) => b.date.localeCompare(a.date) || b.division_key.localeCompare(a.division_key, undefined, {numeric:true}))
    .filter((row, index, all) => all.findIndex(o => o.bill_key === row.bill_key && o.date.slice(0,10) === row.date.slice(0,10)) === index)
    .slice(0, Math.max(0, limit))
}

/** The first row of How parliament voted, in the words its row shows. */
export function widgetVote(file: unknown): WidgetVote | null {
  const divisions = readDivisions(file)
  const row = divisions ? recentReadingVotes(divisions.divisions, 1)[0] : undefined
  if (!row) return null
  const query = new URLSearchParams({division:row.division_key})
  return {date:row.date.slice(0,10), chamber:chamberWord(row.chamber), stage:stageWords(row.stage), title:row.short_title?.trim() || row.title,
    outcome:outcomeWord(row.outcome, row), ayes:row.ayes, noes:row.noes, path:`/bill/${encodeURIComponent(row.bill_key)}?${query}`}
}

// ---------------------------------------------------------------- sitting --

const day = (v: unknown): string | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && validDate(v) ? v : null
export const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0,10)
export function sydneyDay(at: number): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Sydney', year:'numeric', month:'2-digit', day:'2-digit'}).format(at)
}
const yearOf = (date: string) => Number(date.slice(0,4))

/**
 * The sitting calendar (portal/public/parliament/sitting-days.json, written by
 * scripts/build_sitting_days.py; docs/DATA-SITTING-DAYS.md) reduced to what the
 * widget draws. The fields read, every other one ignored:
 *   schema_version 1, timezone "Australia/Sydney" (each checked when present)
 *   coverage.{first,last}   the days the calendar speaks for
 *   expires                 no claim after this day (the builder sets it to coverage.last)
 *   years[{year, status, source?: {publisher, published}}]
 *   days[{date, house, senate}]   sitting days only; a missing flag is false
 * The top-level `published` is the build date, never a publication date, so it is not read.
 *
 * Result:
 *   days          sitting days from today through `until`, in order
 *   until         the last day the list speaks for
 *   until_reason  'window': 59 days after today, the calendar runs on
 *                 'coverage_end': the calendar ends at `until`, inside the window
 *                 'expired': today is past the calendar's end (`until`), so `days` is empty
 *   calendars     one entry per year from today's through `until`'s: that year's
 *                 publisher and publication date (null when the file has none)
 *   next_year     the year after the calendar ends and its status from years[]
 *                 ('published' or 'not_published'); null when years[] does not list it
 * So "the 2027 calendar is not published" reaches the widget as data, before and
 * after 1 January. Null only when the file is missing or cannot be read, or starts
 * after today (the builder never writes one): never a guess.
 */
export function widgetSitting(file: unknown, today: string): WidgetSitting | null {
  if (!isObject(file) || !isObject(file.coverage) || !Array.isArray(file.days)) return null
  if ((file.schema_version !== undefined && file.schema_version !== 1)
    || (file.timezone !== undefined && file.timezone !== 'Australia/Sydney')) return null
  const firstDay = day(file.coverage.first), lastDay = day(file.coverage.last)
  const expires = file.expires === undefined || file.expires === null ? null : day(file.expires)
  if (!firstDay || !lastDay || firstDay > lastDay || (file.expires != null && !expires) || today < firstDay) return null
  // Each listed year must read; its source is the year's own, and a null publication date stays null.
  const years = new Map<number, {status: string; source: string | null; as_at: string | null}>()
  if (file.years !== undefined) {
    if (!Array.isArray(file.years)) return null
    for (const y of file.years) {
      if (!isObject(y) || !Number.isInteger(y.year) || !nonempty(y.status) || years.has(y.year as number)) return null
      const source = y.source === undefined || y.source === null ? null : isObject(y.source) ? y.source : undefined
      if (source === undefined) return null
      const publisher = source?.publisher, published = source?.published
      if ((publisher != null && typeof publisher !== 'string') || (published != null && !day(published))) return null
      years.set(y.year as number, {status:y.status, source:nonempty(publisher) ? publisher.trim() : null, as_at:published == null ? null : day(published)})
    }
  }
  const seen = new Set<string>(), days: WidgetSitting['days'] = []
  const flag = (v: unknown) => v === undefined || v === null ? false : typeof v === 'boolean' ? v : null
  for (const row of file.days) {
    const d = isObject(row) ? day(row.date) : null
    const house = isObject(row) ? flag(row.house) : null, senate = isObject(row) ? flag(row.senate) : null
    if (!d || seen.has(d) || house === null || senate === null) return null
    seen.add(d)
    if (house || senate) days.push({date:d, house, senate})
  }
  days.sort((a, b) => a.date.localeCompare(b.date))
  const end = expires && expires < lastDay ? expires : lastDay
  const after = years.get(yearOf(end) + 1)
  const next_year = after ? {year:yearOf(end) + 1, status:after.status} : null
  if (today > end) return {until:end, until_reason:'expired', calendars:[], next_year, days:[]}
  const window = addDays(today, SITTING_WINDOW_DAYS - 1)
  const until = end <= window ? end : window
  const calendars: WidgetSitting['calendars'] = []
  for (let y = yearOf(today); y <= yearOf(until); y++) calendars.push({year:y, source:years.get(y)?.source ?? null, as_at:years.get(y)?.as_at ?? null})
  return {until, until_reason:end <= window ? 'coverage_end' : 'window', calendars, next_year, days:days.filter(d => d.date >= today && d.date <= until)}
}

// ------------------------------------------------------------------ route --

class Unavailable extends Error {}

/** A fixed static file: null when it is absent or not JSON; Unavailable when the binding fails. */
async function asset(env: WidgetEnv, path: string): Promise<unknown> {
  let res: Response
  try { res = await env.ASSETS.fetch(new Request('https://app-assets.invalid' + path)) } catch { throw new Unavailable() }
  if (res.status === 404) return null
  if (res.status >= 500) throw new Unavailable()
  if (res.status !== 200 || !res.headers.get('content-type')?.toLowerCase().includes('application/json')) return null
  try { return JSON.parse(await res.text()) } catch { return null }
}

/** The bill's own short title, from its file (export_bills.py writes the index row from the same field). */
async function billShortTitle(env: WidgetEnv, key: string | null): Promise<string | null> {
  if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return null
  const file = await asset(env, `/bills/${key}.json`)
  return isObject(file) && file.key === key && nonempty(file.short_title) ? file.short_title.trim() : null
}

/** The newest of the sources' own times: deterministic, so an unchanged body keeps its ETag. */
function generated(times: (string | null | undefined)[]): string | null {
  const ms = times.map(t => t ? Date.parse(t) : NaN).filter(Number.isFinite)
  return ms.length ? new Date(Math.max(...ms)).toISOString().replace(/\.000Z$/, 'Z') : null
}

const bytes = (body: WidgetToday) => new TextEncoder().encode(JSON.stringify(body)).length
/**
 * Keeps the body within 4 KB. Only the sitting list varies in length, so its far
 * end goes first and `until` moves back with it; the list stays complete
 * through `until`. Real calendars never come near this (about 2 KB at most).
 */
export function fitBody(body: WidgetToday, max = WIDGET_MAX_BYTES): WidgetToday {
  if (!body.sitting || bytes(body) <= max) return body
  const days = [...body.sitting.days]
  let out = body
  while (days.length && bytes(out) > max) {
    days.pop()
    const until = addDays(body.sitting.days[days.length]!.date, -1)
    // The list now stops short of the calendar: a window, whatever stopped it before.
    out = {...body, sitting:{...body.sitting, until, until_reason:'window', calendars:body.sitting.calendars.filter(c => c.year <= yearOf(until)), days:[...days]}}
  }
  return out
}

export async function composeWidgetToday(env: WidgetEnv, at: number): Promise<WidgetToday> {
  // The edition's day is the reader's (Melbourne) day; the calendar's is Sydney's. They are the same date.
  // The query /api/app/v1/edition/latest runs, word for word (pinned by test/app-widget-today.test.mjs).
  const row = await env.COMMUNITY_DB.prepare(`SELECT e.date,e.subject,e.post_json,e.created_at FROM social_editions e
      WHERE e.date<=? AND EXISTS (SELECT 1 FROM social_deliveries d
        WHERE d.edition_date=e.date AND d.status='posted' AND d.post_id IS NOT NULL AND d.post_id!='')
      ORDER BY e.date DESC LIMIT 1`).bind(melbourneDay(at)).first<EditionRow>()
  let post: DailyPost | null = null
  try { post = row ? storedEdition(row) : null } catch { post = null }
  const [shortTitle, divisions, calendar] = await Promise.all([
    post ? billShortTitle(env, editionBillKey(post.kind, new URL(post.url).pathname)) : null,
    asset(env, DIVISIONS_PATH), asset(env, SITTING_PATH),
  ])
  const edition = post ? widgetEdition(post, shortTitle) : null
  const vote = widgetVote(divisions)
  const sitting = widgetSitting(calendar, sydneyDay(at))
  return fitBody({version:1,
    generated:generated([edition && row ? row.created_at : null, vote && isObject(divisions) ? divisions.generated_at as string : null, ...(sitting?.calendars ?? []).map(c => c.as_at)]),
    edition, vote, sitting})
}

export async function appWidgetToday(req: Request, env: WidgetEnv, at = Date.now()): Promise<Response> {
  const method = readOnly(req)
  if (method) return method
  if (new URL(req.url).search) return appJson(req, {error:'invalid_query'}, 400)
  try {
    return await appRead(req, await composeWidgetToday(env, at), WIDGET_CACHE)
  } catch {
    return appJson(req, {error:'widget_unavailable'}, 503, {'retry-after':'60'})
  }
}
