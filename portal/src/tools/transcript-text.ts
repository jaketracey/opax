/** Full text of hearing transcripts the publisher licenses under CC BY 4.0 (public/transcripts, built by
 * scripts/build_transcript_fulltext.py). A transcript whose publisher text records a non-publication or
 * suppression order or a pseudonymous witness carries no text: only the pages a word appears on. */
import { object, records, type RecordRow } from './published-records'
import { readToolAsset, type ToolEnv } from './types'
import { sentenceSpans } from '../sentence-bounds.mjs'

const SHARD = /^\/transcripts\/terms\/\d{2}\.json$/
const FILE = /^\/transcripts\/[a-z0-9-]+\/transcript-[a-z0-9-]+\.json$/
const EXCERPT = 280

/** `commonPages`: for each everyday word, the pages holding it across all transcripts (how common it is). */
export type TextIndex = { docs: RecordRow[], stop: Set<string>, common: Set<string>, commonPages: Map<string, number>, shards: number, commissions: RecordRow }
/** `question` and `reply`: only with the transcript quotes-only switch on, the other half of a marked question-and-reply
 * pair, with its own page. `before` and `next`: in a transcript of headed turns, the turn printed before a hit when that
 * turn ends in a question, or the turn printed after a hit that ends in one. A hit has at most one of the four. */
export type PageHit = { pdf_page: number, transcript_page: string | null, url: string, excerpt: string | null, question?: { pdf_page: number, transcript_page: string | null, text: string }, reply?: { pdf_page: number, transcript_page: string | null, text: string }, before?: { pdf_page: number, transcript_page: string | null, text: string }, next?: { pdf_page: number, transcript_page: string | null, text: string } }
export type TextHits = { file: string, quote_policy: string, attribution: string, licence_url: string, order_notice?: string, hits: PageHit[] }

export async function textIndex(env: ToolEnv): Promise<TextIndex | null> {
  const data = object(await readToolAsset(env, '/transcripts/index.json'))
  if (data.schema !== 3 || !Array.isArray(data.docs)) return null
  const common = (data.common_terms as string[]) ?? [], pages = (data.common_pages as number[]) ?? []
  return { docs: records(data.docs), stop: new Set((data.stopwords as string[]) ?? []), common: new Set(common), commonPages: new Map(common.map((t, at) => [t, Number(pages[at]) || 0])),
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

/** A word search reads one postings file for each searched word, so the words are capped. Specific words (those not
 * in ix.common) are kept first; everyday words fill what is left. In both kinds the least frequent are kept and the
 * most frequent left out, by the number of pages holding the word across all transcripts (carried in the index for
 * everyday words; in term-pages.json for the rest, read only when there are more specific words than the cap). The
 * caller says which words were left out. */
export const TEXT_SEARCH_WORDS = 6
/** How well a transcript fits a word search, from the postings alone (no transcript is opened), each part most first:
 * `least` is the page count of the required word that is on the fewest of its pages; `everyday` is the same for the
 * everyday words that only rank (zero when the transcript lacks one of them, or when there are none); `pages` is the
 * sum of every searched word's page count. A hearing day that discusses every searched word at length comes before
 * one where a word appears once. */
export type TextFit = { least: number, everyday: number, pages: number }
/** The transcripts of a commission that match a word search, with each one's fit.
 * - With a specific word in the search, a transcript must hold every specific word. Everyday words (in more than half
 *   the transcripts) then only rank: they never remove a transcript, so the set is the one the specific words give.
 * - With only everyday words ("executive minute", "general practice training"), a transcript must hold every one.
 * `skipped` are the words past the cap, which took no part. Null when the words hold nothing to search (stopwords, or
 * years alone). */
export async function textMatches(env: ToolEnv, ix: TextIndex, commission: string, words: string): Promise<{ keys: Set<string>, terms: string[], fit: Map<string, TextFit>, skipped: string[] } | null> {
  if (!object(ix.commissions[commission]).name) return null
  const terms = [...new Set(tokens(words, ix.stop))]
  const specific = terms.filter(t => !ix.common.has(t))
  const everyday = terms.filter(t => ix.common.has(t)).map((t, at) => ({ t, at })).sort((a, b) => (ix.commonPages.get(a.t) ?? 0) - (ix.commonPages.get(b.t) ?? 0) || a.at - b.at).map(o => o.t)
  // More specific words than the cap (rare): the least frequent are kept, by the pages holding each across all
  // transcripts. That needs one small file of page totals, read only in this case; no postings file is read for a
  // word that is then left out. Ties keep the order given.
  let kept = specific
  if (specific.length > TEXT_SEARCH_WORDS) {
    const totals = object(await readToolAsset(env, '/transcripts/term-pages.json'))
    const pages = (t: string) => Object.hasOwn(totals, t) ? Number(totals[t]) || 0 : 0
    kept = specific.map((t, at) => ({ t, at })).sort((a, b) => pages(a.t) - pages(b.t) || a.at - b.at).slice(0, TEXT_SEARCH_WORDS).sort((a, b) => a.at - b.at).map(o => o.t)
  }
  const required = kept, ranking = everyday.slice(0, TEXT_SEARCH_WORDS - required.length)
  const skipped = [...specific.filter(t => !kept.includes(t)), ...everyday.slice(ranking.length)]
  // A search with no specific word, made only of everyday date words (a month name, a year that is in more than half
  // the transcripts: "2023-03", "10 March 2023", "February 2024") is a date lookup, answered from titles and dates
  // exactly as before. A year that is a specific word ("2014", "2016") searches the text like any other, as before.
  if (!required.length && ranking.every(t => /^\d{4}$/.test(t) || DATE_WORDS.has(t))) return null
  const posting = async (t: string): Promise<Map<number, number> | null> => {
    const path = `/transcripts/terms/${String(shardOf(t, ix.shards)).padStart(2, '0')}.json`
    if (!SHARD.test(path)) return null
    // A posting is [transcripts, pages of each holding the word].
    const shard = object(await readToolAsset(env, path)), held = Object.hasOwn(shard, t) ? shard[t] as [number[], number[]] : undefined
    return new Map<number, number>((held?.[0] ?? []).map((i, at) => [i, Number(held?.[1]?.[at]) || 1]))
  }
  // With no specific word the everyday words are the required ones.
  const must = required.length ? required : ranking, rank = required.length ? ranking : []
  let docs = new Map<number, TextFit>(ix.docs.filter(d => d.commission === commission).map(d => [Number(d.i), { least: Number.MAX_SAFE_INTEGER, everyday: 0, pages: 0 }]))
  for (const t of must) {
    const held = await posting(t)
    if (!held) return null
    docs = new Map([...docs].flatMap(([i, fit]): [number, TextFit][] => { const n = held.get(i); return n ? [[i, { ...fit, least: Math.min(fit.least, n), pages: fit.pages + n }]] : [] }))
    if (!docs.size) break
  }
  if (docs.size && rank.length) {
    for (const fit of docs.values()) fit.everyday = Number.MAX_SAFE_INTEGER
    for (const t of rank) {
      const held = await posting(t)
      if (!held) return null
      for (const [i, fit] of docs) { const n = held.get(i) ?? 0; fit.everyday = Math.min(fit.everyday, n); fit.pages += n }
    }
  }
  const matched = ix.docs.filter(d => docs.has(Number(d.i)))
  return { keys: new Set(matched.map(d => String(d.key))), terms, fit: new Map(matched.map(d => [String(d.key), docs.get(Number(d.i))!])), skipped }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DATE_WORDS = new Set(MONTHS.map(m => m.toLowerCase()))
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
  return { excerpt: excerptTurn(text, terms, pdfPage).excerpt }
}
/** A passage of one turn as whole sentences, at most EXCERPT (280) characters, verbatim (transcript quotes-only
 * switch). `near` says which sentences: a position in the page text (the sentence holding it, then the ones after
 * while they fit), 'start' (from the turn's first sentence) or 'end' (back from its last). A sentence that will not
 * fit by itself is cut at a word and the cut is marked with "...", so a cut is never hidden; whole sentences left
 * out before or after are not a cut. */
function wholeSentences(flat: string, from: number, until: number, near: number | 'start' | 'end'): string {
  const spans = sentenceSpans(flat.slice(from, until)) as { text: string, at: number }[]
  if (!spans.length) return ''
  const slice = (first: number, last: number) => flat.slice(from + spans[first].at, from + spans[last].at + spans[last].text.length)
  if (near === 'end') {
    let first = spans.length - 1
    const only = spans[first].text
    if (only.length > EXCERPT) { const cut = only.indexOf(' ', only.length - EXCERPT); return `...${only.slice(cut >= 0 ? cut + 1 : only.length - EXCERPT)}` }
    while (first > 0 && slice(first - 1, spans.length - 1).length <= EXCERPT) first--
    return slice(first, spans.length - 1)
  }
  let first = 0
  if (near !== 'start') for (let i = 0; i < spans.length; i++) if (spans[i].at <= near - from) first = i
  const only = spans[first].text
  if (only.length > EXCERPT) {
    // The searched word may sit past the first 280 characters of a long sentence: the window then starts before it.
    const point = near === 'start' ? 0 : Math.max(0, near - from - spans[first].at)
    let start = point < EXCERPT - 60 ? 0 : Math.max(0, point - 100)
    if (start > 0) { const space = only.indexOf(' ', start); if (space >= 0) start = space + 1 }
    let end = Math.min(only.length, start + EXCERPT)
    if (end < only.length) end = Math.max(start + 40, only.lastIndexOf(' ', end))
    return `${start > 0 ? '...' : ''}${only.slice(start, end).trim()}${end < only.length ? '...' : ''}`
  }
  let last = first
  while (last + 1 < spans.length && slice(first, last + 1).length <= EXCERPT) last++
  return slice(first, last)
}
type Beside = NonNullable<PageHit['question']>
/** A hit as the quotes-only block shows it: the matched turn as whole sentences, and, where the transcript marks
 * turns "Q." and "A.", the other half of the pair with its own page: the question put before a reply, or the reply
 * given to a question. Pure page structure (pageTurns): a pair is a "Q." turn and the bare "A." turn straight after
 * it, on one page or across a page break; no speaker and no role is read, and with any other turn beside it the hit
 * stands alone. */
function pairedPassage(pages: RecordRow[], n: number, terms: string[]): { excerpt: string, question?: Beside, reply?: Beside, before?: Beside, next?: Beside } | undefined {
  const page = pages.find(p => p.n === n)
  if (typeof page?.text !== 'string') return undefined
  const { flat, turns, turn, at } = excerptTurn(page.text, terms, n)
  if (!turn || at === undefined) return undefined
  const excerpt = wholeSentences(flat, turn.start, turn.end, Math.max(at, turn.start))
  if (!/[^.\s]/.test(excerpt)) return undefined
  const here = turns.indexOf(turn)
  const other = (step: -1 | 1): { page: RecordRow, flat: string, turn: PageTurn } | undefined => {
    const beside = turns[here + step]
    if (beside) return { page, flat, turn: beside }
    const next = pages.find(p => p.n === n + step)
    if (typeof next?.text !== 'string') return undefined
    const read = pageTurns(next.text, n + step), found = step < 0 ? read.turns.at(-1) : read.turns[0]
    return found ? { page: next, flat: read.text, turn: found } : undefined
  }
  const side = (found: ReturnType<typeof other>, near: 'start' | 'end'): Beside | undefined => {
    if (!found || found.turn.end <= found.turn.start) return undefined
    const text = wholeSentences(found.flat, found.turn.start, found.turn.end, near)
    return /[^.\s]/.test(text) ? { pdf_page: Number(found.page.n), transcript_page: (found.page.folio as string) ?? null, text } : undefined
  }
  const bareReply = (t: PageTurn | undefined) => !!t && t.opens === 'mark' && t.mark === 'A' && !t.heading
  if (bareReply(turn)) { const before = other(-1); const question = before?.turn.mark === 'Q' ? side(before, 'end') : undefined; return question ? { excerpt, question } : { excerpt } }
  if (turn.mark === 'Q') { const after = other(1); const reply = bareReply(after?.turn) ? side(after, 'start') : undefined; return reply ? { excerpt, reply } : { excerpt } }
  // A transcript that prints a speaker heading on every turn and no marks: a turn that ends with a question mark is
  // shown with the turn printed straight after it, called only "the next turn" (who speaks next is not read: it may
  // be the witness, the Commissioner or other counsel). Both turns must open with a heading; the heading's own text
  // is not part of either passage. The pair is given whichever of the two holds the searched word.
  // A heading is not always a speaker ("RE:" in a quoted email, a document id): only one that starts with a title or
  // is a role word opens a turn for this purpose. The test is of the heading's form; who it names is not read.
  const headed = (t: PageTurn | undefined) => !!t && t.opens === 'heading' && !t.mark && !!t.heading && (TITLE.test(t.heading.split(' ')[0]) || ROLE.test(t.heading))
  const asks = (found: { flat: string, turn: PageTurn } | undefined) => !!found && headed(found.turn) && /\?["”’')\]]*$/.test(found.flat.slice(found.turn.start, found.turn.end).trimEnd())
  if (headed(turn)) {
    if (asks({ flat, turn }) && /\?["”’')\]]*$/.test(excerpt)) { const after = other(1); const next = headed(after?.turn) ? side(after, 'start') : undefined; if (next) return { excerpt, next } }
    const prior = other(-1)
    if (asks(prior) && Math.max(at, turn.start) - turn.start < EXCERPT) { const before = side(prior, 'end'); const opening = wholeSentences(flat, turn.start, turn.end, 'start'); if (before && opening.includes(excerpt.replace(/^\.\.\.|\.\.\.$/g, '').slice(0, 40))) return { excerpt: opening, before } }
  }
  return { excerpt }
}
function excerptTurn(text: string, terms: string[], pdfPage?: number): { excerpt: string, flat: string, turns: PageTurn[], turn?: PageTurn, at?: number } {
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
  if (!turn || turn.end <= turn.start || at >= turn.end) return { excerpt: '', flat, turns }
  const from = turn.start, until = turn.end, point = Math.max(at, from)
  let start = Math.max(from, point - 100)
  if (start > from) { const space = flat.indexOf(' ', start); if (space >= 0 && space < until) start = space + 1 }
  while (flat[start] === ' ') start++
  let end = Math.min(until, start + EXCERPT)
  if (end < until) end = Math.max(start + 40, flat.lastIndexOf(' ', end))
  const body = flat.slice(start, Math.min(end, until)).trim()
  return { excerpt: `${start > from ? '...' : ''}${body}${end < until ? '...' : ''}`, flat, turns, turn, at }
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
    if (hit.excerpt === null || /[^.\s]/.test(hit.excerpt)) {
      // Quotes only: the passage as whole sentences, with the other half of a marked question-and-reply pair.
      const paired = env.transcriptQuotesOnly && hit.excerpt !== null ? pairedPassage(pages, n, terms) : undefined
      hits.push(paired ? { ...hit, ...paired } : hit)
    }
  }
  return { file, quote_policy: String(doc.quote_policy), attribution: String(doc.attribution), licence_url: String(doc.licence_url),
    ...(quote ? {} : { order_notice: String(doc.order_notice) }), hits }
}
