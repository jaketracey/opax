/** Deterministic associations carried from selected evidence to the writing boundary. */
export interface ClaimAtom {
  entity: string; metric: string; value: string; unit: string; chamber: string
  period: { since?: string; until?: string; label?: string }; evidenceId: string
}
export const normalClaim = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export const claimIdentity = (a: ClaimAtom) => JSON.stringify([normalClaim(a.entity),a.metric,a.value,a.unit,a.chamber,a.period])
export const numberValue = (s: string) => s.replace(/[$,%\s]/g,'').replace(/\.0+$/,'')
const datePattern=/\b\d{4}-\d{2}-\d{2}\b/g
export const censusField=(text:string)=>/^(.+?) \([^)]+\): ([^:$\d]+?) (\$?\d[\d,]*(?:\.\d+)?%?)([^()]*) \(2021 Census \(ABS\)\)/.exec(text)
export function metricOf(text: string, unit: string): string {
  const topic=/\b(?:housing|gambling|poker|immigration|asylum|climate|health|agriculture|tax(?:-budget)?|budget|education)\b/i.exec(text)?.[0].toLowerCase()
  const tag=topic?'/'+({poker:'gambling',asylum:'immigration',tax:'tax-budget',budget:'tax-budget'}[topic]??topic):''
  if(/median household income/i.test(text))return 'median_household_income'
  if(/median (?:personal )?income/i.test(text))return 'median_personal_income'
  const field=censusField(text);if(field)return 'field:'+normalClaim(field[2])
  if(unit==='%')return /loading|plus/i.test(text)?'loading':/salary|annual pay/i.test(text)?'salary':/coverage|labels? cover|topic.*cover.*%|of (?:the |our )?record/i.test(text)?'coverage':'share'+tag
  if(/base salary|base \$/i.test(text))return 'base_salary'
  if(/salary|a year as|annual pay|earned|paid.*(?:minister|politician)/i.test(text))return 'salary'
  if(/speech|spoke/i.test(text))return 'speeches'+tag
  if(/divisions|votes?\b/i.test(text))return /all aye/i.test(text)?'all_aye':/all no/i.test(text)?'all_no':/split/i.test(text)?'split':'divisions'
  if(/contract/i.test(text))return 'contracts'
  if(/grant/i.test(text))return 'grants'
  return unit.startsWith('AUD')?'receipts':'count'
}
export function metricAt(text:string,at:number,unit:string):string {
  const before=text.slice(0,at),after=text.slice(at)
  if(/% of\s*$/.test(before)&&/^\d[\d,]* topic-labelled speeches/i.test(after))return 'topic_total'
  const vote=/(all aye|all no|split|aye|no) (?:in )?$/i.exec(before)?.[1].toLowerCase()
  return vote?normalClaim(vote).replace(/ /g,'_'):metricOf(text,unit)
}
export function atomsFromText(text: string, evidenceId: string, source: {speaker?:string;url?:string;href?:string} = {}): ClaimAtom[] {
  const rate=/^(.+?): (\$[\d,]+) a year as (.+?), (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}); base (\$[\d,]+) plus ([\d.]+)%/.exec(text)
  const current=/^(.+?) \([^)]+\), (.+?): base salary (\$[\d,]+) plus a loading of ([\d.]+)%, (\$[\d,]+) a year/.exec(text)
  const label=/^([^:|]+):\s/.exec(text)?.[1]?.replace(/\s*\([^)]*\).*$/,'').trim()
  const table=text.startsWith('|')?text.split('|').map(s=>s.trim()).find(s=>/[a-z]/i.test(s)):undefined
  const entity=(rate?.[1]??current?.[1]??label??table??source.speaker??/^(.+?) (?:gave|received|was awarded)\b/.exec(text)?.[1]??'').replace(/\s+(?:received|provided|gave|led)\b.*$/i,'')
  const field=censusField(text)
  const dates=text.match(datePattern)??[]
  const period:ClaimAtom['period']=rate?{since:rate[4],until:rate[5]}:{...(dates[0]?{since:dates[0]}:{}),...(dates[1]?{until:dates[1]}:{})}
  const fiscal=/\b(?:19|20)\d{2}[–-]\d{2}(?:\d{2})?\b/.exec(text)?.[0]
  if(fiscal)period.label=fiscal
  else if(!dates.length){const year=/\b(?:19|20)\d{2}s?\b/.exec(text)?.[0];if(year)period.label=year}
  if(/^\d{4}$/.test(entity)){period.since=entity+'-01-01';period.until=entity+'-12-31'}
  const chamber=/\bsenat(?:e|or)\b/i.test(text)?'senate':/House of Representatives/i.test(text)?'representatives':/committee/i.test(text)?'committee':/federal|Prime Minister|a year as/i.test(text)?'federal':''
  const out:ClaimAtom[]=[]
  for(const m of text.matchAll(/\$\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?%?/g)) {
    const at=m.index!, value=m[0]
    if(dates.some(d=>{const i=text.indexOf(d);return at>=i&&at<i+d.length})||/^\d{4}$/.test(value)||/\d(?:st|nd|rd|th)\b/.test(text.slice(at,at+7)))continue
    let unit=value.startsWith('$')?(rate||current||/\b(?:annual|a year|per year)\b/i.test(text)?'AUD/year':/per week|weekly/i.test(text)?'AUD/week':/per month|monthly/i.test(text)?'AUD/month':'AUD'):value.endsWith('%')?'%':'count'
    let metric=metricAt(text,at,unit)
    if(field&&metric.startsWith('field:')&&!value.startsWith('$')&&!value.endsWith('%'))unit=field[4].trim()||'count'
    if(rate)metric=value===rate[2]?'salary':value===rate[6]?'base_salary':'loading'
    if(current)metric=value===current[5]?'salary':value===current[3]?'base_salary':'loading'
    out.push({entity,metric,value:numberValue(value),unit,chamber,period:{...period},evidenceId})
  }
  return out
}
/** Independent clauses retain their original offsets for Unicode citation rebasing. */
export function claimClauses(text: string): {text:string;start:number;end:number}[] {
  const out:{text:string;start:number;end:number}[]=[]
  const boundaries=[0,...[...text.matchAll(/(?<=[.!?])\s+(?=[A-Z$“"‘'(])|;\s+|,?\s+and\s+(?=(?:[A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)*\s+(?:received|recorded|earned|had|has|was|spoke)|\$\d))/gu)].map(m=>m.index!),text.length]
  for(let i=0;i<boundaries.length-1;i++){
    const raw=text.slice(boundaries[i],boundaries[i+1]),leading=/^(?:\s*[,;]?\s*and\s+|\s+)/.exec(raw)?.[0]??'',value=raw.slice(leading.length).trim()
    if(value)out.push({text:value,start:boundaries[i]+leading.length,end:boundaries[i]+leading.length+value.length})
  }
  return out
}
/** Prose duplicate identity includes the owner and scope, never the amount alone. */
export function proseClaimKeys(text: string, inheritedEntity=''): string[] {
  const subject=/^(?:In \d{4}(?:[–-]\d{2,4})?,?\s+)?(.+?)\s+(?:received|recorded|earned|had|has|was|were|spoke|gave|described|secured)\b/i.exec(text)?.[1]??inheritedEntity
  const atoms=atomsFromText(text,'prose',{speaker:subject})
  return atoms.map(a=>claimIdentity({...a,entity:a.entity||subject}))
}
