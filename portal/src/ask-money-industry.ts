import {personUrl} from '../public/party-page.js'
import type {RecordQuestion} from './ask-records'
import {federalPartyRankingIntent} from './ask-money-family'
import {asideDonorNames, isReceiptGraph, mentionedReceiptIndustries, receiptAnswer, receiptDonorChoices, receiptGraphForQuestion, unmatchedReceiptRankingScope} from './voice-money'
import {calculatedMoneyAnswer,donorTotalMoneyAnswer,rankedMoneyAnswer,readingChoices,withReading} from './ask-money'
import {trimQuestionEnd, questionSpaces, shortTrailingMarks} from './question-text.mjs'
import {splitPeriod} from './receipt-reading'
import {financialYear} from './receipt-period'
import {foldDonorName} from '../public/donor-entity.js'

/** Financial recipient questions must resolve before topic retrieval or cached prose. */
export function industryMoneyIntent(question:string):{subject:string;recipient?:string;total:boolean;period:string}|null {
 let q=trimQuestionEnd(questionSpaces(shortTrailingMarks(question).normalize('NFKC')))
 if(/\b(?:say|said|talk\w*|speak\w*|spoke|speeches?|votes?|voted|mentions?|why|influence|grants?|contracts?)\b/i.test(q))return null
 const suffix=/ ((?:in|during|for|since|from|before|after|until|through|between) (?:(?:FY|financial years?) ?)?(?:19|20)\d{2}.*)$/i.exec(q)
 const period=suffix?.[1]??''
 if(suffix)q=q.slice(0,suffix.index)
 const sourceRanking=/^which (?:banks?|finance companies) (?:give|gives|gave|donate|donates) (?:the )?most (?:money )?to (.+)$/i.exec(q)
 if(sourceRanking)return {subject:'banks',recipient:sourceRanking[1],total:false,period}
 let m=/^(?:who|which (?:political )?part(?:y|ies)) (?:takes?|receives?|received|gets?|got) (?:the )?(?:most )?(?:(?:money|donations?|funding|receipts?) )?from (.+)$/i.exec(q)
 if(m){
  const monetary=/\b(?:money|donations?|funding|receipts?)\b/i.test(q),known=mentionedReceiptIndustries(m[1])
  if(!monetary&&(!known.length&&!/^(?:the )?banks?(?:ing)?$/i.test(m[1])||known.includes('media')&&!/\b(?:industry|sector|lobby)\b/i.test(m[1])))return null
  return {subject:m[1],total:false,period}
 }
 // Everyday wording ("who has received", "who took", "which MPs accepted", "money from X to Y") routes only when the
 // source is a money-map grouping or the money is named as donations, so government funding keeps its own route.
 const everyday=(source:string)=>{
  const known=mentionedReceiptIndustries(source)
  if(known.includes('media')&&!/\b(?:industry|sector|lobby|companies)\b/i.test(source))return false
  return known.length>0||/^(?:the )?(?:big )?banks?(?:ing)?$/i.test(source)||/\b(?:donations?|donors?|receipts?)\b/i.test(q)
 }
 m=/^(?:who|which (?:political )?part(?:y|ies)|which (?:mps|members(?: of parliament)?|politicians|parliamentarians|senators))(?: (?:has|have|had))? (?:takes?|took|taken|receives?|received|gets?|got|gotten|accepts?|accepted) (?:the )?(?:most )?(?:(?:money|donations?|funding|receipts?|cash) )?from (.+)$/i.exec(q)
 if(m&&/\b(?:money|donations?|funding|receipts?|cash)\b/i.test(q)&&everyday(m[1]))return {subject:m[1],total:false,period}
 m=/^(?:(?:the )?(?:money|donations?|funding) )from (.+?)(?: (?:to|for|going to|given to|received by) (.+))?$/i.exec(q)
 if(m&&everyday(m[1])){
  const recipient=m[2]&&!/^(?:the )?(?:(?:political |major )?part(?:y|ies)|politicians|mps|parliament(?:arians)?|members(?: of parliament)?)$/i.test(m[2])?m[2]:undefined
  return {subject:m[1],...(recipient?{recipient}:{}),total:!!recipient,period}
 }
 m=/^who (?:takes?|receives?|gets?) (?:the )?(?:most )?(.+) money$/i.exec(q)
 if(m)return {subject:m[1],total:false,period}
 const prefix=/^how much (?:money |in donations )?(?:has|have|did|does|do) /i.exec(q)
 if(prefix){
  const rest=q.slice(prefix[0].length)
  const received=/ (?:received|receive|got|get|gets|taken|take|takes|accepted|accept) (?:(?:money|donations?|funding) )?from /i.exec(rest)
  if(received&&received.index>0&&received.index+received[0].length<rest.length)return {subject:rest.slice(received.index+received[0].length),recipient:rest.slice(0,received.index),total:true,period}
  const given=/ (?:donated|donate|given|give)(?: to (.+))?$/i.exec(rest)
  if(given&&given.index>0){
   const recipient=given[1]
   const allParties=!recipient||/^(?:(?:all|the|any) )?(?:political )?part(?:y|ies)$/i.test(recipient)
   return {subject:rest.slice(0,given.index),...(allParties?{}:{recipient}),total:true,period}
  }
 }
 const to=/ donations to /i.exec(q)?.index??-1
 if(to>0&&to+14<q.length)return {subject:q.slice(0,to),recipient:q.slice(to+14),total:true,period}
 return / donations$/i.test(q)&&q.length>10?{subject:q.slice(0,-10),total:false,period}:null
}

const safe=(s:string)=>s.replace(/[|\n\r\[\]*<>]/g,' ').trim()
export async function industryMoneyAnswer(input:RecordQuestion,assets:Fetcher) {
 const named_intent=industryMoneyIntent(input.question??'')
 if(!named_intent)return null
 // A change over time is a year comparison, answered by the ranking route.
 if(/\b(?:change[sd]?|changing|increase[sd]?|decrease[sd]?|grew|growth|rose|fell)\b/i.test(input.question??''))return null
 const gap=(answer:string,answer_status='needs_scope')=>({answer,answer_status,money_ranking:true,citations:{},sources:[]})
 if(input.speaker||input.chamber||input.topic||input.kind&&!['all','receipt','speech'].includes(input.kind))return gap('Choose receipt records and clear the speaker, chamber and topic filters to calculate this ranking.')
 const selection=await receiptGraphForQuestion(input.question??'',async file=>{
  const response=await assets.fetch(new Request('https://opax.com.au'+file))
  if(!response.ok)return null
  const graph=await response.json() as Record<string,unknown>
  return isReceiptGraph(graph)?graph:null
 },input.state).catch(()=>null)
 // From here, a question this route cannot calculate steps aside (null) so the Ask agent and its money
 // tools answer it. The only reply without figures is the calculator's own reading of the question's names.
 if(!selection)return null
 const {graph,file,jurisdiction}=selection
 // The question is read with each donor name in this map held aside, so digits or a
 // period word inside a disclosed name ("Comscrv (No. 2092) Pty Ltd - Loan") are never its period.
 const own=asideDonorNames(graph,input.question??'')
 const read=own.text===(input.question??'')?named_intent:industryMoneyIntent(own.text)??named_intent
 // A period phrase inside the name or recipient is the question's period.
 const subjectSplit=splitPeriod(read.subject),recipientSplit=read.recipient?splitPeriod(read.recipient):undefined
 const recipientText=recipientSplit?.text||read.recipient
 const intent={...read,subject:own.restore(subjectSplit.text),recipient:recipientText&&own.restore(recipientText),
  period:own.restore([subjectSplit.period,recipientSplit?.period,read.period].filter(Boolean).join(' '))}
 const industries=[...new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry).filter((s):s is string=>!!s))]
 const exact=graph.nodes.filter(n=>n.kind==='donor'&&[n.label,...n.aliases??[],...n.lookup_names??[]].some(name=>foldDonorName(name)===foldDonorName(intent.subject)))
 const subject=exact.length?intent.subject:intent.subject.replace(/\bunion\b/gi,'unions')
 const selected=exact.length?[]:mentionedReceiptIndustries(subject,industries)
 const named=exact.length?exact:selected.length?[]:receiptDonorChoices(graph,subject)
 let recipient=intent.recipient?graph.nodes.find(n=>n.kind==='party'&&[n.label,...n.aliases??[]].some(name=>name.toLocaleLowerCase('en-AU')===intent.recipient!.replace(/^the /i,'').toLocaleLowerCase('en-AU')))?.label
  ??federalPartyRankingIntent('Who funds '+intent.recipient+'?')?.parties[0]:undefined
 let member:{name:string;href:string}|undefined
 if(intent.recipient&&!recipient&&jurisdiction==='federal'){
  const roster=await assets.fetch(new Request('https://opax.com.au/parliamentarians.json')).then(r=>r.ok?r.json():null).catch(()=>null) as {people?:{name:string;party_now?:string;current?:boolean;states?:string[]}[]}|null
  const person=roster?.people?.find(p=>p.current&&p.states?.includes('federal')&&p.name.toLocaleLowerCase('en-AU')===intent.recipient!.trim().toLocaleLowerCase('en-AU'))
  if(person&&personUrl(person.name)!=='/subject/person'){
   recipient=federalPartyRankingIntent('Who funds '+person.party_now+'?')?.parties[0]
   if(recipient)member={name:person.name,href:'/declared?'+new URLSearchParams({person:person.name})}
  }
 }
 if(intent.recipient&&!recipient)return null
 const scoped={...input,...(recipient?{party:recipient}:{}),...(intent.period?{from:undefined,to:undefined}:{})}
 const bankOnly=/^(?:the\s+)?banks?(?:ing)?$/i.test(subject)
 if(!bankOnly&&selected.length!==1&&!named.length)return null
 const cleaned=intent.total&&named.length===1?named[0].label:subject.replace(/\b(?:companies|company|lobby|lobbies|donors?)\b/gi,' ').replace(/\s+/g,' ').trim()
 const query=`Who receives the most disclosed receipts from ${bankOnly?'finance':cleaned}${recipient?' to '+recipient:''}${intent.period?' '+intent.period:''}?`
 let result=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au',scoped)
 // A lending question, an ambiguous donor name or a party this map lacks is the calculator's answer for these names.
 if(!result||'needs_scope' in result)return await rankedMoneyAnswer({...scoped,question:query,kind:'all'},assets)??(result?gap(result.answer):null)
 const donorTotal=intent.total&&result.selected_donors.length===1&&!result.selected_industries.length
 // Donation questions use the donor page's typed receipt selection, restricted
 // to Donation Received. Other Receipt (including loans) never becomes giving.
 if(donorTotal&&result.typed){
  const donations=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au',{...scoped,measure:'donations'})
  if(donations&&!('needs_scope' in donations))result=donations
 }
 const unmatched=unmatchedReceiptRankingScope(graph,result.read_query,result,scoped.party)
 if(unmatched)return null
 // The period read from the question is stated, and the other readings offered.
 const answer=donorTotal?donorTotalMoneyAnswer(result,graph):calculatedMoneyAnswer(result,graph,query,file,scoped,{total:intent.total,bankGrouping:bankOnly,member})
 const {from,to}=result.requested_years
 const partyPeriod=intent.period||(from!==null&&to!==null?from===to?`in ${financialYear(from)}`:`from ${financialYear(from)} to ${financialYear(to)}`:from!==null?`since ${financialYear(from)}`:to!==null?`through ${financialYear(to)}`:'')
 const partyChoices=donorTotal&&!recipient?result.by_party.map(p=>({label:p.name,question:`How much has ${result.selected_donors[0]} donated to ${p.name}${partyPeriod?' '+partyPeriod:''}?` })):[]
 const nameReading=donorTotal&&named.length===1&&cleaned!==subject?`Reading “${safe(subject)}” as ${safe(cleaned)}.`:undefined
 return withReading(answer,[nameReading,result.period_reading,bankOnly?undefined:result.scope_reading],[...partyChoices,...readingChoices(result,result.period_options)(recipient?'donors':'parties')],input.question??'')
}
