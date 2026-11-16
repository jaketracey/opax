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
  if (data.schema !== 2 || !Array.isArray(data.docs)) return null
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
/** How well a transcript fits a word search, from the postings alone (no transcript is opened): `least` is the page
 * count of the searched word that is on the fewest of its pages, and transcripts are listed most first by it;
 * `pages` is the sum of the searched words' page counts, most first among equals. A hearing day that discusses every
 * searched word at length comes before one where a word appears once. Words too common to be posted (ix.common) take
 * no part. */
export type TextFit = { least: number, pages: number }
/** The transcripts of a commission whose text holds every searched word, with each one's fit. */
export async function textMatches(env: ToolEnv, ix: TextIndex, commission: string, words: string): Promise<{ keys: Set<string>, terms: string[], fit: Map<string, TextFit> } | null> {
  if (!object(ix.commissions[commission]).name) return null
  const terms = [...new Set(tokens(words, ix.stop))]
  const narrow = terms.filter(t => !ix.common.has(t))
  if (!narrow.length) return null
  let docs = new Map<number, TextFit>(ix.docs.filter(d => d.commission === commission).map(d => [Number(d.i), { least: Number.MAX_SAFE_INTEGER, pages: 0 }]))
  for (const t of narrow) {
    const path = `/transcripts/terms/${String(shardOf(t, ix.shards)).padStart(2, '0')}.json`
    if (!SHARD.test(path)) return null
    // A posting is [transcripts, pages of each holding the word].
    const posting = object(await readToolAsset(env, path))[t] as [number[], number[]] | undefined
    const held = new Map<number, number>((posting?.[0] ?? []).map((i, at) => [i, Number(posting?.[1]?.[at]) || 1]))
    docs = new Map([...docs].flatMap(([i, fit]): [number, TextFit][] => { const n = held.get(i); return n ? [[i, { least: Math.min(fit.least, n), pages: fit.pages + n }]] : [] }))
    if (!docs.size) break
  }
  const matched = ix.docs.filter(d => docs.has(Number(d.i)))
  return { keys: new Set(matched.map(d => String(d.key))), terms, fit: new Map(matched.map(d => [String(d.key), docs.get(Number(d.i))!])) }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "2022-09-27" as "27 September 2022"; anything else unchanged. */
export function dayWords(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso ?? '')
}
/** A hearing date range in words: "27 September 2022 to 10 March 2023", or one day. */
export const spanWords = (first: unknown, last: unknown) => first === last ? dayWords(first) : `${dayWords(first)} to ${dayWords(last)}`

// A heading is printed at the start of a line and ends in a colon: "MS HOGAN-DORAN:", "THE COMMISSIONER:",
// "MR LANCASTER SC:", "MS L SURNAME:", "A/PROFESSOR SURNAME:", "SENATOR THE HON. FIRST SURNAME:", "MR De SURNAME:".
// Its words are capitals (a surname particle or a "Mc" allowed), or it is a role word alone in any case
// ("Commissioner:"). Title case is not a heading ("Dr Surname: at the time ..." is counsel addressing a witness),
// nor is a run holding a digit or a quote mark (a document id, a quoted title), nor a long run of capitals with
// no title (a document's title). A heading that is not recognised would hand its words to the turn before, while
// a line wrongly read as a heading only ends an excerpt early.
const PARTICLE = /^(?:de|di|du|da|del|della|le|la|van|von|der|den|ter|bin|al|el|st)$/i
const TITLE = /^(?:THE|MR|MS|MRS|MISS|MX|DR|PROF|PROFESSOR|A\/PROF|A\/PROFESSOR|ASSOCIATE|ADJUNCT|EMERITUS|SENATOR|HON|JUSTICE|JUDGE|COMMISSIONER|DEPUTY|CHIEF|COUNSEL|UNCLE|AUNTY|RABBI|REVEREND|REV|SIR|DAME|CR|COUNCILLOR|MINISTER|DETECTIVE|SERGEANT|INSPECTOR|SUPERINTENDENT)\.?$/
const ROLE = /^(?:the )?(?:(?:deputy |chief |assistant )?commissioner|chair|chairperson|witness|witnesses|associate|interpreter|speaker|operator|registrar|counsel assisting|presiding member)$/i
const capitalWord = (w: string) => /^[A-Z][A-Z'’.\/()-]*$/.test(w) || /^[A-Z][A-Za-z'’.-]*[A-Z]$/.test(w) || PARTICLE.test(w)
/** The heading a line opens with, as printed and without its colon, or null. */
function headingOf(line: string): { heading: string, length: number } | null {
  const m = /^([^:]{1,70}?)\s?:+(?=\s|$)/.exec(line)
  if (!m) return null
  const words = m[1].split(' ')
  const capitals = words.every(capitalWord) && /[A-Z]{2}/.test(m[1].replace(/[^A-Za-z]/g, '')) && (words.length <= 4 || (words.length <= 8 && TITLE.test(words[0])))
  return capitals || ROLE.test(m[1]) ? { heading: m[1], length: m[0].length } : null
}
// "Q." and "A." open turns that carry no heading of their own; the publisher also prints "Q --".
const MARK = /^([QA])(?:[.:]| --)(?=\s|$)/
// A line of the publisher's that is nobody's words: one opened with "<", or in capitals an examination line, an
// adjournment or resumption, or an exhibit or marked-for-identification line ("EXHIBIT #A1 JOINT REPORT OF ...", "MFI #2 ...").
const NOTE = /^(?:(?:FURTHER |CROSS[- ]|RE[- ])*EXAMINATION BY|(?:[A-Z]+ )?ADJOURNMENT\b|ADJOURNED\b|UPON RESUM|EXHIBIT #?[A-Z0-9]|MFI ?#)/
/** No lower-case words: bracketed times and "am"/"pm" after a figure aside. */
const allCapitals = (line: string) => !/[a-z]/.test(line.replace(/\[[^\]]*\]|(?<=\d ?)[ap]m\b/g, ''))
const noteLine = (line: string) => line[0] === '<' || (NOTE.test(line) && allCapitals(line))
// A word index ("word [2] - 1477:37, 1479:4") and an exhibit list (rows of document ids) are not hearing turns.
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
 * are read one line at a time from the start of the line, never across a line break. A heading read with its
 * colon somewhere on the page, or a role in capitals, also opens a turn where the publisher dropped the colon
 * ("MR SURNAME I noticed ...", "THE WITNESS. Yes."). A note is a line of the publisher's with any capitals-only
 * lines it wraps onto; its text belongs to no turn. A word-index page or an exhibit list has no turns, nor does
 * PDF page 1 when `pdfPage` says so (the cover: appearances with counsel's full names). Pure: the same page always
 * gives the same turns.
 *
 * For a reader of the turns (roles): only a heading prints a speaker. A mark turn with no heading prints none:
 * an "A." is a witness's answer, but not which witness; a bare "Q." is a question, and the last headed "Q." must
 * not be carried forward to it (the Commissioner may have gone on, or counsel resumed). A turn that opens the page
 * or follows a note has no printed speaker either. "MR SURNAME: ." with the "Q." on the next line gives a heading
 * turn holding "." and then a bare mark turn. The heading is the publisher's, slips included. A heading is not
 * always a person ("RE:" in a quoted email): take a role only from a heading that starts with a title or is a role
 * word. */
export function pageTurns(page: string, pdfPage?: number): { text: string, turns: PageTurn[] } {
  const lines = page.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  // Headings the page prints with a colon: the same words open a turn when the colon is missing.
  const printed = [...new Set(lines.flatMap(l => { const h = noteLine(l) || MARK.test(l) ? null : headingOf(l); return h && TITLE.test(h.heading.split(' ')[0]) ? [h.heading] : [] }))]
    .sort((a, b) => b.length - a.length)
  const bare = (line: string) => {
    const heading = /^(?:THE COMMISSIONER|THE WITNESS|THE CHAIR|COMMISSIONER)\b/.exec(line)?.[0] ?? printed.find(h => line.startsWith(h))
    const gap = heading === undefined ? null : /^(?:[.;](?= |$)| -- | )/.exec(line.slice(heading.length))
    // After a bare space the next word must not be more capitals: that is a longer name or a title, not a turn.
    return heading === undefined || !gap || (gap[0] === ' ' && /^[A-Z][A-Z'’.\/-]*[A-Z]\b/.test(line.slice(heading.length + 1))) ? null : { heading, length: heading.length + gap[0].length }
  }
  const turns: PageTurn[] = [{ from: 0, start: 0, end: 0, opens: 'page' }]
  let text = '', note = false
  for (const line of lines) {
    if (text) text += ' '
    const at = text.length, last = turns[turns.length - 1]
    const opener = noteLine(line), lone = !opener && MARK.test(line)
    const head = opener || lone ? null : headingOf(line) ?? bare(line), mark = opener ? null : MARK.exec(head ? line.slice(head.length).trimStart() : line)
    note = opener || (note && !head && !mark && allCapitals(line))
    text += line
    if (note) { if (last.opens !== 'note' || last.end > last.start) turns.push({ from: at, start: text.length, end: text.length, opens: 'note' }); else last.start = last.end = text.length; continue }
    if (!head && !mark) { last.end = text.length; continue }
    const start = at + (head ? head.length : 0) + (mark ? line.slice(head ? head.length : 0).search(/\S/) + mark[0].length : 0)
    turns.push({ from: at, start: Math.min(text.length, start), end: text.length, opens: mark ? 'mark' : 'heading',
      ...(head ? { heading: head.heading } : {}), ...(mark ? { mark: mark[1] as 'Q' | 'A' } : {}) })
  }
  for (const t of turns) { while (t.start < t.end && text[t.start] === ' ') t.start++; if (t.start >= t.end) t.start = t.end = Math.max(t.start, t.end) }
  const listed = (pattern: RegExp) => lines.filter(l => pattern.test(l)).length
  const exhibits = /^Exhibit (?:List$|Document ID\b)/.test(`${lines[0] ?? ''} ${lines[1] ?? ''}`.trim()) || lines[0] === 'Exhibit List'
  if (pdfPage === 1 || exhibits || listed(REFERENCE) * 5 >= lines.length * 2 || (listed(DOCUMENT) >= 4 && listed(DOCUMENT) * 3 >= lines.length)) return { text, turns: [] }
  return { text, turns: turns.filter((t, i) => i > 0 || t.end > t.start) }
}

/** A verbatim excerpt around the first query word spoken on the page, kept inside the one turn the word is in: no
 * heading, mark or note sits in the text. A word found only in headings, marks or notes gives the words its first
 * opener is followed by, which may be none. No speaker is returned: Ask prose and citations name no one. */
export function excerpt(text: string, terms: string[], pdfPage?: number): { excerpt: string } {
  const { text: flat, turns } = pageTurns(text, pdfPage)
  // The first place a query word is spoken wins; failing that, the first opener one is printed in.
  let spoken = -1, printed = -1
  for (const t of terms) {
    const word = t.replace(/[^a-z0-9]/g, '')
    if (!word) continue
    for (const m of flat.matchAll(new RegExp(`\\b${word}`, 'gi'))) {
      if (turns.some(u => u.start <= m.index! && m.index! < u.end)) { if (spoken < 0 || m.index! < spoken) spoken = m.index!; break }
      if (printed < 0 || m.index! < printed) printed = m.index!
    }
  }
  const at = spoken >= 0 ? spoken : printed
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
  const quote = doc.quote_policy === 'quote'
  // The best pages first; a page whose match leaves nothing to quote (a heading with no words after it, a word
  // index) is passed over for the next best.
  const hits: PageHit[] = []
  for (const [n] of [...score].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    if (hits.length >= max) break
    const page = pages.find(p => p.n === n) ?? {}
    const hit = { pdf_page: n, transcript_page: (page.folio as string) ?? null, url: `${doc.pdf_url}#page=${n}`,
      ...(quote && typeof page.text === 'string' ? excerpt(page.text, terms, n) : { excerpt: null }) }
    if (hit.excerpt === null || /[^.\s]/.test(hit.excerpt)) hits.push(hit)
  }
  return { file, quote_policy: String(doc.quote_policy), attribution: String(doc.attribution), licence_url: String(doc.licence_url),
    ...(quote ? {} : { order_notice: String(doc.order_notice) }), hits }
}
