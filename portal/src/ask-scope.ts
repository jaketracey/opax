import type { RecordQuestion } from './ask-records'

// Infer only an unambiguous political cohort, not arbitrary mentions of
// independence (courts, inquiries, schools) or a comparison between parties.
const PARTIES = [
  { label: 'Independent', name: 'independ(?:e|a)nts?', cohort: 'independ(?:e|a)nt' },
  { label: 'Labor', name: '(?:Labor|ALP)', cohort: '(?:Labor|ALP)' },
  { label: 'Liberal', name: 'Liberals?', cohort: 'Liberal' },
  { label: 'Greens', name: '(?:Australian )?Greens', cohort: '(?:Australian )?Greens' },
  { label: 'Nationals', name: 'Nationals?', cohort: 'Nationals?' },
  { label: 'One Nation', name: 'One Nation', cohort: 'One Nation' },
  { label: 'LNP', name: 'LNP', cohort: 'LNP' },
]
const MEMBERS = '(?:(?:federal|state) )?(?:MPs?|members|senators|parliamentarians|politicians)'
const SPEECH = /\b(?:say|said|saying|speeches|spoke|speak|describ(?:e|ed|ing)|argu(?:e|ed|ing)|statements?|debates?)\b/i

function cohort(question: string): { party: string; kind?: string } | undefined {
  const mentioned = PARTIES.filter(p => new RegExp(`\\b${p.name}\\b`, 'i').test(question))
  if (mentioned.length !== 1) return
  const party = mentioned[0]
  const match = new RegExp(`\\b${party.cohort}\\s+${MEMBERS}\\b`, 'i').exec(question)
  if (!match) return
  // A negative or exclusion is not an affirmative request for that cohort.
  if (/\b(?:non[- ]|not(?:\s+just)?\s+|except\s+|excluding\s+|other than\s+|rather than\s+|about\s+|against\s+|towards\s+)$/i.test(question.slice(0, match.index))) return
  return { party: party.label, ...(SPEECH.test(question) ? { kind: 'speech' } : {}) }
}

export interface AskScope {
  party?: string; speaker?: string; kind?: string
  state?: string; chamber?: string; from?: string; to?: string
}

// Match a grammatical subject, not a name mentioned as the object of debate.
const NAMED_SPEECH = /^(?:what|how)\s+(?:has|have|did|does|would|might)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(.{3,80}?)\s+(?:say|said|speak|spoken|describ(?:e|ed)|argu(?:e|ed))\b/i
export const POSITION_GROUNDING = 'When asked what a politician would or might say, explain their documented position in the third person. Do not roleplay them, write a fictional quote, or predict their response. Start with what their recorded statements support, with dates and citations. Distinguish their own statements from another speaker describing them. If the record does not establish their position on this topic, say so rather than inferring it from their party or another topic. For a named politician position question, give a short takeaway followed by up to three concrete policy positions or proposals, each with its own citation. Prefer specific proposals over rhetorical attacks. Keep it under 180 words. Do not spend space summarising ministerial replies; exclude them from the position summary. Attribute criticism and claimed effects to the politician. Do not repeat illustrative population counts, economic forecasts or attack statistics unless the user requests those figures. For an actual proposed policy retain its specified duration, limit or amount exactly. Never confuse arrivals with net migration or departures. Include a source date when provided, and never describe an old statement as a current promise. '

const REFERENTIAL = /^(?:and\b|what about\b|how about\b|what did they\b|how did they\b)/i
const fold = (value: string) => value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
const priorQuestion = (input: RecordQuestion) => Array.isArray(input.context)
  ? [...input.context].reverse().find(t => t?.author === 'question' && typeof t.text === 'string')?.text
  : undefined

export function needsAskPeople(input: RecordQuestion): boolean {
  if (input.speaker || (input.kind && !['all', 'speech'].includes(input.kind))) return false
  return NAMED_SPEECH.test(input.question || '') ||
    (REFERENTIAL.test(input.question || '') && NAMED_SPEECH.test(priorQuestion(input) || ''))
}

function naturalScope(question: string, people: readonly { name: string }[]): AskScope {
  const scope: AskScope = { ...cohort(question) }
  const subject = NAMED_SPEECH.exec(question.trim())?.[1]
  if (subject) {
    const matches = [...new Set(people.filter(p => fold(p.name) === fold(subject)).map(p => p.name))]
    if (matches.length === 1) { scope.speaker = matches[0]; scope.kind = 'speech' }
  }
  const jurisdictions = [
    ['qld', 'Queensland'], ['nsw', '(?:New South Wales|NSW)'],
    ['vic', 'Victoria(?:n)?'], ['sa', 'South Australia(?:n)?'],
    ['wa', 'Western Australia(?:n)?'], ['tas', 'Tasmania(?:n)?'],
    ['nt', 'Northern Territory'], ['act', '(?:Australian Capital Territory|ACT)'],
  ].filter(([, name]) => {
    const match = new RegExp(`\\b${name}\\s+(?:parliament|MPs?|senators|legislative assembly)\\b`, 'i').exec(question)
    return match && !/\b(?:about|on|against|towards)\s+(?:the\s+)?$/i.test(question.slice(0, match.index))
  })
  if (jurisdictions.length === 1) { scope.state = jurisdictions[0][0]; if (SPEECH.test(question)) scope.kind = 'speech' }
  const senate = /\b(?:the Senate|senators)\b/i.exec(question)
  if (SPEECH.test(question) && senate && !/\b(?:MPs|House of Representatives)\b/i.test(question) &&
      !/\b(?:about|on|against|towards)\s+$/i.test(question.slice(0, senate.index)) && !/\b(?:US|U\.S\.|United States|American|Canadian|Canada|French|France)\b/i.test(question)) {
    scope.chamber = 'senate'
    scope.state ??= 'federal'
    scope.kind = 'speech'
  }
  const years = [...question.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m => m[0])
  const range = /\b(?:between|from)\s+((?:19|20)\d{2})\s+(?:and|to|through|until|[–-])\s+((?:19|20)\d{2})\b/i.exec(question)
  if (range && years.length === 2 && range[1] <= range[2]) { scope.from = range[1]; scope.to = range[2] }
  else if (years.length === 1 && !/\b(?:financial|fiscal) year\b/i.test(question)) {
    const year = /\b(in|during|before|after|since)\s+((?:19|20)\d{2})\b/i.exec(question)
    if (year) {
      const n = Number(year[2])
      if (/^(in|during)$/i.test(year[1])) { scope.from = year[2]; scope.to = year[2] }
      else if (/^before$/i.test(year[1])) scope.to = String(n - 1)
      else scope.from = String(n + (/^after$/i.test(year[1]) ? 1 : 0))
    }
  }
  return scope
}

export function resolveAskScope<T extends RecordQuestion>(input: T, people: readonly { name: string }[] = []): { input: T; scope?: AskScope } {
  if (input.kind && !['all', 'speech'].includes(input.kind)) return { input }
  const question = typeof input.question === 'string' ? input.question : ''
  let scope = naturalScope(question, people)
  const previous = priorQuestion(input)
  if (previous && REFERENTIAL.test(question.trim()) && !NAMED_SPEECH.test(question) &&
      !PARTIES.some(p => new RegExp(`\\b${p.name}\\b`, 'i').test(question))) {
    scope = { ...naturalScope(previous, people), ...scope }
  }
  // Explicit controls win independently. Do not combine an inferred political
  // cohort with an explicitly selected person/party; dates remain independent.
  if (input.party?.trim() || input.speaker?.trim()) { delete scope.party; delete scope.speaker; delete scope.kind }
  for (const field of ['party', 'speaker', 'state', 'chamber', 'from', 'to'] as const) {
    if (input[field]?.trim()) delete scope[field]
  }
  if (input.kind === 'speech') delete scope.kind
  if (!Object.keys(scope).length) return { input }
  return { input: { ...input, ...scope }, scope }
}

/** Retrieval must understand a follow-up even before the model reads history. */
export function askRetrievalQuery(input: RecordQuestion): string {
  const question = input.question || ''
  const previous = priorQuestion(input)
  if (previous && REFERENTIAL.test(question.trim())) {
    return `${previous.slice(0, 2000)}\nFollow-up question: ${question}`
  }
  // The person is already an exact retrieval filter. Searching their name
  // again over-ranks ministerial replies that mention them, burying their
  // own policy speech. The original question remains in the generation prompt.
  if (input.speaker && input.kind === 'speech') {
    const named = NAMED_SPEECH.exec(question)
    if (named) {
      const topic = question.slice(named[0].length).replace(/^\s*(?:about|on)\s+/i, '').replace(/[?]+$/, '').trim()
      if (topic) return topic
    }
  }
  return question.replace(/^(what|how)\s+(?:would|might)\s+(.{3,80}?)\s+say\b/i, 'What has $2 said')
}
