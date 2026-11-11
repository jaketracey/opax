/** Measures are checked against the cited source family, never against question wording. */
import {sentenceParts} from './research-claim-audit.mjs'
type Evidence={kind?:unknown;url?:unknown;href?:unknown;snippet?:unknown;title?:unknown;receipt?:unknown;coverage?:unknown;speaker?:unknown;claim_atoms?:unknown}
type Measure='money'|'speeches'|'votes'|'mentions'
const moneyAction=/\b(?:takes?|took|taken|gets?|got|receiv(?:e[sd]?|ing)|donat(?:e[sd]?|ing)|gave|given|paid|pays?|earned|raised|contributed|funded)\b/i
const financial=/\b(?:money|donations?|funding|receipts?|dollars?|salary|salaries|expenses?|payments?|loans?)\b/i
const moneyAmount=/\$\s*\d|\b\d[\d,.]*\s*(?:AUD|dollars?)\b/i
const recordMetric=/\b(?:speeches?|spoke|spoken|speaking|talks?|talked|votes?|voted|divisions?|mentions?|topic counts?)\b/i
const quantitative=/\b\d[\d,.]*\b|\b(?:most|least|more|fewer|fewest|count|counts|total|top|largest|leading|led|rank\w*)\b/i

function claims(text:string):Set<Measure> {
 const out=new Set<Measure>()
 // Reporting what someone said is a speech claim, not confirmation of the quoted transaction.
 const report=/\b(?:said|argued|claimed|told|warned|stated|described|discussed|debated)\b/i.exec(text)
 const transaction=moneyAction.exec(text),amount=moneyAmount.exec(text)
 const limitation=/\b(?:cannot|could not|do not|does not)\s+(?:establish|calculate|determine|support|total)\b/i.exec(text)
 if(limitation&&(!transaction||limitation.index<transaction.index)&&(!amount||limitation.index<amount.index)||/^No (?:speech|vote|mention|topic)\b.*counts?\b/i.test(text))return out
 const reported=!!report&&(!transaction||report.index<transaction.index)&&(!amount||report.index<amount.index)
 if(!reported&&(moneyAmount.test(text)||financial.test(text)&&moneyAction.test(text)||
   /\b(?:most|more|less|largest)\s+(?:money|donations?|funding|receipts?)\b/i.test(text)||
   /\b(?:donated|donates|donating)\b/i.test(text)||
   /\b(?:is|was|are|were|been|being)\s+paid\b/i.test(text)&&!/\bpaid (?:leave|attention|tribute|respect)\b/i.test(text)||
   /\b(?:paid|earned)\b/i.test(text)&&quantitative.test(text)||
   /\b(?:received|receives|takes|gets)\s+(?:the\s+)?(?:most|\d)/i.test(text)&&!recordMetric.test(text)))out.add('money')
 const countText=text.replace(/\b(?:19|20)\d{2}(?:-\d{2}-\d{2}|[–-]\d{2,4})?\b/g,'').replace(/\[\d+\]/g,'')
 if(recordMetric.test(text)&&quantitative.test(countText)){
  if(/\b(?:speeches?|spoke|spoken|speaking|talks?|talked)\b/i.test(text))out.add('speeches')
  if(/\b(?:votes?|voted|divisions?)\b/i.test(text))out.add('votes')
  if(/\b(?:mentions?|topic counts?)\b/i.test(text))out.add('mentions')
 }
 if(reported||/\b(?:spoke|spoken|speaks|talked|talks|gave speeches|made speeches)\b/i.test(text))out.add('speeches')
 if(/\bvoted\b/i.test(text))out.add('votes')
 return out
}

function evidenceMeasures(source:Evidence):Set<Measure> {
 const out=new Set<Measure>(),kind=String(source.kind??'')
 const text=[source.title,source.snippet].filter(v=>typeof v==='string').join(' ')
 const url=String(source.url??source.href??'')
 // A dollar figure mentioned in Hansard never makes Hansard financial evidence.
 const speech=['speech','hansard'].includes(kind)||typeof source.speaker==='string'&&!!source.speaker||/\/doc\/(?:speech|hansard|committee)-/.test(url)
 const financialAtoms=Array.isArray(source.claim_atoms)&&source.claim_atoms.some(a=>a&&typeof a==='object'&&'unit' in a&&typeof a.unit==='string'&&a.unit.startsWith('AUD')&&'metric' in a&&['salary','base_salary','grants','contracts','receipts','median_personal_income','median_household_income'].includes(String(a.metric)))
 if(!speech&&kind!=='count'&&(kind==='receipt'||kind==='money'||!!source.receipt||financialAtoms||
   kind==='export'&&/\b(?:income|rent|mortgage)\b/i.test(text)&&moneyAmount.test(text)||
   /\/(?:money(?:[/?#]|$)|donor\/|party\/|pay(?:[/?#.]|$)|expenses?(?:[/?#]|$)|grants?(?:[/?#]|$)|contracts?(?:[/?#]|$)|subject\/(?:supplier|recipient)\/|graph\/(?:money|aec-extras))/.test(url)&&(financial.test(text)||moneyAmount.test(text))))out.add('money')
 if(speech)out.add('speeches')
 if(!out.has('money')){
  if(/\b(?:speeches?|spoke|hansard|hearing turns?)\b/i.test(text))out.add('speeches')
  if(/\b(?:votes?|voted|divisions?|all aye|all no)\b/i.test(text))out.add('votes')
  if(/\b(?:mentions?|topic counts?)\b/i.test(text))out.add('mentions')
 }
 return out
}

/** A sentence may require two families. An unrelated money citation cannot rescue a speech citation. */
export function claimMeasureConsistent(text:string,evidence:Evidence[]):boolean {
 const wanted=claims(text),supported=new Set(evidence.flatMap(s=>[...evidenceMeasures(s)]))
 return [...wanted].every(measure=>supported.has(measure))
}

export const MEASURE_GAP='OPAX cannot support that answer with the cited records. Speech, vote, mention and topic counts cannot establish financial amounts, and financial amounts cannot establish those counts.'

/** Citation offsets use Unicode code points. One-character footnotes own their preceding sentence.
 * A sentence whose measure its own citations cannot support is removed with its
 * citation ranges. The rest of the answer stands. MEASURE_GAP replaces the whole
 * answer only when no cited sentence survives. */
export function guardClaimMeasures<T extends Record<string,unknown>>(payload:T):T {
 if(typeof payload.answer!=='string')return payload
 const answer=payload.answer,points=Array.from(answer)
 const sources=Array.isArray(payload.sources)?payload.sources.filter((s):s is Evidence&{resource?:string}=>!!s&&typeof s==='object'):[]
 const citations=payload.citations&&typeof payload.citations==='object'?payload.citations as Record<string,unknown>:{}
 const bindings:{start:number;end:number;source:Evidence}[]=[]
 for(const [id,raw] of Object.entries(citations)){
  const source=sources.find(s=>s.resource===id||id.startsWith(s.resource+'/'))
  if(!source||!Array.isArray(raw))continue
  for(const range of raw)if(Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)){
   const [start,end]=range
   if(start>=0&&end>start&&end<=points.length)bindings.push({start,end,source})
  }
 }
 // Check each sentence independently, including clauses with no numeric amount.
 const parts=sentenceParts(answer)
 const cut:{start:number;end:number}[]=[]
 parts.forEach((part,index)=>{
  const text=part.text
  if(!claims(text).size)return
  const start=Array.from(answer.slice(0,part.at)).length,end=start+Array.from(text).length
  const own=bindings.filter(b=>b.start<end&&b.end>start).map(b=>b.source)
  // Existing passage and overview contracts allow uncited speech points. This
  // check must still reject speech claims whose citations contain only money.
  if(!own.length&&!claims(text).has('money')&&(!sources.length||!sources.every(s=>evidenceMeasures(s).has('money'))))return
  if(claimMeasureConsistent(text,own))return
  // Remove the sentence and the space up to the next sentence (or the end).
  const next=parts[index+1]
  cut.push({start,end:next?Array.from(answer.slice(0,next.at)).length:points.length})
 })
 if(!cut.length)return payload
 const gap={...payload,answer:MEASURE_GAP,answer_status:'evidence_gap',answer_decision:'limitation',citations:{},sources:[],...(payload.research&&typeof payload.research==='object'?{research:{...payload.research,sources:[]}}:{})}
 const removed=(i:number)=>cut.some(c=>i>=c.start&&i<c.end)
 const shift=(i:number)=>{let n=0;for(const c of cut)n+=Math.max(0,Math.min(i,c.end)-c.start);return i-n}
 const kept=points.filter((_,i)=>!removed(i)).join('').trimEnd()
 const length=Array.from(kept).length
 const nextCitations:Record<string,[number,number][]>={}
 for(const [id,raw] of Object.entries(citations)){
  if(!Array.isArray(raw))continue
  const ranges:[number,number][]=[]
  for(const range of raw){
   if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
   const start=Math.min(shift(range[0]),length),end=Math.min(shift(range[1]),length)
   if(end>start)ranges.push([start,end])
  }
  if(ranges.length)nextCitations[id]=ranges
 }
 if(!kept.trim()||!Object.keys(nextCitations).length)return gap
 const cited=(s:{resource?:string})=>Object.keys(nextCitations).some(id=>s.resource===id||id.startsWith(s.resource+'/'))
 const everCited=(s:{resource?:string})=>Object.keys(citations).some(id=>s.resource===id||id.startsWith(s.resource+'/'))
 const nextSources=sources.filter(s=>cited(s)||!everCited(s))
 return {...payload,answer:kept,citations:nextCitations,sources:nextSources} as T
}
