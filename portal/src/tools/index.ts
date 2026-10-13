import { z } from 'zod'
import { tool as electorates } from './electorates'
import { tool as findRecords } from './find-records'
import { tool as parliamentaryPay } from './pay'
import { tool as contracts } from './contracts'
import { tool as grants } from './grants'
import { tool as declaredInterests } from './interests'
import { ToolInputError, type ToolArgs, type ToolDefinition, type ToolEnv, type StructuredToolResult } from './types'
import type { ToolDeps, ToolSpec } from '../agentic-tools'
export * from './types'
import { validToolIdentifier } from './identifiers'
export * from './identifiers'

export const TOOL_REGISTRY_VERSION = 'structured-tools-4'
/** Add each new data-tool module here once; Ask and MCP both read this catalog. */
export const tools: readonly ToolDefinition[] = Object.freeze([electorates, findRecords, parliamentaryPay, contracts, grants, declaredInterests])
const names = new Set<string>()
for (const tool of tools) {
  if (!/^[a-z][a-z0-9_]*$/.test(tool.name) || names.has(tool.name)) throw new Error('Invalid or duplicate registry tool name')
  names.add(tool.name)
}
// Schemas are immutable metadata, not request state. No env, response or asset is cached here.
const schemas = new Map(tools.map(tool => [tool.name, z.fromJSONSchema(tool.inputSchema).meta(tool.inputSchema)]))
export const getTool = (name: string) => tools.find(tool => tool.name === name)
export const getAskTool = (name: string) => tools.find(tool => (tool.askName ?? tool.name) === name)
export const toolSchema = (name: string) => schemas.get(name)!
export const listTools = () => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
export function parseToolArgs(name: string, args: unknown): ToolArgs {
  const tool = getTool(name), schema = schemas.get(name)
  if (!tool || !schema) throw new ToolInputError(name)
  const parsed = schema.safeParse(args)
  if (!parsed.success || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw new ToolInputError(name)
  const data = parsed.data as ToolArgs
  const identifiers = new Set([...Object.keys(tool.inputSchema.properties ?? {}).filter(key => /(?:^|_)(?:name|slug|id)$/.test(key)), ...tool.identifierFields ?? []])
  for (const key of identifiers) if (data[key] !== undefined && !validToolIdentifier(data[key])) throw new ToolInputError(name)
  if (tool.validate && !tool.validate(data)) throw new ToolInputError(name)
  return data
}
export function validRegisteredArgs(name: string, args: unknown): args is ToolArgs {
  try { parseToolArgs(name, args); return true } catch { return false }
}
export async function validateToolArgs(env: ToolEnv, name: string, args: unknown): Promise<ToolArgs> {
  const parsed = parseToolArgs(name, args), tool = getTool(name)!
  if (tool.validateKnown && !await tool.validateKnown(env, parsed)) throw new ToolInputError(name)
  return parsed
}
export async function callTool(env: ToolEnv, name: string, args: unknown): Promise<StructuredToolResult> {
  const tool = getTool(name)
  try {
    const parsed = await validateToolArgs(env, name, args)
    // Canonical wire JSON is identical in Ask and MCP, including optional metadata.
    return JSON.parse(JSON.stringify(await tool!.handler(env, parsed))) as StructuredToolResult
  } catch (error) {
    if (error instanceof ToolInputError) throw error
    return { rows: [], citations: [], notes: [], error: 'Published tool data is temporarily unavailable.' }
  }
}
/** Minimal adapter for the route lane's current ToolSpec/ToolResult contract. */
export const askToolSpecs: ToolSpec[] = tools.map(tool => ({
  name: tool.askName ?? tool.name, description: tool.description, input: tool.inputSchema,
  async run(deps: ToolDeps, args: ToolArgs) {
    const data = await callTool({ ...deps.toolEnv, asset: deps.asset, origin: deps.origin, signal: deps.signal }, tool.name, args)
    return { tool: tool.askName ?? tool.name, ok: !data.error, ...(data.error ? { error: data.error } : {}), data,
      cite: data.citations.map(c => ({ kind: c.kind ?? 'record', label: c.text, url: c.url, ...(c.value === undefined ? {} : { value: c.value }) })),
      notes: data.notes, query: data.query,
    }
  },
}))
