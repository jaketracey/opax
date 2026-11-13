import {receiptMeasureLabel,receiptDollars,UNTYPED_RECEIPTS_LABEL} from './receipt-copy'
import {donorAssociatedTo,donorDisclosure,returnReference,type DonorDisclosureRecord} from '../public/donor-disclosure.js'
import {financialYear, receiptPeriodQuery} from './receipt-period'
import {latestReceiptYear, readReceiptPeriod, type PeriodOption} from './receipt-reading'

type Node = DonorDisclosureRecord & { id:string; label:string; kind:string; industry?:string; group?:string; aliases?:string[] }
export type ReceiptEdge = { by_type?:Record<string,number>; by_type_year?:Record<string,Record<string,[number,number]>>; source:string; target:string; total:number; count:number; flow?:string; grant?:boolean; firstYear?:number; lastYear?:number; byYear?:Record<string,number[]> }
type CalculationEdge=ReceiptEdge&{receipt_type?:string;typed_periods?:string[];untyped?:true}
export type ReceiptMeasure = 'donations'|'receipts_all'|'other_receipts'|'subscriptions'
export type ReceiptGraph = { meta:Record<string,unknown>; nodes:Node[]; edges:ReceiptEdge[] }
export function isReceiptGraph(data:Record<string,unknown>): data is Record<string,unknown>&ReceiptGraph {
  return !!data.meta&&typeof data.meta==='object'&&Array.isArray(data.nodes)&&Array.isArray(data.edges)
    &&data.nodes.every(n=>n&&typeof n==='object'&&typeof n.id==='string'&&typeof n.label==='string'&&typeof n.kind==='string')
    &&data.edges.every(e=>e&&typeof e==='object'&&typeof e.source==='string'&&typeof e.target==='string'&&typeof e.total==='number'&&typeof e.count==='number')
}
const normal = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const aliases:Record<string,string[]> = {
  gambling:['gambling','wagering','betting','casino','casinos','pokies','poker machines'],
  property:['property','real estate','property developers'], finance:['finance','financial sector','financial services','banks','banking'],
  fossil_fuels:['fossil fuel','fossil fuels','coal','oil and gas'], mining:['mining'],
  unions:['unions','trade unions'], defence:['defence','defense'], health:['health','healthcare'],
  pharmacy:['pharmacy','pharmaceutical','pharma'], tech:['technology','tech'], media:['media'],
  agriculture:['agriculture','agricultural','farming'], hospitality:['hospitality','hotels'],
}
const scaffolding = new Set('how much how many money political donations donation funding funded fund funds receipts receipt gave given give has have did does do from to the a an of for in on by and or all total totals industry industries sector government parties party over years year between since before after flowed flow show me please fy federal australian australia queensland qld victoria vic tasmania tas'.split(' '))
const contains = (q:string, phrase:string) => (' '+q+' ').includes(' '+normal(phrase)+' ')
const receiptPartyNames = (party:Node):string[] => [party.label,...(party.aliases||[]),
  ...(party.label==='Labor'?['ALP']:[]),
  ...(party.label==='One Nation'?["Pauline Hanson's party",'Pauline Hansons party']:[]),
  ...(party.label==='Nationals'?['National Party']:[]),
  ...(['LNP','Liberal National Party'].includes(party.label)?['LNP','Liberal National Party']:[])]

/** Resolve each mention independently. A full party name masks only the
 * shorter names inside that occurrence, not another party elsewhere. */
function exactReceiptParties(graph:ReceiptGraph,query:string) {
  const parties=graph.nodes.filter(n=>n.kind==='party')
  // These compound identities must not become a shorter party (or coalition)
  // merely because the requested jurisdiction does not include that node.
  const unavailable=['LNP','Liberal National Party','Country Liberal Party'].find(name=>contains(query,name)&&
    !parties.some(p=>receiptPartyNames(p).some(alias=>normal(alias)===normal(name))))
  const q=' '+query+' ',matches:{node:Node;start:number;end:number}[]=[]
  for(const node of parties) {
    for(const phrase of new Set(receiptPartyNames(node).map(normal))) {
      if(!phrase)continue
      let start=q.indexOf(' '+phrase+' ')
      while(start>=0){matches.push({node,start,end:start+phrase.length+2});start=q.indexOf(' '+phrase+' ',start+1)}
    }
  }
  const specific=matches.filter(m=>!matches.some(other=>other.start<=m.start&&other.end>=m.end&&(other.start<m.start||other.end>m.end)))
  const ambiguous=specific.some(m=>specific.some(other=>other.start===m.start&&other.end===m.end&&other.node.id!==m.node.id))
  return {nodes:[...new Map(specific.map(m=>[m.node.id,m.node])).values()],ambiguous,unavailable}
}
/** Shared vocabulary for routing and calculation; unknown terms stay unmatched. */
export function mentionedReceiptIndustries(query:string, industries:string[]=Object.keys(aliases)):string[] {
  const q=normal(query)
  return industries.filter(ind=>(aliases[ind]||[ind.replaceAll('_',' ')]).some(term=>contains(q,term)))
}
// A company suffix can be omitted, but a shortened name must identify one donor.
const companyName = (name:string) => normal(name).replace(/\s+(?:(?:pty|proprietary)\s+)?(?:ltd|limited)$/, '')
/** Suggestions are prefix matches, never an automatic corporate identity merge. */
export function receiptDonorChoices(graph:ReceiptGraph, fragment:string):Node[] {
  const name=normal(fragment)
  if(name.length<4 || name.split(' ').length>8)return []
  return graph.nodes.filter(n=>n.kind==='donor' && [n.label,...(n.aliases||[]),...(n.lookup_names||[])].some(label=>normal(label)===name || normal(label).startsWith(name+' ')))
    .sort((a,b)=>a.label.localeCompare(b.label,'en-AU')).slice(0,6)
}

function exactReceiptDonors(graph:ReceiptGraph, query:string) {
  const donors=graph.nodes.filter(n=>n.kind==='donor'),shortCounts=new Map<string,number>()
  for(const n of donors){const short=companyName(n.label);shortCounts.set(short,(shortCounts.get(short)||0)+1)}
  const q=' '+query+' ',matches:{node:Node;phrase:string;start:number;end:number}[]=[]
  for(const node of donors) {
    const short=companyName(node.label)
    const phrases=new Set([normal(node.label),...[...(node.aliases||[]),...(node.lookup_names||[])].map(normal),...(short.length>=5&&shortCounts.get(short)===1?[short]:[])])
    for(const phrase of phrases) {
      if(!phrase)continue
      let start=q.indexOf(' '+phrase+' ')
      while(start>=0){matches.push({node,phrase,start,end:start+phrase.length+2});start=q.indexOf(' '+phrase+' ',start+1)}
    }
  }
  // Prefer the complete name at each occurrence, not an alias nested inside it.
  const specific=matches.filter(m=>!matches.some(other=>other.start<=m.start&&other.end>=m.end&&(other.start<m.start||other.end>m.end)))
  for(const match of specific) {
    const same= specific.filter(m=>m.start===match.start&&m.end===match.end)
    if(new Set(same.map(m=>m.node.id)).size>1)return {nodes:[],ambiguous:match.phrase}
    // A short alias shared with another organisation's name needs a choice.
    if(receiptDonorChoices(graph,match.phrase).some(n=>n.id!==match.node.id))return {nodes:[],ambiguous:match.phrase}
  }
  // A party word inside an identified organisation is part of the donor's
  // name. Mask that occurrence only; a separate recipient mention remains.
  const partyQuery=specific.reduce((text,m)=>text.slice(0,m.start)+' '.repeat(m.end-m.start)+text.slice(m.end),q).replace(/\s+/g,' ').trim()
  return {nodes:[...new Map(specific.map(m=>[m.node.id,m.node])).values()],ambiguous:undefined,partyQuery}
}
const rankingWords = new Set('who which what are is was were be been being gets get got getting takes take took taking receives receive received receiving gives giving donates donate donated donating donors donor sources source contributors contribution contributions largest biggest most top more less higher lower compare comparison compared versus vs than both either these those each with financial nominal aud dollars dollar amount amounts disclosed published recorded records record shown included selected selection lifetime across throughout during up until through starting ending between lobby lobbies to whom s change changed changes increase increased increases decrease decreased decreases grew growth rose fell'.split(' '))

// Broad words the calculator reads as one grouping (stated with the answer).
const readAs:Record<string,string[]>={fossil_fuels:['energy','energy companies','energy sector','energy industry','energy producers']}

/** A recognised name must not hide an unrecognised qualifier or a second name.
 * Only consume names used by the calculation, plus the question's grammar.
 * This is deliberately conservative: a clarification is safer than a partial sum.
 */
export function unmatchedReceiptRankingScope(graph:ReceiptGraph, query:string, selected:{selected_donors:string[];selected_parties:string[];selected_industries:string[]}, partyFilter?:string): string {
  const donorLabels=new Set(selected.selected_donors)
  const shortCounts=new Map<string,number>()
  for(const node of graph.nodes)if(node.kind==='donor') {
    const short=companyName(node.label)
    shortCounts.set(short,(shortCounts.get(short)||0)+1)
  }
  const phrases=graph.nodes.filter(n=>n.kind==='donor'&&donorLabels.has(n.label)).flatMap(n=>{
    const short=companyName(n.label)
    const unique=short.length>=5&&shortCounts.get(short)===1
    return [n.label,...(n.aliases||[]),...(unique?[short]:[])]
  })
  for(const industry of selected.selected_industries) phrases.push(industry.replaceAll('_',' '),...(aliases[industry]||[]),...(readAs[industry]||[]))
  for(const party of graph.nodes.filter(n=>n.kind==='party'&&(partyFilter||selected.selected_parties.includes(n.label)))) {
    phrases.push(...receiptPartyNames(party))
  }
  let remainder=' '+normal(query)+' '
  for(const phrase of [...new Set(phrases.map(normal))].sort((a,b)=>b.length-a.length)) {
    if(phrase)remainder=remainder.replaceAll(' '+phrase+' ',' ').replace(/\s+/g,' ')
  }
  return remainder.trim().split(' ').filter(w=>w&&!scaffolding.has(w)&&!rankingWords.has(w)&&!/^(?:19|20)\d{2}$/.test(w)).join(' ')
}
export const lendingQuestion = (q:string) => /\b(?:lend(?:s|ing)?|lent|loan(?:s|ed|ing)?|borrow(?:s|ed|ing|ings)?|ow(?:e|es|ed|ing)|debts?)\b/i.test(q)
export const moneyQuestion = (q:string) => lendingQuestion(q)||/\b(?:money|donat\w*|donors?|receipts?|fund(?:s|ing|ed)?|contributions?)\b/i.test(q)
const receiptRegions=[['federal'],['qld','queensland'],['vic','victoria'],['tas','tasmania'],['nsw','new south wales'],['wa','western australia'],['sa','south australia'],['nt','northern territory'],['act','australian capital territory']]
const mentionedReceiptRegions=(query:string)=>receiptRegions.filter(names=>names.some(n=>contains(normal(query),n))).map(names=>names[0])
export function receiptJurisdiction(query:string): string | null {
  const matched=mentionedReceiptRegions(query)
  if(matched.length>1) return null
  const jur=matched[0] || 'federal'
  return ['federal','qld','vic','tas'].includes(jur) ? jur : null
}


export async function receiptGraphForQuestion(query:string, load:(file:string)=>Promise<ReceiptGraph|null>, state?:string) {
  const direct=state || receiptJurisdiction(query)
  const read=async(jurisdiction:string)=>{
    const file='/graph/'+(jurisdiction==='federal'?'money.json':`money.${jurisdiction}.json`)
    const graph=await load(file)
    return graph?{graph:(graph),file,jurisdiction}:null
  }
  if(direct&&!state&&direct!=='federal') {
    // A region word inside a complete donor name ("Queensland Nickel Pty Ltd") is
    // part of the name, not a jurisdiction: with none left over, the default stands.
    const federal=await read('federal')
    const donor=federal?exactReceiptDonors(federal.graph,normal(query)):null
    if(federal&&donor&&!donor.ambiguous&&donor.nodes.length&&!mentionedReceiptRegions(donor.partyQuery??query).length)return federal
  }
  if(direct)return ['federal','qld','vic','tas'].includes(direct)?read(direct):null
  const candidates=mentionedReceiptRegions(query).filter(j=>['federal','qld','vic','tas'].includes(j))
  let selected:Awaited<ReturnType<typeof read>>=null
  for(const jurisdiction of candidates) {
    const candidate=await read(jurisdiction)
    if(!candidate)continue
    const donor=exactReceiptDonors(candidate.graph,normal(query))
    const remaining=mentionedReceiptRegions(donor.partyQuery??query)
    const regionMatch=remaining.length===1 && remaining[0]===jurisdiction || jurisdiction==='federal' && remaining.length===0
    if(donor.ambiguous || !donor.nodes.length || !regionMatch)continue
    if(selected)return null
    selected=candidate
  }
  return selected
}

/** Schema 1 publishes recipient-side amounts separately from legacy aggregates. */
function hasReceiptTypes(graph:ReceiptGraph):boolean {
  const coverage=graph.meta.receipt_types as Record<string,unknown>|undefined
  return coverage?.available===true&&coverage.schema===1&&coverage.donation_type==='donation_received'
}
const typedFinancialYear=(period:string):number|undefined=>{
  const match=/^(\d{4})-(\d{2})$/.exec(period)
  return match&&Number(match[2])===(Number(match[1])+1)%100?Number(match[1]):undefined
}

/** Adapt exporter cells to the calculator; every typed amount comes from by_type.
 * A pair the typed export holds without any type cells keeps its legacy total,
 * marked untyped, so the calculator can fall back to it when nothing else matches. */
function receiptEdges(graph:ReceiptGraph):CalculationEdge[] {
  if(!hasReceiptTypes(graph))return graph.edges
  return graph.edges.flatMap((edge):CalculationEdge[]=>!Object.values(edge.by_type??{}).some(Number.isFinite)?[{...edge,untyped:true as const}]:Object.entries(edge.by_type??{}).flatMap(([type,total])=>{
    if(!Number.isFinite(total))return []
    const periods=Object.entries(edge.by_type_year??{}).flatMap(([period,types])=>{
      const cell=types[type]
      return cell&&Number.isFinite(cell[0])&&Number.isInteger(cell[1])&&cell[1]>=0?[{period,cell}]:[]
    })
    const dated=periods.flatMap(({period,cell})=>{
      const year=typedFinancialYear(period)
      return year===undefined?[]:[{year,cell}]
    })
    return [{...edge,receipt_type:type,total,count:periods.reduce((sum,{cell})=>sum+cell[1],0),
      byYear:Object.fromEntries(dated.map(({year,cell})=>[String(year),cell])),
      typed_periods:periods.filter(({cell})=>cell[0]||cell[1]).map(({period})=>period),
      firstYear:dated.length?Math.min(...dated.map(({year})=>year)):undefined,
      lastYear:dated.length?Math.max(...dated.map(({year})=>year)):undefined}]
  }))
}

/** Lifetime disclosed receipts to one party, used only to order same-name choices. */
function receiptTotalTo(graph:ReceiptGraph,partyId:string) {
  return graph.edges.reduce((sum,e)=>sum+(!e.flow&&!e.grant&&e.target===partyId&&Number.isFinite(e.total)?e.total:0),0)
}

/** Sum only donor-to-party receipt edges; node totals and public-money flows never enter the sum. */
export function receiptAnswer(graph:ReceiptGraph, query:string, jurisdiction:string, origin:string, filters: {party?:string; from?:string; to?:string; compareYears?:boolean; measure?:ReceiptMeasure} = {}) {
  if(lendingQuestion(query))return {needs_scope:true,answer:jurisdiction==='federal'?'The published records cannot establish how much was lent. Federal debt records report balances owed at 30 June, not new lending, and name only the latest year’s largest creditors. Mixed receipt totals cannot establish loan amounts.':'The receipt records cannot establish how much was lent; a separate record identifying loans and their basis is needed.',sources:jurisdiction==='federal'?[{title:'AEC debt records: balance owed at 30 June; latest year only',url:origin+'/graph/aec-extras.json'}]:[],jurisdiction}
  if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)) return null
  // The question's own period is read into an explicit financial-year window;
  // the reading is stated with the answer and the other readings are offered.
  const latest=latestReceiptYear(graph)
  const read=readReceiptPeriod(query,latest,{compare:!!filters.compareYears||!!(filters.from&&filters.to)})
  let periodReading=read.reading,periodOptions:PeriodOption[]=read.options
  let periodQuery=receiptPeriodQuery(read.query)
  if(periodQuery.error) {
    // A period these records cannot place: answer across every published year and say so.
    periodQuery={query:periodQuery.query.replace(/\b(?:(?:19|20)\d{2}(?:\s*[/–—‑-]\s*\d{2,4})?|calendar|quarters?|months?|weeks?|days?|halves|half|ending|ended|financial|fiscal|fy)\b/gi,' ').replace(/\s+/g,' ').trim()}
    periodReading='Reading this across all published financial years, because these records are grouped by financial year.'
    periodOptions=latest===undefined?[]:[{label:`${financialYear(latest)} only`,from:latest,to:latest}]
  }
  query=periodQuery.query
  // A broad word with one natural grouping in this map is read as that
  // grouping, and the reading is stated with the answer.
  let scopeReading:string|undefined
  const scopeOptions:{label:string;party?:string}[]=[]
  const groupings=new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry))
  if(!exactReceiptDonors(graph,normal(query)).nodes.length) {
    if(/\b(?:banks|banking)\b/i.test(query)&&groupings.has('finance'))
      scopeReading='Reading banks as the finance grouping in this map, which also holds insurers and investment firms.'
    else if(/\benergy\b/i.test(query)&&!mentionedReceiptIndustries(query).includes('fossil_fuels')&&groupings.has('fossil_fuels')) {
      query=query.replace(/\b(?:the\s+)?energy(?:\s+(?:companies|sector|industry|lobby|producers))?\b/gi,'fossil fuels')
      scopeReading='Reading energy as the fossil fuels grouping, which holds the energy producers in this map.'
    }
  }
  const q=normal(query), nodes=new Map(graph.nodes.map(n=>[n.id,n]))
  let industries=mentionedReceiptIndustries(query,[...new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry).filter((v):v is string=>!!v))])
  const named=exactReceiptDonors(graph,q)
  if(named.ambiguous)return {needs_scope:true,donor_query:named.ambiguous,answer:'Which organisation do you mean? Matching names in this map include '+receiptDonorChoices(graph,named.ambiguous).map(n=>n.label).join('; ')+'. Please use the full organisation name.',sources:[],jurisdiction}
  const exactDonors=named.nodes

  if(exactDonors.length) industries=[]
  const donors=exactDonors.length?exactDonors:graph.nodes.filter(n=>n.kind==='donor' && industries.includes(n.industry||''))
  const namedParties=exactReceiptParties(graph,named.partyQuery??q)
  if(!filters.party&&namedParties.unavailable)return {needs_scope:true,answer:`${namedParties.unavailable} is not a recipient party in this map. Choose the matching jurisdiction or a party listed in this map. No total has been calculated.`,sources:[],jurisdiction}
  // A name shared by several recipient parties: answer for the party with
  // the most disclosed receipts, say so, and offer the others.
  if(!filters.party&&namedParties.ambiguous&&namedParties.nodes.length>1) {
    const ranked=[...namedParties.nodes].sort((a,b)=>receiptTotalTo(graph,b.id)-receiptTotalTo(graph,a.id)||a.label.localeCompare(b.label,'en-AU'))
    namedParties.nodes=[ranked[0]]
    scopeReading=`That name matches ${ranked.map(n=>n.label).join(' and ').replace(/ and (?=.* and )/g,', ')} in this map; this answer is for ${ranked[0].label}, the party with the most disclosed receipts.`
    scopeOptions.push(...ranked.slice(1).map(n=>({label:n.label,party:n.label})))
  }
  const partyFilter=filters.party
  const parties=partyFilter?graph.nodes.filter(n=>n.kind==='party'&&normal(n.label)===normal(partyFilter)):namedParties.nodes
  const all=/^who are the top donors by disclosed receipts/.test(q) || /\b(?:all|total) (?:political )?(?:receipts|donations|party funding)\b/.test(q) || /^(?:who donates the most(?: money)?(?: to who(?:m)?)?|(?:who are the )?(?:biggest|largest|top) political donors)$/.test(q)
  if(filters.party && !parties.length) return null
  if(!donors.length&&!industries.length){
    const fragment=unmatchedReceiptRankingScope(graph,query,{selected_donors:[],selected_parties:parties.map(n=>n.label),selected_industries:[]},filters.party)
    if(receiptDonorChoices(graph,fragment).length)return {needs_scope:true,donor_query:fragment,answer:'Matching names in this map include '+receiptDonorChoices(graph,fragment).map(n=>n.label).join('; ')+'. Please use the full organisation name so separate records are not combined.',sources:[],jurisdiction}
  }
  if(!donors.length&&!parties.length&&!all) return null
  const years=[...query.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]))
  let from:number|undefined,to:number|undefined
  if(years.length>=2) { from=Math.min(...years);to=Math.max(...years) }
  if(years.length===1) {
    if(/\b(?:since|from|after)\s+(?:19|20)\d{2}\b/.test(q)) from=years[0]+(/\bafter\s+(?:19|20)\d{2}\b/.test(q)?1:0)
    else if(/\b(?:before|until|through)\s+(?:19|20)\d{2}\b/.test(q)) to=years[0]-(/\bbefore\s+(?:19|20)\d{2}\b/.test(q)?1:0)
    else from=to=years[0]
  }
  if(filters.from && /^\d{4}$/.test(filters.from)) from=Number(filters.from)
  if(filters.to && /^\d{4}$/.test(filters.to)) to=Number(filters.to)
  const donorIds=new Set(donors.map(n=>n.id)),partyIds=new Set(parties.map(n=>n.id))
  const totals=new Map<string,{id:string,name:string,href?:string|null,return_reference?:string,returnReferences?:unknown[],total_aud:number,receipts:number,all_types_aud:number,other_receipts_aud:number,donations_aud:number,donations_by_year:Record<string,number>}>()
  const donorTotals=new Map<string,{id:string,name:string,href?:string|null,return_reference?:string,returnReferences?:unknown[],associated?:string,total_aud:number,receipts:number,all_types_aud:number,other_receipts_aud:number}>()
  const industryTotals=new Map<string,{id:string,name:string,href?:string|null,return_reference?:string,returnReferences?:unknown[],total_aud:number,receipts:number,all_types_aud:number,other_receipts_aud:number}>()
  // One row per donor-to-party pair: typed edges are split by receipt type above and merged back here.
  const flows=new Map<string,{donor_id:string,donor:string,donor_href:string|null,return_reference:string,party_id:string,party:string,associated?:string,total_aud:number,receipts:number,all_types_aud:number,other_receipts_aud:number}>()
  const candidates=receiptEdges(graph).filter(edge=>{
    const donor=nodes.get(edge.source),party=nodes.get(edge.target)
    if(edge.flow||edge.grant||donor?.kind!=='donor'||party?.kind!=='party'||(donors.length&&!donorIds.has(donor.id))||(parties.length&&!partyIds.has(party.id))||(industries.length&&!donors.length))return false
    if(from===undefined&&to===undefined)return Number.isFinite(edge.total)&&Number.isFinite(edge.count)&&!!(edge.total||edge.count)
    return Object.entries(edge.byYear??{}).some(([year,value])=>Number(year)>=(from??0)&&Number(year)<=(to??9999)&&Number.isFinite(value[0])&&Number.isFinite(value[1])&&!!(value[0]||value[1]))
  })
  // On the typed export, pairs without type cells count only when every matching
  // pair lacks them: the answer then gives their legacy total, labelled as such.
  const typedCandidates=candidates.filter(edge=>!edge.untyped)
  const typeFallback=hasReceiptTypes(graph)&&candidates.length>0&&!typedCandidates.length
  const eligible=typeFallback?candidates:typedCandidates
  const typed=hasReceiptTypes(graph)&&!typeFallback
  const has=(type:string)=>eligible.some(edge=>edge.receipt_type===type)
  const measure:ReceiptMeasure=typeFallback?'receipts_all':filters.measure??(typed?(has('donation_received')?'donations':has('other_receipt')?'other_receipts':has('subscription')?'subscriptions':'receipts_all'):'receipts_all')
  const selectedType=({donations:'donation_received',other_receipts:'other_receipt',subscriptions:'subscription'} as Record<string,string>)[measure]
  let cents=0,count=0,allCents=0,otherCents=0,first=Infinity,last=-Infinity,matching=0
  const eventPeriods=new Set<string>()
  for(const edge of eligible) {
    const donor=nodes.get(edge.source),party=nodes.get(edge.target)
    if(edge.flow||edge.grant||donor?.kind!=='donor'||party?.kind!=='party'||(donors.length&&!donorIds.has(donor.id))||(parties.length&&!partyIds.has(party.id))) continue
    // A named industry with no visible donors must never select every industry.
    if(industries.length&&!donors.length) continue
    let amount=0,receipts=0
    const selected=!typed||!selectedType||edge.receipt_type===selectedType
    if(from!==undefined||to!==undefined) {
      for(const [year,value] of Object.entries(edge.byYear||{})) {
        const y=Number(year);if(y<(from??0)||y>(to??9999)||!Number.isFinite(value[0])||!Number.isFinite(value[1]))continue
        amount+=Math.round(value[0]*100);receipts+=value[1];if(selected&&(value[0]||value[1])){first=Math.min(first,y);last=Math.max(last,y)}
      }
    } else {
      if(!Number.isFinite(edge.total)||!Number.isFinite(edge.count))continue
      amount=Math.round(edge.total*100);receipts=edge.count
      if(selected){
        if(Number.isFinite(edge.firstYear))first=Math.min(first,edge.firstYear!)
        if(Number.isFinite(edge.lastYear))last=Math.max(last,edge.lastYear!)
        for(const period of edge.typed_periods??[])if(typedFinancialYear(period)===undefined)eventPeriods.add(period)
      }
    }
    if(!receipts&&!amount)continue
    const allAmount=amount,otherAmount=typed&&edge.receipt_type==='other_receipt'?amount:0
    allCents+=allAmount;otherCents+=otherAmount
    if(!selected){amount=0;receipts=0}
    matching++;cents+=amount;count+=receipts
    const previous=totals.get(party.id)||{id:party.id,name:party.label,total_aud:0,receipts:0,all_types_aud:0,other_receipts_aud:0,donations_aud:0,donations_by_year:{}}
    previous.all_types_aud+=allAmount/100;previous.other_receipts_aud+=otherAmount/100;previous.total_aud+=amount/100;previous.receipts+=receipts;totals.set(party.id,previous)
    // Donation-only amounts (AEC "Donation Received") per financial year and in total.
    if(typed&&edge.receipt_type==='donation_received') {
      previous.donations_aud+=allAmount/100
      for(const [year,value] of Object.entries(edge.byYear||{})) {
        const y=Number(year);if((from!==undefined||to!==undefined)&&(y<(from??0)||y>(to??9999))||!Number.isFinite(value[0]))continue
        previous.donations_by_year[year]=Math.round(((previous.donations_by_year[year]??0)+value[0])*100)/100
      }
    }
    const donorTotal=donorTotals.get(donor.id)||{id:donor.id,name:donor.label,href:donorDisclosure(donor).href,return_reference:returnReference((donor.returnReferences || []).find(ref=>!from || Number(String(ref.year).slice(0,4))>=from && (!to || Number(String(ref.year).slice(0,4))<=to)) || donor.returnReferences?.[0] || {}),total_aud:0,receipts:0,all_types_aud:0,other_receipts_aud:0}
    // The AEC register line rides only on receipts to the party the register ties the donor to (export rule 9).
    const associated=donorAssociatedTo(donor,party.label)
    if(associated)donorTotal.associated=associated
    donorTotal.all_types_aud+=allAmount/100;donorTotal.other_receipts_aud+=otherAmount/100;donorTotal.total_aud+=amount/100;donorTotal.receipts+=receipts;donorTotals.set(donor.id,donorTotal)
    if(donor.industry) {
      const industryTotal=industryTotals.get(donor.industry)||{id:donor.industry,name:donor.industry.replaceAll('_',' '),total_aud:0,receipts:0,all_types_aud:0,other_receipts_aud:0}
      industryTotal.all_types_aud+=allAmount/100;industryTotal.other_receipts_aud+=otherAmount/100;industryTotal.total_aud+=amount/100;industryTotal.receipts+=receipts;industryTotals.set(donor.industry,industryTotal)
    }
    const flowKey=donor.id+'|'+party.id,flow=flows.get(flowKey)
    if(flow){flow.total_aud+=amount/100;flow.receipts+=receipts;flow.all_types_aud+=allAmount/100;flow.other_receipts_aud+=otherAmount/100}
    else flows.set(flowKey,{donor_id:donor.id,donor:donor.label,donor_href:donorDisclosure(donor).href,return_reference:returnReference((donor.returnReferences || []).find(ref=>!from || Number(String(ref.year).slice(0,4))>=from && (!to || Number(String(ref.year).slice(0,4))<=to)) || donor.returnReferences?.[0] || {}),party_id:party.id,party:party.label,...(associated?{associated}:{}),total_aud:amount/100,receipts,all_types_aud:allAmount/100,other_receipts_aud:otherAmount/100})
  }
  const params=new URLSearchParams({jur:jurisdiction,type:'receipts'})
  if(industries.length===1)params.set('industry',industries[0])
  if(parties.length===1)params.set('party',parties[0].id)
  if(donors.length===1&&!industries.length)params.set('focus',donors[0].id)
  if(from!==undefined)params.set('from',String(from))
  if(to!==undefined)params.set('to',String(to))
  const url=origin+'/money?'+params
  // Donation-led answers also link the map's Donation-only view of the same selection.
  const donationsUrl=typed&&measure==='donations'?origin+'/money?'+new URLSearchParams([...params,['receipt','donations']]):undefined
  const subject=industries.length?industries.map(i=>i.replaceAll('_',' ')).join(' and '):donors.length?donors.map(n=>n.label).slice(0,3).join(', '):parties.map(n=>n.label).join(', ')||'all donors shown'
  const fiscalPeriod=Number.isFinite(first)?first===last?financialYear(first):`${financialYear(first)} to ${financialYear(last)}`:null
  const period=[fiscalPeriod,...eventPeriods].filter(Boolean).join('; ')||null
  const amount=receiptDollars(cents/100),measure_label=typeFallback?UNTYPED_RECEIPTS_LABEL:receiptMeasureLabel(measure,industries[0]??(exactDonors.length===1?exactDonors[0].industry:undefined))
  return {
    answer:[periodReading,scopeReading].filter(Boolean).map(r=>r+' ').join('')+(matching?`${subject}: ${amount} in ${measure_label}, financial years ${period}, across ${count.toLocaleString('en-AU')} records.`:from===undefined&&to===undefined?`OPAX holds no matching ${subject} receipts in its published records. Explore the [money map](${url}) to see what it holds.`:`OPAX holds ${subject} receipts in other financial years. Explore the [money map](${url}) to choose a held period.`),
    period_coverage: { since: Number.isFinite(first) ? `${first}-01-01` : null, until: Number.isFinite(last) ? `${last}-12-31` : null,
      as_of: typeof graph.meta.generated === 'string' ? graph.meta.generated.slice(0, 10) : null,
      requested_since: from === undefined ? undefined : `${from}-01-01`, requested_until: to === undefined ? undefined : `${to}-12-31`,
      matched: matching > 0, basis: 'financial_year_start', note: 'Years identify financial years by starting year, not calendar-year totals; only matching recorded receipts in the published selection.' },
    measure,measure_label,typed,...(typeFallback?{type_breakdown:false as const}:{}),all_types_aud:allCents/100,other_receipts_aud:otherCents/100,total_aud:cents/100,receipts:count,period,requested_years:{from:from??null,to:to??null},jurisdiction,subject,
    by_party:[...totals.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100,all_types_aud:Math.round(t.all_types_aud*100)/100,other_receipts_aud:Math.round(t.other_receipts_aud*100)/100,donations_aud:Math.round(t.donations_aud*100)/100,
      // Per-year donations travel only for a bounded window, where answers show them.
      donations_by_year:from!==undefined&&to!==undefined?t.donations_by_year:{}})).sort((a,b)=>b.total_aud-a.total_aud),
    by_donor:[...donorTotals.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100,all_types_aud:Math.round(t.all_types_aud*100)/100,other_receipts_aud:Math.round(t.other_receipts_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
    by_industry:[...industryTotals.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100,all_types_aud:Math.round(t.all_types_aud*100)/100,other_receipts_aud:Math.round(t.other_receipts_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
    flows:[...flows.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100,all_types_aud:Math.round(t.all_types_aud*100)/100,other_receipts_aud:Math.round(t.other_receipts_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
    selected_donors:donors.map(d=>d.label),
    selected_parties:parties.map(p=>p.label),
    selected_industries:industries,
    read_query:query,
    ...(periodReading?{period_reading:periodReading}:{}),period_options:periodOptions,
    ...(scopeReading?{scope_reading:scopeReading}:{}),scope_options:scopeOptions,
    scope:'Party-level totals for sources in the published OPAX money map.',
    period_note:'Years use the first year of a financial year; election returns may use the polling year. Undated receipts are excluded when a year filter is requested. Dollar amounts are nominal, not inflation-adjusted.',
    coverage:graph.meta.coverage,methodology:graph.meta.methodology,generated:graph.meta.generated,
    sources:[{title:`${subject}: disclosed party receipts`,url},...(donationsUrl&&matching?[{title:`${subject}: donations received`,url:donationsUrl}]:[])],
  }
}
