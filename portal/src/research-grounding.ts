import {auditPayload,quotationSpans,sentenceParts} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'
import {leadWithFinding,neutralAnonymousAttribution} from './research-answer-shape'
import {coherenceCheck,citationHasSentence,protectedDecision,answerDecision,canReconstructRanking,causalAsk} from './research-coherence.mjs'
import {proseFallback,writingFacts,appendWrittenPoints,usableFact,foundFacts,besideLimitation,emptyAnswer,renderedKind,tokens,RANKING_WORDS,type WritingInput} from './research-writing'
import {inferPeriod} from './agentic-ask'
import type {QualitativeAnswer} from './research-types'
import {rankingSourceMatches} from './research-ranking-scope.mjs'
import {plainCoverageRefusal} from './research-coverage'

/** Apply the loose-answer contract to final selected evidence, including ordinary fallback. */
function checkedClaims(payload:Record<string,unknown>,question:string,promote=true):Record<string,unknown> {
  let out=neutralAnonymousAttribution(plainAnswerPayload(payload))
  const auditFor=(value:Record<string,unknown>)=>{
    const audit=auditPayload(question,value),records=((Array.isArray(value.sources)?value.sources:[]) as SelectedSource[]).filter(s=>renderedKind(s.kind))
    // A line copied from a selected record is that record; every other line, including points beside it, is audited.
    audit.findings=audit.findings.filter(f=>{const line=f.text.endsWith('.')?f.text.slice(0,-1):f.text;return !records.some(s=>String(s.snippet??'').includes(line))})
    // Keep the decision itself; audit any accompanying substantive points without promoting them.
    if(!promote){const text=String(value.answer??''),end=text.indexOf('\n\n');audit.findings=audit.findings.filter(f=>{const inDecision=(f.offset??text.indexOf(f.text))<(end<0?text.length:end);const questionEcho=f.type==='quote'&&!f.entity&&!!f.quote&&question.includes(f.quote);const nonFactualIdentity=f.type==='entity'&&f.metric==='identity'&&!audit.claims.some(c=>c.text===f.text&&['figure','quote'].includes(c.type));return !inDecision||f.type!=='period'&&!questionEcho&&!nonFactualIdentity})}
    return audit
  }
  // A wrong party adjective need not erase a correctly owned statement.
  for(const source of (Array.isArray(out.sources)?out.sources:[]) as Record<string,unknown>[]){
    if(!source.cited||typeof source.speaker!=='string'||typeof source.party!=='string')continue
    const name=source.speaker.replace(/-/g,' ').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    out=rewriteAnswerPayload(out,replace=>replace(new RegExp('\\b(Labor|Liberal|Greens|Nationals|Coalition|Independent)(?:[’\']s)?\\s+(?='+name+'\\b)','gi'),match=>match.trim().replace(/[’']s$/,'').toLowerCase()===String(source.party).toLowerCase()?match:''))
  }
  for(let attempt=0;attempt<3;attempt++){
    const audit=auditFor(out)
    if(!audit.findings.length)return promote?leadWithFinding(out):out
    const answer=String(out.answer??''),remove=new Set<string>()
    let repaired=false
    for(const finding of audit.findings){
      if(finding.type!=='figure'&&finding.type!=='period')continue
      const text=finding.text,base=answer.indexOf(text),at=(finding.offset??base)-base
      const detail=[...text.matchAll(/,\s+(?:with|including|plus|along with|at|in)\s+/g)].filter(m=>m.index!<at).at(-1)
      if(!detail||quotationSpans(text).some(q=>q.at<detail.index!&&q.end>detail.index!))continue
      const candidate=rewriteAnswerPayload(out,replace=>replace(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),text.slice(0,detail.index)+'.'))
      if(auditPayload(question,candidate).findings.length<audit.findings.length){out=candidate;repaired=true;break}
    }
    if(repaired)continue
    for(const finding of audit.findings){
      const text=finding.text,base=answer.indexOf(text)
      if(base<0)continue
      const at=finding.offset===undefined?Math.max(0,text.indexOf(finding.quote??finding.entity)):Math.max(0,finding.offset-base)
      const quotes=quotationSpans(text)
      const boundaries=[0,...[...text.matchAll(/;\s+|,?\s+(?:and|while|whereas|because|but)\s+(?=(?:the |a |an |that |their |no |full |more |said |[A-Z]))/g)].filter(m=>!quotes.some(q=>m.index!>q.at&&m.index!<q.end)).map(m=>m.index!),text.length]
      const index=Math.max(0,boundaries.findIndex((b,i)=>b<=at&&boundaries[i+1]>at))
      remove.add(text.slice(boundaries[index],boundaries[index+1]))
    }
    if(!remove.size)break
    out=rewriteAnswerPayload(out,replace=>{
      for(const text of remove)replace(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),/[.!?]$/.test(text)?'.':'')
    })
    out=plainAnswerPayload(out)
  }
  // Nothing unverified may escape a malformed or inseparable clause.
  const audit=auditFor(out)
  if(audit.findings.length){
    const sentences=[...new Set(audit.findings.map(f=>f.text))]
    out=rewriteAnswerPayload(out,replace=>{for(const sentence of sentences)replace(new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'')})
  }
  return promote?leadWithFinding(plainAnswerPayload(out)):plainAnswerPayload(out)
}

/** Remove empty paragraphs before remapping anchors; punctuation alone cannot carry a citation. */
export function cleanAnswerShape(payload:Record<string,unknown>):Record<string,unknown> {
  const cleaned=rewriteAnswerPayload(payload,replace=>{
    replace(/^(?:[ \t]*(?:\[\d+\]|[.!?,;:—–-]))+[ \t]*(?:\n|$)/gm,'')
    replace(/^(?:What the records? say(?:s)?|Answer|Overview|Summary):[ \t]*\n/gi,'')
    replace(/^(?:Other large donors include|Other donors include|Smaller amounts included)\s+/gi,'')
    replace(/^Further down[, ]+/gi,'')
    replace(/^(?:Also|In addition|Furthermore|Further|However|Meanwhile|Additionally|Moreover|And)[, ]+([a-z]?)/gi,match=>match.replace(/^[A-Za-z]+(?: addition)?[, ]+/,'').replace(/^./,c=>c.toUpperCase()))
    replace(/^Other\s+/gi,'')
    replace(/^Another passage\b/gi,'A selected passage')
    replace(/\n{3,}/g,'\n\n')
    replace(/^\s+|\s+$/g,'')
  })
  const citations=Object.fromEntries(Object.entries(cleaned.citations??{}).flatMap(([id,ranges])=>{if(/^USER_CONTEXT_/i.test(id))return [];const kept=Array.isArray(ranges)?ranges.filter(range=>citationHasSentence(String(cleaned.answer??''),range)):[];return kept.length?[[id,kept]]:[]}))
  if(JSON.stringify(citations)===JSON.stringify(cleaned.citations??{}))return cleaned
  const sources=Array.isArray(cleaned.sources)?cleaned.sources.map(s=>s&&typeof s==='object'?{...s,cited:s.cited===true&&Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}:s):[]
  return {...cleaned,citations,sources}
}
type SelectedSource=WritingInput['facts'][number]['source']
/** Every monetary fallback sentence needs selected evidence for its own owner/amount association. */
function citeFallbackMoney(payload:Record<string,unknown>,question:string,selected:SelectedSource[]):Record<string,unknown> {
  const research=payload.research as {mode?:string;coherence?:{fallback?:boolean}}|undefined
  if(research?.mode!=='planner'&&!research?.coherence?.fallback&&!(payload.coherence as {fallback?:boolean}|undefined)?.fallback)return payload
  // The writer may have attached verified period atoms/canonical rows to these
  // same selected resources. Retain them; this never admits another resource.
  const current=(Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]
  selected=selected.map(s=>({...current.find(c=>c.resource===s.resource)??s,cited:true}))
  const money=(a:ReturnType<typeof auditPayload>)=>a.claims.filter(c=>c.type==='figure'&&c.unit?.startsWith('AUD'))
  let out=payload,repaired=0,omitted=0
  for(const part of sentenceParts(String(payload.answer??''))){
    const answer=String(out.answer??''),at=answer.indexOf(part.text);if(at<0)continue
    const from=Array.from(answer.slice(0,at)).length,until=from+Array.from(part.text).length
    const keys=Object.entries(out.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(([a,b]:number[])=>a<until&&b>from)).map(([id])=>id)
    const associated=selected.filter(s=>keys.some(id=>id===s.resource||id.startsWith(s.resource+'/')))
    const probe=(sources:SelectedSource[])=>auditPayload(question,{answer:part.text,sources,citations:{}})
    const available=probe(selected),claims=money(available)
    if(!claims.length)continue
    if(associated.length&&claims.every(c=>c.status==='supported'&&c.evidence_ids.some(id=>associated.some(s=>id===s.resource||id.startsWith(s.resource+'/')))))continue
    if(claims.some(c=>c.status!=='supported')){
      out=rewriteAnswerPayload(out,replace=>replace(new RegExp(part.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),''));omitted++;continue
    }
    const citations=Object.fromEntries(Object.entries((out.citations??{}) as Record<string,[number,number][]>).map(([id,ranges])=>[id,ranges.map(([a,b])=>[a,b] as [number,number])]))
    const support=[...new Set(claims.flatMap(c=>c.evidence_ids))].filter(id=>selected.some(s=>s.resource===id))
    for(const resource of support){
      const id=Object.keys(citations).find(id=>id===resource||id.startsWith(resource+'/'))??resource+'/t/body/0'
      if(!(citations[id]??[]).some(([a,b])=>a<=from&&b>=until))(citations[id]??=[]).push([from,until])
    }
    out={...out,citations,sources:((out.sources??[]) as SelectedSource[]).map(s=>support.includes(s.resource)?{...s,cited:true}:s)};repaired++
  }
  if(!repaired&&!omitted)return out
  if(!String(out.answer??'').trim())out={...out,answer:'The selected evidence does not establish the requested financial answer.',answer_decision:'limitation',citations:{}}
  return cleanAnswerShape({...out,coherence:{...((out.coherence??{}) as object),monetary_citations:{repaired,omitted}}})
}
/** Everything found for this answer: the facts handed to the writer, else the records it cites. */
function foundInput(payload:Record<string,unknown>,question:string):WritingInput {
  const scope=payload.answer_scope as WritingInput['constraints'],found=(payload.research as {pre_writer_sources?:SelectedSource[]}|undefined)?.pre_writer_sources
  const sources=found?.length?found:((Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]).filter(s=>s.cited===true)
  // writingFacts re-derives what it added to a receipt's snippet, so only the fact itself goes back in.
  const facts=writingFacts({answer:'',citations:{},sources:sources.map(s=>({...s,cited:true,...(s.receipt?{snippet:s.snippet.split('\n')[0]}:{})}))})
  return {question,period:scope?.period??inferPeriod(question),facts,constraints:scope}
}
/** The terminal rule.
 * 1. The system's own empty sentence gives way to on-topic facts.
 * 2. A limit that says something stays first and unchanged, with what was found beside it.
 * 3. Typed refusals and clarifications, causal asks, period guards and drafts that say nothing about the record are left alone.
 * An answer with no limit to keep, but none of the figures asked for, gets them ahead of it. */
function answerFromFound(out:Record<string,unknown>,question:string,evidence:Record<string,unknown>):Record<string,unknown> {
  const decision=answerDecision(out),method=(out.coherence as {method?:string}|undefined)?.method,text=String(out.answer??''),empty=emptyAnswer(text)
  if(decision==='refusal'||decision==='clarification'||causalAsk(question)||(out.coverage as {matched?:boolean}|undefined)?.matched===false)return out
  if(!empty&&(out.answer_status==='coverage_only'||['checked_points_with_limit','combined_count_limit','facts_beside'].includes(String(method))))return out
  const input=foundInput(evidence,question),found=foundFacts(input)
  if(!found.length)return out
  const figuresOf=(f:WritingInput['facts'][number])=>(f.atoms??[]).map(a=>a.value).filter(v=>v.length>2)
  const values=found.flatMap(figuresOf),said=tokens(text)
  // A ranking of receipts is only answered by its leader, not by a lower row that survived.
  const leader=RANKING_WORDS.test(question)?found.find(f=>f.source.receipt):undefined
  const shown=(leader?figuresOf(leader):values).some(v=>said.includes(v))
  const {answer_status:_status,...rest}=out,diagnostics=(out.coherence??{}) as object
  if(!empty&&decision!=='answer'){
    // A figure-free draft naming nothing that was found says nothing about the record: it may be asking the reader something.
    if(shown||decision==='preserve'&&!found.some(f=>(f.atoms??[]).some(a=>a.entity&&text.includes(a.entity))))return out
    const beside=besideLimitation(input)
    if(!beside)return out
    const lead=text.trim()+'\n\n',offset=Array.from(lead).length,citations=Object.fromEntries(Object.entries((out.citations??{}) as Record<string,number[][]>).map(([id,ranges])=>[id,[...ranges]]))
    for(const [id,ranges] of Object.entries(beside.citations))(citations[id]??=[]).push(...ranges.map(([a,b])=>[a+offset,b+offset]))
    return {...out,answer:lead+beside.answer,citations,sources:[...((out.sources??[]) as SelectedSource[]).filter(s=>!beside.sources.some(b=>b.resource===s.resource)),...beside.sources],coherence:{...diagnostics,method:'facts_beside'}}
  }
  const sources=(Array.isArray(out.sources)?out.sources:[]) as SelectedSource[],citedBy=Object.entries((out.citations??{}) as Record<string,unknown[]>).filter(([,ranges])=>Array.isArray(ranges)&&ranges.length).flatMap(([id])=>sources.filter(s=>id===s.resource||id.startsWith(s.resource+'/')))
  const figureAsked=/\bhow (?:much|many)\b|\b(?:most|least|fewest|largest|biggest|highest|lowest|top)\b/i.test(question)
  if(!empty&&(shown||!figureAsked||!values.length)&&citedBy.some(s=>!s.coverage&&!/^(?:period-)?coverage(?:-|$)/.test(s.resource)))return out
  if(!empty&&['uncited','partly_cited'].includes(String(out.answer_status))&&(shown||!figureAsked||!values.length))return out
  // This path answers from the facts' own dates, never from the period asked for.
  const facts=proseFallback({...input,period:{kind:'all',label:''},facts:input.facts.filter(f=>found.includes(f)||!usableFact(f))})
  if(facts.answer_decision==='limitation'&&!tokens(facts.answer).some(v=>values.includes(v)))return out
  const merged=empty?facts:appendWrittenPoints(facts,rest as unknown as QualitativeAnswer)
  return {...rest,...merged,coherence:{...diagnostics,...merged.coherence,fallback:true,method:'facts_rendered'}}
}
/** One final deterministic boundary shared by JSON, SSE, ordinary fallback and cache. */
export function groundAnswerPayload(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  return answerFromFound(checkedAnswer(payload,question),question,payload)
}
function checkedAnswer(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  payload=plainCoverageRefusal(payload,question)
  // An empty record-only prefix is not a refusal of the checked passage answer beside it.
  const prefix=/^OPAX cannot establish the requested answer from the selected records\.\s*\n\s*\n/.exec(String(payload.answer??''))?.[0]
  if(prefix&&!protectedDecision(payload)&&payload.answered!==false&&!payload.answer_status&&/^what\b.*\b(?:say|said|argue|think|position)\b/i.test(question)){
    const selected=(Array.isArray(payload.sources)?payload.sources:[]) as WritingInput['facts'][number]['source'][]
    const passage=selected.some(s=>s.cited&&s.kind==='speech'&&Object.entries(payload.citations??{}).some(([id,ranges])=>(id===s.resource||id.startsWith(s.resource+'/'))&&Array.isArray(ranges)&&ranges.some((r:number[])=>r[1]>prefix.length)))
    if(passage)payload=rewriteAnswerPayload(payload,replace=>replace(new RegExp('^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),''))
  }
  const sources=((Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]).filter(s=>s.cited===true&&!/^USER_CONTEXT_/i.test(s.resource))
  const audit=auditPayload(question,payload)
  // Legacy/cache migration is conservative: no figure claims means no permission
  // to change the draft's purpose. New writers and loop decisions carry the enum.
  const citedClaim=Object.values(payload.citations??{}).some(ranges=>Array.isArray(ranges)&&ranges.some(range=>citationHasSentence(String(payload.answer??''),range)))
  payload={...payload,answer_decision:answerDecision(payload)??(citedClaim||audit.claims.some(c=>['figure','quote'].includes(c.type)||c.type==='entity'&&c.metric==='attribution')?'answer':'preserve')}
  if(protectedDecision(payload))return citeFallbackMoney(cleanAnswerShape(checkedClaims(cleanAnswerShape(payload),question,false)),question,sources)
  const draft=String(payload.answer??''),checked=checkedClaims(cleanAnswerShape(payload),question)
  let out=leadWithFinding(cleanAnswerShape(checked),question)
  const stripped=Math.max(0,1-String(out.answer??'').length/Math.max(1,draft.length))
  const check=coherenceCheck(question,out)
  const donorQuestion=/donor|donat|money|funding/i.test(question)
  const rankingQuestion=/\b(?:who|which)\b.*\b(?:most|highest|largest|biggest|top)\b|\btop\s+\w+/i.test(question)
  const canReconstruct=donorQuestion||rankingQuestion?canReconstructRanking(payload,question):true
  if(canReconstruct&&(donorQuestion||stripped>1/3||!check.rankingLead||check.reasons.includes('first sentence does not answer')||check.reasons.includes('incomplete donor sentence'))&&sources.some(s=>['count','export','record','receipt','pay','grant','contract'].includes(s.kind))) {
    const input:WritingInput={question,constraints:payload.answer_scope as WritingInput['constraints'],period:{kind:'all',label:''},facts:sources.filter(s=>!['speech','bill'].includes(s.kind)&&(!rankingQuestion||donorQuestion||rankingSourceMatches(question,s,payload.answer_scope as WritingInput['constraints']))).flatMap((source,i)=>String(source.snippet??'').split(/\n+/).map((text,j)=>({id:i*100+j+1,text,source,coverage:/^coverage(?:-|$)/.test(source.resource)||/^Coverage:|^These are party receipts|^Federal AEC|^Opax added|^This selection|^It excludes|^Amounts are|^Based on AEC/i.test(text)})))}
    const fallback=proseFallback(input),audited=checkedClaims(fallback as unknown as Record<string,unknown>,question)
    if(Object.keys((audited.citations??{}) as object).every(id=>sources.some(s=>id===s.resource||id.startsWith(s.resource+'/')))&&!auditPayload(question,audited).findings.length&&coherenceCheck(question,audited).pass&&String(audited.answer??'').length>40){
      out={...payload,...cleanAnswerShape(audited),coherence:{...((payload.coherence??{}) as object),stripped_ratio:stripped,fallback:true}}
    }
  }
  // Checked points keep their purpose and ownership; never substitute an arbitrary quotation.
  if(stripped>1/3&&!((out.coherence as {fallback?:boolean}|undefined)?.fallback))out={...out,coherence:{stripped_ratio:stripped,fallback:true,method:'checked_points'}}
  // If checked points cannot supply the requested comparison, keep them beside
  // an explicit limitation instead of replacing them with a quotation.
  const incomplete=coherenceCheck(question,out)
  const comparison=/^How do (.+?) and (.+?) differ on (.+?)[?.!]*$/i.exec(question)
  const missingSide=comparison&&[comparison[1],comparison[2]].some(side=>!String(out.answer??'').toLowerCase().includes(side.replace(/^the /i,'').toLowerCase()))
  if(comparison&&(missingSide||!incomplete.pass&&incomplete.reasons.includes('first sentence does not answer'))){
    const lead=`The selected excerpts do not establish how ${comparison[1]} and ${comparison[2]} differ on ${comparison[3]}.`,prefix=lead+'\n\n',offset=Array.from(prefix).length
    const citations=Object.fromEntries(Object.entries(out.citations??{}).map(([id,ranges])=>[id,(ranges as number[][]).map(([a,b])=>[a+offset,b+offset])])) as Record<string,number[][]>
    for(const id of Object.keys(citations))citations[id].unshift([0,Array.from(lead).length])
    out={...out,answer:prefix+String(out.answer??''),answer_decision:'limitation',citations,coherence:{stripped_ratio:stripped,fallback:true,method:'checked_points_with_limit'}}
  }
  const years=[...new Set([...question.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>m[0]))].sort()
  const countData=sources.filter(s=>s.kind==='count'&&!/^coverage(?:-|$)/.test(s.resource))
  if(years.length===2&&/compar|versus|\bvs\b/i.test(question)&&countData.length===1&&/^\d[\d,]* chamber speeches/i.test(countData[0].snippet)&&years.every(y=>countData[0].snippet.includes(y))&&!years.some(y=>new RegExp('^'+y+':','m').test(countData[0].snippet))){
    const lead=`The selected records do not establish separate annual speech counts for ${years[0]} and ${years[1]}; they supply a combined total.`,prefix=lead+'\n\n',offset=Array.from(prefix).length
    const citations=Object.fromEntries(Object.entries(out.citations??{}).map(([id,ranges])=>[id,(ranges as number[][]).map(([a,b])=>[a+offset,b+offset])])) as Record<string,number[][]>
    const id=Object.keys(citations).find(id=>id===countData[0].resource||id.startsWith(countData[0].resource+'/'))
    if(id)citations[id].unshift([0,Array.from(lead).length])
    out={...out,answer:prefix+String(out.answer??''),answer_decision:'limitation',citations,coherence:{stripped_ratio:stripped,fallback:true,method:'combined_count_limit'}}
  }
  // Preserve diagnostics through repeated cache/boundary checks without creating them on unchanged answers.
  if(stripped>0&&!out.coherence)out={...out,coherence:{stripped_ratio:stripped,fallback:false}}
  return cleanAnswerShape(citeFallbackMoney(out,question,sources))
}
