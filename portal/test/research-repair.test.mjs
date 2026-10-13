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

test('quote: a near-verbatim citation quote is re-spanned to the passage words; a missing one is re-selected from the best sentence', () => {
  const a = run([{ claim: 'In 2012, Robin Example said mandatory precommitment would protect families.', id, quote: 'mandatory pre-commitment will protect FAMILIES from gambling' }]);
  assert.equal(a.tally.points_kept, 1); assert.equal(a.tally.repairs.quote_respanned, 1); assert.ok(a.out);
  const b = run([{ claim: 'In 2012, Robin Example said the industry had fought every reform of poker machines.', id, quote: 'the industry resisted all change' }]);
  assert.equal(b.tally.points_kept, 1); assert.equal(b.tally.repairs.quote_reselected, 1);
});

test('quote marks: verbatim words stay quoted (re-cased); anything else loses its marks, never stays quoted', () => {
  const { lines, tally } = run([
    { claim: 'Robin Example said we must “CAP POKER MACHINE LOSSES at one dollar a spin”.', id, quote: 'cap poker machine losses' },
    { claim: 'Robin Example said “precommitment is the only answer to poker machine harm”.', id, quote: 'Mandatory precommitment will protect families' }]);
  assert.equal(lines[0], 'Robin Example said we must “cap poker machine losses at one dollar a spin”.');
  assert.equal(lines[1], 'Robin Example said precommitment is the only answer to poker machine harm.');
  assert.equal(tally.repairs.quote_recased, 1); assert.equal(tally.repairs.unquoted, 1);
});

test('speaker: unquoted words put to another member are rewritten to the cited speaker; quoted words in another mouth are dropped', () => {
  const a = run([{ claim: 'In 2012, Labor\'s Casey Sample argued the industry has fought every reform.', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(a.lines[0], 'In 2012, Robin Example argued the industry has fought every reform.'); assert.equal(a.tally.repairs.speaker_rewritten, 1);
  const b = run([{ claim: 'Casey Sample said “The industry has fought every reform.”', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(b.out, null); assert.equal(b.tally.drops.claim_speaker_mismatch, 1);
  // Another member as the subject matter, not the speaker, is fine as written.
  const c = run([{ claim: 'Robin Example rejected Casey Sample\'s view and said the industry has fought every reform.', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(c.tally.points_kept, 1); assert.deepEqual(c.tally.repairs, {});
  const e = run([{ claim: 'Casey Sample\'s words were “The industry has fought every reform.”', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(e.out, null, 'a possessive with quoted words puts them in that member\'s mouth');
  // The cited speaker's own fuller name holds a surname another roster entry shares: still the cited speaker.
  assert.equal(api.claimAttributionOk('In 1994, Louis Stuart Example said the industry has fought every reform.', 'Louis Stuart Example', { people: [{ name: 'Lou Example' }] }), true);
  assert.equal(api.claimAttributionOk('In 1994, Lou Example said the industry has fought every reform.', 'Louis Stuart Example', { people: [{ name: 'Lou Example' }] }), false);
  // An unknown speaker is never named.
  const d = run([{ claim: 'Casey Sample said the industry has fought every reform.', id: other, quote: 'The industry has fought every reform.' }]);
  assert.equal(d.lines[0], 'A speaker said the industry has fought every reform.');
});

test('party: a wrong singular party descriptor becomes the speaker\'s name; a wrong plural one drops the point', () => {
  const a = run([{ claim: 'A Greens senator said the industry has fought every reform of poker machines.', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(a.lines[0], 'Robin Example said the industry has fought every reform of poker machines.'); assert.equal(a.tally.repairs.party_rewritten, 1);
  assert.equal(run([{ claim: 'A Labor member said the industry has fought every reform of poker machines.', id, quote: 'The industry has fought every reform.' }]).tally.repairs.party_rewritten, undefined);
  const b = run([{ claim: 'Greens senators said the industry has fought every reform of poker machines.', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(b.out, null); assert.equal(b.tally.drops.claim_party_mismatch, 1);
});

test('causal: an unattributed causal claim becomes what the cited speaker said; with no speaker it is dropped', () => {
  const a = run([{ claim: 'In 2012, industry donations influenced the poker machine reform vote.', id, quote: 'The industry has fought every reform.' }]);
  assert.equal(a.lines[0], 'In 2012, Robin Example said industry donations influenced the poker machine reform vote.'); assert.equal(a.tally.repairs.causal_attributed, 1);
  const b = run([{ claim: 'Industry donations influenced the poker machine reform vote.', id: other, quote: 'The industry has fought every reform.' }]);
  assert.equal(b.out, null); assert.equal(b.tally.drops.causal_claim, 1);
});

test('topic and figures: on-topic points survive loose wording; off-topic points and figures not in the passage are dropped', () => {
  const a = run([{ claim: 'Robin Example backed precommitment on poker machines to protect families.', id, quote: 'Mandatory precommitment will protect families' }]);
  assert.equal(a.tally.points_kept, 1);
  const b = run([{ claim: 'Robin Example spoke about wind farm planning approvals in rural districts.', id, quote: 'The industry has fought every reform.' }], 'What has been said about wind farms?');
  assert.equal(b.out, null); assert.equal(b.tally.drops.point_unsupported, 1);
  const c = run([{ claim: 'Robin Example said 40 per cent of poker machine losses come from problem gamblers.', id, quote: 'cap poker machine losses' }]);
  assert.equal(c.out, null); assert.equal(c.tally.drops.figure_unsupported, 1);
  const d = run([{ claim: 'Robin Example said losses should be capped at one dollar a spin on poker machines.', id, quote: 'cap poker machine losses at one dollar a spin' }]);
  assert.equal(d.tally.points_kept, 1);
});

test('floor: a citation to an unretrieved passage is dropped; one surviving point answers', () => {
  const { out, tally } = run([
    { claim: 'Robin Example said the industry has fought every reform.', id: 'e'.repeat(32) + '/t/body/0-10', quote: 'The industry has fought every reform.' },
    { claim: 'Robin Example said the industry has fought every reform.', id, quote: 'The industry has fought every reform.' }]);
  assert.ok(out); assert.equal(tally.points_in, 2); assert.equal(tally.points_kept, 1); assert.equal(tally.drops.unknown_passage, 1);
});

test('nothing survives but verified passages exist: two or three passages answer in their own words with speaker and date', () => {
  const out = api.recordPassagesAnswer(passages, question, scope);
  const lines = out.answer.split('\n');
  assert.equal(lines[0], 'What the record says:');
  assert.match(lines[1], /^- In 2012, Robin Example \(Australian Labor Party\) said: “[^”]+”$/);
  for (const line of lines.slice(1)) { const quoted = /“([^”]+)”/.exec(line)[1]; assert.ok(speech.includes(quoted), quoted); }
  assert.ok(out.citations[id]);
  // A named person's question answers only from that person's passages, never another speaker's.
  assert.equal(api.recordPassagesAnswer(passages, 'What has Casey Sample said about poker machines?', { ...scope, people: ['Casey Sample'] }), null);
  assert.equal(api.recordPassagesAnswer(passages, 'What has been said about wind farms?', scope), null);
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
