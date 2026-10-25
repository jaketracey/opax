import {FEDERAL_RECEIPTS_NOTE,federalReceiptSource,receiptFacts,receiptAmounts,hasReceiptFigure,receiptSentenceCheck,type ReceiptSource} from './receipt-language.mjs'
import {rewriteAnswerPayload} from './research-language'
import {sentenceParts} from './research-claim-audit.mjs'

type Source=ReceiptSource&{resource:string;cited?:boolean}
const sourcesOf=(payload:Record<string,unknown>)=>(Array.isArray(payload.sources)?payload.sources:[]) as Source[]
const matches=(id:string,s:Source)=>id===s.resource||id.startsWith(s.resource+'/')
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')

/** Scope is local to the sentence's citation. An unused source does not grant
 * jurisdiction, a recipient or permission to edit a non-financial sentence. */
export function receiptSentenceFindings(payload:Record<string,unknown>) {
 const sources=sourcesOf(payload),answer=String(payload.answer??'')
 return sentenceParts(answer).flatMap(part=>{
  const amounts=receiptAmounts(part.text)
  if(!hasReceiptFigure(part.text)&&!/[0-9]/.test(part.text.normalize('NFKC')))return []
  const start=Array.from(answer.slice(0,part.at)).length,end=start+Array.from(part.text).length
  const ids=Object.entries(payload.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(range=>Array.isArray(range)&&range.length===2&&range[0]<end&&range[1]>start)).map(([id])=>id)
  const bound=sources.filter(s=>ids.some(id=>matches(id,s)))
  if(bound.length){const check=receiptSentenceCheck(part.text,bound);return check.scoped?[{...part,start,end,allowed:check.allowed}]:[]}
  // A matching, uncited receipt figure is in scope but never authorised by an
  // uncited fact. In particular, equal figures cannot cross party boundaries.
  const bare=(part.text.normalize('NFKC').match(/\b\d[\d,]*(?:\.\d+)?\b/g)??[]).map(n=>Number(n.replaceAll(',','')))
  const stated=sources.filter(federalReceiptSource).some(s=>receiptFacts(s).some(f=>receiptAmounts(f.amount).some(b=>amounts.some(a=>a.value===b.value)||bare.includes(b.value))||hasReceiptFigure(part.text)&&!amounts.length&&[f.name,f.party,f.owner].some(name=>name&&part.text.includes(name))))
  return stated?[{...part,start,end,allowed:false}]:[]
 })
}
export function receiptWordingFindings(payload:Record<string,unknown>):string[]{return receiptSentenceFindings(payload).filter(p=>!p.allowed).map(p=>p.text)}

/** Drop-only. This function never searches other facts to replace model text,
 * changes the relation, changes a party, or migrates a source's prose. */
export function withReceiptWording<T extends Record<string,unknown>>(payload:T,_question:string,originalFinancial?:Set<string>):T {
 // Only the backend calculator emits this complete contract. Model/writer
 // payloads cannot supply its table, controls, scope and calculation sources.
 if(payload.money_ranking===true&&payload.answer_status==='calculated'&&payload.money_facts&&typeof payload.money_context==='string'&&payload.scope&&sourcesOf(payload).every(s=>s.kind==='receipt'&&/^receipt-(?:ranking|comparison|years)-\d+$/.test(s.resource)))return payload
 const parts=receiptSentenceFindings(payload),drop=parts.filter(p=>!p.allowed||originalFinancial&&!originalFinancial.has(p.text))
 if(!drop.length)return payload
 const out=rewriteAnswerPayload(payload,replace=>{
  for(const part of drop)replace(new RegExp(escape(part.text),'g'),'')
  replace(/^[\t ]*[-*][\t ]*(?:\n|$)/gm,'')
  replace(/\n(?:[ \t]*\n){2,}/g,'\n\n');replace(/^\s+|\s+$/g,'')
 })
 if(!String(out.answer??'').trim()||String(out.answer)==='The available records do not establish an answer to this question.')return {...out,answer:'The cited federal receipt figures do not establish that answer. '+FEDERAL_RECEIPTS_NOTE,citations:{},sources:sourcesOf(out).map(s=>({...s,cited:false})),answer_status:'coverage_only'}
 // A surviving coverage paragraph is not an answer to a ranking question.
 // Preserve it and its anchors, with an explicit figure-free limitation.
 if(/^These disclosed party receipts\b/.test(String(out.answer))&&!hasReceiptFigure(String(out.answer))){
  const limited=rewriteAnswerPayload(out,replace=>replace(/^/g,'The cited federal receipt figures do not establish that answer. '))
  return {...limited,answer_status:'coverage_only'}
 }
 return out
}
