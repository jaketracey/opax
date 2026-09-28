// Bindings, secrets and vars, and the parsed configuration a tick runs with.

import { DEFAULT_DAILY_BUDGET, parseBudget } from './budget.ts'

/** The slice of the Workers AI binding this Worker uses (the real binding, or a test double). */
export interface AiLike {
  run(model: string, body: Record<string, unknown>): Promise<unknown>
}

export interface Env {
  AI: Ai
  DB: D1Database
  // Secrets: wrangler secret put ARAG_KB_ID / ARAG_KB_TOKEN / ENRICH_ADMIN_TOKEN
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
  ENRICH_ADMIN_TOKEN: string
  // Vars
  ARAG_ZONE: string
  PRIMARY_MODEL?: string
  ESCALATION_MODEL?: string
  DAILY_NEURON_BUDGET?: string
  BATCH_SIZE?: string
  /** "live" writes to the knowledge box; anything else is a dry run (results recorded in D1 only). */
  WRITE_MODE?: string
  CONCURRENCY?: string
  MAX_TOKENS?: string
  /** ISO time discovery starts from when no cursor is stored. */
  DISCOVERY_START?: string
  DISCOVERY_MAX_PAGES?: string
  TICK_SOFT_MS?: string
}

export interface Config {
  primaryModel: string
  escalationModel: string
  dailyBudget: number
  batchSize: number
  live: boolean
  concurrency: number
  maxTokens: number
  discoveryStart: string
  discoveryMaxPages: number
  discoveryOverlapS: number
  discoveryMaxMs: number
  tickSoftMs: number
}

export const DEFAULT_PRIMARY_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8'
export const DEFAULT_ESCALATION_MODEL = '@cf/openai/gpt-oss-120b'
export const DEFAULT_DISCOVERY_START = '2026-09-20T00:00:00Z'

const clampInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && value !== undefined && value !== '' ? Math.min(max, Math.max(min, n)) : fallback
}

export function readConfig(env: Partial<Env>): Config {
  return {
    primaryModel: env.PRIMARY_MODEL || DEFAULT_PRIMARY_MODEL,
    escalationModel: env.ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    dailyBudget: parseBudget(env.DAILY_NEURON_BUDGET, DEFAULT_DAILY_BUDGET),
    // At most ~90 rids a claim: the claim UPDATE binds one parameter per rid and D1 allows 100.
    batchSize: clampInt(env.BATCH_SIZE, 30, 1, 90),
    // Workers hold at most six simultaneous outbound connections.
    concurrency: clampInt(env.CONCURRENCY, 6, 1, 6),
    maxTokens: clampInt(env.MAX_TOKENS, 1500, 200, 8000),
    // Only the exact string "live" ever writes to the box.
    live: env.WRITE_MODE === 'live',
    discoveryStart: new Date(env.DISCOVERY_START || DEFAULT_DISCOVERY_START).toISOString(),
    discoveryMaxPages: clampInt(env.DISCOVERY_MAX_PAGES, 6, 1, 40),
    discoveryOverlapS: 120,
    discoveryMaxMs: 20_000,
    tickSoftMs: clampInt(env.TICK_SOFT_MS, 45_000, 5_000, 600_000),
  }
}
