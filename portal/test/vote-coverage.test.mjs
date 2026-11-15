// Divisions held back from the record are said where the counts are read: on the vote section of each
// member the held divisions name (browser and server page), with the count and the dates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {voteCoverageNotes, voteCoverageText, VOTE_COVERAGE_PATH} from '../public/vote-tables.js';

const pub = new URL('../public/', import.meta.url);
const shipped = JSON.parse(readFileSync(new URL(VOTE_COVERAGE_PATH.slice(1), pub), 'utf8'));
const note = {id: 'vic_lc-unresolved-name', jurisdiction: 'vic', house: 'vic_lc', reason: 'unresolved-name', held: 109,
  from: '2023-02-07', to: '2023-11-30', members: ['Wren Talbot', 'Mara O’Quint']};

test('the note states the count, the house, the dates and why, in plain words', () => {
  assert.equal(voteCoverageText(note),
    '109 Victorian Legislative Council divisions from 7 February 2023 to 30 November 2023 are not in this record, so members’ vote counts for that period are incomplete. They are held back until a former member named in them is added to the OPAX roster.');
  assert.equal(voteCoverageText({...note, held: 1}, 'this member’s'),
    '1 Victorian Legislative Council division from 7 February 2023 to 30 November 2023 is not in this record, so this member’s vote counts for that period are incomplete. It is held back until a former member named in it is added to the OPAX roster.');
  for (const broken of [null, {...note, held: 0}, {...note, house: 'nsw_lc'}, {...note, from: ''}, {...note, reason: 'other'}])
    assert.equal(voteCoverageText(broken), '');
});

test('only a member the held divisions name carries the note', () => {
  const coverage = {notes: [note]};
  assert.equal(voteCoverageNotes(coverage, 'Wren Talbot').length, 1);
  assert.match(voteCoverageNotes(coverage, ["mara o'quint"])[0], /this member’s vote counts/);
  assert.deepEqual(voteCoverageNotes(coverage, 'Someone Else'), []);
  assert.deepEqual(voteCoverageNotes(coverage, ['', null]), []);
  for (const empty of [null, {}, {notes: []}, {notes: 'x'}]) assert.deepEqual(voteCoverageNotes(empty, 'Wren Talbot'), []);
});

test('the shipped note matches the staged mismatch list', () => {
  const held = JSON.parse(readFileSync(new URL('../../data/staged/vic-divisions/mismatches.json', import.meta.url), 'utf8'))
    .filter(row => row.reasons.length === 1 && row.reasons[0] === 'unresolved-name');
  assert.equal(shipped.schema, 1);
  assert.equal(shipped.notes.reduce((n, row) => n + row.held, 0), held.length);
  for (const row of shipped.notes) {
    const own = held.filter(h => h.house === row.house);
    assert.equal(row.held, own.length);
    assert.deepEqual([row.from, row.to], [own.map(h => h.date).sort()[0], own.map(h => h.date).sort().at(-1)]);
    assert.deepEqual(row.members, [...new Set(own.flatMap(h => h.members))].sort());
    assert.ok(voteCoverageText(row), row.id);
  }
});

test('the server page of a named member says it beside the vote counts, and no other page does', async t => {
  if (!shipped.notes.length) return t.skip('no divisions are held back');
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const votes = JSON.parse(readFileSync(new URL('votes.json', pub), 'utf8'));
  const slug = name => name.normalize('NFKD').replace(/[̀-ͯ'’.]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // A named member whose vote section the published vote export draws.
  const named = shipped.notes[0].members.find(name => votes[`vic:${slug(name)}`]);
  assert.ok(named, 'a named member with published votes');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, pub.pathname);
    const page = await (await worker.fetch(`/subject/person/${slug(named)}`)).text();
    assert.ok(page.includes('votes-coverage-note'), named);
    assert.match(page, /held back until a former member named in them is added to the OPAX roster/);
    const other = await (await worker.fetch('/subject/person/anthony-albanese')).text();
    assert.ok(!other.includes('votes-coverage-note'));
  } finally { restore(); }
});
