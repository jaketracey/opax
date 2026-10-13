import { questionHash, type AgenticPayload } from './agentic-ask'

/** Allowlist only. Never persist questions, answers, args, labels or exceptions. */
export async function recordAgenticRun(db: D1Database, question: string, run: Pick<AgenticPayload, 'shape' | 'timings' | 'cost_usd'>): Promise<void> {
  const shape = ['ranking', 'trend', 'comparison', 'money'].includes(String(run.shape)) ? run.shape : null
  await db.prepare('INSERT INTO agentic_shadow (question_hash, shape, latency_ms, cost_usd) VALUES (?, ?, ?, ?)')
    .bind(await questionHash(question), shape, Math.max(0, Math.round(run.timings.total_ms)), run.cost_usd).run()
}
