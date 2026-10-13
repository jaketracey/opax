import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { procurementGraph } from '../public/procurement-data.js';
import { filterMoneyEdges, moneyTotals } from '../public/money-records.js';
import { buildGraph } from '../public/money-map.js';
import { shortDate, shortMoney } from '../public/format.js';
import { sourceLineHTML } from '../public/labels.js';

const source = readFileSync(new URL('../public/agencies.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ');
const shared = readFileSync(new URL('../public/suppliers.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ');
const tick = () => new Promise(resolve => setImmediate(resolve));
function node() {
  const children = new Map();
  return { innerHTML: '', textContent: '', value: '', hidden: false, listeners: {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, addEventListener(key, fn) { this.listeners[key] = fn; },
    querySelector(key) { if (!children.has(key)) children.set(key, node()); return children.get(key); },
    querySelectorAll() { return []; }, focus() {} };
}
function harness(fetch) {
  const context = { fetch, AbortController, URLSearchParams, setTimeout, clearTimeout, history: { replaceState() {} }, procurementGraph, shortDate, shortMoney, sourceLineHTML };
  runInNewContext(`Object.assign(this, (() => { ${shared}; return { json, lifecycle, coverageHTML, yearChart, contractHTML, mountYearChart, placeholderContract, plural, procurementSourceHTML, procurementRailHTML, slowNotice, statsHTML }; })());`, context);
  runInNewContext(source, context); return context;
}
const id = 'a-0123456789abcdef0123';
const entry = { id, name: 'Agency & Works', profile_path: `/agencies/${id}.json`, total: 12, count: 2 };
const profile = { ...entry, suppliers: [{ id: 's-one', name: 'A company', total: 12, count: 2, donor_links: [] }], years: [], contracts: [] };
const ok = data => ({ ok: true, json: async () => data });

test('agency graph and supplier graph retain award direction and exclude political receipts', () => {
  for (const [p, kind] of [[profile, 'agency'], [{ id: 's-one', name: 'A company', total: 12, count: 2, agencies: [entry] }, 'supplier']]) {
    const graph = procurementGraph(p, kind);
    assert.equal(graph.edges[0].source.startsWith('agency:'), true);
    assert.equal(graph.edges[0].target.startsWith('supplier:'), true);
    assert.equal(filterMoneyEdges(graph).length, 1);
    assert.equal(filterMoneyEdges(graph, {type:'receipts'}).length, 0);
    assert.deepEqual(moneyTotals(graph), { receipts: 0, contracts: 12, grants: 0 });
    assert.equal(buildGraph(graph).edges.length, 1);
  }
});
test('map bounds dense agencies without dropping suppliers from the profile', () => {
  const p = {...profile, suppliers: Array.from({length:70}, (_,i) => ({id:`s-${i}`, name:`Company ${i}`, total:i, count:1}))};
  const graph = procurementGraph(p);
  assert.equal(graph.edges.length,60); assert.equal(graph.meta.available,69); assert.equal(p.suppliers.length,70);
});
test('exact recorded agency names resolve to a stable profile with linked suppliers', async () => {
  let canonical; const calls=[];
  const c = harness(async path => {calls.push(path); return ok(path === '/agencies.json' ? {agencies:[entry]} : profile);});
  const root=node(); c.mountAgencyProfile(root, entry.name, {onCanonical(value){canonical=value;}}); await tick();
  assert.equal(canonical,id); assert.deepEqual(calls, ['/agencies.json',entry.profile_path]);
  assert.match(root.innerHTML,/Agency &amp; Works/);
  assert.match(root.querySelector('.agency-suppliers').innerHTML,/\/subject\/supplier\/s-one/);
});
test('unknown agency names do not fabricate a profile', async () => {
  const c=harness(async () => ok({agencies:[entry]})); const root=node(); let title;
  c.mountAgencyProfile(root,'Agency',{onTitle(v){title=v;}}); await tick();
  assert.equal(title,'Agency not found'); assert.match(root.innerHTML,/Browse the available/);
});
test('leaving during an agency fetch cannot overwrite the next route', async () => {
  let resolve, signal; const c=harness((url, options) => {signal=options.signal; return new Promise(done=>{resolve=done;});});
  const root=node(); const handle=c.mountAgencyProfile(root,id); handle.destroy(); root.innerHTML='Next page';
  resolve(ok({agencies:[entry]})); await tick(); assert.equal(signal.aborted,true); assert.equal(root.innerHTML,'Next page');
});
test('supplier sorting covers values, contract counts and names without mutating the source',()=>{
 const c=harness(async()=>ok({}));
 const rows=[{id:'b',name:'Beta',total:10,count:8},{id:'a',name:'Alpha',total:90,count:2},{id:'c',name:'Gamma',total:30,count:4}];
 const expected={value_desc:'acb',value_asc:'bca',count_desc:'bca',count_asc:'acb',name_asc:'abc',name_desc:'cba'};
 for(const [sort,order] of Object.entries(expected)) assert.equal(c.sortAgencySuppliers(rows,sort).map(r=>r.id).join(''),order);
 assert.equal(rows.map(r=>r.id).join(''),'bac');
});

// Agency template polish (14 Oct): structure, empty-state rules and alignment classes.
async function rendered(p, directory = { agencies: [entry] }) {
  const c = harness(async path => ok(path === '/agencies.json' ? directory : p));
  const root = node(); c.mountAgencyProfile(root, id, {}); await tick(); await tick();
  return { root, html: root.innerHTML };
}
const headings = html => [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
const many = n => Array.from({ length: n }, (_, i) => ({ id: `s-${i}`, name: `Company ${i}`, abn: null, total: 100 - i, count: 2, donor_links: [] }));
const contract = (i, extra = {}) => ({ id: `CN${i}`, title: `Item ${i}`, supplier: 'A company', supplier_id: 's-one', amount: 10 + i, start_date: `2024-01-${String(i + 1).padStart(2, '0')}`, ...extra });

test('agency entry: one h1, its sections at h2, rows carry the figure column classes', async () => {
  const { root, html } = await rendered({ ...profile, years: [{ year: 2024, total: 12, count: 2 }], contracts: [contract(1)] });
  const levels = headings(html);
  assert.equal(levels.filter(l => l === 1).length, 1);
  assert.equal(levels[0], 1);
  assert.ok(levels.slice(1).every(l => l === 2), `section headings are h2: ${levels}`);
  assert.match(html, /<ul class="ui-list agency-suppliers agency-rows" role="list">/);
  const row = root.querySelector('.agency-suppliers').innerHTML;
  assert.match(row, /<li class="ui-row">.*<div class="ui-row-figure">\$12<span class="ui-row-meta">2 contracts<\/span><\/div><\/li>/);
});

test('agency entry drops empty sections and their rail entries instead of filler', async () => {
  const { html } = await rendered({ ...profile, suppliers: [{ ...profile.suppliers[0], total: 0 }], years: [] });
  assert.doesNotMatch(html, /id="agency-connections"/);
  assert.doesNotMatch(html, /id="procurement-years"/);
  assert.doesNotMatch(html, /href="#agency-connections"|href="#procurement-years"/);
  assert.doesNotMatch(html, /No dated contracts are available|Not available|No relationships with positive/);
  assert.match(html, /href="#agency-suppliers"/);
  assert.match(html, /href="#agency-contracts"/);
});

test('short lists need no filter or sort; long ones get both', async () => {
  const short = await rendered({ ...profile, contracts: [contract(1)] });
  assert.doesNotMatch(short.html, /agency-supplier-query|agency-contract-query|search-sort-picker/);
  const long = await rendered({ ...profile, suppliers: many(6), contracts: Array.from({ length: 6 }, (_, i) => contract(i)) });
  assert.match(long.html, /name="agency-supplier-query"/);
  assert.match(long.html, /class="search-sort-picker agency-supplier-sort"/);
  assert.match(long.html, /name="agency-contract-query"/);
});

test('counts read as written: one supplier, one contract, one map relationship', async () => {
  const { root, html } = await rendered({ ...profile, suppliers: [{ ...profile.suppliers[0], count: 1 }], contracts: [contract(1)] });
  assert.equal(root.querySelector('.agency-supplier-count').textContent, '1 supplier');
  assert.equal(root.querySelector('.supplier-contract-count').textContent, '1 of 1 contract, newest first');
  assert.match(root.querySelector('.agency-suppliers').innerHTML, />1 contract</);
  assert.match(html, /shows the one supplier relationship with positive recorded value/);
  assert.doesNotMatch(html, /largest 1 supplier/);
});

test('year chart: bars stretch, years are an HTML axis, the last label never collides', () => {
  const c = harness(async () => ok({}));
  assert.equal(c.yearChart([], { count: 0 }), '');
  const years = Array.from({ length: 23 }, (_, i) => ({ year: 2004 + i, total: i + 1, count: 1 }));
  const html = c.yearChart(years, { count: 2, total: 5 });
  assert.match(html, /<svg viewBox="0 0 100 100" preserveAspectRatio="none"/);
  assert.doesNotMatch(html, /<text/);
  const labels = [...html.matchAll(/<span(?: data-minor)? style="left:([\d.]+)%">(\d{4})<\/span>/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.equal(labels.at(-1)[1], 2026);
  const step = 100 / 23;
  for (let i = 1; i < labels.length; i++) assert.ok(labels[i][0] - labels[i - 1][0] >= step * 3 - 0.01, `labels ${labels[i - 1][1]} and ${labels[i][1]} too close`);
  assert.match(html, /<h2 class="ui-section-title">Contract value over time<\/h2>/);
  assert.match(html, /2 contracts worth \$5 have no recorded start year/);
  // One year keeps a readable bar, centred, rather than filling the column.
  const one = c.yearChart([{ year: 2013, total: 9, count: 1 }], {});
  const width = Number(one.match(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="[\d.]+" class="supplier-bar-fill/)[1]);
  assert.ok(width < 10, `single bar width ${width}`);
});

test('a slow agency load says so at 12 s and gives up with a retry at 90 s', async () => {
  const timers = [];
  const c = harness(() => new Promise(() => {}));
  c.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  c.clearTimeout = () => {};
  const status = { textContent: 'Opening agency records…' };
  const root = { ...node(), getAttribute: key => key === 'aria-busy' ? 'true' : null, querySelector: key => key === '[role="status"]' ? status : node() };
  c.mountAgencyProfile(root, id, {});
  const slow = timers.find(t => t.ms === 12000), stop = timers.find(t => t.ms === 90000);
  assert.ok(slow && stop, `timers ${timers.map(t => t.ms)}`);
  slow.fn();
  assert.match(status.textContent, /^Still opening the agency records/);
});
