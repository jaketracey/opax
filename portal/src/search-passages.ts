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

// speaker-label:begin
// One definition of a transcript's speaker label, held as a copy in
// src/search-passages.ts and public/app.js; test/search-quality.test.mjs keeps
// the two copies identical. A label is a title, at most a name and any number
// of parentheticals, then a colon: "Senator ADA QUILL:", "The PRESIDENT:",
// "Mr ALBANESE (Grayndler—Prime Minister) (14:02):", "Dr de Brouwer:".
const LABEL_TITLES = ['the hon\\.?', 'hon\\.?', 'mr', 'mrs', 'ms', 'miss', 'dr', 'prof\\.?', 'professor', 'senator', 'madam', 'rev\\.?',
  '(?:deputy |assistant |acting )?commissioner', '(?:lieutenant |major )?general', 'brigadier', '(?:vice |rear )?admiral', 'air (?:chief |vice )?marshal',
  '(?:the )?(?:acting |deputy )?(?:chair|president|speaker)']
  .map(title => title.replace(/[a-z]/g, letter => '[' + letter + letter.toUpperCase() + ']').replace(/ /g, '\\s+')).join('|')
const LABEL_NAME = "(?:\\s+(?:[A-Z][A-Za-z'’.\\-]*|de|van|von|la|le|di|da|du|der|den|del))"
const LABEL_CORE = '(?:' + LABEL_TITLES + ')' + LABEL_NAME + '{0,5}\\s*(?:\\([^)]{0,80}\\)\\s*)*'
/** The whole text is a label. */
const SPEAKER_LABEL = new RegExp('^' + LABEL_CORE + ':$')
/** A label opens the text; what follows is what the speaker said. */
const SPEAKER_LABEL_LEAD = new RegExp('^' + LABEL_CORE + ':\\s*')
/** The "[committee, date, portfolio, agency]" block a committee transcript puts above a turn. */
const HEARING_HEADER = /^\[[^\]]{0,400}\]\s*/
// speaker-label:end
export { SPEAKER_LABEL, SPEAKER_LABEL_LEAD, HEARING_HEADER }

/**
 * A paragraph with none of the record's words in it: only the label that names
 * who is about to speak, with or without the hearing header above it, or the
 * header alone. "[Finance … Commission] Senator ADA QUILL:" is one; a sentence
 * that happens to end in a colon ("I have three questions for the
 * department:") is the record's own words.
 */
export function isSpeakerLabel(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  let bare = t
  while (HEARING_HEADER.test(bare)) bare = bare.replace(HEARING_HEADER, '')
  return bare ? SPEAKER_LABEL.test(bare) : t.length > 0
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
