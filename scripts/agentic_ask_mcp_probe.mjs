#!/usr/bin/env node
// MCP tool-use probe for design (ii): lookup questions that need the live /mcp
// tools (search_records, read_record, corpus_coverage), run through an
// opax-spike-* agentic config with only the MCP source. Scores tool calling, not
// answers: did the agent call MCP, with valid arguments, without errors or loops?
//   node scripts/agentic_ask_mcp_probe.mjs [config]   -> portal/private/agentic-ask-spike/mcp-probe.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runII, summariseII } from './agentic_ask_spike.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = process.argv[2] ?? 'opax-spike-agent-mcponly'
const QUESTIONS = [
  'Find a speech where Andrew Wilkie talks about poker machine reform and quote one sentence from it.',
  'What did David Pocock say about gambling advertising? Cite the record.',
  'Open the record for the Interactive Gambling Amendment (Gambling Reform) Bill 2026 and say what it does.',
  'Which press releases mention BetStop?',
  'Find the division on the second reading of the National Gambling Reform Bill 2012 and say how it was decided.',
  'What does the OPAX corpus cover? List the parliaments and the years.',
  'Find speeches by Sarah Henderson about online wagering.',
  'Show a speech by Justin Field about poker machines in New South Wales.',
  'Find committee hearing evidence about gambling harm from the Alliance for Gambling Reform.',
  'Search for speeches about the Interactive Gambling Act 2001 and name two speakers.',
]
const out = []
for (const [i, question] of QUESTIONS.entries()) {
  const run = await runII({ question }, config)
  const s = summariseII(run)
  const steps = run.frames.filter((f) => f.step).map((f) => f.step)
  const mcpSteps = steps.filter((x) => /mcp/i.test(`${x.module} ${x.agent_path ?? ''} ${x.title ?? ''}`))
  const calls = s.tool_calls.map((c) => `${c.fn}__${c.source}`)
  const repeats = calls.length - new Set(steps.filter((x) => x.module === 'smart' && /Tool calls:/.test(x.value ?? '')).map((x) => x.value)).size
  const row = { q: i + 1, question, ms: run.ms, answered: Boolean(s.answer), answer: s.answer.slice(0, 400), tool_calls: calls, mcp_calls: s.mcp_calls,
    mcp_step_titles: mcpSteps.map((x) => `${x.title}: ${String(x.reason ?? '').slice(0, 120)}`), step_errors: s.step_errors, repeated_calls: Math.max(0, repeats),
    nuclia_tokens: s.nuclia_tokens, timeout: s.timeout, exception: s.exception }
  out.push(row)
  console.error(`${i + 1} ${(run.ms / 1000).toFixed(1)}s mcp=${s.mcp_calls} errors=${s.step_errors.length} repeats=${row.repeated_calls} calls=${calls.join(',')} | ${s.answer.slice(0, 120).replace(/\s+/g, ' ')}`)
  fs.mkdirSync(path.join(ROOT, 'portal/private/agentic-ask-spike/frames'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, `portal/private/agentic-ask-spike/frames/probe-${config}-${i + 1}.ndjson`), run.frames.map((f) => JSON.stringify(f)).join('\n') + '\n')
  fs.writeFileSync(path.join(ROOT, 'portal/private/agentic-ask-spike/mcp-probe.json'), JSON.stringify({ config, rows: out }, null, 1) + '\n')
}
const n = out.length
console.log(JSON.stringify({ config, questions: n, with_mcp_call: out.filter((r) => r.mcp_calls > 0).length, mcp_calls: out.reduce((a, r) => a + r.mcp_calls, 0),
  runs_with_step_error: out.filter((r) => r.step_errors.length).length, runs_with_repeats: out.filter((r) => r.repeated_calls > 0).length, timeouts: out.filter((r) => r.timeout).length,
  p50_s: [...out.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(n / 2)] / 1000 }, null, 1))
