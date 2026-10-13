// The stepped Ask's step list (public/ask-steps.js): rows from step events,
// in id order, text set once; the finished run as one line that opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="live"></div><div id="line"></div></body></html>');
globalThis.document = dom.window.document;
const { mountSteps, renderStepsLine, renderResearchTrail } = await import('../public/ask-steps.js');
const rows = (root) => [...root.querySelectorAll('.as-row')].map((r) => [r.querySelector('.as-text').textContent, r.dataset.state, r.querySelector('.as-mark').getAttribute('aria-label')]);

test('live rows follow step events, in id order, with writing last', () => {
  const box = document.getElementById('live');
  const run = mountSteps(box, { centred: true });
  const list = box.querySelector('.as-live');
  assert.equal(list.getAttribute('aria-live'), 'polite');
  assert.equal(list.getAttribute('aria-relevant'), 'additions');
  assert.ok(list.classList.contains('as-centred'));
  run.step({ id: 2, label: 'Counting by speaker', arg: '4,482 speeches', state: 'running' });
  run.step({ id: 1, label: 'Searching speeches', arg: 'gambling reform', state: 'done' });
  const text = list.querySelector('.as-row .as-text');
  run.writing();
  run.step({ id: 3, label: 'Checking committee hearings', state: 'failed' });
  run.step({ id: 2, label: 'Counting by speaker', arg: '4,482 speeches', state: 'done' });
  run.writing();
  assert.deepEqual(rows(list), [
    ['Searching speeches·, gambling reform', 'done', 'done'],
    ['Counting by speaker·, 4,482 speeches', 'done', 'done'],
    ['Checking committee hearings', 'failed', 'failed'],
    ['Writing the answer', 'running', 'working'],
  ]);
  assert.equal(list.querySelector('.as-row .as-text'), text, 'a state change keeps the row and its text');
  assert.deepEqual(run.steps().map((s) => [s.id, s.state]), [[1, 'done'], [2, 'done'], [3, 'failed']]);
  run.destroy();
  assert.equal(box.children.length, 0);
});

test('an argument is cut to 40 characters and set as text, never markup', () => {
  const box = document.getElementById('live');
  const run = mountSteps(box);
  run.step({ id: 1, label: 'Checking votes', arg: '<b>Interactive Gambling Amendment (Credit Card Ban) Bill</b>', state: 'running' });
  const arg = box.querySelector('.as-arg');
  assert.equal(arg.children.length, 0);
  assert.equal(arg.textContent.length, 40);
  run.destroy();
});

test('the finished run is one line that opens its steps', () => {
  const slot = document.getElementById('line');
  renderStepsLine(slot, { steps: [
    { id: 2, label: 'Checking committee hearings', arg: 'gambling', state: 'failed', ms: 5000 },
    { id: 1, label: 'Counting by speaker', arg: 'gambling', state: 'done', ms: 947 },
  ], ms: 11_400 });
  const button = slot.querySelector('button.as-toggle');
  assert.equal(slot.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.textContent, '2 steps·11 s, 11 seconds');
  const list = document.getElementById(button.getAttribute('aria-controls'));
  assert.equal(list.hidden, true);
  assert.equal(list.getAttribute('aria-live'), null, 'the finished list is not a live region');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(list.hidden, false);
  assert.deepEqual(rows(list).map(([t, s]) => [t, s]), [['Counting by speaker·, gambling', 'done'], ['Checking committee hearings·, gambling', 'failed']]);
  button.click();
  assert.equal(list.hidden, true);
});

test('one step reads singular; no run clears the slot', () => {
  const slot = document.getElementById('line');
  renderStepsLine(slot, { steps: [{ id: 1, label: 'Searching speeches', state: 'done' }], ms: 600 });
  assert.equal(slot.querySelector('.as-toggle').textContent, '1 step·1 s, 1 second');
  renderStepsLine(slot, { steps: [] });
  assert.equal(slot.hidden, true);
  assert.equal(slot.children.length, 0);
  renderStepsLine(slot, undefined);
  assert.equal(slot.hidden, true);
});

// The research loop (briefs/research-loop-contract.md): tool, round, results
// and ms ride on the same events; "error" is the loop's word for failed.
const items = (root) => [...root.querySelectorAll('.as-list > li')].map((r) => r.classList.contains('as-round')
  ? ['rule', r.textContent]
  : [r.querySelector('.as-text').textContent, r.dataset.state, r.querySelector('.as-meta').textContent]);

test('a loop row finishes with what it found and its time; later rounds open under a rule', () => {
  const box = document.getElementById('live');
  const run = mountSteps(box, { centred: true });
  const list = box.querySelector('.as-live');
  run.step({ id: 1, round: 1, tool: 'search', label: 'Searching speeches', arg: 'poker machines', state: 'running' });
  assert.ok(list.classList.contains('as-loop'), 'a loop run takes its wider column from the first row');
  const meta = list.querySelector('.as-meta');
  assert.equal(meta.textContent, '', 'nothing beside a running row');
  run.step({ id: 1, round: 1, tool: 'search', label: 'Searching speeches', state: 'done', results: 1280, ms: 1240 });
  run.step({ id: 3, round: 2, tool: 'member_votes', label: 'Checking votes', state: 'running' });
  run.step({ id: 2, round: 1, tool: 'read_passage', label: 'Reading a passage', state: 'done', results: 1, ms: 40 });
  run.step({ id: 3, round: 2, tool: 'member_votes', label: 'Checking votes', state: 'error', ms: 5000 });
  run.step({ id: 4, round: 2, tool: 'mystery_tool', label: 'Checking', state: 'done', results: 0, ms: 12_400 });
  assert.equal(list.querySelector('.as-meta'), meta, 'the row keeps its parts');
  assert.equal(meta.getAttribute('aria-hidden'), 'true', 'live counts are not announced');
  assert.deepEqual(items(list), [
    ['Searching speeches·, poker machines', 'done', ', 1,280 passages·1.2 s, 1.2 seconds'],
    ['Reading a passage', 'done', ', 1 passage·<0.1 s, under a tenth of a second'],
    ['rule', 'Round 2'],
    ['Checking votes', 'failed', ', Failed·5.0 s, 5.0 seconds'],
    ['Checking', 'done', ', No results·12 s, 12 seconds'],
  ]);
  assert.equal(list.querySelectorAll('.as-row')[2].querySelector('.as-mark').getAttribute('aria-label'), 'failed');
  assert.deepEqual(run.steps().map((s) => [s.id, s.round]), [[1, 1], [2, 1], [3, 2], [4, 2]]);
  run.destroy();
});

test('planner rows keep their look: no counts, times or rules', () => {
  const box = document.getElementById('live');
  const run = mountSteps(box, { centred: true });
  run.step({ id: 1, label: 'Counting by speaker', state: 'running' });
  run.step({ id: 1, label: 'Counting by speaker', state: 'done', ms: 900 });
  const list = box.querySelector('.as-live');
  assert.ok(!list.classList.contains('as-loop'));
  assert.deepEqual(items(list), [['Counting by speaker', 'done', '']]);
  run.destroy();
});

test('"How this was researched" is a folded disclosure with the run grouped by round', () => {
  const slot = document.getElementById('line');
  renderResearchTrail(slot, { mode: 'loop', rounds: 2, trail: [
    { id: 3, tool: 'member_votes', label: 'Checking votes', arg: 'gambling', results: 12, ms: 410, ok: true, round: 2 },
    { id: 1, tool: 'search', label: 'Searching speeches', results: 128, ms: 1240, ok: true, round: 1 },
    { id: 2, tool: 'find_people', label: 'Finding the member', ms: 5000, ok: false, round: 1 },
  ], sources: [] }, { ms: 13_600 });
  const details = slot.querySelector('details.as-trail');
  assert.equal(slot.hidden, false);
  assert.equal(details.open, false, 'folded by default');
  assert.equal(details.querySelector('summary').textContent, 'How this was researched, 3 steps·2 rounds·14\u00a0s, 14 seconds');
  assert.match(details.querySelector('.as-trail-mode').textContent, /^Researched in two rounds: each round chose/);
  assert.deepEqual(items(details), [
    ['rule', 'Round 1'],
    ['Searching speeches', 'done', ', 128 passages·1.2 s, 1.2 seconds'],
    ['Finding the member', 'failed', ', Failed·5.0 s, 5.0 seconds'],
    ['rule', 'Round 2'],
    ['Checking votes·, gambling', 'done', ', 12 votes·0.4 s, 0.4 seconds'],
  ]);
  assert.equal(details.querySelector('.as-list').getAttribute('aria-live'), null);
});

test('a planner trail says so in plain words, and an empty one clears the slot', () => {
  const slot = document.getElementById('line');
  renderResearchTrail(slot, { mode: 'planner', rounds: 1, trail: [{ id: 1, tool: 'count_speeches', label: 'Counting by speaker', results: 15, ms: 312, ok: true }] });
  assert.equal(slot.querySelector('summary').textContent, 'How this was researched, 1 step');
  assert.match(slot.querySelector('.as-trail-mode').textContent, /^Planned from your question, then looked up in order\./);
  assert.equal(slot.querySelectorAll('.as-round').length, 0);
  renderResearchTrail(slot, { mode: 'loop', rounds: 1, trail: [] });
  assert.equal(slot.hidden, true);
  assert.equal(slot.children.length, 0);
});
