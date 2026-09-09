import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { practiceContest, changePreference, validPreferences, ballotPlan, PRACTICE_DATE } from '../public/ballot.js';

const candidates = ['a', 'b', 'c'].map((id, i) => ({ candidate_id: id, name: `Candidate ${id}`, ballot_position: i + 1, party: 'Independent' }));
const source = { label: 'AEC 2025-05-03 candidates', url: 'https://results.aec.gov.au/31496/Website/Downloads/HouseCandidatesDownload-31496.csv' };
const detail = { name: 'Example', state_code: 'vic', jurisdiction: 'federal', chamber: 'representatives', sources: { aec: source }, elections: [{ election: { poll_date: PRACTICE_DATE, kind: 'general' }, candidates, sources: ['aec'] }] };

test('adding candidates leaves ballot order unchanged and never inserts duplicates', () => {
  let order = changePreference([], candidates, 'add', 'c');
  order = changePreference(order, candidates, 'add', 'a');
  assert.deepEqual(order, ['c', 'a']);
  assert.deepEqual(changePreference(order, candidates, 'add', 'c'), order);
  assert.deepEqual(candidates.map((c) => c.candidate_id), ['a', 'b', 'c']);
  assert.equal(validPreferences(order, candidates, true), false);
});

test('moves preserve unique choices; removal closes gaps; reset empties the plan', () => {
  const original = ['c', 'a', 'b'];
  assert.deepEqual(changePreference(original, candidates, 'up', 'a'), ['a', 'c', 'b']);
  assert.deepEqual(changePreference(original, candidates, 'down', 'a'), ['c', 'b', 'a']);
  assert.deepEqual(changePreference(original, candidates, 'up', 'c'), original);
  assert.deepEqual(changePreference(original, candidates, 'down', 'b'), original);
  assert.deepEqual(changePreference(original, candidates, 'remove', 'a'), ['c', 'b']);
  assert.deepEqual(changePreference(original, candidates, 'reset'), []);
  assert.deepEqual(original, ['c', 'a', 'b']);
});

test('unknown and duplicated preferences cannot be called complete or exported', () => {
  assert.equal(validPreferences(['a', 'b', 'x'], candidates, true), false);
  assert.equal(validPreferences(['a', 'a', 'b'], candidates, true), false);
  assert.equal(validPreferences([], [], true), false);
  assert.throws(() => changePreference(['a', 'a'], candidates, 'add', 'b'), /Invalid/);
  assert.throws(() => changePreference([], candidates, 'add', 'unknown'), /Unknown candidate/);
  assert.throws(() => ballotPlan(detail, practiceContest(detail), ['c', 'b']), /Number every candidate/);
  assert.equal(validPreferences(['c', 'b', 'a'], candidates, true), true);
});

test('download puts the user numbers beside the original candidate order and dates practice clearly', () => {
  const output = ballotPlan(detail, practiceContest(detail), ['c', 'a', 'b']);
  assert.match(output, /2025 PRACTICE BALLOT/);
  assert.match(output, /Historical election: 3 May 2025/);
  assert.match(output, /not a current ballot/);
  assert.ok(output.indexOf('2. Candidate a') < output.indexOf('3. Candidate b'));
  assert.ok(output.indexOf('3. Candidate b') < output.indexOf('1. Candidate c'));
  assert.match(output, /results\.aec\.gov\.au/);
});

test('practice selection requires exactly the historical House contest and a sourced ballot order', () => {
  assert.throws(() => practiceContest({ ...detail, chamber: 'senate' }), /House of Representatives/);
  const clone = () => JSON.parse(JSON.stringify(detail));
  const future = clone(); future.elections[0].election.poll_date = '2028-05-03';
  assert.throws(() => practiceContest(future), /not available/);
  const ambiguous = clone(); ambiguous.elections.push(ambiguous.elections[0]);
  assert.throws(() => practiceContest(ambiguous), /not available/);
  const gap = clone(); gap.elections[0].candidates[1].ballot_position = 4;
  assert.throws(() => practiceContest(gap), /could not be verified/);
  const duplicate = clone(); duplicate.elections[0].candidates[1].candidate_id = 'a';
  assert.throws(() => practiceContest(duplicate), /could not be verified/);
  const noSource = clone(); noSource.sources = {};
  assert.throws(() => practiceContest(noSource), /source is not available/);
});

test('every shipped 2025 House seat keeps the complete official list including unlinked candidates', () => {
  const publicFile = (p) => new URL(`../public${p}`, import.meta.url);
  const manifest = JSON.parse(readFileSync(publicFile('/electorates/manifest.json')));
  const index = JSON.parse(readFileSync(publicFile(manifest.index_url)));
  let seats = 0, people = 0;
  for (const e of index.electorates.filter((e) => e.jurisdiction === 'federal' && e.chamber === 'representatives' && e.latest_election >= PRACTICE_DATE && e.election_count > 0)) {
    const data = JSON.parse(readFileSync(publicFile(e.detail_url)));
    const c = practiceContest(data);
    assert.equal(c.candidates.length, data.elections.find((x) => x.election.poll_date === PRACTICE_DATE).candidates.length);
    assert.equal(validPreferences(c.candidates.map((x) => x.candidate_id).reverse(), c.candidates, true), true);
    seats++; people += c.candidates.length;
  }
  assert.equal(seats, 150);
  assert.equal(people, 1126);
});
