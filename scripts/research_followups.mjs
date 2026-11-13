// Match sendChat() in portal/public/app.js: resolved user questions, 12 turns,
// minimal source metadata, and up to six public resource ids from the last two answers.
import {gradeRow,amounts,REFUSAL,fold} from './research_eval_grade.mjs'
import {protectedDecision} from '../portal/src/research-coherence.mjs'
export function clientConversationRequest(thread) {
 const context=thread.map(m=>({author:m.role==='answer'?'answer':'user',text:m.role==='user'?(m.fundingQuestion??m.askedAs??m.text):m.text,...(m.role==='answer'?{sources:(m.sources??[]).map(s=>Object.fromEntries(['slug','kind','source','state','chamber'].filter(k=>s[k]).map(k=>[k,s[k]])))}:{})})).slice(-12)
 const ids=[]
 for(const m of thread.filter(m=>m.role==='answer').slice(-2).reverse())for(const s of [...(m.sources??[]).filter(s=>s.cited),...(m.sources??[]).filter(s=>!s.cited)])if(/^[a-f0-9]{32}$/i.test(s.resource??'')&&!ids.includes(s.resource))ids.push(s.resource)
 return {kind:'all',context,prior_resources:ids.slice(0,6)}
}
export function recordConversationTurn(thread,question,payload) {
 thread.push({role:'user',text:question,...(payload?.money_ranking&&typeof payload.money_question==='string'?{fundingQuestion:payload.money_question}:{}),...(typeof payload?.asked_as==='string'&&payload.asked_as.trim()!==question?{askedAs:payload.asked_as.trim()}: {})})
 thread.push({role:'answer',text:String(payload?.answer??'').trim()||'(no answer)',sources:payload?.sources??[]})
}
export function gradeFollowUp(turn,payload,options={}) {
 const effective=payload?.asked_as??turn.question,text=String(payload?.answer??'')
 const context=turn.context_all.every(x=>new RegExp(x,'i').test(effective))&&(!turn.period||effective.includes(String(turn.period)))&&!(turn.context_not??[]).some(x=>new RegExp(x,'i').test(effective))
 const refusal=protectedDecision(payload)||REFUSAL.test(text)
 const ranking=/provided the most|gave the most|received the most|largest disclosed|led the selected ranking/i.test(text)
 const matches=row=>{
   const line=text.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).find(s=>fold(s).includes(fold(row.donor)))
   // An AEC associated entity is ranked like any donor but must be named with the register's line.
   const tagged=!row.associated_entity||/associated entity of/i.test(line??'')
   return !!line&&tagged&&amounts(line).some(a=>Math.abs(a.v-row.total_aud)<0.51)
 }
 const figures=turn.novel_from_previous?(turn.eligible_rows??[]).some(row=>matches(row)&&!fold(options.previousAnswer??'').includes(fold(row.donor))):turn.rows.every(matches)
 // A source the gold lists beside the ranking (other receipts, A34) is never its leader and never called a
 // donation or a loan: if the answer names it, it says the receipt type and the amount.
 const sentences=text.split(/\n|(?<=[.!?])\s+(?=[A-Z])/),lead=sentences[0]??''
 const asides=(turn.other_receipts??[]).every(o=>{
   if(!o.in_ranking&&fold(lead).includes(fold(o.donor))&&ranking)return false
   const line=sentences.find(s=>fold(s).includes(fold(o.donor))&&/other receipts|subscriptions|no type/i.test(s))
   if(!line)return !!turn.rows.length
   const total=o.other_receipts_aud+o.subscriptions_aud+o.untyped_aud
   return amounts(line).some(a=>Math.abs(a.v-total)<0.51||Math.abs(a.v-o.other_receipts_aud)<0.51)&&!/\b(?:donated|is a loan|was a loan|loaned|lent)\b/i.test(line)
 })
 const decline=turn.decision==='decline'?refusal&&!ranking:turn.decision==='clarify'?/please.*(?:name|specify|which|clarify)|which.*(?:Smith|person)|ambiguous/i.test(text)&&!ranking:turn.decision==='limited_or_years'?!ranking:!refusal
 const q={question:turn.standalone,expected:{kind:['decline','clarify'].includes(turn.decision)?'decline':'answer'},must:[]}
 const grade=gradeRow(q,payload,options)
 return {pass:context&&figures&&asides&&decline&&grade.axes.citations!=='fail',context:context?'pass':'fail',owners_figures:figures?'pass':'fail',asides:asides?'pass':'fail',citations:grade.axes.citations,declines:decline?'pass':'fail',effective_question:effective,grade}
}
