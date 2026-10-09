import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read = async file => JSON.parse(await readFile(new URL('../public/' + file, import.meta.url), 'utf8'));
const [expenses, photos, roster, app] = await Promise.all([
  read('expenses.json'), read('photos/people.json'), read('parliamentarians.json'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
]);
const source = app.match(/async function renderPersonExpenses\(name, personId, sections\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(source, 'the test exercises the person-page renderer');
// The block's source line is the shared SourceLine (the labels block in app.js).
const labels = app.slice(app.indexOf('const SOURCE_GLYPH'), app.indexOf('// labels:end'));
assert.ok(labels.includes('function sourceLineHTML'), 'the shared source line is in reach');

// The total is the block's figure on the "On this page" rail (it was a Quick facts row).
async function render(name, personId, data = expenses, photoMap = photos, overrides = {}) {
  const result = {section: '', figure: ''};
  const context = {
    currentSubjectKey: 'person:' + name, expensesData: data, photoMap,
    loadExpenses: async () => {}, loadPhotoMap: async () => {}, loadExpenseDefs: async () => {},
    getExpenseBenchmarks: () => null, safeUrl: url => url, esc: value => String(value), fmtDate: value => String(value),
    fmtMoney: value => '$' + value, columnChart: rows => JSON.stringify(rows), IPEA_NOTE: '',
    $: () => null,
    ...overrides,
  };
  runInNewContext(labels + source, context);
  await context.renderPersonExpenses(name, personId, {insertAdjacentHTML: (_, html) => { result.section += html; }});
  result.figure = result.section.match(/data-rail-figure="([^"]*)"/)?.[1] || '';
  return result;
}

test('an id with no expense record falls back to the IPEA name index', async () => {
  const data = {people: {'123': {total: 456, lines: 1, from: 2025, to: 2025}}, names: {'test member': '123'}};
  for (const portrait of ['wd-Q1', 'missing-portrait', '999', null]) {
    const result = await render('Test Member', portrait, data, {'test member': portrait});
    assert.match(result.section, /Parliamentary expenses/);
    assert.equal(result.figure, '$456');
  }
});

test('every roster person gets the record of their verified pid, else their name, never a portrait\'s', async () => {
  const pids = new Map(roster.people.map(p => [p.name.trim().toLowerCase(), p.pid ?? null]));
  const names = new Set([...pids.keys(), ...Object.keys(expenses.names)]);
  for (const key of names) {
    const expected = expenses.people[pids.get(key)] || expenses.people[expenses.names[key]];
    const result = await render(key, pids.get(key) ?? null);
    if (expected) {
      assert.match(result.section, /Parliamentary expenses/, key);
      assert.equal(result.figure, '$' + expected.total, key);
    } else assert.deepEqual(result, {section: '', figure: ''}, key);
  }
});

test('a print once on another member\'s portrait shows its own expenses (Patrick Conaghan, not Rex Patrick)', async () => {
  const pat = expenses.people['10922'];
  assert.ok(pat, 'Pat Conaghan has an IPEA record');
  for (const portrait of [{'patrick conaghan': '10903'}, photos]) {
    const result = await render('Patrick Conaghan', '10922', expenses, portrait);
    assert.equal(result.figure, '$' + pat.total, 'his own total');
    assert.notEqual(result.figure, '$' + expenses.people['10903'].total, 'not Rex Patrick\'s');
  }
  // A print the roster gives no pid (it holds more than one person) gets no single person's record.
  assert.deepEqual(await render('Cox', null), {section: '', figure: ''});
});

test('a valid explicit ID retains priority; otherwise the name index decides and a portrait key never does', async () => {
  const data = {people: {'1': {total: 100, lines: 1, from: 2025, to: 2025}, '2': {total: 200, lines: 1, from: 2025, to: 2025}}, names: {'test member': '2'}};
  assert.match((await render('Test Member', '1', data, {'test member': '2'})).figure, /^\$100$/);
  assert.match((await render('Test Member', 'stale', data, {'test member': '1'})).figure, /^\$200$/);
  assert.match((await render('  Test Member  ', 'stale', data, {'test member': 'wd-Q1'})).figure, /^\$200$/);
  assert.match((await render('Test Member', null, data, {})).figure, /^\$200$/);
  assert.deepEqual(await render('Unlisted Member', null, data, {}), {section: '', figure: ''});
});

test('the source line states the licence expenses.json publishes, linked to its deed', async () => {
  // CC BY 3.0 AU is the data.gov.au datasets' licence; the CC BY 4.0 notice on ipea.gov.au covers the website.
  const [name] = Object.keys(expenses.names);
  const benchmark = {count: 300, latestYear: 2026, fromCutoff: 2024, latestQuarter: '2026Q02', totalMedian: 1};
  for (const overrides of [{}, {getExpenseBenchmarks: () => benchmark, expenseComparisonHTML: () => ''}]) {
    const {section} = await render(name, null, expenses, photos, overrides);
    assert.ok(section.includes('<a href="https://creativecommons.org/licenses/by/3.0/au/" rel="license noopener" target="_blank">CC BY 3.0 AU ↗︎</a>'), section);
    assert.doesNotMatch(section, /CC BY 4\.0/);
  }
  const data = {meta: {}, people: {'1': {total: 100, lines: 1, from: 2025, to: 2025}}, names: {'test member': '1'}};
  assert.doesNotMatch((await render('Test Member', null, data, {})).section, /CC BY|undefined/);
});
