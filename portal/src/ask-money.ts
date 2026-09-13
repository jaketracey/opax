import type { RecordQuestion } from './ask-records'
import {fundingContinuation, fundingFollowUp, fundingNameChoice, fundingScopeQuestion, fundingUserTurns} from './ask-money-followup'
import {financialYear, receiptPeriodQuery} from './receipt-period'
import {isReceiptGraph, moneyQuestion, receiptAnswer, receiptJurisdiction, unmatchedReceiptRankingScope, type ReceiptGraph} from './voice-money'

const comparisonQuestion = (q:string) => /\b(?:more|less|higher|lower|compare|versus|vs)\b/i.test(q)
const yearComparisonQuestion = (q:string) => /\b(?:change[sd]?|increase[sd]?|decrease[sd]?|grew|growth|rose|fell)\b/i.test(q)
  || /\b(?:19|20)\d{2}\s+(?:or|versus|vs|than|compared\s+(?:with|to))\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(q)
  || (comparisonQuestion(q) && /\bin\s+(?:19|20)\d{2}\s+and\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(q))

/** Rankings use receipt edges, never the model's retrieved sample. */
export function isMoneyRanking(input: RecordQuestion): boolean {
  const q=input.question||''
  if(input.kind && !['all','receipt'].includes(input.kind) || input.speaker || input.chamber || input.topic || input.context?.length) return false
  if(/\b(?:say|said|says|speeches?|stance|position|vot\w*|influence|favours?|why|personal\w*|MPs?|senators?|politicians?|grants?|contracts?|blood|organ|charity|except|excluding|without|percent\w*|share|average|inflation|real terms)\b/i.test(q)) return false
  return (moneyQuestion(q)||/\b(?:takes?|gets?|receives?)\b.*\blobby\b/i.test(q)) && (/\b(?:largest|biggest|most|top)\b/i.test(q)||comparisonQuestion(q)||yearComparisonQuestion(q))
}
const aud=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n)
const plain=(s:string)=>s.replace(/[|\n\r\[\]*]/g,' ')
const disclosureRegister=(jurisdiction:string)=>({federal:'AEC political disclosure records',qld:'Electoral Commission of Queensland disclosure records',vic:'Victorian Electoral Commission disclosure records',tas:'Tasmanian political disclosure records'}[jurisdiction]||'published political disclosure records')
const recordCount=(n:number)=>`${n.toLocaleString('en-AU')} disclosed receipt ${n===1?'record':'records'}`
const sourceCopy=(text:string)=>plain(text).replace(/\s+/g,' ').trim()
type ReceiptTotals = Exclude<ReturnType<typeof receiptAnswer>, null | {needs_period:boolean} | {needs_scope:boolean}>

function moneyContext(result:ReceiptTotals, years?:number[]) {
  const bounds=result.requested_years
  const selected=years?years.map(financialYear).join(' and '):bounds.from===bounds.to&&bounds.from!==null?financialYear(bounds.from)
    :bounds.from!==null||bounds.to!==null?`${bounds.from===null?'earliest records':financialYear(bounds.from)} to ${bounds.to===null?'latest records':financialYear(bounds.to)}`
    :result.period||'No dated records'
  const coverage=!years&&selected!==result.period?` Matching recorded years: ${result.period||'none'}.`:''
  return `**Financial years: ${selected}.**${coverage} ${result.by_donor.length.toLocaleString('en-AU')} ${result.by_donor.length===1?'donor':'donors'} with matching receipts in Opax’s selected map. ${result.jurisdiction==='federal'?'Federal (AEC)':result.jurisdiction.toUpperCase()}. Disclosed party receipts, including more than gifts; amounts in Australian dollars, without inflation adjustment.`
}

/** Compare two individual year cells, never their pooled range or lifetime sum. */
function comparedYearAnswer(result:ReceiptTotals, graph:ReceiptGraph, query:string, file:string, input:RecordQuestion) {
  const clarify=(answer:string,answer_status='needs_period')=>({answer,citations:{},sources:[],answer_status,money_ranking:true})
  const years=[...query.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0])).sort((a,b)=>a-b)
  if(years.length!==2 || years[0]===years[1] || /\b(?:before|after|since|until|through)\b/i.test(query)) {
    return clarify('Choose two individual financial years to compare, for example 2020 and 2021. Each year means the financial year starting in that year.')
  }
  if((input.from&&Number(input.from)!==years[0]) || (input.to&&Number(input.to)!==years[1])) {
    return clarify('The year filters differ from the two years in your question. Clear the filters or choose the same years in both places.')
  }
  if(result.selected_parties.length!==1 || result.selected_industries.length>1 || (!result.selected_industries.length&&result.selected_donors.length>1)) {
    return clarify('Choose one recipient party and, optionally, one donor or industry for the year comparison. For example: “How did gambling receipts to Labor change from 2020 to 2021?”','needs_scope')
  }
  const rows=years.map(year=>{
    const one=receiptAnswer(graph,query,result.jurisdiction,'https://opax.com.au',{...input,from:String(year),to:String(year)})
    return one&&!('needs_scope' in one)&&!('needs_period' in one)?{year,...one}:null
  })
  const [earlier,later]=rows
  if(!earlier||!later||!earlier.receipts||!later.receipts) {
    return clarify('There are not enough matching receipts for both years in this selection. A missing year does not establish that no funding occurred.','evidence_gap')
  }
  const fy=financialYear
  const party=plain(result.selected_parties[0])
  const from=result.selected_industries.length?` from ${plain(result.selected_industries[0].replaceAll('_',' '))} donors`:result.selected_donors.length?` from ${plain(result.selected_donors[0])}`:''
  const difference=Math.round((later.total_aud-earlier.total_aud)*100)/100
  let answer=difference?`**${party} received ${aud(Math.abs(difference))} ${difference>0?'more':'less'}${from} in ${fy(later.year)} than in ${fy(earlier.year)}** in this published selection.`
    :`**${party} has the same disclosed total${from} in ${fy(earlier.year)} and ${fy(later.year)}** in this published selection.`
  const citations:Record<string,number[][]>={}
  const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string}[]=[]
  const cite=(title:string,href:string,snippet:string,offset=0)=>{
    const resource=`receipt-years-${sources.length}`,end=Array.from(answer).length-offset
    citations[resource]=[[end-1,end]];sources.push({resource,title,href,url:href,kind:'receipt',snippet:sourceCopy(snippet),cited:true,source:disclosureRegister(result.jurisdiction),dateLabel:'Calculated by Opax'})
  }
  cite('How the two years were compared','/methods',`${party}: ${fy(earlier.year)} ${aud(earlier.total_aud)}; ${fy(later.year)} ${aud(later.total_aud)}. Change: ${aud(difference)}. ${result.period_note}`)
  const context=moneyContext({...result,by_donor:[...new Map([...earlier.by_donor,...later.by_donor].map(d=>[d.id,d])).values()]},years)
  answer+=`\n\n${context}`
  answer+='\n\n| Financial year | Disclosed receipts | Records |\n| --- | ---: | ---: |'
  for(const row of [earlier,later]) {
    answer+=`\n| ${fy(row.year)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
    const url=new URL(row.sources[0].url)
    cite(`${fy(row.year)}: ${aud(row.total_aud)}`,url.pathname+url.search,`${party}${from}: ${aud(row.total_aud)} across ${recordCount(row.receipts)} in ${fy(row.year)}. Based on ${disclosureRegister(result.jurisdiction)} in this published selection.`,2)
  }
  answer+='\n\nCoverage: **Selected party receipts, not a gifts-only donation total or personal payments.** These totals include only donors in Opax’s published map. Undated receipts and other years are excluded. Election returns may use polling-year dates. An industry grouping does not establish lobbying or influence.'
  answer+=`\n\n[Download the calculation data](https://opax.com.au${file})`
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,money_context:context,scope:{state:result.jurisdiction,party:result.selected_parties[0]}}
}

/** Compare one dimension at a time, over exactly the same dated receipt selection. */
function comparedMoneyAnswer(result:ReceiptTotals, graph:ReceiptGraph, query:string, file:string) {
  const partyComparison=result.selected_parties.length===2 && result.selected_industries.length<=1
  const industryComparison=result.selected_industries.length===2 && result.selected_parties.length<=1
  if(!partyComparison&&!industryComparison)return null
  // This selection cannot answer change over time or comparisons with an
  // unspecified baseline by pooling the two periods into one number.
  if(/\b(?:increase\w*|decrease\w*|growth|change\w*|than (?:before|after|in)|compared (?:with|to) (?:19|20)\d{2})\b/i.test(query))return null
  if(/\b(?:19|20)\d{2}\s+(?:vs|versus)\s+(?:19|20)\d{2}\b/i.test(query) || [...query.matchAll(/\bin\s+(?:19|20)\d{2}\b/gi)].length>1)return null
  const dimension=partyComparison?result.selected_parties:result.selected_industries
  const values=partyComparison?result.by_party:result.by_industry
  const rows=dimension.map(name=>values.find(r=>partyComparison?r.name===name:r.id===name) || {id:name,name:name.replaceAll('_',' '),total_aud:0,receipts:0})
    .map(r=>({...r,name:industryComparison?r.name.charAt(0).toUpperCase()+r.name.slice(1):r.name})).sort((a,b)=>b.total_aud-a.total_aud)
  const [first,second]=rows
  // Absence from a selected export does not establish an actual zero.
  if(rows.some(r=>!r.receipts))return {answer:'There are not enough matching receipts for both sides of that comparison in this selection and period. A missing total does not establish that no funding occurred.',citations:{},sources:[],answer_status:'evidence_gap',money_ranking:true}
  const difference=Math.round((first.total_aud-second.total_aud)*100)/100
  const sector=result.selected_industries.map(i=>i.replaceAll('_',' ')).join(' and ')
  const subject=partyComparison?(sector?` from ${plain(sector)} donors`:result.selected_donors.length?` from ${plain(result.subject)}`:''):(result.selected_parties.length?` to ${plain(result.selected_parties[0])}`:' to parties')
  let answer=difference?`**${plain(first.name)} ${partyComparison?'received':'provided'} ${aud(difference)} more${subject} than ${plain(second.name)}** in this published selection.`:`**${plain(first.name)} and ${plain(second.name)} have the same disclosed total${subject}** in this published selection.`
  const citations:Record<string,number[][]>={}
  const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string}[]=[]
  const cite=(title:string,href:string,snippet:string,offset=0)=>{
    const resource=`receipt-comparison-${sources.length}`
    const end=Array.from(answer).length-offset
    citations[resource]=[[end-1,end]]
    sources.push({resource,title,href,url:href,kind:'receipt',snippet:sourceCopy(snippet),cited:true,source:disclosureRegister(result.jurisdiction),dateLabel:'Calculated by Opax'})
  }
  cite('How the two funding totals were compared','/methods',`${first.name}: ${aud(first.total_aud)}; ${second.name}: ${aud(second.total_aud)}. Difference: ${aud(difference)}. ${result.period_note}`)
  const bounds=result.requested_years
  const context=moneyContext(result)
  answer+=`\n\n${context}`
  answer+=`\n\n| ${partyComparison?'Recipient party':'Donor industry'} | Disclosed receipts | Records |\n| --- | ---: | ---: |`
  for(const row of rows) {
    answer+=`\n| ${plain(row.name)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
    const params=new URLSearchParams(new URL(result.sources[0].url).search)
    if(partyComparison)params.set('party',graph.nodes.find(n=>n.kind==='party'&&n.label===row.name)?.id||row.id)
    else params.set('industry',row.id)
    cite(`${row.name}: ${aud(row.total_aud)}`,'/money?'+params,`${row.name}: ${aud(row.total_aud)} across ${recordCount(row.receipts)}. Period: ${result.period}. Based on ${disclosureRegister(result.jurisdiction)} in this published selection.`,2)
  }
  answer+='\n\nCoverage: These are **party receipts, not personal payments or a gifts-only donation total**. Only donors in Opax’s published map are included, not every donor. Industry labels do not establish lobbying or influence. Both sides use the same year filters; undated records are excluded when filtering by year.'
  answer+=`\n\n[Download the calculation data](https://opax.com.au${file})`
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,money_context:context,scope:{state:result.jurisdiction,...(bounds.from!==null?{from:String(bounds.from)}:{}),...(bounds.to!==null?{to:String(bounds.to)}:{})}}
}

export async function rankedMoneyAnswer(input: RecordQuestion, assets: Fetcher) {
  const direct={...input,context:undefined}
  const standalone=isMoneyRanking(direct)
  if(!standalone && (input.kind&&!['all','receipt'].includes(input.kind) || input.speaker || input.chamber || input.topic || !fundingContinuation(input.question||''))) return null
  const previous=standalone?undefined:fundingUserTurns(input).reverse().find(question=>isMoneyRanking({question}))
  if(!standalone&&!previous)return null
  const jurisdiction=input.state || receiptJurisdiction(standalone?input.question||'':previous!)
  if(!jurisdiction || !['federal','qld','vic','tas'].includes(jurisdiction)) return null
  const file='/graph/'+(jurisdiction==='federal'?'money.json':`money.${jurisdiction}.json`)
  const response=await assets.fetch(new Request('https://opax.com.au'+file))
  if(!response.ok) throw new Error('Receipt data unavailable')
  const graph=await response.json() as Record<string,unknown>
  if(!isReceiptGraph(graph)) throw new Error('Receipt data invalid')
  if(!standalone) {
    const followUp=fundingFollowUp(input,graph,jurisdiction,isMoneyRanking)
    if(!followUp)return null
    if('answer' in followUp)return followUp
    input={...direct,question:followUp.question}
  } else input=direct
  const periodQuery=receiptPeriodQuery(input.question||'')
  if(periodQuery.error)return {answer:periodQuery.error,citations:{},sources:[],answer_status:'needs_period',money_ranking:true}
  const query=periodQuery.query
  const result=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au',{...input,compareYears:yearComparisonQuestion(query)})
  const nameChoice=(fragment:string)=>fundingNameChoice(graph,fragment,jurisdiction,label=>{
    const escaped=fragment.split(/\s+/).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^a-z0-9]+')
    return query.replace(new RegExp('\\b'+escaped+'\\b','i'),()=>label)
  },input)
  const missingScope=()=>({answer:'Please name the donor, industry or recipient party you want to compare. You can [browse the names in the money map](https://opax.com.au/money). I could not match the whole question, so I have not calculated a total.',citations:{},sources:[],answer_status:'needs_scope',money_ranking:true})
  if(!result) return comparisonQuestion(query)||yearComparisonQuestion(query)?null:nameChoice(unmatchedReceiptRankingScope(graph,query,{selected_donors:[],selected_parties:[],selected_industries:[]}))||missingScope()
  if('needs_scope' in result) return ('donor_query' in result&&result.donor_query?nameChoice(result.donor_query):null)||{answer:result.answer,citations:{},sources:[],answer_status:'needs_scope',money_ranking:true}
  if('needs_period' in result) return {answer:result.answer,citations:{},sources:[],answer_status:'needs_period',money_ranking:true}
  const unmatched=unmatchedReceiptRankingScope(graph,query,result,input.party)
  if(unmatched){
    // Preserve unsupported comparison handling; no partial ranking is returned.
    if((comparisonQuestion(query)||yearComparisonQuestion(query)) && (/\bfrom\s+(?!(?:19|20)\d{2}\b)/i.test(query)||/\b(?:lobby|industry|sector)\b/i.test(query)) && !result.selected_industries.length&&!result.selected_donors.length)return null
    return nameChoice(unmatched)||{answer:`I couldn't match **${unmatched}** in this map. Please use a donor, industry or party name from the [money map](https://opax.com.au/money) so the calculation includes your whole question.`,citations:{},sources:[],answer_status:'needs_scope',money_ranking:true}
  }
  if(/\bfrom\s+(?!(?:19|20)\d{2}\b)/i.test(query) && !result.selected_industries.length && !result.selected_donors.length) return null
  if(/\b(?:lobby|industry|sector)\b/i.test(query) && !result.selected_industries.length && !result.selected_donors.length) return null
  if(yearComparisonQuestion(query))return comparedYearAnswer(result,graph,query,file,input)
  if(comparisonQuestion(query))return comparedMoneyAnswer(result,graph,query,file)
  if(result.selected_parties.length>1) return null
  if(result.selected_industries.length>1) return null
  const donorIntent = !/\b(?:receiv\w*|takes?|gets?)\b/i.test(query) && (/\b(?:biggest|largest|top)\b[^?.]{0,60}\bdonors?\b/i.test(query) || (/^who\s+donat\w*\b/i.test(query) && !/\bto who(?:m)?\b/i.test(query)))
  const fromDonors=result.selected_parties.length>0 || donorIntent
  const allFlows=!result.selected_parties.length && !result.selected_industries.length && !result.selected_donors.length && !fromDonors
  const rows=(allFlows ? result.flows.map(r=>({name:`${r.donor} → ${r.party}`,total_aud:r.total_aud,receipts:r.receipts,id:r.donor_id,party:r.party}))
    : (fromDonors?result.by_donor:result.by_party).map(r=>({...r,party:fromDonors?result.selected_parties[0]:r.name}))).slice(0,5)
  if(!rows.length)return {answer:result.answer,citations:{},sources:[],answer_status:'evidence_gap',money_ranking:true}
  const who=rows[0], recipient=result.selected_parties.join(' and '), sector=result.selected_industries.map(i=>i.replaceAll('_',' ')).join(' and ')
  const lead=who ? allFlows ? `The largest donor-to-party connection in this published selection is **${plain(who.name)}: ${aud(who.total_aud)}**.`
    : fromDonors ? `**${plain(who.name)}** has the largest disclosed total${recipient?` to ${plain(recipient)}`:''}${sector?` among ${plain(sector)} donors`:''} in this published selection: **${aud(who.total_aud)}**.`
    : `**${plain(who.name)}** received the most disclosed funding${sector?` from ${plain(sector)} donors`:` from ${plain(result.subject)}`} in this published selection: **${aud(who.total_aud)}**.`
    : result.answer
  const sources: {resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string;date?:string}[]=[]
  const citations: Record<string,number[][]>={}
  let answer=lead
  if (/\bdonat/i.test(query)) answer+=' These figures rank disclosed receipts, which include more than gifts; they are not a donations-only ranking.'
  const cite=(title:string,href:string,snippet:string,offset=0)=>{
    const resource=`receipt-ranking-${sources.length}`
    citations[resource]=[[Array.from(answer).length-offset-1,Array.from(answer).length-offset]]
    sources.push({resource,title,href,url:href,kind:'receipt',snippet:sourceCopy(snippet),cited:true,source:disclosureRegister(result.jurisdiction),dateLabel:'Calculated by Opax',date:typeof graph.meta.generated==='string'?graph.meta.generated:undefined})
  }
  cite('How these funding totals were calculated',result.sources[0].url,`Opax added the disclosed receipts matching this question, grouped by ${fromDonors?'donor':allFlows?'donor and recipient party':'recipient party'}. This selection covers ${result.by_donor.length.toLocaleString('en-AU')} donors during ${result.period}. It excludes government funding and records outside the published selection. Amounts are in Australian dollars and are not adjusted for inflation.`)
  const context=moneyContext(result)
  answer+=`\n\n${context}`
  if(rows.length){
    answer+=`\n\n| ${allFlows?'Donor → party':fromDonors?'Donor':'Recipient party'} | Disclosed receipts | Records |\n| --- | ---: | ---: |`
    for(const row of rows){
      answer+=`\n| ${plain(row.name)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
      const params=new URLSearchParams(new URL(result.sources[0].url).search)
      if(row.party)params.set('party',graph.nodes.find(n=>n.kind==='party'&&n.label===row.party)?.id||row.party)
      if(fromDonors||allFlows)params.set('focus',row.id)
      cite(`${row.name}: ${aud(row.total_aud)}`, '/money?'+params,`${row.name}: ${aud(row.total_aud)}, ${recordCount(row.receipts)}. Period: ${result.period}. Based on ${disclosureRegister(result.jurisdiction)} in this published selection.`,2)
    }
  }
  answer+='\n\nThese are **party receipts, not personal payments to politicians**, and not all receipts are gifts. An industry grouping is not proof of coordinated lobbying or influence.'
  answer+=`\n\nCoverage: Only receipts included in Opax’s published map are ranked. This is a selection, not every donor or an exhaustive industry total. Years use the first year of each financial year; election returns may use the polling year. Undated records are excluded from year-filtered answers.`
  answer+=`\n\n[Explore these records](${result.sources[0].url}) · [Download the calculation data](https://opax.com.au${file})`
  // A canonical request preserves UI-only filters and survives a bounded chat
  // history. It contains selections, never amounts or generated answer text.
  const money_question=fundingScopeQuestion({party:result.selected_parties[0],industry:result.selected_industries[0],
    donor:result.selected_industries.length?undefined:result.selected_donors.length===1?result.selected_donors[0]:undefined,
    ...result.requested_years,mode:fromDonors?'donors':allFlows?'connections':'parties'},jurisdiction)
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,money_context:context,money_question,scope:{state:jurisdiction,...(input.party?{party:input.party}:{})}}
}
