import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveProgram, programKey} from '../public/facts/grant-programs.js';
import {runInNewContext} from 'node:vm';
import {programRecord} from '../../scripts/build_search_catalog.mjs';
import {renderBillAnswer} from '../src/seo-content.ts';

const pub = new URL('../public/', import.meta.url);
const read = async path => JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8'));
const audit = JSON.parse(readFileSync(new URL('fixtures/portal-facts.json', import.meta.url)));
const sponsorDecisions = JSON.parse(readFileSync(new URL('fixtures/dated-sponsor-parties.json', import.meta.url)));
const datedSponsors = sponsorDecisions.rows;
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

test('search program slugs retain the catalogue suffix for both Native Title programs', () => {
  const pair = catalogue.programs.filter(p => p.id.toLowerCase() === 'activity:performance of native title representative body functions');
  const records = pair.map(row => programRecord('federal', row, catalogue.agencies, catalogue.programs));
  assert.equal(new Set(records.map(r => r.extra.slug)).size, 2);
  for (const [i,row] of pair.entries()) assert.equal(records[i].extra.slug, `grant-program-federal-${row.key}`);
});

test('all eight audited embedded tallies match their standalone source records', async () => {
  assert.equal(audit.divisions.length, 8);
  for (const expected of audit.divisions) {
    const bill = await read(`/bills/${expected.bill}.json`);
    const division = bill.divisions.find(d => d.key === expected.key);
    const source = await read(`/divisions/division-${expected.key}.json`);
    assert.equal(division.ayes, expected.ayes);
    assert.equal(division.noes, expected.noes);
    assert.equal(division.outcome, source.result);
  }
});

test('the browser opens and caches r5626 with one bill request and no division requests', async () => {
  const bill = await read('/bills/au-federal-r5626.json');
  assert.equal(bill.divisions.length, 48);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function fetchBill(key)');
  const code = app.slice(start, app.indexOf('/** The same record', start));
  const requests = [];
  const fetchBill = runInNewContext(code+';fetchBill', {billFiles:new Map(), fetch:async path => {
    requests.push(path);
    assert.equal(path, '/bills/au-federal-r5626.json');
    return Response.json(bill);
  }});
  const opened = await fetchBill(bill.key);
  assert.deepEqual(opened, bill);
  assert.equal(await fetchBill(bill.key), opened);
  assert.equal(requests.length, 1);
});

test('every bill with embedded divisions agrees with the standalone source', async () => {
  const index = await read('/bills/index.json');
  let bills = 0, divisions = 0;
  for (const row of index.bills) {
    const bill = await read(`/bills/${row.key}.json`);
    if (bill.divisions?.length) bills++;
    for (const embedded of bill.divisions || []) {
      const canonical = await read(`/divisions/division-${embedded.key}.json`);
      assert.equal(canonical.key, embedded.key);
      for (const field of ['ayes', 'noes']) assert.equal(embedded[field], canonical[field], `${row.key}/${embedded.key}/${field}`);
      assert.equal(embedded.outcome, canonical.result, `${row.key}/${embedded.key}/outcome`);
      divisions++;
    }
  }
  assert.ok(bills > 0 && divisions > 0);
});

test('audited party labels are canonical in index and detail; renderers reject dirty labels', async () => {
  const index = await read('/bills/index.json');
  const allowed = await read('/facts/sponsor-parties.json');
  const dated = new Map([...datedSponsors, ...sponsorDecisions.fills].map(row => [row.key, row.published_party]));
  for (const expected of audit.parties) {
    const row = index.bills.find(b => b.key === expected.key);
    const bill = await read(`/bills/${expected.key}.json`);
    assert.equal(bill.sponsor_party, row.sponsor_party, expected.key);
    assert.ok(!bill.sponsor_party || allowed.includes(bill.sponsor_party), expected.key);
    assert.equal(bill.sponsor_party, dated.get(expected.key) ?? expected.canonical, expected.key);
  }
  for (const party of ['xx', 'monarchist', 'Australia&#39;s Voice']) {
    const html = renderBillAnswer({key:'example', title:'Example bill', sponsor_party:party}, [], new Map()).html;
    assert.doesNotMatch(html, /Sponsor's recorded party/);
  }
});

test('the 20 ALRC null sponsor parties remain null in detail, index and party selection', async () => {
  const index = await read('/bills/index.json');
  assert.equal(audit.sponsor_party_null_keys.length, 20);
  for (const key of audit.sponsor_party_null_keys) {
    const bill = await read(`/bills/${key}.json`);
    assert.equal(bill.sponsor, null, key);
    assert.equal(bill.sponsor_party, null, key);
    assert.equal(index.bills.find(b => b.key === key).sponsor_party, null, key);
    assert.doesNotMatch(renderBillAnswer(bill, [], new Map()).html, /Sponsor's recorded party/);
  }
  assert.equal(index.bills.filter(b => audit.sponsor_party_null_keys.includes(b.key) && b.sponsor_party === 'Independent').length, 0);
});

test('all 52 dated sponsor disagreements are corrected or explicitly held in the published snapshot', async () => {
  const index = await read('/bills/index.json');
  assert.equal(datedSponsors.length, 52);
  assert.equal(datedSponsors.filter(row => row.decision === 'corrected').length, 48);
  assert.equal(datedSponsors.filter(row => row.decision === 'held-for-review').length, 4);
  for (const {key, introduced, published_party} of [...datedSponsors, ...sponsorDecisions.fills]) {
    const bill = await read(`/bills/${key}.json`);
    assert.equal(bill.introduced, introduced, key);
    assert.equal(bill.sponsor_party, published_party, key);
    for (const sponsor of bill.sponsors?.slice(0, 1) || []) assert.equal(sponsor.party, published_party, key);
    assert.equal(index.bills.find(b => b.key === key).sponsor_party, published_party, key);
  }
});
