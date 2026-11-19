// Divisions held back from the record are said where the counts are read: on the coverage page, on the vote
// section of each member a held division names (browser and server page), and in the tools that count votes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {voteCoverageNotes, voteCoverageText, divisionReadingNotes, VOTE_COVERAGE_PATH} from '../public/vote-tables.js';

const pub = new URL('../public/', import.meta.url);
const shipped = JSON.parse(readFileSync(new URL(VOTE_COVERAGE_PATH.slice(1), pub), 'utf8'));
const note = {id: 'vic_lc-unresolved-name', jurisdiction: 'vic', house: 'vic_lc', reason: 'unresolved-name', held: 109,
  from: '2023-02-07', to: '2023-11-30', members: ['Wren Talbot', 'Mara O’Quint']};

test('the note states the count, the house, the dates and why, in plain words', () => {
  assert.equal(voteCoverageText(note),
    '109 Victorian Legislative Council divisions from 7 February 2023 to 30 November 2023 are not in this record, so members’ vote counts for that period are incomplete. They are held back until a former member named in them is added to the OPAX roster.');
  assert.equal(voteCoverageText({...note, held: 1, to: '2023-02-07'}, 'this member’s'),
    '1 Victorian Legislative Council division of 7 February 2023 is not in this record, so this member’s vote counts for that day are incomplete. It is held back until a former member named in it is added to the OPAX roster.');
  for (const broken of [null, {...note, held: 0}, {...note, house: 'nsw_lc'}, {...note, from: ''}, {...note, reason: 'other'}])
    assert.equal(voteCoverageText(broken), '');
});

test('every reason a division is held for has its own sentence: no held division goes unsaid', () => {
  const said = {
    'unresolved-name': /until a former member named in them is added to the OPAX roster\.$/,
    'result-contradicts-tally': /because the result Hansard prints does not agree with the tally it prints\.$/,
    'numbering-differs-from-published': /because an earlier import missed them, and the records after them on that day need renumbering first\.$/,
    'text-unconfirmed': /because the motion text beside them in Hansard could not be confirmed as the question voted on\.$/,
  };
  for (const [reason, tail] of Object.entries(said)) assert.match(voteCoverageText({...note, reason, held: 3}), tail);
  for (const row of shipped.notes) assert.ok(said[row.reason], row.reason);
});

test('only a member the held divisions name carries the note, and only for years the counts cover', () => {
  const coverage = {notes: [note]};
  assert.equal(voteCoverageNotes(coverage, 'Wren Talbot').length, 1);
  assert.match(voteCoverageNotes(coverage, ["mara o'quint"])[0], /this member’s vote counts/);
  assert.deepEqual(voteCoverageNotes(coverage, 'Someone Else'), []);
  assert.deepEqual(voteCoverageNotes(coverage, ['', null]), []);
  for (const empty of [null, {}, {notes: []}, {notes: 'x'}]) assert.deepEqual(voteCoverageNotes(empty, 'Wren Talbot'), []);
  // The published vote counts carry their first and last year. Before the 2022 to 2026 divisions are loaded they
  // start in 2026, so a note about 2023 would describe counts the panel does not show.
  assert.deepEqual(voteCoverageNotes(coverage, 'Wren Talbot', [2026, 2026]), []);
  assert.equal(voteCoverageNotes(coverage, 'Wren Talbot', [2023, 2026]).length, 1);
  assert.equal(voteCoverageNotes(coverage, 'Wren Talbot', [2020, 2023]).length, 1);
  assert.deepEqual(voteCoverageNotes(coverage, 'Wren Talbot', []), []);
});

test('the shipped notes match the staged mismatch list: every held division is in exactly one note', () => {
  const held = JSON.parse(readFileSync(new URL('../../data/staged/vic-divisions/mismatches.json', import.meta.url), 'utf8'))
    .filter(row => row.id && !row.published_as);
  assert.equal(shipped.schema, 1);
  assert.deepEqual(shipped.notes.flatMap(row => row.divisions).sort(), held.map(row => row.id).sort());
  for (const row of shipped.notes) {
    const own = held.filter(h => row.divisions.includes(h.id));
    assert.equal(row.held, own.length);
    assert.ok(own.every(h => h.house === row.house));
    assert.deepEqual([row.from, row.to], [own.map(h => h.date).sort()[0], own.map(h => h.date).sort().at(-1)]);
    assert.deepEqual(row.members, [...new Set(own.flatMap(h => h.members))].sort());
    assert.ok(voteCoverageText(row), row.id);
  }
});

test('a division record says how to read it, in OPAX’s words and apart from the question', () => {
  const lists = 'Hansard’s division lists do not record pairs, tellers or absences. A member who is not listed was not necessarily absent and did not necessarily abstain.';
  assert.deepEqual(divisionReadingNotes({jurisdiction: 'vic', question: 'That the bill be now read a third time.'}), [lists]);
  // A record with only its division line names the kind of question and claims nothing more.
  for (const [question, said] of [
    ['Council divided on amendment', 'Amendment: the record names no further detail.'],
    ['Council divided on amendments:', 'Amendments: the record names no further detail.'],
    ['Assembly divided on motion.', 'Motion: the record names no further detail.'],
    ['Council divided on new clause', 'New clause: the record names no further detail.'],
    ['Assembly divided on Council amendment 1', 'Council amendment 1: the record names no further detail.'],
    ['Assembly divided question', 'Question: the record names no further detail.'],
  ]) assert.deepEqual(divisionReadingNotes({jurisdiction: 'vic', question}), [said, lists], question);
  const stand = 'On this question a Yes vote (aye) keeps the words as they are, which is a vote against the amendment. A No vote takes the words out, which is a vote for the amendment.';
  assert.deepEqual(divisionReadingNotes({jurisdiction: 'vic', question: 'That the words proposed to be omitted stand part of the question.'}), [stand, lists]);
  assert.deepEqual(divisionReadingNotes({jurisdiction: 'federal', question: 'That the word proposed to be omitted stand part of the motion.'}), [stand]);
  assert.deepEqual(divisionReadingNotes({jurisdiction: 'federal', question: 'That the bill be read a second time'}), []);
  assert.deepEqual(divisionReadingNotes(null), []);
  // Every published Victorian record whose question is a division line gets the line, and no record's own
  // question text is changed to carry it.
  const index = JSON.parse(readFileSync(new URL('divisions/index.json', pub), 'utf8'));
  let lines = 0;
  for (const row of index.divisions.filter(row => row.key.startsWith('vic-'))) {
    const d = JSON.parse(readFileSync(new URL(`divisions/${row.slug}.json`, pub), 'utf8'));
    const notes = divisionReadingNotes(d);
    assert.equal(notes.at(-1), lists, row.key);
    assert.ok(!notes.some(note => d.question.includes(note)), row.key);
    if (/^(Assembly|Council) divided/.test(d.question)) { lines++; assert.match(notes.at(-2), /: the record names no further detail\.$/, row.key); }
  }
  assert.ok(lines > 700);
});

test('the server division page carries the reading notes', async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, pub.pathname);
    const page = await (await worker.fetch('/doc/division-vic-la-2023-05-18-1')).text();
    assert.match(page, /class="division-reading-note">On this question a Yes vote \(aye\) keeps the words as they are/);
    assert.match(page, /division lists do not record pairs, tellers or absences/);
    const line = await (await worker.fetch('/doc/division-vic-la-2023-03-07-1')).text();
    assert.match(line, /class="division-reading-note">Motion: the record names no further detail\.</);
    const federal = await (await worker.fetch('/doc/division-federal-senate-1')).text();
    assert.ok(!federal.includes('division-reading-note'));
  } finally { restore(); }
});

test('the server page of a named member says it beside the vote counts, and no other page does', async t => {
  const votes = JSON.parse(readFileSync(new URL('votes.json', pub), 'utf8'));
  const slug = name => name.normalize('NFKD').replace(/[̀-ͯ'’.]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // A named member whose published counts cover a held division's year.
  const shown = name => voteCoverageNotes(shipped, name, votes[`vic:${slug(name)}`]?.years);
  const named = shipped.notes.flatMap(row => row.members).find(name => votes[`vic:${slug(name)}`] && shown(name).length);
  if (!named) return t.skip('no held division falls in a year the published counts cover');
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, pub.pathname);
    const page = await (await worker.fetch(`/subject/person/${slug(named)}`)).text();
    assert.equal((page.match(/votes-coverage-note/g) || []).length, shown(named).length, named);
    assert.match(page, /is not in this record, so this member’s vote counts for that day are incomplete|are not in this record, so this member’s vote counts for that period are incomplete/);
    const other = await (await worker.fetch('/subject/person/anthony-albanese')).text();
    assert.ok(!other.includes('votes-coverage-note'));
  } finally { restore(); }
});

test('the tools that count votes say what is held: a count is never read as complete', async () => {
  const {build} = await import('esbuild');
  const built = await build({
    stdin: {contents: "export { getTool } from './src/tools/index'; export { heldDivisionNotes } from './src/tools/vote-coverage';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts'},
    bundle: true, write: false, platform: 'node', format: 'esm',
  });
  const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const env = {asset: async path => JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8')), origin: 'https://opax.test'};
  const said = row => voteCoverageText(row);
  // The helper: scoped by chamber, jurisdiction, window and member.
  assert.deepEqual(await api.heldDivisionNotes(env, {jurisdiction: 'vic'}), shipped.notes.map(said));
  assert.deepEqual(await api.heldDivisionNotes(env, {jurisdiction: 'federal'}), []);
  assert.deepEqual(await api.heldDivisionNotes(env, {chamber: 'vic_lc', since: '2023-01-01', until: '2023-12-31'}),
    shipped.notes.filter(row => row.house === 'vic_lc' && row.from <= '2023-12-31' && row.to >= '2023-01-01').map(said));
  assert.deepEqual(await api.heldDivisionNotes(env, {jurisdiction: 'vic', member: ['Nobody At All']}), []);
  assert.deepEqual(await api.heldDivisionNotes({asset: async () => { throw new Error('gone'); }}, {jurisdiction: 'vic'}), []);
  // count_records over the Council in 2023: the count comes with what is held in that chamber and period.
  const counted = await api.getTool('count_records').handler(env, {record_type: 'divisions', chamber: 'vic_lc', year: 2023});
  for (const row of shipped.notes.filter(row => row.house === 'vic_lc' && row.from.startsWith('2023')))
    assert.ok(counted.notes.includes(said(row)), row.id);
  const senate = await api.getTool('count_records').handler(env, {record_type: 'divisions', chamber: 'senate', year: 2023});
  assert.ok(!senate.notes.some(text => /not in this record/.test(text)));
});
