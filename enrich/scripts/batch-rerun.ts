// Local bake-off follow-up only. Never calls a KB or Worker endpoint.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { recordOf, fullTextOf, hash } from './bakeoff-lib.ts'
import { batchRequest, batchVerdict, decode, reserveSpend, usageCost } from './batch-lib.ts'
import { validateBatchResult } from '../src/batch-result.ts'
import { hasNewPersonalName } from '../src/validate.ts'

const previous = '/home/jake/opax-staging/federation/bakeoff'
const out = '/home/jake/opax-staging/federation/enrich-batch-path/rerun'
mkdirSync(out, { recursive: true, mode: 0o700 })
const read = (name: string) => JSON.parse(readFileSync(join(out, name), 'utf8'))
const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
const lines = (path: string) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(s => JSON.parse(s))
async function api(path: string, body?: unknown, raw = false): Promise<any> {
  const line = readFileSync('/home/jake/opax/.env', 'utf8').split('\n').find(s => s.startsWith('ANTHROPIC_API_KEY='))
  const key = line?.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^(["'])(.*)\1$/, '$2')
  if (!key) throw Error('approved API credential unavailable')
  const url = new URL(path, 'https://api.anthropic.com')
  if (url.origin !== 'https://api.anthropic.com') throw Error('unexpected API origin')
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(55000) })
  if (!response.ok) throw Error(`Anthropic HTTP ${response.status}`)
  return raw ? response.text() : response.json()
}
function prepare() {
  if (existsSync(join(out, 'plan.json'))) throw Error('plan already exists')
  const cohort = JSON.parse(readFileSync(join(previous, 'units-200.json'), 'utf8'))
  const h = JSON.parse(readFileSync(join(previous, 'haiku-validator-details.json'), 'utf8'))
  const q = JSON.parse(readFileSync(join(previous, 'qwen3-validator-details.json'), 'utf8'))
  const units = new Map(lines('/home/jake/opax-staging/federation/kb-gap/pilot-2000.jsonl').map(u => [u.slug, u]))
  const outputs = new Map(lines(join(previous, 'haiku-200.jsonl')).map(u => [u.slug, u]))
  const selected = cohort.filter((c: any) => !h.find((r: any) => r.slug === c.slug).valid || !q.find((r: any) => r.slug === c.slug).valid || hasNewPersonalName(outputs.get(c.slug).summary, fullTextOf(units.get(c.slug))))
  const plan = selected.map((c: any) => {
    const unit = units.get(c.slug), record = { ...recordOf(unit), historic: true, nameText: fullTextOf(unit) }
    return { rid: `rerun-${cohort.indexOf(c)}`, source_hash: hash(JSON.stringify(record)), tasks: ['summary', 'topics'], record, cohort_index: cohort.indexOf(c), haiku_failed: !h.find((r: any) => r.slug === c.slug).valid, qwen_failed: !q.find((r: any) => r.slug === c.slug).valid }
  })
  write('plan.json', plan)
  console.log(JSON.stringify({ selected: plan.length, haiku_failures: 12, qwen_missing: 8, mode: 'fresh requests using amended prompt and current historic guard' }))
}
async function submit(retry = false) {
  const prefix = retry ? 'retry-' : ''
  if (existsSync(join(out, prefix + 'submission.json'))) throw Error('submission recorded; poll instead')
  const prior = retry ? new Map(lines(join(out, 'results.jsonl')).map(r => [r.custom_id, r])) : null
  const failures = retry ? read('metrics.json').details.filter((r: any) => !r.valid) : null
  const requests = read('plan.json').filter((u: any) => !retry || failures.some((r: any) => r.cohort_index === u.cohort_index)).map((u: any) => batchRequest(u, retry ? 2 : 1,
    retry ? failures.find((r: any) => r.cohort_index === u.cohort_index).problems : [], retry ? ['summary'] : u.tasks,
    retry ? decode(prior!.get(`${u.rid}-1`)).summary : undefined))
  const reservation = reserveSpend(retry ? [{ ...read('submission.json').reservation, actual: read('metrics.json').cost_usd }] : [], requests, Date.now(), 0.50, 0.50)
  // Persist the reservation before POST. An ambiguous timeout must be reconciled manually.
  write(prefix + 'submission.json', { reservation, batch: null })
  const batch = await api('/v1/messages/batches', { requests })
  write(prefix + 'submission.json', { reservation, batch })
  console.log(JSON.stringify({ count: requests.length, upper_usd: reservation.upper, batch_id: batch.id, status: batch.processing_status }))
}
async function poll(retry = false) {
  const prefix = retry ? 'retry-' : ''
  const sub = read(prefix + 'submission.json')
  if (!sub.batch?.id) throw Error('ambiguous submission: reconcile batch list before proceeding')
  const batch = await api(`/v1/messages/batches/${sub.batch.id}`)
  write(prefix + 'batch.json', batch)
  if (batch.processing_status !== 'ended') { console.log(JSON.stringify({ status: batch.processing_status, counts: batch.request_counts })); return }
  const raw = await api(batch.results_url ?? `/v1/messages/batches/${batch.id}/results`, undefined, true)
  writeFileSync(join(out, prefix + 'results.jsonl'), raw, { mode: 0o600 })
  const responses = lines(join(out, prefix + 'results.jsonl')), byId = new Map(responses.map(r => [r.custom_id, r]))
  const first = retry ? new Map(lines(join(out, 'results.jsonl')).map(r => [r.custom_id, r])) : null
  const expected = retry ? read('metrics.json').details.filter((r: any) => !r.valid).length : read('plan.json').length
  if (byId.size !== responses.length || responses.length !== expected) throw Error('batch coverage mismatch')
  const metrics = read('plan.json').map((u: any) => {
    const row = byId.get(`${u.rid}-${retry ? 2 : 1}`) ?? first?.get(`${u.rid}-1`)
    const v = retry ? validateBatchResult(u.record, u.tasks, { ...decode(first!.get(`${u.rid}-1`)), ...(byId.has(`${u.rid}-2`) ? { summary: decode(row).summary } : {}) }) : batchVerdict(u, row)
    if (decode(row).error || decode(row).refusal || decode(row).stop_reason !== 'end_turn') { v.valid = false; v.problems.push('incomplete model response') }
    return { cohort_index: u.cohort_index, haiku_failed: u.haiku_failed, qwen_failed: u.qwen_failed, valid: v.valid, problems: v.problems, cost_usd: usageCost(row.result?.message?.usage) }
  })
  const cost = responses.reduce((n: number, r: any) => n + usageCost(r.result?.message?.usage), 0)
  write(prefix + 'metrics.json', { units: metrics.length, passed: metrics.filter((r: any) => r.valid).length, cost_usd: cost, total_cost_usd: cost + (retry ? read('metrics.json').cost_usd : 0), details: metrics })
  console.log(JSON.stringify({ units: metrics.length, passed: metrics.filter((r: any) => r.valid).length, cost_usd: cost, failures: metrics.filter((r: any) => !r.valid) }))
}
try {
  if (process.argv[2] === 'prepare') prepare()
  else if (process.argv[2] === 'submit') await submit()
  else if (process.argv[2] === 'poll') await poll()
  else if (process.argv[2] === 'retry') await submit(true)
  else if (process.argv[2] === 'poll-retry') await poll(true)
  else throw Error('usage: batch-rerun.ts prepare|submit|poll')
} catch { console.error('batch follow-up incomplete; inspect local state without printing private text'); process.exitCode = 1 }
