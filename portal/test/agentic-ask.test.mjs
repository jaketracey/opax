import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

// Agentic Ask spike (docs/design/agentic-ask-2026-10.md): the pure pieces of design (i)
// and the structured tools, against stubbed KB responses. No network, no model.
const load = async (entry) => {
  const out = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const { classifyAgentic, parsePlan, resolveArgs, verifyComposition, factSheet, agenticCacheKey, runAgentic } = await load('../src/agentic-ask.ts');
const { countSpeeches, partyDonations, runTool } = await load('../src/agentic-tools.ts');
const gold = JSON.parse(await readFile(new URL('./fixtures/agentic-ask-gold.json', import.meta.url), 'utf8'));

test('the gold set has thirty questions, each with a record-computed answer and its method', () => {
  assert.equal(gold.questions.length, 30);
  assert.equal(gold.questions[0].question, 'Who is making the most speeches about gambling reform');
  for (const q of gold.questions) {
    assert.ok(q.expected?.kind, q.id);
    assert.ok(q.expected.query || q.expected.method || q.expected.donors || q.expected.industry, `${q.id} keeps how it was computed`);
  }
});

test('route-only rollout: every gold question takes the agentic path, ordinary questions stay on Ask', () => {
  for (const q of gold.questions) assert.equal(classifyAgentic(q.question).route, 'agentic', q.id);
  for (const q of [
    'What did Penny Wong say about AUKUS?',
    'What has Melissa McIntosh said in parliament?',
    'Who is Barnaby Joyce?',
    'How much did Westpac donate to Labor?',
    'Show me speeches about housing affordability',
    'Why did the Senate reject the gambling advertising ban?',
    'What grants went to the electorate of Indi?',
  ]) assert.equal(classifyAgentic(q).route, 'ask', q);
});

test('a plan keeps only known tools, caps the steps and rejects junk', () => {
  assert.equal(parsePlan('no json here'), null);
  assert.equal(parsePlan('{"shape":"ranking","steps":[]}'), null);
  const p = parsePlan('Sure! {"shape":"ranking","steps":[{"tool":"count_speeches","args":{"topic":"gambling","group_by":"speaker"}},{"tool":"rm_rf","args":{}}]}');
  assert.deepEqual(p.steps.map((s) => s.tool), ['count_speeches']);
  const many = JSON.stringify({ shape: 'trend', steps: Array.from({ length: 9 }, () => ({ tool: 'find_people', args: { name: 'x' } })) });
  assert.equal(parsePlan(many).steps.length, 6);
  assert.equal(parsePlan('{"shape":"unanswerable","steps":[],"reason":"no party labels"}').shape, 'unanswerable');
});

test('$N references resolve from earlier results and never guess', () => {
  const results = [
    { tool: 'count_speeches', ok: true, data: { rows: [{ name: 'Liberal', count: 9 }] }, cite: [], notes: [] },
    { tool: 'find_people', ok: true, data: { people: [{ name: 'Alex Example', party: 'Greens' }] }, cite: [], notes: [] },
  ];
  assert.deepEqual(resolveArgs({ party: '$1', limit: 3 }, results), { party: 'Liberal', limit: 3 });
  assert.deepEqual(resolveArgs({ party: '$2.party' }, results), { party: 'Greens' });
  assert.equal(resolveArgs({ party: '$3' }, results), null);
});

const facts = [
  { id: 1, text: 'Alex Example: 87 chamber speeches labelled gambling', cite: { kind: 'count', label: 'a', url: 'https://opax.com.au/search?topic=gambling' } },
  { id: 2, text: 'Sam Sample: 60 chamber speeches labelled gambling', cite: { kind: 'count', label: 'b', url: 'https://opax.com.au/search?topic=gambling' } },
];

test('composition keeps only sentences whose figures are cited facts', () => {
  const v = verifyComposition('Alex Example has made the most, with 87 [1]. Sam Sample follows with 61 [2]. Sam Sample has 60. Donations bought those speeches [1]. Coverage is incomplete for the 1990s.', facts, 'Who speaks most about gambling?');
  assert.equal(v.prose, 'Alex Example has made the most, with 87 [1]. Coverage is incomplete for the 1990s.');
  assert.deepEqual(v.cited, [1]);
  assert.equal(v.dropped, 3);
});

test('a facet ranking is read straight from the facet, every row cited', async () => {
  const calls = [];
  const deps = {
    kb: async (path, body) => {
      calls.push([path, body]);
      return { fulltext: { total: 200, facets: { '/u/o': { '/u/o/Alex Example': 87, '/u/o/Sam Sample': 60, '/u/o/Pat Placeholder': 52 } } } };
    },
    asset: async () => null,
  };
  const r = await countSpeeches(deps, { topic: 'gambling', group_by: 'speaker', limit: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.rows, [{ name: 'Alex Example', count: 87 }, { name: 'Sam Sample', count: 60 }]);
  assert.equal(r.cite.length, 2);
  assert.match(r.cite[0].url, /topic=gambling&speaker=Alex\+Example/);
  assert.equal(calls[0][0], '/catalog');
  assert.deepEqual(calls[0][1].faceted, ['/u/o']);
  const unknown = await runTool(deps, 'count_speeches', { topic: 'not-a-topic' });
  assert.equal(unknown.ok, false);
});

test('party rankings for parliaments without party labels say so instead of ranking', async () => {
  const deps = { kb: async () => ({ fulltext: { total: 5773, facets: {} } }), asset: async () => null };
  const r = await countSpeeches(deps, { topic: 'agriculture', state: 'nsw', group_by: 'party' });
  assert.equal(r.data.unanswerable, 'no_party_labels');
  assert.deepEqual(r.data.rows, []);
  assert.ok(factSheet([r]).notes.some((n) => /cannot rank these speeches by party/.test(n)));
});

test('donors not named are aggregated, never listed or shown as placeholders', async () => {
  const graph = {
    nodes: [
      { id: 'party:Example Party', label: 'Example Party', kind: 'party' },
      { id: 'donor:acme holdings pty ltd', label: 'Acme Holdings Pty Ltd', kind: 'donor', industry: 'property', aliases: [] },
      { id: 'donor:jordan quill', label: 'Jordan Quill', kind: 'donor', industry: 'individual', aliases: [] },
    ],
    edges: [
      { source: 'donor:acme holdings pty ltd', target: 'party:Example Party', total: 5000, count: 2 },
      { source: 'donor:jordan quill', target: 'party:Example Party', total: 9000, count: 1 },
    ],
  };
  const r = await partyDonations({ kb: async () => ({}), asset: async () => graph }, { party: 'Example Party' });
  assert.deepEqual(r.data.rows.map((x) => x.donor), ['Acme Holdings Pty Ltd']);
  assert.equal(r.data.donors_not_named.label, 'Donors not named (1)');
  const text = JSON.stringify(r) + JSON.stringify(factSheet([r]));
  assert.doesNotMatch(text, /Jordan Quill|name withheld/);
});

test('the cache key follows the question, CACHE_EPOCH and the model pin', async () => {
  const a = await agenticCacheKey('Who is making the most speeches about gambling reform?', 'e1', 'openai-compatible');
  assert.equal(a, await agenticCacheKey('  who is making the MOST speeches about gambling reform ', 'e1', 'openai-compatible'));
  assert.notEqual(a, await agenticCacheKey('Who is making the most speeches about gambling reform?', 'e2', 'openai-compatible'));
  assert.notEqual(a, await agenticCacheKey('Who is making the most speeches about gambling reform?', 'e1', 'other-model'));
});

test('the run streams plan and step events, and falls back to the template when the prose fails', async () => {
  const events = [];
  const deps = {
    kb: async () => ({ fulltext: { total: 200, facets: { '/u/o': { '/u/o/Alex Example': 87, '/u/o/Sam Sample': 60 } } } }),
    asset: async () => null,
    generate: async (_q, prompt) => /Plan the record/.test(prompt.user)
      ? { text: '{"shape":"ranking","steps":[{"tool":"count_speeches","args":{"topic":"gambling","group_by":"speaker"},"label":"Counting gambling speeches by speaker"}]}', tokens: { input: 10, output: 5 } }
      : { text: 'Alex Example leads with 99 [1].', tokens: { input: 20, output: 8 } },
  };
  const out = await runAgentic('Who speaks most about gambling?', deps, async (e, d) => events.push([e, d]));
  assert.equal(out.answered, true);
  assert.equal(out.answer_source, 'template');
  assert.match(out.answer, /Alex Example: 87 chamber speeches labelled gambling \[1\]/);
  assert.deepEqual(out.tokens, { input: 30, output: 13 });
  assert.deepEqual(events.map(([, d]) => d.phase + (d.step ? `:${d.step.state}` : '')), ['planning', 'plan', 'step:running', 'step:done', 'writing']);
  const none = await runAgentic('Who speaks most about gambling?', { ...deps, generate: async () => ({ text: 'I cannot help' }) });
  assert.equal(none.answered, false);
  assert.equal(none.reason, 'declined');
});
