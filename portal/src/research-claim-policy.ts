import {auditPayload,quotationSpans,unclosedQuoteOffset,sentenceParts,type AuditedClaim} from './research-claim-audit.mjs'
import {rewriteAnswerPayload} from './research-language'
import {sourceAboutPerson} from './ask-followup'
import {repairCausal} from './research-evidence'
import {protectedDecision} from './research-coherence.mjs'
import {withoutSaPlaceholder} from '../public/sa-hansard.js'
import {researchTrace} from './research-trace'

type Source={resource:string;snippet?:string;speaker?:string;cited?:boolean;kind?:string}
const sourcesOf=(p:Record<string,unknown>)=>(Array.isArray(p.sources)?p.sources:[]) as Source[]
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')

/** The audit describes evidence associations. Only fabricated figures and absent speakers are hard findings. */
export function hardClaimFindings(findings:AuditedClaim[],payload:Record<string,unknown>):AuditedClaim[] {
  const sources=sourcesOf(payload).filter(s=>!/^USER_CONTEXT_/i.test(s.resource))
  const figures=sources.flatMap(s=>auditPayload('',{answer:s.snippet,sources:[s],citations:{}}).claims).filter(c=>c.type==='figure')
  const personalMoney=(f:AuditedClaim)=>f.unit?.startsWith('AUD')&&sources.some(s=>s.speaker&&sourceAboutPerson(s,f.entity,true))&&
    !auditPayload('',{answer:unquote(f.text).replace(/\b(?:19|20)\d{2}(?:[–-]\d{2,4})?\b/g,''),sources,citations:{}}).claims.some(c=>c.type==='figure'&&c.value===f.value&&c.unit?.startsWith('AUD')&&c.status==='supported')
  return findings.filter(f=>f.type==='figure'&&(!figures.some(c=>c.value===f.value&&c.unit===f.unit)||
    // A speaker's byline is not evidence that they personally received or gave the money in their speech.
    personalMoney(f))||
    f.type==='entity'&&(f.metric==='attribution'||findings.some(c=>c.type==='figure'&&c.text===f.text&&c.entity===f.entity))&&
    !sources.some(s=>sourceAboutPerson(s,f.entity,true)))
}

/** Sentence ranges lose their citations while neighbouring sentences retain theirs, including short anchors. */
function uncite(payload:Record<string,unknown>,texts:Set<string>):Record<string,unknown> {
  const answer=String(payload.answer??''),spans=[...texts].flatMap(text=>{
    const spans:[number,number][]=[]
    let at=answer.indexOf(text)
    while(at>=0&&text){spans.push([Array.from(answer.slice(0,at)).length,Array.from(answer.slice(0,at+text.length)).length]);at=answer.indexOf(text,at+text.length)}
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
const dateAt=/^(?:\d{4}-\d{2}-\d{2}|\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:,? \d{4})?|(?:19|20)\d{2}(?:[–-]\d{2,4}|s)?)/

/** Keep soft points as paraphrases with their uncertainty visible in the existing citation status. */
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
      if(f.type==='quote'&&!sourcesOf(out).some(s=>(!f.entity||sourceAboutPerson(s,f.entity,true))&&f.quote&&String(s.snippet??'').includes(f.quote)))text=unquote(text)
      if(f.type==='period'){
        const raw=dateAt.exec(answer.slice(f.offset??answer.indexOf(f.text)))?.[0]
        if(raw){
          const originalAt=(f.offset??0)-answer.indexOf(f.text)
          if(quotationSpans(f.text).some(q=>originalAt>=q.at&&originalAt<q.end))text=unquote(text)
          text=text.replace(new RegExp('\\b(?:(?:on|in|during|since|from|until)\\s+)?'+escape(raw)+'(?:,\\s*|\\s*)','gi'),'').replace(/^\s+|\s+$/g,'')
          text=text.replace(/^[a-z]/,c=>c.toUpperCase())
        }
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
