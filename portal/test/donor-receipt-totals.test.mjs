// One donor page, one story about the totals (web critique W1).
// The map card, "Where the money went" and the year-by-year balance all count the parties' own returns, all receipt types, each gift once.
// The legacy total/byYear cells also hold the donor's own declarations of the
// same gifts, so a gift can appear twice there; they must not reach these blocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import * as registerTables from '../public/register-tables.js';
import {receiptFigures, receiptScopeLabel} from '../public/register-tables.js';

// Invented donor. The legacy cells double the 2020-21 gift (declared by both
// sides); the typed cells hold it once, plus an Other Receipt in 2021-22.
const edge = {
  source: 'donor:fixture-holdings', target: 'party:Liberal', total: 300, count: 3, firstYear: 2020, lastYear: 2021,
  byYear: {2020: [200, 2], 2021: [100, 1]},
  by_type: {donation_received: 100, other_receipt: 40},
  by_type_year: {'2020-21': {donation_received: [100, 1]}, '2021-22': {other_receipt: [40, 1]}},
};
const legacyOnly = {source: 'donor:older', target: 'party:Labor', total: 50, count: 2, firstYear: 2004, lastYear: 2005, byYear: {2004: [20, 1], 2005: [30, 1]}};

test('receiptFigures counts each typed receipt once, all receipt types, and never the legacy cells', () => {
  const f = receiptFigures(edge);
  assert.deepEqual(f, {total: 140, count: 2, firstYear: 2020, lastYear: 2021, byYear: {2020: 100, 2021: 40},
    cells: {2020: [100, 1], 2021: [40, 1]}, undated: [0, 0], byType: {donation_received: 100, other_receipt: 40}, typed: true,
    // Each cell keeps its AEC receipt type (A34); Public Funding, held apart, is never a donor's money (A35).
    typeCells: {2020: {donation_received: [100, 1]}, 2021: {other_receipt: [40, 1]}}, typeCounts: {donation_received: 1, other_receipt: 1},
    publicFunding: [0, 0], publicFundingCells: {}});
  // An empty typed object is zero eligible receipts, not a fallback.
  assert.equal(receiptFigures({...edge, by_type: {}, by_type_year: {}}).total, 0);
});

test('a graph without typed cells keeps its figures and says what they count', () => {
  const f = receiptFigures(legacyOnly);
  assert.deepEqual(f, {total: 50, count: 2, firstYear: 2004, lastYear: 2005, byYear: {2004: 20, 2005: 30},
    cells: {2004: [20, 1], 2005: [30, 1]}, undated: [0, 0], byType: null, typed: false, typeCells: null, typeCounts: null, publicFunding: [0, 0], publicFundingCells: {}});
  assert.match(receiptScopeLabel(f), /both donor and party, so a gift can appear twice/);
});

test('the scope line names the measure, the financial years and the returns', () => {
  assert.equal(receiptScopeLabel(receiptFigures(edge)), 'All receipt types, 2020–21 to 2021–22, as the parties reported them in federal returns');
  assert.equal(receiptScopeLabel(receiptFigures({...edge, by_type_year: {'2020-21': {donation_received: [100, 1]}}})),
    'All receipt types, 2020–21, as the parties reported them in federal returns');
  assert.equal(receiptScopeLabel(receiptFigures({...edge, by_type_year: {'1999-00': {donation_received: [1, 1]}, '2024-25': {donation_received: [1, 1]}}})),
    'All receipt types, 1999–00 to 2024–25, as the parties reported them in federal returns');
});

// The released graph: every donor-to-party figure on the donor page equals the
// map card's, which sums by_type (graph/index.ts typedReceiptFigures).
test('in the released graph, each donor page figure matches the map card for the donors in the critique', async () => {
  const graph = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
  const node = graph.nodes.find(n => n.label === 'Pratt Holdings Pty Ltd');
  assert.ok(node, 'Pratt Holdings is on the map');
  const flows = Object.fromEntries(graph.edges.filter(e => e.source === node.id).map(e => [e.target, receiptFigures(e).total]));
  // The critique saw Liberal $10.5m / Labor $8.5m on the card and $16.1m / $14.9m in the list.
  assert.equal(Math.round(flows['party:Liberal']), 10454400);
  assert.equal(Math.round(flows['party:Labor']), 8473476);
  const own = receiptFigures(node);
  assert.equal(Math.round(own.total), 19572876);
  assert.equal(own.count, 120);
  assert.equal(receiptScopeLabel(own), 'All receipt types, 1998–99 to 2024–25, as the parties reported them in federal returns');
  // Every published receipt type counts but Public Funding, which is never a donor's money (NSW Efa to the Greens).
  for (const e of graph.edges) if (e.by_type) {
    const {public_funding: pf = 0, ...donor} = e.by_type;
    assert.equal(receiptFigures(e).total, Object.values(donor).reduce((a, b) => a + b, 0), `${e.source} → ${e.target}`);
    assert.equal(receiptFigures(e).publicFunding[0], pf, `${e.source} → ${e.target} public funding`);
  }
});

async function appFunctions(names) {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names.map(name => {
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(fn, name);
    return source.slice(fn.getStart(ast), fn.end);
  }).join('\n');
}

test('the actual year-by-year balance sums the typed cells and prints its scope on its own line', async () => {
  const context = {
    registerTables, moneyData: {nodes: [{id: 'party:Liberal', label: 'Liberal'}]},
    BALANCE_COALITION: new Set(['Liberal', 'Nationals', 'LNP', 'Country Liberal Party']), BALANCE_ELECTION_YEARS: new Set([2022]),
    esc: v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;'), fmtMoney: v => `$${v}`, partyDotHTML: () => '',
    sourceLineHTML: () => '', AEC_LICENCE: '',
  };
  runInNewContext(`${await appFunctions(['donorBalanceHTML'])}\nthis.balance=donorBalanceHTML;`, context);
  const scope = receiptScopeLabel(receiptFigures(edge));
  const doc = new JSDOM(context.balance([edge], scope)).window.document;
  assert.equal(doc.querySelector('.entry-scope').textContent, scope);
  assert.equal(doc.querySelector('.balance-tiles .tile b').textContent, '$140', 'the Coalition tile is the typed total, not the legacy $300');
  assert.deepEqual([...doc.querySelectorAll('tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), ['2020$100$0$0', '2021$40$0$0']);
});

test('the actual bar list puts its scope under its heading', async () => {
  const context = {esc: v => String(v), partyDotHTML: () => ''};
  runInNewContext(`${await appFunctions(['barList'])}\nthis.barList=barList;`, context);
  const doc = new JSDOM(context.barList([['Liberal', 140]], {heading: 'Where the money went', scope: 'All receipt types, 2020–21'})).window.document;
  const figure = doc.querySelector('figure');
  assert.equal(figure.children[0].tagName, 'FIGCAPTION');
  assert.equal(figure.children[1].className, 'entry-scope');
  assert.equal(figure.children[1].textContent, 'All receipt types, 2020–21');
  const plain = new JSDOM(context.barList([['Liberal', 140]], {heading: 'Where it came from'})).window.document;
  assert.equal(plain.querySelector('.entry-scope'), null);
});

test('the party page prints its table\'s own scope line, in the browser and the server page, and no longer says a gift can count twice', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(!app.includes('PARTY_RECEIPTS_SCOPE') && !/counted twice/.test(app));
  assert.ok(!/counted twice/.test(worker));
  assert.ok(app.includes('<h2 class="subject-section-title">Where it came from</h2>${partyMoney?.scope ? `<p class="entry-scope">${esc(moneyScope("map"))}. ${esc(partyMoney.scope)}</p>` : ""}${partyTable}'));
  assert.ok(worker.includes('<h2>Where it came from</h2>${scope ? `<p class="entry-scope">${escHtml(scope)}</p>`'));
});
