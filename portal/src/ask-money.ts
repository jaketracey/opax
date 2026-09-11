import type { RecordQuestion } from './ask-records'
import {isReceiptGraph, moneyQuestion, receiptAnswer, receiptJurisdiction} from './voice-money'

/** Rankings use receipt edges, never the model's retrieved sample. */
export function isMoneyRanking(input: RecordQuestion): boolean {
  const q=input.question||''
  if(input.kind && !['all','receipt'].includes(input.kind) || input.speaker || input.chamber || input.topic || input.context?.length) return false
  if(/\b(?:say|said|says|speeches?|stance|position|vot\w*|influence|favours?|why|personal\w*|MPs?|senators?|politicians?|grants?|contracts?|blood|organ|charity|except|excluding|without|percent\w*|share|average)\b/i.test(q)) return false
  return (moneyQuestion(q)||/\b(?:takes?|gets?|receives?)\b.*\blobby\b/i.test(q)) && /\b(?:largest|biggest|most|top)\b/i.test(q)
}
const aud=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n)
const plain=(s:string)=>s.replace(/[|\n\r\[\]*]/g,' ')

export async function rankedMoneyAnswer(input: RecordQuestion, assets: Fetcher) {
  if(!isMoneyRanking(input)) return null
  const query=input.question||''
  const jurisdiction=input.state || receiptJurisdiction(query)
  if(!jurisdiction || !['federal','qld','vic','tas'].includes(jurisdiction)) return null
  const file='/graph/'+(jurisdiction==='federal'?'money.json':`money.${jurisdiction}.json`)
  const response=await assets.fetch(new Request('https://opax.com.au'+file))
  if(!response.ok) throw new Error('Receipt data unavailable')
  const graph=await response.json() as Record<string,unknown>
  if(!isReceiptGraph(graph)) throw new Error('Receipt data invalid')
  const result=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au',input)
  if(!result) return null
  if('needs_period' in result) return {answer:result.answer,citations:{},sources:[],answer_status:'needs_period'}
  if(result.selected_parties.length>1) return null
  if(/\bfrom\s+(?!(?:19|20)\d{2}\b)/i.test(query) && !result.selected_industries.length && !result.selected_donors.length) return null
  const donorIntent = !/\b(?:receiv\w*|takes?|gets?)\b/i.test(query) && (/\b(?:biggest|largest|top)\b[^?.]{0,60}\bdonors?\b/i.test(query) || (/^who\s+donat\w*\b/i.test(query) && !/\bto who(?:m)?\b/i.test(query)))
  const fromDonors=result.selected_parties.length>0 || donorIntent
  const allFlows=!result.selected_parties.length && !result.selected_industries.length && !result.selected_donors.length && !fromDonors
  const rows=(allFlows ? result.flows.map(r=>({name:`${r.donor} → ${r.party}`,total_aud:r.total_aud,receipts:r.receipts,id:r.donor_id,party:r.party}))
    : (fromDonors?result.by_donor:result.by_party).map(r=>({...r,party:fromDonors?result.selected_parties[0]:r.name}))).slice(0,5)
  const who=rows[0], recipient=result.selected_parties.join(' and '), sector=result.selected_industries.map(i=>i.replaceAll('_',' ')).join(' and ')
  const lead=who ? allFlows ? `The largest donor-to-party connection in this published selection is **${plain(who.name)}: ${aud(who.total_aud)}**.`
    : fromDonors ? `**${plain(who.name)}** has the largest disclosed total${recipient?` to ${plain(recipient)}`:''}${sector?` among ${plain(sector)} donors`:''} in this published selection: **${aud(who.total_aud)}**.`
    : `**${plain(who.name)}** received the most disclosed funding${sector?` from ${plain(sector)} donors`:` from ${plain(result.subject)}`} in this published selection: **${aud(who.total_aud)}**.`
    : result.answer
  const sources: {resource:string;title:string;href:string;url:string;kind:string;snippet:string;cited:boolean;date?:string}[]=[]
  const citations: Record<string,number[][]>={}
  let answer=lead
  if (/\bdonat/i.test(query)) answer+=' These figures rank disclosed receipts, which include more than gifts; they are not a donations-only ranking.'
  const cite=(title:string,href:string,snippet:string,offset=0)=>{
    const resource=`receipt-ranking-${sources.length}`
    citations[resource]=[[Array.from(answer).length-offset-1,Array.from(answer).length-offset]]
    sources.push({resource,title,href,url:href,kind:'receipt',snippet,cited:true,date:typeof graph.meta.generated==='string'?graph.meta.generated:undefined})
  }
  cite('Disclosed receipts: calculation and source data',file,`${lead} ${result.scope} ${result.period_note}`)
  answer+=`\n\nRecorded years: **${result.period||'No matching dated records'}** · ${jurisdiction==='federal'?'Federal (AEC)':jurisdiction.toUpperCase()}. Amounts are nominal Australian dollars.`
  if(rows.length){
    answer+=`\n\n| ${allFlows?'Donor → party':fromDonors?'Donor':'Recipient party'} | Disclosed receipts | Records |\n| --- | ---: | ---: |`
    for(const row of rows){
      answer+=`\n| ${plain(row.name)} | ${aud(row.total_aud)} | ${row.receipts.toLocaleString('en-AU')} |`
      const params=new URLSearchParams(new URL(result.sources[0].url).search)
      if(row.party)params.set('party',graph.nodes.find(n=>n.kind==='party'&&n.label===row.party)?.id||row.party)
      if(fromDonors||allFlows)params.set('focus',row.id)
      cite(`${row.name}: ${aud(row.total_aud)}`, '/money?'+params,`${row.name}: ${aud(row.total_aud)}, ${row.receipts} receipts. ${result.period}. Calculated from donor-to-party edges in ${file}.`,2)
    }
  }
  answer+='\n\nThese are **party receipts, not personal payments to politicians**, and not all receipts are gifts. An industry grouping is not proof of coordinated lobbying or influence.'
  answer+=`\n\nCoverage: Only receipts included in Opax’s published map are ranked. This is a selection, not every donor or an exhaustive industry total. Years use the first year of each financial year; election returns may use the polling year. Undated records are excluded from year-filtered answers.`
  answer+=`\n\n[Explore these records](${result.sources[0].url}) · [Download the calculation data](${file})`
  return {answer,citations,sources,answer_status:'calculated',money_ranking:true,scope:{state:jurisdiction,...(input.party?{party:input.party}:{})}}
}
