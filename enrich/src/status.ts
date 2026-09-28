// GET /status: queue counts, spend, cursors, last tick, recent errors. Read-only.

import { budgetView, effectiveBudget, utcDay } from './budget.ts'
import { getStates, hasBackfill } from './db.ts'
import type { Config } from './env.ts'

/** Constant-time comparison of two strings (the bearer token). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export function bearerOk(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match !== null && safeEqual(match[1], secret)
}

export async function buildStatus(db: D1Database, cfg: Config, now: number): Promise<Record<string, unknown>> {
  const day = utcDay(now)
  const { mode: budgetMode, budget } = effectiveBudget(await hasBackfill(db), cfg.dailyBudget, cfg.steadyBudget)
  const [byStatus, byOutcome, spendToday, spendRecent, states, errors, quarantined, ready] = await Promise.all([
    db.prepare('SELECT task, status, COUNT(*) AS n FROM queue GROUP BY task, status').all<{ task: string; status: string; n: number }>(),
    db.prepare("SELECT task, outcome, COUNT(*) AS n FROM queue WHERE status = 'done' GROUP BY task, outcome").all<{ task: string; outcome: string | null; n: number }>(),
    db.prepare('SELECT COALESCE(SUM(neurons), 0) AS neurons, COALESCE(SUM(calls), 0) AS calls FROM spend WHERE day = ?').bind(day).first<{ neurons: number; calls: number }>(),
    db.prepare('SELECT day, model, neurons, calls, in_tokens, out_tokens FROM spend ORDER BY day DESC, model LIMIT 20').all(),
    getStates(db, '%'),
    db.prepare('SELECT ts, rid, task, kind, message FROM errors ORDER BY id DESC LIMIT 10').all<{ ts: number; rid: string | null; task: string | null; kind: string; message: string }>(),
    db.prepare("SELECT rid, task, attempts, model, last_error FROM queue WHERE status = 'quarantined' ORDER BY updated_at DESC LIMIT 5").all(),
    db.prepare("SELECT COUNT(*) AS n FROM queue WHERE status = 'done' AND outcome IN ('dry', 'unwritten')").first<{ n: number }>(),
  ])

  const counts: Record<string, Record<string, number>> = {}
  for (const r of byStatus.results) (counts[r.task] ??= {})[r.status] = r.n
  const outcomes: Record<string, Record<string, number>> = {}
  for (const r of byOutcome.results) (outcomes[r.task] ??= {})[r.outcome ?? 'none'] = r.n

  const cursors: Record<string, string> = {}
  let lastTick: unknown = null
  const other: Record<string, string> = {}
  for (const [key, value] of Object.entries(states)) {
    if (key.startsWith('cursor:')) cursors[key.slice('cursor:'.length)] = value
    else if (key === 'last_tick') {
      try {
        lastTick = JSON.parse(value)
      } catch {
        lastTick = value
      }
    } else other[key] = value
  }
  for (const key of ['kb_backoff_until', 'ai_pause_until']) {
    if (other[key]) other[key] = `${new Date(Number(other[key])).toISOString()}${Number(other[key]) > now ? ' (active)' : ' (past)'}`
  }

  return {
    now: new Date(now).toISOString(),
    mode: cfg.live ? 'live' : 'dry',
    models: { primary: cfg.primaryModel, escalation: cfg.escalationModel },
    batchSize: cfg.batchSize,
    queue: counts,
    doneOutcomes: outcomes,
    readyToWrite: ready?.n ?? 0,
    budget: { mode: budgetMode, effective: budget, backfill: cfg.dailyBudget, steady: cfg.steadyBudget },
    spendToday: { day, ...budgetView(spendToday?.neurons ?? 0, budget), calls: spendToday?.calls ?? 0 },
    spendRecent: spendRecent.results,
    cursors,
    state: other,
    lastTick,
    lastErrors: errors.results.map((e) => ({ ...e, at: new Date(e.ts).toISOString() })),
    quarantinedSample: quarantined.results,
  }
}
