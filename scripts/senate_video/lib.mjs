// The Senate's own YouTube uploads as OPAX rows: parse, match, merge. No network here.
//
// Two lawful sources feed these functions (fetch.mjs): the channel's public Atom feed
// (the latest 15 uploads) and, only when YOUTUBE_API_KEY is set, the Data API v3
// playlistItems list of the uploads playlist. Video is linked or embedded with the
// Senate's own player, never downloaded or re-hosted (docs/COVERAGE.md, Parliamentary video).
import { personSlug, slugIndex } from '../../portal/src/person-slug.ts'

export const CHANNEL_ID = 'UCQptchvNlCzMKsGPU8s_6UQ'
export const CHANNEL_TITLE = 'AuSenate: The Senate Public Information Office'
export const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`
export const UPLOADS_PLAYLIST = 'UU' + CHANNEL_ID.slice(2)
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
export const watchUrl = id => `https://www.youtube.com/watch?v=${id}`

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const month = name => { const n = name.toLowerCase(); return n === 'sept' ? 9 : MONTHS.findIndex(x => x === n || (n.length === 3 && x.startsWith(n))) + 1 }
const pad = n => String(n).padStart(2, '0')
const fold = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`]/g, "'").toLowerCase().trim()

/** "15 October 2026", "Tuesday 15 Oct 2026", "15/10/2026" -> 2026-10-15; anything else null. */
export function parseDay(text) {
  const s = String(text ?? '').trim()
  let m = /(?:^|[\s,])(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(s)
  let d, mo, y
  if (m) {
    mo = month(m[2])
    if (!mo) return null
    d = Number(m[1]); y = Number(m[3])
  } else if ((m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s))) {
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3])
  } else return null
  const iso = `${y}-${pad(mo)}-${pad(d)}`
  const check = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(check.getTime()) && check.getUTCDate() === d && check.getUTCMonth() + 1 === mo ? iso : null
}

/**
 * What a title says: its kind, the sitting date it names (not the upload date) and,
 * for a first speech, the speaker as printed. A date later than the upload is a
 * typo the page must not file under a day that had not happened, so it is dropped.
 */
export function parseTitle(title, published = '') {
  const t = String(title ?? '').replace(/\s+/g, ' ').trim()
  // A day of grace: the upload time is UTC, the sitting day is Canberra's.
  const stamp = Date.parse(published)
  const latest = Number.isFinite(stamp) ? new Date(stamp + 86400000).toISOString().slice(0, 10) : ''
  const dated = text => {
    const day = parseDay(text)
    return day && latest && day > latest ? null : day
  }
  if (/^Senate Question Time\b/i.test(t)) return { kind: 'question_time', date: dated(t.replace(/^Senate Question Time/i, '')) }
  const first = /^First speech\s*[:\-–—]\s*(.+)$/i.exec(t)
  if (first) {
    // "Senator Gatenby - 16 September 2026": the name runs to the last dash or comma before a date.
    const rest = first[1]
    const split = /^(.*?)\s*[-–—,]\s*([^-–—,]*\d{4}\s*)$/.exec(rest)
    const who = (split ? split[1] : rest).trim()
    const named = /^Senator\s+(?:the\s+Hon\.?\s+)?(.+)$/i.exec(who)
    return { kind: 'first_speech', date: split ? dated(split[2]) : null, speaker: named ? named[1].trim() : null }
  }
  return { kind: 'other', date: dated(t) }
}

/** APH Handbook senators, by APH MPID (pay.json), for roster rows whose chamber list is committee-only. */
export function handbookSenators(pay) {
  const rows = Array.isArray(pay?.current) ? pay.current : []
  return new Set(rows.filter(r => r && r.chamber === 'senate' && /^\w+$/.test(String(r.id ?? ''))).map(r => String(r.id)))
}

/**
 * The roster row a first speech names, or null. Exact surname (and given name when the
 * title prints one), senator evidence, and service years that cover the speech. Rows
 * that share a pid are one person; two different people is ambiguous and matches
 * nobody. Fails closed: no speaker, no year, no candidate -> null.
 *
 * Senator evidence is the roster's own senate chamber or seat, or, for a new senator
 * the roster holds only from committee transcripts, the APH Handbook's senate entry
 * reached by the row's pid (profile-links.json -> MPID -> pay.json).
 */
export function matchSenator(speaker, date, people, { mpidOf = new Map(), senators = new Set() } = {}) {
  if (!speaker || !date) return null
  const year = Number(date.slice(0, 4))
  const words = fold(speaker).split(/\s+/).filter(Boolean)
  const surname = words.at(-1), given = words.length > 1 ? words[0] : null
  const isSenator = p => (p.chambers || []).includes('senate') || (p.representation || []).some(r => r.chamber === 'senate') ||
    (!!p.pid && senators.has(String(mpidOf.get(String(p.pid)) ?? '')))
  const years = p => Number(p.first) <= year && (p.current === true || Number(p.last) >= year)
  const candidates = people.filter(p => {
    const name = fold(p.full || p.name).split(/\s+/)
    if (name.at(-1) !== surname) return false
    if (given && name.length > 1 && name[0] !== given) return false
    if (given && name.length === 1) return false
    return isSenator(p) && years(p)
  })
  const identities = new Map()
  for (const p of candidates) {
    const key = p.pid ? `pid:${p.pid}` : `name:${p.name}`
    const held = identities.get(key)
    if (!held || (p.speeches ?? 0) > (held.speeches ?? 0)) identities.set(key, p)
  }
  return identities.size === 1 ? [...identities.values()][0] : null
}

/** One OPAX row from a source item. person_slug and person_pid only on first speeches, null when unmatched. */
export function toRow({ id, title, published }, people, context = {}, slugs = slugIndex(people).slugOf) {
  if (!VIDEO_ID.test(String(id ?? '')) || !title) return null
  const parsed = parseTitle(title, published)
  const row = { id, title: String(title).replace(/\s+/g, ' ').trim(), published: published || null, kind: parsed.kind, date: parsed.date, chamber: 'senate' }
  if (parsed.kind === 'first_speech') {
    const p = matchSenator(parsed.speaker, parsed.date, people, context)
    row.person_slug = p ? slugs.get(p.name) || personSlug(p.name) : null
    // The roster pid too: the site also lists one person under a second row (the electorate
    // reference's full name), which has its own slug but the same pid.
    row.person_pid = p?.pid ? String(p.pid) : null
  }
  row.url = watchUrl(id)
  return row
}

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml); return m ? decode(m[1]).trim() : '' }

/** The Atom feed's entries: {id, title, published}. Throws on a document that is not this channel's feed. */
export function parseFeed(xml) {
  const text = String(xml ?? '')
  if (!/<feed\b/.test(text)) throw new Error('not an Atom feed')
  // The feed prints the id without its "UC" prefix.
  const channel = tag(text.split('<entry')[0], 'yt:channelId')
  if (channel && channel !== CHANNEL_ID && 'UC' + channel !== CHANNEL_ID) throw new Error(`feed is for another channel (${channel})`)
  return [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: tag(e, 'yt:videoId'), title: tag(e, 'title'), published: tag(e, 'published'),
  })).filter(e => VIDEO_ID.test(e.id) && e.title)
}

/** Data API playlistItems page -> items; private and deleted uploads carry no public title. */
export function parsePlaylistPage(page) {
  return (page?.items || []).map(item => ({
    id: item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || '',
    title: item?.snippet?.title || '',
    published: item?.contentDetails?.videoPublishedAt || item?.snippet?.publishedAt || '',
  })).filter(e => VIDEO_ID.test(e.id) && e.title && !/^(?:Private|Deleted) video$/i.test(e.title))
}

const byNewest = (a, b) => String(b.published || '').localeCompare(String(a.published || '')) || a.id.localeCompare(b.id)

/**
 * Accumulate: every row already staged stays (the feed only ever shows 15), a fresh
 * sighting replaces its title and upload time, and every row is re-derived so a later
 * roster can match a first speech that failed closed before.
 */
export function mergeRows(existing, items, people, context = {}) {
  const slugs = slugIndex(people).slugOf
  const seen = new Map()
  for (const r of existing || []) if (r && VIDEO_ID.test(String(r.id))) seen.set(r.id, { id: r.id, title: r.title, published: r.published })
  for (const item of items) {
    const before = seen.get(item.id)
    seen.set(item.id, { id: item.id, title: item.title || before?.title, published: item.published || before?.published })
  }
  return [...seen.values()].map(item => toRow(item, people, context, slugs)).filter(Boolean).sort(byNewest)
}

/** The staged file's shape: meta, then one row per video. */
export function document(rows, updated, sources) {
  return {
    meta: {
      schema: 1,
      updated,
      channel: { id: CHANNEL_ID, title: CHANNEL_TITLE, url: 'https://www.youtube.com/@AuSenate' },
      sources,
      use: 'Linked and embedded with the Senate\'s own YouTube player (youtube-nocookie.com, click to play). Never downloaded or re-hosted.',
      counts: Object.fromEntries(['question_time', 'first_speech', 'other'].map(k => [k, rows.filter(r => r.kind === k).length])),
    },
    videos: rows,
  }
}
