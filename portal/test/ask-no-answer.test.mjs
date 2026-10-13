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
globalThis.fetch = async (input, init) => { if (String(input).endsWith('/ask') && JSON.parse(init.body).generate_answer !== false) calls++; return stubFetch(input, init, mode === 'empty' && calls > 1 ? 'answered' : mode); };
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
  calls = 0; const sync = await ask(false,query);
  assert.equal(calls,3,'strict draft, strict repair, then the same invalid claim in the reasoning fallback');
  calls = 0; const stream = await ask(true,query);
  assert.equal(calls,3);
  assert.deepEqual(stream,sync);
  assert.equal(sync.answered,false);assert.equal(sync.reason,'grounding_failed');
  assert.equal(sync.answer,'');assert.ok(sync.sources.length);assert.deepEqual(sync.citations,{});
});
test('reasoning fallback also rejects fabricated quotations in both routes', async () => {
  mode = 'reasoned_quote';
  for (const stream of [false,true]) {
    const result = await ask(stream,'What did Melissa McIntosh say about housing?');
    assert.equal(result.answered,false); assert.equal(result.reason,'grounding_failed');
    assert.equal(result.answer,''); assert.deepEqual(result.citations,{});
  }
});
test('a supported reasoning fallback keeps its answer bytes in both routes', async () => {
  mode = 'reasoned_supported';
  const query = 'What did Melissa McIntosh say about housing?';
  const sync = await ask(false,query), stream = await ask(true,query);
  assert.deepEqual(stream,sync);
  assert.equal(sync.answered,true); assert.equal(sync.answer_status,'reasoned');
  assert.equal(sync.answer,'She called for scrutiny of housing proposals.');
});
test('an explicit position recovery decline stops generation in both routes', async () => {
  mode = 'position_declined';
  const results = [];
  for (const stream of [false,true]) {
    calls = 0;
    const result = await ask(stream,'What did Melissa McIntosh say about housing?');
    assert.equal(calls,1,'a decline never calls the reasoning fallback');
    assert.equal(result.answered,false); assert.equal(result.reason,'declined');
    assert.ok(result.sources.length); results.push(result);
  }
  assert.deepEqual(results[1],results[0]);
});
test('one-source empty responses agree without retrying a potentially successful second call', async () => {
  mode = 'empty';
  const results = [];
  for (const stream of [false,true]) {
    calls = 0;
    const result = await ask(stream);
    assert.equal(calls,1);
    assert.equal(result.answered,false); assert.equal(result.reason,'grounding_failed');
    assert.ok(result.sources.length); results.push(result);
  }
  assert.deepEqual(results[1],results[0]);
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
test('the source timeline legend shows citations only when a source is cited', () => {
  const document = new JSDOM('<div id="ask-date-ruler"></div>').window.document;
  const start = app.indexOf('function renderAskDateRuler(');
  const render = runInNewContext(app.slice(start,app.indexOf('function renderSearchDateRuler(',start))+';renderAskDateRuler', {
    $:id=>document.getElementById(id), rulerPoint:()=>({x:20}), rulerAxisHTML:()=>'', RULER_LEFT:0, RULER_RIGHT:680,
  });
  const box = document.getElementById('ask-date-ruler');
  const source = {slug:'speech-90000',date:'2026-10-01'};
  render([source],()=>false);
  assert.equal(box.hidden,false); assert.ok(box.textContent.includes('Retrieved only'));
  assert.ok(!box.textContent.includes('Cited in the answer'));
  render([source],()=>true); assert.ok(box.textContent.includes('Cited in the answer'));
  render([],()=>false); assert.equal(box.hidden,true);
});
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
