/** Hearing transcript listings in Ask answers.
 * A listing row (commission, hearing day, pages) is a record of what was published, not a figure the writer
 * should restate: a paraphrase ("the 27 February transcript runs 64 pages") no longer carries the row's own
 * wording, so the claim audit cannot tie its numbers to the record and strips the answer. When every fact is
 * a listing row, the transcript tool's own lines are the answer. Excerpts from transcript text still go to
 * the writer, which quotes or paraphrases them. */
export const TRANSCRIPT_LABEL = 'Hearing transcript: evidence, not findings'
/** Evidence before an inquiry is a different record from parliamentary discussion about its topic. */
export const hearingEvidenceQuestion = (question: string) => /\b(?:said|say|evidence|witness(?:es)?|counsel|testif\w*)\b/i.test(question) && (/\b(?:at|before)\s+(?:the\s+)?(?:[\p{L}'’-]+\s+){0,8}(?:royal commission|inquiry)\b/iu.test(question) || /\b(?:witnesses|counsel)\s+(?:to|of|in)\s+(?:the\s+)?(?:[\p{L}'’-]+\s+){0,8}(?:royal commission|inquiry)\b/iu.test(question))

const EXCERPT = /\btranscript page \S+/
export interface TranscriptTurn { speaker: string; day?: string; date?: string; page: string; excerpt: string }
/** Split a published citation into attributed turns before writing. Restricted transcripts never supply
 * quotations, even if malformed input happens to contain quotation marks. */
export function transcriptTurns(text: string): TranscriptTurn[] {
  if (!text.includes(TRANSCRIPT_LABEL) || /Not quoted:|non-publication order|suppression order|pseudonymous witness/i.test(text)) return []
  const day = /\b(?:Hearing )?Day (\d+)\b/i.exec(text)?.[1]
  const date = /\((\d{1,2} [A-Z][a-z]+ \d{4})\)/.exec(text)?.[1]
  const turns = [...text.matchAll(/transcript page (\S+) \(PDF page \d+\), hearing turn by ([^:]+): "([\s\S]*?)"(?= transcript page | Hearing transcript:|$)/g)]
    .map(m => ({ speaker: m[2], page: m[1], excerpt: m[3], ...(day ? { day } : {}), ...(date ? { date } : {}) }))
  if (turns.length) return turns
  const written = /^(.+?) said at .+?, transcript page (\S+): "([\s\S]+)"\. Hearing transcript:/.exec(text)
  return written ? [{ speaker: written[1], page: written[2], excerpt: written[3], ...(day ? { day } : {}), ...(date ? { date } : {}) }] : []
}

/** Keep at most 32 source words, without adding an ellipsis inside a quotation. */
export function shortTranscriptQuote(excerpt: string, question = ''): string {
  // Prefer a complete topical sentence over an initial short response.
  const scaffolding = new Set(['what','which','said','witness','witnesses','royal','commission','transcript','hearing','about','evidence','findings'])
  const terms = new Set((question.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(w => !scaffolding.has(w)))
  const sentences = excerpt.split(/(?<=[.!?])\s+/)
  const score = (s: string) => [...terms].filter(t => s.toLowerCase().includes(t)).length
  const topical = [...sentences].sort((a,b) => score(b) - score(a))[0] ?? excerpt
  const words = [...topical.matchAll(/\S+/g)]
  const focus = words.findIndex(w => [...terms].some(t => w[0].toLowerCase().includes(t)))
  const start = focus >= 0 && words.length > 32 ? Math.max(0, focus - 5) : 0
  return topical.slice(words[start]?.index ?? 0, words[start + 31] ? words[start + 31].index! + words[start + 31][0].length : topical.length).replace(/^\.\.\.\s*|\s*\.\.\.$/g, '').trim()
}

export function transcriptListingOnly(facts: { text: string, coverage?: boolean }[]): boolean {
  const rows = facts.filter(f => !f.coverage)
  return rows.length > 0 && rows.every(f => f.text.includes(TRANSCRIPT_LABEL) && !EXCERPT.test(f.text))
}

/** The line an answer gets when every source it cites is a hearing transcript, so a paraphrase of what a witness
 * or counsel said is never read as a commission's finding. Listing answers already carry the label in their
 * count line and are left alone. */
export const TRANSCRIPT_NOTE = 'These are from hearing transcripts: evidence, not findings.'

type NoteSource = { snippet?: unknown, title?: unknown, cited?: unknown, coverage?: unknown }

export function withTranscriptNote<T extends Record<string, unknown>>(payload: T): T {
  const answer = typeof payload.answer === 'string' ? payload.answer : ''
  if (!answer.trim() || payload.answered === false || (payload.answer_decision != null && payload.answer_decision !== 'answer')) return payload
  if (/\bevidence,? not findings\b/i.test(answer)) return payload
  const cited = (Array.isArray(payload.sources) ? payload.sources as NoteSource[] : []).filter(s => s.cited === true && !s.coverage)
  if (!cited.length || !cited.every(s => `${s.snippet ?? ''} ${s.title ?? ''}`.includes(TRANSCRIPT_LABEL))) return payload
  return { ...payload, answer: `${answer.trimEnd()}\n\n${TRANSCRIPT_NOTE}` }
}
