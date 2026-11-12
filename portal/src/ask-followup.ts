import type {ConversationTurn} from './ask-rewrite'
import {requestedPersonSlot} from './ask-person-slot'
import type {RemunerationRecord} from './research-types'

const reportThenPay = (s: string) => { const t = s.toLowerCase(), at = t.indexOf('annual report'); return at >= 0 && t.indexOf('remuneration', at) >= 0 }
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** Standalone identity grammar supplies a full name, never a first-name or surname search. */
export function identityPerson(question: string): string | null {
  if (question.length > 300) return null
  let q = question.trim(), end = q.length
  while (end && '?.!'.includes(q[end-1])) end--
  q = q.slice(0,end)
  const prefix = /^who (?:is|was) /i.exec(q)
  if (!prefix) return null
  const words = q.slice(prefix[0].length).trim().split(/\s+/)
  while (['senator','mr','mrs','ms','dr','sir','dame'].includes((words[0] ?? '').toLowerCase().replace(/\.$/, ''))) words.shift()
  if (words.length < 2 || words.length > 6 || !words.every(w => /^[\p{L}][\p{L}\p{M}.'’\-]*$/u.test(w))) return null
  if (words.some(w => ['the','a','an','and','or','from','at','in','of','highest','paid','agency','head','who','what','is','was'].includes(w.toLowerCase()))) return null
  return words.join(' ')
}
export function questionPerson(question: string): string | null {
  // Bounded input and unambiguous patterns: these run on reader text (CodeQL js/polynomial-redos).
  const q=question.slice(0,300)
  const person=requestedPersonSlot(q) ?? /\bwhat (?:did|does) (.+?) do\b/i.exec(q)?.[1]?.trim() ?? identityPerson(question)
  return person&&!/^(?:the|a|an)\b|^(?:records?|reports?|transcripts?|bills?|it|he|she|they)$/i.test(person)?person:null
}
export type SourceTurn = ConversationTurn & {sources?: {cited?: boolean; snippet?: string; title?: string; speaker?: string; remuneration?: RemunerationRecord}[]}
/** Prior prose and metadata identify a lookup, never supply evidence for an answer. */
export function remunerationFollowUp(question: string, turns: SourceTurn[]) {
  const person = questionPerson(question)
  if (!person || !turns.some(t => t.author === 'answer')) return null
  const name = fold(person)
  for (const turn of [...turns].reverse()) for (const source of turn.sources ?? []) {
    if (source.cited === false) continue
    const row = source.remuneration
    if (row && fold(row.name) === name && /^tp-\d{4}-\d{2}-[0-9a-f]{32}$/.test(row.record_id))
      return {person: row.name, record_id: row.record_id, body: row.body, year: row.year}
    const old = /^([^()]+) \((?:[^()]|\([^()]*\))*\), ([^,]+), ((?:19|20)\d{2}-\d{2}) annual report\b/.exec((source.snippet ?? source.title ?? '').slice(0, 500))
    if (old && fold(old[1]) === name) return {person: old[1], body: old[2], year: old[3]}
  }
  if (turns.some(t => t.author === 'answer' && fold(t.text ?? '').includes(name) && /remuneration|annual report/i.test(t.text ?? '')))
    return {person}
  // A reader can introduce a different named head within the same pay conversation.
  // The annual-report family still supplies their identity, rather than the parliamentary roster.
  if (turns.some(t => t.author === 'answer' && (t.sources??[]).some(s=>s.remuneration||reportThenPay(s.snippet??''))) ||
    turns.some(t=>t.author!=='answer'&&/agency heads?|departmental secretar|chief executive/i.test(t.text??'')&&/paid|pay|earn|remuneration/i.test(t.text??''))) return {person}
  return null
}

/** A name must match in full; one shared first name is not the question's subject. */
export function sourceAboutPerson(source: {speaker?: string; title?: string; snippet?: string; remuneration?: RemunerationRecord}, person: string, strictOwner = false): boolean {
  // A structured owner takes precedence over incidental names in a larger snippet.
  const owner = source.remuneration?.name ?? (strictOwner ? source.speaker : undefined)
  if (owner) {
    const wanted=fold(person).split(' '), recorded=fold(owner).split(' ')
    return fold(owner)===fold(person) || wanted.length===2&&recorded.length>2&&wanted[0]===recorded[0]&&wanted[1]===recorded.at(-1)
  }
  const text = ' ' + fold([source.speaker, source.title, source.snippet, source.remuneration?.name].filter(Boolean).join(' ')) + ' '
  const wanted=fold(person).split(' '),recorded=fold(source.speaker??source.remuneration?.name??'').split(' ')
  return text.includes(' ' + fold(person) + ' ') || wanted.length===2&&recorded.length>2&&wanted[0]===recorded[0]&&wanted[1]===recorded.at(-1)
}
