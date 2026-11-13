import type {ConversationTurn} from './ask-rewrite'
import {requestedPersonSlot} from './ask-person-slot'
import type {RemunerationRecord} from './research-types'

const reportThenPay = (s: string) => { const t = s.toLowerCase(), at = t.indexOf('annual report'); return at >= 0 && t.indexOf('remuneration', at) >= 0 }
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** Words that never form a person's full name: closed-class English words, question words, and the roles and
 * stances that follow "who is" or "who was" in questions about events ("Who was responsible for robodebt?"). */
const NOT_NAME_WORDS = new Set([
  'a', 'about', 'accountable', 'after', 'against', 'agency', 'among', 'an', 'and', 'appointed',
  'are', 'as', 'at', 'be', 'been', 'before', 'behind', 'being', 'between', 'blamed', 'but', 'by',
  'can', 'chair', 'charged', 'commissioner', 'could', 'current', 'deputy', 'did', 'do', 'does',
  'down', 'during', 'elected', 'first', 'for', 'former', 'from', 'government', 'governor', 'had',
  'has', 'have', 'he', 'head', 'her', 'hers', 'highest', 'him', 'his', 'how', 'i', 'in', 'into',
  'involved', 'is', 'it', 'its', 'leader', 'leading', 'like', 'mayor', 'me',
  'member', 'members', 'might', 'minister', 'ministers', 'must', 'my', 'near', 'new', 'next', 'no',
  'not', 'of', 'off', 'on', 'onto', 'opposition', 'or', 'our', 'out', 'over', 'paid',
  'party', 'per', 'premier', 'president', 'prime', 'responsible', 'running', 'sacked', 'secretary',
  'senator', 'senators', 'shadow', 'she', 'should', 'since', 'speaker', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'these', 'they', 'this', 'those', 'through', 'to', 'treasurer',
  'under', 'up', 'us', 'via', 'was', 'what', 'when', 'where', 'which', 'who', 'whom',
  'whose', 'why', 'with', 'within', 'without', 'would', 'you', 'your',
  'found', 'guilty', 'today', 'yesterday', 'tomorrow', 'now', 'then', 'ever', 'also', 'still',
])
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
  if (words.some(w => NOT_NAME_WORDS.has(w.toLowerCase().replace(/[’']s$/, '')))) return null
  // A wrong name throws the research away, so anything that does not look like a name is left to ordinary research.
  // Typed with capitals, every word of a name is capitalised ("Who is suing Lehrmann?" is not a name).
  // Typed in lowercase, longer -ing and -ed words are verbs, not names ("who was fired yesterday").
  if (/\p{Lu}/u.test(q.slice(1))) { if (words.some(w => !/^\p{Lu}/u.test(w))) return null }
  else if (words.some(w => w.length >= 5 && /(?:ing|ed)$/i.test(w))) return null
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
