// Repair permission uses evidence scope, never a donor's name or an unrelated coverage paragraph.
export const jurisdictions=[['federal',/\b(?:federal|commonwealth)\b/i],['nsw',/\b(?:nsw|new south wales)\b/i],['vic',/\b(?:vic|victoria|victorian)\b/i],['qld',/\b(?:qld|queensland)\b/i],['sa',/\b(?:sa|south australia|south australian)\b/i],['wa',/\b(?:wa|western australia|western australian)\b/i],['tas',/\b(?:tas|tasmania|tasmanian)\b/i],['act',/\b(?:act|australian capital territory)\b/i],['nt',/\b(?:nt|northern territory)\b/i]]
export const partyAliases=[['One Nation',/\b(?:one nation|phon|pauline hanson[’']s one nation|pauline hanson[’']?s? party)\b/i],['Labor',/\b(?:labor|alp|australian labor party)\b/i],['Liberal',/\bliberal(?: party)?\b/i],['Greens',/\bgreens?\b/i],['Nationals',/\b(?:nationals?|national party)\b/i],['LNP',/\b(?:lnp|liberal national party)\b/i]]
const one=(values)=>{const unique=[...new Set(values.filter(Boolean))];return unique.length===1?unique[0]:unique.length?'conflict':undefined}
const party=value=>one(partyAliases.filter(([,re])=>re.test(String(value??'').replace(/\bliberal national party\b/ig,'LNP'))).map(([name])=>name))
const jurisdiction=value=>jurisdictions.find(([,re])=>re.test(String(value??'')))?.[0]
const chamber=value=>one([/\bsenat(?:e|ors?)\b/i.test(String(value))?'senate':undefined,/\b(?:house(?: of representatives)?|representatives|lower house)\b/i.test(String(value))?'representatives':undefined])
const entity=value=>({individual:'person',person:'person',company:'company',corporation:'company',organisation:'organisation',organization:'organisation',donor:'donor'})[String(value??'').toLowerCase()]
function period(value){
 if(value&&typeof value==='object'){
  if(value.kind==='all')return undefined
  if(value.since&&value.until){
   const a=String(value.since),b=String(value.until)
   if(a.endsWith('-07-01')&&b.endsWith('-06-30'))return `fy:${a.slice(0,4)}-${String(Number(a.slice(0,4))+1).slice(-2)}:fy:${Number(b.slice(0,4))-1}-${b.slice(2,4)}`
   if(a.endsWith('-01-01')&&b.endsWith('-12-31'))return `year:${a.slice(0,4)}:year:${b.slice(0,4)}`
   return `date:${a}:${b}`
  }
  if(value.since||value.until)return 'unknown'
  value=value.label
 }
 const text=String(value??'').replace(/[–—]/g,'-')
 const dates=[...text.matchAll(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g)].map(m=>m[0])
 if(dates.length)return `date:${dates[0]}:${dates.at(-1)}`
 const financial=[...text.matchAll(/\b((?:19|20)\d{2})-(\d{2})(?!-\d)\b/g)].map(m=>`fy:${m[1]}-${m[2]}`)
 if(financial.length)return financial[0]+':'+financial.at(-1)
 const years=[...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>'year:'+m[0])
 return years.length?years[0]+':'+years.at(-1):undefined
}
/** Preserve resolved request filters. Explicit question constraints must also agree with them. */
export function resolvedRankingScope(question,constraints={}){
 question=constraints.resolved_question??question
 const explicitJur=one(jurisdictions.filter(([,re])=>re.test(question)).map(([name])=>name))??(/\bstate (?:returns|disclosures|donations)\b/i.test(question)?'unknown':undefined)
 const explicitType=/\bwhich (?:company|corporation)\b/i.test(question)?'company':/\bwhich (?:person|individual)\b/i.test(question)?'person':/\bwhich organi[sz]ation\b/i.test(question)?'organisation':undefined
 const explicitPeriod=period(question),resolvedPeriod=period(constraints.period)
 // Unqualified receipt questions use the same federal default as receiptGraphForQuestion.
 return {jurisdiction:explicitJur==='act'&&constraints.actUnfiltered?'unknown':one([explicitJur,constraints.jurisdiction?jurisdiction(constraints.jurisdiction)??'unknown':undefined])??'federal',chamber:one([chamber(question),constraints.chamber?chamber(constraints.chamber)??'unknown':undefined]),party:one([party(question),constraints.party?party(constraints.party)??'unknown':undefined]),entity_type:one([explicitType,constraints.entity_type?entity(constraints.entity_type)??'unknown':undefined]),period:explicitPeriod&&resolvedPeriod&&!periodAgrees(resolvedPeriod,explicitPeriod)?'conflict':explicitPeriod??resolvedPeriod}
}
export function sourceMetadata(source){
 let params=new URLSearchParams(),pathParty='';try{const url=new URL(source.url??source.href,'https://opax.invalid');params=url.searchParams;pathParty=decodeURIComponent(/^\/money\/party\/([^/]+)/.exec(url.pathname)?.[1]??'')}catch{}
 return {party:source.scope?.party??source.party??params.get('party')??pathParty,jurisdiction:source.scope?.jurisdiction??source.jurisdiction??params.get('jur')??params.get('jurisdiction')??params.get('state')??'',chamber:source.scope?.chamber??source.chamber??params.get('chamber'),entity_type:source.scope?.entity_type??source.entity_type??params.get('entity_type')}
}
function periodAgrees(wanted,actual){
 if(wanted===actual)return true
 // Money filters use the first year of a financial year, as declared by the tool.
 return wanted?.startsWith('year:')&&actual?.startsWith('fy:')&&wanted.replaceAll('year:','')===actual.replaceAll(/fy:(\d{4})-\d{2}/g,'$1')
}
/** All constrained dimensions must match this fact; unknown evidence cannot grant permission. */
function evidenceScope(row){
 const meta=sourceMetadata(row.source)
 const actualJur=meta.jurisdiction?jurisdiction(meta.jurisdiction):(/\(federal disclosures\b|\bFederal \(AEC\)|\bFederal AEC donation returns\b|\bBased on AEC political disclosure records\b/i.test(row.source.snippet??'')||/\bfederal (?:disclosed )?(?:donor|disclosure|receipt|political|record)/i.test(row.source.title??'')?'federal':undefined)
 return {jurisdiction:actualJur,chamber:chamber(meta.chamber),party:one([party(row.party),party(meta.party)]),entity_type:entity(row.entity_type??meta.entity_type),period:period(row.period)}
}
export function rankingScopeMatches(question,row,constraints={}){
 const required=resolvedRankingScope(question,constraints),actual=evidenceScope(row)
 if(!actual.jurisdiction||!actual.period||actual.period==='unknown'||row.donor!==false&&(!actual.party||!required.party))return false
 // A question about donors permits any donor type; a company/person restriction needs typed evidence.
 return Object.entries(required).every(([dimension,wanted])=>{
  if(!wanted)return true
  if(wanted==='conflict'||wanted==='unknown'||!actual[dimension]||actual[dimension]==='conflict')return false
  if(dimension==='period')return periodAgrees(wanted,actual.period)
  return actual[dimension]===wanted
 })
}

/** Coverage can join a repaired ranking only when its own selection scope agrees. */
export function rankingCoverageMatches(question,source,rows,constraints={}){
 const coverage={source,party:sourceMetadata(source).party,period:source.snippet},scope=evidenceScope(coverage)
 return rankingScopeMatches(question,coverage,constraints)&&rows.some(row=>{
  const fact=evidenceScope(row)
  return ['jurisdiction','party','period'].every(dimension=>scope[dimension]===fact[dimension])
 })
}
/** Legacy exports may borrow a period only from coverage for that same selection. */
export function associatedRankingPeriod(source,recipient,sources){
 const fact=evidenceScope({source,party:recipient}),matches=[]
 for(const coverage of sources){
  const label=/financial years ((?:19|20)\d{2}[–-]\d{2} to (?:19|20)\d{2}[–-]\d{2})/i.exec(coverage.snippet??'')?.[1]
  if(!label)continue
  const scope=evidenceScope({source:coverage,party:sourceMetadata(coverage).party,period:label})
  if(fact.jurisdiction&&fact.party&&['jurisdiction','party','chamber','entity_type'].every(dimension=>fact[dimension]===scope[dimension]))matches.push(label)
 }
 return new Set(matches.map(period)).size===1?matches[0]:undefined
}

/** Non-donor ranking facts need the same conjunction, with their own typed figure scope. */
function atomMatches(question,source,atom,constraints){
 const declared=chamber(sourceMetadata(source).chamber),owned=chamber(atom.chamber)
 if(declared&&owned&&declared!==owned)return false
 return rankingScopeMatches(question,{source:{...source,chamber:declared??owned},party:sourceMetadata(source).party,period:atom.period,entity_type:source.entity_type,donor:false},constraints)
}
export function rankingFactMatches(question,source,claim,constraints={}){
 const atoms=(source.claim_atoms??[]).filter(a=>String(a.value)===String(claim.value)&&a.unit===claim.unit)
 return atoms.some(atom=>atomMatches(question,source,atom,constraints))
}
export function rankingSourceMatches(question,source,constraints={}){
 const atoms=source.claim_atoms??[]
 return atoms.length>0&&atoms.every(atom=>atomMatches(question,source,atom,constraints))
}

export const normaliseRankingPeriod=period
