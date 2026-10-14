#!/usr/bin/env node
// Page time-to-first-byte smoke: `node scripts/smoke_page_perf.mjs <base>`.
// GETs a fixed list twice each (person pages, a bill, a party, home) and reports
// TTFB (time to response headers), x-opax-cache and the Server-Timing total.
// Fails if any first GET takes over 3 s, or a second (warm) person GET over 800 ms.
// Read-only public GETs; no Ask, generation or auth route is touched.
import {readFileSync} from 'node:fs'
const userAgent=JSON.parse(readFileSync(new URL('../parli/ingest/user-agent.json',import.meta.url),'utf8')).user_agent
const COLD_LIMIT_MS = 3000
const WARM_PERSON_LIMIT_MS = 800
const PAGES = [
  {path:'/subject/person/chris-bowen', person:true},
  {path:'/subject/person/anthony-albanese', person:true},
  {path:'/subject/person/david-pocock', person:true},
  {path:'/bill/au-federal-r7534'},
  {path:'/subject/party/australian-labor-party'},
  {path:'/'},
]

const base = process.argv[2]
if (!base || !/^https?:\/\//.test(base)) {
  console.error('usage: node scripts/smoke_page_perf.mjs <base URL, e.g. https://opax.com.au>')
  process.exit(2)
}

async function get(url) {
  const started = performance.now()
  const response = await fetch(url, {headers:{'user-agent':userAgent, accept:'text/html'}, redirect:'manual'})
  const ttfb = performance.now() - started
  await response.arrayBuffer()
  const total = /(?:^|,\s*)total;dur=([\d.]+)/.exec(response.headers.get('server-timing') || '')?.[1]
  return {status:response.status, ttfb, cache:response.headers.get('x-opax-cache') || '-', worker:total ? Number(total) : null}
}

const failures = []
const rows = []
for (const page of PAGES) {
  const url = new URL(page.path, base).href
  for (const attempt of ['first', 'second']) {
    let result
    try { result = await get(url) } catch (error) { failures.push(`${page.path} ${attempt}: ${error.message}`); continue }
    rows.push({page:page.path, attempt, status:result.status, ttfb_ms:Math.round(result.ttfb), cache:result.cache, worker_ms:result.worker == null ? '-' : Math.round(result.worker)})
    if (result.status >= 400) failures.push(`${page.path} ${attempt}: HTTP ${result.status}`)
    if (attempt === 'first' && result.ttfb > COLD_LIMIT_MS) failures.push(`${page.path} first GET ${Math.round(result.ttfb)} ms > ${COLD_LIMIT_MS} ms`)
    if (attempt === 'second' && page.person && result.ttfb > WARM_PERSON_LIMIT_MS) failures.push(`${page.path} warm GET ${Math.round(result.ttfb)} ms > ${WARM_PERSON_LIMIT_MS} ms`)
  }
}
console.table(rows)
if (failures.length) {
  console.error(`FAIL\n${failures.map(f => `  ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('PASS')
