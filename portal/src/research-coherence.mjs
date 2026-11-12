import {sentenceParts,auditPayload} from './research-claim-audit.mjs'
import {answerStyleChecks} from './research-answer-style.mjs'
import {rankingRepairQuestion,repairSlotsMatch} from './research-ranking-repair.mjs'
import {sourceMetadata,rankingScopeMatches} from './research-ranking-scope.mjs'
// Shared, deterministic checks; evidence remains data and the claim audit remains authoritative.
export const danglingOpener = /^(?:[-*•]\s*|\d+[.)]\s*)?(?:other\b|also\b|in addition\b|further(?:more)?\b|however\b|meanwhile\b|additionally\b|moreover\b|and\b|another\b|the runners-up\b)/i
const folded = s => String(s??'').toLowerCase().replace(/[–—]/g,'-').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
/** Typed decisions and legacy status codes; prose wording grants no permission. */
export function answerDecision(payload) {
  if(payload?.answered===false)return 'refusal'
  const status={coverage_only:'limitation',evidence_gap:'limitation',needs_question:'clarification',needs_scope:'clarification',needs_period:'clarification',clarification:'clarification',declined:'refusal',refused:'refusal',moderated:'refusal',blocked:'refusal'}[payload?.answer_status]
  if(status)return status
  if(['checked_points_with_limit','combined_count_limit','specific_limitation'].includes(payload?.coherence?.method))return 'limitation'
  return ['answer','limitation','clarification','refusal','preserve'].includes(payload?.answer_decision)?payload.answer_decision:undefined
}
/** A question asserting that money bought or moved something: the hard line that stays a decline. */
const CAUSAL_ASK=/\b(?:buy|bought|bribe\w*|because|influenc\w*|caus(?:e|ed|ing)|sw[ae]y\w*)\b|\bchang\w* (?:how|what|the way|whether)\b|\bin return\b|\bin exchange for\b|\bpaid for (?:access|votes?|influence)\b/i
export const CAUSAL = /\b(?:bought|bribe\w*|in exchange for|because of (?:the|these|their) donations?|donations? (?:caused|influenced|explain\w*)|paid for (?:access|votes?|influence))\b|\b(?:donat\w*|money|funding)\b.*\b(?:influenc\w*|caus\w*|led (?:[^.!?;]*? )?to|resulted in|secured)\b/i
/** An explicit claim that money moved something: declined outright. Questions about votes and positions are a matter of shape, not of this list. */
export const causalAsk=question=>CAUSAL_ASK.test(question)
// What receipts cannot answer: anything about a vote, a position or why, and a yes/no question that is not about giving or receiving.
const POSITION_ASK=/\b(?:why|explain\w*|vot(?:e|es|ed|ing)|positions?|stances?|oppos\w*|reforms?|polic(?:y|ies)|favou?rs?)\b/i
const YES_NO_ASK=/^\s*(?:do|does|did|is|are|was|were|has|have|had|can|could|will|would|should)\b/i
const RECEIPT_ASK=/\b(?:how much|money|funds?|funded|funding|receiv\w*|tak(?:e|es|en)|took|g[ai]ve|gives|given|donat\w*|disclos\w*|receipts?)\b/i
export const receiptsCannotAnswer=question=>POSITION_ASK.test(question)||YES_NO_ASK.test(question)&&!RECEIPT_ASK.test(question)
const DONOR_RANKING=/\b(?:who|which (?:\w+ )?(?:company|companies|corporation|person|individual|donors?|organisation|organization))\b.*\b(?:most|largest|biggest)\b|\b(?:top|largest|biggest|leading) (?:\w+ )?donors?\b/i
export const donorRankingAsked=question=>DONOR_RANKING.test(question)
export function protectedDecision(payload) {const decision=answerDecision(payload);return !!decision&&decision!=='answer'}
function donorRows(question,sources=[],requireRanking=true,constraints={}) {
  sources=Array.isArray(sources)?sources.filter(s=>s&&typeof s==='object'):[]
  if((requireRanking&&!DONOR_RANKING.test(question))||!/donor|donat|giv|gave|funding|take.*money|money.*from|disclos|receipts?/i.test(question)||/\bwhich Smith\b/i.test(question)||causalAsk(question))return []
  const rows=sources.flatMap(source=>{const r=source.receipt;return r?[{name:r.source,party:r.party,amount:'$'+r.amount.toLocaleString('en-AU'),value:r.amount,period:r.period,filter:r.filter,aggregate:r.aggregate,...(r.associated?{associated:r.associated}:{}),source}]:[]})
  for(const row of rows)row.entity_type=sourceMetadata(row.source).entity_type??'donor'
  const scoped=rows.filter(r=>rankingScopeMatches(question,r,constraints))
  return scoped.filter((r,i)=>scoped.findIndex(x=>x.name===r.name&&x.party===r.party&&x.value===r.value)===i).sort((a,b)=>b.value-a.value)
}
export function donorRanking(question,sources=[],constraints={}){return donorRows(question,sources,true,constraints)}
export function repairDonorRanking(question,sources=[],constraints={}){const form=rankingRepairQuestion(question,constraints);return form?donorRows(question,sources,true,constraints).filter(row=>repairSlotsMatch(form,question,row,constraints)):[]}
/** Parse only selected donor/recipient relationships, also for an explicit amount lookup. */
export function selectedDonorFacts(question,sources=[],constraints={}){return donorRows(question,sources,false,constraints)}
function citesDraftClaim(payload,text,resource) {
  const answer=String(payload.answer??''),at=answer.indexOf(text);if(at<0)return false
  const from=Array.from(answer.slice(0,at)).length,until=from+Array.from(text).length
  return Object.entries(payload.citations??{}).some(([id,ranges])=>(id===resource||id.startsWith(resource+'/'))&&Array.isArray(ranges)&&ranges.some(([a,b])=>a<until&&b>from))
}
/** Proof comes from the original draft, never from the presence of spare facts. */
export function canReconstructRanking(payload,question) {
  if(protectedDecision(payload))return false
  const sources=(payload.sources??[]).filter(s=>s.cited&&!/^USER_CONTEXT_/i.test(s.resource)),audit=auditPayload(question,payload)
  const rejected=audit.findings.filter(c=>c.type==='figure')
  const rows=repairDonorRanking(question,sources,payload.answer_scope)
  return rejected.some(c=>c.unit?.startsWith('AUD')&&rows.some(row=>Number(c.value)===row.value&&citesDraftClaim(payload,c.text,row.source.resource)))
}
export function coherenceCheck(question,payload,{direct=answerStyleChecks(question,String(payload.answer??''),{sources:payload.sources??[],ranking_rows:donorRanking(question,payload.sources??[],payload.answer_scope)}).direct_first_sentence==='pass'}={}) {
  const text=String(payload.answer??''),first=sentenceParts(text)[0]?.text.trim().split('\n')[0]??'',chars=Array.from(text)
  const orphan=[]
  for(const [id,ranges]of Object.entries(payload.citations??{})){if(!Array.isArray(ranges)){orphan.push(id);continue}for(const range of ranges)if(!citationHasSentence(text,range))orphan.push(id)}
  const protectedAnswer=protectedDecision(payload)
  if(protectedAnswer)direct=true
  const ranking=protectedAnswer?[]:donorRanking(question,payload.sources,payload.answer_scope),top=ranking[0]
  const citedFirst=Object.values(payload.citations??{}).flat().some(([a,b])=>a< Array.from(first).length&&b>0)
  const rankingLead=!top||folded(first).includes(folded(top.name))&&first.includes(top.amount)&&!!top.period&&folded(first).includes(folded(top.period))&&citedFirst
  const stripped=Number(payload.coherence?.stripped_ratio??0),fallback=payload.coherence?.fallback===true
  const fragment=ranking.length>0&&text.split(/\n+/).some(p=>/^\s*(?:[-*•]\s*)?(?:[A-Z]\.){1,4}\s*$/.test(p)||/^\s*and\s/i.test(p))
  const reasons=[...(fragment?['incomplete donor sentence']:[]),...(!direct?['first sentence does not answer']:[]),...(!rankingLead?['missing selected ranking leader, amount, period or citation']:[]),...(orphan.length?['orphan citation']:[]),...(danglingOpener.test(first)?['dangling opener']:[]),...(/^\s*\[\d+\]\s*$/m.test(text)?['orphan citation marker']:[]),...(stripped>1/3&&!fallback&&!protectedAnswer?['over one third stripped without coherent fallback']:[])]
  return {pass:!reasons.length,reasons,orphan,rankingLead}
}

export function citationHasSentence(text,range) {
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))return false
  const [a,b]=range,chars=Array.from(text)
  if(a<0||b<=a||b>chars.length)return false
  return sentenceParts(text).some(p=>{const start=Array.from(text.slice(0,p.at)).length,end=start+Array.from(p.text).length;return a<end&&b>start&&/[\p{L}]/u.test(p.text.replace(/\[\d+\]/g,''))})
}
