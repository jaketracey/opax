// A party page's donor table, /api/register/party-money and "Explain this money"
// count each gift once, as the map card and the donor page do (receiptFigures).
// The money graph's legacy total/byYear cells also hold the donor's own
// declaration of the same gift, so they counted Pratt Holdings to Labor at
// $14.89m against $8.47m on Labor's own returns. Westpac to Labor goes the
// other way, $42.54m to $47.33m: the legacy rows lost receipts when duplicate
// rows were merged, and most of Westpac's are Other Receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {partyMoneyData, partyMoneyTableConfig, partyReturnFigures, partyReturnScopeLabel, receiptScopeLabel, registerTableHTML} from '../public/register-tables.js';
import {resolveFlow, pageHTML, landingHTML, comparableFlows, receiptTypeNote, flowScope, receiptGraph} from '../public/money-explain.js';
import {partyMoneyResponse} from '../src/party-money-table.ts';
import {partyMoneyBucketFiles} from '../../scripts/build_growth_modules.mjs';

const graph = JSON.parse(readFileSync(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
const SCOPE = 'All receipt types, 1998-99 to 2024-25, as the parties reported them in federal returns';
const PRATT = 'Pratt Holdings Pty Ltd', WESTPAC = 'Westpac Banking Corporation';
const id = label => graph.nodes.find(n => n.kind === 'donor' && n.label === label).id;
const legacyTotal = (label, party) => graph.edges.find(e => e.source === id(label) && e.target === party).total;
// [donor, party, the party's own returns (typed), the legacy all-record cell]
const CASES = [
  [PRATT, 'party:Liberal', 10454400, 16095373],
  [PRATT, 'party:Labor', 8473476, 14885966],
  [WESTPAC, 'party:Labor', 47331887, 42540985],
];

test('the party table counts each gift once, from the party\'s own returns, and says so', () => {
  for (const [donor, party, typed, legacy] of CASES) {
    assert.equal(legacyTotal(donor, party), legacy, `${donor} → ${party}: the released legacy cell`);
    const data = partyMoneyData(graph, party);
    const row = data.rows.find(r => r.label === donor);
    assert.equal(row.total, typed, `${donor} → ${party}`);
    assert.deepEqual([row.firstYear, row.lastYear], [1998, 2024]);
    assert.equal(data.scope, SCOPE);
  }
  assert.equal(partyMoneyData(graph, 'party:Labor').rows.find(r => r.label === PRATT).count, 40);
});

test('the table as rendered shows the typed figures ($10.5m, $8.5m, $47.3m)', () => {
  for (const [donor, party, typed] of CASES) {
    const html = registerTableHTML(partyMoneyTableConfig(partyMoneyData(graph, party).rows));
    const doc = new JSDOM(html).window.document;
    const row = [...doc.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(donor));
    assert.ok(row, `${donor} is on ${party}'s first page`);
    assert.ok(row.textContent.includes(`$${(typed / 1e6).toFixed(1)}m`), `${donor} → ${party}: ${row.textContent}`);
  }
});

test('a donor the party reported nothing from (empty typed cells) is not a row', () => {
  const empty = graph.edges.find(e => e.target === 'party:Labor' && e.by_type && !Object.keys(e.by_type).length && !e.flow && !e.grant
    && graph.nodes.find(n => n.id === e.source)?.kind === 'donor');
  assert.ok(empty, 'the released graph has such an edge');
  const labor = partyMoneyData(graph, 'party:Labor').rows;
  assert.ok(labor.every(r => r.count > 0 && r.total > 0));
  assert.equal(labor.length, 301, 'Labor\'s 313 donor edges less the 12 with no receipts on its own returns');
});

test('/api/register/party-money returns the same typed figures, its shape plus a scope', async () => {
  const assets = {fetch: async () => Response.json(graph)};
  for (const [donor, party, typed] of CASES) {
    const response = await partyMoneyResponse(new Request(`https://opax.test/api/register/party-money?partyId=${encodeURIComponent(party)}`), assets);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.rows.find(r => r.label === donor).total, typed, `${donor} → ${party}`);
    assert.equal(body.scope, SCOPE);
    assert.deepEqual(Object.keys(body.rows[0]), ['label', 'href', 'return_reference', 'industry', 'total', 'count', 'firstYear', 'lastYear']);
  }
});

test('a graph without typed cells (the state graphs) keeps its record figures and has no scope line', () => {
  const state = JSON.parse(readFileSync(new URL('../public/graph/money.qld.json', import.meta.url), 'utf8'));
  const party = state.nodes.find(n => n.kind === 'party');
  const data = partyMoneyData(state, party.id);
  assert.equal(data.scope, undefined);
  const sum = data.rows.reduce((s, r) => s + r.total, 0);
  const donors = new Set(state.nodes.filter(n => n.kind === 'donor').map(n => n.id));
  const legacy = state.edges.filter(e => e.target === party.id && !e.flow && !e.grant && donors.has(e.source)).reduce((s, e) => s + e.total, 0);
  assert.equal(sum, legacy);
});

test('profiles read the same rows and scope from the party-money buckets', () => {
  const buckets = partyMoneyBucketFiles('/graph/money.json', graph).flatMap(([, data]) => Object.values(data.parties));
  const labor = buckets.find(b => b.label === 'Labor');
  assert.equal(labor.scope, SCOPE);
  assert.equal(labor.rows.find(r => r.label === PRATT).total, 8473476);
});

test('"Explain this money" sums the typed cells, prints the scope line and splits the receipt types', () => {
  for (const [donor, party, typed] of CASES) {
    const flow = resolveFlow({jur: 'federal', from: id(donor), to: party}, graph, new Map(), {});
    assert.equal(flow.total, typed, `${donor} → ${party}`);
    assert.equal(flowScope(flow), SCOPE);
    const sumYears = [...flow.years.values()].reduce((s, [amount]) => s + amount, 0);
    assert.equal(Math.round(sumYears), typed, 'the timeline re-sums to the headline');
    const doc = new JSDOM(pageHTML(flow, {index: new Map()})).window.document;
    assert.equal(doc.querySelector('.mx-scope').textContent, SCOPE);
    assert.equal(doc.querySelector('.mx-figure dd').textContent, `$${(typed / 1e6).toFixed(1)}m`);
  }
  const westpac = resolveFlow({jur: 'federal', from: id(WESTPAC), to: 'party:Labor'}, graph, new Map(), {});
  assert.match(receiptTypeNote(westpac), /Of \$47\.3m, \$875\.0k is Donation Received and \$46\.5m is other types/);
  assert.doesNotMatch(receiptTypeNote(westpac), /keeps the amount and the year but not that label/);
  // A donor's whole page: every party it gave to, typed.
  const pratt = resolveFlow({jur: 'federal', from: id(PRATT)}, graph, new Map(), {});
  assert.equal(pratt.parties.find(p => p.node.id === 'party:Labor').total, 8473476);
  assert.equal(pratt.parties.find(p => p.node.id === 'party:Liberal').total, 10454400);
});

test('"Explain this money" comparisons and its landing list read the same figures', () => {
  const typed = receiptGraph(graph);
  assert.equal(receiptGraph(typed), typed, 'converting twice is a no-op');
  const flow = resolveFlow({jur: 'federal', from: id(PRATT), to: 'party:Labor'}, graph, new Map(), {});
  for (const row of comparableFlows(flow, new Map()).rows) {
    const donor = typed.nodes.find(n => n.kind === 'donor' && n.label === row.label);
    const edge = typed.edges.find(e => e.source === donor.id && e.target === 'party:Labor' && !e.flow && !e.grant);
    assert.equal(row.total, edge.total, row.label);
    assert.ok(edge.typed, row.label);
  }
  const landing = new JSDOM(landingHTML(graph, new Map(), 'federal')).window.document;
  const figures = [...landing.querySelectorAll('.mx-compare-figure')].map(n => n.textContent);
  assert.equal(figures.length, 6);
  const top = typed.edges.filter(e => !e.flow && !e.grant && typed.nodes.find(n => n.id === e.source)?.kind === 'donor')
    .sort((a, b) => b.total - a.total)[0];
  const first = landing.querySelector('.mx-compare-list a').textContent;
  assert.equal(first, `${typed.nodes.find(n => n.id === top.source).label} → ${typed.nodes.find(n => n.id === top.target).label}`);
});

test('a state flow keeps its record figures and the old receipt-type note', () => {
  const state = JSON.parse(readFileSync(new URL('../public/graph/money.vic.json', import.meta.url), 'utf8'));
  const edge = state.edges.find(e => !e.flow && !e.grant && state.nodes.find(n => n.id === e.source)?.kind === 'donor');
  const flow = resolveFlow({jur: 'vic', from: edge.source, to: edge.target}, state, new Map(), {});
  assert.equal(flow.total, state.edges.filter(e => e.source === edge.source && e.target === edge.target && !e.flow && !e.grant).reduce((s, e) => s + e.total, 0));
  assert.equal(flowScope(flow), '');
});

// The party page's Export CSV reads /api/table/party-money, which D1 serves from
// scripts/load_tables.mjs. Those rows must be the table's rows with the table's figures.
test('the D1 party-money and money-connections rows carry the page\'s figures and rows', async () => {
  const {tableRows} = await import('../../scripts/load_tables.mjs');
  const {rows} = await tableRows(undefined, {moneyOnly: true});
  const party = rows['party-money'].map(r => r.row), connections = rows['money-connections'].map(r => r.row);
  const find = (list, from, to) => list.filter(r => r.jurisdiction === 'federal' && r.from === from && r.to === to);
  for (const list of [party, connections]) {
    const [liberal] = find(list, PRATT, 'Liberal');
    assert.deepEqual([liberal.amount, liberal.count, liberal.firstYear, liberal.lastYear], [10454400, 70, 1998, 2024]);
    assert.deepEqual(find(list, PRATT, 'Labor').map(r => [r.amount, r.count]), [[8473476, 40]]);
    assert.deepEqual(find(list, WESTPAC, 'Labor').map(r => [r.amount, r.count]), [[47331887, 201]]);
  }
  for (const [label, partyId, expected] of [['Labor', 'party:Labor', 301], ['Liberal', 'party:Liberal', 251]]) {
    const d1 = party.filter(r => r.jurisdiction === 'federal' && r.to === label);
    assert.equal(d1.length, expected, label);
    const page = partyMoneyData(graph, partyId).rows;
    assert.equal(page.length, expected, label);
    const key = r => `${r.amount ?? r.total}|${r.count}|${r.firstYear}|${r.lastYear}`;
    assert.deepEqual(d1.map(key).sort(), page.map(key).sort(), `${label}: the CSV and the table hold the same figures`);
  }
  // State graphs keep their record figures, and contract or grant rows are untouched.
  const qld = JSON.parse(readFileSync(new URL('../public/graph/money.qld.json', import.meta.url), 'utf8'));
  const qldNodes = new Map(qld.nodes.map(n => [n.id, n]));
  const qldReceipts = qld.edges.filter(e => !e.flow && !e.grant && e.total > 0 && qldNodes.get(e.source)?.kind === 'donor' && qldNodes.get(e.target)?.kind === 'party');
  const qldRows = party.filter(r => r.jurisdiction === 'qld');
  assert.equal(qldRows.length, qldReceipts.length);
  assert.equal(qldRows.reduce((s, r) => s + r.amount, 0), qldReceipts.reduce((s, e) => s + e.total, 0));
  for (const r of connections.filter(r => r.type !== 'receipts' && r.jurisdiction === 'federal').slice(0, 50)) {
    const edge = graph.edges[Number(r.id.split(':')[1])];
    assert.equal(r.amount, edge.total);
  }
});

// A party's headline: its own returns, every receipt line once (partyReturnFigures).
// The legacy total also holds donors' own declarations of the same gifts and
// transfers between branches; the node's by_type only sums donors on the map.
const HEADLINES = {Labor: 726752702, Liberal: 476294163, Nationals: 69579462, Greens: 31529186, 'Country Liberal Party': 8416214,
  'United Australia Party': 255773752};
// What the headline counts and leaves out, the same words on the party page, the server page and the map card.
const PARTY_SCOPE = 'Itemised receipts in the party\'s own federal returns, 1998-99 to 2024-25, each counted once. '
  + 'Public funding, tax refunds and other government payments, transfers between the party\'s own branches and amounts under the disclosure threshold are not included.';

test('a party\'s headline is its own return, each line once, with the scope line; an older file keeps the record total', () => {
  for (const [label, expected] of Object.entries(HEADLINES)) {
    const node = graph.nodes.find(n => n.kind === 'party' && n.label === label);
    const own = partyReturnFigures(node);
    assert.equal(Math.round(own.total), expected, label);
    // The CLP's legacy total held only rows already mapped to it ($1.0m); its returns were counted under Liberal.
    // UAP's legacy total left out Palmer's gifts as flagged outliers; its own returns count them.
    if (label === 'Country Liberal Party' || label === 'United Australia Party') assert.ok(own.total > node.total, label);
    else assert.ok(own.total < node.total, `${label}: below the legacy all-record total`);
    assert.ok(own.total > Object.values(node.by_type).reduce((a, b) => a + b, 0), `${label}: above the donors drawn on the map`);
    const fy = y => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    assert.equal(partyReturnScopeLabel(own), PARTY_SCOPE.replace('1998-99 to 2024-25', `${fy(own.firstYear)} to ${fy(own.lastYear)}`));
    if (label !== 'United Australia Party') assert.deepEqual([own.firstYear, own.lastYear], [1998, 2024], label);
    const lines = Object.values(node.return_by_type_year).flatMap(types => Object.values(types)).reduce((n, [, c]) => n + c, 0);
    assert.equal(own.count, lines);
  }
  const {return_by_type, return_by_type_year, ...older} = graph.nodes.find(n => n.label === 'Labor');
  const fallback = partyReturnFigures(older);
  assert.equal(fallback.total, older.total);
  assert.equal(fallback.typed, false);
  assert.match(partyReturnScopeLabel(fallback), /a gift can appear twice/);
  // Cells with no line are no headline: the record total stands, never $0.
  const empty = partyReturnFigures({...older, return_by_type: {}, return_by_type_year: {}});
  assert.equal(empty.total, older.total);
  for (const node of graph.nodes.filter(n => n.kind === 'party' && n.total > 0)) {
    assert.ok(partyReturnFigures(node).total > 0, `${node.label} never heads with $0`);
  }
});

function renderParty(path) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
      workerData: {kind: 'party', path, selector: '#entry-flows', html: true, settleMs: 1500},
    });
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
  });
}

test('the real party page heads Labor with its own return total and says what it counts', {timeout: 120_000}, async () => {
  const result = await renderParty('/subject/party/labor');
  // JSDOM has no canvas, so the page's map cannot draw; nothing else may fail.
  assert.deepEqual(result.errors.filter(e => !/getContext\(\) method/.test(e)), []);
  const doc = new JSDOM(result.html).window.document;
  const flows = doc.querySelector('#entry-flows');
  assert.equal(flows.getAttribute('data-rail-figure'), '$726.8m', '"Where it came from" carries the party-return total');
  const text = flows.textContent.replace(/\s+/g, ' ');
  assert.match(text, /Received \(disclosed\)\s*\$726\.8m/);
  assert.match(text, new RegExp(`Receipts counted\\s*${(34486).toLocaleString()}`));
  assert.ok(text.replace(/Measured as\s*/, 'Measured as ').includes(`Measured as ${PARTY_SCOPE}`), 'the head facts say what the total counts and leaves out');
  assert.doesNotMatch(text, /\$880\.5m|includes internal party transfers/);
});

test('the money map card heads a party with its own return, in the view\'s window and measure', async () => {
  const built = await build({entryPoints: [new URL('../graph/index.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm'});
  const {receiptGraphView, partyReturnWindow, partyReturnScope} = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const labor = receiptGraphView(graph).nodes.find(n => n.id === 'party:Labor');
  assert.equal(Math.round(labor.partyReturn.total), HEADLINES.Labor);
  assert.equal(Math.round(labor.total), Math.round(Object.values(labor.by_type).reduce((a, b) => a + b, 0)), 'map geometry still sums the donors on the map');
  const raw = graph.nodes.find(n => n.id === 'party:Labor');
  const year = Object.values(raw.return_by_type_year['2023-24']).reduce((s, [d]) => s + d, 0);
  assert.equal(receiptGraphView(graph, 'all_types', 2023, 2023).nodes.find(n => n.id === 'party:Labor').partyReturn.total, year);
  assert.equal(partyReturnWindow(raw, -Infinity, Infinity, false, 'donation_only').total, raw.return_by_type.donation_received);
  const {return_by_type, return_by_type_year, ...older} = raw;
  assert.equal(partyReturnWindow(older), null, 'an older file keeps the card as it was');
  assert.equal(receiptGraphView(graph).nodes.find(n => n.kind === 'donor').partyReturn, undefined);
  assert.equal(partyReturnWindow({...older, return_by_type: {}}), null, 'empty cells keep the card as it was, never $0');
  assert.equal(partyReturnScope(1998, 2024), PARTY_SCOPE, 'the card says what the page says');
  const clp = receiptGraphView(graph).nodes.find(n => n.id === 'party:Country Liberal Party');
  assert.equal(Math.round(clp.partyReturn.total), HEADLINES['Country Liberal Party']);
  const card = readFileSync(new URL('../graph/index.ts', import.meta.url), 'utf8');
  assert.ok(card.includes("const headline = node.kind === 'party' && node.partyReturn ? node.partyReturn : node"));
  assert.ok(card.includes("textContent = partyReturnScope(headline.firstYear, headline.lastYear)"));
});

test('"Explain this money" falls back to the party\'s own return lines when the AEC return totals are absent', () => {
  const flow = resolveFlow({jur: 'federal', from: id(PRATT), to: 'party:Labor'}, graph, new Map(), {});
  assert.equal(flow.recipientShare.basis, 'return_lines');
  const raw = graph.nodes.find(n => n.id === 'party:Labor');
  const own = partyReturnFigures(raw);
  let whole = 0;
  for (const [y, [d]] of Object.entries(own.cells)) if (+y >= flow.recipientShare.first && +y <= flow.recipientShare.last) whole += d;
  assert.equal(flow.recipientShare.whole, whole);
  const doc = new JSDOM(pageHTML(flow, {index: new Map()})).window.document;
  assert.match(doc.body.textContent, /of the receipts Labor itemised on its own federal returns for .*each counted once/);
});

test('the server party page states the party-return total with its scope', () => {
  const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(worker.includes('const own = partyReturnFigures(node as Parameters<typeof partyReturnFigures>[0])'));
  const own = partyReturnFigures(graph.nodes.find(n => n.id === 'party:Labor'));
  assert.ok(worker.includes('if (own.typed) scopeNote = partyReturnScopeLabel(own)'));
  assert.equal(partyReturnScopeLabel(own), PARTY_SCOPE);
});

test('the real Country Liberal Party page heads with its own returns, not $0', {timeout: 120_000}, async () => {
  const result = await renderParty('/subject/party/country-liberal-party');
  assert.deepEqual(result.errors.filter(e => !/getContext\(\) method/.test(e)), []);
  const flows = new JSDOM(result.html).window.document.querySelector('#entry-flows');
  assert.equal(flows.getAttribute('data-rail-figure'), '$8.4m');
  const text = flows.textContent.replace(/\s+/g, ' ');
  assert.match(text, /Received \(disclosed\)\s*\$8\.4m/);
  assert.doesNotMatch(text, /Received \(disclosed\)\s*\$0\b/);
});
