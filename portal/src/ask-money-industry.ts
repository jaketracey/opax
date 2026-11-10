import type {RecordQuestion} from './ask-records'
import {federalPartyRankingIntent} from './ask-money-family'
import {isReceiptGraph, mentionedReceiptIndustries, receiptAnswer, receiptDonorChoices, unmatchedReceiptRankingScope} from './voice-money'
import {receiptPeriodQuery} from './receipt-period'

/** Financial recipient questions must resolve before topic retrieval or cached prose. */
export function industryMoneyIntent(question:string):{subject:string;recipient?:string;total:boolean;period:string}|null {
 let q=question.normalize('NFKC').trim().replace(/[?!.]+$/,'')
 if(/\b(?:say|said|talk\w*|speak\w*|spoke|speeches?|votes?|voted|mentions?|why|influence|grants?|contracts?)\b/i.test(q))return null
 const suffix=/\s+((?:in|during|for|since|from|before|after|until|through|between)\s+(?:(?:FY|financial years?)\s*)?(?:19|20)\d{2}.*)$/i.exec(q)
 const period=suffix?.[1]??''
 if(suffix)q=q.slice(0,suffix.index)
 let m=/^(?:who|which (?:political )?part(?:y|ies))\s+(?:takes?|receives?|received|gets?|got)\s+(?:the\s+)?(?:most\s+)?(?:money|donations?|funding|receipts?)\s+from\s+(.+)$/i.exec(q)
 if(m)return {subject:m[1],total:false,period}
 m=/^who\s+(?:takes?|receives?|gets?)\s+(?:the\s+)?(?:most\s+)?(.+?)\s+money$/i.exec(q)
 if(m)return {subject:m[1],total:false,period}
 m=/^how much\s+(?:has|have|did)\s+(.+?)\s+(?:received|receive|got|get|taken|take)\s+(?:(?:money|donations?|funding)\s+)?from\s+(.+)$/i.exec(q)
 if(m)return {subject:m[2],recipient:m[1],total:true,period}
 m=/^how much\s+(?:has|have|did)\s+(.+?)\s+(?:donated|donate|given|give)\s+to\s+(.+)$/i.exec(q)
 if(m)return {subject:m[1],recipient:m[2],total:true,period}
 m=/^(.+?)\s+donations(?:\s+to\s+(.+))?$/i.exec(q)
 return m?{subject:m[1],recipient:m[2],total:!!m[2],period}:null
}

const aud=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n)
const safe=(s:string)=>s.replace(/[|\n\r\[\]*<>]/g,' ').trim()
const limits='AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs.'

export async function industryMoneyAnswer(input:RecordQuestion,assets:Fetcher) {
 const intent=industryMoneyIntent(input.question??'')
 if(!intent)return null
 const gap=(answer:string,answer_status='needs_scope')=>({answer,answer_status,money_ranking:true,citations:{},sources:[]})
 if(input.state&&input.state!=='federal')return gap('This industry calculation uses federal AEC records. Please choose federal records or name a donor in the relevant state disclosure records.')
 if(input.speaker||input.chamber||input.topic||input.kind&&!['all','receipt','speech'].includes(input.kind))return gap('This is a disclosed-receipt question. Clear the speaker, chamber, topic or other record filters to calculate it.')
 const period=receiptPeriodQuery(input.question??'')
 if(period.error)return gap(period.error,'needs_period')
 const response=await assets.fetch(new Request('https://opax.com.au/graph/money.json'))
 if(!response.ok)return gap('OPAX cannot load the published AEC receipt records, so it cannot calculate this industry total.','evidence_gap')
 const graph=await response.json() as Record<string,unknown>
 if(!isReceiptGraph(graph))return gap('OPAX cannot validate the published AEC receipt records, so it cannot calculate this industry total.','evidence_gap')
 // Read the taxonomy from donor nodes. Banks have no separate industry label.
 const industries=[...new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry).filter((s):s is string=>!!s))]
 const subject=intent.subject.replace(/\bunion\b/gi,'unions')
 const selected=mentionedReceiptIndustries(subject,industries)
 if(!selected.length&&receiptDonorChoices(graph,subject).length)return null
 const recipient=intent.recipient?federalPartyRankingIntent('Who funds '+intent.recipient+'?')?.parties[0]:undefined
 if(intent.recipient&&!recipient)return gap('OPAX cannot establish personal payments to an MP from these party receipt records. Please name a recipient party, or a named donor whose disclosed records you want to inspect.')
 const scoped={...input,...(recipient?{party:recipient}:{}),...(intent.period?{from:undefined,to:undefined}:{})}
 const bankOnly=/^(?:the\s+)?banks?(?:ing)?$/i.test(subject)
 if(bankOnly){
  // Offer named sources from the existing broader label, never a banks-only sum.
  const names=graph.nodes.filter(n=>n.kind==='donor'&&n.industry==='finance'&&/\bbank(?:ing)?\b/i.test(n.label)).slice(0,5)
  let answer='OPAX cannot establish a banks-only donation total from its published industry labels. Its finance grouping includes organisations beyond banks. The closest available records are disclosed receipts from these named sources in that broader grouping.'
  const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean}[]=[],citations:Record<string,number[][]>={}
  for(const donor of names){
   const query=`Who receives the most disclosed receipts from ${donor.label}${recipient?' to '+recipient:''}${intent.period?' '+intent.period:''}?`
   const result=receiptAnswer(graph,query,'federal','https://opax.com.au',scoped)
   if(!result||'needs_scope' in result||'needs_period' in result||!result.receipts)continue
   answer+=`\n\n${safe(donor.label)}${recipient?' to '+recipient:''}: ${aud(result.total_aud)} in disclosed receipts, financial years ${result.period}.`
   const resource='industry-named-'+sources.length,url=result.sources[0].url
   citations[resource]=[[Array.from(answer).length-1,Array.from(answer).length]]
   sources.push({resource,title:`${donor.label}: selected disclosed receipts`,href:url,url,kind:'receipt',snippet:`${donor.label}${recipient?' to '+recipient:''}: ${aud(result.total_aud)}, financial years ${result.period}.`,cited:true})
  }
  answer+='\n\n'+limits
  return {...gap(answer,'evidence_gap'),sources,citations}
 }
 if(selected.length!==1)return gap(`OPAX cannot total donations for that industry from its published donor labels. Please name a donor to see what it disclosed, or choose an existing grouping in the [money map](/money). No speech or topic counts have been substituted.`,'evidence_gap')
 // Only question grammar is removed. Unknown qualifiers must survive validation.
 const cleaned=subject.replace(/\b(?:companies|company|lobby|lobbies|donors?|industry|sector)\b/gi,' ').replace(/\s+/g,' ').trim()
 const query=`Who receives the most disclosed receipts from ${cleaned}${recipient?' to '+recipient:''}${intent.period?' '+intent.period:''}?`
 const result=receiptAnswer(graph,query,'federal','https://opax.com.au',scoped)
 if(!result||'needs_scope' in result||'needs_period' in result)return gap(result?.answer??'OPAX cannot calculate that industry selection. Please name a donor or an existing industry label.')
 const unmatched=unmatchedReceiptRankingScope(graph,receiptPeriodQuery(query).query,result,scoped.party)
 if(unmatched)return gap(`OPAX could not match the whole industry or recipient scope (${safe(unmatched)}), so it has not calculated a total. Please name a donor or use a published industry label.`)
 if(!result.receipts)return gap('No matching disclosed receipts are shown for that industry and period in the published selection. This does not establish that no receipts occurred.','evidence_gap')
 // Complete selected edges determine the ranking. Never rank a retrieved sample.
 const rows=result.by_party.slice(0,5),sector=safe(selected[0].replaceAll('_',' '))
 const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean}[]=[],citations:Record<string,number[][]>={}
 let answer=''
 for(const [index,row] of rows.entries()){
  const text=index===0?`${safe(row.name)} received ${intent.total?aud(row.total_aud)+' in disclosed receipts':'the most disclosed receipts'} from donors OPAX groups under ${sector} in this published selection${intent.total?'':': '+aud(row.total_aud)}, across financial years ${result.period}.`
   :`${safe(row.name)} received ${aud(row.total_aud)} in disclosed receipts from the same selected donors over those financial years.`
  const start=Array.from(answer).length
  answer+=(answer?'\n\n':'')+text
  const resource='industry-receipts-'+index,url=new URL(result.sources[0].url)
  url.searchParams.set('party',row.id)
  citations[resource]=[[start,Array.from(answer).length]]
  sources.push({resource,title:`${row.name}: ${aud(row.total_aud)} in selected disclosed receipts`,href:url.href,url:url.href,kind:'receipt',snippet:`${row.name}: ${aud(row.total_aud)} in AEC-disclosed receipts from donors OPAX groups under ${sector}. Financial years: ${result.period}. ${row.receipts} receipt records.`,cited:true})
 }
 answer+='\n\nThese federal totals mix donations with other receipts such as loans, so this is not a donation ranking. '+limits+' Amounts are in Australian dollars and are not adjusted for inflation.'
 return {answer,answer_status:'calculated',money_ranking:true,citations,sources,coverage:result.period_coverage,money_question:query,scope:{state:'federal'}}
}
