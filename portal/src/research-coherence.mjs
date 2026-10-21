import {sentenceParts} from './research-claim-audit.mjs'
import {answerStyleChecks} from './research-answer-style.mjs'
// Shared, deterministic checks; evidence remains data and the claim audit remains authoritative.
export const danglingOpener = /^(?:[-*•]\s*|\d+[.)]\s*)?(?:other\b|also\b|in addition\b|further(?:more)?\b|however\b|meanwhile\b|additionally\b|moreover\b|and\b|another\b|the runners-up\b)/i
const folded = s => String(s??'').toLowerCase().replace(/[–—]/g,'-').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function donorRanking(question,sources=[]) {
  sources=Array.isArray(sources)?sources.filter(s=>s&&typeof s==='object'):[]
  if(!/most|top|largest|biggest|leading/i.test(question)||!/donor|donat|giv|gave|funding|take.*money|money.*from/i.test(question))return []
  const rows=[],coverage=sources.map(s=>s.snippet??'').join('\n')
  for(const source of sources){
    // ranked_money also supplies a native, privacy-filtered Donor table.
    const native=(String(source.snippet??'')+'\n'+String(source.title??'')).replace(/\*\*/g,'')
    if(/^fact-\d+$/.test(source.resource??'')&&source.kind==='record'&&/\/money(?:[/?]|$)/.test(String(source.url??source.href??''))&&/\|\s*Donor\s*\|\s*Disclosed receipts\s*\|/i.test(native)){
      const party=/has the largest disclosed total to (.+?) in this published selection/.exec(native)?.[1]
      const period=/Financial years:\s*([^\n.]+)/i.exec(native)?.[1]?.trim()
      if(party&&period)for(const line of native.split('\n')){
        const row=/^\|\s*(?:\[([^\]]+)\]\([^)]+\)|([^|]+))\s*\|\s*(\$\d(?:[\d,]*\d)?(?:\.\d+)?)\s*\|/.exec(line)
        if(row)rows.push({name:(row[1]??row[2]).trim(),party,amount:row[3],value:Number(row[3].replace(/[$,]/g,'')),period,source})
      }
    }
    if(source.kind==='receipt'&&/^receipt-ranking-\d+$/.test(source.resource??'')&&/grouped by donor/i.test(coverage)){
      const m=/^([^:\n]+): (\$\d(?:[\d,]*\d)?(?:\.\d+)?)/.exec(source.snippet??'')
      const period=/(?:Financial years|Period):\s*([^\n.]+)/i.exec(source.snippet??'')?.[1]
      const party=/\bto (?:the )?(Labor|Liberal|Greens|Nationals|LNP|One Nation)\b/i.exec(question)?.[1]
      if(m&&party)rows.push({name:m[1],party,amount:m[2],value:Number(m[2].replace(/[$,]/g,'')),period,source})
    }
    if(!/^fact-\d+$/.test(source.resource??'')||source.kind!=='export')continue
    for(const line of String(source.snippet??'').split('\n')){
      const m=/^(.+?) gave (.+?) (\$[\d,]+(?:\.\d+)?) \(federal disclosures(?:[^)]*)\)/.exec(line)
      if(!m)continue
      const span=/financial years ((?:19|20)\d{2}[–-]\d{2}(?: to (?:19|20)\d{2}[–-]\d{2})?)/i.exec(line)?.[1]
      // Return-reference years are not the period of an aggregated total.
      const period=span??/financial years ((?:19|20)\d{2}[–-]\d{2} to (?:19|20)\d{2}[–-]\d{2})/i.exec(coverage)?.[1]
      rows.push({name:m[1],party:m[2],amount:m[3],value:Number(m[3].replace(/[$,]/g,'')),period,source})
    }
  }
  return rows.filter((r,i)=>rows.findIndex(x=>x.name===r.name&&x.party===r.party&&x.value===r.value)===i).sort((a,b)=>b.value-a.value)
}
export function coherenceCheck(question,payload,{direct=answerStyleChecks(question,String(payload.answer??''),{sources:payload.sources??[],ranking_rows:donorRanking(question,payload.sources??[])}).direct_first_sentence==='pass'}={}) {
  const text=String(payload.answer??''),first=text.trim().split(/\n|(?<=[.!?])\s+(?=[A-Z])/)[0]??'',chars=Array.from(text)
  const orphan=[]
  for(const [id,ranges]of Object.entries(payload.citations??{})){if(!Array.isArray(ranges)){orphan.push(id);continue}for(const range of ranges)if(!citationHasSentence(text,range))orphan.push(id)}
  const ranking=donorRanking(question,payload.sources),top=ranking[0]
  const citedFirst=Object.values(payload.citations??{}).flat().some(([a,b])=>a< Array.from(first).length&&b>0)
  const rankingLead=!top||folded(first).includes(folded(top.name))&&first.includes(top.amount)&&!!top.period&&folded(first).includes(folded(top.period))&&citedFirst
  const stripped=Number(payload.coherence?.stripped_ratio??0),fallback=payload.coherence?.fallback===true
  const fragment=ranking.length>0&&text.split(/\n+/).some(p=>/^\s*(?:[-*•]\s*)?(?:[A-Z]\.){1,4}\s*$/.test(p)||/^\s*and\s/i.test(p))
  const reasons=[...(fragment?['incomplete donor sentence']:[]),...(!direct?['first sentence does not answer']:[]),...(!rankingLead?['missing selected ranking leader, amount, period or citation']:[]),...(orphan.length?['orphan citation']:[]),...(danglingOpener.test(first)?['dangling opener']:[]),...(/^\s*\[\d+\]\s*$/m.test(text)?['orphan citation marker']:[]),...(stripped>1/3&&!fallback?['over one third stripped without coherent fallback']:[])]
  return {pass:!reasons.length,reasons,orphan,rankingLead}
}

export function citationHasSentence(text,range) {
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))return false
  const [a,b]=range,chars=Array.from(text)
  if(a<0||b<=a||b>chars.length)return false
  return sentenceParts(text).some(p=>{const start=Array.from(text.slice(0,p.at)).length,end=start+Array.from(p.text).length;return a<end&&b>start&&/[\p{L}]/u.test(p.text.replace(/\[\d+\]/g,''))})
}
