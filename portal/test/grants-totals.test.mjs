import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export {tool} from './src/tools/grants';export {parseToolArgs} from './src/tools/index';export {constrainStep,guardToolPeriod} from './src/ask-constraints';export {atomsFromText} from './src/research-claims';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { tool, parseToolArgs, constrainStep, guardToolPeriod, atomsFromText } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

// Real exported shapes: the index routes to a shard; `by` contains complete FY totals,
// while `grants` is only the largest records and may omit most of the recipient's awards.
const recipient = { id: 'abn:12345678901', n: 'Example Health & Research Ltd.', k: 'company', sh: 7, t: 1250, c: 7, by: [[300, 2], [700, 3], [200, 1]] };
const summary = { ...recipient, jur: 'federal', y0: '2017-18', y1: '2019-20', by: { '2017-18': [300, 2], '2018-19': [700, 3], '2019-20': [200, 1] }, grants: [{ id: 'GA1', v: 40, fy: '2017-18' }], more: 6 };
const sourceYears = ['2017-18', '2018-19', '2019-20'];
function data() {
  const assets = {
    '/graph/grants.federal.json': { meta: { years: sourceYears, generated: '2026-10-19T11:18:41Z' }, recipients: [recipient] },
    '/grants/federal/shard-07.json': { 'abn-12345678901': summary },
    '/graph/grants.qld.json': { meta: { years: sourceYears, generated: '2026-09-13T09:31:53Z' }, recipients: [{ ...recipient, t: 4500, c: 3 }] },
    '/grants/qld/shard-07.json': { 'abn-12345678901': { ...summary, jur: 'qld', t: 4500, c: 3, by: { '2017-18': [1000, 1], '2018-19': [1500, 1], '2019-20': [2000, 1] } } },
  };
  const state = { assets: structuredClone(assets), reads: [] };
  state.env = { origin: 'https://opax.example', asset: async path => { state.reads.push(path); return structuredClone(state.assets[path] ?? null); } };
  state.run = args => tool.handler(state.env, parseToolArgs('grants', args));
  return state;
}

test('recipient totals use the complete summary rather than adding listed awards', async () => {
  const f = data(), out = await f.run({ recipient: recipient.n, aggregation: 'total' });
  assert.equal(out.total_aud, 1250); assert.equal(out.records, 7);
  assert.equal(out.rows.length, 1); assert.equal(out.citations[0].value, 1250);
  assert.match(out.citations[0].text, /^Example Health & Research Ltd\. received \$1,250.*federal grant award values.*all published years, financial years 2017-18 to 2019-20/);
  assert.match(out.notes.join(' '), /no financial year recorded/);
  assert.deepEqual(f.reads, ['/graph/grants.federal.json', '/grants/federal/shard-07.json']);
  assert.equal(out.citations[0].url, 'https://opax.example/money/grants/federal/recipient/abn%3A12345678901');
});

test('one FY and inclusive FY ranges use precomputed yearly cells, including omitted awards', async () => {
  const f = data();
  const year = await f.run({ recipient: recipient.id, financial_year: '2017-18' });
  assert.equal(year.total_aud, 300); assert.equal(year.records, 2);
  assert.equal(year.coverage.since, '2017-07-01'); assert.equal(year.coverage.until, '2018-06-30');
  assert.equal(year.coverage.as_of, '2026-10-19'); assert.match(year.citations[0].text, /financial year 2017-18 \(2 award records; 2017-07-01 to 2018-06-30\)/);
  const range = await f.run({ recipient: recipient.n, from_year: 2017, to_year: 2018 });
  assert.equal(range.total_aud, 1000); assert.equal(range.records, 5);
  assert.equal(range.coverage.until, '2019-06-30');
  const amount = atomsFromText(range.citations[0].text, 'grant-total').find(atom => atom.unit === 'AUD');
  assert.equal(amount.entity, recipient.n); assert.equal(amount.metric, 'grants'); assert.equal(amount.value, '1000');
  assert.equal(amount.period.since, '2017-07-01'); assert.equal(amount.period.until, '2019-06-30');
  const since = await f.run({ recipient: recipient.n, from_year: 2018 });
  assert.equal(since.total_aud, 900); assert.equal(since.records, 4);
});

test('exact Ask dates take priority over its generic calendar-year bounds and stay verified', async () => {
  const f = data(), period = { kind: 'window', since: '2017-07-01', until: '2018-06-30' };
  const constraints = { period, dated: true, people: [], trend: false };
  const step = constrainStep({ tool: 'grants', args: { recipient: recipient.n, aggregation: 'total', financial_year: '2017-18' } }, constraints, tool.inputSchema.properties);
  assert.equal(step.args.to_year, 2018);
  const out = await f.run(step.args);
  assert.equal(out.total_aud, 300);
  const guarded = guardToolPeriod({ tool: 'grants', ok: true, data: out, cite: out.citations.map(c => ({ ...c, label: c.text })), notes: out.notes }, step, constraints);
  assert.notEqual(guarded.data.coverage_only, true); assert.equal(guarded.coverage.matched, undefined);
});

test('calendar and partial dates produce a limitation instead of an invented FY split', async () => {
  for (const args of [{ since: '2017-01-01', until: '2017-12-31' }, { since: '2017-07-01', until: '2018-03-31' }]) {
    const out = await data().run({ recipient: recipient.n, ...args });
    assert.equal(out.coverage_only, true); assert.equal(out.coverage.matched, false);
    assert.equal(out.total_aud, undefined); assert.equal(out.citations[0].value, undefined);
    assert.match(out.citations[0].text, /cannot establish a total.*partial or calendar-year/);
  }
});

test('missing source FYs and periods outside the published range never become zero totals', async () => {
  const f = data();
  f.assets['/graph/grants.federal.json'].meta.years = ['2017-18', '2019-20'];
  for (const financial_year of ['2016-17', '2018-19', '2020-21']) {
    const out = await f.run({ recipient: recipient.n, financial_year });
    assert.equal(out.coverage_only, true); assert.equal(out.total_aud, undefined);
  }
});

test('a supported FY with no recipient awards returns zero recorded awards with the period', async () => {
  const f = data();
  delete f.assets['/grants/federal/shard-07.json']['abn-12345678901'].by['2018-19'];
  const out = await f.run({ recipient: recipient.id, financial_year: '2018-19' });
  assert.equal(out.total_aud, 0); assert.equal(out.records, 0);
  assert.match(out.citations[0].text, /received \$0.*financial year 2018-19 \(0 award records; 2018-07-01 to 2019-06-30\)/);
});

test('Queensland expenditure totals remain separate from Commonwealth award values', async () => {
  const f = data(), out = await f.run({ recipient: recipient.n, jurisdiction: 'qld', financial_year: '2018-19' });
  assert.equal(out.total_aud, 1500); assert.equal(out.records, 1);
  assert.match(out.citations[0].text, /Queensland Government grant and assistance expenditure/);
  assert.match(out.citations[0].text, /1 expenditure row;/);
  assert.match(out.notes[0], /not distinct awards/);
  assert.ok(f.reads.every(path => path.includes('qld')));
});

test('recipient resolution preserves ampersands, punctuation, unique fragments and source IDs', async () => {
  const f = data();
  for (const name of ['example health and research ltd', 'HEALTH & RESEARCH', recipient.id]) {
    const out = await f.run({ recipient: name });
    assert.equal(out.total_aud, 1250); assert.equal(out.recipient, recipient.n);
  }
});

test('ambiguous recipient names return choices without adding unrelated recipients', async () => {
  const f = data();
  f.assets['/graph/grants.federal.json'].recipients.push({ ...recipient, id: 'name:example health clinic', n: 'Example Health Clinic' });
  const out = await f.run({ recipient: 'Example Health' });
  assert.equal(out.total_aud, undefined); assert.equal(out.candidates.length, 2);
  assert.equal(out.citations.length, 0); assert.deepEqual(f.reads, ['/graph/grants.federal.json']);
});

test('private recipients and unlisted names do not disclose a total or imply zero funding', async () => {
  const f = data();
  f.assets['/graph/grants.federal.json'].recipients.push({ ...recipient, id: 'person:private example', n: 'Private Example', k: 'individual' });
  for (const name of ['Private Example', 'Absent Recipient']) {
    const out = await f.run({ recipient: name });
    assert.equal(out.total_aud, undefined); assert.deepEqual(out.rows, []); assert.deepEqual(out.citations, []);
    assert.match(out.notes[0], /does not establish a zero grant total/);
    assert.ok(!JSON.stringify(out).includes('Private Example'));
  }
});

test('unsupported filters and inconsistent FY labels are rejected before reading data', () => {
  for (const args of [{ aggregation: 'total' }, { financial_year: '2017-18' }, { recipient: '  ' },
    { recipient: recipient.n, state: 'wa' }, { recipient: recipient.n, electorate: 'Perth' }, { recipient: recipient.n, query: 'health' },
    { recipient: recipient.n, financial_year: '2017-19' }, { recipient: recipient.n, financial_year: '2017-18', to_year: 2018 },
    { recipient: recipient.n, from_year: 2019, to_year: 2017 }]) {
    assert.throws(() => parseToolArgs('grants', args), /Invalid arguments/);
  }
  // Current largest-grant arguments retain their existing meanings and defaults.
  assert.deepEqual(parseToolArgs('grants', { query: 'health', each: 'recipient', from_year: 2017, to_year: 2018 }), { query: 'health', each: 'recipient', from_year: 2017, to_year: 2018 });
});

test('Ask keeps recipient names containing a state separate from grant location filters', () => {
  const constraints = { period: { kind: 'all' }, dated: false, people: [], trend: false, jurisdiction: 'qld', locationState: 'qld', stateGovernment: false };
  const step = constrainStep({ tool: 'grants', args: { recipient: 'Queensland Example University', aggregation: 'total' } }, constraints, tool.inputSchema.properties);
  assert.equal(step.args.jurisdiction, 'federal'); assert.equal(step.args.state, undefined);
  assert.equal(parseToolArgs('grants', step.args).recipient, 'Queensland Example University');
});

test('dated largest-grant lists retain the existing calendar-year table filters', () => {
  const constraints = { period: { kind: 'window', since: '2017-01-01', until: '2018-12-31' }, dated: true, people: [], trend: false };
  const step = constrainStep({ tool: 'grants', args: { query: 'health' } }, constraints, tool.inputSchema.properties);
  assert.equal(step.args.from_year, 2017); assert.equal(step.args.to_year, 2018);
  assert.equal(step.args.since, undefined); assert.equal(step.args.until, undefined);
  assert.equal(parseToolArgs('grants', step.args).query, 'health');
});
