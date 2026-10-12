import type { z } from 'zod'

export type ToolArgs = Record<string, unknown>
export type ToolInputSchema = Exclude<Parameters<typeof z.fromJSONSchema>[0], boolean> & { type: 'object'; examples: ToolArgs[] }
/** Only public bindings/read adapters; generation credentials are not part of the tool interface. */
export type ToolEnv = Partial<Pick<Env, 'ASSETS' | 'TABLE_DB' | 'COMMUNITY_ORIGIN'>> & {
  origin?: string
  signal?: AbortSignal
  asset?: (path: string) => Promise<unknown>
}
export interface ToolCitation { text: string; url: string; value?: number | string; kind?: 'count' | 'record' | 'export' }
export interface StructuredToolResult {
  rows: unknown[]
  citations: ToolCitation[]
  notes: string[]
  error?: string
  [key: string]: unknown
}
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: ToolInputSchema
  stepLabel: (args: ToolArgs) => { label: string; arg?: string }
  handler: (env: ToolEnv, args: ToolArgs) => Promise<StructuredToolResult>
  /** Cross-field checks (e.g. min <= max), in addition to JSON Schema validation. */
  validate?: (args: ToolArgs) => boolean
  /** Temporary compatibility name for an existing Ask plan; never an extra MCP entry. */
  askName?: string
}
export class ToolInputError extends Error {
  readonly code = -32602
  constructor(name: string) { super('Invalid arguments for ' + name + '. See tools/list for the input schema.'); this.name = 'ToolInputError' }
}
export async function readToolAsset(env: ToolEnv, path: string): Promise<unknown> {
  env.signal?.throwIfAborted()
  if (env.asset) return env.asset(path)
  if (!env.ASSETS) throw new Error('Public assets are unavailable.')
  const url = new URL(path, env.origin ?? env.COMMUNITY_ORIGIN ?? 'https://opax.com.au')
  const response = await env.ASSETS.fetch(new Request(url, { signal: env.signal }))
  env.signal?.throwIfAborted()
  return response.ok ? response.json() : null
}
