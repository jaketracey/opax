import type { ToolEnv } from './tools/types'
export type Json = Record<string, unknown>
export interface ToolDeps {
  /** Public bindings for registry handlers, including future D1 data tools. */
  toolEnv?: ToolEnv
  /** POST (body) or GET a KB path; resolves parsed JSON or throws. */
  kb: (path: string, body?: unknown) => Promise<Json>
  /** Read a public asset (e.g. /graph/money.json); resolves parsed JSON or null. */
  asset: (path: string) => Promise<unknown>
  origin?: string
  signal?: AbortSignal
  withSignal?: (signal: AbortSignal) => Pick<ToolDeps, 'kb' | 'asset'>
}
export interface Cite { kind: 'count' | 'record' | 'export' | 'person' | 'speech'; label: string; url: string; value?: number | string; related?: RelatedCite[] }
export interface ToolResult { coverage?: import('./ask-constraints').Coverage; tool: string; ok: boolean; error?: string; data?: Json; cite: Cite[]; query?: unknown; notes: string[]; ms?: number
  /** A page listing the whole selection this result counted or ranked (not one of its rows): the coverage row opens it. */
  list?: string }
/** A counted fact's own records, each with its own page, shown as source rows beside the fact. */
export interface RelatedCite { label: string; url: string }

export interface ToolSpec { name: string; description: string; input: Json; run: (deps: ToolDeps, args: Json) => Promise<ToolResult> }
