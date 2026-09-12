import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const transpile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const helpers = {};
runInNewContext(transpile(readFileSync(new URL('../src/ask-evidence.ts', import.meta.url), 'utf8')), { exports: helpers });
const parsed = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = new Set(['apiAsk', 'apiAskStream', 'askPayload', 'hasUnsupportedQuotes', 'evidenceOnlyAnswer', 'isRefusal']);
const code = parsed.statements.filter(n => ts.isFunctionDeclaration(n) ? names.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.has(d.name.getText(parsed)))).map(n => n.getText(parsed)).join('\n');
const id = 'original/t/body/0-200';
const passage = 'Negative gearing lets property investors offset rental losses against other income.';
function draft(answer, cited = true) {
  return { answer, citations: cited ? { [id]: [[0, Array.from(answer).length]] } : {}, retrieval_results: { resources: {
    original: { title: 'Housing debate', slug: 'speech-1', fields: { body: { paragraphs: { [id]: { text: passage, score: 0.9, score_type: 'RERANKER' } } } } },
  } } };
}
const bad = () => draft('It says "Negative gearing only benefits the richest people in Australia".');
const good = () => draft('The passage describes offsetting rental losses against other income.');

function harness(responses) {
  const calls = [], pending = [], stored = [];
  const next = body => {
    calls.push(body);
    const value = responses.shift();
    if (value instanceof Error) throw value;
    assert.ok(value, 'recovery must be bounded to one attempt');
    return value;
  };
  const ctx = { waitUntil(p) { pending.push(p); } };
  const api = runInNewContext(transpile(code) + ';({apiAsk,apiAskStream})', {
    ...helpers, Response, Request, URL, Date, AbortController, AbortSignal, TransformStream, TextEncoder,
    REFUSAL_PREFIXES: ['not enough data'], ASK_SYNC_TIMEOUT_MS: 1000, ASK_STALL_MS: 1000, ASK_RETRY_BUDGET_MS: 1000,
    SSE_HEADERS: { 'content-type': 'text/event-stream' },
    rankedMoneyAnswer: async () => null, needsAskPeople: () => false, resolveAskScope: input => ({ input, scope: {} }),
    askCacheInput: () => null, cacheBypass: () => false, rateLimited: async () => null,
    retrieveAskRecords: async () => ({ records: [], coverage: '', total: 0 }),
    buildAskBody: input => ({ query: input.question, citations: 'llm_footnotes', prompt: { user: 'Answer {question} from {context}. ' + helpers.FOOTNOTE_INSTRUCTIONS } }),
    json: (data, status = 200) => new Response(JSON.stringify(data), { status }), withCacheStatus: r => r,
    healthyRetrieval: () => false, lighterAsk: b => b, recordSources: () => [], label: () => null, calibrate: score => score,
    kbFetch: async (_env, _path, init) => new Response(JSON.stringify(next(init.body))),
    streamAskGuarded: async (_env, body) => next(body),
  });
  return { calls, stored, async run(stream) {
    const body = JSON.stringify({ question: 'How have MPs described negative gearing over the years?', kind: 'all' });
    const request = new Request('https://example.test/api/ask' + (stream ? '?stream=1' : ''), { method: 'POST', body });
    const response = await api.apiAsk(request, {}, ctx);
    const text = await response.text();
    await Promise.all(pending);
    if (!stream) return JSON.parse(text);
    const done = text.split('\n\n').find(s => s.startsWith('event: done\n'));
    assert.ok(done, text);
    return JSON.parse(done.split('\ndata: ')[1]);
  } };
}
for (const stream of [false, true]) {
  const path = stream ? 'streamed' : 'synchronous';
  test(`${path}: an altered quotation gets one fresh paraphrase with citations`, async () => {
    const h = harness([bad(), good()]);
    const result = await h.run(stream);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].citations, 'llm_footnotes');
    assert.match(h.calls[1].prompt.user, /Do not use direct quotations/);
    assert.equal(result.answer, good().answer);
    assert.equal(result.answer_status, undefined);
    assert.ok(result.citations[id]);
  });
  test(`${path}: repeated failure or failed recovery returns original excerpts`, async () => {
    for (const second of [bad(), new Error('provider unavailable')]) {
      const h = harness([bad(), second]);
      const result = await h.run(stream);
      assert.equal(h.calls.length, 2);
      assert.equal(result.answer_status, 'evidence_only');
      assert.equal(result.evidence_excerpts[0].text, passage);
      assert.ok(result.citations[id]);
      assert.doesNotMatch(result.answer, /richest people/);
    }
  });
  test(`${path}: missing citations cannot pass as a verified answer after recovery`, async () => {
    const h = harness([draft('A summary without citations.', false), draft('Another uncited summary.', false)]);
    const result = await h.run(stream);
    assert.equal(h.calls[1].citations, 'default');
    assert.equal(result.answer_status, 'evidence_only');
    assert.equal(result.evidence_excerpts[0].text, passage);
  });
  test(`${path}: a grounded answer does not make a second model call`, async () => {
    const h = harness([good()]);
    const result = await h.run(stream);
    assert.equal(h.calls.length, 1);
    assert.equal(result.answer_status, undefined);
  });
}

for (const stream of [false,true]) test(`${stream?'streamed':'synchronous'}: an explicit evidence gap does not force an invented cited answer`,async()=>{
 const h=harness([draft(helpers.EVIDENCE_GAP_ANSWER,false)]);
 const result=await h.run(stream);
 assert.equal(h.calls.length,1);assert.equal(result.answer,helpers.EVIDENCE_GAP_ANSWER);
 assert.equal(Object.keys(result.citations).length,0);assert.equal(result.answer_status,undefined);
});

test('a refusal wrapped in the model\'s own preamble still counts as a refusal', () => {
  const { isRefusal } = runInNewContext(transpile(code) + ';({isRefusal})', { ...helpers, REFUSAL_PREFIXES: ['not enough data', 'the record retrieved for this question does not discuss'] });
  assert.equal(isRefusal({ answer: 'I can’t answer that question from the retrieved record. The passages cover contract awards. The record retrieved for this question does not discuss it.' }), true);
  assert.equal(isRefusal({ answer: 'The record retrieved for this question does not discuss it.' }), true);
  assert.equal(isRefusal({ answer: 'Negative gearing was defended by the Treasurer in 2016 [^1].' }), false);
});
