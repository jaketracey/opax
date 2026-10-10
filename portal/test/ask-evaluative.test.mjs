import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isEvaluativeQuestion, neutralEvaluativeAnswer } from '../public/ask-evaluative.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ask-evaluative.json', import.meta.url)));
for (const question of fixtures.neutral) test(`neutral intent: ${question}`, () => assert.equal(isEvaluativeQuestion(question), true));
for (const question of fixtures.factual) test(`factual intent: ${question}`, () => assert.equal(isEvaluativeQuestion(question), false));
test('an elliptical judgement uses only the reader’s political context', () => {
  assert.equal(isEvaluativeQuestion('Which is best?', [{ author: 'user', text: 'Compare political parties.' }]), true);
  assert.equal(isEvaluativeQuestion('Which is best?', [{ author: 'answer', text: 'Compare political parties.' }]), false);
  assert.equal(isEvaluativeQuestion('Which is best?', null), false);
});

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const fn = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'apiAsk').getText(parsed);
const code = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const stream of [false, true]) test(`neutral reply before any retrieval or model call (${stream ? 'stream request' : 'JSON request'})`, async () => {
  const calls = [];
  const unexpected = name => async () => { calls.push(name); throw new Error(`Unexpected ${name}`); };
  const apiAsk = runInNewContext(code + ';apiAsk', {
    isEvaluativeQuestion, neutralEvaluativeAnswer, Date, URL, Request, Response,
    json: data => Response.json(data),
    questionNamesWithheldDonor: unexpected('asset lookup'), rankedMoneyAnswer: unexpected('money ranking'), paidAnswer: unexpected('salary ranking'),
    standaloneQuestion: unexpected('model rewrite'), retrieveAskRecords: unexpected('retrieval'), kbFetch: unexpected('model'),
    fetch: unexpected('network'), rateLimited: unexpected('quota'),
  });
  for (const question of fixtures.neutral) {
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
