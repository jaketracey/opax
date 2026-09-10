// Account cookies are host-only and email links use COMMUNITY_ORIGIN. Keep
// readers on that same host before rendering a page or starting sign-in.
export function canonicalPageRedirect(request: Request, communityOrigin: string): Response | null {
  const url = new URL(request.url)
  if (communityOrigin !== 'https://opax.com.au' || url.hostname !== 'www.opax.com.au') return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  // Never redirect credentials, API calls or MCP clients between origins.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ingest/') || url.pathname === '/mcp') return null
  url.protocol = 'https:'
  url.host = 'opax.com.au'
  return new Response(null, {
    status: 308,
    headers: { location: url.href, 'referrer-policy': 'no-referrer' },
  })
}
