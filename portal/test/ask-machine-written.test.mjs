// The Worker says whether a language model wrote the answer text a reader sees (machine_written), at each place it
// knows: true for the writer's sentences, the loop's own words, generated answers, overviews and a suggested rewrite;
// false for record facts, passages in their own words, calculators, identity facts and fixed wording. The web labels
// from it (test/ask-label-everywhere.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const load = async file => {
  const built = await build({ entryPoints: [new URL('../src/' + file, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
};
const src = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
const { clarifyPayload } = await load('ask-rewrite.ts');
const { identityAnswer } = await load('ask-identity.ts');
const { proseFallback, verifyWrittenAnswer, draftWrittenAnswer, writingFacts, appendWrittenPoints, eitherMachineWritten } = await load('research-writing.ts');
const { passagesAnswer, verifyResearchAnswer } = await load('research-evidence.ts');
const { noRecordAnswer, recordSummaryAnswer, ensureAnswerText } = await load('research-response.ts');
const { agenticAskPayload } = await load('agentic-response.ts');
const { publicPartyMoneyAnswer } = await load('ask-money-routing.ts');

const row = { resource: 'speech-1', slug: 'speech-1', title: 'Second reading speech', href: '/doc/speech-1', url: 'https://example.test/doc/speech-1', kind: 'speech', speaker: 'Alex Example', date: '2024-03-05', cited: true,
  snippet: 'The housing bill passed the Senate on 5 March 2024 after a long debate about supply and rents across the country.' };
const facts = writingFacts({ answer: '', citations: {}, sources: [row] });
const input = { question: 'What happened to the housing bill?', period: { kind: 'all', label: '' }, facts };

test('a suggested question is the rewrite model’s own words; the prompt without one is fixed wording', () => {
  const guess = clarifyPayload('and him?', 'What has Alex Example said about housing?');
  assert.equal(guess.answer_status, 'needs_question');
  assert.equal(guess.machine_written, true);
  assert.ok(guess.answer.includes(guess.suggested_question));
  assert.equal(clarifyPayload('and him?').machine_written, false);
});

test('an identity fact is a template', async () => {
  const people = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url))).people;
  const answer = await identityAnswer({ question: 'Which party is Jacqui Lambie with?' }, { origin: 'https://example.test', kb: async () => { throw Error('no search'); }, asset: async path => path === '/parliamentarians.json' ? { people } : null });
  assert.equal(answer.answer_status, 'answered');
  assert.equal(answer.machine_written, false);
});

test('the writer’s sentences are model-written; the same facts rendered without a writer are not', () => {
  assert.ok(facts.length);
  const raw = { sentences: [{ text: 'The housing bill passed the Senate on 5 March 2024.', facts: [facts[0].id] }] };
  assert.equal(verifyWrittenAnswer(raw, input).machine_written, true);
  assert.equal(draftWrittenAnswer(raw, input).machine_written, true);
  const rendered = proseFallback(input);
  assert.ok(rendered.answer.trim());
  assert.equal(rendered.machine_written, false);
  // Hearing transcript quote lines are rendered only inside that facts-only path.
  const writing = src('research-writing.ts');
  assert.equal(writing.match(/\btranscriptLines\(input\)/g).length, 2);
  assert.match(writing, /export function proseFallback\(input: WritingInput\): QualitativeAnswer \{\n  return \{ \.\.\.factsProse\(input\), machine_written: false \}/);
});

test('the loop’s draft is model-written; passages in their own words are not', () => {
  const passages = new Map([['speech-1/t/body/0', { id: 'speech-1/t/body/0', resource: 'speech-1', slug: 'speech-1', title: row.title, text: row.snippet, url: row.url, kind: 'speech', speaker: row.speaker, date: row.date }]]);
  assert.equal(verifyResearchAnswer({ text: 'The bill passed.', citations: [] }, passages).machine_written, true);
  const held = passagesAnswer(passages, input.question);
  assert.ok(held.answer.includes('Alex Example said'));
  assert.equal(held.machine_written, false);
});

test('record-summary and no-record fallbacks are not model-written, whatever the payload said before', () => {
  const payload = { answered: true, answer: '', machine_written: true, citations: {}, sources: [row] };
  const summary = recordSummaryAnswer(payload, facts);
  assert.equal(summary.fallback, 'record_summary');
  assert.equal(summary.machine_written, false);
  const none = noRecordAnswer({ ...payload, sources: [] });
  assert.equal(none.fallback, 'no_record');
  assert.equal(none.machine_written, false);
  const ensured = ensureAnswerText({ answered: true, answer: '', citations: {}, sources: [] }, 'What happened?');
  assert.ok(String(ensured.answer).trim());
  assert.equal(ensured.machine_written, false);
});

test('joined answers: model-written if either part is, not if neither is, unsaid when unknown', () => {
  assert.deepEqual(eitherMachineWritten({ machine_written: false }, { machine_written: true }), { machine_written: true });
  assert.deepEqual(eitherMachineWritten({ machine_written: false }, { machine_written: false }), { machine_written: false });
  assert.deepEqual(eitherMachineWritten({ machine_written: false }, {}), { machine_written: undefined });
  const template = proseFallback(input), points = verifyResearchAnswer({ text: 'A further point the model made about rents.', citations: [] }, new Map());
  assert.equal(appendWrittenPoints(template, points).machine_written, true);
});

const run = over => ({ answered: true, answer: 'An answer.', answer_source: 'template', shape: 'lookup', period: { kind: 'all', label: '' }, facts: [], notes: [], steps: [], events: [],
  timings: { plan_ms: 0, tools_ms: 0, compose_ms: 0, total_ms: 0 }, tokens: { input: 0, output: 0 }, cost_usd: 0, over_budget: false, version: 'test', ...over });
const qualitative = { answer: 'An answer.', citations: {}, sources: [] };

test('a research run’s payload says what wrote it, and the answer’s own word wins', () => {
  // The party clarification, a calculator and an exact lookup all come back as template runs.
  assert.equal(agenticAskPayload(run({ qualitative, answer_status: 'uncited' }), 'q').machine_written, false);
  assert.equal(agenticAskPayload(run({}), 'q').machine_written, false);
  assert.equal(agenticAskPayload(run({ answer_source: 'model', qualitative }), 'q').machine_written, true);
  assert.equal(agenticAskPayload(run({ answer_source: 'model' }), 'q').machine_written, true);
  // A model run whose writer fell back to the facts as recorded.
  assert.equal(agenticAskPayload(run({ answer_source: 'model', qualitative: { ...qualitative, machine_written: false } }), 'q').machine_written, false);
  assert.match(src('agentic-ask.ts'), /named\.partyClarification\)\{[^\n]*return base\(\{answered:true,answer,answer_source:'template'/);
});

test('calculators and the legacy path say so too', () => {
  assert.equal(publicPartyMoneyAnswer({ answer: 'A table.', answer_status: 'calculated', money_ranking: true, citations: {}, sources: [], money_facts: {} }).machine_written, false);
  const index = src('index.ts');
  assert.match(index, /json\(overview \? \{ \.\.\.payload, money_overview: overview, machine_written: true \} : \{ \.\.\.payload, machine_written: false \}\)/);
  assert.match(index, /if \(!money_facts\) return timed\(json\(\{ \.\.\.payload, machine_written: false \}\)\)/);
  assert.match(index, /answer_status: 'evidence_only', machine_written: false,/);
  assert.match(index, /answer_status:'evidence_gap',machine_written:false\}/);
  assert.match(index, /evidence_kind:'original_position_proposal',machine_written:false,/);
  assert.match(index, /machine_written: true,\n  \}\n\}\n\ntype AskPayload/, 'the generated answer');
});
