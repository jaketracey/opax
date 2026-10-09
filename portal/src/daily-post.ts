/**
 * A daily source-based edition: politician statistics, bills, grants and topics.
 * All facts come from the site's published records; no model runs at post time.
 * social-publication.ts freezes the edition and records each channel delivery.
 * See docs/DAILY-POST.md for connection and preview instructions.
 */
import { personSlug, slugIndex } from './person-slug'
import { TOPIC_NAMES } from './topic-names.mjs'
import { shortMoney as compactMoney } from '../public/format.js'
import { photosFor, photoFor, validStory, type PhotoCatalogue, type StorySlide, type StoryPhoto } from './story'

export const DAILY_POST_KINDS = ['politician', 'bill', 'grant', 'topic', 'program', 'largest'] as const
export type DailyPostKind = typeof DAILY_POST_KINDS[number]

/**
 * The week, Sunday first (the Melbourne calendar day). Three of seven days are
 * public money: a program told by seat on Monday, one award on Wednesday, the
 * month's largest awards on Friday (once a month; the other Fridays fall back
 * to an award). The rest are bills, a member and a topic.
 */
export const WEEK: readonly DailyPostKind[] = ['bill', 'program', 'politician', 'grant', 'bill', 'largest', 'topic']
/** Where a kind with nothing to say hands over, in order. */
const FALLBACK: Record<DailyPostKind, DailyPostKind[]> = {
  politician: ['bill', 'topic', 'grant', 'program', 'largest'],
  bill: ['politician', 'topic', 'grant', 'program', 'largest'],
  grant: ['program', 'topic', 'bill', 'politician', 'largest'],
  topic: ['politician', 'bill', 'grant', 'program', 'largest'],
  program: ['grant', 'topic', 'bill', 'politician', 'largest'],
  largest: ['grant', 'topic', 'bill', 'politician', 'program'],
}

export interface DailyPost {
  date: string
  kind: DailyPostKind
  /** Stable id used to avoid featuring the same subject twice in a season. */
  subject: string
  title: string
  text: string
  url: string
  /** Longer, source-qualified copy for Facebook and Instagram. */
  caption?: string
  /**
   * The edition as a carousel (see story.ts): a cover, one fact a slide, the
   * source last. Absent on editions stored before carousels existed, which
   * then post as the single card.
   */
  slides?: StorySlide[]
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// ---------------------------------------------------------------- helpers

/** Calendar date in Melbourne as YYYY-MM-DD; the cron fires in UTC. */
export function melbourneDate(at: number | Date = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at)
}

/** The kind for a calendar day, by weekday (see WEEK). */
export function kindFor(date: string): DailyPostKind {
  const [y, m, d] = date.split('-').map(Number)
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** Days since 1970-01-01 for a YYYY-MM-DD date. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * Which government's programs a program edition draws from: the two alternate
 * week by week (weeks start on Monday), so the run is balanced by construction
 * rather than by whichever list is longer. A program awarded under both is in
 * both lists.
 */
export function programEraFor(date: string): 'Coalition' | 'Labor' {
  const week = Math.floor((dayNumber(date) + 3) / 7)
  return week % 2 === 0 ? 'Coalition' : 'Labor'
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
  return null
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

/** Cuts text to `limit` characters at a word boundary with an ellipsis. */
export function clip(text: string, limit: number): string {
  const chars = [...text]
  if (chars.length <= limit) return text
  const cut = chars.slice(0, Math.max(0, limit - 1)).join('')
  const atWord = cut.replace(/\s+\S*$/, '')
  return (atWord.length >= limit * 0.6 ? atWord : cut).replace(/[\s,;:]+$/, '') + '…'
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


// ---------------------------------------------------------------- the story

/** A headline's dollars: the site's one short form from a million up ($11.3m, $1.45bn), exact below ($77,770). */
export function shortMoney(amount: number): string {
  return amount >= 1e6 ? compactMoney(amount) : formatMoney(amount)
}

/** "The Trustee for the Qantas Foundation Memorial Trust" → "Qantas Foundation Memorial Trust". */
export function shortRecipient(name: string): string {
  return name.replace(/^the trustee for (the )?/i, '').replace(/^the /i, '').trim()
}

/** "Department of Infrastructure, Transport, ..." → "Infrastructure, Transport, ..."; the ledger has little room. */
function shortAgency(name: string | null | undefined): string {
  return (name ?? '').replace(/^Department of (the )?/i, '').replace(/^National /, '').trim()
}

function stateCode(st: string | null | undefined): string {
  return (st ?? '').toUpperCase()
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
/** 55 → "Fifty-five"; past ninety-nine the digits stand. */
export function dayWords(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n)
  if (n < 20) return ONES[n]
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10].toLowerCase()}` : ''}`
  return formatNumber(n)
}

function sentenceCase(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/** The story's photographs, and the caption line they earn. */
interface StoryPhotos { catalogue: PhotoCatalogue | null; used: StoryPhoto[] }

async function photoCatalogue(sources: DailyPostSources): Promise<PhotoCatalogue | null> {
  const data = await sources.asset('/social/photos.json').catch(() => null) as PhotoCatalogue | null
  return data && typeof data === 'object' && data.photos && typeof data.photos === 'object' ? data : null
}

/** One paragraph crediting every photograph the slides use, before the URL that closes the caption. */
export function creditParagraph(used: StoryPhoto[]): string {
  const credits = [...new Set(used.map(p => p.credit.trim()))]
  if (!credits.length) return ''
  const line = (c: string) => `${c.replace(/\.?$/, '')}.`
  // Two photographs under one credit: "Photos: …"; one: "Photo: …"; otherwise each credit in turn.
  if (credits.length === 1) return used.length > 1 ? line(credits[0].replace(/^Photo:\s*/i, 'Photos: ')) : line(credits[0])
  return credits.map(line).join(' ')
}

function withCredits(caption: string | undefined, url: string, used: StoryPhoto[]): string | undefined {
  const paragraph = creditParagraph(used)
  if (!caption || !paragraph) return caption
  const tail = `\n\n${url}`
  return caption.endsWith(tail) ? `${caption.slice(0, -tail.length)}\n\n${paragraph}${tail}` : `${caption}\n\n${paragraph}`
}

/** Attaches the slides when they make a story; otherwise the edition posts as the single card. */
function told(post: DailyPost, slides: (StorySlide | null)[], photos: StoryPhotos): DailyPost {
  const kept = slides.filter((s): s is StorySlide => !!s)
  if (!validStory(kept)) return post
  return { ...post, caption: withCredits(post.caption, post.url, photos.used), slides: kept }
}

/** Takes the n-th approved photograph for the edition, remembering it for the credit line. */
function takePhoto(photos: StoryPhotos, ids: string[], n: number): string | null {
  const id = ids[n]
  const photo = photoFor(photos.catalogue, id)
  if (!photo) return null
  photos.used.push(photo)
  return id
}

const sourceSlide = (kicker: string, title: string, rows: string[], url: string, path: string, alt: string): StorySlide =>
  ({ type: 'source', kicker, title, rows: rows.filter(Boolean).slice(0, 4), url, path, alt })

/** The grants graph, read once per edition: the recipient shards, the programs and the electorates. */
interface GrantsGraph {
  recipients?: { id: string; n: string; sh: number }[]
  programs?: { id?: string; n: string; t?: number; c?: number; cnc?: number; y0?: string; y1?: string }[]
  electorates?: { n: string; st?: string; t?: number; c?: number; r?: number; mps?: [string, string | null, string | null, string | null][]; margin?: Record<string, [number, string, string]> }[]
}
async function grantsGraph(sources: DailyPostSources): Promise<GrantsGraph | null> {
  const graph = await sources.asset('/graph/grants.federal.json').catch(() => null) as GrantsGraph | null
  return graph && typeof graph === 'object' ? graph : null
}

/** One award as the recipient's source shard records it. */
interface ShardAward { id: string; v: number; n?: string; desc?: string; s?: string; guid?: string; ag?: string; pr?: string; cat?: string; fy?: string; sel?: string; el?: string }
interface ShardRecipient { n?: string; t?: number; c?: number; abr?: { state?: string }; grants?: ShardAward[] }

async function recipientShard(sources: DailyPostSources, graph: GrantsGraph | null, recipientId: string): Promise<ShardRecipient | null> {
  const recipient = graph?.recipients?.find(r => r.id === recipientId)
  if (!recipient || !Number.isInteger(recipient.sh)) return null
  const fileKey = recipientId.toLowerCase().replace(':', '-').replace(/[^a-z0-9-]+/g, '-').replace(/-+$/g, '')
  const shard = await sources.asset(`/grants/federal/shard-${String(recipient.sh).padStart(2, '0')}.json`).catch(() => null) as Record<string, ShardRecipient> | null
  return shard?.[fileKey] ?? null
}

/** The electorate slide: the seat's federal awards in the record, and who holds it. */
function electorateSlide(kicker: string, graph: GrantsGraph | null, name: string | null | undefined, line?: string): StorySlide | null {
  if (!name) return null
  const seat = graph?.electorates?.find(e => e.n === name)
  if (!seat || !Number.isFinite(seat.t) || !seat.t || !seat.c) return null
  const mp = seat.mps?.[0]
  const years = Object.keys(seat.margin ?? {}).sort()
  const latest = years.length ? seat.margin![years[years.length - 1]] : null
  const held = mp?.[0] ? `Held by ${mp[0]}${mp[1] ? `, ${prettyParty(mp[1])}` : ''}.${latest ? ` ${sentenceCase(latest[2])} seat, margin ${latest[0]} at the ${years[years.length - 1]} election.` : ''}` : ''
  const label = `in federal grant awards in the record: ${formatNumber(seat.c)} awards${seat.r ? ` to ${formatNumber(seat.r)} recipients` : ''}`
  return { type: 'number', kicker, title: name, lines: [line ?? held].filter(Boolean), value: shortMoney(seat.t as number), label,
    alt: `${kicker}: ${name}, ${shortMoney(seat.t as number)} ${label}. ${line ?? held}`.trim() }
}

/** How an award was chosen, against the whole program it came from. */
function selectionSlide(award: ShardAward, graph: GrantsGraph | null): StorySlide | null {
  const sel = (award.sel ?? '').trim()
  const program = award.pr ? graph?.programs?.find(p => p.n === award.pr) : null
  if (!sel || !program || !program.t || !Number.isFinite(program.cnc)) return null
  const share = Math.round((program.cnc as number) / program.t * 100)
  const closed = /closed/i.test(sel) && /non-?competitive/i.test(sel)
  const title = closed ? 'Closed, non-competitive' : sentenceCase(sel.toLowerCase())
  const explain = closed
    ? `No open round: the department decided who could apply. Of the ${shortMoney(program.t)} this program awarded, ${shortMoney(program.cnc as number)} went the same way.`
    : `This award was selected by ${sel.toLowerCase()}. Of the ${shortMoney(program.t)} the program awarded, ${shortMoney(program.cnc as number)} was closed and non-competitive.`
  const note = `Program figures: ${program.n}, ${formatNumber(program.c ?? 0)} awards${program.y0 ? ` from ${program.y0}${program.y1 && program.y1 !== program.y0 ? ` to ${program.y1}` : ''}` : ''}, ${shortMoney(program.t)} in total.`
  return { type: 'bars', kicker: 'How it was chosen', title, lines: [explain],
    items: [{ label: 'Closed non-competitive', pct: share }, { label: 'Everything else', pct: Math.max(0, 100 - share) }], note,
    alt: `How it was chosen: ${title.toLowerCase()}. ${share} per cent of ${program.n}, ${shortMoney(program.cnc as number)} of ${shortMoney(program.t)}, was awarded without an open round.` }
}

/** The recipient's other awards, when there are any. */
function siblingsSlide(recipient: ShardRecipient | null): StorySlide | null {
  const awards = (recipient?.grants ?? []).filter(g => Number.isFinite(g.v) && g.v > 0 && (g.fy || g.s))
  if (awards.length < 2) return null
  const agencies = new Set(awards.map(g => g.ag).filter(Boolean))
  const rows = [...awards].sort((a, b) => (a.fy ?? a.s ?? '').localeCompare(b.fy ?? b.s ?? '') || b.v - a.v).slice(0, 5)
    // The description column holds about two rows of forty characters on the
    // slide, so the purpose and the agency are each cut here, on a word, rather
    // than letting the renderer cut the pair mid-way.
    .map(g => ({ c1: g.fy ?? formatDate(g.s), c2: [clip(String(g.desc || g.n || '').replace(/\s+/g, ' ').trim(), 46), clip(shortAgency(g.ag), 28)].filter(Boolean).join(' · '), amount: formatMoney(g.v) }))
  const total = awards.reduce((sum, g) => sum + g.v, 0)
  const title = `${dayWords(awards.length)} awards, ${agencies.size > 1 ? `${dayWords(agencies.size).toLowerCase()} departments` : 'one department'}`
  return { type: 'ledger', kicker: 'The same recipient', title, lines: [], rows,
    total: { label: awards.length > rows.length ? `${formatNumber(awards.length)} awards in the record` : 'In the record', amount: formatMoney(total) },
    alt: `The same recipient: ${title.toLowerCase()}, ${formatMoney(total)} in the record.` }
}

// ---------------------------------------------------------------- composers

interface Person {
  name: string
  speeches?: number
  current?: boolean
  party?: string | null
  party_now?: string | null
  first?: number
  last?: number
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
  const topics = (await sources.personTopics(person.name))
    .filter(t => Number.isFinite(t.share) && t.share > 0 && t.share <= 1)
    .sort((a, b) => b.share - a.share).slice(0, 3)
  const topicText = topics.map(t => `${TOPIC_NAMES[t.slug] ?? t.slug} ${Math.round(t.share * 100)}%`)
  const url = `${ORIGIN}/subject/person/${slugIndex((roster?.people || []).map(p => ({ ...p, speeches: p.speeches ?? null }))).slugOf.get(person.name) || personSlug(person.name)}`
  const head = [
    `${person.name}: ${formatNumber(person.speeches ?? 0)} speeches in the Opax record.`,
    topics.length ? `Top topic labels: ${topicText.slice(0, 2).join('; ')}.` : [who, person.first ? `Records from ${person.first}${person.last ? ` to ${person.last}` : ''}.` : ''].filter(Boolean).join('\n'),
    topics.length ? 'Shares of labelled speeches; labels overlap.' : '',
  ]
  const optional = [
    topics.length && person.first ? `Records: ${person.first}${person.last ? `–${person.last}` : ' onwards'}.` : '',
  ]
  const post: DailyPost = {
    date, kind: 'politician', subject: `person:${person.name}`, title: person.name, url,
    text: fit(head, optional, url),
    caption: [head[0], who, `Collected parliamentary records${person.first ? `, ${person.first}${person.last ? `–${person.last}` : ' onwards'}` : ''}.`, topics.length ? `Most common topic labels:\n${topicText.map(t => `• ${t}`).join('\n')}` : '', 'What do those speeches actually say? Explore the record and its sources.', topics.length ? 'Topic shares cover labelled speeches, not all activity; a speech can have several labels.' : 'Speech counts describe Opax’s collected records, not all parliamentary activity.', url].filter(Boolean).join('\n\n'),
  }
  const photos: StoryPhotos = { catalogue: await photoCatalogue(sources), used: [] }
  const ids = photosFor(photos.catalogue, `person:${person.name}`, 'politician')
  const house = rep.chamber === 'senate' ? 'Senate' : 'House of Representatives'
  const place = rep.chamber === 'senate' ? (rep.state ? `Senator for ${rep.state}` : 'Senate') : [rep.electorate, rep.state].filter(Boolean).join(', ')
  const span = person.first ? `${person.first}${person.last ? ` to ${person.last}` : ' onwards'}` : ''
  const speeches = formatNumber(person.speeches ?? 0)
  const inset = await portraitInset(sources, person.name)
  const cover: StorySlide = { type: 'cover', kicker: `Parliamentarian${place ? ` · ${place}` : ''}`, title: person.name,
    line: [party, house, span ? `records ${span}` : ''].filter(Boolean).join(' · '), photo: takePhoto(photos, ids, 0), inset: inset?.id ?? null, insetCredit: inset?.credit ?? null,
    alt: `${person.name}, ${[party, seatLine(rep)].filter(Boolean).join(', ')}.` }
  const count: StorySlide = { type: 'number', kicker: 'The record', title: 'What OPAX holds',
    lines: [span ? `Collected parliamentary records, ${span}.` : 'Collected parliamentary records.', 'Counts describe the collected record, not all parliamentary activity.'],
    value: speeches, label: 'speeches in the Opax record', alt: `The record: ${speeches} speeches by ${person.name} in the Opax record${span ? `, ${span}` : ''}.` }
  const bars: StorySlide | null = topics.length ? { type: 'bars', kicker: 'What they talk about', title: 'Most common topic labels', lines: [],
    items: topics.map(t => ({ label: TOPIC_NAMES[t.slug] ?? t.slug, pct: Math.round(t.share * 100) })),
    note: 'Shares of labelled speeches; a speech can carry several labels.',
    alt: `Most common topic labels: ${topics.map(t => `${TOPIC_NAMES[t.slug] ?? t.slug} ${Math.round(t.share * 100)} per cent`).join(', ')} of labelled speeches.` } : null
  const graph = rep.chamber === 'senate' || !rep.electorate ? null : await grantsGraph(sources)
  const heldSeat = graph?.electorates?.find(e => e.n === rep.electorate && (e.mps ?? []).some(m => m[0] === person.name)) ? rep.electorate : null
  const grants = electorateSlide("The electorate's grants", graph, heldSeat, 'Federal grant awards published on GrantConnect, as collected by OPAX.')
  const source = sourceSlide('Read the speeches', `What do ${speeches} speeches actually say?`,
    ['Every speech in the record is cited back to Hansard', 'Topic labels, votes, declared interests and the money map on one page', 'Hansard: Commonwealth copyright, reproduced under CC BY-NC-ND'],
    url.replace(/^https:\/\//,''), new URL(url).pathname, `Read the speeches at opax.com.au, subject: ${person.name}.`)
  return told(post, [cover, count, bars, grants, source], photos)
}

function seatLine(rep: NonNullable<Person['representation']>[number]): string {
  return rep.chamber === 'senate' ? (rep.state ? `Senator for ${rep.state}` : 'Senator') : (rep.electorate ? `Member for ${rep.electorate}` : '')
}

/** The person's portrait for the cover inset, with the credit its licence requires. */
async function portraitInset(sources: DailyPostSources, name: string): Promise<{ id: string; credit: string } | null> {
  const map = await sources.asset('/photos/people.json').catch(() => null) as Record<string, string> | null
  const id = map?.[name.trim().toLowerCase()]
  if (!id || !/^[\w-]+$/.test(id)) return null
  if (/^\d+$/.test(id)) return { id, credit: 'Portrait: Parliament of Australia via OpenAustralia' }
  if (!id.startsWith('wd-')) return null
  const credits = await sources.asset('/photos/credits.json').catch(() => null) as Record<string, { artist?: string; credit?: string; licence?: string }> | null
  const c = credits?.[id]
  if (!c) return null
  const who = c.artist || c.credit || 'author not recorded'
  return { id, credit: `Portrait: ${who}${c.licence ? `, ${c.licence}` : ''}, via Wikimedia Commons` }
}

interface BillIndexItem {
  key: string
  title: string
  short_title?: string | null
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
  return toDay(b) - toDay(a)
}

async function billPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const index = await sources.asset('/bills/index.json') as { bills?: BillIndexItem[] } | null
  const relevantDate = (b: BillIndexItem) => b.status === 'passed' ? b.status_as_of : b.introduced
  const bills = (index?.bills ?? []).filter(b => {
    const at = relevantDate(b)
    return b.has_summary && b.key && b.title && at && /^\d{4}-\d{2}-\d{2}$/.test(at.slice(0, 10)) &&
      daysBetween(at, date) >= 0 && daysBetween(at, date) <= 365 &&
      ['before_parliament', 'exposure_draft', 'passed'].includes(b.status ?? '') && !exclude.includes(`bill:${b.key}`)
  }).sort((a, b) => (relevantDate(b) ?? '').localeCompare(relevantDate(a) ?? '') || a.key.localeCompare(b.key)).slice(0, 14)
  let bill: BillIndexItem | null = null
  let record: BillFile | null = null
  let sentences: string[] = []
  const tried: string[] = []
  for (let i = 0; i < Math.min(bills.length, 8); i++) {
    const candidate = seededPick(bills, `bill:${date}`, b => b.key, tried)
    if (!candidate) break
    tried.push(candidate.key)
    const file = await sources.asset(`/bills/${encodeURIComponent(candidate.key)}.json`) as BillFile | null
    const summary = (file?.summary?.sentences ?? []).map(s => s.trim()).filter(Boolean)
    if (!summary[0] || summary[0].length < 30) continue
    bill = candidate; record = file; sentences = summary; break
  }
  if (!bill) return null
  const sponsor = prettySponsor(bill.sponsor)
  const party = prettyParty(bill.sponsor_party)
  const by = sponsor ? ` by ${sponsor}${party ? ` (${party})` : ''}` : (bill.portfolio ? ` (${bill.portfolio} portfolio)` : '')
  const status = bill.status === 'exposure_draft'
    ? `Exposure draft released ${formatDate(bill.introduced)}${by}. Not yet introduced to parliament.`
    : bill.status === 'passed'
    ? `Passed ${formatDate(bill.status_as_of)}. Introduced ${formatDate(bill.introduced)}${by}.`
    : `Introduced ${formatDate(bill.introduced)}${by}. Still before parliament.`
  const url = `${ORIGIN}/bill/${encodeURIComponent(bill.key)}`
  const statusShort = bill.status === 'exposure_draft' ? `Draft released ${formatDate(bill.introduced)}; not introduced.`
    : bill.status === 'passed' ? `Passed ${formatDate(bill.status_as_of)}.` : `Introduced ${formatDate(bill.introduced)}; before parliament.`
  const post: DailyPost = {
    date, kind: 'bill', subject: `bill:${bill.key}`, title: bill.title, url,
    text: fit([clip(sentences[0], 145), statusShort], [clip(bill.short_title || bill.title, 75)], url),
    caption: [sentences[0], bill.title, status, sentences.length > 1 ? `What else is in the bill?\n${sentences.slice(1, 3).map(s => `• ${s}`).join('\n')}` : '', 'Read the bill, its progress and the source documents.', 'Machine-written summary; check the bill text for the full detail.', url].filter(Boolean).join('\n\n'),
  }
  const story = await billSlides(sources, bill, record, sentences, { sponsor, party, statusShort })
  return told(post, story.slides, story.photos)
}

interface BillDivision { key?: string; date?: string; house?: string; stage?: string; ayes?: number; noes?: number; outcome?: string; party_splits?: Record<string, { ayes?: number; noes?: number }> }
interface BillFile {
  originating_house?: string | null
  summary?: { sentences?: string[]; affected?: string | null; attribution?: string | null }
  key_dates?: { stage?: string; date?: string; house?: string }[]
  divisions?: BillDivision[]
  speeches?: { speaker?: string; date?: string }[]
  sources?: { kind?: string; licence?: string | null }[]
}

const HOUSE_NAMES: Record<string, string> = { senate: 'Senate', representatives: 'House of Representatives' }
const STAGE_TITLES: Record<string, string> = { 'limitation of debate': 'Limiting debate', 'second reading': 'Second reading', 'third reading': 'Third reading', 'first reading': 'First reading' }
const SOURCE_LABELS: Record<string, string> = {
  em: 'Explanatory memorandum on ParlInfo', em_supp: 'Supplementary explanatory memorandum on ParlInfo', em_revised: 'Revised explanatory memorandum on ParlInfo',
  billhome: 'Bill home page on ParlInfo', frl_act: 'The Act on the Federal Register of Legislation', frl: 'The Federal Register of Legislation',
}


async function billSlides(sources: DailyPostSources, bill: BillIndexItem, record: BillFile | null, sentences: string[], words: { sponsor: string; party: string; statusShort: string }): Promise<{ slides: (StorySlide | null)[]; photos: StoryPhotos }> {
  const catalogue = await photoCatalogue(sources)
  const billPhotos: StoryPhotos = { catalogue, used: [] }
  const divisions = (record?.divisions ?? []).filter(d => Number.isFinite(d.ayes) && Number.isFinite(d.noes) && d.date)
  const latest = [...divisions].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0] ?? null
  const house = latest?.house ?? record?.originating_house ?? null
  const ids = photosFor(catalogue, `bill:${bill.key}`, 'bill', house)
  const kicker = words.sponsor ? `Bill · ${words.sponsor}${words.party ? ` (${words.party})` : ''}` : bill.portfolio ? `Bill · ${bill.portfolio} portfolio` : 'Bill'
  // The headline is the bill's own name without its "Bill 2026" tail: always
  // grammatical, where a clipped summary sentence is not. The sentence is the line.
  const headline = (bill.short_title || bill.title).replace(/\s+Bill\s+(?:\(No\.?\s*\d+\)\s+)?\d{4}(?:\s+\[.*\])?$/i, '').replace(/\s+/g, ' ').trim() || bill.title
  const cover: StorySlide = { type: 'cover', kicker, title: clip(headline, 84), line: `${clip(sentences[0], 150)} ${words.statusShort}`, photo: takePhoto(billPhotos, ids, 0),
    alt: `${bill.title}. ${sentences[0]} ${words.statusShort}` }
  const what: StorySlide = { type: 'list', kicker: 'What it does', title: `In ${dayWords(Math.min(3, sentences.length)).toLowerCase()} sentence${sentences.length > 1 ? 's' : ''}`,
    items: sentences.slice(0, 3), note: record?.summary?.attribution ? `${record.summary.attribution.replace(/\.?$/, '')}.` : 'Written by a model from the explanatory memorandum; not the record.',
    alt: `What it does: ${sentences.slice(0, 3).join(' ')}` }
  const timeline = billTimeline(record)
  const division = latest ? divisionSlide(latest, divisions.length) : null
  const affected = (record?.summary?.affected ?? '').trim()
  const speeches = record?.speeches ?? []
  const first = speeches.filter(sp => sp.speaker && sp.date).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0]
  const secondPhoto = affected ? takePhoto(billPhotos, ids, 1) : null
  const touches: StorySlide | null = affected && secondPhoto ? { type: 'picture', kicker: 'Who it touches', title: clip(affected.replace(/\.$/, ''), 96), photo: secondPhoto, quote: null,
    lines: [speeches.length ? `Speeches in the record: ${formatNumber(speeches.length)}${first ? `, beginning with ${first.speaker} on ${formatDate(first.date)}` : ''}.` : ''].filter(Boolean),
    alt: `Who it touches: ${affected}${speeches.length ? ` Speeches in the record: ${speeches.length}.` : ''}` } : null
  const rows = [...new Map((record?.sources ?? []).filter(src => src.kind && SOURCE_LABELS[src.kind]).map(src => [SOURCE_LABELS[src.kind as string], `${SOURCE_LABELS[src.kind as string]}${src.licence ? `, ${src.licence}` : ''}`])).values()].slice(0, 3)
  if (divisions.length) rows.push('Division record: theyvoteforyou.org.au')
  const source = sourceSlide('Read the bill', 'The bill, its progress and the source documents', rows.length ? rows : ['Bill documents on ParlInfo, Commonwealth copyright'],
    'opax.com.au/bill', bill.key, `Read the bill at opax.com.au/bill/${bill.key}.`)
  return { slides: [cover, what, timeline, division, touches, source], photos: billPhotos }
}

/** The passage of the bill in at most five dated stages. */
function billTimeline(record: BillFile | null): StorySlide | null {
  const dates = (record?.key_dates ?? []).filter(d => d.stage && /^\d{4}-\d{2}-\d{2}$/.test(d.date ?? ''))
  if (dates.length < 2) return null
  const houseOf = (h?: string) => HOUSE_NAMES[h ?? ''] ?? ''
  const firstHouse = record?.originating_house ?? dates[0].house
  const pick = (test: (d: { stage?: string; house?: string }) => boolean) => dates.find(test) ?? null
  const events: { date: string; text: string }[] = []
  const push = (d: { date?: string; house?: string } | null, text: string) => { if (d && !events.some(e => e.date === d.date && e.text === text)) events.push({ date: formatDate(d.date), text }) }
  const introduced = pick(d => d.stage === 'introduced')
  push(introduced, `Introduced${houseOf(introduced?.house) ? ` in the ${houseOf(introduced?.house)}` : ''}`)
  const third = pick(d => d.stage === 'third_reading' && d.house === firstHouse)
  push(third, `Third reading${houseOf(third?.house) ? `, ${houseOf(third?.house)}` : ''}`)
  const second = pick(d => d.stage === 'introduced' && d.house !== firstHouse)
  push(second, `Introduced in the ${houseOf(second?.house) || 'other house'}`)
  const passed = pick(d => d.stage === 'passed')
  push(passed, `Passed${houseOf(passed?.house) ? ` the ${houseOf(passed?.house)}` : ''}`)
  const assent = pick(d => d.stage === 'royal_assent')
  push(assent, 'Royal Assent')
  if (events.length < 2) return null
  const sorted = [...dates].map(d => d.date as string).sort()
  const days = daysBetween(sorted[0], sorted[sorted.length - 1])
  const title = days > 0 ? `${dayWords(days)} day${days === 1 ? '' : 's'}` : 'One sitting day'
  return { type: 'timeline', kicker: 'How it moved', title, lines: [], events: events.slice(0, 5),
    alt: `How it moved: ${events.map(e => `${e.text.toLowerCase()} ${e.date}`).join(', ')}.` }
}

function divisionSlide(d: BillDivision, count: number): StorySlide | null {
  const ayes = d.ayes as number, noes = d.noes as number
  const split = (side: 'ayes' | 'noes'): [string, number][] => Object.entries(d.party_splits ?? {}).map(([party, n]) => [prettyParty(party), Number(n?.[side] ?? 0)] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const stage = (d.stage ?? '').trim()
  const title = `${STAGE_TITLES[stage.toLowerCase()] ?? (stage ? sentenceCase(stage) : 'Division')}, ${ayes} to ${noes}`
  const house = HOUSE_NAMES[d.house ?? ''] ?? 'Parliament'
  const kicker = count === 1 ? 'The only recorded division' : `The latest of ${dayWords(count).toLowerCase()} recorded divisions`
  const ayeParties = split('ayes'), noParties = split('noes')
  return { type: 'division', kicker, title, ayes, noes, ayeParties, noParties, line: `${house}, ${formatDate(d.date)}. Party split from They Vote For You.`,
    alt: `${kicker}: ${title.toLowerCase()}. Ayes: ${ayeParties.map(([p, n]) => `${p} ${n}`).join(', ') || ayes}. Noes: ${noParties.map(([p, n]) => `${p} ${n}`).join(', ') || noes}. ${house}, ${formatDate(d.date)}.` }
}

export interface GrantPublicationRecord {
  id: string; recipientId: string; recipient: string; amount: number; start: string
  purpose: string; agency?: string; program?: string; category?: string; sourceUrl: string
}
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
}

async function grantPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const catalog = await sources.asset('/social/grants.json') as { grants?: GrantPublicationRecord[] } | null
  const all = catalog?.grants ?? []
  const recentRecipients = new Set(all.filter(g => exclude.includes(`grant:${g.id}`)).map(g => g.recipientId))
  const grants = all.filter(g => /^GA\d+(?:-A\d+)?$/.test(g.id) && /^abn:\d{11}$/.test(g.recipientId) &&
    Number.isFinite(g.amount) && g.amount > 0 && g.purpose?.length >= 55 &&
    /^\d{4}-\d{2}-\d{2}$/.test(g.start) && daysBetween(g.start, date) >= 0 && daysBetween(g.start, date) <= 120 &&
    !recentRecipients.has(g.recipientId) && /^https:\/\/www\.grants\.gov\.au\/Ga\/Show\//.test(g.sourceUrl))
    .sort((a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id)).slice(0, 14)
  const grant = seededPick(grants, `grant:${date}`, g => `grant:${g.id}`, exclude)
  if (!grant) return null
  // The story needs the recipient's shard (selection, electorate, other awards); the words do not.
  const graph = await grantsGraph(sources)
  const recipient = await recipientShard(sources, graph, grant.recipientId)
  const award = recipient?.grants?.find(g => g.id === grant.id) ?? null
  return grantEdition(date, grant, { sources, graph, recipient, award })
}

interface GrantContext { sources: DailyPostSources; graph: GrantsGraph | null; recipient: ShardRecipient | null; award: ShardAward | null }

/** GrantConnect's stock openings; what follows is the record's own wording. */
const PURPOSE_OPENERS = [
  /^the (?:project|activity|grant) will (?:deliver|provide|support|fund)\s+/i,
  /^this (?:project|activity|grant) will (?:deliver|provide|support|fund)\s+/i,
  /^the (?:purpose of (?:the|this) (?:project|grant|activity) is|project is|activity is)\s+/i,
  // "The project will redevelop Windsor Park": the verb stays, as "to redevelop".
  /^(?:the|this) (?:project|activity|grant) will\s+(?=[a-z])/i,
]
const PURPOSE_VERBS = /^(construct|build|deliver|upgrade|install|develop|support|provide|redevelop|replace|refurbish|establish|expand|improve|design|purchase|undertake|create|restore|renew|extend|enhance|implement|conduct|assist|enable|strengthen|reduce|promote|repair|rebuild|relocate)\s+(?!for\b|of\b)/i

/** The purpose's first sentence without GrantConnect's "The project will deliver" opening. */
export function purposePhrase(text: string | null | undefined): string {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim()
  for (const re of PURPOSE_OPENERS) t = t.replace(re, '')
  t = t.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? t
  return t.replace(/\.$/, '').trim()
}

/** "$10m grant for the redevelopment of the Kogarah War Memorial Pool": the amount, then the record's words. */
export function grantHook(amount: number, purpose: string | null | undefined): string {
  const money = shortMoney(amount)
  const p = purposePhrase(purpose)
  if (!p) return `${money} grant`
  if (/^to\s/i.test(p)) return `${money} grant ${p}`
  if (PURPOSE_VERBS.test(p)) return `${money} grant to ${p[0].toLowerCase()}${p.slice(1)}`
  if (/^(the|a|an)\s/i.test(p) || /^[a-z]/.test(p)) return `${money} grant for ${p[0].toLowerCase()}${p.slice(1)}`
  return `${money} grant: ${p}`
}

/** How the award was chosen, in words, from GrantConnect's selection process field. */
export function selectionLine(sel: string | null | undefined): string {
  const s = (sel ?? '').trim()
  if (!s) return ''
  if (/closed/i.test(s) && /non-?competitive/i.test(s)) return 'No open round: closed, non-competitive.'
  return `Selection: ${s.toLowerCase()}.`
}

/**
 * A recipient id as a path segment that reads cleanly in a post: "abn:83140439239", not
 * "abn%3A83140439239". A colon is legal in a path segment, the route decodes either form,
 * and the share card answers with the path as requested, so the publisher's check still matches.
 */
export function recipientSegment(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ':')
}

/** The edition for one award record: the same words whether the rotation or an operator chose it. */
async function grantEdition(date: string, grant: GrantPublicationRecord, context: GrantContext): Promise<DailyPost> {
  const url = `${ORIGIN}/money/grants/federal/recipient/${recipientSegment(grant.recipientId)}?award=${encodeURIComponent(grant.id)}`
  const recipientLine = `Recipient: ${clip(shortRecipient(grant.recipient), 60)}. Agreement from ${formatDate(grant.start)} (award value, not payments).`
  const selection = selectionLine(context.award?.sel)
  // How it was chosen outranks the tail of the purpose: the hook gives way (to no less than 80 characters) so it fits.
  const hookRoom = selection ? Math.max(80, X_LIMIT - xLength([recipientLine, selection, url].join('\n\n')) - 3) : 140
  const hook = `${clip(grantHook(grant.amount, grant.purpose), Math.min(140, hookRoom))}.`.replace(/…\.$/, '…')
  const post: DailyPost = { date, kind: 'grant', subject: `grant:${grant.id}`, title: `${grant.id}: ${grant.recipient}`, url,
    text: fit([hook, recipientLine], [selection, grant.program ? `Program: ${clip(grant.program, 70)}.` : ''], url),
    caption: [`Follow the grant: ${formatMoney(grant.amount)} in published grant funding for ${grant.recipient}.`, grant.purpose,
      [grant.program ? `Program: ${grant.program}` : '', grant.agency ? `Agency: ${grant.agency}` : '', `Agreement starts: ${formatDate(grant.start)}`, `Award: ${grant.id}`].filter(Boolean).join('\n'),
      selectionLine(context.award?.sel),
      'What is the funding intended to deliver? Read the award and its original GrantConnect record.',
      'This is a published award value, not evidence of payments received.', url].filter(Boolean).join('\n\n') }
  const story = await grantSlides(grant, context)
  return told(post, story.slides, story.photos)
}


async function grantSlides(grant: GrantPublicationRecord, { sources, graph, recipient, award }: GrantContext): Promise<{ slides: (StorySlide | null)[]; photos: StoryPhotos }> {
  const catalogue = await photoCatalogue(sources)
  const grantPhotos: StoryPhotos = { catalogue, used: [] }
  const ids = photosFor(catalogue, `grant:${grant.id}`, 'grant')
  const seat = award?.el ?? null
  const state = stateCode(graph?.electorates?.find(e => e.n === seat)?.st ?? recipient?.abr?.state)
  const place = seat ? `${seat}${state ? `, ${state}` : ''}` : state
  const short = shortMoney(grant.amount)
  const who = shortRecipient(grant.recipient)
  const cover: StorySlide = { type: 'cover', kicker: `Grant award${place ? ` · ${place}` : ''}`, title: clip(`${short} for ${who}`, 64),
    line: clip(grant.purpose, 150), photo: takePhoto(grantPhotos, ids, 0),
    alt: `Grant award: ${formatMoney(grant.amount)} for ${grant.recipient}. ${grant.purpose}` }
  const number: StorySlide = { type: 'number', kicker: 'The award', title: 'What the record says',
    lines: [[grant.program, grant.agency].filter(Boolean).join(' · '), `Agreement from ${formatDate(grant.start)} · Award ${grant.id}`].filter(Boolean),
    value: short, label: `to ${grant.recipient}`,
    alt: `The award: ${formatMoney(grant.amount)} to ${grant.recipient}${grant.program ? `, ${grant.program}` : ''}${grant.agency ? `, ${grant.agency}` : ''}, agreement from ${formatDate(grant.start)}, award ${grant.id}.` }
  const second = takePhoto(grantPhotos, ids, 1)
  const purpose: StorySlide | null = second ? { type: 'picture', kicker: 'The purpose', title: 'What it was for', photo: second, quote: `“${grant.purpose.replace(/\.$/, '')}”`,
    lines: [[grant.category ? `Category: ${grant.category}` : '', award?.fy ? `Financial year ${award.fy}` : ''].filter(Boolean).join(' · ')].filter(Boolean),
    alt: `The purpose as published: ${grant.purpose}` } : null
  const selection = award ? selectionSlide(award, graph) : null
  const siblings = siblingsSlide(recipient)
  const electorate = electorateSlide('The electorate', graph, seat)
  const abn = grant.recipientId.replace(/^abn:/, '').replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')
  const source = sourceSlide('Check it', 'Every figure links to its record',
    [`GrantConnect award ${grant.id}, Department of Finance, CC BY 3.0 AU`, 'A published award value, not evidence of payments received', 'Program and electorate totals: GrantConnect awards as collected by OPAX'],
    'opax.com.au/money/grants', `federal → recipient ABN ${abn} → award ${grant.id}`, `Check it: GrantConnect award ${grant.id}. Every figure links to its record at opax.com.au/money/grants.`)
  return { slides: [cover, number, purpose, selection, siblings, electorate, source], photos: grantPhotos }
}

/**
 * One named award for an operator's run (`grant:<GA…>@<abn:…>`), read from the
 * recipient's source shard rather than the rotating shortlist, so an award of
 * any age can be posted on request. The same checks the shortlist applies:
 * an organisation recipient, a positive published value, an agreement start
 * date and a GrantConnect record to link to.
 */
export async function grantPostFor(date: string, sources: DailyPostSources, subject: string): Promise<DailyPost | null> {
  const m = /^grant:(GA\d+(?:-A\d+)?)@(abn:\d{11})$/.exec(subject)
  if (!m) return null
  const [, awardId, recipientId] = m
  const graph = await grantsGraph(sources)
  const recipient = graph?.recipients?.find(r => r.id === recipientId)
  if (!recipient || !Number.isInteger(recipient.sh) || typeof recipient.n !== 'string') return null
  const entry = await recipientShard(sources, graph, recipientId)
  const award = entry?.grants?.find(g => g.id === awardId)
  if (!award || !Number.isFinite(award.v) || award.v <= 0 || !award.guid || !/^\d{4}-\d{2}-\d{2}$/.test(award.s ?? '')) return null
  const purpose = String(award.desc || award.n || '').replace(/\s+/g, ' ').trim()
  if (purpose.length < 20) return null
  return grantEdition(date, { id: award.id, recipientId, recipient: recipient.n, amount: award.v, start: award.s as string, purpose,
    agency: award.ag, program: award.pr, category: award.cat, sourceUrl: `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(award.guid)}` },
    { sources, graph, recipient: entry, award })
}

// ---------------------------------------------------------------- programs by seat

/** Labor, the Coalition and the crossbench: every seat figure names all three, in this order. */
const GROUPS = ['Labor', 'Coalition', 'Crossbench'] as const
type Group = typeof GROUPS[number]
const GROUP_WORDS: Record<Group, string> = { Labor: 'Labor', Coalition: 'Coalition', Crossbench: 'crossbench' }

/** One program as scripts/build_social_catalog.mjs writes it to /social/programs.json. */
export interface ProgramRecord {
  id: string; key: string; n: string; ag?: string | null; t: number; c: number; r?: number | null; y0?: string | null; y1?: string | null
  sel: [string, number, number][]; selKnown: [number, number]; adhoc?: number
  mapped: [number, number]; groups: Record<Group, [number, number]>; seatShare: Record<Group, number>; governed: Record<string, number>
  /** The whole percentages the post and the program page both print (largest remainder, computed at build). */
  split: { group: Group; d: number; c: number; pct: number; seatPct: number }[]
  era: 'Coalition' | 'Labor' | 'both'; first: string; last: string; seatCount: number
  seats: { n: string; st?: string | null; t: number; c: number; holders: [string | null, string | null, number][] }[]
  recipients: [string, string, string, number, number][]
  timing?: Record<string, [number, number]> | null
}

/** Whole percentages that add up to exactly 100 (largest remainder), so a reader's sum checks out. */
export function wholePercents(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (!total) return values.map(() => 0)
  const raw = values.map(v => v / total * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((s, v) => s + v, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as [number, number]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left-- }
  return out
}

const yearsText = (y0?: string | null, y1?: string | null): string => y0 && y1 && y0 !== y1 ? `${y0} to ${y1}` : (y0 || y1 || '')
const STATES: Record<string, string> = { nsw: 'NSW', vic: 'Vic', qld: 'Qld', wa: 'WA', sa: 'SA', tas: 'Tas', act: 'ACT', nt: 'NT' }
const partyWord = (p: string | null | undefined): string => prettyParty(p ?? '') || 'party not recorded'
/** "Tony Smith" from the release's "Anthony Stephen Smith": first and last name only, the record's spelling. */
function shortPerson(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(' ')
}

/** The program page, where the same figures sit under "By the party holding the seat". */
export function programUrl(key: string): string {
  return `${ORIGIN}/money/grants?jur=federal&program=${encodeURIComponent(key)}`
}

/**
 * The groups with the share of the placed dollars and of the House, in the
 * fixed order, exactly as the build wrote them for the program page; null when
 * the record does not carry all three (the edition then does not run).
 */
export function programSplit(p: ProgramRecord): ProgramRecord['split'] | null {
  const rows = GROUPS.map(g => p.split?.find(s => s?.group === g))
  if (rows.some(r => !r || !Number.isInteger(r.pct) || !Number.isInteger(r.seatPct))) return null
  if (rows.reduce((s, r) => s + r!.pct, 0) !== 100) return null
  return rows as ProgramRecord['split']
}

function governedLine(p: ProgramRecord): string {
  const entries = Object.entries(p.governed ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (!entries.length) return ''
  const name = (bloc: string) => bloc === 'Coalition' ? 'the Coalition' : bloc
  if (entries.length === 1) return `Awarded while ${name(entries[0][0])} was in government.`
  return `Awarded under both governments: ${entries.map(([b, v]) => `${name(b)} ${shortMoney(v)}`).join(', ')}.`
}

async function programPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const data = await sources.asset('/social/programs.json').catch(() => null) as { programs?: ProgramRecord[] } | null
  const era = programEraFor(date)
  const programs = (data?.programs ?? []).filter(p => p && p.key && p.n && Number.isFinite(p.t) && p.t > 0 && p.mapped?.[0] > 0 &&
    programSplit(p) && (p.era === era || p.era === 'both')).sort((a, b) => a.key.localeCompare(b.key))
  // An exhausted era hands the day to another kind rather than to the other government's list.
  const p = seededPick(programs, `program:${date}`, x => `program:${x.id}`, exclude)
  if (!p) return null
  return programEdition(date, p, sources)
}

async function programEdition(date: string, p: ProgramRecord, sources: DailyPostSources): Promise<DailyPost> {
  const url = programUrl(p.key)
  const years = yearsText(p.y0, p.y1)
  const split = programSplit(p)!
  const placed = Math.round(p.mapped[0] / p.t * 100)
  const byParty = split.map((s, i) => i === 0 ? `${GROUP_WORDS[s.group]} ${s.pct}% (${s.seatPct}% of seats)` : `${GROUP_WORDS[s.group]} ${s.pct}% (${s.seatPct}%)`).join(', ')
  const partyLine = `By party holding the seat (${placed}% of dollars mapped): ${byParty}.`
  const selTotal = p.selKnown?.[0] ?? 0
  const cnc = p.sel.find(([k]) => /closed/i.test(k) && /non-?competitive/i.test(k))
  const cncPct = cnc && selTotal ? Math.round(cnc[1] / selTotal * 100) : null
  const selectionKnown = selTotal >= p.t * 0.5
  // Shares of the dollars with a selection process recorded (all of them, so the whole percentages add to 100); a process under half a per cent is not a bar.
  const selPcts = wholePercents(p.sel.map(([, v]) => v))
  const selRows = p.sel.map(([label], i) => ({ label, pct: selPcts[i] })).filter(r => r.pct > 0).slice(0, 3)
  const selection = selectionKnown && cncPct !== null && cncPct >= 50
    ? (cncPct === 100 ? 'All chosen without an open round.' : `${cncPct}% chosen without an open round.`)
    : ''
  // The head is the hook and the split; the name gives way before a number does.
  const budget = X_LIMIT - xLength([partyLine, url].join('\n\n')) - 2
  const hookFor = (name: string) => `Where did ${shortMoney(p.t)} go? ${formatNumber(p.c)} grants, ${name}${years ? `, ${years}` : ''}.`
  let name = p.n
  while ([...hookFor(name)].length > budget && name.length > 20) name = clip(p.n, [...name].length - 4)
  const text = fit([hookFor(name), partyLine], [selection], url)
  const seatRows = p.seats.slice(0, 5).map(s => {
    const who = s.holders.slice(0, 2).map(([person, party]) => `${shortPerson(person) || 'Member not recorded'} (${partyWord(party)})`).join('; ')
    const surnames = s.holders.slice(0, 2).map(([person, party]) => `${String(person ?? '').trim().split(/\s+/).pop() || 'Member not recorded'} (${partyWord(party)})`).join(', ')
    return { seat: `${s.n}${s.st && STATES[s.st] ? ` (${STATES[s.st]})` : ''}`, name: s.n, state: s.st && STATES[s.st] ? STATES[s.st] : '', who, surnames, amount: s.t, count: s.c }
  })
  const caption = [
    `Where did the money go? ${p.n}: ${formatMoney(p.t)} in ${formatNumber(p.c)} grants${p.r ? ` to ${formatNumber(p.r)} recipients` : ''}${years ? `, financial years ${years}` : ''}.${p.ag ? ` ${p.ag}.` : ''}`,
    selectionKnown && selRows.length ? `How it was chosen: ${selRows.map(r => `${r.label.toLowerCase()} ${r.pct}%`).join(', ')} of the dollars with a selection process recorded.` : '',
    `By the party holding the seat on each grant's date (${placed}% of the dollars can be placed in a seat):\n${split.map(s => `• ${s.group === 'Crossbench' ? 'Crossbench' : s.group}-held seats: ${s.pct}% of the dollars; ${s.seatPct}% of House seats at the time`).join('\n')}`,
    governedLine(p),
    seatRows.length ? `The seats with the most:\n${seatRows.map(r => `• ${r.seat}, ${r.who}: ${shortMoney(r.amount)}`).join('\n')}` : '',
    'Seats come from each award\'s delivery or recipient postcode, so they are approximate near boundaries. The party is the seat holder\'s on the grant date. The share of seats is each group\'s share of the House on those dates, weighted by value. Award values, not payments.',
    url,
  ].filter(Boolean).join('\n\n')
  const post: DailyPost = { date, kind: 'program', subject: `program:${p.id}`, title: p.n, url, text, caption }
  const photos: StoryPhotos = { catalogue: await photoCatalogue(sources), used: [] }
  const ids = photosFor(photos.catalogue, `program:${p.id}`, 'program')
  const cover: StorySlide = { type: 'cover', kicker: 'Where did the money go?', title: clip(p.n, 64),
    line: `${shortMoney(p.t)} in ${formatNumber(p.c)} grants${years ? `, ${years}` : ''}`, photo: takePhoto(photos, ids, 0),
    alt: `Where did the money go? ${p.n}: ${formatMoney(p.t)} in ${formatNumber(p.c)} grants${years ? `, ${years}` : ''}.` }
  const number: StorySlide = { type: 'number', kicker: 'The program', title: 'What the record says', value: shortMoney(p.t),
    label: `in ${formatNumber(p.c)} grants${p.r ? ` to ${formatNumber(p.r)} recipients` : ''}`,
    lines: [years ? `Financial years ${years}` : '', governedLine(p)].filter(Boolean),
    alt: `The program: ${formatMoney(p.t)} in ${formatNumber(p.c)} grants${p.r ? ` to ${formatNumber(p.r)} recipients` : ''}${years ? `, financial years ${years}` : ''}. ${governedLine(p)}`.trim() }
  const chosen: StorySlide | null = selectionKnown && selRows.length ? { type: 'bars', kicker: 'How it was chosen',
    title: cncPct === 100 ? 'No open round for any award' : cncPct !== null && cncPct >= 50 ? 'Mostly without an open round' : sentenceCase(p.sel[0][0].toLowerCase()),
    lines: [], items: selRows.map(r => ({ label: sentenceCase(r.label.toLowerCase()), pct: r.pct })),
    note: selTotal >= p.t ? 'As recorded on GrantConnect for every award in the program.' : `Of the ${Math.round(selTotal / p.t * 100)}% of the dollars with a selection process recorded on GrantConnect.`,
    alt: `How it was chosen: ${selRows.map(r => `${r.label.toLowerCase()} ${r.pct} per cent`).join(', ')} of the dollars with a selection process recorded.` } : null
  const seats: StorySlide = { type: 'bars', kicker: 'Whose seats', title: 'By the party holding the seat',
    lines: [`Of the ${shortMoney(p.mapped[0])} OPAX can place in a seat (${placed}% of the dollars), by the member's party on the grant date.`],
    items: split.map(s => ({ label: `${s.group}-held · ${s.seatPct}% of seats`, pct: s.pct })),
    note: 'Share of seats: the House on the grant dates, weighted by value. Seats from award postcodes, approximate near boundaries.',
    alt: `By the party holding the seat on the grant date: ${split.map(s => `${s.group}-held seats ${s.pct} per cent of the placed dollars, ${s.seatPct} per cent of seats`).join('; ')}.` }
  const ledger: StorySlide | null = seatRows.length >= 3 ? { type: 'ledger', kicker: 'The seats', title: `The ${dayWords(seatRows.length).toLowerCase()} seats with the most`, lines: [],
    // The first column is narrow: the state there, the seat and its members (surnames, every holder) beside it.
    rows: seatRows.map(r => ({ c1: r.state, c2: clip(`${r.name} · ${r.surnames}`, 64), amount: shortMoney(r.amount) })),
    total: { label: `${formatNumber(p.seatCount)} seats in all`, amount: shortMoney(p.mapped[0]) },
    alt: `The seats with the most: ${seatRows.map(r => `${r.seat}, ${r.who}, ${shortMoney(r.amount)}`).join('; ')}.` } : null
  const timing = p.timing ?? null
  const buckets: [string, string][] = [['0_3', 'Under 3 months'], ['3_6', '3 to 6 months'], ['6_12', '6 to 12 months'], ['12_24', '1 to 2 years'], ['over_24', 'Over 2 years']]
  const timed = timing ? buckets.map(([k]) => timing[k]?.[0] ?? 0) : []
  const timedTotal = timed.reduce((s, v) => s + v, 0)
  const timingPcts = wholePercents(timed)
  const when: StorySlide | null = timing && timedTotal >= p.t * 0.5 ? { type: 'bars', kicker: 'How close to an election', title: 'Time to the next federal election',
    lines: [], items: buckets.map(([, label], i) => ({ label, pct: timingPcts[i] })),
    note: 'Agreement start to the next federal election. Agreements after 3 May 2025 have none yet.',
    alt: `Time from agreement start to the next federal election: ${buckets.map(([, label], i) => `${label.toLowerCase()} ${timingPcts[i]} per cent`).join(', ')}.` } : null
  const recipients: StorySlide | null = p.recipients.length >= 3 ? { type: 'ledger', kicker: 'Who received it', title: 'The largest recipients', lines: [],
    rows: p.recipients.slice(0, 4).map(([, n, , v, c]) => ({ c1: `${formatNumber(c)} award${c === 1 ? '' : 's'}`, c2: clip(shortRecipient(n), 60), amount: shortMoney(v) })),
    alt: `The largest recipients: ${p.recipients.slice(0, 4).map(([, n, , v]) => `${n} ${shortMoney(v)}`).join('; ')}.` } : null
  const source = sourceSlide('Check it', 'Every figure links to its record',
    ['GrantConnect awards, Department of Finance, CC BY 3.0 AU', 'Party on the grant date: parliamentary service records and AEC results', 'Award values, not payments'],
    'opax.com.au/money/grants', `federal → program ${p.id}`, `Check it: ${p.n} on opax.com.au/money/grants. Every figure links to its record.`)
  // The seat split comes straight after the number: it is the edition's point, and the story frames take the first bars slide.
  return told(post, [cover, number, seats, chosen, ledger, when, recipients, source], photos)
}

// ---------------------------------------------------------------- the month's largest awards

/** One row of /social/grants-largest.json. */
export interface LargestAward {
  id: string; recipientId: string; recipient: string; amount: number; start: string; purpose: string
  program?: string | null; agency?: string | null; selection?: string | null; more?: number; sourceUrl: string
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (month: string): string => { const [y, m] = month.split('-').map(Number); return `${MONTH_NAMES[m - 1]} ${y}` }
export function largestUrl(month: string): string {
  return `${ORIGIN}/money/grants?jur=federal&largest=${encodeURIComponent(month)}`
}
/** A purpose worth printing, else the program's name: "Funding agreement" tells a reader nothing. */
function awardWords(a: LargestAward): string {
  const p = purposePhrase(a.purpose)
  return p.length >= 25 && p.toLowerCase() !== (a.program ?? '').toLowerCase() ? p : (a.program || p)
}

async function largestPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const data = await sources.asset('/social/grants-largest.json').catch(() => null) as { latest?: string | null; months?: Record<string, LargestAward[]> } | null
  const month = data?.latest
  if (!month || !/^\d{4}-\d{2}$/.test(month) || month >= date.slice(0, 7) || exclude.includes(`largest:${month}`)) return null
  const awards = (data?.months?.[month] ?? []).filter(a => a && /^GA\d+/.test(a.id) && /^abn:\d{11}$/.test(a.recipientId) && Number.isFinite(a.amount) && a.amount > 0).slice(0, 5)
  if (awards.length < 3) return null
  const url = largestUrl(month)
  const label = monthName(month)
  const head = `Where did the money go in ${label}? The largest grant agreements that started that month:`
  // Five lines if they fit, never fewer than three; names give way before a line is dropped below three.
  const lines = (n: number, width: number) => awards.slice(0, n).map(a => `${shortMoney(a.amount)} · ${clip(shortRecipient(a.recipient), width)}`).join('\n')
  const fits = (n: number, width: number) => xLength([head, lines(n, width), url].join('\n\n')) <= X_LIMIT
  let n = awards.length, width = 48
  while (n > 3 && !fits(n, width)) n--
  while (width > 24 && !fits(n, width)) width -= 4
  const text = fit([head, lines(n, width)], [], url)
  const caption = [
    `Where did the money go in ${label}? The largest grant agreements that started that month, one line per recipient:`,
    awards.map((a, i) => `${i + 1}. ${formatMoney(a.amount)} to ${a.recipient}${a.more ? ` (and ${a.more} more award${a.more === 1 ? '' : 's'} that month)` : ''}\n${clip(awardWords(a), 160)}\n${[a.program !== awardWords(a) ? a.program : '', a.selection ? a.selection.toLowerCase() : ''].filter(Boolean).join(' · ')}`.trim()).join('\n\n'),
    'Agreement start dates as published on GrantConnect, not announcement dates. Award values, not payments.',
    url,
  ].join('\n\n')
  const post: DailyPost = { date, kind: 'largest', subject: `largest:${month}`, title: `${label}'s largest grants`, url, text, caption }
  const photos: StoryPhotos = { catalogue: await photoCatalogue(sources), used: [] }
  const ids = photosFor(photos.catalogue, `largest:${month}`, 'largest')
  const short = MONTH_NAMES[Number(month.slice(5)) - 1]
  const cover: StorySlide = { type: 'cover', kicker: `Grants · ${label}`, title: `Where did the money go in ${short}?`,
    line: `The largest grant agreements that started in ${label}, as published on GrantConnect.`, photo: takePhoto(photos, ids, 0),
    alt: `Where did the money go in ${label}? The largest grant agreements that started that month.` }
  const ledger: StorySlide = { type: 'ledger', kicker: `The ${dayWords(awards.length).toLowerCase()} largest`, title: `${short}'s biggest grants`, lines: [],
    rows: awards.map((a, i) => ({ c1: `No. ${i + 1}`, c2: clip(shortRecipient(a.recipient), 60), amount: shortMoney(a.amount) })),
    note: 'One row per recipient: its largest award that month.',
    alt: `The largest grants of ${label}: ${awards.map((a, i) => `number ${i + 1}, ${a.recipient}, ${shortMoney(a.amount)}`).join('; ')}.` }
  const details: StorySlide[] = awards.slice(0, 3).map((a, i) => ({ type: 'number', kicker: `No. ${i + 1}${a.program ? ` · ${clip(a.program, 34)}` : ''}`,
    title: clip(shortRecipient(a.recipient), 60), value: shortMoney(a.amount), label: `Agreement from ${formatDate(a.start)} · Award ${a.id}`,
    lines: [clip(awardWords(a), 120), selectionLine(a.selection)].filter(Boolean),
    alt: `Number ${i + 1}: ${formatMoney(a.amount)} to ${a.recipient}. ${awardWords(a)}. ${selectionLine(a.selection)} Agreement from ${formatDate(a.start)}, award ${a.id}.`.replace(/\s+/g, ' ').trim() }))
  const source = sourceSlide('Check it', 'Every award links to its record',
    ['GrantConnect awards, Department of Finance, CC BY 3.0 AU', 'Agreement start dates, not announcement dates', 'Award values, not payments'],
    'opax.com.au/money/grants', `federal → largest → ${month}`, `Check it: the largest grants of ${label} at opax.com.au/money/grants.`)
  return told(post, [cover, ledger, ...details, source], photos)
}

interface Report {
  slug: string
  title: string
  blurb?: string
  generated_at?: string
  stats?: { speech_count?: number; unique_speakers?: number; timeline?: [string, number][]; top_speakers?: [string, number][] }
  voices?: { now?: { speaker: string; party?: string | null; count?: number }[] }
}

async function topicPost(date: string, sources: DailyPostSources, exclude: string[]): Promise<DailyPost | null> {
  const index = await sources.asset('/reports/index.json') as { reports?: { slug: string; title: string }[] } | null
  const slugs = (index?.reports ?? []).map(r => r.slug).filter(Boolean).sort()
  // Walk from the seeded start so a report without speech stats is skipped.
  const start = slugs.length ? seed(`topic:${date}`) % slugs.length : 0
  const skip = new Set(exclude)
  const order = slugs.map((_, i) => slugs[(start + i) % slugs.length])
  for (const slug of order.filter(s => !skip.has(`topic:${s}`))) {
    const report = await sources.asset(`/reports/${encodeURIComponent(slug)}.json`) as Report | null
    const count = report?.stats?.speech_count
    if (!report || !count) continue
    const speakers = report.stats?.unique_speakers
    const voices = (report.stats?.top_speakers ?? []).slice(0, 3).map(([name, count]) => `${name}: ${formatNumber(count)}`)
    const completeYears = (report.stats?.timeline ?? []).filter(([year, n]) => /^\d{4}$/.test(year) && Number(year) < Number(date.slice(0, 4)) && Number.isFinite(n) && n > 0)
    const peak = [...completeYears].sort((a, b) => b[1] - a[1])[0]
    const url = `${ORIGIN}/reports/${encodeURIComponent(slug)}`
    const head = [
      `${report.title}: ${formatNumber(count)} collected speeches${speakers ? ` from ${formatNumber(speakers)} speakers` : ''}.`,
    ]
    const optional = [
      peak ? `Most in a completed year: ${formatNumber(peak[1])} in ${peak[0]}. Coverage varies.` : '',
      report.blurb ?? '',
      'Explore what parliament said:',
    ]
    const post: DailyPost = { date, kind: 'topic', subject: `topic:${slug}`, title: report.title, url, text: fit(head, optional, url), caption: [...head, report.blurb ?? '', optional[0], voices.length ? `Most speeches in this collection:\n${voices.map(v => `• ${v}`).join('\n')}` : '', 'Explore the arguments, speakers and original sources.', `Figures describe collected records, not all parliamentary activity.${report.generated_at ? ` Report updated ${formatDate(report.generated_at)}.` : ''}`, url].filter(Boolean).join('\n\n') }
    const photos: StoryPhotos = { catalogue: await photoCatalogue(sources), used: [] }
    const ids = photosFor(photos.catalogue, `topic:${slug}`, 'topic')
    const top = (report.stats?.top_speakers ?? []).filter(([name, n]) => name && Number.isFinite(n) && n > 0).slice(0, 3)
    const cover: StorySlide = { type: 'cover', kicker: `Topic · ${formatNumber(count)} speeches`, title: report.title, line: clip(report.blurb ?? head[0], 150), photo: takePhoto(photos, ids, 0),
      alt: `${report.title}: ${formatNumber(count)} collected speeches. ${report.blurb ?? ''}`.trim() }
    const number: StorySlide = { type: 'number', kicker: 'The record', title: 'What parliament has said', lines: ['Figures describe collected records, not all parliamentary activity.'],
      value: formatNumber(count), label: `collected speeches${speakers ? ` from ${formatNumber(speakers)} speakers` : ''}`,
      alt: `The record: ${formatNumber(count)} collected speeches${speakers ? ` from ${formatNumber(speakers)} speakers` : ''} on ${report.title}.` }
    const bars: StorySlide | null = top.length ? { type: 'bars', kicker: 'Most speeches in this collection', title: 'Who speaks most', lines: [],
      items: top.map(([name, n]) => ({ label: `${name} · ${formatNumber(n)}`, pct: Math.max(1, Math.round(n / top[0][1] * 100)) })),
      note: 'Bars are relative to the most frequent speaker in the collection.',
      alt: `Most speeches in this collection: ${top.map(([name, n]) => `${name} ${formatNumber(n)}`).join(', ')}.` } : null
    const peakSlide: StorySlide | null = peak ? { type: 'number', kicker: 'The busiest year', title: peak[0], lines: ['Coverage varies by year and chamber, so a quieter year may be a thinner record.'],
      value: formatNumber(peak[1]), label: `speeches in ${peak[0]}, the most in a completed year`,
      alt: `The busiest year: ${formatNumber(peak[1])} speeches in ${peak[0]}, the most in a completed year.` } : null
    const source = sourceSlide('Read the report', 'The arguments, the speakers and the original sources',
      ['Every speech cited back to Hansard or the state record', report.generated_at ? `Report updated ${formatDate(report.generated_at)}` : '', 'Figures describe collected records, not all parliamentary activity'],
      'opax.com.au/reports', slug, `Read the report at opax.com.au/reports/${slug}.`)
    return told(post, [cover, number, bars, peakSlide, source], photos)
  }
  return null
}

const COMPOSERS: Record<DailyPostKind, (date: string, sources: DailyPostSources, exclude: string[]) => Promise<DailyPost | null>> = {
  politician: politicianPost, bill: billPost, grant: grantPost, topic: topicPost, program: programPost, largest: largestPost,
}

/** Composes the post for a date; falls back through the other kinds if one has nothing to say. */
export async function composeDailyPost(date: string, sources: DailyPostSources, kind: DailyPostKind = kindFor(date), subject?: string): Promise<DailyPost | null> {
  // A named subject is an operator's choice: only the grant form exists so far.
  if (subject) return subject.startsWith('grant:') ? grantPostFor(date, sources, subject) : null
  const recent = await sources.recent()
  const order = [kind, ...FALLBACK[kind]]
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
  if (!response.ok) throw new Error(`X API HTTP ${response.status}`)
  const data = JSON.parse(body) as { data?: { id?: string } }
  if (!data.data?.id || !/^\d+$/.test(data.data.id)) throw new Error('X did not return a post id')
  return { id: data.data.id }
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
