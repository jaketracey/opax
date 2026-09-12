import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { procurementGraph } from '../public/procurement-data.js';
import { filterMoneyEdges, moneyTotals } from '../public/money-records.js';
import { buildGraph } from '../public/money-map.js';

const source = readFileSync(new URL('../public/agencies.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ');
const shared = readFileSync(new URL('../public/suppliers.js', import.meta.url), 'utf8').replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ');
const tick = () => new Promise(resolve => setImmediate(resolve));
function node() {
  const children = new Map();
  return { innerHTML: '', textContent: '', value: '', hidden: false, listeners: {},
    setAttribute() {}, removeAttribute() {}, addEventListener(key, fn) { this.listeners[key] = fn; },
    querySelector(key) { if (!children.has(key)) children.set(key, node()); return children.get(key); },
    querySelectorAll() { return []; }, focus() {} };
}
function harness(fetch) {
  const context = { fetch, AbortController, URLSearchParams, history: { replaceState() {} }, procurementGraph };
  runInNewContext(`Object.assign(this, (() => { ${shared}; return { json, lifecycle, coverageHTML, yearChart, contractHTML, mountYearChart, placeholderContract }; })());`, context);
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
