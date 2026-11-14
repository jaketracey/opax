/**
 * Domain verification for the ChatGPT app directory. OpenAI's portal issues a
 * token and reads it back from this path on the MCP server's host; the body
 * must be the exact token and nothing else (no JSON, no list, no newline).
 *
 * The token comes from the portal and is set as the Worker secret or var
 * OPENAI_APPS_CHALLENGE. While it is unset, or is not one printable token,
 * the path answers 404 like any unknown page.
 */
export const OPENAI_APPS_CHALLENGE_PATH = '/.well-known/openai-apps-challenge'

/** One token: printable ASCII with no spaces, 8 to 512 characters. */
const TOKEN = /^[\x21-\x7e]{8,512}$/

export function openaiAppsChallenge(request: Request, token: string | undefined): Response {
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
  const head = request.method === 'HEAD'
  if ((request.method !== 'GET' && !head) || typeof token !== 'string' || !TOKEN.test(token))
    return new Response(head ? null : 'Not found', { status: 404, headers })
  return new Response(head ? null : token, { headers })
}
