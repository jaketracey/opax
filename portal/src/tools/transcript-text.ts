/** Full text of hearing transcripts the publisher licenses under CC BY 4.0 (public/transcripts, built by
 * scripts/build_transcript_fulltext.py). A transcript whose publisher text records a non-publication or
 * suppression order or a pseudonymous witness carries no text: only the pages a word appears on. */
import { object, records, type RecordRow } from './published-records'
import { readToolAsset, type ToolEnv } from './types'

const SHARD = /^\/transcripts\/terms\/\d{2}\.json$/
const FILE = /^\/transcripts\/[a-z0-9-]+\/transcript-[a-z0-9-]+\.json$/
const EXCERPT = 280

export type TextIndex = { docs: RecordRow[], stop: Set<string>, common: Set<string>, shards: number, commissions: RecordRow }
export type PageHit = { pdf_page: number, transcript_page: string | null, url: string, excerpt: string | null }
export type TextHits = { file: string, quote_policy: string, attribution: string, licence_url: string, order_notice?: string, hits: PageHit[] }

export async function textIndex(env: ToolEnv): Promise<TextIndex | null> {
  const data = object(await readToolAsset(env, '/transcripts/index.json'))
  if (data.schema !== 1 || !Array.isArray(data.docs)) return null
  return { docs: records(data.docs), stop: new Set((data.stopwords as string[]) ?? []), common: new Set((data.common_terms as string[]) ?? []),
    shards: Number(data.shards) || 64, commissions: object(data.commissions) }
}

/** Same rule as tokens() in scripts/build_transcript_fulltext.py. */
export function tokens(text: string, stop: Set<string>): string[] {
  const s = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’‘]/g, '')
  return s.split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !stop.has(t) && (/[a-z]/.test(t) || /^\d{4}$/.test(t)))
}

export function shardOf(term: string, shards: number): number {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(term)) h = Math.imul(h ^ b, 0x01000193) >>> 0
  return h % shards
}

/** Keys of one commission's transcripts containing every searchable word, or null when the commission has no
 * public text or every word is too common to narrow the search. */
export async function textMatches(env: ToolEnv, ix: TextIndex, commission: string, words: string): Promise<{ keys: Set<string>, terms: string[] } | null> {
  if (!object(ix.commissions[commission]).name) return null
  const terms = [...new Set(tokens(words, ix.stop))]
  const narrow = terms.filter(t => !ix.common.has(t))
  if (!narrow.length) return null
  let docs = new Set<number>(ix.docs.filter(d => d.commission === commission).map(d => Number(d.i)))
  for (const t of narrow) {
    const path = `/transcripts/terms/${String(shardOf(t, ix.shards)).padStart(2, '0')}.json`
    if (!SHARD.test(path)) return null
    const posting = new Set<number>((object(await readToolAsset(env, path))[t] as number[]) ?? [])
    docs = new Set<number>([...docs].filter(i => posting.has(i)))
    if (!docs.size) break
  }
  const keys = new Set(ix.docs.filter(d => docs.has(Number(d.i))).map(d => String(d.key)))
  return { keys, terms }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "2022-09-27" as "27 September 2022"; anything else unchanged. */
export function dayWords(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso ?? '')
}
/** A hearing date range in words: "27 September 2022 to 10 March 2023", or one day. */
export const spanWords = (first: unknown, last: unknown) => first === last ? dayWords(first) : `${dayWords(first)} to ${dayWords(last)}`

const KEEP = new Set(['SC', 'KC', 'QC', 'AM', 'AO', 'AC', 'OAM', 'PSM', 'APM'])
/** The label as a name: "MS HOGAN-DORAN" as "Ms Hogan-Doran", "McLEOD" as "McLeod". */
export function speakerName(label: string): string {
  return label.split(' ').map(word => KEEP.has(word) ? word
    : word.replace(/^Mc(?=[A-Z])/, 'Mc\u0000').toLowerCase().replace(/(^|[-'’\u0000])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()).replace('\u0000', '')).join(' ')
}

// A heading is printed at the start of a line and ends in a colon: "MS HOGAN-DORAN:", "THE COMMISSIONER:",
// "MR LANCASTER SC:", "MS L SURNAME:", "A/PROFESSOR SURNAME:", "SENATOR THE HON. FIRST SURNAME:", "MR De SURNAME:".
// Its words are capitals (with a surname particle or a "Mc" allowed), or a title and capitalised names, or a role
// word alone in any case ("Commissioner:"). The shape is wide on purpose: a heading that is not recognised would
// hand its words to the turn before, while a line wrongly read as a heading only ends an excerpt early.
const PARTICLE = /^(?:de|di|du|da|del|della|le|la|van|von|der|den|ter|bin|al|el|st)$/i
const TITLE = /^(?:the|mr|ms|mrs|miss|mx|dr|prof|professor|a\/prof|a\/professor|associate|adjunct|emeritus|senator|hon|justice|judge|commissioner|deputy|chief|counsel|uncle|aunty|rabbi|reverend|rev|sir|dame|cr|councillor|minister|detective|sergeant|inspector|superintendent)\.?$/i
const ROLE = /^(?:the )?(?:(?:deputy |chief |assistant )?commissioner|chair|chairperson|witness|witnesses|associate|interpreter|speaker|operator|registrar|counsel assisting|presiding member)$/i
const capitalWord = (w: string) => /^["“‘'(]?[A-Z0-9][A-Z0-9'’.\/()_"”-]*$/.test(w) || /^[A-Z][A-Za-z'’.-]*[A-Z]$/.test(w) || PARTICLE.test(w)
const nameWord = (w: string) => /^\p{Lu}[\p{L}'’.-]*$/u.test(w) || PARTICLE.test(w)
/** The heading a line opens with, as printed and without its colon, or null. */
function headingOf(line: string): { heading: string, length: number } | null {
  const m = /^([^:]{1,70}?)\s?:+(?=\s|$)/.exec(line)
  if (!m) return null
  const words = m[1].split(' ')
  if (words.length > 8) return null
  const letters = m[1].replace(/[^A-Za-z]/g, ''), upper = letters.replace(/[a-z]/g, '').length
  const capitals = (words.every(capitalWord) && /[A-Z]{2}/.test(letters)) || (upper >= 3 && upper * 4 >= letters.length * 3)
  const titled = words.length > 1 && TITLE.test(words[0]) && words.slice(1).every(w => nameWord(w) || TITLE.test(w))
  return capitals || titled || ROLE.test(m[1]) ? { heading: m[1], length: m[0].length } : null
}
// "Q." and "A." open turns that carry no heading of their own.
const MARK = /^([QA])[.:](?=\s|$)/
// A word index ("word [2] - 1477:37, 1479:4") or an exhibit list (document ids, no heading) is not a hearing turn.
const REFERENCE = /\b\d{2,5}:\d{1,2}\b/, DOCUMENT = /\b[A-Z]{2,5}\.\d{4}\.\d{4}\.\d{4}/

/** Where one turn sits in a page's one-line text. `from` is where its opener begins (the heading, the mark or the
 * note), `start` and `end` bound its words; a turn with no words on the page has start equal to end. */
export type PageTurn = { from: number, start: number, end: number,
  /** What opens the turn: the top of the page (it continues the page before), a heading, a "Q."/"A." mark, or a
   * note line of the publisher's ("<NAME, sworn:"), after which the speaker is not printed. */
  opens: 'page' | 'heading' | 'mark' | 'note',
  /** The heading exactly as printed, without its colon. On a mark turn: the heading printed on the same line
   * straight before the mark ("MR SURNAME: Q. ..."). Not shown on any surface. */
  heading?: string, mark?: 'Q' | 'A' }

/** A page as one line (text.replace(/\s+/g, ' ').trim()) and its turns in page order. Headings, marks and notes
 * are read one line at a time from the start of the line, never across a line break. A note is a line the
 * publisher opens with "<", with any capitals-only lines it wraps onto; its text belongs to no turn. A word-index
 * page or an exhibit list has no turns. Pure: the same page always gives the same turns. */
export function pageTurns(page: string): { text: string, turns: PageTurn[] } {
  const lines = page.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const turns: PageTurn[] = [{ from: 0, start: 0, end: 0, opens: 'page' }]
  let text = '', note = false, headings = 0
  for (const line of lines) {
    if (text) text += ' '
    const at = text.length, last = turns[turns.length - 1]
    const head = line[0] === '<' || MARK.test(line) ? null : headingOf(line), mark = MARK.exec(head ? line.slice(head.length).trimStart() : line)
    note = line[0] === '<' || (note && !head && !mark && !/[a-z]/.test(line.replace(/\[[^\]]*\]/g, '')))
    text += line
    if (note) { if (last.opens !== 'note' || last.end > last.start) turns.push({ from: at, start: text.length, end: text.length, opens: 'note' }); else last.start = last.end = text.length; continue }
    if (!head && !mark) { last.end = text.length; continue }
    headings++
    const start = at + (head ? head.length : 0) + (mark ? line.slice(head ? head.length : 0).search(/\S/) + mark[0].length : 0)
    turns.push({ from: at, start: Math.min(text.length, start), end: text.length, opens: mark ? 'mark' : 'heading',
      ...(head ? { heading: head.heading } : {}), ...(mark ? { mark: mark[1] as 'Q' | 'A' } : {}) })
  }
  for (const t of turns) { while (t.start < t.end && text[t.start] === ' ') t.start++; if (t.start >= t.end) t.start = t.end = Math.max(t.start, t.end) }
  const listed = (pattern: RegExp) => lines.filter(l => pattern.test(l)).length
  if (listed(REFERENCE) * 5 >= lines.length * 2 || (!headings && listed(DOCUMENT) >= 4)) return { text, turns: [] }
  return { text, turns: turns.filter((t, i) => i > 0 || t.end > t.start) }
}

/** A verbatim excerpt around the first query word, kept inside the one turn the word is in: no heading, mark or
 * note sits in the text. A word found in a heading, a mark or a note gives the words that follow it, which may be
 * none. No speaker is returned: Ask prose and citations name no one (see pageTurns for the headings). */
export function excerpt(text: string, terms: string[]): { excerpt: string } {
  const { text: flat, turns } = pageTurns(text)
  let at = -1
  for (const t of terms) {
    const m = new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '')}`, 'i').exec(flat)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  const turn = at < 0 ? turns.find(t => t.end > t.start) : turns.filter(t => t.from <= at).at(-1)
  if (!turn || turn.end <= turn.start || at >= turn.end) return { excerpt: '' }
  const from = turn.start, until = turn.end, point = Math.max(at, from)
  let start = Math.max(from, point - 100)
  if (start > from) { const space = flat.indexOf(' ', start); if (space >= 0 && space < until) start = space + 1 }
  while (flat[start] === ' ') start++
  let end = Math.min(until, start + EXCERPT)
  if (end < until) end = Math.max(start + 40, flat.lastIndexOf(' ', end))
  const body = flat.slice(start, Math.min(end, until)).trim()
  return { excerpt: `${start > from ? '...' : ''}${body}${end < until ? '...' : ''}` }
}

/** The pages of one transcript holding the most query words (all of them first), with a verbatim excerpt where
 * quoting is allowed. */
export async function pageHits(env: ToolEnv, ix: TextIndex, key: string, terms: string[], max = 2): Promise<TextHits | null> {
  const row = ix.docs.find(d => d.key === key)
  const file = String(row?.file ?? '')
  if (!FILE.test(file)) return null
  const doc = object(await readToolAsset(env, file))
  if (doc.key !== key) return null
  const index = object(doc.terms), pages = records(doc.pages)
  const score = new Map<number, number>()
  for (const t of terms) for (const n of (index[t] as number[]) ?? []) score.set(n, (score.get(n) ?? 0) + 1)
  const best = [...score].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, max)
  const quote = doc.quote_policy === 'quote'
  const hits = best.map(([n]) => {
    const page = pages.find(p => p.n === n) ?? {}
    return { pdf_page: n, transcript_page: (page.folio as string) ?? null, url: `${doc.pdf_url}#page=${n}`,
      ...(quote && typeof page.text === 'string' ? excerpt(page.text, terms) : { excerpt: null }) }
  // A page whose match leaves nothing to quote (a heading with no words after it, a word index) is not offered.
  }).filter(h => h.excerpt === null || /[^.\s]/.test(h.excerpt))
  return { file, quote_policy: String(doc.quote_policy), attribution: String(doc.attribution), licence_url: String(doc.licence_url),
    ...(quote ? {} : { order_notice: String(doc.order_notice) }), hits }
}
