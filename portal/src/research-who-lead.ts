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
// Hansard's honorific and surname can identify a public figure named in full by the writer.
const publicNames=Object.keys(PERSON_PATHS.exact)
const actorName=(value:string)=>{
  const short=value.replace(/^(?:Mr|Ms|Mrs|Dr|Sir)\.?\s+/,'')
  if(short===value)return value
  const held=publicNames.filter(n=>n.endsWith(' '+short))
  return held.length===1?held[0]:value
}
function actors(text:string):string[] {
  // A speaker, commissioner or witness is not thereby the subject of a finding.
  if(!action.test(text))return []
  const match=namedRole.exec(text)
  const before=match?text.slice(0,match.index):'',after=match?text.slice(match.index+match[0].length):''
  const role=match&&(action.test(after)||/\b(?:findings|conduct)\b[^.;]{0,60}\b(?:of|about|regarding|on|against)\s*$|\b(?:approved|authorised|authorized|ordered) by\s*$|\bcriticis(?:ed|es)\s*$/i.test(before))&&!/\b(?:cleared|exonerated|acquitted|no|not)\b[^.;]{0,65}$/i.test(before)&&!/^\s+(?:(?:was|were)\s+not|no)\b/i.test(after)?match[1]:undefined
  const subject=new RegExp(String.raw`(?:^|:\s*|\b(?:that|found|concluded)\s+)(${name})\s+(?:approved|authorised|authorized|decided|ordered|allowed|misled|ignored|failed|breached)\b`,'u').exec(text)?.[1]
  const conductMatch=new RegExp(String.raw`\b[Ff]indings (?:about|regarding|on|against) (?:the conduct of )?(${name}(?:\s+and\s+${name})?)`,'u').exec(text)
  const conduct=conductMatch&&!/\b(?:no|not|cleared|exonerated|acquitted)\b[^.;]{0,65}$/i.test(text.slice(0,conductMatch.index))&&!/^\s+(?:(?:was|were)\s+not|no)\b/i.test(text.slice(conductMatch.index+conductMatch[0].length))?conductMatch[1]:undefined
  const relative=new RegExp(String.raw`\((${name})\),\s+who\b[^.;]{0,300}\b(?:approved|authorised|authorized|allowed|misled|ignored|failed|responsibility)\b`,'u').exec(text)?.[1]
  if(role||subject||conduct||relative)return (role??subject??conduct??relative!).split(/\s+and\s+/).map(actorName)
  if(/\b(?:approved|authorised|authorized) by Cabinet\b|\bCabinet (?:approved|authorised|authorized)\b/.test(text))return ['Cabinet']
  const office=/\b(?:the )?((?:(?:Department|Ministry) of|(?:Minister|Secretary) for) [A-Z][\p{L} ]+?(?:['’]s office)?) (?:(?:had |has )?(?:approved|authorised|ignored|failed|ran)|was responsible)\b/u.exec(text)?.[1]
  return office?[office]:[]
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
    const named=actors(p.text),sources=support(p),held=new Set(sources.flatMap(s=>actors(evidence(s))))
    return named.length&&named.every(actor=>held.has(actor))?[{p,sources}]:[]
  })
  // Prefer a named subject over an office, and the body's own record over a relayed finding.
  const score=(text:string,ss:Source[])=>Number(actors(text).some(a=>a!=='Cabinet'))*2+Number(ss.some(s=>s.kind==='record'))
  candidates.sort((a,b)=>score(b.p.text,b.sources)-score(a.p.text,a.sources))
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
  const held=selected.flatMap(s=>sentenceParts(evidence(s)).filter(p=>actors(p.text).length).map(p=>({s,text:p.text})))
    .sort((a,b)=>score(b.text,[b.s])-score(a.text,[a.s]))[0]
  if(held){
    let text=held.text.replace(/,\s*the member said[.!]?$/i,'.')
    if(held.s.kind==='speech'){
      if(!held.s.speaker)return payload
      const chamber=recordedChamber(held.s.chamber??''),date=held.s.date?` on ${readableDate(held.s.date)}`:''
      text=`${held.s.speaker} ${chamber?`told the ${chamber.label}`:'said'}${date} that ${text.replace(/^The /,'the ')}`
    }
    return prepend(payload,text,ids.filter(id=>id===held.s.resource||id.startsWith(held.s.resource+'/')))
  }
  const missing='The cited sources do not name a person or office as responsible.'
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
