#!/usr/bin/env node
// Set (or show) a discovery cursor by hand.
//
//   node scripts/set_cursor.mjs speech 2026-09-01T00:00:00Z --remote
//   node scripts/set_cursor.mjs all 2026-09-20T00:00:00Z --local
//   node scripts/set_cursor.mjs show --remote
//
// The cursor is the `created` time discovery reads from (minus a short overlap once a
// walk has completed). Lowering it re-walks history: the queue de-duplicates on
// (rid, task), so re-discovered rows cost nothing. Raising it skips content.

import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null
const positional = args.filter((a) => !a.startsWith('--'))
const KINDS = ['speech', 'press_release']

const wrangler = (sql) => {
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', 'opax-enrich', target, '--command', sql, '--json'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname })
  if (run.status !== 0) {
    console.error(`${run.stdout}${run.stderr}`.trim().split('\n').slice(-6).join('\n'))
    process.exit(1)
  }
  return run.stdout
}

if (!target) {
  console.error('Say where: --local or --remote')
  process.exit(2)
}

if (positional[0] === 'show') {
  const out = JSON.parse(wrangler("SELECT key, value, updated_at FROM state WHERE key LIKE 'cursor:%' OR key LIKE 'partial:%' ORDER BY key"))
  console.log(JSON.stringify(out[0]?.results ?? [], null, 2))
  process.exit(0)
}

const [kind, when] = positional
if (![...KINDS, 'all'].includes(kind) || !when) {
  console.error(`usage: set_cursor.mjs <${[...KINDS, 'all'].join('|')}> <ISO time> --local|--remote   |   set_cursor.mjs show --local|--remote`)
  process.exit(2)
}
const ms = Date.parse(when)
if (!Number.isFinite(ms)) {
  console.error(`not a time: ${when}`)
  process.exit(2)
}
const iso = new Date(ms).toISOString() // validated and re-serialised: safe to inline
const now = Date.now()
const statements = (kind === 'all' ? KINDS : [kind]).flatMap((k) => [
  `INSERT INTO state (key, value, updated_at) VALUES ('cursor:${k}', '${iso}', ${now}) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  `INSERT INTO state (key, value, updated_at) VALUES ('partial:${k}', '0', ${now}) ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at`,
])
wrangler(statements.join('; '))
console.log(`cursor for ${kind} set to ${iso} (${target.slice(2)})`)
