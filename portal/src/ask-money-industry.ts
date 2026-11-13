import {personUrl} from '../public/party-page.js'
import type {RecordQuestion} from './ask-records'
import {federalPartyRankingIntent} from './ask-money-family'
import {isReceiptGraph, mentionedReceiptIndustries, receiptAnswer, receiptDonorChoices, receiptGraphForQuestion, unmatchedReceiptRankingScope} from './voice-money'
import {calculatedMoneyAnswer,rankedMoneyAnswer,readingChoices,withReading} from './ask-money'
import {trimQuestionEnd, questionSpaces} from './question-text.mjs'
import {splitPeriod} from './receipt-reading'

/** Financial recipient questions must resolve before topic retrieval or cached prose. */
export function industryMoneyIntent(question:string):{subject:string;recipient?:string;total:boolean;period:string}|null {
 let q=trimQuestionEnd(questionSpaces(question.normalize('NFKC')))
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
 m=/^who (?:takes?|receives?|gets?) (?:the )?(?:most )?(.+) money$/i.exec(q)
 if(m)return {subject:m[1],total:false,period}
 const prefix=/^how much (?:has|have|did) /i.exec(q)
 if(prefix){
  const rest=q.slice(prefix[0].length)
  const received=/ (?:received|receive|got|get|taken|take) (?:(?:money|donations?|funding) )?from /i.exec(rest)
  if(received&&received.index>0&&received.index+received[0].length<rest.length)return {subject:rest.slice(received.index+received[0].length),recipient:rest.slice(0,received.index),total:true,period}
  const given=/ (?:donated|donate|given|give) to /i.exec(rest)
  if(given&&given.index>0&&given.index+given[0].length<rest.length)return {subject:rest.slice(0,given.index),recipient:rest.slice(given.index+given[0].length),total:true,period}
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
 // A period phrase inside the name or recipient is the question's period.
 const subjectSplit=splitPeriod(named_intent.subject),recipientSplit=named_intent.recipient?splitPeriod(named_intent.recipient):undefined
 const intent={...named_intent,subject:subjectSplit.text,recipient:recipientSplit?.text||named_intent.recipient,
  period:[subjectSplit.period,recipientSplit?.period,named_intent.period].filter(Boolean).join(' ')}
 const gap=(answer:string,answer_status='needs_scope')=>({answer,answer_status,money_ranking:true,citations:{},sources:[]})
 if(input.speaker||input.chamber||input.topic||input.kind&&!['all','receipt','speech'].includes(input.kind))return gap('Choose receipt records and clear the speaker, chamber and topic filters to calculate this ranking.')
 const selection=await receiptGraphForQuestion(input.question??'',async file=>{
  const response=await assets.fetch(new Request('https://opax.com.au'+file))
  if(!response.ok)return null
  const graph=await response.json() as Record<string,unknown>
  return isReceiptGraph(graph)?graph:null
 },input.state).catch(()=>null)
 if(!selection)return gap('The money records are unavailable right now; [see the money map](/money).','evidence_gap')
 const {graph,file,jurisdiction}=selection
 const industries=[...new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry).filter((s):s is string=>!!s))]
 const subject=intent.subject.replace(/\bunion\b/gi,'unions')
 const selected=mentionedReceiptIndustries(subject,industries)
 const named=selected.length?[]:receiptDonorChoices(graph,subject)
 let recipient=intent.recipient?federalPartyRankingIntent('Who funds '+intent.recipient+'?')?.parties[0]:undefined
 let member:{name:string;href:string}|undefined
 if(intent.recipient&&!recipient&&jurisdiction==='federal'){
  const roster=await assets.fetch(new Request('https://opax.com.au/parliamentarians.json')).then(r=>r.ok?r.json():null).catch(()=>null) as {people?:{name:string;party_now?:string;current?:boolean;states?:string[]}[]}|null
  const person=roster?.people?.find(p=>p.current&&p.states?.includes('federal')&&p.name.toLocaleLowerCase('en-AU')===intent.recipient!.trim().toLocaleLowerCase('en-AU'))
  if(person&&personUrl(person.name)!=='/subject/person'){
   recipient=federalPartyRankingIntent('Who funds '+person.party_now+'?')?.parties[0]
   if(recipient)member={name:person.name,href:'/declared?'+new URLSearchParams({person:person.name})}
  }
 }
 if(intent.recipient&&!recipient)return gap('AEC returns record this money at party level. Choose a recipient party in the [money map](/money) to see its labelled totals.')
 const scoped={...input,...(recipient?{party:recipient}:{}),...(intent.period?{from:undefined,to:undefined}:{})}
 const bankOnly=/^(?:the\s+)?banks?(?:ing)?$/i.test(subject)
 if(!bankOnly&&selected.length!==1&&!named.length)return gap(`OPAX groups money-map sources into ${industries.length} industries. Choose [gambling](/money?industry=gambling), [mining](/money?industry=mining), [property](/money?industry=property) or another grouping in the [money map](/money), or name an organisation to total its records.`)
 const cleaned=subject.replace(/\b(?:companies|company|lobby|lobbies|donors?)\b/gi,' ').replace(/\s+/g,' ').trim()
 const query=`Who receives the most disclosed receipts from ${bankOnly?'finance':cleaned}${recipient?' to '+recipient:''}${intent.period?' '+intent.period:''}?`
 const result=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au',scoped)
 if(!result||'needs_scope' in result)return await rankedMoneyAnswer({...scoped,question:query,kind:'all'},assets)??gap(result?.answer??'Choose a named source or industry in the [money map](/money).')
 const unmatched=unmatchedReceiptRankingScope(graph,result.read_query,result,scoped.party)
 if(unmatched)return gap(`Choose a published source, industry or party for **${safe(unmatched)}** in the [money map](/money) so the calculation covers the whole question.`)
 // The period read from the question is stated, and the other readings offered.
 const answer=calculatedMoneyAnswer(result,graph,query,file,scoped,{total:intent.total,bankGrouping:bankOnly,member})
 return withReading(answer,[result.period_reading,bankOnly?undefined:result.scope_reading],readingChoices(result,result.period_options)(recipient?'donors':'parties'),input.question??'')
}
