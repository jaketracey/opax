import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

const built = await build({ stdin: { contents: "export * from './src/agentic-ask';export * from './src/ask-scope-intent';export * from './src/ask-exact-lookup';export * from './src/ask-constraints';export * from './src/ask-budgets';export * from './src/research-loop';export * from './src/research-writer';export * from './src/research-writing';export * from './src/research-grounding';export {getAskTool,tools as registry} from './src/tools';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
// Questions and source rows saved by down16-r2-a, except the outcome source from down16-base-a.
const saved = JSON.parse(await readFile(new URL('./fixtures/ask-r3-agentic.json', import.meta.url), 'utf8'));
const cache = new Map();
const local = async path => {
  if (!cache.has(path)) cache.set(path, readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; }));
  return structuredClone(await cache.get(path));
};
const emptyScope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false };
const dailyBudget = { reserve: async () => ({ settle: async () => {} }) };
const call = (toolName, args, toolCallId = toolName) => ({ type: 'tool-call', toolName, toolCallId, input: JSON.stringify(args) });
const reply = (content, cost = 0.001) => ({ content, finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, ...(cost == null ? {} : { providerMetadata: { openrouter: { usage: { cost } } } }), warnings: [] });
const inputFor = id => ({ question: saved[id].question, period: api.inferPeriod(saved[id].question), facts: api.writingFacts({ answer: '', citations: {}, sources: saved[id].sources }) });
const noNetwork = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Agentic unit tests must not access the network'); };
test.after(() => { globalThis.fetch = noNetwork; });

for (const [id, lead] of [
  ['DV-OUTC-012', /^The motion was defeated.*32 ayes and 34 noes/],
  ['DV-PRTY-015', /^Labor voted aye.*59 ayes and 0 noes/],
  ['DV-PRTY-036', /^Labor voted no.*0 ayes and 48 noes/],
  ['BL-STAT-013', /did not pass; it lapsed as at 11 April 2022/],
  ['TT-DIVC-012', /^2018 was the busiest year.*450 recorded divisions/],
  ['BL-INTR-024', /^On 24 November 2010, the Foreign Acquisitions/],
]) test(`${id}: saved evidence retains its requested headline through writing and grounding`, async () => {
  const input = inputFor(id);
  const result = await api.createAnswerWriter({ modelBudgetSpent: async () => { throw Error('Direct record findings require no writing model'); } })(input, { rounds: 0, tokens: { input: 0, output: 0 } }, undefined, 3000);
  const checked = api.groundAnswerPayload(result, input.question);
  assert.match(checked.answer, lead);
  assert.ok(checked.sources.some(s => s.cited));
  for (const ranges of Object.values(checked.citations)) for (const [a, b] of ranges) assert.ok(a >= 0 && b > a && b <= Array.from(checked.answer).length);
  if (id.startsWith('DV-PRTY')) assert.doesNotMatch(checked.answer, /party majority|motion was/);
});

test('TT-BILL-004: the cohort keeps numerator, denominator and share exactly once', () => {
  const input = inputFor('TT-BILL-004'), out = api.groundAnswerPayload(api.proseFallback(input), input.question);
  for (const value of ['728', '402', '55.22%']) assert.equal(out.answer.split(value).length - 1, 1);
  assert.match(out.answer, /45th Parliament/);
});

test('BL-INTR-024 and the round 2 numbered-title win: title years are never event dates', () => {
  const question = saved['BL-INTR-024'].question;
  assert.equal(api.inferPeriod(question).kind, 'all');
  assert.equal(api.requestedBillTitle(question), 'Foreign Acquisitions Amendment (Agricultural Land) Bill 2010 [2013]');
  assert.equal(api.inferPeriod(question + ' on 24 November 2010').since, '2010-11-24');
  assert.equal(api.billTitleMatches('Foreign Acquisitions Amendment (Agricultural Land) Bill 2011', api.requestedBillTitle(question)), false);
  assert.equal(api.inferPeriod('When was the Treasury Laws Amendment (2020 Measures No. 3) Bill 2020 introduced?').kind, 'all');
});

test('DV-OUTC-012: uncertainty instructions do not ask for a member speech; actual speech questions retain the guard', () => {
  assert.equal(api.isBillSpeechQuestion(saved['DV-OUTC-012'].question), false);
  assert.equal(api.isBillSpeechQuestion('What did David Gillespie say about the Register of Foreign Ownership of Agricultural Land Bill 2015?'), true);
});

test('NP-INTR-007: resolve register-only members without substituting a roster surname', async () => {
  const question = saved['NP-INTR-007'].question;
  const roster = await local('/parliamentarians.json');
  assert.deepEqual(api.extractNamedScope(question, roster, null).people, []);
  const scope = await api.resolveNamedScope(question, { asset: local });
  assert.deepEqual(scope.people, ['Bree James']);
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('declared_interests', { person: 'Tim James', category: 'real_estate' })]), reply([call('answer', { facts: [1] })])] });
  const research = Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false }), { write: undefined });
  const run = await api.runAgentic(question, { asset: local, kb: async () => ({}), origin: 'https://opax.test', research }, undefined, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, scope);
  assert.equal(run.answered, true, JSON.stringify(run.research));
  assert.match(run.answer, /Bree James.*Westcourt/);
  assert.doesNotMatch(run.answer, /Tim James|cannot establish/);
});

test('TT-SPCH-003: a misspelt speech comparison retains both parties and the count route', async () => {
  const question = saved['TT-SPCH-003'].question;
  assert.equal(api.classifyAgentic(question).shape, 'comparison');
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('count_speeches', { party: 'Greens', group_by: 'none' }, 'g'), call('count_speeches', { party: 'Nationals', group_by: 'none' }, 'n')]), reply([call('finish', { facts: [1, 2] })])] });
  const research = Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false }), { write: undefined });
  const run = await api.runAgentic(question, { asset: async () => null, origin: 'https://opax.test', kb: async () => ({ fulltext: { total: 100 } }), research }, undefined, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, { ...emptyScope, parties: ['Greens', 'Nationals'] });
  assert.equal(run.answered, true, JSON.stringify(run.research));
  assert.match(run.answer, /Greens/); assert.match(run.answer, /Nationals/);
  assert.doesNotMatch(run.answer, /position|does not establish/);
});

test('an empty first result is followed by a refined lookup and detail beyond two lookup rounds', async () => {
  const question = saved['DV-OUTC-012'].question;
  const model = new MockLanguageModelV4({ doGenerate: [
    reply([call('find_records', { query: 'Australian National Preventive Health Agency Bill 2010 In Committee', kind: 'division' })]),
    reply([call('find_records', { query: 'Australian National Preventive Health Agency', kind: 'division' })]),
    reply([call('division', { division_id: 'federal-senate-1895' })]),
    reply([call('answer', { facts: [1] })]),
  ] });
  const emptyCatalog = { fetch: async request => Response.json(new URL(request.url).pathname.endsWith('manifest.json') ? { version: '0000000000000000', count: 0, recordShardSize: 100, counts: {} } : new URL(request.url).pathname.endsWith('meta.json') ? [] : {}) };
  const research = Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false }), { write: undefined });
  const progress = [];
  const run = await api.runAgentic(question, { asset: local, origin: 'https://opax.test', research, toolEnv: { ASSETS: emptyCatalog }, kb: async () => ({ resources: {} }) }, async (_event, data) => { if (data.step) progress.push(data.step); }, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, emptyScope);
  assert.equal(run.answered, true, JSON.stringify(run.research));
  assert.match(run.answer, /32 ayes to 34 noes/);
  assert.equal(model.doGenerateCalls.length, 4);
  assert.equal(model.doGenerateCalls[2].toolChoice.type, 'required', 'a third lookup turn remains available');
  for (const tool of api.registry.filter(t => t.name !== 'find_quotes' && !t.mcpOnly)) assert.ok(model.doGenerateCalls[0].tools.some(t => t.name === (tool.askName ?? tool.name)), tool.name);
  const begun = progress.filter(s => s.state === 'running'), ended = progress.filter(s => s.state !== 'running');
  assert.deepEqual(begun.map(s => s.id).sort(), ended.map(s => s.id).sort());
  assert.equal(new Set(begun.map(s => s.id)).size, begun.length);
  assert.ok(ended.some(s => s.tool === 'division' && s.round === 3 && s.results === 1));
  assert.ok(ended.some(s => s.tool === 'find_records' && s.round === 1 && s.results === 0));
});

test('round, token, wall and dollar budgets stop inference; spend exhaustion never starts a paid fallback', async () => {
  assert.deepEqual(api.researchLimits({}), { rounds: 8, wallMs: 60_000, tokens: 256_000 });
  assert.equal(api.researchLimits({ steps: 99, wallMs: 999_999 }).wallMs, api.ASK_HARD_WALL_MS);
  const question = 'Find the public record for an unrecorded parliamentary motion';
  for (const [options, expected] of [[{ steps: 2, inputPrice: 0.1, outputPrice: 0.3 }, 'steps'], [{ tokens: 1 }, 'tokens'], [{ wallMs: 15 }, 'timeout'], [{ inputPrice: 100, outputPrice: 300 }, 'spend']]) {
    const model = new MockLanguageModelV4({ doGenerate: options.wallMs ? () => new Promise(() => {}) : Array.from({ length: 9 }, (_, i) => reply([call('search', { query: 'unrecorded motion ' + i })])) });
    const research = Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false, ...options }), { write: undefined });
    const failures = []; let fallbacks = 0;
    const run = await api.runAgentic(question, { asset: async () => null, kb: async () => ({}), research, generate: async () => { fallbacks++; throw Error('No paid fallback expected'); }, onResearchFailure: async e => failures.push(e) }, undefined, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, emptyScope);
    assert.equal(run.research.failure, expected);
    assert.equal(failures[0].reason, expected);
    assert.equal(fallbacks, 0);
    // The round cap is followed by one final answer call; the time, token and spend caps never are.
    if (expected === 'steps') assert.equal(model.doGenerateCalls.length, 3);
    if (['tokens', 'spend'].includes(expected)) assert.equal(model.doGenerateCalls.length, 0);
  }
});

test('DV-PRTY-036: a bare year is a discovery window, and dated division detail confirms its own period', () => {
  const question = saved['DV-PRTY-036'].question, c = api.extractAskConstraints(question, api.inferPeriod(question), { ...emptyScope, parties: ['Labor'] });
  const step = api.constrainStep({ tool: 'division', args: { title: 'Special Minister of State', date: '2015-01-01' } }, c, api.getAskTool('division').inputSchema.properties);
  assert.equal(step.args.date, undefined);
  assert.equal(step.args.since, '2015-01-01'); assert.equal(step.args.until, '2015-12-31');
  const result = { tool: 'division', ok: true, data: { operation: 'lookup', rows: [{ date: '2015-12-03' }] }, cite: [], notes: [] };
  const guarded = api.guardToolPeriod(result, step, c);
  assert.equal(guarded.coverage.since, '2015-12-03');
  assert.deepEqual(guarded.notes, []);
  const wrong = api.guardToolPeriod({ ...result, data: { rows: [{ date: '2016-01-01' }] } }, step, c);
  assert.equal(wrong.data.coverage_only, undefined); assert.equal(wrong.coverage.matched, false); assert.match(wrong.notes[0], /^The requested period is 2015-01-01 to 2015-12-31/);
});

test('TT-DIVC-012: loop selection retains the maximum even when the model chooses another year', async () => {
  const question = saved['TT-DIVC-012'].question;
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('count_records', { record_type: 'divisions', chamber: 'senate', since: '2010-01-01', until: '2019-12-31', group_by: 'year' })]), reply([call('finish', { facts: [2] })])] });
  const research = Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false }), { write: undefined });
  const run = await api.runAgentic(question, { asset: local, kb: async () => ({}), origin: 'https://opax.test', research }, undefined, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, emptyScope);
  assert.equal(run.answered, true, JSON.stringify(run.research));
  assert.match(run.answer, /450 recorded divisions in the Senate in 2018/);
  assert.doesNotMatch(run.answer, /360 recorded divisions/);
});

test('the answer target stays soft with a missing detail after 35 seconds', async () => {
  const question = saved['DV-OUTC-012'].question, now = Date.now;
  let advanced = 0, turn = 0;
  Date.now = () => now() + advanced;
  try {
    const model = new MockLanguageModelV4({ doGenerate: () => {
      turn++;
      if (turn === 1) { advanced = 35_000; return reply([call('count_records', { record_type: 'divisions', chamber: 'senate', date: '2010-11-17' })]); }
      if (turn === 2) return reply([call('division', { division_id: 'federal-senate-1895', party: 'Labor' })]);
      return reply([call('answer', { facts: [1] })]);
    } });
    const research = Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false }), { write: undefined });
    const run = await api.runAgentic(question, { asset: local, kb: async () => ({}), origin: 'https://opax.test', research }, undefined, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, emptyScope);
    assert.equal(run.answered, true, JSON.stringify(run.research));
    assert.equal(model.doGenerateCalls.length, 3);
    assert.equal(model.doGenerateCalls[1].toolChoice.type, 'required');
    assert.match(JSON.stringify(model.doGenerateCalls[1].prompt), /"answer_target_reached":true/);
  } finally { Date.now = now; }
});

test('dollar admission charges unknown billing and carries the selection charge into writing', async () => {
  const stats = { rounds: 1, tokens: { input: 10, output: 5 } };
  const charge = await api.reserveQuestionTurn(stats, api.ASK_MAX_MODEL_USD - 0.001, dailyBudget);
  await charge.settle();
  await assert.rejects(api.reserveQuestionTurn(stats, 0.002, dailyBudget), /question_spend/);
  const model = new MockLanguageModelV4({ doGenerate: () => { throw Error('No model budget remains'); } });
  const source = { resource: 'fact-1', slug: '', title: 'Count', href: 'https://opax.test/search', url: 'https://opax.test/search', snippet: 'Greens: 100 chamber speeches across the whole record', kind: 'count', cited: true };
  await api.createAnswerWriter({ model, dailyBudget, modelBudgetSpent: async () => false })({ question: 'How many speeches by the Greens?', period: { kind: 'all', label: '' }, facts: [{ id: 1, text: source.snippet, source }] }, stats, undefined, 3000);
  assert.equal(model.doGenerateCalls.length, 0);
});

test('cumulative unknown billing exhausts the dollar cap before an additional loop turn', async () => {
  const question = 'Find the original public record for this parliamentary motion';
  let charged = 0;
  const ledger = { reserve: async amount => { charged += amount; return { settle: async () => {} }; } };
  const model = new MockLanguageModelV4({ doGenerate: Array.from({ length: 9 }, (_, i) => reply([call('search', { query: 'unrecorded parliamentary motion ' + i })], null)) });
  const research = Object.assign(api.createResearch({ model, dailyBudget: ledger, modelBudgetSpent: async () => false, tokens: 160_000 }), { write: undefined });
  const run = await api.runAgentic(question, { asset: async () => null, kb: async () => ({}), research, generate: async () => { throw Error('An exhausted question cannot start a paid fallback'); } }, undefined, api.ASK_HARD_WALL_MS, api.inferPeriod(question), {}, emptyScope);
  assert.equal(run.research.failure, 'spend');
  assert.ok(model.doGenerateCalls.length > 1 && model.doGenerateCalls.length < api.ASK_MAX_ROUNDS);
  assert.ok(charged > 0 && charged <= api.ASK_MAX_MODEL_USD);
  assert.equal(run.research.reserved_cost_usd, charged);
});

test('TT-YDEB-004: the saved bushfire speeches do not imply the year-wide four-debate ranking', async () => {
  const year = await local('/years/2003.json');
  assert.equal(year.voices.probes.length, 4);
  assert.match(year.voices.method, /4 curated probes/);
  assert.equal(year.voices.speakers[0].name, 'Brendan Nelson');
  const speeches = saved['TT-YDEB-004'].sources.filter(s => s.kind === 'speech');
  assert.ok(speeches.some(s => s.speaker === 'Annette Ellis' && /fires in Canberra/.test(s.snippet)));
  assert.ok(speeches.some(s => s.speaker === 'Kate Lundy' && /bushfire recovery appeal/.test(s.snippet)));
  assert.ok(speeches.every(s => String(s.date).startsWith('2003-')));
});
