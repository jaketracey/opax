export type IdentityField = 'party' | 'chamber' | 'electorate' | 'service' | 'current'
export interface IdentityRequest { subject: string; fields: IdentityField[] }

// Repair identity vocabulary only. Person-name resolution belongs to find_people.
const vocabulary: Record<string, string> = {
  prty: 'party', paety: 'party', pary: 'party', praty: 'party', paty: 'party',
  sttae: 'state', staet: 'state', frderal: 'federal', seator: 'senator', senaror: 'senator',
  whivh: 'which', repreaent: 'represent', reprsent: 'represent', belomg: 'belong',
  meber: 'member', membrr: 'member', fisrt: 'first', stsrt: 'start',
  reprseenting: 'representing', representng: 'representing', yars: 'years',
  recodr: 'record', hlding: 'holding',
}
const normalise = (question: string) => question.replace(/[’‘]/g, "'")
  .replace(/\b[\p{L}]+\b/gu, word => vocabulary[word.toLowerCase()] ?? word)
  .replace(/\b(party|electorate|seat|chamber)'s\b/gi, '$1 is').replace(/\s+/g, ' ').trim()
const honour = /^(?:(?:the\s+)?(?:hon(?:ourable)?|right\s+hon(?:ourable)?|senator|mp|mr|mrs|ms|miss|dr|professor|sir|dame)\.?\s+)+/i
function subjectName(raw: string): string | undefined {
  const subject = raw.trim().replace(honour, '').trim()
  if (!subject || subject.length > 100 || !/^[\p{L}][\p{L}\p{M}.' -]*$/u.test(subject)) return
  if (/\b(?:and|or|versus|vs|party|parliament|house|senate|electorate|seat|state|territory|politicians?|members?|government|record|which|what|when|who|why|how|is|was|does|did|has|have|the|a|an)\b/i.test(subject)) return
  if (/^(?:he|she|they|his|her|their|it|this|that|someone|anyone|everyone)$/i.test(subject)) return
  return subject
}

// These ask for evidence of conduct or policy, even when an identity field is
// also present. Such mixed requests must retain their ordinary research path.
const mixedRequest = /\b(?:say|said|says|saying|speak|speaks|spoke|spoken|speech(?:es)?|vote[ds]?|voting|division|polic(?:y|ies)|positions?|stances?|views?|support(?:s|ed)?|oppos(?:e[ds]?|ing|ition)|favour(?:s|ed)?|favor(?:s|ed)?|propos(?:e[ds]?|als?)|believ(?:e[ds]?|ing)|think|thought|argu(?:e[ds]?|ing)|debates?|donat\w*|receipts?|expenses?|salary|paid|pay|funding|funded|money|compare|comparison|versus|predict)\b/i
const partyChoice = '(?:Labor|ALP|Liberal|Coalition|Greens|Nationals?|LNP|Independent|One Nation|a political party)'
const capture = (subject: string, fields: IdentityField[]): IdentityRequest | undefined => {
  const name = subjectName(subject)
  return name ? { subject: name, fields } : undefined
}

function clauseRequest(clause: string): IdentityRequest | undefined {
  const q = clause.replace(/^[,;\s]+|[?!.,;\s]+$/g, '').replace(/^(?:and\s+)?(?:please\s+)?/i, '')
  let m: RegExpExecArray | null
  // A compact pair of identity fields is one lookup, not a comparison.
  if ((m = /^(?:what|which)\s+(party|chamber|electorate|seat)\s+and\s+(party|chamber|electorate|seat)\s+(?:is|was|does|did)\s+(.+?)\s+(?:in|with|represent|hold)$/i.exec(q))) {
    const field = (word: string): IdentityField => word.toLowerCase() === 'seat' ? 'electorate' : word.toLowerCase() as IdentityField
    return capture(m[3], [field(m[1]), field(m[2])])
  }
  if ((m = /^(?:what|which)\s+(?:political\s+)?party(?:\s+affiliation)?\s+(?:is|was|does|did)\s+(.+?)\s+(?:(?:currently|now)\s+)?(?:a\s+member\s+of|affiliated\s+with|in|with|from|belong(?:s|ed)?\s+to|represent(?:s|ed)?(?:\s+in\s+(?:the\s+)?parliament)?)$/i.exec(q)) ||
      (m = /^(?:what|which)\s+(?:is|was)\s+(.+?)'s\s+(?:current\s+)?(?:political\s+)?party(?:\s+affiliation)?$/i.exec(q)) ||
      (m = /^(.+?)(?:'s)?\s+(?:political\s+)?party(?:\s+affiliation)?$/i.exec(q))) return capture(m[1], ['party'])
  if ((m = new RegExp(`^(?:is|was)\\s+(.+?)\\s+(?:a\\s+|an\\s+|in\\s+(?:the\\s+)?)?${partyChoice}(?:\\s+(?:member|person|politician))?(?:\\s+or\\s+(?:a\\s+|an\\s+)?(?:${partyChoice}|something else)(?:\\s+(?:member|person|politician))?)*$`, 'i').exec(q))) return capture(m[1], ['party'])
  if ((m = /^(?:which|what)\s+(?:house(?:\s+of\s+(?:federal\s+)?parliament)?|(?:parliamentary\s+)?chamber)\s+(?:does|did|is|was)\s+(.+?)\s+(?:sit\s+in|serve\s+in|in|a\s+member\s+of)$/i.exec(q)) ||
      (m = /^(?:is|was)\s+(.+?)\s+(?:in\s+(?:the\s+)?(?:senate|lower\s+house|upper\s+house|house\s+of\s+representatives)(?:\s+or\s+(?:the\s+)?(?:senate|lower\s+house|upper\s+house|house\s+of\s+representatives))?|a\s+senator(?:\s+or\s+a\s+member\s+of\s+the\s+house\s+of\s+representatives)?)$/i.exec(q)) ||
      (m = /^(.+?)\s+(?:house\s+or\s+senate|senate\s+or\s+house|chamber)$/i.exec(q))) return capture(m[1], ['chamber'])
  if ((m = /^(?:which|what)\s+(?:(?:federal|state)\s+)?(?:electorate|seat|state(?:\s+or\s+territory)?|territory|constituency)\s+(?:does|did|is|was|has|have)\s+(?:the\s+record\s+show\s+)?(.+?)\s+(?:represent(?:ed|s)?(?:\s+in\s+(?:the\s+)?[\p{L} .'-]+)?|hold|held|holding(?:\s+in\s+(?:the\s+)?[\p{L} .'-]+)?|a\s+senator\s+for|the\s+(?:mp|member)\s+for|in(?:\s+state\s+parliament)?|from)$/iu.exec(q)) ||
      (m = /^(.+?)\s+(?:electorate|seat|senator\s+state)$/i.exec(q)) ||
      (m = /^(.+?)\s+is\s+a\s+senator\s+for\s+(?:which|what)\s+state$/i.exec(q))) return capture(m[1], ['electorate'])
  if ((m = /^(?:in\s+what\s+year|when|between\s+which\s+years|what\s+years|how\s+long)\s+(?:did|does|was|were|has|have|is)\s+(.+?)\s+(?:(?:first\s+)?(?:get\s+)?elected(?:\s+as\s+(?:the\s+)?member\s+for\s+.+)?|(?:first\s+)?win\s+.+|(?:start|stop)\s+representing\s+.+|(?:serve|served)(?:\s+as\s+(?:the\s+)?member\s+for\s+.+|\s+in\s+(?:the\s+)?parliament)?|represent\s+.+|(?:leave|left)\s+(?:the\s+)?(?:seat\s+of\s+.+|senate|parliament)|become\s+a\s+senator|enter\s+the\s+senate|the\s+mp\s+for\s+.+)$/i.exec(q)) ||
      (m = /^(.+?)\s+(?:elected\s+.+\s+when|left\s+.+\s+when|senator\s+since)$/i.exec(q))) return capture(m[1], ['service'])
  if ((m = /^(?:is|was)\s+(.+?)\s+(?:(?:still|currently)\s+(?:in\s+(?:the\s+)?parliament|serving(?:\s+in\s+(?:the\s+)?parliament)?|an?\s+(?:mp|senator|member\s+of\s+parliament))|a\s+current\s+member\s+of\s+parliament)$/i.exec(q)) ||
      (m = /^does\s+(.+?)\s+still\s+serve(?:\s+in\s+(?:the\s+)?parliament)?$/i.exec(q)) ||
      (m = /^has\s+(.+?)\s+left\s+(?:the\s+)?parliament$/i.exec(q))) return capture(m[1], ['current'])
}

/** Identity requests are roster facts, not evidence of a policy position. */
export function identityRequest(question: string): IdentityRequest | undefined {
  if (typeof question !== 'string' || question.length > 4000) return
  let q = normalise(question)
  if (!q) return
  // Source requests and scene-setting sentences do not change the identity
  // question. A dot inside initials is never treated as a sentence boundary.
  q = q.replace(/\s+(?:Please\s+(?:cite\s+(?:the\s+)?source|say\s+which\s+record\s+you\s+used|give\s+(?:a\s+)?citation|include\s+(?:a\s+)?(?:source|citation))\b|If\s+the\s+record\b)[\s\S]*$/i, '')
    .replace(/^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:tell\s+me|check|find\s+out|let\s+me\s+know)\s+/i, '')
    .replace(/(\?)\s*(?:ignore|disregard|forget|system\s*:)[\s\S]*$/i, '$1')
  const start = /(?:^|[.!?:]\s+)(?=(?:which|what|when|how\s+long|in\s+what|between\s+which|is|was|does|did|has)\b)/i.exec(q)
  if (start && start.index > 0) {
    const prefix = q.slice(0, start.index)
    if (mixedRequest.test(prefix) && /\b(?:explain|describe|summari[sz]e|compare|what|which|how|why|show|tell)\b/i.test(prefix)) return
    q = q.slice(start.index + start[0].length)
  }
  if (mixedRequest.test(q)) return
  // A dated identity question remains an identity question. The answer layer
  // decides whether its roster actually supplies the requested historical fact.
  q = q.replace(/\s+(?:(?:in|during|as\s+(?:at|of)|on|before|after|since|until)\s+(?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?|(?:between|from)\s+(?:19|20)\d{2}\s+(?:and|to|until|through|[–-])\s+(?:19|20)\d{2})(?:\s*[?!.]*)$/i, '')
    .replace(/\s+(?:now|currently|today)\s*[?!.]*$/i, '')
  const direct = clauseRequest(q)
  if (direct) return { ...direct, fields: [...new Set(direct.fields)] }
  const clauses = q.split(/\s*,?\s+and\s+(?=(?:what|which|when|how|is|was|does|did|has)\b)|\?\s+(?=(?:what|which|when|how|is|was|does|did|has)\b)/i)
  if (clauses.length < 2 || clauses.length > 5) return
  const requests = clauses.map(clauseRequest)
  const first = requests[0]
  if (!first || requests.some(request => !request || request.subject.toLowerCase() !== first.subject.toLowerCase())) return
  return { subject: first.subject, fields: [...new Set(requests.flatMap(request => request!.fields))] }
}
export const isIdentityQuestion = (question: string): boolean => !!identityRequest(question)
