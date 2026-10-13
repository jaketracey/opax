export interface ResearchReservation { settle: (actualUsd?: number) => Promise<void> }
export interface ResearchDailyBudget {
  reserve: (maxUsd: number) => Promise<ResearchReservation | null>
  available: (maxUsd: number) => Promise<boolean>
}
export const researchReservationUsd = (tokens: number, inputPrice = 1, outputPrice = 3) => tokens * Math.max(10, inputPrice, outputPrice) / 1e6
const micros = (value: number) => Math.ceil(value * 1_000_000)

/** One atomic primary write admits each turn across all isolates/locations.
 * Charge the ceiling first, then refund only a known lower cost. A crash,
 * abort, or unavailable settlement keeps the conservative ceiling charged. */
export function researchDailyBudget(db: D1Database, configuredCap?: string, now: () => number = Date.now): ResearchDailyBudget {
  const cap = configuredCap === undefined ? 5 : Number(configuredCap)
  const capMicros = Number.isFinite(cap) && cap >= 0 && Number.isSafeInteger(Math.floor(cap * 1_000_000)) ? Math.floor(cap * 1_000_000) : 0
  return {
    async available(maxUsd) {
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || !Number.isSafeInteger(micros(maxUsd))) return false
      const day = new Date(now()).toISOString().slice(0, 10)
      const row = await db.prepare(`SELECT CASE WHEN COALESCE((SELECT charged_microusd FROM research_daily_spend
        WHERE utc_day = ?), 0) + ? <= ? THEN 1 ELSE 0 END AS allowed`).bind(day, micros(maxUsd), capMicros).first<{ allowed: number }>()
      return row?.allowed === 1
    },
    async reserve(maxUsd) {
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || !Number.isSafeInteger(micros(maxUsd))) throw new Error('research budget unavailable')
      const amount = micros(maxUsd), day = new Date(now()).toISOString().slice(0, 10)
      // INSERT...SELECT WHERE also gates the first request of a new UTC day.
      const admitted = await db.prepare(`INSERT INTO research_daily_spend (utc_day, charged_microusd)
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
        const result = await db.prepare('UPDATE research_daily_spend SET charged_microusd = charged_microusd + ? WHERE utc_day = ?').bind(delta, day).run()
        if (!result.success) throw new Error('research budget settlement unavailable')
      } }
    },
  }
}
