// The D1 money tables (/api/table/money-connections and /api/table/party-money, which the
// party page's Export CSV reads) carry the figures the pages show: each receipt once, from
// the party's own return (receiptFigures). A flow only the donor's own return declares
// (hasPartyReceipts is false) is left out, as the party page and the Connections table
// leave it out. Contract and grant flows and the state graphs keep their record figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {tableRows, buildTableSQL} from '../../scripts/load_tables.mjs';
import {partyMoneyData} from '../public/register-tables.js';
import {receiptGraph, hasPartyReceipts, donorDisclosure} from '../public/donor-disclosure.js';

const empty = {nodes: [], edges: []};
const typedMeta = {receipt_types: {available: true, schema: 1, donation_type: 'donation_received'}, source_url: 'https://example.test/returns'};
const cells = (rows) => ({by_type: Object.fromEntries(Object.entries(rows).map(([type, years]) => [type, Object.values(years).reduce((s, [d]) => s + d, 0)])),
  by_type_year: Object.entries(rows).reduce((out, [type, years]) => { for (const [fy, cell] of Object.entries(years)) (out[fy] ||= {})[type] = cell; return out; }, {})});
// Invented donors. The legacy cells (total/count/byYear) hold the donor's own declaration too.
const fixture = {meta: typedMeta, nodes: [
  {id: 'donor:quarry', label: 'Example Quarry Pty Ltd', kind: 'donor', industry: 'mining', total: 9000, count: 5},
  {id: 'donor:ferry', label: 'Example Ferry Co', kind: 'donor', industry: 'transport', total: 2500, count: 3},
  {id: 'donor:quill', label: 'Example Quill Holdings', kind: 'donor', industry: 'finance', total: 64250, count: 3, by_type: {}, by_type_year: {}},
  {id: 'party:Labor', label: 'Labor', kind: 'party', industry: 'parties', total: 1, count: 1},
  {id: 'party:Liberal', label: 'Liberal', kind: 'party', industry: 'parties', total: 1, count: 1},
  {id: 'agency:works', label: 'Example Works Agency', kind: 'grantor', total: 1, count: 1},
], edges: [
  {source: 'donor:quarry', target: 'party:Labor', total: 9000, count: 5, firstYear: 2019, lastYear: 2021, byYear: {2019: [6000, 3], 2021: [3000, 2]},
    ...cells({donation_received: {'2019-20': [4000, 2]}, other_receipt: {'2021-22': [1500, 1]}})},
  {source: 'donor:ferry', target: 'party:Labor', total: 2500, count: 3, firstYear: 2020, lastYear: 2020, byYear: {2020: [2500, 3]},
    ...cells({donation_received: {'2020-21': [2000, 2]}})},
  {source: 'donor:ferry', target: 'party:Liberal', total: 700, count: 1, firstYear: 2022, lastYear: 2022, byYear: {2022: [700, 1]},
    ...cells({subscription: {'2022-23': [650, 1]}})},
  // Only the donor's own return declares this one: typed cells, no receipt on Labor's returns.
  {source: 'donor:quill', target: 'party:Labor', total: 64250, count: 3, firstYear: 2018, lastYear: 2019, byYear: {2018: [40000, 2], 2019: [24250, 1]}, by_type: {}, by_type_year: {}},
  {source: 'agency:works', target: 'donor:quarry', grant: true, total: 125000, count: 1, firstYear: 2021, lastYear: 2021, byYear: {2021: [125000, 1]}},
]};

async function fixtureRows(graph) {
  const root = await mkdtemp(join(tmpdir(), 'opax-table-money-'));
  try {
    for (const dir of ['suppliers', 'grants/federal', 'grants/qld']) await mkdir(join(root, dir), {recursive: true});
    await writeFile(join(root, 'suppliers.json'), '{"suppliers":[]}');
    return (await tableRows(root, {moneyOnly: true, graphs: [graph, empty, empty, empty]})).rows;
  } finally { await rm(root, {recursive: true, force: true}); }
}
const plain = rows => rows.map(r => r.row);
// Rows are matched by the donor's page link: the table names a donor by its map label and the party
// page by its disclosure spelling, and both link the same donor page.
const pairKey = (from, to) => `${from} -> ${to}`;
/** Table rows summed per donor and party, the shape partyMoneyData gives a party page. */
function byPair(rows) {
  const out = new Map();
  for (const r of rows) {
    const row = out.get(pairKey(r.from_href, r.to)) || {total: 0, count: 0, firstYear: null, lastYear: null};
    row.total += r.amount; row.count += r.count;
    if (r.firstYear != null) row.firstYear = row.firstYear == null ? r.firstYear : Math.min(row.firstYear, r.firstYear);
    if (r.lastYear != null) row.lastYear = row.lastYear == null ? r.lastYear : Math.max(row.lastYear, r.lastYear);
    out.set(pairKey(r.from_href, r.to), row);
  }
  return out;
}
/** Every party page's rows, keyed the same way. */
function pagePairs(graph) {
  const out = new Map();
  for (const party of graph.nodes.filter(n => n.kind === 'party'))
    for (const row of partyMoneyData(graph, party.id).rows) out.set(pairKey(row.href, party.label), {total: row.total, count: row.count, firstYear: row.firstYear, lastYear: row.lastYear});
  return out;
}
/** The Connections table's receipt rows (receiptGraph), keyed the same way. */
function connectionPairs(graph) {
  const typed = receiptGraph(graph), nodes = new Map(typed.nodes.map(n => [n.id, n]));
  const out = new Map();
  for (const e of typed.edges) {
    if (e.flow || e.grant || nodes.get(e.source)?.kind !== 'donor' || nodes.get(e.target)?.kind !== 'party') continue;
    out.set(pairKey(donorDisclosure(nodes.get(e.source)).href, nodes.get(e.target).label), {total: e.total, count: e.count, firstYear: e.firstYear, lastYear: e.lastYear});
  }
  return out;
}
const sorted = map => [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

test('invented fixture: the table rows carry the party page and Connections figures, each receipt once', async () => {
  const rows = await fixtureRows(fixture);
  const party = plain(rows['party-money']), connections = plain(rows['money-connections']);
  assert.deepEqual(sorted(byPair(party)), sorted(pagePairs(fixture)), 'party-money matches every party page');
  assert.deepEqual(sorted(byPair(connections.filter(r => r.type === 'receipts'))), sorted(connectionPairs(fixture)), 'money-connections matches the Connections table');
  const quarry = party.find(r => r.from === 'Example Quarry Pty Ltd');
  assert.deepEqual([quarry.amount, quarry.count, quarry.firstYear, quarry.lastYear], [5500, 3, 2019, 2021], 'typed cells, not the legacy $9,000 over 5');
  // The donor-declared-only flow is left out of both tables, as the pages leave it out.
  assert.ok(!hasPartyReceipts(fixture.edges[3]));
  for (const list of [party, connections]) assert.equal(list.some(r => r.from === 'Example Quill Holdings'), false);
  assert.equal([...pagePairs(fixture).keys()].some(k => k.includes('Quill')), false);
  // A grant keeps its record figure.
  assert.equal(connections.find(r => r.type !== 'receipts').amount, 125000);
});

test('built tables: every federal party\'s D1 rows equal its party page, and every receipt row the Connections table', async () => {
  const graph = JSON.parse(readFileSync(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
  const {rows} = await tableRows(undefined, {moneyOnly: true});
  const federal = list => plain(list).filter(r => r.jurisdiction === 'federal');
  const party = federal(rows['party-money']), connections = federal(rows['money-connections']).filter(r => r.type === 'receipts');
  const page = pagePairs(graph);
  assert.ok(page.size > 700);
  assert.deepEqual(sorted(byPair(party)), sorted(page));
  assert.deepEqual(sorted(byPair(connections)), sorted(connectionPairs(graph)));
  // The donor-declared-only flows (131 in this build) are in neither table.
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const declaredOnly = graph.edges.filter(e => !e.flow && !e.grant && nodes.get(e.source)?.kind === 'donor' && nodes.get(e.target)?.kind === 'party' && !hasPartyReceipts(e));
  assert.equal(declaredOnly.length, 131);
  const ids = new Set(party.map(r => r.id));
  for (const e of declaredOnly) assert.equal(ids.has(`federal:${graph.edges.indexOf(e)}`), false);
});

test('the deploy\'s D1 reload sees the typed money tables as changed (dataset hash)', async () => {
  const graph = JSON.parse(readFileSync(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
  // The loader before the typed figures: the same graph read through its legacy cells only.
  const legacy = {...graph, edges: graph.edges.map(({by_type, by_type_year, ...edge}) => edge)};
  const hashes = async g => {
    const output = await mkdtemp(join(tmpdir(), 'opax-table-hash-'));
    try {
      const rows = await fixtureRows(g);
      const datasets = {'money-connections': rows['money-connections'], 'party-money': rows['party-money']};
      const manifest = await buildTableSQL({output, datasets});
      return {connections: manifest.datasets['money-connections'].hash, party: manifest.datasets['party-money'].hash, counts: manifest.counts};
    } finally { await rm(output, {recursive: true, force: true}); }
  };
  const [before, after] = [await hashes(legacy), await hashes(graph)];
  assert.notEqual(after.connections, before.connections);
  assert.notEqual(after.party, before.party);
  assert.equal(before.counts['party-money'] - after.counts['party-money'], 131, 'the donor-declared-only rows leave the table');
});
