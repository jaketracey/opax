import { questionHash, type AgenticPayload } from './agentic-ask'
import type { ResearchError } from './research-types'

/** Existing Workers observability sink; never log source text, args or errors. */
export async function recordResearchFailure(question: string, failure: ResearchError): Promise<void> {
  console.log(JSON.stringify({ kind: 'research_loop_fallback', question_hash: await questionHash(question), reason: failure.reason,
    rounds: failure.stats.rounds, tokens: failure.stats.tokens, cost_usd: failure.stats.costUsd ?? null }))
}
const selectedFacts = (run: AgenticPayload) => run.facts.filter(f => (run.chosen_facts ?? [...run.answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))).includes(f.id))
const stats = (run: AgenticPayload) => ({
  steps: run.steps.map(s => s.tool), chosen_facts: selectedFacts(run).map(f => f.id), rounds: run.research?.rounds ?? 1,
  ms: run.timings.total_ms, tokens: run.tokens, cost_usd: run.cost_usd, mode: run.research?.mode ?? 'planner', failure: run.research_failure ?? null,
})
export async function recordResearchComparison(question: string, planner: AgenticPayload | undefined, served: Record<string, unknown>, loop: AgenticPayload): Promise<void> {
  const servedSources = Array.isArray(served.sources) ? served.sources as Record<string, unknown>[] : []
  const plannerFacts = planner ? selectedFacts(planner).map(f => `${f.url}\n${f.text}`) : servedSources.filter(s => s.cited).map(s => `${s.href ?? s.url}\n${s.snippet}`)
  const loopFacts = loop.qualitative ? loop.qualitative.sources.map(s => `${s.url}\n${s.snippet}`) : selectedFacts(loop).map(f => `${f.url}\n${f.text}`)
  const same = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && JSON.stringify(a.sort()) === JSON.stringify(b.sort())
  const figures = (run: AgenticPayload) => selectedFacts(run).flatMap(f => f.text.match(/\d+(?:[,.]\d+)*/g) ?? []).sort()
  const plannerStats = planner ? stats(planner) : { steps: [], chosen_facts: [], rounds: null, ms: null, tokens: null, cost_usd: null, mode: 'planner', failure: null }
  console.log(JSON.stringify({ kind: 'research_loop_shadow', question_hash: await questionHash(question), planner: plannerStats, loop: stats(loop),
    agreement: { facts: same(plannerFacts, loopFacts), figures: planner && !loop.qualitative ? same(figures(planner), figures(loop)) : null } }))
}
