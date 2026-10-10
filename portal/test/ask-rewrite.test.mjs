import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import ts from 'typescript';

const b = await build({ entryPoints: [new URL('../src/ask-rewrite.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { rewriteFollowUp, readRewrite, contentFree, sameQuestion, clarifyPayload, rewritePrompt } = await import('data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64'));

// The conversation Jake had on 8 Oct 2026, as the app sent it.
const PREVIOUS = 'What has David Pocock proposed about housing affordability?';
const context = [
  { author: 'user', text: PREVIOUS },
  { author: 'answer', text: 'David Pocock’s housing-affordability proposals centre on using surplus Commonwealth land [1].' },
];
/** A stubbed model: records each call, answers with the given line. */
function model(line) {
  const calls = [];
  const generate = async (user, question) => { calls.push({ user, question }); if (line instanceof Error) throw line; return line; };
  return { calls, generate };
}
const rewrite = (question, line, ctx = context) => { const m = model(line); return rewriteFollowUp({ question, context: ctx }, m.generate).then((out) => ({ out, calls: m.calls })); };

test('"High" that comes back as the previous question is unclear, not a paid answer to it', async () => {
  const { out, calls } = await rewrite('High', PREVIOUS);
  assert.deepEqual(out, { unclear: true });
  assert.equal(calls.length, 1);
});

test('"High" the model marks UNCLEAR is unclear, with its different guess offered', async () => {
  assert.deepEqual((await rewrite('High', 'UNCLEAR')).out, { unclear: true });
  const guess = 'Has David Pocock said housing prices are too high?';
  assert.deepEqual((await rewrite('High', `UNCLEAR: ${guess}`)).out, { unclear: true, suggestion: guess });
  assert.deepEqual((await rewrite('High', `"UNCLEAR - ${guess}"`)).out, { unclear: true, suggestion: guess });
  // A "guess" that is only the last question again is no suggestion at all.
  assert.deepEqual((await rewrite('High', `UNCLEAR: ${PREVIOUS}`)).out, { unclear: true });
  assert.deepEqual((await rewrite('High', 'UNCLEAR: what has david pocock proposed about housing affordability')).out, { unclear: true });
});

test('"ok", "?" and other content-free messages are unclear without a model call', async () => {
  for (const q of ['ok', 'OK.', 'Okkk', '?', '??', '…', 'thanks!', 'Yes', 'hmm', 'lol', 'ok thanks']) {
    const { out, calls } = await rewrite(q, PREVIOUS);
    assert.deepEqual(out, { unclear: true }, q);
    assert.equal(calls.length, 0, q);
  }
  for (const q of ['High', 'and Labor?', 'why?', 'who?', 'more', '2019?', 'housing?', 'what about his votes?']) assert.equal(contentFree(q), false, q);
});

test('a rewrite essentially identical to the previous question is unclear', async () => {
  for (const line of [PREVIOUS, PREVIOUS.toUpperCase(), 'What has David Pocock proposed about housing affordability', '"Housing affordability: what has David Pocock proposed?"', 'what has david pocock proposed about housing affordability ?']) {
    assert.deepEqual((await rewrite('Blue', line)).out, { unclear: true }, line);
  }
  assert.equal(sameQuestion('What has David Pocock proposed about housing affordability?', 'Housing affordability: what has David Pocock proposed?'), true);
  assert.equal(sameQuestion('What has David Pocock proposed about housing affordability?', 'How has David Pocock voted on housing affordability?'), false);
});

test('real follow-ups keep their rewrite, shown as "Understood as"', async () => {
  const votes = 'How has David Pocock voted on housing affordability?';
  assert.equal((await rewrite('what about his votes?', votes)).out, votes);
  const labor = 'What has Labor proposed about housing affordability?';
  assert.equal((await rewrite('and Labor?', labor)).out, labor);
  const more = 'What else has David Pocock proposed about housing affordability, beyond using surplus Commonwealth land?';
  assert.equal((await rewrite('is that all?', more)).out, more);
  // The prompt the model sees is unchanged in shape: transcript, then the message slot.
  const { calls } = await rewrite('and Labor?', labor);
  assert.equal(calls[0].question, 'and Labor?');
  assert.match(calls[0].user, /^Conversation so far:\nReader: What has David Pocock proposed about housing affordability\?\nAnswer: /);
  assert.match(calls[0].user, /Latest reader message: \{question\}$/);
  assert.match(calls[0].user, /return UNCLEAR/);
});

test('asking again is a real follow-up even when it rewrites to the last question', async () => {
  assert.equal((await rewrite('try again', PREVIOUS)).out, PREVIOUS);
  assert.equal((await rewrite('look again please', PREVIOUS)).out, PREVIOUS);
});

test('a standalone message, a message with no conversation, and a failed call search the words as typed', async () => {
  assert.equal((await rewrite(PREVIOUS, PREVIOUS)).out, null);
  const typed = 'Who funds the Labor Party?';
  assert.equal((await rewrite(typed, typed)).out, null);
  const alone = await rewrite('High', PREVIOUS, []);
  assert.equal(alone.out, null); assert.equal(alone.calls.length, 0);
  const answersOnly = await rewrite('High', PREVIOUS, [{ author: 'answer', text: 'x' }]);
  assert.equal(answersOnly.out, null); assert.equal(answersOnly.calls.length, 0);
  assert.equal((await rewrite('and Labor?', new Error('timeout'))).out, null);
  assert.equal((await rewrite('and Labor?', null)).out, null);
  assert.equal((await rewrite('and Labor?', 'x'.repeat(401))).out, null);
  assert.equal(readRewrite('', 'and Labor?', PREVIOUS), null);
});

test('the clarify payload is a free answer that reads on its own in older apps', () => {
  const plain = clarifyPayload('High');
  assert.deepEqual(plain, { answer: '“High” doesn’t say enough to search the record on. Ask a full question, naming the person, party or topic you mean.', citations: {}, sources: [], answer_status: 'needs_question' });
  const guess = 'Has David Pocock said housing prices are too high?';
  const offered = clarifyPayload('High', guess);
  assert.equal(offered.suggested_question, guess);
  assert.equal(offered.answer, `“High” doesn’t say enough to search the record on. Did you mean: ${guess}`);
  assert.equal(clarifyPayload('?').answer.startsWith('That doesn’t say enough'), true);
  assert.equal('asked_as' in offered, false);
});

test('the prompt escapes braces in the transcript but keeps the question slot', () => {
  const p = rewritePrompt('Reader: what is {this}?');
  assert.match(p, /\{\{this\}\}/);
  assert.match(p, /Latest reader message: \{question\}$/);
});

// The route: an unclear rewrite answers at once, with no generation call.
const parsed = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const code = parsed.statements.filter((n) => ts.isFunctionDeclaration(n) && ['apiAsk', 'withAskedAs'].includes(n.name?.text)).map((n) => n.getText(parsed)).join('\n');
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function route(rewriteResult) {
  const seen = { generation: 0, retrieval: 0, limiter: 0 };
  const apiAsk = runInNewContext(transpile(code) + ';apiAsk', {
    URL, Request, Response, Date,
    // The donor privacy check and model budget are exercised in donor-privacy.test.mjs and model-budget.test.mjs.
    questionNamesWithheldDonor: async () => false, readerTurns: () => [], withheldDonorAnswer: () => ({}), MODEL_BUDGET_HEADER: 'x-opax-model-budget', modelBudgetBusy: () => new Response(null, { status: 503 }), 
    rankedMoneyAnswer: async () => null, paidAnswer: async () => null, clarifyPayload,
    standaloneQuestion: async () => rewriteResult,
    rateLimited: async () => { seen.limiter++; return null; },
    needsAskPeople: () => false, resolveAskScope: (input) => ({ input, scope: {} }),
    askCacheInput: () => null, cacheBypass: () => false, json: (d, status = 200) => Response.json(d, { status }),
    retrieveAskRecords: async () => { seen.retrieval++; throw new Error('stop after retrieval'); },
    kbFetch: async () => { seen.generation++; throw new Error('no generation in this test'); },
  });
  const ask = (question) => apiAsk(new Request('https://opax.test/api/ask?stream=1', { method: 'POST', body: JSON.stringify({ question, context }) }), { CACHE_EPOCH: 'v1' }, { waitUntil() {} });
  return { seen, ask };
}

test('the route returns the clarify payload with no retrieval or generation', async () => {
  const { seen, ask } = route({ unclear: true, suggestion: 'Has David Pocock said housing prices are too high?' });
  const res = await ask('High');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.answer_status, 'needs_question');
  assert.equal(body.suggested_question, 'Has David Pocock said housing prices are too high?');
  assert.equal(body.asked_as, undefined);
  assert.deepEqual(body.sources, []);
  assert.deepEqual(seen, { generation: 0, retrieval: 0, limiter: 1 });
});

test('the route still searches a real follow-up on its rewrite', async () => {
  const { seen, ask } = route('How has David Pocock voted on housing affordability?');
  // Retrieval is stubbed to fail: reaching it is the point.
  const res = await ask('what about his votes?');
  assert.equal(res.status, 503);
  assert.equal(seen.retrieval, 1);
});
