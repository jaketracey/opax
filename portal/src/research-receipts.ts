import {FEDERAL_RECEIPTS_NOTE,neutralReceiptSentence,receiptSource,unsafeReceiptWording} from './receipt-language.mjs'
import {rewriteAnswerPayload} from './research-language'
import {sentenceParts} from './research-claim-audit.mjs'
import {protectedDecision} from './research-coherence.mjs'

export function receiptWordingFindings(payload:Record<string,unknown>):string[] {
 const sources=(Array.isArray(payload.sources)?payload.sources:[]) as {resource:string;kind:string;snippet:string;cited?:boolean}[]
 const receipts=sources.filter(s=>s.cited&&receiptSource(s))
 const answer=String(payload.answer??'')
 return sentenceParts(answer).filter(part=>{
  const start=Array.from(answer.slice(0,part.at)).length,end=start+Array.from(part.text).length
  return unsafeReceiptWording(part.text)&&Object.entries(payload.citations??{}).some(([id,ranges])=>receipts.some(s=>id===s.resource||id.startsWith(s.resource+'/'))&&Array.isArray(ranges)&&ranges.some(([a,b]:number[])=>a<end&&b>start))
 }).map(part=>part.text)
}

/** Migrate old answers at the JSON/SSE/cache boundary without changing their figures. */
export function withReceiptWording<T extends Record<string,unknown>>(payload:T,question:string):T {
 const sources=(Array.isArray(payload.sources)?payload.sources:[]) as {resource:string;kind:string;snippet:string;cited?:boolean}[]
 const receipts=sources.filter(s=>s.cited&&receiptSource(s))
 if(!receipts.length)return payload
 let out=rewriteAnswerPayload(payload,replace=>{
  for(const part of sentenceParts(String(payload.answer??''))){
   const ranges=Object.entries(payload.citations??{}).filter(([id])=>receipts.some(s=>id===s.resource||id.startsWith(s.resource+'/'))).flatMap(([,v])=>Array.isArray(v)?v:[]) as number[][]
   const start=Array.from(String(payload.answer??'').slice(0,part.at)).length
   // Only a sentence citing receipt evidence grants permission to edit it.
   if(!ranges.some(([a,b])=>a<start+Array.from(part.text).length&&b>start))continue
   const text=neutralReceiptSentence(part.text)
   if(text!==part.text)replace(new RegExp(part.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),text)
  }
 })
 const federal=receipts.some(s=>/federal|\bAEC\b/i.test(s.snippet))
 const ranking=/\b(?:most|largest|biggest|top)\b|^who funds\b/i.test(question)
 if(federal&&ranking&&!protectedDecision(out)&&/\$[\d,.]+/.test(String(out.answer??''))&&!String(out.answer??'').includes(FEDERAL_RECEIPTS_NOTE)){
  out=rewriteAnswerPayload(out,replace=>replace(/^[^\n]+/g,line=>line+' '+FEDERAL_RECEIPTS_NOTE))
 }
 // A provider's unrecognised positive gift claim is never released as a receipt claim.
 // Known legacy forms above are repaired; new drafts are rejected by the writer.
 const current=(Array.isArray(out.sources)?out.sources:[]) as typeof sources
 // Keep historical evidence available to the verifier while migrating its display copy.
 const migrated=current.map(s=>receiptSource(s)?{...s,receipt_original_snippet:(s as typeof s&{receipt_original_snippet?:string}).receipt_original_snippet??s.snippet,snippet:String(s.snippet??'').split('\n').map(neutralReceiptSentence).join('\n')}:s)
 if(migrated.some((s,i)=>s.snippet!==current[i].snippet))out={...out,sources:migrated}
 return out
}
