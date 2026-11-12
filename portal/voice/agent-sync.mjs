#!/usr/bin/env node
// Sync the ElevenLabs voice agent's prompt and server tools from voice/agent-config.json.
//
//   npm run voice:agent -- --agent <agent_id>            # dry run: print the plan, change nothing
//   npm run voice:agent -- --agent <agent_id> --apply    # create/update tools, then the agent's prompt and tool_ids
//
// Reads ELEVENLABS_API_KEY from the environment (never printed). The origin comes from the config's agent table or
// --origin. The tool secret is the provider secret the agent's existing tools already send as x-opax-voice-token;
// pass --secret-id to choose one explicitly. Provider API (elevenlabs.io/docs/api-reference): GET/PATCH
// /v1/convai/agents/{id}; GET/PATCH /v1/convai/tools/{id}; POST /v1/convai/tools with {tool_config}.
// Only tools attached to this agent are updated: staging and production tools share names but not URLs.
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {isDeepStrictEqual} from 'node:util'

const API = 'https://api.elevenlabs.io'
export const CONFIG_PATH = fileURLToPath(new URL('./agent-config.json', import.meta.url))
export const loadConfig = (path = CONFIG_PATH) => JSON.parse(readFileSync(path, 'utf8'))

/** Fill {{origin}} and {{voice_tool_secret_id}} in every string of a tool config. */
export function renderTools(config, {origin, secretId}) {
  const fill = value => typeof value === 'string' ? value.replaceAll('{{origin}}', origin).replaceAll('{{voice_tool_secret_id}}', secretId ?? '{{voice_tool_secret_id}}')
    : Array.isArray(value) ? value.map(fill) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)])) : value
  return config.tools.map(fill)
}
export const promptText = config => Array.isArray(config.prompt) ? config.prompt.join('\n') : String(config.prompt)

/** The secret id an attached OPAX tool already sends as x-opax-voice-token. */
export function existingSecretId(tools) {
  for (const tool of tools) {
    const header = tool?.api_schema?.request_headers?.['x-opax-voice-token']
    if (header && typeof header === 'object' && typeof header.secret_id === 'string') return header.secret_id
  }
  return null
}

/** Paths where `want` differs from `have`; only keys `want` sets are compared, so provider defaults are not churn. */
export function differences(want, have, path = '') {
  if (want && typeof want === 'object' && !Array.isArray(want)) {
    return Object.entries(want).flatMap(([key, value]) => differences(value, have && typeof have === 'object' ? have[key] : undefined, path ? `${path}.${key}` : key))
  }
  return isDeepStrictEqual(want, have) ? [] : [{path, want, have}]
}

function lineDiff(before, after) {
  const a = String(before ?? '').split('\n'), b = after.split('\n')
  const removed = a.filter(line => !b.includes(line)).map(line => '- ' + line)
  const added = b.filter(line => !a.includes(line)).map(line => '+ ' + line)
  return [...removed, ...added]
}

/**
 * The plan for one agent. `agent` is GET /v1/convai/agents/{id}; `attached` is the tool_config of each tool id on it.
 * Tools are matched by name among the agent's own tools only. Inline (deprecated `prompt.tools`) tools with a
 * configured name are replaced by tool ids; any other attached tool is kept and listed.
 */
export function planSync(config, agent, attached, {origin, secretId}) {
  const prompt = agent?.conversation_config?.agent?.prompt ?? {}
  const inline = Array.isArray(prompt.tools) ? prompt.tools : []
  const secret = secretId ?? existingSecretId([...attached.map(t => t.tool_config), ...inline])
  const desired = renderTools(config, {origin, secretId: secret})
  const byName = new Map(attached.map(t => [t.tool_config?.name, t]))
  const tools = desired.map(tool => {
    const current = byName.get(tool.name)
    if (!current) return {action: 'create', name: tool.name, tool}
    const changes = differences(tool, current.tool_config)
    return {action: changes.length ? 'update' : 'same', name: tool.name, id: current.id, tool, changes}
  })
  const names = new Set(desired.map(t => t.name))
  const kept = attached.filter(t => !names.has(t.tool_config?.name)).map(t => ({id: t.id, name: t.tool_config?.name}))
  const inlineReplaced = inline.filter(t => names.has(t?.name)).map(t => t.name)
  const want = promptText(config)
  return {
    agent_id: agent?.agent_id, origin, secret_id: secret, tools, kept, inline_replaced: inlineReplaced,
    prompt: {changed: prompt.prompt !== want, diff: prompt.prompt === want ? [] : lineDiff(prompt.prompt, want), text: want},
    problems: [
      ...(secret ? [] : ['No tool secret id: no attached tool sends x-opax-voice-token. Pass --secret-id <provider secret id>.']),
      ...desired.filter(t => { try { return !new URL(t.api_schema.url).pathname.startsWith('/api/voice/tools/') } catch { return true } }).map(t => `${t.name}: URL is not under /api/voice/tools/.`),
    ],
  }
}

export function formatPlan(plan) {
  const out = [`Agent ${plan.agent_id ?? '(unknown)'} -> ${plan.origin}`, `Tool secret: ${plan.secret_id ? 'provider secret ' + plan.secret_id : 'MISSING'}`]
  for (const tool of plan.tools) {
    out.push(`${tool.action.padEnd(6)} ${tool.name}${tool.id ? ' (' + tool.id + ')' : ''}`)
    for (const change of tool.changes ?? []) out.push(`         ${change.path}: ${JSON.stringify(change.have)} -> ${JSON.stringify(change.want)}`)
  }
  for (const tool of plan.kept) out.push(`keep   ${tool.name} (${tool.id}), attached but not in agent-config.json`)
  if (plan.inline_replaced.length) out.push(`inline ${plan.inline_replaced.join(', ')}: deprecated prompt.tools entries replaced by the tool ids above`)
  out.push(plan.prompt.changed ? 'prompt changes:' : 'prompt unchanged')
  out.push(...plan.prompt.diff.map(line => '  ' + line))
  out.push(...plan.problems.map(problem => 'PROBLEM ' + problem))
  return out.join('\n')
}

async function call(key, method, path, body) {
  const response = await fetch(API + path, {method, headers: {'xi-api-key': key, ...(body ? {'content-type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined})
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

export async function readAgent(key, agentId) {
  const agent = await call(key, 'GET', `/v1/convai/agents/${encodeURIComponent(agentId)}`)
  const ids = agent?.conversation_config?.agent?.prompt?.tool_ids ?? []
  const attached = []
  for (const id of ids) attached.push({id, ...(await call(key, 'GET', `/v1/convai/tools/${encodeURIComponent(id)}`))})
  return {agent, attached}
}

/** Tools first, then one agent PATCH with the prompt and the full tool id list, then a read-back check. */
export async function applyPlan(key, agentId, plan, agent) {
  const ids = []
  for (const tool of plan.tools) {
    if (tool.action === 'create') ids.push((await call(key, 'POST', '/v1/convai/tools', {tool_config: tool.tool})).id)
    else { if (tool.action === 'update') await call(key, 'PATCH', `/v1/convai/tools/${encodeURIComponent(tool.id)}`, {tool_config: tool.tool}); ids.push(tool.id) }
  }
  const toolIds = [...ids, ...plan.kept.map(t => t.id)]
  const prompt = {...agent.conversation_config.agent.prompt, prompt: plan.prompt.text, tool_ids: toolIds}
  if (Array.isArray(prompt.tools)) prompt.tools = prompt.tools.filter(t => !plan.inline_replaced.includes(t?.name))
  await call(key, 'PATCH', `/v1/convai/agents/${encodeURIComponent(agentId)}`, {conversation_config: {agent: {prompt}}})
  const after = (await call(key, 'GET', `/v1/convai/agents/${encodeURIComponent(agentId)}`)).conversation_config?.agent?.prompt ?? {}
  const missing = toolIds.filter(id => !(after.tool_ids ?? []).includes(id))
  if (after.prompt !== plan.prompt.text || missing.length) throw new Error(`Read-back mismatch: prompt ${after.prompt === plan.prompt.text ? 'ok' : 'differs'}, missing tool ids ${missing.join(', ') || 'none'}`)
  return toolIds
}

export function parseArgs(argv) {
  const args = {apply: false}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--apply') args.apply = true
    else if (['--agent', '--origin', '--secret-id', '--config'].includes(flag)) args[flag.slice(2).replace('-id', 'Id')] = argv[++i]
    else throw new Error(`Unknown argument ${flag}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.agent) throw new Error('Usage: npm run voice:agent -- --agent <agent_id> [--origin https://...] [--secret-id <id>] [--apply]')
  const config = loadConfig(args.config)
  const origin = args.origin ?? config.agents[args.agent]?.origin
  if (!origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('Unknown agent: pass --origin https://<opax host>.')
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the environment.')
  const {agent, attached} = await readAgent(key, args.agent)
  const plan = planSync(config, {...agent, agent_id: agent.agent_id ?? args.agent}, attached, {origin, secretId: args.secretId})
  console.log(formatPlan(plan))
  if (plan.problems.length) { process.exitCode = 1; return }
  const pending = plan.tools.some(t => t.action !== 'same') || plan.prompt.changed || plan.inline_replaced.length
  if (!args.apply) { console.log(pending ? '\nDry run: nothing changed. Re-run with --apply to apply.' : '\nAlready in sync.'); return }
  if (!pending) { console.log('\nAlready in sync.'); return }
  const ids = await applyPlan(key, args.agent, plan, agent)
  console.log(`\nApplied. Agent tool_ids: ${ids.join(', ')}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exit(1) })
