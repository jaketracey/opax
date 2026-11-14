#!/usr/bin/env node
// The MCP release gate. Reads recorded runs (no network, no model calls) and decides, in two parts:
//
//   1. cited: the MEDIAN of the last 3 runs is 33 of 35 questions or better.
//      cited is a deterministic check (the answer links the canonical OPAX page), so re-scoring the
//      same answers cannot change it. Its variance comes from the answering model's choices, and only
//      fresh answers measure that. So the gate takes 3 full runs, not 3 scorings of one run.
//   2. opax_url: every tool whose output schema promises a page link (opax_url, or url) returned one on
//      every successful call. Read from the tool results themselves, with no judge.
//
//   node portal/scripts/mcp-evals/gate.mjs run1.json run2.json run3.json [--out gate.json]
//
// Exit code: 0 PASS, 1 FAIL, 2 INCOMPLETE (a part could not be measured, or the runs cannot be compared).
// INCOMPLETE is never a pass: the gate fails closed.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scoreCitation, callLabel } from './score.mjs'

export const GATE_RUNS = 3
export const GATE_CITED = { min: 33, of: 35 }
const here = dirname(fileURLToPath(import.meta.url))

/** 33 of 35, scaled to the number of citable questions (integer arithmetic: 33 * 35 / 35 is exactly 33). */
export const minCited = citable => Math.ceil(GATE_CITED.min * citable / GATE_CITED.of)
const median = values => { const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/**
 * runs: [{ name, report }] where report is a results file written by run.mjs.
 * questions: the question set the runs answered (cited is re-scored from each answer with its gold).
 */
export function evaluateGate({ runs, questions, minCitedOverride, allowMixedBuilds = false }) {
  const incomplete = [], notes = []
  const byId = new Map(questions.map(q => [q.id, q]))
  const ordered = [...runs].sort((a, b) => String(a.report.meta?.started ?? '').localeCompare(String(b.report.meta?.started ?? '')))
  if (ordered.length < GATE_RUNS) incomplete.push(`the gate needs ${GATE_RUNS} runs, got ${ordered.length}`)
  const used = ordered.slice(-GATE_RUNS)
  if (ordered.length > GATE_RUNS) notes.push(`${ordered.length} runs given: the latest ${GATE_RUNS} by start time are used`)

  // Runs must be the same build, or the median says nothing about any one build.
  const builds = used.map(r => `${String(r.report.meta?.sha ?? 'unknown').split(/\s+/)[0]} at ${r.report.meta?.base ?? 'unknown'}`)
  if (new Set(builds).size > 1) {
    if (allowMixedBuilds) notes.push(`MIXED BUILDS (${[...new Set(builds)].join('; ')}): an indication only, not a gate on any one build`)
    else incomplete.push(`the runs are of different builds (${[...new Set(builds)].join('; ')}); pass --allow-mixed-builds to see an indication anyway`)
  }

  // Part 1: cited.
  const perRun = used.map((run, i) => {
    const meta = run.report.meta ?? {}
    if (meta.warning) incomplete.push(`${run.name}: ${meta.warning}`)
    const rows = (run.report.results ?? []).filter(r => !r.env_blocked && byId.has(r.id))
    const missing = questions.filter(q => !(q.requires ?? []).some(need => (meta.blocked ?? []).includes(need)) && !rows.some(r => r.id === q.id)).map(q => q.id)
    if (missing.length) incomplete.push(`${run.name} does not answer ${missing.length} questions of the set (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''})`)
    const scored = rows.map(r => scoreCitation(byId.get(r.id), r.answer ?? '').pass).filter(pass => pass !== null)
    return { run: run.name, build: builds[i], cited: scored.filter(Boolean).length, citable: scored.length, recorded: rows.filter(r => r.cited?.pass === true).length }
  })
  const citable = perRun[0]?.citable ?? 0
  if (perRun.some(r => r.citable !== citable)) incomplete.push('the runs have different numbers of citable questions')
  const needed = minCitedOverride ?? minCited(citable)
  const med = perRun.length ? median(perRun.map(r => r.cited)) : null
  const cited = { runs: perRun, median: med, citable, needed, pass: perRun.length < GATE_RUNS || perRun.some(r => r.citable !== citable) ? null : med >= needed }
  if (perRun.some(r => r.recorded !== r.cited)) notes.push('cited was re-scored from the answers with the current gold, and differs from the count recorded in some runs (' + perRun.map(r => `${r.recorded} recorded, ${r.cited} now`).join('; ') + ')')

  // Part 2: opax_url on every successful result of every tool that promises one.
  const expected = new Set()
  let recorded = false
  for (const run of used) for (const tool of run.report.server?.tools ?? []) if ('url_field' in tool) { recorded = true; if (tool.url_field) expected.add(tool.name) }
  const misses = [], called = new Set()
  let checked = 0, unreadable = 0, unrecorded = 0, records = 0, recordsLinked = 0
  for (const run of used) for (const row of run.report.results ?? []) for (const call of row.tool_calls ?? []) {
    if (!expected.has(call.name) || call.is_error) continue
    if (!call.urls) { unrecorded++; continue }
    if (!call.urls.readable) { unreadable++; continue }
    if (call.urls.error) continue
    checked++; called.add(call.name); records += call.urls.items; recordsLinked += call.urls.items_with_url
    if (!call.urls.top_page) misses.push({ run: run.name, question: row.id, tool: callLabel(call), link: call.urls.top })
  }
  let reason = null, linksPass = null
  if (misses.length) linksPass = false
  else if (!recorded) reason = 'these runs did not record each tool\'s output schema or each result\'s links, so the expected tools are unknown; run the current harness'
  else if (!expected.size) reason = 'no listed tool declares a page link (opax_url or url) in its output schema, so there is nothing to hold the server to'
  else if (unrecorded) reason = `${unrecorded} calls to expected tools have no recorded result links; run the current harness`
  else if (unreadable) reason = `${unreadable} results could not be read as JSON, so their links could not be checked`
  else if (!checked) reason = 'no successful call to an expected tool was recorded'
  else linksPass = true
  if (reason) incomplete.push('opax_url: ' + reason)
  const links = { measured: recorded && !unrecorded, expected: [...expected].sort(), never_called: [...expected].filter(name => !called.has(name)).sort(), checked, misses, unreadable, unrecorded, record_links: { records, with_link: recordsLinked }, reason, pass: linksPass }

  const failed = cited.pass === false || links.pass === false
  const verdict = failed ? 'FAIL' : cited.pass === true && links.pass === true && !incomplete.length ? 'PASS' : 'INCOMPLETE'
  return { verdict, cited, opax_url: links, incomplete, notes }
}

const yesNo = pass => pass === null ? 'NOT MEASURED' : pass ? 'pass' : 'FAIL'
export function renderGate(gate) {
  const { cited, opax_url: links } = gate
  const out = [`GATE ${gate.verdict}`, '',
    `1. cited: median of ${cited.runs.length} runs = ${cited.median}/${cited.citable}, needs ${cited.needed}/${cited.citable}: ${yesNo(cited.pass)}`,
    ...cited.runs.map(r => `   ${r.run}  ${r.cited}/${r.citable}  (${r.build})`), '',
    `2. opax_url: ${links.checked} successful calls to ${links.expected.length} tools that promise a page link: ${links.misses.length} without one: ${yesNo(links.pass)}`]
  if (links.reason) out.push('   not measured: ' + links.reason)
  for (const m of links.misses) out.push(`   MISS ${m.tool} (${m.question}, ${m.run}): ${m.link === null ? 'no opax_url or url' : 'not a page: ' + m.link}`)
  if (links.expected.length) out.push(`   expected: ${links.expected.join(', ')}`)
  if (links.never_called.length) out.push(`   not exercised by these runs: ${links.never_called.join(', ')}`)
  if (links.record_links.records) out.push(`   record-level links (not gated): ${links.record_links.with_link} of ${links.record_links.records} records`)
  if (gate.incomplete.length) out.push('', 'Incomplete:', ...gate.incomplete.map(line => '   ' + line))
  if (gate.notes.length) out.push('', 'Notes:', ...gate.notes.map(line => '   ' + line))
  return out.join('\n') + '\n'
}
export const exitCode = gate => gate.verdict === 'PASS' ? 0 : gate.verdict === 'FAIL' ? 1 : 2

function cli(argv) {
  const files = []; const opts = { questions: join(here, 'questions.json') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined) throw new Error('Missing value for ' + a); return v }
    if (a === '--questions') opts.questions = resolve(next())
    else if (a === '--min-cited') opts.min = Number(next())
    else if (a === '--allow-mixed-builds') opts.mixed = true
    else if (a === '--out') opts.out = resolve(next())
    else if (a === '--help' || a === '-h') { console.log('Usage: node gate.mjs <run.json> <run.json> <run.json> [--questions q.json] [--min-cited n] [--allow-mixed-builds] [--out gate.json]'); return 0 }
    else if (a.startsWith('--')) throw new Error('Unknown option ' + a)
    else files.push(resolve(a))
  }
  const gate = evaluateGate({ runs: files.map(file => ({ name: basename(file).replace(/\.json$/, ''), report: JSON.parse(readFileSync(file, 'utf8')) })), questions: JSON.parse(readFileSync(opts.questions, 'utf8')).questions, minCitedOverride: Number.isFinite(opts.min) ? opts.min : undefined, allowMixedBuilds: !!opts.mixed })
  if (opts.out) writeFileSync(opts.out, JSON.stringify(gate, null, 1))
  process.stdout.write(renderGate(gate))
  return exitCode(gate)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = cli(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 2 }
}
