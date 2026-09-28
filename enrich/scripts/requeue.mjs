#!/usr/bin/env node
// Put finished or set-aside rows back in the queue.
//
//   node scripts/requeue.mjs quarantined --remote          # try quarantined rows again (after a prompt/validator fix)
//   node scripts/requeue.mjs dry --remote                  # throw away dry-run results and re-run the model on them
//   node scripts/requeue.mjs quarantined --task speech_topics --remote
//   node scripts/requeue.mjs count --remote                # how many rows each mode would touch
//
// `dry` re-queues rows whose result was recorded but never written to the box (outcome
// dry / unwritten) AND empty topic verdicts read by a dry run. Rows already written to the
// box (outcome `written`) are never touched. Requeued rows go to the front (priority 200).
//
// NOTE: you usually do NOT want `dry` when switching WRITE_MODE to "live": live mode writes the
// stored dry results itself (re-checking the invariants), without paying for the model again.
// Use `dry` only when the model or prompt changed and the stored results should be discarded.

import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null
const taskIndex = args.indexOf('--task')
const task = taskIndex >= 0 ? args[taskIndex + 1] : null
const mode = args.find((a) => !a.startsWith('--') && a !== task)
const TASKS = ['speech_summary', 'speech_topics', 'release_summary']

if (!target || !['quarantined', 'dry', 'count'].includes(mode ?? '') || (task && !TASKS.includes(task))) {
  console.error('usage: requeue.mjs <quarantined|dry|count> [--task speech_summary|speech_topics|release_summary] --local|--remote')
  process.exit(2)
}

const taskFilter = task ? ` AND task = '${task}'` : ''
const where = {
  quarantined: `status = 'quarantined'${taskFilter}`,
  dry: `status = 'done' AND outcome IN ('dry', 'unwritten', 'empty') AND (outcome != 'empty' OR model IS NOT NULL)${taskFilter}`,
}

const run = (sql) => {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'opax-enrich', target, '--command', sql, '--json'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname })
  if (r.status !== 0) {
    console.error(`${r.stdout}${r.stderr}`.trim().split('\n').slice(-6).join('\n'))
    process.exit(1)
  }
  return JSON.parse(r.stdout)[0]
}

if (mode === 'count') {
  for (const [name, clause] of Object.entries(where)) {
    console.log(name, JSON.stringify(run(`SELECT task, COUNT(*) AS n FROM queue WHERE ${clause} GROUP BY task`).results))
  }
  process.exit(0)
}

const now = Date.now()
// Discarded dry results also lose their neuron count (the spend table keeps the money actually spent).
const resetNeurons = mode === 'dry' ? 'neurons = 0, ' : ''
const out = run(
  `UPDATE queue SET status = 'pending', priority = 200, ${resetNeurons}attempts = 0, transient = 0, outcome = NULL, result = NULL, last_error = NULL, claim_token = NULL, claimed_at = NULL, done_at = NULL, updated_at = ${now} WHERE ${where[mode]}`,
)
console.log(`requeued ${out.meta?.changes ?? '?'} ${mode} rows${task ? ` (${task})` : ''}`)
