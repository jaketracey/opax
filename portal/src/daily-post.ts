/**
 * Daily X post. One politician, one bill or one topic a day, rotating, drawn
 * from the site's own static data so nothing is generated at post time. The
 * cron in wrangler.jsonc fires `scheduled()`; /api/daily-post/preview shows
 * what a given day would say without posting. Posting needs four X secrets
 * (see docs/DAILY-POST.md); without them the run logs and does nothing.
 */
import { TOPIC_NAMES } from './topic-names.mjs'

export const DAILY_POST_KINDS = ['politician', 'bill', 'topic'] as const
export type DailyPostKind = typeof DAILY_POST_KINDS[number]

export interface DailyPost {
  date: string
  kind: DailyPostKind
  /** Stable id used to avoid featuring the same subject twice in a season. */
  subject: string
  title: string
  text: string
  url: string
}

export interface DailyPostSources {
  /** JSON from the static asset store, or null when missing. */
  asset(path: string): Promise<unknown>
  personTopics(name: string): Promise<{ slug: string; share: number }[]>
  /** Subject ids featured recently, newest last. */
  recent(): Promise<string[]>
}

export interface XCredentials {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

export const ORIGIN = 'https://opax.com.au'
/** X counts every URL as 23 characters regardless of length. */
export const X_URL_WEIGHT = 23
export const X_LIMIT = 280
const RECENT_WINDOW = 90
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WHERE: Record<string, string> = {
  federal: 'federal parliament', nsw: 'the NSW parliament', vic: 'the Victorian parliament',
  qld: 'the Queensland parliament', sa: 'the South Australian parliament',
}

// ---------------------------------------------------------------- helpers

/** Calendar date in Melbourne as YYYY-MM-DD; the cron fires in UTC. */
export function melbourneDate(at: number | Date = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at)
}

/** Rotates through the kinds one per calendar day. */
export function kindFor(date: string): DailyPostKind {
  const [y, m, d] = date.split('-').map(Number)
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86400000)
  const n = DAILY_POST_KINDS.length
  return DAILY_POST_KINDS[((day % n) + n) % n]
}

/** FNV-1a; deterministic so a preview for a date matches the real post. */
export function seed(text: string): number {
  let h = 2166136261
  for (const c of text) {
    h ^= c.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Picks by seed, walking forward past anything featured recently. */
export function seededPick<T>(items: T[], key: string, id: (item: T) => string, exclude: string[] = []): T | null {
  if (!items.length) return null
  const skip = new Set(exclude)
  const start = seed(key) % items.length
  for (let i = 0; i < items.length; i++) {
    const item = items[(start + i) % items.length]
    if (!skip.has(id(item))) return item
  }
  return items[start]
}

export function xLength(text: string): number {
  return [...text.replace(/https?:\/\/\S+/g, 'x'.repeat(X_URL_WEIGHT))].length
}

/**
 * Joins head, as many optional segments as fit (in order), then the tail.
 * If head + tail alone is too long the last head segment is cut with an ellipsis.
 */
export function fit(head: string[], optional: string[], tail: string, limit = X_LIMIT): string {
  const join = (segments: string[]) => segments.filter(Boolean).join('\n\n')
  const chosen: string[] = []
  for (const segment of optional) {
    if (segment && xLength(join([...head, ...chosen, segment, tail])) <= limit) chosen.push(segment)
  }
  let text = join([...head, ...chosen, tail])
  if (xLength(text) > limit) {
    const over = xLength(text) - limit
    const trimmed = [...head]
    const last = trimmed.length - 1
    const chars = [...trimmed[last]]
    trimmed[last] = chars.slice(0, Math.max(0, chars.length - over - 1)).join('').trimEnd() + '…'
    text = join([...trimmed, ...chosen, tail])
  }
  return text
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function joinList(items: string[]): string {
  const list = items.filter(Boolean)
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

function titleCase(word: string): string {
  return word.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
}

/** "GEE, Andrew, MP" → "Andrew Gee"; "PAYMAN, Sen Fatima" → "Fatima Payman". */
export function prettySponsor(raw: string | null | undefined): string {
  const text = decodeEntities(raw ?? '').trim()
  if (!text) return ''
  const parts = text.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return titleCase(text)
  const surname = titleCase(parts[0])
  const given = parts[1].replace(/^(Sen|Senator|Hon|Dr|Mr|Mrs|Ms)\.?\s+/i, '').trim()
  return `${given} ${surname}`.trim()
}

export function prettyParty(raw: string | null | undefined): string {
  const text = decodeEntities(raw ?? '').trim()
  if (/^independent/i.test(text)) return 'Independent'
  return text
}

// ---------------------------------------------------------------- composers

interface Person {
  name: string
  speeches?: number
  current?: boolean
  party?: string | null
  party_now?: string | null
  first?: number
  representation?: { jurisdiction?: string; chamber?: string; electorate?: string | null; state?: string | null }[]
}

async function politicianPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const roster = await sources.asset('/parliamentarians.json') as { people?: Person[] } | null
  const people = (roster?.people ?? [])
    .filter(p => p.current && (p.speeches ?? 0) >= 200 && p.representation?.length)
    .sort((a, b) => a.name.localeCompare(b.name))
  const person = seededPick(people, `politician:${date}`, p => `person:${p.name}`, exclude)
  if (!person) return null
  const rep = person.representation![0]
  const seat = rep.chamber === 'senate'
    ? (rep.state ? `Senator for ${rep.state}` : 'Senator')
    : (rep.electorate ? `Member for ${rep.electorate}` : '')
  const party = prettyParty(person.party_now || person.party)
  const who = [party, seat].filter(Boolean).join(', ')
  const where = WHERE[rep.jurisdiction ?? 'federal'] ?? 'parliament'
  const topics = (await sources.personTopics(person.name))
    .slice(0, 3)
    .map(t => (TOPIC_NAMES[t.slug] ?? t.slug).toLowerCase())
  const url = `${ORIGIN}/subject/person/${encodeURIComponent(person.name)}`
  const head = [
    `Today's member: ${person.name}${who ? ` (${who})` : ''}.`,
    `${formatNumber(person.speeches ?? 0)} speeches in ${where}${person.first ? ` since ${person.first}` : ''}.`,
  ]
  const optional = [
    topics.length ? `Talks most about ${joinList(topics)}.` : '',
    'What they said, how they voted and who funds them, side by side:',
  ]
  return {
    date, kind: 'politician', subject: `person:${person.name}`, title: person.name, url,
    text: fit(head, optional, url),
  }
}

interface BillIndexItem {
  key: string
  title: string
  introduced?: string | null
  status?: string | null
  status_as_of?: string | null
  sponsor?: string | null
  sponsor_party?: string | null
  portfolio?: string | null
  has_summary?: boolean
}

function daysBetween(a: string, b: string): number {
  const toDay = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 }
  return Math.abs(toDay(a) - toDay(b))
}

async function billPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const index = await sources.asset('/bills/index.json') as { bills?: BillIndexItem[] } | null
  const bills = (index?.bills ?? []).filter(b => b.has_summary && b.key && b.title && (
    b.status === 'before_parliament' ||
    (b.status === 'passed' && b.status_as_of && daysBetween(b.status_as_of, date) <= 365)
  )).sort((a, b) => a.key.localeCompare(b.key))
  const bill = seededPick(bills, `bill:${date}`, b => `bill:${b.key}`, exclude)
  if (!bill) return null
  const file = await sources.asset(`/bills/${encodeURIComponent(bill.key)}.json`) as { summary?: { sentences?: string[] } } | null
  const sentences = (file?.summary?.sentences ?? []).map(s => s.trim()).filter(Boolean)
  const sponsor = prettySponsor(bill.sponsor)
  const party = prettyParty(bill.sponsor_party)
  const by = sponsor ? ` by ${sponsor}${party ? ` (${party})` : ''}` : (bill.portfolio ? ` (${bill.portfolio} portfolio)` : '')
  const status = bill.status === 'passed'
    ? `Passed ${formatDate(bill.status_as_of)}. Introduced ${formatDate(bill.introduced)}${by}.`
    : `Introduced ${formatDate(bill.introduced)}${by}. Still before parliament.`
  const url = `${ORIGIN}/bill/${encodeURIComponent(bill.key)}`
  return {
    date, kind: 'bill', subject: `bill:${bill.key}`, title: bill.title, url,
    text: fit([bill.title, status], [sentences[0] ?? '', sentences[1] ?? ''], url),
  }
}

interface Report {
  slug: string
  title: string
  blurb?: string
  stats?: { speech_count?: number; unique_speakers?: number }
  voices?: { now?: { speaker: string; party?: string | null; count?: number }[] }
}

async function topicPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const index = await sources.asset('/reports/index.json') as { reports?: { slug: string; title: string }[] } | null
  const slugs = (index?.reports ?? []).map(r => r.slug).filter(Boolean).sort()
  // Walk from the seeded start so a report without speech stats is skipped.
  const start = slugs.length ? seed(`topic:${date}`) % slugs.length : 0
  const skip = new Set(exclude)
  const order = slugs.map((_, i) => slugs[(start + i) % slugs.length])
  for (const slug of [...order.filter(s => !skip.has(`topic:${s}`)), ...order.filter(s => skip.has(`topic:${s}`))]) {
    const report = await sources.asset(`/reports/${encodeURIComponent(slug)}.json`) as Report | null
    const count = report?.stats?.speech_count
    if (!report || !count) continue
    const speakers = report.stats?.unique_speakers
    const voices = (report.voices?.now ?? []).slice(0, 3)
      .map(v => v.party ? `${v.speaker} (${v.party})` : v.speaker)
    const url = `${ORIGIN}/reports/${encodeURIComponent(slug)}`
    const head = [
      `${report.title} in Australia's parliaments: ${formatNumber(count)} speeches${speakers ? ` from ${formatNumber(speakers)} members` : ''}.`,
    ]
    const optional = [
      voices.length ? `Loudest right now: ${joinList(voices)}.` : '',
      report.blurb ?? '',
      'Who says what, and how they voted:',
    ]
    return { date, kind: 'topic', subject: `topic:${slug}`, title: report.title, url, text: fit(head, optional, url) }
  }
  return null
}

const COMPOSERS: Record<DailyPostKind, (date: string, sources: DailyPostSources, exclude: string[]) => Promise<DailyPost | null>> = {
  politician: politicianPost, bill: billPost, topic: topicPost,
}

/** Composes the post for a date; falls back through the other kinds if one has nothing to say. */
export async function composeDailyPost(date: string, sources: DailyPostSources, kind: DailyPostKind = kindFor(date)): Promise<DailyPost | null> {
  const recent = await sources.recent()
  const order = [kind, ...DAILY_POST_KINDS.filter(k => k !== kind)]
  for (const k of order) {
    const post = await COMPOSERS[k](date, sources, recent)
    if (post) return post
  }
  return null
}

// ---------------------------------------------------------------- X API

function percentEncode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** OAuth 1.0a HMAC-SHA1 Authorization header (X API v2 user context). */
export async function oauth1Header(
  method: string, url: string, creds: XCredentials, bodyParams: Record<string, string> = {},
  nonce: string = randomNonce(), timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  }
  const target = new URL(url)
  const pairs: [string, string][] = [
    ...Object.entries(oauth), ...Object.entries(bodyParams), ...target.searchParams.entries(),
  ].map(([k, v]) => [percentEncode(k), percentEncode(v)] as [string, string])
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
  const normalized = pairs.map(([k, v]) => `${k}=${v}`).join('&')
  const base = `${method.toUpperCase()}&${percentEncode(`${target.origin}${target.pathname}`)}&${percentEncode(normalized)}`
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base)))
  oauth.oauth_signature = btoa(String.fromCharCode(...digest))
  return 'OAuth ' + Object.keys(oauth).sort().map(k => `${percentEncode(k)}="${percentEncode(oauth[k])}"`).join(', ')
}

export async function postToX(text: string, creds: XCredentials, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  const url = 'https://api.x.com/2/tweets'
  const authorization = await oauth1Header('POST', url, creds)
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20000),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`X API ${response.status}: ${body.slice(0, 300)}`)
  const data = JSON.parse(body) as { data?: { id?: string } }
  return { id: data.data?.id ?? '' }
}

// ---------------------------------------------------------------- runner

interface DailyPostEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
  GENERATION_CACHE: KVNamespace
  STAGING_API?: unknown
  DAILY_POST_ENABLED?: string
  X_API_KEY?: string
  X_API_SECRET?: string
  X_ACCESS_TOKEN?: string
  X_ACCESS_TOKEN_SECRET?: string
}

export function xCredentials(env: DailyPostEnv): XCredentials | null {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = env
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) return null
  return { apiKey: X_API_KEY, apiSecret: X_API_SECRET, accessToken: X_ACCESS_TOKEN, accessTokenSecret: X_ACCESS_TOKEN_SECRET }
}

const SENT_KEY = (date: string) => `daily-post:sent:${date}`
const RECENT_KEY = 'daily-post:recent'

export function envSources(env: DailyPostEnv, personTopics: (name: string) => Promise<Response>): DailyPostSources {
  return {
    async asset(path) {
      try {
        const response = await env.ASSETS.fetch(new Request(ORIGIN + path))
        return response.ok ? await response.json() : null
      } catch { return null }
    },
    async personTopics(name) {
      try {
        const response = await personTopics(name)
        if (!response.ok) return []
        const data = await response.json() as { profiles?: { all?: { topics?: { slug: string; share: number }[] } } }
        return data.profiles?.all?.topics ?? []
      } catch { return [] }
    },
    async recent() {
      try { return (await env.GENERATION_CACHE.get<string[]>(RECENT_KEY, { type: 'json' })) ?? [] } catch { return [] }
    },
  }
}

export interface DailyPostResult {
  status: 'posted' | 'dry-run' | 'skipped' | 'failed'
  reason?: string
  post?: DailyPost
  id?: string
}

export async function runDailyPost(env: DailyPostEnv, options: {
  personTopics: (name: string) => Promise<Response>
  now?: number
  dryRun?: boolean
  fetchImpl?: typeof fetch
}): Promise<DailyPostResult> {
  if (env.STAGING_API) return { status: 'skipped', reason: 'staging' }
  if (env.DAILY_POST_ENABLED !== 'true') return { status: 'skipped', reason: 'DAILY_POST_ENABLED is not "true"' }
  const date = melbourneDate(options.now ?? Date.now())
  const sent = await env.GENERATION_CACHE.get(SENT_KEY(date)).catch(() => null)
  if (sent) return { status: 'skipped', reason: `already posted ${date}`, id: sent }
  const post = await composeDailyPost(date, envSources(env, options.personTopics))
  if (!post) return { status: 'failed', reason: 'nothing to post' }
  const creds = xCredentials(env)
  if (options.dryRun || !creds) return { status: 'dry-run', reason: creds ? 'dry run' : 'X credentials not set', post }
  try {
    const { id } = await postToX(post.text, creds, options.fetchImpl)
    await env.GENERATION_CACHE.put(SENT_KEY(date), id || 'posted', { expirationTtl: 14 * 86400 })
    const recent = (await env.GENERATION_CACHE.get<string[]>(RECENT_KEY, { type: 'json' }).catch(() => null)) ?? []
    await env.GENERATION_CACHE.put(RECENT_KEY, JSON.stringify([...recent, post.subject].slice(-RECENT_WINDOW)))
    return { status: 'posted', post, id }
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error), post }
  }
}
