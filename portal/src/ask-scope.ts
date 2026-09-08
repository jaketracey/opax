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

export function resolveAskScope<T extends RecordQuestion>(input: T): { input: T; scope?: { party: string; kind?: string } } {
  // Explicit controls and named speakers always win over inference.
  if (input.party?.trim() || input.speaker?.trim() || (input.kind && !['all', 'speech'].includes(input.kind))) return { input }
  const question = typeof input.question === 'string' ? input.question : ''
  let scope = cohort(question)
  // Only a clearly referential follow-up inherits the previous user question.
  if (!scope && /^(?:and\b|what about\b|how about\b|what did they\b|how did they\b)/i.test(question.trim()) &&
      !PARTIES.some(p => new RegExp(`\\b${p.name}\\b`, 'i').test(question))) {
    const previous = [...(input.context ?? [])].reverse().find(t => t.author !== 'answer' && typeof t.text === 'string')
    if (previous?.text) scope = cohort(previous.text)
  }
  if (!scope) return { input }
  return { input: { ...input, party: scope.party, kind: input.kind === 'speech' ? 'speech' : (scope.kind ?? input.kind) }, scope }
}
