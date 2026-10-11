import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { shortDate, shortMoney } from '../public/format.js';
import { sourceLineHTML } from '../public/labels.js';
import { partyUrl } from '../public/canonical-urls.js';
import {isOrganisationRecipient} from '../public/recipient-entity.js';
import {contractTitle, placeholderContract} from '../public/contracts-table.js';

// Execute the actual module; only replace its dynamic WebGL import with a
// controlled loader. The small DOM below models the nodes this module touches.
const source = readFileSync(new URL('../public/suppliers.js', import.meta.url), 'utf8')
  .replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
  .replace(/^import .*;\s*/gm, '').replace(/^export \{.*\} from .*;\s*/gm, '')
  .replace(/import\("\/money-map\.js\?v=[^"]*"\)/, 'loadMapModule()');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function node() {
  const children = new Map();
  return {
    innerHTML: '', textContent: '', value: '', hidden: false, attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(event, fn) { this.listeners[event] = fn; },
    removeEventListener(event) { delete this.listeners[event]; },
    querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
    querySelectorAll() { return []; }, focus() {}, scrollIntoView() {},
  };
}
function setup(fetch, mount = async () => ({ destroy() {}, setPaused() {} }), privacyCheck = async () => true) {
  const context = { fetch, AbortController, URLSearchParams, history: { replaceState() {} }, shortDate, shortMoney, partyUrl,
    document: {querySelector: () => null}, isOrganisationRecipient,remotePrivacyCheck:privacyCheck,contractTitle, placeholderContract, mountContractsTable: async () => ({destroy() {}}),
    sourceLineHTML, supplierDonations:async()=>({links:[],html:''}), mountSupplierGrowth:()=>{},
    loadMapModule: async () => ({ mountMoneyMap: mount }) };
  runInNewContext(source, context);
  return context;
}
const id = 's-0123456789abcdef0123';
const second = 's-abcdef0123456789abcd';
const entry = (overrides = {}) => ({ id, name: 'Acme Pty Ltd', aliases: ['Acme Source Name'], lookup_names: ['Acme Funding'], abn: '12345678901', profile_path: '/suppliers/01.json', ...overrides });
const profile = (overrides = {}) => ({ id, name: 'Acme Pty Ltd', abn: '12345678901', count: 1, total: 100,
  agencies: [{ name: 'Agency', total: 100, count: 1 }], years: [{ year: 2025, total: 100, count: 1 }],
  contracts: [{ id: 'CN1', title: 'Example award', agency: 'Agency', amount: 100, start_date: '2025-01-01' }], donor_links: [], caveats: [], ...overrides });
const response = (data) => ({ ok: true, json: async () => data });

test('supplier profiles retain procurement and optional organisation features',async()=>{
  const suppliers=[entry(),entry({id:second,name:'Published second supplier'})];
  const calls=[];
  const context=setup(async url=>{calls.push(url);return response(url==='/suppliers.json'?{suppliers}:url==='/agencies.json'?{agencies:[]}:{profiles:{[id]:profile()}})});
  const root=node(),handle=context.mountSupplierProfile(root,id,{});
  await tick();
  assert.deepEqual(calls,['/suppliers.json','/suppliers/01.json','/agencies.json']);
  assert.match(root.innerHTML,/data-contracts-table/);
  assert.match(root.innerHTML,/supplier-evidence/);
  assert.match(root.innerHTML,/supplier-taxcharity/);
  assert.match(root.innerHTML,/supplier-funding/);
  handle.destroy();
});

test('a public source alias resolves to a stable supplier identity',async()=>{
  const calls=[];let canonical;
  const context=setup(async url=>{calls.push(url);return response(url==='/suppliers.json'?{suppliers:[entry()]}:{profiles:{[id]:profile()}})});
  const root=node(),handle=context.mountSupplierProfile(root,entry().aliases[0],{onCanonical:value=>canonical=value});
  await tick();assert.equal(canonical,id);assert.match(root.innerHTML,/Acme Pty Ltd/);
  assert.ok(!root.innerHTML.includes(entry().lookup_names[0]));
  handle.destroy();
});

test('legacy funding lookups canonicalise without rendering donor aliases',async()=>{
  const context=setup(async url=>response(url==='/suppliers.json'?{suppliers:[entry()]}:{profiles:{[id]:profile()}}));
  const root=node();let canonical;
  context.mountSupplierProfile(root,entry().lookup_names[0],{onCanonical:value=>canonical=value});
  await tick();assert.equal(canonical,id);
  assert.ok(!root.innerHTML.includes(entry().lookup_names[0]));
});

test('ambiguous source aliases require selecting a public procurement identity',async()=>{
  const context=setup(async()=>response({suppliers:[entry(),entry({id:second})]}));
  const root=node();let canonical,title;
  context.mountSupplierProfile(root,entry().aliases[0],{onCanonical:value=>canonical=value,onTitle:value=>title=value});
  await tick();assert.equal(canonical,undefined);assert.equal(title,'Choose a supplier');
  assert.ok(root.innerHTML.includes(id) && root.innerHTML.includes(second));
});

test('prefix names remain unknown and update the SPA title', async () => {
  const context = setup(async () => response({ suppliers: [entry()] }));
  const root = node(); let title;
  context.mountSupplierProfile(root, 'Acme', { onTitle: (value) => { title = value; } });
  await tick();
  assert.equal(title, 'Supplier not found');
  assert.match(root.innerHTML, /id="subject-title"/);
});

test('destroying during index fetch aborts and prevents rendering or shard requests', async () => {
  const pending = deferred(); const calls = []; let signal; let title = null;
  const context = setup((url, options) => { calls.push(url); signal = options.signal; return pending.promise; });
  const root = node();
  const handle = context.mountSupplierProfile(root, id, { onTitle: (value) => { title = value; } });
  handle.destroy();
  root.innerHTML = 'The next route';
  pending.resolve(response({ suppliers: [entry()] }));
  await tick();
  assert.equal(signal.aborted, true);
  assert.deepEqual(calls, ['/suppliers.json']);
  assert.equal(root.innerHTML, 'The next route');
  assert.equal(title, null);
});

test('destroying during shard fetch cannot overwrite the next route', async () => {
  const pending = deferred(); let shardSignal;
  const context = setup(async (url, options) => {
    if (url === '/suppliers.json') return response({ suppliers: [entry()] });
    shardSignal = options.signal; return pending.promise;
  });
  const root = node(); const handle = context.mountSupplierProfile(root, id);
  await tick();
  assert.ok(shardSignal);
  handle.destroy(); root.innerHTML = 'Other page';
  pending.resolve(response({ profiles: { [id]: profile() } }));
  await tick();
  assert.equal(shardSignal.aborted, true);
  assert.equal(root.innerHTML, 'Other page');
});

test('individual ABN type withholds the entire supplier view',async()=>{
  const context=setup(async url=>response(url==='/suppliers.json'?{suppliers:[entry()]}:{profiles:{[id]:profile({identity:{type:'IND',kind:'company'}})}}));
  const root=node();let title;
  context.mountSupplierProfile(root,id,{onTitle:value=>title=value});
  await tick();assert.equal(title,'Supplier not named');
  assert.ok(!root.innerHTML.includes(profile().name));
  assert.ok(!root.innerHTML.includes(profile().abn));
  assert.doesNotMatch(root.innerHTML,/donation|receipt|subject\/donor/);
});

test('a contract search link reaches the table adapter and departure destroys it', async () => {
  const context = setup(async (url) => response(url === '/suppliers.json' ? { suppliers: [entry()] } : { profiles: { [id]: profile() } }));
  let options, destroyed = 0;
  context.mountContractsTable = async (_el, value) => { options = value; return {destroy() {destroyed++;}}; };
  const root = node();
  const handle = context.mountSupplierProfile(root, id, { params: new URLSearchParams({contract:'CN1'}) });
  await tick();
  assert.equal(options.params.get('contract'), 'CN1');
  assert.equal(options.supplierId, id);
  assert.equal(options.count, 1);
  assert.match(root.innerHTML, /data-contracts-table/);
  handle.destroy();
  assert.equal(destroyed, 1);
});


test('an unsafe legal-name field preserves the organisation procurement page', async () => {
  const {tableIdentityIndex} = await import('../../scripts/load_tables.mjs');
  const {sourceTableDonorIdentities} = await import('../../scripts/table_identity_source.mjs');
  const pub = new URL('../public/', import.meta.url);
  const read = path => JSON.parse(readFileSync(new URL(path.replace(/^\//, ''), pub)));
  const policy = await tableIdentityIndex(pub.pathname);
  const recipients={...policy,check:policy.recipientCheck};
  const originals=sourceTableDonorIdentities().supplierProfiles;
  const directory = read('/suppliers.json');
  let example;
  for (const entry of directory.suppliers) {
    const candidate = originals.get(entry.id);
    if (candidate && isOrganisationRecipient(candidate) && !recipients.check(candidate.name)
        && !recipients.check(String(candidate.abn || '')) && recipients.check(String(candidate.identity?.legal_name || ''))) {
      const published=read(entry.profile_path).profiles[entry.id];
      example={...published,identity:{...published.identity,legal_name:candidate.identity.legal_name}}; break;
    }
  }
  assert.ok(example, 'a derived organisation with an unsafe optional field is required');
  const context = setup(async url => response(url === '/suppliers.json' ? directory : url === '/agencies.json' ? {agencies:[]} : {profiles:{[example.id]:example}}), undefined,
    async text => !recipients.check(text));
  const projection = await context.supplierPublicationProfile(example, async text => !recipients.check(text));
  assert.equal(projection.id, example.id);
  assert.equal(projection.identity.legal_name, undefined);
  assert.equal(projection.contracts, example.contracts);
  const root = node(); const handle = context.mountSupplierProfile(root, example.id);
  for (let i=0; i<8; i++) await tick();
  assert.ok(root.innerHTML.includes(example.name), 'the public organisation remains');
  assert.match(root.innerHTML, /data-contracts-table/);
  assert.ok(!recipients.check(root.innerHTML), 'all rendered identity fields are public');
  handle.destroy();
});

test('published aliases cannot restore political funding for an originally withheld donor',async()=>{
  const {tableIdentityIndex}=await import('../../scripts/load_tables.mjs');
  const {compileIdentityCheck}=await import('../src/table-identities.mjs');
  const pub=new URL('../public/',import.meta.url);
  const read=path=>JSON.parse(readFileSync(new URL(path.replace(/^\//,''),pub)));
  const policy=await tableIdentityIndex(pub.pathname),donorCheck=compileIdentityCheck(policy.donorPhrases);
  const entry=read('/suppliers.json').suppliers.find(entry=>{
    const profile=policy.profiles.get(entry.id);
    return profile&&isOrganisationRecipient(profile)&&policy.politicalSuppliers.has(entry.id)
      &&!policy.recipientCheck(JSON.stringify({name:profile.name,abn:profile.abn}))
      &&!donorCheck(JSON.stringify([profile.name,profile.abn,profile.identity?.legal_name,...profile.aliases || [],...profile.lookup_names || [],...profile.donor_links || []]));
  });
  assert.ok(entry,'a runtime-derived supplier whose unsafe aliases were removed is required');
  const profile=read(entry.profile_path).profiles[entry.id];
  const check=async(text,surface,subject)=>surface==='political'
    ? !policy.politicalSuppliers.has(subject)&&!donorCheck(text)
    : !(surface==='data' ? policy.recipientCheck : policy.check)(text);
  const context=setup(async()=>response({}),undefined,check);
  const projected=await context.supplierPublicationProfile(profile,check);
  assert.equal(projected.politicalMoneyAllowed,false,'original donor status survives publication');
  assert.equal(projected.name,profile.name,'the organisation procurement identity remains');
  assert.equal(projected.contracts,profile.contracts,'all procurement records remain');
});
