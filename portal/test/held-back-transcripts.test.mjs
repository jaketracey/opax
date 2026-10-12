import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heldBackTranscriptsHTML} from '../public/held-back-transcripts.js';
import {renderPersonAnswer, panelPrerender} from '../src/seo-content.ts';

const person = {name: 'Example Member', pid: 'fixture-member', states: ['federal'], chambers: ['representatives'], speeches: 0};
const readCounts = counts => async path => {
  if (path === '/data/held-back-transcripts.json') return counts;
  throw new Error('No fixture asset');
};

test('an affected member with zero speeches gets the correct held-back count in server content', async () => {
  const counts = {[person.pid]: 1234, 'another-member': 42};
  const {html} = await renderPersonAnswer(person, readCounts(counts), new Map());
  assert.match(html, /1,234 earlier transcripts include this member alongside others and aren't counted yet\./);
  assert.ok(html.includes(heldBackTranscriptsHTML(person.pid, counts)), 'browser and server use the same notice');
  assert.equal((html.match(/class="person-held-back fineprint"/g) || []).length, 1);
});

test('zero, missing and unverified person IDs have no notice', async () => {
  for (const counts of [{[person.pid]: 0}, {'another-member': 42}]) {
    const {html} = await renderPersonAnswer(person, readCounts(counts), new Map());
    assert.doesNotMatch(html, /person-held-back|aren't counted yet/);
  }
  assert.equal(heldBackTranscriptsHTML(undefined, {undefined: 42}), '');
  assert.equal(heldBackTranscriptsHTML(null, {null: 42}), '');
});

test('a single held-back transcript reads correctly and invalid counts stay absent', () => {
  assert.match(heldBackTranscriptsHTML(person.pid, {[person.pid]: 1}), /1 earlier transcript includes this member alongside others and isn't counted yet\./);
  for (const count of [-1, 1.5, '42', Infinity]) assert.equal(heldBackTranscriptsHTML(person.pid, {[person.pid]: count}), '');
});

test('the notice links to a speaker-attribution section available without JavaScript', () => {
  const notice = heldBackTranscriptsHTML(person.pid, {[person.pid]: 12});
  const destination = new URL(notice.match(/href="([^"]+)"/)[1], 'https://fixture.test');
  assert.equal(destination.pathname, '/methods');
  const methods = panelPrerender(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), 'methods');
  assert.ok(methods.includes(`id="${destination.hash.slice(1)}"`));
  assert.match(methods, /not credited to any one member/);
  assert.match(methods, /fuller split into individual\s+speaking turns is planned/);
});

test('published counts remain a positive integer map keyed by person ID', () => {
  const counts = JSON.parse(readFileSync(new URL('../public/data/held-back-transcripts.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(counts).length, 375);
  assert.ok(Object.entries(counts).every(([id, count]) => /^\d+$/.test(id) && Number.isSafeInteger(count) && count > 0));
});
