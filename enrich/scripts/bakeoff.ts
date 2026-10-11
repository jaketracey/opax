// Outputs and batch metadata belong in staging, never in this checkout.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { MODEL, hash, recordOf, stratumOf, select, enrichmentRequests, upperCost, decode, blind, judgeRequests, usageCost, retryRequests, mergeAttempt } from './bakeoff-lib.ts'

const out = '/home/jake/opax-staging/federation/bakeoff'
const pilot = '/home/jake/opax-staging/federation/kb-gap/pilot-2000.jsonl'
mkdirSync(out, { recursive: true })
const read = (name: string) => JSON.parse(readFileSync(join(out, name), 'utf8'))
const write = (name: string, data: any) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
const jsonl = (path: string) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x))
const writeLines = (name: string, rows: any[]) => writeFileSync(join(out, name), rows.map(r => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 })
const selected = () => {
  const wanted = new Set(read('units-200.json').map((u: any) => u.slug))
  return jsonl(pilot).filter(u => wanted.has(u.slug)).sort((a, b) => a.slug.localeCompare(b.slug))
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let key: string | null = null
async function api(path: string, body?: any, raw = false): Promise<any> {
  if (!key) {
    const result = spawnSync('grep', ['-m1', '^ANTHROPIC_API_KEY=', '/home/jake/opax/.env'], { encoding: 'utf8' })
    if (result.status !== 0) throw Error('approved API credential unavailable')
    key = result.stdout.trim().split('=').slice(1).join('=').replace(/^(["'])(.*)\1$/, '$2')
    process.env.ANTHROPIC_API_KEY = key
  }
  const url = path.startsWith('https://') ? new URL(path) : new URL(path, 'https://api.anthropic.com')
  if (url.origin !== 'https://api.anthropic.com') throw Error('unexpected results origin')
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw Error(`Anthropic HTTP ${response.status}; request ${response.headers.get('request-id') ?? 'unknown'}`)
  return raw ? response.text() : response.json()
}
function spendGuard(lane: string, upper: number) {
  const budget = read('budget.json')
  const previous = readdirSync(out).filter(n => n.endsWith('-submission.json')).map(n => read(n))
  const billedOrReserved = previous.reduce((n, s) => n + (existsSync(join(out, `${s.lane}-usage.json`)) ? read(`${s.lane}-usage.json`).cost_usd : s.upper_usd), 0)
  const futureJudge = lane !== 'judge' && !previous.some(s => s.lane === 'judge') ? budget.judge_upper_usd : 0
  const qwenReserve = existsSync(join(out, 'qwen3-200.jsonl')) ? jsonl(join(out, 'qwen3-200.jsonl')).reduce((n, r) => n + (typeof r.neurons === 'number' ? r.neurons * 0.011 / 1000 : budget.qwen_reserve_usd / 200), 0) : budget.qwen_reserve_usd
  const whole = qwenReserve + billedOrReserved + upper + futureJudge
  if (whole > 5) throw Error('whole-bakeoff estimate exceeds US$5')
  return whole
}
async function submit(lane: string) {
  if (existsSync(join(out, `${lane}-submission.json`))) throw Error('submission already recorded; poll it instead')
  const requests = read(`${lane}-requests.json`).requests
  if (!requests.length) throw Error('no outstanding units to submit')
  const upper = upperCost(requests), whole = spendGuard(lane, upper)
  console.log(JSON.stringify({ lane, requests: requests.length, upper_usd: upper, whole_estimate_usd: whole }))
  // Record an ambiguous submission before POST. Never automatically resubmit on a timeout.
  write(`${lane}-submission.json`, { lane, upper_usd: upper, started_at: new Date().toISOString(), batch: null })
  const batch = await api('/v1/messages/batches', { requests })
  write(`${lane}-submission.json`, { lane, upper_usd: upper, started_at: new Date().toISOString(), batch })
  console.log(JSON.stringify({ lane, batch_id: batch.id, status: batch.processing_status, counts: batch.request_counts }))
}
async function poll(lane: string) {
  if (existsSync(join(out, `${lane}-applied.json`))) {
    console.log(JSON.stringify({ lane, status: 'already-applied', ...read(`${lane}-usage.json`) })); return
  }
  const submission = read(`${lane}-submission.json`)
  if (!submission.batch?.id) throw Error('ambiguous POST: reconcile with the batch list before proceeding')
  const batch = await api(`/v1/messages/batches/${submission.batch.id}`)
  write(`${lane}-batch.json`, batch)
  console.log(JSON.stringify({ lane, status: batch.processing_status, counts: batch.request_counts }))
  if (batch.processing_status !== 'ended') return
  const raw = await api(batch.results_url ?? `/v1/messages/batches/${batch.id}/results`, undefined, true)
  writeFileSync(join(out, `${lane}-results.jsonl`), raw, { mode: 0o600 })
  const rows = jsonl(join(out, `${lane}-results.jsonl`))
  const usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, cost_usd: 0 }
  for (const row of rows) {
    const u = row.result?.message?.usage ?? {}
    for (const k of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'] as const) usage[k] += u[k] ?? 0
    usage.cost_usd += usageCost(u)
  }
  write(`${lane}-usage.json`, usage)
  if (lane === 'haiku') {
    const units = selected(), byId = new Map(rows.map(r => [r.custom_id, r]))
    writeLines('haiku-200.jsonl', units.map((u, i) => ({ slug: u.slug, ...decode(byId.get(`unit-${String(i).padStart(3, '0')}`) ?? { result: { type: 'missing-result' } }) })))
    if (!existsSync(join(out, 'haiku-initial-200.jsonl'))) writeLines('haiku-initial-200.jsonl', jsonl(join(out, 'haiku-200.jsonl')))
  } else if (lane.startsWith('haiku-')) {
    const plan = read(`${lane}-requests.json`), previous = jsonl(join(out, 'haiku-200.jsonl'))
    const byId = new Map(rows.map(r => [r.custom_id, r]))
    const updates = new Map(plan.mapping.map((m: any) => [m.slug, m]))
    writeLines('haiku-200.jsonl', previous.map(p => {
      const mapping: any = updates.get(p.slug)
      return mapping ? mergeAttempt(p, decode(byId.get(mapping.custom_id) ?? { result: { type: 'missing-result' } }), mapping.tasks, plan.attempt) : p
    }))
    const aggregate = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, cost_usd: 0 }
    for (const r of jsonl(join(out, 'haiku-200.jsonl'))) {
      for (const k of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'] as const) aggregate[k] += r.usage?.[k] ?? 0
      aggregate.cost_usd += r.cost ?? 0
    }
    write('haiku-total-usage.json', aggregate)
  }
  write(`${lane}-applied.json`, { batch_id: batch.id, applied_at: new Date().toISOString() })
  console.log(JSON.stringify({ lane, ...usage }))
}
async function prepareRetry(attempt: number) {
  const lane = `haiku-${attempt}`
  if (existsSync(join(out, `${lane}-requests.json`))) throw Error('retry plan already exists')
  if (attempt === 3 && !existsSync(join(out, 'haiku-2-results.jsonl'))) throw Error('second attempt must finish first')
  if (!existsSync(join(out, 'haiku-initial-200.jsonl'))) writeLines('haiku-initial-200.jsonl', jsonl(join(out, 'haiku-200.jsonl')))
  const guard = await import(pathToFileURL(join(out, 'guard-snapshot/validate.ts')).href)
  const outputs = new Map(jsonl(join(out, 'haiku-200.jsonl')).map(r => [r.slug, r]))
  const plan = retryRequests(selected(), outputs, guard.hasNewPersonalName, guard.NAMES_PROBLEM, attempt)
  write(`${lane}-requests.json`, plan)
  console.log(JSON.stringify({ lane, retry_units: plan.requests.length, upper_usd: upperCost(plan.requests) }))
}
function prepare() {
  if (existsSync(join(out, 'units-200.json'))) throw Error('selection already exists; do not overwrite')
  const units = select(jsonl(pilot)), requests = enrichmentRequests(units)
  write('units-200.json', units.map(u => ({ slug: u.slug, stratum: stratumOf(u), characters: Array.from(recordOf(u).text).length, source_sha256: hash(recordOf(u).text) })))
  write('haiku-requests.json', { requests })
  const models = read('models-list.json').data
  const model = models.find((m: any) => m.id === MODEL && m.display_name === 'Claude Haiku 5.5')
  if (!model?.capabilities?.batch?.supported || !model?.capabilities?.structured_outputs?.supported || !model?.capabilities?.thinking?.types?.disabled?.supported) throw Error('required model capabilities not confirmed')
  // Worker max_tokens=4000; two qwen attempts plus one gpt-oss-120b escalation.
  // Reserve all three full outputs and estimate input using the worker's 3.5 chars/token fallback.
  const qwenReserve = requests.reduce((n, r) => n + ((JSON.stringify(r.params).length / 3.5 + 500) * (4625 * 2 + 31818) + 4000 * (30475 * 2 + 68182)) / 1e6 * 0.011 / 1000, 0)
  const judgeReserve = units.reduce((n, u) => n + ((Buffer.byteLength(recordOf(u).text) + 16000) * 0.10 + 1024 * 0.25) / 1e6, 0)
  const budget = { cap_usd: 5, qwen_reserve_usd: qwenReserve, haiku_upper_usd: upperCost(requests), judge_upper_usd: judgeReserve, whole_estimate_usd: qwenReserve + upperCost(requests) + judgeReserve, prices_per_million: { batch_input: 0.05, batch_output: 0.25, batch_cache_write_1h: 0.10, batch_cache_write_5m: 0.0625, batch_cache_read: 0.005 }, pricing_url: 'https://platform.claude.com/docs/en/about-claude/pricing', scope: '200 paired units; orchestrator pilot load is external to this lane', model: MODEL }
  write('budget.json', budget)
  if (budget.whole_estimate_usd > 5) throw Error('whole-bakeoff estimate exceeds US$5')
  write('qwen-wait.json', { started_at: new Date().toISOString(), deadline: new Date(Date.now() + 86400000).toISOString(), interval_ms: 600000 })
  console.log(JSON.stringify({ selected: units.length, short: units.filter(u => Array.from(recordOf(u).text).length < 600).length, strata: new Set(units.map(u => JSON.stringify(stratumOf(u)))).size, ...budget }))
}
async function waitQwen() {
  const config = read('qwen-wait.json'), deadline = Date.parse(config.deadline)
  while (Date.now() <= deadline) {
    if (existsSync(join(out, 'qwen3-200.jsonl'))) {
      const rows = jsonl(join(out, 'qwen3-200.jsonl')), wanted = new Set(selected().map(u => u.slug))
      const slugs = new Set(rows.map(r => r.slug))
      if (rows.length === 200 && slugs.size === 200 && [...wanted].every(s => slugs.has(s))) {
        write('qwen-wait-result.json', { ready_at: new Date().toISOString(), count: rows.length })
        console.log('qwen3 export ready: 200 matching unique slugs'); return
      }
      console.log('qwen3 export incomplete; waiting for matching units')
    } else console.log('qwen3 export pending')
    await sleep(Math.min(600000, Math.max(0, deadline - Date.now())))
  }
  write('qwen-wait-result.json', { timed_out_at: new Date().toISOString() })
  throw Error('qwen3 export did not arrive within 24 hours')
}
function makeBlind() {
  if (existsSync(join(out, 'blind-key.json'))) throw Error('blind key already exists')
  const units = selected(), h = jsonl(join(out, 'haiku-200.jsonl')), q = jsonl(join(out, 'qwen3-200.jsonl'))
  for (const rows of [h, q]) if (rows.length !== 200 || new Set(rows.map(r => r.slug)).size !== 200 || units.some(u => !rows.some(r => r.slug === u.slug))) throw Error('pair coverage mismatch')
  const { pairs, key } = blind(units, new Map(h.map(r => [r.slug, r])), new Map(q.map(r => [r.slug, r])), hash([...randomBytes(32)].join(',')))
  write('blind-key.json', key); write('blind-pairs.json', pairs)
  write('judge-requests.json', { requests: judgeRequests(pairs) })
  write('spotcheck-30.json', pairs.slice(0, 30))
  console.log('200 blind pairs prepared; 30 random pairs reserved for independent review')
}
const command = process.argv[2], lane = process.argv[3]
try {
  if (command === 'prepare') prepare()
  else if (command === 'retry') await prepareRetry(Number(lane))
  else if (command === 'submit' && ['haiku', 'haiku-2', 'haiku-3', 'judge', 'donation'].includes(lane)) await submit(lane)
  else if (command === 'poll' && ['haiku', 'haiku-2', 'haiku-3', 'judge', 'donation'].includes(lane)) await poll(lane)
  else if (command === 'wait-qwen') await waitQwen()
  else if (command === 'blind') makeBlind()
  else throw Error('usage: bakeoff.ts prepare | retry 2|3 | submit|poll haiku|haiku-2|haiku-3|judge|donation | wait-qwen | blind')
} catch (e) {
  // Do not print request bodies, response text, environment, or stack traces.
  console.error(e instanceof Error ? e.message : 'bakeoff failed'); process.exitCode = 1
}
