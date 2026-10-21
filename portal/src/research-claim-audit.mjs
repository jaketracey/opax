// Pure selected-evidence audit, shared by the final boundary and the offline report.
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const months=['January','February','March','April','May','June','July','August','September','October','November','December']
const partyName=s=>s?({labor:'Labor',liberal:'Liberal',coalition:'Coalition',greens:'Greens',nationals:'Nationals',alp:'ALP'}[s.toLowerCase()]??s):s
const words={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eighth:8,half:.5,quarter:.25}
const number=v=>Number(v.replace(/[$,%\s]/g,''))
function sentenceParts(value){
 const text=String(value),out=[];let start=0,quote=''
 const push=end=>{const raw=text.slice(start,end),prefix=/^\s*(?:[-*]\s*)?/.exec(raw)[0],part=raw.slice(prefix.length).trimEnd();if(part)out.push({text:part,at:start+prefix.length});start=end}
 for(let i=0;i<text.length;i++){
  const c=text[i],letterBefore=/[\p{L}]/u.test(text[i-1]??''),letterAfter=/[\p{L}]/u.test(text[i+1]??'')
  if(c==='“')quote='”';else if(c==='‘'&&!letterBefore)quote='’';else if(quote&&c===quote)quote='';else if(c==='"')quote=quote==='"'?'':'"';else if(c==="'"&&!letterBefore&&!letterAfter)quote=quote==="'"?'':"'"
  if(c==='\n'&&!quote){push(i);start=i+1;continue}
  if(!quote&&/[.!?]/.test(c)&&/^\s+[A-Z“"]/.test(text.slice(i+1))){push(i+1)}
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
  const unit=/^(?:half|quarter)$/i.test(raw)?'ratio':/^\s*decades?\b/i.test(tail)?'years':amount?(weekly?'AUD/week':annual?'AUD/year':'AUD'):percent?'%':/^\s*[- ]?years?\b/i.test(tail)?'years':/^\s*[- ]state/i.test(tail)?'states':/eighth/i.test(raw)?'rank':'count'
  let metric=unit==='ratio'?'share':unit==='%'?(/loading|plus/i.test(head.slice(-35))?'loading':/\b(?:coverage|cover|covers)\b/i.test(text)&&!/\bshare\b/i.test(text)?'coverage':'share'):amount?(/salary|a year|annual pay|Prime Minister|per week|income|Treasurer/i.test(text)?'salary':/contract|supplier/i.test(text)?'contracts':/grant/i.test(text)?'grants':'receipts'):unit==='years'?'duration':unit==='rank'?'ranking':/topic-labelled speeches/i.test(tail.slice(0,45))?'topic_total':/^\s*(?:chamber |gambling |immigration )?speeches/i.test(tail)?'speeches':/^\s*(?:disclosed receipt )?records/i.test(tail)?'records':/^\s*(?:Defence )?contracts/i.test(tail)?'contracts_count':/^\s*donors/i.test(tail)?'donors':'count'
  if(amount&&/\bbase\s*$/i.test(head))metric='base_salary'
  if(unit==='count'&&metric==='count'&&/speech|spoke/i.test(text))metric='speeches'
  if(metric==='speeches'||metric==='share'){const topic=/housing|gambling|immigration|climate|mining(?:-energy)?|tax(?:-budget)?|budget/i.exec(text)?.[0]?.toLowerCase();if(topic)metric+='/'+(topic==='tax'||topic==='budget'?'tax-budget':topic)}
  const vote=/(all aye|all no|split) (?:in )?$/i.exec(head)?.[1];if(vote)metric='votes/'+norm(vote)
  const owner=partyName(/^\s+(?:dollars?\s+)?(?:to (?:the )?)?(Labor|Liberal|Coalition|Greens|Nationals|ALP)\b/i.exec(tail)?.[1])
  out.push({value:String(n*scale*(/^\s*decades?\b/i.test(tail)?10:1)),unit,metric,owner,at,end:at+raw.length,raw})
 }
 for(const f of out){const next=out.find(n=>n.at>f.at)?.at??text.length,following=dates.filter(p=>p.at>=f.end&&p.at<next);f.period=following.length?following:dates.filter(p=>p.end<=f.at).slice(-1)}
 return out
}
function evidenceRows(payload){
 const rows=[]
 for(const source of Array.isArray(payload.sources)?payload.sources:[]){
  if(!source||typeof source!=='object'||typeof source.resource!=='string')continue
  const text=String(source.snippet??''),base={id:source.resource,text,date:source.date,speaker:source.speaker,kind:source.kind}
  const parts=text.split(/\n+|(?<=[.!?])\s+(?=[A-Z][^:$;\n.]{1,110}:\s*\$?\d)/)
  for(const line of parts){
   const label=/^\s*[-*]?\s*([^:|]{2,140}):\s*\$?\d/.exec(line)?.[1]
   const table=/^\|/.test(line)?line.split('|').map(s=>s.trim()).filter(Boolean):[]
   const receipt=/^Disclosed receipt: (.+?) → (.+?) [—–] \$/.exec(line),donor=/^Donor: (.+?) [—–]/.exec(line)
   const current=/^(.+?) \([^)]+\), [^:]+: base salary/.exec(line)?.[1]
   const entity=(/^coverage(?:-|$)/.test(source.resource)?'':undefined)??(receipt?.[2]??donor?.[1]??current??(['speech','bill'].includes(source.kind)?source.speaker:undefined)??label??(table.length?table.find(s=>/[a-z]/i.test(s)):undefined)??source.speaker??'').replace(/\s*\([^)]*\).*$/,'').replace(/\s+(?:received|provided|gave|led)\b.*$/i,'').trim()
   const fiscal=/(?:Financial years|Period):\s*([^\n.]+)/i.exec(text)?.[1];const period=periods(line);
   const values=figures(line);for(const f of values){if(['speech','bill'].includes(source.kind)&&f.metric==='receipts'&&!f.owner){const before=line.slice(Math.max(0,f.at-120),f.at),party=[...before.matchAll(/\b(Labor|Coalition|Liberal|ALP|Greens|Nationals)(?: Party)?\b[^.;]{0,70}\b(?:received|collected|accepted)\b[^$]*$/gi)].at(-1);if(party)f.owner=partyName(party[1])}if(source.date&&/^\s*last financial year\b/i.test(line.slice(f.end))){const year=Number(source.date.slice(0,4))-(Number(source.date.slice(5,7))>=7?1:2);f.period=periods(year+'-'+String((year+1)%100).padStart(2,'0'))}}
   rows.push({...base,text:line,entity,donor:receipt?.[1]??donor?.[1],role:donor?'donor':undefined,period:period.length?period:fiscal?periods(fiscal):[],figures:values})
  }
 }
 return rows
}
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
 const entities=[...new Set([...rows.map(r=>r.entity),...rows.flatMap(r=>r.figures.map(f=>f.owner)),...rows.map(r=>r.donor),...rows.map(r=>r.speaker),...personAliases.keys(),...roster.filter(n=>/\s/.test(n)&&body.includes(n)),...body.matchAll(/\b\d+(?:st|nd|rd|th) Parliament\b/g)].map(n=>typeof n==='string'?n:n?.[0]).filter(Boolean))]
 const add=(atom,candidates,reason)=>{
  const evidence=[...new Set(candidates.map(r=>r.id))]
  const claim={...atom,evidence_ids:evidence,status:evidence.length?'supported':'unverified'};claims.push(claim)
  if(!evidence.length)findings.push({...claim,reason})
 }
 for(const {text,at:sentenceAt}of sentenceParts(body)){
  const actors=[...text.matchAll(/\b([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)*)\s+(?:received|earned|earns|was paid|recorded|made|spoke|said|argued|told|described|claimed|called|supported|opposed|voted|gave|provided)\b/gu)].map(m=>({name:m[1],at:m.index,end:m.index+m[1].length}))
  const unknownActors=actors.filter(a=>!entities.includes(a.name)&&!roles.some(role=>role.endsWith(a.name)&&entities.some(e=>e&&text.slice(0,a.at).includes(e)))&&!( /^(?:Labor|Liberal|Greens|Nationals|Independent|Coalition)'s /.test(a.name)&&entities.some(e=>a.name.endsWith(e)))&&! /^(?:This|That|These|Those|They|He|She|It|Another|One|Some|Both|Each|Other|We|I|None|There|The|MPs)$/.test(a.name)&&!['Labor','Liberal','Coalition','Greens','Nationals','ALP'].includes(a.name))
  const named=mentions(text,[...entities,...unknownActors.map(a=>a.name)]).map(n=>({...n,name:personAliases.get(n.name)??n.name})),numeric=figures(text),ps=periods(text)
  const citedIds=Object.entries(payload.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(range=>Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)&&range[0]<Array.from(body.slice(0,sentenceAt+text.length)).length&&range[1]>Array.from(body.slice(0,sentenceAt)).length)).map(([id])=>id)
  const selected=citedIds.length?rows.filter(r=>citedIds.some(id=>id===r.id||id.startsWith(r.id+'/'))):rows
  const speech=/\b(?:said|argued|called|told|described|defended|questioned|referred|linked|challenged|introduced|reported|cited|criticis|framed|set out|put a motion)\b/i.test(text)
  const verbAt=/\b(?:said|argued|called|told|described|defended|questioned|referred|linked|challenged|introduced|reported|cited|criticis|framed|set out|put a motion)\b/i.exec(text)?.index??-1
  const speaker=speech?named.find(n=>n.at<verbAt)?.name:undefined
  // Named subjects that are not among the selected entities cannot borrow a real figure.
  const invented=/^(?:In \d{4},?\s*)?([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)*)\s+(?:received|earned|was paid|recorded|said|gave|provided)\b/u.exec(text)?.[1]??/\b(?:paid|awarded|given) to ([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)*)/u.exec(text)?.[1]
  if(invented&&!personAliases.has(invented)&&!named.some(n=>invented.endsWith(n.name))&&!rows.some(r=>norm(r.entity)===norm(invented)||r.speaker===invented))add({type:'entity',entity:invented,metric:'identity',value:invented,period:[],text},[],'entity is absent from selected evidence')
  for(const name of [...new Set(named.map(n=>n.name))]){
   if(/^\d{4}$/.test(name))continue
   const candidates=selected.filter(r=>norm(r.entity)===norm(name)||norm(r.text).includes(norm(name))||r.speaker===name)
   add({type:'entity',entity:name,metric:speech?'attribution':'identity',value:name,period:[],text,offset:sentenceAt+(named.find(n=>n.name===name)?.at??0)},speech&&name===speaker?candidates.filter(r=>r.speaker===name):candidates,'named entity or speaker is not established by selected evidence')
  }
  for(const f of numeric){
   const availableNames=f.metric==='salary'&&f.unit.startsWith('AUD')?named.filter(n=>!['Labor','Liberal','Coalition','Greens','Nationals','ALP'].includes(n.name)):named
   const boundary=[...text.slice(0,f.at).matchAll(/,\s*(?:and|but|while|whereas|because)\s+|;\s+/g)].at(-1);const clauseFrom=boundary?boundary.index+boundary[0].length:0
   const preceding=availableNames.filter(n=>n.end<=f.at&&n.at>=clauseFrom),following=availableNames.filter(n=>n.at>=f.end)
   const paidTo=/^\s*(?:was )?(?:paid|awarded|given) to\b/i.test(text.slice(f.end))||/^\s*(?:to|for)\b/i.test(text.slice(f.end))
   let owners=f.owner?[f.owner]:speech&&speaker?[speaker]:paidTo&&following.length?[following[0].name]:preceding.length?[preceding.at(-1).name]:[]
   const previous=numeric.filter(n=>n.end<=f.at).at(-1)?.end??0
   if(!speech&&/\b(?:each|both|tied)\b/i.test(text)&&named.filter(n=>n.at>=previous&&n.end<=f.at).length>1)owners=named.filter(n=>n.at>=previous&&n.end<=f.at).map(n=>n.name)
   if(!owners.length){const aggregates=[...new Set(selected.filter(r=>r.role==='donor').map(r=>r.entity))];owners=aggregates.length===1&&/\b(?:total|aggregate|records)\b/i.test(text)?aggregates:['']}
   for(const entity of [...new Set(owners)]){
    const next=numeric.find(n=>n.at>f.at)?.at??text.length,nearPeriods=ps.filter(p=>p.at>=f.end&&p.at<next)
    const beforePeriod=ps.filter(p=>p.end<=f.at).at(-1)
    const attached=nearPeriods.length?nearPeriods:beforePeriod&&!/,\s*(?:and|but|while|because)|;/.test(text.slice(beforePeriod.end,f.at))?[beforePeriod]:[]
    const giving=/\b(?:gave|donated|provided|giving)\b/i.test(text)||/\b(?:total|aggregate|records)\b/i.test(text)&&!/\b(?:received|was paid|earned)\b/i.test(text),donor=named.filter(n=>n.at<f.at&&rows.some(r=>r.donor===n.name)).at(-1)?.name
    let candidates=selected.filter(r=>r.figures.some(v=>{
     const owner=!entity?(!r.entity||/^(?:19|20)\d{2}$/.test(r.entity)||['speech','bill'].includes(r.kind)):speech&&speaker?r.speaker===entity:norm(r.entity)===norm(entity)&&(!r.role||r.role!=='donor'||giving)||v.owner===entity||v.unit==='years'&&['speech','bill'].includes(r.kind)&&r.figures.some(other=>other.owner===entity)||giving&&r.donor===entity
     if(!owner||v.value!==f.value||!metricSupported(f,v)||f.owner&&v.owner!==f.owner||donor&&r.donor!==donor)return false
     const scope={...r,period:v.period.length?v.period:r.period,date:['speech','bill'].includes(r.kind)?r.date:undefined}
     return attached.every(p=>dateSupported(p.value,scope))
    }))
    if(speech&&speaker)candidates=candidates.filter(r=>r.speaker===speaker)
    add({type:'figure',entity,metric:f.metric,value:f.value,unit:f.unit,period:attached.map(p=>p.value),text,offset:sentenceAt+f.at},candidates,'figure/entity/metric/period association is not in selected evidence')
   }
  }
  for(const p of ps){
   const context=/cannot|do not|does not|not establish|requested|unavailable|does not date|cannot be stated/i.test(text)
   const candidates=selected.filter(r=>(!speech||!speaker||r.speaker===speaker)&&dateSupported(p.value,r))
   if(context&&!candidates.length&&question.includes(p.raw)){claims.push({type:'request_period',entity:'request',metric:'requested period',value:p.value,period:[p.value],text,evidence_ids:['request'],status:'supported'});continue}
   add({type:'period',entity:speech?speaker??'':'',metric:'period',value:p.value,period:[p.value],text,offset:sentenceAt+p.at},candidates,'period is not in the associated selected evidence')
  }
  if((text.match(/"/g)??[]).length%2||(text.match(/“/g)??[]).length!==(text.match(/”/g)??[]).length){
   const at=text.search(/[“”"]/);add({type:'quote',entity:speaker??'',metric:'literal quote',value:'unbalanced quotation',quote:text.slice(at),period:[],text,offset:sentenceAt+at},[],'quotation is malformed and cannot be verified literally')
  }
  for(const q of [...text.matchAll(/[“"]([^”"]+)[”"]/g),...text.matchAll(/(?<![\p{L}])[‘']([^’']+)[’'](?![\p{L}])/gu)])add({type:'quote',entity:speaker??'',metric:'literal quote',value:q[1],quote:q[1],period:[],text,offset:sentenceAt+q.index},selected.filter(r=>(!speaker||r.speaker===speaker)&&r.text.includes(q[1])),'quotation is not literal selected source text')
 }
 return {claims,findings,counts:{claims:claims.length,figures:claims.filter(c=>c.type==='figure').length,entities:claims.filter(c=>c.type==='entity').length,periods:claims.filter(c=>c.type==='period').length,quotes:claims.filter(c=>c.type==='quote').length,unverified:findings.length}}
}
