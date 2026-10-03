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

async function render(name, personId, data = expenses, photoMap = photos) {
  const result = {section: '', infobox: ''};
  const context = {
    currentSubjectKey: 'person:' + name, expensesData: data, photoMap,
    loadExpenses: async () => {}, loadPhotoMap: async () => {}, loadExpenseDefs: async () => {},
    getExpenseBenchmarks: () => null, safeUrl: url => url, esc: value => String(value),
    fmtMoney: value => '$' + value, columnChart: rows => JSON.stringify(rows), IPEA_NOTE: '',
    $: () => ({querySelector: () => ({insertAdjacentHTML: (_, html) => { result.infobox += html; }})}),
  };
  runInNewContext(source, context);
  await context.renderPersonExpenses(name, personId, {insertAdjacentHTML: (_, html) => { result.section += html; }});
  return result;
}

const affected = ['Ali France', 'Basem Abdo', 'Charlotte Walker', 'Jo Briskey', 'Jodie Belyea',
  'Leon Rebello', 'Mehreen Faruqi', 'Nicolette Boele', 'Sarah Witty'];

test('Commons portraits fall back to the IPEA name index on all nine person pages', async () => {
  for (const name of affected) {
    const key = name.toLowerCase(), id = expenses.names[key];
    assert.match(photos[key], /^wd-/);
    const result = await render(name, photos[key]);
    assert.match(result.section, /Parliamentary expenses/, name);
    assert.ok(result.infobox.includes('$' + expenses.people[id].total), name);
  }
});

test('only the nine missing joins change across the entire roster and sitting members’ full names', async () => {
  const names = new Set(roster.people.flatMap(p => [p.name, ...(p.current && p.full ? [p.full] : [])]));
  const changed = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    const oldId = photos[key] || expenses.names[key];
    const oldRecord = expenses.people[oldId];
    const result = await render(name, photos[key]);
    if (oldRecord) assert.ok(result.infobox.includes('$' + oldRecord.total), name);
    else if (result.section) changed.push(name);
    else assert.equal(result.infobox, '', name);
  }
  assert.deepEqual(changed.sort(), affected);
});

test('a valid explicit ID retains priority, while stale IDs and missing portraits allow name lookup', async () => {
  const data = {people: {'1': {total: 100, lines: 1, from: 2025, to: 2025}, '2': {total: 200, lines: 1, from: 2025, to: 2025}}, names: {'test member': '2'}};
  assert.match((await render('Test Member', '1', data, {'test member': '2'})).infobox, /\$100/);
  assert.match((await render('  Test Member  ', 'stale', data, {'test member': 'wd-Q1'})).infobox, /\$200/);
  assert.match((await render('Test Member', null, data, {})).infobox, /\$200/);
  assert.deepEqual(await render('Unlisted Member', null, data, {}), {section: '', infobox: ''});
});
