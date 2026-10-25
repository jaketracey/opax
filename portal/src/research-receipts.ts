import {FEDERAL_RECEIPTS_NOTE,federalReceiptFact,neutralReceiptSentence,receiptGrammarFindings,receiptSource,receiptSourceNames,receiptDirectionMistakes,unsafeReceiptWording} from './receipt-language.mjs'
import {rewriteAnswerPayload} from './research-language'
import {sentenceParts} from './research-claim-audit.mjs'
import {protectedDecision} from './research-coherence.mjs'

type Source={resource:string;kind:string;snippet:string;cited?:boolean;receipt_original_snippet?:string}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const sourcesOf=(payload:Record<string,unknown>)=>(Array.isArray(payload.sources)?payload.sources:[]) as Source[]
const matches=(id:string,s:Source)=>id===s.resource||id.startsWith(s.resource+'/')

/** An uncited extra claim cannot evade the guard. Claims citing only another
 * evidence class (for example a grant) retain that class's vocabulary. */
function receiptParts(payload:Record<string,unknown>) {
 const sources=sourcesOf(payload),receipts=sources.filter(receiptSource),answer=String(payload.answer??'')
 if(!receipts.length)return []
 return sentenceParts(answer).filter(part=>{
  const start=Array.from(answer.slice(0,part.at)).length,end=start+Array.from(part.text).length
  const ids=Object.entries(payload.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(([a,b]:number[])=>a<end&&b>start)).map(([id])=>id)
  if(!ids.length&&/\b(?:debate|speech|passage)s?\b/i.test(part.text)&&sources.some(s=>s.kind==='speech'))return false
  if(!ids.length||ids.some(id=>receipts.some(s=>matches(id,s))))return true
  const bound=sources.filter(s=>ids.some(id=>matches(id,s)))
  return !bound.length||bound.some(s=>!['speech','bill','pay','grant','contract'].includes(s.kind))
 })
}
export function receiptWordingFindings(payload:Record<string,unknown>):string[] {
 return receiptParts(payload).filter(part=>unsafeReceiptWording(part.text,receiptSourceNames(sourcesOf(payload)))).map(part=>part.text)
}

const amountPattern=/\$[\d,]+(?:\.\d+)?(?:[ \u00a0]*(?:million|billion|thousand|bn|[mkb])\b)?/gi
const value=(s:string)=>Number(s.replace(/[^\d.]/g,''))*(/billion|bn|b$/i.test(s)?1e9:/million|m$/i.test(s)?1e6:/thousand|k$/i.test(s)?1e3:1)
function safeSentence(text:string,sources:Source[]):string {
 const names=receiptSourceNames(sources)
 for(const name of receiptDirectionMistakes(text,names)){
  const m=new RegExp('^'+escape(name)+' received the most disclosed (?:funding|receipts)(.*)$','i').exec(text)
  if(m)return `${name} was the source of the largest disclosed receipts${m[1]}`
 }
 const continuation=/^and (.+?) at (\$[\d,]+(?:\.\d+)?)\.$/.exec(text)
 if(continuation)return `${continuation[1]} was the source of disclosed receipts of ${continuation[2]}.`
 if(receiptGrammarFindings(text).length){const repaired=neutralReceiptSentence(text).replace(/,{2,}/g,',');return receiptGrammarFindings(repaired).length?'':repaired}
 if(!unsafeReceiptWording(text,names))return text
 if(/^\|/.test(text.trim()))return ''
 const neutral=neutralReceiptSentence(text)
 if(neutral&&!unsafeReceiptWording(neutral))return neutral
 // For unfamiliar grammar use the cited fact's direction, preserving the draft's
 // complete amount literal only when it matches that fact. Otherwise drop it.
 const amounts=text.match(amountPattern)??[]
 if(amounts.length!==1)return ''
 for(const source of sources)for(const line of (source.receipt_original_snippet??source.snippet??'').split('\n')){
  const fact=federalReceiptFact(line)
  if(fact&&text.includes(fact.name)&&value(amounts[0])===value(fact.amount))return `${fact.party} disclosed ${amounts[0]} in receipts from ${fact.name}${fact.period?' (financial years '+fact.period+')':''}.`
 }
 return ''
}

/** Enforce at the JSON/SSE/fallback/cache boundary, before any answer is released. */
export function withReceiptWording<T extends Record<string,unknown>>(payload:T,question:string):T {
 const receipts=sourcesOf(payload).filter(receiptSource)
 if(!receipts.length)return payload
 let out=rewriteAnswerPayload(payload,replace=>{
  for(const part of receiptParts(payload)){
   const text=safeSentence(part.text,receipts)
   if(text!==part.text)replace(new RegExp(escape(part.text),'g'),text)
  }
 })
 // Fail closed even if a new template or a malformed cached sentence slips through.
 const findings=receiptWordingFindings(out)
 if(findings.length)out=rewriteAnswerPayload(out,replace=>{
  for(const text of findings)replace(new RegExp(escape(text),'g'),'')
 })
 if(!String(out.answer??'').trim()||String(out.answer)==='The available records do not establish an answer to this question.'){
  out={...out,answer:'The cited records contain unclassified receipts. '+FEDERAL_RECEIPTS_NOTE,citations:{},sources:[],answer_status:'coverage_only'}
 }
 const federal=receipts.some(s=>/federal|\bAEC\b/i.test(s.snippet))
 const repaired=receiptWordingFindings(payload).length>0||receiptParts(payload).some(part=>receiptGrammarFindings(part.text).length)
 const ranking=/\b(?:most|largest|biggest|top)\b|^who funds\b/i.test(question)
 if(federal&&(repaired||ranking&&!protectedDecision(out)&&/\$/.test(String(out.answer??'')))&&!String(out.answer??'').includes(FEDERAL_RECEIPTS_NOTE)){
  out=rewriteAnswerPayload(out,replace=>replace(/^[^\n]+/g,line=>line+' '+FEDERAL_RECEIPTS_NOTE))
 }
 out=rewriteAnswerPayload(out,replace=>{replace(/,{2,}/g,',');replace(/\n(?:[ \t]*\n){2,}/g,'\n\n');replace(/^\s+|\s+$/g,'')})
 const current=sourcesOf(out)
 const migrated=current.map(s=>receiptSource(s)?{...s,receipt_original_snippet:s.receipt_original_snippet??s.snippet,snippet:String(s.snippet??'').split('\n').map(neutralReceiptSentence).filter(Boolean).join('\n')}:s)
 if(migrated.some((s,i)=>s.snippet!==current[i].snippet))out={...out,sources:migrated}
 return out
}
