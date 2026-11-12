#!/usr/bin/env node
// Sync the ElevenLabs voice agent's prompt and server tools from voice/agent-config.json. See voice/README.md.
//
//   npm run voice:agent -- --agent <agent_id>                    # dry run: print the plan, change nothing
//   npm run voice:agent -- --agent <agent_id> --apply            # back up, write tools, then the agent; re-check
//   npm run voice:agent -- --agent <agent_id> --restore <file>   # dry run of a restore from a backup
//   npm run voice:agent -- --agent <agent_id> --restore <file> --apply
//
// Reads ELEVENLABS_API_KEY from the environment (never printed). Provider API reference:
//   agents  https://elevenlabs.io/docs/api-reference/agents/get     GET   /v1/convai/agents/{agent_id}
//           https://elevenlabs.io/docs/api-reference/agents/update  PATCH /v1/convai/agents/{agent_id}
//   tools   https://elevenlabs.io/docs/api-reference/tools/list     GET   /v1/convai/tools?search=&page_size=&cursor=
//           https://elevenlabs.io/docs/api-reference/tools/get      GET   /v1/convai/tools/{tool_id}
//           https://elevenlabs.io/docs/api-reference/tools/create   POST  /v1/convai/tools  {tool_config}
//           https://elevenlabs.io/docs/api-reference/tools/update   PATCH /v1/convai/tools/{tool_id}  {tool_config}
//   auth    https://elevenlabs.io/docs/api-reference/authentication  xi-api-key header
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isDeepStrictEqual} from 'node:util'

const API = 'https://api.elevenlabs.io'
export const CONFIG_PATH = fileURLToPath(new URL('./agent-config.json', import.meta.url))
/** Backups live outside the repository; override with OPAX_VOICE_BACKUP_DIR or --backup-dir. */
export const BACKUP_DIR = process.env.OPAX_VOICE_BACKUP_DIR || join(homedir(), '.cache', 'opax', 'voice-agent-backups')
export const loadConfig = (path = CONFIG_PATH) => JSON.parse(readFileSync(path, 'utf8'))

/** Fill {{origin}} and {{voice_tool_secret_id}} in every string of a tool config. `$comment` keys are documentation only. */
export function renderTools(config, {origin, secretId}) {
  const fill = value => typeof value === 'string' ? value.replaceAll('{{origin}}', origin).replaceAll('{{voice_tool_secret_id}}', secretId ?? '{{voice_tool_secret_id}}')
    : Array.isArray(value) ? value.map(fill) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$comment').map(([k, v]) => [k, fill(v)])) : value
  return config.tools.map(fill)
}
export const promptText = config => Array.isArray(config.prompt) ? config.prompt.join('\n') : String(config.prompt)
/** Prompts compare equal when only line-end and trailing whitespace differ (the provider may normalise them). */
export const samePrompt = (a, b) => typeof a === 'string' && typeof b === 'string' && a.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim() === b.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()

/** The secret id an OPAX tool already sends as x-opax-voice-token. */
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
  return [...a.filter(line => !b.includes(line)).map(line => '- ' + line), ...b.filter(line => !a.includes(line)).map(line => '+ ' + line)]
}

/**
 * The plan for one agent. `agent` is GET /v1/convai/agents/{id}; `attached` is each tool on it ({id, tool_config});
 * `workspace` is other workspace tools with a configured name. A configured tool matches, in order: an attached tool
 * with its name, then a workspace tool with its name and this environment's URL (left by a half-finished apply).
 * Staging and production tools share names, never URLs, so another environment's tool is never reused.
 */
export function planSync(config, agent, attached, {origin, secretId, workspace = []}) {
  const prompt = agent?.conversation_config?.agent?.prompt ?? {}
  const inline = Array.isArray(prompt.tools) ? prompt.tools : []
  const secret = secretId ?? existingSecretId([...attached.map(t => t.tool_config), ...inline, ...workspace.map(t => t.tool_config)])
  const desired = renderTools(config, {origin, secretId: secret})
  const byName = new Map(attached.map(t => [t.tool_config?.name, t]))
  const attachedIds = new Set(attached.map(t => t.id))
  const tools = desired.map(tool => {
    const current = byName.get(tool.name) ?? workspace.find(t => !attachedIds.has(t.id) && t.tool_config?.name === tool.name && t.tool_config?.api_schema?.url === tool.api_schema.url)
    if (!current) return {action: 'create', name: tool.name, tool}
    const changes = differences(tool, current.tool_config)
    return {action: changes.length ? 'update' : 'same', name: tool.name, id: current.id, attached: attachedIds.has(current.id), tool, changes}
  })
  const names = new Set(desired.map(t => t.name))
  const kept = attached.filter(t => !names.has(t.tool_config?.name)).map(t => ({id: t.id, name: t.tool_config?.name}))
  const inlineReplaced = inline.filter(t => names.has(t?.name)).map(t => t.name)
  const want = promptText(config)
  const changed = !samePrompt(prompt.prompt, want)
  return {
    agent_id: agent?.agent_id, origin, secret_id: secret, tools, kept, inline_replaced: inlineReplaced,
    prompt: {changed, diff: changed ? lineDiff(prompt.prompt, want) : [], text: want},
    problems: [
      ...(secret ? [] : ['No tool secret id: no OPAX tool sends x-opax-voice-token. Pass --secret-id <provider secret id>.']),
      ...desired.filter(t => { try { return !new URL(t.api_schema.url).pathname.startsWith('/api/voice/tools/') } catch { return true } }).map(t => `${t.name}: URL is not under /api/voice/tools/.`),
    ],
  }
}

/** Everything the agent should end with is already there: every tool `same` and attached, the prompt unchanged. */
export const inSync = plan => !plan.problems.length && !plan.prompt.changed && !plan.inline_replaced.length && plan.tools.every(t => t.action === 'same' && t.attached)

export function formatPlan(plan) {
  const out = [`Agent ${plan.agent_id ?? '(unknown)'} -> ${plan.origin}`, `Tool secret: ${plan.secret_id ? 'provider secret ' + plan.secret_id : 'MISSING'}`]
  for (const tool of plan.tools) {
    const where = tool.id ? ` (${tool.id}${tool.attached ? '' : ', in workspace, not attached'})` : ''
    out.push(`${tool.action.padEnd(6)} ${tool.name}${where}`)
    for (const change of tool.changes ?? []) out.push(`         ${change.path}: ${JSON.stringify(change.have)} -> ${JSON.stringify(change.want)}`)
  }
  for (const tool of plan.kept) out.push(`keep   ${tool.name} (${tool.id}), attached but not in agent-config.json`)
  if (plan.inline_replaced.length) out.push(`inline ${plan.inline_replaced.join(', ')}: deprecated prompt.tools entries replaced by the tool ids above`)
  out.push(plan.prompt.changed ? 'prompt changes:' : 'prompt unchanged')
  out.push(...plan.prompt.diff.map(line => '  ' + line))
  out.push(...plan.problems.map(problem => 'PROBLEM ' + problem))
  return out.join('\n')
}

/** A small provider client; `fetchImpl` lets tests stand in for ElevenLabs. */
export function providerApi(key, fetchImpl = fetch) {
  return async (method, path, body) => {
    const response = await fetchImpl(API + path, {method, headers: {'xi-api-key': key, ...(body ? {'content-type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined})
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : {}
  }
}

/** Workspace tools whose name is configured, through the list endpoint's search and cursor. */
async function workspaceTools(call, names) {
  const found = []
  for (const name of names) {
    let cursor
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({search: name, page_size: '100', ...(cursor ? {cursor} : {})})
      const list = await call('GET', `/v1/convai/tools?${query}`)
      for (const tool of list.tools ?? []) if (tool?.tool_config?.name === name && !found.some(t => t.id === tool.id)) found.push({id: tool.id, tool_config: tool.tool_config})
      if (!list.has_more || !list.next_cursor) break
      cursor = list.next_cursor
    }
  }
  return found
}

export async function readAgent(call, agentId, names = []) {
  const agent = await call('GET', `/v1/convai/agents/${encodeURIComponent(agentId)}`)
  const ids = agent?.conversation_config?.agent?.prompt?.tool_ids ?? []
  const attached = []
  for (const id of ids) attached.push({id, ...(await call('GET', `/v1/convai/tools/${encodeURIComponent(id)}`))})
  return {agent, attached, workspace: names.length ? await workspaceTools(call, names) : []}
}

/** The fetched state, saved before any write. Contents are never printed. */
export function saveBackup(dir, agentId, state, now = new Date()) {
  mkdirSync(dir, {recursive: true, mode: 0o700})
  const file = join(dir, `${agentId}-${now.toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({agent_id: agentId, saved_at: now.toISOString(), ...state}, null, 1), {mode: 0o600, flag: 'wx'})
  return file
}

/** Tools first, then one agent PATCH that attaches them with the prompt. On a failed agent update, say what is left. */
export async function applyPlan(call, agentId, plan, agent) {
  const ids = [], created = [], updated = []
  for (const tool of plan.tools) {
    if (tool.action === 'create') { const id = (await call('POST', '/v1/convai/tools', {tool_config: tool.tool})).id; ids.push(id); created.push(`${tool.name} ${id}`) }
    else { if (tool.action === 'update') { await call('PATCH', `/v1/convai/tools/${encodeURIComponent(tool.id)}`, {tool_config: tool.tool}); updated.push(`${tool.name} ${tool.id}`) } ids.push(tool.id) }
  }
  const toolIds = [...ids, ...plan.kept.map(t => t.id)]
  const prompt = {...agent.conversation_config.agent.prompt, prompt: plan.prompt.text, tool_ids: toolIds}
  if (Array.isArray(prompt.tools)) prompt.tools = prompt.tools.filter(t => !plan.inline_replaced.includes(t?.name))
  try {
    await call('PATCH', `/v1/convai/agents/${encodeURIComponent(agentId)}`, {conversation_config: {agent: {prompt}}})
  } catch (error) {
    throw new Error([`Agent update failed: ${error.message}`, 'The agent itself is unchanged (prompt and tool_ids as before).',
      `Created, not attached: ${created.join('; ') || 'none'}.`, `Updated in place (already attached tools now carry the new config): ${updated.join('; ') || 'none'}.`,
      'Re-running --apply reuses the created tools. To undo the updates, run --restore with the backup above.'].join('\n'))
  }
  const after = (await call('GET', `/v1/convai/agents/${encodeURIComponent(agentId)}`)).conversation_config?.agent?.prompt ?? {}
  const missing = toolIds.filter(id => !(after.tool_ids ?? []).includes(id))
  if (!samePrompt(after.prompt, plan.prompt.text) || missing.length) throw new Error(`Read-back mismatch: prompt ${samePrompt(after.prompt, plan.prompt.text) ? 'ok' : 'differs'}, missing tool ids ${missing.join(', ') || 'none'}`)
  return {toolIds, created, updated}
}

/** Put the agent's prompt and tool_ids, and each saved tool's config, back as the backup recorded them. */
export function restorePlan(backup, current) {
  const saved = backup.agent?.conversation_config?.agent?.prompt ?? {}
  const now = current.agent?.conversation_config?.agent?.prompt ?? {}
  const tools = (backup.attached ?? []).map(t => ({id: t.id, name: t.tool_config?.name, tool_config: t.tool_config, changes: differences(t.tool_config, current.byId.get(t.id))}))
  const added = (now.tool_ids ?? []).filter(id => !(saved.tool_ids ?? []).includes(id))
  return {prompt: saved, promptChanged: !samePrompt(now.prompt, saved.prompt) || !isDeepStrictEqual(now.tool_ids ?? [], saved.tool_ids ?? []), tools, detach: added}
}

export function parseArgs(argv) {
  const args = {apply: false}
  const flags = {'--agent': 'agent', '--origin': 'origin', '--secret-id': 'secretId', '--config': 'config', '--restore': 'restore', '--backup-dir': 'backupDir'}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--apply') args.apply = true
    else if (flags[flag] && argv[i + 1] && !argv[i + 1].startsWith('--')) args[flags[flag]] = argv[++i]
    else throw new Error(`Unknown or incomplete argument ${flag}`)
  }
  return args
}

/** The whole command, with the provider client and output injected. Returns the exit code. */
export async function run(args, {call, log = console.log, backupDir = BACKUP_DIR}) {
  if (!args.agent) throw new Error('Usage: npm run voice:agent -- --agent <agent_id> [--origin https://...] [--secret-id <id>] [--restore <backup>] [--apply]')
  const config = loadConfig(args.config)
  const origin = args.origin ?? config.agents[args.agent]?.origin
  if (!origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('Unknown agent: pass --origin https://<opax host>.')
  const names = config.tools.map(t => t.name)
  const state = await readAgent(call, args.agent, names)
  if (args.restore) return restore(args, state, {call, log, backupDir: args.backupDir ?? backupDir})
  const plan = planSync(config, {...state.agent, agent_id: state.agent.agent_id ?? args.agent}, state.attached, {origin, secretId: args.secretId, workspace: state.workspace})
  log(formatPlan(plan))
  if (plan.problems.length) return 1
  if (inSync(plan)) { log('\nAlready in sync.'); return 0 }
  if (!args.apply) { log('\nDry run: nothing changed. Re-run with --apply to apply.'); return 0 }
  const file = saveBackup(args.backupDir ?? backupDir, args.agent, state)
  log(`\nBackup of the agent and its tools before any change: ${file}`)
  log(`Restore with: npm run voice:agent -- --agent ${args.agent} --restore ${file} --apply`)
  const result = await applyPlan(call, args.agent, plan, state.agent)
  log(`Applied. Created: ${result.created.join('; ') || 'none'}. Updated: ${result.updated.join('; ') || 'none'}.`)
  // The check is the same dry run, read fresh from the provider.
  const after = await readAgent(call, args.agent, names)
  const check = planSync(config, {...after.agent, agent_id: args.agent}, after.attached, {origin, secretId: plan.secret_id, workspace: after.workspace})
  log('\nCheck after apply:\n' + formatPlan(check))
  if (!inSync(check)) { log('\nNOT IN SYNC after apply. See the lines above; restore from the backup if needed.'); return 1 }
  log('\nIn sync.')
  return 0
}

async function restore(args, state, {call, log, backupDir}) {
  const backup = JSON.parse(readFileSync(args.restore, 'utf8'))
  if (backup.agent_id !== args.agent) throw new Error(`The backup is for ${backup.agent_id}, not ${args.agent}.`)
  const plan = restorePlan(backup, {agent: state.agent, byId: new Map(state.attached.map(t => [t.id, t.tool_config]))})
  log(`Restore ${args.agent} to the backup saved ${backup.saved_at}:`)
  log(`  prompt and tool_ids: ${plan.promptChanged ? 'restore' : 'already as saved'}`)
  for (const tool of plan.tools) log(`  ${tool.changes.length ? 'restore' : 'same   '} ${tool.name} (${tool.id})${tool.changes.length ? ': ' + tool.changes.map(c => c.path).join(', ') : ''}`)
  if (plan.detach.length) log(`  detach ${plan.detach.join(', ')} (left in the workspace; delete in the ElevenLabs dashboard if unwanted)`)
  if (!args.apply) { log('\nDry run: nothing changed. Re-run with --apply to restore.'); return 0 }
  const file = saveBackup(backupDir, args.agent, state)
  log(`\nBackup of the current state before restoring: ${file}`)
  for (const tool of plan.tools) if (tool.changes.length) await call('PATCH', `/v1/convai/tools/${encodeURIComponent(tool.id)}`, {tool_config: tool.tool_config})
  if (plan.promptChanged) await call('PATCH', `/v1/convai/agents/${encodeURIComponent(args.agent)}`, {conversation_config: {agent: {prompt: {...state.agent.conversation_config.agent.prompt, prompt: plan.prompt.prompt, tool_ids: plan.prompt.tool_ids ?? [], ...(plan.prompt.tools ? {tools: plan.prompt.tools} : {})}}}})
  const after = (await call('GET', `/v1/convai/agents/${encodeURIComponent(args.agent)}`)).conversation_config?.agent?.prompt ?? {}
  const ok = samePrompt(after.prompt, plan.prompt.prompt) && isDeepStrictEqual(after.tool_ids ?? [], plan.prompt.tool_ids ?? [])
  log(ok ? 'Restored.' : 'Restore read-back differs: check the agent in the dashboard.')
  return ok ? 0 : 1
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in the environment.')
  process.exitCode = await run(args, {call: providerApi(key)})
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exit(1) })
