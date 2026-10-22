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
 const ranking=/provided the most|received the most|largest disclosed|led the selected ranking/i.test(text)
 const matches=row=>{
   const line=text.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).find(s=>fold(s).includes(fold(row.donor)))
   return !!line&&amounts(line).some(a=>Math.abs(a.v-row.total_aud)<0.51)
 }
 const figures=turn.novel_from_previous?(turn.eligible_rows??[]).some(row=>matches(row)&&!fold(options.previousAnswer??'').includes(fold(row.donor))):turn.rows.every(matches)
 const decline=turn.decision==='decline'?refusal&&!ranking:turn.decision==='clarify'?/please.*(?:name|specify|which|clarify)|which.*(?:Smith|person)|ambiguous/i.test(text)&&!ranking:turn.decision==='limited_or_years'?!ranking:!refusal
 const q={question:turn.standalone,expected:{kind:['decline','clarify'].includes(turn.decision)?'decline':'answer'},must:[]}
 const grade=gradeRow(q,payload,options)
 return {pass:context&&figures&&decline&&grade.axes.citations!=='fail',context:context?'pass':'fail',owners_figures:figures?'pass':'fail',citations:grade.axes.citations,declines:decline?'pass':'fail',effective_question:effective,grade}
}
