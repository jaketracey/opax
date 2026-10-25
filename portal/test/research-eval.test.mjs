// Offline tests for the research-loop eval harness: fixture validity, grading on canned payloads,
// usage and percentiles, the production guard, no-retry fetching, and the CLI end to end. No network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { plainNumbers, gradeRow, usageOf, percentile, summarise, renderMarkdown, sentencesOf, quoteCheck, causalCheck, answerStyleChecks } from '../../scripts/research_eval_grade.mjs'
import { parseArgs, guardBase, requestFor, runOne, runEval, loadQuestions, DEFAULT_LIMIT, MAX_LIMIT } from '../../scripts/research_eval.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const run = promisify(execFile)
const evals = JSON.parse(await readFile(resolve(root, 'portal/test/fixtures/research-evals.json'), 'utf8'))
const canned = JSON.parse(await readFile(resolve(root, 'portal/test/fixtures/research-evals-canned.json'), 'utf8')).rows
const roster = ['Andrew Wilkie', 'Penny Wong', 'Jacqui Lambie', 'Anthony Albanese', 'Peter Dutton', 'David Pocock', 'Barnaby Joyce']
const parties = new Map([['andrew wilkie', 'Independent'], ['penny wong', 'Labor'], ['jacqui lambie', 'JLN'], ['anthony albanese', 'Labor'], ['peter dutton', 'Liberal'], ['david pocock', 'Independent'], ['barnaby joyce', 'Nationals']])
const q = (id) => evals.questions.find((x) => x.id === id)
const payload = (id, mode) => canned.find((r) => r.id === id && r.mode === mode).payload
const grade = (id, mode) => gradeRow(q(id), payload(id, mode), { roster, parties })

test('the eval set is small, mixed, complete and routes as declared', async () => {
  assert.equal(evals.schema, 1)
  assert.ok(evals.questions.length >= 10 && evals.questions.length <= 21, `${evals.questions.length} questions`)
  assert.equal(new Set(evals.questions.map((x) => x.id)).size, evals.questions.length)
  assert.ok(evals.questions.filter((x) => x.kind === 'multi_hop').length >= 6)
  assert.ok(evals.questions.filter((x) => x.kind === 'qualitative').length >= 5)
  const tools = new Set([...evals.tools.structured, ...evals.tools.research, ...evals.tools.terminal])
  for (const x of evals.questions) {
    assert.ok(x.question.trim() && x.expected_tools.length && x.must.length && Array.isArray(x.must_not) && x.rubric.usefulness && x.rubric.citations && x.rubric.correctness, x.id)
    for (const t of x.expected_tools) assert.ok(tools.has(t), `${x.id}: unknown tool ${t}`)
    for (const c of x.must) assert.ok(['mentions', 'terms', 'fact', 'years', 'names', 'period', 'caveat', 'sources', 'source_parties', 'decline'].includes(c.type), `${x.id}: unknown check ${c.type}`)
    for (const c of x.must.filter((c) => c.type === 'fact')) new RegExp(c.match, c.flags ?? '')
  }
  for (const [axis, r] of Object.entries(evals.rubric)) if (axis !== 'overall') assert.ok(r.pass && r.partial && r.fail, axis)
  // old_route is what today's classifier does, so the harness routes and the report labels are honest.
  const b = await build({ entryPoints: [resolve(root, 'portal/src/agentic-ask.ts')], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
  const { classifyAgentic } = await import('data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64'))
  for (const x of evals.questions) {
    const c = classifyAgentic(x.question)
    assert.equal(c.route === 'ask' ? 'ordinary' : c.shape, x.old_route, `${x.id}: classifier says ${c.route}/${c.shape}`)
  }
})

test('the gold set is included with --set gold and all', async () => {
  const gold = await loadQuestions('gold'), all = await loadQuestions('all')
  assert.equal(gold.length, 34); assert.ok(gold.every((x) => x.gold && x.expected))
  assert.equal(all.length, 34 + evals.questions.length)
  assert.equal((await loadQuestions('research')).length, evals.questions.length)
})

test('a planner ranking without the vote hop is partial; the loop answer with both hops passes', () => {
  const old = grade('H01', 'planner'), neu = grade('H01', 'loop')
  assert.equal(old.axes.usefulness, 'partial'); assert.deepEqual(old.parts.names, ['ranking']); assert.equal(old.overall, 'fail')
  assert.equal(old.axes.citations, 'pass'); assert.deepEqual(old.flags, [])
  assert.deepEqual(neu.axes, { coherence:'fail', usefulness: 'pass', citations: 'pass', correctness: 'pass', constraints: 'pass', decline: 'pass', no_tool_echo:'pass',no_duplicates:'pass',direct_first_sentence:'fail',required_components:'n/a' }); assert.equal(neu.overall, 'fail')
  assert.equal(neu.tools.status, 'pass'); assert.equal(neu.tools.mode, 'loop'); assert.equal(neu.tools.rounds, 2)
  assert.ok(neu.evidence_complete && old.evidence_complete)
  assert.equal(neu.figures.unbound.length, 0)
})

test('a trend without a leader is partial; the loop names a roster leader bound to a fact', () => {
  const old = grade('H02', 'planner'), neu = grade('H02', 'loop')
  assert.equal(old.axes.usefulness, 'partial'); assert.equal(old.checks.find((c) => c.type === 'names').status, 'fail')
  assert.equal(neu.overall, 'fail'); assert.deepEqual(neu.names.bound, ['Andrew Wilkie']); assert.deepEqual(neu.names.unbound, [])
  assert.equal(neu.checks.find((c) => c.type === 'years').detail, '12 distinct years')
})

test('ordinary prose with a verbatim quotation and cited figure sentence passes on both engines', () => {
  for (const mode of ['planner', 'loop']) {
    const g = grade('Q01', mode)
    assert.equal(g.overall, 'pass', JSON.stringify(g.flags))
    assert.deepEqual(g.quotes, { total: 1, found: 1, missing: [] })
    assert.equal(g.citations.figure_sentences, 1); assert.equal(g.citations.figure_sentences_cited, 1)
    assert.equal(g.evidence_complete, false)
  }
  assert.equal(grade('Q01', 'loop').tools.status, 'pass'); assert.equal(grade('Q01', 'planner').tools.status, 'unknown')
})

test('a refusal fails usefulness; an uncited invented figure fails correctness', () => {
  const old = grade('Q02', 'planner'), neu = grade('Q02', 'loop')
  assert.equal(old.overall, 'fail'); assert.equal(old.axes.usefulness, 'fail'); assert.equal(old.axes.citations, 'n/a'); assert.ok(old.flags.includes('refused or declined'))
  assert.equal(neu.axes.usefulness, 'pass'); assert.equal(neu.axes.citations, 'partial'); assert.equal(neu.axes.correctness, 'fail'); assert.equal(neu.overall, 'fail')
  assert.deepEqual(neu.figures.unbound_uncited, [147]); assert.ok(neu.flags.some((f) => f.startsWith('unbound figure 147')))
  assert.equal(neu.checks.find((c) => c.part === 'over_time').status, 'pass')
})

test('money answers: the no-causation note is accepted, causal prose is not', () => {
  const old = grade('H05', 'planner'), neu = grade('H05', 'loop')
  assert.equal(old.axes.correctness, 'pass', JSON.stringify(old.flags)); assert.equal(old.axes.direct_first_sentence,'fail'); assert.deepEqual(old.causal, [])
  assert.equal(neu.axes.correctness, 'fail'); assert.equal(neu.overall, 'fail'); assert.ok(neu.flags.some((f) => f.startsWith('causal wording')))
  assert.equal(old.checks.find((c) => c.part === 'donors').status, 'pass'); assert.equal(old.checks.find((c) => c.type === 'period').status, 'pass')
})

test('gold rows reuse the deterministic gold scorer and the generic grounding checks', () => {
  const gold = { id: 'R-fixture', gold: true, question: 'Who spoke most about gambling?', expected: { kind: 'ranking', top: [{ name: 'Andrew Wilkie', count: 9 }], top_n: 1 }, expected_tools: [] }
  const ok = { answered: true, answer: 'Andrew Wilkie: 9 speeches about gambling.', citations: { 'fact-1/t/body/0': [[0, 40]] }, sources: [{ resource: 'fact-1', title: 'Andrew Wilkie: 9 speeches about gambling', snippet: 'Andrew Wilkie: 9 speeches about gambling', kind: 'count', url: 'https://opax.com.au/search', cited: true }] }
  const g = gradeRow(gold, ok, { roster })
  assert.equal(g.gold.pass, true); assert.equal(g.overall, 'fail');assert.equal(g.axes.direct_first_sentence,'fail')
  const wrong = gradeRow(gold, { ...ok, answer: 'Penny Wong: 12 speeches about gambling.' }, { roster })
  assert.equal(wrong.axes.correctness, 'fail'); assert.ok(wrong.flags.some((f) => f.startsWith('unbound figure 12')) && wrong.flags.includes('unbound name Penny Wong'))
  const declined = { id: 'P-fixture', gold: true, question: 'Which parties speak most about agriculture in the NSW Parliament?', expected: { kind: 'decline' }, expected_tools: [] }
  assert.equal(gradeRow(declined, { answered: false, answer: '', citations: {}, sources: [] }, { roster }).overall, 'pass')
})

test('usage: reported cost wins, otherwise tokens are priced, otherwise missing', () => {
  assert.deepEqual(usageOf({ research: { usage: { input: 1000, output: 100, cost_usd: 0.02 } } }), { input: 1000, output: 100, total: 1100, cost_usd: 0.02, cost_source: 'reported' })
  const est = usageOf({ usage: { prompt_tokens: 10000, completion_tokens: 1000 } })
  assert.equal(est.cost_source, 'estimated'); assert.ok(Math.abs(est.cost_usd - (10000 * 0.44 + 1000 * 1.32) / 1e6) < 1e-12)
  assert.equal(usageOf({ agentic: { tokens: { input: 2000, output: 200 } } }, { input: 1, output: 2 }).cost_usd, (2000 + 400) / 1e6)
  assert.deepEqual(usageOf({ answer: 'x' }), { input: null, output: null, total: null, cost_usd: null, cost_source: 'missing' })
  assert.equal(usageOf(payload('H01', 'planner')).cost_source, 'missing'); assert.equal(usageOf(payload('H01', 'loop')).cost_usd, 0.0193)
})

test('percentiles are nearest-rank and the summary carries latency, tokens and cost per mode', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3); assert.equal(percentile([5, 1, 3, 2, 4], 95), 5); assert.equal(percentile([], 50), null)
  const rows = canned.map((r) => ({ id: r.id, mode: r.mode, ms: r.ms, usage: usageOf(r.payload), grade: gradeRow(q(r.id), r.payload, { roster, parties }) }))
  rows.push({ id: 'Q07', mode: 'loop', ms: 0, error: 'missing fixture' })
  const s = summarise(rows)
  assert.equal(s.planner.n, 5); assert.equal(s.loop.n, 6); assert.equal(s.loop.errors, 1)
  assert.deepEqual(s.planner.overall, { pass: 1, partial: 0, fail: 4 }); assert.deepEqual(s.loop.overall, { pass: 1, partial: 0, fail: 4 })
  assert.equal(s.loop.cost_usd.reported, 5); assert.equal(s.planner.cost_usd.missing, 5); assert.equal(s.planner.cost_usd.mean, null)
  assert.equal(s.loop.latency_ms.p50, 24900); assert.equal(s.loop.tokens.p95, 61980); assert.equal(s.loop.mode_mismatch, 0)
})

test('the markdown report puts both answers side by side with grades, latency, cost and tools', async () => {
  const fixture = canned
  const { report } = await runEval({ questions: evals.questions, modes: ['planner', 'loop'], fixture, limit: 13, roster, parties, set: 'research' })
  const md = renderMarkdown(report)
  assert.match(md, /## Summary/); assert.match(md, /\| planner \| 13 \| 8 \|/); assert.match(md, /\| loop \| 13 \| 8 \|/)
  assert.match(md, /### H01 · multi_hop · ranking\+vote/); assert.match(md, /\*\*planner answer\*\*/); assert.match(md, /\*\*loop answer\*\*/)
  assert.match(md, /\| overall \| fail \| fail \|/); assert.match(md, /count_speeches → member_votes → finish → pass \(loop, 2\)/)
  assert.match(md, /error: missing fixture/); assert.match(md, /Judge: _old vs new, one line_/)
  assert.match(md, /Rubric — usefulness:/)
})

test('the base guard refuses production without --prod, reserved ports and remote http', () => {
  assert.throws(() => guardBase('https://opax.com.au'), /production/)
  assert.throws(() => guardBase('https://staging.opax.com.au'), /production/)
  assert.equal(guardBase('https://opax.com.au', { prod: true }).hostname, 'opax.com.au')
  assert.throws(() => guardBase('http://127.0.0.1:8910'), /Reserved/); assert.throws(() => guardBase('http://localhost:8961'), /Reserved/)
  assert.throws(() => guardBase('http://example.com'), /HTTPS/); assert.throws(() => guardBase('nonsense'), /not a URL/)
  assert.equal(guardBase('http://127.0.0.1:8962').port, '8962')
})

test('arguments: limit defaults to 12 and is capped, modes and sets are closed, unknown flags fail', () => {
  const o = parseArgs(['http://127.0.0.1:8962'])
  assert.equal(parseArgs(['http://127.0.0.1:8962','--interval','4000']).intervalMs,4000)
  assert.throws(()=>parseArgs(['http://127.0.0.1:8962','--interval','-1']),/interval/)
  assert.equal(o.limit, DEFAULT_LIMIT); assert.equal(DEFAULT_LIMIT, 12); assert.deepEqual(o.modes, ['planner', 'loop']); assert.equal(o.set, 'research'); assert.equal(o.route, 'auto'); assert.equal(o.prod, false)
  assert.throws(() => parseArgs(['http://127.0.0.1:8962', '--limit', String(MAX_LIMIT + 1)]), /--limit/)
  assert.throws(() => parseArgs(['http://127.0.0.1:8962', '--limit', '0']), /--limit/)
  assert.throws(() => parseArgs(['http://127.0.0.1:8962', '--mode', 'all']), /--mode/)
  assert.throws(() => parseArgs(['http://127.0.0.1:8962', '--set', 'everything']), /--set/)
  assert.throws(() => parseArgs(['http://127.0.0.1:8962', '--retries', '3']), /unknown flag/)
  assert.throws(() => parseArgs([]), /base URL/)
  assert.deepEqual(parseArgs(['--fixture', 'x.json', '--mode', 'loop', '--limit', '3']).modes, ['loop'])
  assert.equal(parseArgs(['http://127.0.0.1:8962', '--price-in', '0.5', '--price-out', '1.5']).prices.output, 1.5)
})

test('requests: ops route for classifier questions and gold when the secret is set, /api/ask otherwise, no unused research_mode body hint', () => {
  const ops = requestFor(q('H01'), 'loop', { secret: 's' })
  assert.equal(ops.path, '/api/ops/ask-gold'); assert.equal(ops.headers.authorization, 'Bearer s'); assert.equal(ops.body.research_mode, undefined); assert.equal(ops.body.period, undefined)
  const ask = requestFor(q('Q01'), 'planner', { secret: 's' })
  assert.equal(ask.path, '/api/ask'); assert.equal(ask.headers.authorization, undefined); assert.equal(ask.body.research_mode, undefined)
  assert.equal(requestFor(q('H01'), 'loop', {}).path, '/api/ask')
  assert.equal(requestFor(q('Q01'), 'loop', { route: 'ops', secret: 's' }).path, '/api/ops/ask-gold')
  assert.throws(() => requestFor(q('Q01'), 'loop', { route: 'ops' }), /DAILY_POST_OPERATOR_SECRET/)
  const gold = { id: 'R01', gold: true, question: 'Who is making the most speeches about gambling reform', old_route: 'ranking' }
  assert.equal(requestFor(gold, 'planner', { secret: 's' }).body.period, 'all')
  assert.equal(requestFor({ ...gold, question: 'Who spoke most about health in the 2010s?' }, 'planner', { secret: 's' }).body.period, undefined)
})
test('--operator and --prod choose the engine per request on /api/ask with the bearer guard',async()=>{
 assert.equal(parseArgs(['http://127.0.0.1:8962','--operator']).operator,true);
 const secret='FAKE-OPERATOR-MUST-NOT-APPEAR-IN-REPORTS',calls=[];
 for(const policy of [{operator:true},{prod:true}])for(const mode of ['planner','loop']){
  const request=requestFor(q('H01'),mode,{...policy,route:'ops',secret});assert.equal(request.path,'/api/ask');assert.equal(request.headers.authorization,'Bearer '+secret);assert.equal(request.headers['x-opax-research'],mode==='loop'?'loop':'old');assert.equal(request.body.research_mode,undefined);
  assert.throws(()=>requestFor(q('H01'),mode,policy),/DAILY_POST_OPERATOR_SECRET/);
 }
 const result=await runEval({questions:[q('H01')],modes:['planner','loop'],bases:{planner:'http://127.0.0.1:8962',loop:'http://127.0.0.1:8962'},operator:true,secret,fetchImpl:async(url,init)=>{calls.push({url:String(url),headers:init.headers});return Response.json(payload('H01',init.headers['x-opax-research']==='loop'?'loop':'planner'))},roster,parties});
 assert.deepEqual(calls.map(c=>c.headers['x-opax-research']),['old','loop']);assert.ok(calls.every(c=>c.url.endsWith('/api/ask')));assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
})

test('one fetch per question and mode; failures are recorded, never re-sent; prod is never contacted', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.href, body: JSON.parse(init.body) })
    if (calls.length === 1) throw Object.assign(new Error('boom'), { name: 'TypeError' })
    if (calls.length === 2) return new Response('{"error":"outside"}', { status: 409 })
    return Response.json(payload('H01', 'loop'))
  }
  const { rows, summary } = await runEval({ questions: [q('H01'), q('Q01')], modes: ['planner', 'loop'], bases: { planner: 'http://127.0.0.1:8962/', loop: 'http://127.0.0.1:8963/' }, route: 'auto', secret: 's', fetchImpl, limit: 12, roster, parties, set: 'research' })
  assert.equal(calls.length, 4); assert.equal(rows.length, 4)
  assert.equal(rows[0].error, 'network'); assert.equal(rows[1].error, 'HTTP 409'); assert.ok(rows[2].grade && rows[3].grade)
  assert.ok(calls[0].url.startsWith('http://127.0.0.1:8962/api/ops/ask-gold')); assert.ok(calls[1].url.startsWith('http://127.0.0.1:8963/api/ops/ask-gold'))
  assert.ok(calls[2].url.startsWith('http://127.0.0.1:8962/api/ask')); assert.ok(calls[3].url.startsWith('http://127.0.0.1:8963/api/ask'))
  assert.ok(calls.every(c => c.body.research_mode === undefined))
  assert.equal(summary.planner.errors, 1); assert.equal(summary.loop.errors, 1)
  const limited = await runEval({ questions: evals.questions, modes: ['loop'], fixture: canned, limit: 2, roster, parties, set: 'research' })
  assert.equal(limited.rows.length, 2)
  const slow = await runOne({ q: q('H01'), mode: 'loop', base: 'http://127.0.0.1:8962/', route: 'ask', fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))), timeoutMs: 1000 })
  assert.equal(slow.error, 'timeout')
})

test('the CLI runs offline against the canned payloads and writes JSON and markdown under the out dir', async () => {
  const out = await mkdtemp(join(tmpdir(), 'research-evals-'))
  try {
    const { stdout } = await run(process.execPath, [resolve(root, 'scripts/research_eval.mjs'), '--fixture', resolve(root, 'portal/test/fixtures/research-evals-canned.json'), '--mode', 'both', '--limit', '13', '--out', out], { cwd: root })
    const line = JSON.parse(stdout.trim().split('\n').at(-1))
    assert.equal(line.questions, 13); assert.deepEqual(line.modes, ['planner', 'loop'])
    assert.equal(line.summary.planner.errors, 8); assert.equal(line.summary.loop.pass, 1); assert.equal(line.summary.loop.fail, 4)
    assert.equal(line.summary.loop.p50_ms, 24900); assert.ok(line.summary.loop.mean_cost_usd > 0.02 && line.summary.loop.mean_cost_usd < 0.03)
    const files = await readdir(out)
    assert.equal(files.filter((f) => f.endsWith('.json')).length, 1); assert.equal(files.filter((f) => f.endsWith('.md')).length, 1)
    assert.ok(files.every((f) => f.includes('-research-planner+loop.')))
    const md = await readFile(join(out, files.find((f) => f.endsWith('.md'))), 'utf8')
    assert.match(md, /## Side by side/); assert.match(md, /Base: offline fixture/)
    const json = JSON.parse(await readFile(join(out, files.find((f) => f.endsWith('.json'))), 'utf8'))
    assert.equal(json.questions.length, 13); assert.equal(json.summary.loop.n, 13)
  } finally { await rm(out, { recursive: true, force: true }) }
})

test('the CLI refuses production without --prod before any request, and writes nothing', async () => {
  const out = await mkdtemp(join(tmpdir(), 'research-evals-'))
  try {
    await assert.rejects(run(process.execPath, [resolve(root, 'scripts/research_eval.mjs'), 'https://opax.com.au', '--mode', 'loop', '--out', out], { cwd: root }), (e) => e.code === 1 && /production without --prod/.test(e.stderr))
    assert.deepEqual(await readdir(out), [])
  } finally { await rm(out, { recursive: true, force: true }) }
})

test('sentence offsets are code points and quotations tolerate ellipses and punctuation', () => {
  const s = sentencesOf('Café: 12 speeches; Labor: 3 speeches. Done.')
  assert.deepEqual(s.map((x) => [x.start, x.end]), [[0, 17], [19, 37], [38, 43]])
  assert.deepEqual(quoteCheck('She said "we will act on this, and we will act on it quickly … without delay".', ['We will act on this — and we will act on it quickly, carefully, and without delay.']), { total: 1, found: 1, missing: [] })
  assert.equal(quoteCheck('She said "we will never act on this, whatever the cost may be".', ['we will act on this']).missing.length, 1)
})

test('routing fixture, detached baseline selection and the spend ceiling are explicit', async () => {
  assert.ok((await loadQuestions('routing')).length >= 40)
  const request=requestFor({question:'Who is the highest paid politician?'},'planner',{operator:true,baselineLoop:true,secret:'fixture-only'})
  assert.equal(request.headers['x-opax-research'],'loop')
  assert.equal(request.headers['x-opax-nocache'],'1')
  assert.throws(()=>parseArgs(['http://127.0.0.1:8963','--spend-cap','NaN']),/spend-cap/)
  const {rows,report}=await runEval({questions:[q('H01'),q('H02')],modes:['loop'],bases:{loop:'http://127.0.0.1:8963'},spendCap:0.5,fetchImpl:()=>{throw Error('must not spend past admission')}})
  assert.equal(rows.length,0);assert.equal(report.stopped,'spend_cap')
})

test('a bounded request reservation keeps an unknown-cost failure charged and stops subsequent calls',async()=>{
 let calls=0
 const {rows,report}=await runEval({questions:[q('H01'),q('H02')],modes:['loop'],bases:{loop:'http://127.0.0.1:8963'},spendCap:0.22,requestReserveUsd:0.2,fetchImpl:async()=>{calls++;return new Response('local failure',{status:503})}})
 assert.equal(calls,1);assert.equal(rows.length,1);assert.equal(report.spent_upper_estimate,0.2);assert.equal(report.stopped,'spend_cap')
})

test('a legacy evidence-gap refusal is recognised, and date formatting is not an invented count', () => {
 const payload={answer:'This selection does not establish their position on that topic.',sources:[],citations:{}}
 assert.equal(gradeRow({question:'Which seat?',expected:{kind:'decline'},must:[{type:'decline'}]},payload).overall,'pass')
 assert.equal(gradeRow({question:'Who spoke most?',must:[]},payload).overall,'fail')
 assert.deepEqual(plainNumbers('Since 26 July 2022 and 2023–24: 150 speeches.'),[2022,2023,150])
})

test('gold fixture unanswerable reason strings expect a correct decline',()=>{
 assert.equal(gradeRow({question:'A missing profile?',expected:{unanswerable:'no_demographic_data'},must:[{type:'decline'}]},{answered:false,answer:'The record cannot establish that value.',sources:[]}).overall,'pass')
})

test('historical chamber limitations are graded as explicit declines',()=>{
 const answer="The export does not date chamber changes. A historical chamber ranking cannot be established from its current roster labels."
 assert.equal(gradeRow({question:'Highest paid senator in 2005?',expected:{unanswerable:'historical chamber membership unavailable'},must:[{type:'decline'}]},{answer,citations:{},sources:[]}).overall,'pass')
})
test('since constraints accept attributed dated evidence after the start without restating the boundary',()=>{
 const payload={answer:'Taylor Example spoke about housing in 2022.',citations:{s:[[0,49]]},sources:[{resource:'s',kind:'speech',speaker:'Taylor Example',date:'2022-07-01',cited:true,snippet:'Taylor Example spoke about housing in 2022.'}]}
 const question={question:'Housing since 2010?',must:[{type:'constraint',years:[2010],open_end:true}]}
 assert.equal(gradeRow(question,payload).axes.constraints,'pass')
 assert.equal(gradeRow(question,{...payload,sources:[{...payload.sources[0],date:'2009-07-01'}]}).axes.constraints,'fail')
 assert.equal(gradeRow(question,{...payload,sources:[{...payload.sources[0],date:undefined}]}).axes.constraints,'fail')
})

test('a plural-subject denial of causation is not an allegation',()=>{
 assert.deepEqual(causalCheck('The records do not establish that money caused votes or speeches.'),[]);
 assert.equal(causalCheck('The money caused votes.').length,1);
});

test('date days in both prose orders are not invented financial figures',()=>{
 assert.deepEqual(plainNumbers('Paid $277,602 until June 30, 2005 and $288,990 from July 1.'),[277602,2005,288990]);
 assert.deepEqual(plainNumbers('Paid $277,602 until 30 June 2005 and $288,990 from 1 July.'),[277602,2005,288990]);
});

test('direct prose can use rose or cited while a raw numeric row cannot',()=>{
 assert.equal(answerStyleChecks('What was the salary?',"Robin Example's salary rose from $100,000 to $120,000.").direct_first_sentence,'pass');
 assert.equal(answerStyleChecks('What did Robin Example say?','Robin Example cited the earlier housing reform as a precedent.').direct_first_sentence,'pass');
 assert.equal(answerStyleChecks('What was the salary?','Robin Example: $100,000 annual salary.').direct_first_sentence,'fail');
 assert.equal(answerStyleChecks('What was the salary?','Robin Example is the highest paid: $100,000 a year.').direct_first_sentence,'pass');
 assert.equal(answerStyleChecks('Who spoke most and what did the funding cost?','Robin Example led with 9 speeches. The funding cost $10,000.').direct_first_sentence,'pass');
});
