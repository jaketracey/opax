import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {DIVISION_BILLS_PATH, divisionBillsFile} from '../public/bill-titles.js';

// A party page's "Bills they divided on" read /bills/index.json (1.8 MB) to pick the newest bills
// with divisions (12 Nov 2026). The release build keeps those bills, with the fields the pick
// sorts by, in /growth/division-bills.json; the pick is the same from either.
const pub = new URL('../public/', import.meta.url);
const app = readFileSync(new URL('app.js', pub), 'utf8');
// The party page's own pick, taken from app.js as written.
const pickSource = /const candidates = (idx\.bills\.filter[\s\S]*?\.slice\(0, PARTY_BILLS_SCAN\));/.exec(app)[1];
const scan = Number(/const PARTY_BILLS_SCAN = (\d+);/.exec(app)[1]);
const pick = (idx, n = scan) => new Function('idx', 'PARTY_BILLS_SCAN', `return ${pickSource}`)(idx, n).map(b => b.key);

test('division bills: the bills with divisions, in index order, with the fields the pick reads', () => {
  assert.equal(DIVISION_BILLS_PATH, '/growth/division-bills.json');
  const index = {generated_at: 'g', bills: [
    {key: 'a', divisions: 2, status_as_of: '2026-01-01', introduced: '2025-01-01', title: 'A', speeches: [1]},
    {key: 'b', divisions: 0, status_as_of: '2026-05-01'},
    {key: 'c', divisions: 1, introduced: '2026-01-01'},
    {key: 'd', title: 'D'},
    {key: 'e', divisions: 3, status_as_of: '2026-01-01'},
  ]};
  assert.deepEqual(divisionBillsFile(index), {generated_at: 'g', bills: [
    {key: 'a', divisions: 2, status_as_of: '2026-01-01', introduced: '2025-01-01'},
    {key: 'c', divisions: 1, introduced: '2026-01-01'},
    {key: 'e', divisions: 3, status_as_of: '2026-01-01'},
  ]});
  for (const n of [1, 2, 3, 10]) assert.deepEqual(pick(divisionBillsFile(index), n), pick(index, n), `ties keep index order (${n})`);
  assert.throws(() => divisionBillsFile({}));
});

test('division bills: a party page picks the same bills from the file as from the published index', {skip: !existsSync(new URL('bills/index.json', pub))}, () => {
  const index = JSON.parse(readFileSync(new URL('bills/index.json', pub), 'utf8'));
  const file = JSON.parse(JSON.stringify(divisionBillsFile(index)));
  assert.ok(pick(index).length > 0);
  for (const n of [scan, 1, 32, 1e9]) assert.deepEqual(pick(file, n), pick(index, n));
  assert.ok(JSON.stringify(file).length < JSON.stringify(index).length / 10);
});

test('division bills: the app reads the file for a party page, the whole index without it or once loaded', async () => {
  const {default: ts} = await import('typescript');
  const {runInNewContext} = await import('node:vm');
  const sf = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const want = new Set(['billsIndexPromise', 'loadBillsIndex', 'divisionBillsPromise', 'loadDivisionBills']);
  const code = sf.statements.filter(n => ts.isFunctionDeclaration(n) ? want.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => want.has(d.name.getText(sf)))).map(n => n.getText(sf)).join('\n');
  const load = missing => {
    const fetched = [];
    const ctx = {fetch: async path => { fetched.push(path); return missing.has(path) ? new Response('x', {status: 404}) : new Response(JSON.stringify({bills: [{key: path}]})); }};
    runInNewContext(code + '\nthis.api = {loadBillsIndex, loadDivisionBills};', ctx);
    return {...ctx.api, fetched};
  };
  const a = load(new Set());
  assert.deepEqual((await a.loadDivisionBills()).bills, [{key: '/growth/division-bills.json'}]);
  await a.loadDivisionBills();
  assert.deepEqual(a.fetched, ['/growth/division-bills.json']);
  await a.loadBillsIndex();
  assert.deepEqual((await a.loadDivisionBills()).bills, [{key: '/bills/index.json'}], 'the whole index once it is loaded');
  const b = load(new Set(['/growth/division-bills.json']));
  assert.deepEqual((await b.loadDivisionBills()).bills, [{key: '/bills/index.json'}]);
  assert.deepEqual(b.fetched, ['/growth/division-bills.json', '/bills/index.json']);
});
