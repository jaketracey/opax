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
// The block's source line is the shared SourceLine (labels.js), as app.js calls it.
const uiLabels = await import('../public/labels.js');

// The total is the block's figure on the "On this page" rail (it was a Quick facts row).
async function render(name, personId, data = expenses, photoMap = photos, overrides = {}) {
  const result = {section: '', figure: ''};
  const context = {
    currentSubjectKey: 'person:' + name, expensesData: data, photoMap,
    loadExpenses: async () => {}, loadPhotoMap: async () => {}, loadExpenseDefs: async () => {},
    getExpenseBenchmarks: () => null, safeUrl: url => url, esc: value => String(value), fmtDate: value => String(value), quarterEnd: value => String(value),
    fmtMoney: value => '$' + value, columnChart: rows => JSON.stringify(rows), IPEA_NOTE: '',
    $: () => null, sourceLineHTML: uiLabels.sourceLineHTML,
    ...overrides,
  };
  runInNewContext(source, context);
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
      // a net repayment is not a claimed figure, so it is not the rail figure either
      assert.equal(result.figure, expected.total > 0 ? '$' + expected.total : '', key);
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

test('a total of zero or less reads as IPEA adjustments and repayments, never as an amount claimed', async () => {
  // Joe Hockey: one 2017Q02 line of -645 (IPEA's series starts after he left); Natasha Griggs nets to 0
  const benchmark = {count: 300, latestYear: 2026, fromCutoff: 2023, latestQuarter: '2026Q02', totalMedian: 1};
  for (const [total, lines] of [[-645, 1], [0, 4]]) {
    const data = {meta: {}, people: {'1': {total, lines, from: 2017, to: 2017, by_category: [], net_adjustments: total || undefined,
      by_year: [[2017, total]]}}, names: {'test member': '1'}};
    const {section, figure} = await render('Test Member', '1', data, {}, {getExpenseBenchmarks: () => benchmark,
      expenseComparisonHTML: () => 'BARS', columnChart: () => 'CHART'});
    assert.match(section, /IPEA publishes only adjustments and repayments for this person in 2017/);
    assert.ok(section.includes('netting to <b>$' + total + '</b>'), section);
    assert.doesNotMatch(section, /claimed|a year against|BARS|CHART/);
    assert.equal(figure, '');
  }
});

test('categories that net below zero are explained beside the bars, not drawn as one', async () => {
  const data = {meta: {}, people: {'1': {total: 14480101, lines: 9, from: 2017, to: 2026,
    by_category: [['Office', 14489407]], net_adjustments: -9306}}, names: {'test member': '1'}};
  const {section, figure} = await render('Test Member', '1', data, {});
  assert.match(section, /claimed, 2017 to 2026/);
  assert.ok(section.includes('The total includes $-9306 of IPEA adjustments and repayments in categories that net below zero'), section);
  assert.equal(figure, '$14480101');
});
