import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ stdin: { contents: "export * from './src/research-evidence';export * from './src/research-monitor';export { ResearchError } from './src/research-types';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

// Invented people and passages only.
const roster = { people: [{ name: 'Robin Example' }, { name: 'Casey Sample' }, { name: 'Jordan Fixture' }] };
const scope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false };
const id = 'c'.repeat(32) + '/t/body/0-300', other = 'd'.repeat(32) + '/t/body/0-300';
const speech = 'We must cap poker machine losses at one dollar a spin. Mandatory precommitment will protect families from gambling harm. The industry has fought every reform.';
const passage = { id, resource: id.split('/')[0], slug: 'speech-9', title: 'Gambling debate', url: 'https://opax.com.au/doc/speech-9', text: speech, kind: 'speech', speaker: 'Robin Example', party: 'Australian Labor Party', date: '2012-05-10', query: 'poker machine reform' };
const passages = new Map([[id, passage], [other, { ...passage, id: other, resource: other.split('/')[0], slug: 'speech-10', speaker: undefined, party: undefined }]]);
const question = 'What has been said about poker machine reform?';
function run(points, q = question, named = scope) {
  const why = [], tally = api.emptyTally();
  const out = api.verifyResearchPoints(points, passages, q, named, undefined, roster, r => why.push(r), tally);
  return { out, why, tally, lines: out?.answer.split('\n').map(l => l.slice(2)) ?? [] };
}

test('quote: the citation quote is not checked; a point citing a retrieved passage stays cited as written', () => {
  // Minimum checks: no re-spanning or re-selection of citation quotes.
  const a = run([{ claim: 'In 2012, Robin Example said mandatory precommitment would protect families.', id, quote: 'mandatory pre-commitment will protect FAMILIES from gambling' }]);
  assert.equal(a.tally.points_kept, 1); assert.deepEqual(a.tally.repairs, {}); assert.ok(a.out.citations[id]); assert.equal(a.lines[0], 'In 2012, Robin Example said mandatory precommitment would protect families.');
  const b = run([{ claim: 'In 2012, Robin Example said the industry had fought every reform of poker machines.', id, quote: 'the industry resisted all change' }]);
  assert.equal(b.tally.points_kept, 1); assert.deepEqual(b.tally.repairs, {}); assert.ok(b.out.citations[id]);
});

test('quote marks: verbatim words stay quoted (re-cased); anything else loses its marks, never stays quoted', () => {
  const { lines, tally } = run([
    { claim: 'Robin Example said we must “CAP POKER MACHINE LOSSES at one dollar a spin”.', id, quote: 'cap poker machine losses' },
    { claim: 'Robin Example said “precommitment is the only answer to poker machine harm”.', id, quote: 'Mandatory precommitment will protect families' }]);
  assert.equal(lines[0], 'Robin Example said we must “cap poker machine losses at one dollar a spin”.');
  assert.equal(lines[1], 'Robin Example said precommitment is the only answer to poker machine harm.');
  assert.equal(tally.repairs.quote_recased, 1); assert.equal(tally.repairs.unquoted, 1);
});

test('speaker, party, causal, topic and figure checks no longer rewrite or drop a point', () => {
  // Minimum checks: each point stands as written, cited to its retrieved passage; only unsupported quote marks come off.
  const asWritten = [
    'In 2012, Labor\'s Casey Sample argued the industry has fought every reform.',
    'Robin Example rejected Casey Sample\'s view and said the industry has fought every reform.',
    'A Greens senator said the industry has fought every reform of poker machines.',
    'Greens senators said the industry has fought every reform of poker machines.',
    'In 2012, industry donations influenced the poker machine reform vote.',
    'Robin Example spoke about wind farm planning approvals in rural districts.',
    'Robin Example said 40 per cent of poker machine losses come from problem gamblers.',
  ];
  for (const claim of asWritten) {
    const v = run([{ claim, id, quote: 'The industry has fought every reform.' }], /wind farm/.test(claim) ? 'What has been said about wind farms?' : question);
    assert.deepEqual(v.lines, [claim], claim); assert.ok(v.out.citations[id], claim); assert.equal(v.out.answer_status, undefined, claim);
    assert.deepEqual(v.tally.drops, {}, claim); assert.deepEqual(v.tally.repairs, {}, claim);
  }
  // Quoted words in another member's mouth keep their marks when the passage holds them verbatim.
  const b = run([{ claim: 'Casey Sample said “The industry has fought every reform.”', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(b.lines[0], 'Casey Sample said “The industry has fought every reform.”'); assert.ok(b.out.citations[id]);
  // A passage with no speaker: the point is not renamed and stands, cited.
  const d = run([{ claim: 'Industry donations influenced the poker machine reform vote.', id: other, quote: 'The industry has fought every reform.' }]);
  assert.equal(d.lines[0], 'Industry donations influenced the poker machine reform vote.'); assert.ok(d.out.citations[other]);
});

test('floor: a point citing an unretrieved passage stands uncited beside the cited one', () => {
  const unknown = 'e'.repeat(32) + '/t/body/0-10';
  const { out, tally, lines } = run([
    { claim: 'Robin Example said the industry has fought every reform.', id: unknown, quote: 'The industry has fought every reform.' },
    { claim: 'Robin Example said losses should be capped at one dollar a spin.', id, quote: 'cap poker machine losses at one dollar a spin' }]);
  assert.equal(lines.length, 2); assert.equal(tally.points_in, 2); assert.equal(tally.points_kept, 1); assert.equal(tally.points_uncited, 1);
  assert.equal(out.answer_status, 'partly_cited'); assert.deepEqual(Object.keys(out.citations), [id]);
});

test('telemetry: one compact answer record and fallback counts, labels and counts only, never text', async () => {
  const logs = [], old = console.log; console.log = v => logs.push(v);
  try {
    const tally = { points_in: 3, points_kept: 2, repairs: { unquoted: 1 }, drops: { off_topic: 1 }, mode: 'points' };
    await api.recordResearchAnswer('What has Robin Example said about poker machines?', tally);
    await api.recordResearchFailure('What has Robin Example said about poker machines?', new api.ResearchError('grounding', { rounds: 2, tokens: { input: 1, output: 1 }, answer: tally }));
  } finally { console.log = old; }
  const [answer, failure] = logs.map(l => JSON.parse(l));
  assert.deepEqual(Object.keys(answer).sort(), ['drops', 'kind', 'mode', 'points_in', 'points_kept', 'question_hash', 'repairs', 'answer_mode'].sort());
  assert.equal(answer.kind, 'research_loop_answer'); assert.equal(answer.points_kept, 2); assert.deepEqual(answer.drops, { off_topic: 1 });
  assert.equal(failure.kind, 'research_loop_fallback'); assert.equal(failure.points_in, 3); assert.deepEqual(failure.repairs, { unquoted: 1 });
  assert.doesNotMatch(logs.join('\n'), /Robin Example|poker/);
});
