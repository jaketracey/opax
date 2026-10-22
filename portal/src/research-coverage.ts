import {rankingRepairQuestion} from './research-ranking-repair.mjs'
import {answerDecision} from './research-coherence.mjs'
/** A known coverage boundary is the explanation; unknown endpoints add nothing. */
export function donationCoverageLimit(question: string, text: string): string | undefined {
  const scope=rankingRepairQuestion(question)
  if(!scope||scope.jurisdiction!=='federal')return
  const range = /Federal AEC donation returns, financial years ((?:19|20)\d{2}[–-]\d{2})/i.exec(text)
  const year = /\bin ((?:19|20)\d{2})[?.!]*$/i.exec(question)?.[1]
  if (!range || !year || Number(year) >= Number(range[1].slice(0,4))) return
  const ask = question.trim().replace(/[?.!]+$/, '').replace(/^./, c => c.toLowerCase())
  return `OPAX's federal donation records start in ${range[1]}, so they can't show ${ask}.`
}

export function plainCoverageRefusal<T extends Record<string, unknown>>(payload: T, question: string): T {
  if(['refusal','clarification'].includes(answerDecision(payload)??''))return payload
  if (!/The requested period|unknown start|unknown end|OPAX's federal donation records start/i.test(String(payload.answer ?? ''))) return payload
  const sources = (Array.isArray(payload.sources) ? payload.sources : []) as Record<string, unknown>[]
  const source = sources.find(s => s.cited === true && !/^USER_CONTEXT_/i.test(String(s.resource)) && donationCoverageLimit(question, String(s.snippet ?? '')))
  const answer = source && donationCoverageLimit(question, String(source.snippet ?? ''))
  if (!source || !answer) return payload
  const request = sources.find(s => s.cited === true && !/^USER_CONTEXT_/i.test(String(s.resource)) && /^The requested period/i.test(String(s.snippet ?? '')))
  const support = new Set([source, ...(request ? [request] : [])])
  return { ...payload, answer, answer_decision: 'limitation', citations: Object.fromEntries([...support].map(s => [String(s.resource) + '/t/body/0', [[0, Array.from(answer).length]]])), sources: sources.map(s => ({ ...s, cited: support.has(s) })) }
}
