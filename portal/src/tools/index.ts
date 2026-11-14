import { z } from 'zod'
import { tool as personQuotes } from './person-quotes'
import { search, readPassage, personOverview } from './corpus-aliases'
import { calculatedRecordTools } from './calculated-records'
import { speechDataTools } from './speech-data'
import { tool as electorates } from './electorates'
import { tool as findRecords } from './find-records'
import { tool as parliamentaryPay } from './pay'
import { tool as memberExpenses } from './member-expenses'
import { tool as contracts } from './contracts'
import { tool as grants } from './grants'
import { tool as declaredInterests } from './interests'
import { tool as division } from './division'
import { tool as countRecords } from './count-records'
import { tool as moneyTotals } from './money-totals'
import { tool as campaignSpend } from './campaign-spend'
import { tool as corpusRecords } from './corpus-records'
import { tool as legislation } from './legislation'
import { tool as publicFinances } from './public-finances'
import { tool as entityProfile } from './entity-profile'
import { tool as accessRegisters } from './access-registers'
import { tool as memberDivisions } from './member-divisions'
import { tool as sponsoredBills } from './sponsored-bills'
import { tool as annualReports } from './annual-reports'
import { tool as royalCommissions } from './royal-commissions'
import { tool as integrityReports } from './integrity-reports'
import { tool as agencyReports } from './agency-reports'
import { memberProfile, memberInterests } from './mcp-people'
import { divisionVotes, memberVotingRecord, billSearch, billDetail, hansardSearch } from './mcp-parliament'
import { moneyReceipts } from './mcp-money'
import { ToolInputError, type ToolArgs, type ToolDefinition, type ToolEnv, type StructuredToolResult } from './types'
import type { ToolDeps, ToolSpec, ToolResult } from '../agentic-tools'
export * from './types'
import { validToolIdentifier } from './identifiers'
export * from './identifiers'

export const TOOL_REGISTRY_VERSION = 'structured-tools-19-transcript-counts'
/** Add each new data-tool module here once; Ask and MCP both read this catalog. */
export const tools: readonly ToolDefinition[] = Object.freeze([electorates, findRecords, parliamentaryPay, memberExpenses, contracts, grants, declaredInterests, division, countRecords, moneyTotals, campaignSpend, corpusRecords, legislation, publicFinances, entityProfile, accessRegisters, memberDivisions, sponsoredBills, ...speechDataTools, personQuotes, search, readPassage, personOverview, ...calculatedRecordTools, annualReports, integrityReports, royalCommissions, agencyReports,
  // Public MCP record tools (mcpOnly): one paged envelope with an output schema, over the handlers above.
  memberProfile, divisionVotes, memberVotingRecord, billSearch, billDetail, moneyReceipts, memberInterests, hansardSearch])
const names = new Set<string>()
for (const tool of tools) {
  if (!/^[a-z][a-z0-9_]*$/.test(tool.name) || names.has(tool.name)) throw new Error('Invalid or duplicate registry tool name')
  names.add(tool.name)
}
// Schemas are immutable metadata, not request state. No env, response or asset is cached here.
// Each is built on first use: converting every tool's JSON Schema at module load cost every
// cold isolate (pages and searches included) the zod work of the whole registry.
const schemas = new Map<string, ReturnType<typeof buildSchema>>()
const buildSchema = (tool: ToolDefinition) => z.fromJSONSchema(tool.inputSchema).meta(tool.inputSchema)
function schemaFor(name: string) {
  let schema = schemas.get(name)
  if (!schema) {
    const tool = getTool(name)
    if (!tool) return undefined
    schema = buildSchema(tool)
    schemas.set(name, schema)
  }
  return schema
}
export const getTool = (name: string) => tools.find(tool => tool.name === name)
export const getAskTool = (name: string) => tools.find(tool => !tool.mcpOnly && (tool.askName ?? tool.name) === name)
export const toolSchema = (name: string) => schemaFor(name)!
const outputSchemas = new Map<string, ReturnType<typeof z.fromJSONSchema>>()
/** The zod form of a tool's declared output schema, built on first use; undefined for tools without one. */
export function toolOutputSchema(name: string) {
  const declared = getTool(name)?.outputSchema
  if (!declared) return undefined
  let schema = outputSchemas.get(name)
  if (!schema) outputSchemas.set(name, schema = z.fromJSONSchema(declared).meta(declared))
  return schema
}
export const listTools = () => tools.map(({ name, title, description, inputSchema, outputSchema }) => ({ name, ...(title ? { title } : {}), description, inputSchema, ...(outputSchema ? { outputSchema } : {}) }))
export function parseToolArgs(name: string, args: unknown): ToolArgs {
  const tool = getTool(name), schema = schemaFor(name)
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
const REGISTER_PAGES: Record<string, string> = { contracts: '/money/contracts', grants: '/money/grants' }
/** Minimal adapter for the route lane's current ToolSpec/ToolResult contract. */
export const askToolSpecs: ToolSpec[] = tools.filter(tool => !tool.mcpOnly).map(tool => ({
  name: tool.askName ?? tool.name, description: tool.description, input: tool.inputSchema,
  async run(deps: ToolDeps, args: ToolArgs) {
    const data = await callTool({ ...deps.toolEnv, asset: deps.asset, kb: deps.kb, origin: deps.origin, signal: deps.signal }, tool.name, args)
    return { tool: tool.askName ?? tool.name, ok: !data.error, ...(data.error ? { error: data.error === 'Published tool data is temporarily unavailable.' ? 'lookup timed out or unavailable' : data.error } : {}), ...(data.list ? { list: String(data.list) } : {}), data,
      cite: data.citations.map(c => ({ kind: c.kind ?? 'record', label: c.text, url: c.url, ...(c.value === undefined ? {} : { value: c.value }), ...(c.related ? { related: c.related } : {}), ...(c.remuneration ? { remuneration: c.remuneration } : {}) })),
      ...(data.coverage ? { coverage: data.coverage as ToolResult['coverage'] } : {}),
      notes: data.notes, query: data.query,
      // The register a result was drawn from: its coverage row opens this, not one of its records.
      ...(REGISTER_PAGES[tool.name] ? { list: `${deps.origin ?? 'https://opax.com.au'}${REGISTER_PAGES[tool.name]}` } : {}),
    }
  },
}))
