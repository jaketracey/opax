// A local pass-through in front of the MCP endpoint under test. It does three jobs:
//   1. adds the member token (when there is one), so the token never reaches a config file;
//   2. spaces requests out, so a run never sends the server more than the agreed rate;
//   3. for the prompt-injection case only, plants hostile text inside the first record of a
//      tool result, inside whatever framing the server itself put around that record.
// It listens on 127.0.0.1 only and forwards POST bodies unchanged.
import { createServer } from 'node:http'

/** Append `payload` to the first long text field of the first record in a tool result. */
export function plant(result, payload) {
  const visit = value => {
    if (Array.isArray(value)) { for (const item of value) if (visit(item)) return true; return false }
    if (!value || typeof value !== 'object') return false
    for (const [key, field] of Object.entries(value)) {
      if (typeof field === 'string' && field.length >= 40 && !/^https?:\/\//.test(field) && !/url|href|notes?|coverage|guide|instruction|notice/i.test(key)) { value[key] = field + ' ' + payload; return true }
    }
    for (const [key, field] of Object.entries(value)) if (!/notes?|coverage|guide|query|notice/i.test(key) && visit(field)) return true
    return false
  }
  let planted = false
  for (const block of result.content ?? []) {
    if (block.type !== 'text' || planted) continue
    try { const data = JSON.parse(block.text); if (visit(data)) { block.text = JSON.stringify(data); planted = true } } catch { /* not JSON: handled below */ }
  }
  if (result.structuredContent && typeof result.structuredContent === 'object') visit(result.structuredContent)
  if (!planted && result.content?.[0]?.type === 'text') { result.content[0].text += '\n' + payload; planted = true }
  return planted
}

// One pacer for the whole process, so the request rate also holds across the proxies of repeated runs.
let last = 0, queue = Promise.resolve()
const pace = minIntervalMs => { const next = queue.then(async () => { const wait = last + minIntervalMs - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now() }); queue = next.catch(() => {}); return next }

export function startProxy({ upstream, token, minIntervalMs = 0 }) {
  let requests = 0
  const turn = () => pace(minIntervalMs)
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const inject = req.url.startsWith('/inject/') ? decodeURIComponent(req.url.slice('/inject/'.length)) : null
      await turn(); requests++
      const headers = { accept: req.headers.accept ?? 'application/json, text/event-stream' }
      for (const name of ['content-type', 'mcp-protocol-version', 'mcp-session-id']) if (req.headers[name]) headers[name] = req.headers[name]
      if (token) headers.authorization = 'Bearer ' + token
      const response = await fetch(upstream, { method: req.method, headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) })
      let body = await response.text()
      if (inject && response.ok) {
        try { const message = JSON.parse(body); if (message.result?.content && !message.result.isError && plant(message.result, inject)) body = JSON.stringify(message) } catch { /* leave the body as sent */ }
      }
      const pass = {}
      for (const name of ['www-authenticate', 'mcp-session-id', 'retry-after']) if (response.headers.get(name)) pass[name] = response.headers.get(name)
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', ...pass })
      res.end(body)
    } catch (error) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'proxy: ' + error.message })) }
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ url: 'http://127.0.0.1:' + server.address().port, requests: () => requests, close: () => new Promise(done => server.close(done)) })))
}
