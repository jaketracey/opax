import {partyAliases,jurisdictions,normaliseRankingPeriod,rankingScopeMatches,resolvedRankingScope,sourceMetadata} from './research-ranking-scope.mjs'

// This grammar grants permission. Partial matches and unconsumed tokens never do.
const normal=s=>String(s).trim().toLowerCase().replace(/[’]/g,"'").replace(/[–—]/g,'-').replace(/\s+/g,' ').replace(/[?.]$/,'')
const partySlot=new RegExp('^(?:the )?('+[...partyAliases].sort(([a],[b])=>(Number(b==='LNP')-Number(a==='LNP'))).map(([,re])=>re.source).join('|')+')(?= |$)','i')
const jurSlot=new RegExp('^('+jurisdictions.map(([,re])=>re.source).join('|')+')(?= |$)','i')
const exact=(re,text)=>new RegExp('^(?:'+re.source+')$','i').test(text)
export function rankingRepairQuestion(question){
 let rest=normal(question),company=false,hanson=false
 const prefix=/^(who|which company) (?:gives|gave|donates|donated) the most(?: money)? to /.exec(rest)
 if(prefix){company=prefix[1]==='which company';rest=rest.slice(prefix[0].length)}
 else if(rest.startsWith('top donors to '))rest=rest.slice('top donors to '.length)
 else if(rest.startsWith('who does ')){hanson=true;rest=rest.slice('who does '.length)}
 else return null
 const match=partySlot.exec(rest);if(!match)return null
 const party=partyAliases.find(([,re])=>exact(re,match[1]))?.[0];if(!party)return null
 rest=rest.slice(match[0].length)
 if(hanson){const ending=' take the most money from';if(!rest.startsWith(ending))return null;rest=rest.slice(ending.length)}
 let jurisdiction,period
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
 return {party,jurisdiction:jurisdiction??'federal',entity_type:company?'company':'donor',period}
}
/** All fact slots must match; donor is a typed tool relationship, never a name heuristic. */
export function repairSlotsMatch(form,question,row,constraints={}){
 if(!form||!rankingScopeMatches(question,row,constraints))return false
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
