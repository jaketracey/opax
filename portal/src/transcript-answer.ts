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
