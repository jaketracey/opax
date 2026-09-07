/** Same-origin PostHog proxy. No credentials, cookies or arbitrary upstreams. */
export async function proxyPostHog(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.slice('/ingest'.length)
  const asset = path.startsWith('/static/') || path.startsWith('/array/')
  const ingestion = /^\/(?:e|i\/v0\/e|batch|s|flags|decide)\/?$/.test(path)
  if (!asset && !ingestion) return new Response('Not found', { status: 404 })
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(request.method) || (asset && request.method === 'POST')) {
    return new Response('Method not allowed', { status: 405 })
  }
  // Browser calls are same-origin. Do not turn this into a cross-site relay.
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  const target = new URL(asset ? 'https://us-assets.i.posthog.com' : 'https://us.i.posthog.com')
  target.pathname = path
  target.search = url.search
  const headers = new Headers()
  for (const name of ['content-type', 'content-encoding', 'accept', 'user-agent']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : null,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    // Never follow an upstream redirect with a reader's event payload.
    if (upstream.status >= 300 && upstream.status < 400) return new Response('Bad gateway', { status: 502 })
    const responseHeaders = new Headers()
    responseHeaders.set('content-type', upstream.headers.get('content-type') || 'application/json')
    responseHeaders.set('cache-control', asset && upstream.ok ? 'public, max-age=3600' : 'no-store')
    responseHeaders.set('x-content-type-options', 'nosniff')
    return new Response(request.method === 'HEAD' || [204, 205].includes(upstream.status) ? null : upstream.body, {
      status: upstream.status, headers: responseHeaders,
    })
  } catch {
    return new Response('Analytics unavailable', { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
