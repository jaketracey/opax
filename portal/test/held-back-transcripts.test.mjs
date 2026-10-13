import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heldBackTranscriptsHTML, chairRoleTranscriptsHTML} from '../public/held-back-transcripts.js';
import {renderPersonAnswer, panelPrerender} from '../src/seo-content.ts';

const person = {name: 'Example Member', pid: 'fixture-member', states: ['federal'], chambers: ['representatives'], speeches: 0};
const readCounts = (counts, chairCounts) => async path => {
  if (path === '/data/held-back-transcripts.json') return counts;
  if (path === '/data/chair-role-transcripts.json') return chairCounts;
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

test('a chair-only member gets the correct count before JavaScript', async () => {
  const counts = {[person.pid]: 1658};
  const {html} = await renderPersonAnswer(person, readCounts({}, counts), new Map());
  assert.match(html, /1,658 transcripts record this member presiding in the chair and aren't counted as their own speeches\./);
  assert.ok(html.includes(chairRoleTranscriptsHTML(person.pid, counts)), 'browser and server use the same chair notice');
  assert.doesNotMatch(html, /person-held-back/);
});

test('both notices retain their separate counts when a member is in both files', async () => {
  const mixed = {[person.pid]: 11};
  const chair = {[person.pid]: 1659};
  const {html} = await renderPersonAnswer(person, readCounts(mixed, chair), new Map());
  assert.ok(html.includes(heldBackTranscriptsHTML(person.pid, mixed)));
  assert.ok(html.includes(chairRoleTranscriptsHTML(person.pid, chair)));
  assert.equal((html.match(/class="person-held-back fineprint"/g) || []).length, 1);
  assert.equal((html.match(/class="person-chair-role fineprint"/g) || []).length, 1);
});

test('zero, missing and unverified chair counts have no chair notice', async () => {
  for (const counts of [{[person.pid]: 0}, {'another-member': 42}, null]) {
    const {html} = await renderPersonAnswer(person, readCounts({[person.pid]: 11}, counts), new Map());
    assert.doesNotMatch(html, /person-chair-role|presiding in the chair/);
    assert.match(html, /11 earlier transcripts/);
  }
  assert.equal(chairRoleTranscriptsHTML(undefined, {undefined: 42}), '');
  assert.equal(chairRoleTranscriptsHTML(null, {null: 42}), '');
});

test('a single chair transcript reads correctly and invalid counts stay absent', () => {
  assert.match(chairRoleTranscriptsHTML(person.pid, {[person.pid]: 1}), /1 transcript records this member presiding in the chair and isn't counted as their own speeches\./);
  for (const count of [-1, 1.5, '42', Infinity]) assert.equal(chairRoleTranscriptsHTML(person.pid, {[person.pid]: count}), '');
});

test('both notices link to a speaker-attribution section available without JavaScript', () => {
  const methods = panelPrerender(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), 'methods');
  for (const render of [heldBackTranscriptsHTML, chairRoleTranscriptsHTML]) {
    const notice = render(person.pid, {[person.pid]: 12});
    const destination = new URL(notice.match(/href="([^"]+)"/)[1], 'https://fixture.test');
    assert.equal(destination.pathname, '/methods');
    assert.ok(methods.includes(`id="${destination.hash.slice(1)}"`));
  }
  assert.match(methods, /not credited to any one member/);
  assert.match(methods, /fuller split into individual\s+speaking turns is planned/);
  assert.match(methods, /Chair-role transcripts record a member\s+presiding over proceedings and are not counted as that member's own speeches/);
});

test('published chair counts are a positive integer map with 16 mixed-transcript overlaps', () => {
  const chair = JSON.parse(readFileSync(new URL('../public/data/chair-role-transcripts.json', import.meta.url), 'utf8'));
  const mixed = JSON.parse(readFileSync(new URL('../public/data/held-back-transcripts.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(chair).length, 18);
  assert.ok(Object.entries(chair).every(([id, count]) => /^\d+$/.test(id) && Number.isSafeInteger(count) && count > 0));
  assert.equal(Object.keys(chair).filter(id => id in mixed).length, 16);
});

test('published counts remain a positive integer map keyed by person ID', () => {
  const counts = JSON.parse(readFileSync(new URL('../public/data/held-back-transcripts.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(counts).length, 375);
  assert.ok(Object.entries(counts).every(([id, count]) => /^\d+$/.test(id) && Number.isSafeInteger(count) && count > 0));
});
