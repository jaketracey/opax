import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({
  stdin: { contents: "export { proseFallback, writingFacts } from './src/research-writing'; export { recordAnswerLines, recordEvidenceText } from './src/research-record-answer'; export { createAnswerWriter } from './src/research-writer'; export { groundAnswerPayload } from './src/research-grounding'; export { billFields, billCitations } from './src/tools/record-common'; export { callTool } from './src/tools/index';", resolveDir: new URL('../', import.meta.url).pathname },
  bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const { rows } = JSON.parse(await readFile(new URL('./fixtures/ask-r1-records.json', import.meta.url), 'utf8'));
const row = id => rows.find(row => row.id === id);
const inputFor = row => ({ question: row.question, period: row.payload.answer_scope?.period ?? { kind: 'all', label: '' }, constraints: row.payload.answer_scope,
  facts: api.writingFacts({ answer: '', citations: {}, sources: row.payload.sources }) });
const localAsset = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Record answer tests must not make network requests'); };
test.after(() => { globalThis.fetch = originalFetch; });

async function answer(id) {
  const input = inputFor(row(id));
  const writer = api.createAnswerWriter({ modelBudgetSpent: async () => { throw Error('Exact record answers need no model call'); } });
  const result = await writer(input, { rounds: 0, tokens: { input: 0, output: 0 } }, undefined, 3000);
  const checked = api.groundAnswerPayload(result, input.question);
  assert.ok(Object.keys(checked.citations).length);
  for (const ranges of Object.values(checked.citations)) for (const [start, end] of ranges) assert.ok(start >= 0 && end > start && end <= Array.from(checked.answer).length);
  return checked;
}

for (const [id, ayes, noes] of [['DV-OUTC-012', 32, 34], ['DV-OUTC-007', 33, 37]]) test(`${id}: the recorded result and both tallies lead through writing and final grounding`, async () => {
  const out = await answer(id);
  assert.match(out.answer, new RegExp(`^The motion was defeated[^.]+${ayes} ayes and ${noes} noes\\.`));
  assert.doesNotMatch(out.answer, /party majority|crossed the floor|matching recorded divisions/i);
});

test('DV-CROS-003: named dissenters beat the linked-division count in the actual recorded payload', async () => {
  const out = await answer('DV-CROS-003');
  assert.match(out.answer, /^Alex Antic \(Liberal, aye\) and Concetta Fierravanti-Wells \(Liberal, aye\) voted against their published party majority/);
  assert.doesNotMatch(out.answer, /matching recorded division|recorded 1/);
});

test('a single-division lookup puts the vote evidence before its bill-link count', async () => {
  const detail = await localAsset('/divisions/division-federal-senate-7505.json');
  const bill = await localAsset('/bills/au-federal-s1325.json');
  const assets = { '/divisions/index.json': { divisions: [{ key: detail.key, date: detail.date, house: detail.house }] }, '/bills/index.json': { bills: [bill] }, ['/bills/' + bill.key + '.json']: bill, ['/divisions/division-' + detail.key + '.json']: detail };
  const data = await api.callTool({ origin: 'https://opax.test', asset: async path => assets[path] }, 'division', { bill: bill.key, date: '2021-11-22' });
  assert.equal(data.citations[0].kind, 'record');
  assert.match(data.citations[0].text, /Alex Antic.*Concetta Fierravanti-Wells/);
  assert.equal(data.citations.at(-1).kind, 'count');
});

test('floor-crossing absence is plain and partial membership stays qualified', async () => {
  const input = inputFor(row('DV-OUTC-012'));
  input.question = 'Who crossed the floor on this division?';
  assert.match(api.proseFallback(input).answer, /^No members were recorded voting against an eligible party majority/);
  input.facts[0].text = input.facts[0].text.replace('were recorded.', 'were identified among the available party-labelled votes. The member list is partial or unavailable.');
  const partial = api.proseFallback(input).answer;
  assert.match(partial, /among the available party-labelled votes/);
  assert.match(partial, /does not establish that nobody crossed the floor/);
});

test('division evidence projection is repeatable and keeps every number and dissenter tied to its source', () => {
  const input = inputFor(row('DV-CROS-003'));
  const source = row('DV-CROS-003').payload.sources[0];
  const projected = api.recordEvidenceText(source.snippet, source.url);
  assert.equal(api.recordEvidenceText(projected, source.url), projected);
  const partial = structuredClone(input);
  partial.facts[0].text += ' The member list is partial or unavailable.';
  assert.match(api.proseFallback(partial).answer, /other dissenters may be missing/);
  const outcome = inputFor(row('DV-OUTC-012'));
  outcome.facts[0].text = outcome.facts[0].text.replace(', 32 ayes to 34 noes', '');
  assert.equal(api.recordAnswerLines(outcome), null, 'missing tallies cannot be reconstructed from neighbouring records');
});

test('a result question with an additional member-vote request keeps the general writing path', () => {
  const input = inputFor(row('DV-OUTC-012'));
  input.question = 'What was the result and how did the named senator vote?';
  assert.equal(api.recordAnswerLines(input), null);
});

test('asking for both the result and dissenters keeps both findings', () => {
  const input = inputFor(row('DV-CROS-003'));
  input.question = 'What was the result and who crossed the floor?';
  const out = api.proseFallback(input);
  assert.match(out.answer, /^The motion was defeated[^.]+5 ayes and 44 noes/);
  assert.match(out.answer, /Alex Antic.*Concetta Fierravanti-Wells/);
});

for (const [id, person] of [['BL-SPON-017', 'Fatima Payman'], ['BL-SPON-006', 'Rex Patrick']]) test(`${id}: the person answers first and the introduction date supports them`, async () => {
  const out = await answer(id);
  assert.ok(out.answer.startsWith(person));
  assert.match(out.answer.split('\n\n')[0], /recorded sponsor/);
  assert.match(out.answer, /was first introduced in the Senate/);
  assert.doesNotMatch(out.answer, /&#39;/);
});

test('sponsor intent recognises introduction verb misspellings in the real bill metadata path', async () => {
  for (const [id, key, person] of [['BL-SPON-017', 'au-federal-s1514', 'Fatima Payman'], ['BL-SPON-006', 'au-federal-s1316', 'Rex Patrick']]) {
    const fields = await api.billFields({ asset: localAsset }, key);
    const detail = await localAsset('/bills/' + key + '.json');
    const citations = api.billCitations(fields, detail.title, 'https://opax.test/bill/' + key, row(id).question);
    assert.ok(citations[0].text.startsWith(person));
  }
});

test('DT-BDAY-020: the count has natural grammar and names the matching bill', async () => {
  const out = await answer('DT-BDAY-020');
  assert.match(out.answer, /^One bill was introduced in the Senate on 30 October 2012: Anti-Money Laundering Amendment \(Gaming Machine Venues\) Bill 2012 \[2013\]\./);
  assert.doesNotMatch(out.answer, /There were 1|bill records/);
});

test('an unrelated dated bill cannot replace the requested list', () => {
  const input = inputFor(row('DT-BDAY-020'));
  input.facts.find(f => /: introduced 2012-10-30/.test(f.text)).text = 'Another Bill 2012: introduced 2012-10-29 in the Senate';
  assert.equal(api.recordAnswerLines(input), null, 'the general writing path must resolve the missing matching bill names');
});

test('bill-count tool evidence and rendering retain zero, one and plural counts and every title', async () => {
  const bill = (await localAsset('/bills/index.json')).bills.find(bill => bill.key === 'au-federal-s889');
  for (const count of [0, 1, 2]) {
    const bills = Array.from({ length: count }, (_, i) => ({ ...bill, key: bill.key + '-' + i, title: bill.title + ' ' + i }));
    const data = await api.callTool({ origin: 'https://opax.test', asset: async () => ({ count, bills }) }, 'count_records', { record_type: 'bills', chamber: 'senate', date: '2012-10-30', include_records: true });
    assert.equal(data.total, count);
    assert.ok(data.citations[0].text.startsWith(['No bills were introduced', 'One bill was introduced', 'Two bills were introduced'][count]));
    const input = { question: 'Which bills were introduced in the Senate on 30 October 2012?', period: { kind: 'all', label: '' }, facts: data.citations.map((cite, i) => ({ id: i + 1, text: cite.text, source: { resource: 'fact-' + i, kind: cite.kind, url: cite.url, href: cite.url, title: cite.text, snippet: cite.text, cited: true } })) };
    const out = api.proseFallback(input);
    assert.ok(out.answer.startsWith(['No bills were introduced', 'One bill was introduced', 'Two bills were introduced'][count]));
    for (const bill of bills) assert.ok(out.answer.includes(bill.title));
  }
});

test('BL-PORT-012 remains a portfolio answer with the recorded Youth and Sport evidence', async () => {
  const input = inputFor(row('BL-PORT-012'));
  assert.equal(api.recordAnswerLines(input), null);
  assert.match(input.facts[0].text, /Youth and Sport portfolio/);
  const key = 'au-federal-s1268', detail = await localAsset('/bills/' + key + '.json');
  const fields = await api.billFields({ asset: localAsset }, key);
  assert.match(api.billCitations(fields, detail.title, 'https://opax.test/bill/' + key, input.question)[0].text, /Youth and Sport portfolio/);
});

test('a dead bill names its exact ending in the status citation and its projection', async () => {
  const key = 'au-federal-r6002', detail = await localAsset('/bills/' + key + '.json');
  assert.equal(detail.ended, 'removed');
  const fields = await api.billFields({ asset: localAsset }, key);
  assert.equal(fields.ended_label, 'Removed from the Notice Paper');
  const url = 'https://opax.test/bill/' + key;
  const status = api.billCitations(fields, detail.title, url, 'What happened to this bill?').find(c => /has recorded status/.test(c.text));
  assert.match(status.text, /has recorded status lapsed \(Removed from the Notice Paper\) as at/);
  assert.match(api.recordEvidenceText(status.text, url), /did not pass; it was removed from the Notice Paper as at/);
  for (const [label, words] of [['Voted down', 'it was voted down'], ['Lapsed', 'it lapsed'], ['Not proceeding', 'it is recorded as not proceeding']]) {
    assert.match(api.recordEvidenceText(`The Example Bill 2019 has recorded status lapsed (${label}) as at 1 July 2019.`, url), new RegExp(`did not pass; ${words} as at`));
  }
  // A file without the fields keeps today's wording.
  const { ended, ended_label, ...plain } = fields;
  const before = api.billCitations(plain, detail.title, url, 'What happened to this bill?').find(c => /has recorded status/.test(c.text));
  assert.match(before.text, /has recorded status lapsed as at/);
  assert.match(api.recordEvidenceText(before.text, url), /did not pass; it lapsed as at/);
});
