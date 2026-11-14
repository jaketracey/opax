import {sentenceParts} from './research-claim-audit.mjs'
import {rewriteAnswerPayload} from './research-language'
import {answerCitationStatus} from './research-evidence'

type Source = {resource:string;url?:string;href?:string;speaker?:string;date?:string}
const normal = (text:string) => text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const stop = new Set('a an and are as at be been by for from had has have in into is it its of on that the their this to was were which with also'.split(' '))
const words = (text:string) => new Set(normal(text).split(' ').filter(w=>!stop.has(w)))
// A shared number alone is not a shared claim. Different figures or qualifications always survive.
const figures = (text:string) => (text.match(/[-−+]?\d[\d,]*(?:\.\d+)?%?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|twice|half)\b/gi)??[]).map(n=>n.toLowerCase().replaceAll(',','')).join('|')
const qualifications = (text:string) => (normal(text).match(/\b(?:no|not|never|only|alleged|denied|may|might|could|unconfirmed)\b/g)??[]).sort().join('|')
export function sameStatement(earlier:string,later:string):boolean {
  if(figures(earlier)!==figures(later)||qualifications(earlier)!==qualifications(later))return false
  if(normal(earlier)===normal(later))return true
  if(normal(later).length>=20&&(' '+normal(earlier)+' ').includes(' '+normal(later)+' '))return true
  const a=words(earlier),b=words(later),shared=[...b].filter(w=>a.has(w)).length
  // Even one additional name can change who the finding is about.
  if(a.size!==b.size)return false
  // Substituting a category, name or claim word is new content even in a long shared template.
  return shared>=6&&shared===Math.min(a.size,b.size)&&shared/Math.max(a.size,b.size)>=0.9
}
/** Different passages from one document are one source; different speakers remain separate claims. */
export const statementSource = (source:Source):string => [(source.url||source.href||source.resource.replace(/\/t\/.*$/,'')).split('#')[0],source.speaker??'',source.date??''].join('|')

/** Keep the first wording and transfer the removed copy's citations before rebasing every range. */
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
  const removed:Part[]=[],kept:Part[]=[]
  const transfers=(from:Part,to:Part)=>{
    const ranges:{id:string;start:number;end:number}[]=[]
    for(const id of from.ids)for(const [a,b] of citations[id]){
      const start=Math.max(a,from.start),end=Math.min(b,from.end)
      if(start>=end)continue
      if(start===from.start&&end===from.end){ranges.push({id,start:to.start,end:to.end});continue}
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
    const prior=kept.find(k=>(normal(k.text)===normal(p.text)||sameSource(k,p))&&sameStatement(k.text,p.text)&&transfers(p,k)!==null)
    if(!prior){kept.push(p);return}
    for(const {id,start,end} of transfers(p,prior)!){const ranges=citations[id]??=[];if(!ranges.some(([a,b])=>a===start&&b===end))ranges.push([start,end]);if(!prior.ids.includes(id))prior.ids.push(id)}
    removed.push(p)
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
