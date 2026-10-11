import {sanitiseStoredDonors} from './donor-hashes.mjs'

/** Old persisted JSON is never trusted merely because it once passed a writer. */
export async function sanitiseStoredResponse(response: Response): Promise<Response> {
  if (!response.body || !/application\/json/i.test(response.headers.get('content-type') || '')) return response
  const reader = response.clone().body!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const unavailable = () => Response.json({error:'stored_response_unavailable'}, {status:503, headers:{'cache-control':'no-store'}})
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4_000_000) {
        // A cloned stream is teed: awaiting one branch's cancellation can
        // wait indefinitely for the untouched original branch.
        void reader.cancel().catch(() => {})
        void response.body.cancel().catch(() => {})
        return unavailable()
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
    const raw = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(raw)
    const safe = JSON.stringify(sanitiseStoredDonors(parsed))
    if (safe === JSON.stringify(parsed)) return response
    void response.body.cancel().catch(() => {})
    const headers = new Headers(response.headers)
    headers.delete('etag'); headers.delete('content-length')
    return new Response(safe, {status:response.status, statusText:response.statusText, headers})
  } catch { return unavailable() }
}
