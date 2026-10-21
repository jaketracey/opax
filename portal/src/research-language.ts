/** Visitor answers describe the public record, never OPAX's internal machinery. */
export const ANSWER_INTERNAL_LANGUAGE = /\b(?:tools?|lookups?|calculators?|unknown[- ]range|coverage tools?|data pipeline|(?:our|the) pipeline|pipeline|not yet (?:been )?(?:imported|ingested|indexed|loaded|fetched)|(?:been|being|was|were|are|is) (?:imported|ingested|backfilled)|imported for|ingest(?:ed|ion|ing)?|backfill(?:ed|ing|s)?|still being fetched|being fetched|fixture data|seed data|normali[sz]ed (?:title|name|text)|while indexing|currently indexing|indexing runs|coming soon|record type|indexed speech(?:es)?|speeches indexed|passages indexed|documents indexed|not yet indexed|indexed contests?|labelling pass|the labeller|pending exact export|in this release|(?:PDF )?body held|held PDF bod(?:y|ies)|held with the PDF|uncleared copyright)\b/i

/** Edit only answer text, retaining source text and remapping code-point citations. */
export function rewriteAnswerPayload<T extends Record<string, unknown>>(payload:T,transform:(replace:(pattern:RegExp,replacement:string|((match:string)=>string))=>void)=>void):T {
  if(typeof payload.answer!=='string')return payload
  const original=payload.answer
  let chars=Array.from(original),origins=chars.map((_,i)=>i)
  const replace=(pattern:RegExp,replacement:string|((match:string)=>string))=>{
    const text=chars.join(''),matches=[...text.matchAll(pattern)]
    for(const match of matches.reverse()){
      const quotes=[...text.matchAll(/[“"]([^”"]+)[”"]|(?<![\p{L}])[‘']([^’']+)[’'](?![\p{L}])/gu)]
      if(quotes.some(q=>match.index!>q.index!&&match.index!+match[0].length<q.index!+q[0].length))continue
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
  return rewriteAnswerPayload(payload,replace=>{
  replace(/,\s*(?:and|so)\s+[^.!?;\n]*\b(?:tools?|lookups?|calculators?|unknown[- ]range|pipeline)\b[^.!?\n]*(?:[.!?]|$)/gi,m=>/\d/.test(m)?m:'.')
  // Never silently alter a literal quotation. Drop its sentence if it cannot be displayed.
  replace(/[^.!?\n]+(?:[.!?]|$)/g,m=>[...m.matchAll(/[“"]([^”"]+)[”"]/g)].some(q=>ANSWER_INTERNAL_LANGUAGE.test(q[1]))?'':m)
  replace(/\bcatalog(?:ue)? hits\b/gi,'matching records')
  replace(/\b(?:coverage tools?|coverage lookups?)\b/gi,'coverage information')
  replace(/\bunknown[- ]range\b/gi,'unverified period')
  replace(/\b(?:data pipeline|our pipeline|the pipeline)\b/gi,'the records')
  replace(/\b(?:tools|lookups|calculators)\b/gi,'records')
  replace(/\b(?:tool|lookup|calculator|pipeline)\b/gi,'record')
  replace(/\bnot yet (?:been )?(?:imported|ingested|indexed|loaded|fetched)\b/gi,'not available')
  replace(/\bindexed (speeches|passages|documents|contests)\b/gi,m=>m.replace(/^indexed /i,''))
  replace(/\b(speeches|passages|documents) indexed\b/gi,m=>m.replace(/ indexed$/i,''))
  replace(/[^.!?\n]+(?:[.!?]|$)/g,m=>ANSWER_INTERNAL_LANGUAGE.test(m)?'':m)
  replace(/[ \t]+(?=[,;:.!?])/g,'')
  replace(/[,;:]+(?=[.!?])/g,'')
  replace(/(?<!\.)\.\.(?!\.)/g,'.')
  replace(/[ \t]{2,}/g,' ')
  replace(/\n(?:[ \t]*\n){2,}/g,'\n\n')
  replace(/^\s+|\s+$/g,'')
  })
}
