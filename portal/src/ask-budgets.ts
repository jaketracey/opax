/** Request ceilings shared by research, orchestration and answer writing. Awaited I/O is wall time, not CPU time. */
export const ASK_HARD_WALL_MS = 60_000
export const ASK_ANSWER_TARGET_MS = 30_000
export const ASK_MAX_TOOL_CALLS = 16
export const ASK_MAX_ROUNDS = 8
export const ASK_MAX_MODEL_USD = 0.25
/** Keep a conservative allowance for the legacy answer path when research cannot return checked evidence. */
export const ASK_FALLBACK_RESERVE_USD = 0.05
export const ASK_DEFAULT_TOKENS = 96_000
export const ASK_MAX_TOKENS = 160_000
export const ASK_TURN_OUTPUT_TOKENS = 1_800
export const ASK_RESULT_BYTES = 16_384
export const ASK_TOOL_WALL_MS = 20_000
export const ASK_WRITING_RESERVE_MS = 4_000

/** Unknown billing keeps the reserved ceiling charged against this question as well as the daily ledger. */
export async function reserveQuestionTurn(
  stats: { reservedCostUsd?: number }, amount: number,
  budget: import('./research-budget').ResearchDailyBudget,
): Promise<import('./research-budget').ResearchReservation | null> {
  if (!Number.isFinite(amount) || amount <= 0 || (stats.reservedCostUsd ?? 0) + amount > ASK_MAX_MODEL_USD) throw new Error('question_spend')
  const reservation = await budget.reserve(amount)
  if (!reservation) return null
  stats.reservedCostUsd = (stats.reservedCostUsd ?? 0) + amount
  let settled = false
  return { async settle(actual) {
    if (settled) return
    settled = true
    await reservation.settle(actual)
    if (actual !== undefined && Number.isFinite(actual) && actual >= 0) stats.reservedCostUsd = Math.max(0, (stats.reservedCostUsd ?? 0) - amount + actual)
  } }
}
