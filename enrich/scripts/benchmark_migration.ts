// Local Miniflare D1 only. Creates an isolated persistent database; no remote bindings.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const persistence = mkdtempSync(join(tmpdir(), 'opax-enrich-additive-d1-'))
const mf = new Miniflare({ ...convertV4MiniflareOptions({ ip: '::1', modules: true, script: '', resourcePersistencePath: persistence, d1Databases: { DATABASE: 'local-scale-db' } }), host: '::1' })
const sql = (name: string) => readFileSync(resolve(import.meta.dirname, '../migrations', name), 'utf8').replace(/--[^\r\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)
function sqliteFile(directory: string): string | undefined {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, file.name)
    if (file.isDirectory()) { const found = sqliteFile(path); if (found) return found }
    else if (file.name.endsWith('.sqlite') && file.name !== 'metadata.sqlite') return path
  }
}
function snapshot(file: string): { hash: string; rows: number; roots: unknown[] } {
  const raw = new DatabaseSync(file, { readOnly: true })
  try {
    const digest = createHash('sha256')
    let rows = 0
    for (const row of raw.prepare('SELECT rid,task,status,priority,source_created,attempts,transient,force,model,result,outcome,last_error,neurons,claim_token,claimed_at,created_at,updated_at,done_at FROM queue ORDER BY rid,task').iterate()) { digest.update(JSON.stringify(row)); rows++ }
    const roots = raw.prepare("SELECT name,rootpage FROM sqlite_master WHERE name='queue' OR name IN ('queue_pick','queue_outcome','queue_claim') ORDER BY name").all()
    return { hash: digest.digest('hex'), rows, roots }
  } finally { raw.close() }
}
try {
  await mf.ready
  const db = await mf.getD1Database('DATABASE')
  for (const statement of sql('0001_init.sql')) await db.prepare(statement).run()
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<480000)
 INSERT INTO queue (rid,task,status,priority,source_created,attempts,transient,force,model,result,outcome,last_error,neurons,claim_token,claimed_at,created_at,updated_at,done_at)
 SELECT printf('%032x',CASE WHEN x<=360000 THEN (x+1)/2 ELSE x END),
 CASE WHEN x<=360000 AND x%2=0 THEN 'speech_topics' ELSE 'speech_summary' END,
 CASE WHEN x%101=0 THEN 'claimed' WHEN x<=360000 THEN 'pending' WHEN x%23=0 THEN 'quarantined' ELSE 'done' END,
 CASE WHEN x<=360000 THEN 0 ELSE 100 END,1700000000000+x,x%3,x%4,x%2,'model',
 CASE WHEN x>360000 THEN printf('%.*c',300,'x') ELSE NULL END,
 CASE WHEN x>360000 THEN 'written' ELSE NULL END,NULL,x%30+0.5,
 CASE WHEN x%101=0 THEN 'claim' ELSE NULL END,CASE WHEN x%101=0 THEN 1700000000000 ELSE NULL END,
 1700000000000,1700000000000,CASE WHEN x>360000 THEN 1700000000000 ELSE NULL END FROM n`).run()
  const file = sqliteFile(persistence)
  if (!file) throw new Error('Local D1 SQLite file missing')
  const before = snapshot(file)
  assert.equal(before.rows, 480000)
  const start = performance.now()
  const result = await db.batch(sql('0002_historic_rules.sql').map(statement => db.prepare(statement)))
  const wallMs = performance.now() - start
  const after = snapshot(file)
  assert.deepEqual(after, before)
  const defaults = await db.prepare('SELECT COUNT(*) AS n FROM queue WHERE historic=0 AND names_rejected=0 AND terminal_reason IS NULL').first<{ n: number }>()
  assert.equal(defaults?.n, 480000)
  // Old-worker enqueue/claim/finish SQL, against the migrated schema.
  await db.prepare("INSERT OR IGNORE INTO queue (rid,task,status,priority,source_created,created_at,updated_at) VALUES (?,?,'pending',?,?,?,?)").bind('f'.repeat(32), 'speech_summary', 100, 1, 1, 1).run()
  await db.prepare("UPDATE queue SET status='claimed',claim_token=?,claimed_at=?,updated_at=? WHERE status='pending' AND rid=?").bind('old-worker-claim', 2, 2, 'f'.repeat(32)).run()
  await db.prepare("UPDATE queue SET status=?,outcome=COALESCE(?,outcome),result=COALESCE(?,result),model=COALESCE(?,model),last_error=?,neurons=neurons+?,attempts=attempts+?,transient=transient+?,claim_token=NULL,claimed_at=NULL,updated_at=?,done_at=? WHERE rid=? AND task=?")
    .bind('done', 'written', 'saved', 'model', null, 4.5, 0, 0, 3, 3, 'f'.repeat(32), 'speech_summary').run()
  assert.equal((await db.prepare('SELECT status FROM queue WHERE rid=?').bind('f'.repeat(32)).first<{ status: string }>())?.status, 'done')
  const report = { rows: before.rows, wallMs, sqlMs: result.reduce((n, r) => n + r.meta.duration, 0), statements: result.length, rowsAndIndexesPreserved: true, oldWorkerCompatible: true, queueHash: before.hash, persistence }
  const output = process.argv[2]
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await mf.dispose() }
