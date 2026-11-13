import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

const built = await build({ stdin: { contents: "export {inferPeriod,runAgentic,extractNamedScope,factSheet} from './src/agentic-ask';export {exactRecordLookup,requestedBillTitle,billTitleMatches} from './src/ask-exact-lookup';export {extractAskConstraints} from './src/ask-constraints';export {writingFacts,proseFallback,appendWrittenPoints} from './src/research-writing';export {createResearch} from './src/research-loop';export {createAnswerWriter} from './src/research-writer';export {groundAnswerPayload} from './src/research-grounding';export {normaliseWrittenPayload,normaliseCoveragePayload} from './src/research-response';export {auditPayload} from './src/research-claim-audit.mjs';export {callTool} from './src/tools';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
// Saved run 3 answers and selected source rows, with original speech sources from run 2.
const recorded = JSON.parse(await readFile(new URL('./fixtures/ask-r2-said.json', import.meta.url), 'utf8'));
const cache = new Map();
const local = async path => {
  if (!cache.has(path)) cache.set(path, readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; }));
  return structuredClone(await cache.get(path));
};
const assets = { fetch: async request => { const data = await local(new URL(request.url).pathname); return data ? Response.json(data) : new Response('', { status: 404 }); } };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Ask round 2 unit tests must not make network requests'); };
test.after(() => { globalThis.fetch = originalFetch; });
const inputFor = id => ({ question: recorded[id].question, period: api.inferPeriod(recorded[id].question), constraints: recorded[id].payload.answer_scope,
  facts: api.writingFacts({ answer: '', citations: {}, sources: recorded[id].pre_writer_sources }) });
const call = (toolName, input) => ({ type: 'tool-call', toolName, toolCallId: toolName, input: JSON.stringify(input) });
const reply = content => ({ content, finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, warnings: [] });
const emptyScope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false };

for (const [id, key, claim, quote] of [
  ['NP-SAID-002', 'au-federal-r5516', 'David Gillespie said the Register of Foreign Ownership of Agricultural Land Bill 2015 strengthened the integrity and management of foreign investment in agricultural land and agribusiness.', 'They strengthen the integrity and management of foreign investment in agricultural land and agribusiness'],
  ['NP-SAID-007', 'au-federal-r7323', 'Jacqui Lambie called the Environment Protection and Biodiversity Conservation Amendment (Reconsiderations) Bill 2025 a “dirty salmon bill” and said it lets salmon companies off the hook.', "It's a bill that lets salmon companies off the hook."],
  ['NP-SAID-015', 'au-federal-r7300', 'Lisa Chesters included the transport security bill in a procedural schedule to complete consideration of bills after the discussion of a matter of public importance.', 'all questions necessary to complete consideration of the bills being put immediately'],
]) test(`${id}: Hansard points survive bill context without a record-only writing turn`, async () => {
  const { question, passage } = recorded[id], bill = await local('/bills/' + key + '.json');
  const roster = await local('/parliamentarians.json'), index = await local('/bills/index.json');
  const named = api.extractNamedScope(question, roster, index), period = api.inferPeriod(question);
  const passageId = passage.resource + '/t/body/0-' + passage.snippet.length;
  const model = new MockLanguageModelV4({ doGenerate: [
    reply([call('find_records', { query: bill.title, kind: 'bill' })]),
    ...(id === 'NP-SAID-002' ? [reply([call('answer', { facts: [1] })]), reply([call('finish', { facts: [1] })])] : []),
    reply([call('person_quotes', { person: passage.speaker, topic: bill.short_title })]),
    reply([call('answer', { facts: [1], points: [{ claim, id: passageId, quote }] })]),
  ] });
  let writes = 0;
  const research = Object.assign(api.createResearch({ model, inputPrice: 0.1, outputPrice: 0.3, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) },
    readRecord: async () => ({ text: passage.snippet, speaker: passage.speaker, labels: { kind: 'speech' }, metadata: { date: passage.date } }),
  }), { write: async () => { writes++; throw Error('Checked speech points already answer the question'); } });
  const deps = { asset: local, origin: 'https://opax.test', toolEnv: { ASSETS: assets }, research,
    kb: async () => ({ resources: { [passage.resource]: { slug: passage.slug, title: passage.title, fields: { body: { paragraphs: { [passageId]: { text: passage.snippet } } } } } } }),
  };
  const run = await api.runAgentic(question, deps, async () => {}, 40_000, period, {}, named);
  assert.equal(run.answered, true);
  assert.equal(run.research.mode, 'loop');
  assert.equal(writes, 0);
  assert.equal(model.doGenerateCalls.length, id === 'NP-SAID-002' ? 5 : 3);
  if (id === 'NP-SAID-002') assert.equal(model.doGenerateCalls[2].toolChoice.type, 'required', 'metadata alone cannot force an answer before speech retrieval');
  const out = api.groundAnswerPayload(run.qualitative, question);
  assert.match(out.answer, new RegExp(passage.speaker));
  assert.doesNotMatch(out.answer, /no (?:record|statement)|cannot establish|does not (?:include|cover)/i);
  assert.ok(out.sources.some(s => s.cited && s.kind === 'speech' && s.slug === passage.slug));
  for (const ranges of Object.values(out.citations)) for (const [a, b] of ranges) assert.ok(a >= 0 && b > a && b <= Array.from(out.answer).length);
  // The bill catalogue can be absent or use another title without proving speech absence.
  assert.equal(await api.exactRecordLookup(question, { ...deps, asset: async path => path === '/bills/index.json' ? { bills: [] } : local(path) }, period, named), null);
});

test('an empty bill lookup can be followed by member speeches and a title search', async () => {
  const { question, passage } = recorded['NP-SAID-002'], bill = await local('/bills/au-federal-r5516.json');
  const passageId = passage.resource + '/t/body/0-' + passage.snippet.length;
  const model = new MockLanguageModelV4({ doGenerate: [
    reply([call('find_records', { query: bill.title, kind: 'bill' })]),
    reply([call('person_quotes', { person: passage.speaker, topic: bill.title })]),
    reply([call('search', { query: passage.speaker + ' agricultural land foreign investment second reading' })]),
    reply([call('answer', { points: [{ claim: 'David Gillespie argued that the bills strengthen the integrity and management of foreign investment in agricultural land and agribusiness.', id: passageId, quote: 'They strengthen the integrity and management of foreign investment in agricultural land and agribusiness' }] })]),
  ] });
  const queries = [], filters = [];
  const deps = { asset: local, origin: 'https://opax.test', kb: async (_path, body) => {
    queries.push(body.query);
    return body.query === bill.title ? {} : { resources: { [passage.resource]: { slug: passage.slug, title: passage.title, fields: { body: { paragraphs: { [passageId]: { text: passage.snippet } } } } } } };
  } };
  const research = api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) },
    searchBody: (query, _limit, _context, scoped) => { filters.push(scoped); return { query }; },
    readRecord: async () => ({ text: passage.snippet, speaker: passage.speaker, labels: { kind: 'speech' }, metadata: { date: passage.date } }),
  });
  const out = await research(question, { deps, named: { ...emptyScope, people: [passage.speaker] }, period: api.inferPeriod(question), signal: new AbortController().signal,
    progress: async () => {}, scope: step => step, execute: (step, _round, action) => step.tool === 'find_records' ? Promise.resolve({ tool: 'find_records', ok: true, data: { rows: [], total: 0 }, cite: [], notes: [] }) : action(deps),
  });
  assert.equal(model.doGenerateCalls.length, 4);
  assert.equal(queries.length, 2);
  assert.deepEqual(filters[0], { speaker: passage.speaker });
  assert.ok(out.qualitative.sources.some(s => s.cited && s.kind === 'speech' && s.speaker === passage.speaker));
  assert.doesNotMatch(out.qualitative.answer, /no matching|no record|cannot establish/);
});

test('numbered bill titles resolve the exact index record and lead with its introduction date', async () => {
  const { question } = recorded['BL-INTR-010'], bill = await local('/bills/au-federal-r6562.json');
  const period = api.inferPeriod(question);
  assert.equal(period.kind, 'all', 'the measures year belongs to the title');
  assert.equal(api.requestedBillTitle(question), bill.title);
  assert.equal(api.requestedBillTitle('When did Scott Morrison introduce the ' + bill.title + '?'), null, 'a member and introduction verb cannot become part of the title');
  assert.equal(api.billTitleMatches(bill.title.replace('No. 3', 'No. 1'), bill.title), false);
  const env = { asset: local, origin: 'https://opax.test', ASSETS: { fetch: async () => { throw Error('Exact titles and keys do not need catalogue ranking'); } } };
  for (const query of [bill.title, bill.key, question]) {
    const result = await api.callTool(env, 'find_records', { query, kind: 'bill' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].key, bill.key);
    const sheet = api.factSheet([{ tool: 'find_records', ok: true, data: result, cite: result.citations.map(c => ({ ...c, label: c.text })), notes: result.notes }]);
    const input = { question, period, constraints: api.extractAskConstraints(question, period, emptyScope), facts: api.writingFacts(undefined, sheet.facts, sheet.notes) };
    const out = await api.createAnswerWriter({ modelBudgetSpent: async () => { throw Error('Exact date requires no model'); } })(input, { rounds: 0, tokens: { input: 0, output: 0 } }, undefined, 3000);
    assert.match(out.answer, /^On 12 June 2020, the Treasury Laws Amendment \(2020 Measures No\. 3\) Bill 2020 was first introduced/);
    assert.doesNotMatch(out.answer, /No\. [12]\)|requested period/);
    assert.ok(out.sources.every(s => !s.cited || s.url.endsWith('/' + bill.key)));
  }
  assert.deepEqual([api.inferPeriod(question + ' on 12 June 2020').since, api.inferPeriod(question + ' on 12 June 2020').until], ['2020-06-12', '2020-06-12']);
  const missing = await api.callTool({ asset: async path => path === '/bills/index.json' ? { bills: [] } : local(path), origin: 'https://opax.test', ASSETS: assets }, 'find_records', { query: bill.title.replace('No. 3', 'No. 99'), kind: 'bill' });
  assert.deepEqual(missing.rows, [], 'unavailable exact titles cannot be replaced by another numbered bill');
  assert.deepEqual(missing.citations, []);
});

test('the saved Queensland recipient profile leads with its total through final claim checks', () => {
  const input = inputFor('MN-GRNT-022');
  const out = api.groundAnswerPayload(api.proseFallback(input), input.question);
  assert.match(out.answer, /^Board Of The Queensland Museum received \$11,913,708\.00 across 14 recorded Queensland Government/);
  assert.match(out.answer, /Anzac Legacy Gallery/);
  assert.deepEqual(api.auditPayload(input.question, out).findings, []);
});

test('a receipt total and its coverage have no unresolved citation keys after composition', () => {
  const input = inputFor('MN-DONR-001');
  const out = api.appendWrittenPoints(api.proseFallback(input), recorded['MN-DONR-001'].payload);
  assert.match(out.answer, /^Electrical Trades Union provided \$300,000/);
  for (const id of Object.keys(out.citations)) assert.ok(out.sources.some(s => s.cited && (id === s.resource || id.startsWith(s.resource + '/'))), id);
  const [start, end] = out.citations['fact-1/t/body/0'][0];
  assert.match(Array.from(out.answer).slice(start, end).join(''), /\$300,000/);
  const checked = api.normaliseCoveragePayload(api.groundAnswerPayload(out, input.question), input.question);
  assert.match(checked.answer, /^Electrical Trades Union provided \$300,000/);
  for (const id of Object.keys(checked.citations)) assert.ok(checked.sources.some(s => s.cited && id.startsWith(s.resource + '/')), id);
});
