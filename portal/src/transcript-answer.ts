/** Hearing transcript listings in Ask answers.
 * A listing row (commission, hearing day, pages) is a record of what was published, not a figure the writer
 * should restate: a paraphrase ("the 27 February transcript runs 64 pages") no longer carries the row's own
 * wording, so the claim audit cannot tie its numbers to the record and strips the answer. When every fact is
 * a listing row, the transcript tool's own lines are the answer. Excerpts from transcript text still go to
 * the writer, which quotes or paraphrases them. */
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
/** One passage of hearing evidence as typed facts: who spoke (named only where the published transcript names
 * them), their role, the commission, the hearing date and the transcript page. An empty speaker is an unnamed one. */
export interface TranscriptTurn { speaker: string; role?: TranscriptRole; commission?: string; day?: string; date?: string; page: string; pdf_page?: number; excerpt: string }
const ROLE = `(?: \\((${TRANSCRIPT_ROLES.join('|')})\\))?`
const TOOL_TURN = new RegExp(`transcript page (\\S+) \\(PDF page (\\d+)\\), hearing turn(?: by ([^:(]+?))?${ROLE}: "([\\s\\S]*?)"(?= transcript page | Hearing transcript:|$)`, 'g')
const WRITTEN_TURN = new RegExp(`^(?:The transcript records|(.+?)${ROLE} said) at (.+?)(?: on hearing day \\d+)?(?: \\(\\d{1,2} [A-Z][a-z]+ \\d{4}\\))?, transcript page (\\S+): "([\\s\\S]+)"\\. Hearing transcript:`)
const UNNAMED_WITNESS = 'A witness'
/** Split a published citation into attributed turns before writing. Restricted transcripts never supply
 * quotations, even if malformed input happens to contain quotation marks. */
export function transcriptTurns(text: string): TranscriptTurn[] {
  if (!text.includes(TRANSCRIPT_LABEL) || /Not quoted:|non-publication order|suppression order|pseudonymous witness/i.test(text)) return []
  const day = /\b(?:Hearing )?Day (\d+)\b/i.exec(text)?.[1]
  const date = /\((\d{1,2} [A-Z][a-z]+ \d{4})\)/.exec(text)?.[1]
  const shared = { ...(day ? { day } : {}), ...(date ? { date } : {}) }
  const commission = text.split(',')[0].trim()
  const turns = [...text.matchAll(TOOL_TURN)]
    .map(m => ({ speaker: (m[3] ?? '').trim(), ...(m[4] ? { role: m[4] as TranscriptRole } : {}), ...(commission ? { commission } : {}), page: m[1], pdf_page: Number(m[2]), excerpt: m[5], ...shared }))
  if (turns.length) return turns
  const written = WRITTEN_TURN.exec(text)
  if (!written) return []
  const unnamed = !written[1] || written[1] === UNNAMED_WITNESS
  const role = (written[2] as TranscriptRole | undefined) ?? (written[1] === UNNAMED_WITNESS ? 'witness' : undefined)
  return [{ speaker: unnamed ? '' : written[1], ...(role ? { role } : {}), commission: written[3], page: written[4], excerpt: written[5], ...shared }]
}
/** One turn as the single line the writer, the fallbacks and the final boundary all read back with transcriptTurns. */
export function transcriptFactLine(turn: TranscriptTurn): string {
  const who = turn.speaker ? `${turn.speaker}${turn.role ? ` (${turn.role})` : ''} said` : turn.role === 'witness' ? `${UNNAMED_WITNESS} said` : 'The transcript records'
  return `${who} at ${turn.commission ?? 'the hearing'}${turn.day ? ` on hearing day ${turn.day}` : ''}${turn.date ? ` (${turn.date})` : ''}, transcript page ${turn.page}: "${turn.excerpt}". ${TRANSCRIPT_LABEL}.`
}

/** The typed attribution a transcript fact carries to the writer: it is evidence, who gave it, in what role, when
 * and on which page. Every claim from a transcript is planned as an attributed claim before a word is written.
 * A role the transcript does not give is "not recorded": that passage is quoted with "the transcript records". */
export interface TranscriptAttribution { source: 'hearing_transcript'; status: 'evidence_not_finding'; claim: 'attributed'; speaker_role: TranscriptRole | 'not recorded'; speaker?: string; commission?: string; hearing_date?: string; hearing_day?: string; transcript_page: string }
export const transcriptAttribution = (t: TranscriptTurn): TranscriptAttribution => ({ source: 'hearing_transcript', status: 'evidence_not_finding', claim: 'attributed', speaker_role: t.role ?? 'not recorded',
  ...(t.speaker ? { speaker: t.speaker } : {}), ...(t.commission ? { commission: t.commission } : {}), ...(t.date ? { hearing_date: t.date } : {}), ...(t.day ? { hearing_day: t.day } : {}), transcript_page: t.page })

const ROLE_WORDS: Record<TranscriptRole, string> = { commissioner: 'the Commissioner', 'counsel assisting': 'counsel assisting', witness: 'a witness', 'counsel for a party': 'counsel for a party' }
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Who a passage is attributed to: the role, with the name where the transcript names them ("counsel assisting,
 * Mr Greggery"); a commissioner's label is already the role. Null when the transcript gives no role. */
export function transcriptSpeaker(t: TranscriptTurn): string | null {
  if (!t.role) return null
  const titled = t.role === 'commissioner' && /^(?:the )?commissioner$/i.test(t.speaker)
  return `${ROLE_WORDS[t.role]}${t.speaker && !titled ? `, ${t.speaker}` : ''}`
}
/** The citation a reader sees for one transcript passage, built from the typed facts and never from the answer's
 * wording: commission, hearing date, transcript page and the speaker's role. */
export function transcriptCitation(t: TranscriptTurn): string {
  const who = transcriptSpeaker(t)
  return `${t.commission ?? 'Hearing'}, hearing transcript${t.date ? `, ${t.date}` : t.day ? `, hearing day ${t.day}` : ''}, page ${t.page}: ${who ? upper(who) : `${t.speaker ? `${t.speaker}, ` : ''}speaker's role not recorded`}. ${TRANSCRIPT_LABEL}.`
}
/** The words that open a passage quoted without a model: role, name, date and page; "The transcript records" when
 * the transcript gives no role for the speaker. */
export function transcriptLead(t: TranscriptTurn): string {
  const who = transcriptSpeaker(t), where = `${t.date ? ` on ${t.date}` : t.day ? ` on hearing day ${t.day}` : ''} (page ${t.page})`
  const verb = /\?\s*(?:\.\.\.)?$/.test(t.excerpt) ? 'asked' : 'said'
  return who ? `${upper(who)}${who.includes(', ') ? ',' : ''} ${verb}${where}` : `The transcript records${t.speaker ? ` ${t.speaker} saying` : ''}${where}`
}

/** The writer's fixed rule for hearing transcript facts. Tested as text (test/transcript-attribution.test.mjs). */
export const TRANSCRIPT_ATTRIBUTION_RULE = ' A fact with an attribution field comes from a hearing transcript: it is evidence, not a finding. Attribute every statement taken from one to who said it and where, using the field\'s speaker_role, hearing_date and transcript_page: "a witness told the Commission on 10 March 2023 (page 41) that …", "counsel assisting put to the witness on 10 March 2023 (page 41) that …". Name the speaker only when the field gives a speaker. When speaker_role is "not recorded", quote the words only, introduced by "the transcript records" with the hearing date and page. Never state evidence, an allegation or a question put by counsel as fact. Do not characterise anyone\'s credibility. Do not draw conclusions the commission has not published as findings. Quote at most 280 characters, from one speaker\'s turn. Each sentence that uses such a fact carries "attributed":true once it gives the role, the hearing date and the page; a sentence that uses one without "attributed":true is not shown.'
/** Added to the writer's second pass when the first left a transcript sentence unmarked. */
export const TRANSCRIPT_REPAIR_NOTE = ' Your last draft used a hearing transcript fact in a sentence without "attributed":true. Write the answer again: each such sentence gives the speaker\'s role, the hearing date and the transcript page from the fact\'s attribution field, and carries "attributed":true.'

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
