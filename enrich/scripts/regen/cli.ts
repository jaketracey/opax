// 5b-cheap regeneration CLI. See scripts/regen/README.md. Tokens are read from local files and never printed.
//   node scripts/regen/cli.ts <command> --run <run-id> [options]     (flags are space-separated: --limit 50)
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Kb } from '../../src/kb.ts'
import { COMMANDS, parseArgs, REQUIRED } from './args.ts'
import { d1Rest, type MiniD1 } from './d1rest.ts'
import { acquireLock, headroomFrom, Ledger, StopRun, usdToNeurons, USD_PER_NEURON, utcDayOf, type Caps } from './guard.ts'
import { release, Runner, type AiPost } from './runner.ts'
import type { SliceName } from './slices.ts'
import * as store from './store.ts'

const HOME = homedir()
const STATE_DIR = process.env.REGEN_STATE_DIR ?? join(HOME, '.cache/opax/regen-5b-cheap')
const PATHS = {
  ledger: join(STATE_DIR, 'ledger.jsonl'),
  results: join(STATE_DIR, 'results.jsonl'),
  stop: join(STATE_DIR, 'STOP'),
  log: join(STATE_DIR, 'run.log'),
  account: join(STATE_DIR, 'account'),
  lock: join(STATE_DIR, 'LOCK'),
}
const D1_TOKEN_FILE = join(HOME, '.cache/opax/cf-deploy.token')
const KB_ENV_FILE = join(HOME, '.cache/opax/kb.env')
const WRANGLER_TOML = process.env.WRANGLER_CONFIG ?? join(HOME, 'Library/Preferences/.wrangler/config/default.toml')
const WRANGLER_BIN = process.env.WRANGLER_BIN ?? join(import.meta.dirname, '../../node_modules/.bin/wrangler')
const DAILY_BUDGET = 1_500_000

/** Commands that only read: everything else takes the single-runner lock. */
const READ_ONLY = new Set(['help', 'headroom', 'status'])

const log = (line: string): void => {
  const stamped = `${new Date().toISOString()} ${line}`
  console.log(stamped)
  appendFileSync(PATHS.log, stamped + '\n')
}

function accountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID ?? (existsSync(PATHS.account) ? readFileSync(PATHS.account, 'utf8').trim() : '')
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error(`no Cloudflare account id: set CLOUDFLARE_ACCOUNT_ID or write it to ${PATHS.account}`)
  return id
}

function d1(): MiniD1 {
  const wrangler = readFileSync(join(import.meta.dirname, '../../wrangler.jsonc'), 'utf8')
  const databaseId = /"database_id":\s*"([^"]+)"/.exec(wrangler)?.[1]
  if (!databaseId) throw new Error('database_id not found in enrich/wrangler.jsonc')
  return d1Rest({ accountId: accountId(), databaseId, token: readFileSync(D1_TOKEN_FILE, 'utf8').trim() })
}

function kb(): Kb {
  const env = Object.fromEntries(readFileSync(KB_ENV_FILE, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  return new Kb({ ARAG_ZONE: env.ARAG_ZONE, ARAG_KB_ID: env.ARAG_KB_ID, ARAG_KB_TOKEN: env.ARAG_KB_TOKEN })
}

/**
 * wrangler's existing OAuth login (the deploy token has no Workers AI scope). wrangler refreshes only an
 * EXPIRED token, so within 2 minutes of expiry: wait it out, then `wrangler whoami` refreshes it. A token that
 * still cannot be read stops the run (never a request with a token about to lapse, never a 401 loop).
 */
async function oauthToken(): Promise<string> {
  const read = () => {
    const toml = readFileSync(WRANGLER_TOML, 'utf8')
    return { token: /oauth_token\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? '', expires: Date.parse(/expiration_time\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? '') }
  }
  let t = read()
  if (t.token && t.expires - Date.now() > 2 * 60_000) return t.token
  const wait = t.expires - Date.now() + 5_000
  if (wait > 0 && wait < 3 * 60_000) await new Promise((r) => setTimeout(r, wait))
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CF_API_TOKEN
  spawnSync(WRANGLER_BIN, ['whoami'], { env, stdio: 'ignore', timeout: 60_000 })
  t = read()
  if (!t.token || !(t.expires - Date.now() > 2 * 60_000)) throw new StopRun('wrangler OAuth token missing or could not be refreshed (run `wrangler login`)')
  log('wrangler OAuth token refreshed')
  return t.token
}

function workersAi(): AiPost {
  const account = accountId()
  return {
    async post(model, body, gate) {
      let token: string
      try {
        token = await oauthToken() // may wait for the token to expire and refresh
      } catch (err) {
        // Nothing was sent: a stop, not an unanswered (possibly billed) request.
        throw err instanceof StopRun ? err : new StopRun(`could not read the wrangler OAuth token: ${String((err as Error)?.message ?? err).slice(0, 200)}`)
      }
      gate() // a stop or STOP file set during that wait: nothing is sent
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
      return { status: res.status, raw: await res.text() }
    },
  }
}

async function headroom(db: MiniD1): Promise<number> {
  const since = utcDayOf(Date.now() - 30 * 86_400_000)
  const days = await store.workerDays(db, since)
  const workerHeadroom = headroomFrom(days)
  log(`headroom: Worker peak day since ${since} = ${Math.round(Math.max(0, ...days.map((d) => Number(d.n))))} neurons; kept for it ${workerHeadroom}; ours at most ${DAILY_BUDGET - workerHeadroom} a day`)
  return workerHeadroom
}

async function caps(db: MiniD1, capUsd: number): Promise<Caps> {
  const runNeurons = usdToNeurons(capUsd) // throws unless 0 < cap <= 30
  return { runNeurons, dailyBudget: DAILY_BUDGET, workerHeadroom: await headroom(db) }
}

function rids(file: string): string[] {
  const raw = readFileSync(file, 'utf8').trim()
  const list: string[] = raw.startsWith('[') ? JSON.parse(raw) : raw.split(/\s+/)
  const out = [...new Set(list.map((r) => String(r).trim()).filter((r) => /^[0-9a-f]{32}$/.test(r)))]
  if (!out.length) throw new Error(`no rids in ${file}`)
  return out
}

async function status(db: MiniD1, runId: string): Promise<void> {
  const t = new Ledger(PATHS.ledger).totals()
  const today = utcDayOf(Date.now())
  const rows = await store.counts(db, runId)
  const by = (s: string) => rows.filter((r) => r.state === s).reduce((n, r) => n + Number(r.n), 0)
  log(`status ${runId}: ${today}: briefs done ${by('queued') + by('written')} (written ${by('written')}, awaiting the Worker ${by('queued')}), held ${by('held')}, pending ${by('pending')}, failed ${by('failed')}, skipped ${by('skipped')}, interrupted ${by('interrupted')}; US$${t.usd.toFixed(4)} actual, ${Math.round(t.neurons)} neurons (today ${Math.round(t.byDay[today] ?? 0)}), ${t.calls} calls, stops ${t.stops}${t.unsettled ? `, ${Math.round(t.unsettled)} neurons in open reservations` : ''}`)
  for (const r of rows) console.log(`  ${r.slice.padEnd(16)} ${r.state.padEnd(12)} ${String(r.n).padStart(7)}  ${r.neurons ?? 0} neurons`)
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2)) // throws on anything it does not recognise
  if (cmd === 'help') {
    for (const [name, spec] of Object.entries(COMMANDS)) {
      const need = new Set(REQUIRED[name] ?? [])
      console.log(`${name} ${Object.entries(spec).map(([f, k]) => (k === 'bool' ? `[--${f}]` : need.has(f) ? `--${f} <${k}>` : `[--${f} <${k}>]`)).join(' ')}`)
    }
    return
  }
  mkdirSync(STATE_DIR, { recursive: true })
  if (!READ_ONLY.has(cmd)) {
    const unlock = acquireLock(PATHS.lock, `${cmd} ${process.argv.slice(3).join(' ')}`)
    process.on('exit', unlock)
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.on(sig, () => {
        unlock()
        process.exit(128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 } as const)[sig])
      })
    }
  }
  const runId = String(flags.get('run') ?? '')
  const dryRun = flags.get('dry-run') === true
  const db = d1()

  if (cmd === 'init') {
    await store.init(db)
    log(`init: ${store.TABLE} ready`)
  } else if (cmd === 'headroom') {
    await headroom(db)
  } else if (cmd === 'seed') {
    const slice = flags.get('slice') as SliceName
    const variant = flags.get('variant') as 'b' | 'role'
    const list = rids(String(flags.get('rids')))
    const n = await store.seed(db, { runId, slice, variant, rids: list, now: Date.now() })
    log(`seed ${runId}: ${n} of ${list.length} rids snapshotted into ${slice} (${variant}); the rest were not finished Workers AI briefs or already seeded`)
  } else if (cmd === 'run') {
    if (existsSync(PATHS.stop)) throw new Error(`STOP file present (${PATHS.stop}): remove it to run`)
    const ledger = new Ledger(PATHS.ledger)
    const c = await caps(db, flags.get('cap-usd') as number)
    let cache = { day: '', at: 0, n: 0 }
    const runner = new Runner({
      db, kb: kb(), ai: workersAi(), ledger, resultsPath: PATHS.results, stopFile: PATHS.stop, caps: c,
      workerSpendToday: async (day) => {
        if (cache.day !== day || Date.now() - cache.at > 5 * 60_000) cache = { day, at: Date.now(), n: await store.workerSpendToday(db, day) }
        return cache.n
      },
      recordSpend: (s) => store.recordSpend(db, s),
      now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log,
    }, {
      runId, concurrency: (flags.get('concurrency') as number | undefined) ?? 2, limit: flags.get('limit') as number | undefined,
      compare: flags.get('compare') === true, waitForNextDay: flags.get('wait') === true,
    })
    log(`run ${runId}: start; ledger US$${ledger.totals().usd.toFixed(4)} so far; cap US$${(c.runNeurons * USD_PER_NEURON).toFixed(2)}; limit ${flags.get('limit') ?? 'none'}; concurrency ${(flags.get('concurrency') as number | undefined) ?? 2}; ${flags.get('compare') ? 'compare: every row held until release' : 'rows queued for the Worker as they finish'}`)
    const end = await runner.loop()
    log(`run ${runId}: ${end.end}${'reason' in end ? `: ${end.reason}` : ''}`)
    await status(db, runId)
    if (end.end === 'stopped') process.exitCode = 3
  } else if (cmd === 'status') {
    await status(db, runId)
  } else if (cmd === 'verify') {
    const n = await store.markWritten(db, runId, Date.now())
    const problems = await store.deliveryProblems(db, runId)
    log(`verify ${runId}: ${n} newly confirmed written by the Worker; ${problems.length} queued rows the Worker could not write`)
    for (const p of problems.slice(0, 20)) console.log(`  ${p.rid} ${p.status} ${p.outcome}: ${(p.last_error ?? '').slice(0, 160)}`)
    await status(db, runId)
  } else if (cmd === 'release') {
    const variant = flags.get('variant') as 'b' | 'role'
    for (const line of await release(db, runId, variant, Date.now(), dryRun)) log(`release${dryRun ? ' (dry run)' : ''} ${line}`)
  } else if (cmd === 'rollback') {
    // parseArgs has checked exactly one of --all, --slice, --rids
    let rows = await store.rowsIn(db, runId, ['queued', 'written'])
    if (flags.has('rids')) {
      const keep = new Set(String(flags.get('rids')).split(','))
      rows = rows.filter((r) => keep.has(r.rid))
    } else if (flags.has('slice')) rows = rows.filter((r) => r.slice === flags.get('slice'))
    if (flags.has('limit')) rows = rows.slice(0, flags.get('limit') as number)
    log(`rollback ${runId}${dryRun ? ' (DRY RUN: nothing is written)' : ''}: ${rows.length} rows`)
    let done = 0
    for (const r of rows) {
      const q = await store.queueRow(db, r.rid)
      const ours = (q?.result ?? '').trim() === (r.new_result ?? '').trim()
      const back = (q?.result ?? '').trim() === r.old_result.trim()
      console.log(`  ${r.rid} [${r.slice}/${r.state}] queue=${q?.status}/${q?.outcome} carries ${ours ? 'the new brief' : back ? 'the old brief (finishing an earlier rollback)' : 'something else (left alone)'}`)
      console.log(`    restore: ${r.old_result.slice(0, 140)}`)
      console.log(`    replace: ${(r.new_result ?? '').slice(0, 140)}`)
      if (!dryRun && (ours || (back && r.state !== 'rolled-back')) && (await store.rollbackRow(db, r.rid, Date.now()))) done += 1
    }
    if (!dryRun) log(`rollback ${runId}: ${done} rows handed back to the Worker with their old brief (forced); its next tick writes them`)
  }
}

main().catch((err) => {
  console.error(String((err as Error)?.message ?? err))
  process.exitCode = 1
})
