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
// A company suffix can be omitted, but a shortened name must identify one donor.
const companyName = (name:string) => normal(name).replace(/\s+(?:(?:pty|proprietary)\s+)?(?:ltd|limited)$/, '')
const rankingWords = new Set('who which what are is was were be been being gets get got getting takes take took taking receives receive received receiving gives giving donates donate donated donating donors donor contributors contribution contributions largest biggest most top more less higher lower compare comparison compared versus vs than both either these those each with financial nominal aud dollars dollar amount amounts disclosed published recorded records record shown included selected selection lifetime across throughout during up until through starting ending between lobby lobbies to whom s'.split(' '))

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
    phrases.push(party.label,...(party.aliases||[]))
    if(party.label==='Labor')phrases.push('ALP')
    if(party.label==='Nationals')phrases.push('National Party')
    if(['LNP','Liberal National Party'].includes(party.label))phrases.push('LNP','Liberal National Party')
  }
  let remainder=' '+normal(query)+' '
  for(const phrase of [...new Set(phrases.map(normal))].sort((a,b)=>b.length-a.length)) {
    if(phrase)remainder=remainder.replaceAll(' '+phrase+' ',' ').replace(/\s+/g,' ')
  }
  return remainder.trim().split(' ').filter(w=>w&&!scaffolding.has(w)&&!rankingWords.has(w)&&!/^(?:19|20)\d{2}$/.test(w)).join(' ')
}
export const moneyQuestion = (q:string) => /\b(?:money|donat\w*|donors?|receipts?|funding|funded|contributions?)\b/i.test(q)
export function receiptJurisdiction(query:string): string | null {
  const q=normal(query)
  const matched=[['qld','queensland'],['vic','victoria'],['tas','tasmania'],['nsw','new south wales'],['wa','western australia'],['sa','south australia'],['nt','northern territory'],['act','australian capital territory']].filter(names=>names.some(n=>contains(q,n)))
  if(matched.length>1 || (matched.length && /\bfederal\b/.test(q))) return null
  const jur=matched[0]?.[0] || 'federal'
  return ['federal','qld','vic','tas'].includes(jur) ? jur : null
}

/** Sum only donor-to-party receipt edges; node totals and public-money flows never enter the sum. */
export function receiptAnswer(graph:ReceiptGraph, query:string, jurisdiction:string, origin:string, filters: {party?:string; from?:string; to?:string} = {}) {
  if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)) return null
  const q=normal(query), nodes=new Map(graph.nodes.map(n=>[n.id,n]))
  let industries=[...new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.industry).filter((v):v is string=>!!v))].filter(ind=>(aliases[ind]||[ind.replaceAll('_',' ')]).some(term=>contains(q,term)))
  const words=q.split(' ').filter(w=>!scaffolding.has(w)&&!/^\d+$/.test(w))
  const nameMatches=(n:Node) => [n.label,...(n.aliases||[])].some(label=>contains(q,label) || (words.length>0 && words.every(w=>normal(label).split(' ').includes(w))))
  const exactDonors=graph.nodes.filter(n=>n.kind==='donor'&&[n.label,...(n.aliases||[])].some(label=>contains(q,label)))
  if(!exactDonors.length) {
    const shortened=graph.nodes.filter(n=>n.kind==='donor'&&companyName(n.label).length>=5&&contains(q,companyName(n.label)))
    if(shortened.length===1)exactDonors.push(shortened[0])
  }
  if(!exactDonors.length && /\b(?:banks|banking)\b/.test(q)) return {needs_scope:true,answer:'Banks are grouped with other finance organisations in this map. For a like-for-like comparison, ask about the finance sector or name a specific bank.',sources:[],jurisdiction}
  if(!exactDonors.length && /\benergy\b/.test(q) && !industries.includes('fossil_fuels')) return {needs_scope:true,answer:'Energy can include fossil fuels and renewables. Please name the industry or company you want to compare.',sources:[],jurisdiction}
  if(exactDonors.length) industries=[]
  const donors=exactDonors.length?exactDonors:graph.nodes.filter(n=>n.kind==='donor' && (industries.length ? industries.includes(n.industry||'') : nameMatches(n)))
  const lnp=/\bliberal national party\b|\blnp\b/.test(q)
  const parties=graph.nodes.filter(n=>n.kind==='party' && (filters.party ? normal(n.label)===normal(filters.party) : lnp?['LNP','Liberal National Party'].includes(n.label):(nameMatches(n) || (n.label==='Labor' && /\balp\b/.test(q)) || (n.label==='Nationals' && /\bnational party\b/.test(q)))))
  const all=/\b(?:all|total) (?:political )?(?:receipts|donations|party funding)\b/.test(q) || /^(?:who donates the most(?: money)?(?: to who(?:m)?)?|(?:who are the )?(?:biggest|largest|top) political donors)$/.test(q)
  if(filters.party && !parties.length) return null
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
  const period=Number.isFinite(first)?`${first}–${String(first+1).slice(-2)} to ${last}–${String(last+1).slice(-2)}`:null
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
