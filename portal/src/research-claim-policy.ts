import {auditPayload,isRosterPerson,reportingPredicate,quotationSpans,unclosedQuoteOffset,sentenceParts,type AuditedClaim} from './research-claim-audit.mjs'
import {rewriteAnswerPayload} from './research-language'
import {sourceAboutPerson} from './ask-followup'
import {repairCausal} from './research-evidence'
import {protectedDecision} from './research-coherence.mjs'
import {withoutSaPlaceholder} from '../public/sa-hansard.js'
import {researchTrace} from './research-trace'
import {sentenceFragment} from './research-claims'

type Source={resource:string;snippet?:string;speaker?:string;title?:string;cited?:boolean;kind?:string}
const sourcesOf=(p:Record<string,unknown>)=>(Array.isArray(p.sources)?p.sources:[]) as Source[]
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')

const normal=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
// Organisation names and date leads are identities, rather than private people's names.
const organisation=/\b(?:Authority|Commission|Committee|Department|Party|Nation|Alliance|Association|Council|Holdings|Group|Foundation|Institute|University|Corporation|Company|Limited|Ltd|Pty|Bank|Union|Federation|Office|Ministry|Bill|Act|Plan|Amendment|Legislation|Parliament|Government|Senate|House|Court|Australia|Australian|United|National|Royal|Industries|Enterprises|Services|Resources|Energy|Mining|Technologies|Agency|Trust|Fund|Network|Centre|School|Hospital|Club|League|Society)\b/
const personShaped=(name:string)=>isRosterPerson(name)||/^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)+$/u.test(name)&&!organisation.test(name.replace(/^Bill /,''))&&
  !/^(?:By|After|Before|During|Since|Until|On|In|As)\b/.test(name)

/** Weak association stays soft; ownership, fabricated figures and private names are hard. */
export function hardClaimFindings(findings:AuditedClaim[],payload:Record<string,unknown>):AuditedClaim[] {
  const sources=sourcesOf(payload).filter(s=>!/^USER_CONTEXT_/i.test(s.resource))
  const figures=sources.flatMap(s=>auditPayload('',{answer:s.snippet,sources:[s],citations:{}}).claims).filter(c=>c.type==='figure')
  const ownedMoney=(f:AuditedClaim)=>f.unit?.startsWith('AUD')&&!!f.entity&&
    !auditPayload('',{answer:unquote(f.text).replace(datePhrases(),''),sources,citations:{}}).claims.some(c=>c.type==='figure'&&c.entity===f.entity&&c.value===f.value&&c.unit?.startsWith('AUD')&&c.status==='supported')
  const inSource=(name:string)=>sources.some(s=>[s.snippet,s.title,s.speaker].some(text=>normal(text??'').includes(normal(name))))
  const privateName=(name:string)=>personShaped(name)&&!isRosterPerson(name)&&!inSource(name)
  const wrongMouth=(f:AuditedClaim)=>{
    if(!personShaped(f.entity)||!sources.some(s=>sourceAboutPerson(s,f.entity,true))||!['quote','entity'].includes(f.type)||f.type==='entity'&&f.metric!=='attribution')return false
    const tail=f.text.slice(f.text.indexOf(f.entity)+f.entity.length)
    const predicate=reportingPredicate.exec(tail)
    const stance=predicate&&/^(?:support|oppos|believ|want|think|favour|favor|advocat|treat|tie)/i.test(predicate[0])
    const reported=f.quote??(predicate?tail.slice(predicate.index+(stance?0:predicate[0].length)).trim():undefined)
    if(!reported)return false
    const wording=(text:string)=>normal(text).replace(/\b(?:supported|supports)\b/g,'support').replace(/\b(?:opposed|opposes)\b/g,'oppose')
    const words=wording(reported).replace(/^(?:that |i |we )+/,''),contains=(s:Source)=>(' '+wording(s.snippet??'')+' ').includes(' '+words+' ')
    return !!words&&(f.type==='quote'||words.split(' ').length>=3)&&!sources.some(s=>sourceAboutPerson(s,f.entity,true)&&contains(s))&&
      sources.some(s=>s.speaker&&!sourceAboutPerson(s,f.entity,true)&&contains(s))
  }
  // Topic overlap alone can mark a paraphrase supported; still check whose words they are.
  const claims=auditPayload('',payload).claims
  const quotedNames=claims.filter(f=>f.type==='quote'&&f.quote).flatMap(f=>auditPayload('',{answer:unquote(f.quote!),sources,citations:{}}).findings
    .filter(c=>c.type==='entity'&&privateName(c.entity)).map(c=>({...c,text:f.text,offset:f.offset})))
  const candidates=[...findings,...quotedNames,...claims.filter(f=>wrongMouth(f)&&!findings.some(c=>c.type===f.type&&c.offset===f.offset))]
  return candidates.filter(f=>{
    if(f.type==='figure')return !figures.some(c=>c.value===f.value&&c.unit===f.unit)||ownedMoney(f)
    if(wrongMouth(f))return true
    if(f.type!=='entity'||!personShaped(f.entity))return false
    if(privateName(f.entity))return true
    const at=Math.max(0,(f.offset??0)-String(payload.answer??'').indexOf(f.text)),tail=f.text.slice(at+f.entity.length)
    const attribution=f.metric==='attribution'&&(reportingPredicate.test(tail)||/\b(?:discuss\w*|speak\w*|spoke|spoken|talk\w*)\b/i.test(tail)||quotationSpans(f.text).some(q=>q.at>=at+f.entity.length))
    const owner=findings.some(c=>c.type==='figure'&&c.text===f.text&&c.entity===f.entity)
    return (attribution||owner)&&!sources.some(s=>sourceAboutPerson(s,f.entity,true))
  })
}

/** Sentence ranges lose their citations while neighbouring sentences retain theirs, including short anchors. */
function uncite(payload:Record<string,unknown>,texts:Set<string>):Record<string,unknown> {
  const answer=String(payload.answer??''),spans=[...texts].flatMap(text=>{
    const spans:[number,number][]=[]
    let at=answer.indexOf(text)
    while(at>=0&&text){
      const line=answer.lastIndexOf('\n',at-1)+1,from=/^[ \t]*(?:[-*•—–]+[ \t]+)*$/.test(answer.slice(line,at))?line:at
      spans.push([Array.from(answer.slice(0,from)).length,Array.from(answer.slice(0,at+text.length)).length]);at=answer.indexOf(text,at+text.length)
    }
    return spans
  })
  const citations=Object.fromEntries(Object.entries(payload.citations??{}).flatMap(([id,raw])=>{
    let ranges=Array.isArray(raw)?raw as [number,number][]:[]
    for(const [from,to]of spans)ranges=ranges.flatMap(([a,b])=>b<=from||a>=to?[[a,b]]:[...(a<from?[[a,from]]:[]),...(b>to?[[to,b]]:[])]) as [number,number][]
    return ranges.length?[[id,ranges]]:[]
  }))
  const sources=sourcesOf(payload).map(s=>({...s,cited:Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}))
  return {...payload,citations,sources,answer_status:Object.keys(citations).length?'partly_cited':'uncited'}
}

function unquote(text:string):string {
  for(const q of quotationSpans(text).reverse())text=text.slice(0,q.at)+q.value+text.slice(q.end)
  let at=unclosedQuoteOffset(text)
  while(at>=0){text=text.slice(0,at)+text.slice(at+1);at=unclosedQuoteOffset(text)}
  return text
}
const month='(?:January|February|March|April|May|June|July|August|September|October|November|December)'
const date='(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2} '+month+'(?: \\d{4})?|'+month+' (?:(?:19|20)\\d{2}|\\d{1,2}(?:,? \\d{4})?)|(?:19|20)\\d{2}(?:[–-]\\d{2,4}|s)?)'
const datePhrases=()=>new RegExp('\\b(?:(?:as of|on|in|by|after|before|during|since|from|until)\\s+)?'+date+'(?:\\s+and (?:again )?(?:on |in )?'+date+')*(?:,\\s*|\\s*)','gi')
function repairDate(text:string,offset:number):string {
  const match=[...text.matchAll(datePhrases())].find(m=>offset>=m.index&&offset<m.index+m[0].length)
  if(!match||quotationSpans(text).some(q=>match.index>=q.at&&match.index<q.end))return text
  const candidate=(text.slice(0,match.index)+text.slice(match.index+match[0].length)).trim().replace(/^[a-z]/,c=>c.toUpperCase())
  // Keeping the original uncited is better than a fragment or an orphaned pronoun.
  const lead=candidate.replace(/^(?:[-*•]+\s+)+/,'')
  return sentenceFragment(candidate)||/^(?:by|after|before|as of|on|in|during|since|from|until|he|she|they|it|his|her|their)\b/i.test(lead)?text:candidate
}

/** Keep soft points with their uncertainty visible in the existing citation status. */
export function prepareClaimPolicy(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  let out=payload
  for(let pass=0;pass<3;pass++){
    const audit=auditPayload(question,out),hard=new Set(hardClaimFindings(audit.findings,out)),answer=String(out.answer??'')
    const firstGap=answer.indexOf('\n\n')
    const copied=(f:AuditedClaim)=>sourcesOf(out).some(s=>s.kind!=='speech'&&s.kind!=='bill'&&String(s.snippet??'').replace(/\s*—\s*/g,', ').includes(f.text.replace(/\.$/,'').replace(/\s*—\s*/g,', ')))
    const soft=audit.findings.filter(f=>!hard.has(f)&&!copied(f)&&(!protectedDecision(out)||(f.offset??answer.indexOf(f.text))>=(firstGap<0?answer.length:firstGap)))
    if(!soft.length)break
    researchTrace('grounding.soft_repairs',{question,answer,findings:soft})
    out=uncite(out,new Set(soft.map(f=>f.text)))
    const edits=new Map<string,string>()
    for(const f of soft){
      let text=edits.get(f.text)??f.text
      if(f.type==='quote'&&unclosedQuoteOffset(text)>=0){
        const at=unclosedQuoteOffset(text),mark=text[at]
        text=mark==='“'?text+'”':mark==='‘'?text+'’':mark==='"'||mark==="'"?text+mark:text.slice(0,at)+text.slice(at+1)
      }
      if(f.type==='period'){
        // Offsets belong to the original sentence; repair all its dates together below.
        text=f.text
        const offsets=soft.filter(c=>c.type==='period'&&c.text===f.text).map(c=>(c.offset??answer.indexOf(c.text))-answer.indexOf(c.text)).sort((a,b)=>b-a)
        for(const at of offsets)text=repairDate(text,at)
      }
      if(text!==f.text)edits.set(f.text,text)
    }
    if(!edits.size)break
    out=rewriteAnswerPayload(out,replace=>{for(const [text,repaired]of edits)replace(new RegExp(escape(text),'g'),repaired)})
  }
  return out
}

/** Existing privacy and attribution rules also apply to loose points at JSON, stream and cache boundaries. */
export function hardPolicySentences(answer:string):AuditedClaim[] {
  return sentenceParts(answer).filter(p=>withoutSaPlaceholder(p.text)!==p.text||
    repairCausal(p.text,undefined,()=>{})===null&&!/\b(?:do(?:es)? not establish|cannot establish|not evidence|no evidence)\b/i.test(p.text))
    .map(p=>({type:'policy',entity:'',metric:'hard policy',value:'',period:[],text:p.text,offset:p.at,evidence_ids:[],status:'unverified'}))
}
