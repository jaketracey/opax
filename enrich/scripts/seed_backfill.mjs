#!/usr/bin/env node
// Seed the opax-enrich queue with the backfill: the rids still pending in the Mac
// summaries queue (~/.cache/opax/summaries_queue.sqlite, table `queue`).
//
// They are 1998-2000 speeches that are already topic-labelled, so each becomes a single
// `speech_summary` row at priority 0 (new content is priority 100 and always goes first).
// Rows are INSERT OR IGNORE on (rid, task): re-running is harmless.
//
//   node scripts/seed_backfill.mjs --local --limit 5          # try a handful against local D1
//   node scripts/seed_backfill.mjs --dry-run                  # write the SQL files, run nothing
//   node scripts/seed_backfill.mjs --remote                   # PRODUCTION D1: only when told to
//
// Which rows: status pending and error, plus `claimed` rows older than --claimed-older-than-hours
// (default 1: a claim that old belongs to a worker that died). Set it to 0 to leave claimed rows out.
//
// Options: --db-path FILE  --database NAME  --limit N  --chunk ROWS_PER_FILE (default 5000)
//          --statuses pending,error,claimed (default pending,error)  --claimed-older-than-hours H
//          --out DIR  --dry-run  --local | --remote
//
// Run with Node 24 (node:sqlite): export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    'db-path': { type: 'string', default: join(homedir(), '.cache/opax/summaries_queue.sqlite') },
    database: { type: 'string', default: 'opax-enrich' },
    limit: { type: 'string' },
    chunk: { type: 'string', default: '5000' },
    statuses: { type: 'string', default: 'pending,error' },
    'claimed-older-than-hours': { type: 'string', default: '1' },
    out: { type: 'string', default: join(tmpdir(), 'opax-enrich-seed') },
    'dry-run': { type: 'boolean', default: false },
    local: { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
  },
})

if (opt.local === opt.remote && !opt['dry-run']) {
  console.error('Say where: --local or --remote (or --dry-run to only write the SQL files).')
  process.exit(2)
}

const STATUSES = new Set(['pending', 'claimed', 'error'])
const statuses = opt.statuses.split(',').map((s) => s.trim()).filter(Boolean)
if (!statuses.length || statuses.some((s) => !STATUSES.has(s))) {
  console.error(`--statuses must be a subset of ${[...STATUSES].join(',')}`)
  process.exit(2)
}

const source = new DatabaseSync(opt['db-path'], { readOnly: true })
const limit = opt.limit ? Math.max(1, Number.parseInt(opt.limit, 10)) : null
const claimedHours = Number(opt['claimed-older-than-hours'])
if (!Number.isFinite(claimedHours) || claimedHours < 0) {
  console.error('--claimed-older-than-hours must be a number >= 0')
  process.exit(2)
}
// `claimed` is selected by age, never wholesale: a fresh claim is a worker mid-flight.
const plainStatuses = statuses.filter((s) => s !== 'claimed')
const wantClaimed = statuses.includes('claimed') || claimedHours > 0
const clauses = []
const params = []
if (plainStatuses.length) {
  clauses.push(`status IN (${plainStatuses.map(() => '?').join(',')})`)
  params.push(...plainStatuses)
}
if (wantClaimed) {
  clauses.push('(status = ? AND claimed_at < ?)')
  params.push('claimed', Date.now() / 1000 - claimedHours * 3600)
}
const all = source
  .prepare(`SELECT rid FROM queue WHERE ${clauses.join(' OR ')} ORDER BY priority DESC, rowid ${limit ? `LIMIT ${limit}` : ''}`)
  .all(...params)
  .map((r) => r.rid)
const counts = Object.fromEntries(source.prepare('SELECT status, COUNT(*) AS n FROM queue GROUP BY status').all().map((r) => [r.status, r.n]))
source.close()

// The SQL is written as a file, so every rid is checked: a 32-character hex resource id and nothing else.
const RID = /^[0-9a-f]{32}$/
const rids = all.filter((rid) => typeof rid === 'string' && RID.test(rid))
const rejected = all.length - rids.length
console.log(`source queue: ${JSON.stringify(counts)}`)
console.log(`selected: ${all.length} rows (${plainStatuses.join(' + ') || 'none'}${wantClaimed ? ` + claimed older than ${claimedHours} h` : ''})${limit ? `, limited to ${limit}` : ''}; ${rids.length} valid rids${rejected ? `, ${rejected} skipped as malformed` : ''}`)
if (!rids.length) process.exit(0)

mkdirSync(opt.out, { recursive: true })
const now = Date.now()
const ROWS_PER_STATEMENT = 500
const chunkSize = Math.max(ROWS_PER_STATEMENT, Number.parseInt(opt.chunk, 10) || 5000)
const files = []
for (let i = 0; i < rids.length; i += chunkSize) {
  const part = rids.slice(i, i + chunkSize)
  const statements = []
  for (let j = 0; j < part.length; j += ROWS_PER_STATEMENT) {
    const values = part.slice(j, j + ROWS_PER_STATEMENT).map((rid) => `('${rid}','speech_summary','pending',0,${now},${now})`)
    statements.push(`INSERT OR IGNORE INTO queue (rid, task, status, priority, created_at, updated_at) VALUES ${values.join(',')};`)
  }
  const file = join(opt.out, `seed-${String(files.length).padStart(3, '0')}.sql`)
  writeFileSync(file, `${statements.join('\n')}\n`)
  files.push(file)
}
console.log(`wrote ${files.length} SQL file(s) to ${opt.out}`)
if (opt['dry-run']) process.exit(0)

const target = opt.remote ? '--remote' : '--local'
for (const [index, file] of files.entries()) {
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', opt.database, target, '--file', file, '--yes'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname })
  const tail = `${run.stdout}${run.stderr}`.trim().split('\n').slice(-4).join('\n')
  if (run.status !== 0) {
    console.error(`file ${index + 1}/${files.length} FAILED (exit ${run.status}):\n${tail}`)
    process.exit(1)
  }
  console.log(`file ${index + 1}/${files.length} ok`)
}
console.log(`done. Check: npx wrangler d1 execute ${opt.database} ${target} --command "SELECT task, status, COUNT(*) FROM queue GROUP BY 1, 2"`)
