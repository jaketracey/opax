// An agency link can name a section and one supplier (`?section=contracts&supplier=s-…`),
// as Today's question does in the app. The web opens the contract record filtered to that
// supplier, on the Worker's table and on the client's own list, with a link back to all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {offline, loadWorker} from './worker-harness.mjs';

offline();
globalThis.caches.default = {async match() {}, async put() {}};
const {env, fetch: worker} = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public', import.meta.url).pathname);

const id = 'a-00000000000000000009';
const sid = n => `s-${String(n).padStart(20, '0')}`;
const name = n => `Example Supplier ${n} Pty Ltd`;
// Supplier 25 has the least value, so it is outside the first twenty suppliers, and its three
// contracts are outside the newest twenty: the filtered rows must come from the whole file.
const suppliers = Array.from({length: 25}, (_, i) => ({id: sid(i + 1), name: name(i + 1), total: 10000 - i, count: 1, donor_links: []}));
const linked = new Set([25, 31, 38]);
const contracts = Array.from({length: 40}, (_, i) => {
  const n = linked.has(i + 1) ? 25 : (i % 24) + 1;
  return {id: `CN${i + 1}`, title: `Example contract ${i + 1}`, supplier_id: sid(n), supplier: name(n), amount: 1000,
    start_date: `2026-${String(12 - Math.floor(i / 4)).padStart(2, '0')}-0${(i % 4) + 1}`, url: `https://www.tenders.gov.au/Search/KeywordSearch?keyword=CN${i + 1}`};
});
const agency = {id, name: 'Department of Example Links', total: 40000, count: 40, supplier_count: 25, profile_path: `/agencies/${id}.json`};
const files = {
  '/agencies.json': {meta: {source: 'AusTender, Department of Finance', source_url: 'https://www.tenders.gov.au/'}, agencies: [agency]},
  [agency.profile_path]: {...agency, suppliers, contracts, years: [], undated: {total: 0, count: 0}, withheld: []},
};
const assets = env.ASSETS;
env.ASSETS = {async fetch(request) {
  const path = new URL(request.url).pathname;
  return Object.hasOwn(files, path) ? Response.json(files[path]) : assets.fetch(request);
}};

const linkPath = `/subject/agency/${id}?section=contracts&supplier=${sid(25)}`;
const page = async path => new JSDOM(await (await worker(path)).text()).window.document;
const contractRows = root => [...root.querySelectorAll('[data-record-list="agency-contracts"] tbody tr')];
const shell = workerData => new Promise((resolve, reject) => {
  const child = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
    execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
    workerData: {files, html: true, settleMs: 150, ...workerData},
  });
  const timeout = setTimeout(() => { child.terminate(); reject(Error('Agency page timed out')); }, 15000);
  let message;
  child.on('message', value => { message = value; });
  child.on('error', reject);
  child.on('exit', code => { clearTimeout(timeout); code || message?.error ? reject(Error(message?.error || `Exit ${code}`)) : resolve(message); });
});

test('the Worker draws only the linked supplier\'s contracts, with the way back to all of them', async () => {
  const doc = await page(linkPath);
  const core = doc.querySelector('#prerender[data-record-core]');
  const rows = contractRows(core);
  assert.deepEqual(rows.map(row => row.cells[0].textContent), ['Example contract 25', 'Example contract 31', 'Example contract 38']);
  assert.ok(rows.every(row => row.cells[1].textContent === name(25)));
  const scope = core.querySelector('[data-record-list="agency-contracts"] [data-record-scope]');
  assert.equal(scope.dataset.recordScope, sid(25));
  assert.equal(scope.querySelector('p').textContent, `Showing only contracts with ${name(25)}.`);
  const back = scope.querySelector('a');
  assert.equal(back.textContent, 'Show all contracts');
  assert.equal(back.getAttribute('href'), `/subject/agency/${id}#agency-contracts`);
  assert.equal(core.querySelectorAll('[data-record-list="agency-suppliers"] tbody tr').length, 20, 'The supplier list is not filtered');
  assert.equal(doc.querySelector('link[rel="canonical"]').href, `https://opax.com.au/subject/agency/${id}`);
});

for (const search of ['', '?section=contracts', `?supplier=${'s-' + 'f'.repeat(20)}`, '?supplier=s-1%22%3E'])
  test(`an address without a recorded supplier draws the whole contract record: ${search || 'none'}`, async () => {
    const core = (await page(`/subject/agency/${id}${search}`)).querySelector('#prerender');
    assert.equal(contractRows(core).length, 20);
    assert.equal(core.querySelector('[data-record-scope]'), null);
  });

test('the app adopts the filtered server table, keeps the address, and shows all contracts on request', {timeout: 20000}, async () => {
  const result = await shell({path: linkPath, document: await (await worker(linkPath)).text(), recordCore: true,
    selector: '#prerender[data-record-hydrated]', click: '#prerender [data-record-scope] a'});
  assert.deepEqual(result.errors, []);
  const before = new JSDOM(result.before.html).window.document;
  assert.equal(result.before.search, `?section=contracts&supplier=${sid(25)}`, 'The address keeps the link\'s filter');
  assert.deepEqual(contractRows(before).map(row => row.cells[0].textContent), ['Example contract 25', 'Example contract 31', 'Example contract 38']);
  assert.equal(before.querySelector('[data-record-list="agency-contracts"] [role="status"]').textContent, 'Showing 1–3 of 3 listed records');
  assert.equal(before.querySelectorAll('[data-record-scope]').length, 1, 'One way back, on the adopted table');
  const after = new JSDOM(result.html).window.document;
  assert.equal(after.querySelector('[data-record-scope]'), null);
  assert.equal(contractRows(after).length, 20);
  assert.equal(after.querySelector('[data-record-list="agency-contracts"] [role="status"]').textContent, 'Showing 1–20 of 40 listed records');
  assert.equal(result.search, '', 'Showing all contracts drops the filter from the address');
  assert.match(result.focused, /name="agency-contract-query"/);
});

test('the client list filters by the linked supplier when no server table is present', {timeout: 20000}, async () => {
  // No supplier with a positive total, so no 3D map: jsdom has no canvas.
  const unmapped = {...files, [agency.profile_path]: {...files[agency.profile_path], suppliers: suppliers.map(s => ({...s, total: 0}))}};
  const result = await shell({path: linkPath, files: unmapped, selector: '.supplier-contract-list .supplier-contract', click: '#agency-contracts [data-record-scope] a'});
  assert.deepEqual(result.errors, []);
  const before = new JSDOM(result.before.html).window.document;
  assert.equal(before.querySelectorAll('.supplier-contract-list .supplier-contract').length, 3);
  assert.equal(before.querySelector('.supplier-contract-count').textContent, '3 of 3 contracts with this supplier, newest first');
  assert.equal(before.querySelector('#agency-contracts [data-record-scope] a').textContent, 'Show all contracts');
  assert.equal(result.before.search, `?section=contracts&supplier=${sid(25)}`);
  const after = new JSDOM(result.html).window.document;
  assert.equal(after.querySelector('[data-record-scope]'), null);
  assert.equal(after.querySelectorAll('.supplier-contract-list .supplier-contract').length, 15);
  assert.equal(after.querySelector('.supplier-contract-count').textContent, '15 of 40 contracts, newest first');
  assert.equal(result.search, '');
  assert.match(result.focused, /name="agency-contract-query"/);
});

test('the plain address over a table drawn for one supplier lists every contract, with no note', {timeout: 20000}, async () => {
  // As when the reader follows the way back before the app has booted, or any link to the agency.
  const result = await shell({path: `/subject/agency/${id}`, document: await (await worker(linkPath)).text(), recordCore: true,
    selector: '#prerender[data-record-hydrated]'});
  assert.deepEqual(result.errors, []);
  const after = new JSDOM(result.html).window.document;
  assert.equal(after.querySelector('[data-record-scope]'), null);
  assert.equal(contractRows(after).length, 20);
  assert.equal(after.querySelector('[data-record-list="agency-contracts"] [role="status"]').textContent, 'Showing 1–20 of 40 listed records');
});
