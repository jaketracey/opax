import {PERSON_PATHS} from '../public/party-page.js'
import {sharedCitationSpan} from './research-dedupe'
import {ACCOUNTABILITY_QUESTION,leadWithAuthority} from './research-answer-shape'
import {sentenceParts} from './research-claim-audit.mjs'
import {recordedChamber} from './ask-chamber-phrases'
import {readableDate} from './tools/record-common'

type Source={resource:string;snippet?:string;title?:string;kind?:string;speaker?:string;chamber?:string;date?:string;coverage?:boolean}
type Citations=Record<string,[number,number][]>
const cp=(text:string)=>Array.from(text).length
const name=String.raw`\p{Lu}[\p{L}’'-]+(?:\s+\p{Lu}[\p{L}’'-]+)+`
const namedRole=new RegExp(String.raw`\b(?:[Ff]ormer\s+)?(?:[Pp]rime [Mm]inister|[Mm]inisters?|[Ss]ecretar(?:y|ies)|[Oo]fficials?|[Dd]irectors?|[Cc]hief [Ee]xecutives?)\s+(${name}(?:\s+and\s+${name})?)`,'u')
const action=/\b(?:approv\w*|authoris\w*|authoriz\w*|decid\w*|order\w*|signed off|responsib\w*|accountab\w*|conduct|misled|ignored|failed|breached|criticis\w*|criticiz\w*|findings)\b/i
// A surname alone is not an MP identity. Reconcile it only when the answer and source
// explicitly share the member's parliamentary role, including the seat named beside the full name.
const publicNames=Object.keys(PERSON_PATHS.exact)
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const actorName=(value:string,context:string,evidence:string)=>{
  const short=value.replace(/^(?:Mr|Ms|Mrs|Dr|Sir)\.?\s+/,'')
  if(short===value)return value
  const held=publicNames.filter(n=>n.endsWith(' '+short))
  if(held.length!==1)return value
  const role=new RegExp(String.raw`\b(member for [\p{L} '-]+)\s+\(${escape(held[0])}\)`,'iu').exec(context)?.[1]
  return role&&new RegExp('\\b'+escape(role)+'\\b','i').test(evidence)?held[0]:value
}
const negative=(before:string,after:string)=>/\b(?:cleared|exonerated|acquitted|no|not)\b[^.;]{0,65}$/i.test(before)||/^\s+(?:(?:was|were)\s+not|no)\b/i.test(after)
const finding=(text:string)=>/\b(?:commission(?:er)?|court|inquiry|report|tribunal|ombudsman|auditor[- ]general|anao|committees?|nacc|icac|ibac|ccc|cmc)\b[^.!?;]{0,200}\b(?:found|finds|findings|concluded|determined|ruled|criticised|rejected)\b/i.test(text)
function actors(text:string,allowColon=false,context=''):string[] {
  // A speaker, commissioner or witness is not thereby the subject of a finding.
  if(!action.test(text))return []
  const match=namedRole.exec(text)
  const before=match?text.slice(0,match.index):'',after=match?text.slice(match.index+match[0].length):''
  const role=match&&(allowColon||!/:\s*["“‘']?\s*$/.test(before))&&(action.test(after)||/\b(?:findings|conduct)\b[^.;]{0,60}\b(?:of|about|regarding|on|against)\s*$|\b(?:approved|authorised|authorized|ordered) by\s*$|\bcriticis(?:ed|es)\s*$/i.test(before))&&!negative(before,after)?match[1]:undefined
  // Colon quotations can corroborate an existing sentence, never nominate a copied lead.
  const subject=new RegExp(String.raw`(?:^|${allowColon?':\\s*|':''}\b(?:that|found|concluded)\s+)(${name})\s+(?:approved|authorised|authorized|decided|ordered|allowed|misled|ignored|failed|breached)\b`,'u').exec(text)?.[1]
  const conductMatch=new RegExp(String.raw`\b[Ff]indings (?:about|regarding|on|against) (?:the conduct of )?(${name}(?:\s+and\s+${name})?)`,'u').exec(text)
  const conduct=conductMatch&&!/\b(?:no|not|cleared|exonerated|acquitted)\b[^.;]{0,65}$/i.test(text.slice(0,conductMatch.index))&&!/^\s+(?:(?:was|were)\s+not|no)\b/i.test(text.slice(conductMatch.index+conductMatch[0].length))?conductMatch[1]:undefined
  const relativeMatch=new RegExp(String.raw`\((${name})\),\s+who\b[^.;]{0,300}?\b(?:approved|authorised|authorized|allowed|misled|ignored|failed|responsibility)\b`,'u').exec(text)
  // Only negation of this person's proposition applies, never an unrelated earlier clause.
  const cleared=relativeMatch&&/\b(?:cleared|exonerated|acquitted) (?:the )?member for \p{Lu}[\p{L}’'-]*(?: \p{Lu}[\p{L}’'-]*)*\s*$/u.test(text.slice(0,relativeMatch.index))
  const relative=relativeMatch&&!cleared&&!/\b(?:(?:was|were|had|has) (?:not(?! only\b)|no)|cleared|exonerated|acquitted)\b/i.test(relativeMatch[0])?relativeMatch[1]:undefined
  if(role||subject||conduct||relative)return (role??subject??conduct??relative!).split(/\s+and\s+/).map(value=>actorName(value,context,text))
  if(/\b(?:approved|authorised|authorized) by Cabinet\b|\bCabinet (?:approved|authorised|authorized)\b/.test(text))return ['Cabinet']
  const office=/\b(?:the )?((?:(?:Department|Ministry) of|(?:Minister|Secretary) for) [A-Z][\p{L} ]+?(?:['’]s office)?) (?:(?:had |has )?(?:approved|authorised|ignored|failed|ran)|was responsible)\b/u.exec(text)?.[1]
  return office?[office]:[]
}

/** The lead a who-answer takes when no cited source names a person or office. */
export const UNNAMED_WHO_LEAD='The cited sources do not name a person or office as responsible.'
const evidenceOf=(s:Source)=>[s.snippet,s.title].filter(Boolean).join('\n')
const honorific=/^(?:Mr|Ms|Mrs|Dr|Sir)\.?\s/

/** What any answer drawn from these sources could cite for a who lead: whether no source names anyone, whether any
 * source names a subject other than Cabinet, and whether a record is available. Each source is read as its texts alone
 * and joined, as answer sources join a snippet, its facts and a title (leadWithWho reads them as one evidence string). */
export type WhoBasis={unnamed:boolean;subjects:boolean;record:boolean}
export function whoBasis(sources:{kind?:string;coverage?:boolean;texts:(string|undefined)[]}[]):WhoBasis {
  let named=false,subjects=false,record=false
  for(const source of sources){
    if(source.kind==='record'&&!source.coverage)record=true
    const texts=source.texts.filter((text):text is string=>!!text)
    for(const text of new Set([...texts,texts.join('\n')])){
      const found=[...actors(text,true),...actors(text),...sentenceParts(text).flatMap(p=>[...actors(p.text,true),...actors(p.text)])]
      if(found.length)named=true
      if(found.some(actor=>actor!=='Cabinet'))subjects=true
    }
  }
  return {unnamed:!named,subjects,record}
}

/** A checked prefix whose first sentence leadWithWho will keep first, unchanged, however the answer continues: a
 * supported subject at the highest rank any later sentence could reach from the available sources (a record before a
 * speech, then finding language and a named subject other than Cabinet). Equal ranks keep their order. A short name
 * with a title stays held, because later answer text can resolve it to a different member. */
export function settledWhoLead(payload:Record<string,unknown>,question:string,basis:WhoBasis={unnamed:false,subjects:true,record:true}):boolean {
  if(typeof payload.answer!=='string'||!ACCOUNTABILITY_QUESTION.test(question)||basis.unnamed)return false
  const answer=payload.answer,citations=(payload.citations??{}) as Citations
  const first=sentenceParts(answer)[0]
  if(!first||first.at!==0)return false
  const end=cp(first.text),sources=((Array.isArray(payload.sources)?payload.sources:[]) as Source[])
    .filter(s=>!s.coverage&&Object.entries(citations).some(([id,r])=>(id===s.resource||id.startsWith(s.resource+'/'))&&r.some(([a,b])=>a<end&&b>0)))
  const named=actors(first.text,true)
  if(!named.length||named.some(actor=>honorific.test(actor)))return false
  const held=new Set(sources.flatMap(s=>actors(evidenceOf(s),true,answer)))
  if(!named.map(value=>actorName(value,answer,answer)).every(actor=>held.has(actor)))return false
  if(basis.record&&!sources.some(s=>s.kind==='record')||!finding(first.text)||basis.subjects&&!named.some(actor=>actor!=='Cabinet'))return false
  return leadWithWho(payload,question).answer===answer
}

/** A who-answer names the subjects of the cited finding, never just the person reporting it.
 * Use source language for new material; this is an ordering repair, not a liability inference. */
export function leadWithWho<T extends Record<string,unknown>>(payload:T,question:string):T {
  if(typeof payload.answer!=='string'||!ACCOUNTABILITY_QUESTION.test(question))return payload
  const answer=payload.answer,citations=(payload.citations??{}) as Citations
  const sources=(Array.isArray(payload.sources)?payload.sources:[]) as Source[]
  const ids=Object.keys(citations)
  const selected=sources.filter(s=>!s.coverage&&ids.some(id=>id===s.resource||id.startsWith(s.resource+'/')))
  const parts=sentenceParts(answer).map(p=>({...p,a:cp(answer.slice(0,p.at)),b:cp(answer.slice(0,p.at+p.text.length))}))
  const evidence=(s:Source)=>[s.snippet,s.title].filter(Boolean).join('\n')
  const support=(p:typeof parts[number])=>selected.filter(s=>Object.entries(citations).some(([id,r])=>(id===s.resource||id.startsWith(s.resource+'/'))&&r.some(([a,b])=>a<p.b&&b>p.a)))
  const candidates=parts.flatMap(p=>{
    const named=actors(p.text,true).map(value=>actorName(value,answer,answer)),sources=support(p)
    const held=new Set(sources.flatMap(s=>actors(evidence(s),true,answer)))
    return named.length&&named.every(actor=>held.has(actor))?[{p,sources}]:[]
  })
  // Source kind comes first. Finding language only orders candidates within the same kind.
  const recordFirst=(a:Source[],b:Source[])=>Number(b.some(s=>s.kind==='record'))-Number(a.some(s=>s.kind==='record'))
  const score=(text:string)=>Number(finding(text))*2+Number(actors(text,true).some(a=>a!=='Cabinet'))
  candidates.sort((a,b)=>recordFirst(a.sources,b.sources)||score(b.p.text)-score(a.p.text))
  const candidate=candidates[0]
  if(candidate){
    const {p}=candidate
    // Front a supported approving actor while retaining the sentence's other findings.
    const passive=/^(.+?) found that (.+?) was (.+?), (approved|authori[sz]ed) by (.+?) and (.+)\.$/i.exec(p.text)
    const replacement=passive&&actors(p.text).includes(passive[5])?`${passive[5]} ${passive[4]} ${passive[2]}, which ${passive[6]}; ${passive[1].replace(/^The /,'the ')} found it was ${passive[3]}.`:p.text
    return moveFirst(payload,p.a,p.b,replacement)
  }
  // The writer can omit names that are present in a cited passage. Recover only a complete source sentence
  // explicitly relating those names to the finding or decision, with the original speaker attribution.
  const held=selected.flatMap(s=>sentenceParts(evidence(s)).filter(p=>actors(p.text,false,answer).length&&(s.kind==='record'||finding(p.text))).map(p=>({s,text:p.text})))
    .sort((a,b)=>recordFirst([a.s],[b.s])||score(b.text)-score(a.text))[0]
  if(held){
    let text=held.text.replace(/,\s*the member said[.!]?$/i,'.')
    if(held.s.kind==='speech'){
      if(!held.s.speaker)return payload
      const chamber=recordedChamber(held.s.chamber??''),date=held.s.date?` on ${readableDate(held.s.date)}`:''
      text=`${held.s.speaker} ${chamber?`told the ${chamber.label}`:'said'}${date} that ${text.replace(/^The /,'the ')}`
    }
    return prepend(payload,text,ids.filter(id=>id===held.s.resource||id.startsWith(held.s.resource+'/')))
  }
  // Names in unsuitable source prose do not justify a claim that no source names anyone.
  if(selected.some(s=>actors(evidence(s),true,answer).length))return leadWithAuthority(payload,question)
  const missing=UNNAMED_WHO_LEAD
  const existing=parts.find(p=>p.text===missing)
  if(existing)return moveFirst(payload,existing.a,existing.b,missing)
  return prepend(leadWithAuthority(payload,question),missing,[])
}

function prepend<T extends Record<string,unknown>>(payload:T,text:string,ids:string[]):T {
  const offset=cp(text)+2,citations:Citations={}
  for(const [id,ranges] of Object.entries((payload.citations??{}) as Citations))citations[id]=ranges.map(([a,b])=>[a+offset,b+offset])
  for(const id of ids)(citations[id]??=[]).unshift([0,cp(text)])
  return {...payload,answer:text+'\n\n'+payload.answer,citations}
}

/** Move one supported sentence, rebasing partial anchors by their literal words after a rephrasing. */
function moveFirst<T extends Record<string,unknown>>(payload:T,a:number,b:number,replacement:string):T {
  const text=String(payload.answer),chars=Array.from(text)
  if(a===0&&replacement===chars.slice(a,b).join(''))return payload
  const original=chars.slice(a,b).join(''),citations:Citations={}
  const segments:[[number,number],[number,number]]=[[0,a],[b,chars.length]]
  const offsets:{a:number;b:number;offset:number}[]=[]
  let answer=replacement
  for(let [left,right] of segments){
    while(left<right&&/\s/.test(chars[left]))left++
    while(right>left&&/\s/.test(chars[right-1]))right--
    if(left===right)continue
    answer+='\n\n';offsets.push({a:left,b:right,offset:cp(answer)});answer+=chars.slice(left,right).join('')
  }
  for(const [id,ranges] of Object.entries((payload.citations??{}) as Citations))for(const [x,y] of ranges){
    const from=Math.max(x,a),until=Math.min(y,b)
    if(from<until){
      const literal=chars.slice(from,until).join(''),at=replacement.indexOf(literal)
      const shared=at<0?sharedCitationSpan(literal,replacement):null
      if(at<0&&!shared&&(from!==a||until!==b)&&replacement!==original)return payload
      ;(citations[id]??=[]).push(from===a&&until===b?[0,cp(replacement)]:at>=0?[cp(replacement.slice(0,at)),cp(replacement.slice(0,at))+cp(literal)]:[shared!.start,shared!.end])
    }
    for(const segment of offsets){const left=Math.max(x,segment.a),right=Math.min(y,segment.b);if(left<right)(citations[id]??=[]).push([segment.offset+left-segment.a,segment.offset+right-segment.a])}
  }
  return {...payload,answer,citations}
}
