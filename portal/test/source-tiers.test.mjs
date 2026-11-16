// The four use tiers (parli/ingest/source_policy.json), attribution of hearing evidence in Ask's own wording,
// the knowledge base generation paths, the Victorian election guard and the standing quotation commitments.
// No test here calls a model: writer tests use a scripted model, and request tests read the request that
// would have been sent.
import './helpers/vic-election-clock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';
import { importBundle } from './fixtures/import-bundle.mjs';
import { loadWorker, offline } from './worker-harness.mjs';
import { POLICY, USES, CAPABILITIES, KB_GENERATION_NEVER, allows, sourcePolicy, kbRefusal, redactCommission } from '../../parli/ingest/source_policy.mjs';
import { guardKbGeneration, isKbGeneration, openForKbGeneration } from '../src/source-policy.ts';
import { projectReports } from '../../scripts/build_report_catalog.mjs';
import { VIC_ELECTION_ASSET, VIC_ELECTION_PATH } from '../public/vic-election.js';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const json = path => JSON.parse(readFileSync(join(PUBLIC, path), 'utf8'));
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const VIC = 'vic-major-infrastructure', ROBODEBT = 'cth-robodebt';
const PUBLISHED = json('../../parli/ingest/source_policy.json');
const entry = (id, reason = 'publisher_request') => ({ ...id, reason, date: '2026-11-16' });
/** The published policy with one source moved to another tier (its flags go with the full tier). */
const withTier = (id, use) => {
  const sources = structuredClone(PUBLISHED.sources), { hosts, names } = sources[id];
  sources[id] = use === 'full' ? PUBLISHED.sources[id] : { use, hosts, names };
  return { schema: 2, sources };
};
const withPolicy = data => ({ name: 'source-policy-fixture', setup(b) { b.onLoad({ filter: /source_policy\.json$/ }, () => ({ contents: JSON.stringify(data), loader: 'json' })); } });
async function ask(data) {
  const built = await build({ stdin: { contents: ["export {callTool} from './src/tools/index'", "export {textIndex, textMatches, pageHits} from './src/tools/transcript-text'",
    "export {writingFacts, writingPrompt, proseFallback, transcriptAttribution, TRANSCRIPT_ATTRIBUTION_RULE, ANSWER_WRITING_VERSION} from './src/research-writing'",
    "export {createAnswerWriter} from './src/research-writer'", "export {withTranscriptNote, transcriptTurns, TRANSCRIPT_NOTE, TRANSCRIPT_LABEL} from './src/transcript-answer'", "export {loadWithheld} from '../parli/ingest/source_policy.mjs'"].join(';'),
    resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent', plugins: [withPolicy(data)] });
  return importBundle(built.outputFiles[0].text, 'source-tiers');
}
const { summarySources, summaryPrompt, rewriteFollowUp } = await importBundle((await build({ stdin: { contents: "export {summarySources, summaryPrompt} from './src/search-summary'; export {rewriteFollowUp} from './src/ask-rewrite'",
  resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text, 'source-tiers-kb');
const cache = new Map();
const asset = async path => { if (path.startsWith('/report-records/') && !existsSync(join(PUBLIC, path))) return null; if (!cache.has(path)) cache.set(path, json(path)); return cache.get(path); };
const env = { asset, origin: 'https://opax.test' };
const savedFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = savedFetch; });
const PERIOD = { kind: 'all', label: '' };
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const scripted = sentences => new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text: JSON.stringify({ answer_decision: 'answer', sentences }) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }) });
const writerOptions = model => ({ model, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, modelBudgetSpent: async () => false });
const stats = () => ({ rounds: 0, tokens: { input: 0, output: 0 }, turns: [] });
/** The transcript citations the royal_commissions tool returns for a word search, as record facts. */
async function transcriptFacts(api, words = 'income averaging') {
  const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words, limit: 4 }, true);
  const cites = out.citations.filter(c => /hearing turn by /.test(c.text));
  return { out, facts: api.writingFacts(undefined, cites.map((c, i) => ({ id: i + 1, text: c.text, cite: { kind: 'record', url: c.url, label: c.text } }))) };
}

// ---- 1. Four tiers, one definition

test('one table defines the four tiers and what each allows', () => {
  assert.deepEqual(USES, ['documents_only', 'search_only', 'quote_and_cite', 'full']);
  assert.deepEqual(CAPABILITIES, { documents_only: [], search_only: ['index'], quote_and_cite: ['index', 'quote'], full: ['index', 'quote', 'narrative', 'kb'] });
  assert.deepEqual(KB_GENERATION_NEVER, [VIC]);
  // Nothing else in the code names a tier to decide what it may do.
  for (const file of ['../src/source-policy.ts', '../src/tools/transcript-text.ts', '../src/research-writer.ts', '../src/research-loop.ts', '../../enrich/src/policy.ts', '../../scripts/apply_source_policy.mjs', '../../scripts/build_report_catalog.mjs'])
    assert.doesNotMatch(source(file), /['"](?:documents_only|search_only|full)['"]/, file);
  assert.equal(PUBLISHED.sources[VIC].use, 'documents_only');
  assert.deepEqual(Object.keys(PUBLISHED), ['schema', 'sources'], 'the withheld list is not in the repository');
});

for (const use of USES) test(`${use}: the indexer, quoting tools, search, MCP read, summaries and knowledge base generation each honour it`, async () => {
  const data = withTier(ROBODEBT, use), policy = sourcePolicy(data), api = await ask(data);
  const quote = allows(use, 'quote'), full = use === 'full';
  // Quoting tools and the text search behind them (the tool is what Ask and the MCP both call).
  const { out, facts } = await transcriptFacts(api);
  assert.equal(facts.length > 0, quote);
  assert.equal(out.rows.some(r => r.text_matches), quote);
  assert.equal((await api.textMatches(env, await api.textIndex(env), ROBODEBT, 'income averaging')) !== null, quote);
  if (use === 'quote_and_cite') assert.ok(out.notes.some(n => /quotes this inquiry's transcripts with the speaker and page, and does not summarise them/.test(n)));
  // The public record: quotations and text pointers only where the tier allows quotation.
  const c = redactCommission(json(`royal-commissions/commission-${ROBODEBT}.json`).commission, policy);
  assert.equal(c.recommendations.length > 0, quote);
  assert.equal(c.transcripts.some(t => t.full_text || t.date_quote), quote);
  // The indexer and every knowledge base read (search, Ask retrieval, MCP read_record): the full tier only.
  const resource = { slug: 'speech-1', usermetadata: { classifications: [{ labelset: 'source', label: ROBODEBT }] } };
  assert.equal(kbRefusal(resource, policy) === null, full);
  // Published transcript text files (CC BY sources) and model-written narrative: the full tier only.
  assert.equal(policy.can('narrative', { documents: [`${ROBODEBT}/x`] }), full);
  assert.equal(policy.passageOnly({ title: 'Royal Commission into the Robodebt Scheme, Transcript' }), use === 'quote_and_cite');
  // Machine summaries and knowledge base generation: only at the full tier, and only where the record allows.
  assert.equal(policy.summaries({ sources: [ROBODEBT] }), full);
  assert.equal(policy.kbGeneration(ROBODEBT), full);
  assert.equal(policy.kbGenerationExcluded({ url: 'https://robodebt.royalcommission.gov.au/x.pdf' }), !full);
});

test('summaries are off for a listed source unless its record says summaries: allowed', async () => {
  const off = structuredClone(PUBLISHED); delete off.sources[ROBODEBT].summaries;
  assert.equal(sourcePolicy(off).summaries({ sources: [ROBODEBT] }), false);
  assert.equal(POLICY.summaries({ sources: [ROBODEBT] }), true);
  assert.equal(POLICY.summaries({ sources: [VIC] }), false);
  assert.equal(POLICY.summaries({ sources: ['openaustralia'] }), true, 'a source with no record keeps its own pipeline rules');
  // No royal commission transcript source other than the three CC BY ones allows them.
  assert.deepEqual(Object.entries(PUBLISHED.sources).filter(([, r]) => r.summaries).map(([id]) => id), ['cth-antisemitism', ROBODEBT, 'nsw-healthcare-funding']);
  const read = async path => json(path.slice(1)), slug = `royal-commission-${ROBODEBT}`;
  const summary = async policy => (await projectReports(read, policy)).find(r => r.row.slug === slug).detail.summary;
  assert.ok(await summary(POLICY), 'the control: the published policy keeps the report summary');
  assert.equal(await summary(sourcePolicy(off)), undefined);
});

test('quote_and_cite: the answer is the passages, each attributed, plus the fixed line; the model is given none of it', async () => {
  const api = await ask(withTier(ROBODEBT, 'quote_and_cite'));
  const { facts } = await transcriptFacts(api);
  assert.ok(facts.length >= 2 && facts.every(f => f.transcript));
  const question = 'What did witnesses tell the Robodebt Royal Commission about income averaging?';
  const model = scripted([{ text: 'A paraphrase the model must never be asked for.', facts: [1] }]);
  const out = await api.createAnswerWriter(writerOptions(model))({ question, period: PERIOD, facts }, stats(), undefined, 20000);
  assert.equal(model.doGenerateCalls.length, 0, 'no model call');
  const lines = out.answer.split('\n').filter(Boolean);
  assert.equal(lines.at(-1), api.TRANSCRIPT_NOTE);
  for (const line of lines.slice(0, -1)) {
    assert.match(line, /^.+ (?:said|asked)(?: on hearing day \d+)?(?: \(\d{1,2} \w+ \d{4}\))?, transcript page \S+: “[^”]+”$/, line);
    const quote = /“([^”]+)”/.exec(line)[1], fact = facts.find(f => f.transcript.excerpt.includes(quote));
    assert.ok(fact, 'the quotation is verbatim from a passage: ' + quote);
    assert.ok(line.startsWith(fact.transcript.speaker) && line.includes(`transcript page ${fact.transcript.page}`));
  }
  assert.doesNotMatch(out.answer, /paraphrase/);
  // Beside facts from an open source the model writes only from those; the passages follow, as they stand.
  const other = { id: 99, text: 'The Senate passed the motion on 3 March 2023.', source: { resource: 'fact-99', slug: '', title: 'A division', href: '/doc/division-1', url: 'https://opax.test/doc/division-1', snippet: 'The Senate passed the motion on 3 March 2023.', cited: true, kind: 'record' } };
  const mixedModel = scripted([{ text: 'The Senate passed the motion on 3 March 2023.', facts: [99] }]);
  const mixed = await api.createAnswerWriter(writerOptions(mixedModel))({ question, period: PERIOD, facts: [...facts, other] }, stats(), undefined, 20000);
  assert.equal(mixedModel.doGenerateCalls.length, 1);
  const sent = JSON.stringify(mixedModel.doGenerateCalls[0].prompt);
  for (const f of facts) assert.ok(!sent.includes(f.transcript.excerpt.slice(0, 40)) && !sent.includes(f.transcript.speaker), 'the passage is not in the prompt');
  assert.ok(mixed.answer.includes('The Senate passed the motion') && mixed.answer.includes(api.TRANSCRIPT_NOTE) && /transcript page \S+: “/.test(mixed.answer));
});

// ---- 2. Attribution in Ask's own wording, for every commission

test('the writer prompt for a transcript-sourced answer carries the attribution rule, and the speaker and page of every passage', async () => {
  const api = await ask(PUBLISHED);
  assert.equal(api.ANSWER_WRITING_VERSION, 'written-answer-32-transcript-attribution');
  // Facts shaped as the transcript tools return them: a counsel's question, a witness, and a labelled role.
  const text = 'Royal Commission into the Robodebt Scheme, Transcript Hearing Day 46 (10 March 2023), transcript page P-4899 (PDF page 15), hearing turn by Ms Preston: "Income averaging did not make sense to me." transcript page P-4933 (PDF page 49), hearing turn by Mr Scott: "Do you agree that this approach described income averaging?" transcript page P-4950 (PDF page 66), hearing turn by The Commissioner: "That will be the evidence for today." Hearing transcript: evidence, not findings.';
  const fixture = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://robodebt.royalcommission.gov.au/transcript.pdf#page=15', label: text } }]);
  const { facts: real } = await transcriptFacts(api);
  for (const facts of [fixture, real]) {
    const prompt = JSON.parse(api.writingPrompt({ question: 'What did witnesses tell the Robodebt Royal Commission about income averaging?', period: PERIOD, facts }));
    assert.ok(prompt.contract.includes(api.TRANSCRIPT_ATTRIBUTION_RULE));
    assert.equal(prompt.facts.length, facts.length);
    for (const [i, fact] of prompt.facts.entries()) {
      // The claim plan: every claim from a transcript is typed as attributed evidence, with who and where.
      const turn = facts[i].transcript, a = fact.attribution;
      assert.deepEqual([a.source, a.status, a.attributed, a.speaker, a.transcript_page], ['hearing_transcript', 'evidence_not_finding', true, turn.speaker, turn.page]);
      assert.ok(a.speaker.length > 2 && /\S/.test(a.transcript_page));
      assert.ok(fact.text.includes(`transcript page ${a.transcript_page}`) && fact.text.startsWith(a.speaker));
    }
  }
  const planned = JSON.parse(api.writingPrompt({ question: 'q', period: PERIOD, facts: fixture })).facts.map(f => f.attribution);
  assert.deepEqual(planned.map(a => [a.speaker, a.role ?? null, a.transcript_page, a.hearing_day, a.date]), [
    ['Ms Preston', null, 'P-4899', '46', '10 March 2023'], ['Mr Scott', null, 'P-4933', '46', '10 March 2023'], ['The Commissioner', 'commissioner', 'P-4950', '46', '10 March 2023']]);
  // The rule itself: who and where for every sentence, and evidence never restated as fact or as a finding.
  for (const phrase of ['says who said it and where', 'the transcript page', 'a witness told the Commission', 'counsel assisting put to the witness',
    'Never state what was said at a hearing as established fact', 'never describe evidence, an allegation, a question or a submission as something the inquiry found'])
    assert.ok(api.TRANSCRIPT_ATTRIBUTION_RULE.includes(phrase), phrase);
  // A prompt with no transcript fact is unchanged.
  const plain = api.writingFacts(undefined, [{ id: 1, text: 'The Senate passed the motion on 3 March 2023.', cite: { kind: 'record', url: 'https://opax.test/doc/division-1', label: 'x' } }]);
  const other = JSON.parse(api.writingPrompt({ question: 'q', period: PERIOD, facts: plain }));
  assert.ok(!other.contract.includes(api.TRANSCRIPT_ATTRIBUTION_RULE) && other.facts.every(f => !f.attribution));
});

test('with no model at all, every transcript line names its speaker and page, and the fixed line still closes the answer', async () => {
  const api = await ask(PUBLISHED);
  const { facts } = await transcriptFacts(api);
  const out = api.proseFallback({ question: 'What did witnesses tell the Robodebt Royal Commission about income averaging?', period: PERIOD, facts });
  const lines = out.answer.split('\n').filter(Boolean);
  assert.equal(lines.at(-1), 'These are from hearing transcripts: evidence, not findings.');
  assert.ok(lines.length >= 2);
  for (const line of lines.slice(0, -1)) assert.match(line, /^.+ (?:said|asked)(?: on hearing day \d+)?(?: \(\d{1,2} \w+ \d{4}\))?, transcript page \S+: “[^”]+”$/, line);
  // A written answer whose cited sources are all transcripts gets the same line appended.
  const snippet = `Royal Commission into the Robodebt Scheme, Transcript. ${api.TRANSCRIPT_LABEL}.`;
  const noted = api.withTranscriptNote({ answered: true, answer: 'Ms Preston told the Commission, at transcript page P-4899, that averaging made no sense to her.', sources: [{ cited: true, snippet, title: 'x' }] });
  assert.ok(noted.answer.endsWith('\n\nThese are from hearing transcripts: evidence, not findings.'));
});

// ---- Knowledge base generation paths: excluded at retrieval and where the request is assembled

const MARKERS = [VIC, 'rcimcp.vic.gov.au', 'Integrity of Major Public and Civil Infrastructure Construction Projects', 'SENTINEL-COMMISSION-TEXT'];
/** A request body with the retrieval filter set aside: the filter names the source in order to exclude it. */
const carried = body => JSON.stringify({ ...body, filter_expression: undefined });
const clean = (body, label) => { for (const marker of MARKERS) assert.ok(!carried(body).includes(marker), `${label}: ${marker}`); };
const excludedRecord = { kind: 'report', title: 'Royal Commission into the Integrity of Major Public and Civil Infrastructure Construction Projects in Victoria', href: `/report/royal-commission-${VIC}`,
  url: 'https://www.rcimcp.vic.gov.au/hearing-block-1-9-20-november-2026', snippet: 'SENTINEL-COMMISSION-TEXT', text: 'SENTINEL-COMMISSION-TEXT' };
const openRecord = { kind: 'speech', title: 'A speech on housing', href: '/doc/speech-1', url: 'https://opax.com.au/doc/speech-1', snippet: 'Housing supply was debated at length in the chamber on that day.', text: 'Housing supply was debated at length in the chamber on that day. '.repeat(6) };
const NOT_VIC = { not: { prop: 'label', labelset: 'source', label: VIC } };

test('the commission is closed to knowledge base generation in every tier, and a source needs the full tier and kb_generation: allowed', () => {
  assert.equal(POLICY.kbGeneration(VIC), false);
  assert.deepEqual(POLICY.kbGenerationClosed, [VIC]);
  for (const use of USES) {
    const sources = { ...PUBLISHED.sources, [VIC]: { ...PUBLISHED.sources[VIC], use } };
    assert.equal(sourcePolicy({ schema: 2, sources }).kbGeneration(VIC), false, use);
    assert.throws(() => sourcePolicy({ schema: 2, sources: { ...sources, [VIC]: { ...sources[VIC], kb_generation: 'allowed' } } }), /source policy/, use);
  }
  const unflagged = structuredClone(PUBLISHED); delete unflagged.sources[ROBODEBT].kb_generation;
  assert.equal(sourcePolicy(unflagged).kbGeneration(ROBODEBT), false);
  assert.deepEqual(sourcePolicy(unflagged).kbGenerationClosed.sort(), [ROBODEBT, VIC]);
  for (const use of ['documents_only', 'search_only', 'quote_and_cite']) assert.equal(sourcePolicy(withTier(ROBODEBT, use)).kbGeneration(ROBODEBT), false, use);
  for (const value of [excludedRecord, 'see https://www.rcimcp.vic.gov.au/x', `/royal-commissions/commission-${VIC}.json`, { nested: [{ title: excludedRecord.title }] }]) assert.equal(POLICY.kbGenerationExcluded(value), true);
  assert.equal(POLICY.kbGenerationExcluded(openRecord), false);
  assert.deepEqual(openForKbGeneration([openRecord, excludedRecord]), [openRecord]);
});

test('every generation request: the knowledge base retrieval is filtered and supplied context is checked as it leaves', () => {
  const body = { query: 'a question', top_k: 20, filter_expression: { field: { prop: 'label', labelset: 'kind', label: 'speech' } },
    extra_context: ['A record about housing.', `${excludedRecord.title}: SENTINEL-COMMISSION-TEXT`],
    chat_history: [{ author: 'USER', text: 'What did the infrastructure royal commission hear?' }, { author: 'NUCLIA', text: `It heard SENTINEL-COMMISSION-TEXT (${excludedRecord.url}).` }, { author: 'NUCLIA', text: 'An answer about housing.' }] };
  const out = guardKbGeneration('/ask', body);
  assert.deepEqual(out.filter_expression, { field: { and: [body.filter_expression.field, NOT_VIC] } });
  assert.deepEqual(out.extra_context, ['A record about housing.']);
  assert.deepEqual(out.chat_history, [body.chat_history[0], body.chat_history[2]], 'the reader\'s own turn stays; the answer drawn from the source goes');
  clean(out, '/ask');
  assert.deepEqual(guardKbGeneration('/ask', { query: 'q', prompt: 'p' }).filter_expression, { field: NOT_VIC });
  // The SA path generates from context it supplies: /predict/chat.
  const chat = guardKbGeneration('/predict/chat', { question: 'q', query_context: { 'r1/t/body/0-9': 'Housing text.', 'r2/t/body/0-9': `SENTINEL-COMMISSION-TEXT ${excludedRecord.url}` } });
  assert.deepEqual(chat.query_context, { 'r1/t/body/0-9': 'Housing text.' });
  // Retrieval without generation, searches and reads are not generation requests and are left alone here.
  // /ask without generation still retrieves for a later /predict/chat, so it is filtered too; searches and reads are untouched here.
  const find = { query: 'q', generate_answer: false };
  assert.deepEqual(guardKbGeneration('/ask', find), { ...find, filter_expression: { field: NOT_VIC } });
  assert.equal(guardKbGeneration('/find', find), find);
  assert.deepEqual([isKbGeneration('/ask', {}), isKbGeneration('/ask', find), isKbGeneration('/find', {}), isKbGeneration('/predict/chat', {})], [true, false, false, true]);
  // kbFetch applies it to every request it sends.
  assert.match(source('../src/index.ts'), /const \{ target, body \} = guardKbRequest\(path, guardKbGeneration\(path, sent\)\)/);
});

let worker;
/** The real Worker, with the knowledge base stubbed: every request that would have been sent is kept. */
async function requests(run) {
  worker ??= await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, PUBLIC);
  const sent = [], savedCaches = globalThis.caches, restore = offline();
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input.url ?? input)), path = url.pathname.replace(/^.*\/kb\/[^/]+/, '');
    sent.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
    return Response.json(path === '/ask' ? { answer: '', citations: {}, retrieval_results: { resources: {} } } : { resources: {}, fulltext: { total: 0, facets: {} } });
  };
  try { const response = await run(worker); return { response, sent, asks: sent.filter(r => r.path === '/ask' && r.body?.generate_answer !== false) }; }
  finally { restore(); globalThis.caches = savedCaches; globalThis.fetch = savedFetch; }
}

test('search summaries: a matching record of the commission is found by search and is not in the summary request', async () => {
  const q = 'infrastructure construction projects royal commission victoria';
  const { response, asks } = await requests(async w => {
    const found = await (await w.fetch('/api/search-all?' + new URLSearchParams({ q, per: '20' }))).json();
    assert.ok(found.results.some(r => r.href === `/report/royal-commission-${VIC}`), 'the control: search itself lists the commission');
    return w.fetch('/api/search-summary?' + new URLSearchParams({ q }));
  });
  assert.equal(response.status, 200);
  // The commission is the only match, so there is nothing to summarise and no request is built.
  assert.deepEqual([asks.length, (await response.json()).status], [0, 'empty']);
  // Beside other records, the request is built from those alone. The same builder feeds the repair, the streamed
  // summary and both position prompts.
  assert.deepEqual(summarySources([excludedRecord, openRecord]).map(s => s.title), [openRecord.title]);
  clean({ prompt: summaryPrompt('q', {}, summarySources([excludedRecord, openRecord])) }, 'summary prompt');
  const index = source('../src/index.ts');
  assert.equal((index.match(/summaryPrompt\(/g) ?? []).length, 2);
  assert.equal((index.match(/= summarySources\(/g) ?? []).length, 3, 'search summary, position recovery and the reasoned position all take their sources from summarySources');
});

test('suggested follow-ups: a passage of the commission is not in the request, and an answer drawn from it asks for none', async () => {
  const passages = [{ ...excludedRecord, cited: true }, { ...openRecord, cited: true }, { title: 'Another speech', text: 'Rents rose across the capital cities over the year, the member told the chamber. '.repeat(5), kind: 'speech', cited: true }];
  const post = body => w => w.fetch('/api/followups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const open = await requests(post({ question: 'What was said about housing supply?', answer: 'Members debated housing supply and rents at length.', passages }));
  assert.equal(open.asks.length, 1);
  clean(open.asks[0].body, 'follow-ups');
  assert.ok(open.asks[0].body.query.includes('Housing supply was debated'), 'the open passages are still used');
  const closed = await requests(post({ question: 'What has the commission heard?', answer: `OPAX lists two hearing transcripts from the ${excludedRecord.title}.`, passages }));
  assert.equal(closed.sent.length, 0, 'nothing is sent at all');
  assert.deepEqual(await closed.response.json(), { questions: [] });
});

test('follow-up rewriting: an earlier answer drawn from the commission, and its record hints, are not in the request', async () => {
  let sent;
  await rewriteFollowUp({ question: 'and the second one?', context: [
    { author: 'user', text: 'What has the infrastructure royal commission published?' },
    { author: 'answer', text: 'OPAX lists two hearing transcripts. SENTINEL-COMMISSION-TEXT', sources: [{ resource: 'fact-1', url: excludedRecord.url, title: excludedRecord.title, cited: true }] },
    { author: 'user', text: 'What did the Senate do about housing?' },
    { author: 'answer', text: 'The Senate passed a housing motion.', sources: [{ resource: 'fact-2', url: 'https://opax.com.au/doc/division-1', title: 'A division', cited: true }] },
  ] }, async (user, question) => { sent = { user, question }; return null; });
  clean(sent, 'rewrite');
  assert.ok(sent.user.includes('Reader: What has the infrastructure royal commission published?') && sent.user.includes('The Senate passed a housing motion.'));
  assert.match(source('../src/index.ts'), /return rewriteFollowUp\(input, async \(user, question\) => \{\s+const work = async \(signal: AbortSignal\) => summaryModelAnswer\(await kbFetch\(env, '\/ask'/);
});

test('the older Ask engine: earlier answers and catalogue context from the commission are not in the request, and its retrieval is filtered', async () => {
  const context = [{ author: 'user', text: 'What has the infrastructure royal commission published?' },
    { author: 'answer', text: `OPAX lists two hearing transcripts from the ${excludedRecord.title}. SENTINEL-COMMISSION-TEXT` },
    { author: 'user', text: 'What did members say about housing supply?' }, { author: 'answer', text: 'Members debated housing supply.' }];
  const { asks } = await requests(w => w.fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What is the royal commission on infrastructure construction projects in Victoria?', context }) }));
  assert.ok(asks.length >= 1, 'the engine built a generation request');
  for (const { body } of asks) {
    clean(body, 'older Ask engine');
    assert.ok(JSON.stringify(body.filter_expression).includes(JSON.stringify(NOT_VIC)));
    if (body.chat_history) assert.ok(body.chat_history.some(t => t.text === 'Members debated housing supply.') && body.chat_history.some(t => t.author === 'USER' && /infrastructure royal commission/.test(t.text)));
  }
  assert.ok(asks.some(a => a.body.chat_history), 'the conversation travels with the request');
  // Position recovery and the reasoned position build on the same body and the same sources.
  const index = source('../src/index.ts');
  assert.match(index, /extra_context: recordContext\(openForKbGeneration\(records\.records\)\)/);
  assert.match(index, /const body = buildAskBody\(input, undefined, \{ reasoned: true \}\)/);
});

test('the planner, journey stories and the money overview: nothing of a closed source is put in their requests', () => {
  const index = source('../src/index.ts'), agentic = source('../src/agentic-ask.ts');
  // The older planner sends the reader's question and the tool registry; its answer is a template, not generated.
  assert.equal((agentic.match(/deps\.generate\(/g) ?? []).length, 2);
  assert.match(agentic, /deps\.generate\(question, plannerPrompt\(\), 700, signal\)/);
  assert.match(agentic, /return deps\.generate\(query, prompt, maxTokens, signal\)/);
  // A journey or a money overview that names a closed source is not generated.
  assert.match(index, /if \(!context \|\| SOURCE_POLICY\.kbGenerationExcluded\(context\)\) return json\(\{error:'Journey not available'\},404\)\n[\s\S]{0,900}?const generate = async \(query: string\) => \{\s+const response = await kbFetch\(env,'\/ask'/);
  assert.match(index, /if \(SOURCE_POLICY\.kbGenerationExcluded\(facts\)\) return \{ overview: '', why: 'source-policy' \}\n[\s\S]{0,900}?body: \{ query: moneyOverviewPrompt\(facts\)/);
  // Every generation call in the Worker is one of the call sites this file covers (PR #458's inventory).
  const calls = [...index.matchAll(/kbFetch\(\s*env,\s*'\/ask'/g)].length;
  assert.equal(calls, 12, 'a new knowledge base generation call needs its own exclusion test');
});

// ---- 3. Election guard, until 6pm on 28 November 2026 in Melbourne

const REFERENCE = new RegExp([VIC, ...PUBLISHED.sources[VIC].hosts, ...PUBLISHED.sources[VIC].names, 'rcimcp', 'Major Public and Civil Infrastructure'].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
test('the Victorian election hub, seat and region pages, candidate data and share cards carry no reference to the commission', async () => {
  // Election sources, configuration and data, as committed and as built.
  const files = ['../src/vic-election.ts', '../src/vic-election-data.ts', '../src/app-vic-election.ts', '../src/vic-term-role.ts', '../public/vic-election.js', '../public/vic-term.js',
    '../../scripts/build_vic_election.mjs', '../../scripts/hubs/vic-election-2026.json', '../../scripts/hubs/vic-candidates-2026.json', '../../scripts/hubs/vic-places-2025.json', '../../scripts/hubs/vic-results-2022.json',
    '../../docs/VIC-ELECTION-2026.md', '../src/daily-post.ts', '../src/social-publication.ts'];
  for (const file of files) assert.doesNotMatch(source(file), REFERENCE, file);
  for (const name of readdirSync(join(PUBLIC, 'hubs')).filter(n => /^vic-/.test(n))) assert.doesNotMatch(readFileSync(join(PUBLIC, 'hubs', name), 'utf8'), REFERENCE, name);
  assert.ok(existsSync(join(PUBLIC, VIC_ELECTION_ASSET)), 'the election data is built');
  // The pages a reader and a crawler are served, and the share card each one links.
  const hub = json(VIC_ELECTION_ASSET.slice(1));
  const paths = hub.pages.map(p => p.path);
  assert.ok(paths.includes(VIC_ELECTION_PATH) && paths.length >= 97 && hub.seats.every(s => paths.includes(s.path)), 'the hub and every district and region: ' + paths.length);
  assert.doesNotMatch(JSON.stringify(hub.seats.map(s => s.candidates)), REFERENCE, 'candidate content');
  const { sent } = await requests(async w => {
    w.env.VIC_ELECTION_HUB_ENABLED = 'true';
    try {
      for (const path of paths) {
        const response = await w.fetch(path);
        assert.equal(response.status, 200, path);
        const html = await response.text();
        assert.doesNotMatch(html, REFERENCE, path);
        const card = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
        if (card && [paths[0], paths[1], paths.at(-1)].includes(path)) {
          const image = await w.fetch(new URL(card.replace(/&amp;/g, '&')).pathname + new URL(card.replace(/&amp;/g, '&')).search);
          assert.equal(image.status, 200, card);
          assert.doesNotMatch(await image.text(), REFERENCE, 'share card for ' + path);
        }
      }
    } finally { delete w.env.VIC_ELECTION_HUB_ENABLED; }
  });
  assert.deepEqual(sent, [], 'the election pages ask the knowledge base for nothing');
});

// ---- 4. Standing commitments

test('a quotation is verbatim, at most 280 characters and inside one speaker\'s turn', async () => {
  const api = await ask(PUBLISHED), label = /(?:^|\s)(?:(?:THE|MR|MS|MRS|MISS|DR|PROF|UNCLE|AUNTY) )?[A-Z][A-Za-z'’.-]*[A-Z](?: [A-Z][A-Za-z'’.-]*[A-Z]){0,3}:\s/;
  let checked = 0;
  for (const [commission, words] of [['robodebt', 'income averaging'], ['robodebt', 'debt notices'], ['robodebt', 'legal advice'], ['robodebt', 'minister briefing'], ['cth-antisemitism', 'university campus'], ['cth-antisemitism', 'social media'], ['nsw-healthcare-funding', 'emergency department'], ['nsw-healthcare-funding', 'nursing workforce']]) {
    const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission, words, limit: 8 });
    for (const row of out.rows) for (const hit of row.text_matches?.hits ?? []) {
      if (row.text_matches.quote_policy !== 'quote') { assert.equal(hit.excerpt, null); continue; }
      const body = hit.excerpt.replace(/^\.\.\.|\.\.\.$/g, '');
      assert.ok(body.length <= 280, `${body.length} characters`);
      const page = json(row.text_matches.file.slice(1)).pages.find(p => p.n === hit.pdf_page);
      assert.ok(page.text.replace(/\s+/g, ' ').includes(body), 'verbatim on its page');
      assert.doesNotMatch(body, label, 'no second speaker inside the quotation: ' + body);
      checked++;
    }
  }
  assert.ok(checked >= 20, String(checked));
});

test('a transcript that records an order is never quoted: no text is held for it and the tool gives the page only', async () => {
  const ix = json('transcripts/index.json'), held = ix.docs.filter(d => d.quote_policy === 'no_quotes');
  assert.ok(held.length >= 60);
  for (const d of held.filter((_, i) => i % 6 === 0)) { const doc = json(d.file.slice(1)); assert.ok(doc.order_pages.length && doc.pages.every(p => p.text === undefined), d.key); }
  const api = await ask(PUBLISHED), sample = held.find(d => d.commission === ROBODEBT), doc = json(sample.file.slice(1));
  const word = Object.keys(doc.terms).find(t => /^[a-z]{8,}$/.test(t) && !ix.common_terms.includes(t));
  const hits = await api.pageHits(env, await api.textIndex(env), sample.key, [word]);
  assert.equal(hits.quote_policy, 'no_quotes');
  assert.ok(hits.hits.length && hits.hits.every(h => h.excerpt === null && !h.speaker) && hits.order_notice);
  assert.deepEqual(api.transcriptTurns(`Royal Commission, Transcript (1 March 2023), the words appear on transcript page P-1 (PDF page 2). Not quoted: the publisher's transcript records a non-publication order. ${api.TRANSCRIPT_LABEL}.`), []);
});

test('a legal_order entry withholds the whole transcript: no text, excerpt, page pointer or file link, only the neutral notice and the publisher page', async () => {
  const ix = json('transcripts/index.json'), row = ix.docs.find(d => d.commission === ROBODEBT && d.quote_policy === 'quote'), doc = json(row.file.slice(1));
  const word = Object.keys(doc.terms).find(t => /^[a-z]{8,}$/.test(t) && !ix.common_terms.includes(t));
  // The entry arrives the way the Worker receives it, from the private store; a reader is told only that it is not available.
  const api = await ask(PUBLISHED);
  api.loadWithheld(JSON.stringify({ schema: 1, withheld: [entry({ document: `${ROBODEBT}/${row.key}` }, 'legal_order')] }));
  const index = await api.textIndex(env);
  assert.equal(await api.pageHits(env, index, row.key, [word]), null);
  assert.ok(!(await api.textMatches(env, index, ROBODEBT, word))?.keys.has(row.key));
  const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: row.date, limit: 8 });
  const listed = out.rows.find(r => r.key === row.key);
  assert.deepEqual(Object.keys(listed).sort(), ['commission', 'commission_id', 'date', 'key', 'label', 'page_url', 'title', 'unavailable']);
  assert.equal(listed.unavailable, "Not available on OPAX. Open the publisher's copy.");
  assert.doesNotMatch(JSON.stringify(listed), /legal|order|withheld/i);
  assert.ok(!JSON.stringify(out).includes(row.pdf_url));
});
