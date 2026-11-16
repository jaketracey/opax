/** Full text of hearing transcripts the publisher licenses under CC BY 4.0 (public/transcripts, built by
 * scripts/build_transcript_fulltext.py). A transcript whose publisher text records a non-publication or
 * suppression order or a pseudonymous witness carries no text: only the pages a word appears on. */
import { object, records, type RecordRow } from './published-records'
import { readToolAsset, type ToolEnv } from './types'

const SHARD = /^\/transcripts\/terms\/\d{2}\.json$/
const FILE = /^\/transcripts\/[a-z0-9-]+\/transcript-[a-z0-9-]+\.json$/
const EXCERPT = 280

export type TextIndex = { docs: RecordRow[], stop: Set<string>, common: Set<string>, shards: number, commissions: RecordRow }
export type PageHit = { pdf_page: number, transcript_page: string | null, url: string, excerpt: string | null, speaker?: string, speaker_label?: string, speaker_role?: SpeakerRole }
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

// A turn opens with the speaker's label in capitals: "MS HOGAN-DORAN:", "THE COMMISSIONER:", "MR LANCASTER SC:".
const LABEL = /(?<=^|\s)((?:(?:THE|MR|MS|MRS|MISS|DR|PROF|UNCLE|AUNTY) )?[A-Z][A-Za-z'’.-]*[A-Z](?: [A-Z][A-Za-z'’.-]*[A-Z]){0,3}):(?=\s)/g
const KEEP = new Set(['SC', 'KC', 'QC', 'AM', 'AO', 'AC', 'OAM', 'PSM', 'APM'])
/** The label as a name: "MS HOGAN-DORAN" as "Ms Hogan-Doran", "McLEOD" as "McLeod". */
export function speakerName(label: string): string {
  return label.split(' ').map(word => KEEP.has(word) ? word
    : word.replace(/^Mc(?=[A-Z])/, 'Mc\u0000').toLowerCase().replace(/(^|[-'’\u0000])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()).replace('\u0000', '')).join(' ')
}

/** What a speaker is at the hearing, as the transcript itself gives it: its cover page lists the commissioner,
 * counsel assisting and who appears for a party; a "<NAME, SWORN" or "<NAME, AFFIRMED" line marks a witness; and
 * "THE COMMISSIONER", "THE WITNESS" and an "A." answer are roles in the label. Never inferred from what was said. */
export const SPEAKER_ROLES = ['commissioner', 'counsel assisting', 'witness', 'counsel for a party'] as const
export type SpeakerRole = typeof SPEAKER_ROLES[number]
export type RoleOf = (label: string) => SpeakerRole | undefined

const TITLES = new Set(['THE', 'HON', 'HONOURABLE', 'MR', 'MS', 'MRS', 'MISS', 'DR', 'PROF', 'PROFESSOR', 'UNCLE', 'AUNTY', 'SENATOR', 'COMMISSIONER', 'JUSTICE'])
const surname = (name: string) => name.toUpperCase().replace(/[.,]/g, '').split(/\s+/).filter(w => w && !KEEP.has(w) && !TITLES.has(w)).at(-1) ?? ''
// "<MATTHEW JAMES FLAVEL, SWORN", "<ALFA D'AMATO, sworn: [10.03am]", "<DEBORAH WILLCOX, on former affirmation:".
const SWORN = /^<\s*([A-Z][A-Za-z'’. -]{2,70}?),?\s+(?:on former (?:oath|affirmation)|(?:re-?)?sworn|(?:re-?)?affirmed|recalled)\b/i
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
type Mark = { at: number, end: number, kind: 'label' | 'q' | 'a' | 'note', label?: string, sworn?: string }
/** What earlier pages leave open at the top of a page: the turn still running, who is examining, who is sworn. */
export type Carry = { turn?: Mark, examiner?: string, witnesses?: string[] }

const flatten = (text: string) => text.replace(MARKER_LINE, m => `\u0002${m.trim()}\u0003`).replace(/(^[ \t]*|[A-Z]:[ \t]+)(Q|A)\.(?=\s)/gm, '$1\u0001$2.').replace(/\s+/g, ' ').trim()
function marksIn(flat: string, carry?: Carry): Mark[] {
  const notes: Mark[] = [...flat.matchAll(/\u0002([^\u0003]*)\u0003/g)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: 'note', sworn: SWORN.exec(m[1])?.[1] }))
  const labels: Mark[] = [...flat.matchAll(LABEL)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: 'label' as const, label: m[1] })).filter(l => !notes.some(n => l.at >= n.at && l.at < n.end))
  let qa: Mark[] = [...flat.matchAll(/\u0001([QA])\./g)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: m[1] === 'Q' ? 'q' as const : 'a' as const }))
  // A lone line that happens to open "A." is not an examination: both letters, or one already under way.
  if (!(qa.some(m => m.kind === 'q') && qa.some(m => m.kind === 'a')) && !['q', 'a'].includes(carry?.turn?.kind ?? '')) qa = []
  return [...notes, ...labels, ...qa].sort((a, b) => a.at - b.at)
}
const lastIndex = (marks: Mark[], test: (m: Mark) => boolean) => { for (let i = marks.length - 1; i >= 0; i--) if (test(marks[i])) return i; return -1 }
/** The sworn names in the unbroken run of witness lines that ends at marks[i]. */
function swornRun(marks: Mark[], i: number): string[] {
  const run: string[] = []
  for (let j = i; j >= 0 && marks[j].kind === 'note' && marks[j].sworn; j--) run.unshift(marks[j].sworn!)
  return run
}
/** Who holds the turn a mark opens. An answer is a witness's, named only when one witness is sworn; a question is
 * the examiner's, the last labelled speaker, unless that label is a witness's. */
function speakerAt(marks: Mark[], i: number, carry: Carry | undefined, roleOf: RoleOf | undefined): { speaker?: string, speaker_label?: string, speaker_role?: SpeakerRole } {
  const mark = i < 0 ? carry?.turn : marks[i]
  if (!mark || mark.kind === 'note') return {}
  const named = (label: string) => { const role = roleOf?.(label); return { speaker: speakerName(label), speaker_label: label, ...(role ? { speaker_role: role } : {}) } }
  if (mark.kind === 'label') return named(mark.label!)
  const before = i < 0 ? [] : marks.slice(0, i)
  if (mark.kind === 'q') {
    const examiner = before.filter(m => m.kind === 'label').at(-1)?.label ?? carry?.examiner
    return examiner && roleOf?.(examiner) !== 'witness' ? named(examiner) : {}
  }
  const at = lastIndex(before, m => m.kind === 'note' && !!m.sworn)
  const witnesses = at >= 0 ? swornRun(before, at) : carry?.witnesses ?? []
  return { ...(witnesses.length === 1 ? { speaker: speakerName(witnesses[0].toUpperCase()) } : {}), speaker_role: 'witness' }
}
/** What the pages before page n leave open, read back from the nearest. */
export function carryInto(pages: RecordRow[], n: number): Carry {
  const carry: Carry = {}
  const earlier = pages.filter(p => Number(p.n) < n && typeof p.text === 'string').sort((a, b) => Number(b.n) - Number(a.n)).slice(0, 40)
  for (const page of earlier) {
    // Read as an examination whenever the page has both letters; the pages before it settle a lone one.
    const marks = marksIn(flatten(String(page.text)))
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]
      if (!carry.turn) carry.turn = m
      if (!carry.examiner && m.kind === 'label') carry.examiner = m.label
      if (!carry.witnesses && m.kind === 'note' && m.sworn) carry.witnesses = swornRun(marks, i)
    }
    if (carry.turn && carry.examiner && carry.witnesses) break
  }
  return carry
}

/** A verbatim excerpt around the first query word, kept within one speaker's turn. The turn's label is returned
 * as the speaker rather than left in the text. Without the pages before it (carry), a turn that began on an
 * earlier page has no speaker here; with them, it keeps the speaker who was already speaking. */
export function excerpt(text: string, terms: string[], context: { carry?: Carry, roleOf?: RoleOf } = {}): { excerpt: string, speaker?: string, speaker_label?: string, speaker_role?: SpeakerRole } {
  const flat = flatten(text), marks = marksIn(flat, context.carry)
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
  const body = flat.slice(start, end).trim()
  return { excerpt: `${start > from ? '...' : ''}${body}${end < flat.length && end < until ? '...' : ''}`, ...speakerAt(marks, i, context.carry, context.roleOf) }
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
      ...(quote && typeof page.text === 'string' ? excerpt(page.text, terms, { carry: carryInto(pages, n), roleOf }) : { excerpt: null }) }
  })
  return { file, quote_policy: String(doc.quote_policy), attribution: String(doc.attribution), licence_url: String(doc.licence_url),
    ...(quote ? {} : { order_notice: String(doc.order_notice) }), hits }
}
