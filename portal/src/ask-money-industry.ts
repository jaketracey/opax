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

const safe=(s:string)=>s.replace(/[|\n\r\[\]*<>]/g,' ').trim()
const limits='AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded. The map cannot establish personal payments to MPs.'

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
 const named=selected.length?[]:receiptDonorChoices(graph,subject)
 // Keep the existing named-source funding route, but never answer an explicit
 // donation question there with an untyped bank or other donor aggregate.
 if(named.length&&!/\bdonat\w*\b/i.test(input.question??''))return null
 const recipient=intent.recipient?federalPartyRankingIntent('Who funds '+intent.recipient+'?')?.parties[0]:undefined
 if(intent.recipient&&!recipient)return gap('OPAX cannot establish personal payments to an MP from these party receipt records. Please name a recipient party, or a named donor whose disclosed records you want to inspect.')
 const scoped={...input,...(recipient?{party:recipient}:{}),...(intent.period?{from:undefined,to:undefined}:{})}
 const bankOnly=/^(?:the\s+)?banks?(?:ing)?$/i.test(subject)
 if(!bankOnly&&selected.length!==1&&!named.length)return gap(`OPAX cannot total donations for that industry from its published donor labels. Please name a donor to see what it disclosed, or choose an existing grouping in the [money map](/money). No speech or topic counts have been substituted.`,'evidence_gap')
 // Only question grammar is removed. Unknown qualifiers must survive validation.
 const cleaned=subject.replace(/\b(?:companies|company|lobby|lobbies|donors?|industry|sector)\b/gi,' ').replace(/\s+/g,' ').trim()
 const query=`Who receives the most disclosed receipts from ${bankOnly?'finance':cleaned}${recipient?' to '+recipient:''}${intent.period?' '+intent.period:''}?`
 const result=receiptAnswer(graph,query,'federal','https://opax.com.au',scoped)
 if(!result||'needs_scope' in result||'needs_period' in result)return gap(result?.answer??'OPAX cannot calculate that industry selection. Please name a donor or an existing industry label.')
 const unmatched=unmatchedReceiptRankingScope(graph,receiptPeriodQuery(query).query,result,scoped.party)
 if(unmatched)return gap(`OPAX could not match the whole industry or recipient scope (${safe(unmatched)}), so it has not calculated a total. Please name a donor or use a published industry label.`)
 // The published edges have neither receipt type nor return side. Annual
 // return references cannot identify which part is a donation. aec-extras
 // splits party-wide receipts, but cannot attribute those types to donors.
 // Use receiptAnswer only to validate scope, period and map links, never its
 // mixed amounts, ranking, answer or source titles as donation evidence.
 const sector=safe((selected[0]??'').replaceAll('_',' '))
 const donationSector=sector==='unions'?'union':sector
 const measure=bankOnly?'bank figures':named.length?'named donor figures':'industry figures'
 const cannot=bankOnly?`establish a banks-only donation total${recipient?' to '+safe(recipient):''}`
  :intent.total?`say how much ${safe(recipient??'the recipient')} received in ${donationSector||'disclosed'} donations`
  :`say who received the most ${donationSector||'disclosed'} donations`
 let answer=`OPAX's ${measure} currently combine donations with loans and other receipts, so it cannot yet ${cannot}.`
 answer+=' The published graph does not identify receipt types or distinguish party returns from donor-side donations made, so no donation amounts or rankings are shown.'
 if(bankOnly)answer+=' Its finance grouping includes organisations beyond banks.'
 if(selected[0]==='unions')answer+=' This graph also cannot separate union affiliation fees from donations.'
 if(result.period)answer+=` Matching mixed receipts span financial years ${result.period}; that is not a donation period total.`
 const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean}[]=[],citations:Record<string,number[][]>={}
 const mapUrl=result.sources[0].url
 citations['industry-receipts-coverage']=[[0,Array.from(answer).length]]
 sources.push({resource:'industry-receipts-coverage',title:`${bankOnly?'Finance':sector||'Named donor'}: mixed receipt records; donation totals unavailable`,href:mapUrl,url:mapUrl,kind:'receipt',snippet:answer,cited:true})
 answer+=`\n\nExplore the [money map filtered to ${bankOnly?'finance':sector||'the named donor'}](${mapUrl}).`
 const names=graph.nodes.filter(n=>n.kind==='donor'&&result.selected_donors.includes(n.label)&&(!bankOnly||/\bbank(?:ing)?\b/i.test(n.label)))
  .sort((a,b)=>a.label.localeCompare(b.label,'en-AU')).slice(0,bankOnly?10:5)
 if(names.length)answer+=` Named sources${sector?' OPAX groups under '+sector:''} to inspect, listed alphabetically without amounts:`
 for(const [index,donor] of names.entries()){
  const url=new URL(mapUrl)
  url.searchParams.set('focus',donor.id)
  const start=Array.from(answer).length,resource='industry-named-'+index
  answer+=`\n\n[${safe(donor.label)}](${url.href})`
  citations[resource]=[[start,Array.from(answer).length]]
  sources.push({resource,title:`${donor.label}: mixed receipt records`,href:url.href,url:url.href,kind:'receipt',snippet:`${donor.label}: named source in the published map selection. Receipt types and donor-side donations cannot be separated; no donation amount established.`,cited:true})
 }
 if(!result.receipts)answer+=' No matching mixed receipts are shown for that selection and period; this does not establish that no donations occurred.'
 answer+='\n\n'+limits
 return {answer,answer_status:'evidence_gap',money_ranking:true,citations,sources,coverage:result.period_coverage,money_question:query,scope:{state:'federal'}}
}
