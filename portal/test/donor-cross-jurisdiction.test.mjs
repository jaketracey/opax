import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {donorLookup} from '../public/donor-disclosure.js';
import {foldDonorName} from '../public/donor-entity.js';
import {shortMoney} from '../public/format.js';
import {workerFetch} from './helpers/worker-fetch.mjs';

const name = 'Banksia Cross Register Example Pty Ltd';
const record = (jurisdiction, total, count) => ({
  id: `donor:fixture:${jurisdiction}`, label: name, source_name: name, kind: 'donor', jurisdiction,
  total, count, firstYear: 2024, lastYear: 2024, aliases: ['Banksia Cross Register Example'],
  returnReferences: [{url: `https://example.test/${jurisdiction}`, return_type: `${jurisdiction} fixture return`}],
});
const federal = {...record('federal', 123400, 7), by_type: {donation_received: 100000, other_receipt: 23400},
  by_type_year: {'2024-25': {donation_received: [100000, 5], other_receipt: [23400, 2]}}};
const qld = record('qld', 4500, 2);
const files = records => ({
  '/graph/donor-index.json': {donors: records},
  ...Object.fromEntries(['money.json', 'money.qld.json', 'money.vic.json', 'money.tas.json'].map(file =>
    ['/graph/' + file, {meta: {}, nodes: [], edges: []}])),
});
const render = (records, extra = {}) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
    execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
    workerData: {kind: 'donor', path: '/subject/donor/' + encodeURIComponent(name),
      selector: '#state-money li', html: true, settleMs: 100, files: {...files(records), ...extra}},
  });
  let result;
  worker.once('message', value => { result = value; });
  worker.once('error', reject);
  worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
});

test('jurisdiction keys retain figures and evidence even when a confirmed entity spans commissions', () => {
  const match = {entity_id: 'fixture-entity', confidence: 1, method: 'curated', href: '/subject/donor/' + encodeURIComponent(name)};
  for (const records of [[federal, qld], [qld, federal]]) {
    const index = donorLookup(records.map(r => ({...r, match})));
    for (const r of records) {
      const scoped = index.get(r.jurisdiction + ':' + foldDonorName(name));
      assert.equal(scoped.total, r.total);
      assert.equal(scoped.count, r.count);
      assert.deepEqual(scoped.returnReferences, r.returnReferences);
    }
    assert.equal(index.get(foldDonorName(name)).total, undefined, 'an unscoped name must not pick one commission by source order');
    assert.deepEqual(index.get(foldDonorName(name)).match, match, 'confirmed identity is retained independently of commission figures');
  }
});

test('repeated source names and folded aliases merge each commission return reference once', () => {
  for (const records of [[federal, qld], [qld, federal]]) {
    const repeated = records.map(r => ({...r, name, aliases: [name, name.toUpperCase()], lookup_names: [name, name.toLowerCase()]}));
    const index = donorLookup(repeated);
    assert.deepEqual(index.get(foldDonorName(name)).returnReferences, records.flatMap(r => r.returnReferences));
  }
});

for (const records of [[federal, qld], [qld, federal]]) {
  test(`hydrated profile retains federal and off-map state figures (${records[0].jurisdiction} first)`, async () => {
    const result = await render(records);
    assert.deepEqual(result.errors, []);
    const dom = new JSDOM(result.html), doc = dom.window.document;
    const own = doc.querySelector('#donor-record');
    assert.ok(own, 'the federal block survives hydration');
    assert.match(own.querySelector('h3').textContent, /Federal/);
    assert.ok(own.textContent.includes(shortMoney(federal.total)));
    assert.equal(own.querySelectorAll('.tile b')[1].textContent, '7');
    assert.equal(own.querySelectorAll('.tile span')[1].textContent, 'receipts');
    assert.match(own.textContent, /Other Receipt/);
    const state = doc.querySelector('#state-money');
    assert.equal(state.querySelector('h3').textContent, 'Also disclosed to state commissions');
    assert.match(state.textContent, /Queensland/);
    assert.ok(state.textContent.includes(`${shortMoney(qld.total)} across 2 disclosed gifts`));
    assert.equal(state.querySelectorAll('li').length, 1);
    assert.ok(!doc.body.textContent.includes(shortMoney(federal.total + qld.total)));
    assert.match(state.textContent, /not summed/);
    dom.window.close();
  });
}

test('a state-only profile labels each commission and never repeats its figure', async () => {
  const result = await render([qld, record('vic', 6700, 3)]);
  assert.deepEqual(result.errors, []);
  const dom = new JSDOM(result.html), text = dom.window.document.body.textContent;
  assert.match(text, /Queensland/);
  assert.match(text, /Victoria/);
  assert.equal(dom.window.document.querySelector('#state-money h3').textContent, 'Disclosed to state commissions');
  assert.equal(text.split(shortMoney(qld.total)).length - 1, 1);
  assert.equal(text.split(shortMoney(6700)).length - 1, 1);
  dom.window.close();
});

test('a state map node supplies figures missing from the index beside the off-map federal block', async () => {
  const result = await render([federal, {...qld, total: undefined, count: undefined}], {
    '/graph/money.qld.json': {meta: {sourceShort: 'ECQ'}, nodes: [qld], edges: []},
  });
  assert.deepEqual(result.errors, []);
  const dom = new JSDOM(result.html), doc = dom.window.document;
  assert.ok(doc.querySelector('#donor-record').textContent.includes(shortMoney(federal.total)));
  assert.ok(doc.querySelector('#state-money').textContent.includes(`${shortMoney(qld.total)} across 2 disclosed gifts`));
  assert.equal(doc.querySelectorAll('#state-money li').length, 1);
  dom.window.close();
});

test('a single state-only record appears once under its commission', async () => {
  const result = await render([qld]);
  assert.deepEqual(result.errors, []);
  const dom = new JSDOM(result.html), doc = dom.window.document;
  assert.equal(doc.querySelector('#donor-record'), null);
  assert.match(doc.querySelector('#state-money').textContent, /Queensland/);
  assert.equal(doc.body.textContent.split(shortMoney(qld.total)).length - 1, 1);
  dom.window.close();
});

test('the offline Worker retains the same two commissions before hydration', async () => {
  const response = await workerFetch('/subject/donor/' + encodeURIComponent(name), {}, {}, {assets: files([federal, qld])});
  assert.equal(response.status, 200);
  const dom = new JSDOM(await response.text());
  const blocks = dom.window.document.querySelectorAll('#prerender [data-donor-record]');
  assert.deepEqual([...blocks].map(block => block.dataset.donorRecord), ['federal', 'qld']);
  assert.ok(blocks[0].textContent.includes(shortMoney(federal.total)));
  assert.ok(blocks[1].textContent.includes(shortMoney(qld.total)));
  dom.window.close();
});
