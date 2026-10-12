import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {loadWorker, offline} from './worker-harness.mjs';
import {question, stubFetch} from './fixtures/ask-no-answer.mjs';

const restore = offline();
const harness = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
let mode = 'declined', calls = 0;
globalThis.fetch = async (input, init) => { if (String(input).endsWith('/ask') && JSON.parse(init.body).generate_answer !== false) calls++; return stubFetch(input, init, mode); };
test.after(restore);
async function ask(stream, query = question, controls = {}) {
  const response = await harness.fetch('/api/ask' + (stream ? '?stream=1' : ''), {method: 'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({question: query, ...controls})});
  assert.equal(response.status, 200);
  const raw = await response.text();
  if (!stream) return JSON.parse(raw);
  assert.ok(!raw.includes('event: delta'), 'no unverified draft or schema may reach the browser');
  const done = raw.split('\n\n').find(block => block.startsWith('event: done'));
  assert.ok(done, raw);
  return JSON.parse(done.split('\ndata: ')[1]);
}
for (const scenario of ['declined', 'grounding_failed', 'uncited']) test(`${scenario}: actual sync and SSE routes return the same decision and retain sources`, async () => {
  mode = scenario; calls = 0;
  const sync = await ask(false), stream = await ask(true);
  assert.deepEqual(stream, sync);
  assert.equal(sync.answered, false);
  assert.equal(sync.reason, scenario === 'uncited' ? 'no_supported_claim' : scenario);
  assert.equal(sync.answer, '');
  assert.deepEqual(sync.citations, {});
  assert.ok(sync.sources.length);
  assert.ok(sync.sources.every(source => source.cited === false));
  assert.equal(sync.next_step.href, '/subject/person/melissa-mcintosh');
  assert.deepEqual(sync.followups, []);
  if (scenario === 'declined') assert.equal(calls, 2, 'a deliberate decline is not retried');
});
test('answered: actual sync and SSE routes preserve the normal answer bytes and citations', async () => {
  mode = 'answered';
  const sync = await ask(false), stream = await ask(true);
  assert.deepEqual(stream, sync);
  assert.equal(sync.answered, true);
  assert.equal(sync.answer, 'She called for scrutiny of housing proposals.');
  assert.ok(Object.keys(sync.citations).length);
  assert.equal(sync.next_step, undefined);
});
test('a position rejected by the existing numeric verifier has no answer in either route', async () => {
  mode = 'numeric';
  const query = 'What did Melissa McIntosh say about the cost of housing?';
  const sync = await ask(false,query), stream = await ask(true,query);
  assert.deepEqual(stream,sync);
  assert.equal(sync.answered,false);assert.equal(sync.reason,'grounding_failed');
  assert.equal(sync.answer,'');assert.ok(sync.sources.length);assert.deepEqual(sync.citations,{});
});
test('an explicit roster speaker retains the profile link even without an inferred scope', async () => {
  mode = 'declined';
  for (const stream of [false,true]) {
    const result = await ask(stream, question, {speaker:'Melissa McIntosh',kind:'speech'});
    assert.equal(result.next_step.href, '/subject/person/melissa-mcintosh');
  }
});
test('an unnamed subject offers Search records', async () => {
  mode = 'declined';
  const result = await ask(false, 'What does the record say about scrutiny?');
  assert.deepEqual(result.next_step, {label: 'Search records', href: '/ask?view=search'});
});

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const noAnswerCode = app.slice(app.indexOf('function renderNoAnswer('), app.indexOf('function renderAnswer(', app.indexOf('function renderNoAnswer(')));
const chatCode = app.slice(app.indexOf('function chatAnswerEl('), app.indexOf('async function renderChatContext('));
for (const reason of ['declined', 'grounding_failed']) test(`${reason}: web and saved chat render the plain line and sources without a machine block`, () => {
  const document = new JSDOM('<div id="answer"></div>').window.document;
  const api = runInNewContext(noAnswerCode + chatCode + ';({renderNoAnswer,chatAnswerEl})', {
    document, machineLabelHTML: () => '<div class="ui-machine">Machine-written</div>',
    renderAnswer: (el, text, response) => { assert.equal(response.answered, false); api.renderNoAnswer(el, response); },
    sourceItem: source => { const li = document.createElement('li'); li.textContent = source.title; return li; },
  });
  const payload = {answered: false, reason, text: 'A non-answer must stay hidden.', is_overview_intent: true,
    next_step: {label: 'Melissa McIntosh’s page', href: '/subject/person/melissa-mcintosh'},
    sources: [{resource: 'fixture', title: 'Fixture housing debate', cited: false}]};
  const answer = document.getElementById('answer'); api.renderNoAnswer(answer, payload);
  const chat = api.chatAnswerEl(payload);
  for (const node of [answer, chat]) {
    assert.ok(node.textContent.includes("OPAX couldn't find a clear answer to this in the record."));
    assert.ok(!node.textContent.includes('non-answer'));
    assert.equal(node.querySelectorAll('.ui-machine').length, 0);
    assert.equal(node.querySelector('a').getAttribute('href'), payload.next_step.href);
  }
  assert.ok(chat.textContent.includes('Fixture housing debate'));
  assert.equal(chat.querySelector('details').open, true);
});
