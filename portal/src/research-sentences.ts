import { sentenceSpans } from './sentence-bounds.mjs'
import { quotationSpans } from './research-claim-audit.mjs'

/** A quotation is indivisible: its next sentence can change whether all its words are held verbatim. */
export function researchSentences(text:string):{text:string;at:number}[] {
  const quotes=quotationSpans(text),out:{text:string;at:number}[]=[]
  let held:{text:string;at:number}|undefined
  for(const part of sentenceSpans(text,true)){
    held=held?{at:held.at,text:text.slice(held.at,part.at+part.text.length)}:part
    const end=part.at+part.text.length
    if(quotes.some(quote=>quote.at<end&&quote.end>end))continue
    out.push(held);held=undefined
  }
  if(held)out.push(held)
  return out
}
