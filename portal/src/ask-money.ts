import {trimQuestionEnd, questionSpaces, shortTrailingMarks} from './question-text.mjs'
import {federalPartyRankingQuestion,federalPartyRankingIntent,federalPartyRankingClarification,federalPartyRankingReading} from './ask-money-family'
import {receiptMeasureLabel,receiptMeasureHeading,receiptMeasurePhrase,receiptDollars,UNTYPED_RECEIPTS_LABEL,industryModifier} from './receipt-copy'
import type { RecordQuestion } from './ask-records'
import type { MoneyFacts } from './ask-money-overview'
import {fundingContinuation, fundingFollowUp, fundingNameChoice, fundingScopeQuestion, fundingUserTurns, periodChoices, samePeriodFundingComparison, type FundingSelection} from './ask-money-followup'
import {financialYear, receiptPeriodQuery} from './receipt-period'
import {earliestReceiptYear, latestReceiptYear, readReceiptPeriod} from './receipt-reading'
import {questionKey, sameQuestion} from './question-key'
import {asideDonorNames, isReceiptGraph, mentionedReceiptIndustries, moneyQuestion, receiptAnswer, receiptGraphForQuestion, unmatchedReceiptRankingScope, voiceReceiptData, type ReceiptGraph} from './voice-money'
import {otherReceiptsLine,publicFundingLine,receiptSplit} from '../public/donor-disclosure.js'
import type {ReceiptFact} from './research-types'

const comparisonQuestion = (q:string) => /\b(?:more|less|higher|lower|compare|versus|vs)\b/i.test(q)
const yearComparisonQuestion = (q:string) => /\b(?:change[sd]?|increase[sd]?|decrease[sd]?|grew|growth|rose|fell)\b/i.test(q)
  || /\b(?:19|20)\d{2}\s+(?:or|versus|vs|than|compared\s+(?:with|to))\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(q)
  || (comparisonQuestion(q) && /\bin\s+(?:19|20)\d{2}\s+and\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(q))

/** Rankings use receipt edges, never the model's retrieved sample. */
export function isMoneyRanking(input: RecordQuestion): boolean {
  const q=input.question||''
  if(input.kind && !['all','receipt'].includes(input.kind) || input.speaker || input.chamber || input.topic || input.context?.length) return false
  if(/\b(?:say|said|says|speeches?|stance|position|vot\w*|influence|favours?|why|personal\w*|MPs?|senators?|politicians?|grants?|contracts?|blood|organ|charity|except|excluding|without|percent\w*|share|average|inflation|real terms)\b/i.test(q)) return false
  // Non-financial purposes and bill/policy titles must not be rescued by the
  // generic ranking fallback after the closed family grammar declines them.
  if(/\b(?:bills?|polic(?:y|ies)|advice|name)\b/i.test(q))return false
  // Ordinary recipient questions often omit "money". Admit a known industry
  // after "from"; the calculator still validates every remaining scope word.
  const normal=trimQuestionEnd(questionSpaces(shortTrailingMarks(q)))
  let from=-1
  for(const match of normal.matchAll(/ from /gi))from=match.index
  const recipientIndustry=from>=0&&/^(?:who|which (?:party|parties)) (?:takes?|gets?|receives?)\b[^?!.]*$/i.test(normal.slice(0,from)) ? normal.slice(from+6).trim() : ''
  const industries=recipientIndustry?mentionedReceiptIndustries(recipientIndustry):[]
  // "From the media" can mean coverage. Require a financial or sector cue
  // rather than turning a question about attention into a receipt ranking.
  const ambiguousMedia=industries.includes('media')&&!/\b(?:industry|sector|lobby)\b/i.test(q)
  const impliedFunding=industries.length>0&&!ambiguousMedia
  return !!federalPartyRankingQuestion(q)||(moneyQuestion(q)||impliedFunding||/\b(?:takes?|gets?|receives?)\b.*\blobby\b/i.test(q)) && (/\b(?:largest|biggest|most|top)\b/i.test(q)||/^who funds\b/i.test(q)||comparisonQuestion(q)||yearComparisonQuestion(q))
}
const aud=receiptDollars
const plain=(s:string)=>s.replace(/[|\n\r\[\]*]/g,' ')
const disclosureRegister=(jurisdiction:string)=>({federal:'AEC political disclosure records',qld:'Electoral Commission of Queensland disclosure records',vic:'Victorian Electoral Commission disclosure records',tas:'Tasmanian political disclosure records'}[jurisdiction]||'published political disclosure records')
const recordCount=(n:number)=>`${n.toLocaleString('en-AU')} disclosed receipt ${n===1?'record':'records'}`
const sourceCopy=(text:string)=>plain(text).replace(/\s+/g,' ').trim()
type MoneyAnswerPayload={answer:string;citations:Record<string,number[][]>;sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string;date?:string;receipt?:ReceiptFact}[];answer_status:string;money_ranking:boolean;measure?:ReceiptTotals['measure']|'donor_declared';measure_label?:string;donor_declared_only?:boolean;donor_declared_aud?:number;records?:number;coverage:ReceiptTotals['period_coverage']&{held_since?:string|null;held_until?:string|null};money_context?:string;money_question?:string;money_facts?:MoneyFacts;scope?:{state:string;party?:string}}
type ReceiptTotals = Exclude<ReturnType<typeof receiptAnswer>, null | {needs_scope:boolean}>
/** The money map links that close an answer. A donation-led answer links the
 * map's Donation-only view of the same selection, and the all-types view too
 * when the answer also shows all receipt types. */
function moneyMapLinks(result:ReceiptTotals,url:string,showsAllTypes:boolean):string {
  if(!result.typed)return `[See these on the money map](${url})`
  if(result.measure!=='donations')return `[See all receipt types on the money map](${url})`
  const donations=new URL(url);donations.searchParams.set('receipt','donations')
  return `[See these donations on the money map](${donations.href})`+(showsAllTypes?` · [See all receipt types on the money map](${url})`:'')
}
type FollowUp = {label:string; question:string}

/**
 * What a written opening is allowed to draw on. Every figure a model could
 * want is spelled out here as a string to copy - the lead over the next row,
 * what the rest come to, the leader's share - so the paragraph above the table
 * never has to do arithmetic of its own. See ask-money-overview.ts.
 */
function moneyFacts(question:string|undefined, ranked_by:string, selection:string, rows:{name:string;total_aud:number;receipts:number}[],jurisdiction?:string,recipient_party?:string,total_aud?:number):MoneyFacts|undefined {
  if(rows.length<1)return undefined
  const listed=total_aud??rows.reduce((sum,row)=>sum+row.total_aud,0)
  const derived:string[]=[]
  if(rows.length>1){
    const gap=Math.round((rows[0].total_aud-rows[1].total_aud)*100)/100
    derived.push(gap?`Gap between ${plain(rows[0].name)} and ${plain(rows[1].name)}: ${aud(gap)}`:`${plain(rows[0].name)} and ${plain(rows[1].name)}: the same total`)
    derived.push(`Everything below ${plain(rows[0].name)}, added together: ${aud(listed-rows[0].total_aud)}`)
    if(listed>0)derived.push(`${plain(rows[0].name)}'s share of the selection total (${aud(listed)}): ${Math.round((rows[0].total_aud/listed)*100)}%`)
  }
  return {jurisdiction,recipient_party,...(question?.trim()?{question:question.trim()}:{}),ranked_by,selection:sourceCopy(selection.replace(/\*\*/g,'')),
    rows:rows.map(row=>({name:plain(row.name).trim(),amount:aud(row.total_aud),records:recordCount(row.receipts)})),derived,measure:'receipts_all',measure_label:receiptMeasureLabel('receipts_all')}
}

function moneyContext(result:ReceiptTotals, years?:number[]) {
  const bounds=result.requested_years
  const selected=years?years.map(financialYear).join(' and '):bounds.from===bounds.to&&bounds.from!==null?financialYear(bounds.from)
    :bounds.from!==null||bounds.to!==null?`${bounds.from===null?'earliest records':financialYear(bounds.from)} to ${bounds.to===null?'latest records':financialYear(bounds.to)}`
    :result.period||'No dated records'
  const coverage=!years&&selected!==result.period?` Matching recorded years: ${result.period||'none'}.`:''
  return `**Financial years: ${selected}.**${coverage} ${result.by_donor.length.toLocaleString('en-AU')} ${result.by_donor.length===1?'receipt source':'receipt sources'} with matching receipts ${result.jurisdiction==='federal'?'in Opax’s uncapped published receipt selection':'on the map, which shows only the largest donors'}. ${result.jurisdiction==='federal'?'Federal (AEC)':result.jurisdiction.toUpperCase()}. ${result.measure_label.charAt(0).toUpperCase()+result.measure_label.slice(1)}; nominal Australian dollars.`
}

/** A row with its own measure_label is a side whose pairs have no receipt types:
 * it keeps that label and period, and links its own map view. */
function partialMoneyComparison(rows:{name:string;total_aud:number;url:string;measure_label?:string;period?:string|null}[],result:ReceiptTotals,note:string){
  const own=rows.filter(r=>r.measure_label),shared=rows.filter(r=>!r.measure_label)
  const named=own.length&&shared.length===1&&result.typed&&result.measure==='donations'
  const links=[...(shared.length?[named?`[See ${plain(shared[0].name)} donations on the money map](${(()=>{const u=new URL(shared[0].url);u.searchParams.set('receipt','donations');return u.href})()})`:moneyMapLinks(result,shared[0].url,false)]:[]),...own.map(r=>`[See ${plain(r.name)} on the money map](${r.url})`)].join(' · ')
  const answer=rows.map(r=>`${plain(r.name)} recorded ${aud(r.total_aud)} in ${r.measure_label??result.measure_label}, ${r.measure_label?r.period:result.period}.`).join(' ')+` ${note}\n\nThese figures are party-level totals for the matching records in OPAX’s published selection.\n\n${links}`
  const resource='receipt-comparison-held',url=rows[0].url
  return {answer,answer_status:'calculated',comparison_complete:false,money_ranking:true,measure:result.measure,measure_label:result.measure_label,coverage:result.period_coverage,citations:{[resource]:[[0,Array.from(answer).length]]},sources:[{resource,title:'Matching comparison records',href:url,url,kind:'receipt',snippet:answer,cited:true}]}
}

const typedFigures=(result:ReceiptTotals)=>result.measure==='donations'?'the donation figures':'figures for one receipt type'

function heldMoneyComparison(result:ReceiptTotals,graph:ReceiptGraph,partyComparison:boolean,note:string){
  const from=result.selected_industries.length?result.selected_industries.map(i=>i.replaceAll('_',' ')).join(' or '):result.selected_donors.length?result.selected_donors[0]:'all receipts'
  const to=result.selected_parties.length?' to '+result.selected_parties.join(' or '):''
  const held=receiptAnswer(graph,`Who receives the most disclosed receipts from ${from}${to}?`,result.jurisdiction,'https://opax.com.au')
  if(!held||'needs_scope' in held||'needs_period' in held||!held.receipts)return null
  const rows=partyComparison?held.by_party:held.by_industry
  const payload=partialMoneyComparison(rows.map(r=>{const url=new URL(held.sources[0].url);if(partyComparison)url.searchParams.set('party',r.id);else url.searchParams.set('industry',r.id);return {name:r.name,total_aud:r.total_aud,url:url.href}}),held,note)
  const prefix='Held-period figures: '
  return {...payload,answer:prefix+payload.answer,citations:Object.fromEntries(Object.entries(payload.citations).map(([id,ranges])=>[id,ranges.map(([a,b])=>[a+prefix.length,b+prefix.length])])),coverage:{...result.period_coverage,held_since:held.period_coverage.since,held_until:held.period_coverage.until}}
}

/** Compare two individual year cells, never their pooled range or lifetime sum. */
function comparedYearAnswer(result:ReceiptTotals, graph:ReceiptGraph, query:string, file:string, input:RecordQuestion, periodText=query) {
  const clarify=(answer:string,answer_status='needs_period')=>({answer,citations:{},sources:[],answer_status,money_ranking:true})
  // Years come from the question's own words; a number inside a donor's name is not one.
  let years=[...periodText.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0])).sort((a,b)=>a-b)
  // A change named by one year is read as the change into it from the year before.
  let reading:string|undefined
  // More than two years is read as the change from the first to the last.
  const named=new Set(years)
  if(!/\b(?:before|after|since|until|through)\b/i.test(periodText)&&(named.size===1||named.size>2)){
    years=named.size===1?[years[0]-1,years[0]]:[years[0],years[years.length-1]]
    reading=`Reading this as the change from ${financialYear(years[0])} to ${financialYear(years[1])}.`
    input={...input,from:undefined,to:undefined}
  }
  if(years.length!==2 || years[0]===years[1] || /\b(?:before|after|since|until|through)\b/i.test(periodText)) {
    return clarify('Choose two individual financial years to compare, for example 2020 and 2021. Each year means the financial year starting in that year.')
  }
  if((input.from&&Number(input.from)!==years[0]) || (input.to&&Number(input.to)!==years[1])) {
    return clarify('Choose the same financial years in the question and the year filters.')
  }
  if(result.selected_parties.length!==1 || result.selected_industries.length>1 || (!result.selected_industries.length&&result.selected_donors.length>1)) {
    return clarify('Choose one recipient party and, optionally, one donor or industry for the year comparison. For example: “How did gambling receipts to Labor change from 2020 to 2021?”','needs_scope')
  }
  // Both years use one measure: the lead measure when either year holds it
  // (a year with none in that measure is $0 recorded), otherwise every
  // receipt type, so the comparison stays inside the reading.
  // A year whose pairs have no receipt types in the typed export cannot be set
  // beside typed figures, so it stays out of the comparison and the note says why.
  const untypedYears=new Set<number>()
  const yearRows=(measure:ReceiptTotals['measure'])=>years.map(year=>{
    const one=receiptAnswer(graph,query,result.jurisdiction,'https://opax.com.au',{...input,from:String(year),to:String(year),measure})
    if(one&&result.typed&&'type_breakdown' in one){untypedYears.add(year);return null}
    return one&&!('needs_scope' in one)?{year,...one}:null
  })
  let rows=yearRows(result.measure)
  if(result.typed&&result.measure!=='receipts_all'&&rows.every(r=>!r?.receipts)){
    const all=yearRows('receipts_all')
    if(all.some(r=>r?.receipts))rows=all
  }
  const [earlier,later]=rows
  // A year with none in the measure is $0 recorded only inside the published years.
  const first=earliestReceiptYear(graph),last=latestReceiptYear(graph)
  const published=first!==undefined&&last!==undefined&&years.every(y=>y>=first&&y<=last)
  if(!earlier||!later||(!earlier.receipts&&!later.receipts)||((!result.typed||!published)&&(!earlier.receipts||!later.receipts))) {
    // Figures stay inside the stated years: the year that holds records, and the year that holds none.
    const held=[earlier,later].filter((r):r is NonNullable<typeof r>=>!!r&&r.receipts>0)
    const missing=years.filter(y=>!held.some(r=>r.year===y))
    const outside=missing.filter(y=>first!==undefined&&y<first||last!==undefined&&y>last)
    const untyped=missing.filter(y=>untypedYears.has(y)),absent=missing.filter(y=>!untypedYears.has(y))
    const note=[outside.length&&first!==undefined&&last!==undefined?`The published records run from ${financialYear(first)} to ${financialYear(last)}.`
        :absent.length?`The AEC records no matching receipts in ${absent.map(financialYear).join(' and ')}.`:'',
      untyped.length?`The AEC data OPAX holds for ${untyped.map(financialYear).join(' and ')} doesn't split receipts by type, so it can't be set beside ${typedFigures(result)}.`:''].filter(Boolean).join(' ')
    if(held.length)return {...partialMoneyComparison(held.map(r=>({name:result.selected_parties[0]+' in '+financialYear(r.year),total_aud:r.total_aud,url:r.sources[0].url})),held[0],note),coverage:result.period_coverage,...(reading?{reading}:{})}
    if(result.receipts)return {...partialMoneyComparison([{name:result.selected_parties[0],total_aud:result.total_aud,url:result.sources[0].url}],result,note),coverage:result.period_coverage,...(reading?{reading}:{})}
    return heldMoneyComparison(result,graph,true,note)??clarify('Choose a held financial year in the [money map](/money) to compare the recorded figures.','evidence_gap')
  }
  const fy=financialYear
  const party=plain(result.selected_parties[0])
  const from=result.selected_industries.length?` from ${plain(industryModifier(result.selected_industries[0]))} receipt sources`:result.selected_donors.length?` from ${plain(result.selected_donors[0])}`:''
  const difference=Math.round((later.total_aud-earlier.total_aud)*100)/100
  const label=later.measure_label
  let answer=difference?`**${party} received ${aud(Math.abs(difference))} ${difference>0?'more':'less'}${from} in ${fy(later.year)} than in ${fy(earlier.year)}** in ${label}.`
    :`**${party} has the same disclosed total${from} in ${fy(earlier.year)} and ${fy(later.year)}** in ${label}.`
  const citations:Record<string,number[][]>={}
  const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string}[]=[]
  const cite=(title:string,href:string,snippet:string,offset=0)=>{
    const resource=`receipt-years-${sources.length}`,end=Array.from(answer).length-offset
    citations[resource]=[[end-1,end]];sources.push({resource,title,href,url:href,kind:'receipt',snippet:sourceCopy(snippet),cited:true,source:disclosureRegister(result.jurisdiction),dateLabel:'Calculated by OPAX'})
  }
  cite('How the two years were compared','/methods',`${party}: ${fy(earlier.year)} ${aud(earlier.total_aud)}; ${fy(later.year)} ${aud(later.total_aud)}. Change: ${aud(difference)}. ${result.period_note}`)
  const context=moneyContext({...result,by_donor:[...new Map([...earlier.by_donor,...later.by_donor].map(d=>[d.id,d])).values()]},years)
  answer+=`\n\n${context}`
  answer+=`\n\n| Financial year | ${receiptMeasureHeading(result.measure,false,'comparison')} | Records |\n| --- | ---: | ---: |`
  for(const row of [earlier,later]) {
    answer+=`\n| ${fy(row.year)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
    const url=new URL(row.sources[0].url)
    cite(`${fy(row.year)}: ${aud(row.total_aud)}`,url.pathname+url.search,`${party}${from}: ${aud(row.total_aud)} across ${recordCount(row.receipts)} in ${fy(row.year)}. Based on ${disclosureRegister(result.jurisdiction)} in this published selection.`,2)
  }
  answer+='\n\nThese figures are party-level totals for the matching financial years in OPAX’s published selection.'
  answer+=`\n\n${moneyMapLinks(result,result.sources[0].url,false)} · [How OPAX counts money](/money/explain) · [Download the calculation data](https://opax.com.au${file})`
  const money_facts=moneyFacts(undefined,'financial year',context,[earlier,later].map(row=>({name:fy(row.year),total_aud:row.total_aud,receipts:row.receipts})))
  if(money_facts){money_facts.measure=result.measure;money_facts.measure_label=result.measure_label}
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,measure:result.measure,measure_label:result.measure_label,coverage:result.period_coverage,money_context:context,money_facts,scope:{state:result.jurisdiction,party:result.selected_parties[0]},...(reading?{reading}:{})}
}

/** Compare one dimension at a time, over exactly the same dated receipt selection. */
function comparedMoneyAnswer(result:ReceiptTotals, graph:ReceiptGraph, query:string, file:string) {
  const partyComparison=result.selected_parties.length===2 && result.selected_industries.length<=1
  const industryComparison=result.selected_industries.length===2 && result.selected_parties.length<=1
  if(!partyComparison&&!industryComparison)return null
  // This selection cannot answer change over time or comparisons with an
  // unspecified baseline by pooling the two periods into one number.
  if(!samePeriodFundingComparison(query))return null
  const dimension=partyComparison?result.selected_parties:result.selected_industries
  const values=partyComparison?result.by_party:result.by_industry
  const rows=dimension.map(name=>values.find(r=>partyComparison?r.name===name:r.id===name) || {id:name,name:name.replaceAll('_',' '),total_aud:0,receipts:0})
    .map(r=>({...r,name:industryComparison?r.name.charAt(0).toUpperCase()+r.name.slice(1):r.name})).sort((a,b)=>b.total_aud-a.total_aud)
  const [first,second]=rows
  const money_question=partyComparison && (result.selected_industries.length || result.selected_donors.length<=1)
    ? fundingScopeQuestion({compareParties:result.selected_parties as [string,string],industry:result.selected_industries[0],
      donor:result.selected_industries.length?undefined:result.selected_donors[0],...result.requested_years,mode:'parties'},result.jurisdiction)
    : undefined
  // Absence from a selected export does not establish an actual zero.
  if(rows.some(r=>!r.receipts)){
    const held=rows.filter(r=>r.receipts>0)
    const partyUrl=(name:string)=>{const url=new URL(result.sources[0].url);if(partyComparison)url.searchParams.set('party',graph.nodes.find(n=>n.kind==='party'&&n.label===name)?.id||name);return url.href}
    // A side with no typed records may still hold records without a receipt-type
    // breakdown: give its all-types total under its own label, not as like for like.
    const untyped=partyComparison&&result.typed?rows.filter(r=>!r.receipts).flatMap(r=>{
      const bounds=result.requested_years
      const side=receiptAnswer(graph,query,result.jurisdiction,'https://opax.com.au',{party:r.name,...(bounds.from!==null?{from:String(bounds.from)}:{}),...(bounds.to!==null?{to:String(bounds.to)}:{})})
      return side&&'type_breakdown' in side&&side.receipts>0?[{name:r.name,total_aud:side.total_aud,url:partyUrl(r.name),measure_label:side.measure_label,period:side.period}]:[]
    }):[]
    if(held.length&&untyped.length){
      const names=untyped.map(r=>plain(r.name)).join(' and ')
      const note=`The AEC data OPAX holds for ${names} doesn't split receipts by type, so ${untyped.length===1?'its total':'their totals'} can't be set beside ${typedFigures(result)} as like for like.`
      return {...partialMoneyComparison([...held.map(r=>({name:r.name,total_aud:r.total_aud,url:partyUrl(r.name)})),...untyped],result,note),money_question}
    }
    return held.length?{...partialMoneyComparison(held.map(r=>({name:r.name,total_aud:r.total_aud,url:partyUrl(r.name)})),result,'One comparison side has matching records; the comparison needs records for both sides.'),money_question}:{...(heldMoneyComparison(result,graph,partyComparison,'The requested comparison needs matching records for both sides.')??{answer:'Choose a held period in the [money map](/money) for this comparison.',citations:{},sources:[],answer_status:'evidence_gap',money_ranking:true}),money_question}
  }
  const difference=Math.round((first.total_aud-second.total_aud)*100)/100
  const sector=result.selected_industries.map(industryModifier).join(' and ')
  const subject=partyComparison?(sector?` from ${plain(sector)} receipt sources`:result.selected_donors.length?` from ${plain(result.subject)}`:''):(result.selected_parties.length?` to ${plain(result.selected_parties[0])}`:' to parties')
  let answer=difference?`**${plain(first.name)} ${partyComparison?'received':'accounted for'} ${aud(difference)} more${subject} than ${plain(second.name)}** in ${result.measure_label}, ${result.period}.`:`**${plain(first.name)} and ${plain(second.name)} have the same disclosed total${subject}** in ${result.measure_label}, ${result.period}.`
  const citations:Record<string,number[][]>={}
  const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string}[]=[]
  const cite=(title:string,href:string,snippet:string,offset=0)=>{
    const resource=`receipt-comparison-${sources.length}`
    const end=Array.from(answer).length-offset
    citations[resource]=[[end-1,end]]
    sources.push({resource,title,href,url:href,kind:'receipt',snippet:sourceCopy(snippet),cited:true,source:disclosureRegister(result.jurisdiction),dateLabel:'Calculated by OPAX'})
  }
  cite('How the two receipt totals were compared','/methods',`${first.name}: ${aud(first.total_aud)}; ${second.name}: ${aud(second.total_aud)}. Difference: ${aud(difference)}. ${result.period_note}`)
  const bounds=result.requested_years
  const context=moneyContext(result)
  answer+=`\n\n${context}`
  answer+=`\n\n| ${partyComparison?'Recipient party':'Source industry'} | ${receiptMeasureHeading(result.measure,false,'comparison')} | Records |\n| --- | ---: | ---: |`
  for(const row of rows) {
    const identity=result.by_donor.find(d=>d.id===row.id);
      const donorName=identity ? (identity.href ? `[${plain(row.name)}](${new URL(identity.href,'https://opax.com.au').href})` : plain(row.name)) : plain(row.name);
      answer+=`\n| ${donorName} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
    const params=new URLSearchParams(new URL(result.sources[0].url).search)
    if(partyComparison)params.set('party',graph.nodes.find(n=>n.kind==='party'&&n.label===row.name)?.id||row.id)
    else params.set('industry',row.id)
    cite(`${row.name}: ${aud(row.total_aud)}`,'/money?'+params,`${row.name}: ${aud(row.total_aud)} across ${recordCount(row.receipts)}. Period: ${result.period}. Based on ${disclosureRegister(result.jurisdiction)} in this published selection.`,2)
  }
  answer+='\n\nThese figures are party-level totals from the same financial-year selection in OPAX’s published receipts.'
  answer+=`\n\n${moneyMapLinks(result,result.sources[0].url,false)} · [How OPAX counts money](/money/explain) · [Download the calculation data](https://opax.com.au${file})`
  const money_facts=moneyFacts(money_question,partyComparison?'recipient party':'donor industry',context,rows,result.jurisdiction,result.selected_parties[0])
  if(money_facts){money_facts.measure=result.measure;money_facts.measure_label=result.measure_label}
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,measure:result.measure,measure_label:result.measure_label,coverage:result.period_coverage,money_context:context,money_question,money_facts,scope:{state:result.jurisdiction,...(bounds.from!==null?{from:String(bounds.from)}:{}),...(bounds.to!==null?{to:String(bounds.to)}:{})}}
}

/** Reuse the web money path's scope resolver before a research-loop follow-up. */
export async function fundingResearchFollowUp(input:RecordQuestion,assets:Fetcher){
  const causalPronoun=/^did\s+(?:that|it)\s+buy\s+(?:their|its|his|her)\s+votes?[?.!]*$/i.test(input.question??'')
  if((!fundingContinuation(input.question??'')&&!causalPronoun)||input.speaker||input.chamber||input.topic)return null
  const previous=fundingUserTurns(input).reverse().find(question=>isMoneyRanking({question}))
  if(!previous)return null
  const selection=await receiptGraphForQuestion(previous,async file=>{
    const response=await assets.fetch(new Request('https://opax.com.au'+file))
    if(!response.ok)return null
    const graph=await response.json() as Record<string,unknown>
    return isReceiptGraph(graph)?graph:null
  },input.state)
  if(!selection)return null
  const {graph,jurisdiction}=selection
  if(causalPronoun){
    const scope=receiptAnswer(graph,previous,jurisdiction,'https://opax.com.au')
    if(!scope||'needs_scope' in scope||'needs_period' in scope||scope.selected_parties.length!==1||unmatchedReceiptRankingScope(graph,receiptPeriodQuery(previous).query,scope))return null
    const {from,to}=scope.requested_years
    const period=from!==null&&from===to?' in '+financialYear(from):from!==null&&to!==null?' from '+financialYear(from)+' to '+financialYear(to):from!==null?' since '+financialYear(from):to!==null?' through '+financialYear(to):''
    return {question:`Did the disclosed receipts to ${scope.selected_parties[0]}${period} buy its votes?`}
  }
  const resolved=fundingFollowUp(input,graph,jurisdiction,isMoneyRanking)
  if(resolved)return resolved
  // A new explicit year may follow a coverage refusal. Retain the validated
  // subject from the prior question; replace its period, never its identity.
  if(/^(?:and\s+)?(?:in|during|for)\s+(?:19|20)\d{2}(?:[–-]\d{2})?[?!.]*$/i.test(input.question??'')){
    const context=input.context?.map(t=>t.author==='answer'?t:{...t,text:t.text===undefined?undefined:questionSpaces(t.text).replace(/ (?:in|during|for|since|from) (?:19|20)\d{2}(?:[–-]\d{2})?(?: to (?:19|20)\d{2})?/gi,'')})
    return fundingFollowUp({...input,context},graph,jurisdiction,isMoneyRanking)
  }
  return null
}

export async function rankedMoneyAnswer(input: RecordQuestion, assets: Fetcher) {
  const topTen=/\btop\s+10\b/i.test(input.question??'')
  let uncertain:string|undefined
  if((!input.state||input.state==='federal')&&!input.speaker&&!input.chamber&&!input.topic){
    const intent=federalPartyRankingIntent(input.question??'')
    // An informal party ranking is read as the largest disclosed receipts to that party, and said so.
    if(intent?.uncertain&&intent.parties.length===1){
      uncertain=`Reading this as the largest disclosed receipts to ${intent.parties[0]}.`
      input={...input,question:`Who has the most disclosed receipts to ${intent.parties[0]}?`,kind:'all'}
    } else if(intent?.uncertain)return federalPartyRankingClarification(intent)
    const canonical=federalPartyRankingQuestion(input.question??'')
    input={...input,...(canonical?{question:canonical,kind:'all'}:{}),context:Array.isArray(input.context)?input.context.map(t=>t&&typeof t.text==='string'&&(t.author==='user'||t.author==='question')?{...t,text:federalPartyRankingReading(t.text)??t.text}:t):undefined}
  }
  // Debt stocks cannot establish a history of loan receipts. Do not infer lenders from names.
  if((!input.state||input.state==='federal')&&!input.speaker&&!input.chamber&&!input.topic&&(!input.kind||['all','receipt'].includes(input.kind))&&/^\s*Which banks lent money to Labor\s*[?!.]*$/i.test(input.question??'')) {
    const response=await assets.fetch(new Request('https://opax.com.au/graph/aec-extras.json'))
    if(!response.ok)return null
    const data=await response.json() as {meta?:{notes?:string[]}}
    const answer='The published debt records cannot establish a complete list of banks that lent money to Labor. They report balances owed at 30 June, rather than amounts newly lent, and name only the latest year’s largest creditors.'
    const resource='receipt-debt-basis',href='/graph/aec-extras.json'
    return {answer,answer_status:'evidence_gap',money_ranking:true,citations:{[resource]:[[0,Array.from(answer).length]]},sources:[{resource,title:'Basis of the published AEC debt records',href,url:href,kind:'record',snippet:(data.meta?.notes??[]).join(' '),cited:true}]}
  }
  const direct={...input,context:undefined}
  const standalone=isMoneyRanking(direct)
  if(!standalone && (input.kind&&!['all','receipt'].includes(input.kind) || input.speaker || input.chamber || input.topic || !fundingContinuation(input.question||''))) return null
  const previous=standalone?undefined:fundingUserTurns(input).reverse().find(question=>isMoneyRanking({question}))
  if(!standalone&&!previous)return null
  const selection=await receiptGraphForQuestion(standalone?input.question||'':previous!,async file=>{
    const response=await assets.fetch(new Request('https://opax.com.au'+file))
    if(!response.ok) throw new Error('Receipt data unavailable')
    const graph=await response.json() as Record<string,unknown>
    if(!isReceiptGraph(graph)) throw new Error('Receipt data invalid')
    return graph
  },input.state)
  if(!selection)return null
  const {graph,file,jurisdiction}=selection
  let carried:Carried={options:[]}
  if(!standalone) {
    const followUp=fundingFollowUp(input,graph,jurisdiction,isMoneyRanking)
    if(!followUp)return null
    if('answer' in followUp)return followUp
    input={...direct,question:followUp.question}
    carried={reading:followUp.reading,options:followUp.options??[]}
  } else input=direct
  return readMoneyRanking(input,graph,file,jurisdiction,carried,input.question||'',{topTen,reading:uncertain})
}

/** The reading carried from an earlier step (a follow-up or a name match). */
type Carried={reading?:string;options:FollowUp[]}
type ReadPayload={answer:string;citations:Record<string,number[][]>;sources:unknown[];answer_status:string;money_ranking:boolean;money_question?:string;[key:string]:unknown}

/**
 * State the reading in one line after the opening paragraph, and offer the
 * other readings as one-tap questions. Citation offsets after the insert move
 * with it. An option that repeats the asked question is left out.
 */
export function withReading<T extends {answer:string;citations:Record<string,number[][]>}>(payload:T,lines:(string|undefined)[],options:FollowUp[],asked:string):T&{money_reading?:string;money_followups?:FollowUp[]} {
  const reading=[...new Set(lines.filter((l):l is string=>!!l))].join(' ')
  const seen=new Set<string>()
  const followups=options.filter(o=>{
    const key=questionKey(o.question)
    // An option that gives the answer already shown is not another reading.
    const shown=(payload as {money_question?:string}).money_question
    if(!key||sameQuestion(o.question,asked)||seen.has(key)||(shown&&key===questionKey(shown)))return false
    seen.add(key);return true
  }).slice(0,4)
  if(!reading&&!followups.length)return payload
  let answer=payload.answer,citations=payload.citations
  if(reading) {
    const cut=answer.indexOf('\n\n'),at=Array.from(cut<0?answer:answer.slice(0,cut)).length
    const insert='\n\n'+reading,shift=Array.from(insert).length,chars=Array.from(answer)
    answer=chars.slice(0,at).join('')+insert+chars.slice(at).join('')
    citations=Object.fromEntries(Object.entries(citations).map(([k,ranges])=>[k,ranges.map(([a,b])=>a>=at?[a+shift,b+shift]:[a,b])]))
  }
  if(followups.length)answer+='\n\nOther readings: '+followups.map(f=>`[${plain(f.label)}](/ask?q=${encodeURIComponent(f.question).replace(/\(/g,'%28').replace(/\)/g,'%29')})`).join(' · ')
  return {...payload,answer,citations,...(reading?{money_reading:reading}:{}),...(followups.length?{money_followups:followups}:{})}
}

/**
 * Read the question's period and names, calculate, and answer with figures.
 * Each reading taken (a period, a grouping, the likeliest of several matching
 * names) is stated in one line, and the other readings are offered.
 */
function readMoneyRanking(input:RecordQuestion,graph:ReceiptGraph,file:string,jurisdiction:string,carried:Carried,asked:string,options:{topTen?:boolean;reading?:string;allowChoice?:boolean}={}):ReadPayload|null {
  // The question's own period is read first, while financial-year labels are
  // still visible ("since 2023–24" starts at 2023–24; "since 2023" at 2022–23).
  // A donor name a router wrote in ("Comscrv (No. 2092) Pty Ltd - Loan") is held
  // aside while the period is read, so its digits are never a year.
  const own=asideDonorNames(graph,input.question||'')
  const read=readReceiptPeriod(own.text,latestReceiptYear(graph),{compare:yearComparisonQuestion(receiptPeriodQuery(own.text).query)})
  const periodText=receiptPeriodQuery(read.query).query.replace(/\btop\s+10\b/gi,'top')
  const query=own.restore(periodText)
  // Explicit dates in this question outrank stale UI controls on every route.
  if (/\b(?:19|20)\d{2}\b/.test(periodText)) input={...input,from:undefined,to:undefined}
  const result=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au',{...input,compareYears:yearComparisonQuestion(periodText)})
  // A partial organisation name is answered for its likeliest match.
  const nameChoice=(fragment:string)=>{
    if(options.allowChoice===false)return null
    const escaped=fragment.split(/\s+/).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^a-z0-9]+')
    const written=new RegExp('\\b'+escaped+'\\b','i').exec(query)?.[0]??fragment
    const choice=fundingNameChoice(graph,fragment,jurisdiction,label=>query.replace(new RegExp('\\b'+escaped+'\\b','i'),()=>label),input,written)
    if(!choice)return null
    return readMoneyRanking({...input,question:choice.question},graph,file,jurisdiction,
      {reading:[carried.reading,read.reading,choice.reading].filter(Boolean).join(' '),options:[...carried.options,...choice.options??[]]},asked,{...options,allowChoice:false})
  }
  const missingScope=()=>({answer:'Name a donor, industry or recipient party from the [money map](https://opax.com.au/money) and OPAX will calculate its disclosed receipts.',citations:{},sources:[],answer_status:'needs_scope',money_ranking:true})
  if(!result) return comparisonQuestion(query)||yearComparisonQuestion(query)?null:nameChoice(unmatchedReceiptRankingScope(graph,query,{selected_donors:[],selected_parties:[],selected_industries:[]}))||missingScope()
  if('needs_scope' in result) return ('donor_query' in result&&result.donor_query?nameChoice(result.donor_query):null)||{answer:result.answer,citations:{},sources:[],answer_status:'needs_scope',money_ranking:true}
  const scoped=result.read_query
  const unmatched=unmatchedReceiptRankingScope(graph,scoped,result,input.party)
  if(unmatched){
    // Preserve unsupported comparison handling; no partial ranking is returned.
    if((comparisonQuestion(query)||yearComparisonQuestion(periodText)) && (/\bfrom\s+(?!(?:19|20)\d{2}\b)/i.test(query)||/\b(?:lobby|industry|sector)\b/i.test(query)) && !result.selected_industries.length&&!result.selected_donors.length)return null
    return nameChoice(unmatched)||{answer:`OPAX calculates from the donor, industry and party names in the [money map](https://opax.com.au/money); **${unmatched}** is not one of them. Ask again with a name from the map and the calculation will cover your whole question.`,citations:{},sources:[],answer_status:'needs_scope',money_ranking:true}
  }
  if(/\bfrom\s+(?!(?:19|20)\d{2}\b)/i.test(query) && !result.selected_industries.length && !result.selected_donors.length) return null
  if(/\b(?:lobby|industry|sector)\b/i.test(query) && !result.selected_industries.length && !result.selected_donors.length) return null
  // What was read, and the other readings as complete questions for the same selection.
  const lines=[options.reading,carried.reading,read.reading??result.period_reading,result.scope_reading]
  const choices=readingChoices(result,read.reading?read.options:result.period_options,carried.options)
  if(yearComparisonQuestion(periodText)){
    const compared=comparedYearAnswer(result,graph,query,file,input,periodText)
    return withReading(compared,[...lines,'reading' in compared?compared.reading:undefined],'money_question' in compared?[]:choices('donors'),asked)
  }
  if(comparisonQuestion(query)){
    const compared=comparedMoneyAnswer(result,graph,query,file)
    return compared&&withReading(compared,lines,choices('parties'),asked)
  }
  if(result.selected_parties.length>1) return null
  if(result.selected_industries.length>1) return null
  const answer=calculatedMoneyAnswer(result,graph,query,file,input,{topTen:options.topTen})
  return withReading(answer,lines,choices(result.selected_parties.length?'donors':'parties'),asked)
}

/** Each period or name option as a complete question for the same selection. */
export function readingChoices(result:ReceiptTotals,periodOptions:ReceiptTotals['period_options'],carried:FollowUp[]=[]) {
  return (mode:FundingSelection['mode']):FollowUp[]=>{
    const selection:FundingSelection={party:result.selected_parties[0],industry:result.selected_industries[0],
      donor:result.selected_industries.length?undefined:result.selected_donors.length===1?result.selected_donors[0]:undefined,...result.requested_years,mode}
    return [...carried,...periodChoices(selection,periodOptions,result.jurisdiction),
      ...result.scope_options.map(o=>({label:o.label,question:fundingScopeQuestion({...selection,...(o.party?{party:o.party}:{})},result.jurisdiction)}))]
  }
}

/** Give Ask the same declaration wording as voice, retaining a ranked split. */
function donorDeclaredMoneyAnswer(result:ReceiptTotals,graph:ReceiptGraph):MoneyAnswerPayload|null {
  const declared=voiceReceiptData(graph,result)
  if(!('donor_declared_only' in declared))return null
  const fromDonors=result.selected_parties.length>0
  const rows=fromDonors?result.by_donor:result.by_party
  let answer=declared.answer
  if(fromDonors&&rows.length>1)answer=`**${plain(rows[0].name)}** declared the most to ${plain(result.selected_parties.join(' and '))}: **${aud(rows[0].total_aud)}**. `+answer
  answer+=`\n\n| ${fromDonors?'Source':'Recipient party'} | Declared by the donor${fromDonors&&rows.length>1?'s':''} | Records |\n| --- | ---: | ---: |`
  for(const row of rows)answer+=`\n| ${plain(row.name)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
  answer+=`\n| Total declared | ${aud(declared.donor_declared_aud)} | ${declared.records.toLocaleString('en-AU')} |`
  const resource='donor-declarations',url=declared.sources[0].url,snippet=sourceCopy(answer)
  const citations={[resource]:[[0,Array.from(answer).length]]}
  answer+=`\n\n[See these on the money map](${url})`
  return {answer,answer_status:'calculated',money_ranking:true,measure:declared.measure,measure_label:declared.measure_label,
    donor_declared_only:true,donor_declared_aud:declared.donor_declared_aud,records:declared.records,coverage:declared.period_coverage,citations,
    sources:[{resource,title:declared.sources[0].title,href:url,url,kind:'receipt',snippet,cited:true}]}
}

/** A named donor's total comes before the recipient choice. Typed amounts use
 * the donor page's receipt cells; only Donation Received counts as a donation. */
export function donorTotalMoneyAnswer(result:ReceiptTotals,graph:ReceiptGraph):MoneyAnswerPayload {
  const declared=donorDeclaredMoneyAnswer(result,graph)
  if(declared)return declared
  const name=plain(result.subject),label=result.measure_label
  const {from,to}=result.requested_years
  const period=result.period??(from!==null&&to!==null?from===to?`in ${financialYear(from)}`:`${financialYear(from)} to ${financialYear(to)}`:'the published financial years')
  let answer=`**${name}** has **${aud(result.total_aud)}** recorded in ${label} to ${result.selected_parties.length?plain(result.selected_parties.join(' and ')):'political parties'}, ${period}.`
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]))
  const edges=graph.edges.filter(e=>{
    const donor=nodes.get(e.source),party=nodes.get(e.target)
    return !e.flow&&!e.grant&&donor?.kind==='donor'&&result.selected_donors.includes(donor.label)
      &&party?.kind==='party'&&(!result.selected_parties.length||result.selected_parties.includes(party.label))
  })
  const rows=[...new Set(edges.map(e=>e.target))].map(id=>result.by_party.find(p=>p.id===id)??{id,name:nodes.get(id)!.label,total_aud:0,receipts:0})
    .sort((a,b)=>b.total_aud-a.total_aud||a.name.localeCompare(b.name,'en-AU'))
  answer+=`\n\n| Recipient party | ${receiptMeasureHeading(result.measure)} | Records |\n| --- | ---: | ---: |`
  for(const row of rows)answer+=`\n| ${plain(row.name)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
  answer+=`\n| Total recorded | ${aud(result.total_aud)} | ${result.receipts.toLocaleString('en-AU')} |`
  // Other types remain labelled asides, never part of the donation total.
  for(const edge of edges){
    const split=receiptSplit(edge,from,to),party=plain(nodes.get(edge.target)!.label)
    const other=otherReceiptsLine(name,party,split,{also:true})
    if(other)answer+='\n\n'+other
    if(split?.publicFunding[0])answer+='\n\n'+publicFundingLine(name,party,split.publicFunding[0])
  }
  answer+=result.typed?'\n\nThese donation figures count each gift once from the parties’ own returns. Amounts below the disclosure threshold are outside the register.':'\n\nThese records have no receipt-type breakdown; they cannot establish a donation-only total, and payments reported by both sides can appear twice.'
  const resource='donor-total',url=result.sources[0].url,snippet=sourceCopy(answer)
  const citations={[resource]:[[0,Array.from(answer).length]]}
  answer+='\n\n'+moneyMapLinks(result,url,false)
  return {answer,answer_status:'calculated',money_ranking:true,measure:result.measure,measure_label:label,coverage:result.period_coverage,citations,
    sources:[{resource,title:`${name}: ${aud(result.total_aud)} in ${label}`,href:url,url,kind:'receipt',snippet,cited:true}],scope:{state:result.jurisdiction,...(result.selected_parties.length===1?{party:result.selected_parties[0]}:{})}}
}

/** Render the calculator's validated selection for every money ranking route. */
export function calculatedMoneyAnswer(result:ReceiptTotals,graph:ReceiptGraph,query:string,file:string,input:RecordQuestion,options:{total?:boolean;bankGrouping?:boolean;topTen?:boolean;held?:boolean;member?:{name:string;href:string}}={}):MoneyAnswerPayload {
  const declared=donorDeclaredMoneyAnswer(result,graph)
  if(declared)return declared
  const jurisdiction=result.jurisdiction
  const donorIntent = !/\b(?:receiv\w*|takes?|gets?)\b/i.test(query) && (/\b(?:biggest|largest|top)\b[^?.]{0,60}\bdonors?\b/i.test(query) || (/^who\s+donat\w*\b/i.test(query) && !/\bto who(?:m)?\b/i.test(query)))
  const fromDonors=result.selected_parties.length>0 || donorIntent
  const allFlows=!result.selected_parties.length && !result.selected_industries.length && !result.selected_donors.length && !fromDonors
  const connections=new Map<string,{id:string;name:string;party:string;donor:string;total_aud:number;receipts:number;all_types_aud:number;other_receipts_aud:number;associated?:string}>()
  for(const f of result.flows){
    const key=f.donor_id+'|'+f.party_id,old=connections.get(key)
    if(old){old.total_aud+=f.total_aud;old.receipts+=f.receipts;old.all_types_aud+=f.all_types_aud;old.other_receipts_aud+=f.other_receipts_aud}
    else connections.set(key,{...f,id:f.donor_id,name:`${f.donor} → ${f.party}`})
  }
  const ranked=(allFlows?[...connections.values()]:fromDonors?result.by_donor:result.by_party)
    .map(r=>({...r,party:allFlows?(r as {party:string}).party:fromDonors?result.selected_parties[0]:r.name}))
    .sort((a,b)=>b.total_aud-a.total_aud||a.name.localeCompare(b.name,'en-AU'))
    // A $0 row in the measure is not a place in the ranking.
    .filter((r,_i,all)=>r.total_aud>0||!all.some(x=>x.total_aud>0))
  if(!ranked.length){
    if(!options.held&&(result.requested_years.from!==null||result.requested_years.to!==null)){
      const heldQuery=fundingScopeQuestion({party:result.selected_parties[0],industry:result.selected_industries[0],donor:result.selected_industries.length?undefined:result.selected_donors[0],from:null,to:null,mode:fromDonors?'donors':'parties'},jurisdiction)
      const held=receiptAnswer(graph,heldQuery,jurisdiction,'https://opax.com.au',{party:input.party})
      if(held&&!('needs_scope' in held)&&!('needs_period' in held)&&held.receipts){
        const first=held.period_coverage.since?.slice(0,4),last=held.period_coverage.until?.slice(0,4)
        const dated=receiptAnswer(graph,heldQuery,jurisdiction,'https://opax.com.au',{party:input.party,from:first,to:last})
        if(dated&&!('needs_scope' in dated)&&!('needs_period' in dated)){
          const answer=calculatedMoneyAnswer(dated,graph,heldQuery,file,{...input,from:first,to:last},{...options,held:true})
          return {...answer,coverage:{...result.period_coverage,held_since:dated.period_coverage.since,held_until:dated.period_coverage.until}}
        }
      }
    }
    return {answer:result.answer,coverage:result.period_coverage,citations:{},sources:[],answer_status:'evidence_gap',money_ranking:true}
  }
  const rows=ranked.slice(0,fromDonors||allFlows?options.topTen?10:5:10),who=rows[0]
  const recipient=plain(result.selected_parties.join(' and ')),industry=result.selected_industries[0]
  const sector=industry&&industryModifier(industry),from=sector?`${sector}-linked sources`:plain(result.subject)
  const leadIndustry=industry??graph.nodes.find(n=>n.id===who.id)?.industry
  // Pairs the typed export holds without receipt types keep their own label.
  const labelFor=(industry?:string)=>'type_breakdown' in result?UNTYPED_RECEIPTS_LABEL:receiptMeasureLabel(result.measure,industry)
  const measure_label=labelFor(leadIndustry),heading=receiptMeasureHeading(result.measure,leadIndustry==='finance')
  const period=result.period??'the held financial years',label=`${measure_label}, ${period}`
  const tag=(row:object)=>{const associated=(row as {associated?:string}).associated;return associated?` (${plain(associated)})`:''}
  let lead=options.total?`**${recipient}** has received **${aud(result.total_aud)}** from ${from} in ${label}, across ${result.receipts.toLocaleString('en-AU')} records.`
    :allFlows?`The largest source-to-party connection is **${plain(who.name)}: ${aud(who.total_aud)}**${'associated' in who&&who.associated?` (associated entity of ${recipient||who.party}, per AEC register)`:''}, ${label}.`
    :fromDonors?`The largest ${sector?sector+'-linked ':''}source to ${recipient||'parties'} is **${plain(who.name)}: ${aud(who.total_aud)}**${'associated' in who&&who.associated?` (associated entity of ${recipient||who.party}, per AEC register)`:''}, ${label}.`
    :`**${plain(who.name)}** leads parties receiving money from ${from}: **${aud(who.total_aud)}** in ${label}.`
  if(ranked.length===1&&!fromDonors&&!allFlows)lead=`**${plain(who.name)}** is the only party receiving **${aud(who.total_aud)}** in ${label} from ${from}, across ${recordCount(who.receipts).replace(/^([\d,]+) disclosed receipt /,'$1 ')}.`
  if(options.member)lead=`AEC returns record this money at party level. **${plain(options.member.name)}’s party, ${recipient}**, received **${aud(result.total_aud)}** in ${label}.`
  // When the AEC records no donations in the selection, the answer says so
  // first, then ranks the receipts it does record under their own label.
  const noDonations=result.typed&&result.measure!=='donations'&&!options.total&&!options.member
  if(noDonations){
    const bounds=result.requested_years
    const window=bounds.from!==null&&bounds.to!==null?(bounds.from===bounds.to?`in ${financialYear(bounds.from)}`:`from ${financialYear(bounds.from)} to ${financialYear(bounds.to)}`)
      :bounds.from!==null?`from ${financialYear(bounds.from)} onwards`:`in ${period}`
    const phrase=receiptMeasurePhrase(result.measure)
    const ranking=allFlows?`the largest source-to-party connection is **${plain(who.name)}: ${aud(who.total_aud)}**, ${period}`
      :fromDonors?`the largest ${sector?sector+'-linked ':''}source to ${recipient||'parties'} is **${plain(who.name)}: ${aud(who.total_aud)}**${'associated' in who&&who.associated?` (associated entity of ${recipient||who.party}, per AEC register)`:''}, ${period}`
      :`**${plain(who.name)}** received the most: **${aud(who.total_aud)}**, ${period}`
    lead=`The AEC records no donations from ${allFlows?'any source':from} to ${recipient||'any party'} ${window}. In ${phrase}, ${ranking}.`
  }
  if(options.held)lead='Held-period figures: '+lead
  const sources:{resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;source?:string;dateLabel?:string;date?:string;receipt?:ReceiptFact;coverage?:boolean}[]=[]
  const citations:Record<string,number[][]>={}
  let answer=lead
  const cite=(start:number,title:string,href:string,snippet:string,receipt?:ReceiptFact)=>{
    const resource=`receipt-ranking-${sources.length}`
    citations[resource]=[[start,Array.from(answer).length]]
    sources.push({resource,title,href,url:href,kind:'receipt',snippet:sourceCopy(snippet),cited:true,source:disclosureRegister(jurisdiction),dateLabel:'Calculated by OPAX',date:typeof graph.meta.generated==='string'?graph.meta.generated:undefined,...(receipt?{receipt}:{})})
  }
  cite(0,'How OPAX counts money',result.sources[0].url,`${options.total?recipient:who.name}: ${aud(options.total?result.total_aud:who.total_aud)} in ${label}. Calculation grouped by ${fromDonors?'source':'recipient party'}. `+lead+tag(who))
  const second=options.total?`Largest sources: ${plain(who.name)} (${aud(who.total_aud)})${rows[1]?`, ${plain(rows[1].name)} (${aud(rows[1].total_aud)})`:''}.`:rows[1]?`${plain(rows[1].name)} follows on ${aud(rows[1].total_aud)}; the selection totals ${aud(result.total_aud)}.`:`The selection totals ${aud(result.total_aud)}.`
  if(ranked.length>1||fromDonors||allFlows){const start=Array.from(answer).length;answer+=' '+second+(result.typed&&result.measure!=='receipts_all'?` The leader has ${aud(who.all_types_aud)} across all receipt types${who.other_receipts_aud>=who.all_types_aud/2?' (mostly other receipts)':''}.`:'');cite(start,'Selection totals',result.sources[0].url,answer.slice(start))}
  // Recipient rankings also show donation-only amounts (AEC "Donation Received"),
  // per financial year for a window of up to six years, and in total.
  const recipients=result.typed&&!fromDonors&&!allFlows
  const bounds=result.requested_years
  const yearCols=recipients&&!noDonations&&bounds.from!==null&&bounds.to!==null&&bounds.to-bounds.from<=5?Array.from({length:bounds.to-bounds.from+1},(_,i)=>bounds.from!+i):[]
  const donationsCol=recipients&&result.measure!=='donations'&&!noDonations
  const donated=(row:object)=>(row as {donations_aud?:number}).donations_aud??0
  const donatedIn=(row:object,year:number)=>(row as {donations_by_year?:Record<string,number>}).donations_by_year?.[year]??0
  if(donationsCol){
    const start=Array.from(answer).length,total=ranked.reduce((sum,r)=>sum+donated(r),0)
    answer+=` Donations received (AEC receipt type: Donation Received): ${aud(total)}.`
    cite(start,'Donations in this selection',result.sources[0].url,answer.slice(start))
  }
  const donationCells=(row:object)=>yearCols.map(y=>` ${aud(donatedIn(row,y))} |`).join('')+(donationsCol?` ${aud(donated(row))} |`:'')
  const sumCells=(list:object[])=>yearCols.map(y=>` ${aud(list.reduce((sum,r)=>sum+donatedIn(r,y),0))} |`).join('')+(donationsCol?` ${aud(list.reduce((sum,r)=>sum+donated(r),0))} |`:'')
  if(rows.length>1||fromDonors||allFlows){
    answer+=`\n\n| ${allFlows?'Source → party':fromDonors?'Source':'Recipient'} | ${heading} | Share | ${result.typed&&result.measure!=='receipts_all'?'All receipt types':'Records'} |${yearCols.map(y=>` Donations ${financialYear(y)} |`).join('')}${donationsCol?' Donations total |':''}\n| --- | ---: | ---: | ---: |${yearCols.map(()=>' ---: |').join('')}${donationsCol?' ---: |':''}`
    const share=(amount:number)=>result.total_aud?amount/result.total_aud*100<0.5&&amount>0?'<1%':`${Math.round(amount/result.total_aud*100)}%`:'0%'
    const appendRow=(row:typeof who)=>{
      const params=new URLSearchParams(new URL(result.sources[0].url).search)
      if(row.party)params.set('party',graph.nodes.find(n=>n.kind==='party'&&n.label===row.party)?.id??row.party)
      if(fromDonors||allFlows)params.set('focus',row.id)
      const url='/money?'+params,start=Array.from(answer).length
      const finance=result.measure==='receipts_all'&&(industry==='finance'||graph.nodes.find(n=>n.id===row.id)?.industry==='finance')
      const amount=aud(row.total_aud)
      const identity=result.by_donor.find(d=>d.id===row.id),name=identity?.href?`[${plain(row.name)}](${new URL(identity.href,'https://opax.com.au').href})`:plain(row.name)
      // Mostly Other Receipt: say the type, never "loans" (no receipt is matched to a declared debt).
      const all=aud(row.all_types_aud)+(row.other_receipts_aud>=row.all_types_aud/2&&row.other_receipts_aud>0?' (mostly other receipts)':'')
      answer+=`\n| ${name}${tag(row)} | ${amount} | ${share(row.total_aud)} | ${result.typed&&result.measure!=='receipts_all'?all:row.receipts.toLocaleString('en-AU')} |${donationCells(row)}`
      cite(start,`${row.name}: ${amount}`,url,`${row.name}: ${aud(row.total_aud)} in ${labelFor(finance?'finance':industry)}, ${period}, ${recordCount(row.receipts)}; share ${share(row.total_aud)} of ${aud(result.total_aud)}; all receipt types ${aud(row.all_types_aud)}.`,{party:row.party,source:fromDonors?row.name:allFlows?String((row as {donor?:string}).donor):plain(result.subject),amount:row.total_aud,period,jurisdiction,measure:result.measure,measure_label,...(industry?{filter:industry}:{}),...(fromDonors||allFlows?{}:{aggregate:true})})
    }
    for(const row of rows)appendRow(row)
    const more=ranked.length-rows.length
    if(more){
      const rest=ranked.slice(rows.length),amount=rest.reduce((sum,r)=>sum+r.total_aud,0),records=rest.reduce((sum,r)=>sum+r.receipts,0),all=rest.reduce((sum,r)=>sum+r.all_types_aud,0),other=rest.reduce((sum,r)=>sum+r.other_receipts_aud,0)
      const start=Array.from(answer).length,includesLoans=''
      answer+=`\n| Other ${fromDonors||allFlows?'sources':'parties'} (${more} more in the selection) | ${aud(amount)}${includesLoans} | ${share(amount)} | ${result.typed&&result.measure!=='receipts_all'?aud(all)+(other>=all/2&&other>0?' (mostly other receipts)':''):records.toLocaleString('en-AU')} |${sumCells(rest)}`
      cite(start,'Remaining sources',result.sources[0].url,`${aud(amount)} in ${measure_label}, ${period}; ${records} records across ${more} sources; share ${share(amount)}${result.typed&&result.measure!=='receipts_all'?`; all receipt types ${aud(all)}`:''}.`)
    }
    const start=Array.from(answer).length,includesLoans=''
    // The total sums the rows shown.
    const shownAll=ranked.reduce((sum,r)=>sum+r.all_types_aud,0),shownOther=ranked.reduce((sum,r)=>sum+r.other_receipts_aud,0)
    const allTotal=aud(Math.round(shownAll*100)/100)+(shownOther>=shownAll/2&&shownOther>0?' (mostly other receipts)':'')
    answer+=`\n| Total, ${ranked.length} ${fromDonors||allFlows?ranked.length===1?'source':'sources':ranked.length===1?'party':'parties'} | ${aud(result.total_aud)}${includesLoans} | 100% | ${result.typed&&result.measure!=='receipts_all'?allTotal:result.receipts.toLocaleString('en-AU')} |${sumCells(ranked)}`
    cite(start,'Whole selection',result.sources[0].url,`${aud(result.total_aud)} in ${measure_label}, ${period}; ${ranked.length} ${fromDonors||allFlows?'sources':'parties'} with figures in this measure; ${result.receipts} records; share 100%; all receipt types ${aud(Math.round(shownAll*100)/100)}.`)
  }
  if(industry){
    const named=result.by_donor.filter(d=>d.total_aud>0&&(!options.bankGrouping||/\bbank(?:ing)?\b/i.test(d.name))).slice(0,3)
    const start=Array.from(answer).length
    answer+=`\n\nOPAX groups ${result.by_donor.length} sources as ${sector}-linked${options.bankGrouping?' (banks, insurers and investment firms)':''}; ${options.bankGrouping?'named banks':'the largest'}: `+named.map(d=>{const url=new URL(result.sources[0].url);url.searchParams.set('focus',d.id);return `[${plain(d.name)}](${url.href}) (${aud(d.total_aud)})`}).join(', ')+'.'
    cite(start,'Sources in this grouping',result.sources[0].url,answer.slice(start))
  }
  const caveat=result.typed?'These figures are party-level totals from recipient returns in OPAX’s published selection; amounts below each year’s disclosure threshold sit outside the register.':`These figures are party-level totals, including branches, for OPAX’s published ${jurisdiction==='federal'?'AEC':'disclosure'} selection; payments reported by both sides can appear twice.`
  const start=Array.from(answer).length
  answer+='\n\n'+caveat
  cite(start,'What these figures count',result.sources[0].url,caveat)
  const build=typeof graph.meta.generated==='string'?graph.meta.generated:'the published graph'
  answer+=`\n\nSource: ${jurisdiction==='federal'?'AEC Transparency Register returns':disclosureRegister(jurisdiction)}, OPAX build of ${build}. ${moneyMapLinks(result,result.sources[0].url,ranked.length>1||fromDonors||allFlows)} · [How OPAX counts money](/money/explain) · [Download the calculation data](https://opax.com.au${file})`
  if(options.member)answer+=` · [${plain(options.member.name)}’s declared interests](${options.member.href})`
  const context=moneyContext(result)
  const money_question=fundingScopeQuestion({party:result.selected_parties[0],industry,
    donor:industry?undefined:result.selected_donors.length===1?result.selected_donors[0]:undefined,
    ...result.requested_years,mode:fromDonors?'donors':allFlows?'connections':'parties'},jurisdiction)
  const money_facts=moneyFacts(money_question,allFlows?'source and recipient party':fromDonors?'source':'recipient party',context,rows,jurisdiction,result.selected_parties[0],result.total_aud)
  if(money_facts){
    money_facts.measure=result.measure;money_facts.measure_label=measure_label
    money_facts.rows=money_facts.rows.map((row,i)=>({...row,measure_label:labelFor(industry??graph.nodes.find(n=>n.id===rows[i].id)?.industry)}))
  }
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,measure:result.measure,measure_label,coverage:result.period_coverage,money_context:context,money_question,money_facts,scope:{state:jurisdiction,...(input.party?{party:input.party}:{})}}
}
