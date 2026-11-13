import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {receiptFigures, receiptGraph, receiptGraphScope, receiptScopeLabel} from '../public/donor-disclosure.js';
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
const SCOPE = 'All receipt types, 1998-99 to 2024-25, as the parties reported them in federal returns';
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
  assert.ok(empty > 0);
  assert.equal(graph.edges.length, published.edges.length - empty, 'an edge only the donor declared is left out');
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
  const out = await api.partyDonations({asset, kb: async () => { throw Error('no retrieval'); }, origin: 'https://opax.com.au'}, {party: 'Liberal', limit: 15});
  const pratt = out.data.rows.find(r => /^Pratt Holdings/.test(r.donor));
  assert.deepEqual([pratt.total_aud, pratt.receipts], [PRATT_LIBERAL, 70]);
  assert.ok(out.notes.some(n => n.includes(SCOPE)));
  const labor = await api.partyDonations({asset, kb: async () => ({}), origin: 'https://opax.com.au'}, {party: 'Labor', limit: 15});
  assert.equal(Math.round(labor.data.rows.find(r => r.donor === 'Westpac Banking Corporation').total_aud), WESTPAC_LABOR);
  const window = await api.partyDonations({asset, kb: async () => ({}), origin: 'https://opax.com.au'}, {party: 'Liberal', from_year: 2020, to_year: 2020, limit: 15});
  const typed2020 = Object.values(edge(published, PRATT, 'party:Liberal').by_type_year['2020-21']).reduce((s, c) => s + c[0], 0);
  assert.equal(window.data.rows.find(r => /^Pratt Holdings/.test(r.donor)).total_aud, typed2020, 'a year window sums the typed year cells');
});

test('Ask entity_profile receipts: a supplier\'s linked flows carry the typed figures and scope', async () => {
  const out = await api.callTool(env, 'entity_profile', {kind: 'supplier', record_id: 's-23b64272b4a191508d69', section: 'receipts', limit: 8});
  const labor = out.rows.find(r => r.party === 'Labor');
  assert.equal(Math.round(labor.amount_aud), WESTPAC_LABOR);
  assert.equal(labor.records, 201);
  assert.match(labor.summary, /All receipt types, 1998-99 to 2024-25/);
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
  assert.match(federal, new RegExp(`across ${typed.length.toLocaleString('en-AU')} donor-to-party totals`));
  assert.doesNotMatch(federal, new RegExp(`across ${legacy.length.toLocaleString('en-AU')} donor-to-party totals`));
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
  assert.ok(year.html.includes('Receipts: All receipt types, 2020-21, as the parties reported them in federal returns.'));
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

test('person page ties: the exporter\'s Python copy of the rule matches receiptFigures on every released edge and donor', () => {
  const root = new URL('../../', import.meta.url).pathname;
  const script = `import json,sys\nsys.path.insert(0,${JSON.stringify(root)})\nfrom scripts import export_interests as x\ng=json.load(open(${JSON.stringify(root + 'portal/public/graph/money.json')}))\nout=[[r.get('id') or r['source']+'>'+r['target'],f['total'],f['count'],f['firstYear'],f['lastYear'],f['typed']] for r in [*g['edges'],*[n for n in g['nodes'] if n.get('kind')=='donor']] for f in [x.receipt_figures(r)]]\nties=x.load_tie_registers(${JSON.stringify(root + 'portal/public/graph/money.json')},${JSON.stringify(root + 'portal/public/access.json')},${JSON.stringify(root + 'portal/public/fits.json')})[-1]\nprint(json.dumps({'figures':out,'pratt':ties.get('donor:pratt'),'westpac':ties.get('donor:westpac banking corporation')}))`;
  const py = JSON.parse(execFileSync('python3', ['-I', '-c', script], {encoding: 'utf8', maxBuffer: 64 << 20}));
  const rows = [...published.edges, ...published.nodes.filter(n => n.kind === 'donor')];
  assert.equal(py.figures.length, rows.length);
  rows.forEach((row, i) => {
    const f = receiptFigures(row), [, total, count, firstYear, lastYear, typed] = py.figures[i];
    assert.deepEqual([Math.round(total), count, firstYear, lastYear, typed], [Math.round(f.total), f.count, f.firstYear, f.lastYear, f.typed], py.figures[i][0]);
  });
  assert.deepEqual(py.pratt.find(f => f.party === 'Liberal'), {party: 'Liberal', total: PRATT_LIBERAL, from: 1998, to: 2024});
  assert.equal(py.westpac.find(f => f.party === 'Labor').total, WESTPAC_LABOR);
  const onlyDonor = published.edges.filter(e => e.source.startsWith('donor:') && !e.flow && !e.grant && e.by_type && !Object.keys(e.by_type).length);
  assert.ok(onlyDonor.length > 0);
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
  esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;'), fmtMoney: v => `$${Math.round(v)}`,
  donorRows: (rows, _index, limit = Infinity) => [...rows].sort((a, b) => b[1] - a[1]).slice(0, limit), donorViewIndex: new Map(),
  subjectHash: (kind, name) => `#/${kind}/${name}`, partyDotHTML: () => '', explainBtn: () => '', AEC_NOTE: 'AEC note.',
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
  assert.ok(source.includes('({donorRows,donorDisclosure,donorLabelHTML,receiptGraph,receiptGraphScope}=module);'));
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
  assert.equal(flows.length, published.edges.filter(e => !e.flow && !e.grant && e.by_type && Object.keys(e.by_type).length && published.nodes.find(n => n.id === e.source)?.kind === 'donor').length,
    'a flow only the donor declared is left out');
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
