/** Pure HTTP/date helpers for the public app readers. No bindings or retrieval. */
export const APP_CACHE = 'public, max-age=300, must-revalidate'

export function appJson(req: Request, body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(req.method === 'HEAD' ? null : JSON.stringify(body), {status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers,
  }})
}

export function readOnly(req: Request): Response | null {
  return req.method === 'GET' || req.method === 'HEAD' ? null
    : appJson(req, {error:'method_not_allowed'}, 405, {allow:'GET, HEAD'})
}

export function melbourneDay(at: number): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Melbourne', year:'numeric', month:'2-digit', day:'2-digit'}).format(at)
}

export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
}

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2,'0')).join('')
}

export async function appRead(req: Request, body: unknown, cache = APP_CACHE): Promise<Response> {
  const encoded = JSON.stringify(body)
  const etag = `W/"${await sha256(encoded)}"`
  const headers = {'content-type':'application/json; charset=utf-8', 'cache-control':cache, etag}
  const tags = req.headers.get('if-none-match')?.split(',').map(tag => tag.trim().replace(/^W\//,'')) ?? []
  if (tags.includes('*') || tags.includes(etag.slice(2))) return new Response(null, {status:304, headers})
  return new Response(req.method === 'HEAD' ? null : encoded, {headers})
}
