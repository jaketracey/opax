// Neuron accounting and the daily budget guard.
//
// Workers AI bills in neurons; the free allocation is 10,000 a day, paid usage
// beyond it is $0.011 per 1,000. The platform reports `usage.neurons` on every
// chat-completion response, and that figure is what we book. The price table
// below (neurons per million tokens, from
// https://developers.cloudflare.com/workers-ai/platform/pricing/, checked
// 2026-09-28) is the fallback when a model does not report it, and a cross-check
// in the tests. Unknown models are priced at the dearest tier so the guard errs
// on the safe side.

import type { ModelUsage } from './extract.ts'

export interface Price {
  /** neurons per million input tokens */
  input: number
  /** neurons per million output tokens */
  output: number
}

export const NEURON_PRICES: Record<string, Price> = {
  '@cf/qwen/qwen3-30b-a3b-fp8': { input: 4625, output: 30475 },
  '@cf/qwen/qwen3.8-27b': { input: 40909, output: 290909 },
  '@cf/openai/gpt-oss-120b': { input: 31818, output: 68182 },
  '@cf/openai/gpt-oss-20b': { input: 18182, output: 27273 },
  '@cf/zai-org/glm-4.7-flash': { input: 5500, output: 36400 },
  '@cf/zai-org/glm-5.2': { input: 127273, output: 400000 },
  '@cf/zai-org/glm-5.3': { input: 127273, output: 400000 },
  '@cf/zai-org/glm-5.3-flash': { input: 13636, output: 45455 },
  '@cf/google/gemma-4-26b-a4b-it': { input: 9091, output: 27273 },
  '@cf/google/gemma-3-12b-it': { input: 31371, output: 50560 },
  '@cf/ibm-granite/granite-4.0-h-micro': { input: 1542, output: 10158 },
  '@cf/nvidia/nemotron-3-120b-a12b': { input: 45455, output: 136364 },
  '@cf/moonshotai/kimi-k2.5': { input: 54545, output: 272727 },
  '@cf/moonshotai/kimi-k2.6': { input: 86364, output: 363636 },
  '@cf/deepseek-ai/deepseek-v4-flash-0731': { input: 40000, output: 120000 },
  '@cf/deepseek-ai/deepseek-v4-pro-0813': { input: 120000, output: 360000 },
  '@cf/meta/llama-3.2-1b-instruct': { input: 2457, output: 18252 },
  '@cf/meta/llama-3.2-3b-instruct': { input: 4625, output: 30475 },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { input: 4119, output: 34868 },
  '@cf/meta/llama-3.1-8b-instruct-fp8': { input: 13778, output: 26128 },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { input: 26668, output: 204805 },
  '@cf/meta/llama-4-scout-17b-16e-instruct': { input: 24545, output: 77273 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { input: 31876, output: 50488 },
  '@cf/aisingapore/gemma-sea-lion-v4-27b-it': { input: 31876, output: 50488 },
}

/** Unknown model: price it like the dearest listed tier rather than as free. */
export const FALLBACK_PRICE: Price = { input: 127273, output: 400000 }

export const DEFAULT_DAILY_BUDGET = 400_000
/** The ceiling once the backfill is drained: about $1.65 a day; real steady-state use is far lower. */
export const DEFAULT_STEADY_BUDGET = 150_000

export type BudgetMode = 'backfill' | 'steady'

/** DAILY_NEURON_BUDGET while low-priority backfill rows remain; STEADY_NEURON_BUDGET once none do. */
export function effectiveBudget(hasBackfill: boolean, daily: number, steady: number): { mode: BudgetMode; budget: number } {
  return hasBackfill ? { mode: 'backfill', budget: daily } : { mode: 'steady', budget: steady }
}

export type NeuronSource = 'reported' | 'computed' | 'estimated'

export interface NeuronCost {
  neurons: number
  source: NeuronSource
}

export const priceFor = (model: string): Price => NEURON_PRICES[model] ?? FALLBACK_PRICE

/**
 * Neurons for one model call. Prefers the platform's own `usage.neurons`;
 * otherwise tokens x the price table; otherwise a character-count estimate
 * (about 3.5 characters a token) so a response with no usage block still
 * counts against the budget.
 */
export function neuronsFor(model: string, usage: ModelUsage, promptChars = 0, completionChars = 0): NeuronCost {
  if (usage.neurons !== null && usage.neurons >= 0) return { neurons: usage.neurons, source: 'reported' }
  const price = priceFor(model)
  if (usage.promptTokens !== null || usage.completionTokens !== null) {
    const neurons = ((usage.promptTokens ?? 0) * price.input + (usage.completionTokens ?? 0) * price.output) / 1_000_000
    return { neurons, source: 'computed' }
  }
  const neurons = ((promptChars / 3.5) * price.input + (completionChars / 3.5) * price.output) / 1_000_000
  return { neurons, source: 'estimated' }
}

export function parseBudget(value: string | undefined | null, fallback = DEFAULT_DAILY_BUDGET): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export interface BudgetView {
  spent: number
  budget: number
  remaining: number
  exhausted: boolean
}

/** Whether the day's budget still allows starting work. */
export function budgetView(spent: number, budget: number): BudgetView {
  return { spent, budget, remaining: Math.max(0, budget - spent), exhausted: spent >= budget }
}

/** The UTC calendar day, the key of the `spend` table. */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Start of the next UTC day, when the free allocation resets. */
export const nextUtcMidnight = (ms: number): number => {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}
