// Pure selected-evidence audit, shared by the final boundary and the offline report.
import {PERSON_PATHS} from '../public/person-paths.js'
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()
// This generated index binds public parliamentarians.json names and their canonical slugs.
const rosterPeople=new Map(Object.entries(PERSON_PATHS.exact).flatMap(([name,path])=>[[norm(name),path],[norm(path.split('/').at(-1)),path]]))
const samePerson=(a,b)=>!!a&&!!b&&(norm(a)===norm(b)||rosterPeople.has(norm(a))&&rosterPeople.get(norm(a))===rosterPeople.get(norm(b)))
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const months=['January','February','March','April','May','June','July','August','September','October','November','December']
const partyName=s=>s?({labor:'Labor',liberal:'Liberal',coalition:'Coalition',greens:'Greens',nationals:'Nationals',alp:'ALP'}[s.toLowerCase()]??s):s
const words={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eighth:8,half:.5,quarter:.25}
const number=v=>Number(v.replace(/[$,%\s]/g,''))
function scanQuotes(text){
 const quotes=[];let start=-1,close='',unclosed=-1
 for(let i=0;i<text.length;i++){
  const c=text[i],before=/[\p{L}\p{N}]/u.test(text[i-1]??''),after=/[\p{L}\p{N}]/u.test(text[i+1]??'')
  if(close){if(c===close&&!(before&&after&&/[’']/.test(c))){quotes.push({value:text.slice(start+1,i),at:start,end:i+1});start=-1;close=''};continue}
  if(c==='“'||c==='"'||(c==='‘'||c==="'")&&!before){start=i;close=c==='“'?'”':c==='‘'?'’':c}
  else if(c==='”')unclosed=i
 }
 return {quotes,unclosed:close?start:unclosed}
}
export const quotationSpans=text=>scanQuotes(String(text)).quotes
export const unclosedQuoteOffset=text=>scanQuotes(String(text)).unclosed
export function sentenceParts(value){
 const text=String(value),out=[],protectedText=quotationSpans(text),unclosed=unclosedQuoteOffset(text);let start=0
 const push=end=>{const raw=text.slice(start,end),prefix=/^\s*(?:[-*]\s*)?/.exec(raw)[0],part=raw.slice(prefix.length).trimEnd();if(part)out.push({text:part,at:start+prefix.length});start=end}
 for(let i=0;i<text.length;i++){
  if(protectedText.some(q=>i>=q.at&&i<q.end)||unclosed>=0&&i>=unclosed)continue
  const c=text[i]
  if(c==='\n'){push(i);start=i+1;continue}
  if(/[.!?]/.test(c)&&/^\s+[A-Z“"]/.test(text.slice(i+1)))push(i+1)
 }
 push(text.length);return out
}
function periods(text){
 const out=[]
 for(const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{4})?\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:,? \d{4})?\b|\b(?:19|20)\d{2}(?:[–-]\d{2,4}|s)?\b/g)){
  let value=m[0]
  if(!/^\d{4}/.test(value)){
   const date=/^(\d+) (\w+)(?: (\d{4}))?$/.exec(value),reverse=/^(\w+) (\d+),?(?: (\d{4}))?$/.exec(value)
   const day=date?.[1]??reverse?.[2],month=date?.[2]??reverse?.[1],year=date?.[3]??reverse?.[3]
   value=(year?year+'-':'')+String(months.indexOf(month)+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')
  }
  out.push({value,at:m.index,end:m.index+m[0].length,raw:m[0]})
 }
 return out
}
function figures(text){
 const dates=periods(text),out=[]
 for(const m of text.matchAll(/\$\s*\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s*(?:billion|million|thousand|bn|m)\b)?|\b\d(?:[\d,]*\d)?(?:\.\d+)?(?:%|\s+per cent)?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eighth|half|quarter)\b/gi)){
  const at=m.index,raw=m[0],tail=text.slice(at+raw.length),head=text.slice(0,at)
  if(dates.some(d=>at>=d.at&&at<d.end)||/^\d+(?:st|nd|rd|th)\b/.test(text.slice(at)))continue
  if(/^[a-z]/i.test(raw)&&! /^(?:half|quarter)$/i.test(raw)&&! /^\s*(?:[- ]state|[- ]dollars?|per cent|percent|years?|decades?|speeches|donors|records|lowest|highest)\b/i.test(tail))continue
  const amount=raw.startsWith('$')||/^(?:one|two|three|four|five|six|seven|eight|nine|ten)$/i.test(raw)&&/^[- ]dollars?\b/i.test(tail),percent=/%|per cent/i.test(raw)||/^\s*(?:per cent|percent)/i.test(tail)
  const scale=/billion|bn\b/i.test(raw)?1e9:/million|m\b/i.test(raw)?1e6:/thousand/i.test(raw)?1e3:1
  const n=words[raw.toLowerCase()]??number(raw.match(/[\d,.]+/)?.[0]??raw)
  const annual=/a year|per year|annually|AUD\/year/i.test(tail.slice(0,35))||/annual salary|annual pay|annual (?:salary )?(?:rates|entitlements)/i.test(text),weekly=/per week|weekly|AUD\/week/i.test(tail.slice(0,35));
  const unit=/^(?:half|quarter)$/i.test(raw)?'ratio':/^\s*decades?\b/i.test(tail)?'years':amount?(weekly?'AUD/week':annual?'AUD/year':'AUD'):percent?'%':/^\s*[- ]?years?\b/i.test(tail)?'years':/^\s*[- ]?months?\b/i.test(tail)?'months':/^\s*[- ]state/i.test(tail)?'states':/eighth/i.test(raw)?'rank':'count'
  let metric=unit==='ratio'?'share':unit==='%'?(/loading|plus/i.test(head.slice(-35))?'loading':/\b(?:coverage|cover|covers)\b/i.test(text)&&!/\bshare\b/i.test(text)?'coverage':'share'):amount?(/salary|a year|annual pay|Prime Minister|per week|income|Treasurer/i.test(text)?'salary':/contract|supplier/i.test(text)?'contracts':/grant/i.test(text)?'grants':'receipts'):['years','months'].includes(unit)?'duration':unit==='rank'?'ranking':/topic-labelled speeches/i.test(tail.slice(0,45))?'topic_total':/^\s*(?:chamber |gambling |immigration )?speeches/i.test(tail)?'speeches':/^\s*(?:disclosed receipt )?records/i.test(tail)?'records':/^\s*(?:Defence )?contracts/i.test(tail)?'contracts_count':/^\s*donors/i.test(tail)?'donors':'count'
  if(amount&&/\bbill\b[^.!?]*\bcosts?\b/i.test(head))metric='bill_cost'
  if(amount&&/^(?:\s*[- ]dollars?)?\s*(?:maximum )?bets\b/i.test(tail))metric='bet_limit'
  if(amount&&/\bbase\s*$/i.test(head))metric='base_salary'
  if(unit==='count'&&metric==='count'&&/speech|spoke/i.test(text))metric='speeches'
  const cuts=[0,...[...text.matchAll(/;\s*|,?\s+(?:and|while|but|whereas)\s+(?=[A-Z])/g)].map(m=>m.index+m[0].length),text.length],start=cuts.filter(n=>n<=at).at(-1),end=cuts.find(n=>n>at),local=text.slice(start,end)
  if(metric==='speeches'||metric==='share'){const topic=/housing|gambling|immigration|climate|mining(?:-energy)?|tax(?:-budget)?|budget/i.exec(local)?.[0]?.toLowerCase()??/housing|gambling|immigration|climate|mining(?:-energy)?|tax(?:-budget)?|budget/i.exec(text)?.[0]?.toLowerCase();if(topic)metric+='/'+(topic==='tax'||topic==='budget'?'tax-budget':topic)}
  const vote=/(all aye|all no|split) (?:in )?$/i.exec(head)?.[1];if(vote)metric='votes/'+norm(vote)
  const owner=partyName(/^\s+(?:dollars?\s+)?(?:to (?:the )?)?(Labor|Liberal|Coalition|Greens|Nationals|ALP)\b/i.exec(tail)?.[1])
  out.push({value:String(n*scale*(/^\s*decades?\b/i.test(tail)?10:1)),unit,metric,owner,at,end:at+raw.length,raw})
 }
 for(const f of out){const next=out.find(n=>n.at>f.at)?.at??text.length,following=dates.filter(p=>p.at>=f.end&&p.at<next);f.period=following.length?following:dates.filter(p=>p.end<=f.at).slice(-1)}
 return out
}
const parties=['Labor','Liberal','Coalition','Greens','Nationals','ALP','LNP','Australian Conservatives','Australian Democrats','One Nation','Centre Alliance','Independent']
const reportingPredicate=/\b(?:said|says|say|argu(?:ed|es)|called for|described|cited|reported|explained|introduced|presented|proposed|linked|challenged|recalled|not(?:ed|ing|es)|put a motion|disputed|asked|supported|opposed|criticised|criticized|framed|set out|told|words (?:were|are))\b/i
const financialPredicate=/\b(?:paid|receiv(?:ed|es|ing|e)|secur(?:ed|es|ing|e)|got|won|earn(?:ed|s|ing)?|given|donat(?:ed|es|ing|e)|collected|accepted)\b/i
const partyMentions=text=>mentions(text,parties).map(n=>({...n,name:partyName(n.name)}))
function amountOwners(text,f,known=[]){
 const exactNames=part=>mentions(part,known.map(n=>typeof n==='string'?n:n.surface)).map(n=>({...n,name:known.find(k=>(typeof k==='string'?k:k.surface)===n.name)?.name??n.name}))
 if(['years','months'].includes(f.unit))return []
 const before=text.slice(0,f.at).split(/[.!?;]\s+/).at(-1),after=text.slice(f.end)
 // Receipt subjects remain recipients even when a later 'to' phrase states a purpose.
 const receipt=[...before.matchAll(/\b(?:receiv(?:ed|es|ing|e)|secur(?:ed|es|ing|e)|got|won|earn(?:ed|s|ing)?|(?:was|were|been)\s+(?:paid|given|awarded))\b/gi)].at(-1)
 if(receipt){const actors=known.length?exactNames(before.slice(0,receipt.index)):nounPhrases(before.slice(0,receipt.index)),actor=actors.at(-1)
  if(actor&&/^\s*(?:\w+ly\s*)*$/.test(before.slice(actor.end,receipt.index)))return [actor.name]
 }
 // An explicit object after 'to' owns a receipt, regardless of who uttered it.
 const target=f.unit==='count'?'(?:to|for)':'to'
 const to=new RegExp('^\\s*(?:[a-z]+\\s+){0,5}'+target+'\\s+(?:the\\s+)?([^.;]+?)(?=\\s+in\\s+(?:19|20)\\d{2}|$|[.;])','i').exec(after)?.[1]
 if(to){
  const exact=exactNames(to),names=partyMentions(to)
  if(!names.length)return exact.length?[exact[0].name]:nounPhrases(to).slice(0,1).map(n=>n.name)
  const targets=(known.length?exact:[...names,...nounPhrases(to)]).sort((a,b)=>a.at-b.at||b.end-a.end).filter((n,i,all)=>!all.some((x,j)=>j!==i&&x.at<=n.at&&x.end>=n.end&&(x.end-x.at>n.end-n.at||j<i&&x.end===n.end&&x.at===n.at)))
  const group=[];let previous
  for(const target of targets){if(previous&&!/^(?:\s|,|\band\b|\bor\b|\bthe\b|\bParty\b)*$/i.test(to.slice(previous.end,target.at)))break;group.push(target.name);previous=target}
  return group.map(n=>/^(?:Labor|Liberal) Party$/i.test(n)?partyName(n.split(' ')[0]):n)
 }
 if(f.owner)return [f.owner]
 const actors=(known.length?exactNames(before):[...partyMentions(before),...nounPhrases(before)]).sort((a,b)=>a.at-b.at||b.end-a.end).filter((n,i,ns)=>!ns.some((x,j)=>j!==i&&x.at<=n.at&&x.end>=n.end&&(x.end-x.at>n.end-n.at)))
 const last=actors.at(-1)
 if(!last)return []
 // A person reporting a number is not thereby its recipient.
 if(reportingPredicate.test(before.slice(last.end))&&!financialPredicate.test(before.slice(last.end)))return []
 const group=actors.filter(n=>parties.includes(n.name))
 return group.length&&/\b(?:both|and)\b/i.test(before.slice(group[0].at))?group.map(n=>n.name):[last.name]
}
function givingActor(text,f,names,firstPerson){
 const before=text.slice(0,f.at),verb=[...before.matchAll(/\b(?:gave|donated|provided|contributed|paid)\b/gi)].at(-1)
 if(!verb||/\b(?:was|were|been|be)\s*$/i.test(before.slice(0,verb.index)))return undefined
 if(firstPerson&&/\bI\s*$/.test(before.slice(0,verb.index)))return firstPerson
 const preceding=mentions(before.slice(0,verb.index),names),actor=preceding.at(-1)
 return actor&&/^\s*(?:\w+ly\s*)*$/.test(before.slice(actor.end,verb.index))?actor.name:undefined
}
function recordName(name,row){
 const n=norm(name),text=norm(row.text),title=norm(row.title)
 if(!n)return false
 if(n==='senate')return row.chamber==='senate'||/\bsenate\b/.test(text)
 if(n==='house'||n==='house of representatives')return row.chamber==='representatives'||text.includes('house of representatives')
 return text.includes(n)||title.includes(n)||norm(row.party)===n||norm(row.entity)===n
}
function personName(name,rows){
 return !!name&&(rosterPeople.has(norm(name))||rows.some(r=>samePerson(r.speaker,name)||samePerson(r.recipient,name)))
}
// A reporting subject without a selected document/entity identity still needs an author.
const recordSubject=(name,rows)=>rows.some(r=>recordName(name,{...r,text:''}))
function reporterIn(text,scope,named,rows,until=scope.end){
 const subject=scope.owner
 if(!personName(subject,rows))return undefined
 const actor=named.find(n=>n.name===subject&&n.at>=scope.start)??named.find(n=>n.name===subject)
 return actor&&reportingPredicate.test(text.slice(actor.end,until))?subject:undefined
}
const descriptor=(text,n)=>parties.includes(n.name)&&/\b(?:passages|records|speakers)\b/i.test(text)&&!figures(text).length||/^(?:-indexed|-passages?| speaker| passage)/i.test(text.slice(n.end))||/indexed|passages?/.test(n.name)
function evidenceRows(payload){
 const rows=[]
 for(const source of Array.isArray(payload.sources)?payload.sources:[]){
  if(!source||typeof source!=='object'||typeof source.resource!=='string')continue
  const text=String(source.snippet??''),base={id:source.resource,text,date:source.date,speaker:source.speaker,recipient:source.recipient,kind:source.kind,title:source.title,party:source.party,chamber:source.chamber}
  const parts=text.split(/\n+|(?<=[.!?])\s+(?=[A-Z][^:$;\n.]{1,110}:\s*\$?\d)/)
  for(const line of parts){
   const label=/^\s*[-*]?\s*([^:|]{2,140}):/.exec(line)?.[1]
   const table=/^\|/.test(line)?line.split('|').map(s=>s.trim()).filter(Boolean):[]
   const receipt=/^Disclosed receipt: (.+?) → (.+?) [—–] \$/.exec(line),donor=/^Donor: (.+?) [—–]/.exec(line)
   const tableDonor=/\|\s*(?:Source|Donor)\s*\|/i.test(text)
   const current=/^(.+?) \([^)]+\), [^:]+: base salary/.exec(line)?.[1]
   const entity=(/^coverage(?:-|$)/.test(source.resource)?'':undefined)??(receipt?.[2]??donor?.[1]??current??(['speech','bill'].includes(source.kind)?source.speaker:undefined)??label??(table.length?table.find(s=>/[a-z]/i.test(s)):undefined)??source.speaker??'').replace(/\s*\([^)]*\).*$/,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*/g,'').replace(/\s+(?:received|provided|gave|led|has the largest)\b.*$/i,'').trim()
   const fiscal=/(?:Financial years|Period):\s*([^\n.]+)/i.exec(text)?.[1];const period=periods(line);
   const values=figures(line);for(const f of values){if(['speech','bill'].includes(source.kind)&&f.metric==='receipts'&&!f.owner){const before=line.slice(Math.max(0,f.at-120),f.at),party=[...before.matchAll(/\b(Labor|Coalition|Liberal|ALP|Greens|Nationals)(?: Party)?\b[^.;]{0,70}\b(?:received|collected|accepted)\b[^$]*$/gi)].at(-1);if(party)f.owner=partyName(party[1])}if(source.date&&/^\s*last financial year\b/i.test(line.slice(f.end))){const year=Number(source.date.slice(0,4))-(Number(source.date.slice(5,7))>=7?1:2);f.period=periods(year+'-'+String((year+1)%100).padStart(2,'0'))}}
   for(const f of values){f.donor=givingActor(line,f,nounPhrases(line).map(n=>n.name),source.speaker);f.owners=['speech','bill'].includes(source.kind)?amountOwners(line,f):[f.owner??entity].filter(Boolean)}
   for(const f of values)if(['speech','bill'].includes(source.kind)&&f.unit==='AUD'&&f.metric==='receipts'&&!financialPredicate.test(line.slice(0,f.at))&&!(label&&f.owners.some(n=>norm(n)===norm(label))))f.owners=[]
   for(const f of values)if(source.speaker&&!f.owners.length&&!quotationSpans(line).some(q=>f.at>=q.at&&f.end<=q.end)&&/\bI (?:was |have |had |have been |had been |am )?(?:paid|received|secured|got|won|earned|given)\s*(?:(?:about|almost|nearly|over|more than|at least)\s*)?$/i.test(line.slice(0,f.at)))f.owners=[source.speaker]
   for(const f of values.slice())if(!f.period.length&&!period.length&&!fiscal){
    const atoms=(Array.isArray(source.claim_atoms)?source.claim_atoms:[]).filter(a=>a.value===f.value&&a.unit===f.unit&&norm(a.entity)===norm(entity)&&typeof a.periodEvidenceId==='string')
    let bound=false
    for(const atom of atoms){
     const support=(payload.sources??[]).find(s=>atom.periodEvidenceId===s.resource||atom.periodEvidenceId.startsWith(s.resource+'/')),label=atom.period?.label
     if(typeof label!=='string'||!support||!new RegExp('^(?:Period|Financial years):\\s*'+escape(label)+'[.\\s]*$','i').test(support.snippet))continue
     const association={...f,period:periods(label),periodEvidenceId:atom.periodEvidenceId}
     if(bound)values.push(association);else{Object.assign(f,association);bound=true}
    }
   }
   rows.push({...base,text:line,entity,donor:receipt?.[1]??donor?.[1]??(tableDonor&&entity?entity:undefined),role:donor||tableDonor&&entity?'donor':undefined,period:period.length?period:fiscal?periods(fiscal):[],figures:values})
  }
 }
 return rows
}
// Bind noun phrases independently of predicate spelling. Unresolved subjects fail closed.
const quotations=quotationSpans
const introductory=new Set(('In From Until Since During Between By On At The This That These Those They He She It Another One Some Both Each Other We I None There No Nearly About Earlier Gambling Mining Housing Climate Immigration Tax Federal Topic Amounts Salary OPAX Parliament Australian Financial Coverage Please Next Further Across Below What Public MPs Hansard Census AUD A Topic-labelled').split(' '))
function nounPhrases(text){
 const quotes=quotations(text)
 return [...text.matchAll(/\b[A-Z][\p{L}'’-]*(?:[ \t]+[A-Z][\p{L}'’-]*)*/gu)].map(m=>({name:m[0].replace(/^(?:In|From|On|During|Since|Until|A|An|The|Another) /,'').replace(/[’']s$/,''),at:m.index,end:m.index+m[0].length})).filter(m=>!quotes.some(q=>m.at>=q.at&&m.end<=q.end)&&!introductory.has(m.name)&&!months.includes(m.name)&&(m.name.includes(' ')||/^(?:\s*(?:In|From|On|During|Since|Until)\s+[^,]+,?\s*)?$|(?:^|[;,])\s*(?:(?:and|but|while|whereas|because)\s*)?$|\b(?:to|by|for)\s+$/.test(text.slice(0,m.at))))
}
function claimScope(text,at,named,speakers=[]){
 const quotes=[...quotations(text),...[...text.matchAll(/\([^)]*\)/g)].map(m=>({at:m.index,end:m.index+m[0].length}))]
 const cuts=[0,...[...text.matchAll(/;\s*|,?\s+(?:and|but|while|whereas|because)\s+/g)].filter(m=>!quotes.some(q=>m.index>=q.at&&m.index<q.end)&&! /^[A-Z][\p{L}'’-]*(?:\s+(?:[A-Z][\p{L}'’-]*|to|of|the|and|for))*(?: political parties| parties)?(?: in \d{4}(?:[–-]\d{2,4})?)?\s*(?:[,).]|$)/u.test(text.slice(m.index+m[0].length))&&(named.some(n=>n.at===m.index+m[0].length)||figures(text.slice(0,m.index)).length>0||quotes.some(q=>q.end<=m.index))).map(m=>m.index+m[0].length),text.length]
 const start=cuts.filter(c=>c<=at).at(-1)??0,end=cuts.find(c=>c>at)??text.length
 const names=named.filter(n=>n.at>=start&&n.at<end&&!/^\d{4}$/.test(n.name))
 const before=names.filter(n=>n.at<=at),subject=before.find(n=>speakers.includes(n.name))??names.find(n=>speakers.includes(n.name))??before[0]??names[0]??named.find(n=>n.at<start&&!/^\d{4}$/.test(n.name))
 return {start,end,names,owner:subject?.name??''}
}
const topicPatterns=[['housing',/\b(?:housing|homes?|homeless\w*|rent\w*|accommodation)\b/i],['immigration',/immigra|migration|refugee|asylum|detention/i],['gambling',/gambl|poker|pokies|betting/i],['climate',/climate|emissions|fossil|carbon/i],['tax-budget',/tax|\bGST\b|goods and services|budget/i],['mining',/mining/i]]
function topicsMatch(text,row){return !['speech','bill'].includes(row.kind)||topicPatterns.every(([,pattern])=>!pattern.test(text)||pattern.test(row.text+' '+(row.title??'')))}
const owns=(row,entity)=>!!entity&&(norm(row.entity)===norm(entity)||norm(row.speaker)===norm(entity)||row.figures.some(f=>(f.owners??[]).some(n=>norm(n)===norm(entity))))
function mentions(text,names){const hits=names.flatMap(name=>[...text.matchAll(new RegExp('(?<![\\p{L}])'+escape(name)+'(?![\\p{L}])','giu'))].map(m=>({name,at:m.index,end:m.index+m[0].length}))).sort((a,b)=>a.at-b.at||b.end-a.end);return hits.filter((h,i)=>!hits.some((other,j)=>j!==i&&other.at<=h.at&&other.end>=h.end&&(other.end-other.at>h.end-h.at||j<i&&other.name===h.name)))}
function dateSupported(claim,row){
 const ps=[...row.period.map(p=>p.value),...(row.date?[row.date.slice(0,10)]:[])]
 if(ps.some(p=>p===claim||p.endsWith('-'+claim)))return true
 if(/^\d{4}$/.test(claim))return ps.some(p=>p.startsWith(claim)||/^(?:19|20)\d{2}[–-]\d{2,4}$/.test(p)&&claim>=p.slice(0,4)&&claim<=((p.split(/[–-]/)[1].length===2?p.slice(0,2):'')+p.split(/[–-]/)[1])||/^\d{4}-\d{2}-\d{2}$/.test(p)&&row.period.length>=2&&claim>=row.period[0].value.slice(0,4)&&claim<=row.period[1].value.slice(0,4))
 if(/^\d{4}s$/.test(claim))return ps.some(p=>p.slice(0,3)===claim.slice(0,3))
 return false
}
function metricSupported(claim,fact){
 if(claim.unit!==fact.unit&&!(claim.unit==='AUD'&&fact.unit.startsWith('AUD/')))return false
 if(claim.metric===fact.metric)return true
 return claim.metric==='count'||fact.metric==='count'||claim.metric==='receipts'&&['salary','grants','contracts'].includes(fact.metric)
}
/** Each atom records the evidence ID that establishes its complete association. */
export function auditPayload(question,payload,{roster=[]}={}){
 const rows=evidenceRows(payload),body=String(payload.answer??''),claims=[],findings=[]
 const personAliases=new Map();for(const full of new Set(rows.map(r=>r.speaker).filter(Boolean))){const parts=full.split(/\s+/);if(parts.length>2){const alias=parts[0]+' '+parts.at(-1);if(new Set(rows.map(r=>r.speaker).filter(n=>n&&n.split(/\s+/)[0]+' '+n.split(/\s+/).at(-1)===alias)).size===1)personAliases.set(alias,full)}}
 const roles=rows.flatMap(r=>{const role=/^.+? \([^)]+\), (.+?): base salary/.exec(r.text)?.[1]??/a year as (.+?), \d{4}/.exec(r.text)?.[1];return role?[role]:[]})
 const speakers=rows.map(r=>r.speaker).filter(Boolean)
 const entities=[...new Set([...rows.map(r=>r.entity),...rows.flatMap(r=>r.figures.flatMap(f=>[f.owner,...(f.owners??[])])),...rows.map(r=>r.party),...rows.map(r=>r.donor),...rows.map(r=>r.speaker),...personAliases.keys(),...roster.filter(n=>/\s/.test(n)&&body.includes(n)),...body.matchAll(/\b\d+(?:st|nd|rd|th) Parliament\b/g)].map(n=>typeof n==='string'?n:n?.[0]).filter(Boolean))]
 const add=(atom,candidates,reason)=>{
  const evidence=[...new Set(candidates.flatMap(r=>[r.id,...r.figures.map(f=>f.periodEvidenceId).filter(Boolean)]))]
  const claim={...atom,evidence_ids:evidence,status:evidence.length?'supported':'unverified'};claims.push(claim)
  if(!evidence.length)findings.push({...claim,reason})
 }
 for(const {text,at:sentenceAt}of sentenceParts(body)){
  const actors=nounPhrases(text)
  const unknownActors=actors.filter(a=>!descriptor(text,a)&&!entities.some(e=>a.name.includes(e)||e.includes(a.name))&&!roles.some(role=>role.endsWith(a.name)&&entities.some(e=>e&&text.slice(0,a.at).includes(e)))&&! /^(?:Labor|Liberal|Greens|Nationals|Independent|Coalition)[’']s /.test(a.name))
  const named=mentions(text,[...entities,...unknownActors.map(a=>a.name)]).map(n=>({...n,name:personAliases.get(n.name)??n.name})),numeric=figures(text),ps=periods(text)
  const citedIds=Object.entries(payload.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(range=>Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)&&range[0]<Array.from(body.slice(0,sentenceAt+text.length)).length&&range[1]>Array.from(body.slice(0,sentenceAt)).length)).map(([id])=>id)
  const selected=citedIds.length?rows.filter(r=>citedIds.some(id=>id===r.id||id.startsWith(r.id+'/'))):rows
  const headScope=claimScope(text,0,named,speakers),head=headScope.owner
  const speaker=reporterIn(text,headScope,named,selected)
  const speech=!!speaker
  for(const name of [...new Set(named.map(n=>n.name))]){
   if(/^\d{4}$/.test(name))continue
   const modifier=speech&&name!==speaker&&['Labor','Liberal','Coalition','Greens','Nationals','ALP','Australian Democrats','One Nation','Senate','House'].includes(name)
   if(descriptor(text,named.find(n=>n.name===name)))continue
   const candidates=selected.filter(r=>recordName(name,r)||samePerson(r.speaker,name)||modifier&&r.speaker===speaker)
   const nameAt=named.find(n=>n.name===name)?.at??0,scope=claimScope(text,nameAt,named,speakers)
   const attribution=scope.owner===name&&(personName(name,selected)||!recordSubject(name,selected)&&reportingPredicate.test(text.slice(nameAt,scope.end)))&&(!!reporterIn(text,scope,named,selected)||!numeric.some(f=>f.at>=scope.start&&f.at<scope.end))&&selected.some(r=>['speech','bill'].includes(r.kind))
   add({type:'entity',entity:name,metric:attribution?'attribution':'identity',value:name,period:[],text,offset:sentenceAt+nameAt},attribution?candidates.filter(r=>samePerson(r.speaker,name)&&topicsMatch(text.slice(scope.start,scope.end),r)):candidates,'named entity or speaker/topic association is not established by selected evidence')
  }
  for(const f of numeric){
   const availableNames=f.metric==='salary'&&f.unit.startsWith('AUD')?named.filter(n=>!['Labor','Liberal','Coalition','Greens','Nationals','ALP'].includes(n.name)):named
   const boundary=[...text.slice(0,f.at).matchAll(/,\s*(?:and|but|while|whereas|because)\s+|;\s+/g)].at(-1);const clauseFrom=boundary?boundary.index+boundary[0].length:0
   const preceding=availableNames.filter(n=>n.end<=f.at&&n.at>=clauseFrom),following=availableNames.filter(n=>n.at>=f.end)
   const paidTo=/^\s*(?:was )?(?:paid|awarded|given) to\b/i.test(text.slice(f.end))||/^\s*(?:to|for)\b/i.test(text.slice(f.end))
   const scope=claimScope(text,f.at,availableNames,speakers),reporter=reporterIn(text,scope,named,selected,f.at)
   const prefix=text.slice(scope.start,f.at),recordReport=!personName(scope.owner,selected)&&/\b(?:passage|record|speech|speaker|document)\b/i.test(prefix)&&reportingPredicate.test(prefix),reported=!!reporter||recordReport
   let owners=amountOwners(text.slice(scope.start,scope.end),{...f,at:f.at-scope.start,end:f.end-scope.start},availableNames.map(n=>({name:n.name,surface:text.slice(n.at,n.end)})))
   if(reported&&owners.length&&!f.owner&&!/^\s*(?:[a-z]+\s+){0,5}to\b/i.test(text.slice(f.end))&&!financialPredicate.test(text.slice(availableNames.filter(n=>n.end<=f.at).at(-1)?.end??scope.start,f.at)))owners=[]
   if(!owners.length&&!reported)owners=paidTo&&following.length?[following[0].name]:preceding.length?[preceding.at(-1).name]:[]
   const selectedDonor=preceding.find(n=>selected.some(r=>r.donor===n.name))?.name
   if(selectedDonor&&/\b(?:gave|donated|provided)\b/i.test(text.slice(scope.start,f.at)))owners=[selectedDonor]
   const previous=numeric.filter(n=>n.end<=f.at).at(-1)?.end??0
   if(!speech&&/\b(?:each|both|tied)\b/i.test(text)&&named.filter(n=>n.at>=previous&&n.end<=f.at).length>1)owners=named.filter(n=>n.at>=previous&&n.end<=f.at).map(n=>n.name)
   if(!owners.length&&scope.owner&&!reported)owners=[scope.owner]
   if(!owners.length){const aggregates=[...new Set(selected.filter(r=>r.role==='donor').map(r=>r.entity))];owners=!reported&&aggregates.length===1&&/\b(?:total|aggregate|records)\b/i.test(text)?aggregates:['']}
   for(const entity of [...new Set(owners)]){
    const next=numeric.find(n=>n.at>f.at)?.at??text.length,nearPeriods=ps.filter(p=>p.at>=f.end&&p.at<next)
    const beforePeriod=ps.filter(p=>p.end<=f.at).at(-1)
    const attached=nearPeriods.length?nearPeriods:beforePeriod&&!/,\s*(?:and|but|while|because)|;/.test(text.slice(beforePeriod.end,f.at))?[beforePeriod]:[]
    const giving=/\b(?:gave|donated|provided|giving)\b/i.test(text)||/\b(?:total|aggregate|records)\b/i.test(text)&&!/\b(?:received|was paid|earned)\b/i.test(text),donor=givingActor(text,f,named.map(n=>n.name))??named.filter(n=>n.at<f.at&&rows.some(r=>r.donor===n.name)).at(-1)?.name
    let candidates=selected.filter(r=>r.figures.some(v=>{
     const passage=['speech','bill'].includes(r.kind),factOwners=v.owners??[]
     const owner=reported&&!entity?(!reporter||r.speaker===reporter):!entity?(!r.entity&&!r.speaker&&!passage||/^(?:19|20)\d{2}$/.test(r.entity)):passage?factOwners.some(n=>norm(n)===norm(entity)):norm(r.entity)===norm(entity)&&(!r.role||r.role!=='donor'||giving)||v.owner===entity||giving&&r.donor===entity
     if(!owner||reporter&&r.speaker!==reporter||v.value!==f.value||!metricSupported(f,v)||f.owner&&!(v.owners??[v.owner]).includes(f.owner)||donor&&(r.donor??v.donor)!==donor)return false
     const scope={...r,period:v.period.length?v.period:r.period,date:reporter?r.date:undefined}
     return attached.every(p=>dateSupported(p.value,scope))
    }))
    if(reporter)candidates=candidates.filter(r=>r.speaker===reporter)
    const quoted=quotations(text).filter(q=>q.at>=scope.start&&q.end<=scope.end)
    candidates=candidates.filter(r=>quoted.every(q=>r.text.includes(q.value))&&topicsMatch(text.slice(scope.start,scope.end),r))
    add({type:'figure',entity,reporter,metric:f.metric,value:f.value,unit:f.unit,period:attached.map(p=>p.value),text,offset:sentenceAt+f.at},candidates,'figure/entity/metric/period association is not in selected evidence')
   }
  }
  for(const p of ps){
   const context=/cannot|do not|does not|not establish|requested|unavailable|does not date|cannot be stated/i.test(text)
   const scope=claimScope(text,p.at,named,speakers),nextFigure=numeric.find(f=>f.at>=p.end&&f.at<scope.end),entity=speech?scope.owner:nextFigure?((nextFigure.owner??named.filter(n=>n.end<=nextFigure.at&&n.at>=scope.start).at(-1)?.name)??scope.owner):scope.owner,quoted=quotations(text).filter(q=>q.at>=scope.start&&q.end<=scope.end)
   const candidates=selected.filter(r=>(!entity? !r.speaker:(personName(entity,selected)?owns(r,entity):recordName(entity,r))||context&&!r.entity&&!r.speaker)&&(dateSupported(p.value,r)||r.figures.some(f=>dateSupported(p.value,{...r,period:f.period})))&&quoted.every(q=>r.text.includes(q.value))&&topicsMatch(text.slice(scope.start,scope.end),r))
   if(context&&!candidates.length&&question.includes(p.raw)){claims.push({type:'request_period',entity:'request',metric:'requested period',value:p.value,period:[p.value],text,evidence_ids:['request'],status:'supported'});continue}
   add({type:'period',entity,metric:'period',value:p.value,period:[p.value],text,offset:sentenceAt+p.at},candidates,'period is not in the associated selected evidence')
  }
  if(unclosedQuoteOffset(text)>=0){
   const at=unclosedQuoteOffset(text);add({type:'quote',entity:speaker??'',metric:'literal quote',value:'unbalanced quotation',quote:text.slice(at),period:[],text,offset:sentenceAt+at},[],'quotation is malformed and cannot be verified literally')
  }
  for(const q of quotations(text)){
   const scope=claimScope(text,q.at,named,speakers),possessive=scope.names.filter(n=>n.end<=q.at&&/^[’']s\b/.test(text.slice(n.end))).at(-1),entity=possessive?.name??scope.owner,dates=ps.filter(p=>p.at>=scope.start&&p.end<=scope.end),numbers=numeric.filter(f=>f.at>=scope.start&&f.end<=scope.end)
   const candidates=selected.filter(r=>(!entity?true:personName(entity,selected)?samePerson(r.speaker,entity):recordName(entity,r))&&r.text.includes(q.value)&&topicsMatch(text.slice(scope.start,scope.end),r)&&dates.every(p=>dateSupported(p.value,r))&&numbers.every(f=>r.figures.some(v=>v.value===f.value&&metricSupported(f,v))))
   add({type:'quote',entity,metric:'literal quote',value:q.value,quote:q.value,period:dates.map(p=>p.value),text,offset:sentenceAt+q.at},candidates,'quotation/owner/figure/period is not one literal selected evidence atom')
  }
 }
 return {claims,findings,counts:{claims:claims.length,figures:claims.filter(c=>c.type==='figure').length,entities:claims.filter(c=>c.type==='entity').length,periods:claims.filter(c=>c.type==='period').length,quotes:claims.filter(c=>c.type==='quote').length,unverified:findings.length}}
}
