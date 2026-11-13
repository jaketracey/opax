import {industryName as sharedIndustryName} from '../public/money-scope.js';
import {displayName as sourceDisplayName} from '../public/display-name.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {DONOR_DECLARED_ONLY, PUBLIC_FUNDING_ONLY, donorLookup, hasPartyReceipts, notListedLine, publicFundingOnly, receiptFigures, receiptGraph, receiptGraphScope, receiptScopeLabel} from '../public/donor-disclosure.js';
import * as registerTables from '../public/register-tables.js';

// Every money figure a reader or Ask sees counts each gift once: the money
// graph's typed cells (by_type, by_type_year), from the parties' own returns.
// The legacy total/byYear also add the donor's own declaration of the same
// gift. These tests read the released graph and pin two flows:
//   Pratt Holdings -> Liberal: $10,454,400 across 70 receipts (legacy $16,095,373)
//   Westpac -> Labor:          $47,331,887 across 201 receipts (legacy $42,540,985)
const root = new URL('../', import.meta.url).pathname;
const published = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
const PRATT = 'donor:pratt', WESTPAC = 'donor:westpac banking corporation';
const PRATT_LIBERAL = 10454400, WESTPAC_LABOR = 47331887;
const SCOPE = 'All receipt types, 1998–99 to 2024–25, as the parties reported them in federal returns';
const edge = (graph, source, target) => graph.edges.find(e => e.source === source && e.target === target && !e.flow && !e.grant);

const built = await build({
  stdin: {contents: "export {callTool} from './src/tools/index';export {partyDonations} from './src/agentic-tools';", resolveDir: root},
  bundle: true, write: false, platform: 'node', format: 'esm', external: ['node:*'],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Money tests must never call a public service.'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
async function asset(path) {
  if (!cache.has(path)) {
    try { cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'))); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  return structuredClone(cache.get(path));
}
const env = {origin: 'https://opax.com.au', asset, ASSETS: {async fetch(req) { const body = await asset(new URL(req.url).pathname); return body ? Response.json(body) : new Response('missing', {status: 404}); }}};

test('the released graph still holds the two pinned flows, typed and legacy apart', () => {
  const pratt = edge(published, PRATT, 'party:Liberal'), westpac = edge(published, WESTPAC, 'party:Labor');
  assert.equal(Math.round(pratt.total), 16095373, 'legacy Pratt to Liberal (both sides of each gift)');
  assert.equal(Math.round(westpac.total), 42540985, 'legacy Westpac to Labor');
  assert.deepEqual([receiptFigures(pratt).total, receiptFigures(pratt).count], [PRATT_LIBERAL, 70]);
  assert.equal(Math.round(receiptFigures(westpac).total), WESTPAC_LABOR);
});

test('one rule: register-tables re-exports the donor-disclosure helpers', () => {
  // Node loads the stamped ?v= import as its own module instance, so compare the code.
  assert.equal(String(registerTables.receiptFigures), String(receiptFigures));
  assert.equal(String(registerTables.receiptScopeLabel), String(receiptScopeLabel));
});

test('receiptGraph reads donor-to-party edges and donor nodes through the typed cells, keeps party nodes and grants', () => {
  const graph = receiptGraph(published);
  assert.equal(receiptGraph(graph), graph, 'reading twice is a no-op');
  const pratt = edge(graph, PRATT, 'party:Liberal');
  assert.deepEqual([pratt.total, pratt.count, pratt.firstYear, pratt.lastYear], [PRATT_LIBERAL, 70, 1998, 2024]);
  assert.equal(Object.values(pratt.byYear).reduce((s, c) => s + c[0], 0), PRATT_LIBERAL, 'year cells re-sum to the total');
  assert.equal(Math.round(edge(graph, WESTPAC, 'party:Labor').total), WESTPAC_LABOR);
  const prattNode = graph.nodes.find(n => n.id === PRATT);
  assert.deepEqual([Math.round(prattNode.total), prattNode.count], [19572876, 120], 'the donor head figure on its page');
  const labor = graph.nodes.find(n => n.id === 'party:Labor'), released = published.nodes.find(n => n.id === 'party:Labor');
  assert.equal(labor, released, 'party nodes keep their own received totals');
  assert.equal(graph.edges.filter(e => e.grant || e.flow).length, published.edges.filter(e => e.grant || e.flow).length);
  const empty = published.edges.filter(e => !e.flow && !e.grant && e.by_type && !Object.keys(e.by_type).length).length;
  // Public Funding is never a donor flow (NSW Efa to the Greens, 2010-11, is its only receipt).
  const publicOnly = published.edges.filter(e => !e.flow && !e.grant && publicFundingOnly(e)).length;
  assert.ok(empty > 0);
  assert.equal(publicOnly, 1);
  assert.equal(graph.edges.length, published.edges.length - empty - publicOnly, 'an edge only the donor declared, or only public funding, is left out');
  assert.equal(receiptGraphScope(graph), SCOPE);
  assert.equal(receiptGraphScope({nodes: [], edges: [{source: 'a', target: 'b', total: 5, count: 1, byYear: {2020: [5, 1]}}]}), '', 'a state graph has no typed scope');
});

test('Ask money_totals gives the donor-page figure for a flow and a donor', async () => {
  const flow = await api.callTool(env, 'money_totals', {donor: 'Pratt Holdings Pty Ltd', party: 'Liberal'});
  assert.equal(flow.rows.length, 1);
  assert.deepEqual([flow.rows[0].total_aud, flow.rows[0].receipts], [PRATT_LIBERAL, 70]);
  assert.equal(flow.citations[0].value, PRATT_LIBERAL);
  assert.ok(flow.notes.some(n => n.includes(SCOPE)), 'the scope line travels with the figure');
  const westpac = await api.callTool(env, 'money_totals', {party: 'Labor', group_by: 'donor', limit: 20});
  const row = westpac.rows.find(r => r.donor === 'Westpac Banking Corporation');
  assert.equal(Math.round(row.total_aud), WESTPAC_LABOR);
  assert.equal(row.receipts, 201);
  const donor = await api.callTool(env, 'money_totals', {donor: 'Pratt Holdings Pty Ltd'});
  assert.deepEqual([Math.round(donor.rows[0].total_aud), donor.rows[0].receipts], [19572876, 120]);
  // A party total stays the party's own received figure (it includes transfers).
  const party = await api.callTool(env, 'money_totals', {party: 'Labor'});
  assert.equal(party.rows[0].total_aud, published.nodes.find(n => n.id === 'party:Labor').total);
});

test('Ask party_receipts ranks a party\'s sources by the typed figures', async () => {
  // All receipt types (measure=all_types: money from, receipts, paid); the donations measure is pinned below.
  const out = await api.partyDonations({asset, kb: async () => { throw Error('no retrieval'); }, origin: 'https://opax.com.au'}, {party: 'Liberal', limit: 15, measure: 'all_types'});
  const pratt = out.data.rows.find(r => /^Pratt Holdings/.test(r.donor));
  assert.deepEqual([pratt.total_aud, pratt.receipts], [PRATT_LIBERAL, 70]);
  assert.deepEqual(pratt.by_type, {donations_aud: 10034400, other_receipts_aud: 410000, subscriptions_aud: 0, untyped_aud: 10000}, 'each row gives its type breakdown');
  assert.ok(out.notes.some(n => n.includes(SCOPE)));
  const labor = await api.partyDonations({asset, kb: async () => ({}), origin: 'https://opax.com.au'}, {party: 'Labor', limit: 15, measure: 'all_types'});
  assert.equal(Math.round(labor.data.rows.find(r => r.donor === 'Westpac Banking Corporation').total_aud), WESTPAC_LABOR);
  // Donations (who gives, A34): Pratt's 60 Donation Received rows, and Westpac's $46.4m of other receipts as its own line.
  const given = await api.partyDonations({asset, kb: async () => ({}), origin: 'https://opax.com.au'}, {party: 'Liberal', limit: 15});
  assert.equal(given.data.measure, 'donations');
  assert.deepEqual([given.data.rows.find(r => /^Pratt Holdings/.test(r.donor)).total_aud, given.data.rows.find(r => /^Pratt Holdings/.test(r.donor)).receipts], [10034400, 60]);
  const laborGiven = await api.partyDonations({asset, kb: async () => ({}), origin: 'https://opax.com.au'}, {party: 'Labor', limit: 15});
  assert.ok(!laborGiven.data.rows.some(r => r.donor === 'Westpac Banking Corporation'), "Westpac's $875,018 in donations ranks below the top 15");
  assert.equal(laborGiven.data.other_receipts.find(r => r.donor === 'Westpac Banking Corporation').other_receipts_aud, 46358124);
  const window = await api.partyDonations({asset, kb: async () => ({}), origin: 'https://opax.com.au'}, {party: 'Liberal', from_year: 2020, to_year: 2020, limit: 15, measure: 'all_types'});
  const typed2020 = Object.values(edge(published, PRATT, 'party:Liberal').by_type_year['2020-21']).reduce((s, c) => s + c[0], 0);
  assert.equal(window.data.rows.find(r => /^Pratt Holdings/.test(r.donor)).total_aud, typed2020, 'a year window sums the typed year cells');
});

test('Ask entity_profile receipts: a supplier\'s linked flows carry the typed figures and scope', async () => {
  const out = await api.callTool(env, 'entity_profile', {kind: 'supplier', record_id: 's-23b64272b4a191508d69', section: 'receipts', limit: 8});
  const labor = out.rows.find(r => r.party === 'Labor');
  assert.equal(Math.round(labor.amount_aud), WESTPAC_LABOR);
  assert.equal(labor.records, 201);
  assert.match(labor.summary, /All receipt types, 1998–99 to 2024–25/);
});

// ---- Pages readers see -------------------------------------------------------
import {execFileSync} from 'node:child_process';
import {renderMoneyConnectionsTable} from '../src/money-connections-table.ts';
import {renderMoneyAnswer} from '../src/seo-content.ts';
import {journeyStoryContext} from '../src/journey-story.ts';
import {buildMoneyJourneys} from '../public/money-journeys-data.js';
import {donorSearchRecord} from '../../scripts/build_search_catalog.mjs';

const readPublic = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'));
const money = n => '$' + Math.round(n).toLocaleString('en-AU');

test('crawler /money text sums the typed flows and carries the scope line; state graphs keep theirs', async () => {
  const {html} = await renderMoneyAnswer('Public money', readPublic);
  const federal = html.slice(html.indexOf('Federal disclosed receipts'), html.indexOf('Queensland disclosed receipts'));
  const typed = receiptGraph(published).edges.filter(e => !e.flow && !e.grant && published.nodes.find(n => n.id === e.source)?.kind === 'donor');
  const legacy = published.edges.filter(e => !e.flow && !e.grant && published.nodes.find(n => n.id === e.source)?.kind === 'donor');
  assert.ok(typed.length < legacy.length);
  assert.ok(federal.includes(SCOPE), 'scope line under the heading');
  assert.match(federal, new RegExp(`across ${typed.length.toLocaleString('en-AU')} source-to-party totals`));
  assert.doesNotMatch(federal, new RegExp(`across ${legacy.length.toLocaleString('en-AU')} source-to-party totals`));
  const qld = html.slice(html.indexOf('Queensland disclosed receipts'));
  assert.doesNotMatch(qld.slice(0, 400), /All receipt types/, 'a state graph has no typed scope');
});

test('no-JavaScript Connections table: Pratt to Liberal and Westpac to Labor at their typed figures', async () => {
  const page = async query => {
    const html = await renderMoneyConnectionsTable(new URL('https://opax.test/money?' + query), readPublic);
    return {html, rows: JSON.parse(html.match(/<script type="application\/json" data-dt-page>([\s\S]*?)<\/script>/)[1]).rows};
  };
  const pratt = await page('jur=federal&c.q=Pratt');
  assert.ok(pratt.html.includes(`Receipts: ${SCOPE}.`));
  const liberal = pratt.rows.find(r => r.from === 'Pratt Holdings Pty Ltd' && r.to === 'Liberal');
  assert.deepEqual([liberal.value, liberal.records], [PRATT_LIBERAL, 70]);
  const westpac = (await page('jur=federal&c.q=Westpac')).rows.find(r => r.from === 'Westpac Banking Corporation' && r.to === 'Labor');
  assert.deepEqual([Math.round(westpac.value), westpac.records], [WESTPAC_LABOR, 201]);
  // Windowed to 2020-21: the typed year cell, and the scope names that year.
  const year = await page('jur=federal&from=2020&to=2020&c.q=Pratt');
  assert.ok(year.html.includes('Receipts: All receipt types, 2020–21, as the parties reported them in federal returns.'));
  const typed2020 = Object.values(edge(published, PRATT, 'party:Liberal').by_type_year['2020-21']).reduce((sum, c) => sum + c[0], 0);
  assert.equal(year.rows.find(r => r.from === 'Pratt Holdings Pty Ltd' && r.to === 'Liberal').value, typed2020);
  assert.doesNotMatch((await page('jur=qld')).html, /Receipts: All receipt types/, 'a state graph has no typed scope');
});

test('money journeys and /api/journey-story read the typed flows', () => {
  const journeys = buildMoneyJourneys(published, {'multiple-parties': PRATT});
  const parties = journeys.find(j => j.id === 'multiple-parties');
  if (parties?.selection === PRATT) {
    const first = parties.steps.find(s => s.metric?.format === 'currency');
    assert.equal(first.metric.value, PRATT_LIBERAL, 'Pratt\'s largest party connection is Liberal at the typed figure');
  }
  const westpac = buildMoneyJourneys(published, {'multiple-parties': WESTPAC}).find(j => j.id === 'multiple-parties');
  assert.equal(westpac.selection, WESTPAC);
  const lead = westpac.steps.find(s => s.metric?.format === 'currency');
  assert.equal(Math.round(lead.metric.value), WESTPAC_LABOR);
  const context = journeyStoryContext(published, 'multiple-parties', WESTPAC);
  assert.equal(context.receiptMeasure, SCOPE);
  const facts = context.steps.flatMap(s => s.facts);
  assert.ok(facts.some(f => f.to === 'Labor' && f.amount === money(WESTPAC_LABOR)), JSON.stringify(facts.slice(0, 3)));
  assert.ok(!facts.some(f => f.to === 'Labor' && f.amount === money(42540985)), 'never the legacy figure');
});

test('search snippets: donor and flow records give the typed figure with the scope line', () => {
  const pratt = published.nodes.find(n => n.id === PRATT);
  const record = donorSearchRecord('federal', pratt);
  assert.match(record.snippet, /\$19\.6m|\$19,572,876|19\.57/);
  assert.match(record.snippet, /across 120 records\./);
  assert.ok(record.snippet.includes(SCOPE));
  assert.doesNotMatch(record.snippet, /31\.7m|221 records/);
  const state = donorSearchRecord('qld', {id: 'donor:x', kind: 'donor', label: 'Example Pty Ltd', total: 500, count: 2, firstYear: 2020, lastYear: 2021});
  assert.match(state.snippet, /across 2 records\.$/, 'a state donor keeps its record figures and has no scope');
});

// The exporter's Python copy of the rule (scripts/export_interests.py) against the JS rule:
// receiptFigures on every edge and donor, and the person-page ties load_tie_registers writes
// against receiptGraph's donor-to-party edges, grouped by source as the exporter groups them.
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function pythonTies(graph) {
  const dir = mkdtempSync(join(tmpdir(), 'opax-ties-'));
  try {
    const money = join(dir, 'money.json'), empty = join(dir, 'empty.json');
    writeFileSync(money, JSON.stringify(graph)); writeFileSync(empty, '{}');
    const script = `import json,sys\nsys.path.insert(0,${JSON.stringify(new URL('../../', import.meta.url).pathname)})\nfrom scripts import export_interests as x\n`
      + `g=json.load(open(sys.argv[1]))\nrows=[*g['edges'],*[n for n in g['nodes'] if n.get('kind')=='donor']]\n`
      + `figures=[[f['total'],f['count'],f['firstYear'],f['lastYear'],f['typed']] for f in map(x.receipt_figures,rows)]\n`
      + `ties=x.load_tie_registers(sys.argv[1],sys.argv[2],sys.argv[2])[5]\nprint(json.dumps({'figures':figures,'ties':ties}))`;
    return JSON.parse(execFileSync('python3', ['-I', '-c', script, money, empty], {encoding: 'utf8', maxBuffer: 64 << 20}));
  } finally { rmSync(dir, {recursive: true, force: true}); }
}
function jsTies(graph) {
  const ties = {};
  for (const e of receiptGraph(graph).edges) {
    if (!String(e.source).startsWith('donor:') || e.grant || e.flow) continue;
    (ties[e.source] ||= []).push({party: String(e.target).replace(/^party:/, ''), total: Math.round(e.total), from: e.firstYear ?? null, to: e.lastYear ?? null, ...(e.typed ? {typed: true} : {})});
  }
  for (const rows of Object.values(ties)) rows.sort((a, b) => b.total - a.total || (a.party < b.party ? -1 : a.party > b.party ? 1 : 0));
  return ties;
}
function assertSameRule(graph, label) {
  const py = pythonTies(graph);
  const rows = [...graph.edges, ...graph.nodes.filter(n => n.kind === 'donor')];
  assert.equal(py.figures.length, rows.length, label);
  rows.forEach((row, i) => {
    const f = receiptFigures(row);
    assert.deepEqual(py.figures[i].map((v, j) => j === 0 ? Math.round(v) : v), [Math.round(f.total), f.count, f.firstYear, f.lastYear, f.typed], `${label}: ${row.id || row.source + '>' + row.target}`);
  });
  assert.deepEqual(py.ties, jsTies(graph), `${label}: person-page ties`);
  return py;
}
// Invented records, one for each branch the released graph never reaches.
const TIE_FIXTURE = {meta: {}, nodes: [
  {id: 'party:Labor', kind: 'party', label: 'Labor'}, {id: 'party:Liberal', kind: 'party', label: 'Liberal'},
  {id: 'donor:alpha example', kind: 'donor', label: 'Alpha Example Pty Ltd', by_type: {donation_received: 3000, other_receipt: 500.4},
    by_type_year: {'2017-18': {donation_received: [1000, 1]}, 'Eden-Monaro by-election': {donation_received: [2000, 2]}, 'unknown': {other_receipt: [500.4, 1]}, '2010-11': {donation_received: [0, 0]}}},
  {id: 'donor:beta example', kind: 'donor', label: 'Beta Example Ltd', total: 9000, count: 1},
  {id: 'donor:gamma example', kind: 'donor', label: 'Gamma Example Ltd', total: 700, count: 2, firstYear: 2001, lastYear: 2003},
], edges: [
  // A by-election period (polling year 2020), an undated cell and a zero-count cell (2010-11, no receipts).
  {source: 'donor:alpha example', target: 'party:Labor', total: 9999, count: 9, firstYear: 2005, lastYear: 2021, byYear: {2005: [9999, 9]},
    by_type: {donation_received: 3000, other_receipt: 500.4},
    by_type_year: {'2017-18': {donation_received: [1000, 1]}, 'Eden-Monaro by-election': {donation_received: [2000, 2]}, 'unknown': {other_receipt: [500.4, 1]}, '2010-11': {donation_received: [0, 0]}}},
  // Only the donor declared it: empty typed cells, so no tie.
  {source: 'donor:alpha example', target: 'party:Liberal', total: 4000, count: 2, firstYear: 2012, lastYear: 2012, byYear: {2012: [4000, 2]}, by_type: {}, by_type_year: {}},
  // A grant edge from a donor is not a receipt.
  {source: 'donor:beta example', target: 'party:Labor', grant: true, total: 9000, count: 1, firstYear: 2019, lastYear: 2019},
  // No typed cells (a state graph's shape): its record figures stand.
  {source: 'donor:gamma example', target: 'party:Liberal', total: 700, count: 2, firstYear: 2001, lastYear: 2003, byYear: {2001: [300, 1], 2003: [400, 1]}},
]};

test('person page ties: the exporter\'s Python copy of the rule matches the JS rule on every released donor and on invented edge cases', () => {
  const released = assertSameRule(published, 'released graph');
  assert.deepEqual(released.ties[PRATT].find(f => f.party === 'Liberal'), {party: 'Liberal', total: PRATT_LIBERAL, from: 1998, to: 2024, typed: true});
  assert.equal(released.ties[WESTPAC].find(f => f.party === 'Labor').total, WESTPAC_LABOR);
  assert.ok(Object.keys(released.ties).length > 300, 'every released donor with a party-reported flow');
  const fixture = assertSameRule(TIE_FIXTURE, 'invented fixture');
  // Spelled out, so a change to both copies at once still shows here.
  assert.deepEqual(fixture.ties, {
    'donor:alpha example': [{party: 'Labor', total: 3500, from: 2017, to: 2020, typed: true}],
    'donor:gamma example': [{party: 'Liberal', total: 700, from: 2001, to: 2003}],
  });
});

// ---- app.js: the Ask industry panel, topic money and the donors directory -----
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import ts from 'typescript';

async function appFunctions(names) {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names.map(name => {
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(fn, name);
    return source.slice(fn.getStart(ast), fn.end);
  }).join('\n');
}
const appContext = extra => ({
  sharedIndustryName, sourceDisplayName,
  esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;'), fmtMoney: v => `$${Math.round(v)}`,
  donorRows: (rows, _index, limit = Infinity) => [...rows].sort((a, b) => b[1] - a[1]).slice(0, limit), donorViewIndex: new Map(),
  subjectHash: (kind, name) => `#/${kind}/${name}`, partyDotHTML: () => '', explainBtn: () => '', AEC_NOTE: 'AEC note.',
  hasPartyReceipts, DONOR_DECLARED_ONLY, notListedLine, receiptScopeLabel,
  ...extra,
});
// Typed sums for one industry, worked out here from by_type (not through receiptGraph).
const byTypeTotal = x => Object.values(x.by_type || {}).reduce((a, b) => a + b, 0);
function industrySums(industry) {
  const donors = published.nodes.filter(n => n.kind === 'donor' && (n.industry === industry || n.group === industry));
  const ids = new Set(donors.map(n => n.id));
  const toLabor = published.edges.filter(e => ids.has(e.source) && e.target === 'party:Labor' && !e.flow && !e.grant);
  return {typedTotal: donors.reduce((sum, n) => sum + byTypeTotal(n), 0), legacyTotal: donors.reduce((sum, n) => sum + (n.total || 0), 0),
    toLabor: toLabor.reduce((sum, e) => sum + byTypeTotal(e), 0)};
}
const dollars = n => '$' + Math.round(n);

test('Ask industry panel: finance totals, Westpac and the Labor bar are the typed figures, with the scope line', async () => {
  const box = new JSDOM('<div id="ask-money"></div>').window.document.getElementById('ask-money');
  const context = appContext({$: () => box, moneyReceipts: receiptGraph(published), moneyReceiptScope: receiptGraphScope(published)});
  runInNewContext(`${await appFunctions(['renderMoneyPanel', 'industryLabel', 'barList', 'tile'])}\nthis.panel=renderMoneyPanel;`, context);
  context.panel('finance');
  const sums = industrySums('finance');
  assert.notEqual(Math.round(sums.typedTotal), Math.round(sums.legacyTotal));
  assert.equal(box.querySelector('.entry-scope').textContent, SCOPE);
  assert.ok(box.querySelector('.tiles').textContent.includes(dollars(sums.typedTotal)), box.querySelector('.tiles').textContent);
  assert.ok(!box.querySelector('.tiles').textContent.includes(dollars(sums.legacyTotal)));
  const [sources, parties] = box.querySelectorAll('figure.chart');
  const westpacNode = receiptGraph(published).nodes.find(n => n.id === WESTPAC);
  assert.ok(sources.textContent.includes(dollars(westpacNode.total)), 'Westpac at its typed donor figure');
  assert.ok(parties.textContent.includes(dollars(sums.toLabor)), 'finance to Labor at the typed flows');
});

test('topic money: the industry total and its largest sources are the typed figures, with the scope line', async () => {
  const context = appContext({moneyReceipts: receiptGraph(published), moneyReceiptScope: receiptGraphScope(published)});
  runInNewContext(`${await appFunctions(['topicMoneyHTML', 'industryLabel', 'barList'])}\nthis.topic=topicMoneyHTML;`, context);
  const doc = new JSDOM(context.topic('finance')).window.document;
  assert.equal(doc.querySelector('.ui-section-note b').textContent, dollars(industrySums('finance').typedTotal));
  assert.equal(doc.querySelector('figure .entry-scope').textContent, SCOPE);
});

test('donors directory: Pratt Holdings at $19.6m across 120 receipts, Liberal and Labor at the typed figures', async () => {
  const qld = await readPublic('/graph/money.qld.json');
  const build = async files => {
    const context = appContext({
      donorViewReady: Promise.resolve(), loadMoneyFile: async jur => files[jur] ?? {nodes: []}, loadAccess: async () => ({}), loadFits: async () => ({}),
      receiptGraph, receiptGraphScope, STATE_NOT_SUMMED: '', byNumDesc: () => () => 0, byName: () => 0, moneyFor: () => 0,
    });
    runInNewContext(`${await appFunctions(['buildDonorsDirectory', 'normName', 'industryLabel'])}\nthis.directory=buildDonorsDirectory;`, context);
    return context.directory();
  };
  // The directory's party list sums every jurisdiction's flows; the federal ones are checked on their own.
  const directory = await build({federal: published});
  const pratt = directory.items.find(d => d.label === 'Pratt Holdings Pty Ltd');
  assert.deepEqual([Math.round(pratt.money.federal.total), pratt.money.federal.count], [19572876, 120]);
  assert.equal(pratt.parties.get('Liberal'), PRATT_LIBERAL);
  assert.equal(Math.round(directory.items.find(d => d.label === 'Westpac Banking Corporation').parties.get('Labor')), WESTPAC_LABOR);
  assert.equal(directory.lede, `AEC returns: ${SCOPE}`);
  const both = await build({federal: published, qld});
  assert.equal(Math.round(both.items.find(d => d.label === 'Pratt Holdings Pty Ltd').money.federal.total), 19572876);
  const state = both.items.find(d => d.money.qld && !d.money.federal);
  const node = qld.nodes.find(n => n.kind === 'donor' && n.label === state.label);
  assert.equal(state.money.qld.total, node.total, 'a state donor keeps its record figure');
});

test('app.js keeps one projected graph beside moneyData, from donor-views.js', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes('moneyReceipts = module.receiptGraph(d);'));
  assert.ok(source.includes('({displayName:sourceDisplayName,fy,moneyScope,industryName:sharedIndustryName,donorRows,donorDisclosure,donorLabelHTML,receiptGraph,receiptGraphScope,receiptScopeLabel,receiptTypeLine,receiptFigures,hasPartyReceipts,DONOR_DECLARED_ONLY,notListedLine}=module);'));
});

// ---- Games: the ledger, the quiz's donor and industry questions, words per dollar ----
import {buildFlows, buildCSV, aggregateDonors} from '../public/ledger.js';
import {makeQuizContext} from '../public/quiz.js';

test('ledger: Pratt to Liberal and Westpac to Labor at their typed figures, in the table and the CSV', () => {
  const flows = buildFlows(published);
  const pratt = flows.find(f => f.donorId === PRATT && f.party === 'Liberal');
  assert.deepEqual([pratt.total, pratt.count, pratt.firstYear, pratt.lastYear], [PRATT_LIBERAL, 70, 1998, 2024]);
  assert.equal(Math.round(flows.find(f => f.donorId === WESTPAC && f.party === 'Labor').total), WESTPAC_LABOR);
  assert.match(buildCSV('flows', [pratt], []), new RegExp(`,Liberal,${PRATT_LIBERAL},70,1998,2024,`));
  const donor = aggregateDonors(flows).find(d => d.donorId === PRATT);
  assert.equal(Math.round(donor.total), 19572876, 'the donor row sums its typed flows: the donor page head figure');
  assert.equal(flows.length, published.edges.filter(e => !e.flow && !e.grant && e.by_type && Object.keys(e.by_type).length && !publicFundingOnly(e) && published.nodes.find(n => n.id === e.source)?.kind === 'donor').length,
    'a flow only the donor declared, or only public funding, is left out');
});

test('ledger source line says what its figures count', async () => {
  const source = await readFile(new URL('../public/ledger.js', import.meta.url), 'utf8');
  assert.ok(source.includes("...(measured ? [['Measured as', esc(measured)]] : []),"));
  assert.ok(source.includes('const measured = receiptGraphScope(data)'));
});

test('quiz: donor and industry questions read the typed figures; party questions keep the party nodes', () => {
  const ctx = makeQuizContext({money: published});
  assert.equal(Math.round(ctx.donorsById.get(PRATT).total), 19572876);
  assert.equal(ctx.donorsById.get(PRATT).count, 120);
  const finance = published.nodes.filter(n => n.kind === 'donor' && n.industry === 'finance');
  assert.equal(Math.round(ctx.industries.get('finance').total), Math.round(finance.reduce((sum, n) => sum + byTypeTotal(n), 0)));
  assert.equal(edge(ctx.money, PRATT, 'party:Liberal').total, PRATT_LIBERAL, 'the industry-to-party question sums typed flows');
  assert.equal(ctx.parties.find(p => p.id === 'party:Labor'), published.nodes.find(n => n.id === 'party:Labor'));
});

test('words per dollar: each industry panel sums the typed flows by party, with the scope line', async () => {
  const source = await readFile(new URL('../public/wordsdollars.js', import.meta.url), 'utf8');
  assert.ok(source.includes('const money = receiptGraph(raw)'));
  assert.ok(source.includes("fineEl.prepend(el('span', 'wd-measure', `Receipts: ${measured}. `))"));
  const ast = ts.createSourceFile('wordsdollars.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildPanel');
  const context = {canonParty: name => name};
  runInNewContext(`${source.slice(fn.getStart(ast), fn.end)}\nthis.buildPanel=buildPanel;`, context);
  const panel = context.buildPanel({topic: 'banking', industries: ['finance']}, {parties: [], cells: {}, totals: {}}, receiptGraph(published));
  assert.equal(Math.round(panel.rows.find(r => r.party === 'Labor').money), Math.round(industrySums('finance').toLabor));
});

// ---- Scope lines where the figure is shown (round 2) ---------------------------
import {researchReceiptScope} from '../public/map-research.js';
import {TEMPLATES, createRng} from '../public/quiz.js';

test('the shared scope label names the map\'s Donation-only measure, and register-tables keeps financialYear in scope', async () => {
  assert.equal(receiptScopeLabel({typed: true, firstYear: 2020, lastYear: 2022}), 'All receipt types, 2020–21 to 2022–23, as the parties reported them in federal returns');
  assert.equal(receiptScopeLabel({typed: true, firstYear: 2020, lastYear: 2022}, 'donation_only'), 'Donations only, 2020–21 to 2022–23, as the parties reported them in federal returns');
  const source = await readFile(new URL('../public/register-tables.js', import.meta.url), 'utf8');
  assert.match(source, /^import \{donorDisclosure, financialYear, receiptFigures, receiptScopeLabel\} from '\.\/donor-disclosure\.js\?v=/m);
});

test('journeys: each step with a receipt figure carries the scope line; a dated window names its own years; state graphs get none', async () => {
  const allianz = buildMoneyJourneys(published, {'multiple-parties': 'donor:allianz australia'}).find(j => j.id === 'multiple-parties');
  assert.equal(allianz.selection, 'donor:allianz australia');
  const [count, largest, next, side] = allianz.steps;
  assert.equal(count.scope, undefined, 'a count of parties is not a receipt figure');
  const labor = receiptGraph(published).edges.find(e => e.source === 'donor:allianz australia' && e.target === 'party:Labor' && !e.flow && !e.grant);
  assert.equal(largest.scope, receiptScopeLabel({typed: true, firstYear: labor.firstYear, lastYear: labor.lastYear}));
  assert.ok(next.scope && side.scope && side.breakdown.length, 'the next link and the side-by-side chart say what they count');
  const time = buildMoneyJourneys(published).find(j => j.id === 'over-time');
  const pickedTime = buildMoneyJourneys(published, {'over-time': time.choices[0].value}).find(j => j.id === 'over-time');
  const [earlier, later, change] = pickedTime.steps;
  assert.equal(earlier.scope, receiptScopeLabel({typed: true, firstYear: earlier.scene.from, lastYear: earlier.scene.to}));
  assert.equal(later.scope, receiptScopeLabel({typed: true, firstYear: later.scene.from, lastYear: later.scene.to}));
  assert.equal(change.scope, receiptScopeLabel({typed: true, firstYear: earlier.scene.from, lastYear: later.scene.to}));
  const qld = await readPublic('/graph/money.qld.json');
  assert.ok(buildMoneyJourneys(qld).every(j => j.steps.every(s => s.scope === undefined)));
  const ui = await readFile(new URL('../public/money-journeys.js', import.meta.url), 'utf8');
  assert.ok(ui.includes('${current.scope ? `<p class="journey-scope">${esc(current.scope)}</p>` : \'\'}'));
});

test('map research: the records table says what its receipt figures count, for the window and measure the map hands over', () => {
  // The map's own reading of the file (graph/index.ts receiptGraphView): typed edges keep
  // by_type, and their years are the selected window's.
  const view = {nodes: published.nodes, edges: published.edges.filter(e => e.source === PRATT).map(e => e.flow || e.grant ? e : {...e, firstYear: 2019, lastYear: 2022})};
  assert.equal(researchReceiptScope(view, 'https://opax.com.au/money?from=2019&to=2022'), 'Receipts: All receipt types, 2019–20 to 2022–23, as the parties reported them in federal returns.');
  assert.equal(researchReceiptScope(view, 'https://opax.com.au/money?receipt=donations'), 'Receipts: Donations only, 2019–20 to 2022–23, as the parties reported them in federal returns.');
  assert.equal(researchReceiptScope({nodes: [], edges: [{source: 'donor:x', target: 'party:y', total: 5, count: 1, byYear: {2020: [5, 1]}}]}, 'https://opax.com.au/money'), '', 'a state graph has no typed cells');
});

test('quiz: donor and industry answers carry the scope line in the reveal; party questions do not', async () => {
  const ctx = makeQuizContext({money: published});
  assert.equal(ctx.receiptScope, SCOPE);
  const typed = ['money-industry-most', 'money-industry-magnitude', 'money-party-from-industry', 'money-donor-higher-lower', 'money-donor-order', 'money-donor-figure'];
  for (const id of typed) {
    const q = TEMPLATES.find(t => t.id === id).build(ctx, createRng(7));
    assert.ok(q, id);
    assert.equal(q.scope, SCOPE, id);
  }
  const party = TEMPLATES.find(t => t.id === 'money-party-peak-year').build(ctx, createRng(7));
  assert.ok(party && party.scope === undefined, 'party totals are a different measure');
  assert.equal(makeQuizContext({money: await readPublic('/graph/money.qld.json')}).receiptScope, '');
  const source = await readFile(new URL('../public/quiz.js', import.meta.url), 'utf8');
  assert.ok(source.includes('"Source: " + q.source + ". " + (q.scope ? q.scope + ". " : "")'));
});

test('person page ties: the scope line shows once the exporter marks the flows typed, and the note follows it', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes('const tieScope = tieFlows.length && tieFlows.every((f) => f.typed) ? registerTables.receiptScopeLabel({'));
  assert.ok(source.includes('${tieScope ? `<p class="entry-scope">Receipts: ${esc(tieScope)}.</p>` : ""}'));
  const py = await readFile(new URL('../../scripts/export_interests.py', import.meta.url), 'utf8');
  assert.ok(py.includes('**({"typed": True} if figures["typed"] else {}),'));
});

// ---- Donors and flows only their own donor return declares (round 3) ------------
// receiptGraph drops 139 flows whose typed cells are empty: the parties' returns list no
// receipt for them. Eleven donors have no other flow, so their typed total is 0. No surface
// may show such a donor at $0: each says what is true (DONOR_DECLARED_ONLY) instead.
// A donor whose only receipt is Public Funding (NSW Efa) is also left out, with its own line (PUBLIC_FUNDING_ONLY).
const DECLARED_ONLY = published.nodes.filter(n => n.kind === 'donor' && !hasPartyReceipts(n) && !publicFundingOnly(n));
const PUBLIC_ONLY = published.nodes.filter(n => n.kind === 'donor' && publicFundingOnly(n));
const GOLDMAN = 'donor:goldman sachs australia';
const ZERO = /\$0(?:\.00)?(?![\d.,])/;

test('one predicate: hasPartyReceipts picks out the released donors and flows only their own returns declare', () => {
  // 13 Nov 2026: 10 to 11, IT Alliance Australia, whose only row is its own 2019-20 declaration of $1,000 to the
  // Liberal Democratic Party (ACT Branch); the party's return lists no such receipt.
  assert.equal(DECLARED_ONLY.length, 11);
  assert.ok(DECLARED_ONLY.every(n => !Object.keys(n.by_type).length && n.total > 0), 'each holds a record figure from its own declarations');
  assert.ok(DECLARED_ONLY.some(n => n.id === GOLDMAN));
  const dropped = published.edges.filter(e => !e.grant && !e.flow && !hasPartyReceipts(e));
  // 13 Nov 2026: 130 to 139 donor-declared flows, the nine to the Libertarian Party that only the donor's own return declares
  // (Ancora, Australian Energy Producers, Chevron, Australian Hotels Association, IAG, IT Alliance, Deloitte, Allianz, Sanofi).
  assert.equal(dropped.length, 140, '139 only the donor declared and 1 only public funding');
  assert.deepEqual(PUBLIC_ONLY.map(n => n.id), ['donor:nsw efa']);
  assert.equal(receiptGraph(published).edges.length, published.edges.length - dropped.length, 'receiptGraph drops exactly those flows');
  assert.equal(hasPartyReceipts({total: 0, count: 0}), true, 'a record without typed cells (a state graph) keeps its figures');
});

test('a declared-only flow to a renamed party: the former name before the new one was registered, the current name after', async () => {
  // Invented: Allianz's $500 moved to 2024-25, after the Libertarian Party was registered (12 January 2024).
  const moved = structuredClone(published);
  const flow = moved.edges.find(e => e.source === 'donor:allianz australia' && e.target === 'party:Libertarian Party');
  Object.assign(flow, {byYear: {2024: [500, 1]}, firstYear: 2024, lastYear: 2024});
  const movedEnv = {...env, asset: async path => path === '/graph/money.json' ? structuredClone(moved) : asset(path)};
  movedEnv.ASSETS = {async fetch(req) { const body = await movedEnv.asset(new URL(req.url).pathname); return body ? Response.json(body) : new Response('missing', {status: 404}); }};
  const out = await api.callTool(movedEnv, 'money_totals', {donor: 'donor:allianz australia', party: 'Libertarian Party'});
  assert.deepEqual(out.donor_declared, [{party: 'Libertarian Party', donor_declared_aud: 500, records: 1, period: '2024-25'}]);
  assert.match(out.citations[0].text, /declares \$500 to Libertarian Party across 1 record \(2024-25\)\. Libertarian Party's own returns list no receipt/);
  // FY 2022-23 ends 30 June 2023, before the registration: still the former name.
  Object.assign(flow, {byYear: {2022: [500, 1]}, firstYear: 2022, lastYear: 2022});
  const before = await api.callTool(movedEnv, 'money_totals', {donor: 'donor:allianz australia', party: 'Libertarian Party'});
  assert.equal(before.donor_declared[0].party, 'Liberal Democratic Party');
});

test('Ask money_totals: never a $0 donor row; a flow only the donor declared is said as the donor\'s declaration', async () => {
  for (const n of DECLARED_ONLY) {
    const out = await api.callTool(env, 'money_totals', {donor: n.id});
    assert.equal(out.rows.length, 0, n.label);
    assert.ok(out.coverage_only && out.donor_declared.length && out.donor_declared.every(r => r.donor_declared_aud > 0), n.label);
    assert.doesNotMatch(out.citations[0].text, ZERO, n.label);
    assert.match(out.citations[0].text, /own donor returns? declares? \$[\d,]+ .*list no receipt from .*donor's declarations?, not (a receipt|receipts) a party reported\.$/, n.label);
  }
  const goldman = await api.callTool(env, 'money_totals', {donor: GOLDMAN});
  assert.equal(goldman.citations[0].text, "Goldman Sachs Australia Pty Ltd's own donor returns declare $847,340 to federal parties across 65 records: Liberal $513,590 (2002-03 to 2010-11); Labor $330,450 (2002-03 to 2010-11); Nationals $3,300 (2006-07). The parties' own returns list no receipt from Goldman Sachs Australia Pty Ltd, so OPAX's figures, which count each gift once from the party's own return, do not include them. The amounts are the donor's declarations, not receipts a party reported.");
  const flow = await api.callTool(env, 'money_totals', {donor: GOLDMAN, party: 'Labor'});
  assert.deepEqual(flow.donor_declared, [{party: 'Labor', donor_declared_aud: 330450, records: 27, period: '2002-03 to 2010-11'}]);
  assert.match(flow.citations[0].text, /^Goldman Sachs Australia Pty Ltd's own donor returns declare \$330,450 to Labor across 27 records \(2002-03 to 2010-11\)\. Labor's own returns list no receipt from/);
  const byParty = await api.callTool(env, 'money_totals', {donor: GOLDMAN, group_by: 'party'});
  assert.deepEqual(byParty.donor_declared.map(r => r.party), ['Liberal', 'Labor', 'Nationals']);
  // A donor with both kinds: the counted flows as rows, the declared-only one as a note.
  const allianz = await api.callTool(env, 'money_totals', {donor: 'donor:allianz australia', group_by: 'party'});
  assert.deepEqual(allianz.rows.map(r => r.party), ['Labor', 'Liberal', 'Nationals']);
  // 13 Nov 2026: Allianz's own 2018-19 declaration of $500 to the Liberal Democratic Party joins the note; that party's return lists no such receipt.
  // It names the party as the gift was made, before the Libertarian Party was registered (#344, labels.js PARTY_RENAMES).
  assert.ok(allianz.notes.some(n => n.startsWith("Not counted above: Allianz Australia Limited's own donor returns declare $68,298 to federal parties across 19 records: LNP $67,798 (2011-12 to 2022-23); the Liberal Democratic Party (now the Libertarian Party) $500 (2018-19).")));
  assert.deepEqual(allianz.donor_declared.at(-1), {party: 'Liberal Democratic Party', party_now: 'Libertarian Party', donor_declared_aud: 500, records: 1, period: '2018-19'}, 'the writer gets the recorded name too');
  const itAlliance = await api.callTool(env, 'money_totals', {donor: 'donor:it alliance australia'});
  assert.match(itAlliance.citations[0].text, /^IT Alliance Australia Pty Ltd's own donor return declares \$1,000 to the Liberal Democratic Party \(now the Libertarian Party\) across 1 record \(2019-20\)\. The Liberal Democratic Party's own returns list no receipt/);
  // A ranking holds only donors the parties' returns list.
  const ranked = await api.callTool(env, 'money_totals', {group_by: 'donor', limit: 20});
  assert.equal(ranked.matched, published.nodes.filter(n => n.kind === 'donor' && hasPartyReceipts(n)).length);
  assert.ok(ranked.rows.every(r => r.total_aud > 0));
});

test('donors directory: no row at $0; declared-only donors carry the labelled line; off-map federal rows retain selected receipts', async () => {
  const index = await readPublic('/graph/donor-index.json');
  const graphs = {federal: published, qld: await readPublic('/graph/money.qld.json'), vic: await readPublic('/graph/money.vic.json'), tas: await readPublic('/graph/money.tas.json')};
  const context = appContext({
    donorViewReady: Promise.resolve(), loadMoneyFile: async jur => graphs[jur], loadAccess: async () => ({}), loadFits: async () => ({}),
    receiptGraph, receiptGraphScope, STATE_NOT_SUMMED: '', byNumDesc: () => () => 0, byName: () => 0, moneyFor: () => 0,
    donorViewIndex: donorLookup(index.donors), donorGroupColour: () => '#000', donorNameHTML: name => name, entityHrefAttr: href => `href="${href}"`,
    anyPartyDotHTML: () => '', yearSpan: (a, b) => `${a}-${b}`,
  });
  runInNewContext(`${await appFunctions(['buildDonorsDirectory', 'normName', 'industryLabel'])}\nthis.directory=buildDonorsDirectory;`, context);
  const directory = await context.directory();
  const html = directory.items.map(d => [d, directory.row(d)]);
  for (const [d, row] of html) assert.doesNotMatch(row, /<b>\$0<\/b>/, d.label);
  const declared = html.filter(([d]) => d.declaredOnly === DONOR_DECLARED_ONLY);
  assert.equal(declared.length, DECLARED_ONLY.length);
  const publicOnly = html.filter(([d]) => d.declaredOnly === PUBLIC_FUNDING_ONLY);
  assert.deepEqual(Array.from(publicOnly, ([d]) => String(d.label)), PUBLIC_ONLY.map(n => n.label));
  for (const [d, row] of publicOnly) assert.ok(row.includes(`AEC returns: ${PUBLIC_FUNDING_ONLY}`), d.label);
  for (const [d, row] of declared) {
    assert.ok(row.includes(`AEC returns: ${DONOR_DECLARED_ONLY}`), d.label);
    assert.doesNotMatch(row, /class="dir-fig"/, d.label);
  }
  assert.ok(directory.filters.find(f => f.key === 'jur').test(declared[0][0], 'federal'), 'still listed as disclosed to the AEC');
  const offMap = html.filter(([d]) => d.recordMeasure && d.money.federal);
  assert.equal(offMap.length,0,'retained federal entries now carry typed recipient receipts');
  const linc = html.find(([d])=>d.label==='Linc Energy');
  assert.deepEqual([linc[0].money.federal.total,linc[0].money.federal.count],[357799,9]);
  const onMap = html.find(([d]) => d.label === 'Pratt Holdings Pty Ltd')[1];
  assert.ok(onMap.includes('AEC returns') && !onMap.includes('AEC records'));
});

test('search: no donor or receipt record says $0.00; declared-only donors carry the labelled line; off-map federal donors say they are selected receipts', async () => {
  for (const n of published.nodes.filter(n => n.kind === 'donor')) assert.doesNotMatch(donorSearchRecord('federal', n).snippet, ZERO, n.label);
  assert.equal(donorSearchRecord('federal', published.nodes.find(n => n.id === GOLDMAN)).snippet, `Finance. ${DONOR_DECLARED_ONLY}.`);
  assert.equal(donorSearchRecord('federal', PUBLIC_ONLY[0]).snippet, `Individual. ${PUBLIC_FUNDING_ONLY}.`);
  const index = await readPublic('/graph/donor-index.json');
  // The catalog adds each map donor from its graph first; an index entry with the same key is skipped.
  const onMap = new Set();
  for (const file of ['money.json', 'money.qld.json', 'money.vic.json', 'money.tas.json']) for (const n of (await readPublic('/graph/' + file)).nodes) onMap.add(n.id);
  for (const n of index.donors) if (n.kind !== 'reference' && !onMap.has(n.id)) assert.doesNotMatch(donorSearchRecord(n.jurisdiction || 'federal', n).snippet, ZERO, n.label);
  const offMap = index.donors.find(n => n.kind === 'donor' && (n.jurisdiction || 'federal') === 'federal' && !onMap.has(n.id) && n.total > 0);
  assert.match(donorSearchRecord('federal', offMap).snippet, /records\. All receipt types.*as the parties reported them in federal returns\.$/);
  const source = await readFile(new URL('../../scripts/build_search_catalog.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('   if(!hasPartyReceipts(e))continue;'), 'receipt records use the same predicate');
});

import {Worker} from 'node:worker_threads';
function renderEntry(path, selector) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: {kind: 'donor', path, selector, html: true, settleMs: 1500},
    });
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
  });
}
// jsdom has no canvas: the page's money map cannot draw there. Every other page error counts.
const pageErrors = result => result.errors.filter(e => !e.includes("HTMLCanvasElement's getContext() method"));

test('donor page (real app): a donor only its own return declares shows the labelled line, not $0, 0 receipts, a rank or $0 bars', {timeout: 120_000}, async () => {
  const goldman = published.nodes.find(n => n.id === GOLDMAN);
  const result = await renderEntry(`/subject/donor/${encodeURIComponent(goldman.label)}`, '.donor-flow-bars');
  assert.deepEqual(pageErrors(result), []);
  assert.equal(result.rows, 1, 'the page rendered its money section');
  const doc = new JSDOM(result.html).window.document;
  assert.equal(doc.querySelector('#subject-title').textContent, goldman.label);
  const text = doc.body.textContent;
  assert.ok(text.includes(DONOR_DECLARED_ONLY), 'the labelled line');
  assert.doesNotMatch(text, /\$0(?![\d,.])|\b0 receipts\b|Receipts counted|Rank/);
  assert.equal(doc.querySelectorAll('.donor-flow-bars .bar, .donor-flow-bars rect').length, 0, 'no bars');
  assert.equal(doc.querySelector('[data-explain-link]'), null, 'no Explain button: nothing a party listed to explain');
  // A donor the parties' returns list still gets its counted figure and the scope line.
  const pratt = published.nodes.find(n => n.id === PRATT);
  const counted = await renderEntry(`/subject/donor/${encodeURIComponent(pratt.label)}`, '.donor-flow-bars');
  assert.deepEqual(pageErrors(counted), []);
  const prattText = new JSDOM(counted.html).window.document.body.textContent;
  assert.ok(prattText.includes('Receipts counted') && !prattText.includes(DONOR_DECLARED_ONLY));
  assert.ok(new JSDOM(counted.html).window.document.querySelector('[data-explain-link]'), 'Explain this money stays for a donor the parties list');
});

// ---- One pair, every surface -------------------------------------------------
// Westpac to One Nation, from One Nation's own returns: 2022-23 two Other Receipts
// ($34,016 and $70,588) and 2024-25 two Other Receipts of $50,000 each, $204,604
// across 4 receipts. One Nation's 2024-25 return also lists $100,000 owed to Westpac
// at 30 June 2025. The legacy cell ($161,787) kept one of the two equal 2024-25 rows
// and held a 1998-99 receipt of $7,183 that is on the Associated Entity Return of
// Pauline Hanson's One Nation Ltd, not on a One Nation party return.
import {partyMoneyResponse} from '../src/party-money-table.ts';
test('Westpac to One Nation: /money, the party page, its API, receiptGraph and party_receipts all give $204,604 across 4 receipts', async () => {
  const ONE_NATION = 'party:One Nation', TYPED = [204604, 4];
  const raw = edge(published, WESTPAC, ONE_NATION);
  assert.deepEqual([raw.total, raw.count], [161787, 4], 'the released legacy cell, which no surface may show');
  assert.deepEqual(raw.by_type_year, {'2022-23': {other_receipt: [104604, 2]}, '2024-25': {other_receipt: [100000, 2]}});
  assert.ok(hasPartyReceipts(raw), 'One Nation\'s returns list these receipts');
  const projected = edge(receiptGraph(published), WESTPAC, ONE_NATION);
  assert.deepEqual([projected.total, projected.count], TYPED, 'receiptGraph');
  const tool = await api.partyDonations({asset, kb: async () => { throw Error('no retrieval'); }, origin: 'https://opax.com.au'}, {party: 'One Nation', limit: 15, measure: 'all_types'});
  assert.equal(tool.data.rows[0].donor, 'Westpac Banking Corporation', 'party_receipts ranks Westpac first by all receipt types');
  assert.deepEqual([tool.data.rows[0].total_aud, tool.data.rows[0].receipts], TYPED, 'party_receipts');
  // Who gives (A34): every one of the four is an Other Receipt, so Westpac is no donor here, only a labelled line.
  const given = await api.partyDonations({asset, kb: async () => { throw Error('no retrieval'); }, origin: 'https://opax.com.au'}, {party: 'One Nation', limit: 15});
  assert.ok(!given.data.rows.some(r => r.donor === 'Westpac Banking Corporation'), 'party_receipts by donations');
  const line = given.data.other_receipts.find(r => r.donor === 'Westpac Banking Corporation');
  assert.deepEqual([line.other_receipts_aud, line.receipts], TYPED, 'party_receipts other-receipts line');
  assert.equal(line.line, "Westpac Banking Corporation recorded $204,604 in other receipts (amounts other than donations or subscriptions) to One Nation in financial years 2022-23 to 2024-25.");
  const page = registerTables.partyMoneyData(published, ONE_NATION).rows.find(r => r.label === 'Westpac Banking Corporation');
  assert.deepEqual([page.total, page.count], TYPED, 'One Nation party page donor table');
  const response = await partyMoneyResponse(new Request(`https://opax.test/api/register/party-money?partyId=${encodeURIComponent(ONE_NATION)}`), {fetch: async () => Response.json(published)});
  const apiRow = (await response.json()).rows.find(r => r.label === 'Westpac Banking Corporation');
  assert.deepEqual([apiRow.total, apiRow.count], TYPED, '/api/register/party-money');
  const html = await renderMoneyConnectionsTable(new URL('https://opax.test/money?jur=federal&c.q=Westpac'), readPublic);
  const row = JSON.parse(html.match(/<script type="application\/json" data-dt-page>([\s\S]*?)<\/script>/)[1]).rows.find(r => r.from === 'Westpac Banking Corporation' && r.to === 'One Nation');
  assert.deepEqual([row.value, row.records], TYPED, '/money Connections table');
});

// The Explain page for a donor no party return lists (reachable by a link only once the
// donor page and the map card stop offering it): no "$0 Disclosed" and "0 Receipts".
import * as moneyExplain from '../public/money-explain.js';
test('Explain page: a donor only its own returns declare has no $0 figures; its story says no party return lists a receipt', () => {
  for (const n of DECLARED_ONLY) {
    const parsed = moneyExplain.parseExplainParams(new URLSearchParams({from: n.id}), published, null);
    const flow = moneyExplain.resolveFlow(parsed.state, published, null);
    const text = moneyExplain.pageHTML(flow, {index: null}).replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /\$0(?![\d,.])|\b0 Receipts?\b/, n.label);
    assert.ok(text.includes('No party return lists a receipt from this donor.'), n.label);
  }
  const pratt = moneyExplain.resolveFlow(moneyExplain.parseExplainParams(new URLSearchParams({from: PRATT}), published, null).state, published, null);
  assert.match(moneyExplain.pageHTML(pratt, {index: null}), /class="mx-figure/);
});
