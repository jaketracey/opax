import {donorRanking} from './research-coherence.mjs'
import {answerStyleChecks,styleRows} from './research-answer-style.mjs'
import {sentenceParts} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'

/** Lead with a checked answer; repair a supported ranking clause before moving it. */
export function leadWithFinding<T extends Record<string,unknown>>(payload:T,question?:string):T {
  if(typeof payload.answer!=='string')return payload
  // Repair an existing supported ranking sentence, preserving its other clauses and anchors.
  if(question&&/most|highest|top/i.test(question)&&/speeches|spoke/i.test(question)){
    const sources=(Array.isArray(payload.sources)?payload.sources:[]) as {kind?:string}[]
    const rows=styleRows({sources:sources.filter(s=>s.kind==='count')}).filter(r=>!/^\d{4}$/.test(r.entity)&&/:\s*[\d,]+\s+(?:chamber\s+)?speeches\b/i.test(r.text)).sort((a,b)=>Number(b.value.replace(/[$,]/g,''))-Number(a.value.replace(/[$,]/g,'')))
    const top=rows[0]
    if(top){
      const escaped=String(top.entity).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),verb=new RegExp('^(?:Further down,\\s*)?'+escaped+' recorded '+String(top.value).replace(/[$,]/g,''),'i')
      const finding=sentenceParts(payload.answer).find(p=>verb.test(p.text))
      if(finding){
        let repaired=finding.text.replace(/^Further down,\s*/,'').replace(new RegExp(escaped+' recorded ','i'),top.entity+' led the selected ranking with ')
        const period=/ from \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?/.exec(top.text)?.[0]
        if(period&&!repaired.includes(period.trim()))repaired=repaired.replace(/,\s+(?:while|and|whereas)\s+|[.!?]$/,match=>period+(/,$/.test(match.trim())?'':/\b(?:while|and|whereas)\b/.test(match)?'. ':match))
        payload=rewriteAnswerPayload(payload,replace=>replace(new RegExp(finding.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),repaired))
      }
    }
  }
  const answer=String(payload.answer),parts=sentenceParts(answer)
  const limitation=(text:string)=>/^(?:(?:The|These|This) [^.!?]{0,100}\b(?:records?|passages?|evidence|material|selection)(?: (?:here|therefore|currently|retrieved|available))*|OPAX) (?:do(?:es)? not|cannot|can't)\b/i.test(text)
  const direct=(text:string)=>answerStyleChecks(question??'',text,{sources:payload.sources??[],ranking_rows:donorRanking(question??'',(payload.sources??[]) as [])}).direct_first_sentence==='pass'
  if(!parts.length||(question?direct(parts[0].text):!limitation(parts[0].text)))return payload
  const entries=Object.entries(payload.citations??{})
  const cp=(n:number)=>Array.from(answer.slice(0,n)).length
  // The model's own uncited lead is its answer (who was responsible, what was found): it stays first. Only a cited
  // lead that misses the question, or a limitation, gives way to the finding.
  const leadCited=entries.some(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<cp(parts[0].at+parts[0].text.length)&&r[1]>cp(parts[0].at)))
  if(question&&!leadCited&&!limitation(parts[0].text))return payload
  // A caveat is never promoted to lead: it qualifies the answer, whatever it happens to look like.
  const caveat=(p:{at:number;text:string})=>{const from=cp(p.at),until=cp(p.at+p.text.length),cited=entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<until&&r[1]>from)).map(([id])=>id),records=((Array.isArray(payload.sources)?payload.sources:[]) as {resource?:string;coverage?:boolean}[]);return cited.length>0&&cited.every(id=>/^coverage(?:-|\/|$)/.test(id)||records.some(s=>s.coverage&&(id===s.resource||id.startsWith(s.resource+'/'))))}
  const finding=question?parts.slice(1).find(p=>direct(p.text)&&!caveat(p)):parts.slice(1).find(p=>!limitation(p.text)&&/\$|[“”]|\b\d[\d,]* (?:speeches|votes|divisions|contracts|grants)\b/.test(p.text)&&entries.some(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<cp(p.at+p.text.length)&&r[1]>cp(p.at))))
  if(!finding)return payload
  const chars=Array.from(answer),from=cp(finding.at),until=cp(finding.at+finding.text.length)
  // A permutation of original characters keeps short legacy evidence anchors just as precisely as full spans.
  const segments=[[from,until],[0,from],[until,chars.length]],citations:Record<string,[number,number][]>={}
  let written=''
  for(let [a,b]of segments){
    while(a<b&&/\s/.test(chars[a]))a++
    while(b>a&&/\s/.test(chars[b-1]))b--
    if(a===b)continue
    if(written)written+='\n\n'
    const offset=Array.from(written).length
    written+=chars.slice(a,b).join('')
    for(const [id,ranges]of entries)if(Array.isArray(ranges))for(const range of ranges){
      if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
      const start=Math.max(a,range[0]),end=Math.min(b,range[1])
      if(start<end)(citations[id]??=[]).push([offset+start-a,offset+end-a])
    }
  }
  return plainAnswerPayload(rewriteAnswerPayload({...payload,answer:written,citations},replace=>replace(/^Another (?=(?:says|said|reports|describes)\b)/g,'A selected passage ')))
}

const QUANTITATIVE_QUESTION=/\bhow (?:many|much)\b|\b(?:most|highest|lowest|least|largest|biggest|top|total|fewest|ranked?)\b/i
// The kind of inquiry a record opening names ("The Royal Commission into the Robodebt Scheme" is a royal commission).
const INQUIRY_KIND=/\b(?:commission|inquiry|review|audit|investigation|report)\b/i
const escapeRegExp=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
/** Words that refer to the inquiry a record opening is about: its name before "into …" and "the <kind>"
 * ("Royal Commission", "the commission"). Null when the opening is not about an inquiry. */
function inquiryReference(subject:string):RegExp|null {
  const head=subject.replace(/\s+(?:into|of|on|for)\b.*$/i,'').replace(/^the\s+/i,'').trim()
  if(!head||!INQUIRY_KIND.test(head))return null
  const kind=head.split(/\s+/).pop()!
  return new RegExp(`\\b${escapeRegExp(head)}|\\bthe ${escapeRegExp(kind)}(?![a-z])`,'i')
}
const firstSentence=(text:string)=>sentenceParts(text)[0]?.text??''
const subjectOf=(sentence:string)=>{const m=/^(?:[-*]\s*)?((?:[A-Z][\w’'-]*|of|into|the|for|on|and)(?:\s+(?:[A-Z][\w’'-]*|of|into|the|for|on|and)){1,9})(?=,\s|\s+(?:is|was|are|were)\s)/.exec(sentence);return m?m[1]:''}
/** The second sentence of an opening says again who or what the first is: the same subject, then "is", "was" or an
 * apposition (a role, an office, establishment details). */
export function restatesOpening(first:string,second:string):boolean {
  const a=subjectOf(first),b=subjectOf(second)
  if(!a||a.split(/\s+/).length<2||a.toLowerCase()!==b.toLowerCase())return false
  const rest=(s:string,subject:string)=>s.replace(/^(?:[-*]\s*)?/,'').slice(subject.length)
  const described=(tail:string)=>/^,\s|^\s+(?:is|was|are|were)\s/i.test(tail)
  return described(rest(first,a))&&described(rest(second,b))
}
/** Merge a restated identity sentence into the opening: "X is a Victorian Labor politician who represents Y" after
 * "X is the Victorian Premier…" keeps only what it adds ("As a Victorian Labor politician, X represents Y"). Null when
 * the sentence has no such shape. */
function mergedRestatement(first:string,second:string):string|null {
  const subject=subjectOf(second),m=new RegExp('^'+subject.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+(?:is|was)\\s+(?:a|an|the)\\s+([^,;.]+?)\\s+(?:who|that)\\s+(.+)$').exec(second)
  if(!subject||!m)return null
  const known=new Set(first.toLowerCase().match(/[a-z’'-]+/g)??[]),generic=/^(?:politician|person|member|parliamentarian|mp|figure)$/
  const adds=(m[1].toLowerCase().match(/[a-z’'-]+/g)??[]).some(w=>!known.has(w)&&!generic.test(w))
  return adds?`As ${/^[aeiou]/i.test(m[1])?'an':'a'} ${m[1]}, ${subject} ${m[2]}`:`${subject} ${m[2]}`
}

/** The model's direct answer leads an answer that also carries record facts or written record prose; the record prose
 * follows as context, then the model's other points. The lead is the model's first point; when the record opens with
 * an inquiry, it is the model's first point reporting that inquiry, if there is one. Lines that continue the lead from
 * the same source stay with it. The record's opening is said once: a model point restating it goes, unless it is the cited
 * lead, when the record sentence keeps only what it adds. A count or money question keeps its calculated record lead. Every
 * kept line moves with its citations. */
export function leadWithModelAnswer<T extends Record<string,unknown>>(payload:T,points:{answer?:unknown;citations?:unknown}|undefined,question=''):T {
  if(typeof payload.answer!=='string'||typeof points?.answer!=='string')return payload
  const answer=payload.answer,pointText=points.answer
  const chars=Array.from(answer),entries=Object.entries(payload.citations??{}) as [string,unknown][]
  const cites=(a:number,b:number)=>entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<b&&r[1]>a)).map(([id])=>id)
  // Record facts and their coverage are cited as fact-N or coverage; the model's points cite passages, or nothing.
  const recordId=(id:string)=>/^(?:fact-\d+|coverage)(?:\/|$)/.test(id)
  // Lines of the composed answer, in code points. A line is the model's point when it cites only passages (the writer
  // may have worded a passage line itself) or, uncited, is one of the model's own lines; anything else is record prose.
  type Line={i:number;a:number;b:number;text:string;point:boolean;ids:string[]}
  const lines:Line[]=[]
  for(const m of answer.matchAll(/[^\n]+/g)){
    const text=m[0].trim();if(!text)continue
    const a=Array.from(answer.slice(0,m.index)).length+Array.from(m[0]).length-Array.from(m[0].trimStart()).length,b=a+Array.from(text).length,ids=cites(a,b)
    lines.push({i:lines.length,a,b,text,ids,point:ids.length?ids.every(id=>!recordId(id)):pointText.includes(text.replace(/^[-*]\s*/,''))})
  }
  const firstPoint=lines.findIndex(l=>l.point)
  // Nothing to lead past: no record prose before the points.
  if(firstPoint<=0)return payload
  const lastPoint=lines.length-1-[...lines].reverse().findIndex(l=>l.point)
  const record=lines.filter(l=>!l.point&&l.i<lastPoint),modelLines=lines.filter(l=>l.point)
  if(QUANTITATIVE_QUESTION.test(question)&&/\$?\d/.test(firstSentence(record[0].text)))return payload
  const sourcesOf=(l:Line)=>new Set(l.ids.map(id=>id.split('/')[0]))
  // The record's opening (an inquiry's dates and commissioner, a person's seat) is said once: a model point that
  // restates it goes when uncited or when the record sentence carries the citation; a cited lead keeps only what it adds.
  const recordOpening=firstSentence(record[0].text),recordCited=record[0].ids.length>0
  const restating=new Set(modelLines.filter(l=>restatesOpening(firstSentence(l.text),recordOpening)))
  const candidates=modelLines.filter(l=>!restating.has(l)||l.ids.length>0)
  if(!candidates.length)return payload
  // The model's first point leads, unless the record opens with an inquiry: then the first of its points that reports
  // that inquiry (its findings, its report, its commissioner) leads, so another body's view never comes first.
  const inquiry=inquiryReference(subjectOf(recordOpening))
  const lead=(inquiry&&candidates.find(l=>!restating.has(l)&&inquiry.test(l.text)))||candidates[0]
  let rewrite:string|null=null
  if(restating.has(lead)){const merged=mergedRestatement(firstSentence(lead.text),recordOpening);if(merged)rewrite=merged}
  const dropped=new Set([...restating].filter(l=>l!==lead&&(!l.ids.length||recordCited)))
  // Lines after the lead that continue it from the same source ("The same speech records…") stay with it.
  const block=[lead]
  for(let i=lead.i+1;i<lines.length;i++){const l=lines[i],own=sourcesOf(lead),next=sourcesOf(l);if(!l.point||!next.size||![...next].every(id=>own.has(id)))break;block.push(l)}
  const moved=new Set([...block,...dropped])
  // Record prose keeps its own line breaks where its lines were adjacent (a fact list stays a list); the points
  // around it are paragraphs. Record lines after the last point (coverage notes) stay last.
  const runs=(group:Line[])=>{const out:[number,number][]=[];let prev:Line|undefined;for(const l of group){if(prev&&prev.i===l.i-1&&out.length)out[out.length-1][1]=l.b;else out.push([l.a,l.b]);prev=l}return out}
  const pieces:[number,number][]=[[block[0].a,block[block.length-1].b],...runs(record),...modelLines.filter(l=>!moved.has(l)).map(l=>[l.a,l.b] as [number,number]),...runs(lines.filter(l=>!l.point&&l.i>lastPoint))]
  const citations:Record<string,[number,number][]>={}
  let written=''
  for(const [a,b] of pieces){
    if(written)written+='\n\n'
    const offset=Array.from(written).length
    written+=chars.slice(a,b).join('')
    for(const [id,ranges]of entries)if(Array.isArray(ranges))for(const range of ranges){
      if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
      const start=Math.max(a,range[0]),end=Math.min(b,range[1])
      if(start<end)(citations[id]??=[]).push([offset+start-a,offset+end-a])
    }
  }
  let out={...payload,answer:written,citations} as T
  if(rewrite){const merged=rewrite;let once=false;out=rewriteAnswerPayload(out,replace=>replace(new RegExp(recordOpening.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),match=>once?match:(once=true,merged)))}
  return out
}
