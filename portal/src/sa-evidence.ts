import { isSaHansard, saExcerpt, saFullText, saOfficialUrl } from '../public/sa-hansard.js'
import { normalizePassage } from './passage-text'

type Data = Record<string, unknown>
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}

/** The KB remains complete; only a copy selected for the model is bounded. */
export function saEvidenceText(record: unknown, text: string, flag: string | undefined, match = '', unknownSource = false): string {
  if (saFullText(flag) || (!unknownSource && !isSaHansard(record))) return text
  // Streamed quotations need the same official provenance as citation panels.
  if (isSaHansard(record) && !saOfficialUrl(record)) return ''
  return saExcerpt(normalizePassage(text.replace(/\n+DOCUMENT CLASSIFICATION LABELS:[\s\S]*$/, '')), match)
}

export function saEvidenceRecord<T extends Data>(record: T, flag: string | undefined, match = '', unknownSource = false): T {
  if (saFullText(flag) || (!unknownSource && !isSaHansard(record))) return record
  const raw = String(record.text || record.snippet || record.passage || record.record || '')
  const excerpt = saEvidenceText(record, raw, flag, match, unknownSource)
  const edits = Object.fromEntries(['text','snippet','passage','quote','body','record'].filter(key => typeof record[key] === 'string').map(key => [key,excerpt]))
  return {...record, ...edits, ...(Array.isArray(record.evidence) ? {evidence:[excerpt]} : {}), ...(Array.isArray(record.quotes) ? {quotes:[excerpt]} : {})}
}

/** Bound prior source quotations before the follow-up rewrite also sees them.
 * Current clients carry provenance; older assistant turns are conservative.
 */
export function saConversationInput<T extends Data>(input: T, flag: string | undefined): T {
  if (saFullText(flag) || !Array.isArray(input.context)) return input
  return {...input,context:input.context.map(turn => {
    const row = object(turn), sources = Array.isArray(row.sources) ? row.sources : []
    if (row.author !== 'answer' || typeof row.text !== 'string' || sources.length && !sources.some(isSaHansard)) return turn
    return {...row,text:saEvidenceText({},row.text,flag,'',true)}
  })}
}

/** Reuse one matched SA passage for each record across all context blocks. */
export function saGenerationContext(body: Data, retrieved: Data, flag: string | undefined): {request: Data; retrieval: Data; augmented: Data; hasSa: boolean} {
  const resources = {...object(object(retrieved.retrieval_results).resources)}
  for (const prequery of Object.values(object(retrieved.prequeries))) for (const [rid,value] of Object.entries(object(object(prequery).resources))) {
    const prior = object(value), existing = object(resources[rid])
    const fields = {...object(prior.fields),...object(existing.fields)}
    for (const [key,field] of Object.entries(fields)) fields[key] = {...object(field),paragraphs:{
      ...object(object(object(prior.fields)[key]).paragraphs),...object(object(object(existing.fields)[key]).paragraphs),
    }}
    // A prior-record query may omit origin/extra/labels. Keep main provenance
    // and all matching paragraphs rather than replacing a classified record.
    resources[rid] = {...prior,...existing,fields}
  }
  let hasSa = Object.values(resources).some(isSaHansard)
  const paragraphs: Data = {}
  let contexts: Record<string,string> = {}
  for (const resource of Object.values(resources)) for (const field of Object.values(object(object(resource).fields))) for (const [id,para] of Object.entries(object(object(field).paragraphs))) {
    const text = object(para).text
    if (typeof text === 'string') contexts[id] = text
  }
  const augmented = object(retrieved.augmented_context)
  for (const block of [...Object.entries(object(augmented.paragraphs)), ...Object.entries(object(augmented.fields))]) {
    const text = object(block[1]).text
    if (typeof text === 'string') contexts[block[0]] = text
  }
  // A documented debug predict_request can include metadata/neighbor expansion.
  // Stable retrieval and augmented fields above also work without debug output.
  const predict = object(retrieved.predict_request)
  const selected = Object.entries(object(predict.query_context)).filter((entry): entry is [string,string] => typeof entry[1] === 'string')
  if (selected.length) contexts = Object.fromEntries(selected)
  for (const [i,text] of (Array.isArray(body.extra_context) ? body.extra_context : []).entries()) if (typeof text === 'string') {
    let record: Data = {}; try { record = object(JSON.parse(text)) } catch { /* supplied prose */ }
    hasSa ||= isSaHansard(record)
    contexts[`USER_CONTEXT_${i}`] = isSaHansard(record) ? JSON.stringify(saEvidenceRecord(record,flag,String(body.query || ''))) : text
  }
  const excerpts = new Map<string,string>()
  const bound = (id: string, text: string): string => {
    const rid = id.split('/')[0], resource = resources[rid]
    if (!isSaHansard(resource) || saFullText(flag)) return text
    if (!excerpts.has(rid)) excerpts.set(rid, saEvidenceText(resource,text,flag,String(body.query || '')))
    return excerpts.get(rid)!
  }
  for (const [id,text] of Object.entries(contexts)) contexts[id] = bound(id,text)
  for (const [rid,resource] of Object.entries(resources)) {
    if (!isSaHansard(resource) || saFullText(flag)) continue
    const row = object(resource)
    resources[rid] = {...row, fields:Object.fromEntries(Object.entries(object(row.fields)).map(([key,field]) => [key, {...object(field), paragraphs:Object.fromEntries(Object.entries(object(object(field).paragraphs)).map(([id,para]) => [id,{...object(para),text:bound(id,String(object(para).text || ''))}]))}]))}
  }
  for (const [id,text] of Object.entries(contexts)) if (!id.startsWith('USER_CONTEXT_')) paragraphs[id] = {id,text}
  const prompt = object(body.prompt)
  const request: Data = {
    ...Object.fromEntries(['query_context_order','prefer_markdown','format_prompt','reasoning','truncate','user_id'].filter(key => predict[key] !== undefined).map(key => [key,predict[key]])),
    question:body.query, retrieval:true, query_context:contexts,
    ...(typeof prompt.system === 'string' ? {system:prompt.system} : {}),
    user_prompt:{prompt:typeof prompt.user === 'string' ? prompt.user : typeof body.prompt === 'string' ? body.prompt : '{context}\n{question}'},
    ...Object.fromEntries(['generative_model','citations','citation_threshold','max_tokens'].filter(key => body[key] !== undefined).map(key => [key,body[key]])),
    ...(body.generative_model_seed !== undefined ? {seed:body.generative_model_seed} : {}),
    ...(body.answer_json_schema !== undefined ? {json_schema:body.answer_json_schema} : {}),
    ...(Array.isArray(body.chat_history) ? {chat_history:body.chat_history.map(turn => {
      const row=object(turn)
      return !saFullText(flag) && row.author === 'NUCLIA' && typeof row.text === 'string' ? {...row,text:saExcerpt(row.text)} : row
    })} : {}),
  }
  return {request, retrieval:{...object(retrieved.retrieval_results),resources}, augmented:{paragraphs}, hasSa}
}

type Call = (path: string, body: Data, stream: boolean) => Promise<Response>

/** Retrieve with generation disabled, then cap before the Predict model call.
 * Non-SA and flag-on calls use the existing /ask request/response unchanged.
 * Predict /chat takes explicit query_context and performs no KB retrieval.
 */
export async function saGenerationResponse(body: Data, flag: string | undefined, call: Call, stream: boolean): Promise<Response> {
  if (saFullText(flag) || body.generate_answer === false) return call('/ask',body,stream)
  const found = await call('/ask',{...body,generate_answer:false,debug:true},false)
  if (!found.ok) return found
  const retrieved = await found.json() as Data
  const prepared = saGenerationContext(body,retrieved,flag)
  if (!prepared.hasSa) return call('/ask',body,stream)
  const generated = await call('/predict/chat',prepared.request,true)
  if (!generated.ok || !generated.body) return generated
  const encoder = new TextEncoder(), decoder = new TextDecoder()
  let pending = ''
  const adapt = (line: string): Uint8Array => {
    const raw = object(JSON.parse(line)), item = object(raw.item || raw.chunk || raw)
    const type = item.type === 'text' ? 'answer' : item.type === 'json' ? 'answer_json' : item.type
    return encoder.encode(JSON.stringify({item:{...item,type}})+'\n')
  }
  const response = new Response(generated.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller) {
      pending += decoder.decode(chunk,{stream:true})
      if (pending.length > 2_000_000) throw new Error('Generation event exceeds limit')
      let end: number
      while ((end=pending.indexOf('\n')) >= 0) {
        const line=pending.slice(0,end).trim(); pending=pending.slice(end+1)
        if (line) controller.enqueue(adapt(line))
      }
    },
    flush(controller) {
      pending += decoder.decode()
      if (pending.trim()) controller.enqueue(adapt(pending.trim()))
      controller.enqueue(encoder.encode(JSON.stringify({item:{type:'retrieval',results:prepared.retrieval}})+'\n'))
      controller.enqueue(encoder.encode(JSON.stringify({item:{type:'augmented_context',augmented:prepared.augmented}})+'\n'))
    },
  })),{status:generated.status,headers:{'content-type':'application/x-ndjson'}})
  if (stream) return response
  let answer = '', citations: Data = {}, mapping: Data = {}
  for (const line of (await response.text()).trim().split('\n')) {
    const item = object(object(JSON.parse(line)).item)
    if (item.type === 'answer') answer += String(item.text || '')
    if (item.type === 'answer_json') answer = JSON.stringify(item.object)
    if (item.type === 'citations') citations = object(item.citations)
    if (item.type === 'footnote_citations') mapping = object(item.footnote_to_context)
    if (item.type === 'error' || item.type === 'status' && String(item.code) === '-1') return Response.json({error:'Generation failed'},{status:502})
  }
  return Response.json({answer,citations,citation_footnote_to_context:mapping,retrieval_results:prepared.retrieval,augmented_context:prepared.augmented})
}
