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

/** The model's own direct answer (the first line of its points, cited or not) leads an answer that also carries record
 * facts or written record prose, which follow as the supporting record. A permutation: citations move with their text. */
export function leadWithModelAnswer<T extends Record<string,unknown>>(payload:T,points:{answer?:unknown;citations?:unknown}|undefined):T {
  if(typeof payload.answer!=='string'||typeof points?.answer!=='string')return payload
  const pointText=points.answer,first=/^[^\n]+/.exec(pointText)?.[0]
  if(!first)return payload
  const firstEnd=Array.from(first).length
  const answer=payload.answer,at=answer.indexOf(first)
  if(at<=0)return payload
  const chars=Array.from(answer),from=Array.from(answer.slice(0,at)).length,until=from+firstEnd
  const entries=Object.entries(payload.citations??{}),citations:Record<string,[number,number][]>={}
  let written=''
  for(let [a,b]of [[from,until],[0,from],[until,chars.length]]){
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
  return {...payload,answer:written,citations}
}
