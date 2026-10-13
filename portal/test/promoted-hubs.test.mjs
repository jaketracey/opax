import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {budgetReader, clearedAggregates} from '../src/budget.ts';
import {vicGiftsReader, clearedGiftRegisters} from '../src/vic-gifts.ts';
import {addHubDataDiscovery} from '../../scripts/build_crawl_catalog.mjs';
import {loadWorker, offline, outbound} from './worker-harness.mjs';

const publicRoot = new URL('../public/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, publicRoot)));
const budget = json('budget/data.json'), gifts = json('vic-gifts/data.json');

test('promoted assets match Worker readers and every promoted row passes serving guards', async () => {
  const assets = {async fetch(req) {return new Response(readFileSync(new URL(new URL(req.url).pathname.slice(1), publicRoot)));}};
  const b = await budgetReader(assets)('/budget/data.json'), g = await vicGiftsReader(assets)();
  assert.equal(clearedAggregates(b).length, b.promotion.counts.aggregates);
  assert.equal(b.documents.length, 851);
  const registers = clearedGiftRegisters(g), rows = registers.flatMap(r => r.rows);
  assert.equal(registers.length, 3);
  assert.equal(rows.length, 282);
  assert.equal(rows.filter(r => r.official).length, 275);
  for (const [name, hub] of [['budget', b], ['vic-gifts', g]]) {
    const staged = readFileSync(new URL(`../../data/staged/${name}/hub.json`, import.meta.url));
    assert.equal(createHash('sha256').update(staged).digest('hex'), hub.promotion.input_sha256);
    const {promotion, ...projection} = hub;
    assert.deepEqual(projection, JSON.parse(staged));
  }
});

test('real Worker renders both promoted hubs and Victorian person gifts with disk-backed assets', async () => {
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, publicRoot.pathname);
    for (const [route, text] of [['/budget', 'headline aggregates'], ['/register/vic-gifts', '282 published entries'], ['/subject/person/jacinta-allan', 'subject-vic-gifts']]) {
      const response = await worker.fetch(route);
      assert.equal(response.status, 200, route);
      assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/);
      const html = await response.text();
      assert.ok(html.includes(text), route);
      assert.match(html, /Snapshot/);
      assert.match(html, /CC BY/);
      assert.doesNotMatch(html, /name="robots" content="noindex/);
    }
    const api = await worker.fetch('/api/register/vic-gifts?person=%2Fsubject%2Fperson%2Fjacinta-allan');
    assert.equal(api.status, 200);
    assert.equal((await api.json()).total, 32);
    const people = new Map();
    for (const row of gifts.registers.flatMap(r => r.rows)) if (row.official) {
      const href = row.official.href;
      people.set(href, (people.get(href) || 0) + 1);
    }
    for (const [href, count] of people) {
      const response = await worker.fetch(href);
      assert.equal(response.status, 200, href);
      const html = await response.text();
      assert.ok(html.includes('id="subject-vic-gifts"'), href);
      assert.ok(html.includes(`${count} published entries.`), href);
    }
    assert.deepEqual(outbound, []);
  } finally {restore();}
});

test('hub discovery follows other published hubs and omits unavailable assets', () => {
  const dark = {static: []};
  addHubDataDiscovery(dark, null, null);
  assert.deepEqual(dark.static, []);
  const live = {static: []};
  addHubDataDiscovery(live, budget, gifts);
  assert.deepEqual(live.static, [{path:'/budget', lastmod:budget.promotion.snapshot_date}, {path:'/register/vic-gifts', lastmod:gifts.promotion.snapshot_date}]);
  const held = structuredClone(gifts);
  for (const r of held.registers) r.document.status = 'held';
  const missing = {static: []};
  addHubDataDiscovery(missing, {...budget, aggregates:[]}, held);
  assert.deepEqual(missing.static, []);
});
