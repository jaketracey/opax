import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { computeElectorateGold } from '../../scripts/agentic_ask_electorates_gold.mjs';
import { score } from '../../scripts/agentic_ask_spike.mjs';
import { runGold } from '../../scripts/agentic_ask_shadow.mjs';

const load = async (entry) => {
  const out = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const { electorates, ELECTORATE_INDICATORS, electoratePlan } = await load('../src/agentic-tool-electorates.ts');
const { classifyAgentic, runAgentic, factSheet, verifyComposition } = await load('../src/agentic-ask.ts');
const { runTool } = await load('../src/agentic-tools.ts');
const fixture = JSON.parse(await readFile(new URL('./fixtures/agentic-electorates.json', import.meta.url), 'utf8'));
const stub = (assets = fixture.assets) => ({
  origin: 'https://opax.com.au',
  kb: async () => { throw new Error('Electorate tools must never search speeches'); },
  asset: async (path) => structuredClone(assets[path] ?? null),
});

test('current ranking includes every cutoff tie, excludes null and historical values, and cites each figure', async () => {
  const r = await electorates(stub(), { indicator: 'median_income' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.rows.map((x) => [x.name, x.value, x.rank]), [['Alpine', 500, 1], ['Sample Bay', 500, 1]]);
  assert.equal(r.data.available, 3);
  assert.equal(r.data.matched, 4);
  assert.deepEqual(r.data.ties, [{ rank: 1, value: 500, names: ['Alpine', 'Sample Bay'] }]);
  assert.equal(r.data.missing[0].name, 'Missing');
  assert.equal(r.data.more, 1);
  assert.match(r.notes.join(' '), /missing is not zero/);
  assert.match(r.notes.join(' '), /not been redistributed/);
  for (const [i, row] of r.data.rows.entries()) {
    assert.equal(row.unit, 'AUD/week');
    assert.equal(row.jurisdiction, 'federal');
    assert.equal(r.cite[i].url, row.url);
    assert.equal(r.cite[i].value, row.value);
    assert.match(r.cite[i].label, /2021 Census \(ABS\)/);
    assert.match(row.url, /^https:\/\/opax.com.au\/subject\/electorate\//);
  }
  assert.equal(factSheet([r]).facts.length, 2);
  assert.ok(factSheet([r]).facts.every((f) => /2021 Census \(ABS\)/.test(f.text)));
});

test('descending ranking, inclusive numeric filtering and zero values are exact', async () => {
  const high = await electorates(stub(), { indicator: 'unemployment_rate', order: 'desc', limit: 2 });
  assert.deepEqual(high.data.rows.map((r) => [r.name, r.value]), [['Alpine', 8.2], ['Coast', 4]]);
  const low = await electorates(stub(), { indicator: 'unemployment_rate' });
  assert.deepEqual(low.data.rows.map((r) => [r.name, r.value]), [['Sample Bay', 0]]);
  const filter = await electorates(stub(), { indicator: 'median_income', operation: 'filter', min: 500, max: 500 });
  assert.deepEqual(filter.data.rows.map((r) => r.value), [500, 500]);
  assert.ok(filter.data.rows.every((r) => r.rank === undefined));
  const noMatch = await electorates(stub(), { indicator: 'median_income', min: 900 });
  assert.equal(noMatch.data.unanswerable, 'no_matching_values');
  assert.deepEqual(noMatch.cite, []);
  const decimal = await runTool(stub(), 'electorates', { indicator: 'unemployment_rate', operation: 'filter', min: 4.1, max: 8.2 });
  assert.equal(decimal.ok, true);
  assert.deepEqual(decimal.data.rows.map((r) => r.value), [8.2]);
});

test('composition cannot introduce any Census figure, including current or year-shaped values', async () => {
  const r = await electorates(stub(), { indicator: 'median_income' });
  const { facts } = factSheet([r]);
  const seat = 'Alpine (Federal, House of Representatives)';
  for (const sentence of [
    `${seat} has median personal income 500 AUD/week (2021 Census (ABS)) [1].`,
    `${seat} has median personal income $1991 [1].`,
    `${seat} has median personal income $2021 [1].`,
    `${seat} has median personal income 1991 [1].`,
    `${seat} has median personal income 500 AUD/week in the 1991 Census [1].`,
  ]) assert.equal(verifyComposition(sentence, facts).prose, '', sentence);
});

test('jurisdiction, chamber, geographic state and historical status filter different scopes', async () => {
  const state = await electorates(stub(), { indicator: 'median_income', jurisdiction: 'vic', chamber: 'vic_la' });
  assert.equal(state.data.rows[0].value, 300);
  assert.equal(state.data.rows[0].jurisdiction, 'vic');
  const upper = await electorates(stub(), { indicator: 'median_income', jurisdiction: 'vic', chamber: 'vic_lc' });
  assert.equal(upper.data.rows[0].value, 700);
  const geographic = await electorates(stub(), { indicator: 'median_income', state: 'vic' });
  assert.deepEqual(geographic.data.rows.map((r) => r.name), ['Sample Bay']);
  assert.equal(geographic.data.matched, 2);
  const historical = await electorates(stub(), { indicator: 'median_income', status: 'historical' });
  assert.equal(historical.data.rows[0].name, 'Former');
  const senate = await electorates(stub(), { indicator: 'median_age', chamber: 'senate' });
  assert.equal(senate.data.rows[0].name, 'Senate Region');
});

test('lookup uses exact names or IDs and requires disambiguation across jurisdictions or chambers', async () => {
  const lookup = await electorates(stub(), { indicator: 'median_age', electorate: '  SAMPLE BAY  ' });
  assert.equal(lookup.data.operation, 'lookup');
  assert.equal(lookup.data.rows[0].value, 35);
  const id = await electorates(stub(), { indicator: 'median_age', electorate: 'el_aa' });
  assert.equal(id.data.rows[0].value, 35);
  const ambiguous = await electorates(stub(), { indicator: 'median_age', electorate: 'Sample Bay', jurisdiction: 'all' });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /Ambiguous/);
  assert.equal(ambiguous.data.candidates.length, 3);
  const noSeat = await electorates(stub(), { indicator: 'median_age', electorate: 'Sample' });
  assert.equal(noSeat.data.unanswerable, 'no_matching_electorate');
});

test('a missing state profile and a conflicting profile yield no invented number', async () => {
  const missing = await electorates(stub(), { indicator: 'median_income', jurisdiction: 'nsw' });
  assert.equal(missing.data.unanswerable, 'no_demographic_data');
  assert.equal(missing.data.available, 0);
  assert.deepEqual(missing.data.rows, []);
  assert.deepEqual(missing.cite, []);
  const assets = structuredClone(fixture.assets);
  assets['/electorates/releases/deadbeef/el_aa.json'].demographics.push({ year: 2021, indicators: { median_income: 999 } });
  const conflict = await electorates(stub(assets), { indicator: 'median_income', electorate: 'Sample Bay' });
  assert.equal(conflict.data.unanswerable, 'no_demographic_data');
  assert.match(conflict.data.missing[0].reason, /Conflicting/);
});

test('every published indicator can be looked up with its unit; invalid inputs and incomplete assets fail', async () => {
  const assets = structuredClone(fixture.assets);
  const indicators = assets['/electorates/releases/deadbeef/el_aa.json'].demographics[0].indicators;
  for (const key of Object.keys(ELECTORATE_INDICATORS)) indicators[key] = 12.5;
  for (const [key, meta] of Object.entries(ELECTORATE_INDICATORS)) {
    const r = await electorates(stub(assets), { indicator: key, electorate: 'Sample Bay' });
    assert.equal(r.data.rows[0].value, 12.5, key);
    assert.equal(r.data.rows[0].unit, meta.unit, key);
    assert.equal(r.cite[0].value, 12.5, key);
  }
  for (const args of [{}, { indicator: 'made_up' }, { indicator: 'constructor' }, { indicator: '__proto__' }, { indicator: 'median_age', min: '10' }, { indicator: 'median_age', min: 50, max: 10 }, { indicator: 'median_age', limit: 1.5 }, { indicator: 'median_age', jurisdiction: 'unknown' }, { indicator: 'median_age', chamber: 'unknown' }, { indicator: 'median_age', operation: 'lookup' }]) {
    assert.equal((await runTool(stub(), 'electorates', args)).ok, false, JSON.stringify(args));
  }
  delete assets['/electorates/releases/deadbeef/el_bb.json'];
  const incomplete = await runTool(stub(assets), 'electorates', { indicator: 'median_age' });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.error, /asset unavailable/);
});

test('data questions route to agentic while ordinary speech questions retain their route', () => {
  for (const question of [
    'What electorate has the lowest median income', 'Which electorate has the highest unemployment?',
    'What is the median age in Sample Bay?', 'unemployment in Sample Bay',
    'Which is the oldest electorate?', 'What electorate is youngest?', 'Which electorate has most renters?',
    'Which Victorian state electorate has the highest population?', 'median income',
    'What is the median household income in Sample Bay?', 'What is home ownership in Sample Bay?',
    'Which electorate has the most university qualifications?', 'Which electorate has the lowest labour force participation?',
  ]) assert.equal(classifyAgentic(question).rule, 'electorate-data', question);
  for (const question of [
    'What did Alex Example say about median income?', 'Show speeches about unemployment in Sample Bay',
    'Which electorate did Alex Example mention in her speech?', 'Who represents Sample Bay?',
    'What grants went to the electorate of Sample Bay?', 'What did the oldest MP say?',
    'What did Alex Example say about renters?', 'Find a quote about 1991 Census figures',
  ]) assert.equal(classifyAgentic(question).route, 'ask', question);
  assert.equal(classifyAgentic('Who made the most speeches about unemployment?').rule, 'ranking');
});

test('bounded plans distinguish personal/household income and specific population percentages', () => {
  for (const [question, indicator] of [
    ['What electorate has the lowest median income', 'median_income'],
    ['Which electorate has the highest median household income?', 'median_household_income_weekly'],
    ['What is the indigenous population in Sample Bay?', 'indigenous_pct'],
    ['What percentage of the population was born overseas in Sample Bay?', 'born_overseas_pct'],
    ['What is the median rent in Sample Bay?', 'median_rent_weekly'],
  ]) assert.equal(electoratePlan(question).steps[0].args.indicator, indicator, question);
  assert.equal(electoratePlan('What is the median age in the electorate of Sample Bay?').steps[0].args.electorate, 'Sample Bay');
  assert.equal(electoratePlan('Which electorate has unemployment above 8.2%?'), null);
});

test('fixture orchestration uses electorate facts and the fixed real-time step label and indicator arg', async () => {
  const events = [];
  const deps = { ...stub(), generate: async (_q, prompt) => /Plan the record/.test(prompt.user)
    ? { text: JSON.stringify({ shape: 'ranking', steps: [{ tool: 'electorates', args: { indicator: 'median_age', electorate: 'Sample Bay' }, label: '<script>model label</script>' }] }) }
    : { text: 'Sample Bay has median age 999 [1].' } };
  const out = await runAgentic('What is the median age in Sample Bay?', deps, async (event, data) => events.push({ event, data }));
  assert.equal(out.answered, true);
  assert.equal(out.answer_source, 'template');
  assert.equal(out.events[0].arg, 'median age');
  assert.match(out.answer, /Sample Bay.*35 years \(2021 Census \(ABS\)\)/);
  assert.match(out.facts[0].url, /\/subject\/electorate\//);
  const steps = events.filter((e) => e.data.phase === 'step').map((e) => e.data.step);
  assert.deepEqual(steps.map((s) => [s.label, s.arg, s.state]), [['Checking electorate data', 'median age', 'running'], ['Checking electorate data', 'median age', 'done']]);
  const failed = [];
  await runAgentic('What is the median age in Sample Bay?', { ...deps, asset: async () => null }, async (_e, data) => failed.push(data));
  assert.equal(failed.filter((e) => e.phase === 'step').at(-1).step.state, 'failed');
});

test('the four gold answers match independent published-JSON expectations and pass the gold scorer', async () => {
  const snapshot = JSON.parse(await readFile(new URL('./fixtures/agentic-ask-gold.json', import.meta.url), 'utf8'));
  const cases = computeElectorateGold();
  assert.deepEqual(snapshot.questions.filter((q) => q.category === 'electorates'), cases);
  const deps = { ...stub(), asset: async (path) => JSON.parse(await readFile(new URL(`../public${path}`, import.meta.url), 'utf8')) };
  const saved = [];
  for (const q of cases) {
    const { manifest, release_id, ...args } = q.expected.query;
    const r = await runTool(deps, 'electorates', args);
    assert.equal(r.ok, true, q.id);
    assert.deepEqual(r.data.rows.map(({ name, jurisdiction, chamber, value, unit, url, source }) => ({ name, jurisdiction, chamber, value, unit, url, source })), q.expected.rows, q.id);
    assert.equal(r.data.matched, q.expected.matched, q.id);
    assert.equal(r.data.available, q.expected.available, q.id);
    assert.equal(r.data.unanswerable, q.expected.unanswerable, q.id);
    assert.equal(score(q, q.expected.answer, !q.expected.unanswerable).pass, true, q.id);
    if (!q.expected.unanswerable) assert.equal(score(q, 'A made-up answer with 999 AUD/week (2021 Census (ABS)).', true).pass, false, q.id);
    const out = await runAgentic(q.question, { ...deps, generate: async (_question, prompt) => /Plan the record/.test(prompt.user)
      ? { text: JSON.stringify({ shape: 'ranking', steps: [{ tool: 'electorates', args }] }) }
      : { text: `${q.expected.answer} [1]` } });
    assert.equal(score(q, out.answer, out.answered).pass, true, `${q.id} orchestration`);
    saved.push({ id: q.id, payload: out });
    if (q.expected.unanswerable) {
      assert.equal(score(q, 'No published Census figures, but Sample Bay has $500 per week.', true).pass, false);
      assert.equal(out.answered, false, q.id);
      assert.equal(out.reason, 'no_supported_claim', q.id);
      assert.match(out.notes.join(' '), /No published 2021 Census \(ABS\)/);
    } else {
      assert.equal(out.facts[0].value, q.expected.rows[0].value, q.id);
      assert.equal(out.facts[0].url, q.expected.rows[0].url, q.id);
    }
  }
  const scored = await runGold({ questions: cases, fixture: saved, fetchImpl: () => { throw Error('Gold fixtures must stay offline'); } });
  assert.equal(scored.passed, 4);
});


test('an electorate name cannot be reinterpreted as an MP or bill scope', async () => {
  const requested = [];
  const deps = stub();
  const run = await runAgentic('What is the median income in Alpine?', {
    ...deps,
    asset: async (path) => {
      requested.push(path);
      if (path === '/parliamentarians.json') return { people: [{ name: 'Alpine', party: 'Greens' }] };
      if (path === '/bills/index.json') return { bills: [{ key: 'alpine', title: 'Alpine Bill' }] };
      return deps.asset(path);
    },
    generate: async () => { throw new Error('Census lookup must not generate'); },
  });
  assert.equal(run.answered, true);
  assert.equal(run.facts[0].value, 500);
  assert.ok(requested.every((path) => path.startsWith('/electorates/')));
});
