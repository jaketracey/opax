import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isEvaluativeQuestion, mightBeEvaluative, neutralEvaluativeAnswer } from '../public/ask-evaluative.js';
import { readRewrite } from '../src/ask-rewrite.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ask-evaluative.json', import.meta.url)));
test('the review regression set contains 50 evaluative and 50 factual phrasings', () => {
  assert.equal(fixtures.neutral.length, 50); assert.equal(fixtures.factual.length, 50);
  assert.equal(new Set([...fixtures.neutral, ...fixtures.factual]).size, 100);
});
const holdout = JSON.parse(readFileSync(new URL('./fixtures/ask-intent-holdout.json', import.meta.url)));
const neutral = [...fixtures.neutral, ...holdout.neutral], factual = [...fixtures.factual, ...holdout.factual];
for (const question of factual) test(`fast path leaves factual intent to the rewrite: ${question}`, () => assert.equal(isEvaluativeQuestion(question), false));
test('fast-path precision is 100 percent across all 140 phrasings; recall is delegated to the model', () => {
  assert.equal(neutral.length + factual.length, 140);
  assert.equal(new Set([...neutral, ...factual]).size, 140);
  assert.ok(neutral.filter(isEvaluativeQuestion).length >= 3);
  assert.equal(factual.filter(isEvaluativeQuestion).length, 0);
  for (const question of ["Who's the best PM?", 'Who is the worst senator?', 'Which party should I vote for?']) assert.equal(isEvaluativeQuestion(question), true);
  for (const question of ['Which is best?', 'Can I trust this senator?', 'Which party is more honest?']) assert.equal(isEvaluativeQuestion(question), false);
});

test('the cheap filter selects possible political judgements without deciding their intent', () => {
  for (const question of ['Which party is more honest?', 'Is Labor any good?', 'Which senator is the laziest?', 'Who shoud I vote for?', 'Which minister is incompetant?', 'Who should I put first on my ballot?', 'Should I elect the Greens?']) assert.equal(mightBeEvaluative(question),true,question);
  for (const question of ['What has parliament said about housing?', 'What are MPs paid?', 'Who receives the most funding from gambling donors?', 'Who spoke about the worst floods?', 'What are the best public transport options?']) assert.equal(mightBeEvaluative(question),false,question);
  assert.equal(mightBeEvaluative('Is he competent?',{speaker:'Example MP'}),true);
  assert.equal(mightBeEvaluative('Which senator said the minister was corrupt?'),true,'reported judgement needs a model intent decision, not a local neutral reply');
  assert.equal(isEvaluativeQuestion('Which senator said the minister was corrupt?'),false);
});

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const fn = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'apiAsk').getText(parsed);
const code = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const stream of [false, true]) test(`neutral reply before any retrieval or model call (${stream ? 'stream request' : 'JSON request'})`, async () => {
  const calls = [];
  const unexpected = name => async () => { calls.push(name); throw new Error(`Unexpected ${name}`); };
  const apiAsk = runInNewContext(code + ';apiAsk', {
    isEvaluativeQuestion, mightBeEvaluative, neutralEvaluativeAnswer, Date, URL, Request, Response,
    json: data => Response.json(data),
    questionNamesWithheldDonor: unexpected('asset lookup'), rankedMoneyAnswer: unexpected('money ranking'), paidAnswer: unexpected('salary ranking'),
    standaloneQuestion: unexpected('model rewrite'), retrieveAskRecords: unexpected('retrieval'), kbFetch: unexpected('model'),
    fetch: unexpected('network'), rateLimited: unexpected('quota'),
  });
  for (const question of neutral.filter(isEvaluativeQuestion)) {
    const response = await apiAsk(new Request(`http://opax.test/api/ask${stream ? '?stream=1' : ''}`, {
      method: 'POST', body: JSON.stringify({ question, context: [{ author: 'user', text: 'What are MPs paid?' }] }),
    }), {}, { waitUntil() { throw new Error('No background calls'); } });
    const payload = await response.json();
    assert.match(payload.answer, /OPAX doesn't rank or judge politicians/);
    assert.equal(payload.answer_status, 'neutral');
    assert.deepEqual(payload.citations, {}); assert.deepEqual(payload.sources, []);
    assert.deepEqual(payload.comparison_chips.map(chip => chip.label), ['Votes on a topic', 'Attendance at divisions', 'Speeches on a topic', 'Declared interests', 'Pay']);
    assert.ok(payload.comparison_chips.every(chip => !isEvaluativeQuestion(chip.question)));
    assert.ok(!payload.answer.includes(question));
  }
  assert.deepEqual(calls, []);
});

for (const stream of [false, true]) for (const conversation of [false, true]) test(`model-flagged intent stops every retrieval and answer generation (${stream ? 'stream' : 'JSON'}, ${conversation ? 'follow-up' : 'first question'})`, async () => {
  const seen = { rewrite: 0, retrieval: 0, generation: 0, quota: 0 };
  const unexpected = name => async () => { seen[name]++; throw new Error(`Unexpected ${name}`); };
  const apiAsk = runInNewContext(code + ';apiAsk', {
    isEvaluativeQuestion, mightBeEvaluative, neutralEvaluativeAnswer, Date, URL, Request, Response,
    json: data => Response.json(data), readerTurns: input => (input.context || []).filter(t => t.author === 'user').map(t => t.text), questionNamesWithheldDonor: async () => false,
    askCacheInput: () => null, cacheBypass: () => false,
    rateLimited: async () => { seen.quota++; return null; },
    standaloneQuestion: async input => { seen.rewrite++; return readRewrite(input.question + '\nINTENT: evaluative', input.question, ''); },
    rankedMoneyAnswer: unexpected('retrieval'), paidAnswer: unexpected('retrieval'), loadPeople: unexpected('retrieval'),
    retrieveAskRecords: unexpected('retrieval'), kbFetch: unexpected('generation'), fetch: unexpected('generation'),
  });
  const questions = neutral.filter(question => !isEvaluativeQuestion(question) && (conversation || mightBeEvaluative(question)));
  for (const question of questions) {
    const res = await apiAsk(new Request(`http://opax.test/api/ask${stream ? '?stream=1' : ''}`, {
      method: 'POST', body: JSON.stringify({question, ...(conversation ? {context:[{author:'user',text:'Compare parliamentary records.'}]} : {})}),
    }), {}, { waitUntil() { throw new Error('No background generation'); } });
    const payload = await res.json();
    assert.equal(payload.answer_status, 'neutral');
    assert.deepEqual(payload.sources, []); assert.deepEqual(payload.citations, {});
    assert.deepEqual(payload.comparison_chips.map(chip => chip.label), ['Votes on a topic', 'Attendance at divisions', 'Speeches on a topic', 'Declared interests', 'Pay']);
  }
  assert.deepEqual(seen, {rewrite:questions.length,quota:questions.length,retrieval:0,generation:0});
});
