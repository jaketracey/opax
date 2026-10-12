/** Keep the homepage separate from the research application in every environment. */
export async function pageEntry(request: Request, assets: Pick<Fetcher, 'fetch'>): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  if (/^\/search\/?$/.test(url.pathname)) {
    url.pathname = '/ask'
    url.searchParams.set('view', 'search')
    return new Response(null, { status: 302, headers: { location: url.pathname + url.search } })
  }
  if (url.pathname !== '/') return null
  // Links shared by the former homepage can contain a research query.
  if (url.searchParams.has('q') || url.searchParams.has('ask')) {
    if (url.searchParams.has('ask')) {
      url.searchParams.set('q', url.searchParams.get('ask') || '')
      url.searchParams.delete('ask')
    }
    url.pathname = '/ask'
    return new Response(null, { status: 302, headers: { location: url.pathname + url.search } })
  }
  url.pathname = '/home'
  url.search = ''
  // Unconditional: the Worker rewrites this shell, so a 304 must come from the
  // rewritten page's validator (src/html-etag.ts), never from the shell's own.
  const headers = new Headers(request.headers)
  for (const name of ['if-none-match', 'if-modified-since']) headers.delete(name)
  const response = await assets.fetch(new Request(url, { method: request.method, headers }))
  return request.method === 'HEAD' ? new Response(null, response) : response
}
