import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read = async file => JSON.parse(await readFile(new URL('../public/' + file, import.meta.url), 'utf8'));
const [expenses, photos, app] = await Promise.all([
  read('expenses.json'), read('photos/people.json'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
]);
const source = app.match(/async function renderPersonExpenses\(name, personId, sections\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(source, 'the test exercises the person-page renderer');

async function render(name, personId, data = expenses, photoMap = photos, overrides = {}) {
  const result = {section: '', infobox: ''};
  const context = {
    currentSubjectKey: 'person:' + name, expensesData: data, photoMap,
    loadExpenses: async () => {}, loadPhotoMap: async () => {}, loadExpenseDefs: async () => {},
    getExpenseBenchmarks: () => null, safeUrl: url => url, esc: value => String(value),
    fmtMoney: value => '$' + value, columnChart: rows => JSON.stringify(rows), IPEA_NOTE: '',
    $: () => ({querySelector: () => ({insertAdjacentHTML: (_, html) => { result.infobox += html; }})}),
    ...overrides,
  };
  runInNewContext(source, context);
  await context.renderPersonExpenses(name, personId, {insertAdjacentHTML: (_, html) => { result.section += html; }});
  return result;
}

test('unmatched portrait keys fall back to the legacy IPEA ID', async () => {
  const data = {people: {'123': {total: 456, lines: 1, from: 2025, to: 2025}}, names: {'test member': '123'}};
  for (const portrait of ['wd-Q1', 'missing-portrait', '999', null]) {
    const result = await render('Test Member', portrait, data, {'test member': portrait});
    assert.match(result.section, /Parliamentary expenses/);
    assert.match(result.infobox, /\$456/);
  }
});

test('published portrait records retain their amounts and all available name fallbacks resolve after a refresh', async () => {
  const names = new Set([...Object.keys(photos), ...Object.keys(expenses.names)]);
  for (const name of names) {
    const key = name.trim().toLowerCase();
    const portraitRecord = expenses.people[photos[key]];
    const nameRecord = expenses.people[expenses.names[key]];
    const result = await render(name, photos[key]);
    if (portraitRecord || nameRecord) {
      assert.match(result.section, /Parliamentary expenses/, name);
      assert.ok(result.infobox.includes('$' + (portraitRecord || nameRecord).total), name);
    } else assert.deepEqual(result, {section: '', infobox: ''}, name);
  }
});

test('a valid explicit ID retains priority, while stale IDs and missing portraits allow name lookup', async () => {
  const data = {people: {'1': {total: 100, lines: 1, from: 2025, to: 2025}, '2': {total: 200, lines: 1, from: 2025, to: 2025}}, names: {'test member': '2'}};
  assert.match((await render('Test Member', '1', data, {'test member': '2'})).infobox, /\$100/);
  assert.match((await render('Test Member', 'stale', data, {'test member': '1'})).infobox, /\$100/);
  assert.match((await render('  Test Member  ', 'stale', data, {'test member': 'wd-Q1'})).infobox, /\$200/);
  assert.match((await render('Test Member', null, data, {})).infobox, /\$200/);
  assert.deepEqual(await render('Unlisted Member', null, data, {}), {section: '', infobox: ''});
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
