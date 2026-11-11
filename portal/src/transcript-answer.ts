/** Hearing transcript listings in Ask answers.
 * A listing row (commission, hearing day, pages) is a record of what was published, not a figure the writer
 * should restate: a paraphrase ("the 27 February transcript runs 64 pages") no longer carries the row's own
 * wording, so the claim audit cannot tie its numbers to the record and strips the answer. When every fact is
 * a listing row, the transcript tool's own lines are the answer. Excerpts from transcript text still go to
 * the writer, which quotes or paraphrases them. */
export const TRANSCRIPT_LABEL = 'Hearing transcript: evidence, not findings'

const EXCERPT = /\btranscript page \S+ \(PDF page \d+\)/

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
