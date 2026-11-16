import type { ClaimAtom } from './research-claims'
import type { PlanStep, Period, NamedScope, Fact, Progress } from './agentic-ask'
import type { ToolDeps, ToolResult } from './agentic-tools'
export interface RemunerationRecord {
  record_id: string; name: string; body: string; position: string; year: string; total: number | null
  rank?: number; ranking_year?: string; historical?: boolean; latest_complete?: boolean
  components?: Record<string, number | null>; checks?: string[]
}

/** One disclosed receipt as the tool holds it, so no reader of it has to parse the fact's wording. */
export interface ReceiptFact {
  party: string; source: string; amount: number; period: string; jurisdiction?: string
  /** The AEC register line when the source is an associated entity of this party; shown with its name. */
  measure?: string; measure_label?: string
  associated?: string
  /** The row's own industry, and the filter the tool ran with: a filtered list cannot answer an unfiltered question. */
  industry?: string; filter?: string
  /** A sum across many sources, not one source's receipts. */
  aggregate?: boolean
  /** A labelled line beside a ranking (receipts the AEC does not class as donations, or public
   *  funding), in its own words. Never ranked and never called a donation. */
  aside?: string
}
export interface ResearchPayload {
  reserved_cost_usd?: number
  /** Hearing transcript excerpts a stopped run held, for the code-quoted fallback; taken off before a reply is sent. */
  held_transcripts?: { text: string; url: string }[]
  /** Hearing excerpts handed to the writer: how many, how many carry a label the research model gave that was kept,
   * and whether its answer call sent labels at all. For reports; not shown to readers. */
  excerpt_labels?: { held: number; labelled: number; sent: boolean }
  mode: 'loop' | 'planner' | 'hearing_fallback'
  rounds: number
  trail: { id: number; tool: string; round: number; label: string; arg?: string; results?: number; ms: number; ok: boolean }[]
  sources: { title: string; url: string; date?: string; kind: string; speaker?: string }[]
  pre_writer_sources?: QualitativeAnswer['sources']
  /** Present, and true, only when the run was made with the transcript quotes-only switch on (ask-flags.ts). For reports; not shown to readers. */
  transcript_quotes_only?: boolean
  ms?: number
  tokens?: { input: number; output: number } | null
  cost_usd?: number | null
  failure?: ResearchStop
  turns?: ResearchTurn[]
  cached_input_by_turn?: (number | null)[]
  answer_stats?: AnswerTally
}
export interface ResearchTurn { round: number; input: number | null; output: number | null; cached_input: number | null; input_reserve: number; ms: number; cost_usd: number | null; provider?: string; reasoning?: number | null; cached?: number | null }
export interface Passage {
  id: string; resource: string; slug: string; title: string; text: string; url: string
  date?: string; speaker?: string; kind: string
  /** The speaker's party on the day, from the original record. */
  party?: string
  /** The chamber the original record names (a corpus key such as senate, representatives or nsw_lc). */
  chamber?: string
  /** The search query that found it. */
  query?: string
}
/** `preserve` is the conservative migration decision for a figure-free legacy draft. */
export type AnswerDecision = 'answer' | 'limitation' | 'clarification' | 'refusal' | 'preserve'
export type AnswerPreview = (payload: QualitativeAnswer, accept?: (checked:QualitativeAnswer)=>boolean) => Promise<QualitativeAnswer | void>
export interface QualitativeAnswer {
  /** Internal, from the research loop to the writer: what each selected record fact is for, by fact id. Removed
   * before the answer leaves agentic-ask; never in a response. */
  fact_notes?: Record<string, string>
  answer: string
  /** Source limitations belong beside the answer, without occupying its citation ranges. */
  coverage?: { note?: string; [key: string]: unknown }
  answer_decision?: AnswerDecision
  /** Resolved question constraints survive writing and cached response boundaries. */
  answer_scope?: Partial<import('./ask-constraints').AskConstraints> & {entity_type?:string}
  citations: Record<string, [number, number][]>
  sources: { resource: string; slug: string; title: string; href: string; url: string; snippet: string; cited: boolean; date?: string; speaker?: string; chamber?: string; kind: string; remuneration?: RemunerationRecord; claim_atoms?: (ClaimAtom & {periodEvidenceId?:string})[]; receipt?: ReceiptFact; coverage?: boolean; entities?: string[]; member?: import('./ask-member-label').CountedMember }[]
  /** Some or all of the answer's points could not be matched to a passage and carry no citation. */
  answer_status?: 'uncited' | 'partly_cited'
  /** Whether a language model wrote the answer text a reader sees: true for a writer's or the loop's own words, false
   * for record facts, passages and fixed wording. Unset where a step does not know. The web labels from it. */
  machine_written?: boolean
  coherence?: { fallback?: boolean; method?: string; stripped_ratio?: number }
}
export interface ResearchContext {
  selectionWallMs?: number
  constraints?: import('./ask-constraints').AskConstraints
  deps: ToolDeps
  period: Period
  named: NamedScope
  signal: AbortSignal
  progress: Progress
  scope: (step: PlanStep) => PlanStep
  execute: (step: PlanStep, round: number, custom?: (deps: ToolDeps) => Promise<ToolResult>, signal?: AbortSignal) => Promise<ToolResult>
}
export interface ResearchResult {
  heldTranscripts?: { text: string; url: string }[]
  reservedCostUsd?: number
  constraints?: import('./ask-constraints').AskConstraints
  steps: PlanStep[]
  results: ToolResult[]
  selected: number[]
  rounds: number
  tokens: { input: number; output: number }
  costUsd?: number
  qualitative?: QualitativeAnswer
  points?: QualitativeAnswer
  turns?: ResearchTurn[]
  /** Points in, kept, repaired and dropped (labels and counts only) for the final answer attempt. */
  answer?: AnswerTally
}
export type Research = ((question: string, context: ResearchContext) => Promise<ResearchResult>) & {
  write?: ReturnType<typeof import('./research-writer').createAnswerWriter>
  writingWallMs?: number
  /** The transcript quotes-only switch was on when this research was built (ask-flags.ts). */
  transcriptQuotesOnly?: boolean
}
import type { AnswerTally } from './research-evidence'
export interface ResearchStats {
  /** Hearing transcript excerpts the run held when it stopped (citation text and link), for the code-quoted fallback. */
  heldTranscripts?: { text: string; url: string }[];
  reservedCostUsd?: number; coherence?: {writer_passes?:number;second_passes?:number;fallback?:boolean;fallback_reason?:string;left_out?:Record<string,number>}; answer?: AnswerTally; rounds: number; tokens: { input: number; output: number }; costUsd?: number; usageUnknown?: boolean; turns?: ResearchTurn[]; cachedByTurn?: (number | null)[]; rejections?: string[] }
export type ResearchStop = 'error' | 'timeout' | 'steps' | 'tokens' | 'limiter' | 'aborted' | 'malformed_args' | 'grounding' | 'no_supported_claim' | 'no_finish' | 'missing_key' | 'result_size' | 'daily_budget' | 'daily_budget_unavailable' | 'research_credit_exhausted' | 'spend' | 'provider_refused'
export class ResearchError extends Error {
  constructor(readonly reason: ResearchStop, readonly stats: ResearchStats = { rounds: 0, tokens: { input: 0, output: 0 } }) {
    super('Research loop stopped: ' + reason)
  }
}
export const researchSources = (facts: Fact[]): ResearchPayload['sources'] => [...new Map(facts.map(f => [f.cite.url, { title: f.cite.label, url: f.cite.url, kind: f.cite.kind }])).values()]
