import {quotationSpans,unclosedQuoteOffset} from './research-claim-audit.mjs'
/** Visitor answers describe the public record, never OPAX's internal machinery. */
export const ANSWER_INTERNAL_LANGUAGE = /\b(?:coverage (?:tools?|lookups?)|(?:tool|lookup|calculator) results?|unknown[- ]range|(?:the|this|our|available) (?:available )?(?:tool|lookup|calculator)(?=\s+(?:covers?|returns?|provides?|contains?|uses?|shows?|reports?|cannot|has|data))|data (?:from|returned by) (?:the|this) (?:tool|lookup|calculator)|data pipeline|(?:our|the) pipeline|pipeline|not yet (?:been )?(?:imported|ingested|indexed|loaded|fetched)|(?:been|being|was|were|are|is) (?:imported|ingested|backfilled)|imported for|ingest(?:ed|ion|ing)?|backfill(?:ed|ing|s)?|still being fetched|being fetched|fixture data|seed data|normali[sz]ed (?:title|name|text)|while indexing|currently indexing|indexing runs|coming soon|record type|indexed speech(?:es)?|speeches indexed|passages indexed|documents indexed|not yet indexed|indexed contests?|labelling pass|the labeller|pending exact export|in this release|(?:PDF )?body held|held PDF bod(?:y|ies)|held with the PDF|uncleared copyright)\b/i

/** Titles and quotations are source content, even when they contain an internal-sounding word. */
function protectedAnswerSpans(text:string,payload:Record<string,unknown>):[number,number][] {
  const spans:[number,number][]=[]
  spans.push(...quotationSpans(text).map(q=>[q.at,q.end] as [number,number]))
  for(const m of text.matchAll(/\b(?:The )?(?:[A-Z][\p{L}’'’-]*\s+(?:(?:of|the|and|for|to|a|an)\s+)?)+(?:Bill|Act|Report|Statement|Paper|Document)(?:\s+\d{4})?\b/gu))spans.push([m.index!,m.index!+m[0].length])
  for(const source of Array.isArray(payload.sources)?payload.sources:[]){
    if(!source||typeof source!=='object')continue
    const title=(source as Record<string,unknown>).title
    if(typeof title!=='string'||! /\b(?:Bill|Act|Report|Statement|Paper|Document)\b/.test(title))continue
    let at=text.indexOf(title)
    while(at>=0){spans.push([at,at+title.length]);at=text.indexOf(title,at+title.length)}
  }
  return spans
}

/** Edit only answer text, retaining source text and remapping code-point citations. */
export function rewriteAnswerPayload<T extends Record<string, unknown>>(payload:T,transform:(replace:(pattern:RegExp,replacement:string|((match:string)=>string))=>void)=>void,protectQuotes=false):T {
  if(typeof payload.answer!=='string')return payload
  const original=payload.answer
  let chars=Array.from(original),origins=chars.map((_,i)=>i)
  const replace=(pattern:RegExp,replacement:string|((match:string)=>string))=>{
    const text=chars.join(''),matches=[...text.matchAll(pattern)]
    for(const match of matches.reverse()){
      const protectedText=protectQuotes?protectedAnswerSpans(text,payload):[]
      if(protectedText.some(([a,b])=>match.index!<b&&match.index!+match[0].length>a))continue
      const from=Array.from(text.slice(0,match.index)).length,n=Array.from(match[0]).length
      const value=Array.from(typeof replacement==='string'?replacement:replacement(match[0])),old=origins.slice(from,from+n)
      chars.splice(from,n,...value)
      origins.splice(from,n,...value.map((_,i)=>old[Math.min(old.length-1,Math.floor(i*old.length/value.length))]??0))
    }
  }
  transform(replace)
  const answer=chars.join('')
  if(answer===original)return payload
  if(!answer)return {...payload,answer:'The available records do not establish an answer to this question.',citations:{},sources:[],answer_status:'coverage_only'}
  const citations:Record<string,[number,number][]>={}
  const entries=payload.citations&&typeof payload.citations==='object'?Object.entries(payload.citations):[]
  for(const [id,ranges]of entries)if(Array.isArray(ranges))for(const range of ranges){
    if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
    let from=-1,until=-1
    for(let i=0;i<origins.length;i++)if(origins[i]>=range[0]&&origins[i]<range[1]){if(from<0)from=i;until=i+1}
    if(from>=0)(citations[id]??=[]).push([from,until])
  }
  const sources=Array.isArray(payload.sources)?payload.sources.map(s=>{
    if(!s||typeof s!=='object'||!('resource'in s))return s
    const source=s as Record<string,unknown>
    return source.cited===true?{...source,cited:Object.keys(citations).some(id=>id===source.resource||id.startsWith(source.resource+'/'))}:source
  }):payload.sources
  return {...payload,answer,citations,sources}
}

export function plainAnswerPayload<T extends Record<string, unknown>>(payload:T):T {
  const unbalanced=(s:string)=>unclosedQuoteOffset(s)>=0
  if(typeof payload.answer==='string'&&unbalanced(payload.answer))payload=rewriteAnswerPayload(payload,replace=>{
    replace(/[^\n]+/g,paragraph=>unbalanced(paragraph)?paragraph.split(/(?<=[.!?])\s+/).filter(sentence=>!unbalanced(sentence)).join(' '):paragraph)
  })
  return rewriteAnswerPayload(payload,replace=>{
  // Match internal references in context; public titles and literal source language are protected.
  replace(/[,;]\s*(?:(?:and|so)\s+)?[^.!?;\n]+(?:[.!?]|$)/g,m=>ANSWER_INTERNAL_LANGUAGE.test(m)&&! /\d/.test(m)?'.':m)
  replace(/\bcatalog(?:ue)? hits\b/gi,'matching records')
  replace(/\b(?:coverage tools?|coverage lookups?)\b/gi,'coverage information')
  replace(/\bunknown[- ]range\b/gi,'unverified period')
  replace(/\b(?:data pipeline|our pipeline|the pipeline)\b/gi,'the records')
  replace(/\b(?:tool|lookup|calculator) results?\b/gi,'the selected records')
  replace(/\b(?:the|this|our|available) (?:available )?(?:tool|lookup|calculator)(?=\s+(?:covers?|returns?|provides?|contains?|uses?|shows?|reports?|cannot|has|data))\b/gi,'the available records')
  replace(/\bnot yet (?:been )?(?:imported|ingested|indexed|loaded|fetched)\b/gi,'not available')
  replace(/\bindexed (speeches|passages|documents|contests)\b/gi,m=>m.replace(/^indexed /i,''))
  replace(/\b(speeches|passages|documents) indexed\b/gi,m=>m.replace(/ indexed$/i,''))
  replace(/[^.!?\n]+(?:[.!?]|$)/g,m=>ANSWER_INTERNAL_LANGUAGE.test(m)?'':m)
  replace(/[ \t]+(?=[,;:.!?])/g,'')
  replace(/[,;:]+(?=[.!?])/g,'')
  replace(/(?<=[.!?])[,;:]+/g,'')
  replace(/(^|\n\n)[.;,]\s*(?=[A-Z])/g,m=>m.startsWith('\n')?'\n\n':'')
  replace(/\.{2,}/g,'.')
  replace(/[ \t]{2,}/g,' ')
  replace(/\n(?:[ \t]*\n){2,}/g,'\n\n')
  replace(/(?:^|\n\n)[^\n]+(?=\n\n|$)/g,m=>{
    const text=m.trim()
    if(!/^(?:[,;.]|and\b|but\b|while\b|because\b)/i.test(text))return m
    if(!/\d|\b(?:is|are|was|were|has|have|had|said|says|received|recorded|earned|gave|gives|cited|cannot|do|does|will|would|could|should|limits|compares)\b/i.test(text))return ''
    return m.replace(/^(\n\n)?[,;. ]+/,'$1').replace(/^(\n\n)?(?:and|but|while)\s+([a-z])/,(_,gap='',letter:string)=>gap+letter.toUpperCase())
  })
  replace(/^\s+|\s+$/g,'')
  },true)
}
