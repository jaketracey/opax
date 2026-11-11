import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {newest, billRowHTML, billsSourceHTML, LATEST_BILLS, NEWEST_BILLS_PATH, newestBillsFile, latestBillsSource} from '../public/home-data.js';

// The home page's "new bills" block read /bills/index.json (1.8 MB) for three rows and its date
// (12 Nov 2026). The release build keeps them in /growth/newest-bills.json; the block draws the
// same rows and source line from either.
const pub = new URL('../public/', import.meta.url);
const draw = index => ({rows: newest(index.bills,'introduced',LATEST_BILLS).map(billRowHTML).join(''), source: billsSourceHTML(index, null)});

test('newest bills: the newest rows and the index date, with the fields a row reads', () => {
  const index = {generated_at: '2026-11-11', count: 4, bills: [
    {key: 'a', title: 'A Bill', status: 'passed', introduced: '2026-01-02', jurisdiction: 'federal', divisions: [1], sponsor: 'X'},
    {key: 'b', title: 'B Bill', short_title: 'B', status: 'before_parliament', introduced: '2026-03-04', jurisdiction: 'nsw', portfolio: 'Health'},
    {key: 'c', title: 'C Bill', status: 'lapsed'},
    {key: 'd', title: 'D Bill', status: 'exposure_draft', introduced: '2026-03-04', jurisdiction: 'federal'},
    {key: 'e', title: 'E Bill', status: 'passed', introduced: '2025-12-31', jurisdiction: 'federal'},
  ]};
  const file = newestBillsFile(index);
  assert.equal(NEWEST_BILLS_PATH, '/growth/newest-bills.json');
  assert.deepEqual(file, {generated_at: '2026-11-11', bills: [
    {key: 'b', title: 'B Bill', short_title: 'B', status: 'before_parliament', introduced: '2026-03-04', jurisdiction: 'nsw', portfolio: 'Health'},
    {key: 'd', title: 'D Bill', status: 'exposure_draft', introduced: '2026-03-04', jurisdiction: 'federal'},
    {key: 'a', title: 'A Bill', status: 'passed', introduced: '2026-01-02', jurisdiction: 'federal'},
  ]});
  assert.deepEqual(draw(file), draw(index));
  assert.throws(() => newestBillsFile({}));
});

test('newest bills: the home block draws the same from the file as from the published index', {skip: !existsSync(new URL('bills/index.json', pub))}, () => {
  const index = JSON.parse(readFileSync(new URL('bills/index.json', pub), 'utf8'));
  const file = newestBillsFile(index);
  assert.equal(file.bills.length, LATEST_BILLS);
  assert.deepEqual(draw(JSON.parse(JSON.stringify(file))), draw(index));
  assert.ok(JSON.stringify(file).length < 4000);
});

test('newest bills: the home page reads the small file, the whole index when it is unreadable', async () => {
  const reader = served => { const asked = []; return {asked, read: async path => { asked.push(path); if (!(path in served)) throw Error('Data unavailable'); return served[path]; }}; };
  const small = {generated_at: 'g', bills: [{key: 's'}]}, whole = {generated_at: 'g', bills: [{key: 'w'}]};
  let r = reader({[NEWEST_BILLS_PATH]: small, '/bills/index.json': whole});
  assert.equal(await latestBillsSource(r.read), small);
  assert.deepEqual(r.asked, [NEWEST_BILLS_PATH]);
  r = reader({'/bills/index.json': whole});
  assert.equal(await latestBillsSource(r.read), whole);
  assert.deepEqual(r.asked, [NEWEST_BILLS_PATH, '/bills/index.json']);
  r = reader({[NEWEST_BILLS_PATH]: {bills: 'x'}, '/bills/index.json': whole});
  assert.equal(await latestBillsSource(r.read), whole, 'a malformed file is not used');
  r = reader({});
  await assert.rejects(latestBillsSource(r.read), 'neither readable: the block keeps its published rows');
});
