// The aggregate cap on paid generation (MODEL_LIMITER) and the Ask limiter on the
// money overview: past either, no model call is made and the fallback stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import {offline, loadWorker, outbound} from './worker-harness.mjs';

test.after(offline());
const {env, fetch} = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
const limiter = success => ({calls: 0, async limit() { this.calls++; return {success}; }});
const post = (path, body, query = '') => fetch(path + query, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
const reset = (model, ask) => { outbound.length = 0; env.MODEL_LIMITER = model; env.ASK_LIMITER = ask; };

test('a spent model budget answers "busy" without a call or a lighter retry', async () => {
  reset(limiter(false), limiter(true));
  const response = await post('/api/ask', {question: 'What has parliament said about housing affordability?'});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-opax-model-budget'), 'spent');
  assert.equal(response.headers.get('retry-after'), '60');
  assert.match((await response.json()).error, /try again in a minute/);
  assert.equal(outbound.length, 0, 'no model call past the budget');
  assert.equal(env.MODEL_LIMITER.calls, 1, 'the lighter retry is skipped');
  // Streamed, the same budget refuses the call before it is made.
  reset(limiter(false), limiter(true));
  await (await post('/api/ask', {question: 'What has parliament said about housing affordability?'}, '?stream=1')).text();
  assert.equal(outbound.length, 0);
  // Follow-up chips fall back to none.
  reset(limiter(false), limiter(true));
  const chips = await post('/api/followups', {question: 'What has parliament said about housing?', answer: 'Members debated supply and rents at length. '.repeat(10), passages: [{title: 'Debate', text: 'Housing supply and rents. '.repeat(40)}]});
  assert.deepEqual(await chips.json(), {questions: []});
  assert.equal(outbound.length, 0);
  assert.equal(env.MODEL_LIMITER.calls, 1, 'the chips reached the budget gate');
});

test('with budget to spare the gate lets the call through', async () => {
  reset(limiter(true), limiter(true));
  await post('/api/ask', {question: 'What has parliament said about housing affordability?'});
  assert.ok(outbound.length > 0, 'the call reached the (refused) network');
  assert.ok(env.MODEL_LIMITER.calls >= 1);
});

test('the money overview spends the reader\'s Ask quota and the model budget; past either the calculated answer stands alone', async () => {
  const question = 'Who receives the most funding from gambling donors?';
  reset(limiter(true), limiter(false));
  let response = await post('/api/ask', {question});
  let out = await response.json();
  assert.equal(out.answer_status, 'calculated');
  assert.equal(out.money_overview, undefined);
  assert.equal(response.headers.get('x-opax-overview'), 'rate-limited');
  assert.equal(outbound.length, 0);
  assert.equal(env.MODEL_LIMITER.calls, 0, 'the budget is not touched once the reader is limited');
  reset(limiter(false), limiter(true));
  response = await post('/api/ask', {question});
  out = await response.json();
  assert.equal(out.answer_status, 'calculated');
  assert.equal(out.money_overview, undefined);
  assert.equal(response.headers.get('x-opax-overview'), 'upstream-429');
  assert.equal(outbound.length, 0);
});
