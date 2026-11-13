/** Ask compatibility exports. Public data implementations and schemas live in the shared registry. */
import { askToolSpecs, getAskTool, validRegisteredArgs, TOOL_REGISTRY_VERSION } from './tools'
import type { Json, ToolSpec, ToolDeps, ToolResult } from './agentic-tool-types'
export type { ToolSpec, ToolDeps, ToolResult, Cite, RelatedCite } from './agentic-tool-types'
export { TOPICS, STATES, CHAMBERS, TERMS, countSpeeches, speechTrend, findPeople, memberVotes, partyDonations, findQuotes } from './tools/speech-data'
import { TOPICS, STATES, CHAMBERS, TERMS } from './tools/speech-data'
export const AGENTIC_TOOLS_VERSION = 'agentic-tools-20-pay-route/' + TOOL_REGISTRY_VERSION
export const TOOL_SPECS: ToolSpec[] = askToolSpecs
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** Schema-check model plans before any lookup. References are validated separately. */
export function validToolArgs(name: string, args: unknown): args is Json {
  return toolArgProblem(name, args) === null
}
/** The first invalid argument as a short repair hint for the model, or null when the arguments are valid. */
/** Names the first unknown argument or enum miss, so a model's one repair turn can correct it. */
function registeredArgProblem(schema: unknown, args: unknown): string {
  const props = (schema as { properties?: Record<string, { enum?: unknown[] }> })?.properties ?? {}
  if (args && typeof args === 'object' && !Array.isArray(args)) for (const [k, v] of Object.entries(args)) {
    if (!Object.hasOwn(props, k)) return `unknown argument ${k}; this tool takes ${Object.keys(props).join(', ')}`
    if (props[k].enum && !props[k].enum!.includes(v)) return `${k} must be one of ${props[k].enum!.join(', ')}`
  }
  return 'arguments do not match the tool schema; check the fields this view requires or forbids'
}
export function toolArgProblem(name: string, args: unknown): string | null {
  const registered = getAskTool(name)
  if (registered && registered.askFactStyle !== 'legacy') return validRegisteredArgs(registered.name, args) ? null : registeredArgProblem(registered.inputSchema, args)
  const spec = TOOL_SPECS.find(t => t.name === name)
  if (!spec) return `unknown tool ${name}`
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'arguments must be an object'
  const a = args as Json
  const props = spec.input.properties as Record<string, { type: string; enum?: unknown[]; minimum?: number; maximum?: number }>
  for (const k of (spec.input.required ?? []) as string[]) if (typeof a[k] !== 'string' || !String(a[k]).trim()) return `${k} is required`
  for (const [k, v] of Object.entries(a)) {
    const p = props[k]
    if (!p) return `unknown argument ${k}`
    if (p.type === 'string' ? typeof v !== 'string' || !v.trim() : typeof v !== 'number' || !Number.isInteger(v)) return `${k} must be ${p.type === 'string' ? 'a non-empty string' : 'an integer'}`
    if (p.enum && !p.enum.includes(v)) return `${k} must be one of ${p.enum.join(', ')}`
    if (typeof v === 'number' && (v < (p.minimum ?? 0) || v > (p.maximum ?? 9999))) return `${k} must be between ${p.minimum ?? 0} and ${p.maximum ?? 9999}`
  }
  for (const k of ['since', 'until']) if (a[k] && (!DATE_RE.test(String(a[k])) || !Number.isFinite(Date.parse(String(a[k]))) || new Date(String(a[k])).toISOString().slice(0, 10) !== a[k])) return `${k} must be a real YYYY-MM-DD date`
  if (a.since && a.until && String(a.since) > String(a.until)) return 'since must not be after until'
  if (name === 'member_votes' && !a.person && !a.party) return 'member_votes needs person or party'
  if (name === 'member_votes' && String(a.keyword).length < 3) return 'keyword must be at least 3 characters'
  if (name === 'party_receipts' && !a.party && !a.industry) return 'party_receipts needs party or industry'
  return null
}
export async function runTool(deps: ToolDeps, name: string, args: Json): Promise<ToolResult> {
  const spec = TOOL_SPECS.find((t) => t.name === name)
  const t0 = Date.now()
  if (!spec) return { tool: name, ok: false, error: `unknown tool ${name}`, cite: [], notes: [] }
  if (!validToolArgs(name, args)) return { tool: name, ok: false, error: 'invalid tool arguments', cite: [], notes: [] }
  try { return { ...(await spec.run(deps, args ?? {})), ms: Date.now() - t0 } }
  catch (err) { return { tool: name, ok: false, error: String((err as Error)?.message ?? err).slice(0, 300), cite: [], notes: [], ms: Date.now() - t0 } }
}
