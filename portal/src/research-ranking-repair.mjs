import {partyAliases,jurisdictions,normaliseRankingPeriod,rankingScopeMatches,resolvedRankingScope,sourceMetadata} from './research-ranking-scope.mjs'

// This grammar grants permission. Partial matches and unconsumed tokens never do.
const normal=s=>String(s).trim().toLowerCase().replace(/[’]/g,"'").replace(/[–—]/g,'-').replace(/\s+/g,' ').replace(/[?.]$/,'')
const partySlot=new RegExp('^(?:the )?('+[...partyAliases].sort(([a],[b])=>(Number(b==='LNP')-Number(a==='LNP'))).map(([,re])=>re.source).join('|')+')(?= |$)','i')
const jurSlot=new RegExp('^('+jurisdictions.map(([,re])=>re.source).join('|')+')(?= |$)','i')
// An industry slot is typed tool scope, so a list of a party's largest sources cannot answer for one industry.
const industries={gambling:'gambling',mining:'mining','fossil fuel':'fossil_fuels',finance:'finance',property:'property',health:'health',hospitality:'hospitality',media:'media',tech:'tech'}
/** The industry a question names, by the tool's own vocabulary. */
export const questionIndustry=question=>Object.entries(industries).find(([word])=>new RegExp('\\b'+word+'\\b','i').test(question))?.[1]
const exact=(re,text)=>new RegExp('^(?:'+re.source+')$','i').test(text)
export function rankingRepairQuestion(question,constraints={}, {unqualified=false}={}){
 let rest=normal(constraints.resolved_question??question),company=false,hanson=false,industry
 const prefix=/^(who|which company|which ([a-z ]+?) (?:companies|donors|businesses|organisations|organizations)) (?:gives|gave|give|donates|donated|donate) the most(?: money)? to /.exec(rest)
 if(prefix){
  company=prefix[1]==='which company';rest=rest.slice(prefix[0].length)
  if(prefix[2]){industry=industries[prefix[2]];if(!industry)return null}
 }
 else if(rest.startsWith('top donors to '))rest=rest.slice('top donors to '.length)
 else if(rest.startsWith('who does ')){hanson=true;rest=rest.slice('who does '.length)}
 else return null
 const named=jurSlot.exec(rest),before=named&&partySlot.test(rest.slice(named[0].length+1))?named:null
 if(before)rest=rest.slice(before[0].length+1)
 const match=partySlot.exec(rest);if(!match)return null
 const party=partyAliases.find(([,re])=>exact(re,match[1]))?.[0];if(!party)return null
 rest=rest.slice(match[0].length)
 if(hanson){const ending=' take the most money from';if(!rest.startsWith(ending))return null;rest=rest.slice(ending.length)}
 let jurisdiction=before?jurisdictions.find(([,re])=>exact(re,before[1]))?.[0]:undefined,period
 while(rest){
  if(!rest.startsWith(' in '))return null
  rest=rest.slice(4)
  const year=/^((?:19|20)\d{2}(?:-\d{2})?)(?= |$)/.exec(rest)
  if(year){
   if(period)return null
   const [start,end]=year[1].split('-');if(end&&Number(end)!==(Number(start)+1)%100)return null
   period=normaliseRankingPeriod(year[1]);rest=rest.slice(year[0].length);continue
  }
  const jur=jurSlot.exec(rest);if(!jur||jurisdiction)return null
  jurisdiction=jurisdictions.find(([,re])=>exact(re,jur[1]))?.[0];if(!jurisdiction)return null
  rest=rest.slice(jur[0].length)
  if(rest===' disclosures')rest=''
  else if(rest.startsWith(' disclosures '))rest=rest.slice(' disclosures'.length)
 }
 if(unqualified&&(jurisdiction||period))return null
 return {party,jurisdiction:jurisdiction??'federal',entity_type:company?'company':'donor',period,...(industry?{industry}:{})}
}
/** All fact slots must match; donor is a typed tool relationship, never a name heuristic. */
export function repairSlotsMatch(form,question,row,constraints={}){
 if(!form||!rankingScopeMatches(question,row,constraints)||row.aggregate||(row.filter||undefined)!==form.industry)return false
 if(constraints.chamber||!form.period&&constraints.period&&constraints.period.kind!=='all')return false
 const meta=sourceMetadata(row.source),actual=resolvedRankingScope('',{jurisdiction:meta.jurisdiction||'federal',party:row.party})
 if(meta.chamber)return false // The grammar has no chamber slot.
 if(constraints.entity_type&&!((form.entity_type==='company'?['company','corporation']:['donor']).includes(String(constraints.entity_type).toLowerCase())))return false
 if(actual.jurisdiction!==form.jurisdiction||actual.party!==form.party)return false
 const type=String(row.entity_type??meta.entity_type??'').toLowerCase()
 const allowed=['donor','person','individual','company','corporation','organisation','organization']
 if(!allowed.includes(type)||form.entity_type==='company'&&!['company','corporation'].includes(type))return false
 return !form.period||form.period===normaliseRankingPeriod(row.period)
}
