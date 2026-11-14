import { questionHash, type AgenticPayload } from './agentic-ask'

/** Allowlist only. Never persist questions, answers, args, labels or exceptions. */
export async function recordAgenticRun(db: D1Database, question: string, run: Pick<AgenticPayload, 'shape' | 'timings' | 'cost_usd'>): Promise<void> {
  const shape = ['ranking', 'trend', 'comparison', 'money'].includes(String(run.shape)) ? run.shape : null
  await db.prepare('INSERT INTO agentic_shadow (question_hash, shape, latency_ms, cost_usd) VALUES (?, ?, ?, ?)')
    .bind(await questionHash(question), shape, Math.max(0, Math.round(run.timings.total_ms)), run.cost_usd).run()
}

/** One extra Ask model call outside the research turns (the opening line), under its own label. The same allowlist:
 *  a question hash, a fixed label, a latency and a cost; never question, line or answer text. */
export async function recordAskCallCost(db: D1Database, question: string, label: string, latencyMs: number, costUsd: number | null): Promise<void> {
  await db.prepare('INSERT INTO ask_call_costs (question_hash, label, latency_ms, cost_usd) VALUES (?, ?, ?, ?)')
    .bind(await questionHash(question), label, Math.max(0, Math.round(latencyMs)), costUsd).run()
}
