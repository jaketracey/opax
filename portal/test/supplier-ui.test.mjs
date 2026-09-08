import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual module; only replace its dynamic WebGL import with a
// controlled loader. The small DOM below models the nodes this module touches.
const source = readFileSync(new URL('../public/suppliers.js', import.meta.url), 'utf8')
  .replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
  .replace('import("/money-map.js?v=suppliers-1")', 'loadMapModule()');
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
    querySelectorAll() { return []; }, focus() {},
  };
}
function setup(fetch, mount = async () => ({ destroy() {}, setPaused() {} })) {
  const context = { fetch, AbortController, URLSearchParams, history: { replaceState() {} },
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

test('profile resolves a unique source alias or established funding lookup to a stable identity', async () => {
  for (const name of [' acme source name ', 'ACME FUNDING']) {
    const calls = []; let canonical;
    const context = setup(async (url) => { calls.push(url); return response(url === '/suppliers.json' ? { suppliers: [entry()] } : { profiles: { [id]: profile() } }); });
    const root = node();
    const handle = context.mountSupplierProfile(root, name, { onCanonical: (value) => { canonical = value; } });
    await tick();
    assert.deepEqual(calls, ['/suppliers.json', '/suppliers/01.json']);
    assert.equal(canonical, id);
    assert.match(root.innerHTML, /Acme Pty Ltd/);
    assert.match(root.innerHTML, /ABN 12345678901/);
    handle.destroy();
  }
});

test('ambiguous supplier names show both ABNs without selecting or fetching a profile', async () => {
  const calls = []; let canonical = null; let title;
  const context = setup(async (url) => { calls.push(url); return response({ suppliers: [entry(), entry({ id: second, abn: '98765432101' })] }); });
  const root = node();
  context.mountSupplierProfile(root, 'Acme Funding', { onCanonical: (value) => { canonical = value; }, onTitle: (value) => { title = value; } });
  await tick();
  assert.deepEqual(calls, ['/suppliers.json']);
  assert.equal(canonical, null);
  assert.equal(title, 'Choose a supplier');
  assert.ok(root.innerHTML.includes(id) && root.innerHTML.includes(second));
  assert.match(root.innerHTML, /ABN 12345678901/);
  assert.match(root.innerHTML, /ABN 98765432101/);
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

test('funding node without party edges reports its known total, count and years', async () => {
  const context = setup(async () => response({ nodes: [{ id: 'donor:1', total: 45000, count: 17, firstYear: 2019, lastYear: 2024 }], edges: [] }));
  const root = node(); const life = context.lifecycle(root);
  await context.mountFunding(root, [{ id: 'donor:1', name: 'Acme', method: 'abn' }], life);
  assert.match(root.innerHTML, /\$45,000/);
  assert.match(root.innerHTML, /17 recorded receipts/);
  assert.match(root.innerHTML, /2019–2024/);
  assert.match(root.innerHTML, /party breakdown is not available/);
  assert.doesNotMatch(root.innerHTML, /\$0<|across 0 recorded/);
});

test('missing funding node is unavailable rather than an invented zero', async () => {
  const context = setup(async () => response({ nodes: [], edges: [] }));
  const root = node();
  await context.mountFunding(root, [{ id: 'missing', name: 'Missing' }], context.lifecycle(root));
  assert.match(root.innerHTML, /not present in the current map export/);
  assert.doesNotMatch(root.innerHTML, /\$0|Explore the money map/);
});

test('a map handle returned after departure is destroyed and cannot become active', async () => {
  const pending = deferred(); const entered = deferred(); let destroyed = 0;
  const context = setup(async () => response({ nodes: [{ id: 'donor:1', total: 45, count: 1 }], edges: [] }),
    async () => { entered.resolve(); return pending.promise; });
  const root = node(); const life = context.lifecycle(root);
  await context.mountFunding(root, [{ id: 'donor:1', name: 'Acme' }], life);
  const button = root.querySelector('.supplier-map-toggle');
  const click = button.listeners.click({ currentTarget: button });
  await entered.promise;
  life.destroy();
  pending.resolve({ destroy() { destroyed++; }, setPaused() {} });
  await click;
  assert.equal(destroyed, 1);
  assert.equal(button.hidden, false, 'late completion must not mutate the departed UI');
});
