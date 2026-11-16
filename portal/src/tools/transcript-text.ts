/** Full text of hearing transcripts the publisher licenses under CC BY 4.0 (public/transcripts, built by
 * scripts/build_transcript_fulltext.py). A transcript whose publisher text records a non-publication or
 * suppression order or a pseudonymous witness carries no text: only the pages a word appears on. */
import { object, records, type RecordRow } from './published-records'
import { readToolAsset, type ToolEnv } from './types'

const SHARD = /^\/transcripts\/terms\/\d{2}\.json$/
const FILE = /^\/transcripts\/[a-z0-9-]+\/transcript-[a-z0-9-]+\.json$/
const EXCERPT = 280

export type TextIndex = { docs: RecordRow[], stop: Set<string>, common: Set<string>, shards: number, commissions: RecordRow }
export type PageHit = { pdf_page: number, transcript_page: string | null, url: string, excerpt: string | null, speaker_role?: SpeakerRole }
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

// A turn opens with the speaker's label in capitals: "MS EXAMPLE-SAMPLE:", "THE COMMISSIONER:", "MR STANDIN SC:".
const LABEL = /(?<=^|\s)((?:(?:THE|MR|MS|MRS|MISS|DR|PROF|UNCLE|AUNTY) )?[A-Z][A-Za-z'’.-]*[A-Z](?: [A-Z][A-Za-z'’.-]*[A-Z]){0,3}):(?=\s)/g
const KEEP = new Set(['SC', 'KC', 'QC', 'AM', 'AO', 'AC', 'OAM', 'PSM', 'APM'])

/** What a speaker is at the hearing, as the transcript itself gives it: its cover page lists the commissioner,
 * counsel assisting and who appears for a party; a "<NAME, SWORN" or "<NAME, AFFIRMED" line marks a witness; and
 * "THE COMMISSIONER", "THE WITNESS" and an "A." answer are roles in the label. Never inferred from what was said.
 * An excerpt carries the role only, never the person's name: a wrong name is worse than none. */
export const SPEAKER_ROLES = ['commissioner', 'counsel assisting', 'witness', 'counsel for a party'] as const
export type SpeakerRole = typeof SPEAKER_ROLES[number]
export type RoleOf = (label: string) => SpeakerRole | undefined

const TITLES = new Set(['THE', 'HON', 'HONOURABLE', 'MR', 'MS', 'MRS', 'MISS', 'DR', 'PROF', 'PROFESSOR', 'UNCLE', 'AUNTY', 'SENATOR', 'COMMISSIONER', 'JUSTICE'])
const surname = (name: string) => name.toUpperCase().replace(/[.,]/g, '').split(/\s+/).filter(w => w && !KEEP.has(w) && !TITLES.has(w)).at(-1) ?? ''
// A witness line: "<TAYLOR JAMIE SPECIMEN, SWORN", "<DREW D'MOCKUP,sworn: [10.03am]", "<QUINN TEMPLATE, on former
// affirmation:", "<RILEY JOHN PROXY, VIA VIDEO-CONFERENCE, SWORN [12.02 pm]", "<SAM ÉXAMPLE, affirmed:", "<X, CALLED".
const SWORN = /^<\s*(?!THE\b|WITNESS)(\p{L}[\p{L}'’. -]{2,70}?)\s*(?:,[^,[<]{1,40})?(?:,\s*|\s+)(?:on former (?:oath|affirmation)|(?:re-?)?sworn|(?:re-?)?affirmed|recalled|called)(?![\p{L}-])/iu
// A witness leaving: "<THE WITNESS WITHDREW", "<THE WITNESSES WERE RELEASED", "<WITNESSES EXCUSED", "<MS SPECIMEN WITHDREW".
const LEFT = /\b(?:WITHDREW|RELEASED|EXCUSED|ST(?:OOD|ANDS) DOWN)\b/i
// Lines about the sitting, an examination or an exhibit, which say nothing about who is giving evidence.
const PROCEDURAL = /^<\s*(?:(?:(?:FURTHER|RE|CROSS)[- ]?)*EXAMINATION\b|EXHI?BITS?\b|(?:THE )?(?:OPENING )?HEARING\b|(?:SHORT |LUNCHEON )?ADJOURN(?:ED|MENT)\b|RESUMED\b|COMMENCED?\b|TRANSCRIPT OF\b)/i
/** What one "<" line of a transcript is. "unrecognised" is a line none of the patterns place: it may be a witness
 * line in a form not seen before, so nothing is read from it (portal/scripts/transcript-parser-audit.mjs counts them). */
export type NoteKind = 'sworn' | 'left' | 'procedural' | 'unrecognised'
export function noteKind(line: string): NoteKind {
  const l = line.trim()
  return SWORN.test(l) ? 'sworn' : LEFT.test(l) ? 'left' : PROCEDURAL.test(l) ? 'procedural' : 'unrecognised'
}
const MARKER_LINE = /^[ \t]*<[^\n]*$/gm
const ROLE_WORD = /(?<![a-z])(counsel assisting|counsel for|for|commissioner)(?![a-z])/i
const OPENS_ENTRY = /^(?:MR|MS|MRS|MISS|DR|PROF|PROFESSOR|THE HON)\b/i

/** The roles one transcript gives its speakers. A surname the cover lists and a witness line also names is left
 * without a role, as is anyone the transcript does not place. */
export function speakerRoles(pages: RecordRow[]): RoleOf {
  const cover = String(pages[0]?.text ?? '').split('\n').map(line => line.trim()).filter(Boolean)
  const sworn = new Set<string>()
  for (const p of pages) if (typeof p.text === 'string') for (const line of p.text.match(MARKER_LINE) ?? []) {
    const name = SWORN.exec(line.trim())?.[1]
    if (name) sworn.add(surname(name))
  }
  const role = (word: string): SpeakerRole => /assisting/i.test(word) ? 'counsel assisting' : /commissioner/i.test(word) ? 'commissioner' : 'counsel for a party'
  // The cover lists who appears, one entry to a line ("MS X SC, for the Commonwealth") or wrapped over several
  // ("A SC WITH B AND / C, COUNSEL ASSISTING"). A name is read with the role that closes its own entry. A name
  // after "for" is a party someone appears for, not a speaker's role, and is never read as one.
  const listed = (name: string): SpeakerRole | undefined => {
    const word = new RegExp(`(?<![\\p{L}'’-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}'’-])`, 'iu')
    for (const [n, line] of cover.entries()) {
      const m = word.exec(line)
      if (!m || /\bfor\b/i.test(line.slice(0, m.index))) continue
      // The entry runs on to the next line only while it reads as a list of names (a comma, "and", "with") or the
      // role opens that line; a bare name above an unrelated line takes no role from it.
      let tail = line.slice(m.index + m[0].length), last = tail
      const previous = cover.slice(0, n).reverse().map(l => [...l.matchAll(new RegExp(ROLE_WORD, 'gi'))].at(-1)?.[1]).find(Boolean)
      const wrapped = !(previous && /for$/i.test(previous)) || OPENS_ENTRY.test(line)
      for (const next of [...cover.slice(n + 1, n + 4), '']) {
        const found = ROLE_WORD.exec(tail)
        if (found) { if (!/[0-9:]/.test(tail.slice(0, found.index))) return role(found[1]); break }
        if (!next || !wrapped || /[0-9:]/.test(tail)) break
        const joined = `${tail} ${next}`, ahead = ROLE_WORD.exec(joined)
        const lastWord = tail.trimEnd().lastIndexOf(' ') + 1
        if (!/,|\b(?:and|with)\b/i.test(last) && !(ahead && ahead.index >= lastWord)) break
        tail = joined; last = next
      }
    }
    return undefined
  }
  return label => {
    const up = label.toUpperCase().trim()
    if (/^(?:THE )?COMMISSIONER$/.test(up)) return 'commissioner'
    if (up === 'THE WITNESS') return 'witness'
    const name = surname(up)
    if (name.length < 3) return undefined
    const onCover = listed(name), gaveEvidence = sworn.has(name)
    return onCover && gaveEvidence ? undefined : gaveEvidence ? 'witness' : onCover
  }
}

// One turn boundary on a page: a speaker label, a "Q." or "A." of an examination, or a "<" procedural line.
type Mark = { at: number, end: number, kind: 'label' | 'q' | 'a' | 'note', label?: string }

const flatten = (text: string) => text.replace(MARKER_LINE, m => `\u0002${m.trim()}\u0003`).replace(/(^[ \t]*|[A-Z]:[ \t]+)(Q|A)\.(?=\s)/gm, '$1\u0001$2.').replace(/\s+/g, ' ').trim()
/** Every "Q." and "A." at the start of a line is a boundary, so no excerpt runs from one turn into the next. */
function marksIn(flat: string): Mark[] {
  const notes: Mark[] = [...flat.matchAll(/\u0002([^\u0003]*)\u0003/g)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: 'note' }))
  const labels: Mark[] = [...flat.matchAll(LABEL)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: 'label' as const, label: m[1] })).filter(l => !notes.some(n => l.at >= n.at && l.at < n.end))
  const qa: Mark[] = [...flat.matchAll(/\u0001([QA])\./g)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: m[1] === 'Q' ? 'q' as const : 'a' as const }))
  return [...notes, ...labels, ...qa].sort((a, b) => a.at - b.at)
}
const lastIndex = (marks: Mark[], test: (m: Mark) => boolean) => { for (let i = marks.length - 1; i >= 0; i--) if (test(marks[i])) return i; return -1 }

/** How sure the page itself makes the speaker of one stretch of text.
 *  confident: the turn opens on this page with the transcript's own heading, a speaker label ("MR SAMPLE:", also
 *    "MR SAMPLE: Q."), or with an "A." on a page that is plainly an examination (it has "Q." and "A." both).
 *  uncertain: the turn opens on this page, but who holds it would have to be carried from somewhere else: a bare
 *    "Q." (the examiner was named earlier), a lone "A." or "Q.", or text after a "<" procedural line.
 *  page_top: the text runs on from the page before. Nothing is carried across a page break. */
export type TurnBasis = 'confident' | 'uncertain' | 'page_top'
/** The role of whoever holds the turn marks[i] opens, and how sure the page makes it. Only a confident turn can
 * have a role, and no turn has a name. A label the transcript gives no role is confident with no role. */
function speakerAt(flat: string, marks: Mark[], i: number, roleOf: RoleOf | undefined): { basis: TurnBasis, speaker_role?: SpeakerRole } {
  if (i < 0) return { basis: 'page_top' }
  const mark = marks[i]
  const labelled = (label: string): { basis: TurnBasis, speaker_role?: SpeakerRole } => { const role = roleOf?.(label); return { basis: 'confident', ...(role ? { speaker_role: role } : {}) } }
  if (mark.kind === 'label') return labelled(mark.label!)
  if (mark.kind === 'note') return { basis: 'uncertain' }
  // "MR SAMPLE: Q." is that speaker's question: the label and the letter are one heading.
  const heading = marks[i - 1]
  if (heading?.kind === 'label' && !flat.slice(heading.end, mark.at).trim()) {
    const role = roleOf?.(heading.label!)
    return mark.kind === 'q' && role === 'witness' ? { basis: 'uncertain' } : labelled(heading.label!)
  }
  if (mark.kind === 'a' && marks.some(m => m.kind === 'q')) return { basis: 'confident', speaker_role: 'witness' }
  return { basis: 'uncertain' }
}

/** Every stretch of text on a page with how sure its speaker is, for the parser audit. */
export function pageTurns(text: string, roleOf?: RoleOf): { basis: TurnBasis, speaker_role?: SpeakerRole, length: number }[] {
  const flat = flatten(text), marks = marksIn(flat), out: { basis: TurnBasis, speaker_role?: SpeakerRole, length: number }[] = []
  const add = (i: number, from: number, to: number) => { const length = flat.slice(from, to).trim().length; if (length) out.push({ ...speakerAt(flat, marks, i, roleOf), length }) }
  add(-1, 0, marks[0]?.at ?? flat.length)
  // A label that only heads a "Q." or "A." has no text of its own; the letter's stretch is the turn.
  for (const [i, m] of marks.entries()) add(i, m.end, marks[i + 1]?.at ?? flat.length)
  return out
}

/** A verbatim excerpt around the first query word, kept within one speaker's turn. The turn's label is never left
 * in the text and no speaker is named: with the document's roles (roleOf), a turn that opens on this page under
 * the transcript's own heading carries that speaker's role. A turn that began on an earlier page has none. */
export function excerpt(text: string, terms: string[], context: { roleOf?: RoleOf } = {}): { excerpt: string, speaker_role?: SpeakerRole } {
  const flat = flatten(text), marks = marksIn(flat)
  const inside = (n: number) => marks.find(m => n >= m.at && n < m.end)
  let at = -1, label: Mark | undefined
  for (const t of terms) for (const m of flat.matchAll(new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '')}`, 'gi'))) {
    const mark = inside(m.index!)
    // A word found only in a speaker's label or a procedural line points at the turn that follows it.
    if (mark) { if (!label || mark.at < label.at) label = mark; continue }
    if (at < 0 || m.index! < at) at = m.index!
    break
  }
  if (at < 0 && label) at = label.end
  const point = at < 0 ? 0 : at
  let i = lastIndex(marks, m => m.end <= point)
  if (i < 0 && at < 0 && marks[0]?.at === 0) i = 0
  const turn = i >= 0 ? marks[i] : undefined
  let from = turn ? turn.end : 0
  while (flat[from] === ' ') from++
  const until = marks.find(m => m.at >= Math.max(from, point))?.at ?? flat.length
  let start = Math.max(from, point - 100)
  if (start > from) { const space = flat.indexOf(' ', start); if (space >= 0 && space < until) start = space + 1 }
  while (flat[start] === ' ') start++
  let end = Math.min(until, start + EXCERPT)
  if (end < until) end = Math.max(start + 40, flat.lastIndexOf(' ', end))
  // The marks' own control characters never reach the quoted words.
  const body = flat.slice(start, end).replace(/[\u0001-\u0003]/g, '').trim()
  const role = context.roleOf ? speakerAt(flat, marks, i, context.roleOf).speaker_role : undefined
  return { excerpt: `${start > from ? '...' : ''}${body}${end < flat.length && end < until ? '...' : ''}`, ...(role ? { speaker_role: role } : {}) }
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
  const quote = doc.quote_policy === 'quote', roleOf = quote ? speakerRoles(pages) : undefined
  const hits = best.map(([n]) => {
    const page = pages.find(p => p.n === n) ?? {}
    return { pdf_page: n, transcript_page: (page.folio as string) ?? null, url: `${doc.pdf_url}#page=${n}`,
      ...(quote && typeof page.text === 'string' ? excerpt(page.text, terms, { roleOf }) : { excerpt: null }) }
  })
  return { file, quote_policy: String(doc.quote_policy), attribution: String(doc.attribution), licence_url: String(doc.licence_url),
    ...(quote ? {} : { order_notice: String(doc.order_notice) }), hits }
}
