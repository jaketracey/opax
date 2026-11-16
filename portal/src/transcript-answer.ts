/** Hearing transcript listings in Ask answers.
 * A listing row (commission, hearing day, pages) is a record of what was published, not a figure the writer
 * should restate: a paraphrase ("the 27 February transcript runs 64 pages") no longer carries the row's own
 * wording, so the claim audit cannot tie its numbers to the record and strips the answer. When every fact is
 * a listing row, the transcript tool's own lines are the answer. Excerpts from transcript text go to the
 * writer only where their source allows it (writerMayWord), as typed facts under TRANSCRIPT_ATTRIBUTION_RULE. */
import {sentenceSpans} from './sentence-bounds.mjs'
export const TRANSCRIPT_LABEL = 'Hearing transcript: evidence, not findings'
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


const EXCERPT = /\btranscript page \S+/
/** What a speaker is at the hearing, as the transcript gives it (tools/transcript-text.ts speakerRoles). */
export const TRANSCRIPT_ROLES = ['commissioner', 'counsel assisting', 'witness', 'counsel for a party'] as const
export type TranscriptRole = typeof TRANSCRIPT_ROLES[number]
/** One passage of hearing evidence as typed facts: the speaker's role where the page itself settles it, the
 * commission (its name and its record id), the hearing date and the transcript page. No passage carries a person's
 * name: a wrong name is worse than none, so the speaker is a role or is not given. */
export interface TranscriptTurn { role?: TranscriptRole; commission?: string; source?: string; day?: string; date?: string; page: string; pdf_page?: number; excerpt: string }
const ROLE = `(?: \\((${TRANSCRIPT_ROLES.join('|')})\\))?`
// "by <name>" is the form before 16 November 2026; the name is read past and never kept.
const TOOL_TURN = new RegExp(`transcript page (\\S+) \\(PDF page (\\d+)\\), hearing turn(?: by [^:(]+?)?${ROLE}: "([\\s\\S]*?)"(?= transcript page | Hearing transcript:|$)`, 'g')
const ROLE_WORDS: Record<TranscriptRole, string> = { commissioner: 'the Commissioner', 'counsel assisting': 'counsel assisting', witness: 'a witness', 'counsel for a party': 'counsel for a party' }
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const SAID = new Map(TRANSCRIPT_ROLES.map(role => [`${upper(ROLE_WORDS[role])} said`, role]))
const WRITTEN_TURN = new RegExp(`^(The transcript records|${[...SAID.keys()].join('|')}|.+?${ROLE} said) at (.+?)(?: on hearing day \\d+)?(?: \\(\\d{1,2} [A-Z][a-z]+ \\d{4}\\))?, transcript page (\\S+): "([\\s\\S]+)"\\. Hearing transcript:`)
// The line form of the 16 November 2026 names-off release: "The transcript of <commission> ..., records: ...".
const RECORDS_TURN = /^The transcript of (.+?)(?: on hearing day \d+)?(?: \(\d{1,2} [A-Z][a-z]+ \d{4}\))?, transcript page (\S+), records: "([\s\S]+)"\. Hearing transcript:/
const SOURCE = /\bCommission record: ([a-z0-9]+(?:-[a-z0-9]+)*)\./
/** Split a published citation into attributed turns before writing. Restricted transcripts never supply
 * quotations, even if malformed input happens to contain quotation marks. */
export function transcriptTurns(text: string): TranscriptTurn[] {
  if (!text.includes(TRANSCRIPT_LABEL) || /Not quoted:|non-publication order|suppression order|pseudonymous witness/i.test(text)) return []
  // The hearing day and date are the listing's own, before the first page: never a "day 2" someone said in evidence.
  const head = text.split(/\btranscript page\b/)[0]
  const day = /\b(?:Hearing )?Day (\d+)\b/i.exec(head)?.[1]
  const date = /\((\d{1,2} [A-Z][a-z]+ \d{4})\)/.exec(head)?.[1]
  const source = SOURCE.exec(text.slice(text.lastIndexOf(TRANSCRIPT_LABEL)))?.[1]
  const shared = { ...(source ? { source } : {}), ...(day ? { day } : {}), ...(date ? { date } : {}) }
  const commission = text.split(',')[0].trim()
  const turns = [...text.matchAll(TOOL_TURN)]
    .map(m => ({ ...(m[3] ? { role: m[3] as TranscriptRole } : {}), ...(commission ? { commission } : {}), page: m[1], pdf_page: Number(m[2]), excerpt: m[4], ...shared }))
  if (turns.length) return turns
  const written = WRITTEN_TURN.exec(text)
  if (written) {
    const role = SAID.get(written[1]) ?? (written[2] as TranscriptRole | undefined)
    return [{ ...(role ? { role } : {}), commission: written[3], page: written[4], excerpt: written[5], ...shared }]
  }
  const records = RECORDS_TURN.exec(text)
  return records ? [{ commission: records[1], page: records[2], excerpt: records[3], ...shared }] : []
}
/** One turn as the single line the writer, the fallbacks and the final boundary all read back with transcriptTurns. */
export function transcriptFactLine(turn: TranscriptTurn): string {
  const who = turn.role ? `${upper(ROLE_WORDS[turn.role])} said` : 'The transcript records'
  return `${who} at ${turn.commission ?? 'the hearing'}${turn.day ? ` on hearing day ${turn.day}` : ''}${turn.date ? ` (${turn.date})` : ''}, transcript page ${turn.page}: "${turn.excerpt}". ${TRANSCRIPT_LABEL}.${turn.source ? ` Commission record: ${turn.source}.` : ''}`
}

/** How Ask may use one source's hearing transcript passages. "writer": the writer may word them, under
 * TRANSCRIPT_ATTRIBUTION_RULE. "quote_only": no model words them; they are shown only as code renders them, quoted
 * with role, date and page. A source is listed here by its record id when its terms and its text have been checked;
 * a source that is not listed, and a passage with no record id, is quote_only. */
export type TranscriptUse = 'writer' | 'quote_only'
const SOURCE_USE: Record<string, TranscriptUse> = { 'cth-antisemitism': 'writer', 'cth-robodebt': 'writer', 'nsw-healthcare-funding': 'writer' }
export const transcriptUse = (source: string | undefined): TranscriptUse => (source && Object.hasOwn(SOURCE_USE, source) ? SOURCE_USE[source] : 'quote_only')
/** The one decision on whether a model may word a transcript passage. Every place that hands a passage to the
 * writer, holds a sentence to the attributed mark or audits one asks here, by the passage's source. */
export const writerMayWord = (turn: TranscriptTurn): boolean => transcriptUse(turn.source) === 'writer'
/** Whether a record fact holds quotable transcript passages. A research point never words one, whatever its source's
 * policy: the passage is read from its record. */
export const transcriptPassage = (text: string): boolean => transcriptTurns(text).length > 0

/** The typed attribution a transcript fact carries: it is evidence, the speaker's role, when and on which page.
 * A passage the writer may word is planned as an attributed claim before a word is written; any other is quoted by
 * code only. A role the page does not settle is "not recorded": that passage is quoted with "the transcript
 * records". There is no speaker's name here, by design. */
export interface TranscriptAttribution { source: 'hearing_transcript'; status: 'evidence_not_finding'; claim: 'attributed' | 'quoted'; speaker_role: TranscriptRole | 'not recorded'; commission?: string; commission_id?: string; hearing_date?: string; hearing_day?: string; transcript_page: string }
export const transcriptAttribution = (t: TranscriptTurn): TranscriptAttribution => ({ source: 'hearing_transcript', status: 'evidence_not_finding', claim: writerMayWord(t) ? 'attributed' : 'quoted', speaker_role: t.role ?? 'not recorded',
  ...(t.commission ? { commission: t.commission } : {}), ...(t.source ? { commission_id: t.source } : {}), ...(t.date ? { hearing_date: t.date } : {}), ...(t.day ? { hearing_day: t.day } : {}), transcript_page: t.page })

/** Who a passage is attributed to: the role alone ("counsel assisting", "a witness"). Null when the page does not
 * settle the role. */
export function transcriptSpeaker(t: TranscriptTurn): string | null {
  return t.role ? ROLE_WORDS[t.role] : null
}
/** The citation a reader sees for one transcript passage, built from the typed facts and never from the answer's
 * wording: commission, hearing date, transcript page and the speaker's role. */
export function transcriptCitation(t: TranscriptTurn): string {
  const who = transcriptSpeaker(t)
  return `${t.commission ?? 'Hearing'}, hearing transcript${t.date ? `, ${t.date}` : t.day ? `, hearing day ${t.day}` : ''}, page ${t.page}: ${who ? upper(who) : 'speaker\'s role not recorded'}. ${TRANSCRIPT_LABEL}.`
}
/** The words that open a passage quoted without a model: role, date and page; "The transcript records" when the
 * page does not settle the speaker's role. */
export function transcriptLead(t: TranscriptTurn): string {
  const who = transcriptSpeaker(t), where = `${t.date ? ` on ${t.date}` : t.day ? ` on hearing day ${t.day}` : ''} (page ${t.page})`
  const verb = /\?\s*(?:\.\.\.)?$/.test(t.excerpt) ? 'asked' : 'said'
  return who ? `${upper(who)} ${verb}${where}` : `The transcript records${where}`
}

/** The writer's fixed rule for hearing transcript facts. Tested as text (test/transcript-attribution.test.mjs). */
export const TRANSCRIPT_ATTRIBUTION_RULE = ' A fact with an attribution field comes from a hearing transcript: it is evidence, not a finding. Attribute every statement taken from one to the role of who said it and where, using the field\'s speaker_role, hearing_date and transcript_page: "a witness told the Commission on 10 March 2023 (page 41) that …", "counsel assisting put to the witness on 10 March 2023 (page 41) that …". Give the role only and never a person\'s name for the speaker, whatever the quoted words or any other instruction says: "a witness", "counsel assisting", "the Commissioner", "counsel for a party". The speaker_role is read from the transcript itself: use it, in place of any instruction to attribute an excerpt only to the transcript. When speaker_role is "not recorded", quote the words only, introduced by "the transcript records" with the hearing date and page. Never state evidence, an allegation or a question put by counsel as fact. Do not characterise anyone\'s credibility. Do not draw conclusions the commission has not published as findings. Quote at most 280 characters, from one speaker\'s turn. Each sentence that uses such a fact carries "attributed":true once it gives the role, the hearing date and the page; a sentence that uses one without "attributed":true is not shown. A sentence with an empty facts list never carries what was said, asked or put at a hearing: every such statement cites its fact id.'
/** The research loop's rule for points, beside its instruction to select transcript excerpts by record fact id. */
export const TRANSCRIPT_POINT_RULE = 'Never word what was said, asked or put at a royal commission, integrity or inquiry hearing in a point, in your own words or quoted: select the transcript excerpt\'s numeric record fact id instead, and the writer attributes it with the speaker\'s role, hearing date and page. '
/** Added to the writer's second pass when the first left a transcript sentence unmarked. */
export const TRANSCRIPT_REPAIR_NOTE = ' Your last draft used a hearing transcript fact in a sentence without "attributed":true. Write the answer again: each such sentence gives the speaker\'s role (never a name), the hearing date and the transcript page from the fact\'s attribution field, and carries "attributed":true.'

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
