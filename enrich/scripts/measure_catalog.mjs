// Read-only catalog timing probe. Requires the Worker's ARAG_KB_ID/TOKEN env.
// node --env-file=/path/to/local.env scripts/measure_catalog.mjs --since=ISO [--metadata]
// Emits only timings, date bounds and shortened run IDs; never URLs, KB IDs or tokens.
import { Kb } from '../src/kb.ts'
import { admissionBudget } from '../src/run-budget.ts'
import { readConfig } from '../src/env.ts'

const argument = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3)
const since = argument('since') ?? '2026-10-12T08:41:11Z'
const start = Date.parse(since)
if (!Number.isFinite(start)) throw new Error('valid --since ISO timestamp required')
for (const key of ['ARAG_KB_ID', 'ARAG_KB_TOKEN']) if (!process.env[key]) throw new Error(`${key} missing`)
const kb = new Kb({ ARAG_ZONE: process.env.ARAG_ZONE ?? 'aws-ap-southeast-2-1',
  ARAG_KB_ID: process.env.ARAG_KB_ID, ARAG_KB_TOKEN: process.env.ARAG_KB_TOKEN })
const plans = [[200], [50], [200, 3600_000], [50, 300_000], [50, 60_000], [50, 1000]]
for (const [size, width] of plans) {
  const until = width ? new Date(start + width).toISOString() : undefined
  const t = performance.now()
  try {
    const page = await kb.catalog('speech', since, 0, size, until)
    console.log(JSON.stringify({ query: until ? 'bounded' : 'unbounded', since, until, page_size: size,
      ms: Math.round(performance.now() - t), rows: page.rows.length, has_next: page.hasNext,
      first_created: page.rows[0]?.created, last_created: page.rows.at(-1)?.created }))
    if (process.argv.includes('--metadata') && page.rows.length) {
      const rid = page.rows[0].rid, basicStart = performance.now()
      await kb.getBasic(rid)
      const basicMs = Math.round(performance.now() - basicStart), fullStart = performance.now()
      const resource = await kb.getResource(rid)
      const fullMs = Math.round(performance.now() - fullStart)
      const budget = resource ? admissionBudget(resource, rid, readConfig(process.env)) : null
      console.log(JSON.stringify({ query: 'metadata-sample', basic_ms: basicMs, full_ms: fullMs,
        run: budget?.run_id.slice(0, 8), max_usd: budget?.max_usd, initial_neurons: budget?.initial_neurons }))
    }
  } catch (err) {
    console.log(JSON.stringify({ query: until ? 'bounded' : 'unbounded', since, until, page_size: size,
      ms: Math.round(performance.now() - t), error: err.status === 0 ? 'timeout/network' : err.status ? `HTTP ${err.status}` : 'probe incomplete' }))
  }
}
