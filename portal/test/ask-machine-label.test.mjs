// /support says every finished answer a language model wrote in Ask and in a conversation carries the
// "Machine-written" label. The web client decides it in one place, modelWrittenAnswer() in public/app.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const NOT_MODEL_WRITTEN'), end = app.indexOf('\n}\n', app.indexOf('function modelWrittenAnswer')) + 3;
const modelWrittenAnswer = runInNewContext(app.slice(start, end) + '; modelWrittenAnswer');

test('every answer a model wrote is labelled, not only overview answers', () => {
  for (const status of ['answered', 'partly_cited', 'uncited', undefined]) {
    assert.equal(modelWrittenAnswer({ answer_status: status }, 'An answer.'), true, String(status));
    assert.equal(modelWrittenAnswer({ answer_status: status, is_overview_intent: false }, 'An answer.'), true);
  }
  assert.equal(modelWrittenAnswer({ is_overview_intent: true }, 'An overview.'), true);
});

test('an answer no model wrote is not called machine-written', () => {
  for (const status of ['calculated', 'evidence_only', 'evidence_gap', 'needs_scope', 'needs_period', 'needs_question']) assert.equal(modelWrittenAnswer({ answer_status: status }, 'Text.'), false, status);
  assert.equal(modelWrittenAnswer({ answered: false }, 'Records found.'), false);
  assert.equal(modelWrittenAnswer({}, '   '), false);
  assert.equal(modelWrittenAnswer(null, 'x'), false);
  // A written overview paragraph above a calculated answer is model-written, so the label shows.
  assert.equal(modelWrittenAnswer({ answer_status: 'calculated', money_overview: 'A written paragraph.' }, 'Table.'), true);
});

test('the Ask page and the conversation both use it, and every status the Worker sends is classified', () => {
  assert.match(app, /if \(modelWrittenAnswer\(data, answerText\)\) \{ \$\("ask-overview"\)\.insertAdjacentHTML\("afterbegin", machineLabelHTML\(\)\)/);
  assert.match(app, /if \(modelWrittenAnswer\(msg, msg\.text\)\) wrap\.insertAdjacentHTML\('beforeend', machineLabelHTML\(\)\)/);
  assert.ok(!/is_overview_intent && [^\n]*machineLabelHTML/.test(app), 'the label no longer depends on the overview flag');
  const sent = new Set();
  for (const file of ['index.ts', 'ask-money.ts', 'ask-pay.ts', 'ask-pay-offices.ts', 'ask-rewrite.ts', 'research-evidence.ts', 'research-types.ts', 'ask-money-followup.ts'])
    for (const m of readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').matchAll(/answer_status\s*[:=]\s*'([a-z_]+)'/g)) sent.add(m[1]);
  const known = new Set(['answered', 'partly_cited', 'uncited', 'calculated', 'evidence_only', 'evidence_gap', 'needs_scope', 'needs_period', 'needs_question']);
  assert.deepEqual([...sent].filter(s => !known.has(s)), [], 'a new answer status must be classified as model-written or not');
  const support = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(support, /each\s+finished answer that a language model wrote in Ask or in a conversation carries the label\s+"Machine-written"/);
});
