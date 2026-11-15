import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {personIndex} from '../src/person-slug.ts';
import {BILL_TITLES_PATH, billTitlesFile, BILLS_DATE_PATH, billsDateFile} from '../public/bill-titles.js';

// A server-rendered profile parsed /bills/index.json (1.8 MB) for four fields: each bill's key,
// title, aliases and jurisdiction (12 Nov 2026). The release build keeps them in
// /growth/bill-titles.json; with or without it, a profile renders the same.
const pub = new URL('../public/', import.meta.url);
const parsed = new Map();
const readFile = path => { if (!parsed.has(path)) parsed.set(path, JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8'))); return parsed.get(path); };

test('bill titles: the eight fields in index order, nothing else', () => {
  const index = {generated_at: '2026-11-11', bills: [{key: 'au-federal-r1', title: 'A Bill', short_title: 'A', status: 'passed', status_as_of: '2026-11-01', has_summary: true, jurisdiction: 'federal', divisions: [1]}, {key: 'au-nsw-2', title: null, aliases: ['Other Bill'], jurisdiction: 'nsw', sponsor: 'X', has_summary: false}]};
  assert.deepEqual(billTitlesFile(index), {generated_at: '2026-11-11', bills: [{key: 'au-federal-r1', title: 'A Bill', short_title: 'A', jurisdiction: 'federal', status: 'passed', status_as_of: '2026-11-01', has_summary: true}, {key: 'au-nsw-2', title: null, aliases: ['Other Bill'], jurisdiction: 'nsw', has_summary: false}]});
  assert.deepEqual(Object.keys(billTitlesFile(index).bills[0]), ['key', 'title', 'short_title', 'jurisdiction', 'status', 'status_as_of', 'has_summary']);
  assert.throws(() => billTitlesFile({}));
  // A dead bill's exact ending travels to speech pages next to its dated status.
  const dead = billTitlesFile({generated_at: 'x', bills: [{key: 'k', title: 'T', status: 'lapsed', status_as_of: '2018-06-26', ended: 'removed', ended_label: 'Removed from the Notice Paper', has_summary: false}]}).bills[0];
  assert.deepEqual(Object.keys(dead), ['key', 'title', 'status', 'status_as_of', 'ended_label', 'has_summary']);
});

test('bill titles: profiles render the same from the titles file as from the whole index', {skip: !existsSync(new URL(BILL_TITLES_PATH.slice(1), pub))}, async () => {
  const people = readFile('/parliamentarians.json').people;
  const {slugOf} = personIndex(people);
  const sample = people.filter((p, i) => p.current || i % 25 === 0).slice(0, 60);
  assert.ok(sample.length >= 30);
  for (const p of sample) {
    const reads = [];
    const withTitles = path => { reads.push(path); return Promise.resolve().then(() => readFile(path)); };
    const withoutTitles = path => path === BILL_TITLES_PATH ? Promise.reject(new Error('missing')) : Promise.resolve().then(() => readFile(path));
    const a = (await renderPersonAnswer(p, withTitles, slugOf)).html;
    const b = (await renderPersonAnswer(p, withoutTitles, slugOf)).html;
    assert.equal(a, b, p.name);
    assert.ok(reads.includes(BILL_TITLES_PATH));
    assert.ok(!reads.includes('/bills/index.json'), p.name);
  }
});

test('bill titles: the app profile draws the same vote rows and questions from them as from the whole index', {skip: !['/votes.json', '/seo/recent-votes.json'].every(p => existsSync(new URL(p.slice(1), pub)))}, async () => {
  const {votingRows, personVoteKeys, personVoteRecords} = await import('../public/vote-tables.js');
  const {personQuestions, latestBillVotes} = await import('../public/growth-modules.js');
  const index = readFile('/bills/index.json');
  const [whole, titles] = [index.bills, billTitlesFile(index).bills];
  const votes = readFile('/votes.json'), recent = readFile('/seo/recent-votes.json');
  let compared = 0;
  for (const p of readFile('/parliamentarians.json').people) {
    const keys = personVoteKeys(p.name, p.pid ?? null, votes);
    if (!keys.length) continue;
    // As app.js renderPersonVotes builds them.
    const records = keys.map(k => votes[k]).filter(r => r && typeof r === 'object');
    const all = records.flatMap(r => ['for', 'against'].flatMap(field => (r[field] || []).map(d => ({...d, jur: d.jur || r.jurisdiction, vote: field === 'for' ? 'For the bill' : 'Against the bill'}))));
    const latest = latestBillVotes(all);
    assert.deepEqual(personQuestions({name: p.name, votes: latest, bills: titles}), personQuestions({name: p.name, votes: latest, bills: whole}), p.name);
    const rows = personVoteRecords(keys, votes, recent).rows;
    assert.deepEqual(votingRows(rows, titles), votingRows(rows, whole), p.name);
    compared++;
  }
  assert.ok(compared > 100, `compared ${compared}`);
});

test('bill titles: the app loads the titles file for a profile, the whole index without it or once loaded', async () => {
  const {default: ts} = await import('typescript');
  const {runInNewContext} = await import('node:vm');
  const src = readFileSync(new URL('app.js', pub), 'utf8');
  const sf = ts.createSourceFile('app.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const want = new Set(['billsIndexPromise', 'loadBillsIndex', 'billTitlesPromise', 'loadBillTitles']);
  const code = sf.statements.filter(n => ts.isFunctionDeclaration(n) ? want.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => want.has(d.name.getText(sf)))).map(n => n.getText(sf)).join('\n');
  const app = missing => {
    const fetched = [];
    const ctx = {fetch: async path => { fetched.push(path); return missing.has(path) ? new Response('x', {status: 404}) : new Response(JSON.stringify({bills: [{key: path}]})); }};
    runInNewContext(code + '\nthis.api = {loadBillsIndex, loadBillTitles};', ctx);
    return {...ctx.api, fetched};
  };
  const a = app(new Set());
  assert.deepEqual((await a.loadBillTitles()).bills, [{key: '/growth/bill-titles.json'}]);
  assert.deepEqual(a.fetched, ['/growth/bill-titles.json']);
  await a.loadBillsIndex();
  assert.deepEqual((await a.loadBillTitles()).bills, [{key: '/bills/index.json'}], 'the whole index once it is loaded');
  const b = app(new Set(['/growth/bill-titles.json']));
  assert.deepEqual((await b.loadBillTitles()).bills, [{key: '/bills/index.json'}]);
  assert.deepEqual(b.fetched, ['/growth/bill-titles.json', '/bills/index.json']);
});

// A bill page read the whole index (1.8 MB, 142 KB compressed) for one field, its generated_at.
test('bills date: the index date and nothing else', () => {
  assert.equal(BILLS_DATE_PATH, '/growth/bills-date.json');
  assert.deepEqual(billsDateFile({generated_at: '2026-11-11T19:00:00+00:00', count: 2, bills: [{key: 'a'}]}), {generated_at: '2026-11-11T19:00:00+00:00'});
  assert.throws(() => billsDateFile({bills: []}));
  if (existsSync(new URL('bills/index.json', pub))) assert.deepEqual(billsDateFile(readFile('/bills/index.json')), {generated_at: readFile('/bills/index.json').generated_at});
});

test('bills date: the app reads the date file for a bill page, the whole index without it or once loaded', async () => {
  const {default: ts} = await import('typescript');
  const {runInNewContext} = await import('node:vm');
  const src = readFileSync(new URL('app.js', pub), 'utf8');
  const sf = ts.createSourceFile('app.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const want = new Set(['billsIndexPromise', 'loadBillsIndex', 'billsDatePromise', 'loadBillsDate']);
  const code = sf.statements.filter(n => ts.isFunctionDeclaration(n) ? want.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => want.has(d.name.getText(sf)))).map(n => n.getText(sf)).join('\n');
  const app = (missing, dates = {}) => {
    const fetched = [];
    const ctx = {fetch: async path => { fetched.push(path); return missing.has(path) ? new Response('x', {status: 404}) : new Response(JSON.stringify({generated_at: dates[path] ?? path, bills: []})); }};
    runInNewContext(code + '\nthis.api = {loadBillsIndex, loadBillsDate};', ctx);
    return {...ctx.api, fetched};
  };
  const a = app(new Set());
  assert.equal(await a.loadBillsDate(), '/growth/bills-date.json');
  assert.equal(await a.loadBillsDate(), '/growth/bills-date.json');
  assert.deepEqual(a.fetched, ['/growth/bills-date.json'], 'one small request, kept');
  await a.loadBillsIndex();
  assert.equal(await a.loadBillsDate(), '/bills/index.json', 'the loaded index date');
  const b = app(new Set(['/growth/bills-date.json']));
  assert.equal(await b.loadBillsDate(), '/bills/index.json');
  assert.deepEqual(b.fetched, ['/growth/bills-date.json', '/bills/index.json']);
  const c = app(new Set(['/growth/bills-date.json', '/bills/index.json']));
  assert.equal(await c.loadBillsDate(), '', 'no date when neither loads');
  assert.equal(await c.loadBillsDate(), '');
  assert.equal(c.fetched.length, 4, 'a failure is not kept');
});

// A speech page matched its debate to a bill through the whole index (renderDocBillPanel). Every
// title and alias the lookup can match finds the same bill, with the same status and summary flag,
// in the titles file.
test('bill titles: a speech page finds the same bill, status and summary flag from them as from the whole index', {skip: !existsSync(new URL('bills/index.json', pub))}, async () => {
  const {default: ts} = await import('typescript');
  const {runInNewContext} = await import('node:vm');
  const src = readFileSync(new URL('app.js', pub), 'utf8');
  const sf = ts.createSourceFile('app.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const want = new Set(['titleKey', 'billsIndexPromise', 'loadBillsIndex', 'billTitlesPromise', 'loadBillTitles', 'billsTitleIndex', 'billTitleIndex', 'billForTitle']);
  const code = sf.statements.filter(n => ts.isFunctionDeclaration(n) ? want.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => want.has(d.name.getText(sf)))).map(n => n.getText(sf)).join('\n');
  const index = readFile('/bills/index.json');
  const lookup = served => {
    const fetched = [];
    const ctx = {fetch: async path => { fetched.push(path); return new Response(JSON.stringify(served[path] ?? null), {status: served[path] ? 200 : 404}); }};
    runInNewContext(code + '\nthis.api = {billTitleIndex, billForTitle};', ctx);
    return {...ctx.api, fetched};
  };
  const fromTitles = lookup({'/growth/bill-titles.json': billTitlesFile(index)});
  const fromIndex = lookup({'/bills/index.json': index});
  const a = await fromTitles.billTitleIndex(), b = await fromIndex.billTitleIndex();
  assert.deepEqual(fromTitles.fetched, ['/growth/bill-titles.json']);
  assert.deepEqual(fromIndex.fetched, ['/growth/bill-titles.json', '/bills/index.json']);
  assert.deepEqual([...a.keys()], [...b.keys()]);
  assert.ok(a.size > 1000);
  const fields = ['key', 'title', 'short_title', 'aliases', 'jurisdiction', 'status', 'status_as_of', 'has_summary'];
  const pick = e => Object.fromEntries(fields.map(k => [k, e[k]]));
  for (const [k, e] of b) assert.deepEqual(pick(a.get(k)), pick(e), k);
  const some = index.bills.find(x => x.has_summary && x.status_as_of);
  assert.equal((await fromTitles.billForTitle(` ${some.title.toUpperCase()} `))?.key, (await fromIndex.billForTitle(some.title))?.key);
});
