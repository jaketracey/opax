import type { RecordQuestion } from './ask-records'
import { isMoneyRanking } from './ask-money'
import { isPositionDurationQuestion } from './position-evidence'

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
const NAMED_SPEECH = /^(?:and\s+)?(?:what|how)\s+(?:has|have|did|does|would|might)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(?!he\b|she\b|they\b)(.{3,80}?)\s+(?:say|said|speak|spoken|describ(?:e|ed)|argu(?:e|ed)|propos(?:e|ed)|recommend(?:ed)?)\b/i
// Ordinary stance wording must use the same original-speaking-turn checks as
// "what did X say". These capture a grammatical subject; only an exact roster
// match may turn that subject into a person filter.
const STANCE_REQUESTS = [
  /^(?:and\s+)?(?:did|does|has|have|would|might)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(.{2,80}?)\s+(?:support(?:ed)?|oppose(?:d)?|back(?:ed)?|reject(?:ed)?|favou?r(?:ed)?|call(?:ed)?\s+for)\s+(.+?)\s*[?]*$/i,
  /^(?:and\s+)?(?:is|was)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(.{2,80}?)\s+(?:in\s+favou?r\s+of|against)\s+(.+?)\s*[?]*$/i,
  /^(?:and\s+)?what\s+(?:does|did|would|might)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(.{2,80}?)\s+(?:think|believe)\s+(?:about|on|of)\s+(.+?)\s*[?]*$/i,
  /^(?:and\s+)?what\s+(?:is|was|are|were)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(.{3,80}?)['’]s\s+(?:position|stance|views?)\s+(?:on|about)\s+(.+?)\s*[?]*$/i,
  /^(?:and\s+)?where\s+(?:does|did|would|might)\s+(?:(?:Senator|MP|Mr|Mrs|Ms|Dr)\.?\s+)?(.{2,80}?)\s+stand\s+(?:on|about)\s+(.+?)\s*[?]*$/i,
]
function stanceRequest(question: string): {subject:string;topic:string} | undefined {
  for (const pattern of STANCE_REQUESTS) {
    const match = pattern.exec(question.trim())
    if (match) return {subject:match[1],topic:match[2].replace(/\?+$/, '').trim()}
  }
}
function namedPositionRequest(question: string): {subject:string;topic:string} | undefined {
  const speech = NAMED_SPEECH.exec(question.trim())
  if (speech) return {subject:speech[1],topic:question.trim().slice(speech[0].length).replace(/^\s*(?:about|on)\s+/i, '').replace(/\?+$/, '').trim()}
  const stance = stanceRequest(question)
  return stance && !/^(?:he|she|they|his|her|their)$/i.test(stance.subject) ? stance : undefined
}
export const POSITION_GROUNDING = 'When asked what a politician would or might say, explain their documented position in the third person. Do not roleplay them, write a fictional quote, or predict their response. Start with what their recorded statements support, with dates and citations. Distinguish their own statements from another speaker describing them. If the record does not establish their position on this topic, say so rather than inferring it from their party or another topic. For a named politician position question, give a short takeaway followed by up to three concrete policy positions or proposals, each with its own citation. Prefer specific proposals over rhetorical attacks. Keep it under 180 words. Do not spend space summarising ministerial replies; exclude them from the position summary. Attribute criticism and claimed effects to the politician. Do not repeat illustrative population counts, economic forecasts or attack statistics unless the user requests those figures. For an actual proposed policy retain its specified duration, limit or amount exactly. Never confuse arrivals with net migration or departures. Include a source date when provided, and never describe an old statement as a current promise. '

const REFERENTIAL = /^(?:and\b|what about\b|how about\b)|^(?:what|how|why|when|did|does|has|would)\b.*\b(?:he|she|they|his|her|their|it|that)\b/i
// Compact policy-detail questions often omit a pronoun. Keep only these
// specific forms; a fresh "Who won the election?" must start a new subject.
const ELIGIBILITY_FOLLOWUP = /^(?:and\s+)?(?:who\s+(?:(?:would|could|can)\s+(?:be\s+)?(?:eligible|qualify)|(?:is|was|are|were)\s+eligible|qualifies)|which\s+(?:homes|households|people|properties|projects|businesses)\s+(?:(?:would|could|can)\s+(?:qualify|be\s+eligible)|(?:are|were)\s+eligible|qualify))(?:\s+for\s+(?:it|that|this|the (?:scheme|proposal|policy|housing)))?\s*[?!.]*$/i
const fold = (value: string) => value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
// The browser sends "user"; older API clients used "question". Model answers
// and carried excerpts may supply evidence later, but never the subject filter.
const userQuestions = (input: RecordQuestion): string[] => Array.isArray(input.context)
  ? input.context.filter(t => (t?.author === 'user' || t?.author === 'question') && typeof t.text === 'string' && t.text.trim())
    .slice(-12).map(t => t.text!.slice(0, 2000))
  : []
const priorQuestion = (input: RecordQuestion) => userQuestions(input).at(-1)
const partySubject = (question: string) => !!cohort(question) || PARTIES.some(p =>
  new RegExp(`^(?:and\\s+)?(?:(?:what|how)\\s+about\\s+)?${p.name}\\b`, 'i').test(question.trim()))
const inheritsSubject = (question: string) => (REFERENTIAL.test(question.trim()) || ELIGIBILITY_FOLLOWUP.test(question.trim()) || /^(?:he|she|they)$/i.test(stanceRequest(question)?.subject || '')) && !namedPositionRequest(question) && !partySubject(question)
function namedFollowUp(question: string, people: readonly {name:string}[]): {speaker:string;topic?:string} | undefined {
  const rest = question.trim().replace(/^(?:and\s+)?(?:(?:what|how)\s+about\s+)/i, '').replace(/^and\s+/i, '')
  if (rest === question.trim()) return
  return people.filter(p => p.name.includes(' ')).flatMap(p => {
    const name = fold(p.name), value = fold(rest)
    if (value === name || value === name+'?') return [{speaker:p.name}]
    if (value.startsWith(name+' on ') || value.startsWith(name+' about ')) return [{speaker:p.name,topic:rest.slice(p.name.length).replace(/^\s+(?:on|about)\s+/i,'').replace(/\?$/,'')}]
    return []
  })[0]
}

export function needsAskPeople(input: RecordQuestion): boolean {
  if (input.speaker || (input.kind && !['all', 'speech'].includes(input.kind))) return false
  return !!namedPositionRequest(input.question || '') || !!stanceRequest(input.question || '') ||
    REFERENTIAL.test((input.question || '').trim()) || ELIGIBILITY_FOLLOWUP.test((input.question || '').trim())
}

function naturalScope(question: string, people: readonly { name: string }[]): AskScope {
  const scope: AskScope = { ...cohort(question) }
  const subject = namedPositionRequest(question)?.subject
  if (subject) {
    const matches = [...new Set(people.filter(p => fold(p.name) === fold(subject)).map(p => p.name))]
    // A stance question can compare speakers after the first verb ("Did X
    // support nuclear power or did Y?"). Keep such requests broad, including
    // ambiguous named objects, rather than silently answering for only X.
    const mentioned = stanceRequest(question) ? new Set(people.filter(p => p.name.includes(' ') &&
      new RegExp(`(?:^|[^\\p{L}])${fold(p.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^\\p{L}])`,'u').test(fold(question))).map(p=>fold(p.name))) : new Set()
    if (matches.length === 1 && mentioned.size <= 1) { delete scope.party; scope.speaker = matches[0]; scope.kind = 'speech' }
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
  let scope: AskScope = {}
  for (const turn of [...userQuestions(input), question]) {
    // Receipt selections belong to the calculation, not to a later question
    // about speeches. In particular, do not inherit their financial-year keys.
    if (isMoneyRanking({question:turn})) { scope={}; continue }
    const named = namedFollowUp(turn, people)
    const current = {...naturalScope(turn, people), ...(named ? {speaker:named.speaker,kind:'speech'} : {})}
    if (!inheritsSubject(turn) || named) scope = {}
    // A new date window replaces the old window, not just one of its bounds.
    if (current.from || current.to) { delete scope.from; delete scope.to }
    scope = { ...scope, ...current }
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

/** All resolved named speech questions get the original-turn attribution guard,
 * including ordinary "said" questions and referential follow-ups. */
export function isNamedPositionQuestion(input: RecordQuestion): boolean {
  return !!input.speaker && input.kind === 'speech' &&
    (!!namedPositionRequest(input.question || '') || inheritsSubject(input.question || ''))
}

const DETAIL_WORDS = new Set('and what who which how why when did does has have would could should much long was were be for to do can about on he she they his her their it its that this say said propose proposed recommend recommended mean exactly please'.split(' '))
function topicFromQuestion(question: string): string {
  return namedPositionRequest(question)?.topic ?? question.trim()
}
function nextTopic(question: string, previous: string): string {
  // A replacement period belongs to the structured date filters. Do not keep
  // searching for an obsolete year from the prior question as a topic term.
  const withoutPriorPeriod = () => previous.replace(/\s+(?:(?:in|during|before|after|since)\s+(?:19|20)\d{2}|(?:between|from)\s+(?:19|20)\d{2}\s+(?:and|to|through|until|[–-])\s+(?:19|20)\d{2})\s*[?!.]*$/i, '').trim() || previous
  if (/^(?:and\s+)?(?:(?:what|how)\s+about\s+|what\s+(?:is|was|are|were)\s+(?:his|her|their)\s+(?:position|stance|views?)\s+)?(?:(?:in|during|before|after|since)\s+(?:19|20)\d{2}|(?:between|from)\s+(?:19|20)\d{2}\s+(?:and|to|through|until|[–-])\s+(?:19|20)\d{2})\s*[?!.]*$/i.test(question.trim())) return withoutPriorPeriod()
  // Duration is a request about the existing proposal, not a new topic word
  // that its original speech must literally contain. Generation gets it apart.
  if (isPositionDurationQuestion(question) || ELIGIBILITY_FOLLOWUP.test(question.trim())) return previous
  const stance = stanceRequest(question)
  const stanceTopic = stance && /^(?:he|she|they)$/i.test(stance.subject) ? stance.topic :
    /^(?:and\s+)?what\s+(?:is|was|are|were)\s+(?:his|her|their)\s+(?:position|stance|views?)\s+(?:on|about)\s+(.+?)\??$/i.exec(question.trim())?.[1]
  if (stanceTopic) {
    const reference = /^(?:it|that|this)(?:\s+(?:proposal|policy|plan|bill|measure))?(\s+(?:(?:in|during|before|after|since)\s+\d{4}|(?:between|from)\s+\d{4}\s+(?:and|to|through|until)\s+\d{4}))?\??$/i.exec(stanceTopic)
    return reference ? (reference[1] ? withoutPriorPeriod() : previous) : stanceTopic.replace(/\?+$/, '').trim()
  }
  const changed = (/^(?:and\s+)?(?:what|how)\s+about\s+(.+?)\??$/i.exec(question.trim())?.[1] ||
    /^(?:what|how)\s+(?:has|have|did|does|would|might)\s+(?:he|she|they)\s+(?:say|said|propos(?:e|ed)|recommend(?:ed)?)\s+(?:about|on)\s+(.+?)\??$/i.exec(question.trim())?.[1])?.replace(/\?$/, '').trim()
  // "What about immigration?" changes topic; "what about her cap?" needs
  // its prior subject. Date-only follow-ups retain the topic too.
  if (changed && !/\b(?:he|she|they|his|her|their|it|that|this)\b|^(?:in|during|before|after|since|between|from)\s+\d/i.test(changed)) return changed
  const details = (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => !DETAIL_WORDS.has(word))
  return [...new Set([previous, ...details].filter(Boolean))].join(' ').slice(0, 2000)
}

/** Retrieval must understand a follow-up before generation sees the history. */
export function askRetrievalQuery(input: RecordQuestion): string {
  const question = input.question || ''
  if (input.speaker && input.kind === 'speech') {
    let topic = ''
    for (const turn of [...userQuestions(input), question]) {
      const historicalName = /^[Aa]nd\s+([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+)+)\?$/u.exec(turn.trim())?.[1]
      const named = namedFollowUp(turn, [{name:input.speaker}, ...(historicalName ? [{name:historicalName}] : [])])
      const direct = topicFromQuestion(turn)
      topic = named ? (named.topic || topic) : inheritsSubject(turn) && topic ? nextTopic(turn, topic) :
        /^(?:it|that|this)\??$/i.test(direct) && topic ? topic : direct
    }
    if (topic) return topic
  }
  const previous = priorQuestion(input)
  if (previous && isMoneyRanking({question:previous})) return question
  if (previous && REFERENTIAL.test(question.trim())) return `${previous}\nFollow-up question: ${question}`
  return question.replace(/^(what|how)\s+(?:would|might)\s+(.{3,80}?)\s+say\b/i, 'What has $2 said')
}
