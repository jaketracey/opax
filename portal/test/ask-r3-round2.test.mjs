import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';
import { resource, speeches } from './fixtures/ask-person.mjs';

const built = await build({ stdin: { contents: "export * from './src/agentic-ask'; export * from './src/research-loop'; export * from './src/research-evidence'; export * from './src/research-writing'; export * from './src/research-grounding'; export * from './src/ask-constraints'; export * from './src/tools'; export {billFields,billCitations} from './src/tools/record-common';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const saved = JSON.parse(await readFile(new URL('./fixtures/ask-r3-round2.json', import.meta.url), 'utf8'));
const cache = new Map();
const asset = async path => {
  if (!cache.has(path)) cache.set(path, readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return null; throw e; }));
  return structuredClone(await cache.get(path));
};
const empty = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false };
const dailyBudget = { reserve: async () => ({ settle: async () => {} }) };
const call = (toolName, args) => ({ type: 'tool-call', toolName, toolCallId: toolName, input: JSON.stringify(args) });
const reply = (content, input = 10) => ({ content, finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: { inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 150, text: 150, reasoning: 0 } }, providerMetadata: { openrouter: { usage: { cost: 0.0005 } } }, warnings: [] });
const research = model => Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false }), { write: undefined });
const run = (question, model, deps = {}, scope = empty) => api.runAgentic(question, { asset, kb: async () => ({}), origin: 'https://opax.test', research: research(model), ...deps }, undefined, 60000, api.inferPeriod(question), {}, scope);
const sourcesFor = citations => citations.map((c, i) => ({ resource: 'fact-' + (i + 1), slug: '', title: c.text, snippet: c.text, kind: c.kind, url: c.url, href: c.url, cited: true }));
const rendered = (id, sources = saved[id].sources) => {
  const input = { question: saved[id].question, period: api.inferPeriod(saved[id].question), facts: api.writingFacts({ answer: '', citations: {}, sources }) };
  return api.groundAnswerPayload(api.proseFallback(input), input.question).answer;
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Round 2 unit tests must not access the network'); };
test.after(() => { globalThis.fetch = originalFetch; });

for (const id of ['TT-AGRE-008', 'TT-AGRE-004']) test(id + ': party comparisons are collective subjects, including a trailing Party', async () => {
  const scope = await api.resolveNamedScope(saved[id].question, { asset });
  assert.ok(scope.parties.length >= 2);
  assert.deepEqual(scope.people, []);
});

for (const [id, person] of [['NP-VOTE-015', 'Tammy Tyrrell'], ['NP-VOTE-021', 'Rebekha Sharkie']]) test(id + ': typo and contracted surname scope resolve to the recorded member', async () => {
  const question = saved[id].question, scope = await api.resolveNamedScope(question, { asset });
  assert.deepEqual(scope.people, [person]);
  assert.equal(scope.unresolved, false);
});

test('NP-VOTE-015: a successful in-loop identity lookup repairs stale unresolved scope before selecting vote evidence', async () => {
  const q = saved['NP-VOTE-015'].question;
  const index = await asset('/divisions/index.json');
  const row = index.divisions.find(r => r.key === 'federal-senate-10022');
  assert.ok(row);
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('find_people', { name: 'Tammy Tyrrell' })]), reply([call('division', { division_id: row.key, person: 'Tammy Tyrrell' })]), reply([call('answer', { facts: [1] })])] });
  const out = await run(q, model, {}, { ...empty, unresolved: true });
  assert.equal(out.answered, true, JSON.stringify(out.research));
  assert.match(out.answer, /Tammy Tyrrell.*voted (aye|no)/);
  assert.doesNotMatch(JSON.stringify(out.research.rejections ?? []), /named_unresolved/);
});

for (const [id, who, vote] of [['NP-VOTE-021', 'Rebekha Sharkie', 'aye'], ['NP-VOTE-040', 'Mark Furner', 'no']]) test(id + ': member vote leads without unasked floor crossing or duplicate equal tallies', () => {
  const answer = rendered(id);
  assert.match(answer, new RegExp('^' + who + '.*voted ' + vote));
  assert.doesNotMatch(answer, /floor|32 ayes.*32 noes|motion was/i);
});

test('DV-PRTY-036: detailed dated votes take precedence over an aggregate title sample', () => {
  const answer = rendered('DV-PRTY-036');
  assert.match(answer, /^Labor voted no/);
  assert.match(answer, /3 December 2015/);
  assert.doesNotMatch(answer, /11 divisions/);
});

test('NP-INTR-007: the unqualified question uses the named Queensland register; explicit federal scope never substitutes it', async () => {
  const q = saved['NP-INTR-007'].question;
  assert.doesNotMatch(q, /federal/i);
  const data = await api.callTool({ asset, origin: 'https://opax.test' }, 'declared_interests', { person: 'Bree James', category: 'real_estate' });
  assert.match(data.citations[0].text, /^Bree James declared.*Westcourt/);
  assert.ok(data.rows.every(r => r.jurisdiction === 'qld'));
  const federal = await api.callTool({ asset }, 'declared_interests', { person: 'Bree James', category: 'real_estate', jurisdiction: 'federal' });
  assert.deepEqual(federal.rows, []);
  assert.deepEqual(federal.citations, []);
  assert.match(federal.notes.join(' '), /outside the requested jurisdiction/);
});

for (const [id, key, expected] of [['BL-STAT-001', 'au-federal-r5842', /^The ASIC Supervisory Cost Recovery Levy Bill 2017 passed/], ['BL-ASNT-004', 'au-federal-s1349', /^On 5 December 2022, the Maritime Legislation Amendment Bill 2022 received royal assent/]]) test(id + ': exact lifecycle evidence answers the requested field before neighbouring speech text', async () => {
  const fields = await api.billFields({ asset, origin: 'https://opax.test' }, key);
  assert.ok(fields);
  const bill = await asset('/bills/' + key + '.json');
  const sources = sourcesFor(api.billCitations(fields, bill.title, 'https://opax.test/bill/' + key, saved[id].question));
  assert.match(rendered(id, sources), expected);
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('find_records', { query: key, kind: 'bill' })]), reply([call('answer', { facts: [1] })])] });
  const assets = { fetch: async req => { const data = await asset(new URL(req.url).pathname); return data ? Response.json(data) : new Response('', { status: 404 }); } };
  const out = await run(saved[id].question, model, { toolEnv: { ASSETS: assets } });
  assert.equal(out.answered, true);
  assert.equal(model.doGenerateCalls.length, 2);
});

for (const [id, month, total] of [['DT-MNTH-005', '2021-11', 17], ['DT-MNTH-008', '2022-11', 22]]) test(id + ': total remains the headline through rendering and claim grounding', async () => {
  const data = await api.callTool({ asset, origin: 'https://opax.test' }, 'count_records', { record_type: 'bills', month, include_records: true });
  assert.equal(data.total, total);
  const answer = rendered(id, sourcesFor(data.citations));
  assert.match(answer, new RegExp('^' + total + ' bills were introduced.*' + month));
  assert.ok(answer.length < 160);
});

test('DT-SINC-008: a grouped count also supplies its exact whole-selection total', async () => {
  const data = await api.callTool({ asset, origin: 'https://opax.test' }, 'count_records', { record_type: 'divisions', chamber: 'representatives', since: '2025-01-01', group_by: 'month' });
  assert.equal(data.total, 310);
  assert.equal(data.rows.reduce((n, r) => n + r.count, 0), data.total);
  assert.match(rendered('DT-SINC-008', sourcesFor(data.citations)), /^310 recorded divisions in the House of Representatives since 2025-01-01/);
});

test('DT-YEAR-014: a period outside the observed bill index cannot become a zero or answer a debate question', async () => {
  const data = await api.callTool({ asset, origin: 'https://opax.test' }, 'count_records', { record_type: 'bills', year: 2002 });
  assert.equal(data.total, null);
  assert.equal(data.coverage.matched, false);
  assert.equal(data.citations.some(c => c.kind === 'count'), false);
  assert.doesNotMatch(rendered('DT-YEAR-014', sourcesFor(data.citations)), /No bills were introduced/);
});
for (const id of ['TT-YDEB-004', 'NP-SAID-012']) test(id + ': real cumulative usage leaves a fifth turn to synthesise retrieved speeches', async () => {
  assert.equal(saved[id].answer_stats.salvaged, 'tokens');
  const source = (saved[id].retrieved_sources ?? saved[id].sources).find(s => s.kind === 'speech' && s.speaker && s.snippet.length > 40);
  assert.ok(source);
  const resource = 'a'.repeat(32), citation = resource + '/t/body/0-' + source.snippet.length;
  const found = { resources: { [resource]: { slug: source.slug, title: source.title, origin: { created: source.date, collaborators: [source.speaker] }, fields: { body: { paragraphs: { [citation]: { text: source.snippet } } } } } } };
  const quote = source.snippet.split(/\s+/).slice(0, 15).join(' ');
  const model = new MockLanguageModelV4({ doGenerate: [0, 1, 2, 3].map(i => reply([call('search', { query: saved[id].question.slice(0, 140) + ' ' + i })], saved[id].turns[i]?.input ?? 24000)).concat(reply([call('answer', { points: [{ claim: `${source.speaker} said: “${quote}”.`, id: citation, quote }] })], 26000)) });
  const scope = await api.resolveNamedScope(saved[id].question, { asset });
  const out = await run(saved[id].question, model, { kb: async () => found, readRecord: undefined, research: Object.assign(api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false, readRecord: async () => ({ text: source.snippet, speaker: source.speaker, metadata: { date: source.date } }) }), { write: undefined }) }, scope);
  assert.equal(out.answered, true, JSON.stringify(out.research));
  assert.equal(model.doGenerateCalls.length, 5);
  assert.ok(!out.research.answer_stats?.salvaged);
});

test('TT-YDEB-003: the saved four-turn usage permits further recovery instead of a token stop', async () => {
  const fixture = saved['TT-YDEB-003'];
  assert.equal(fixture.answer_stats.salvaged, 'tokens');
  const model = new MockLanguageModelV4({ doGenerate: Array.from({ length: 8 }, (_, i) => reply([call('search', { query: 'drought exceptional circumstances farmers ' + i })], fixture.turns[i]?.input ?? 24000)) });
  const out = await run(fixture.question, model);
  // Eight research turns, then one final answer call after the round cap.
  assert.equal(model.doGenerateCalls.length, 9);
  assert.equal(out.research.failure, 'steps');
});

test('a registry corpus detail remains callable under dated member scope and provides answer citation IDs', async () => {
  const question = 'What did David Shoebridge say about housing on 9 October 2026?';
  const text = 'Housing requires sustained public investment. I support building affordable homes and protecting renters.';
  const raw = resource({ ...speeches[0], slug: 'speech-1', speaker: 'David Shoebridge', text, date: '2026-10-09', state: 'federal', chamber: 'senate' });
  const scope = await api.resolveNamedScope(question, { asset });
  const constraints = api.extractAskConstraints(question, api.inferPeriod(question), scope);
  const step = { tool: 'corpus_records', args: { kind: 'speech', record_id: 'speech-1' } };
  assert.deepEqual(api.constrainStep(step, constraints, api.getAskTool('corpus_records').inputSchema.properties), step);
  let turn = 0;
  const model = new MockLanguageModelV4({ doGenerate: opts => {
    if (++turn === 1) return reply([call(step.tool, step.args)]);
    const result = opts.prompt.filter(m => m.role === 'tool').flatMap(m => m.content).find(c => c.toolName === 'corpus_records').output.value;
    assert.deepEqual(result.facts, [], 'passages have one citation identity, without duplicate fact IDs');
    assert.equal(result.data.rows[0].excerpt, undefined, 'the model receives the excerpt once');
    const p = result.data.passages[0];
    assert.ok(p);
    return reply([call('answer', { points: [{ claim: 'David Shoebridge said housing requires sustained public investment.', id: p.id, quote: 'Housing requires sustained public investment' }] })]);
  } });
  const out = await run(question, model, { kb: async () => raw }, scope);
  assert.equal(out.answered, true, JSON.stringify(out.research));
  assert.match(out.answer, /David Shoebridge.*housing requires sustained public investment/i);
  assert.equal(model.doGenerateCalls.length, 2);
});
