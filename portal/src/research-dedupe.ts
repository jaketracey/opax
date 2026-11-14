import {sentenceParts,quotationSpans} from './research-claim-audit.mjs'
import {rewriteAnswerPayload} from './research-language'
import {answerCitationStatus} from './research-evidence'

type Source = {resource:string;url?:string;href?:string;speaker?:string;date?:string;kind?:string;coverage?:boolean}
const normal = (text:string) => text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const stop = new Set('a an and are as at be been by for from had has have in into is it its of on that the their this to was were which with also'.split(' '))
const words = (text:string) => new Set(normal(text).split(' ').filter(w=>!stop.has(w)))
// A shared number alone is not a shared claim. Different figures or qualifications always survive.
const figures = (text:string) => (text.match(/[-−+]?\d[\d,]*(?:\.\d+)?%?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|twice|half)\b/gi)??[]).map(n=>n.toLowerCase().replaceAll(',','')).join('|')
const qualifications = (text:string) => (normal(text).match(/\b(?:no|not|never|only|alleged|denied|may|might|could|unconfirmed)\b/g)??[]).sort().join('|')
// Conservative stems, rather than fuzzy spelling: a changed name or noun is never a synonym.
const stem=(word:string)=>({gave:'give',giving:'give',given:'give'}[word]??word.replace(/ies$/,'y').replace(/(\w{4})ing$/,'$1').replace(/(\w{4})ed$/,'$1').replace(/(\w{3})s$/,'$1'))
const MONTHS='january|february|march|april|may|june|july|august|september|october|november|december'
const nonPerson=new RegExp('^(?:the|in|on|it|its|this|that|a|an|royal|commission|commissioner|scheme|cabinet|government|ombudsman|'+MONTHS+')$')
function expandNames(text:string,context:string):string {
  // Expand only an acronym actually defined by a capitalised name in these statements.
  for(const m of context.matchAll(/\b(?:[A-Z][a-z]+(?:\s+(?:of|the|and))?\s+){1,5}[A-Z][a-z]+\b/g)){
    const acronym=m[0].split(/\s+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).join('')
    if(acronym.length>=2)text=text.replace(new RegExp('\\b'+acronym+'\\b','g'),m[0])
  }
  return text
}
function names(text:string,context=text,offices=true):string {
  text=expandNames(text,context)
  const found:{at:number;value:string}[]=[]
  const rest=text.replace(/\b\p{Lu}[\p{L}’'-]+(?:\s+(?:of|the|into|and))?(?:\s+\p{Lu}[\p{L}’'-]+)+\b/gu,(m,at)=>{
    // Reporting bodies and scheme titles may be abbreviated in the repeated finding.
    if(!/\b(?:commission|scheme|government|patent|report)\b/.test(normal(m))&&(offices||!/\b(?:department|services|ministry)\b/.test(normal(m))))found.push({at,value:normal(m)})
    return ' '.repeat(m.length)
  })
  for(const m of rest.matchAll(/\b\p{Lu}[\p{Ll}’'-]+\b/gu))if(!nonPerson.test(normal(m[0])))found.push({at:m.index!,value:normal(m[0])})
  if(offices)for(const m of rest.matchAll(/\b(?:ombudsman|cabinet|government|ministers?|secretar(?:y|ies)|officials?|directors?|commissioners?)\b/gi))found.push({at:m.index!,value:normal(m[0])})
  return found.sort((a,b)=>a.at-b.at).map(n=>n.value).join('|')
}
const dates=(text:string)=>(normal(text).match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/g)??[]).join('|')
function claimWords(text:string,context:string):Set<string> {
  return new Set([...words(expandNames(text,context))].filter(w=>! /^(?:royal|found|concluded|described|report|words|own|both|further|thus|that|said|had|its|his|which)$/.test(w)).map(stem))
}
const sameOrder=(a:Set<string>,b:Set<string>)=>[...a].filter(w=>b.has(w)).join('|')===[...b].filter(w=>a.has(w)).join('|')
/** Require containment as well as overlap. High overlap alone merges changed categories in long templates. */
function nearStatement(a:string,b:string):boolean {
  if(figures(a)!==figures(b)||dates(a)!==dates(b)||qualifications(a)!==qualifications(b)||names(a,a+' '+b)!==names(b,a+' '+b))return false
  const left=claimWords(a,a+' '+b),right=claimWords(b,a+' '+b),shared=[...left].filter(w=>right.has(w)).length
  const shorter=Math.min(left.size,right.size),union=left.size+right.size-shared
  return sameOrder(left,right)&&shared>=6&&shared===shorter&&(shared/union>=0.72||shared>=10)
}
/** A short quotation repeating a longer narrative's core claim gives way to that narrative.
 * Its citation anchors only the shared words, never the narrative's additional findings. */
function repeatedQuote(quote:string,narrative:string):{start:number;end:number}|null {
  const qs=quotationSpans(quote)
  if(qs.length!==1||quotationSpans(narrative).length||quote.length>=narrative.length||figures(quote)!==figures(narrative)||dates(quote)!==dates(narrative)||names(quote,quote+' '+narrative,false)!==names(narrative,quote+' '+narrative,false)||qualifications(quote)!==qualifications(narrative))return null
  const core=qs[0].value.split(',')[0].replace(/[.!?]+$/,'').trim()
  if(words(core).size<4)return null
  const at=narrative.toLowerCase().indexOf(core.toLowerCase())
  return at<0?null:{start:Array.from(narrative.slice(0,at)).length,end:Array.from(narrative.slice(0,at+core.length)).length}
}
export function sameStatement(earlier:string,later:string):boolean {
  if(figures(earlier)!==figures(later)||dates(earlier)!==dates(later)||qualifications(earlier)!==qualifications(later))return false
  if(normal(earlier)===normal(later))return true
  if(normal(later).length>=20&&(' '+normal(earlier)+' ').includes(' '+normal(later)+' ')){
    // Contained programme/category fragments need not name every entity in the full statement.
    // A newly attributed statement still belongs to its named speaker.
    const attribution=(s:string)=>normal(s).match(/(?:^| )([\p{L} ]+?) (?:said|told|stated|reported)(?: |$)/u)?.[1]??''
    return attribution(earlier)===attribution(later)
  }
  const a=words(earlier),b=words(later),shared=[...b].filter(w=>a.has(w)).length
  // Even one additional name can change who the finding is about.
  if(a.size!==b.size||names(earlier,earlier+' '+later)!==names(later,earlier+' '+later))return false
  // Substituting a category, name or claim word is new content even in a long shared template.
  return sameOrder(a,b)&&shared>=6&&shared===Math.min(a.size,b.size)&&shared/Math.max(a.size,b.size)>=0.9
}
// Find the longest shared run of content words. Extra names or findings break the run,
// so a transferred citation never gains the fuller sentence's additional subjects.
export function sharedCitationSpan(from:string,to:string):{start:number;end:number}|null {
  if(normal(from)===normal(to))return {start:0,end:Array.from(to).length}
  const tokens=(text:string)=>[...text.matchAll(/[\p{L}\p{N}’'-]+/gu)].filter(m=>!stop.has(normal(m[0]))).map(m=>({word:stem(normal(m[0])),at:m.index!,end:m.index!+m[0].length}))
  const a=tokens(from),b=tokens(to)
  let best=0,left=0,right=0
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    let n=0
    while(i+n<a.length&&j+n<b.length&&a[i+n].word===b[j+n].word)n++
    if(n>best){best=n;left=b[j].at;right=b[j+n-1].end}
  }
  if(!best)return null
  // The whole wording is shared apart from function words and punctuation.
  if(best===b.length)return {start:0,end:Array.from(to).length}
  return {start:Array.from(to.slice(0,left)).length,end:Array.from(to.slice(0,right)).length}
}

/** Different passages from one document are one source; different speakers remain separate claims. */
export const statementSource = (source:Source):string => [(source.url||source.href||source.resource.replace(/\/t\/.*$/,'')).split('#')[0],source.speaker??'',source.date??''].join('|')

/** Keep the fuller wording and transfer the removed copy's citations before rebasing every range. */
export function dedupeAnswer<T extends Record<string,unknown>>(payload:T):T {
  if(typeof payload.answer!=='string')return payload
  const answer=payload.answer,chars=Array.from(answer),sources=(payload.sources??[]) as Source[]
  const citations=structuredClone((payload.citations??{}) as Record<string,[number,number][]>)
  type Part={at:number;text:string;start:number;end:number;ids:string[]}
  const part=(text:string,at:number):Part=>{
    const start=Array.from(answer.slice(0,at)).length,end=start+Array.from(text).length
    const ids=Object.entries(citations).filter(([,ranges])=>ranges.some(([a,b])=>chars.slice(Math.max(a,start),Math.min(b,end)).some(c=>/[\p{L}\p{N}]/u.test(c)))).map(([id])=>id)
    return {text,at,start,end,ids}
  }
  const provenance=(p:Part)=>new Set(p.ids.map(id=>{
    const source=sources.find(s=>id===s.resource||id.startsWith(s.resource+'/'))
    return source?statementSource(source):id.replace(/\/t\/.*$/,'')
  }))
  const sameSource=(a:Part,b:Part)=>{
    const left=provenance(a),right=provenance(b)
    return !left.size||!right.size||left.size===right.size&&[...left].every(id=>right.has(id))
  }
  const recordsOnly=(p:Part)=>p.ids.length>0&&p.ids.every(id=>sources.some(s=>(id===s.resource||id.startsWith(s.resource+'/'))&&s.kind==='record'&&!s.speaker&&!s.coverage))
  const removed:Part[]=[],kept:Part[]=[]
  const transfers=(from:Part,to:Part)=>{
    const ranges:{id:string;start:number;end:number}[]=[]
    const shared=repeatedQuote(from.text,to.text)??sharedCitationSpan(from.text,to.text)
    for(const id of from.ids)for(const [a,b] of citations[id]){
      const start=Math.max(a,from.start),end=Math.min(b,from.end)
      if(start>=end)continue
      if(start===from.start&&end===from.end){if(!shared)return null;ranges.push({id,start:to.start+shared.start,end:to.start+shared.end});continue}
      // A partial citation must stay partial. If its exact text cannot be located in the earlier wording,
      // retain both sentences rather than widening the citation to the whole sentence.
      const text=chars.slice(start,end).join(''),at=to.text.indexOf(text)
      if(at<0)return null
      const offset=Array.from(to.text.slice(0,at)).length
      ranges.push({id,start:to.start+offset,end:to.start+offset+Array.from(text).length})
    }
    return ranges
  }
  const consider=(p:Part)=>{
    if(removed.some(r=>p.start>=r.start&&p.end<=r.end))return
    const prior=kept.find(k=>{
      const exact=normal(k.text)===normal(p.text)
      if(!exact&&!sameSource(k,p)&&!(recordsOnly(k)&&recordsOnly(p)))return false
      return sameStatement(k.text,p.text)||nearStatement(k.text,p.text)||repeatedQuote(k.text,p.text)||repeatedQuote(p.text,k.text)
    })
    if(!prior){kept.push(p);return}
    const [from,to]=normal(p.text).length>normal(prior.text).length?[prior,p]:[p,prior]
    const moved=transfers(from,to)
    if(!moved){kept.push(p);return}
    for(const {id,start,end} of moved){const ranges=citations[id]??=[];if(!ranges.some(([a,b])=>a===start&&b===end))ranges.push([start,end]);if(!to.ids.includes(id))to.ids.push(id)}
    removed.push(from)
    if(to===p)kept.splice(kept.indexOf(prior),1,p)
  }
  // A paragraph may repeat the same sentences in a different order.
  for(const m of answer.matchAll(/[^\n]+/g))consider(part(m[0],m.index!))
  kept.length=0
  for(const p of sentenceParts(answer))consider(part(p.text,p.at))
  if(!removed.length)return payload
  const out=rewriteAnswerPayload({...payload,citations},replace=>{
    for(const p of removed.sort((a,b)=>b.at-a.at)){
      const line=answer.lastIndexOf('\n',p.at-1)+1,prefix=answer.slice(line,p.at)
      const at=/^\s*[-*]?\s*$/.test(prefix)?line:p.at
      replace(new RegExp(`(?<=^[\\s\\S]{${at}})[\\s\\S]{${p.at+p.text.length-at}}`,'g'),'')
    }
    replace(/[ \t]{2,}/g,' ')
    replace(/\n{3,}/g,'\n\n')
    replace(/^\s+|\s+$/g,'')
  })
  if(out.answer_status!=='uncited'&&out.answer_status!=='partly_cited')return out
  const {answer_status:_status,...rest}=out
  const status=answerCitationStatus(String(out.answer),out.citations)
  return {...rest,...(status?{answer_status:status}:{})} as T
}
