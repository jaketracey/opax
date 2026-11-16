import type { z } from 'zod'

export type ToolArgs = Record<string, unknown>
export type ToolInputSchema = Exclude<Parameters<typeof z.fromJSONSchema>[0], boolean> & { type: 'object'; examples: ToolArgs[] }
/** Only public bindings/read adapters; generation credentials are not part of the tool interface. */
export type ToolOutputSchema = Exclude<Parameters<typeof z.fromJSONSchema>[0], boolean> & { type: 'object' }
export type ToolEnv = Partial<Pick<Env, 'ASSETS' | 'TABLE_DB' | 'MEDIA' | 'COMMUNITY_ORIGIN' | 'VIC_ELECTION_HUB_ENABLED'>> & {
  origin?: string
  signal?: AbortSignal
  asset?: (path: string) => Promise<unknown>
  /** True when Ask is the caller (callTool's ask flag): wording that the public MCP output does not carry yet. */
  ask?: boolean
  /** Read-only reader of one published JSON object in the media bucket, by key; null when it is not there. */
  media?: (key: string) => Promise<unknown>
  /** The transcript quotes-only switch (ask-flags.ts) is on for this request. */
  transcriptQuotesOnly?: boolean
  /** Read-only KB adapter; credentials remain outside tool handlers. */
  kb?: (path: string, body?: unknown) => Promise<Record<string, unknown>>
}
export interface ToolCitation { remuneration?: import('../research-types').RemunerationRecord; text: string; url: string; value?: number | string; kind?: 'count' | 'record' | 'export'; related?: { label: string; url: string }[] }
export interface StructuredToolResult {
  rows: unknown[]
  citations: ToolCitation[]
  notes: string[]
  error?: string
  [key: string]: unknown
}
export interface ToolDefinition {
  name: string
  /** Human-readable name shown by MCP clients. */
  title?: string
  description: string
  inputSchema: ToolInputSchema
  /** Ask's input schema when it takes arguments the public MCP schema does not list yet. MCP reads inputSchema only. */
  askInputSchema?: ToolInputSchema
  /** JSON Schema of the structured result. A tool that declares it must always return a conforming result. */
  outputSchema?: ToolOutputSchema
  stepLabel: (args: ToolArgs) => { label: string; arg?: string }
  handler: (env: ToolEnv, args: ToolArgs) => Promise<StructuredToolResult>
  /** Cross-field checks (e.g. min <= max), in addition to JSON Schema validation. */
  validate?: (args: ToolArgs) => boolean
  /** Additional name/slug/ID selectors (conventional *_name, *_slug, *_id fields are automatic). */
  identifierFields?: readonly string[]
  /** Exact published-catalog membership, when the catalog is available. */
  validateKnown?: (env: ToolEnv, args: ToolArgs) => Promise<boolean>
  /** Preserve established Ask fact layouts while sharing public schemas and data. */
  askFactStyle?: 'legacy'
  /** Original verified excerpts are cited by passage IDs rather than record-fact IDs. */
  evidenceKind?: 'passages'
  /** Temporary compatibility name for an existing Ask plan; never an extra MCP entry. */
  askName?: string
  /** MCP and public JSON only: not offered to Ask's research loop (each Ask tool adds to every turn's reserved spend). */
  mcpOnly?: boolean
}
export class ToolInputError extends Error {
  readonly code = -32602
  constructor(name: string, message?: string) { super(message ?? 'Invalid arguments for ' + name + '. See tools/list for the input schema.'); this.name = 'ToolInputError' }
}
/** One published JSON object from the media bucket (R2), or null when it is absent or the bucket is not bound. */
export async function readToolMedia(env: ToolEnv, key: string): Promise<unknown> {
  env.signal?.throwIfAborted()
  if (env.media) return env.media(key)
  if (!env.MEDIA) return null
  const object = await env.MEDIA.get(key)
  env.signal?.throwIfAborted()
  return object ? object.json() : null
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
