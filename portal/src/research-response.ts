import { claimClauses, proseClaimKeys } from './research-claims'
import { proseFallback, rawToolEcho, writingFacts } from './research-writing'
import { plainAnswerPayload } from './research-language'
import { groundAnswerPayload } from './research-grounding'
import {protectedDecision} from './research-coherence.mjs'
import type { QualitativeAnswer } from './research-types'
import type { ResearchPayload } from './research-types'
import type { researchEvalUsage } from './research-eval'

function plannerPayload(payload: Record<string, unknown>, previous?: ResearchPayload): Record<string, unknown> {
  if (payload.research) return payload
  const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
  const research: ResearchPayload = { ...previous, mode: 'planner', rounds: previous?.rounds ?? 0, trail: previous?.trail ?? [], sources: sources.filter(s => s.cited === true).map(s => ({
    title: String(s.title ?? ''), url: String(s.href ?? s.url ?? ''), kind: String(s.kind ?? 'record'), ...(typeof s.date === 'string' ? { date: s.date } : {}), ...(typeof s.speaker === 'string' ? { speaker: s.speaker } : {}),
  })) }
  return { ...payload, research }
}

/** Add metadata only at the boundary. Existing JSON and SSE fields survive. */
export async function withPlannerResearch(response: Response, previous?: ResearchPayload): Promise<Response> {
  return mapResearchResponse(response, payload => plannerPayload(payload, previous))
}

/** One guard covers JSON, streamed fallbacks and cached payloads. */
export async function withAnswerLanguage(response: Response,question?:string,askedAs?:string): Promise<Response> {
  return mapResearchResponse(response, payload=>{const out=question?groundAnswerPayload(payload,question):plainAnswerPayload(payload);return askedAs?{...out,asked_as:askedAs}:out}, true, true)
}

export async function withResearchEval(response: Response, usage: () => ReturnType<typeof researchEvalUsage> & { model?: string }): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  headers.set('x-opax-cache', 'BYPASS')
  return mapResearchResponse(new Response(response.body, { status: response.status, statusText: response.statusText, headers }), payload => {
    const augmented = plannerPayload(payload)
    return { ...augmented, research: { ...augmented.research as ResearchPayload, ...usage() } }
  })
}

async function mapResearchResponse(response: Response, augment: (payload: Record<string, unknown>) => Record<string, unknown>, validateBeforeText = false,replayUnchangedDeltas=false): Promise<Response> {
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) return new Response(JSON.stringify(augment(await response.json() as Record<string, unknown>)), { status: response.status, statusText: response.statusText, headers })
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let pending = ''
  const deltas:string[]=[]
  let deltaText='',replayable=true
  const frame = (value: string,separator='\n\n') => {
    // Fallback and cache replay deltas have not passed the period check yet.
    // The validated done payload is the only answer text released on this path.
    if (validateBeforeText && /^event: delta$/m.test(value)) {
      if(replayUnchangedDeltas&&replayable){
        try {const data=JSON.parse(/^data: (.+)$/m.exec(value)?.[1]??'');if(typeof data.text!=='string')throw Error('invalid delta');deltaText+=data.text;deltas.push(value+separator)}catch{replayable=false}
        if(deltaText.length>100_000){replayable=false;deltas.length=0;deltaText=''}
      }
      return ''
    }
    if (!/^event: done$/m.test(value)) return value
    let unchanged=false
    const done=value.replace(/^data: (.+)$/m, (_line, data: string) => {
      const original=JSON.parse(data),checked=augment(original)
      unchanged=typeof original.answer==='string'&&checked.answer===original.answer&&deltaText===checked.answer
      return 'data: '+JSON.stringify(checked)
    })
    const safe=replayUnchangedDeltas&&replayable&&unchanged?deltas.join(''):''
    deltas.length=0
    deltaText=''
    return safe+done
  }
  return new Response(response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const next = frame(pending.slice(0, boundary.index),boundary[0])
        if (next) controller.enqueue(encoder.encode(next + boundary[0]))
        pending = pending.slice(boundary.index + boundary[0].length)
      }
    },
    flush(controller) { pending += decoder.decode(); if (pending) controller.enqueue(encoder.encode(frame(pending))) },
  })), { status: response.status, statusText: response.statusText, headers })
}

/** A failed loop may use ordinary RAG, but it may not substitute undated/current evidence for a dated ask. */
export async function withFallbackPeriod(response: Response, period: import('./agentic-ask').Period): Promise<Response> {
  if (!response.ok) return response
  return mapResearchResponse(response, payload => {
    payload=normaliseWrittenPayload(payload)
    if(protectedDecision(payload)){
      if(period.kind!=='all'&&(period.since||period.until)&&/^This selection does not establish their position on that topic\.$/.test(String(payload.answer??''))){
        const answer=`The selected records do not establish the requested answer for ${period.since??'the start of the record'} to ${period.until??'the present'}.`
        return {...payload,answer,citations:{},sources:[],answer_status:'coverage_only'}
      }
      return payload
    }
    // A request for a name asserts no dated facts; keep it through ordinary fallback.
    if(/^Please (?:give the full name|name the person)/i.test(String(payload.answer??''))&&!/[\d$]/.test(String(payload.answer))&&!((payload.sources??[]) as unknown[]).length)return payload
    // No fallback/cache delta is released before both writing and period checks.
    if (rawToolEcho(String(payload.answer ?? ''))) {
      const facts=writingFacts(payload as unknown as QualitativeAnswer)
      const written=proseFallback({question:'',period,facts})
      payload={...payload,...written}
    }
    if (period.kind === 'all' || !period.since && !period.until) return payload
    const coverage = payload.coverage as { matched?: boolean; since?: string; until?: string; requested_since?: string; requested_until?: string } | undefined
    const within = (since?: string, until?: string) => !!(since || until) &&
      (!period.since || !!since && since >= period.since) && (!period.until || !!until && until <= period.until) &&
      (!period.until || !since || since <= period.until) && (!period.since || !until || until >= period.since)
    if (coverage?.matched === true && within(coverage.requested_since ?? coverage.since, coverage.requested_until ?? coverage.until) && within(coverage.since, coverage.until)) return payload
    if (payload.pay_answer && coverage?.matched === false && within(coverage.requested_since, coverage.requested_until) && !/\$[\d,]+/.test(String(payload.answer))) return payload
    const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
    const cited = sources.filter(s => s.cited === true)
    const outside = cited.find(s => typeof s.date === 'string' && (period.since && s.date.slice(0, 10) < period.since || period.until && s.date.slice(0, 10) > period.until))
    if (!coverage && !outside && cited.length && cited.every(s => typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.date))) return payload
    const requested = `${period.since ?? 'the start of the record'} to ${period.until ?? 'the present'}`
    const text = `The returned records do not establish the requested answer for ${requested}. ${outside ? `A returned source is dated ${String(outside.date).slice(0, 10)}, outside that period.` : 'The returned evidence has no verified date coverage for that period.'} I have not substituted current figures. Please narrow the question or check the records linked here.`
    const url = String(outside?.href ?? outside?.url ?? cited[0]?.href ?? cited[0]?.url ?? 'https://opax.com.au/methods')
    // Do not retain calculated tables, openings or snippets from another period.
    return { answer: text, answer_status: 'coverage_only', citations: { 'period-coverage/t/body/0': [[0, Array.from(text).length]] },
      sources: [{ resource: 'period-coverage', slug: '', title: 'Coverage of the returned records', href: url, url, kind: 'record', snippet: text, cited: true }],
      coverage: { requested_since: period.since ?? null, requested_until: period.until ?? null, as_of: outside?.date ?? null, matched: false },
    }
  }, true)
}

/** Keep the fallback model's prose, removing repeated claims and financial figure sets before replay. */
export function normaliseWrittenPayload(payload: Record<string, unknown>): Record<string, unknown> {
  payload=plainAnswerPayload(payload)
  if (typeof payload.answer !== 'string' || !payload.answer.trim()) return payload
  const original = payload.answer, cp = (n: number) => Array.from(original.slice(0,n)).length
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
  const seenText=new Set<string>(), seenClaims=new Set<string>()
  const kept: {text:string;from:number;until:number}[][]=[]
  let changed=false
  for(const paragraph of original.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)) {
    const text=paragraph[0], base=paragraph.index!
    if (/^(?:#{1,6}\s*)?(?:what the records? say(?:s)?|answer|overview|sources|summary)\s*:?$/i.test(text.trim())) {changed=true;continue}
    const parts:{text:string;from:number;until:number}[]=[]
    for(const clause of claimClauses(text)) {
      const connector=parts.length?/(?:,?\s+and\s+)$/.exec(text.slice(0,clause.start))?.[0]:undefined
      const sentence=(connector?'and ':'')+clause.text, identities=proseClaimKeys(clause.text),signature=key(clause.text)
      if(seenText.has(signature)||identities.length>0&&identities.every(id=>seenClaims.has(id))) {changed=true;continue}
      seenText.add(signature);identities.forEach(id=>seenClaims.add(id))
      parts.push({text:sentence,from:cp(base+clause.start-(connector?4:0)),until:cp(base+clause.end)})
    }
    if(parts.length)kept.push(parts)
  }
  if(!changed)return payload
  if(!kept.length) return {...payload,...proseFallback({question:'',period:{kind:'all',label:''},facts:writingFacts(payload as unknown as QualitativeAnswer)})}
  const originalLength=Array.from(original).length, mapping=new Map<number,number>();let answer=''
  for(const paragraph of kept) {
    if(answer)answer+='\n\n'
    for(const [index,part] of paragraph.entries()) {
      if(index)answer+=' '
      const offset=Array.from(answer).length
      for(let i=part.from;i<part.until;i++)mapping.set(i,offset+i-part.from)
      answer+=part.text
    }
  }
  const citations: Record<string,[number,number][]>={}
  const originalCitations=payload.citations && typeof payload.citations==='object' ? payload.citations as Record<string,unknown> : {}
  for(const [id,ranges] of Object.entries(originalCitations))if(Array.isArray(ranges))for(const range of ranges) {
    if(!Array.isArray(range) || !range.every(Number.isSafeInteger) || range.length!==2)continue
    let from:number|undefined,until:number|undefined
    for(let i=Math.max(0,range[0]);i<Math.min(originalLength,range[1]);i++) {
      const mapped=mapping.get(i)
      if(mapped!==undefined){from=from===undefined?mapped:Math.min(from,mapped);until=Math.max(until??0,mapped+1)}
    }
    if(from!==undefined && until!==undefined)(citations[id]??=[]).push([from,until])
  }
  const sources=Array.isArray(payload.sources)?(payload.sources as Record<string,unknown>[]).map(s=>typeof s.resource==='string' && s.cited===true ? {...s,cited:Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}:s):[]
  return {...payload,answer,citations,sources,...(!Object.keys(citations).length?{answer_status:'uncited'}:{})}
}
