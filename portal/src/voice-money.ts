import {financialYear, receiptPeriodQuery, separateReceiptYears} from './receipt-period'

type Node = { id:string; label:string; kind:string; industry?:string; group?:string; aliases?:string[] }
type Edge = { source:string; target:string; total:number; count:number; flow?:string; grant?:boolean; firstYear?:number; lastYear?:number; byYear?:Record<string,number[]> }
export type ReceiptGraph = { meta:Record<string,unknown>; nodes:Node[]; edges:Edge[] }
export function isReceiptGraph(data:Record<string,unknown>): data is Record<string,unknown>&ReceiptGraph {
  return !!data.meta&&typeof data.meta==='object'&&Array.isArray(data.nodes)&&Array.isArray(data.edges)
    &&data.nodes.every(n=>n&&typeof n==='object'&&typeof n.id==='string'&&typeof n.label==='string'&&typeof n.kind==='string')
    &&data.edges.every(e=>e&&typeof e==='object'&&typeof e.source==='string'&&typeof e.target==='string'&&typeof e.total==='number'&&typeof e.count==='number')
}
const normal = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const aliases:Record<string,string[]> = {
  gambling:['gambling','wagering','betting','casino','casinos','pokies','poker machines'],
  property:['property','real estate','property developers'], finance:['finance','financial sector','financial services'],
  fossil_fuels:['fossil fuel','fossil fuels','coal','oil and gas'], mining:['mining'],
  unions:['unions','trade unions'], defence:['defence','defense'], health:['health','healthcare'],
  pharmacy:['pharmacy','pharmaceutical','pharma'], tech:['technology','tech'], media:['media'],
  agriculture:['agriculture','agricultural','farming'], hospitality:['hospitality','hotels'],
}
const scaffolding = new Set('how much how many money political donations donation funding funded fund funds receipts receipt gave given give has have did does do from to the a an of for in on by and or all total totals industry industries sector government parties party over years year between since before after flowed flow show me please federal australian australia queensland qld victoria vic tasmania tas'.split(' '))
const contains = (q:string, phrase:string) => (' '+q+' ').includes(' '+normal(phrase)+' ')
const receiptPartyNames = (party:Node):string[] => [party.label,...(party.aliases||[]),
  ...(party.label==='Labor'?['ALP']:[]),
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
  return graph.nodes.filter(n=>n.kind==='donor' && [n.label,...(n.aliases||[])].some(label=>normal(label)===name || normal(label).startsWith(name+' ')))
    .sort((a,b)=>a.label.localeCompare(b.label,'en-AU')).slice(0,6)
}

function exactReceiptDonors(graph:ReceiptGraph, query:string) {
  const donors=graph.nodes.filter(n=>n.kind==='donor'),shortCounts=new Map<string,number>()
  for(const n of donors){const short=companyName(n.label);shortCounts.set(short,(shortCounts.get(short)||0)+1)}
  const q=' '+query+' ',matches:{node:Node;phrase:string;start:number;end:number}[]=[]
  for(const node of donors) {
    const short=companyName(node.label)
    const phrases=new Set([normal(node.label),...(node.aliases||[]).map(normal),...(short.length>=5&&shortCounts.get(short)===1?[short]:[])])
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
    if(match.phrase!==normal(match.node.label) && receiptDonorChoices(graph,match.phrase).some(n=>n.id!==match.node.id))return {nodes:[],ambiguous:match.phrase}
  }
  // A party word inside an identified organisation is part of the donor's
  // name. Mask that occurrence only; a separate recipient mention remains.
  const partyQuery=specific.reduce((text,m)=>text.slice(0,m.start)+' '.repeat(m.end-m.start)+text.slice(m.end),q).replace(/\s+/g,' ').trim()
  return {nodes:[...new Map(specific.map(m=>[m.node.id,m.node])).values()],ambiguous:undefined,partyQuery}
}
const rankingWords = new Set('who which what are is was were be been being gets get got getting takes take took taking receives receive received receiving gives giving donates donate donated donating donors donor contributors contribution contributions largest biggest most top more less higher lower compare comparison compared versus vs than both either these those each with financial nominal aud dollars dollar amount amounts disclosed published recorded records record shown included selected selection lifetime across throughout during up until through starting ending between lobby lobbies to whom s change changed changes increase increased increases decrease decreased decreases grew growth rose fell'.split(' '))

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
  for(const industry of selected.selected_industries) phrases.push(industry.replaceAll('_',' '),...(aliases[industry]||[]))
  for(const party of graph.nodes.filter(n=>n.kind==='party'&&(partyFilter||selected.selected_parties.includes(n.label)))) {
    phrases.push(...receiptPartyNames(party))
  }
  let remainder=' '+normal(query)+' '
  for(const phrase of [...new Set(phrases.map(normal))].sort((a,b)=>b.length-a.length)) {
    if(phrase)remainder=remainder.replaceAll(' '+phrase+' ',' ').replace(/\s+/g,' ')
  }
  return remainder.trim().split(' ').filter(w=>w&&!scaffolding.has(w)&&!rankingWords.has(w)&&!/^(?:19|20)\d{2}$/.test(w)).join(' ')
}
export const moneyQuestion = (q:string) => /\b(?:money|donat\w*|donors?|receipts?|funding|funded|contributions?)\b/i.test(q)
const receiptRegions=[['federal'],['qld','queensland'],['vic','victoria'],['tas','tasmania'],['nsw','new south wales'],['wa','western australia'],['sa','south australia'],['nt','northern territory'],['act','australian capital territory']]
const mentionedReceiptRegions=(query:string)=>receiptRegions.filter(names=>names.some(n=>contains(normal(query),n))).map(names=>names[0])
export function receiptJurisdiction(query:string): string | null {
  const matched=mentionedReceiptRegions(query)
  if(matched.length>1) return null
  const jur=matched[0] || 'federal'
  return ['federal','qld','vic','tas'].includes(jur) ? jur : null
}

/** Ordinary questions read one graph. If region words conflict, a complete
 * donor name may explain one of them ("The Federal Group in Tasmania").
 * Check only named, supported regions and require the remaining words to
 * identify that same graph. Never merge jurisdictions or guess from totals. */
export async function receiptGraphForQuestion(query:string, load:(file:string)=>Promise<ReceiptGraph|null>, state?:string) {
  const direct=state || receiptJurisdiction(query)
  const read=async(jurisdiction:string)=>{
    const file='/graph/'+(jurisdiction==='federal'?'money.json':`money.${jurisdiction}.json`)
    const graph=await load(file)
    return graph?{graph,file,jurisdiction}:null
  }
  if(direct)return ['federal','qld','vic','tas'].includes(direct)?read(direct):null
  const candidates=mentionedReceiptRegions(query).filter(j=>['federal','qld','vic','tas'].includes(j))
  let selected:Awaited<ReturnType<typeof read>>=null
  for(const jurisdiction of candidates) {
    const candidate=await read(jurisdiction)
    if(!candidate)continue
    const donor=exactReceiptDonors(candidate.graph,normal(query))
    const remaining=mentionedReceiptRegions(donor.partyQuery??query)
    if(donor.ambiguous || !donor.nodes.length || remaining.length!==1 || remaining[0]!==jurisdiction)continue
    if(selected)return null
    selected=candidate
  }
  return selected
}

/** Sum only donor-to-party receipt edges; node totals and public-money flows never enter the sum. */
export function receiptAnswer(graph:ReceiptGraph, query:string, jurisdiction:string, origin:string, filters: {party?:string; from?:string; to?:string; compareYears?:boolean} = {}) {
  if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)) return null
  const periodQuery=receiptPeriodQuery(query)
  if(periodQuery.error)return {needs_period:true,answer:periodQuery.error,sources:[],jurisdiction}
  query=periodQuery.query
  if(separateReceiptYears(query)&&!filters.compareYears&&!(filters.from&&filters.to)) return {needs_period:true,answer:'Choose one financial year or a continuous range using “from … to …”. Separate years cannot be pooled without including the years between them.',sources:[],jurisdiction}
  const q=normal(query), nodes=new Map(graph.nodes.map(n=>[n.id,n]))
  let industries=mentionedReceiptIndustries(query,[...new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry).filter((v):v is string=>!!v))])
  const named=exactReceiptDonors(graph,q)
  if(named.ambiguous)return {needs_scope:true,donor_query:named.ambiguous,answer:'Which organisation do you mean? Matching names in this map include '+receiptDonorChoices(graph,named.ambiguous).map(n=>n.label).join('; ')+'. Please use the full organisation name.',sources:[],jurisdiction}
  const exactDonors=named.nodes
  if(!exactDonors.length && /\b(?:banks|banking)\b/.test(q)) return {needs_scope:true,answer:'Banks are grouped with other finance organisations in this map. For a like-for-like comparison, ask about the finance sector or name a specific bank.',sources:[],jurisdiction}
  if(!exactDonors.length && /\benergy\b/.test(q) && !industries.includes('fossil_fuels')) return {needs_scope:true,answer:'Energy can include fossil fuels and renewables. Please name the industry or company you want to compare.',sources:[],jurisdiction}
  if(exactDonors.length) industries=[]
  const donors=exactDonors.length?exactDonors:graph.nodes.filter(n=>n.kind==='donor' && industries.includes(n.industry||''))
  const namedParties=exactReceiptParties(graph,named.partyQuery??q)
  if(!filters.party&&namedParties.unavailable)return {needs_scope:true,answer:`${namedParties.unavailable} is not a recipient party in this map. Choose the matching jurisdiction or a party listed in this map. No total has been calculated.`,sources:[],jurisdiction}
  if(!filters.party&&namedParties.ambiguous)return {needs_scope:true,answer:'That name matches more than one recipient party in this map. Please use the full party name so separate records are not combined.',sources:[],jurisdiction}
  const partyFilter=filters.party
  const parties=partyFilter?graph.nodes.filter(n=>n.kind==='party'&&normal(n.label)===normal(partyFilter)):namedParties.nodes
  const all=/\b(?:all|total) (?:political )?(?:receipts|donations|party funding)\b/.test(q) || /^(?:who donates the most(?: money)?(?: to who(?:m)?)?|(?:who are the )?(?:biggest|largest|top) political donors)$/.test(q)
  if(filters.party && !parties.length) return null
  if(!donors.length&&!industries.length){
    const fragment=unmatchedReceiptRankingScope(graph,query,{selected_donors:[],selected_parties:parties.map(n=>n.label),selected_industries:[]},filters.party)
    if(receiptDonorChoices(graph,fragment).length)return {needs_scope:true,donor_query:fragment,answer:'Matching names in this map include '+receiptDonorChoices(graph,fragment).map(n=>n.label).join('; ')+'. Please use the full organisation name so separate records are not combined.',sources:[],jurisdiction}
  }
  if(!donors.length&&!parties.length&&!all) return null
  // Ambiguous relative periods cannot silently become lifetime totals.
  if(!filters.from && !filters.to && /\b(?:last|past|recent|recently|latest|this year|last year|decade)\b/.test(q)) return {needs_period:true,answer:'Choose the financial years for this comparison so I can give the right subtotal.',sources:[],jurisdiction}
  const years=[...query.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]))
  let from:number|undefined,to:number|undefined
  if(years.length>2) return {needs_period:true,answer:'Please choose one start and end financial year.',sources:[],jurisdiction}
  if(years.length===2) { from=Math.min(...years);to=Math.max(...years) }
  if(years.length===1) {
    if(/\b(?:since|from|after)\s+(?:19|20)\d{2}\b/.test(q)) from=years[0]+(/\bafter\s+(?:19|20)\d{2}\b/.test(q)?1:0)
    else if(/\b(?:before|until|through)\s+(?:19|20)\d{2}\b/.test(q)) to=years[0]-(/\bbefore\s+(?:19|20)\d{2}\b/.test(q)?1:0)
    else from=to=years[0]
  }
  if(filters.from && /^\d{4}$/.test(filters.from)) from=Number(filters.from)
  if(filters.to && /^\d{4}$/.test(filters.to)) to=Number(filters.to)
  const donorIds=new Set(donors.map(n=>n.id)),partyIds=new Set(parties.map(n=>n.id))
  const totals=new Map<string,{id:string,name:string,total_aud:number,receipts:number}>()
  const donorTotals=new Map<string,{id:string,name:string,total_aud:number,receipts:number}>()
  const industryTotals=new Map<string,{id:string,name:string,total_aud:number,receipts:number}>()
  const flows: {donor_id:string,donor:string,party_id:string,party:string,total_aud:number,receipts:number}[]=[]
  let cents=0,count=0,first=Infinity,last=-Infinity,matching=0
  for(const edge of graph.edges) {
    const donor=nodes.get(edge.source),party=nodes.get(edge.target)
    if(edge.flow||edge.grant||donor?.kind!=='donor'||party?.kind!=='party'||(donors.length&&!donorIds.has(donor.id))||(parties.length&&!partyIds.has(party.id))) continue
    // A named industry with no visible donors must never select every industry.
    if(industries.length&&!donors.length) continue
    let amount=0,receipts=0
    if(from!==undefined||to!==undefined) {
      for(const [year,value] of Object.entries(edge.byYear||{})) {
        const y=Number(year);if(y<(from??0)||y>(to??9999)||!Number.isFinite(value[0])||!Number.isFinite(value[1]))continue
        amount+=Math.round(value[0]*100);receipts+=value[1];first=Math.min(first,y);last=Math.max(last,y)
      }
    } else {
      if(!Number.isFinite(edge.total)||!Number.isFinite(edge.count))continue
      amount=Math.round(edge.total*100);receipts=edge.count
      if(Number.isFinite(edge.firstYear))first=Math.min(first,edge.firstYear!)
      if(Number.isFinite(edge.lastYear))last=Math.max(last,edge.lastYear!)
    }
    if(!receipts&&!amount)continue
    matching++;cents+=amount;count+=receipts
    const previous=totals.get(party.id)||{id:party.id,name:party.label,total_aud:0,receipts:0}
    previous.total_aud+=amount/100;previous.receipts+=receipts;totals.set(party.id,previous)
    const donorTotal=donorTotals.get(donor.id)||{id:donor.id,name:donor.label,total_aud:0,receipts:0}
    donorTotal.total_aud+=amount/100;donorTotal.receipts+=receipts;donorTotals.set(donor.id,donorTotal)
    if(donor.industry) {
      const industryTotal=industryTotals.get(donor.industry)||{id:donor.industry,name:donor.industry.replaceAll('_',' '),total_aud:0,receipts:0}
      industryTotal.total_aud+=amount/100;industryTotal.receipts+=receipts;industryTotals.set(donor.industry,industryTotal)
    }
    flows.push({donor_id:donor.id,donor:donor.label,party_id:party.id,party:party.label,total_aud:amount/100,receipts})
  }
  const params=new URLSearchParams({jur:jurisdiction,type:'receipts'})
  if(industries.length===1)params.set('industry',industries[0])
  if(parties.length===1)params.set('party',parties[0].id)
  if(donors.length===1&&!industries.length)params.set('focus',donors[0].id)
  if(from!==undefined)params.set('from',String(from))
  if(to!==undefined)params.set('to',String(to))
  const url=origin+'/money?'+params
  const subject=industries.length?industries.map(i=>i.replaceAll('_',' ')).join(' and '):donors.length?donors.map(n=>n.label).slice(0,3).join(', '):parties.map(n=>n.label).join(', ')||'all donors shown'
  const period=Number.isFinite(first)?first===last?financialYear(first):`${financialYear(first)} to ${financialYear(last)}`:null
  const amount=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(cents/100)
  return {
    answer:matching?`The ${jurisdiction} records shown on Opax list ${amount} in disclosed party receipts for ${subject}, across ${count} receipts${period?' in '+period:''}. This is the published map selection, not an exhaustive industry total.`:'No matching receipts are shown in this selection and period. This does not establish that no funding occurred.',
    total_aud:cents/100,receipts:count,period,requested_years:{from:from??null,to:to??null},jurisdiction,subject,
    by_party:[...totals.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
    by_donor:[...donorTotals.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
    by_industry:[...industryTotals.values()].map(t=>({...t,total_aud:Math.round(t.total_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
    flows:flows.sort((a,b)=>b.total_aud-a.total_aud),
    selected_donors:donors.map(d=>d.label),
    selected_parties:parties.map(p=>p.label),
    selected_industries:industries,
    scope:'Only donor-to-party receipts shown on the published Opax map; excludes off-map donors and public money. Do not present as all industry funding, payments to government, or personal payments to MPs.',
    period_note:'Years use the first year of a financial year; election returns may use the polling year. Undated receipts are excluded when a year filter is requested. Dollar amounts are nominal, not inflation-adjusted.',
    coverage:graph.meta.coverage,methodology:graph.meta.methodology,generated:graph.meta.generated,
    sources:[{title:`${subject}: disclosed party receipts`,url}],
  }
}
