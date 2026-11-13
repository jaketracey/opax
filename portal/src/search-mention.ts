/**
 * Does any record the search found mention what the reader typed?
 *
 * The default search ranks by meaning, and a meaning ranker always returns its
 * ceiling: "zzqxv plorthub" came back as "the 188 strongest matches". When no
 * result carries any of the query's words (in its title, speaker or passage),
 * no register record matched by name, and the best match is not a strong
 * meaning match either, the page says so first ("No records mention ...") and
 * keeps the meaning-ranked records one tap away.
 *
 * The check leans towards "mentions": a wrong "No records mention" hides real
 * matches, while a missed one only leaves the old page. So the query and the
 * passage are read the same way (curly quotes folded, punctuation a space,
 * Labour as Labor), words are compared by stem ("taxes" finds "tax", "studies"
 * finds "study"), and both are also compared with the spaces taken out
 * ("robodebt" finds "Robo-debt", "NDIS" finds "N.D.I.S."). Every step is a
 * linear scan: no backtracking pattern.
 */

/** A meaning score (calibrated 0..1, src/index.ts calibrate) at or above this
 *  is a strong match by itself, and keeps the results first. Set high so the
 *  check falls back to the lexical test alone for ordinary scores; tune it
 *  against the research eval set (src/research-eval.ts) before lowering it. */
export const MEANING_FLOOR = 0.85

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'with', 'from', 'that', 'this',
  'what', 'who', 'why', 'how', 'when', 'where', 'which', 'did', 'does', 'about', 'said', 'say', 'into', 'over', 'its',
  'their', 'they', 'them', 'his', 'her', 'not', 'any', 'all', 'can', 'will', 'would', 'should', 'there', 'than'])

/** Plurals a suffix rule cannot reach. */
const IRREGULAR: Record<string, string> = { women: 'woman', men: 'man', mice: 'mouse', children: 'child', people: 'person', geese: 'goose', feet: 'foot', teeth: 'tooth' }

/** One reading for query and passage: compatibility forms (ﬁ), accents, case,
 *  curly quotes and apostrophes folded; "Labour" read as "Labor"; every run of
 *  anything but a letter or digit (a hyphen, a full stop, a newline) one space. */
export function normaliseText(text: unknown): string {
  return String(text ?? '').normalize('NFKC').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[‘’ʼ`']/g, '')
    .replaceAll('labour', 'labor')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** A word's stem, the same on both sides: "studies" and "study", "crises" and
 *  "crisis", "taxes" and "tax", "houses" and "house" meet. */
export function stem(word: string): string {
  let w = IRREGULAR[word] ?? word
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('is')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es') && /(?:s|x|z|ch|sh)$/.test(w.slice(0, -2))) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}

export interface MentionTerm { words: string[]; compact: string; phrase: boolean }

/** The terms a record would have to hold: each quoted phrase whole, else each
 *  word of three letters or more (and the letters of a dotted short form, N.D.I.S.). */
export function mentionTerms(query: string): MentionTerm[] {
  const folded = String(query ?? '').replace(/[“”„«»]/g, '"')
  const phrases = [...folded.matchAll(/"([^"]{2,})"/g)].map((m) => normaliseText(m[1])).filter(Boolean)
  if (phrases.length) return phrases.map((p) => { const words = p.split(' '); return { words: words.map(stem), compact: words.join(''), phrase: true } })
  const words = normaliseText(folded).split(' ').filter(Boolean)
  const terms: MentionTerm[] = [...new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)))]
    .map((w) => ({ words: [stem(w)], compact: w, phrase: false }))
  if (words.length > 1 && words.every((w) => w.length === 1)) terms.push({ words: [words.join('')], compact: words.join(''), phrase: false })
  return terms
}

interface MentionRow { title?: unknown; speaker?: unknown; snippet?: unknown; score?: unknown }

/** A word matches a passage word with the same stem, or one that starts with
 *  most of it ("affordable" and "affordability"). */
const prefixOf = (s: string): string => (s.length > 5 ? s.slice(0, Math.max(5, Math.ceil(s.length * 0.6))) : s)

/** True when a record's title, speaker or passage holds any of the terms. */
export function mentions(row: MentionRow, terms: MentionTerm[]): boolean {
  const words = normaliseText(`${row.title ?? ''} ${row.speaker ?? ''} ${row.snippet ?? ''}`).split(' ').filter(Boolean)
  const stems = words.map(stem)
  const stemLine = ` ${stems.join(' ')} `
  const compact = words.join('')
  return terms.some((term) => {
    if (term.compact.length >= 3 && compact.includes(term.compact)) return true
    if (term.phrase) return stemLine.includes(` ${term.words.join(' ')} `)
    const [w] = term.words
    const start = prefixOf(w)
    return stems.some((s) => s === w || s.startsWith(start))
  })
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
