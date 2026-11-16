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

// What may come before a fixed line that stands as its own sentence: nothing, or the end of another sentence.
const OWN_SENTENCE = /(?:^|[.!?”"’)])\s*$/
const text = value => typeof value === 'string' ? value : ''
function isTranscript(source, saved) {
  return [text(source.snippet), text(source.title)].some(value => value.includes(TRANSCRIPT_LABEL) || saved && CUT_EXCERPT.test(value))
}
// The coverage row the research loop flags, and the one the older engine and the source linker know by resource.
// A record row the linker hangs off a coverage row (coverage-<name>-record-N) is a source like any other.
const isCoverage = source => source.coverage === true || source.resource === 'coverage' || /^coverage-/.test(text(source.resource)) && !/-record-\d+$/.test(text(source.resource))
// "OPAX lists 47 hearing transcripts ..." carries the label but is a count of transcripts, not one of them.
const isCount = source => source.kind === 'count'

/** The line for these source rows, or null when no cited row is a hearing transcript. Numbers are a row's place
 * among the cited rows, which is the number the web page and the app print beside it. A coverage row and a count
 * of transcripts keep their numbers and are counted neither as transcripts nor against them. */
export function transcriptNote(sources, saved = false) {
  const cited = (Array.isArray(sources) ? sources : []).filter(s => s && typeof s === 'object' && s.cited === true)
  const rows = cited.map((s, i) => ({ s, n: i + 1, transcript: isTranscript(s, saved) })).filter(r => !isCoverage(r.s) && !(isCount(r.s) && r.transcript))
  const numbers = rows.filter(r => r.transcript).map(r => r.n)
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

const points = value => Array.from(value).length
/** Citation ranges (code points) after the fixed line from `at` is swapped for one of another length: a range that
 * reached into the old line now ends with the new one. Ranges over the prose are not touched. */
function movedCitations(citations, at, end) {
  if (!citations || typeof citations !== 'object' || Array.isArray(citations)) return citations
  return Object.fromEntries(Object.entries(citations).map(([key, ranges]) => [key, Array.isArray(ranges)
    ? ranges.map(r => Array.isArray(r) && r.length === 2 && r[1] > at ? [Math.min(r[0], at), end] : r) : ranges]))
}

/** The payload with its answer ending in the line, once. Fixed text after the prose: the prose is never read for
 * meaning or changed, and citation ranges over it (offsets into the answer) stay where they are. */
export function withTranscriptNote(payload, saved = false) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const answer = text(payload.answer).trimEnd()
  // A refusal or a request to clarify draws on nothing. A limited answer still says what a transcript holds.
  if (!answer || payload.answered === false || payload.answer_decision === 'refusal' || payload.answer_decision === 'clarification') return payload
  const note = transcriptNote(payload.sources, saved)
  if (!note) return payload
  const at = transcriptNoteEnd(answer)
  // The answer must end with the line: one earlier in the text does not count.
  if (at === null) return { ...payload, answer: `${answer}\n\n${note}` }
  // Already ended by the right line, or a saved turn whose clipped rows cannot be trusted over the line it kept.
  if (saved || answer.slice(at) === note) return payload
  // The fixed words closing a sentence of the answer's own ("In short, Sources 1 and 2 are ...") are prose, and
  // prose is never changed: the right line goes on after it.
  if (!OWN_SENTENCE.test(answer.slice(0, at))) return { ...payload, answer: `${answer}\n\n${note}` }
  // Ended by the fixed line in another form (an answer cached when the transcript writer still added the
  // all-transcripts sentence itself): that line alone is swapped.
  const next = answer.slice(0, at) + note
  return { ...payload, answer: next, ...('citations' in payload ? { citations: movedCitations(payload.citations, points(answer.slice(0, at)), points(next)) } : {}) }
}
