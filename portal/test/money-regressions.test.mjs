import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

const catalogueFixture = { name: 'money-catalogue-fixture', setup(builder) {
  builder.onLoad({ filter: /\/catalog-search\.ts$/ }, () => ({ loader: 'js', contents: `
    export const CATALOG_KINDS = new Set(['grant', 'register']);
    export async function searchCatalog(url, assets) {
      const rows = assets.catalogueRows ?? [];
      const results = rows.filter(r => (!url.searchParams.get('state') || r.state === url.searchParams.get('state')));
      return { results: structuredClone(results), total: results.length };
    }` }));
} };
const built = await build({ stdin: { contents: "export {callTool,getTool,askToolSpecs} from './src/tools';export {inferPeriod,factSheet} from './src/agentic-ask';export {extractAskConstraints,constrainStep} from './src/ask-constraints';export {writingFacts,proseFallback,renderFacts} from './src/research-writing';export {createAnswerWriter} from './src/research-writer';export {mergeRegisterItems} from './src/tools/interests';export {groundAnswerPayload} from './src/research-grounding';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'], plugins: [catalogueFixture] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
// Selected answers, citations and pre-writer sources copied from gate150-run2-results.json.
const recorded = JSON.parse(await readFile(new URL('./fixtures/money-run2-regressions.json', import.meta.url), 'utf8'));
const cache = new Map();
async function published(path) {
  if (!cache.has(path)) cache.set(path, readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; }));
  return structuredClone(await cache.get(path));
}
const env = { origin: 'https://offline.test', asset: published, ASSETS: { fetch: async request => {
  const value = await published(new URL(request.url).pathname);
  return value ? Response.json(value) : new Response('', { status: 404 });
} } };
const fetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Money regression unit tests must never contact a public service.'); };
test.after(() => { globalThis.fetch = fetch; });
function inputFor(id, sources = recorded[id].payload.research.pre_writer_sources) {
  const row = recorded[id];
  return { question: row.question, period: api.inferPeriod(row.question), constraints: row.payload.answer_scope,
    facts: api.writingFacts({ answer: '', citations: {}, sources: sources.map(source => ({ ...source, cited: true })) }) };
}
function toolInput(id, result) {
  const sheet = api.factSheet([{ tool: 'grants', ok: true, data: result, cite: result.citations.map(c => ({ ...c, label: c.text })), notes: result.notes }]);
  return { ...inputFor(id), facts: api.writingFacts(undefined, sheet.facts, sheet.notes) };
}
const answer = input => {
  const out = api.proseFallback(input);
  const checked = api.groundAnswerPayload(out, input.question);
  assert.equal(checked.answer, out.answer, 'the final claim checks retain each summary and its figures');
  return out;
};
function cited(out, text) {
  const offset = Array.from(out.answer.slice(0, out.answer.indexOf(text))).length;
  assert.ok(Object.values(out.citations).flat().some(([a, b]) => a <= offset && b >= offset + Array.from(text).length), text);
}

test('MN-GRNT-014: the real aggregate and individual award payloads produce one total followed by notable grants', async () => {
  const raw = answer(inputFor('MN-GRNT-014'));
  assert.match(raw.answer, /^The Trustee for Mantiyupwi Family Trust received \$5,941,767\.00 across 4 recorded federal grants\./);
  assert.match(raw.answer, /\n\nTiwi Islands Visitor Welcome Centre Project: \$4,092,000\.00/);
  assert.equal(raw.answer.match(/Tiwi Islands Visitor Welcome Centre Project/g).length, 1);
  assert.doesNotMatch(raw.answer, /Grant:|—|…|^;/m);
  const result = await api.callTool(env, 'grants', { operation: 'totals', recipient: 'The Trustee for Mantiyupwi Family Trust' });
  assert.equal(result.total_aud, 5941767);
  const out = answer(toolInput('MN-GRNT-014', result));
  assert.match(out.answer, /^The Trustee for Mantiyupwi Family Trust received \$5,941,767 across 4 federal grant awards/);
  assert.match(out.answer, /\n\nTiwi Islands Visitor Welcome Centre Project: \$4,092,000/);
  cited(out, '$5,941,767'); cited(out, '$4,092,000');
});

test('MN-GRNT-022: Queensland Government totals and discovery stay in the requested grant jurisdiction', async () => {
  const row = recorded['MN-GRNT-022'], period = api.inferPeriod(row.question);
  const constraints = api.extractAskConstraints(row.question, period, { people: [], parties: [], bills: [], ambiguous: false, unresolved: false });
  const step = api.constrainStep({ tool: 'grants', args: { operation: 'totals', recipient: 'Board Of The Queensland Museum' } }, constraints, api.getTool('grants').inputSchema.properties);
  assert.equal(step.args.jurisdiction, 'qld');
  const result = await api.callTool(env, 'grants', step.args);
  assert.equal(result.total_aud, 11913708); assert.equal(result.records, 14);
  const out = answer(toolInput('MN-GRNT-022', result));
  assert.match(out.answer, /^Board Of The Queensland Museum received \$11,913,708 across 14 Queensland Government/);
  assert.match(out.answer, /Anzac Legacy Gallery/); assert.doesNotMatch(out.answer, /National Taxonomy|\$2,579,773|—/);
  const discovery = api.constrainStep({ tool: 'find_records', args: { query: 'Board Of The Queensland Museum', kind: 'grant' } }, constraints, api.getTool('find_records').inputSchema.properties);
  const catalogueRows = ['federal', 'qld'].map(state => ({ kind: 'grant', title: 'Board Of The Queensland Museum', href: `/money/grants/${state}/recipient/abn%3A91522611802`, state,
    snippet: state === 'federal' ? '$2,579,773.00 across 26 grant records. National Taxonomy Research Grants Program' : '$11,913,708.00 across 14 grant records. Anzac Legacy Gallery' }));
  const found = await api.callTool({ ...env, ASSETS: { ...env.ASSETS, catalogueRows } }, 'find_records', discovery.args);
  assert.ok(found.citations.some(c => c.value === 11913708), 'discovery recovers the complete Queensland recipient summary');
  assert.ok(found.citations.every(c => !c.url.includes('/grants/federal/')));
  // The wrongly scoped federal profile in the recorded payload must not be relabelled Queensland.
  assert.equal(api.renderFacts(inputFor('MN-GRNT-022')).length, 0);
});

test('MN-STAT-006: exact campaign matching exposes the recorded category cost, period and GST basis', async () => {
  const legacy = answer(inputFor('MN-STAT-006'));
  assert.doesNotMatch(legacy.answer, /Register:|source reporting period retained|no category sum|—/);
  assert.match(legacy.answer, /\$1,966,680\.00.*2017-18/);
  const result = await api.callTool(env, 'campaign_spend', { campaign: '2018 recruitment', financial_year: '2017-18' });
  assert.equal(result.rows.length, 5);
  assert.ok(result.rows.every(r => r.entity === 'Federation Training'));
  assert.equal(result.rows[0].total_cents, 12272200);
  const out = answer(toolInput('MN-STAT-006', result));
  assert.match(out.answer, /^2018 recruitment for Federation Training recorded \$122,722 for media advertising buy in financial year 2017-18/);
  assert.match(out.answer, /excluding GST/); assert.match(out.answer, /6 November - 31 December 2017/);
  assert.doesNotMatch(out.answer, /source reporting period retained|no category sum|Chisholm|Choose Your Calling/);
  cited(out, '$122,722');
  const found = await api.callTool(env, 'find_records', { query: '2018 recruitment campaign advertising' });
  assert.equal(found.citations[0].value, 122722);
  const missingAmount = structuredClone(result.rows[0]); missingAmount.total_cents = null;
  const noAmount = await api.callTool({ ...env, asset: async () => ({ rows: [missingAmount] }) }, 'campaign_spend', { campaign: '2018 recruitment' });
  assert.match(noAmount.citations[0].text, /records no amount/); assert.equal(noAmount.citations[0].value, undefined);
});

test('DT-FYR-004: a party total leads the real mixed aggregate and donor-source facts', async () => {
  const input = inputFor('DT-FYR-004'), out = answer(input);
  assert.match(out.answer, /^LNP received \$6,575,931 in federal disclosed receipts across 982 receipts in financial year 2019-20\./);
  assert.match(out.answer, /\n\nAltum Pty Ltd provided \$1,659,674/);
  assert.match(out.answer, /\n\nMacquarie Telecom provided \$189,500/);
  cited(out, '$6,575,931');
  // A writer that keeps only the example donor drops the requested party total: the facts-only version, which leads
  // with it, answers instead, in one call.
  const draft = { answer_decision: 'answer', sentences: [{ text: 'Altum Pty Ltd provided $1,659,674 in disclosed receipts to LNP in financial year 2019-20.', facts: [input.facts.find(f => f.source.receipt?.source === 'Altum Pty Ltd').id] }] };
  const response = { content: [{ type: 'text', text: JSON.stringify(draft) }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 20 }, outputTokens: { total: 20 } }, warnings: [] };
  const model = new MockLanguageModelV4({ doGenerate: [response, response] });
  const writer = api.createAnswerWriter({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) } });
  const written = await writer(input, { rounds: 0, tokens: { input: 0, output: 0 } }, undefined, 15000);
  assert.match(written.answer, /^LNP received \$6,575,931/);
  assert.equal(model.doGenerateCalls.length, 1);
});

test('MN-DONR-028: a named donor answer excludes another donor returned by an exploratory call', () => {
  const out = answer(inputFor('MN-DONR-028'));
  assert.match(out.answer, /^Westpac Banking Corporation provided \$50,000 in federal disclosed receipts to One Nation in financial years 2024-25\./);
  assert.doesNotMatch(out.answer, /Hotels|6,271/);
  assert.ok(out.sources.filter(s => s.cited).every(s => !s.snippet.includes('Hotels')));
  cited(out, '$50,000');
});

test('MN-DONR-016: the passing lifetime donor-to-party total and period remain intact', () => {
  assert.equal(recorded['MN-DONR-016'].grade, 'pass');
  const out = answer(inputFor('MN-DONR-016'));
  assert.match(out.answer, /Ramsay Health Care Limited provided \$143,410.*Nationals.*1998-99 to 2025-26/);
  cited(out, '$143,410');
});

// MN-CONT-018 is about a count tie between two agencies; the live supplier file moves with every AusTender
// refresh (on 11 November 2026 the refreshed file no longer had the tie), so the case is a snapshot.
const supplierFixture = JSON.parse(await readFile(new URL('./fixtures/mn-cont-018-suppliers.json', import.meta.url), 'utf8'));
const supplierAsset = async path => structuredClone(supplierFixture[path] ?? null);
const supplierEnv = { origin: env.origin, asset: supplierAsset, ASSETS: { fetch: async request => {
  const value = await supplierAsset(new URL(request.url).pathname);
  return value ? Response.json(value) : new Response('', { status: 404 });
} } };
test('MN-CONT-018: complete supplier profiles rank agency totals and identify count ties separately', async () => {
  const result = await api.callTool(supplierEnv, 'contracts', { supplier: 'Centorrino Technologies Pty Ltd', group_by: 'agency' });
  assert.equal(result.rows[0].agency, 'High Speed Rail Authority');
  assert.equal(result.rows[0].total_aud, 4717706.19); assert.equal(result.rows[0].contracts, 2);
  const out = answer(toolInput('MN-CONT-018', result));
  assert.match(out.answer, /^High Speed Rail Authority awarded Centorrino Technologies Pty Ltd \$4,717,706 across 2 Commonwealth contracts, the largest total contract value/);
  assert.match(out.answer, /Department of Defence.*4 Commonwealth contracts/);
  assert.match(out.answer, /Department of the Prime Minister and Cabinet.*4 Commonwealth contracts/);
  cited(out, '$4,717,706');
  const counted = await api.callTool(supplierEnv, 'contracts', { supplier: 'Centorrino Technologies Pty Ltd', group_by: 'agency', rank_by: 'count', limit: 1 });
  assert.equal(counted.rows.length, 2, 'all leaders survive a display limit');
  assert.ok(counted.rows.every(r => r.contracts === 4));
});

test('NP-INTR-016: duplicate register descriptions merge while holders, changes and raw counts are retained', async () => {
  const raw = answer(inputFor('NP-INTR-016'));
  assert.equal(raw.answer.match(/Agrespond Pty Ltd/g).length, 1);
  assert.equal(raw.answer.match(/Mount Barker Mining Pty Ltd/g).length, 1);
  const result = await api.callTool(env, 'declared_interests', { person: 'David Kempton', category: 'shareholdings' });
  assert.equal(result.total, 4, 'preserve the register count as source metadata'); assert.equal(result.rows.length, 2);
  assert.match(result.citations[0].text, /^David Kempton declared shareholdings: Agrespond Pty Ltd, consulting, nil; Mount Barker Mining Pty Ltd/);
  // The register date is the published register's own snapshot date, not a pinned one (it moves each refresh).
  const index = await published('/interests/index.json');
  const [registerId] = Object.entries(index.people).find(([, p]) => p.name === 'David Kempton');
  const register = await published(`/interests/${registerId}.json`);
  assert.match(register.as_at, /^\d{4}-\d{2}-\d{2}$/); assert.ok(register.as_at >= '2026-10-16', 'the Queensland register snapshot never goes backwards');
  assert.ok(result.citations[0].text.includes(`(Queensland register of interests as at ${register.as_at}`), result.citations[0].text);
  const out = answer(toolInput('NP-INTR-016', result));
  assert.equal(out.answer.match(/Agrespond Pty Ltd/g).length, 1);
  assert.equal(out.answer.match(/Mount Barker Mining Pty Ltd/g).length, 1);
  const items = ['member', 'spouse'].flatMap(holder => [{ holder, description: 'Example Ltd' }, { holder, description: 'Example Ltd, consulting' }]);
  items.push({ holder: 'member', description: 'Example Ltd', kind: 'deletion', date: '2026-01-01' });
  assert.equal(api.mergeRegisterItems(items).length, 3);
});
