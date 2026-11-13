/**
 * Does any record the search found mention what the reader typed?
 *
 * The default search ranks by meaning, and a meaning ranker always returns its
 * ceiling: "zzqxv plorthub" came back as "the 188 strongest matches". When no
 * result carries any of the query's words (in its title, speaker or passage),
 * no register record matched by name, and the best match is not a strong
 * meaning match either, the page says so first ("No records mention ...") and
 * keeps the meaning-ranked records one tap away. A real paraphrase still shows:
 * the check only reorders what the reader sees first, and only when nothing
 * on the page contains a word of the query.
 */

/** A meaning score (calibrated 0..1, src/index.ts calibrate) at or above this
 *  is a strong match by itself, and keeps the results first. Set high so the
 *  check falls back to the lexical test alone for ordinary scores; tune it
 *  against the research eval set (src/research-eval.ts) before lowering it. */
export const MEANING_FLOOR = 0.85

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'with', 'from', 'that', 'this',
  'what', 'who', 'why', 'how', 'when', 'where', 'which', 'did', 'does', 'about', 'said', 'say', 'into', 'over', 'its',
  'their', 'they', 'them', 'his', 'her', 'not', 'any', 'all', 'can', 'will', 'would', 'should', 'there', 'than'])

const fold = (text: unknown): string => String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The words a record would have to contain: quoted phrases whole, else each
 *  word of three letters or more, cut to a stem so "affordable" finds "affordability". */
export function mentionTerms(query: string): string[] {
  const q = fold(query)
  const phrases = [...q.matchAll(/"([^"]{2,})"/g)].map((m) => m[1].trim()).filter(Boolean)
  if (phrases.length) return phrases
  return [...new Set(q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 5 ? w.slice(0, Math.max(5, Math.ceil(w.length * 0.6))) : w)))]
}

interface MentionRow { title?: unknown; speaker?: unknown; snippet?: unknown; score?: unknown }

/** True when a record's title, speaker or passage holds any of the terms. */
export function mentions(row: MentionRow, terms: string[]): boolean {
  const text = fold(`${row.title ?? ''} ${row.speaker ?? ''} ${row.snippet ?? ''}`)
  return terms.some((term) => text.includes(term))
}

/**
 * The unified search's check: true only for a query with words, in a mode that
 * ranks by meaning, where the register search found nothing by name, documents
 * did come back, none of them mentions a query word, and the best meaning score
 * is under the floor.
 */
export function noRecordMentions({ query, mode, catalogTotal, documents }: {
  query: string | null; mode: string | null; catalogTotal: number; documents: MentionRow[]
}): boolean {
  const q = String(query ?? '').trim()
  if (!q || q === '*' || mode === 'keyword' || catalogTotal > 0 || !documents.length) return false
  const terms = mentionTerms(q)
  if (!terms.length) return false
  const best = Math.max(0, ...documents.map((row) => Number(row.score) || 0))
  if (best >= MEANING_FLOOR) return false
  return !documents.some((row) => mentions(row, terms))
}
