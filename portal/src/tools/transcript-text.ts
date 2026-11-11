/** Full text of hearing transcripts the publisher licenses under CC BY 4.0 (public/transcripts, built by
 * scripts/build_transcript_fulltext.py). A transcript whose publisher text records a non-publication or
 * suppression order or a pseudonymous witness carries no text: only the pages a word appears on. */
import { object, records, type RecordRow } from './published-records'
import { readToolAsset, type ToolEnv } from './types'

const SHARD = /^\/transcripts\/terms\/\d{2}\.json$/
const FILE = /^\/transcripts\/[a-z0-9-]+\/transcript-[a-z0-9-]+\.json$/
const EXCERPT = 280

export type TextIndex = { docs: RecordRow[], stop: Set<string>, common: Set<string>, shards: number, commissions: RecordRow }
export type PageHit = { pdf_page: number, transcript_page: string | null, url: string, excerpt: string | null, speaker?: string, speaker_label?: string }
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

/** A verbatim excerpt around the first query word, kept within one speaker's turn. The turn's label is returned
 * as the speaker rather than left in the text; a turn that began on an earlier page has no speaker here. */
export function excerpt(text: string, terms: string[]): { excerpt: string, speaker?: string, speaker_label?: string } {
  const flat = text.replace(/\s+/g, ' ').trim()
  let at = -1
  for (const t of terms) {
    const m = new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '')}`, 'i').exec(flat)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  const point = at < 0 ? 0 : at
  const labels = [...flat.matchAll(LABEL)].map(m => ({ at: m.index!, end: m.index! + m[0].length, label: m[1] }))
  const turn = labels.filter(l => l.end <= point).at(-1) ?? (at < 0 ? labels.find(l => l.at === 0) : undefined)
  let from = turn ? turn.end : 0
  while (flat[from] === ' ') from++
  const until = labels.find(l => l.at >= Math.max(from, point))?.at ?? flat.length
  let start = Math.max(from, point - 100)
  if (start > from) { const space = flat.indexOf(' ', start); if (space >= 0 && space < until) start = space + 1 }
  while (flat[start] === ' ') start++
  let end = Math.min(until, start + EXCERPT)
  if (end < until) end = Math.max(start + 40, flat.lastIndexOf(' ', end))
  const body = flat.slice(start, end).trim()
  return { excerpt: `${start > from ? '...' : ''}${body}${end < flat.length && end < until ? '...' : ''}`,
    ...(turn ? { speaker: speakerName(turn.label), speaker_label: turn.label } : {}) }
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
  })
  return { file, quote_policy: String(doc.quote_policy), attribution: String(doc.attribution), licence_url: String(doc.licence_url),
    ...(quote ? {} : { order_notice: String(doc.order_notice) }), hits }
}
