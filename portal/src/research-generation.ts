import { generateText, streamText, type TextStreamPart, type ToolSet } from 'ai'

/** Keep the same SDK orchestration, admission and accounting on JSON and SSE requests. */
export async function generateResearchText(options: Parameters<typeof generateText>[0], observe?: (chunk: TextStreamPart<ToolSet>) => Promise<void>) {
  if (!observe) return generateText(options)
  const result = streamText(options)
  // Reading fullStream propagates provider failures instead of treating a truncated JSON object as a reply.
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'error') throw chunk.error
    await observe(chunk)
  }
  return { text: await result.text, usage: await result.usage, providerMetadata: await result.providerMetadata }
}

/** Incremental JSON scanner. Each character is visited once, including across escaped strings and token splits.
 * A record is readable only after its closing brace, so its fact ids and coverage flag are present. */
export function answerEntryScanner(key: 'points' | 'sentences') {
  let raw='', quoted=false, escaped=false, depth=0, array=false, start=-1, entry=-1
  let property: 'colon' | 'array' | undefined, ended=false, scanned=0
  return {
    push(chunk:string):unknown[] {
      if(ended)return []
      const from=raw.length
      raw+=chunk
      if(raw.length>100_000){ended=true;return []}
      const out:unknown[]=[]
      for(let i=from;i<raw.length;i++){
        scanned++
        const c=raw[i]
        if(quoted){
          if(escaped)escaped=false
          else if(c==='\\')escaped=true
          else if(c==='"'){
            quoted=false
            if(depth===1&&!array)property=raw.slice(start,i+1)===JSON.stringify(key)?'colon':undefined
          }
          continue
        }
        if(property&&/\s/.test(c))continue
        if(property==='colon'&&c===':'){property='array';continue}
        if(property==='array'&&c==='['){array=true;depth++;property=undefined;continue}
        property=undefined
        if(c==='"'){quoted=true;start=i;continue}
        if(c==='{'||c==='['){if(array&&depth===2)entry=i;depth++;continue}
        if(c==='}'||c===']'){
          depth--
          if(array&&depth===2&&entry>=0){
            try{out.push(JSON.parse(raw.slice(entry,i+1)))}catch{ended=true;return []}
            entry=-1
          }
          if(array&&depth<2){ended=true;break}
        }
      }
      return out
    },
    get scannedCharacters(){return scanned},
  }
}

/** One-shot helper for callers with a complete buffer; live writers retain a scanner between tokens. */
export function completedAnswerEntries(raw:string,key:'points'|'sentences'):unknown[]{
  return answerEntryScanner(key).push(raw)
}
