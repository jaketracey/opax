// The stepped Ask's step list (public/ask-steps.js): rows from step events,
// in id order, text set once; the finished run as one line that opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="live"></div><div id="line"></div></body></html>');
globalThis.document = dom.window.document;
const { mountSteps, renderStepsLine } = await import('../public/ask-steps.js');
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
