import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = app.indexOf('// --- discovery:');
const end = app.indexOf('// --- money map (lazy-loaded', start);
assert.ok(start >= 0 && end > start);
// Substitute only the module loader: production rendering and async lifecycle
// execute unchanged, without requiring WebGL in Node.
const code = app.slice(start, end).replace(/import\("\/money-map\.js(?:\?[^"]*)?"\)/g, 'loadMapModule()');
assert.ok(code.includes('loadMapModule()'), 'the map module loader is intercepted');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function harness({ money = { nodes: [] }, mount = async () => ({ destroy() {}, setPaused() {} }) } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', hidden: false, value: '', isConnected: true,
      dataset: {}, attributes: {}, listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      focus(options) { this.focusOptions = options; },
    });
    return elements.get(id);
  };
  element('discover-map-area').hidden = true;
  element('discover-sort').value = 'value';
  const document = { documentElement: { dataset: { panel: 'discover' } } };
  const routes = [];
  const context = {
    $: element, esc, safeUrl: (u) => typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null,
    document, window: {}, URLSearchParams, matchMedia: () => ({ matches: false }),
    loadMoneyData: async () => money,
    loadMapModule: async () => ({ mountMoneyMap: mount }),
    askHash: (q) => `/ask?q=${encodeURIComponent(q)}`, industryLabel: (v) => v,
    replaceRoute: (route) => routes.push(route), goRoute() {}, fmtDate: (v) => v,
    fetch: async () => ({ ok: true, json: async () => ({ signals: [], coverage: {}, methodology: [] }) }),
  };
  runInNewContext(code, context);
  return { context, element, routes, eval: (expression) => runInNewContext(expression, context) };
}

function concentration(overrides = {}) {
  return { id: 'supplier:a', category: 'procurement_concentration', entity: 'Supplier A', summary: 'Example', metrics: [], evidence: [], caveats: [],
    chart: { group_label: 'Agency A', group_total: 1000000, participant_label: 'supplier', record_count: 10,
      participants: [{ name: 'Supplier A', value: 410100, share: 41.01 }, { name: 'Supplier B', value: 300000, share: 30 }],
      other_total: 289900, other_share: 28.99, other_count: 5,
      period: { kind: 'contract_start_date', from: '2019-02-01', to: '2025-03-01' } }, ...overrides };
}

function overlap(entity = 'Example') {
  return { id: 'overlap:a', category: 'donor_contract_overlap', entity, summary: '', evidence: [], caveats: [], metrics: [
    { label: 'Recorded party receipts', value: 2000000 }, { label: 'Recorded contract value', value: 7000000 },
    { label: 'Party receipt records', value: 12 }, { label: 'Contract records', value: 4 },
  ] };
}

test('concentration bars use percentage points and reconcile an explicit other group', () => {
  const { context } = harness();
  const html = context.discoveryDetailHTML(concentration());
  const widths = [...html.matchAll(/style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [41.01, 30, 28.99]);
  assert.ok(Math.abs(widths.reduce((a, b) => a + b) - 100) < 1e-9);
  assert.match(html, /Other 5 suppliers/);
  assert.match(html, /\$410\.1k/);
  assert.match(html, /41(?:\.0)?%/);
});

test('overlap keeps receipts and awards separate instead of manufacturing a combined total', () => {
  const html = harness().context.discoveryDetailHTML(overlap());
  assert.match(html, /Party receipts<\/span><strong>\$2m/);
  assert.match(html, /Government contracts<\/span><strong>\$7m/);
  assert.doesNotMatch(html, /\$9m|style="width:/);
  assert.match(html, /Different money flows and reporting periods/);
});

test('source text and labels cannot inject HTML or executable evidence links', () => {
  const signal = concentration();
  signal.entity = '\"><img src=x onerror=alert(1)>';
  signal.chart.group_label = '<svg onload=alert(1)>';
  signal.chart.participants[0].name = '<script>alert(1)</script>';
  signal.evidence = [{ label: '<img src=x>', url: 'javascript:alert(1)' }, { label: 'Safe & sound', url: 'https://example.org/?x=" onmouseover="alert(1)' }];
  const html = harness().context.discoveryDetailHTML(signal);
  assert.doesNotMatch(html, /<img|<svg|<script|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Safe &amp; sound/);
  assert.match(html, /x=&quot; onmouseover=&quot;/);
});

test('financial year range preserves both year endpoints', () => {
  const signal = concentration({ category: 'recipient_concentration' });
  signal.chart.period = { kind: 'financial_year', from: '1998-99', to: '2024-25' };
  assert.match(harness().context.discoveryDetailHTML(signal), /FY 1998-99 to 2024-25/);
});

test('default selection emphasizes government contracts and chooses largest total', async () => {
  const h = harness();
  const low = concentration({ id: 'low' }); low.chart.group_total = 500000;
  const high = concentration({ id: 'high' }); high.chart.group_label = 'Largest Agency';
  h.context.fetch = async () => ({ ok: true, json: async () => ({ signals: [low, overlap(), high], coverage: {}, methodology: [] }) });
  await h.context.renderDiscoveryPage(new URLSearchParams(), false);
  assert.equal(h.element('discover-categories').value, 'procurement_concentration');
  assert.equal(h.eval('discoverySelected'), 'high');
  assert.match(h.element('discover-detail').innerHTML, /Largest Agency/);
  assert.equal(h.element('discover-count').textContent, '2 agencies');
});

test('map refuses prefix-only donor matches', async () => {
  let mounts = 0;
  const h = harness({ money: { nodes: [{ id: 'wrong', kind: 'donor', label: 'Acme Holdings' }] }, mount: async () => { mounts++; } });
  await h.context.mountDiscoveryMap(overlap('Acme'));
  assert.equal(mounts, 0);
  assert.match(h.element('discover-map-root').innerHTML, /isn’t in the money map/);
});

test('closing during donor lookup prevents a late map mount', async () => {
  const data = deferred(); let mounts = 0;
  const h = harness({ mount: async () => { mounts++; } });
  h.context.loadMoneyData = () => data.promise;
  const pending = h.context.mountDiscoveryMap(overlap('Acme'));
  await h.context.mountDiscoveryMap(overlap('Acme')); // toggle closed
  data.resolve({ nodes: [{ id: 'acme', kind: 'donor', label: 'Acme' }] });
  await pending;
  assert.equal(mounts, 0);
  assert.equal(h.element('discover-map-area').hidden, true);
  assert.equal(h.element('discover-map-toggle').attributes['aria-expanded'], 'false');
});

test('late map handles are destroyed after selection or route invalidates the mount', { timeout: 1000 }, async () => {
  const mounted = deferred(); const entered = deferred(); let destroyed = 0; let focus;
  const h = harness({ money: { nodes: [{ id: 'acme-id', kind: 'donor', label: ' ACME ' }] },
    mount: async (_root, _url, options) => { focus = options.focus; entered.resolve(); return mounted.promise; } });
  const pending = h.context.mountDiscoveryMap(overlap('Acme'));
  await entered.promise;
  h.context.destroyDiscoveryMap();
  h.context.document.documentElement.dataset.panel = 'search';
  mounted.resolve({ destroy() { destroyed++; }, setPaused() {} });
  await pending;
  assert.equal(focus, 'acme-id');
  assert.equal(destroyed, 1);
  assert.equal(h.eval('discoveryMapHandle'), null);
});
