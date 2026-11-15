// Which passage a search result shows, and which results are one hearing.
// Pure functions, so the choices are tested without a retrieval call.

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean)

/**
 * The words a result's passages are scored on: quoted phrases, else the query's
 * words of three letters or more. A search for a speaker's records sends the
 * speaker's name as its query; those words say who spoke, not what about, and
 * the only paragraph holding them is the transcript's speaker label
 * ("Senator DAVID POCOCK:"). So a query that is just the speaker filter scores
 * on no words, and the best-ranked paragraph is shown.
 */
export function passageTerms(q: string, speaker?: string | null): string[] {
  if (speaker && words(q.replace(/"/g, ' ')).join(' ') === words(speaker).join(' ')) return []
  const phrases = [...q.matchAll(/"([^"]{2,})"/g)].map((m) => m[1].toLowerCase().trim())
  return phrases.length ? phrases : words(q).filter((w) => w.length >= 3)
}

/**
 * A paragraph that only names who is about to speak: an honorific, at most a
 * name and a parenthetical, then a colon and nothing else. "Senator ADA
 * QUILL:", "CHAIR:", "Ms Barrett (Fremantle):". A sentence that happens to end
 * in a colon ("I have three questions for the department:") is the record's
 * own words. The page's cleanPassage (public/app.js) uses the same definition.
 */
export function isSpeakerLabel(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  const label = /^(?:(?:the\s+)?hon\.?|mr|mrs|ms|miss|dr|prof\.?|professor|senator|madam|rev\.?|(?:the\s+)?(?:acting\s+|deputy\s+)?chair)(?=[\s:(])(.*)$/i.exec(t)
  return !!label && /^(?:\s+[A-Z][A-Za-z'’.\-]*){0,5}\s*(?:\([^)]{0,80}\)\s*)?:$/.test(label[1])
}

export type ScoredPassage = { text: string; score: number }

/**
 * The passage to show for one record: the one with the most query words, the
 * better calibrated score between equals. A speaker label is never the
 * passage. Retrieval returns only the paragraphs it matched, not the record's
 * text, so a record whose every matched paragraph is a label has no passage
 * here: the text is empty and the score is the label's, which keeps the
 * record's place in the ranking. Readers open the record for its words.
 */
export function pickPassage(passages: ScoredPassage[], terms: string[]): { text: string; score: number; at: number } {
  let best = { text: '', score: 0, at: -1 }
  let bestHits = -1
  let labelScore = 0
  for (const passage of passages) {
    if (!passage.text) continue
    if (isSpeakerLabel(passage.text)) { labelScore = Math.max(labelScore, passage.score); continue }
    const lower = passage.text.toLowerCase()
    let hits = 0
    let at = -1
    for (const term of terms) {
      const i = lower.indexOf(term)
      if (i >= 0) { hits++; if (at < 0 || i < at) at = i }
    }
    if (hits > bestHits || (hits === bestHits && passage.score >= best.score)) {
      bestHits = hits
      best = { text: passage.text, score: passage.score, at }
    }
  }
  return bestHits < 0 ? { text: '', score: labelScore, at: -1 } : best
}

const COMMITTEE_CHAMBERS = new Set(['senate_committee', 'house_committee', 'joint_committee'])

type HearingRow = { kind?: string | null; chamber?: string | null; title?: string | null; date?: string | null; hearing_passages?: number }

/**
 * A committee hearing is stored as one record per turn, so one member's hour
 * of questions is dozens of results with the same title and date. Keep the
 * first of each (the list arrives best first) and count the rest on it, so
 * totals, years and paging are those of the cards shown. Rows are counted in
 * place: callers hold them by identity.
 */
export function collapseHearings<T extends HearingRow>(rows: T[]): T[] {
  const kept = new Map<string, T>()
  return rows.filter((row) => {
    if (row.kind !== 'speech' || !COMMITTEE_CHAMBERS.has(row.chamber || '') || !row.title || !row.date) return true
    const key = `${row.chamber}\n${row.date}\n${row.title}`
    const first = kept.get(key)
    if (!first) { kept.set(key, row); return true }
    first.hearing_passages = (first.hearing_passages || 1) + 1
    return false
  })
}
