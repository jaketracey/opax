import {wordsInOrder} from './question-text.mjs'
import {sentenceParts} from './research-claim-audit.mjs'
import {answerStyleChecks} from './research-answer-style.mjs'
import {rankingRepairQuestion,repairSlotsMatch} from './research-ranking-repair.mjs'
import {sourceMetadata,rankingScopeMatches} from './research-ranking-scope.mjs'
// Shared, deterministic helpers; evidence remains data and the claim audit is diagnostic.
export const danglingOpener = /^(?:[-*•]\s*|\d+[.)]\s*)?(?:other\b|also\b|in addition\b|further(?:more)?\b|however\b|meanwhile\b|additionally\b|moreover\b|and\b|another\b|the runners?-up\b)/i
const folded = s => String(s??'').toLowerCase().replace(/[–—]/g,'-').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
/** Typed decisions and legacy status codes; prose wording grants no permission. */
export function answerDecision(payload) {
  if(payload?.answered===false)return 'refusal'
  const status={coverage_only:'limitation',evidence_gap:'limitation',needs_question:'clarification',needs_scope:'clarification',needs_period:'clarification',clarification:'clarification',declined:'refusal',refused:'refusal',moderated:'refusal',blocked:'refusal'}[payload?.answer_status]
  if(status)return status
  if(['checked_points_with_limit','combined_count_limit','specific_limitation'].includes(payload?.coherence?.method))return 'limitation'
  return ['answer','limitation','clarification','refusal','preserve'].includes(payload?.answer_decision)?payload.answer_decision:undefined
}
const DONOR_RANKING=/\b(?:who|which (?:\w+ )?(?:company|companies|corporation|person|individual|donors?|organisation|organization))\b.*\b(?:most|largest|biggest)\b|\b(?:top|largest|biggest|leading) (?:\w+ )?donors?\b/i
export const donorRankingAsked=question=>DONOR_RANKING.test(question)
export function protectedDecision(payload) {const decision=answerDecision(payload);return !!decision&&decision!=='answer'}
function donorRows(question,sources=[],requireRanking=true,constraints={}) {
  sources=Array.isArray(sources)?sources.filter(s=>s&&typeof s==='object'):[]
  if((requireRanking&&!DONOR_RANKING.test(question))||!(/donor|donat|giv|gave|funding|disclos|receipts?/i.test(question)||wordsInOrder(question,'take','money')||wordsInOrder(question,'money','from'))||/\bwhich Smith\b/i.test(question))return []
  const rows=sources.flatMap(source=>{const r=source.receipt;return r?[{name:r.source,party:r.party,amount:'$'+r.amount.toLocaleString('en-AU'),value:r.amount,period:r.period,filter:r.filter,aggregate:r.aggregate,...(r.associated?{associated:r.associated}:{}),source}]:[]})
  for(const row of rows)row.entity_type=sourceMetadata(row.source).entity_type??'donor'
  const scoped=rows.filter(r=>rankingScopeMatches(question,r,constraints))
  return scoped.filter((r,i)=>scoped.findIndex(x=>x.name===r.name&&x.party===r.party&&x.value===r.value)===i).sort((a,b)=>b.value-a.value)
}
export function donorRanking(question,sources=[],constraints={}){return donorRows(question,sources,true,constraints)}
export function repairDonorRanking(question,sources=[],constraints={}){const form=rankingRepairQuestion(question,constraints);return form?donorRows(question,sources,true,constraints).filter(row=>repairSlotsMatch(form,question,row,constraints)):[]}
/** Parse only selected donor/recipient relationships, also for an explicit amount lookup. */
export function selectedDonorFacts(question,sources=[],constraints={}){return donorRows(question,sources,false,constraints)}
/** Eval grading only (scripts/research_eval_grade.mjs): it scores an answer and never changes one. */
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
