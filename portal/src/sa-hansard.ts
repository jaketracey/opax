import { isSaHansard, saOfficialUrl, saFullText, saDisplayPayload } from '../public/sa-hansard.js'

type RecordNode = Record<string, unknown>
type ReadRecord = (slug: string) => Promise<RecordNode | null>

function containsSa(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (isSaHansard(value)) return true
  return Object.values(value).some(containsSa)
}

/** Old report citations lack URLs. Resolve provenance without changing retrieval. */
async function sourceLinks(value: unknown, read: ReadRecord): Promise<Map<string, string>> {
  const pending = new Map<string, Promise<RecordNode | null>>()
  const originals = new Map<string, string>()
  const visit = async (node: unknown, generated = false): Promise<void> => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { await Promise.all(node.map(row => visit(row, generated))); return }
    const row = node as RecordNode
    generated ||= Array.isArray(row.sources) && (typeof row.answer === 'string' || typeof row.text === 'string' || Array.isArray(row.points))
    // Search summaries retain the canonical document href rather than a slug.
    const slug = typeof row.slug === 'string' ? row.slug : typeof row.href === 'string' ? /^\/doc\/(speech-\d+)(?:[?#]|$)/.exec(row.href)?.[1] : undefined
    if (isSaHansard(row) && (generated || !saOfficialUrl(row)) && slug && /^speech-\d+$/.test(slug)) {
      let resource = pending.get(slug)
      if (!resource) { resource = read(slug).catch(() => null); pending.set(slug, resource) }
      const record = await resource
      const url = saOfficialUrl(record)
      if (url) row.source_url = url
      if (record && typeof record.text === 'string') originals.set(String(row.resource || row.id || row.slug), record.text)
    }
    await Promise.all(Object.values(row).map(child => visit(child, generated)))
  }
  await visit(value)
  return originals
}

/** Every public API/cache/MCP/static-report exit passes through this boundary. */
export async function saPublicResponse(response: Response, flag: string | undefined, read: ReadRecord, match = ''): Promise<Response> {
  if (saFullText(flag) || !response.ok || !response.body) return response
  const type = response.headers.get('content-type') || ''
  if (!/application\/json|text\/event-stream/.test(type)) return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('etag')
  // Raw retrieval caches stay internal. Browsers must revalidate the current policy.
  headers.set('cache-control', 'no-store')
  const protect = async (payload: unknown) => {
    const originals = await sourceLinks(payload, read)
    return saDisplayPayload(payload, flag, match, originals)
  }
  if (type.includes('application/json')) {
    const body = await response.text(), payload: unknown = JSON.parse(body)
    if (!containsSa(payload)) return new Response(body, response)
    return new Response(JSON.stringify(await protect(payload)), {status:response.status, headers})
  }
  // Deltas do not yet have source metadata. Hold them until the checked done event.
  let buffer = ''
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      buffer += decoder.decode(chunk, {stream:true}).replace(/\r\n/g,'\n')
      if (buffer.length > 2_000_000) throw new Error('Answer event exceeds display limit')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const packet = buffer.slice(0,end); buffer = buffer.slice(end+2)
        const event = /^event:\s*(\S+)/m.exec(packet)?.[1]
        const data = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (event === 'delta' || event === 'point') continue
        if (!data) { controller.enqueue(encoder.encode(packet+'\n\n')); continue }
        const payload = await protect(JSON.parse(data))
        if (event === 'done' && payload && typeof payload === 'object' && 'points' in payload && Array.isArray(payload.points)) for (const point of payload.points) controller.enqueue(encoder.encode(`event: point\ndata: ${JSON.stringify(point)}\n\n`))
        controller.enqueue(encoder.encode(`event: ${event || 'message'}\ndata: ${JSON.stringify(payload)}\n\n`))
      }
    },
    flush() { if (buffer.trim()) throw new Error('Incomplete answer event') },
  })
  return new Response(response.body.pipeThrough(stream), {status:response.status, headers})
}
