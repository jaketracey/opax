export interface ResearchReservation { settle: (actualUsd?: number) => Promise<void> }
export interface ResearchDailyBudget {
  reserve: (maxUsd: number) => Promise<ResearchReservation | null>
  available: (maxUsd: number) => Promise<boolean>
}
export const researchReservationUsd = (tokens: number, inputPrice = 1, outputPrice = 3) => tokens * Math.max(10, inputPrice, outputPrice) / 1e6
/** One model call's ceiling: its reserved input and output at the configured prices, doubled for safety.
 *  Reserving the whole remaining request budget per turn charged ~US$1 per timed-out turn and exhausted the daily cap. */
export const researchTurnReservationUsd = (inputTokens: number, outputTokens: number, inputPrice = 1, outputPrice = 3) =>
  2 * (inputTokens * Math.max(inputPrice, 0.1) + outputTokens * Math.max(outputPrice, 0.3)) / 1e6
/** Operator eval requests: per-request caps still apply, but they never draw on the shared production ledger. */
export const unmeteredResearchBudget: ResearchDailyBudget = { reserve: async () => ({ settle: async () => {} }), available: async () => true }
const micros = (value: number) => Math.ceil(value * 1_000_000)

/** One atomic primary write admits each turn across all isolates/locations.
 * Charge the ceiling first, then refund only a known lower cost. A crash,
 * abort, or unavailable settlement keeps the conservative ceiling charged. */
export function researchDailyBudget(db: D1Database, configuredCap?: string, now: () => number = Date.now): ResearchDailyBudget {
  return dailyLedger(db, 'research_daily_spend', configuredCap, 5, now)
}

/** Every paid model call on any path (Ask, the research loop, follow-ups, summaries, stories, overviews)
 * against one daily total, ASK_DAILY_USD (migration 0020). The same atomic pattern as the research ledger. */
export const DEFAULT_ASK_DAILY_USD = 30
export function askDailyBudget(db: D1Database, configuredCap?: string, now: () => number = Date.now): ResearchDailyBudget {
  return dailyLedger(db, 'ask_daily_spend', configuredCap, DEFAULT_ASK_DAILY_USD, now)
}

/** Both ledgers at once: the research loop keeps its own cap and also draws on the day's total.
 * A refusal or failure on the second refunds the first, so neither keeps a charge for a call that never ran. */
export function combinedDailyBudget(...budgets: ResearchDailyBudget[]): ResearchDailyBudget {
  return {
    async available(maxUsd) {
      for (const budget of budgets) if (!await budget.available(maxUsd)) return false
      return true
    },
    async reserve(maxUsd) {
      const held: ResearchReservation[] = []
      try {
        for (const budget of budgets) {
          const reservation = await budget.reserve(maxUsd)
          if (!reservation) { await Promise.allSettled(held.map(r => r.settle(0))); return null }
          held.push(reservation)
        }
      } catch (error) { await Promise.allSettled(held.map(r => r.settle(0))); throw error }
      return { async settle(actualUsd) { await Promise.all(held.map(r => r.settle(actualUsd))) } }
    },
  }
}

type LedgerTable = 'research_daily_spend' | 'ask_daily_spend'
function dailyLedger(db: D1Database, table: LedgerTable, configuredCap: string | undefined, defaultCap: number, now: () => number): ResearchDailyBudget {
  const cap = configuredCap === undefined ? defaultCap : Number(configuredCap)
  const capMicros = Number.isFinite(cap) && cap >= 0 && Number.isSafeInteger(Math.floor(cap * 1_000_000)) ? Math.floor(cap * 1_000_000) : 0
  return {
    async available(maxUsd) {
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || !Number.isSafeInteger(micros(maxUsd))) return false
      const day = new Date(now()).toISOString().slice(0, 10)
      const row = await db.prepare(`SELECT CASE WHEN COALESCE((SELECT charged_microusd FROM ${table}
        WHERE utc_day = ?), 0) + ? <= ? THEN 1 ELSE 0 END AS allowed`).bind(day, micros(maxUsd), capMicros).first<{ allowed: number }>()
      return row?.allowed === 1
    },
    async reserve(maxUsd) {
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || !Number.isSafeInteger(micros(maxUsd))) throw new Error('research budget unavailable')
      const amount = micros(maxUsd), day = new Date(now()).toISOString().slice(0, 10)
      // INSERT...SELECT WHERE also gates the first request of a new UTC day.
      const admitted = await db.prepare(`INSERT INTO ${table} (utc_day, charged_microusd)
        SELECT ?, ? WHERE ? <= ?
        ON CONFLICT(utc_day) DO UPDATE SET charged_microusd = charged_microusd + excluded.charged_microusd
        WHERE charged_microusd + excluded.charged_microusd <= ?
        RETURNING utc_day`).bind(day, amount, amount, capMicros, capMicros).first<{ utc_day: string }>()
      if (!admitted) return null
      let settled = false
      return { async settle(actualUsd) {
        if (settled) return
        settled = true
        const actual = actualUsd !== undefined && Number.isFinite(actualUsd) && actualUsd >= 0 ? micros(actualUsd) : amount
        const delta = actual - amount
        if (!delta) return
        const result = await db.prepare(`UPDATE ${table} SET charged_microusd = charged_microusd + ? WHERE utc_day = ?`).bind(delta, day).run()
        if (!result.success) throw new Error('research budget settlement unavailable')
      } }
    },
  }
}
