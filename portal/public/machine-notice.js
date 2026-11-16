// The fixed notice under every machine-written answer: one small line between the answer and its sources.
// Code adds it, never a model. The Worker puts it on the response as `machine_notice` (src/machine-notice.ts)
// and the page prints that field; a conversation saved before the field existed gets the same words here.
export const MACHINE_NOTICE = 'Machine-written answers can contain errors. Check the original record before relying on one.'
// For stored machine-written text (a record's brief, a bill's summary, the year in brief, a report's generated
// summary): text a model wrote earlier, which is a summary and not an answer to anyone's question.
export const MACHINE_NOTICE_STORED = 'Machine-written summaries can contain errors. Check the original record before relying on one.'
// The two words that go with a stored summary where there is no room for the line and no label can be drawn: a
// share image, the text of a social post.
export const MACHINE_SUMMARY_WORDS = 'Machine-written summary.'
// For an answer that cites a hearing transcript (public/transcript-note.js decides which answers do).
export const MACHINE_NOTICE_TRANSCRIPT = 'Machine-written answers can contain errors. Check the original transcript before relying on it.'

// Answers a language model did not write: a calculation from the records, a list of passages, a note that the
// records do not cover the question, or a prompt to narrow it. The same list the page's label goes by (app.js).
const NOT_MODEL_WRITTEN = new Set(['calculated', 'evidence_only', 'evidence_gap', 'needs_scope', 'needs_period', 'needs_question'])

/** True when a language model wrote text this payload shows a reader. The Worker says so (machine_written). An
 * answer cached or saved before it did goes by its status: a written overview paragraph counts even above a
 * calculated answer, and so does a suggested question, which the rewrite model wrote. */
export function modelWritten(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.answered === false) return false
  const shown = !!payload.money_overview || (typeof payload.answer === 'string' && !!payload.answer.trim())
  if (typeof payload.machine_written === 'boolean') return payload.machine_written && shown
  return !!payload.money_overview || (shown && (!!payload.suggested_question || !NOT_MODEL_WRITTEN.has(payload.answer_status)))
}

/** The notice for this payload, or null when no model wrote any of it. */
export function machineNotice(payload, citesTranscript = false) {
  if (!modelWritten(payload)) return null
  return citesTranscript ? MACHINE_NOTICE_TRANSCRIPT : MACHINE_NOTICE
}
