import {auditPayload,quotationSpans,sentenceParts} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'
import {leadWithFinding,neutralAnonymousAttribution} from './research-answer-shape'
import {coherenceCheck,citationHasSentence} from './research-coherence.mjs'
import {proseFallback,type WritingInput} from './research-writing'

/** Apply the loose-answer contract to final selected evidence, including ordinary fallback. */
function checkedClaims(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  let out=neutralAnonymousAttribution(plainAnswerPayload(payload))
  // A wrong party adjective need not erase a correctly owned statement.
  for(const source of (Array.isArray(out.sources)?out.sources:[]) as Record<string,unknown>[]){
    if(!source.cited||typeof source.speaker!=='string'||typeof source.party!=='string')continue
    const name=source.speaker.replace(/-/g,' ').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    out=rewriteAnswerPayload(out,replace=>replace(new RegExp('\\b(Labor|Liberal|Greens|Nationals|Coalition|Independent)(?:[’\']s)?\\s+(?='+name+'\\b)','gi'),match=>match.trim().replace(/[’']s$/,'').toLowerCase()===String(source.party).toLowerCase()?match:''))
  }
  for(let attempt=0;attempt<3;attempt++){
    const audit=auditPayload(question,out)
    if(!audit.findings.length)return leadWithFinding(out)
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
  const audit=auditPayload(question,out)
  if(audit.findings.length){
    const sentences=[...new Set(audit.findings.map(f=>f.text))]
    out=rewriteAnswerPayload(out,replace=>{for(const sentence of sentences)replace(new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'')})
  }
  return leadWithFinding(plainAnswerPayload(out))
}

/** Remove empty paragraphs before remapping anchors; punctuation alone cannot carry a citation. */
export function cleanAnswerShape(payload:Record<string,unknown>):Record<string,unknown> {
  const cleaned=rewriteAnswerPayload(payload,replace=>{
    replace(/^(?:[ \t]*(?:\[\d+\]|[.!?,;:—–-]))+[ \t]*(?:\n|$)/gm,'')
    replace(/^(?:Other large donors include|Other donors include|Smaller amounts included)\s+/gi,'')
    replace(/^Further down[, ]+/gi,'')
    replace(/^(?:Also|In addition|Furthermore|Further|However|Meanwhile|Additionally|Moreover|And)[, ]+([a-z]?)/gi,match=>match.replace(/^[A-Za-z]+(?: addition)?[, ]+/,'').replace(/^./,c=>c.toUpperCase()))
    replace(/^Other\s+/gi,'')
    replace(/^Another passage\b/gi,'A selected passage')
    replace(/\n{3,}/g,'\n\n')
    replace(/^\s+|\s+$/g,'')
  })
  const citations=Object.fromEntries(Object.entries(cleaned.citations??{}).flatMap(([id,ranges])=>{const kept=Array.isArray(ranges)?ranges.filter(range=>citationHasSentence(String(cleaned.answer??''),range)):[];return kept.length?[[id,kept]]:[]}))
  if(JSON.stringify(citations)===JSON.stringify(cleaned.citations??{}))return cleaned
  const sources=Array.isArray(cleaned.sources)?cleaned.sources.map(s=>s&&typeof s==='object'?{...s,cited:s.cited===true&&Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}:s):[]
  return {...cleaned,citations,sources}
}
/** One final deterministic boundary shared by JSON, SSE, ordinary fallback and cache. */
export function groundAnswerPayload(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  const draft=String(payload.answer??''),checked=checkedClaims(cleanAnswerShape(payload),question)
  let out=leadWithFinding(cleanAnswerShape(checked),question)
  const stripped=Math.max(0,1-String(out.answer??'').length/Math.max(1,draft.length))
  const check=coherenceCheck(question,out)
  const sources=(Array.isArray(payload.sources)?payload.sources:[]) as WritingInput['facts'][number]['source'][]
  if((stripped>1/3||!check.rankingLead||check.reasons.includes('first sentence does not answer')||check.reasons.includes('incomplete donor sentence'))&&sources.some(s=>['count','export','record','receipt','pay','grant','contract'].includes(s.kind))) {
    const input:WritingInput={question,period:{kind:'all',label:''},facts:sources.filter(s=>!['speech','bill'].includes(s.kind)).flatMap((source,i)=>String(source.snippet??'').split(/\n+/).map((text,j)=>({id:i*100+j+1,text,source,coverage:/^coverage(?:-|$)/.test(source.resource)||/^Coverage:|^These are party receipts|^Federal AEC|^Opax added|^This selection|^It excludes|^Amounts are|^Based on AEC/i.test(text)})))}
    const fallback=proseFallback(input),audited=checkedClaims(fallback as unknown as Record<string,unknown>,question)
    if(!auditPayload(question,audited).findings.length&&coherenceCheck(question,audited).pass&&String(audited.answer??'').length>40){
      out={...payload,...cleanAnswerShape(audited),coherence:{...((payload.coherence??{}) as object),stripped_ratio:stripped,fallback:true}}
    }
  }
  if(stripped>1/3&&!((out.coherence as {fallback?:boolean}|undefined)?.fallback)){
    const surviving=(Array.isArray(out.sources)?out.sources:[]) as WritingInput['facts'][number]['source'][]
    const passages=surviving.filter(s=>s.cited&&s.kind==='speech'&&s.speaker)
    for(const source of passages){
      const passage=sentenceParts(source.snippet).find(p=>p.text.length>=30&&p.text.length<=400&&!/[“”"]/.test(p.text))
      if(!passage)continue
      const answer=`${source.speaker} said “${passage.text}”`,id=source.resource+'/t/body/0'
      const summary={...out,answer,citations:{[id]:[[0,Array.from(answer).length]]},sources:[source],coherence:{stripped_ratio:stripped,fallback:true}}
      if(!auditPayload(question,summary).findings.length&&coherenceCheck(question,summary).pass){out=summary;break}
    }
  }
  // Preserve diagnostics through repeated cache/boundary checks without creating them on unchanged answers.
  if(stripped>0&&!out.coherence)out={...out,coherence:{stripped_ratio:stripped,fallback:false}}
  return out
}
