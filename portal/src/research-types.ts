import type { PlanStep, Period, NamedScope, Fact, Progress } from './agentic-ask'
import type { ToolDeps, ToolResult } from './agentic-tools'

export interface ResearchPayload {
  mode: 'loop' | 'planner'
  rounds: number
  trail: { id: number; tool: string; round: number; label: string; arg?: string; results?: number; ms: number; ok: boolean }[]
  sources: { title: string; url: string; date?: string; kind: string; speaker?: string }[]
  ms?: number
  tokens?: { input: number; output: number } | null
  cost_usd?: number | null
  failure?: ResearchStop
  turns?: ResearchTurn[]
  cached_input_by_turn?: (number | null)[]
}
export interface ResearchTurn { round: number; input: number | null; output: number | null; cached_input: number | null; input_reserve: number; ms: number; cost_usd: number | null; provider?: string; reasoning?: number | null; cached?: number | null }
export interface Passage {
  id: string; resource: string; slug: string; title: string; text: string; url: string
  date?: string; speaker?: string; kind: string
}
export interface QualitativeAnswer {
  answer: string
  citations: Record<string, [number, number][]>
  sources: { resource: string; slug: string; title: string; href: string; url: string; snippet: string; cited: boolean; date?: string; speaker?: string; kind: string }[]
}
export interface ResearchContext {
  deps: ToolDeps
  period: Period
  named: NamedScope
  signal: AbortSignal
  progress: Progress
  scope: (step: PlanStep) => PlanStep
  execute: (step: PlanStep, round: number, custom?: (deps: ToolDeps) => Promise<ToolResult>, signal?: AbortSignal) => Promise<ToolResult>
}
export interface ResearchResult {
  steps: PlanStep[]
  results: ToolResult[]
  selected: number[]
  rounds: number
  tokens: { input: number; output: number }
  costUsd?: number
  qualitative?: QualitativeAnswer
  turns?: ResearchTurn[]
}
export type Research = (question: string, context: ResearchContext) => Promise<ResearchResult>
export interface ResearchStats { rounds: number; tokens: { input: number; output: number }; costUsd?: number; usageUnknown?: boolean; turns?: ResearchTurn[]; cachedByTurn?: (number | null)[] }
export type ResearchStop = 'error' | 'timeout' | 'steps' | 'tokens' | 'limiter' | 'aborted' | 'malformed_args' | 'grounding' | 'no_supported_claim' | 'no_finish' | 'missing_key' | 'result_size' | 'daily_budget' | 'daily_budget_unavailable' | 'research_credit_exhausted'
export class ResearchError extends Error {
  constructor(readonly reason: ResearchStop, readonly stats: ResearchStats = { rounds: 0, tokens: { input: 0, output: 0 } }) {
    super('Research loop stopped: ' + reason)
  }
}
export const researchSources = (facts: Fact[]): ResearchPayload['sources'] => [...new Map(facts.map(f => [f.cite.url, { title: f.cite.label, url: f.cite.url, kind: f.cite.kind }])).values()]
