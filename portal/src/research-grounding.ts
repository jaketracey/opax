import {auditPayload} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'

/** Apply the loose-answer contract to final selected evidence, including ordinary fallback. */
export function groundAnswerPayload(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  let out=plainAnswerPayload(payload)
  for(let attempt=0;attempt<3;attempt++){
    const audit=auditPayload(question,out)
    if(!audit.findings.length)return out
    const answer=String(out.answer??''),remove=new Set<string>()
    for(const finding of audit.findings){
      const text=finding.text,base=answer.indexOf(text)
      if(base<0)continue
      const at=finding.offset===undefined?Math.max(0,text.indexOf(finding.quote??finding.entity)):Math.max(0,finding.offset-base)
      const quotes=[...text.matchAll(/[“"]([^”"]+)[”"]|(?<![\p{L}])[‘']([^’']+)[’'](?![\p{L}])/gu)]
      const boundaries=[0,...[...text.matchAll(/;\s+|,?\s+(?:and|while|whereas|because|but)\s+(?=(?:the |a |an |that |their |no |full |more |said |[A-Z]))/g)].filter(m=>!quotes.some(q=>m.index!>q.index!&&m.index!<q.index!+q[0].length)).map(m=>m.index!),text.length]
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
  return plainAnswerPayload(out)
}
