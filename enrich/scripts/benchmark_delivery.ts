// Entirely local: real Worker/D1 result route, invented KB, durable controller saves.
// Every Worker fetch goes to outboundService; no network route to a real KB/API.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { batchRecord, sourceHash } from '../src/batch-result.ts'
import { enqueue } from '../src/db.ts'
import { FakeKb } from '../test/helpers.ts'
import { decode } from './batch-lib.ts'
import { AdminHttp, deliver, saveRun, type BatchRuntime, type Run, type Unit } from './batch-path.ts'

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../test/fixtures/batch-responses.json'), 'utf8'))
const output = process.argv[2]
const count = 72, spoolUnits = 1000
const directory = mkdtempSync(join(tmpdir(), 'opax-batch-throughput-'))
let mf: Miniflare | undefined
try {
  const bundle = await build({ entryPoints: [resolve(import.meta.dirname, '../src/index.ts')], bundle: true, write: false, format: 'esm', target: 'es2022' })
  const kb = new FakeKb()
  let latencyMs = 0, calls = 0, active = 0, peak = 0
  mf = new Miniflare({ ...convertV4MiniflareOptions({
    ip: '::1', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-01',
    resourcePersistencePath: join(directory, 'd1'), d1Databases: { DB: 'local-delivery-db' },
    bindings: { ARAG_ZONE: 'fixture', ARAG_KB_ID: 'fixture', ARAG_KB_TOKEN: 'invented-fixture',
      ENRICH_ADMIN_TOKEN: 'invented-fixture', WRITE_MODE: 'live', HISTORIC_HOLD: 'true' },
    outboundService: async request => {
      const url = new URL(request.url)
      assert.equal(url.origin, 'https://fixture.rag.progress.cloud')
      const match = /^\/api\/v1\/kb\/fixture\/resource\/([0-9a-f]{32})(\/text\/da-summary-t-body)?$/.exec(url.pathname)
      assert.ok(match, 'unexpected fixture KB path')
      calls++; peak = Math.max(peak, ++active)
      try {
        if (latencyMs) await delay(latencyMs)
        const rid = match[1]
        let value: unknown
        if (request.method === 'PATCH') {
          const body = await request.json() as any
          if (body.texts) await kb.patchSummary(rid, body.texts['da-summary-t-body'].body)
          else await kb.patchClassifications(rid, body.usermetadata.classifications)
          value = {}
        } else if (match[2]) value = { value: { body: await kb.getSummaryBody(rid) } }
        else value = url.searchParams.getAll('show').includes('values') ? await kb.getResource(rid) : await kb.getBasic(rid)
        return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      } finally { active-- }
    },
  }), host: '::1' })
  await mf.ready
  const db = await mf.getD1Database('DB')
  for (const file of readdirSync(resolve(import.meta.dirname, '../migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const statements = readFileSync(resolve(import.meta.dirname, '../migrations', file), 'utf8').replace(/--[^\r\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)
    await db.batch(statements.map(sql => db.prepare(sql)))
  }
  const results: Array<Record<string, number>> = []
  let serial = 0
  for (const latency of [150, 225, 300]) for (const concurrency of [1, 6, 12]) {
    const run: Run = { id: `fixture-${++serial}`, units: [], submissions: [] }
    const good = decode(fixture.responses[0])
    for (let i = 0; i < count; i++) {
      const rid = (serial * 1000 + i).toString(16).padStart(32, '0')
      kb.add(rid, { title: '', slug: `fixture-${rid}`, texts: { body: fixture.source }, classifications: [
        { labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }, { labelset: 'chamber', label: 'senate' },
      ] })
      const record = batchRecord((await kb.getResource(rid))!, rid)
      run.units.push({ rid, record, source_hash: await sourceHash(record), tasks: ['summary', 'topics'],
        stage: 'ready', attempt: 1, result: { summary: good.summary, topics: good.topics } })
    }
    await enqueue(db as unknown as D1Database, run.units.flatMap(u => (['speech_summary', 'speech_topics'] as const)
      .map(task => ({ rid: u.rid, task, priority: 0, historicHold: true }))), Date.now())
    await db.batch(run.units.map(u => db.prepare("INSERT INTO batch_items (rid,run_id,source_hash,tasks,state,updated_at) VALUES (?,?,?,?,'reserved',?)")
      .bind(u.rid, run.id, u.source_hash, JSON.stringify(['speech_summary', 'speech_topics']), Date.now())))
    // Scale this invented source/result fixture to 1,000 units; inactive rows are settled.
    const exemplar = run.units[0]
    for (let i = count; i < spoolUnits; i++) run.units.push({ ...structuredClone(exemplar), rid: (serial * 1000 + i).toString(16).padStart(32, '0'), stage: 'done' } as Unit)
    const d: BatchRuntime = {
      now: Date.now, dailyCap: 3, totalCap: 3, maxActive: 2, batchSize: spoolUnits, deliveryConcurrency: concurrency,
      save: r => saveRun(r, directory), allRuns: () => [run],
      write: () => { throw Error('unexpected receipt write') }, anthropic: async () => { throw Error('no API in local benchmark') },
      admin: async (path, body) => {
        const response = await mf!.dispatchFetch(`https://example.invalid${path}`, { method: 'POST',
          headers: { authorization: 'Bearer invented-fixture', 'content-type': 'application/json' }, body: JSON.stringify(body) })
        if (!response.ok) throw new AdminHttp(response.status)
        return response.json()
      },
    }
    saveRun(run, directory)
    latencyMs = latency; calls = active = peak = 0
    const start = performance.now()
    await deliver(run, d)
    const wallMs = performance.now() - start
    assert.ok(run.units.every(u => u.stage === 'done'))
    assert.equal(calls, count * 6)
    assert.equal(peak, concurrency)
    assert.equal(active, 0)
    const settled = await db.prepare("SELECT COUNT(*) AS n FROM batch_items WHERE run_id=? AND state='done'").bind(run.id).first<{ n: number }>()
    assert.equal(settled!.n, count)
    const row = { kbLatencyMs: latency, concurrency, results: count, spoolUnits, kbCalls: calls, peakKbCalls: peak,
      wallMs: Math.round(wallMs), resultsPerHour: Math.round(count * 3600000 / wallMs) }
    results.push(row); console.log(JSON.stringify(row))
  }
  const report = { localOnly: true, worker: 'src/index.ts (unchanged)', includes: ['HTTP result route', 'Miniflare D1', 'six KB calls per result', 'atomic rename and file/directory fsync after each result'], results }
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
} finally {
  try { await mf?.dispose() } finally { rmSync(directory, { recursive: true, force: true }) }
}
