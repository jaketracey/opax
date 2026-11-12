import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveProgram, programKey} from '../public/facts/grant-programs.js';
import {withBillDivisions} from '../public/facts/bill-divisions.js';
import {renderBillAnswer} from '../src/seo-content.ts';

const pub = new URL('../public/', import.meta.url);
const read = async path => JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8'));
const audit = JSON.parse(readFileSync(new URL('fixtures/portal-facts.json', import.meta.url)));
const catalogue = await read('/graph/grants.federal.json');

test('all 24 audit program URLs resolve to their own file, award count and total', async () => {
  assert.equal(audit.programs.length, 24);
  for (const expected of audit.programs) {
    for (const id of [expected.id, expected.key]) {
      const row = resolveProgram(catalogue.programs, id);
      assert.equal(row?.id, expected.id, id);
      assert.equal(row.key, expected.key, id);
      const file = await read(`/grants/federal/programs/${row.key}.json`);
      assert.equal(file.id, expected.id);
      assert.equal(file.t, expected.total);
      assert.equal(file.c, expected.awards);
    }
  }
});

test('case and truncated collisions stay distinct; unknown full IDs cannot borrow a key', async () => {
  const pair = catalogue.programs.filter(p => p.id.toLowerCase() === 'activity:performance of native title representative body functions');
  assert.equal(pair.length, 2);
  assert.notEqual(pair[0].key, pair[1].key);
  for (const row of pair) assert.equal(resolveProgram(pair, row.id), row);
  const files = await Promise.all(pair.map(row => read(`/grants/federal/programs/${row.key}.json`)));
  assert.deepEqual(files.map(p => [p.t,p.c]).sort((a,b)=>a[0]-b[0]), [[88201000,6],[145674336,8]]);
  assert.equal(resolveProgram(pair, pair[0].id.toUpperCase()), null);
  const long = audit.programs[0];
  assert.equal(programKey(long.id + ' unknown suffix'), programKey(long.id));
  assert.equal(resolveProgram(catalogue.programs, long.id + ' unknown suffix'), null);
  assert.equal(resolveProgram(catalogue.programs, 'GO-unknown-program'), null);
});

test('all eight audit divisions use standalone totals and outcomes, even with stale embedded values', async () => {
  assert.equal(audit.divisions.length, 8);
  for (const expected of audit.divisions) {
    const bill = await read(`/bills/${expected.bill}.json`);
    const stale = {...bill, divisions: bill.divisions.map(d => ({...d, ayes: 999, noes: 999, outcome: 'stale'}))};
    const joined = await withBillDivisions(stale, read);
    const division = joined.divisions.find(d => d.key === expected.key);
    const source = await read(`/divisions/division-${expected.key}.json`);
    assert.equal(division.ayes, expected.ayes);
    assert.equal(division.noes, expected.noes);
    assert.equal(division.outcome, source.result);
    assert.equal(division.stage, stale.divisions.find(d => d.key === expected.key).stage);
    assert.doesNotMatch(renderBillAnswer(joined, [], new Map()).html, />999</);
  }
});

test('a missing or mismatched standalone division cannot reuse embedded totals', async () => {
  const bill = {divisions: [{key: 'example', ayes: 99, noes: 1}]};
  await assert.rejects(withBillDivisions(bill, async () => null), /identity mismatch/);
  await assert.rejects(withBillDivisions(bill, async () => ({key:'another'})), /identity mismatch/);
  await assert.rejects(withBillDivisions(bill, async () => {throw Error('unavailable');}), /unavailable/);
  const unknownTotals = await withBillDivisions(bill, async () => ({key:'example'}));
  assert.equal(unknownTotals.divisions[0].ayes, undefined);
  assert.equal(unknownTotals.divisions[0].noes, undefined);
});

test('every bill with embedded divisions agrees with the standalone source', async () => {
  const index = await read('/bills/index.json');
  let bills = 0, divisions = 0;
  for (const row of index.bills.filter(b => b.divisions)) {
    const bill = await read(`/bills/${row.key}.json`);
    const joined = await withBillDivisions(bill, read);
    bills++;
    for (const [i, embedded] of bill.divisions.entries()) {
      const canonical = joined.divisions[i];
      for (const field of ['ayes', 'noes', 'outcome']) assert.equal(embedded[field], canonical[field], `${row.key}/${embedded.key}/${field}`);
      divisions++;
    }
  }
  assert.ok(bills > 0 && divisions > 0);
});

test('audited party labels are canonical in index and detail; renderers reject dirty labels', async () => {
  const index = await read('/bills/index.json');
  const allowed = await read('/facts/sponsor-parties.json');
  for (const expected of audit.parties) {
    const row = index.bills.find(b => b.key === expected.key);
    const bill = await read(`/bills/${expected.key}.json`);
    assert.equal(bill.sponsor_party, row.sponsor_party, expected.key);
    assert.ok(!bill.sponsor_party || allowed.includes(bill.sponsor_party), expected.key);
    if (expected.canonical) assert.equal(bill.sponsor_party, expected.canonical, expected.key);
  }
  for (const party of ['xx', 'monarchist', 'Australia&#39;s Voice']) {
    const html = renderBillAnswer({key:'example', title:'Example bill', sponsor_party:party}, [], new Map()).html;
    assert.doesNotMatch(html, /Sponsor's recorded party/);
  }
});
