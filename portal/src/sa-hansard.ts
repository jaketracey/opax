import { isSaHansard, saOfficialUrl, saFullText, saDisplayPayload, saDisplayStreamPayload } from '../public/sa-hansard.js'

type RecordNode = Record<string, unknown>
type ReadRecord = (slug: string) => Promise<RecordNode | null>

function containsSa(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (isSaHansard(value)) return true
  return Object.values(value).some(containsSa)
}

/** Old report citations lack URLs. Resolve provenance without changing retrieval. */
async function sourceLinks(value: unknown, read: ReadRecord, answers = true): Promise<Map<string, string>> {
  const pending = new Map<string, Promise<RecordNode | null>>()
  const originals = new Map<string, string>()
  const visit = async (node: unknown, generated = false): Promise<void> => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { await Promise.all(node.map(row => visit(row, generated))); return }
    const row = node as RecordNode
    generated ||= answers && Array.isArray(row.sources) && (typeof row.answer === 'string' || typeof row.text === 'string' || Array.isArray(row.points))
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

/** Called before encoding done/sources, never for a delta or point. */
export async function saEventPayload<T>(event: string, payload: T, flag: string | undefined, read: ReadRecord, match = ''): Promise<T> {
  if (!['done','sources'].includes(event) || saFullText(flag) || !containsSa(payload)) return payload
  await sourceLinks(payload, read, false)
  return saDisplayStreamPayload(payload, flag, match)
}

/** Every public API/cache/MCP/static-report exit passes through this boundary. */
export async function saPublicResponse(response: Response, flag: string | undefined, read: ReadRecord, match = ''): Promise<Response> {
  if (saFullText(flag) || !response.ok || !response.body) return response
  const type = response.headers.get('content-type') || ''
  // SSE is protected at the evidence and event-building boundaries. Preserve
  // its original stream, chunk timing, bytes and headers without a transform.
  if (!type.includes('application/json')) return response
  const body = await response.text(), payload: unknown = JSON.parse(body)
  if (!containsSa(payload)) return new Response(body, response)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('etag')
  // Raw retrieval caches stay internal. Browsers must revalidate the current policy.
  headers.set('cache-control', 'no-store')
  const originals = await sourceLinks(payload, read)
  return new Response(JSON.stringify(saDisplayPayload(payload, flag, match, originals)), {status:response.status, headers})
}
