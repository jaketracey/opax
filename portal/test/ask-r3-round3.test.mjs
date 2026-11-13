import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

const built = await build({ stdin: { contents: "export * from './src/agentic-ask'; export * from './src/research-loop'; export * from './src/research-writing'; export * from './src/research-grounding'; export * from './src/research-response'; export * from './src/ask-constraints'; export * from './src/research-writer'; export * from './src/tools'; export * from './src/agentic-response';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const saved = JSON.parse(await readFile(new URL('./fixtures/ask-r3-round3.json', import.meta.url), 'utf8'));
const cache = new Map();
const asset = async path => {
  if (!cache.has(path)) cache.set(path, readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return null; throw e; }));
  return structuredClone(await cache.get(path));
};
const assets = { fetch: async req => { const data = await asset(new URL(req.url).pathname); return data ? Response.json(data) : new Response('', { status: 404 }); } };
const empty = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false };
const dailyBudget = { reserve: async () => ({ settle: async () => {} }) };
const call = (toolName, args) => ({ type: 'tool-call', toolName, toolCallId: toolName, input: JSON.stringify(args) });
const reply = content => ({ content, finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 150, text: 150, reasoning: 0 } }, providerMetadata: { openrouter: { usage: { cost: 0.0005 } } }, warnings: [] });
const options = model => ({ model, dailyBudget, modelBudgetSpent: async () => false });
const run = async (question, model, deps = {}, scope = empty) => { const out = await api.runAgentic(question, { asset, kb: async () => ({}), origin: 'https://opax.test', toolEnv: { ASSETS: assets }, research: api.createResearch(options(model)), ...deps }, undefined, 60000, api.inferPeriod(question), {}, scope); return { ...api.agenticAskPayload(out, question), steps: out.steps, research: out.research }; };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Round 3 unit tests must not access the network'); };
test.after(() => { globalThis.fetch = originalFetch; });
const nonempty = out => { assert.equal(out.answered, true, JSON.stringify(out.research)); assert.equal(out.answer_decision, 'answer'); assert.ok(out.answer.trim()); assert.ok(Object.keys(out.citations).length); };
const checkedResponse = async (out, question) => (await api.withAnswerLanguage(Response.json(out), question)).json();

for (const [id, args, expected] of [
  ['DT-BDAY-020', { record_type: 'bills', date: '2012-10-30', chamber: 'senate' }, /One bill was introduced.*Anti-Money Laundering Amendment/],
  ['DT-MNTH-008', { record_type: 'bills', month: '2022-11' }, /^22 bills were introduced/],
  ['DT-SDAY-016', { record_type: 'divisions', date: '2015-09-08', chamber: 'representatives' }, /^5 recorded divisions.*2015-09-08/],
  ['DT-BDAY-002', { record_type: 'bills', date: '2023-06-19', chamber: 'representatives' }, /Two bills were introduced.*Broadcasting Services Amendment.*Interactive Gambling Amendment/],
  ['DT-BDAY-016', { record_type: 'bills', date: '2016-03-15', chamber: 'senate' }, /One bill was introduced.*Fair Work Amendment \(Protecting Australian Workers\) Bill 2016/],
]) test(id + ': actual selection, writing and response boundary keep the verified count and requested names', async () => {
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('count_records', args)]), reply([call('answer', { facts: [1] })])] });
  const out = await run(saved[id].question, model);
  nonempty(out);
  assert.match(out.answer, expected);
  assert.doesNotMatch(out.answer, /lifecycle stages|available records do not establish/);
  nonempty(await checkedResponse(out, saved[id].question));
  assert.equal(model.doGenerateCalls.length, 2);
  if (/Which|what|What/.test(saved[id].question)) assert.equal(out.steps[0].args.include_records, true);
});

test('DT-BDAY-016: later Senate stages cannot masquerade as first introductions on that date', () => {
  const q = saved['DT-BDAY-016'].question, constraints = api.extractAskConstraints(q, api.inferPeriod(q), empty);
  const rows = [
    { kind: 'bill', title: 'Commonwealth Electoral Amendment Bill 2016', url: 'https://opax.test/bill/wrong', introduced: '2016-02-22', originating_house: 'representatives', key_dates: [{ stage: 'second reading', date: '2016-03-15', house: 'senate' }] },
    { kind: 'bill', title: 'Fair Work Amendment (Protecting Australian Workers) Bill 2016', url: 'https://opax.test/bill/right', introduced: '2016-03-15', originating_house: 'senate' },
  ];
  const out = api.guardExactLookupResult({ tool: 'find_records', ok: true, data: { rows }, cite: rows.map(r => ({ kind: 'record', url: r.url, label: r.title })), notes: [] }, constraints);
  assert.deepEqual(out.data.rows, [rows[1]]);
  assert.deepEqual(out.cite.map(c => c.url), [rows[1].url]);
});

test('DV-BCNT-008: bare bill division question keeps the exact title and answers the count before lifecycle stages', async () => {
  const q = saved['DV-BCNT-008'].question;
  const c = api.extractAskConstraints(q, api.inferPeriod(q), empty);
  assert.equal(c.exactBillTitle, 'Nature Positive (Environment Information Australia) Bill 2024');
  const scoped = api.constrainStep({ tool: 'count_records', args: { record_type: 'divisions', bill: 'Environment Information Australia Bill 2025', year: 2024 } }, c, api.getAskTool('count_records').inputSchema.properties);
  assert.equal(scoped.args.bill, c.exactBillTitle);
  assert.equal(scoped.args.year, undefined);
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('count_records', scoped.args)]), reply([call('answer', { facts: [1] })])] });
  const out = await run(q, model);
  nonempty(out);
  assert.match(out.answer, /3 recorded divisions linked to Nature Positive \(Environment Information Australia\) Bill 2024/);
  assert.doesNotMatch(out.answer, /lifecycle|2025/);
});

test('DV-BCNT-008: the saved linked-division fact takes precedence over its lifecycle and neighbouring division facts', async () => {
  const input = inputFor('DV-BCNT-008');
  const written = await api.createAnswerWriter({ dailyBudget, modelBudgetSpent: async () => false })(input, { rounds: 2, tokens: { input: 0, output: 0 } }, undefined, 30000);
  const out = await checkedResponse({ ...written, answered: true }, input.question);
  nonempty(out); assert.match(out.answer, /^The Nature Positive \(Environment Information Australia\) Bill 2024 has 3 matching recorded divisions/);
  assert.doesNotMatch(out.answer, /lifecycle|Third Reading|2025/);
});

const inputFor = id => ({ question: saved[id].question, period: api.inferPeriod(saved[id].question), facts: api.writingFacts({ answer: '', citations: {}, sources: saved[id].payload.research.pre_writer_sources.map(s => ({ ...s, cited: true })) }) });
const write = async id => {
  const model = new MockLanguageModelV4({ doGenerate: () => { throw Error('A complete typed answer needs no writing turn'); } });
  const out = await api.createAnswerWriter(options(model))(inputFor(id), { rounds: 2, tokens: { input: 0, output: 0 } }, undefined, 30000);
  assert.equal(model.doGenerateCalls.length, 0); return out;
};
for (const [id, expected] of [
  ['MN-STAT-006', /^2018 recruitment.*\$122,722/],
  ['TT-RCPT-003', /^Labor received \$28,277,623/],
  ['MN-CONT-018', /^High Speed Rail Authority awarded.*\$4,717,706/],
  ['NP-INTR-016', /^David Kempton declared shareholdings in Agrespond Pty Ltd/],
]) test(id + ': typed evidence stays a complete, direct, cited answer through writing and the response boundary', async () => {
  const out = { ...await write(id), answered: true };
  nonempty(out); assert.match(out.answer, expected);
  const final = await checkedResponse(out, saved[id].question);
  nonempty(final); assert.match(final.answer, expected);
  if (id === 'MN-STAT-006') { assert.equal((final.answer.match(/\$0\b/g) ?? []).length, 1, final.answer + JSON.stringify(final.coherence)); for (const category of ['creative and campaign development', 'research and evaluation', 'print and collateral', 'other campaign costs']) assert.ok(final.answer.includes(category)); }
  if (id === 'TT-RCPT-003') { assert.match(final.answer, /Liberal received \$25,786,660/); assert.match(final.answer, /2002-03/); }
  if (id === 'MN-CONT-018') { assert.match(final.answer, /By number of contracts/); assert.doesNotMatch(final.answer, /^Across the whole record|^Supplier:/); }
  if (id === 'NP-INTR-016') assert.match(final.answer, /Mount Barker Mining Pty Ltd.*Queensland register of interests as at 2026-10-16/);
});

test('NP-INTR-016: short register-category questions resolve one complete authoritative register name', async () => {
  const scope = await api.resolveNamedScope(saved['NP-INTR-016'].question, { asset });
  assert.deepEqual(scope.people, ['David Kempton']); assert.equal(scope.ambiguous, false); assert.equal(scope.unresolved, false);
});

for (const terminal of ['answer', 'finish']) test('a successful zero count answers with ' + terminal, async () => {
  const q = 'How many bills were introduced in federal parliament in 2020?';
  const bills = [{ key: 'au-federal-before', introduced: '2019-01-01' }, { key: 'au-federal-after', introduced: '2021-01-01' }];
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('count_records', { record_type: 'bills', year: 2020 })]), reply([call(terminal, { facts: [1] })])] });
  const out = await run(q, model, { asset: async path => path === '/bills/index.json' ? { count: 2, bills } : null });
  nonempty(out); assert.match(out.answer, /^No bills were introduced/);
  assert.equal(model.doGenerateCalls.length, 2);
});

for (const sse of [false, true]) test('response boundary never sends empty text as an answer (' + (sse ? 'SSE/cache replay' : 'JSON') + ')', async () => {
  const payload = { answered: true, answer_decision: 'answer', answer: '', citations: {}, sources: [] };
  const response = sse ? new Response('event: delta\ndata: {"text":"unsafe"}\n\nevent: done\ndata: ' + JSON.stringify(payload) + '\n\n', { headers: { 'content-type': 'text/event-stream' } }) : Response.json(payload);
  const result = await api.withAnswerLanguage(response, saved['DT-MNTH-008'].question);
  const raw = await result.text();
  const out = sse ? JSON.parse(/^data: (.+)$/m.exec(raw)[1]) : JSON.parse(raw);
  assert.notEqual(out.answer_decision, 'answer'); assert.ok(out.answer.trim()); assert.deepEqual(out.citations, {}); assert.doesNotMatch(out.answer, /No bills|zero bills/);
  if (sse) assert.doesNotMatch(raw, /event: delta/);
  assert.equal(api.cacheableRoutedAnswer(payload, false), false);
});

test('boundary can recover an empty answer from verified count facts and never uses out-of-period figures', async () => {
  const id = 'DT-MNTH-008', data = await api.callTool({ asset, origin: 'https://opax.test' }, 'count_records', { record_type: 'bills', month: '2022-11' });
  const sources = data.citations.map((c, i) => ({ resource: 'fact-' + (i + 1), slug: '', title: c.text, snippet: c.text, kind: c.kind, url: c.url, href: c.url, cited: true }));
  const payload = { ...saved[id].payload, answered: true, answer: '', answer_decision: 'answer', research: { pre_writer_sources: sources } };
  const out = api.ensureAnswerText(payload, saved[id].question);
  nonempty(out); assert.match(out.answer, /^22 bills were introduced/);
  const wrong = api.ensureAnswerText(payload, 'How many federal bills were introduced in November 2023?');
  assert.notEqual(wrong.answer_decision, 'answer'); assert.doesNotMatch(wrong.answer, /22 bills/);
});
