/** Hearing transcript listings in Ask answers.
 * A listing row (commission, hearing day, pages) is a record of what was published, not a figure the writer
 * should restate: a paraphrase ("the 27 February transcript runs 64 pages") no longer carries the row's own
 * wording, so the claim audit cannot tie its numbers to the record and strips the answer. When every fact is
 * a listing row, the transcript tool's own lines are the answer. Excerpts from transcript text still go to
 * the writer, which quotes or paraphrases them. */
import {sentenceSpans} from './sentence-bounds.mjs'
import {TRANSCRIPT_LABEL, TRANSCRIPT_NOTE, withTranscriptNote, transcriptNote, spokenTranscriptNote, transcriptNoteEnd} from '../public/transcript-note.js'
export {TRANSCRIPT_LABEL, TRANSCRIPT_NOTE, withTranscriptNote, transcriptNote, spokenTranscriptNote, transcriptNoteEnd}
/** Evidence before an inquiry is a different record from parliamentary discussion about its topic. */
export function hearingEvidenceQuestion(question: string): boolean {
  // Reader text is bounded before tokenisation. Inspect a fixed word window rather than backtracking
  // through variable-length commission names and whitespace.
  const words = question.slice(0, 2000).toLowerCase().match(/[\p{L}'’-]+/gu) ?? []
  if (!words.some(w => /^(?:said|say|tell|told|evidence|witness(?:es)?|counsel|testif\w*)$/.test(w))) return false
  return words.some((word, i) => {
    if (word !== 'inquiry' && !(word === 'royal' && words[i + 1] === 'commission')) return false
    const before = words.slice(Math.max(0, i - 10), i)
    if (before.some(w => w === 'at' || w === 'before')) return true
    return before.some((w, n) =>
      (w === 'tell' || w === 'told') && !before.slice(n + 1).some(v => v === 'about' || v === 'on') ||
      (w === 'witnesses' || w === 'counsel') && ['to', 'of', 'in'].includes(before[n + 1]))
  })
}


/** People named in hearing evidence, for both models that write Ask prose (the research model and the writer). Fixed
 * text, worded as what to do (test/ask-positive-prompts.test.mjs holds every prompt to that). Prompt text only:
 * nothing reads, blocks or edits the prose. */
export const TRANSCRIPT_NAMED_PEOPLE_RULE = 'For hearing transcripts, name a person from the evidence only inside a verbatim quotation. In your own words, refer to them by a neutral description ("an officer", "a staff member"), or by a role only where the transcript states that role on the cited page: a role is stated there, not inferred. This covers everyone named in the evidence, commissioners and counsel included.'
/** The exception the standing "name the people" sentences carry, so they do not pull against the rule. */
export const NAMED_PEOPLE_EXCEPTION = 'except people named in hearing transcript evidence'
const EXCERPT = /\btranscript page \S+/
/** A turn carries a speaker only when its source line names one; the transcript tools name none. */
export interface TranscriptTurn { speaker?: string; day?: string; date?: string; page: string; excerpt: string }
/** Split a published citation into attributed turns before writing. Restricted transcripts never supply
 * quotations, even if malformed input happens to contain quotation marks. */
export function transcriptTurns(text: string): TranscriptTurn[] {
  if (!text.includes(TRANSCRIPT_LABEL) || /Not quoted:|non-publication order|suppression order|pseudonymous witness/i.test(text)) return []
  const day = /\b(?:Hearing )?Day (\d+)\b/i.exec(text)?.[1]
  const date = /\((\d{1,2} [A-Z][a-z]+ \d{4})\)/.exec(text)?.[1]
  const turns = [...text.matchAll(/transcript page (\S+) \(PDF page \d+\), hearing turn(?: by ([^:]+))?: "([\s\S]*?)"(?= transcript page | Hearing transcript:|$)/g)]
    .map(m => ({ ...(m[2] ? { speaker: m[2] } : {}), page: m[1], excerpt: m[3], ...(day ? { day } : {}), ...(date ? { date } : {}) }))
  if (turns.length) return turns
  const written = /^(.+?) said at .+?, transcript page (\S+): "([\s\S]+)"\. Hearing transcript:/.exec(text)
  if (written) return [{ speaker: written[1], page: written[2], excerpt: written[3], ...(day ? { day } : {}), ...(date ? { date } : {}) }]
  const unnamed = /^The transcript of .+?, transcript page (\S+), records: "([\s\S]+)"\. Hearing transcript:/.exec(text)
  return unnamed ? [{ page: unnamed[1], excerpt: unnamed[2], ...(day ? { day } : {}), ...(date ? { date } : {}) }] : []
}

/** Keep at most 32 source words, without adding an ellipsis inside a quotation. */
export function shortTranscriptQuote(excerpt: string, question = ''): string {
  // Prefer a complete topical sentence over an initial short response.
  const scaffolding = new Set(['what','which','said','witness','witnesses','royal','commission','transcript','hearing','about','evidence','findings'])
  const terms = new Set((question.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(w => !scaffolding.has(w)))
  const sentences = sentenceSpans(excerpt).map(s => s.text)
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

/** Every /api/ask reply ends with the fixed transcript line when it cites a hearing transcript
 * (public/transcript-note.js): the research loop and the older engine, blocking and streamed, and an answer cached
 * before the rule, which gains the line as it is served. Anything that cannot be read goes out as it came. */
export async function transcriptNoteResponse(response: Response): Promise<Response> {
  if (!response.ok || !response.body) return response
  const type = response.headers.get('content-type') ?? ''
  const headers = () => { const h = new Headers(response.headers); h.delete('content-length'); h.delete('etag'); return h }
  if (type.includes('application/json')) {
    try {
      const body = await response.clone().text(), payload: unknown = JSON.parse(body), noted = withTranscriptNote(payload)
      return noted === payload ? response : new Response(JSON.stringify(noted), { status: response.status, headers: headers() })
    } catch { return response }
  }
  if (!type.includes('text/event-stream')) return response
  // Frames pass through as they complete; only `done`, which carries the whole payload, is rewritten.
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let held = ''
  const frame = (value: string) => /^event: done\r?$/m.test(value) ? value.replace(/^data: (.+?)(\r?)$/m, (line, data: string, cr: string) => {
    try { const payload: unknown = JSON.parse(data), noted = withTranscriptNote(payload); return noted === payload ? line : 'data: ' + JSON.stringify(noted) + cr }
    catch { return line }
  }) : value
  const pass = (flush: boolean) => {
    let out = ''
    for (let m; (m = /\r?\n\r?\n/.exec(held));) { out += frame(held.slice(0, m.index)) + m[0]; held = held.slice(m.index + m[0].length) }
    if (flush) { out += frame(held); held = '' }
    return out
  }
  const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { held += decoder.decode(chunk, { stream: true }); const out = pass(false); if (out) controller.enqueue(encoder.encode(out)) },
    flush(controller) { held += decoder.decode(); const out = pass(true); if (out) controller.enqueue(encoder.encode(out)) },
  }))
  return new Response(stream, { status: response.status, headers: response.headers })
}
