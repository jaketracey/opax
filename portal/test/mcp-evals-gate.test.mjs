import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateGate, renderGate, exitCode, minCited } from '../scripts/mcp-evals/gate.mjs'
import { isPageUrl, resultUrls, parseStream } from '../scripts/mcp-evals/score.mjs'

const runner = fileURLToPath(new URL('../scripts/mcp-evals/run.mjs', import.meta.url))

test('page links: an opax.com.au page counts; data files, API paths, other sites and relative paths do not', () => {
  for (const good of ['https://opax.com.au/bill/au-federal-r6970', 'https://opax.com.au/money?jur=federal&party=party%3ALabor', 'https://staging.opax.com.au/methods', 'https://www.opax.com.au/']) assert.equal(isPageUrl(good), true, good)
  for (const bad of ['https://opax.com.au/corpus.json', 'https://opax.com.au/royal-commissions/commission-cth-robodebt.json', 'https://opax.com.au/api/resource/speech-1', 'https://example.com/bill/x', 'http://opax.com.au/bill/x', '/bill/x', '', null, undefined, 7]) assert.equal(isPageUrl(bad), false, String(bad))
})

test('result links: the page link of paged and record-set results, and how many records carry one', () => {
  const paged = resultUrls(JSON.stringify({ items: [{ url: 'https://opax.com.au/a' }, { url: 'https://opax.com.au/b.json' }, { title: 'x' }], total: 3, url: 'https://opax.com.au/search' }))
  assert.deepEqual(paged, { readable: true, error: false, top: 'https://opax.com.au/search', top_page: true, items: 3, items_with_url: 1 })
  const record = resultUrls(JSON.stringify({ rows: [], citations: [], notes: [], opax_url: 'https://opax.com.au/methods' }))
  assert.equal(record.top_page, true); assert.equal(record.items, 0)
  assert.equal(resultUrls(JSON.stringify({ rows: [], opax_url: 'https://opax.com.au/x.json' })).top_page, false)
  assert.equal(resultUrls(JSON.stringify({ rows: [{ href: '/bill/x' }] })).top, null)
  assert.equal(resultUrls(JSON.stringify({ error: 'not found' })).error, true)
  assert.equal(resultUrls('not json').readable, false); assert.equal(resultUrls('[1]').readable, false)
})

test('stream parsing records the links of each tool result', () => {
  const body = JSON.stringify({ items: [], total: 0, next_cursor: null, notes: [], url: 'https://opax.com.au/search' })
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__opax__bill_search', input: {} }, { type: 'tool_use', id: 't2', name: 'mcp__opax__query_register', input: { register: 'grants' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: body }] }, { type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'bad' }] } },
  ].map(l => JSON.stringify(l)).join('\n')
  const calls = parseStream(lines, 'opax').tool_calls
  assert.equal(calls[0].urls.top_page, true); assert.equal(calls[1].urls.readable, false)
})

// Synthetic runs over a synthetic question set: 35 citable questions and one that is not.
const questions = [...Array(35)].map((_, i) => ({ id: 'q' + i, category: 'c', question: 'q', gold: { facts: ['f'], urls: [`https://opax.com.au/p/${i}`] } })).concat([{ id: 'oos', category: 'adversarial', question: 'q', gold: { facts: ['f'] } }])
const listed = [{ name: 'a', url_field: 'url' }, { name: 'b', url_field: 'opax_url' }, { name: 'c', url_field: null }]
const linked = { readable: true, error: false, top: 'https://opax.com.au/m', top_page: true, items: 2, items_with_url: 2 }
let clock = 0
function makeRun({ cited = 35, sha = 'abc1234', warning, calls, tools = listed, drop = 0 } = {}) {
  const results = questions.map((q, i) => ({
    id: q.id, answer: q.gold.urls && i < cited ? `See ${q.gold.urls[0]}` : 'no link', cited: { pass: q.gold.urls ? i < cited : null },
    tool_calls: calls ?? [{ name: 'a', args: {}, is_error: false, result_bytes: 10, urls: linked }],
  })).slice(0, questions.length - drop)
  return { name: 'run' + (++clock), report: { meta: { started: `2026-11-14T10:${String(clock).padStart(2, '0')}:00Z`, sha, base: 'https://staging.opax.com.au/mcp', ...(warning ? { warning } : {}) }, server: { tools }, results } }
}
const gate = (runs, extra = {}) => evaluateGate({ runs, questions, ...extra })

test('threshold: 33 of 35, scaled to the number of citable questions without rounding error', () => {
  assert.equal(minCited(35), 33); assert.equal(minCited(38), 36); assert.equal(minCited(10), 10); assert.equal(minCited(70), 66)
})

test('gate passes when the median of 3 runs is 33 of 35 and every link is there', () => {
  const g = gate([makeRun({ cited: 33 }), makeRun({ cited: 35 }), makeRun({ cited: 33 })])
  assert.equal(g.verdict, 'PASS'); assert.equal(g.cited.median, 33); assert.equal(exitCode(g), 0)
  assert.deepEqual(g.opax_url.expected, ['a', 'b']); assert.deepEqual(g.opax_url.never_called, ['b'])
  assert.match(renderGate(g), /^GATE PASS/)
})
test('the median, not the mean, decides: one bad run does not sink a build, one lucky run does not carry it', () => {
  assert.equal(gate([makeRun({ cited: 35 }), makeRun({ cited: 35 }), makeRun({ cited: 28 })]).verdict, 'PASS')
  const g = gate([makeRun({ cited: 35 }), makeRun({ cited: 30 }), makeRun({ cited: 30 })])
  assert.equal(g.verdict, 'FAIL'); assert.equal(g.cited.median, 30); assert.equal(exitCode(g), 1)
})
test('the latest 3 runs are used when more are given', () => {
  const g = gate([makeRun({ cited: 20 }), makeRun({ cited: 34 }), makeRun({ cited: 34 }), makeRun({ cited: 34 })])
  assert.equal(g.verdict, 'PASS'); assert.equal(g.cited.runs.length, 3)
})

test('a successful result without a page link fails the gate even when cited passes', () => {
  const miss = { name: 'a', args: {}, is_error: false, result_bytes: 10, urls: { ...linked, top: 'https://opax.com.au/royal-commissions/x.json', top_page: false } }
  const g = gate([makeRun({ calls: [miss] }), makeRun(), makeRun()])
  assert.equal(g.verdict, 'FAIL'); assert.equal(g.cited.pass, true); assert.equal(g.opax_url.misses.length, questions.length)
  assert.match(renderGate(g), /MISS a \(q0, run\d+\): not a page: https:\/\/opax.com.au\/royal-commissions\/x.json/)
  const none = { name: 'b', args: {}, is_error: false, result_bytes: 10, urls: { ...linked, top: null, top_page: false } }
  assert.equal(gate([makeRun({ calls: [none] }), makeRun(), makeRun()]).opax_url.misses[0].link, null)
})
test('a dispatcher call is named with its register in a miss', () => {
  const miss = { name: 'a', args: { register: 'grants' }, is_error: false, result_bytes: 10, urls: { ...linked, top: null, top_page: false } }
  assert.equal(gate([makeRun({ calls: [miss] }), makeRun(), makeRun()]).opax_url.misses[0].tool, 'a:grants')
})
test('only tools whose schema promises a link are held to it; errors are not', () => {
  const none = { readable: true, error: false, top: null, top_page: false, items: 0, items_with_url: 0 }
  const calls = [{ name: 'c', args: {}, is_error: false, result_bytes: 10, urls: none }, { name: 'a', args: {}, is_error: true, result_bytes: 10, urls: none }, { name: 'a', args: {}, is_error: false, result_bytes: 10, urls: { ...none, error: true } }, { name: 'a', args: {}, is_error: false, result_bytes: 10, urls: linked }]
  const g = gate([makeRun({ calls }), makeRun({ calls }), makeRun({ calls })])
  assert.equal(g.verdict, 'PASS'); assert.equal(g.opax_url.checked, 3 * questions.length)
})

test('INCOMPLETE is never a pass: too few runs, mixed builds, rate-limited runs, partial runs', () => {
  assert.equal(gate([makeRun(), makeRun()]).verdict, 'INCOMPLETE')
  const mixed = gate([makeRun({ sha: 'aaa' }), makeRun({ sha: 'bbb' }), makeRun({ sha: 'aaa' })])
  assert.equal(mixed.verdict, 'INCOMPLETE'); assert.match(mixed.incomplete[0], /different builds/); assert.equal(exitCode(mixed), 2)
  const allowed = gate([makeRun({ sha: 'aaa' }), makeRun({ sha: 'bbb' }), makeRun({ sha: 'aaa' })], { allowMixedBuilds: true })
  assert.equal(allowed.verdict, 'PASS'); assert.match(allowed.notes.join(' '), /MIXED BUILDS/)
  assert.equal(gate([makeRun(), makeRun({ warning: '3 questions were rate-limited' }), makeRun()]).verdict, 'INCOMPLETE')
  const partial = gate([makeRun(), makeRun({ drop: 5 }), makeRun()])
  assert.equal(partial.verdict, 'INCOMPLETE'); assert.match(partial.incomplete.join(' '), /does not answer/)
})
test('a miss still fails when the runs are otherwise incomplete', () => {
  const miss = { name: 'a', args: {}, is_error: false, result_bytes: 10, urls: { ...linked, top: null, top_page: false } }
  assert.equal(gate([makeRun({ calls: [miss] }), makeRun()]).verdict, 'FAIL')
})
test('runs from before result links were recorded cannot pass part 2', () => {
  const old = { name: 'a', args: {}, is_error: false, result_bytes: 10 }
  const noSchemas = listed.map(({ name }) => ({ name }))
  const g = gate([makeRun({ calls: [old], tools: noSchemas }), makeRun({ calls: [old], tools: noSchemas }), makeRun({ calls: [old], tools: noSchemas })])
  assert.equal(g.verdict, 'INCOMPLETE'); assert.equal(g.opax_url.pass, null); assert.equal(g.cited.pass, true)
  assert.match(renderGate(g), /NOT MEASURED/)
  const withSchemas = gate([makeRun({ calls: [old] }), makeRun({ calls: [old] }), makeRun({ calls: [old] })])
  assert.equal(withSchemas.verdict, 'INCOMPLETE'); assert.match(withSchemas.incomplete.join(' '), /no recorded result links/)
})
test('a build whose schemas promise no link has nothing to be held to, and is not a pass', () => {
  const g = gate([makeRun({ tools: [{ name: 'a', url_field: null }] }), makeRun({ tools: [{ name: 'a', url_field: null }] }), makeRun({ tools: [{ name: 'a', url_field: null }] })])
  assert.equal(g.verdict, 'INCOMPLETE'); assert.match(g.incomplete.join(' '), /nothing to hold the server to/)
})
test('results that cannot be read as JSON are reported, not assumed good', () => {
  const unreadable = { name: 'a', args: {}, is_error: false, result_bytes: 10, urls: { readable: false } }
  const g = gate([makeRun({ calls: [unreadable] }), makeRun(), makeRun()])
  assert.equal(g.verdict, 'INCOMPLETE'); assert.equal(g.opax_url.unreadable, questions.length)
})

// End to end, offline: a stub `claude` and a local fake MCP server stand in for the real ones.
const STUB = `#!/usr/bin/env node
let input = ''
process.stdin.on('data', d => { input += d }).on('end', () => {
  if (process.argv.includes('json')) return console.log(JSON.stringify({ result: JSON.stringify({ verdict: 'correct', missing: [], wrong: [], reason: 'ok' }) }))
  const n = (input.match(/p(\\d+)/) ?? [])[1], page = 'https://opax.com.au/p/' + n
  for (const line of [
    { type: 'system', subtype: 'init', mcp_servers: [{ name: 'opax', status: 'connected' }] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__opax__tool_a', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: JSON.stringify({ items: [{ url: page }], url: page }) }] }] } },
    { type: 'result', subtype: 'success', result: 'See ' + page, usage: { input_tokens: 5, output_tokens: 2 }, total_cost_usd: 0, num_turns: 2 },
  ]) console.log(JSON.stringify(line))
})
`
test('run.mjs --repeat 3: three runs, links captured from results, gate applied, rate held at 1 a second', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-evals-test-')), bin = join(dir, 'bin'), out = join(dir, 'out')
  mkdirSync(bin); mkdirSync(out)
  writeFileSync(join(bin, 'claude'), STUB); chmodSync(join(bin, 'claude'), 0o755)
  writeFileSync(join(dir, 'questions.json'), JSON.stringify({ version: 'test', questions: [0, 1].map(i => ({ id: 'p' + i, category: 'c', question: `What is p${i}?`, gold: { facts: ['f'], urls: [`https://opax.com.au/p/${i}`] } })) }))
  const seen = []
  const fake = createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d }).on('end', () => {
      const message = JSON.parse(body); seen.push([Date.now(), message.method])
      const result = message.method === 'tools/list'
        ? { tools: [{ name: 'tool_a', description: 'a', inputSchema: { type: 'object' }, outputSchema: { type: 'object', properties: { url: { type: 'string' }, items: { type: 'array' } } } }, { name: 'tool_b', description: 'b', inputSchema: { type: 'object' } }] }
        : { protocolVersion: '2025-06-18', serverInfo: { name: 'fake', version: '1' }, capabilities: {} }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    })
  })
  await new Promise(done => fake.listen(0, '127.0.0.1', done))
  try {
    const child = spawn(process.execPath, [runner, '--base', `http://127.0.0.1:${fake.address().port}/mcp`, '--questions', join(dir, 'questions.json'), '--out', out, '--label', 'smoke', '--sha', 'abc1234', '--repeat', '3', '--concurrency', '1', '--rate', '5'], { env: { ...process.env, PATH: bin + ':' + process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''; child.stdout.on('data', d => { stdout += d }); child.stderr.on('data', d => { stderr += d })
    const code = await new Promise(done => child.on('close', done))
    assert.equal(code, 0, stderr + stdout)
    assert.match(stdout, /GATE PASS/)
    const files = readdirSync(out)
    assert.equal(files.filter(f => /^smoke-r[123]-.*\.json$/.test(f) && !f.includes('partial')).length, 3)
    const report = JSON.parse(readFileSync(join(out, files.find(f => /^smoke-r1-.*\.json$/.test(f))), 'utf8'))
    assert.deepEqual(report.server.tools.map(t => [t.name, t.url_field]), [['tool_a', 'url'], ['tool_b', null]])
    assert.equal(report.results[0].tool_calls[0].urls.top_page, true)
    assert.equal(report.meta.rate_per_second, 1, '--rate is capped at 1 a second')
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i][0] - seen[i - 1][0] >= 950, 'requests to the server are at least about a second apart')
    assert.ok(files.some(f => /^smoke-gate-.*\.txt$/.test(f)))
    assert.ok(!JSON.stringify(report).includes('Bearer'))
  } finally { fake.close(); rmSync(dir, { recursive: true, force: true }) }
})
