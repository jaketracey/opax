// The fixed last line of an Ask answer that cites a hearing transcript. One rule for the Worker (every
// /api/ask response, cached ones included) and for the page (a saved conversation written before the rule).
//
// A hearing transcript is a cited source row whose snippet or title carries TRANSCRIPT_LABEL. Only the
// royal_commissions and integrity_reports tools write that label, on hearing transcripts of royal commissions,
// commissions of inquiry and integrity commissions. Hansard speeches and committee Hansard never carry it.
export const TRANSCRIPT_LABEL = 'Hearing transcript: evidence, not findings'
export const TRANSCRIPT_NOTE = 'These are from hearing transcripts: evidence, not findings.'

const FIXED_END = /(?:^|\s)(?:These are from hearing transcripts|Source \d+ is a hearing transcript|Sources \d+(?:, \d+)* and \d+ are hearing transcripts): evidence, not findings\.$/
// A saved conversation keeps 240 characters of each source field, which can cut the label off the end. There the
// tools' own page pointer, which only a transcript excerpt has, stands in for it.
const CUT_EXCERPT = /\btranscript page \S+[\s\S]*…$/

const text = value => typeof value === 'string' ? value : ''
function isTranscript(source, saved) {
  return [text(source.snippet), text(source.title)].some(value => value.includes(TRANSCRIPT_LABEL) || saved && CUT_EXCERPT.test(value))
}

/** The line for these source rows, or null when no cited row is a hearing transcript. Numbers are a row's place
 * among the cited rows, which is the number the web page and the app print beside it. */
export function transcriptNote(sources, saved = false) {
  const cited = (Array.isArray(sources) ? sources : []).filter(s => s && typeof s === 'object' && s.cited === true)
  const rows = cited.map((s, i) => ({ s, n: i + 1 })).filter(r => !r.s.coverage)
  const numbers = rows.filter(r => isTranscript(r.s, saved)).map(r => r.n)
  if (!numbers.length) return null
  if (numbers.length === rows.length) return TRANSCRIPT_NOTE
  if (numbers.length === 1) return `Source ${numbers[0]} is a hearing transcript: evidence, not findings.`
  return `Sources ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)} are hearing transcripts: evidence, not findings.`
}

/** The spoken form: a listener has no source numbers to go by. */
export function spokenTranscriptNote(answer) {
  return transcriptNoteEnd(answer) === null ? null : text(answer).trimEnd().endsWith(TRANSCRIPT_NOTE) ? TRANSCRIPT_NOTE : 'Some of these sources are hearing transcripts: evidence, not findings.'
}

/** Where the line starts in an answer that ends with it, else null. */
export function transcriptNoteEnd(answer) {
  const end = FIXED_END.exec(text(answer).trimEnd())
  return end ? end.index + end[0].length - end[0].trimStart().length : null
}

/** The payload with its answer ending in the line, once. Fixed text after the prose: the prose is never read for
 * meaning or changed, and citation ranges (offsets into the answer) stay where they are. */
export function withTranscriptNote(payload, saved = false) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const answer = text(payload.answer).trimEnd()
  // A refusal or a request to clarify draws on nothing. A limited answer still says what a transcript holds.
  if (!answer || payload.answered === false || payload.answer_decision === 'refusal' || payload.answer_decision === 'clarification') return payload
  const note = transcriptNote(payload.sources, saved)
  // Already ended by the line, in either form (the transcript writer adds its own under the turns it quotes), or
  // carrying the writer's line with something after it: said once, and left where it is.
  if (!note || FIXED_END.test(answer) || note === TRANSCRIPT_NOTE && answer.includes(TRANSCRIPT_NOTE)) return payload
  return { ...payload, answer: `${answer}\n\n${note}` }
}
